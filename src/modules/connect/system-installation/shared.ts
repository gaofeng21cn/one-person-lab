import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { OplUpdateChannel } from '../../../kernel/system-preferences.ts';

export type OplModuleId =
  | 'medautoscience'
  | 'meddeepscientist'
  | 'medautogrant'
  | 'oplmetaagent'
  | 'oplbookforge'
  | 'redcube'
  | 'scholarskills';

export type OplModuleAction =
  | 'install'
  | 'update'
  | 'sync'
  | 'reinstall'
  | 'remove';

export type OplEngineId = 'codex';

export type OplEngineAction =
  | 'install'
  | 'update'
  | 'reinstall'
  | 'remove';

export type OplSystemAction =
  | 'repair'
  | 'reinstall_support'
  | 'update'
  | 'startup_maintenance'
  | 'seed_apply'
  | 'dependency_maintenance'
  | 'update_channel'
  | 'developer_supervisor'
  | 'repair_native_helpers';

export type OplModuleInstallOrigin =
  | 'managed_root'
  | 'sibling_workspace'
  | 'env_override'
  | 'missing'
  | 'invalid_checkout';

export type DomainModuleSpec = {
  module_id: OplModuleId;
  label: string;
  repo_name: string;
  repo_url: string;
  scope: 'domain_module' | 'runtime_dependency' | 'framework_capability_package';
  default_install: boolean;
  description: string;
  capability_dependencies?: readonly ModuleCapabilityDependency[];
};

export type ModuleCapabilityDependency = {
  module_id: OplModuleId;
  package_id: string;
  kind: 'framework_capability_package';
  required: true;
  version_requirement: string;
  capability_abi: string;
  consumer_profile_id?: string;
  required_export_ids: readonly string[];
  required_module_ids: readonly string[];
  manifest_url?: string;
  required_for: readonly string[];
  install_owner: 'one-person-lab';
  install_update_source: 'ghcr_capability_packages_channel';
  codex_distribution?: 'bundled';
  opl_distribution?: 'managed_dependency';
  developer_distribution?: 'source_checkout';
  sync_scopes: readonly ['workspace', 'quest'];
  authority_boundary: {
    can_write_domain_truth: false;
    can_sign_owner_receipt: false;
    can_create_typed_blocker: false;
    can_write_runtime_queue: false;
  };
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  signal?: NodeJS.Signals | null;
};

