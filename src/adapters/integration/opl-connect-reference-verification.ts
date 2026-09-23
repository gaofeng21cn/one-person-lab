import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../kernel/json-file.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { validateJsonSchemaPayload } from '../../kernel/schema-registry.ts';
import {
  maxResponseBodyBytes,
  readResponseBody,
  ResponseBodyTooLargeError,
} from './http-response-body.ts';
import {
  loadInstalledPackageRuntimeModule,
  resolveInstalledPackageRuntimeModule,
  type InstalledPackageRuntimeDiscoveryOptions,
  type InstalledPackageRuntimeModuleContext,
  type LoadedInstalledPackageRuntimeModule,
} from './agent-package-registry-parts/installed-runtime-module.ts';

export type ReferenceVerificationInput = {
  referencesFile?: string;
  references?: unknown[];
  providers: string[];
  cacheRoot?: string;
  maxRetries: number;
  timeoutMs?: number;
  installedPackage?: InstalledPackageRuntimeDiscoveryOptions;
};

export type ReferenceVerificationProviderId = string;

type ReferenceRecord = {
  id: string;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  title: string | null;
};

type ProviderId = ReferenceVerificationProviderId;
type RetryAttempt = { attempt: number; status: string; http_status: number | null };
type ProviderMatchStatus = 'identifier_matched' | 'metadata_conflict' | 'provider_found' | 'deferred' | 'error';
type MismatchDetail = {
  field: 'doi' | 'pmid' | 'pmcid' | 'title';
  expected: string;
  actual: string;
  normalized_expected: string;
  normalized_actual: string;
};
type ReferenceMatchAssessment = {
  match_status: 'identifier_matched' | 'metadata_conflict' | 'provider_found';
  matched_identifiers: Record<string, string>;
  mismatch_details: MismatchDetail[];
  deferred_reason?: string;
  deferred_code?: 'provider_metadata_conflict' | 'provider_found_without_identifier_match';
};
type ProviderEvidence = {
  reference_id: string;
  provider: string;
  provider_id: ProviderId;
  lookup_status: 'found' | 'not_found' | 'deferred' | 'error';
  status: 'matched' | 'deferred';
  match_schema_version: 'strict_provider_match_v1';
  match_status: ProviderMatchStatus;
  deferred_reason?: string;
  match_basis: 'doi' | 'pmid' | 'pmcid' | 'title' | 'none';
  receipt_ref: string;
  matched_identifiers: Record<string, string>;
  provider_identifiers: Record<string, string>;
  mismatch_details: MismatchDetail[];
  metadata: {
    title?: string;
    year?: string;
    journal?: string;
    authors?: string[];
    abstract?: string;
    article_types?: string[];
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
    pmcid: string | null;
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

const DEFAULT_TIMEOUT_MS = 30_000;
const STRICT_MATCH_SCHEMA_VERSION = 'strict_provider_match_v1';

type ReferenceProviderDefinition = {
  provider_id: ProviderId;
  adapter_id: string;
  receipt_provider_name: ProviderEvidence['provider'];
  aliases: string[];
  endpoint: {
    default_base_url: string;
    base_url?: string;
    allowed_origins: string[];
  };
  verification_scope: Record<string, unknown>;
};

type ReferenceProviderAdapterHandler = (request: unknown) => unknown;

const REFERENCE_PROVIDER_MODULE_KIND = 'opl_connect_reference_provider_adapter';
const REFERENCE_PROVIDER_PACKAGE_ID = 'mas-scholar-skills';
const REFERENCE_PROVIDER_ADAPTER_ABI = 'opl-connect-reference-provider-adapter.v1';
const MAX_REDIRECT_HOPS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableString(value: unknown): string | null {
  return asString(value);
}

function normalizeDoi(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .trim()
    .toLowerCase() || null;
}

function normalizePmcid(value: string | null) {
  const normalized = value?.trim().toUpperCase() || null;
  if (!normalized) return null;
  return normalized.startsWith('PMC') ? normalized : `PMC${normalized}`;
}

function resolveReferenceRuntime(options: InstalledPackageRuntimeDiscoveryOptions = {}) {
  return resolveInstalledPackageRuntimeModule({
    packageId: REFERENCE_PROVIDER_PACKAGE_ID,
    moduleKind: REFERENCE_PROVIDER_MODULE_KIND,
    adapterAbi: REFERENCE_PROVIDER_ADAPTER_ABI,
    ...options,
  });
}

function configuredEndpoint(providerId: ProviderId, rawEndpoint: unknown): ReferenceProviderDefinition['endpoint'] {
  const endpoint = asRecord(rawEndpoint);
  const defaultBaseUrl = asString(endpoint.default_base_url);
  const rawAllowedOrigins = Array.isArray(endpoint.allowed_origins) ? endpoint.allowed_origins : [];
  const allowedOrigins: string[] = [];
  try {
    for (const rawOrigin of rawAllowedOrigins) {
      const origin = stableString(rawOrigin);
      if (!origin) throw new Error('allowed origin must be a non-empty string');
      const parsed = new URL(origin);
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
        throw new Error('allowed origin must be an absolute HTTP origin');
      }
      allowedOrigins.push(parsed.origin);
    }
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills reference provider profile declares invalid allowed origins.',
      {
        provider_id: providerId,
        reason_code: 'reference_provider_endpoint_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!defaultBaseUrl || allowedOrigins.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills reference provider profile declares an invalid endpoint.',
      { provider_id: providerId, reason_code: 'reference_provider_endpoint_invalid' },
    );
  }
  let defaultOrigin: string;
  try {
    const parsed = new URL(defaultBaseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('default base URL must use HTTP or HTTPS');
    defaultOrigin = parsed.origin;
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills reference provider profile declares an invalid default endpoint URL.',
      {
        provider_id: providerId,
        default_base_url: defaultBaseUrl,
        reason_code: 'reference_provider_endpoint_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!allowedOrigins.includes(defaultOrigin)) allowedOrigins.push(defaultOrigin);
  const environmentOverride = asString(endpoint.environment_override);
  if (environmentOverride && !/^OPL_CONNECT_[A-Z0-9_]+_BASE$/.test(environmentOverride)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider endpoint environment override is outside the allowed namespace.',
      {
        provider_id: providerId,
        environment_override: environmentOverride,
        reason_code: 'reference_provider_endpoint_environment_override_invalid',
      },
    );
  }
  const baseUrl = environmentOverride ? asString(process.env[environmentOverride]) : null;
  if (!baseUrl) {
    return { default_base_url: defaultBaseUrl, allowed_origins: allowedOrigins };
  }
  let overrideOrigin: string;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('base URL must use HTTP or HTTPS');
    overrideOrigin = parsed.origin;
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider endpoint override is not a valid absolute URL.',
      {
        provider_id: providerId,
        environment_override: environmentOverride,
        base_url: baseUrl,
        reason_code: 'reference_provider_endpoint_override_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  return {
    default_base_url: defaultBaseUrl,
    base_url: baseUrl.replace(/\/+$/, ''),
    allowed_origins: [...new Set([...allowedOrigins, overrideOrigin])],
  };
}

function referenceProviderRegistry(
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
): ReferenceProviderDefinition[] {
  const profile = runtime.readJson(runtime.binding.profile_ref);
  if (!Array.isArray(profile.providers) || profile.providers.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills reference provider profile must declare providers.',
      { profile_ref: runtime.binding.profile_ref, reason_code: 'reference_provider_profile_empty' },
    );
  }
  const providers = profile.providers.map((rawProvider) => {
    const entry = asRecord(rawProvider);
    const providerId = stableString(entry.provider_id);
    const adapterId = stableString(entry.adapter_id);
    const receiptProviderName = stableString(entry.receipt_provider_name);
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
      : [];
    if (!providerId || !adapterId || !receiptProviderName) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Scholar Skills reference provider profile declares an invalid provider entry.',
        {
          provider_id: providerId,
          adapter_id: adapterId,
          reason_code: 'reference_provider_profile_entry_invalid',
        },
      );
    }
    const profileSchema = runtime.readJson(runtime.binding.profile_schema_ref);
    const providerIdSchema = asRecord(
      asRecord(
        asRecord(asRecord(profileSchema.$defs).provider).properties,
      ).provider_id,
    );
    const providerIdValidation = validateJsonSchemaPayload({
      schemaId: `${runtime.binding.profile_schema_ref}#provider_id@${runtime.contentDigest}`,
      schema: providerIdSchema,
      sourceRef: runtime.binding.profile_schema_ref,
    }, providerId);
    if (Object.keys(providerIdSchema).length === 0 || !providerIdValidation.ok) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Scholar Skills reference provider profile declares an unsafe provider id.',
        {
          provider_id: providerId,
          profile_schema_ref: runtime.binding.profile_schema_ref,
          ...(!providerIdValidation.ok ? { schema_errors: providerIdValidation.errors } : {}),
          reason_code: 'reference_provider_profile_provider_id_invalid',
        },
      );
    }
    return {
      provider_id: providerId,
      adapter_id: adapterId,
      receipt_provider_name: receiptProviderName,
      aliases,
      endpoint: configuredEndpoint(providerId, entry.endpoint),
      verification_scope: asRecord(entry.verification_scope),
    };
  });
  const providerIds = providers.map((provider) => provider.provider_id);
  if (new Set(providerIds).size !== providerIds.length) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills reference provider profile declares duplicate provider ids.',
      { provider_ids: providerIds, reason_code: 'reference_provider_profile_duplicate_provider' },
    );
  }
  return providers;
}

