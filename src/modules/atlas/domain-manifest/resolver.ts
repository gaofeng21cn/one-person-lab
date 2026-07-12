import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';

import type { WorkspaceBinding } from '../../workspace/index.ts';
import {
  buildManagedShellEnvWithUvCacheRecovery,
  buildManagedShellRecoveryTmpRoot,
  buildManagedShellCommandEnv,
  prepareManagedShellCommandCwd,
  recordManagedShellUvCacheRecovery,
} from '../../../kernel/managed-shell-command-env.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { normalizeManifest } from './normalizers.ts';
import { isRecord } from './shared-utils.ts';
import type { DomainManifestCatalogEntry } from './types.ts';

type DomainManifestErrorCode =
  | 'workspace_missing'
  | 'command_failed'
  | 'command_timeout'
  | 'invalid_json'
  | 'invalid_manifest';
type JsonRecord = Record<string, unknown>;
export type ManifestCommandTimeoutPolicy = 'env_or_default' | 'fixed';
type ManifestCommandResult = SpawnSyncReturns<string>;
function hydrateVisualTransitionAdapterProfileRegistry(parsed: JsonRecord, _workspacePath: string) {
  // Legacy visual transition surfaces are inert diagnostics. Do not hydrate a
  // second executable route model beside the Codex-selected stage route.
  return parsed;
}

function resolveManifestCommandTimeoutMs(
  defaultTimeoutMs = 30_000,
  policy: ManifestCommandTimeoutPolicy = 'env_or_default',
) {
  const raw = process.env.OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (policy === 'env_or_default' && Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return Number.isInteger(defaultTimeoutMs) && defaultTimeoutMs > 0 ? defaultTimeoutMs : 30_000;
}

function commandTimedOut(result: ReturnType<typeof spawnSync>) {
  const errorRecord = result.error && typeof result.error === 'object' && 'code' in result.error
    ? result.error as Error & { code?: unknown }
    : null;
  const errorCode = typeof errorRecord?.code === 'string'
    ? errorRecord.code
    : null;
  return errorCode === 'ETIMEDOUT' || result.signal === 'SIGTERM';
}

function resultText(result: ReturnType<typeof spawnSync>) {
  return [
    result.error?.message,
    result.stderr,
    result.stdout,
  ].filter(Boolean).join('\n');
}

function shouldRetryWithFreshUvCache(result: ReturnType<typeof spawnSync>) {
  if (commandTimedOut(result) || (result.status ?? 1) === 0) {
    return false;
  }
  const text = resultText(result);
  return /Failed to install:/i.test(text)
    && /archive-v0/i.test(text)
    && /METADATA/i.test(text)
    && /No such file or directory/i.test(text);
}

function commandStatus(code: DomainManifestErrorCode) {
  if (code === 'invalid_json' || code === 'invalid_manifest' || code === 'command_timeout') {
    return code;
  }
  return 'command_failed';
}

function buildCommandFailureEntry(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  code: DomainManifestErrorCode,
  message: string,
  stdout: string,
  stderr: string,
  metadata: { timeoutMs?: number } = {},
): DomainManifestCatalogEntry {
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: binding.direct_entry.manifest_command,
    status: commandStatus(code),
    manifest: null,
    error: {
      code,
      message,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
      timeout_ms: metadata.timeoutMs ?? null,
    },
  };
}

function executeManifestCommand(
  binding: WorkspaceBinding,
  manifestCommand: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): ManifestCommandResult {
  const commandCwd = prepareManagedShellCommandCwd(binding.workspace_path, manifestCommand, env);
  try {
    return spawnSync('/bin/bash', ['-c', manifestCommand], {
      cwd: commandCwd.cwd,
      encoding: 'utf8',
      env: buildManagedShellCommandEnv(binding.workspace_path, env),
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
    });
  } finally {
    commandCwd.cleanup();
  }
}

function buildResolvedManifestEntry(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  manifestCommand: string,
  parsed: JsonRecord,
  timeoutMs: number,
  options: {
    materializeFamilyTransitions?: boolean;
    transitionMaterializationTimeoutMs?: number;
  } = {},
): DomainManifestCatalogEntry {
  const materialized = hydrateVisualTransitionAdapterProfileRegistry(parsed, binding.workspace_path);
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: manifestCommand,
    status: 'resolved',
    manifest: normalizeManifest(materialized, { repoDir: binding.workspace_path }),
    error: null,
  };
}

function parseManifestPayload(stdout: string) {
  const parsed = parseJsonText(stdout);
  if (!isRecord(parsed)) {
    throw new Error('Manifest payload must be a JSON object.');
  }
  return parsed;
}

