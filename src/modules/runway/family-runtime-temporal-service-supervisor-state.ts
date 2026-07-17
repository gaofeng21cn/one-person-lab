import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import {
  providerWorkerLaunchAgentsDir,
  providerWorkerSupervisorLaunchctlTarget,
} from './family-runtime-provider-worker-supervisor-state.ts';

type RuntimePaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>
  & Partial<Pick<ReturnType<typeof familyRuntimePaths>, 'state_dir'>>;
type ConfigPaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

export const TEMPORAL_SERVICE_SUPERVISOR_LABEL = 'ai.opl.family-runtime.temporal-service';
export const TEMPORAL_SERVICE_SUPERVISOR_THROTTLE_SECONDS = 15;
export const TEMPORAL_SERVICE_SUPERVISOR_LAUNCHCTL_TIMEOUT_MS = 5_000;

export type TemporalServiceSupervisorLaunchctlResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  args: string[];
};

export type TemporalServiceSupervisorStateRuntime = {
  env?: NodeJS.ProcessEnv;
  launchAgentsDir?: string;
  launchctlTarget?: string;
  platform?: NodeJS.Platform;
  runLaunchctl?: (args: string[]) => TemporalServiceSupervisorLaunchctlResult;
  now?: () => string;
};

export type TemporalServiceSupervisorConfig = {
  version: 'v1';
  surface_kind: 'opl_temporal_service_supervisor_config';
  provider_kind: 'temporal';
  supervisor_label: typeof TEMPORAL_SERVICE_SUPERVISOR_LABEL;
  family_runtime_root: string;
  state_dir: string;
  address: string;
  database_path: string;
  launcher_kind: 'temporal_cli';
  launcher_source: 'explicit_temporal_cli_path' | 'temporal_cli_path';
  launcher_executable: string;
  launcher_args: string[];
  launcher_command: string;
  launcher_sha256: string;
  plist_path: string;
  plist_sha256: string;
  installed_at: string;
};

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

export function temporalServiceSupervisorConfigPath(paths: ConfigPaths) {
  return path.join(paths.root, 'temporal-service-supervisor.json');
}

export function temporalServiceSupervisorDatabasePath(paths: ConfigPaths) {
  const databaseDir = path.join(paths.root, 'temporal-server');
  try {
    return path.join(fs.realpathSync(databaseDir), 'temporal.sqlite');
  } catch {
    return path.resolve(databaseDir, 'temporal.sqlite');
  }
}

export function temporalServiceSupervisorLaunchAgentsDir(runtime: TemporalServiceSupervisorStateRuntime = {}) {
  return runtime.launchAgentsDir ?? providerWorkerLaunchAgentsDir();
}

export function temporalServiceSupervisorPlistPath(runtime: TemporalServiceSupervisorStateRuntime = {}) {
  return path.join(
    temporalServiceSupervisorLaunchAgentsDir(runtime),
    `${TEMPORAL_SERVICE_SUPERVISOR_LABEL}.plist`,
  );
}

export function temporalServiceSupervisorLaunchctlTarget(runtime: TemporalServiceSupervisorStateRuntime = {}) {
  return runtime.launchctlTarget ?? providerWorkerSupervisorLaunchctlTarget();
}

export function temporalServiceSupervisorSha256(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

export function temporalServiceSupervisorLauncherSha256(input: Pick<
  TemporalServiceSupervisorConfig,
  | 'address'
  | 'database_path'
  | 'launcher_args'
  | 'launcher_command'
  | 'launcher_executable'
  | 'launcher_kind'
  | 'launcher_source'
>) {
  return temporalServiceSupervisorSha256(JSON.stringify({
    launcher_kind: input.launcher_kind,
    launcher_source: input.launcher_source,
    launcher_executable: input.launcher_executable,
    launcher_args: input.launcher_args,
    launcher_command: input.launcher_command,
    address: input.address,
    database_path: input.database_path,
  }));
}

export function runTemporalServiceSupervisorLaunchctl(
  args: string[],
  runtime: TemporalServiceSupervisorStateRuntime = {},
) {
  if (runtime.runLaunchctl) {
    return runtime.runLaunchctl(args);
  }
  if ((runtime.platform ?? process.platform) !== 'darwin') {
    return {
      ok: false,
      status: null,
      stdout: '',
      stderr: 'launchctl_unavailable_on_non_darwin',
      args,
    };
  }
  const result = spawnSync('launchctl', args, {
    encoding: 'utf8',
    timeout: TEMPORAL_SERVICE_SUPERVISOR_LAUNCHCTL_TIMEOUT_MS,
  });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? null,
    stdout: result.stdout ?? '',
    stderr: result.error?.message || result.stderr || '',
    args,
  };
}

