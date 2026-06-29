import fs from 'node:fs';
import path from 'node:path';

import { resolveOplStatePaths } from '../runtime-state-paths.ts';
import { readLocalCodexDefaultsIfAvailable } from '../local-codex-defaults.ts';
import { readOplSeedInstallManifest } from './seed-manifest.ts';

type DoctorStatus = 'ok' | 'attention' | 'not_configured';
type ObservationStatus =
  | 'configured'
  | 'not_configured'
  | 'exists'
  | 'missing'
  | 'found'
  | 'invalid'
  | 'not_visible'
  | 'present';
type DockerWebuiStartupPhase =
  | 'not_configured'
  | 'api_key_missing'
  | 'needs_startup_maintenance'
  | 'initializing'
  | 'seed_applied'
  | 'enterable'
  | 'repairable_failure';

type Observation = {
  observation_id: string;
  status: ObservationStatus;
  severity: 'info' | 'attention';
  message: string;
  refs: Record<string, unknown>;
};

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function pathStatus(candidate: string | null) {
  if (!candidate) return 'not_configured' as const;
  return fs.existsSync(candidate) ? 'exists' as const : 'missing' as const;
}

function normalizePath(candidate: string | null) {
  return candidate ? path.resolve(candidate) : null;
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'string' && nested.trim().length > 0 ? nested.trim() : null;
}

function readRecord(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : null;
}

function readArray(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) return [];
  const nested = (value as Record<string, unknown>)[key];
  return Array.isArray(nested) ? nested : [];
}

function hasUsableManifest(manifest: Record<string, unknown> | null) {
  return readString(manifest, 'surface_kind') === 'opl_seed_install_manifest';
}

function summarizeSeedComponents(components: unknown[]) {
  return {
    total_count: components.length,
    current_count: components.filter((entry) => readString(entry, 'state') === 'current').length,
    pending_count: components.filter((entry) => readString(entry, 'state') === 'pending').length,
    not_available_count: components.filter((entry) => readString(entry, 'state') === 'not_available').length,
  };
}

function readApiKeyStatus() {
  const codexDefaults = readLocalCodexDefaultsIfAvailable();
  if (!codexDefaults) {
    return {
      status: 'missing' as const,
      config_status: 'not_detected' as const,
      present: false,
      config_path: null,
      source: 'local_codex_defaults_read_model',
    };
  }
  return {
    status: codexDefaults.provider_api_key ? 'present' as const : 'missing' as const,
    config_status: codexDefaults.provider_api_key ? 'detected' as const : 'api_key_missing' as const,
    present: Boolean(codexDefaults.provider_api_key),
    config_path: codexDefaults.config_path,
    source: 'local_codex_defaults_read_model',
  };
}

function computeStartupPhase(input: {
  webuiEnvVisible: boolean;
  manifestStatus: ObservationStatus;
  seedStatus: string | null;
  seedStrategyStatus: string | null;
  dataDirStatus: ObservationStatus;
  projectsDirStatus: ObservationStatus;
  browserUrlVisible: boolean;
  apiKeyPresent: boolean;
}): DockerWebuiStartupPhase {
  if (!input.webuiEnvVisible && input.manifestStatus === 'missing') return 'not_configured';
  if (input.manifestStatus === 'invalid' || input.seedStrategyStatus === 'blocked') return 'repairable_failure';
  if (!input.apiKeyPresent) return 'api_key_missing';
  if (input.manifestStatus !== 'found') return 'needs_startup_maintenance';
  if (input.seedStatus === 'pending' || input.seedStrategyStatus === 'pending') return 'initializing';
  if (input.seedStatus === 'applied') {
    return input.dataDirStatus === 'exists'
      && input.projectsDirStatus === 'exists'
      && input.browserUrlVisible
      ? 'enterable'
      : 'seed_applied';
  }
  return 'needs_startup_maintenance';
}

function buildObservation(
  observation_id: string,
  status: ObservationStatus,
  message: string,
  refs: Record<string, unknown>,
): Observation {
  return {
    observation_id,
    status,
    severity: status === 'missing' || status === 'invalid' || status === 'not_configured'
      ? 'attention'
      : 'info',
    message,
    refs,
  };
}

