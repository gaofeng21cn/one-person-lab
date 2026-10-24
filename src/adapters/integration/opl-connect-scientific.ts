import crypto from 'node:crypto';

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

export type ScientificConnectorProviderId = string;

export type ScientificConnectorSearchInput = {
  provider: ScientificConnectorProviderId;
  query: string;
  limit: number;
  timeoutMs?: number;
  installedPackage?: InstalledPackageRuntimeDiscoveryOptions;
};

export type NormalizedScientificSourceRef = {
  source_ref: string;
  source_kind: 'literature_article';
  source_provider: string;
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
  definition: ScientificSearchProviderDefinition;
};

type ScientificSearchProviderDefinition = {
  provider_id: ScientificConnectorProviderId;
  adapter_id: string;
  source_provider: NormalizedScientificSourceRef['source_provider'];
  endpoint: {
    default_base_url: string;
    base_url?: string;
    allowed_origins: string[];
  };
};

type ScientificSearchAdapterHandler = (request: unknown) => unknown;

const SCIENTIFIC_SEARCH_ADAPTER_ABI = 'opl-connect-scientific-search-adapter.v1';
const SCIENTIFIC_SEARCH_MODULE_KIND = 'opl_connect_scientific_search_adapter';
const SCIENTIFIC_SEARCH_PACKAGE_ID = 'mas-scholar-skills';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECT_HOPS = 5;
const PUBMED_REQUEST_INTERVAL_MS = 400;
const MAX_PUBMED_RATE_LIMIT_RETRIES = 2;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const scientificProviderRequestQueueTails = new Map<string, Promise<void>>();
const scientificProviderLastRequestAt = new Map<string, number>();
const scientificProviderCooldownUntil = new Map<string, number>();

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableString(value: unknown): string | null {
  return asString(value);
}

function timeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) return input;
  const raw = process.env.OPL_CONNECT_SCIENTIFIC_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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

function resolveScientificRuntime(options: InstalledPackageRuntimeDiscoveryOptions = {}) {
  return resolveInstalledPackageRuntimeModule({
    packageId: SCIENTIFIC_SEARCH_PACKAGE_ID,
    moduleKind: SCIENTIFIC_SEARCH_MODULE_KIND,
    adapterAbi: SCIENTIFIC_SEARCH_ADAPTER_ABI,
    ...options,
  });
}