export function readTemporalServiceSupervisorConfig(paths: ConfigPaths) {
  try {
    const parsed = readJsonPayloadFile(temporalServiceSupervisorConfigPath(paths));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const config = parsed as Partial<TemporalServiceSupervisorConfig>;
    const launcherArgs = stringArray(config.launcher_args);
    if (
      config.version !== 'v1'
      || config.surface_kind !== 'opl_temporal_service_supervisor_config'
      || config.provider_kind !== 'temporal'
      || config.supervisor_label !== TEMPORAL_SERVICE_SUPERVISOR_LABEL
      || typeof config.family_runtime_root !== 'string'
      || typeof config.state_dir !== 'string'
      || typeof config.address !== 'string'
      || typeof config.database_path !== 'string'
      || !path.isAbsolute(config.database_path)
      || config.launcher_kind !== 'temporal_cli'
      || (config.launcher_source !== 'explicit_temporal_cli_path' && config.launcher_source !== 'temporal_cli_path')
      || typeof config.launcher_executable !== 'string'
      || !path.isAbsolute(config.launcher_executable)
      || !launcherArgs
      || typeof config.launcher_command !== 'string'
      || typeof config.launcher_sha256 !== 'string'
      || typeof config.plist_path !== 'string'
      || typeof config.plist_sha256 !== 'string'
      || typeof config.installed_at !== 'string'
    ) {
      return null;
    }
    return { ...config, launcher_args: launcherArgs } as TemporalServiceSupervisorConfig;
  } catch {
    return null;
  }
}

export function writeTemporalServiceSupervisorConfig(
  paths: RuntimePaths,
  config: TemporalServiceSupervisorConfig,
) {
  fs.mkdirSync(paths.root, { recursive: true });
  writeJsonPayloadFile(temporalServiceSupervisorConfigPath(paths), config);
}

export function removeTemporalServiceSupervisorConfig(paths: ConfigPaths) {
  fs.rmSync(temporalServiceSupervisorConfigPath(paths), { force: true });
}

