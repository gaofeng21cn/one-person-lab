import fs from 'node:fs';
import path from 'node:path';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { createHash, randomUUID } from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import {
  assertStandardAgentDescriptorIdentity,
  readStandardAgentDescriptorInterface,
  type StandardAgentInterface,
  type StandardAgentLocatorField,
} from '../../kernel/standard-agent-interface.ts';
import { readPackageManagedStandardAgentDescriptor } from '../connect/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { listWorkspaceAgentProfiles } from './workspace-agent-defaults.ts';
import { createProjectScopeId, deriveLegacyProjectScopeId } from './execution-scope.ts';

type BoundWorkspaceLocator = {
  surface_kind: string;
  workspace_root: string | null;
  profile_ref: string | null;
  input_path: string | null;
};

type DirectEntryLocator = {
  command: string | null;
  manifest_command: string | null;
  url: string | null;
  workspace_locator: BoundWorkspaceLocator | null;
};

export type WorkspaceBinding = {
  binding_id: string;
  project_scope_id: string;
  project_id: string;
  project: string;
  workspace_path: string;
  label: string | null;
  status: 'active' | 'inactive' | 'archived';
  direct_entry: DirectEntryLocator;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type ProjectWorkspaceBindingContract = {
  surface_id: 'opl_project_workspace_binding_contract';
  project_id: string;
  project: string;
  workspace_locator_surface_kind: string | null;
  required_locator_fields: string[];
  optional_locator_fields: string[];
  quick_bind_hint: string;
};

type WorkspaceRegistryFile = {
  version: 'g2';
  bindings: WorkspaceBinding[];
};

export type WorkspaceCatalogAction =
  | 'catalog'
  | 'bind'
  | 'activate'
  | 'archive'
  | 'launch';

type WorkspaceRegistryOptions = {
  projectId: string;
  projectScopeId?: string;
  workspacePath: string;
  label?: string;
  entryCommand?: string;
  manifestCommand?: string;
  entryUrl?: string;
  workspaceRoot?: string;
  profileRef?: string;
  inputPath?: string;
};

type WorkspaceRegistryMaintenanceOptions = {
  apply?: boolean;
};

export type WorkspacePathCurrentness = {
  status: 'current' | 'missing' | 'not_directory' | 'unreadable';
  path_exists: boolean;
  is_directory: boolean;
  cause: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeWorkspaceLocator(value: unknown): BoundWorkspaceLocator | null {
  if (!isRecord(value)) {
    return null;
  }

  const surfaceKind = normalizeOptionalString(
    typeof value.surface_kind === 'string' ? value.surface_kind : null,
  );
  if (!surfaceKind) {
    return null;
  }

  return {
    surface_kind: surfaceKind,
    workspace_root: normalizeOptionalString(
      typeof value.workspace_root === 'string' ? value.workspace_root : null,
    ),
    profile_ref: normalizeOptionalString(
      typeof value.profile_ref === 'string' ? value.profile_ref : null,
    ),
    input_path: normalizeOptionalString(
      typeof value.input_path === 'string' ? value.input_path : null,
    ),
  };
}

function readWorkspaceRegistryFile(): WorkspaceRegistryFile {
  const paths = resolveOplStatePaths();
  if (!fs.existsSync(paths.workspace_registry_file)) {
    return {
      version: 'g2',
      bindings: [],
    };
  }

  try {
    const parsed = parseJsonText(fs.readFileSync(paths.workspace_registry_file, 'utf8')) as Partial<WorkspaceRegistryFile>;
    if (parsed.version !== 'g2' || !Array.isArray(parsed.bindings)) {
      throw new Error('Invalid workspace registry shape.');
    }

    return {
      version: 'g2',
      bindings: parsed.bindings.map(normalizeWorkspaceBinding),
    };
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Existing workspace registry file is invalid JSON or has an invalid shape.',
      {
        file: paths.workspace_registry_file,
        cause: error instanceof Error ? error.message : 'Unknown workspace registry parse failure.',
      },
    );
  }
}

function normalizeWorkspaceBinding(binding: Partial<WorkspaceBinding>): WorkspaceBinding {
  const bindingId = String(binding.binding_id);
  const projectId = String(binding.project_id);
  const normalized: WorkspaceBinding = {
    binding_id: bindingId,
    project_scope_id: typeof binding.project_scope_id === 'string' && binding.project_scope_id.trim()
      ? binding.project_scope_id.trim()
      : deriveLegacyProjectScopeId({ bindingId, projectId }),
    project_id: projectId,
    project: String(binding.project),
    workspace_path: String(binding.workspace_path),
    label: normalizeOptionalString(String(binding.label ?? '')),
    status:
      binding.status === 'active' || binding.status === 'inactive' || binding.status === 'archived'
        ? binding.status
        : 'inactive',
    direct_entry: {
      command: normalizeOptionalString(binding.direct_entry?.command),
      manifest_command: normalizeOptionalString(binding.direct_entry?.manifest_command),
      url: normalizeOptionalString(binding.direct_entry?.url),
      workspace_locator: normalizeWorkspaceLocator(binding.direct_entry?.workspace_locator),
    },
    created_at: String(binding.created_at),
    updated_at: String(binding.updated_at),
    archived_at: binding.archived_at ? String(binding.archived_at) : null,
  };

  return normalized;
}

function writeWorkspaceRegistryFile(payload: WorkspaceRegistryFile) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.workspace_registry_file, payload);
}

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

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

