export type JsonRecord = Record<string, unknown>;

export type BuildSettingsControlCenterInput = {
  profile: 'fast' | 'full';
  core: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  agentPackages: JsonRecord;
  provider: JsonRecord;
  release: JsonRecord;
  paths: JsonRecord;
  storageOwnerInventory?: JsonRecord;
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

export function agentPackageFunctionalReadiness(agentPackages: JsonRecord) {
  const statusIndex = asRecord(agentPackages.status_index);
  const packages = asRecord(statusIndex.packages);
  const entries = Object.entries(packages).map(([packageId, value]) => {
    const status = asRecord(value);
    const exposure = asRecord(status.capability_exposure);
    const exposureStatus = asString(exposure.status) ?? 'unknown';
    const installed = asString(status.installed_version) !== null
      || asString(status.package_lock_ref) !== null
      || asString(status.lock_ref) !== null
      || ['visible', 'hidden', 'disabled'].includes(exposureStatus);
    const enabled = installed && exposureStatus !== 'disabled';
    const statusCode = asString(status.status) ?? 'unknown';
    const runnable = enabled && (
      status.operational_ready === true
      || status.launch_allowed === true
      || ['available', 'ready', 'verification_deferred'].includes(statusCode)
    );
    return {
      package_id: packageId,
      installed,
      enabled,
      runnable,
      status: statusCode,
      exposure_status: exposureStatus,
      source_ref: `app_state.agent_packages.status_index.packages.${packageId}`,
    };
  });
  const installed = entries.filter((entry) => entry.installed);
  const enabled = installed.filter((entry) => entry.enabled);
  const runnable = enabled.filter((entry) => entry.runnable);
  const attention = enabled.filter((entry) => !entry.runnable);
  return {
    status: attention.length === 0 ? 'available' as const : 'attention_needed' as const,
    installed_count: installed.length,
    enabled_count: enabled.length,
    runnable_count: runnable.length,
    attention_count: attention.length,
    attention_package_ids: attention.map((entry) => entry.package_id),
    entries,
  };
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