function configuredEndpoint(
  providerId: ScientificConnectorProviderId,
  rawEndpoint: unknown,
): ScientificSearchProviderDefinition['endpoint'] {
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
      'Scholar Skills scientific provider profile declares invalid allowed origins.',
      {
        provider_id: providerId,
        reason_code: 'scientific_provider_endpoint_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!defaultBaseUrl || allowedOrigins.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills scientific provider profile declares an invalid endpoint.',
      { provider_id: providerId, reason_code: 'scientific_provider_endpoint_invalid' },
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
      'Scholar Skills scientific provider profile declares an invalid default endpoint URL.',
      {
        provider_id: providerId,
        default_base_url: defaultBaseUrl,
        reason_code: 'scientific_provider_endpoint_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!allowedOrigins.includes(defaultOrigin)) allowedOrigins.push(defaultOrigin);
  const environmentOverride = asString(endpoint.environment_override);
  if (environmentOverride && !/^OPL_CONNECT_[A-Z0-9_]+_BASE$/.test(environmentOverride)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect scientific provider endpoint environment override is outside the allowed namespace.',
      {
        provider_id: providerId,
        environment_override: environmentOverride,
        reason_code: 'scientific_provider_endpoint_environment_override_invalid',
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
      'OPL Connect scientific provider endpoint override is not a valid absolute URL.',
      {
        provider_id: providerId,
        environment_override: environmentOverride,
        base_url: baseUrl,
        reason_code: 'scientific_provider_endpoint_override_invalid',
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

function scientificConnectorProviderRegistry(
  runtime: InstalledPackageRuntimeModuleContext = resolveScientificRuntime(),
): ScientificConnectorProviderAdapter[] {
  const profile = runtime.readJson(runtime.binding.profile_ref);
  const rawProviders = profile.providers;
  if (!Array.isArray(rawProviders) || rawProviders.length === 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills scientific provider profile must declare providers.',
      { profile_ref: runtime.binding.profile_ref, reason_code: 'scientific_provider_profile_empty' },
    );
  }
  const providerOwner = asString(profile.registry_owner) ?? 'mas-scholar-skills.scientific-search-adapters';
  const providers = rawProviders.map((rawProvider) => {
    const entry = asRecord(rawProvider);
    const provider = stableString(entry.provider_id);
    const adapterId = stableString(entry.adapter_id);
    const sourceProvider = stableString(entry.source_provider);
    if (!provider || !adapterId || !sourceProvider) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Scholar Skills scientific provider profile declares an invalid provider entry.',
        { provider_id: provider, adapter_id: adapterId, reason_code: 'scientific_provider_profile_entry_invalid' },
      );
    }
    return {
      provider_id: provider,
      provider_owner: providerOwner,
      source_system: stableString(entry.source_system) ?? sourceProvider,
      definition: {
        provider_id: provider,
        adapter_id: adapterId,
        source_provider: sourceProvider,
        endpoint: configuredEndpoint(provider, entry.endpoint),
      },
    };
  });
  const providerIds = providers.map((provider) => provider.provider_id);
  if (new Set(providerIds).size !== providerIds.length) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Scholar Skills scientific provider profile declares duplicate provider ids.',
      { provider_ids: providerIds, reason_code: 'scientific_provider_profile_duplicate_provider' },
    );
  }
  return providers;
}

function adapterContractFailure(error: unknown, context: Record<string, unknown>): never {
  const errorRecord = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {};
  const details = asRecord(errorRecord.details);
  throw new FrameworkContractError(
    'codex_command_failed',
    'OPL Connect scientific adapter returned an invalid contract result.',
    {
      ...context,
      adapter_code: asString(errorRecord.code),
      adapter_details: details,
      cause: error instanceof Error ? error.message : String(error),
      reason_code: 'scientific_adapter_contract_error',
    },
  );
}

type ScientificAdapterRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

type ScientificAdapterHttpResponse = {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

function scientificProviderTimeoutError(
  provider: ScientificConnectorProviderAdapter,
  url: URL,
  timeout: number,
) {
  return new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector request failed.', {
    connector_id: 'scientific',
    provider_id: provider.provider_id,
    url: url.toString(),
    timeout_ms: timeout,
    reason_code: 'scientific_provider_request_timeout',
  });
}

async function waitForScientificProviderRequestTurn(
  provider: ScientificConnectorProviderAdapter,
  url: URL,
  timeout: number,
  deadline: number,
) {
  if (provider.provider_id !== 'pubmed') return;

  const queueKey = provider.provider_id;
  const previous = scientificProviderRequestQueueTails.get(queueKey) ?? Promise.resolve();
  let releaseTurn!: () => void;
  const turn = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => turn);
  scientificProviderRequestQueueTails.set(queueKey, tail);
  void tail.then(() => {
    if (scientificProviderRequestQueueTails.get(queueKey) === tail) {
      scientificProviderRequestQueueTails.delete(queueKey);
    }
  });

  const timeoutError = () => scientificProviderTimeoutError(provider, url, timeout);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timeoutError();
    await Promise.race([
      previous,
      new Promise<void>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => reject(timeoutError()), remaining);
      }),
    ]);
    const lastRequestAt = scientificProviderLastRequestAt.get(queueKey) ?? 0;
    const cooldownUntil = scientificProviderCooldownUntil.get(queueKey) ?? 0;
    const waitMs = Math.max(
      0,
      lastRequestAt + PUBMED_REQUEST_INTERVAL_MS - Date.now(),
      cooldownUntil - Date.now(),
    );
    const availableTime = deadline - Date.now();
    if (waitMs >= availableTime) throw timeoutError();
    if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    if (Date.now() >= deadline) throw timeoutError();
    scientificProviderLastRequestAt.set(queueKey, Date.now());
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    releaseTurn();
  }
}

