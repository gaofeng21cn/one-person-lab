import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveOplStatePaths } from '../../runway/index.ts';
import { readLocalCodexDefaultsIfAvailable } from '../local-codex-defaults.ts';
import { readOplSeedInstallManifest } from './seed-manifest.ts';

type DoctorStatus = 'ok' | 'attention' | 'not_configured';
type ObservationStatus =
  | 'configured'
  | 'not_configured'
  | 'reachable'
  | 'unreachable'
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

type DockerCommandReadback = {
  status: 'ok' | 'error' | 'not_found';
  stdout: string;
  stderr: string;
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

function runDockerReadback(args: string[]): DockerCommandReadback {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 2500,
  });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
    return { status: 'not_found', stdout: '', stderr: result.error.message };
  }
  if (result.status === 0) {
    return { status: 'ok', stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  }
  const stderr = result.stderr?.trim() || result.stdout?.trim() || result.error?.message || 'docker command failed';
  return { status: 'error', stdout: result.stdout?.trim() ?? '', stderr };
}

function parseDockerJson(stdout: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stdout);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readDockerImageRef(manifestImage: Record<string, unknown> | null) {
  return optionalEnv('OPL_WEBUI_IMAGE')
    ?? readString(manifestImage, 'image_ref')
    ?? readString(manifestImage, 'ref')
    ?? readString(manifestImage, 'repository');
}

