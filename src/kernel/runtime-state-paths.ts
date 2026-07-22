import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type OplStatePaths = {
  home_dir: string;
  state_dir: string;
  workspace_registry_file: string;
  workspace_root_file: string;
  session_ledger_file: string;
  work_item_control_ledger_file: string;
  task_state_dir: string;
  runtime_modes_file: string;
  update_channel_file: string;
  developer_supervisor_config_file: string;
  connection_registry_file: string;
  gateway_account_dir: string;
  gateway_installation_file: string;
  gateway_account_file: string;
  gateway_credentials_file: string;
  gateway_account_lock_file: string;
  external_evidence_ledger_file: string;
  agent_package_registry_cache_file: string;
  agent_package_release_catalog_cache_file: string;
  agent_package_lock_file: string;
  agent_package_lifecycle_ledger_file: string;
  agent_package_home_shortcut_preferences_file: string;
  storage_owner_inventory_snapshot_file: string;
  managed_install_update_ledger_file: string;
  managed_update_component_receipt_ledger_file: string;
  managed_update_kernel_lock_file: string;
  app_release_user_path_evidence_ledger_file: string;
  codex_app_runtime_evidence_ledger_file: string;
  provider_long_soak_evidence_ledger_file: string;
  memory_artifact_lifecycle_evidence_ledger_file: string;
  brand_module_l5_evidence_ledger_file: string;
  standard_agent_template_consumption_ledger_file: string;
  domain_owner_payload_summary_ledger_file: string;
  owner_evidence_sustained_consumption_ledger_file: string;
  stage_replay_missing_receipt_ledger_file: string;
  current_owner_delta_read_model_cache_file: string;
  developer_mode_closeout_ledger_file: string;
  domain_manifest_projection_cache_file: string;
  install_manifest_file: string;
  desktop_config_file: string;
  desktop_pilot_root: string;
};

function normalizeExplicitStateDir() {
  return process.env.OPL_STATE_DIR?.trim() || null;
}

const NODE_TEST_CONTEXT_ENV_KEYS = [
  'NODE_TEST_CONTEXT',
  'JEST_WORKER_ID',
  'VITEST_WORKER_ID',
] as const;

function canonicalizeForContainment(value: string) {
  const absolute = path.resolve(value);
  const missing: string[] = [];
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  let canonicalExisting = existing;
  try {
    canonicalExisting = fs.realpathSync(existing);
  } catch {
    // The lexical path is the best available evidence when realpath is unavailable.
  }
  return path.join(canonicalExisting, ...missing);
}

function isWithin(parent: string, child: string) {
  const relative = path.relative(
    canonicalizeForContainment(parent),
    canonicalizeForContainment(child),
  );
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}

function isHermeticRepoTempState(stateDir: string) {
  const tempRoot = process.env.OPL_REPO_TEMP_ROOT?.trim();
  return process.env.OPL_REPO_TEMP_ENV_ACTIVE?.trim() === '1'
    && Boolean(tempRoot)
    && isWithin(tempRoot as string, stateDir);
}

function assertExplicitTestStateDir(explicitStateDir: string | null, stateDir: string) {
  const testContextKey = NODE_TEST_CONTEXT_ENV_KEYS.find((key) => process.env[key]?.trim());
  if (explicitStateDir || !testContextKey || isHermeticRepoTempState(stateDir)) return;

  const error = new Error(
    `OPL_STATE_DIR is required when ${testContextKey} is present; refusing implicit shared OPL state access.`,
  );
  error.name = 'OplStateAdmissionError';
  throw error;
}

function normalizeDockerDataDir() {
  return process.env.OPL_DATA_DIR?.trim() || process.env.AIONUI_DATA_DIR?.trim() || null;
}

