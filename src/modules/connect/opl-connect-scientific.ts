import crypto from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  parseEuropePmcResults,
  parsePubmedSummary,
  type NcbiReferenceRecord,
} from './opl-connect-reference-ncbi.ts';

export type ScientificConnectorProviderId = 'crossref' | 'openalex' | 'pubmed' | 'pmc';

export type ScientificConnectorSearchInput = {
  provider: ScientificConnectorProviderId;
  query: string;
  limit: number;
  timeoutMs?: number;
};

export type NormalizedScientificSourceRef = {
  source_ref: string;
  source_kind: 'literature_article';
  source_provider: 'Crossref' | 'OpenAlex' | 'PubMed' | 'Europe PMC';
  provider_id: ScientificConnectorProviderId;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalex_id: string | null;
  title: string;
  journal: string | null;
  publication_year: string | null;
  authors: string[];
  article_types: string[];
  source_urls: Record<string, string | null>;
};

type ScientificConnectorSearchResult = {
  normalized_results: NormalizedScientificSourceRef[];
  provider_total: number | null;
};

type ScientificConnectorProviderAdapter = {
  provider_id: ScientificConnectorProviderId;
  provider_owner: string;
  source_system: string;
  search: (input: ScientificConnectorSearchInput) => Promise<ScientificConnectorSearchResult>;
};

const DEFAULT_CROSSREF_API_BASE = 'https://api.crossref.org';
const DEFAULT_OPENALEX_API_BASE = 'https://api.openalex.org';
const DEFAULT_PUBMED_EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const DEFAULT_EUROPE_PMC_API_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
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

function asNumber(value: unknown): number | null {
  const normalized = typeof value === 'number' ? value : asString(value);
  if (normalized === null) return null;
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
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
    pmcid: null,
    openalex_id: null,
    title: title ?? '',
    journal: firstString(item['container-title']),
    publication_year: crossrefYear(item),
    authors: crossrefAuthors(item),
    article_types: [],
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
  const normalizedResults = (Array.isArray(message.items) ? message.items : [])
    .map(asRecord)
    .map(normalizeCrossrefItem)
    .filter((entry): entry is NormalizedScientificSourceRef => Boolean(entry));
  return {
    normalized_results: normalizedResults,
    provider_total: asNumber(message['total-results']),
  };
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
    pmcid: null,
    openalex_id: openalexId,
    title: title ?? '',
    journal: asString(source.display_name),
    publication_year: asNumberString(item.publication_year),
    authors: Array.isArray(item.authorships)
      ? item.authorships.map(asRecord).map((authorship) => asString(asRecord(authorship.author).display_name)).filter((name): name is string => Boolean(name))
      : [],
    article_types: [],
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
  const normalizedResults = (Array.isArray(json.results) ? json.results : [])
    .map(asRecord)
    .map(normalizeOpenAlexItem)
    .filter((entry): entry is NormalizedScientificSourceRef => Boolean(entry));
  return {
    normalized_results: normalizedResults,
    provider_total: asNumber(asRecord(json.meta).count),
  };
}

function normalizeBiomedicalRecord(
  provider: 'pubmed' | 'pmc',
  record: NcbiReferenceRecord,
): NormalizedScientificSourceRef | null {
  const { doi, pmid, pmcid } = record.normalized;
  const title = record.normalized.title;
  const providerIdentifier = provider === 'pubmed' ? pmid : pmcid ?? pmid;
  if (!providerIdentifier || !title) return null;
  return {
    source_ref: `${provider}:${providerIdentifier}`,
    source_kind: 'literature_article',
    source_provider: provider === 'pubmed' ? 'PubMed' : 'Europe PMC',
    provider_id: provider,
    doi,
    pmid,
    pmcid,
    openalex_id: null,
    title,
    journal: record.metadata.journal ?? null,
    publication_year: record.metadata.year ?? null,
    authors: record.metadata.authors ?? [],
    article_types: record.metadata.article_types ?? [],
    source_urls: {
      doi: doi ? `https://doi.org/${doi}` : null,
      pubmed: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null,
      pmc: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null,
      europe_pmc: provider === 'pmc'
        ? `https://europepmc.org/article/${pmid ? 'MED' : 'PMC'}/${pmid ?? pmcid}`
        : null,
    },
  };
}

async function searchPubmed(input: ScientificConnectorSearchInput): Promise<ScientificConnectorSearchResult> {
  const baseUrl = apiBase('OPL_CONNECT_PUBMED_EUTILS_BASE', DEFAULT_PUBMED_EUTILS_BASE);
  const searchUrl = new URL(`${baseUrl}/esearch.fcgi`);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', input.query);
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(input.limit));
  const searchPayload = asRecord(await fetchJson(searchUrl, 'pubmed', timeoutMs(input.timeoutMs)));
  const searchResult = asRecord(searchPayload.esearchresult);
  const pmids = (Array.isArray(searchResult.idlist) ? searchResult.idlist : [])
    .map(asString)
    .filter((entry): entry is string => Boolean(entry));
  if (pmids.length === 0) {
    return { normalized_results: [], provider_total: asNumber(searchResult.count) };
  }
  const summaryUrl = new URL(`${baseUrl}/esummary.fcgi`);
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', pmids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');
  const summaryPayload = await fetchJson(summaryUrl, 'pubmed', timeoutMs(input.timeoutMs));
  return {
    normalized_results: pmids
      .map((pmid) => parsePubmedSummary(summaryPayload, pmid))
      .filter((record): record is NcbiReferenceRecord => Boolean(record))
      .map((record) => normalizeBiomedicalRecord('pubmed', record))
      .filter((entry): entry is NormalizedScientificSourceRef => Boolean(entry)),
    provider_total: asNumber(searchResult.count),
  };
}

async function searchPmc(input: ScientificConnectorSearchInput): Promise<ScientificConnectorSearchResult> {
  const url = new URL(`${apiBase('OPL_CONNECT_EUROPE_PMC_API_BASE', DEFAULT_EUROPE_PMC_API_BASE)}/search`);
  url.searchParams.set('query', input.query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('pageSize', String(input.limit));
  const payload = asRecord(await fetchJson(url, 'pmc', timeoutMs(input.timeoutMs)));
  return {
    normalized_results: parseEuropePmcResults(payload)
      .map((record) => normalizeBiomedicalRecord('pmc', record))
      .filter((entry): entry is NormalizedScientificSourceRef => Boolean(entry)),
    provider_total: asNumber(payload.hitCount),
  };
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
  {
    provider_id: 'pubmed',
    provider_owner: 'OPL Connect biomedical scientific provider adapter',
    source_system: 'NCBI PubMed ESearch and ESummary',
    search: searchPubmed,
  },
  {
    provider_id: 'pmc',
    provider_owner: 'OPL Connect biomedical scientific provider adapter',
    source_system: 'Europe PMC search API',
    search: searchPmc,
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
  const searchResult = await provider.search(input);
  const normalizedResults = searchResult.normalized_results;
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
      retrieval_count_reconciliation: {
        provider_total: searchResult.provider_total,
        returned_count: normalizedResults.length,
        requested_limit: input.limit,
        result_set_complete: searchResult.provider_total === null
          ? null
          : searchResult.provider_total <= normalizedResults.length,
        next_page_available: searchResult.provider_total === null
          ? null
          : searchResult.provider_total > normalizedResults.length,
      },
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