export function buildOplDockerWebuiDoctor() {
  const startupReadback = buildDockerWebuiStartupReadback();
  const {
    observations,
    attention,
    nextActions,
    dataDir,
    projectsDir,
    statePaths,
    installManifest,
    manifestStatus,
    manifestInstall,
    manifestImage,
    manifestComponents,
    port,
    browserUrl,
    aionuiDataDir,
    oplDataDir,
  } = startupReadback;
  const status: DoctorStatus = startupReadback.startup_state.phase === 'not_configured'
    ? 'not_configured'
    : attention.length > 0
      ? 'attention'
      : 'ok';

  return {
    version: 'g2' as const,
    docker_webui_doctor: {
      surface_kind: 'opl_docker_webui_doctor',
      schema_version: 'opl_docker_webui_doctor.v1',
      status,
      startup_state: startupReadback.startup_state,
      diagnostic_summary: startupReadback.diagnostic_summary,
      summary: {
        observation_count: observations.length,
        attention_count: attention.length,
        next_action_count: nextActions.length,
        install_manifest_status: manifestStatus,
        data_dir_status: pathStatus(dataDir),
        projects_dir_status: pathStatus(projectsDir),
        browser_url_status: browserUrl ? 'configured' : 'not_visible',
        api_key_status: startupReadback.api_key.status,
        startup_phase: startupReadback.startup_state.phase,
      },
      environment: {
        AIONUI_DATA_DIR: aionuiDataDir,
        OPL_DATA_DIR: oplDataDir,
        OPL_PROJECTS_DIR: normalizePath(optionalEnv('OPL_PROJECTS_DIR')),
        OPL_STATE_DIR: normalizePath(optionalEnv('OPL_STATE_DIR')),
        AIONUI_PORT: optionalEnv('AIONUI_PORT'),
        PORT: optionalEnv('PORT'),
        AIONUI_BROWSER_URL: optionalEnv('AIONUI_BROWSER_URL'),
      },
      paths: {
        effective_data_dir: dataDir,
        effective_projects_dir: projectsDir,
        state_dir: statePaths.state_dir,
        install_manifest_file: statePaths.install_manifest_file,
      },
      image: startupReadback.image,
      install_manifest: {
        status: manifestStatus,
        surface_kind: readString(installManifest, 'surface_kind'),
        seed_status: readString(installManifest, 'status'),
        startup_status: startupReadback.startup_maintenance.status,
        image: {
          version: readString(manifestImage, 'version'),
          digest: readString(manifestImage, 'digest'),
          seed_strategy: readString(manifestImage, 'seed_strategy'),
          seed_strategy_status: readString(manifestImage, 'seed_strategy_status'),
        },
        install: {
          data_dir: readString(manifestInstall, 'data_dir'),
          projects_dir: readString(manifestInstall, 'projects_dir'),
          manifest_file: readString(manifestInstall, 'manifest_file') ?? statePaths.install_manifest_file,
        },
        component_ids: manifestComponents
          .map((entry) => readString(entry, 'component_id'))
          .filter((entry): entry is string => Boolean(entry)),
        component_summary: summarizeSeedComponents(manifestComponents),
      },
      startup_maintenance: startupReadback.startup_maintenance,
      api_key: startupReadback.api_key,
      browser: {
        url: browserUrl,
        url_status: browserUrl ? 'configured' : 'not_visible',
        host: optionalEnv('AIONUI_HOST') ?? '127.0.0.1',
        port,
      },
      observations,
      next_actions: nextActions,
      authority_boundary: {
        readonly: true,
        executes_repairs: false,
        runs_startup_maintenance: false,
        writes_api_key_secret: false,
        can_write_domain_truth: false,
        can_write_runtime_db: false,
        can_write_provider_queue: false,
        can_create_owner_receipt: false,
        can_claim_release_ready: false,
        can_claim_runtime_ready: false,
        can_claim_module_current: false,
      },
      debug: {
        webui_env_visible: startupReadback.webui_env_visible,
      },
    },
  };
}

