import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../kernel/json-file.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';

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

type ProviderId = 'crossref' | 'openalex' | 'semantic-scholar' | 'crossmark' | 'publisher';
type RetryAttempt = { attempt: number; status: string; http_status: number | null };
type ProviderMatchStatus = 'identifier_matched' | 'metadata_conflict' | 'provider_found' | 'deferred' | 'error';
type MismatchDetail = {
  field: 'doi' | 'pmid' | 'title';
  expected: string;
  actual: string;
  normalized_expected: string;
  normalized_actual: string;
};
type ProviderEvidence = {
  reference_id: string;
  provider: 'crossref' | 'openalex' | 'semantic_scholar' | 'crossmark' | 'publisher';
  provider_id: ProviderId;
  lookup_status: 'found' | 'not_found' | 'deferred' | 'error';
  status: 'matched' | 'deferred';
  match_schema_version: 'strict_provider_match_v1';
  match_status: ProviderMatchStatus;
  deferred_reason?: string;
  match_basis: 'doi' | 'pmid' | 'title' | 'none';
  receipt_ref: string;
  matched_identifiers: Record<string, string>;
  provider_identifiers: Record<string, string>;
  mismatch_details: MismatchDetail[];
  metadata: {
    title?: string;
    year?: string;
    journal?: string;
  };
  retraction_or_update_flags: Record<string, unknown>;
  verification_scope: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
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
type ProviderEvidenceError = NonNullable<ProviderEvidence['error']>;
type ProviderEvidenceDraft = Omit<ProviderEvidence, 'receipt_ref'>;

const DEFAULT_CROSSREF_API_BASE = 'https://api.crossref.org';
const DEFAULT_OPENALEX_API_BASE = 'https://api.openalex.org';
const DEFAULT_SEMANTIC_SCHOLAR_API_BASE = 'https://api.semanticscholar.org/graph/v1';
const DEFAULT_PUBLISHER_DOI_BASE = 'https://doi.org';
const DEFAULT_TIMEOUT_MS = 30_000;
const STRICT_MATCH_SCHEMA_VERSION = 'strict_provider_match_v1';

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
  const unique = [...new Set(entries.length > 0 ? entries : ['crossref', 'openalex', 'semantic-scholar', 'crossmark', 'publisher'])]
    .map((entry) => entry === 'semantic_scholar' ? 'semantic-scholar' : entry);
  const allowed = new Set(['crossref', 'openalex', 'semantic-scholar', 'crossmark', 'publisher']);
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
  const pmid = asString(record.pmid);
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
          retry_attempts: retryAttempts,
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
    match_schema_version: STRICT_MATCH_SCHEMA_VERSION,
    match_status: 'deferred',
    deferred_reason: reason,
    match_basis: 'none',
    matched_identifiers: identifiersFromReference(reference),
    provider_identifiers: {},
    mismatch_details: [],
    metadata: metadataFromReference(reference),
    retraction_or_update_flags: {},
    verification_scope: verificationScope(providerId),
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

function providerErrorEvidence(reference: ReferenceRecord, providerId: ProviderId, error: unknown): ProviderEvidenceDraft {
  const payload = providerErrorPayload(error);
  return {
    reference_id: reference.id,
    provider: providerName(providerId),
    provider_id: providerId,
    lookup_status: 'error',
    status: 'deferred',
    match_schema_version: STRICT_MATCH_SCHEMA_VERSION,
    match_status: 'error',
    deferred_reason: payload.message,
    match_basis: 'none',
    matched_identifiers: identifiersFromReference(reference),
    provider_identifiers: {},
    mismatch_details: [],
    metadata: metadataFromReference(reference),
    retraction_or_update_flags: {},
    verification_scope: verificationScope(providerId),
    error: payload,
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
    retry_attempts: retryAttemptsFromError(error),
  };
}

function providerErrorPayload(error: unknown): ProviderEvidenceError {
  if (error instanceof FrameworkContractError) {
    return {
      code: typeof error.details?.status === 'number' ? 'provider_non_ok_status' : 'provider_request_failed',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    code: 'provider_request_failed',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error ? { details: { error_name: error.name } } : {}),
  };
}

function retryAttemptsFromError(error: unknown): RetryAttempt[] {
  const attempts = error instanceof FrameworkContractError ? error.details?.retry_attempts : null;
  return Array.isArray(attempts) ? attempts as RetryAttempt[] : [];
}

function foundEvidence(
  reference: ReferenceRecord,
  input: {
    provider: ProviderEvidence['provider'];
    provider_id: ProviderId;
    match_basis: ProviderEvidence['match_basis'];
    provider_identifiers: Record<string, string | null | undefined>;
    metadata: ProviderEvidence['metadata'];
    retraction_or_update_flags: Record<string, unknown>;
    normalized: Pick<ReferenceRecord, 'doi' | 'pmid' | 'title'>;
    retry_attempts: RetryAttempt[];
    verification_scope?: Record<string, unknown>;
  },
): ProviderEvidenceDraft {
  const providerIdentifiers = compactIdentifiers(input.provider_identifiers);
  const mismatchDetails = mismatchDetailsForReference(reference, input.normalized);
  const matchedIdentifiers = matchedIdentifiersForReference(reference, input.normalized);
  const hasIdentifierMatch = Object.keys(matchedIdentifiers).length > 0;
  const matchStatus: ProviderMatchStatus = mismatchDetails.length > 0
    ? 'metadata_conflict'
    : hasIdentifierMatch
      ? 'identifier_matched'
      : 'provider_found';
  const status = matchStatus === 'identifier_matched' ? 'matched' : 'deferred';
  const providerSpecificIdentifiers = Object.fromEntries(
    Object.entries(providerIdentifiers).filter(([key]) => key !== 'doi' && key !== 'pmid'),
  );
  const deferredReason = matchStatus === 'metadata_conflict'
    ? `${input.provider_id} provider metadata conflicts with input reference`
    : `${input.provider_id} provider returned an item but no DOI/PMID identifier matched the input reference`;
  return {
    reference_id: reference.id,
    provider: input.provider,
    provider_id: input.provider_id,
    lookup_status: 'found',
    status,
    match_schema_version: STRICT_MATCH_SCHEMA_VERSION,
    match_status: matchStatus,
    ...(status === 'deferred' ? { deferred_reason: deferredReason } : {}),
    match_basis: input.match_basis,
    matched_identifiers: status === 'matched'
      ? compactIdentifiers({ ...matchedIdentifiers, ...providerSpecificIdentifiers })
      : matchedIdentifiers,
    provider_identifiers: providerIdentifiers,
    mismatch_details: mismatchDetails,
    metadata: input.metadata,
    retraction_or_update_flags: input.retraction_or_update_flags,
    verification_scope: {
      ...verificationScope(input.provider_id),
      ...(input.verification_scope ?? {}),
    },
    ...(status === 'deferred' ? {
      error: {
        code: matchStatus === 'metadata_conflict' ? 'provider_metadata_conflict' : 'provider_found_without_identifier_match',
        message: deferredReason,
        details: {
          match_status: matchStatus,
          mismatch_details: mismatchDetails,
          provider_identifiers: providerIdentifiers,
        },
      },
    } : {}),
    normalized: input.normalized,
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: input.retry_attempts,
  };
}

function mismatchDetailsForReference(
  reference: ReferenceRecord,
  actual: Pick<ReferenceRecord, 'doi' | 'pmid' | 'title'>,
): MismatchDetail[] {
  const details: MismatchDetail[] = [];
  addMismatch(details, 'doi', reference.doi, actual.doi, normalizeDoi);
  addMismatch(details, 'pmid', reference.pmid, actual.pmid, normalizePmid);
  addMismatch(details, 'title', reference.title, actual.title, normalizeTitleForCompare);
  return details;
}

function addMismatch(
  details: MismatchDetail[],
  field: MismatchDetail['field'],
  expected: string | null,
  actual: string | null,
  normalize: (value: string | null) => string | null,
) {
  const normalizedExpected = normalize(expected);
  const normalizedActual = normalize(actual);
  if (!expected || !actual || !normalizedExpected || !normalizedActual || normalizedExpected === normalizedActual) return;
  details.push({
    field,
    expected,
    actual,
    normalized_expected: normalizedExpected,
    normalized_actual: normalizedActual,
  });
}

function matchedIdentifiersForReference(
  reference: ReferenceRecord,
  actual: Pick<ReferenceRecord, 'doi' | 'pmid'>,
) {
  return compactIdentifiers({
    doi: reference.doi && actual.doi && normalizeDoi(reference.doi) === normalizeDoi(actual.doi) ? normalizeDoi(actual.doi) : null,
    pmid: reference.pmid && actual.pmid && normalizePmid(reference.pmid) === normalizePmid(actual.pmid) ? normalizePmid(actual.pmid) : null,
  });
}

function normalizePmid(value: string | null) {
  return value?.trim() || null;
}

function normalizeTitleForCompare(value: string | null) {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() || null;
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
  const doi = normalizeDoi(asString(item.DOI));
  const title = titleList[0] ?? null;
  return foundEvidence(reference, {
    provider: 'crossref',
    provider_id: 'crossref',
    match_basis: reference.doi ? 'doi' : 'title',
    provider_identifiers: { doi },
    metadata: compactMetadata({
      title,
      year: crossrefYear(item),
      journal: firstString(item['container-title']),
    }),
    retraction_or_update_flags: crossrefFlags(item),
    normalized: {
      doi,
      pmid: null,
      title,
    },
    retry_attempts: retryAttempts,
  });
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
    verification_scope: verificationScope('crossmark'),
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
  const doi = normalizeDoi(asString(item.doi) ?? asString(ids.doi));
  const pmid = asString(ids.pmid)
    ?.replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '')
    .replace(/\/$/, '') || null;
  const title = asString(item.title) ?? asString(item.display_name);
  return foundEvidence(reference, {
    provider: 'openalex',
    provider_id: 'openalex',
    match_basis: reference.doi ? 'doi' : 'title',
    provider_identifiers: { doi, pmid, openalex: asString(item.id) },
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
    retry_attempts: retryAttempts,
  });
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
  const doi = normalizeDoi(asString(externalIds.DOI) ?? asString(externalIds.doi));
  const pmid = asString(externalIds.PMID) ?? asString(externalIds.PubMed);
  const title = asString(item.title);
  return foundEvidence(reference, {
    provider: 'semantic_scholar',
    provider_id: 'semantic-scholar',
    match_basis: reference.doi ? 'doi' : 'title',
    provider_identifiers: { doi, pmid, semantic_scholar: asString(item.paperId) },
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
    retry_attempts: retryAttempts,
  });
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
  return foundEvidence(reference, {
    provider: 'publisher',
    provider_id: 'publisher',
    match_basis: 'doi',
    provider_identifiers: {
      doi: reference.doi,
      publisher_landing_url: responseUrl,
    },
    metadata: compactMetadata({
      title,
      year: yearFromText(htmlMeta(text, 'citation_publication_date', 'dc.date') ?? ''),
      journal: htmlMeta(text, 'citation_journal_title', 'citation_publisher'),
    }),
    retraction_or_update_flags: {
      publisher_landing_resolved: true,
      publisher_lookup_source: 'doi_resolver_landing_metadata',
      full_text_body_verified: false,
      ...(contentType ? { content_type: contentType } : {}),
    },
    verification_scope: {
      evidence_source: 'doi_resolver_landing_metadata',
      landing_metadata_only: true,
      full_text_body_verified: false,
    },
    normalized: {
      doi: reference.doi,
      pmid: null,
      title,
    },
    retry_attempts: retryAttempts,
  });
}