function retryAfterDelayMs(value: string | null, now = Date.now()) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;
  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

async function fetchScientificAdapterRequest(
  request: ScientificAdapterRequest,
  provider: ScientificConnectorProviderAdapter,
  timeout: number,
): Promise<ScientificAdapterHttpResponse> {
  if (request.method !== 'GET' || typeof request.url !== 'string') {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect scientific adapter returned an unsupported HTTP request.',
      { provider_id: provider.provider_id, method: request.method, url: request.url, reason_code: 'scientific_adapter_request_invalid' },
    );
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch (error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect scientific adapter returned an invalid HTTP request URL.',
      {
        provider_id: provider.provider_id,
        url: request.url,
        reason_code: 'scientific_adapter_request_url_invalid',
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!provider.definition.endpoint.allowed_origins.includes(url.origin)) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'OPL Connect scientific adapter returned a URL outside the provider profile allowed origins.',
      {
        provider_id: provider.provider_id,
        url: url.toString(),
        origin: url.origin,
        allowed_origins: provider.definition.endpoint.allowed_origins,
        reason_code: 'scientific_provider_request_origin_not_allowed',
      },
    );
  }
  const deadline = Date.now() + timeout;
  const visitedUrls = new Set<string>();
  let redirectHops = 0;
  let rateLimitRetryAttempts = 0;
  let rateLimitRetryAfterMs: number | null = null;
  while (true) {
    if (Date.now() >= deadline) {
      throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector request failed.', {
        connector_id: 'scientific',
        provider_id: provider.provider_id,
        url: url.toString(),
        timeout_ms: timeout,
        reason_code: 'scientific_provider_request_timeout',
      });
    }
    visitedUrls.add(url.toString());
    await waitForScientificProviderRequestTurn(provider, url, timeout, deadline);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    try {
      const response = await fetch(url, {
        method: request.method,
        ...(request.headers ? { headers: request.headers } : {}),
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status === 429 && provider.provider_id === 'pubmed') {
        rateLimitRetryAfterMs = retryAfterDelayMs(response.headers.get('retry-after'));
        const fallbackDelayMs = Math.min(8_000, 1_000 * (2 ** rateLimitRetryAttempts));
        const cooldownUntil = Date.now() + (rateLimitRetryAfterMs ?? fallbackDelayMs);
        scientificProviderCooldownUntil.set(
          provider.provider_id,
          Math.max(scientificProviderCooldownUntil.get(provider.provider_id) ?? 0, cooldownUntil),
        );
        if (rateLimitRetryAttempts < MAX_PUBMED_RATE_LIMIT_RETRIES) {
          rateLimitRetryAttempts += 1;
          await response.body?.cancel().catch(() => undefined);
          continue;
        }
      }
      if (REDIRECT_STATUS_CODES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector redirect omitted its Location header.', {
            connector_id: 'scientific',
            provider_id: provider.provider_id,
            url: url.toString(),
            status: response.status,
            reason_code: 'scientific_provider_redirect_location_missing',
          });
        }
        if (redirectHops >= MAX_REDIRECT_HOPS) {
          throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector exceeded its redirect hop limit.', {
            connector_id: 'scientific',
            provider_id: provider.provider_id,
            url: url.toString(),
            redirect_hops: redirectHops,
            max_redirect_hops: MAX_REDIRECT_HOPS,
            reason_code: 'scientific_provider_redirect_hop_limit_exceeded',
          });
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, url);
        } catch (error) {
          throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector returned an invalid redirect target.', {
            connector_id: 'scientific',
            provider_id: provider.provider_id,
            url: url.toString(),
            location,
            reason_code: 'scientific_provider_redirect_target_invalid',
            cause: error instanceof Error ? error.message : String(error),
          });
        }
        if ((nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:')
          || !provider.definition.endpoint.allowed_origins.includes(nextUrl.origin)) {
          throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector redirect target is outside the provider profile allowed origins.', {
            connector_id: 'scientific',
            provider_id: provider.provider_id,
            url: nextUrl.toString(),
            origin: nextUrl.origin,
            allowed_origins: provider.definition.endpoint.allowed_origins,
            reason_code: 'scientific_provider_redirect_origin_not_allowed',
          });
        }
        if (visitedUrls.has(nextUrl.toString())) {
          throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector encountered a redirect loop.', {
            connector_id: 'scientific',
            provider_id: provider.provider_id,
            url: nextUrl.toString(),
            redirect_hops: redirectHops + 1,
            reason_code: 'scientific_provider_redirect_loop',
          });
        }
        redirectHops += 1;
        url = nextUrl;
        continue;
      }
      if (!response.ok) {
        throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector request returned a non-OK status.', {
          connector_id: 'scientific',
          provider_id: provider.provider_id,
          url: url.toString(),
          status: response.status,
          status_text: response.statusText,
          ...(response.status === 429
            ? {
              reason_code: 'scientific_provider_rate_limited',
              retry_attempts: rateLimitRetryAttempts,
              retry_after_ms: rateLimitRetryAfterMs,
            }
            : {}),
        });
      }
      const raw = await readResponseBody(response, maxResponseBodyBytes());
      try {
        return {
          status: response.status,
          url: response.url || url.toString(),
          headers: Object.fromEntries(response.headers.entries()),
          body: JSON.parse(raw) as unknown,
        };
      } catch (error) {
        throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector response was not valid JSON.', {
          connector_id: 'scientific',
          provider_id: provider.provider_id,
          url: url.toString(),
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      if (error instanceof ResponseBodyTooLargeError) {
        throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector response body exceeded the configured limit.', {
          connector_id: 'scientific',
          provider_id: provider.provider_id,
          url: url.toString(),
          reason_code: 'provider_response_too_large',
          response_body_limit_bytes: error.limitBytes,
          response_body_bytes: error.observedBytes,
        });
      }
      if (error instanceof FrameworkContractError) throw error;
      throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific connector request failed.', {
        connector_id: 'scientific',
        provider_id: provider.provider_id,
        url: url.toString(),
        timeout_ms: timeout,
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}

