import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  maxResponseBodyBytes,
  readResponseBody,
  ResponseBodyTooLargeError,
} from '../../../kernel/http-response-body.ts';
import type { ReferenceProviderDefinition, ProviderId } from './provider-registry.ts';
import type { ReferenceRecord, ReferenceVerificationInput } from './reference-normalization.ts';

export type RetryAttempt = { attempt: number; status: string; http_status: number | null };

export type ReferenceAdapterRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type ReferenceAdapterHttpResponse = {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECT_HOPS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export function timeoutMs(input?: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) return input;
  return DEFAULT_TIMEOUT_MS;
}

export async function fetchReferenceAdapterRequest(
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

export function cacheRef(cacheRoot: string | undefined, providerId: ProviderId, reference: ReferenceRecord) {
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

export function readCache(cachePath: string | null) {
  if (!cachePath || !fs.existsSync(cachePath)) return null;
  return parseJsonText(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
}

export function writeCache(cachePath: string | null, payload: Record<string, unknown>) {
  if (!cachePath) return 'skipped';
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return 'written';
}

export async function fetchWithRetry(
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