export function resolveOplStatePaths(input: { dataDir?: string | null } = {}): OplStatePaths {
  const explicitStateDir = normalizeExplicitStateDir();
  const homeDir = process.env.HOME?.trim() || os.homedir();
  const dockerDataDir = input.dataDir?.trim() || normalizeDockerDataDir();
  const stateDir = explicitStateDir
    ? path.resolve(explicitStateDir)
    : dockerDataDir
      ? path.join(path.resolve(dockerDataDir), 'opl', 'state')
    : path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
  assertExplicitTestStateDir(explicitStateDir, stateDir);

  return {
    home_dir: homeDir,
    state_dir: stateDir,
    workspace_registry_file: path.join(stateDir, 'workspace-registry.json'),
    workspace_root_file: path.join(stateDir, 'workspace-root.json'),
    session_ledger_file: path.join(stateDir, 'session-ledger.json'),
    work_item_control_ledger_file: path.join(stateDir, 'work-item-control-ledger.json'),
    task_state_dir: path.join(stateDir, 'tasks'),
    runtime_modes_file: path.join(stateDir, 'runtime-modes.json'),
    update_channel_file: path.join(stateDir, 'update-channel.json'),
    developer_supervisor_config_file: path.join(stateDir, 'developer-supervisor.json'),
    connection_registry_file: path.join(stateDir, 'connection-registry.json'),
    gateway_account_dir: path.join(stateDir, 'gateway'),
    gateway_installation_file: path.join(stateDir, 'gateway', 'installation.json'),
    gateway_account_file: path.join(stateDir, 'gateway', 'account.json'),
    gateway_credentials_file: path.join(stateDir, 'gateway', 'credentials.json'),
    gateway_account_lock_file: path.join(stateDir, 'gateway', 'account.lock'),
    external_evidence_ledger_file: path.join(stateDir, 'external-evidence-ledger.json'),
    agent_package_registry_cache_file: path.join(stateDir, 'agent-package-registry-cache.json'),
    agent_package_release_catalog_cache_file: path.join(stateDir, 'agent-package-release-catalog-cache.json'),
    agent_package_lock_file: path.join(stateDir, 'agent-package-locks.json'),
    agent_package_lifecycle_ledger_file: path.join(stateDir, 'agent-package-lifecycle-ledger.json'),
    agent_package_home_shortcut_preferences_file: path.join(stateDir, 'agent-package-home-shortcut-preferences.json'),
    storage_owner_inventory_snapshot_file: path.join(stateDir, 'storage-owner-inventory-snapshot.json'),
    managed_install_update_ledger_file: path.join(stateDir, 'managed-install-update-ledger.json'),
    managed_update_component_receipt_ledger_file: path.join(
      stateDir,
      'managed-update-component-receipts.json',
    ),
    managed_update_kernel_lock_file: path.join(stateDir, 'managed-update-kernel.lock'),
    app_release_user_path_evidence_ledger_file: path.join(
      stateDir,
      'app-release-user-path-evidence-ledger.json',
    ),
    codex_app_runtime_evidence_ledger_file: path.join(
      stateDir,
      'codex-app-runtime-evidence-ledger.json',
    ),
    provider_long_soak_evidence_ledger_file: path.join(
      stateDir,
      'provider-long-soak-evidence-ledger.json',
    ),
    memory_artifact_lifecycle_evidence_ledger_file: path.join(
      stateDir,
      'memory-artifact-lifecycle-evidence-ledger.json',
    ),
    brand_module_l5_evidence_ledger_file: path.join(
      stateDir,
      'brand-module-l5-evidence-ledger.json',
    ),
    standard_agent_template_consumption_ledger_file: path.join(
      stateDir,
      'standard-agent-template-consumption-ledger.json',
    ),
    domain_owner_payload_summary_ledger_file: path.join(
      stateDir,
      'domain-owner-payload-summary-ledger.json',
    ),
    owner_evidence_sustained_consumption_ledger_file: path.join(
      stateDir,
      'owner-evidence-sustained-consumption-ledger.json',
    ),
    stage_replay_missing_receipt_ledger_file: path.join(
      stateDir,
      'stage-replay-missing-receipt-ledger.json',
    ),
    current_owner_delta_read_model_cache_file: path.join(
      stateDir,
      'current-owner-delta-read-model-cache.json',
    ),
    developer_mode_closeout_ledger_file: path.join(stateDir, 'developer-mode-closeout-ledger.json'),
    domain_manifest_projection_cache_file: path.join(stateDir, 'domain-manifest-projection-cache.json'),
    install_manifest_file: path.join(stateDir, 'install-manifest.json'),
    desktop_config_file: path.join(stateDir, 'desktop-pilot', 'config', 'desktop-config.json'),
    desktop_pilot_root: path.join(stateDir, 'desktop-pilot'),
  };
}

export function ensureOplStateDir(paths = resolveOplStatePaths()) {
  fs.mkdirSync(paths.state_dir, { recursive: true });
  return paths;
}
