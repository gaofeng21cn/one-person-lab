import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { readLocalCodexAccessState } from '../../../kernel/local-codex-defaults.ts';

const ENV_HANDLE = /^env:([A-Z_][A-Z0-9_]*)$/;
const OPL_GATEWAY_ACCOUNT_HANDLE = 'credential-store:opl-gateway-account';
const FORBIDDEN_FIELDS = /(?:^|_)(?:api_key|token|secret|password)$/i;

function normalizedFieldName(field: string) {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
}

function usageError(message: string, reasonCode: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('cli_usage_error', message, {
    reason_code: reasonCode,
    ...details,
  });
}

export function assertCredentialHandleOnlyPayload(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCredentialHandleOnlyPayload(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.test(normalizedFieldName(key))) {
      throw usageError('Connection actions accept credential handles only.', 'credential_payload_forbidden', {
        field: `${path}.${key}`,
      });
    }
    assertCredentialHandleOnlyPayload(nested, `${path}.${key}`);
  }
}

export function normalizeCredentialHandle(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw usageError('credential_handle is required.', 'credential_handle_required');
  }
  const handle = value.trim();
  if (handle === 'codex:selected_provider' || handle === OPL_GATEWAY_ACCOUNT_HANDLE || ENV_HANDLE.test(handle)) {
    return handle;
  }
  throw usageError(
    'credential_handle must use env:NAME, codex:selected_provider, or the OPL Gateway account store.',
    'credential_handle_invalid',
    { allowed_schemes: ['env:NAME', 'codex:selected_provider', OPL_GATEWAY_ACCOUNT_HANDLE] },
  );
}

export function checkCredentialHandle(handle: string) {
  if (handle === OPL_GATEWAY_ACCOUNT_HANDLE) {
    return { status: 'passed' as const, code: 'opl_gateway_account_store_present' };
  }
  const envMatch = ENV_HANDLE.exec(handle);
  if (envMatch) {
    return process.env[envMatch[1]]
      ? { status: 'passed' as const, code: 'credential_env_present' }
      : { status: 'failed' as const, code: 'credential_env_missing' };
  }
  const access = readLocalCodexAccessState();
  return access.model_access_ready
    ? { status: 'passed' as const, code: 'codex_selected_provider_ready' }
    : { status: 'failed' as const, code: 'codex_selected_provider_unavailable' };
}
