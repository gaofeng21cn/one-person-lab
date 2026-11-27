import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { buildCatalogFromAppState, createMcpAppOpldBridge, RUNTIME_PACKAGE_ID, RUNTIME_DOMAIN_DETAIL_REF, SHARED_WORKBENCH_URI } from '@opl/mcp-app-shared/bridge';
import { z } from 'zod';
import { callDaemonRpc } from './client.ts';

const input = z.record(z.string(), z.unknown()).optional();
const target = { package_id: z.string().min(1), ref: z.string().min(1), input };
const viewMeta = { ui: { resourceUri: SHARED_WORKBENCH_URI } };
const operationMeta = { ui: { resourceUri: SHARED_WORKBENCH_URI, visibility: ['app'] as ['app'] } };
const viewHtml = new URL('../../../mcp-app-shared/dist/mcp-app-view.html', import.meta.url);

function toolResult(payload: Record<string, unknown>, isError = payload.ok === false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload, isError };
}

function createServer(stateDir: string | undefined, version: string, readOnly: boolean) {
  const server = new McpServer({ name: 'opl-apps', version }, { capabilities: { tools: {}, resources: {} } });
  const rpc = <T>(method: string, params: Record<string, unknown> = {}) =>
    callDaemonRpc(method, params, { stateDir }) as Promise<T>;
  const bridge = createMcpAppOpldBridge({ call: rpc });

  registerAppResource(server, 'OPL Apps', SHARED_WORKBENCH_URI, {
    title: 'OPL Apps', _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
  }, async () => ({ contents: [{ uri: SHARED_WORKBENCH_URI, mimeType: RESOURCE_MIME_TYPE, text: await readFile(viewHtml, 'utf8') }] }));

  registerAppTool(server, 'open_opl_apps', {
    title: 'OPL Apps', description: 'Open an installed OPL workbench or one of its views.',
    inputSchema: z.strictObject({ package_id: target.package_id.optional(), view_id: z.string().min(1).optional(), input }),
    annotations: { readOnlyHint: true }, _meta: viewMeta,
  }, async focus => {
    const catalog = buildCatalogFromAppState(await bridge.getAppState('fast'), { focus });
    if ((focus.package_id || focus.view_id) && !catalog.views.some(view =>
      (!focus.package_id || view.package_id === focus.package_id) && (!focus.view_id || view.view_id === focus.view_id))) {
      return toolResult({ error: { code: 'VIEW_NOT_FOUND', message: 'The requested workbench view is unavailable.' } }, true);
    }
    return toolResult({ opl_mcp_app_catalog: catalog });
  });

  registerAppTool(server, 'opl_app_contribution_read', {
    title: 'Read workbench data', inputSchema: z.strictObject(target),
    annotations: { readOnlyHint: true }, _meta: operationMeta,
  }, async ({ package_id, ref, input }) => {
    const catalog = buildCatalogFromAppState(await bridge.getAppState('fast'));
    if (!(package_id === RUNTIME_PACKAGE_ID && ref === RUNTIME_DOMAIN_DETAIL_REF)
      && !catalog.views.some(view => view.package_id === package_id && view.data_ref === ref)) {
      return toolResult({ error: { code: 'VIEW_NOT_FOUND', message: 'The selected Package does not expose this view.' } }, true);
    }
    return toolResult(await bridge.readContribution({ packageId: package_id, ref, input }));
  });

  if (readOnly) return server;

  registerAppTool(server, 'opl_app_contribution_execute', {
    title: 'Execute a workbench action', inputSchema: z.strictObject({ ...target, confirmed: z.boolean() }),
    annotations: { readOnlyHint: false, idempotentHint: false }, _meta: operationMeta,
  }, async ({ package_id, ref, input, confirmed }) => {
    if (package_id === RUNTIME_PACKAGE_ID) {
      return toolResult(await bridge.executeContribution({ packageId: package_id, actionId: ref, payload: input, confirmed }));
    }
    const receipt = await rpc<Record<string, unknown>>('app.action.execute', {
      action_id: 'package_contribution_execute', dry_run: false, payload: { package_id, ref, input: input ?? {}, confirmed },
    });
    return toolResult(receipt);
  });
  return server;
}

export async function runSharedWorkbenchStdio(stateDir: string | undefined, version: string, readOnly: boolean): Promise<void> {
  const completed = new Promise<void>(resolve => process.stdin.once('end', resolve));
  const handle = serveStdio(() => createServer(stateDir, version, readOnly));
  try {
    await completed;
  } finally {
    await handle.close();
  }
}
