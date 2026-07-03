type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function resolveSettingsCodexAccess(core: JsonRecord) {
  const codex = asRecord(core.codex);
  const modelAccessReady = codex.model_access_ready === true;
  const oplGatewayConfigured = codex.opl_gateway_configured === true;

  return {
    api_key_present: codex.api_key_present === true,
    opl_gateway_configured: oplGatewayConfigured,
    opl_gateway_status: oplGatewayConfigured ? 'ready' : 'attention_needed',
    model_access_ready: modelAccessReady,
    model_access_status: modelAccessReady ? 'ready' : 'attention_needed',
    model_access_source: asString(codex.model_access_source) ?? 'missing',
    config_path: asString(codex.config_path),
  };
}
