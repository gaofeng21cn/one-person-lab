import { randomUUID } from 'node:crypto';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { createProjectScopeId } from '../execution-scope.ts';
import {
  buildWorkspaceCatalogPayload,
  findAllowedProject,
  setProjectActiveBinding,
} from './catalog.ts';
import { inspectWorkspacePathCurrentness } from './maintenance.ts';
import {
  normalizeOptionalString,
  nowIso,
  readWorkspaceRegistryFile,
  writeWorkspaceRegistryFile,
} from './registry-io.ts';
import {
  buildWorkspaceLocator,
  normalizeWorkspaceBindingPath,
  normalizeWorkspacePath,
  resolveStandardAgentInterfaceForWorkspace,
} from './locator.ts';
import type { WorkspaceRegistryOptions } from './types.ts';

function findBindingOrThrow(
  registry: ReturnType<typeof readWorkspaceRegistryFile>,
  projectId: string,
  absolutePath: string,
) {
  const binding = registry.bindings.find((entry) =>
    entry.project_id === projectId && entry.workspace_path === absolutePath,
  );

  if (!binding) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Workspace binding not found for the requested project and path.',
      {
        project_id: projectId,
        workspace_path: absolutePath,
      },
    );
  }

  return binding;
}

function findBinding(
  registry: ReturnType<typeof readWorkspaceRegistryFile>,
  projectId: string,
  absolutePath: string,
) {
  return registry.bindings.find((entry) =>
    entry.project_id === projectId && entry.workspace_path === absolutePath,
  ) ?? null;
}

function assertRequestedWorkspaceProjectScope(
  registry: ReturnType<typeof readWorkspaceRegistryFile>,
  projectId: string,
  absolutePath: string,
  requestedProjectScopeId: string,
) {
  const existing = findBinding(registry, projectId, absolutePath);
  if (existing && existing.project_scope_id !== requestedProjectScopeId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace binding cannot be rebound to a different project scope.',
      {
        binding_id: existing.binding_id,
        existing_project_scope_id: existing.project_scope_id,
        requested_project_scope_id: requestedProjectScopeId,
      },
    );
  }

  const scopeBindings = registry.bindings.filter((binding) =>
    binding.project_scope_id === requestedProjectScopeId,
  );
  const conflictingScopeOwner = scopeBindings.find((binding) => binding.project_id !== projectId);
  if (conflictingScopeOwner) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace project scope is already owned by a different project surface.',
      {
        project_scope_id: requestedProjectScopeId,
        requested_project_id: projectId,
        existing_project_id: conflictingScopeOwner.project_id,
        existing_binding_id: conflictingScopeOwner.binding_id,
      },
    );
  }
  if (scopeBindings.length === 0) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Workspace project scope is not registered.',
      { project_id: projectId, project_scope_id: requestedProjectScopeId },
    );
  }
}

export function preflightWorkspaceProjectScope(
  projectId: string,
  workspacePath: string,
  requestedProjectScopeId: string,
) {
  assertRequestedWorkspaceProjectScope(
    readWorkspaceRegistryFile(),
    projectId,
    normalizeWorkspaceBindingPath(workspacePath),
    requestedProjectScopeId,
  );
}

