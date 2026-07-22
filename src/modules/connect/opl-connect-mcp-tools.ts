import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  runOplConnectReferenceVerification,
  normalizeReferenceVerificationProviders,
  referenceVerificationProviderIds,
} from './opl-connect-reference-verification.ts';
import {
  runOplConnectScientificSearch,
  scientificConnectorProviderIds,
  type ScientificConnectorProviderId,
} from './opl-connect-scientific.ts';

export const OPL_CONNECT_MCP_SERVER_ID = 'opl-connect';
export const OPL_CONNECT_MCP_META_TOOL_NAMES = [
  'opl_connect_search_tools',
  'opl_connect_describe_tool',
  'opl_connect_execute_tool',
] as const;

const TOOL_IDS = ['scientific_search', 'references_verify'] as const;
type ToolId = typeof TOOL_IDS[number];
type ToolsetId = 'scientific' | 'references';

function authorityBoundary() {
  return {
    read_only: true,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_reference_truth: false,
    can_claim_citation_quality: false,
    can_claim_claim_support: false,
    can_claim_publication_readiness: false,
  };
}

const TOOL_CATALOG = [
  {
    tool_id: 'scientific_search',
    toolset: 'scientific',
    title: 'Search scientific literature',
    summary: 'Search Crossref, OpenAlex, PubMed, or Europe PMC and return normalized read-only source refs.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'query'],
      properties: {
        provider: { type: 'string', enum: scientificConnectorProviderIds() },
        query: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
    },
  },
  {
    tool_id: 'references_verify',
    toolset: 'references',
    title: 'Verify literature references',
    summary: 'Strictly verify identifiers and metadata through selected OPL Connect providers, including PubMed and Europe PMC.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['references', 'providers'],
      properties: {
        references: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              doi: { type: 'string' },
              pmid: { type: 'string' },
              pmcid: { type: 'string' },
              title: { type: 'string' },
            },
            anyOf: [
              { required: ['doi'] },
              { required: ['pmid'] },
              { required: ['pmcid'] },
              { required: ['title'] },
            ],
          },
        },
        providers: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', enum: referenceVerificationProviderIds() },
        },
        max_retries: { type: 'integer', minimum: 0, maximum: 5, default: 1 },
      },
    },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function usageError(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('cli_usage_error', message, details);
}

function readToolId(value: unknown): ToolId {
  if (typeof value !== 'string' || !TOOL_IDS.includes(value as ToolId)) {
    return usageError('Unknown OPL Connect MCP tool id.', { tool_id: value, available_tool_ids: TOOL_IDS });
  }
  return value as ToolId;
}

function readLimit(value: unknown, fallback: number, maximum: number) {
  const limit = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    return usageError('OPL Connect MCP limit is outside the allowed range.', { limit, minimum: 1, maximum });
  }
  return limit;
}

function validateInlineReferences(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return usageError('Reference verification requires between 1 and 100 inline references.');
  }
  const allowedKeys = new Set(['id', 'doi', 'pmid', 'pmcid', 'title']);
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      usageError('Each inline reference must be an object.', { reference_index: index });
    }
    const unsupportedKeys = Object.keys(entry).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length > 0) {
      usageError('Inline reference contains unsupported fields.', {
        reference_index: index,
        unsupported_fields: unsupportedKeys,
      });
    }
    const identifiers = ['doi', 'pmid', 'pmcid', 'title']
      .map((key) => entry[key])
      .filter((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
    if (identifiers.length === 0) {
      usageError('Each inline reference requires a DOI, PMID, PMCID, or title.', { reference_index: index });
    }
    for (const [key, candidate] of Object.entries(entry)) {
      if (typeof candidate !== 'string' || candidate.trim().length === 0) {
        usageError('Inline reference fields must be non-empty strings.', { reference_index: index, field: key });
      }
    }
  }
  return value;
}