function allowedProjects(contracts: FrameworkContracts) {
  const agentProfiles = listWorkspaceAgentProfiles();
  const declaredAgentIds = new Set(contracts.domains.domains.flatMap((domain) => {
    const agent = resolveStandardAgent(domain.domain_id) ?? resolveStandardAgent(domain.project);
    return agent?.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP ? [agent.agent_id] : [];
  }));
  const domainProjects = contracts.domains.domains.map((domain) => ({
    project_id: domain.domain_id,
    project: domain.project,
  }));
  const projectIds = new Set(['opl', ...domainProjects.map((entry) => entry.project_id)]);
  const generatedAgentProjects = agentProfiles
    .filter((entry) => !projectIds.has(entry.project_id) && !declaredAgentIds.has(entry.agent_id))
    .map((entry) => ({
      project_id: entry.project_id,
      project: entry.project,
    }));

  return [
    {
      project_id: 'opl',
      project: 'one-person-lab',
    },
    ...domainProjects,
    ...generatedAgentProjects,
  ];
}

function findAllowedProject(contracts: FrameworkContracts, projectId: string) {
  const project = allowedProjects(contracts).find((entry) => entry.project_id === projectId);
  if (!project) {
    throw new FrameworkContractError(
      'domain_not_found',
      'Workspace registry only allows bindings for current OPL project surfaces.',
      {
        project_id: projectId,
        allowed_project_ids: allowedProjects(contracts).map((entry) => entry.project_id),
      },
    );
  }

  return project;
}

function normalizeWorkspaceBindingPath(workspacePath: string) {
  return path.resolve(workspacePath);
}

function normalizeWorkspacePath(workspacePath: string) {
  const absolutePath = normalizeWorkspaceBindingPath(workspacePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Workspace registry commands require an existing workspace directory.',
      {
        workspace_path: absolutePath,
      },
    );
  }

  return absolutePath;
}

function normalizeExistingFilePath(filePath: string | undefined, field: string) {
  const normalized = normalizeOptionalString(filePath);
  if (!normalized) {
    return null;
  }

  const absolutePath = path.resolve(normalized);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Workspace registry locator field ${field} requires an existing file path.`,
      {
        field,
        value: absolutePath,
      },
    );
  }

  return absolutePath;
}

function normalizeExistingDirectoryPath(directoryPath: string | undefined, field: string) {
  const normalized = normalizeOptionalString(directoryPath);
  if (!normalized) {
    return null;
  }

  const absolutePath = path.resolve(normalized);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Workspace registry locator field ${field} requires an existing directory.`,
      {
        field,
        value: absolutePath,
      },
    );
  }

  return absolutePath;
}

