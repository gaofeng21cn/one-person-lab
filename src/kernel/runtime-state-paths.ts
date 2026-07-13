import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type OplStatePaths = {
  home_dir: string;
  state_dir: string;
  workspace_registry_file: string;
  workspace_root_file: string;
  session_ledger_file: string;
  task_state_dir: string;
  runtime_modes_file: string;
  update_channel_file: string;
  developer_supervisor_config_file: string;
  connection_registry_file: string;
  external_evidence_ledger_file: string;
  agent_package_registry_cache_file: string;
  agent_package_lock_file: string;
  agent_package_lifecycle_ledger_file: string;
  agent_package_home_shortcut_preferences_file: string;
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
  agent_lab_risk_tier_auto_promotion_ledger_file: string;
  agent_lab_feedbackops_event_ledger_file: string;
  developer_mode_closeout_ledger_file: string;
  domain_manifest_projection_cache_file: string;
  install_manifest_file: string;
  desktop_config_file: string;
  desktop_pilot_root: string;
};

function normalizeExplicitStateDir() {
  return process.env.OPL_STATE_DIR?.trim() || null;
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

  return {
    home_dir: homeDir,
    state_dir: stateDir,
    workspace_registry_file: path.join(stateDir, 'workspace-registry.json'),
    workspace_root_file: path.join(stateDir, 'workspace-root.json'),
    session_ledger_file: path.join(stateDir, 'session-ledger.json'),
    task_state_dir: path.join(stateDir, 'tasks'),
    runtime_modes_file: path.join(stateDir, 'runtime-modes.json'),
    update_channel_file: path.join(stateDir, 'update-channel.json'),
    developer_supervisor_config_file: path.join(stateDir, 'developer-supervisor.json'),
    connection_registry_file: path.join(stateDir, 'connection-registry.json'),
    external_evidence_ledger_file: path.join(stateDir, 'external-evidence-ledger.json'),
    agent_package_registry_cache_file: path.join(stateDir, 'agent-package-registry-cache.json'),
    agent_package_lock_file: path.join(stateDir, 'agent-package-locks.json'),
    agent_package_lifecycle_ledger_file: path.join(stateDir, 'agent-package-lifecycle-ledger.json'),
    agent_package_home_shortcut_preferences_file: path.join(stateDir, 'agent-package-home-shortcut-preferences.json'),
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
    agent_lab_risk_tier_auto_promotion_ledger_file: path.join(
      stateDir,
      'agent-lab-risk-tier-auto-promotion-ledger.json',
    ),
    agent_lab_feedbackops_event_ledger_file: path.join(
      stateDir,
      'agent-lab-feedbackops-events.json',
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
