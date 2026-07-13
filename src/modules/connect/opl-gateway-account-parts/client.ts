import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  OPL_GATEWAY_CONTROL_BASE_URL,
  type GatewayManagedKey,
} from './types.ts';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  accessToken?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  safeGetRetry?: boolean;
};

function gatewayError(code: string, message: string, status?: number) {
  return new FrameworkContractError('launcher_failed', message, {
    reason_code: code,
    ...(status ? { http_status: status } : {}),
  });
}

function controlBaseUrl() {
  const raw = process.env.OPL_GATEWAY_CONTROL_BASE_URL?.trim() || OPL_GATEWAY_CONTROL_BASE_URL;
  const url = new URL(raw);
  const testHttp = process.env.NODE_ENV === 'test' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !testHttp) {
    throw gatewayError('gateway_control_url_invalid', 'OPL Gateway control endpoint must use HTTPS.');
  }
  return raw.replace(/\/+$/, '');
}

function unwrap(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if ('data' in value) return unwrap(value.data);
  if ('result' in value) return unwrap(value.result);
  return value;
}

function record(value: unknown) {
  const unwrapped = unwrap(value);
  return isRecord(unwrapped) ? unwrapped : {};
}

function list(value: unknown, fields: string[] = []) {
  const unwrapped = unwrap(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (isRecord(unwrapped)) {
    for (const field of fields) if (Array.isArray(unwrapped[field])) return unwrapped[field] as unknown[];
  }
  return [];
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifier(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value);
}

function numeric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function gatewayIntegerId(value: string, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw gatewayError('gateway_response_invalid', `OPL Gateway returned an invalid ${field}.`);
  }
  return parsed;
}

function errorCode(status: number) {
  if (status === 401) return 'auth_expired';
  if (status === 403) return 'account_disabled';
  if (status === 409) return 'gateway_conflict';
  if (status === 422) return 'gateway_request_rejected';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'gateway_unavailable';
  return 'gateway_request_failed';
}