function resolveStandardAgentInterfaceForWorkspace(
  projectId: string,
  project: string,
  workspacePath: string,
  workspaceRoot?: string | null,
) {
  const packageManaged = readPackageManagedStandardAgentDescriptor([projectId, project]);
  if (packageManaged) {
    const descriptor = assertStandardAgentDescriptorIdentity(packageManaged, {
      project,
      domain_id: projectId,
    });
    return { descriptor: descriptor.interface, repo_dir: descriptor.repo_dir, source: 'package_lock' as const };
  }
  const configuredFamilyRoot = normalizeOptionalString(process.env.OPL_FAMILY_WORKSPACE_ROOT);
  const candidates = [
    normalizeOptionalString(workspaceRoot),
    workspacePath,
    configuredFamilyRoot ? path.join(configuredFamilyRoot, project) : null,
  ].filter((entry): entry is string => Boolean(entry));

  for (const candidate of [...new Set(candidates.map((entry) => path.resolve(entry)))]) {
    const candidateDescriptor = readStandardAgentDescriptorInterface(candidate);
    if (candidateDescriptor) {
      const descriptor = assertStandardAgentDescriptorIdentity(candidateDescriptor, {
        project,
        domain_id: projectId,
      });
      return { descriptor: descriptor.interface, repo_dir: candidate, source: 'explicit_workspace' as const };
    }
  }
  return null;
}

function validateProjectLocatorOptions(
  standardInterface: StandardAgentInterface | null,
  locatorOptions: {
    workspaceRoot?: string;
    profileRef?: string;
    inputPath?: string;
  },
) {
  const provided: Record<StandardAgentLocatorField, boolean> = {
    workspace_root: Boolean(normalizeOptionalString(locatorOptions.workspaceRoot)),
    workspace_path: false,
    profile_ref: Boolean(normalizeOptionalString(locatorOptions.profileRef)),
    input_path: Boolean(normalizeOptionalString(locatorOptions.inputPath)),
  };
  const accepted = new Set([
    ...(standardInterface?.workspace_binding.required_locator_fields ?? []),
    ...(standardInterface?.workspace_binding.optional_locator_fields ?? []),
    ...(!standardInterface ? ['workspace_root' as const] : []),
  ]);
  const unsupportedLocatorFields = Object.entries(provided)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .filter((key) => !accepted.has(key as StandardAgentLocatorField));

  if (unsupportedLocatorFields.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'The requested workspace locator fields are not supported for this project surface.',
      {
        descriptor_available: Boolean(standardInterface),
        unsupported_locator_fields: unsupportedLocatorFields,
      },
    );
  }
}

function buildWorkspaceLocator(
  standardInterface: StandardAgentInterface | null,
  workspacePath: string,
  options: {
    workspaceRoot?: string;
    profileRef?: string;
    inputPath?: string;
  },
): BoundWorkspaceLocator | null {
  validateProjectLocatorOptions(standardInterface, options);
  if (!standardInterface) {
    const workspaceRoot = normalizeExistingDirectoryPath(options.workspaceRoot, 'workspace_root');
    return workspaceRoot
      ? {
          surface_kind: 'opl_standard_agent_workspace',
          workspace_root: workspaceRoot,
          profile_ref: null,
          input_path: null,
        }
      : null;
  }
  const accepted = new Set([
    ...standardInterface.workspace_binding.required_locator_fields,
    ...standardInterface.workspace_binding.optional_locator_fields,
  ]);
  const values: Record<StandardAgentLocatorField, string | null> = {
    workspace_path: workspacePath,
    workspace_root: accepted.has('workspace_root')
      ? normalizeExistingDirectoryPath(options.workspaceRoot, 'workspace_root') ?? workspacePath
      : null,
    profile_ref: accepted.has('profile_ref')
      ? normalizeExistingFilePath(options.profileRef, 'profile_ref')
      : null,
    input_path: accepted.has('input_path')
      ? normalizeExistingFilePath(options.inputPath, 'input_path')
      : null,
  };
  if (standardInterface.workspace_binding.required_locator_fields.some((field) => !values[field])) {
    return null;
  }
  return {
    surface_kind: standardInterface.workspace_binding.locator_surface_kind,
    workspace_root: values.workspace_root,
    profile_ref: values.profile_ref,
    input_path: values.input_path,
  };
}

