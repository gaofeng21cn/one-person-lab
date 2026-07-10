import crypto from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type ScientificConnectorProviderId = 'crossref' | 'openalex';

export type ScientificConnectorSearchInput = {
  provider: ScientificConnectorProviderId;
  query: string;
  limit: number;
  timeoutMs?: number;
};

type NormalizedScientificSourceRef = {
  source_ref: string;
  source_kind: 'literature_article';
  source_provider: 'Crossref' | 'OpenAlex';
  provider_id: ScientificConnectorProviderId;
  doi: string | null;
  pmid: string | null;
  openalex_id: string | null;
  title: string;
  journal: string | null;
  publication_year: string | null;
  authors: string[];
  source_urls: Record<string, string | null>;
};

type ScientificConnectorProviderAdapter = {
  provider_id: ScientificConnectorProviderId;
  provider_owner: string;
  source_system: string;
  search: (input: ScientificConnectorSearchInput) => Promise<NormalizedScientificSourceRef[]>;
};

const DEFAULT_CROSSREF_API_BASE = 'https://api.crossref.org';
const DEFAULT_OPENALEX_API_BASE = 'https://api.openalex.org';
const DEFAULT_TIMEOUT_MS = 30_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumberString(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : asString(value);
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) ? value.map(asString).find(Boolean) ?? null : asString(value);
}

function apiBase(envName: string, fallback: string) {
  return (process.env[envName]?.trim() || fallback).replace(/\/+$/, '');
}

function timeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) return input;
  const raw = process.env.OPL_CONNECT_SCIENTIFIC_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function normalizeDoi(value: string | null) {
  return value?.replace(/^https?:\/\/doi\.org\//i, '').trim() || null;
}

function queryDigest(input: Pick<ScientificConnectorSearchInput, 'provider' | 'query' | 'limit'>) {
  return crypto.createHash('sha256').update(JSON.stringify({
    connector_id: 'scientific',
    provider: input.provider,
    query: input.query,
    limit: input.limit,
  })).digest('hex');
}

function buildAuthorityBoundary() {
  return {
    read_only: true,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_publication_readiness: false,
    can_claim_citation_truth: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function buildOwnershipBoundary(provider: ScientificConnectorProviderId) {
  return {
    opl_owned_surfaces: [
      'connector_abi',
      'provider_invocation_receipt_candidate',
      'normalized_source_ref_transport',
    ],
    connector_profile_owner: 'OPL Connect',
    provider_receipt_owner: 'OPL Connect',
    provider,
    professional_skill_truth_owner: 'selected professional skill package or domain agent',
    citation_judgment_owner: 'selected domain owner',
    domain_truth_owner: 'selected domain owner',
    stores_literature_library: false,
    connector_receipt_counts_as_citation_truth: false,
    connector_receipt_counts_as_domain_truth: false,
  };
}

async function fetchJson(url: URL, provider: ScientificConnectorProviderId, timeout: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector request failed.', {
      connector_id: 'scientific',
      provider_id: provider,
      url: url.toString(),
      timeout_ms: timeout,
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector request returned a non-OK status.', {
      connector_id: 'scientific',
      provider_id: provider,
      url: url.toString(),
      status: response.status,
      status_text: response.statusText,
    });
  }
  try {
    return await response.json() as unknown;
  } catch (error) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector response was not valid JSON.', {
      connector_id: 'scientific',
      provider_id: provider,
      url: url.toString(),
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function crossrefYear(item: Record<string, unknown>) {
  const dateParts = asRecord(asRecord(item.issued)['date-parts']);
  const first = Array.isArray(asRecord(item.issued)['date-parts'])
    ? (asRecord(item.issued)['date-parts'] as unknown[])[0]
    : dateParts[0];
  return Array.isArray(first) ? asNumberString(first[0]) : null;
}

function crossrefAuthors(item: Record<string, unknown>) {
  return Array.isArray(item.author)
    ? item.author.map(asRecord).map((author) => [asString(author.given), asString(author.family)].filter(Boolean).join(' ')).filter(Boolean)
    : [];
}

function fallbackSourceRef(provider: ScientificConnectorProviderId, seed: string) {
  const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `${provider}:query-result:${digest}`;
}

function normalizeCrossrefItem(item: Record<string, unknown>): NormalizedScientificSourceRef | null {
  const doi = normalizeDoi(asString(item.DOI));
  const title = firstString(item.title);
  if (!doi && !title) return null;
  return {
    source_ref: doi ? `crossref:${doi}` : fallbackSourceRef('crossref', JSON.stringify(item)),
    source_kind: 'literature_article',
    source_provider: 'Crossref',
    provider_id: 'crossref',
    doi,
    pmid: null,
    openalex_id: null,
    title: title ?? '',
    journal: firstString(item['container-title']),
    publication_year: crossrefYear(item),
    authors: crossrefAuthors(item),
    source_urls: {
      doi: doi ? `https://doi.org/${doi}` : null,
      crossref: doi ? `https://api.crossref.org/works/${encodeURIComponent(doi)}` : asString(item.URL),
    },
  };
}

async function searchCrossref(input: ScientificConnectorSearchInput) {
  const url = new URL(`${apiBase('OPL_CONNECT_CROSSREF_API_BASE', DEFAULT_CROSSREF_API_BASE)}/works`);
  url.searchParams.set('query', input.query);
  url.searchParams.set('rows', String(input.limit));
  const json = asRecord(await fetchJson(url, 'crossref', timeoutMs(input.timeoutMs)));
  const message = asRecord(json.message);
  return (Array.isArray(message.items) ? message.items : [])
    .map(asRecord)
    .map(normalizeCrossrefItem)
    .filter((entry): entry is NormalizedScientificSourceRef => Boolean(entry));
}

function openAlexShortId(value: string | null) {
  return value?.replace(/^https?:\/\/openalex\.org\//i, '').trim() || null;
}

function normalizeOpenAlexItem(item: Record<string, unknown>): NormalizedScientificSourceRef | null {
  const id = asString(item.id);
  const openalexId = openAlexShortId(id);
  const doi = normalizeDoi(asString(item.doi) ?? asString(asRecord(item.ids).doi));
  const primaryLocation = asRecord(item.primary_location);
  const source = asRecord(primaryLocation.source);
  const title = asString(item.title) ?? asString(item.display_name);
  if (!openalexId && !doi && !title) return null;
  return {
    source_ref: openalexId ? `openalex:${openalexId}` : fallbackSourceRef('openalex', JSON.stringify(item)),
    source_kind: 'literature_article',
    source_provider: 'OpenAlex',
    provider_id: 'openalex',
    doi,
    pmid: asString(asRecord(item.ids).pmid)?.replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '').replace(/\/$/, '') ?? null,
    openalex_id: openalexId,
    title: title ?? '',
    journal: asString(source.display_name),
    publication_year: asNumberString(item.publication_year),
    authors: Array.isArray(item.authorships)
      ? item.authorships.map(asRecord).map((authorship) => asString(asRecord(authorship.author).display_name)).filter((name): name is string => Boolean(name))
      : [],
    source_urls: {
      openalex: id,
      doi: doi ? `https://doi.org/${doi}` : null,
    },
  };
}

async function searchOpenAlex(input: ScientificConnectorSearchInput) {
  const url = new URL(`${apiBase('OPL_CONNECT_OPENALEX_API_BASE', DEFAULT_OPENALEX_API_BASE)}/works`);
  url.searchParams.set('search', input.query);
  url.searchParams.set('per-page', String(input.limit));
  const json = asRecord(await fetchJson(url, 'openalex', timeoutMs(input.timeoutMs)));
  return (Array.isArray(json.results) ? json.results : [])
    .map(asRecord)
    .map(normalizeOpenAlexItem)
    .filter((entry): entry is NormalizedScientificSourceRef => Boolean(entry));
}

const SCIENTIFIC_CONNECTOR_PROVIDER_REGISTRY = [
  {
    provider_id: 'crossref',
    provider_owner: 'OPL Connect optional scientific provider adapter',
    source_system: 'Crossref REST API',
    search: searchCrossref,
  },
  {
    provider_id: 'openalex',
    provider_owner: 'OPL Connect optional scientific provider adapter',
    source_system: 'OpenAlex Works API',
    search: searchOpenAlex,
  },
] as const satisfies readonly ScientificConnectorProviderAdapter[];

export function scientificConnectorProviderIds(): ScientificConnectorProviderId[] {
  return SCIENTIFIC_CONNECTOR_PROVIDER_REGISTRY.map((provider) => provider.provider_id);
}

export function buildScientificConnectorProviderRegistryReadback() {
  return {
    surface_kind: 'opl_scientific_connector_provider_registry',
    version: 'opl-scientific-connector-provider-registry.v1',
    owner: 'OPL Connect',
    default_provider_id: null,
    providers: SCIENTIFIC_CONNECTOR_PROVIDER_REGISTRY.map((provider) => ({
      provider_id: provider.provider_id,
      provider_owner: provider.provider_owner,
      source_system: provider.source_system,
      adapter_role: 'optional_provider_adapter',
    })),
    authority_boundary: buildAuthorityBoundary(),
  };
}

function resolveProvider(providerId: ScientificConnectorProviderId) {
  const provider = SCIENTIFIC_CONNECTOR_PROVIDER_REGISTRY.find((entry) => entry.provider_id === providerId);
  if (!provider) {
    throw new FrameworkContractError('cli_usage_error', 'Unknown scientific connector provider.', {
      provider_id: providerId,
      available_providers: scientificConnectorProviderIds(),
    });
  }
  return provider;
}

export async function runOplConnectScientificSearch(input: ScientificConnectorSearchInput) {
  const provider = resolveProvider(input.provider);
  const normalizedResults = await provider.search(input);
  const digest = queryDigest(input);
  const connectorInvocationRef = `opl://connect/scientific/${input.provider}/search/${digest}`;
  const ledgerReceiptCandidateRef = `opl://ledger/connect/scientific/${input.provider}/search/${digest}`;

  return {
    version: 'g2',
    opl_connect_scientific: {
      surface_kind: 'opl_connect_scientific_readonly_search',
      connector_id: 'scientific',
      connector_profile: 'scientific',
      profile_role: 'optional_scientific_connector_profile',
      connector_family: 'OPL Connect',
      provider_id: input.provider,
      status: 'completed',
      request: {
        provider: input.provider,
        query: input.query,
        limit: input.limit,
      },
      source_boundary: {
        source_system: provider.source_system,
        source_system_authority: input.provider,
        sensitive_data_policy: 'query_and_normalized_refs_only',
        stores_article_bodies: false,
      },
      normalized_results: normalizedResults,
      result_refs: normalizedResults.map((entry) => entry.source_ref),
      receipt_refs: {
        connector_invocation_ref: connectorInvocationRef,
        ledger_receipt_candidate_ref: ledgerReceiptCandidateRef,
      },
      provider_receipt_candidate_refs: [ledgerReceiptCandidateRef],
      provider_receipt_role: 'provider_receipt_candidate_only',
      ownership_boundary: buildOwnershipBoundary(input.provider),
      authority_boundary: buildAuthorityBoundary(),
    },
  };
}
