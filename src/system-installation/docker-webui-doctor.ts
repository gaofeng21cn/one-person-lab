import fs from 'node:fs';
import path from 'node:path';

import { resolveOplStatePaths } from '../runtime-state-paths.ts';
import { readOplSeedInstallManifest } from './seed-manifest.ts';

type DoctorStatus = 'ok' | 'attention' | 'not_configured';
type ObservationStatus =
  | 'configured'
  | 'not_configured'
  | 'exists'
  | 'missing'
  | 'found'
  | 'invalid'
  | 'not_visible';

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
  const status: DoctorStatus = !webuiEnvVisible && manifestStatus === 'missing'
    ? 'not_configured'
    : attention.length > 0
      ? 'attention'
      : 'ok';
  const nextActions = [
    ...(manifestStatus === 'found' ? [] : [{
      action_id: 'run_seed_apply',
      status: 'recommended',
      command: 'opl system seed-apply --from <seed-dir> --data-dir <data-dir> --projects-dir <projects-dir> --json',
      reason: 'seed_install_manifest_missing_or_invalid',
    }]),
    {
      action_id: 'run_startup_maintenance',
      status: 'available',
      command: 'opl system startup-maintenance --json',
      reason: 'refresh_seed_boundary_and_managed_update_guidance',
    },
  ];

  return {
    version: 'g2' as const,
    docker_webui_doctor: {
      surface_kind: 'opl_docker_webui_doctor',
      schema_version: 'opl_docker_webui_doctor.v1',
      status,
      summary: {
        observation_count: observations.length,
        attention_count: attention.length,
        next_action_count: nextActions.length,
        install_manifest_status: manifestStatus,
        data_dir_status: pathStatus(dataDir),
        projects_dir_status: pathStatus(projectsDir),
        browser_url_status: browserUrl ? 'configured' : 'not_visible',
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
      install_manifest: {
        status: manifestStatus,
        surface_kind: readString(installManifest, 'surface_kind'),
        seed_status: readString(installManifest, 'status'),
        image: {
          version: readString(manifestImage, 'version'),
          digest: readString(manifestImage, 'digest'),
          seed_strategy: readString(manifestImage, 'seed_strategy'),
          seed_strategy_status: readString(manifestImage, 'seed_strategy_status'),
        },
        component_ids: manifestComponents
          .map((entry) => readString(entry, 'component_id'))
          .filter((entry): entry is string => Boolean(entry)),
      },
      browser: {
        url: browserUrl,
        url_status: browserUrl ? 'configured' : 'not_visible',
      },
      observations,
      next_actions: nextActions,
      authority_boundary: {
        readonly: true,
        executes_repairs: false,
        runs_startup_maintenance: false,
        can_write_domain_truth: false,
        can_write_runtime_db: false,
        can_write_provider_queue: false,
        can_create_owner_receipt: false,
        can_claim_release_ready: false,
        can_claim_runtime_ready: false,
        can_claim_module_current: false,
      },
    },
  };
}
