#!/usr/bin/env node

import fs from 'node:fs';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { FrameworkContractError } from '../kernel/contract-validation.ts';
import {
  OPL_CONNECT_MCP_META_TOOL_NAMES,
  OPL_CONNECT_MCP_SERVER_ID,
  buildOplConnectMcpProtocolTools,
  describeOplConnectMcpTool,
  executeOplConnectMcpTool,
  searchOplConnectMcpTools,
} from '../modules/connect/opl-connect-mcp-tools.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function packageVersion() {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as unknown;
  return isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : '0.0.0';
}

function jsonToolResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function errorToolResult(error: unknown) {
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
    ...jsonToolResult(payload as Record<string, unknown>),
    isError: true,
  };
}

export async function runOplConnectMcpStdio() {
  const server = new Server(
    { name: OPL_CONNECT_MCP_SERVER_ID, version: packageVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildOplConnectMcpProtocolTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = isRecord(request.params.arguments) ? request.params.arguments : {};
    try {
      switch (request.params.name) {
        case OPL_CONNECT_MCP_META_TOOL_NAMES[0]:
          return jsonToolResult(searchOplConnectMcpTools({ query: args.query, toolset: args.toolset }));
        case OPL_CONNECT_MCP_META_TOOL_NAMES[1]:
          return jsonToolResult(describeOplConnectMcpTool(args.tool_id));
        case OPL_CONNECT_MCP_META_TOOL_NAMES[2]:
          return jsonToolResult(await executeOplConnectMcpTool(args.tool_id, args.arguments));
        default:
          throw new FrameworkContractError('cli_usage_error', 'Unknown OPL Connect MCP meta-tool.', {
            tool_name: request.params.name,
            available_tools: OPL_CONNECT_MCP_META_TOOL_NAMES,
          });
      }
    } catch (error) {
      return errorToolResult(error);
    }
  });

  await server.connect(new StdioServerTransport());
}

await runOplConnectMcpStdio();