function scientificAdapterNext(
  result: unknown,
  provider: ScientificConnectorProviderId,
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
      'OPL Connect scientific adapter returned a result outside its locked step schema.',
      {
        provider_id: provider,
        schema_ref: runtime.binding.step_schema_ref,
        schema_errors: validation.errors,
        reason_code: 'scientific_adapter_result_schema_invalid',
      },
    );
  }
  const next = asRecord(asRecord(result).next);
  const kind = asString(next.kind);
  if (kind === 'complete') {
    if (!Array.isArray(next.candidates)) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'OPL Connect scientific adapter completion did not include candidates.',
        { provider_id: provider, reason_code: 'scientific_adapter_completion_invalid' },
      );
    }
    const providerTotal = next.provider_total;
    if (providerTotal !== undefined && providerTotal !== null
      && (!Number.isSafeInteger(providerTotal) || (providerTotal as number) < 0)) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'OPL Connect scientific adapter completion returned an invalid provider total.',
        { provider_id: provider, provider_total: providerTotal, reason_code: 'scientific_adapter_completion_invalid' },
      );
    }
    return {
      kind: 'complete' as const,
      candidates: next.candidates as NormalizedScientificSourceRef[],
      provider_total: (providerTotal ?? null) as number | null,
    };
  }
  if (kind === 'request' && typeof next.request === 'object' && next.request !== null && next.state !== undefined) {
    return {
      kind: 'request' as const,
      request: next.request as ScientificAdapterRequest,
      state: next.state,
    };
  }
  throw new FrameworkContractError(
    'codex_command_failed',
    'OPL Connect scientific adapter returned an invalid next step.',
    { provider_id: provider, next_kind: kind, reason_code: 'scientific_adapter_transition_invalid' },
  );
}