function providerDefinition(
  providerId: ProviderId,
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
) {
  const provider = referenceProviderRegistry(runtime).find((entry) => entry.provider_id === providerId);
  if (!provider) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills reference provider profile does not export the requested provider.',
      { provider_id: providerId, reason_code: 'reference_provider_not_exported' },
    );
  }
  return provider;
}

export function referenceVerificationProviderIds(
  options: InstalledPackageRuntimeDiscoveryOptions = {},
): ReferenceVerificationProviderId[] {
  return referenceProviderRegistry(resolveReferenceRuntime(options)).map((provider) => provider.provider_id);
}

export function normalizeReferenceVerificationProviders(
  providers: string[],
  options: InstalledPackageRuntimeDiscoveryOptions = {},
  runtime?: InstalledPackageRuntimeModuleContext,
): ReferenceVerificationProviderId[] {
  const registry = referenceProviderRegistry(runtime ?? resolveReferenceRuntime(options));
  const aliases = new Map<string, ProviderId>(
    registry.flatMap((provider) => [
      [provider.provider_id, provider.provider_id] as const,
      ...provider.aliases.map((alias) => [alias.toLowerCase(), provider.provider_id] as const),
    ]),
  );
  const entries = providers.flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim().toLowerCase())
    .map((entry) => aliases.get(entry) ?? entry)
    .filter(Boolean);
  const defaults = registry.map((provider) => provider.provider_id);
  if (providers.length > 0 && entries.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference verification providers must contain at least one non-empty provider.',
      { supported: defaults },
    );
  }
  const unique = [...new Set(entries.length > 0 ? entries : defaults)];
  const allowed = new Set<string>(defaults);
  const unsupported = unique.filter((entry) => !allowed.has(entry));
  if (unsupported.length > 0) {
    throw new FrameworkContractError('codex_command_failed', 'Unsupported OPL Connect reference verification provider.', {
      unsupported,
      supported: defaults,
    });
  }
  return unique as ReferenceVerificationProviderId[];
}