export function buildOplConnectMcpProtocolTools() {
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  return [
    {
      name: OPL_CONNECT_MCP_META_TOOL_NAMES[0],
      title: 'Search OPL Connect tools',
      description: 'Discover curated read-only scientific search and reference verification tools, including PubMed and Europe PMC.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          toolset: { type: 'string', enum: ['scientific', 'references'] },
        },
      },
      annotations,
    },
    {
      name: OPL_CONNECT_MCP_META_TOOL_NAMES[1],
      title: 'Describe an OPL Connect tool',
      description: 'Read the exact input schema and authority boundary for one discovered OPL Connect tool.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['tool_id'],
        properties: { tool_id: { type: 'string', enum: TOOL_IDS } },
      },
      annotations,
    },
    {
      name: OPL_CONNECT_MCP_META_TOOL_NAMES[2],
      title: 'Execute an OPL Connect tool',
      description: 'Execute one described read-only scientific search or reference verification tool through its authoritative OPL Connect implementation.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['tool_id', 'arguments'],
        properties: {
          tool_id: { type: 'string', enum: TOOL_IDS },
          arguments: { type: 'object' },
        },
      },
      annotations,
    },
  ];
}

export function searchOplConnectMcpTools(input: { query?: unknown; toolset?: unknown }) {
  const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
  const toolset = input.toolset;
  if (toolset !== undefined && toolset !== 'scientific' && toolset !== 'references') {
    usageError('Unknown OPL Connect MCP toolset.', { toolset, available_toolsets: ['scientific', 'references'] });
  }
  const matches = TOOL_CATALOG.filter((tool) => {
    if (toolset && tool.toolset !== toolset) return false;
    return !query || `${tool.tool_id} ${tool.title} ${tool.summary}`.toLowerCase().includes(query);
  });
  return {
    surface_kind: 'opl_connect_mcp_tool_search',
    server_id: OPL_CONNECT_MCP_SERVER_ID,
    query: query || null,
    toolset: (toolset as ToolsetId | undefined) ?? null,
    tools: matches.map(({ tool_id, toolset: id, title, summary }) => ({ tool_id, toolset: id, title, summary })),
    authority_boundary: authorityBoundary(),
  };
}

export function describeOplConnectMcpTool(toolIdInput: unknown) {
  const toolId = readToolId(toolIdInput);
  const tool = TOOL_CATALOG.find((entry) => entry.tool_id === toolId)!;
  return {
    surface_kind: 'opl_connect_mcp_tool_descriptor',
    server_id: OPL_CONNECT_MCP_SERVER_ID,
    ...tool,
    authority_boundary: authorityBoundary(),
  };
}

export async function executeOplConnectMcpTool(toolIdInput: unknown, rawArguments: unknown) {
  const toolId = readToolId(toolIdInput);
  if (!isRecord(rawArguments)) usageError('OPL Connect MCP tool arguments must be an object.', { tool_id: toolId });

  if (toolId === 'scientific_search') {
    const provider = rawArguments.provider;
    const query = typeof rawArguments.query === 'string' ? rawArguments.query.trim() : '';
    if (typeof provider !== 'string' || !scientificConnectorProviderIds().includes(provider as ScientificConnectorProviderId)) {
      usageError('Scientific search requires a supported provider.', {
        provider,
        available_providers: scientificConnectorProviderIds(),
      });
    }
    if (!query) usageError('Scientific search requires a non-empty query.');
    return runOplConnectScientificSearch({
      provider: provider as ScientificConnectorProviderId,
      query,
      limit: readLimit(rawArguments.limit, 10, 50),
    });
  }

  const references = validateInlineReferences(rawArguments.references);
  if (
    !Array.isArray(rawArguments.providers)
    || rawArguments.providers.length === 0
    || rawArguments.providers.some(
      (provider) => typeof provider !== 'string' || provider.trim().length === 0,
    )
  ) {
    usageError('Reference verification requires at least one non-empty provider string.');
  }
  const maxRetries = rawArguments.max_retries === undefined ? 1 : Number(rawArguments.max_retries);
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    usageError('Reference verification max_retries is outside the allowed range.', {
      max_retries: rawArguments.max_retries,
      minimum: 0,
      maximum: 5,
    });
  }
  return runOplConnectReferenceVerification({
    references,
    providers: normalizeReferenceVerificationProviders(rawArguments.providers as string[]),
    maxRetries,
  });
}
