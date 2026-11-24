import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  nowIso,
  readWorkspaceRegistryFile,
  sha256,
  writeWorkspaceRegistryFile,
} from './registry-io.ts';
import type {
  WorkspacePathCurrentness,
  WorkspaceRegistryMaintenanceOptions,
} from './types.ts';

export function inspectWorkspacePathCurrentness(workspacePath: string): WorkspacePathCurrentness {
  try {
    const stat = fs.statSync(workspacePath);
    return {
      status: stat.isDirectory() ? 'current' : 'not_directory',
      path_exists: true,
      is_directory: stat.isDirectory(),
      cause: null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        status: 'missing',
        path_exists: false,
        is_directory: false,
        cause: null,
      };
    }
    return {
      status: 'unreadable',
      path_exists: fs.existsSync(workspacePath),
      is_directory: false,
      cause: error instanceof Error ? error.message : String(error),
    };
  }
}

function createWorkspaceRegistryBackup(registryFile: string, sourceBytes: Buffer) {
  const backupRoot = path.join(path.dirname(registryFile), 'backups', 'workspace-registry');
  fs.mkdirSync(backupRoot, { recursive: true });
  const timestamp = nowIso().replace(/[-:.]/g, '');
  const backupFile = path.join(
    backupRoot,
    `workspace-registry.${timestamp}.${randomUUID()}.json`,
  );
  fs.writeFileSync(backupFile, sourceBytes, { flag: 'wx' });
  return {
    path: backupFile,
    sha256: sha256(fs.readFileSync(backupFile)),
    source_registry_sha256: sha256(sourceBytes),
  };
}

export function pruneWorkspaceRegistry(options: WorkspaceRegistryMaintenanceOptions = {}) {
  const paths = resolveOplStatePaths();
  const registry = readWorkspaceRegistryFile();
  const registryExists = fs.existsSync(paths.workspace_registry_file);
  const sourceBytes = registryExists ? fs.readFileSync(paths.workspace_registry_file) : null;
  const assessments = registry.bindings.map((binding) => {
    const currentness = inspectWorkspacePathCurrentness(binding.workspace_path);
    return {
      binding,
      currentness,
      candidate: currentness.status === 'missing' && binding.status !== 'active',
      activeBlocker: currentness.status !== 'current' && binding.status === 'active',
    };
  });
  const candidates = assessments.filter((assessment) => assessment.candidate);
  const activeBlockers = assessments.filter((assessment) => assessment.activeBlocker);
  const retainedBindings = assessments.filter((assessment) => !assessment.candidate);
  const apply = options.apply === true;
  const mutationApplied = apply && candidates.length > 0 && activeBlockers.length === 0;
  let backup = null;

  if (apply && activeBlockers.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace registry prune is blocked because an active binding does not resolve to a live workspace directory.',
      {
        failure_code: 'active_workspace_binding_not_current',
        registry_file: paths.workspace_registry_file,
        mutation_applied: false,
        active_binding_blockers: activeBlockers.map(({ binding, currentness }) => ({
          binding_id: binding.binding_id,
          project_id: binding.project_id,
          workspace_path: binding.workspace_path,
          workspace_path_currentness: currentness,
        })),
      },
    );
  }

  if (mutationApplied) {
    if (!sourceBytes) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Workspace registry prune cannot apply without an existing registry file to back up.',
        { file: paths.workspace_registry_file },
      );
    }
    backup = createWorkspaceRegistryBackup(paths.workspace_registry_file, sourceBytes);
    writeWorkspaceRegistryFile({
      version: 'g2',
      bindings: retainedBindings.map((assessment) => assessment.binding),
    });
  }

  const finalBytes = fs.existsSync(paths.workspace_registry_file)
    ? fs.readFileSync(paths.workspace_registry_file)
    : null;
  return {
    version: 'g2',
    workspace_registry_maintenance: {
      surface_kind: 'opl_workspace_registry_currentness',
      action: 'prune',
      mode: apply ? 'apply' : 'dry_run',
      status: activeBlockers.length > 0
        ? 'blocked_active_binding_not_current'
        : candidates.length > 0
          ? 'stale_bindings_detected'
          : 'current',
      mutation_applied: mutationApplied,
      no_changes_required: candidates.length === 0,
      state_dir: paths.state_dir,
      registry_file: paths.workspace_registry_file,
      registry_sha256_before: sourceBytes ? sha256(sourceBytes) : null,
      registry_sha256_after: finalBytes ? sha256(finalBytes) : null,
      backup,
      criteria: {
        workspace_path_must_be_missing: true,
        binding_must_not_be_active: true,
        path_classification_uses_filesystem_state_only: true,
      },
      summary: {
        bindings_before: registry.bindings.length,
        prune_candidates: candidates.length,
        pruned_bindings: mutationApplied ? candidates.length : 0,
        active_binding_blockers: activeBlockers.length,
        bindings_after: mutationApplied ? retainedBindings.length : registry.bindings.length,
        retained_bindings: retainedBindings.length,
      },
      candidates: candidates.map(({ binding, currentness }) => ({
        binding_id: binding.binding_id,
        project_id: binding.project_id,
        project: binding.project,
        status: binding.status,
        workspace_path: binding.workspace_path,
        reason: 'workspace_path_missing_non_active_binding',
        workspace_path_currentness: currentness,
      })),
      active_binding_blockers: activeBlockers.map(({ binding, currentness }) => ({
        binding_id: binding.binding_id,
        project_id: binding.project_id,
        project: binding.project,
        status: binding.status,
        workspace_path: binding.workspace_path,
        reason: 'active_binding_workspace_path_not_current',
        workspace_path_currentness: currentness,
      })),
      retained_bindings: retainedBindings.map(({ binding, currentness, activeBlocker }) => ({
        binding_id: binding.binding_id,
        project_id: binding.project_id,
        project: binding.project,
        status: binding.status,
        workspace_path: binding.workspace_path,
        workspace_path_currentness: currentness,
        retention_reason: currentness.status === 'current'
          ? 'workspace_path_exists'
          : activeBlocker
            ? 'active_binding_fail_closed'
            : 'path_exists_but_is_not_a_directory_or_is_unreadable',
      })),
      authority_boundary: {
        deletes_existing_workspace_paths: false,
        deletes_active_bindings: false,
        removes_only_missing_non_active_registry_entries: true,
        default_mode: 'dry_run',
        apply_requires_prewrite_backup: true,
        backup_is_byte_exact_and_retained_for_rollback: true,
      },
    },
  };
}