function executeManifestCommandWithUvCacheRecovery(
  binding: WorkspaceBinding,
  manifestCommand: string,
  timeoutMs: number,
) {
  const baseEnv = process.env;
  let result = executeManifestCommand(
    binding,
    manifestCommand,
    timeoutMs,
    buildManagedShellEnvWithUvCacheRecovery(binding.workspace_path, baseEnv),
  );
  if (!shouldRetryWithFreshUvCache(result)) {
    return result;
  }

  const firstStatus = result.status ?? 1;
  const firstErrorExcerpt = resultText(result).replace(/\s+/g, ' ').trim().slice(0, 500);
  const retryTmpRoot = buildManagedShellRecoveryTmpRoot(binding.workspace_path, baseEnv);
  fs.mkdirSync(retryTmpRoot, { recursive: true });
  result = executeManifestCommand(binding, manifestCommand, timeoutMs, {
    ...baseEnv,
    OPL_DOMAIN_COMMAND_TMP_ROOT: retryTmpRoot,
  });
  const retryStatus = result.status ?? (result.error ? 127 : 1);
  if (!commandTimedOut(result) && retryStatus === 0) {
    recordManagedShellUvCacheRecovery(binding.workspace_path, baseEnv, {
      recoveryTmpRoot: retryTmpRoot,
      firstExitCode: firstStatus,
      retryExitCode: retryStatus,
      firstErrorExcerpt,
    });
  }
  return result;
}

function buildResolvedEntryFromCommandResult(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  manifestCommand: string,
  result: ManifestCommandResult,
  timeoutMs: number,
  options: {
    materializeFamilyTransitions?: boolean;
    transitionMaterializationTimeoutMs?: number;
  },
) {
  const parsed = parseManifestPayload(result.stdout ?? '');
  return buildResolvedManifestEntry(projectId, project, binding, manifestCommand, parsed, timeoutMs, {
    materializeFamilyTransitions: options.materializeFamilyTransitions,
    transitionMaterializationTimeoutMs: options.transitionMaterializationTimeoutMs,
  });
}

function buildParseFailureEntry(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  result: ManifestCommandResult,
  error: unknown,
) {
  const code = error instanceof SyntaxError ? 'invalid_json' : 'invalid_manifest';
  return buildCommandFailureEntry(
    projectId,
    project,
    binding,
    code,
    error instanceof Error
      ? error.message
      : code === 'invalid_json'
        ? 'Manifest command did not return valid JSON.'
        : 'Manifest payload does not satisfy the minimum discovery contract.',
    result.stdout ?? '',
    result.stderr ?? '',
  );
}

function resolveTimedOutManifestCommand(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  manifestCommand: string,
  result: ManifestCommandResult,
  timeoutMs: number,
  options: {
    materializeFamilyTransitions?: boolean;
    transitionMaterializationTimeoutMs?: number;
  },
) {
  if ((result.stdout ?? '').trim().length > 0) {
    try {
      return buildResolvedEntryFromCommandResult(
        projectId,
        project,
        binding,
        manifestCommand,
        result,
        timeoutMs,
        options,
      );
    } catch {
      // A command that timed out without a complete manifest remains fail-closed.
    }
  }
  return buildCommandFailureEntry(
    projectId,
    project,
    binding,
    'command_timeout',
    'Domain manifest command timed out.',
    result.stdout ?? '',
    result.stderr ?? '',
    { timeoutMs },
  );
}

export function resolveBindingManifest(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  options: {
    timeoutMs?: number;
    timeoutPolicy?: ManifestCommandTimeoutPolicy;
    materializeFamilyTransitions?: boolean;
    transitionMaterializationTimeoutMs?: number;
  } = {},
): DomainManifestCatalogEntry {
  const manifestCommand = binding.direct_entry.manifest_command;
  if (!manifestCommand) {
    return {
      project_id: projectId,
      project,
      binding_id: binding.binding_id,
      workspace_path: binding.workspace_path,
      manifest_command: null,
      status: 'manifest_not_configured',
      manifest: null,
      error: null,
    };
  }
  if (!fs.existsSync(binding.workspace_path)) {
    return {
      project_id: projectId,
      project,
      binding_id: binding.binding_id,
      workspace_path: binding.workspace_path,
      manifest_command: manifestCommand,
      status: 'workspace_missing',
      manifest: null,
      error: {
        code: 'workspace_missing',
        message: 'Active workspace binding path does not exist.',
        stdout: null,
        stderr: null,
        timeout_ms: null,
      },
    };
  }

  const timeoutPolicy = options.timeoutPolicy
    ?? (options.timeoutMs === undefined ? 'env_or_default' : 'fixed');
  const timeoutMs = resolveManifestCommandTimeoutMs(options.timeoutMs, timeoutPolicy);
  const result = executeManifestCommandWithUvCacheRecovery(binding, manifestCommand, timeoutMs);

  if (commandTimedOut(result)) {
    return resolveTimedOutManifestCommand(
      projectId,
      project,
      binding,
      manifestCommand,
      result,
      timeoutMs,
      options,
    );
  }

  if (result.error || (result.status ?? 1) !== 0) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'command_failed',
      'Domain manifest command failed.',
      result.stdout ?? '',
      result.stderr ?? result.error?.message ?? '',
    );
  }

  try {
    return buildResolvedEntryFromCommandResult(
      projectId,
      project,
      binding,
      manifestCommand,
      result,
      timeoutMs,
      options,
    );
  } catch (error) {
    return buildParseFailureEntry(projectId, project, binding, result, error);
  }
}