export type RunCommandOptions = {
  maxBuffer?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

type SpawnCommand = {
  command: string;
  args: string[];
};

export type OplShellActionSpec = {
  strategy: 'env_override' | 'builtin' | 'manual_required';
  command_preview: string[];
  note: string | null;
  executable: ((cwd?: string) => CommandResult) | null;
};

export type OplInitializeSectionId =
  | 'workspace_root'
  | 'environment'
  | 'modules'
  | 'settings'
  | 'system';

export type OplInitializePhase = 'workspace_root' | 'environment' | 'modules' | 'review';

export type OplSystemInitializeEventPhase =
  | 'environment'
  | 'codex'
  | 'family_runtime_provider'
  | 'native_helpers'
  | 'modules'
  | 'developer_mode'
  | 'settings'
  | 'workspace_root'
  | 'recommended_skills'
  | 'gui_shell'
  | 'summary';

export type OplSystemInitializeEventType =
  | 'phase_start'
  | 'phase_done'
  | 'complete';

export type OplSystemInitializeEvent = {
  surface_id: 'opl_system_initialize_event';
  event_type: OplSystemInitializeEventType;
  phase: OplSystemInitializeEventPhase;
  label: string;
  sequence: number;
  observed_at: string;
  duration_ms?: number;
  payload?: Record<string, unknown>;
};

export type OplSystemInitializeEventHandler = (event: OplSystemInitializeEvent) => void;

export function createOplSystemInitializeEventEmitter(
  onEvent: OplSystemInitializeEventHandler | undefined,
) {
  let sequence = 0;

  const emit = (
    eventType: 'phase_start' | 'phase_done',
    phase: OplSystemInitializeEventPhase,
    label: string,
    detail: Record<string, unknown> = {},
  ) => {
    if (!onEvent) return;
    onEvent({
      surface_id: 'opl_system_initialize_event',
      event_type: eventType,
      phase,
      label,
      sequence: ++sequence,
      observed_at: new Date().toISOString(),
      ...detail,
    });
  };

  return {
    relay: (event: OplSystemInitializeEvent) => {
      if (!onEvent) return;
      onEvent({
        ...event,
        sequence: ++sequence,
      });
    },
    emitStart: (phase: OplSystemInitializeEventPhase, label: string) => emit('phase_start', phase, label),
    emitDone: (
      phase: OplSystemInitializeEventPhase,
      label: string,
      startedAt: number,
      payload: Record<string, unknown> = {},
    ) => emit('phase_done', phase, label, {
      duration_ms: Date.now() - startedAt,
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  };
}

export async function withOplSystemInitializeEventPhase<T>(
  events: ReturnType<typeof createOplSystemInitializeEventEmitter>,
  phase: OplSystemInitializeEventPhase,
  label: string,
  build: () => T | Promise<T>,
  payload: (result: T) => Record<string, unknown> = () => ({}),
) {
  const startedAt = Date.now();
  events.emitStart(phase, label);
  const result = await build();
  events.emitDone(phase, label, startedAt, payload(result));
  return result;
}

export type OplInitializeActionDescriptor = {
  action_id: string;
  label: string;
  description: string;
  section_id: OplInitializeSectionId;
  endpoint: string;
  method: 'GET' | 'POST';
  request_fields: string[];
  payload_template: Record<string, string> | null;
};

export type OplInitializeChecklistItem = {
  item_id: string;
  label: string;
  status: string;
  required: boolean;
  blocking: boolean;
  readiness_layer: 'core_launch' | 'full_readiness' | 'optional';
  severity: 'blocking' | 'maintenance' | 'info';
  user_action_required: boolean;
  auto_action_available: boolean;
  action_command_ref: string | null;
  last_attempt: Record<string, unknown> | null;
  next_visible_step: string;
  section_id: OplInitializeSectionId;
  detail_summary: string;
  endpoint: string;
  action_endpoint: string;
  action: OplInitializeActionDescriptor | null;
};

export type GitRepoSnapshot = {
  branch: string | null;
  head_sha: string | null;
  short_sha: string | null;
  origin_url: string | null;
  upstream_ref: string | null;
  upstream_head_sha: string | null;
  ahead_count: number | null;
  behind_count: number | null;
  sync_status: 'synced' | 'ahead' | 'behind' | 'diverged' | 'no_upstream' | 'unknown';
  dirty: boolean;
};

export type ModuleSourcePolicy = {
  effective_install_update_source: 'package_channel' | 'git_checkout' | 'full_runtime';
  configured_by:
    | 'agent_latest_package_channel'
    | 'developer_mode'
    | 'env_source_mode'
    | 'module_path_override'
    | 'module_repo_url_override'
    | 'full_runtime_override'
    | 'developer_mode_managed_override'
    | 'developer_mode_package_override';
  source_preference: 'auto' | 'managed' | 'developer';
  developer_checkout_path: string;
  fallback_reason: 'developer_checkout_unavailable' | 'developer_mode_inactive' | null;
  package_channel_auto_update: boolean;
  app_setting_surface: 'Developer Mode' | null;
  low_level_override_env: string | null;
};

export type ModuleInspection = {
  module_id: OplModuleId;
  label: string;
  scope: 'domain_module' | 'runtime_dependency' | 'framework_capability_package';
  default_install: boolean;
  description: string;
  capability_dependencies: readonly ModuleCapabilityDependency[];
  repo_url: string;
  installed: boolean;
  install_origin: OplModuleInstallOrigin;
  checkout_path: string;
  managed_checkout_path: string;
  health_status: 'ready' | 'missing' | 'invalid_checkout' | 'dirty';
  git: GitRepoSnapshot | null;
  source_policy: ModuleSourcePolicy;
  capabilities: {
    source_channel: {
      status: 'ready' | 'limited' | 'blocked';
      level: 'managed_package_channel' | 'local_checkout' | 'full_runtime' | 'missing' | 'invalid_checkout';
      source: ModuleSourcePolicy['configured_by'];
      impact: string;
    };
  };
  available_actions: OplModuleAction[];
  recommended_action: OplModuleAction | null;
};

export type ModuleExecResult = {
  module_id: OplModuleId;
  status: 'completed';
  module: ModuleInspection;
  working_directory: string;
  command_preview: string[];
  exit_code: number;
  stdout: string;
  stderr: string;
  result: Record<string, unknown> | null;
  max_buffer_bytes?: number;
};

export type OplSystemActionInput = Partial<{
  channel: OplUpdateChannel;
  developerSupervisorEnabled: 'auto' | 'on' | 'off';
  developerSupervisorMode: 'external_observe' | 'developer_apply_safe';
  developerSupervisorAutoEnableGithubLogin: string;
  developerSupervisorModuleId: string;
  developerSupervisorModuleSource: 'auto' | 'managed' | 'developer';
  dependencyProfile: string;
  startupMaintenanceScope: 'all' | 'runtime_substrate';
  seedDir: string;
  dataDir: string;
  projectsDir: string;
  apply: boolean;
  host: string;
  port: number;
  workspacePath: string;
  sessionsLimit: number;
  basePath: string;
}>;

export type OplTurnkeyInstallInput = Partial<{
  headless: boolean;
  withApp: boolean;
  host: string;
  port: number;
  workspacePath: string;
  sessionsLimit: number;
  basePath: string;
  skipPackages: boolean;
  skipEngines: boolean;
  noOnlineRuntime: boolean;
  skipNativeHelperRepair: boolean;
  skipWebOpen: boolean;
  serveWeb: boolean;
}>;

export function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
}

export function resolveSiblingWorkspaceRoot() {
  return path.dirname(resolveProjectRoot());
}

function findExecutableOnPath(command: string) {
  if (command.includes(path.sep)) {
    return path.resolve(command);
  }
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function recoverBrokenBundledNpmShim(command: string, args: string[]): SpawnCommand | null {
  if (command !== 'npm') {
    return null;
  }
  const npmPath = findExecutableOnPath(command);
  if (!npmPath || !fs.existsSync(npmPath)) {
    return null;
  }
  let shim = '';
  try {
    shim = fs.readFileSync(npmPath, 'utf8');
  } catch {
    return null;
  }
  if (!shim.includes("require('../lib/cli.js')")) {
    return null;
  }
  const binDir = path.dirname(npmPath);
  const legacyCli = path.resolve(binDir, '..', 'lib', 'cli.js');
  if (fs.existsSync(legacyCli)) {
    return null;
  }
  const nodePath = path.join(binDir, process.platform === 'win32' ? 'node.exe' : 'node');
  const npmCli = path.resolve(binDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(nodePath) || !fs.existsSync(npmCli)) {
    return null;
  }
  return {
    command: nodePath,
    args: [npmCli, ...args],
  };
}

function resolveSpawnCommand(command: string, args: string[]): SpawnCommand {
  return recoverBrokenBundledNpmShim(command, args) ?? { command, args };
}

export function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  options: RunCommandOptions = {},
): CommandResult {
  const spawnCommand = resolveSpawnCommand(command, args);
  const result = spawnSync(spawnCommand.command, spawnCommand.args, {
    cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    ...(options.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
    ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
  });

  if (result.error) {
    const errorCode = 'code' in result.error ? result.error.code : null;
    if (errorCode === 'ETIMEDOUT') {
      return {
        exitCode: 124,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        timedOut: true,
        signal: result.signal,
      };
    }
    throw new FrameworkContractError(
      'build_command_failed',
      `Failed to launch command: ${command} ${args.join(' ')}`,
      {
        command,
        args,
        resolved_command: spawnCommand.command,
        resolved_args: spawnCommand.args,
        cwd: cwd ?? null,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: false,
    signal: result.signal,
  };
}

export function normalizeOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

export function getShellBinary() {
  return process.env.SHELL?.trim() || '/bin/bash';
}

export function runShellCommand(command: string, cwd?: string): CommandResult {
  return runCommand(getShellBinary(), ['-lc', command], cwd);
}

export function runGit(args: string[], cwd?: string) {
  return runCommand('git', args, cwd);
}

export function assertGitSuccess(
  result: CommandResult,
  message: string,
  details: Record<string, unknown>,
) {
  if (result.exitCode === 0) {
    return;
  }

  throw new FrameworkContractError(
    'build_command_failed',
    message,
    {
      ...details,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  );
}
