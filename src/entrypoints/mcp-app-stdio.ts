#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

import { createCordisAppFullComposition } from '../host/composition-profiles.ts';
import { FrameworkContractError } from '../kernel/contract-validation.ts';
import { runAppContribution } from '../read-models/operator/app-contribution-broker.ts';
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
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async (contracts, snapshotOptions) => {
      const { buildRuntimeTraySnapshot } = await import('../read-models/operator/runtime-tray-snapshot.ts');
      return buildRuntimeTraySnapshot(contracts, snapshotOptions);
    },
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
      const catalog = listOplMcpAppViews({
        descriptorDiscovery: composition.services.descriptorDiscovery,
        packageId: package_id,
      });
      const views = view_id
        ? catalog.views.filter((view) => view.view_id === view_id)
        : catalog.views;
      return jsonResult({
        opl_mcp_app_catalog: {
          ...catalog,
          views,
          view_count: views.length,
          focus: {
            package_id: package_id ?? null,
            view_id: view_id ?? null,
            input: input ?? {},
          },
        },
      });
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
        if (package_id === OPL_RUNTIME_PACKAGE_ID || isFrameworkRuntimeRef(ref)) {
          return jsonResult(readFrameworkMcpAppContribution({
            ref,
            input: input ?? {},
          }));
        }
        return jsonResult(runAppContribution({
          packageId: package_id,
          ref,
          operation: 'read',
          input: input ?? {},
          confirmed: false,
        }, contributionBroker));
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
      description: 'Execute one descriptor-declared Package action after the user confirms its exact current target and input.',
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
          return errorResult(new FrameworkContractError(
            'contract_shape_invalid',
            'Framework runtime views are read-only and do not expose Package actions.',
            { failure_code: 'framework_runtime_view_is_read_only' },
          ));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runOplMcpAppStdio();
}