async function searchWithScientificAdapter(
  input: ScientificConnectorSearchInput,
  provider: ScientificConnectorProviderAdapter,
  runtime: LoadedInstalledPackageRuntimeModule,
): Promise<ScientificConnectorSearchResult> {
  const handler = runtime.handler as ScientificSearchAdapterHandler;
  const requestBase = {
    surface_kind: 'opl_connect_scientific_search_adapter_step_request.v1',
    adapter_abi: SCIENTIFIC_SEARCH_ADAPTER_ABI,
    provider: provider.definition,
    query: input.query,
    limit: input.limit,
  };
  let result: unknown;
  try {
    result = handler({ ...requestBase, operation: 'build_search_request' });
  } catch (error) {
    adapterContractFailure(error, { provider_id: input.provider, operation: 'build_search_request' });
  }
  for (let requestCount = 0; requestCount <= runtime.binding.max_steps; requestCount += 1) {
    const next = scientificAdapterNext(result, input.provider, runtime);
    if (next.kind === 'complete') {
      return {
        normalized_results: next.candidates,
        provider_total: next.provider_total,
      };
    }
    if (requestCount === runtime.binding.max_steps) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'OPL Connect scientific adapter exceeded its state-machine step cap.',
        {
          provider_id: input.provider,
          max_steps: runtime.binding.max_steps,
          reason_code: 'scientific_adapter_step_cap_exceeded',
        },
      );
    }
    const response = await fetchScientificAdapterRequest(next.request, provider, timeoutMs(input.timeoutMs));
    try {
      result = handler({
        ...requestBase,
        operation: 'parse_search_response',
        state: next.state,
        response,
      });
    } catch (error) {
      adapterContractFailure(error, { provider_id: input.provider, operation: 'parse_search_response' });
    }
  }
  throw new FrameworkContractError('codex_command_failed', 'OPL Connect scientific adapter did not complete.', {
    provider_id: input.provider,
    reason_code: 'scientific_adapter_incomplete',
  });
}

export function scientificConnectorProviderIds(
  options: InstalledPackageRuntimeDiscoveryOptions = {},
): ScientificConnectorProviderId[] {
  return scientificConnectorProviderRegistry(resolveScientificRuntime(options)).map((provider) => provider.provider_id);
}

export function buildScientificConnectorProviderRegistryReadback(
  options: InstalledPackageRuntimeDiscoveryOptions = {},
) {
  const runtime = resolveScientificRuntime(options);
  return {
    surface_kind: 'opl_scientific_connector_provider_registry',
    version: 'opl-scientific-connector-provider-registry.v1',
    owner: 'OPL Connect',
    default_provider_id: null,
    providers: scientificConnectorProviderRegistry(runtime).map((provider) => ({
      provider_id: provider.provider_id,
      provider_owner: provider.provider_owner,
      source_system: provider.source_system,
      adapter_role: 'optional_provider_adapter',
    })),
    authority_boundary: buildAuthorityBoundary(),
  };
}

function resolveProvider(
  providerId: ScientificConnectorProviderId,
  runtime: InstalledPackageRuntimeModuleContext,
) {
  const provider = scientificConnectorProviderRegistry(runtime).find((entry) => entry.provider_id === providerId);
  if (!provider) {
    throw new FrameworkContractError('cli_usage_error', 'Unknown scientific connector provider.', {
      provider_id: providerId,
      available_providers: scientificConnectorProviderRegistry(runtime).map((entry) => entry.provider_id),
    });
  }
  return provider;
}

export async function runOplConnectScientificSearch(input: ScientificConnectorSearchInput) {
  const runtime = await loadInstalledPackageRuntimeModule({
    packageId: SCIENTIFIC_SEARCH_PACKAGE_ID,
    moduleKind: SCIENTIFIC_SEARCH_MODULE_KIND,
    adapterAbi: SCIENTIFIC_SEARCH_ADAPTER_ABI,
    ...(input.installedPackage ?? {}),
  });
  const provider = resolveProvider(input.provider, runtime);
  const searchResult = await searchWithScientificAdapter(input, provider, runtime);
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
