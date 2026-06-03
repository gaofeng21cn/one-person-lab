import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import type { WorkspaceBinding } from '../workspace-registry.ts';
import {
  buildManagedShellEnvWithUvCacheRecovery,
  buildManagedShellRecoveryTmpRoot,
  buildManagedShellCommandEnv,
  prepareManagedShellCommandCwd,
  recordManagedShellUvCacheRecovery,
} from '../managed-shell-command-env.ts';
import { materializeFamilyTransitionSurfaces } from './family-transition-materializer.ts';
import { normalizeManifest } from './normalizers.ts';
import { isRecord } from './shared-utils.ts';
import type { DomainManifestCatalogEntry } from './types.ts';

type DomainManifestErrorCode = 'command_failed' | 'command_timeout' | 'invalid_json' | 'invalid_manifest';
type JsonRecord = Record<string, unknown>;
export type ManifestCommandTimeoutPolicy = 'env_or_default' | 'fixed';
const DEFAULT_TRANSITION_MATERIALIZATION_TIMEOUT_MS = 1_000;

export function resolveManifestCommandTimeoutMs(
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
) {
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
  const materialized = options.materializeFamilyTransitions === false
    ? parsed
    : materializeFamilyTransitionSurfaces(parsed, {
      binding,
      timeoutMs,
      materializationTimeoutMs:
        options.transitionMaterializationTimeoutMs ?? DEFAULT_TRANSITION_MATERIALIZATION_TIMEOUT_MS,
    });
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: manifestCommand,
    status: 'resolved',
    manifest: normalizeManifest(materialized),
    error: null,
  };
}

function parseManifestPayload(stdout: string) {
  const parsed = JSON.parse(stdout);
  if (!isRecord(parsed)) {
    throw new Error('Manifest payload must be a JSON object.');
  }
  return parsed;
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

  const timeoutPolicy = options.timeoutPolicy
    ?? (options.timeoutMs === undefined ? 'env_or_default' : 'fixed');
  const timeoutMs = resolveManifestCommandTimeoutMs(options.timeoutMs, timeoutPolicy);
  const baseEnv = process.env;
  let result = executeManifestCommand(
    binding,
    manifestCommand,
    timeoutMs,
    buildManagedShellEnvWithUvCacheRecovery(binding.workspace_path, baseEnv),
  );
  if (shouldRetryWithFreshUvCache(result)) {
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
  }

  const parseResolvedStdout = () => {
    const parsed = parseManifestPayload(result.stdout ?? '');
    return buildResolvedManifestEntry(projectId, project, binding, manifestCommand, parsed, timeoutMs, {
      materializeFamilyTransitions: options.materializeFamilyTransitions,
      transitionMaterializationTimeoutMs: options.transitionMaterializationTimeoutMs,
    });
  };

  if (commandTimedOut(result)) {
    if ((result.stdout ?? '').trim().length > 0) {
      try {
        return parseResolvedStdout();
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
    return parseResolvedStdout();
  } catch (error) {
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
}
