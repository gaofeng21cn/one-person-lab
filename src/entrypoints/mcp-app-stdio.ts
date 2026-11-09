#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

import { createCordisAppFullComposition } from '../host/composition-profiles.ts';
import { runAppContribution } from '../read-models/operator/app-contribution-broker.ts';
import { FrameworkContractError } from '../kernel/contract-validation.ts';
import { executeFrameworkMcpAppAction } from '../read-models/operator/app-mcp-runtime-actions.ts';
import { buildWorkItemProjectionV2 } from '../read-models/operator/work-item-projection/projection.ts';
import {
  OPL_MCP_APP_RESOURCE_URI,
  OPL_MCP_APP_SERVER_ID,
  OPL_MCP_APP_TOOL_NAMES,
  OPL_RUNTIME_PACKAGE_ID,
  OPL_RUNTIME_REFS,
  listOplMcpAppViews,
  readFrameworkMcpAppContribution,
} from '../read-models/operator/app-mcp-app.ts';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, '..', '..');

function packageVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
}

function viewHtml() {
  const candidates = [
    path.join(packageRoot, 'dist', 'entrypoints', 'mcp-app-view.html'),
    path.join(packageRoot, 'src', 'mcp-app', 'index.html'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error('OPL MCP App view bundle is missing. Run scripts/build-mcp-app-view.mjs.');
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('text/html;profile=mcp-app') && !html.includes('opl-apps')) {
    throw new Error('OPL MCP App view bundle is not built from the interactive source.');
  }
  return html;
}

function jsonResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function errorResult(error: unknown) {
  const payload = error instanceof FrameworkContractError
    ? error.toJSON()
    : {
        version: 'g2',
        error: {
          code: 'unexpected_error',
          message: error instanceof Error ? error.message : String(error),
        },
      };
  return {
    ...jsonResult(payload as Record<string, unknown>),
    isError: true,
  };
}

function isFrameworkRuntimeRef(ref: string) {
  return Object.values(OPL_RUNTIME_REFS).some((candidate) => candidate === ref);
}

export async function createOplMcpAppServer() {
  const runtimeSnapshotProvider: Parameters<typeof createCordisAppFullComposition>[0]['runtimeSnapshotProvider']
    = async (contracts, snapshotOptions) => {
      const { buildRuntimeTraySnapshot } = await import('../read-models/operator/runtime-tray-snapshot.ts');
      return buildRuntimeTraySnapshot(contracts, snapshotOptions);
    };
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider,
  });
  const server = new McpServer(
    { name: OPL_MCP_APP_SERVER_ID, version: packageVersion() },
    { capabilities: { tools: {}, resources: {} } },
  );
  const contributionBroker = {
    descriptorDiscovery: composition.services.descriptorDiscovery,
  };
  const appMeta = {
    ui: {
      resourceUri: OPL_MCP_APP_RESOURCE_URI,
    },
  };
  const runtimeServices = () => ({
    contracts: composition.services.charter.load(),
    familyRuntime: composition.services.familyRuntime,
    runtimeSnapshotProvider: (contracts: Parameters<typeof runtimeSnapshotProvider>[0],
      options: Parameters<typeof runtimeSnapshotProvider>[1]) => runtimeSnapshotProvider(contracts, {
      ...options, ownerDeltaObserver: composition.services.ownerDeltaObserver,
    }),
  });
  const readContribution = async (packageId: string, ref: string, input: Record<string, unknown>) => {
    if (packageId !== OPL_RUNTIME_PACKAGE_ID && isFrameworkRuntimeRef(ref)) {
      throw new FrameworkContractError('contract_shape_invalid', 'The runtime data ref requires the runtime package identity.', {
        failure_code: 'app_contribution_owner_mismatch',
      });
    }
    if (packageId !== OPL_RUNTIME_PACKAGE_ID) {
      return runAppContribution({ packageId, ref, operation: 'read', input, confirmed: false }, contributionBroker);
    }
    if (ref !== OPL_RUNTIME_REFS.item || (!input.item_id && !input.work_item_id)) {
      return readFrameworkMcpAppContribution({ ref, input, descriptorDiscovery: composition.services.descriptorDiscovery });
    }
    const projection = buildWorkItemProjectionV2({ profile: 'full' });
    const services = runtimeServices();
    try {
      const snapshot = await services.runtimeSnapshotProvider(services.contracts, {
        appOperatorDrilldownDetailLevel: 'full',
      });
      return readFrameworkMcpAppContribution({ ref, input, projection, runtimeSnapshot: snapshot.runtime_tray_snapshot });
    } catch (error) {
      return readFrameworkMcpAppContribution({
        ref, input, projection,
        runtimeActionsUnavailable: error instanceof Error ? error.message : 'runtime_actions_unavailable',
      });
    }
  };

  registerAppResource(
    server,
    'OPL Apps',
    OPL_MCP_APP_RESOURCE_URI,
    {
      title: 'OPL Apps',
      description: 'Browse and review installed OPL Package contribution views.',
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
            baseUriDomains: [],
          },
        },
      },
    },
    async () => ({
      contents: [{
        uri: OPL_MCP_APP_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: viewHtml(),
        _meta: { ui: { prefersBorder: true } },
      }],
    }),
  );

  registerAppTool(
    server,
    OPL_MCP_APP_TOOL_NAMES.open,
    {
      title: 'Open OPL Apps',
      description: 'Open a shared MCP App for installed OPL Package views. This is read-only until the user chooses a declared Package action.',
      inputSchema: z.object({
        package_id: z.string().min(1).optional(),
        view_id: z.string().min(1).optional(),
        input: z.record(z.string(), z.unknown()).optional(),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: appMeta,
    },
    async ({ package_id, view_id, input }) => {
      try {
        const catalog = listOplMcpAppViews({
          descriptorDiscovery: composition.services.descriptorDiscovery,
        });
        const views = catalog.views;
        const focusedViews = views.filter((view) => (!package_id || view.package_id === package_id)
          && (!view_id || view.view_id === view_id));
        const selected = focusedViews[0];
        if ((package_id || view_id) && !selected) throw new Error(`No installed OPL view matches ${view_id}.`);
        const contribution = selected
          ? await readContribution(String(selected.package_id), String(selected.data_ref), input ?? {})
          : {};
        return jsonResult({
          ...contribution,
          opl_mcp_app_catalog: {
            ...catalog,
            views,
            view_count: views.length,
            focus: {
              package_id: selected?.package_id ?? package_id ?? null,
              view_id: selected?.view_id ?? view_id ?? null,
              input: input ?? {},
            },
          },
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerAppTool(
    server,
    OPL_MCP_APP_TOOL_NAMES.read,
    {
      title: 'Read OPL Package contribution',
      description: 'Read one descriptor-declared OPL Package data ref through its installed owner ABI.',
      inputSchema: z.object({
        package_id: z.string().min(1),
        ref: z.string().min(1),
        input: z.record(z.string(), z.unknown()).optional(),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: OPL_MCP_APP_RESOURCE_URI, visibility: ['app'] } },
    },
    async ({ package_id, ref, input }) => {
      try {
        return jsonResult(await readContribution(package_id, ref, input ?? {}));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerAppTool(
    server,
    OPL_MCP_APP_TOOL_NAMES.execute,
    {
      title: 'Execute OPL Package contribution',
      description: 'Execute a declared Package action or a currently available work-item action after the user confirms its exact target and input.',
      inputSchema: z.object({
        package_id: z.string().min(1),
        ref: z.string().min(1),
        input: z.record(z.string(), z.unknown()).optional(),
        confirmed: z.boolean(),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: OPL_MCP_APP_RESOURCE_URI, visibility: ['app'] } },
    },
    async ({ package_id, ref, input, confirmed }) => {
      try {
        if (package_id === OPL_RUNTIME_PACKAGE_ID) {
          return jsonResult(await executeFrameworkMcpAppAction({
            ref, input: input ?? {}, confirmed,
          }, runtimeServices()));
        }
        return jsonResult(runAppContribution({
          packageId: package_id,
          ref,
          operation: 'execute',
          input: input ?? {},
          confirmed,
        }, contributionBroker));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return {
    server,
    composition,
    async close() {
      await server.close();
      await composition.dispose();
    },
  };
}

export async function runOplMcpAppStdio() {
  const app = await createOplMcpAppServer();
  await app.server.connect(new StdioServerTransport());
}

if (process.argv[1] && fs.existsSync(process.argv[1])
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await runOplMcpAppStdio();
}
