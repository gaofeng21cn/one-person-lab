import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../kernel/json-file.ts';
import { FrameworkContractError } from '../charter/index.ts';

export type ReferenceVerificationInput = {
  referencesFile: string;
  providers: string[];
  cacheRoot?: string;
  maxRetries: number;
  timeoutMs?: number;
};

type ReferenceRecord = {
  id: string;
  doi: string | null;
  pmid: string | null;
  title: string | null;
};

type ProviderId = 'crossref' | 'pubmed' | 'openalex' | 'semantic-scholar' | 'crossmark' | 'publisher';
type RetryAttempt = { attempt: number; status: string; http_status: number | null };
type ProviderEvidence = {
  reference_id: string;
  provider: 'crossref' | 'pubmed' | 'openalex' | 'semantic_scholar' | 'crossmark' | 'publisher';
  provider_id: ProviderId;
  lookup_status: 'found' | 'not_found' | 'deferred' | 'error';
  status: 'matched' | 'deferred';
  deferred_reason?: string;
  match_basis: 'doi' | 'pmid' | 'title' | 'none';
  receipt_ref: string;
  matched_identifiers: Record<string, string>;
  metadata: {
    title?: string;
    year?: string;
    journal?: string;
  };
  retraction_or_update_flags: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  normalized: {
    doi: string | null;
    pmid: string | null;
    title: string | null;
  };
  cache: {
    status: 'disabled' | 'hit' | 'miss';
    write_status: string;
    cache_ref: string | null;
  };
  retry_attempts: RetryAttempt[];
};
type ProviderEvidenceDraft = Omit<ProviderEvidence, 'receipt_ref'>;

const DEFAULT_CROSSREF_API_BASE = 'https://api.crossref.org';
const DEFAULT_PUBMED_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const DEFAULT_OPENALEX_API_BASE = 'https://api.openalex.org';
const DEFAULT_SEMANTIC_SCHOLAR_API_BASE = 'https://api.semanticscholar.org/graph/v1';
const DEFAULT_PUBLISHER_DOI_BASE = 'https://doi.org';
const DEFAULT_TIMEOUT_MS = 30_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeDoi(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .trim()
    .toLowerCase() || null;
}

function normalizeProviders(providers: string[]) {
  const entries = providers.flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(entries.length > 0 ? entries : ['crossref', 'pubmed', 'openalex', 'semantic-scholar', 'crossmark', 'publisher'])]
    .map((entry) => entry === 'semantic_scholar' ? 'semantic-scholar' : entry);
  const allowed = new Set(['crossref', 'pubmed', 'openalex', 'semantic-scholar', 'crossmark', 'publisher']);
  const unsupported = unique.filter((entry) => !allowed.has(entry));
  if (unsupported.length > 0) {
    throw new FrameworkContractError('codex_command_failed', 'Unsupported OPL Connect reference verification provider.', {
      unsupported,
      supported: [...allowed],
    });
  }
  return unique as ProviderId[];
}

function loadReferences(filePath: string) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new FrameworkContractError('codex_command_failed', 'Reference verification requires an existing --references-file.', {
      references_file: resolved,
    });
  }
  const parsed = parseJsonText(fs.readFileSync(resolved, 'utf8')) as unknown;
  const rawReferences = Array.isArray(parsed) ? parsed : asRecord(parsed).references;
  if (!Array.isArray(rawReferences)) {
    throw new FrameworkContractError('codex_command_failed', 'References file must be an array or an object with a references array.', {
      references_file: resolved,
    });
  }
  return rawReferences.map((entry, index) => normalizeReference(entry, index));
}

function normalizeReference(value: unknown, index: number): ReferenceRecord {
  const record = asRecord(value);
  const doi = normalizeDoi(asString(record.doi) ?? asString(record.DOI));
  const pmid = asString(record.pmid) ?? asString(record.pubmed_id);
  const title = asString(record.title);
  const fallbackId = crypto.createHash('sha256').update(JSON.stringify({ doi, pmid, title, index })).digest('hex').slice(0, 12);
  return {
    id: asString(record.id) ?? asString(record.reference_id) ?? fallbackId,
    doi,
    pmid,
    title,
  };
}

function timeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) return input;
  return DEFAULT_TIMEOUT_MS;
}

function apiBase(envName: string, fallback: string) {
  return (process.env[envName]?.trim() || fallback).replace(/\/+$/, '');
}