function buildDockerRuntimeReadback(input: {
  imageRef: string | null;
  dataDir: string | null;
  projectsDir: string | null;
  port: string | null;
}) {
  const dockerVersion = runDockerReadback(['version', '--format', '{{.Client.Version}}']);
  const dockerInfo = dockerVersion.status === 'ok'
    ? runDockerReadback(['info', '--format', '{{.ServerVersion}}'])
    : { status: 'error' as const, stdout: '', stderr: 'docker client not available' };
  const ps = dockerInfo.status === 'ok'
    ? runDockerReadback([
      'ps',
      '--filter',
      'label=com.docker.compose.service=one-person-lab-webui',
      '--format',
      '{{json .}}',
    ])
    : { status: 'error' as const, stdout: '', stderr: 'docker daemon not reachable' };
  const containerRows = ps.status === 'ok'
    ? ps.stdout.split(/\r?\n/).filter(Boolean).map(parseDockerJson).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  const firstContainer = containerRows[0] ?? null;
  const containerId = readString(firstContainer, 'ID');
  const containerName = readString(firstContainer, 'Names') ?? readString(firstContainer, 'Names');
  const inspectTarget = containerId ?? containerName;
  const inspect = inspectTarget
    ? runDockerReadback(['inspect', inspectTarget])
    : { status: 'error' as const, stdout: '', stderr: 'no matching WebUI container was visible' };
  let inspectPayload: Record<string, unknown> | null = null;
  if (inspect.status === 'ok') {
    try {
      const parsed = JSON.parse(inspect.stdout);
      inspectPayload = Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object'
        ? parsed[0] as Record<string, unknown>
        : null;
    } catch {
      inspectPayload = null;
    }
  }
  const mounts = Array.isArray(inspectPayload?.Mounts) ? inspectPayload.Mounts as Array<Record<string, unknown>> : [];
  const dataMount = mounts.find((entry) => readString(entry, 'Destination') === '/data') ?? null;
  const projectsMount = mounts.find((entry) => readString(entry, 'Destination') === '/projects') ?? null;
  const networkSettings = readRecord(inspectPayload, 'NetworkSettings');
  const ports = readRecord(networkSettings, 'Ports');
  const imageInspect = input.imageRef
    ? runDockerReadback(['image', 'inspect', input.imageRef, '--format', '{{json .}}'])
    : { status: 'error' as const, stdout: '', stderr: 'image reference not configured' };
  const imagePayload = imageInspect.status === 'ok' ? parseDockerJson(imageInspect.stdout) : null;

  return {
    status: dockerInfo.status === 'ok'
      ? containerRows.length > 0 ? 'container_visible' : 'daemon_reachable'
      : dockerVersion.status === 'not_found' ? 'docker_cli_missing' : 'daemon_unreachable',
    docker_cli: {
      status: dockerVersion.status === 'ok' ? 'present' : dockerVersion.status === 'not_found' ? 'missing' : 'error',
      client_version: dockerVersion.status === 'ok' ? dockerVersion.stdout : null,
      error: dockerVersion.status === 'ok' ? null : dockerVersion.stderr,
    },
    daemon: {
      status: dockerInfo.status === 'ok' ? 'reachable' : 'unreachable',
      server_version: dockerInfo.status === 'ok' ? dockerInfo.stdout : null,
      error: dockerInfo.status === 'ok' ? null : dockerInfo.stderr,
    },
    container: {
      status: containerRows.length > 0 ? 'visible' : dockerInfo.status === 'ok' ? 'not_visible' : 'not_checked',
      id: containerId,
      name: containerName,
      image: readString(firstContainer, 'Image') ?? readString(inspectPayload, 'Image'),
      ports: readString(firstContainer, 'Ports'),
      inspect_status: inspectTarget ? inspect.status : 'not_run',
      error: inspect.status === 'ok' ? null : inspect.stderr,
    },
    image: {
      ref: input.imageRef,
      status: input.imageRef ? imageInspect.status === 'ok' ? 'present' : 'not_visible' : 'not_configured',
      id: readString(imagePayload, 'Id'),
      digest: Array.isArray(imagePayload?.RepoDigests) ? imagePayload.RepoDigests[0] ?? null : null,
      error: imageInspect.status === 'ok' ? null : imageInspect.stderr,
    },
    mounts: {
      data: {
        status: dataMount ? 'visible' : inspectPayload ? 'not_visible' : 'not_checked',
        expected_host_path: input.dataDir,
        source: readString(dataMount, 'Source'),
        destination: readString(dataMount, 'Destination'),
      },
      projects: {
        status: projectsMount ? 'visible' : inspectPayload ? 'not_visible' : 'not_checked',
        expected_host_path: input.projectsDir,
        source: readString(projectsMount, 'Source'),
        destination: readString(projectsMount, 'Destination'),
      },
    },
    ports: {
      expected_host_port: input.port,
      status: ports ? 'visible' : inspectPayload ? 'not_visible' : 'not_checked',
      bindings: ports ?? null,
    },
    authority_boundary: {
      readonly: true,
      starts_or_stops_containers: false,
      pulls_images: false,
      mutates_mounts: false,
    },
  };
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
      docker_runtime: startupReadback.docker_runtime,
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
  const imageRef = readDockerImageRef(manifestImage);
  const dockerRuntime = buildDockerRuntimeReadback({
    imageRef,
    dataDir,
    projectsDir,
    port,
  });
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
    buildObservation(
      'docker_runtime',
      dockerRuntime.daemon.status === 'reachable' ? 'reachable' : 'unreachable',
      dockerRuntime.daemon.status === 'reachable'
        ? 'Docker daemon is reachable for read-only WebUI diagnostics.'
        : 'Docker daemon is not reachable; doctor reports Docker runtime as not visible without applying repairs.',
      {
        docker_cli_status: dockerRuntime.docker_cli.status,
        daemon_status: dockerRuntime.daemon.status,
        container_status: dockerRuntime.container.status,
        image_status: dockerRuntime.image.status,
        mount_status: {
          data: dockerRuntime.mounts.data.status,
          projects: dockerRuntime.mounts.projects.status,
        },
        port_status: dockerRuntime.ports.status,
        readonly: dockerRuntime.authority_boundary.readonly,
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
      ref: imageRef,
      version: readString(manifestImage, 'version'),
      digest: readString(manifestImage, 'digest'),
      seed_strategy: readString(manifestImage, 'seed_strategy'),
      seed_strategy_status: seedStrategyStatus,
      source_manifest_status: readString(manifestImage, 'source_manifest_status'),
      manifest_path: readString(manifestImage, 'manifest_path'),
    },
    docker_runtime: dockerRuntime,
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
      docker_runtime_status: dockerRuntime.status,
      docker_daemon_status: dockerRuntime.daemon.status,
      docker_container_status: dockerRuntime.container.status,
      docker_image_status: dockerRuntime.image.status,
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
