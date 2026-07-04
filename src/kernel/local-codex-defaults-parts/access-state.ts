import fs from 'node:fs';

import { isRecord } from '../contract-validation.ts';
import { readJsonFileOrNull } from '../json-file.ts';
import type {
  LocalCodexAccessState,
  LocalCodexDefaults,
  LocalCodexModelAccessSource,
} from '../local-codex-defaults.ts';

type LocalCodexAuthState = {
  auth_found: boolean;
  codex_login_present: boolean;
  auth_api_key_present: boolean;
};

type ResolveLocalCodexAccessStateInput = {
  configPath: string;
  authPath: string;
  defaults: LocalCodexDefaults | null;
  auth: LocalCodexAuthState;
  env: Record<string, string | undefined>;
  isOplGatewayBaseUrl: (value: string | null | undefined) => boolean;
};

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readCodexAuthState(authPath: string): LocalCodexAuthState {
  if (!fs.existsSync(authPath) || !fs.statSync(authPath).isFile()) {
    return {
      auth_found: false,
      codex_login_present: false,
      auth_api_key_present: false,
    };
  }

  try {
    const parsed = readJsonFileOrNull(authPath);
    const record = isRecord(parsed) ? parsed : {};
    const authMode = normalizeOptionalString(typeof record.auth_mode === 'string' ? record.auth_mode : undefined);
    const tokensPresent = record.tokens !== undefined && record.tokens !== null;
    const authApiKeyPresent = Boolean(
      normalizeOptionalString(typeof record.OPENAI_API_KEY === 'string' ? record.OPENAI_API_KEY : undefined),
    );

    return {
      auth_found: true,
      codex_login_present: authMode === 'chatgpt' && tokensPresent,
      auth_api_key_present: authApiKeyPresent,
    };
  } catch {
    return {
      auth_found: true,
      codex_login_present: false,
      auth_api_key_present: false,
    };
  }
}

function envApiKeyPresent(env: Record<string, string | undefined>) {
  return Boolean(
    normalizeOptionalString(env.OPL_CODEX_API_KEY)
    ?? normalizeOptionalString(env.CODEX_API_KEY)
    ?? normalizeOptionalString(env.OPENAI_API_KEY),
  );
}

function resolveModelAccessSource(
  input: ResolveLocalCodexAccessStateInput,
  environmentApiKeyPresent: boolean,
): LocalCodexModelAccessSource {
  const selectedProviderHasBearerToken = Boolean(input.defaults?.selected_provider_api_key_present);
  const selectedProviderUsesOplGateway = input.isOplGatewayBaseUrl(input.defaults?.provider_base_url);
  const selectedOplGatewayReady = selectedProviderHasBearerToken && selectedProviderUsesOplGateway;
  const selectedCustomProviderReady = selectedProviderHasBearerToken && !selectedProviderUsesOplGateway;

  if (selectedOplGatewayReady) return 'opl_gateway';
  if (input.auth.codex_login_present) return 'codex_login';
  if (selectedCustomProviderReady || input.auth.auth_api_key_present) return 'custom_provider';
  if (environmentApiKeyPresent) return 'env_api_key';
  return 'missing';
}

export function resolveLocalCodexAccessState(input: ResolveLocalCodexAccessStateInput): LocalCodexAccessState {
  const environmentApiKeyPresent = envApiKeyPresent(input.env);
  const modelAccessSource = resolveModelAccessSource(input, environmentApiKeyPresent);

  return {
    config_path: input.configPath,
    auth_path: input.authPath,
    config_found: Boolean(input.defaults),
    auth_found: input.auth.auth_found,
    api_key_present: Boolean(input.defaults?.provider_api_key),
    opl_gateway_configured: Boolean(input.defaults?.opl_gateway_configured),
    codex_login_present: input.auth.codex_login_present,
    env_api_key_present: environmentApiKeyPresent,
    model_access_ready: modelAccessSource !== 'missing',
    model_access_source: modelAccessSource,
    provider_base_url: input.defaults?.provider_base_url ?? null,
    model: input.defaults?.model ?? null,
    reasoning_effort: input.defaults?.reasoning_effort ?? null,
  };
}