function cacheRef(cacheRoot: string | undefined, providerId: ProviderId, reference: ReferenceRecord) {
  if (!cacheRoot) return null;
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    provider_id: providerId,
    reference_id: reference.id,
    doi: reference.doi,
    pmid: reference.pmid,
    title: reference.title,
  })).digest('hex');
  return path.join(path.resolve(cacheRoot), providerId, `${digest}.json`);
}

function readCache(cachePath: string | null) {
  if (!cachePath || !fs.existsSync(cachePath)) return null;
  return parseJsonText(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
}

function writeCache(cachePath: string | null, payload: Record<string, unknown>) {
  if (!cachePath) return 'skipped';
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return 'written';
}

async function fetchWithRetry(
  url: URL,
  maxRetries: number,
  providerId: ProviderId,
  timeout: number,
  init: RequestInit = {},
) {
  const retryAttempts: RetryAttempt[] = [];
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const status = response.status >= 500 && attempt < maxRetries ? 'retryable_error' : 'failed';
        retryAttempts.push({ attempt, status, http_status: response.status });
        if (status === 'retryable_error') continue;
        throw new FrameworkContractError('codex_command_failed', 'Reference provider returned a non-OK status.', {
          provider_id: providerId,
          status: response.status,
          url: url.toString(),
        });
      }
      retryAttempts.push({ attempt, status: 'success', http_status: response.status });
      return { response, retryAttempts };
    } catch (error) {
      lastError = error;
      if (error instanceof FrameworkContractError) throw error;
      const status = attempt < maxRetries ? 'retryable_error' : 'failed';
      retryAttempts.push({ attempt, status, http_status: null });
      if (status === 'retryable_error') continue;
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FrameworkContractError('codex_command_failed', 'Reference provider request failed.', {
    provider_id: providerId,
    url: url.toString(),
    cause: lastError instanceof Error ? lastError.message : String(lastError),
    retry_attempts: retryAttempts,
  });
}

async function fetchJsonWithRetry(url: URL, maxRetries: number, providerId: ProviderId, timeout: number) {
  const { response, retryAttempts } = await fetchWithRetry(url, maxRetries, providerId, timeout);
  return {
    json: await response.json() as unknown,
    retryAttempts,
  };
}

async function fetchTextWithRetry(
  url: URL,
  maxRetries: number,
  providerId: ProviderId,
  timeout: number,
  init: RequestInit = {},
) {
  const { response, retryAttempts } = await fetchWithRetry(url, maxRetries, providerId, timeout, init);
  return {
    text: await response.text(),
    responseUrl: response.url || url.toString(),
    contentType: response.headers.get('content-type'),
    retryAttempts,
  };
}