function setProjectActiveBinding(
  bindings: WorkspaceBinding[],
  projectId: string,
  activeBindingId: string,
) {
  for (const binding of bindings) {
    if (binding.project_id !== projectId || binding.status === 'archived') {
      continue;
    }

    binding.status = binding.binding_id === activeBindingId ? 'active' : 'inactive';
  }
}

function hasDirectEntry(binding: WorkspaceBinding) {
  return Boolean(binding.direct_entry.command || binding.direct_entry.url);
}

function hasManifest(binding: WorkspaceBinding) {
  return Boolean(binding.direct_entry.manifest_command);
}

function buildProjectBindingContract(
  projectId: string,
  projectName: string,
  bindings: WorkspaceBinding[],
): ProjectWorkspaceBindingContract {
  const activeBinding = bindings.find((binding) =>
    binding.project_id === projectId && binding.status === 'active'
  );
  const resolved = resolveStandardAgentInterfaceForWorkspace(
    projectId,
    projectName,
    activeBinding?.workspace_path ?? process.cwd(),
    activeBinding?.direct_entry.workspace_locator?.workspace_root,
  );
  if (resolved) {
    return {
      surface_id: 'opl_project_workspace_binding_contract',
      project_id: projectId,
      project: projectName,
      workspace_locator_surface_kind: resolved.descriptor.workspace_binding.locator_surface_kind,
      required_locator_fields: resolved.descriptor.workspace_binding.required_locator_fields,
      optional_locator_fields: resolved.descriptor.workspace_binding.optional_locator_fields,
      quick_bind_hint: 'Use the locator fields declared by the selected Standard Agent descriptor.',
    };
  }

  return {
    surface_id: 'opl_project_workspace_binding_contract',
    project_id: projectId,
    project: projectName,
    workspace_locator_surface_kind: null,
    required_locator_fields: [],
    optional_locator_fields: [],
    quick_bind_hint: 'No Standard Agent descriptor is available; provide explicit entry and manifest commands.',
  };
}

function buildProjectCatalogEntry(
  projectId: string,
  projectName: string,
  bindings: WorkspaceBinding[],
) {
  const projectBindings = bindings.filter((binding) => binding.project_id === projectId);
  const activeBinding = projectBindings.find((binding) => binding.status === 'active') ?? null;
  const archivedCount = projectBindings.filter((binding) => binding.status === 'archived').length;
  const inactiveCount = projectBindings.filter((binding) => binding.status === 'inactive').length;
  const directEntryReadyCount = projectBindings.filter((binding) => binding.status !== 'archived' && hasDirectEntry(binding)).length;
  const manifestReadyCount = projectBindings.filter((binding) => binding.status !== 'archived' && hasManifest(binding)).length;
  const lastUpdatedAt = projectBindings
    .map((binding) => binding.updated_at)
    .sort()
    .at(-1) ?? null;

  return {
    project_id: projectId,
    project: projectName,
    active_binding: activeBinding,
    bindings: projectBindings.map((binding) => ({
      ...binding,
      is_default_context: binding.status === 'active',
      workspace_path_currentness: inspectWorkspacePathCurrentness(binding.workspace_path),
    })),
    inactive_bindings_count: inactiveCount,
    archived_bindings_count: archivedCount,
    bindings_count: {
      total: projectBindings.length,
      active: activeBinding ? 1 : 0,
      inactive: inactiveCount,
      archived: archivedCount,
      direct_entry_ready: directEntryReadyCount,
      manifest_ready: manifestReadyCount,
    },
    binding_contract: buildProjectBindingContract(projectId, projectName, bindings),
    last_updated_at: lastUpdatedAt,
    available_actions: [
      'init',
      'bind',
      'activate',
      'archive',
      ...(activeBinding && hasDirectEntry(activeBinding) ? ['launch'] : []),
    ],
  };
}

function buildWorkspaceCatalogSummary(projects: ReturnType<typeof buildProjectCatalogEntry>[], bindings: WorkspaceBinding[]) {
  return {
    total_projects_count: projects.length,
    active_projects_count: projects.filter((project) => project.active_binding !== null).length,
    direct_entry_ready_projects_count: projects.filter((project) => project.bindings_count.direct_entry_ready > 0).length,
    manifest_ready_projects_count: projects.filter((project) => project.bindings_count.manifest_ready > 0).length,
    total_bindings_count: bindings.length,
    active_bindings_count: bindings.filter((binding) => binding.status === 'active').length,
    archived_bindings_count: bindings.filter((binding) => binding.status === 'archived').length,
    last_binding_change_at: bindings.map((binding) => binding.updated_at).sort().at(-1) ?? null,
  };
}

