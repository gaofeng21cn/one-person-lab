export type JsonRecord = Record<string, unknown>;

export type BuildSettingsControlCenterInput = {
  profile: 'fast' | 'full';
  core: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  provider: JsonRecord;
  release: JsonRecord;
  paths: JsonRecord;
};

export function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function asList(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

export function statusTone(status: string | null) {
  if (!status) return 'unknown';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(status)
    ? 'ready'
    : 'attention_needed';
}

export function settingsAuthorityFlags() {
  return {
    can_write_domain_truth: false,
    can_sign_domain_receipt: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_write_runtime_queue: false,
    can_write_provider_queue: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_quality_verdict: false,
    can_claim_app_release_ready: false,
    can_claim_production_ready: false,
  };
}

export function routeFor(actionId: string) {
  return `opl app action execute --action ${actionId}`;
}
