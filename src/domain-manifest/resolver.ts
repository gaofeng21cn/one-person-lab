import { spawnSync } from 'node:child_process';

import type { WorkspaceBinding } from '../workspace-registry.ts';
import { normalizeManifest } from './normalizers.ts';
import { isRecord } from './shared-utils.ts';
import type { DomainManifestCatalogEntry } from './types.ts';

type DomainManifestErrorCode = 'command_failed' | 'invalid_json' | 'invalid_manifest';

function buildCommandFailureEntry(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
  code: DomainManifestErrorCode,
  message: string,
  stdout: string,
  stderr: string,
): DomainManifestCatalogEntry {
  return {
    project_id: projectId,
    project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_command: binding.direct_entry.manifest_command,
    status:
      code === 'invalid_json'
        ? 'invalid_json'
        : code === 'invalid_manifest'
          ? 'invalid_manifest'
          : 'command_failed',
    manifest: null,
    error: {
      code,
      message,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
    },
  };
}

export function resolveBindingManifest(
  projectId: string,
  project: string,
  binding: WorkspaceBinding,
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

  const result = spawnSync('/bin/bash', ['-lc', manifestCommand], {
    cwd: binding.workspace_path,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

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

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout ?? '');
  } catch (error) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'invalid_json',
      error instanceof Error ? error.message : 'Manifest command did not return valid JSON.',
      result.stdout ?? '',
      result.stderr ?? '',
    );
  }

  try {
    if (!isRecord(parsed)) {
      throw new Error('Manifest payload must be a JSON object.');
    }

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
  } catch (error) {
    return buildCommandFailureEntry(
      projectId,
      project,
      binding,
      'invalid_manifest',
      error instanceof Error ? error.message : 'Manifest payload does not satisfy the minimum discovery contract.',
      result.stdout ?? '',
      result.stderr ?? '',
    );
  }
}
