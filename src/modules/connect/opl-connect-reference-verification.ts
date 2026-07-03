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

type ProviderId = 'crossref' | 'pubmed' | 'openalex' | 'semantic-scholar';
type RetryAttempt = { attempt: number; status: string; http_status: number | null };
type ProviderEvidence = {
  reference_id: string;
  provider_id: ProviderId;
  status: 'matched' | 'deferred';
  deferred_reason?: string;
  match_basis: 'doi' | 'pmid' | 'title' | 'none';
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

const DEFAULT_CROSSREF_API_BASE = 'https://api.crossref.org';
const DEFAULT_PUBMED_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
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
  const unique = [...new Set(entries.length > 0 ? entries : ['crossref', 'pubmed'])];
  const allowed = new Set(['crossref', 'pubmed', 'openalex', 'semantic-scholar']);
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

async function fetchJsonWithRetry(url: URL, maxRetries: number, providerId: ProviderId, timeout: number) {
  const retryAttempts: RetryAttempt[] = [];
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
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
      return {
        json: await response.json() as unknown,
        retryAttempts,
      };
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

function deferredEvidence(reference: ReferenceRecord, providerId: ProviderId, reason: string): ProviderEvidence {
  return {
    reference_id: reference.id,
    provider_id: providerId,
    status: 'deferred',
    deferred_reason: reason,
    match_basis: 'none',
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

async function verifyCrossref(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidence> {
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
  return {
    reference_id: reference.id,
    provider_id: 'crossref',
    status: 'matched',
    match_basis: reference.doi ? 'doi' : 'title',
    normalized: {
      doi: normalizeDoi(asString(item.DOI)) ?? reference.doi,
      pmid: reference.pmid,
      title: titleList[0] ?? reference.title,
    },
    cache: {
      status: 'disabled',
      write_status: 'skipped',
      cache_ref: null,
    },
    retry_attempts: retryAttempts,
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

async function verifyPubMed(reference: ReferenceRecord, maxRetries: number, timeout: number): Promise<ProviderEvidence> {
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
    provider_id: 'pubmed',
    status: 'matched',
    match_basis: matchBasis === 'none' ? 'pmid' : matchBasis,
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

async function verifyProvider(reference: ReferenceRecord, providerId: ProviderId, maxRetries: number, timeout: number): Promise<ProviderEvidence> {
  if (providerId === 'crossref') return verifyCrossref(reference, maxRetries, timeout);
  if (providerId === 'pubmed') return verifyPubMed(reference, maxRetries, timeout);
  return deferredEvidence(reference, providerId, `${providerId} provider receipt requirement is not implemented in the local connector yet`);
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
      cache: {
        status: 'hit',
        write_status: 'skipped',
        cache_ref: cachePath,
      },
      retry_attempts: [],
    };
  }
  const evidence = await verifyProvider(reference, providerId, input.maxRetries, timeoutMs(input.timeoutMs));
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
      ...attempt,
    }))
  );
  const providerReceipts = providerEvidence
    .filter((entry) => entry.status === 'matched')
    .map((entry) => ({
      reference_id: entry.reference_id,
      provider_id: entry.provider_id,
      receipt_ref: receiptRef(entry),
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