function loadReferencesFile(filePath: string) {
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

function resolveReferences(input: ReferenceVerificationInput) {
  const hasFile = typeof input.referencesFile === 'string' && input.referencesFile.trim().length > 0;
  const hasInline = Array.isArray(input.references);
  if (hasFile === hasInline) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference verification requires exactly one references file or inline references array.',
      { input_modes: ['references_file', 'inline_references'] },
    );
  }
  if (hasInline) {
    return {
      references: input.references!.map((entry, index) => normalizeReference(entry, index)),
      sourceKind: 'inline_references' as const,
      referencesFile: null,
    };
  }
  const referencesFile = path.resolve(input.referencesFile!);
  return {
    references: loadReferencesFile(referencesFile),
    sourceKind: 'references_file' as const,
    referencesFile,
  };
}

function normalizeReference(value: unknown, index: number): ReferenceRecord {
  const record = asRecord(value);
  const doi = normalizeDoi(asString(record.doi) ?? asString(record.DOI));
  const pmid = asString(record.pmid) ?? asString(record.PMID) ?? asString(record.PubMed);
  const pmcid = normalizePmcid(
    asString(record.pmcid) ?? asString(record.PMCID) ?? asString(record.PMC),
  );
  const title = asString(record.title);
  const fallbackId = crypto.createHash('sha256').update(JSON.stringify({ doi, pmid, pmcid, title, index })).digest('hex').slice(0, 12);
  return {
    id: asString(record.id) ?? asString(record.reference_id) ?? fallbackId,
    doi,
    pmid,
    pmcid,
    title,
  };
}

function timeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) return input;
  return DEFAULT_TIMEOUT_MS;
}

function adapterContractFailure(error: unknown, context: Record<string, unknown>): never {
  const errorRecord = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {};
  const details = asRecord(errorRecord.details);
  throw new FrameworkContractError(
    'codex_command_failed',
    'OPL Connect reference provider adapter returned an invalid contract result.',
    {
      ...context,
      adapter_code: asString(errorRecord.code),
      adapter_details: details,
      cause: error instanceof Error ? error.message : String(error),
      reason_code: 'reference_provider_adapter_contract_error',
    },
  );
}

type ReferenceAdapterRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

type ReferenceAdapterHttpResponse = {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

async function fetchReferenceAdapterRequest(
  request: ReferenceAdapterRequest,
  provider: ReferenceProviderDefinition,
  input: ReferenceVerificationInput,
): Promise<{ response: ReferenceAdapterHttpResponse; retryAttempts: RetryAttempt[] }> {
  if (request.method !== 'GET' || typeof request.url !== 'string') {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider adapter returned an unsupported HTTP request.',
      { provider_id: provider.provider_id, method: request.method, url: request.url, reason_code: 'reference_provider_adapter_request_invalid' },
    );
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider adapter returned an invalid HTTP request URL.',
      {
        provider_id: provider.provider_id,
        url: request.url,
        reason_code: 'reference_provider_adapter_request_url_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!provider.endpoint.allowed_origins.includes(url.origin)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider adapter returned a URL outside the provider profile allowed origins.',
      {
        provider_id: provider.provider_id,
        url: url.toString(),
        origin: url.origin,
        allowed_origins: provider.endpoint.allowed_origins,
        reason_code: 'reference_provider_request_origin_not_allowed',
      },
    );
  }
  const { response, retryAttempts, cleanup } = await fetchWithRetry(
    url,
    input.maxRetries,
    provider.provider_id,
    timeoutMs(input.timeoutMs),
    provider.endpoint.allowed_origins,
    {
      method: request.method,
      ...(request.headers ? { headers: request.headers } : {}),
    },
  );
  try {
    const raw = await readResponseBody(response, maxResponseBodyBytes());
    const acceptsText = request.headers?.accept?.toLowerCase().includes('text/') === true;
    let body: unknown = raw;
    if (!acceptsText) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch (error) {
        throw new FrameworkContractError(
          'codex_command_failed',
          'Reference provider response was not valid JSON.',
          {
            provider_id: provider.provider_id,
            url: url.toString(),
            retry_attempts: retryAttempts,
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    return {
      response: {
        status: response.status,
        url: response.url || url.toString(),
        headers: Object.fromEntries(response.headers.entries()),
        body,
      },
      retryAttempts,
    };
  } catch (error) {
    if (error instanceof ResponseBodyTooLargeError) {
      throw new FrameworkContractError('codex_command_failed', 'Reference provider response body exceeded the configured limit.', {
        provider_id: provider.provider_id,
        url: url.toString(),
        reason_code: 'provider_response_too_large',
        response_body_limit_bytes: error.limitBytes,
        response_body_bytes: error.observedBytes,
        retry_attempts: retryAttempts,
      });
    }
    throw error;
  } finally {
    cleanup();
  }
}

function cacheRef(cacheRoot: string | undefined, providerId: ProviderId, reference: ReferenceRecord) {
  if (!cacheRoot) return null;
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    provider_id: providerId,
    reference_id: reference.id,
    doi: reference.doi,
    pmid: reference.pmid,
    pmcid: reference.pmcid,
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
  allowedOrigins: string[],
  init: RequestInit = {},
) {
  const retryAttempts: RetryAttempt[] = [];
  let lastError: unknown = null;
  const deadline = Date.now() + timeout;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (Date.now() >= deadline) break;
    let currentUrl = url;
    let redirectHops = 0;
    const visitedUrls = new Set<string>();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    const cleanup = () => {
      clearTimeout(timer);
      controller.abort();
    };
    try {
      while (true) {
        visitedUrls.add(currentUrl.toString());
        const response = await fetch(currentUrl, { ...init, redirect: 'manual', signal: controller.signal });
        if (REDIRECT_STATUS_CODES.has(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            throw new FrameworkContractError('codex_command_failed', 'Reference provider redirect omitted its Location header.', {
              provider_id: providerId,
              url: currentUrl.toString(),
              status: response.status,
              retry_attempts: retryAttempts,
              reason_code: 'reference_provider_redirect_location_missing',
            });
          }
          if (redirectHops >= MAX_REDIRECT_HOPS) {
            throw new FrameworkContractError('codex_command_failed', 'Reference provider exceeded its redirect hop limit.', {
              provider_id: providerId,
              url: currentUrl.toString(),
              redirect_hops: redirectHops,
              max_redirect_hops: MAX_REDIRECT_HOPS,
              retry_attempts: retryAttempts,
              reason_code: 'reference_provider_redirect_hop_limit_exceeded',
            });
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, currentUrl);
          } catch (error) {
            throw new FrameworkContractError('codex_command_failed', 'Reference provider returned an invalid redirect target.', {
              provider_id: providerId,
              url: currentUrl.toString(),
              location,
              retry_attempts: retryAttempts,
              reason_code: 'reference_provider_redirect_target_invalid',
              cause: error instanceof Error ? error.message : String(error),
            });
          }
          if ((nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:')
            || !allowedOrigins.includes(nextUrl.origin)) {
            throw new FrameworkContractError('codex_command_failed', 'Reference provider redirect target is outside the provider profile allowed origins.', {
              provider_id: providerId,
              url: nextUrl.toString(),
              origin: nextUrl.origin,
              allowed_origins: allowedOrigins,
              retry_attempts: retryAttempts,
              reason_code: 'reference_provider_redirect_origin_not_allowed',
            });
          }
          if (visitedUrls.has(nextUrl.toString())) {
            throw new FrameworkContractError('codex_command_failed', 'Reference provider encountered a redirect loop.', {
              provider_id: providerId,
              url: nextUrl.toString(),
              redirect_hops: redirectHops + 1,
              retry_attempts: retryAttempts,
              reason_code: 'reference_provider_redirect_loop',
            });
          }
          redirectHops += 1;
          currentUrl = nextUrl;
          continue;
        }
        if (!response.ok) {
          const status = response.status >= 500 && attempt < maxRetries ? 'retryable_error' : 'failed';
          retryAttempts.push({ attempt, status, http_status: response.status });
          if (status === 'retryable_error') {
            cleanup();
            break;
          }
          cleanup();
          throw new FrameworkContractError('codex_command_failed', 'Reference provider returned a non-OK status.', {
            provider_id: providerId,
            status: response.status,
            url: currentUrl.toString(),
            retry_attempts: retryAttempts,
          });
        }
        retryAttempts.push({ attempt, status: 'success', http_status: response.status });
        return { response, retryAttempts, cleanup, url: currentUrl };
      }
    } catch (error) {
      lastError = error;
      if (error instanceof FrameworkContractError) {
        cleanup();
        throw error;
      }
      const status = attempt < maxRetries ? 'retryable_error' : 'failed';
      retryAttempts.push({ attempt, status, http_status: null });
      cleanup();
      if (status === 'retryable_error') continue;
      break;
    }
  }
  throw new FrameworkContractError('codex_command_failed', 'Reference provider request failed.', {
    provider_id: providerId,
    url: url.toString(),
    cause: lastError instanceof Error ? lastError.message : String(lastError),
    retry_attempts: retryAttempts,
  });
}

function deferredEvidence(
  reference: ReferenceRecord,
  providerId: ProviderId,
  reason: string,
  verificationScopeOverride: Record<string, unknown> = {},
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
): ProviderEvidenceDraft {
  return {
    reference_id: reference.id,
    provider: providerName(providerId, runtime),
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
    verification_scope: {
      ...verificationScope(providerId, runtime),
      ...verificationScopeOverride,
    },
    error: {
      code: 'provider_receipt_requirement_deferred',
      message: reason,
    },
    normalized: {
      doi: reference.doi,
      pmid: reference.pmid,
      pmcid: reference.pmcid,
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

function providerErrorEvidence(
  reference: ReferenceRecord,
  providerId: ProviderId,
  error: unknown,
  runtime: InstalledPackageRuntimeModuleContext,
): ProviderEvidenceDraft {
  const payload = providerErrorPayload(error);
  return {
    reference_id: reference.id,
    provider: providerName(providerId, runtime),
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
    verification_scope: verificationScope(providerId, runtime),
    error: payload,
    normalized: {
      doi: reference.doi,
      pmid: reference.pmid,
      pmcid: reference.pmcid,
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
      code: typeof error.details?.reason_code === 'string'
        ? error.details.reason_code
        : typeof error.details?.status === 'number' ? 'provider_non_ok_status' : 'provider_request_failed',
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
    normalized: Pick<ReferenceRecord, 'doi' | 'pmid' | 'pmcid' | 'title'>;
    match_assessment: ReferenceMatchAssessment;
    retry_attempts: RetryAttempt[];
    verification_scope?: Record<string, unknown>;
  },
): ProviderEvidenceDraft {
  const providerIdentifiers = compactIdentifiers(input.provider_identifiers);
  const assessment = input.match_assessment;
  const mismatchDetails = assessment.mismatch_details;
  const matchedIdentifiers = assessment.matched_identifiers;
  const matchStatus = assessment.match_status;
  const status = matchStatus === 'identifier_matched' ? 'matched' : 'deferred';
  const deferredReason = assessment.deferred_reason;
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
    matched_identifiers: matchedIdentifiers,
    provider_identifiers: providerIdentifiers,
    mismatch_details: mismatchDetails,
    metadata: input.metadata,
    retraction_or_update_flags: input.retraction_or_update_flags,
    verification_scope: input.verification_scope ?? {},
    ...(status === 'deferred' ? {
      error: {
        code: assessment.deferred_code!,
        message: deferredReason!,
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

function adapterStringMap(value: unknown, providerId: ProviderId, field: string): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid string map.',
      { provider_id: providerId, field, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  const record = value as Record<string, unknown>;
  if (Object.values(record).some((entry) => typeof entry !== 'string')) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned a string map with non-string values.',
      { provider_id: providerId, field, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  return record as Record<string, string>;
}

function adapterOptionalString(value: unknown, providerId: ProviderId, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid normalized field.',
      { provider_id: providerId, field, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  return value;
}

function adapterMatchAssessment(value: unknown, providerId: ProviderId): ReferenceMatchAssessment {
  const assessment = asRecord(value);
  const matchStatus = asString(assessment.match_status);
  const mismatchDetails = assessment.mismatch_details;
  if (!['identifier_matched', 'metadata_conflict', 'provider_found'].includes(matchStatus ?? '')
    || !Array.isArray(mismatchDetails)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid match assessment.',
      { provider_id: providerId, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  const details = mismatchDetails.map((entry): MismatchDetail => {
    const detail = asRecord(entry);
    const field = asString(detail.field);
    if (!['doi', 'pmid', 'pmcid', 'title'].includes(field ?? '')
      || !['expected', 'actual', 'normalized_expected', 'normalized_actual']
        .every((key) => typeof detail[key] === 'string')) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Reference provider adapter returned invalid mismatch details.',
        { provider_id: providerId, reason_code: 'reference_provider_adapter_evidence_invalid' },
      );
    }
    return detail as MismatchDetail;
  });
  const matchedIdentifiers = adapterStringMap(assessment.matched_identifiers, providerId, 'match_assessment.matched_identifiers');
  const deferredReason = asString(assessment.deferred_reason);
  const deferredCode = asString(assessment.deferred_code);
  const valid = matchStatus === 'identifier_matched'
    ? Object.keys(matchedIdentifiers).length > 0 && details.length === 0 && !deferredReason && !deferredCode
    : matchStatus === 'metadata_conflict'
      ? details.length > 0 && Boolean(deferredReason) && deferredCode === 'provider_metadata_conflict'
      : Object.keys(matchedIdentifiers).length === 0 && details.length === 0
        && Boolean(deferredReason) && deferredCode === 'provider_found_without_identifier_match';
  if (!valid) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an inconsistent match assessment.',
      { provider_id: providerId, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  return {
    match_status: matchStatus as ReferenceMatchAssessment['match_status'],
    matched_identifiers: matchedIdentifiers,
    mismatch_details: details,
    ...(deferredReason ? { deferred_reason: deferredReason } : {}),
    ...(deferredCode ? { deferred_code: deferredCode as ReferenceMatchAssessment['deferred_code'] } : {}),
  };
}

function adapterEvidenceToProviderEvidence(
  reference: ReferenceRecord,
  provider: ReferenceProviderDefinition,
  rawEvidence: unknown,
  retryAttempts: RetryAttempt[],
  runtime: InstalledPackageRuntimeModuleContext,
  verificationScopeOverride: Record<string, unknown> = {},
): ProviderEvidenceDraft {
  const evidence = asRecord(rawEvidence);
  const matchBasis = asString(evidence.match_basis);
  const allowedMatchBases = new Set(['doi', 'pmid', 'pmcid', 'title', 'none']);
  if (!matchBasis || !allowedMatchBases.has(matchBasis)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Reference provider adapter returned an invalid match basis.',
      { provider_id: provider.provider_id, match_basis: matchBasis, reason_code: 'reference_provider_adapter_evidence_invalid' },
    );
  }
  const normalizedRecord = asRecord(evidence.normalized);
  const normalized = {
    doi: adapterOptionalString(normalizedRecord.doi, provider.provider_id, 'normalized.doi'),
    pmid: adapterOptionalString(normalizedRecord.pmid, provider.provider_id, 'normalized.pmid'),
    pmcid: adapterOptionalString(normalizedRecord.pmcid, provider.provider_id, 'normalized.pmcid'),
    title: adapterOptionalString(normalizedRecord.title, provider.provider_id, 'normalized.title'),
  };
  const verificationScope = asRecord(evidence.verification_scope);
  if (matchBasis === 'none') {
    const reason = asString(verificationScope.adapter_deferred_reason)
      ?? `${provider.provider_id} provider returned no usable metadata`;
    return deferredEvidence(
      reference,
      provider.provider_id,
      reason,
      { ...verificationScope, ...verificationScopeOverride },
      runtime,
    );
  }
  return foundEvidence(reference, {
    provider: provider.receipt_provider_name,
    provider_id: provider.provider_id,
    match_basis: matchBasis as ProviderEvidence['match_basis'],
    provider_identifiers: adapterStringMap(evidence.provider_identifiers, provider.provider_id, 'provider_identifiers'),
    metadata: asRecord(evidence.metadata) as ProviderEvidence['metadata'],
    retraction_or_update_flags: asRecord(evidence.retraction_or_update_flags),
    normalized,
    match_assessment: adapterMatchAssessment(evidence.match_assessment, provider.provider_id),
    retry_attempts: retryAttempts,
    verification_scope: {
      ...provider.verification_scope,
      ...verificationScope,
      ...verificationScopeOverride,
    },
  });
}

function referenceAdapterNext(
  result: unknown,
  providerId: ProviderId,
  runtime: LoadedInstalledPackageRuntimeModule,
) {
  const stepSchema = runtime.readJson(runtime.binding.step_schema_ref);
  delete stepSchema.$id;
  const validation = validateJsonSchemaPayload({
    schemaId: `${runtime.binding.step_schema_ref}@${runtime.contentDigest}`,
    schema: stepSchema,
    sourceRef: runtime.binding.step_schema_ref,
  }, result);
  if (!validation.ok) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect reference provider adapter returned a result outside its locked step schema.',
      {
        provider_id: providerId,
        schema_ref: runtime.binding.step_schema_ref,
        schema_errors: validation.errors,
        reason_code: 'reference_provider_adapter_result_schema_invalid',
      },
    );
  }
  const next = asRecord(asRecord(result).next);
  const kind = asString(next.kind);
  if (kind === 'complete' && next.evidence !== undefined) {
    return { kind: 'complete' as const, evidence: next.evidence };
  }
  if (kind === 'request' && typeof next.request === 'object' && next.request !== null && next.state !== undefined) {
    return {
      kind: 'request' as const,
      request: next.request as ReferenceAdapterRequest,
      state: next.state,
    };
  }
  throw new FrameworkContractError(
    'codex_command_failed',
    'OPL Connect reference provider adapter returned an invalid next step.',
    { provider_id: providerId, next_kind: kind, reason_code: 'reference_provider_adapter_transition_invalid' },
  );
}

async function verifyProviderWithAdapter(
  reference: ReferenceRecord,
  providerId: ProviderId,
  input: ReferenceVerificationInput,
  runtime: LoadedInstalledPackageRuntimeModule,
): Promise<ProviderEvidenceDraft> {
  const provider = providerDefinition(providerId, runtime);
  const handler = runtime.handler as ReferenceProviderAdapterHandler;
  const requestBase = {
    surface_kind: 'opl_connect_reference_provider_adapter_step_request.v1',
    adapter_abi: REFERENCE_PROVIDER_ADAPTER_ABI,
    provider,
    reference,
  };
  let result: unknown;
  try {
    result = handler({ ...requestBase, operation: 'build_request' });
  } catch (error) {
    adapterContractFailure(error, { provider_id: providerId, operation: 'build_request' });
  }
  let retryAttempts: RetryAttempt[] = [];
  for (let requestCount = 0; requestCount <= runtime.binding.max_steps; requestCount += 1) {
    const next = referenceAdapterNext(result, providerId, runtime);
    if (next.kind === 'complete') {
      return adapterEvidenceToProviderEvidence(reference, provider, next.evidence, retryAttempts, runtime);
    }
    if (requestCount === runtime.binding.max_steps) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'OPL Connect reference provider adapter exceeded its state-machine step cap.',
        {
          provider_id: providerId,
          max_steps: runtime.binding.max_steps,
          reason_code: 'reference_provider_adapter_step_cap_exceeded',
        },
      );
    }
    let fetched: { response: ReferenceAdapterHttpResponse; retryAttempts: RetryAttempt[] };
    try {
      fetched = await fetchReferenceAdapterRequest(next.request, provider, input);
    } catch (error) {
      const state = asRecord(next.state);
      const retainedEvidence = asRecord(asRecord(state.retained).evidence);
      if (state.step === 'full_text_xml' && Object.keys(retainedEvidence).length > 0) {
        return adapterEvidenceToProviderEvidence(
          reference,
          provider,
          retainedEvidence,
          [...retryAttempts, ...retryAttemptsFromError(error)],
          runtime,
          { full_text_probe_status: 'request_failed' },
        );
      }
      throw error;
    }
    retryAttempts = [...retryAttempts, ...fetched.retryAttempts];
    try {
      result = handler({
        ...requestBase,
        operation: 'parse_response',
        state: next.state,
        response: fetched.response,
      });
    } catch (error) {
      adapterContractFailure(error, { provider_id: providerId, operation: 'parse_response' });
    }
  }
  throw new FrameworkContractError('codex_command_failed', 'OPL Connect reference provider adapter did not complete.', {
    provider_id: providerId,
    reason_code: 'reference_provider_adapter_incomplete',
  });
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
  runtime: LoadedInstalledPackageRuntimeModule,
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
  const evidence = withReceiptRef(await verifyProviderWithAdapter(reference, providerId, input, runtime).catch((error) =>
    providerErrorEvidence(reference, providerId, error, runtime)
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

function providerName(
  providerId: ProviderId,
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
): ProviderEvidence['provider'] {
  return providerDefinition(providerId, runtime).receipt_provider_name;
}

function verificationScope(
  providerId: ProviderId,
  runtime: InstalledPackageRuntimeModuleContext = resolveReferenceRuntime(),
): Record<string, unknown> {
  return providerDefinition(providerId, runtime).verification_scope;
}

function identifiersFromReference(reference: ReferenceRecord): Record<string, string> {
  return compactIdentifiers({ doi: reference.doi, pmid: reference.pmid, pmcid: reference.pmcid });
}

function metadataFromReference(reference: ReferenceRecord): ProviderEvidence['metadata'] {
  return compactMetadata({ title: reference.title });
}

function compactIdentifiers(input: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
}

function compactMetadata(input: {
  title?: string | null;
  year?: string | null;
  journal?: string | null;
  authors?: string[];
  abstract?: string | null;
}): ProviderEvidence['metadata'] {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.length > 0
    ),
  ) as ProviderEvidence['metadata'];
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
  const runtime = await loadInstalledPackageRuntimeModule({
    packageId: REFERENCE_PROVIDER_PACKAGE_ID,
    moduleKind: REFERENCE_PROVIDER_MODULE_KIND,
    adapterAbi: REFERENCE_PROVIDER_ADAPTER_ABI,
    ...(input.installedPackage ?? {}),
  });
  const referenceInput = resolveReferences(input);
  const references = referenceInput.references;
  const providers = normalizeReferenceVerificationProviders(input.providers, {}, runtime);
  const providerEvidence: ProviderEvidence[] = [];
  for (const reference of references) {
    for (const providerId of providers) {
      providerEvidence.push(await verifyProviderWithCache(reference, providerId, input, runtime));
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
        references_file: referenceInput.referencesFile,
        reference_source_kind: referenceInput.sourceKind,
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