export function buildDockerWebuiStartupReadback() {
  const aionuiDataDir = normalizePath(optionalEnv('AIONUI_DATA_DIR'));
  const oplDataDir = normalizePath(optionalEnv('OPL_DATA_DIR'));
  const dataDir = oplDataDir ?? aionuiDataDir;
  const projectsDir = normalizePath(optionalEnv('OPL_PROJECTS_DIR'))
    ?? (dataDir ? path.join(dataDir, 'projects') : null);
  const statePaths = resolveOplStatePaths({ dataDir });
  const installManifest = readOplSeedInstallManifest();
  const manifestInstall = readRecord(installManifest, 'install');
  const manifestImage = readRecord(installManifest, 'image');
  const manifestComponents = readArray(installManifest, 'components');
  const installManifestFileExists = fs.existsSync(statePaths.install_manifest_file);
  const manifestStatus = !installManifest
    ? installManifestFileExists ? 'invalid' : 'missing'
    : hasUsableManifest(installManifest)
      ? 'found'
      : 'invalid';
  const port = optionalEnv('AIONUI_PORT') ?? optionalEnv('PORT');
  const host = optionalEnv('AIONUI_HOST') ?? '127.0.0.1';
  const browserUrl = optionalEnv('AIONUI_BROWSER_URL')
    ?? (port ? `http://${host}:${port}/` : null);
  const apiKey = readApiKeyStatus();
  const seedStatus = readString(installManifest, 'status');
  const seedStrategyStatus = readString(manifestImage, 'seed_strategy_status');
  const dataDirStatus = pathStatus(dataDir);
  const projectsDirStatus = pathStatus(projectsDir);
  const webuiEnvVisible = Boolean(
    aionuiDataDir
    || oplDataDir
    || optionalEnv('OPL_PROJECTS_DIR')
    || optionalEnv('AIONUI_PORT')
    || optionalEnv('PORT')
    || optionalEnv('AIONUI_BROWSER_URL'),
  );

  const observations = [
    buildObservation(
      'docker_webui_data_dir',
      pathStatus(dataDir),
      dataDir
        ? 'Docker/WebUI data directory is visible to OPL Framework.'
        : 'No Docker/WebUI data directory env was visible.',
      {
        env: {
          AIONUI_DATA_DIR: aionuiDataDir,
          OPL_DATA_DIR: oplDataDir,
        },
        effective_path: dataDir,
      },
    ),
    buildObservation(
      'docker_webui_projects_dir',
      pathStatus(projectsDir),
      projectsDir
        ? 'Docker/WebUI projects directory can be derived or read from env.'
        : 'Projects directory cannot be derived until a data directory is configured.',
      {
        env: {
          OPL_PROJECTS_DIR: normalizePath(optionalEnv('OPL_PROJECTS_DIR')),
        },
        effective_path: projectsDir,
      },
    ),
    buildObservation(
      'seed_install_manifest',
      manifestStatus,
      manifestStatus === 'found'
        ? 'OPL seed install manifest is readable.'
        : manifestStatus === 'invalid'
          ? 'OPL seed install manifest exists but is not a valid seed install manifest.'
          : 'OPL seed install manifest has not been written yet.',
      {
        manifest_file: statePaths.install_manifest_file,
        surface_kind: readString(installManifest, 'surface_kind'),
        status: readString(installManifest, 'status'),
        image_version: readString(manifestImage, 'version'),
        image_digest: readString(manifestImage, 'digest'),
        data_dir: readString(manifestInstall, 'data_dir'),
        projects_dir: readString(manifestInstall, 'projects_dir'),
        component_count: manifestComponents.length,
      },
    ),
    buildObservation(
      'startup_maintenance_guidance',
      manifestStatus === 'found' ? 'configured' : 'not_configured',
      'Startup maintenance is an explicit action surface; doctor only reports the next command.',
      {
        command: 'opl system startup-maintenance --json',
        execution_policy: 'not_executed_by_doctor',
        status: manifestStatus === 'found' ? 'seed_applied_or_recorded' : 'needed',
      },
    ),
    buildObservation(
      'codex_api_key',
      apiKey.present ? 'present' : 'missing',
      apiKey.present
        ? 'Codex API key presence is detected through the local Codex defaults read model.'
        : 'Codex API key is missing from the local Codex defaults read model.',
      {
        config_status: apiKey.config_status,
        config_path: apiKey.config_path,
        value_redacted: true,
        source: apiKey.source,
      },
    ),
    buildObservation(
      'browser_url',
      browserUrl ? 'configured' : 'not_visible',
      browserUrl
        ? 'A browser URL can be derived from visible WebUI port env.'
        : 'No WebUI port or browser URL env was visible.',
      {
        env: {
          AIONUI_BROWSER_URL: optionalEnv('AIONUI_BROWSER_URL'),
          AIONUI_HOST: optionalEnv('AIONUI_HOST'),
          AIONUI_PORT: optionalEnv('AIONUI_PORT'),
          PORT: optionalEnv('PORT'),
        },
        browser_url: browserUrl,
      },
    ),
  ];

  const attention = observations.filter((entry) => entry.severity === 'attention');
  const startupPhase = computeStartupPhase({
    webuiEnvVisible,
    manifestStatus,
    seedStatus,
    seedStrategyStatus,
    dataDirStatus,
    projectsDirStatus,
    browserUrlVisible: Boolean(browserUrl),
    apiKeyPresent: apiKey.present,
  });
  const startupMaintenanceStatus = manifestStatus === 'found'
    ? seedStatus === 'pending' || seedStrategyStatus === 'pending'
      ? 'initializing'
      : seedStrategyStatus === 'blocked'
        ? 'repairable_failure'
        : 'seed_applied'
    : manifestStatus === 'invalid'
      ? 'repairable_failure'
      : 'needed';
  const nextActions = [
    ...(!apiKey.present ? [{
      action_id: 'configure_codex_api_key',
      status: 'recommended' as const,
      command: 'opl system configure-codex --api-key-stdin --json',
      reason: 'codex_api_key_missing',
    }] : []),
    ...(manifestStatus === 'found' ? [] : [{
      action_id: 'run_seed_apply',
      status: 'recommended' as const,
      command: 'opl system seed-apply --from <seed-dir> --data-dir <data-dir> --projects-dir <projects-dir> --json',
      reason: 'seed_install_manifest_missing_or_invalid',
    }]),
    {
      action_id: 'run_startup_maintenance',
      status: manifestStatus === 'found' && seedStatus === 'applied' ? 'available' as const : 'recommended' as const,
      command: 'opl system startup-maintenance --json',
      reason: startupMaintenanceStatus === 'needed'
        ? 'seed_boundary_or_startup_maintenance_needed'
        : startupMaintenanceStatus === 'repairable_failure'
          ? 'repair_seed_boundary_or_manifest_failure'
          : 'refresh_seed_boundary_and_managed_update_guidance',
    },
  ];

  return {
    aionuiDataDir,
    oplDataDir,
    dataDir,
    projectsDir,
    statePaths,
    installManifest,
    manifestInstall,
    manifestImage,
    manifestComponents,
    manifestStatus,
    port,
    browserUrl,
    webui_env_visible: webuiEnvVisible,
    attention,
    observations,
    nextActions,
    image: {
      version: readString(manifestImage, 'version'),
      digest: readString(manifestImage, 'digest'),
      seed_strategy: readString(manifestImage, 'seed_strategy'),
      seed_strategy_status: seedStrategyStatus,
      source_manifest_status: readString(manifestImage, 'source_manifest_status'),
      manifest_path: readString(manifestImage, 'manifest_path'),
    },
    startup_state: {
      phase: startupPhase,
      api_key_required: true,
      api_key_present: apiKey.present,
      seed_applied: manifestStatus === 'found' && seedStatus === 'applied',
      initializing: startupMaintenanceStatus === 'initializing',
      enterable: startupPhase === 'enterable',
      needs_startup_maintenance: startupMaintenanceStatus === 'needed',
      repairable_failure: startupMaintenanceStatus === 'repairable_failure',
      runtime_readiness_claim: 'not_claimed',
      can_claim_runtime_ready: false,
      can_claim_release_ready: false,
      can_claim_module_current: false,
      reasons: [
        ...(!apiKey.present ? ['codex_api_key_missing'] : []),
        ...(manifestStatus !== 'found' ? ['seed_install_manifest_missing_or_invalid'] : []),
        ...(seedStatus === 'pending' || seedStrategyStatus === 'pending' ? ['seed_install_pending'] : []),
        ...(manifestStatus === 'invalid' || seedStrategyStatus === 'blocked' ? ['seed_manifest_repair_required'] : []),
        ...(!browserUrl ? ['browser_url_not_visible'] : []),
      ],
    },
    startup_maintenance: {
      status: startupMaintenanceStatus,
      command: 'opl system startup-maintenance --json',
      last_seed_status: seedStatus ?? 'not_applied',
      last_seed_applied_at: readString(installManifest, 'applied_at'),
      seed_manifest_file: statePaths.install_manifest_file,
      can_repair_by_running_command: startupMaintenanceStatus === 'needed'
        || startupMaintenanceStatus === 'repairable_failure'
        || startupMaintenanceStatus === 'initializing',
      execution_policy: 'not_executed_by_doctor',
    },
    api_key: {
      status: apiKey.status,
      config_status: apiKey.config_status,
      present: apiKey.present,
      required_for: 'codex_provider_requests',
      config_path: apiKey.config_path,
      value_redacted: true,
      source: apiKey.source,
    },
    diagnostic_summary: {
      status: startupPhase,
      image_version: readString(manifestImage, 'version'),
      image_digest: readString(manifestImage, 'digest'),
      data_dir: dataDir,
      data_dir_status: dataDirStatus,
      projects_dir: projectsDir,
      projects_dir_status: projectsDirStatus,
      browser_url: browserUrl,
      browser_url_status: browserUrl ? 'configured' : 'not_visible',
      install_manifest_status: manifestStatus,
      seed_status: seedStatus ?? 'not_applied',
      startup_maintenance_status: startupMaintenanceStatus,
      api_key_status: apiKey.status,
      next_action_ids: nextActions.map((entry) => entry.action_id),
      diagnostic_friendly: true,
      runtime_readiness_claim: 'not_claimed',
      can_claim_runtime_ready: false,
    },
  };
}