export function bindWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  const project = findAllowedProject(contracts, options.projectId);
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const requestedProjectScopeId = normalizeOptionalString(options.projectScopeId);
  if (requestedProjectScopeId) {
    assertRequestedWorkspaceProjectScope(registry, project.project_id, absolutePath, requestedProjectScopeId);
  }
  const existing = findBinding(registry, project.project_id, absolutePath);
  const timestamp = nowIso();
  const binding = existing ?? {
    binding_id: randomUUID(),
    project_scope_id: requestedProjectScopeId ?? createProjectScopeId(),
    project_id: project.project_id,
    project: project.project,
    workspace_path: absolutePath,
    label: null,
    status: 'inactive' as const,
    direct_entry: {
      command: null,
      manifest_command: null,
      url: null,
      workspace_locator: null,
    },
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  };

  const resolvedStandardInterface = resolveStandardAgentInterfaceForWorkspace(
    project.project_id,
    project.project,
    absolutePath,
    options.workspaceRoot,
  );
  const workspaceLocator = buildWorkspaceLocator(resolvedStandardInterface?.descriptor ?? null, absolutePath, {
    workspaceRoot: options.workspaceRoot,
    profileRef: options.profileRef,
    inputPath: options.inputPath,
  });

  binding.project = project.project;
  binding.label = normalizeOptionalString(options.label);
  binding.status = 'active';
  binding.direct_entry = {
    command: normalizeOptionalString(options.entryCommand),
    manifest_command: normalizeOptionalString(options.manifestCommand),
    url: normalizeOptionalString(options.entryUrl),
    workspace_locator: workspaceLocator,
  };
  binding.updated_at = timestamp;
  binding.archived_at = null;

  if (!existing) {
    registry.bindings.push(binding);
  }

  setProjectActiveBinding(registry.bindings, project.project_id, binding.binding_id);
  writeWorkspaceRegistryFile(registry);
  return buildWorkspaceCatalogPayload(contracts, registry, 'bind', binding);
}

export function activateWorkspaceBinding(
  contracts: FrameworkContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  findAllowedProject(contracts, options.projectId);
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const binding = findBindingOrThrow(registry, options.projectId, absolutePath);

  if (binding.status === 'archived') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Archived workspace bindings must be rebound before activation.',
      {
        binding_id: binding.binding_id,
      },
    );
  }

  binding.status = 'active';
  binding.updated_at = nowIso();
  setProjectActiveBinding(registry.bindings, binding.project_id, binding.binding_id);
  writeWorkspaceRegistryFile(registry);
  return buildWorkspaceCatalogPayload(contracts, registry, 'activate', binding);
}

export function archiveWorkspaceBinding(
  contracts: FrameworkContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  const absolutePath = normalizeWorkspaceBindingPath(options.workspacePath);
  const binding = findBindingOrThrow(registry, options.projectId, absolutePath);

  binding.status = 'archived';
  binding.updated_at = nowIso();
  binding.archived_at = nowIso();
  writeWorkspaceRegistryFile(registry);
  return buildWorkspaceCatalogPayload(contracts, registry, 'archive', binding);
}

export function getActiveWorkspaceBinding(projectId: string) {
  return readWorkspaceRegistryFile().bindings.find((binding) =>
    binding.project_id === projectId && binding.status === 'active',
  ) ?? null;
}

export function listWorkspaceBindings() {
  return readWorkspaceRegistryFile().bindings;
}

export function resolveWorkspaceBinding(projectId: string, explicitWorkspacePath?: string) {
  const registry = readWorkspaceRegistryFile();

  if (explicitWorkspacePath) {
    return findBinding(registry, projectId, normalizeWorkspacePath(explicitWorkspacePath));
  }

  const binding = registry.bindings.find((entry) =>
    entry.project_id === projectId && entry.status === 'active',
  ) ?? null;
  if (!binding) {
    return null;
  }
  const currentness = inspectWorkspacePathCurrentness(binding.workspace_path);
  if (currentness.status !== 'current') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Active workspace binding does not resolve to a live workspace directory.',
      {
        failure_code: 'active_workspace_binding_not_current',
        binding_id: binding.binding_id,
        project_id: binding.project_id,
        workspace_path: binding.workspace_path,
        workspace_path_currentness: currentness,
      },
    );
  }
  return binding;
}

export function resolveWorkspaceLocator(projectId: string, explicitWorkspacePath?: string) {
  const binding = resolveWorkspaceBinding(projectId, explicitWorkspacePath);
  const absolutePath = explicitWorkspacePath ? normalizeWorkspacePath(explicitWorkspacePath) : binding?.workspace_path ?? null;

  return {
    project_id: projectId,
    requested_path: explicitWorkspacePath ?? null,
    absolute_path: absolutePath,
    source: explicitWorkspacePath ? 'explicit_path' : binding ? 'workspace_registry' : 'none',
    binding,
  };
}