async function request(path: string, options: RequestOptions = {}) {
  const method = options.method ?? 'GET';
  const attempts = method === 'GET' && options.safeGetRetry !== false ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${controlBaseUrl()}${path}`, {
        method,
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      if (!response.ok) {
        if (method === 'GET' && response.status >= 500 && attempt + 1 < attempts) continue;
        throw gatewayError(errorCode(response.status), 'OPL Gateway rejected the request.', response.status);
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > 1024 * 1024) {
        throw gatewayError('gateway_response_too_large', 'OPL Gateway returned an oversized response.');
      }
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) {
        throw gatewayError('gateway_response_too_large', 'OPL Gateway returned an oversized response.');
      }
      if (!raw) return {};
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        throw gatewayError('gateway_response_invalid', 'OPL Gateway returned an invalid response.');
      }
      if (isRecord(parsed) && parsed.code !== undefined) {
        const code = parsed.code;
        const success = code === 0 || code === 200 || code === '0' || code === '200' || code === 'success';
        if (!success) throw gatewayError('gateway_request_rejected', 'OPL Gateway rejected the request.');
      }
      return parsed;
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      if (method === 'GET' && attempt + 1 < attempts) continue;
      const timeoutFailure = error instanceof Error && error.name === 'AbortError';
      throw gatewayError(
        timeoutFailure ? 'network_timeout' : 'network_unreachable',
        timeoutFailure ? 'OPL Gateway request timed out.' : 'OPL Gateway could not be reached.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw gatewayError('gateway_unavailable', 'OPL Gateway could not be reached.');
}

export type GatewaySession = { access_token: string; refresh_token: string };

export async function inspectGatewayPublicSettings() {
  const value = record(await request('/settings/public'));
  return {
    turnstile_enabled: value.turnstile_enabled === true || value.turnstileEnabled === true,
    totp_enabled: value.totp_enabled === true || value.totpEnabled === true || value.require_totp === true,
    server_timezone: text(value.server_timezone ?? value.timezone) ?? 'Asia/Shanghai',
  };
}

export async function loginGateway(email: string, password: string): Promise<GatewaySession> {
  let value: Record<string, unknown>;
  try {
    value = record(await request('/auth/login', { method: 'POST', body: { email, password } }));
  } catch (error) {
    if (error instanceof FrameworkContractError && error.details?.http_status === 401) {
      throw gatewayError('invalid_credentials', 'OPL Gateway email or password is incorrect.', 401);
    }
    throw error;
  }
  const accessToken = text(value.access_token ?? value.accessToken ?? value.token);
  const refreshToken = text(value.refresh_token ?? value.refreshToken);
  if (value.requires_2fa === true || text(value.temp_token ?? value.tempToken)) {
    throw gatewayError('mfa_or_challenge_required', 'OPL Gateway requires an interactive verification challenge.');
  }
  if (!accessToken || !refreshToken) {
    throw gatewayError('session_not_persistable', 'OPL Gateway did not provide a persistent login session.');
  }
  return { access_token: accessToken, refresh_token: refreshToken };
}

export async function refreshGatewaySession(refreshToken: string): Promise<GatewaySession> {
  const value = record(await request('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  }));
  const accessToken = text(value.access_token ?? value.accessToken ?? value.token);
  const nextRefreshToken = text(value.refresh_token ?? value.refreshToken);
  if (!accessToken || !nextRefreshToken) {
    throw gatewayError('reauth_required', 'OPL Gateway session rotation could not be confirmed.');
  }
  return { access_token: accessToken, refresh_token: nextRefreshToken };
}

export async function logoutGateway(accessToken: string, refreshToken: string) {
  try {
    await request('/auth/logout', { method: 'POST', accessToken, body: { refresh_token: refreshToken } });
  } catch {
    // Local disconnect is allowed after the managed key has been disabled and verified.
  }
}

export async function getGatewayProfile(accessToken: string) {
  const value = record(await request('/user/profile', { accessToken }));
  const user = isRecord(value.user) ? value.user : value;
  return {
    account_user_id: identifier(user.id ?? user.user_id ?? user.userId),
    display_name: text(user.username ?? user.name ?? user.display_name),
    email: text(user.email),
    status: text(user.status) ?? 'active',
    balance_amount: numeric(user.balance ?? user.balance_amount ?? value.balance),
    balance_currency: text(user.currency ?? value.currency) ?? 'USD',
  };
}

export async function getGatewayUsage(accessToken: string) {
  const value = record(await request('/usage/dashboard/stats', { accessToken }));
  return {
    today_tokens: numeric(value.today_tokens),
    total_tokens: numeric(value.total_tokens),
    today_actual_cost: numeric(value.today_actual_cost),
    total_actual_cost: numeric(value.total_actual_cost),
    currency: text(value.currency) ?? 'USD',
    day_timezone: text(value.timezone ?? value.day_timezone) ?? 'Asia/Shanghai',
  };
}

export async function listGatewayGroups(accessToken: string) {
  const values = list(await request('/groups/available', { accessToken }), ['groups', 'items']);
  return values.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const groupId = identifier(entry.id ?? entry.group_id ?? entry.groupId);
    if (!groupId) return [];
    return [{ group_id: groupId, label: text(entry.name ?? entry.label) ?? groupId }];
  });
}

export function normalizeManagedKey(value: unknown): GatewayManagedKey | null {
  value = unwrap(value);
  if (!isRecord(value)) return null;
  const id = identifier(value.id ?? value.key_id ?? value.keyId);
  const name = text(value.name);
  const apiKey = text(value.key ?? value.api_key ?? value.apiKey);
  if (!id || !name || !apiKey) return null;
  return {
    id,
    name,
    key: apiKey,
    status: text(value.status) ?? 'active',
    group_id: identifier(value.group_id ?? value.groupId),
    ip_whitelist: Array.isArray(value.ip_whitelist) ? value.ip_whitelist : [],
    ip_blacklist: Array.isArray(value.ip_blacklist) ? value.ip_blacklist : [],
    raw: value,
  };
}

export async function listGatewayKeys(accessToken: string, search: string) {
  const value = await request(`/keys?search=${encodeURIComponent(search)}&page_size=100`, { accessToken });
  return list(value, ['keys', 'items']).map(normalizeManagedKey).filter((entry): entry is GatewayManagedKey => entry !== null);
}

export async function getGatewayKey(accessToken: string, keyId: string) {
  try {
    return normalizeManagedKey(await request(`/keys/${encodeURIComponent(keyId)}`, { accessToken }));
  } catch (error) {
    if (error instanceof FrameworkContractError && error.details?.http_status === 404) return null;
    throw error;
  }
}

export async function createGatewayKey(
  accessToken: string,
  input: { name: string; group_id?: string | null; idempotency_key: string },
) {
  const groupId = input.group_id ? gatewayIntegerId(input.group_id, 'group ID') : null;
  return normalizeManagedKey(await request('/keys', {
    method: 'POST',
    accessToken,
    idempotencyKey: input.idempotency_key,
    body: { name: input.name, ...(groupId ? { group_id: groupId } : {}) },
  }));
}

export async function updateGatewayKeyStatus(accessToken: string, key: GatewayManagedKey, status: string) {
  const preserved = key.raw;
  const groupId = key.group_id ? gatewayIntegerId(key.group_id, 'managed key group ID') : null;
  const body = {
    name: key.name,
    status,
    ip_whitelist: key.ip_whitelist,
    ip_blacklist: key.ip_blacklist,
    ...(groupId ? { group_id: groupId } : {}),
    ...(preserved.expires_at !== undefined ? { expires_at: preserved.expires_at } : {}),
    ...(preserved.quota !== undefined ? { quota: preserved.quota } : {}),
    ...(preserved.rate_limit !== undefined ? { rate_limit: preserved.rate_limit } : {}),
    ...(preserved.allowed_models !== undefined ? { allowed_models: preserved.allowed_models } : {}),
  };
  return normalizeManagedKey(await request(`/keys/${encodeURIComponent(key.id)}`, {
    method: 'PUT',
    accessToken,
    body,
  }));
}