function fileSha256(filePath: string) {
  try {
    return temporalServiceSupervisorSha256(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function launcherExecutableCurrent(config: TemporalServiceSupervisorConfig) {
  try {
    fs.accessSync(config.launcher_executable, fs.constants.X_OK);
    return fs.realpathSync(config.launcher_executable) === config.launcher_executable;
  } catch {
    return false;
  }
}

function launchctlField(text: string, field: string) {
  const escaped = field.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim() ?? null;
}

function integerField(text: string, field: string) {
  const value = launchctlField(text, field);
  if (!value || !/^-?\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
}

export function inspectTemporalServiceSupervisorState(
  paths: RuntimePaths,
  runtime: TemporalServiceSupervisorStateRuntime = {},
) {
  const platform = runtime.platform ?? process.platform;
  const stateDir = paths.state_dir ?? path.dirname(paths.root);
  const plistPath = temporalServiceSupervisorPlistPath(runtime);
  const plistExists = fs.existsSync(plistPath);
  const config = readTemporalServiceSupervisorConfig(paths);
  const configExists = fs.existsSync(temporalServiceSupervisorConfigPath(paths));
  const launchctl = platform === 'darwin' && plistExists
    ? runTemporalServiceSupervisorLaunchctl([
        'print',
        `${temporalServiceSupervisorLaunchctlTarget(runtime)}/${TEMPORAL_SERVICE_SUPERVISOR_LABEL}`,
      ], runtime)
    : null;
  const processState = launchctl?.ok ? launchctlField(launchctl.stdout, 'state') : null;
  const pid = launchctl?.ok ? integerField(launchctl.stdout, 'pid') : null;
  const lastExitStatus = launchctl?.ok ? integerField(launchctl.stdout, 'last exit code') : null;
  const lastExitSignal = launchctl?.ok ? integerField(launchctl.stdout, 'last terminating signal') : null;
  const databaseArgumentIndex = config?.launcher_args.indexOf('--db-filename') ?? -1;
  const launcherSignatureCurrent = config
    ? temporalServiceSupervisorLauncherSha256(config) === config.launcher_sha256
    : false;
  const configurationChecks = {
    config_valid: Boolean(config),
    family_runtime_root_current: config?.family_runtime_root === paths.root,
    state_dir_current: config?.state_dir === stateDir,
    plist_path_current: config?.plist_path === plistPath,
    database_path_current: config?.database_path === temporalServiceSupervisorDatabasePath(paths),
    database_argument_current: Boolean(
      config
      && databaseArgumentIndex >= 0
      && config.launcher_args[databaseArgumentIndex + 1] === config.database_path,
    ),
    launcher_command_current: Boolean(
      config
      && config.launcher_command === [config.launcher_executable, ...config.launcher_args].join(' '),
    ),
    launcher_sha256_current: launcherSignatureCurrent,
    launcher_executable_current: config ? launcherExecutableCurrent(config) : false,
    plist_sha256_current: Boolean(config && fileSha256(plistPath) === config.plist_sha256),
  };
  const configurationCurrent = Object.values(configurationChecks).every(Boolean);
  const launchdError = platform !== 'darwin'
    ? null
    : (plistExists || configExists) && !configurationCurrent
      ? 'temporal_service_supervisor_configuration_drift'
      : plistExists && !launchctl?.ok
      ? launchctl?.stderr.trim() || 'launchd_job_not_loaded'
      : processState !== 'running' && lastExitStatus !== null && lastExitStatus !== 0
        ? `launchd_last_exit_nonzero:${lastExitStatus}`
        : processState !== 'running' && lastExitSignal !== null && lastExitSignal !== 0
          ? `launchd_last_exit_signal:${lastExitSignal}`
          : null;
  const status = platform !== 'darwin'
    ? 'not_applicable'
    : !plistExists && !configExists
      ? 'not_installed'
      : !plistExists || !config || !configurationCurrent
        ? 'configuration_drift'
        : !launchctl?.ok
          ? 'installed_not_loaded'
          : processState === 'running' || (pid !== null && pid > 0)
            ? 'loaded_running'
            : 'loaded_waiting';

  return {
    surface_kind: 'opl_temporal_service_supervisor_state',
    provider_kind: 'temporal' as const,
    supervisor_label: TEMPORAL_SERVICE_SUPERVISOR_LABEL,
    status,
    installed: plistExists && Boolean(config),
    loaded: launchctl?.ok ?? false,
    ready: null,
    observed_at: runtime.now?.() ?? new Date().toISOString(),
    supported: platform === 'darwin',
    plist_path: plistPath,
    plist_exists: plistExists,
    config_path: temporalServiceSupervisorConfigPath(paths),
    config_exists: configExists,
    config,
    configuration_current: configurationCurrent,
    configuration_checks: configurationChecks,
    launchctl_loaded: launchctl?.ok ?? false,
    launchctl,
    process_state: processState,
    pid,
    last_exit_status: lastExitStatus,
    last_exit_signal: lastExitSignal,
    error: launchdError,
    run_at_load: true,
    keep_alive: true,
    throttle_interval_seconds: TEMPORAL_SERVICE_SUPERVISOR_THROTTLE_SECONDS,
    family_runtime_root: paths.root,
    address: config?.address ?? null,
    database_path: config?.database_path ?? null,
    launcher_source: config?.launcher_source ?? null,
    launcher_executable: config?.launcher_executable ?? null,
    schedule_independent: true,
    authority_boundary: {
      opl: 'temporal_service_process_supervision_only',
      scheduler: 'independent_temporal_schedule_lifecycle',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