async function verifyProvider(reference: ReferenceRecord, providerId: ProviderId, maxRetries: number, timeout: number): Promise<ProviderEvidenceDraft> {
  if (providerId === 'crossref') return verifyCrossref(reference, maxRetries, timeout);
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
  if (cached && cached.match_schema_version === STRICT_MATCH_SCHEMA_VERSION) {
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
  const evidence = withReceiptRef(await verifyProvider(reference, providerId, input.maxRetries, timeoutMs(input.timeoutMs)).catch((error) =>
    providerErrorEvidence(reference, providerId, error)
  ));
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

function verificationScope(providerId: ProviderId): Record<string, unknown> {
  if (providerId === 'crossmark') {
    return {
      evidence_source: 'crossref_metadata_signal',
      independent_crossmark_api_verified: false,
    };
  }
  if (providerId === 'publisher') {
    return {
      evidence_source: 'doi_resolver_landing_metadata',
      landing_metadata_only: true,
      full_text_body_verified: false,
    };
  }
  return { evidence_source: providerName(providerId) };
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
    can_claim_citation_quality: false,
    can_claim_claim_support: false,
    can_claim_citation_truth: false,
    can_claim_publication_readiness: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
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
    .filter((entry) => entry.status === 'matched' && entry.match_status === 'identifier_matched' && entry.mismatch_details.length === 0)
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      status: entry.status,
      match_status: entry.match_status,
      match_basis: entry.match_basis,
      receipt_ref: entry.receipt_ref,
      receipt_scope: 'metadata_provider_receipt_only',
      authority: 'provider_receipt_candidate_only',
      verification_scope: entry.verification_scope,
    }));
  const deferredProviderReceiptRequirements = providerEvidence
    .filter((entry) => entry.status === 'deferred')
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      status: 'deferred',
      match_status: entry.match_status,
      reason: entry.deferred_reason,
      mismatch_details: entry.mismatch_details,
    }));

  return {
    version: 'g2',
    opl_connect_reference_verification: {
      surface_kind: 'opl_connect_reference_verification_readonly',
      connector_id: 'reference_verification',
      verification_role: 'metadata_provider_receipt_only',
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
