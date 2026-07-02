import crypto from 'node:crypto';

import { FrameworkContractError } from '../charter/contracts.ts';

export type PubMedSearchInput = {
  query: string;
  limit: number;
  apiBaseUrl?: string;
  tool?: string;
  email?: string;
  apiKey?: string;
  timeoutMs?: number;
};

type PubMedArticleId = {
  idtype?: unknown;
  value?: unknown;
};

type PubMedAuthor = {
  name?: unknown;
};

type PubMedSummary = {
  uid?: unknown;
  title?: unknown;
  source?: unknown;
  fulljournalname?: unknown;
  pubdate?: unknown;
  sortpubdate?: unknown;
  authors?: unknown;
  articleids?: unknown;
};

const DEFAULT_PUBMED_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const DEFAULT_TOOL = 'one-person-lab';
const DEFAULT_TIMEOUT_MS = 30_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pubmedApiBase(input?: string) {
  return (input?.trim() || process.env.OPL_CONNECT_PUBMED_API_BASE?.trim() || DEFAULT_PUBMED_API_BASE).replace(/\/+$/, '');
}

function pubmedTool(input?: string) {
  return input?.trim() || process.env.OPL_CONNECT_PUBMED_TOOL?.trim() || DEFAULT_TOOL;
}

function pubmedEmail(input?: string) {
  return input?.trim() || process.env.OPL_CONNECT_PUBMED_EMAIL?.trim() || null;
}

function pubmedApiKey(input?: string) {
  return input?.trim() || process.env.OPL_CONNECT_PUBMED_API_KEY?.trim() || null;
}

function pubmedTimeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) return input;
  const raw = process.env.OPL_CONNECT_PUBMED_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function pubmedUrl(baseUrl: string, endpoint: 'esearch.fcgi' | 'esummary.fcgi', params: Record<string, string>) {
  const url = new URL(`${baseUrl}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function publicUrl(url: URL) {
  const clone = new URL(url.toString());
  if (clone.searchParams.has('api_key')) clone.searchParams.set('api_key', '<redacted>');
  return clone.toString();
}

async function fetchJson(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Connect PubMed request failed.', {
      connector_id: 'pubmed',
      url: publicUrl(url),
      timeout_ms: timeoutMs,
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Connect PubMed request returned a non-OK status.', {
      connector_id: 'pubmed',
      url: publicUrl(url),
      status: response.status,
      status_text: response.statusText,
    });
  }
  try {
    return await response.json() as unknown;
  } catch (error) {
    throw new FrameworkContractError('codex_command_failed', 'OPL Connect PubMed response was not valid JSON.', {
      connector_id: 'pubmed',
      url: publicUrl(url),
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function queryDigest(input: Pick<PubMedSearchInput, 'query' | 'limit'>) {
  return crypto.createHash('sha256').update(JSON.stringify({
    query: input.query,
    limit: input.limit,
    connector_id: 'pubmed',
  })).digest('hex');
}

function articleIdValue(summary: PubMedSummary, idType: string) {
  const articleIds = Array.isArray(summary.articleids) ? summary.articleids as PubMedArticleId[] : [];
  return articleIds
    .map((entry) => ({
      idtype: asString(entry.idtype)?.toLowerCase(),
      value: asString(entry.value),
    }))
    .find((entry) => entry.idtype === idType)?.value ?? null;
}

function normalizeSummary(summary: PubMedSummary) {
  const pmid = asString(summary.uid) ?? articleIdValue(summary, 'pubmed');
  if (!pmid) return null;
  const doi = articleIdValue(summary, 'doi');
  const authors = Array.isArray(summary.authors)
    ? (summary.authors as PubMedAuthor[]).map((author) => asString(author.name)).filter((name): name is string => Boolean(name))
    : [];
  return {
    source_ref: `pubmed:${pmid}`,
    source_kind: 'literature_article',
    source_provider: 'PubMed',
    pmid,
    doi,
    title: asString(summary.title) ?? '',
    journal: asString(summary.fulljournalname) ?? asString(summary.source),
    publication_date: asString(summary.pubdate) ?? asString(summary.sortpubdate),
    authors,
    source_urls: {
      pubmed: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi: doi ? `https://doi.org/${doi}` : null,
    },
  };
}

function buildAuthorityBoundary() {
  return {
    read_only: true,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_claim_publication_readiness: false,
  };
}

export async function runOplConnectPubMedSearch(input: PubMedSearchInput) {
  const baseUrl = pubmedApiBase(input.apiBaseUrl);
  const timeoutMs = pubmedTimeoutMs(input.timeoutMs);
  const sharedParams: Record<string, string> = {
    tool: pubmedTool(input.tool),
    ...(pubmedEmail(input.email) ? { email: pubmedEmail(input.email)! } : {}),
    ...(pubmedApiKey(input.apiKey) ? { api_key: pubmedApiKey(input.apiKey)! } : {}),
  };
  const esearchUrl = pubmedUrl(baseUrl, 'esearch.fcgi', {
    db: 'pubmed',
    term: input.query,
    retmode: 'json',
    retmax: String(input.limit),
    sort: 'relevance',
    ...sharedParams,
  });
  const esearch = asRecord(await fetchJson(esearchUrl, timeoutMs));
  const esearchResult = asRecord(esearch.esearchresult);
  const idList = Array.isArray(esearchResult.idlist)
    ? esearchResult.idlist.map(asString).filter((entry): entry is string => Boolean(entry))
    : [];
  const esummaryUrl = idList.length > 0
    ? pubmedUrl(baseUrl, 'esummary.fcgi', {
        db: 'pubmed',
        id: idList.join(','),
        retmode: 'json',
        ...sharedParams,
      })
    : null;
  const esummary = esummaryUrl ? asRecord(await fetchJson(esummaryUrl, timeoutMs)) : { result: { uids: [] } };
  const summaryResult = asRecord(esummary.result);
  const uids = Array.isArray(summaryResult.uids)
    ? summaryResult.uids.map(asString).filter((entry): entry is string => Boolean(entry))
    : idList;
  const normalizedResults = uids
    .map((uid) => normalizeSummary({ uid, ...asRecord(summaryResult[uid]) }))
    .filter((entry): entry is NonNullable<ReturnType<typeof normalizeSummary>> => Boolean(entry));
  const digest = queryDigest(input);

  return {
    version: 'g2',
    opl_connect_pubmed: {
      surface_kind: 'opl_connect_pubmed_readonly_search',
      connector_id: 'pubmed',
      connector_family: 'OPL Connect',
      status: 'completed',
      request: {
        query: input.query,
        limit: input.limit,
      },
      source_boundary: {
        source_system: 'NCBI PubMed E-utilities',
        source_system_authority: 'PubMed',
        sensitive_data_policy: 'query_and_normalized_refs_only',
        stores_article_bodies: false,
      },
      normalized_results: normalizedResults,
      result_refs: normalizedResults.map((entry) => entry.source_ref),
      receipt_refs: {
        connector_invocation_ref: `opl://connect/pubmed/search/${digest}`,
        ledger_receipt_candidate_ref: `opl://ledger/connect/pubmed/search/${digest}`,
      },
      authority_boundary: buildAuthorityBoundary(),
    },
  };
}
