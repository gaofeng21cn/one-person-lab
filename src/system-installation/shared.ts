import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GatewayContractError } from '../contracts.ts';
import type { OplUpdateChannel } from '../system-preferences.ts';

export type OplModuleId =
  | 'medautoscience'
  | 'meddeepscientist'
  | 'medautogrant'
  | 'redcube';

export type OplModuleAction =
  | 'install'
  | 'update'
  | 'reinstall'
  | 'remove';

export type OplEngineId = 'codex' | 'hermes';

export type OplEngineAction =
  | 'install'
  | 'update'
  | 'reinstall'
  | 'remove';

export type OplSystemAction =
  | 'repair'
  | 'reinstall_support'
  | 'update'
  | 'reconcile_modules'
  | 'update_channel'
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
  scope: 'domain_module' | 'runtime_dependency';
  description: string;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
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

export type ModuleInspection = {
  module_id: OplModuleId;
  label: string;
  scope: 'domain_module' | 'runtime_dependency';
  description: string;
  repo_url: string;
  installed: boolean;
  install_origin: OplModuleInstallOrigin;
  checkout_path: string;
  managed_checkout_path: string;
  health_status: 'ready' | 'missing' | 'invalid_checkout' | 'dirty';
  git: GitRepoSnapshot | null;
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
};

export type OplSystemActionInput = Partial<{
  channel: OplUpdateChannel;
  host: string;
  port: number;
  workspacePath: string;
  sessionsLimit: number;
  basePath: string;
}>;

export type OplTurnkeyInstallInput = Partial<{
  modules: string[];
  host: string;
  port: number;
  workspacePath: string;
  sessionsLimit: number;
  basePath: string;
  skipModules: boolean;
  skipEngines: boolean;
  skipNativeHelperRepair: boolean;
  skipWebOpen: boolean;
  skipGuiOpen: boolean;
  serveWeb: boolean;
}>;

export function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function resolveSiblingWorkspaceRoot() {
  return path.dirname(resolveProjectRoot());
}

export function runCommand(command: string, args: string[], cwd?: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'build_command_failed',
      `Failed to launch command: ${command} ${args.join(' ')}`,
      {
        command,
        args,
        cwd: cwd ?? null,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
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

  throw new GatewayContractError(
    'build_command_failed',
    message,
    {
      ...details,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  );
}