function deferredEvidence(reference: ReferenceRecord, providerId: ProviderId, reason: string): ProviderEvidenceDraft {
  return {
    reference_id: reference.id,
    provider: providerName(providerId),
    provider_id: providerId,
    lookup_status: 'deferred',
    status: 'deferred',
    deferred_reason: reason,
    match_basis: 'none',
    matched_identifiers: identifiersFromReference(reference),
    metadata: metadataFromReference(reference),
    retraction_or_update_flags: {},
    error: {
      code: 'provider_receipt_requirement_deferred',
      message: reason,
    },
    normalized: {
      doi: reference.doi,
      pmid: reference.pmid,
      title: reference.title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: [],
  };
}

async function verifyCrossref(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (!reference.doi && !reference.title) {
    return deferredEvidence(reference, 'crossref', 'crossref provider receipt requirement needs a DOI or title');
  }
  const baseUrl = apiBase('OPL_CONNECT_CROSSREF_API_BASE', DEFAULT_CROSSREF_API_BASE);
  const url = reference.doi
    ? new URL(`${baseUrl}/works/${encodeURIComponent(reference.doi)}`)
    : new URL(`${baseUrl}/works`);
  if (!reference.doi && reference.title) {
    url.searchParams.set('query.title', reference.title);
    url.searchParams.set('rows', '1');
  }
  const { json, retryAttempts } = await fetchJsonWithRetry(url, maxRetries, 'crossref', timeout);
  const message = asRecord(asRecord(json).message);
  const item = reference.doi
    ? message
    : asRecord((Array.isArray(message.items) ? message.items : [])[0]);
  if (Object.keys(item).length === 0) {
    return deferredEvidence(reference, 'crossref', 'crossref provider did not return a matching DOI/title item');
  }
  const titleList = Array.isArray(item.title) ? item.title.map(asString).filter(Boolean) : [];
  const doi = normalizeDoi(asString(item.DOI)) ?? reference.doi;
  const title = titleList[0] ?? reference.title;
  return {
    reference_id: reference.id,
    provider: 'crossref',
    provider_id: 'crossref',
    lookup_status: 'found',
    status: 'matched',
    match_basis: reference.doi ? 'doi' : 'title',
    matched_identifiers: compactIdentifiers({ doi, pmid: reference.pmid }),
    metadata: compactMetadata({
      title,
      year: crossrefYear(item),
      journal: firstString(item['container-title']),
    }),
    retraction_or_update_flags: crossrefFlags(item),
    normalized: {
      doi,
      pmid: reference.pmid,
      title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttempts,
  };
}

async function verifyCrossmark(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (!reference.doi) {
    return deferredEvidence(reference, 'crossmark', 'crossmark provider receipt requirement needs a DOI');
  }
  const evidence = await verifyCrossref(reference, maxRetries, timeout);
  return {
    ...evidence,
    provider: 'crossmark',
    provider_id: 'crossmark',
    retraction_or_update_flags: {
      ...evidence.retraction_or_update_flags,
      crossmark_metadata_source: 'crossref_rest_api',
    },
  };
}

function pubmedUrl(endpoint: 'esearch.fcgi' | 'esummary.fcgi', params: Record<string, string>) {
  const baseUrl = apiBase('OPL_CONNECT_PUBMED_API_BASE', DEFAULT_PUBMED_API_BASE);
  const url = new URL(`${baseUrl}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function verifyPubMed(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  let pmid = reference.pmid;
  let matchBasis: ProviderEvidence['match_basis'] = pmid ? 'pmid' : 'none';
  let retryAttempts: RetryAttempt[] = [];
  if (!pmid && (reference.doi || reference.title)) {
    matchBasis = reference.doi ? 'doi' : 'title';
    const searchUrl = pubmedUrl('esearch.fcgi', {
      db: 'pubmed',
      term: reference.doi ? `${reference.doi}[doi]` : reference.title!,
      retmode: 'json',
      retmax: '1',
    });
    const search = await fetchJsonWithRetry(searchUrl, maxRetries, 'pubmed', timeout);
    retryAttempts = retryAttempts.concat(search.retryAttempts);
    const idList = asRecord(asRecord(search.json).esearchresult).idlist;
    pmid = Array.isArray(idList) ? idList.map(asString).find(Boolean) ?? null : null;
  }
  if (!pmid) {
    return deferredEvidence(reference, 'pubmed', 'pubmed provider receipt requirement needs a PMID, DOI, or searchable title');
  }
  const summaryUrl = pubmedUrl('esummary.fcgi', {
    db: 'pubmed',
    id: pmid,
    retmode: 'json',
  });
  const summary = await fetchJsonWithRetry(summaryUrl, maxRetries, 'pubmed', timeout);
  retryAttempts = retryAttempts.concat(summary.retryAttempts);
  const result = asRecord(asRecord(summary.json).result);
  const item = asRecord(result[pmid]);
  const articleIds = Array.isArray(item.articleids) ? item.articleids.map(asRecord) : [];
  const doi = normalizeDoi(articleIds
    .map((entry) => ({ idtype: asString(entry.idtype)?.toLowerCase(), value: asString(entry.value) }))
    .find((entry) => entry.idtype === 'doi')?.value ?? null) ?? reference.doi;
  return {
    reference_id: reference.id,
    provider: 'pubmed',
    provider_id: 'pubmed',
    lookup_status: 'found',
    status: 'matched',
    match_basis: matchBasis === 'none' ? 'pmid' : matchBasis,
    matched_identifiers: compactIdentifiers({ doi, pmid }),
    metadata: compactMetadata({
      title: asString(item.title) ?? reference.title,
      year: yearFromText(asString(item.pubdate) ?? asString(item.sortpubdate)),
      journal: asString(item.fulljournalname) ?? asString(item.source),
    }),
    retraction_or_update_flags: pubmedFlags(item),
    normalized: {
      doi,
      pmid,
      title: asString(item.title) ?? reference.title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttempts,
  };
}

async function verifyOpenAlex(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (!reference.doi && !reference.title) {
    return deferredEvidence(reference, 'openalex', 'openalex provider receipt requirement needs a DOI or title');
  }
  const baseUrl = apiBase('OPL_CONNECT_OPENALEX_API_BASE', DEFAULT_OPENALEX_API_BASE);
  const url = reference.doi
    ? new URL(`${baseUrl}/works/${encodeURIComponent(`https://doi.org/${reference.doi}`)}`)
    : new URL(`${baseUrl}/works`);
  if (!reference.doi && reference.title) {
    url.searchParams.set('search', reference.title);
    url.searchParams.set('per-page', '1');
  }
  const { json, retryAttempts } = await fetchJsonWithRetry(url, maxRetries, 'openalex', timeout);
  const root = asRecord(json);
  const item = Array.isArray(root.results) ? asRecord(root.results[0]) : root;
  if (!asString(item.id)) {
    return deferredEvidence(reference, 'openalex', 'openalex provider did not return a matching work item');
  }
  const ids = asRecord(item.ids);
  const primaryLocation = asRecord(item.primary_location);
  const source = asRecord(primaryLocation.source);
  const doi = normalizeDoi(asString(item.doi) ?? asString(ids.doi)) ?? reference.doi;
  const pmid = pubmedIdFromUrl(asString(ids.pmid)) ?? reference.pmid;
  const title = asString(item.title) ?? asString(item.display_name) ?? reference.title;
  return {
    reference_id: reference.id,
    provider: 'openalex',
    provider_id: 'openalex',
    lookup_status: 'found',
    status: 'matched',
    match_basis: reference.doi ? 'doi' : 'title',
    matched_identifiers: compactIdentifiers({ doi, pmid, openalex: asString(item.id) }),
    metadata: compactMetadata({
      title,
      year: asString(item.publication_year),
      journal: asString(source.display_name),
    }),
    retraction_or_update_flags: item.is_retracted === true ? { retracted: true } : {},
    normalized: {
      doi,
      pmid,
      title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttempts,
  };
}

async function verifySemanticScholar(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (!reference.doi && !reference.title) {
    return deferredEvidence(reference, 'semantic-scholar', 'semantic-scholar provider receipt requirement needs a DOI or title');
  }
  const baseUrl = apiBase('OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE', DEFAULT_SEMANTIC_SCHOLAR_API_BASE);
  const fields = 'paperId,externalIds,title,year,venue,publicationVenue';
  const url = reference.doi
    ? new URL(`${baseUrl}/paper/${encodeURIComponent(`DOI:${reference.doi}`)}`)
    : new URL(`${baseUrl}/paper/search`);
  url.searchParams.set('fields', fields);
  if (!reference.doi && reference.title) {
    url.searchParams.set('query', reference.title);
    url.searchParams.set('limit', '1');
  }
  const { json, retryAttempts } = await fetchJsonWithRetry(url, maxRetries, 'semantic-scholar', timeout);
  const root = asRecord(json);
  const item = Array.isArray(root.data) ? asRecord(root.data[0]) : root;
  if (!asString(item.paperId)) {
    return deferredEvidence(reference, 'semantic-scholar', 'semantic-scholar provider did not return a matching paper item');
  }
  const externalIds = asRecord(item.externalIds);
  const venue = asRecord(item.publicationVenue);
  const doi = normalizeDoi(asString(externalIds.DOI) ?? asString(externalIds.doi)) ?? reference.doi;
  const pmid = asString(externalIds.PubMed) ?? asString(externalIds.PMID) ?? reference.pmid;
  const title = asString(item.title) ?? reference.title;
  return {
    reference_id: reference.id,
    provider: 'semantic_scholar',
    provider_id: 'semantic-scholar',
    lookup_status: 'found',
    status: 'matched',
    match_basis: reference.doi ? 'doi' : 'title',
    matched_identifiers: compactIdentifiers({ doi, pmid, semantic_scholar: asString(item.paperId) }),
    metadata: compactMetadata({
      title,
      year: asString(item.year),
      journal: asString(venue.name) ?? asString(item.venue),
    }),
    retraction_or_update_flags: {},
    normalized: {
      doi,
      pmid,
      title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttempts,
  };
}

async function verifyPublisher(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (!reference.doi) {
    return deferredEvidence(reference, 'publisher', 'publisher provider receipt requirement needs a DOI for DOI resolver landing lookup');
  }
  const baseUrl = apiBase('OPL_CONNECT_PUBLISHER_DOI_BASE', DEFAULT_PUBLISHER_DOI_BASE);
  const url = new URL(`${baseUrl}/${encodeURIComponent(reference.doi)}`);
  const { text, responseUrl, contentType, retryAttempts } = await fetchTextWithRetry(url, maxRetries, 'publisher', timeout, {
    headers: {
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
    },
  });
  const title = htmlMeta(text, 'citation_title', 'dc.title', 'og:title') ?? htmlTitle(text) ?? reference.title;
  return {
    reference_id: reference.id,
    provider: 'publisher',
    provider_id: 'publisher',
    lookup_status: 'found',
    status: 'matched',
    match_basis: 'doi',
    matched_identifiers: compactIdentifiers({
      doi: reference.doi,
      pmid: reference.pmid,
      publisher_landing_url: responseUrl,
    }),
    metadata: compactMetadata({
      title,
      year: yearFromText(htmlMeta(text, 'citation_publication_date', 'dc.date') ?? ''),
      journal: htmlMeta(text, 'citation_journal_title', 'citation_publisher'),
    }),
    retraction_or_update_flags: {
      publisher_landing_resolved: true,
      publisher_lookup_source: 'doi_resolver_landing_page',
      full_text_body_verified: false,
      ...(contentType ? { content_type: contentType } : {}),
    },
    normalized: {
      doi: reference.doi,
      pmid: reference.pmid,
      title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttempts,
  };
}

async function verifyProvider(reference: ReferenceRecord, providerId: ProviderId, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (providerId === 'crossref') return verifyCrossref(reference, maxRetries, timeout);
  if (providerId === 'pubmed') return verifyPubMed(reference, maxRetries, timeout);
  if (providerId === 'openalex') return verifyOpenAlex(reference, maxRetries, timeout);
  if (providerId === 'semantic-scholar') return verifySemanticScholar(reference, maxRetries, timeout);
  if (providerId === 'crossmark') return verifyCrossmark(reference, maxRetries, timeout);
  return verifyPublisher(reference, maxRetries, timeout);
}

function withReceiptRef(evidence: ProviderEvidenceDraft): ProviderEvidence {
  return {
    ...evidence,
    receipt_ref: receiptRef(evidence),
  };
}

async function verifyProviderWithCache(
  reference: ReferenceRecord,
  providerId: ProviderId,
  input: ReferenceVerificationInput,
): Promise<ProviderEvidence> {
  const cachePath = cacheRef(input.cacheRoot, providerId, reference);
  const cached = readCache(cachePath);
  if (cached) {
    const cachedEvidence = cached as Omit<ProviderEvidence, 'cache' | 'retry_attempts'>;
    return {
      ...cachedEvidence,
      receipt_ref: cachedEvidence.receipt_ref ?? receiptRef(cachedEvidence),
      cache: {
        status: 'hit',
        write_status: 'skipped',
        cache_ref: cachePath,
      },
      retry_attempts: [],
    };
  }
  const evidence = withReceiptRef(await verifyProvider(reference, providerId, input.maxRetries, timeoutMs(input.timeoutMs)));
  const writeStatus = evidence.status === 'matched'
    ? writeCache(cachePath, {
        ...evidence,
        cache: undefined,
        retry_attempts: undefined,
      })
    : 'skipped';
  return {
    ...evidence,
    cache: {
      status: cachePath ? 'miss' : 'disabled',
      write_status: writeStatus,
      cache_ref: cachePath,
    },
  };
}

function receiptRef(evidence: { reference_id: string; provider_id: string; normalized?: unknown }) {
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    reference_id: evidence.reference_id,
    provider_id: evidence.provider_id,
    normalized: evidence.normalized,
  })).digest('hex');
  return `opl://connect/references/verify/${digest}`;
}

function providerName(providerId: ProviderId): ProviderEvidence['provider'] {
  return providerId === 'semantic-scholar' ? 'semantic_scholar' : providerId;
}

function identifiersFromReference(reference: ReferenceRecord): Record<string, string> {
  return compactIdentifiers({ doi: reference.doi, pmid: reference.pmid });
}

function metadataFromReference(reference: ReferenceRecord): ProviderEvidence['metadata'] {
  return compactMetadata({ title: reference.title });
}

function compactIdentifiers(input: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
}

function compactMetadata(input: { title?: string | null; year?: string | null; journal?: string | null }): ProviderEvidence['metadata'] {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
}

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(asString).find(Boolean) ?? null;
  return asString(value);
}

function crossrefYear(item: Record<string, unknown>): string | null {
  for (const key of ['published-print', 'published-online', 'published', 'created', 'deposited']) {
    const payload = asRecord(item[key]);
    const dateParts = payload['date-parts'];
    if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) continue;
    const year = asString(dateParts[0][0]);
    if (year) return yearFromText(year);
  }
  return null;
}

function yearFromText(value: string | null): string | null {
  return value?.match(/\d{4}/)?.[0] ?? null;
}

function crossrefFlags(item: Record<string, unknown>): Record<string, unknown> {
  const relation = asRecord(item.relation);
  const flags: Record<string, unknown> = {};
  if (relation['is-retracted-by'] || relation['is-withdrawn-by']) flags.retracted = true;
  if (relation['is-corrected-by'] || relation['has-update']) flags.has_update = true;
  if (Array.isArray(item['update-to']) && item['update-to'].length > 0) flags.has_update = true;
  if (asString(item['update-policy'])) flags.crossmark_update_policy = true;
  return flags;
}

function pubmedFlags(item: Record<string, unknown>): Record<string, unknown> {
  const publicationTypes = Array.isArray(item.pubtype)
    ? item.pubtype.map((entry) => String(entry).toLowerCase()).join(' ')
    : '';
  if (publicationTypes.includes('retracted publication')) return { retracted: true };
  if (publicationTypes.includes('published erratum') || publicationTypes.includes('corrected and republished article')) {
    return { correction: true };
  }
  return {};
}

function pubmedIdFromUrl(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//, '').replace(/\/$/, '') || null;
}

function htmlMeta(html: string, ...names: string[]): string | null {
  const wanted = new Set(names.map((entry) => entry.toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (htmlAttribute(tag, 'name') ?? htmlAttribute(tag, 'property'))?.toLowerCase();
    const content = htmlAttribute(tag, 'content');
    if (key && content && wanted.has(key)) return decodeHtmlText(content);
  }
  return null;
}

function htmlAttribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i'));
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, '').trim() || null;
}

function htmlTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlText(match[1]).replace(/\s+/g, ' ').trim() || null : null;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function noAuthorityBoundary() {
  return {
    read_only: true,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_reference_truth: false,
  };
}

export async function runOplConnectReferenceVerification(input: ReferenceVerificationInput) {
  const references = loadReferences(input.referencesFile);
  const providers = normalizeProviders(input.providers);
  const providerEvidence: ProviderEvidence[] = [];
  for (const reference of references) {
    for (const providerId of providers) {
      providerEvidence.push(await verifyProviderWithCache(reference, providerId, input));
    }
  }
  const retryAttempts = providerEvidence.flatMap((entry) =>
    entry.retry_attempts.map((attempt) => ({
      provider_id: entry.provider_id,
      reference_id: entry.reference_id,
      operation: 'provider_request',
      ...attempt,
    }))
  );
  const providerReceipts = providerEvidence
    .filter((entry) => entry.status === 'matched')
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      status: entry.status,
      receipt_ref: entry.receipt_ref,
      authority: 'provider_receipt_candidate_only',
    }));
  const deferredProviderReceiptRequirements = providerEvidence
    .filter((entry) => entry.status === 'deferred')
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      status: 'deferred',
      reason: entry.deferred_reason,
    }));

  return {
    version: 'g2',
    opl_connect_reference_verification: {
      surface_kind: 'opl_connect_reference_verification_readonly',
      connector_id: 'reference_verification',
      connector_family: 'OPL Connect',
      status: 'completed',
      request: {
        references_file: path.resolve(input.referencesFile),
        reference_count: references.length,
        providers,
        cache_root: input.cacheRoot ? path.resolve(input.cacheRoot) : null,
        max_retries: input.maxRetries,
      },
      provider_evidence: providerEvidence,
      provider_receipts: providerReceipts,
      deferred_provider_receipt_requirements: deferredProviderReceiptRequirements,
      cache: {
        enabled: Boolean(input.cacheRoot),
        root: input.cacheRoot ? path.resolve(input.cacheRoot) : null,
        entries: providerEvidence.map((entry) => entry.cache),
      },
      retry_attempts: retryAttempts,
      no_authority_boundary: noAuthorityBoundary(),
    },
  };
}
