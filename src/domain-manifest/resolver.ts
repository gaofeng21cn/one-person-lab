import { spawnSync } from 'node:child_process';

import type { WorkspaceBinding } from '../workspace-registry.ts';
import {
  buildManagedShellCommandEnv,
  prepareManagedShellCommandCwd,
} from '../managed-shell-command-env.ts';
import { normalizeManifest } from './normalizers.ts';
import { isRecord } from './shared-utils.ts';
import type { DomainManifestCatalogEntry } from './types.ts';

type DomainManifestErrorCode = 'command_failed' | 'command_timeout' | 'invalid_json' | 'invalid_manifest';
type JsonRecord = Record<string, unknown>;

export function resolveManifestCommandTimeoutMs(defaultTimeoutMs?: number) {
  if (defaultTimeoutMs !== undefined) {
    return Number.isInteger(defaultTimeoutMs) && defaultTimeoutMs > 0 ? defaultTimeoutMs : 30_000;
  }
  const raw = process.env.OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 30_000;
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

function executeManifestCommand(binding: WorkspaceBinding, manifestCommand: string, timeoutMs: number) {
  const commandCwd = prepareManagedShellCommandCwd(binding.workspace_path, manifestCommand);
  try {
    return spawnSync('/bin/bash', ['-lc', manifestCommand], {
      cwd: commandCwd.cwd,
      encoding: 'utf8',
      env: buildManagedShellCommandEnv(binding.workspace_path),
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
): DomainManifestCatalogEntry {
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: manifestCommand,
    status: 'resolved',
    manifest: normalizeManifest(parsed),
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
  options: { timeoutMs?: number } = {},
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

  const timeoutMs = resolveManifestCommandTimeoutMs(options.timeoutMs);
  const result = executeManifestCommand(binding, manifestCommand, timeoutMs);

  if (commandTimedOut(result)) {
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
    const parsed = parseManifestPayload(result.stdout ?? '');
    return buildResolvedManifestEntry(projectId, project, binding, manifestCommand, parsed);
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