function buildWorkspaceCatalogPayload(
  contracts: FrameworkContracts,
  registry: WorkspaceRegistryFile,
  action: WorkspaceCatalogAction,
  binding: WorkspaceBinding | null,
) {
  const paths = resolveOplStatePaths();
  const projects = allowedProjects(contracts).map((project) =>
    buildProjectCatalogEntry(project.project_id, project.project, registry.bindings),
  );
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_catalog: {
      action,
      state_dir: paths.state_dir,
      binding,
      summary: buildWorkspaceCatalogSummary(projects, registry.bindings),
      projects,
      bindings: registry.bindings,
      notes: [
        'Workspace bindings are product-entry level state for OPL and admitted domain project surfaces.',
        'A binding may carry direct-entry locators so OPL can hand off into a domain front desk without inventing one.',
        'Structured workspace locators let OPL derive project-specific direct-entry and manifest commands without promoting OPL into a domain runtime owner.',
        'When available, manifest_command points at the domain-owned machine-readable product-entry manifest for that bound workspace.',
        'Every binding remains visible in its project catalog; active identifies only the default context and never the complete project inventory.',
        'Registry binding status and workspace path currentness are catalog facts; workspace index health belongs to workspace report diagnostics.',
      ],
    },
  };
}

function findBindingOrThrow(
  registry: WorkspaceRegistryFile,
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
  registry: WorkspaceRegistryFile,
  projectId: string,
  absolutePath: string,
) {
  return registry.bindings.find((entry) =>
    entry.project_id === projectId && entry.workspace_path === absolutePath,
  ) ?? null;
}

export function buildWorkspaceCatalog(contracts: FrameworkContracts) {
  return buildWorkspaceCatalogPayload(contracts, readWorkspaceRegistryFile(), 'catalog', null);
}

export function bindWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  const project = findAllowedProject(contracts, options.projectId);
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const requestedProjectScopeId = normalizeOptionalString(options.projectScopeId);
  const existing = registry.bindings.find((binding) =>
    binding.project_id === options.projectId && binding.workspace_path === absolutePath,
  );
  const activeProjectBinding = registry.bindings.find((binding) =>
    binding.project_id === options.projectId && binding.status === 'active',
  );
  const nonArchivedProjectScopes = [
    ...new Set(registry.bindings
      .filter((binding) => binding.project_id === options.projectId && binding.status !== 'archived')
      .map((binding) => binding.project_scope_id)),
  ];
  const inheritedProjectScopeId = requestedProjectScopeId
    ?? existing?.project_scope_id
    ?? activeProjectBinding?.project_scope_id
    ?? (nonArchivedProjectScopes.length === 1 ? nonArchivedProjectScopes[0] : null);
  if (!requestedProjectScopeId && !existing && !activeProjectBinding && nonArchivedProjectScopes.length > 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace binding cannot infer a unique project scope from legacy bindings.',
      {
        failure_code: 'workspace_project_scope_ambiguous',
        project_id: project.project_id,
        project_scope_ids: nonArchivedProjectScopes.sort(),
      },
    );
  }
  const conflictingScopeOwner = requestedProjectScopeId
    ? registry.bindings.find((binding) =>
      binding.project_scope_id === requestedProjectScopeId
      && binding.project_id !== project.project_id
    )
    : null;
  if (conflictingScopeOwner) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace project scope is already owned by a different project surface.',
      {
        project_scope_id: requestedProjectScopeId,
        requested_project_id: project.project_id,
        existing_project_id: conflictingScopeOwner.project_id,
        existing_binding_id: conflictingScopeOwner.binding_id,
      },
    );
  }
  if (existing && requestedProjectScopeId && existing.project_scope_id !== requestedProjectScopeId) {
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
  const timestamp = nowIso();
  const binding = existing ?? {
    binding_id: randomUUID(),
    project_scope_id: inheritedProjectScopeId ?? createProjectScopeId(),
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
