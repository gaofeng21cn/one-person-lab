import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import type { GatewayContracts } from './types.ts';

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
  derived_frontdesk_command_template: string | null;
  derived_manifest_command_template: string | null;
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
  workspacePath: string;
  label?: string;
  entryCommand?: string;
  manifestCommand?: string;
  entryUrl?: string;
  workspaceRoot?: string;
  profileRef?: string;
  inputPath?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const paths = resolveFrontDeskStatePaths();
  if (!fs.existsSync(paths.workspace_registry_file)) {
    return {
      version: 'g2',
      bindings: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.workspace_registry_file, 'utf8')) as Partial<WorkspaceRegistryFile>;
    if (parsed.version !== 'g2' || !Array.isArray(parsed.bindings)) {
      throw new Error('Invalid workspace registry shape.');
    }

    return {
      version: 'g2',
      bindings: parsed.bindings.map((binding) => ({
        binding_id: String(binding.binding_id),
        project_id: String(binding.project_id),
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
      })),
    };
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Existing workspace registry file is invalid JSON or has an invalid shape.',
      {
        file: paths.workspace_registry_file,
        cause: error instanceof Error ? error.message : 'Unknown workspace registry parse failure.',
      },
    );
  }
}

function writeWorkspaceRegistryFile(payload: WorkspaceRegistryFile) {
  const paths = ensureFrontDeskStateDir();
  fs.writeFileSync(paths.workspace_registry_file, `${JSON.stringify(payload, null, 2)}\n`);
}

function allowedProjects(contracts: GatewayContracts) {
  return [
    {
      project_id: 'opl',
      project: 'one-person-lab',
    },
    ...contracts.domains.domains.map((domain) => ({
      project_id: domain.domain_id,
      project: domain.project,
    })),
  ];
}

function findAllowedProject(contracts: GatewayContracts, projectId: string) {
  const project = allowedProjects(contracts).find((entry) => entry.project_id === projectId);
  if (!project) {
    throw new GatewayContractError(
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

function normalizeWorkspacePath(workspacePath: string) {
  const absolutePath = path.resolve(workspacePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new GatewayContractError(
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
    throw new GatewayContractError(
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
    throw new GatewayContractError(
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

function validateProjectLocatorOptions(
  projectId: string,
  locatorOptions: {
    workspaceRoot?: string;
    profileRef?: string;
    inputPath?: string;
  },
) {
  const provided = {
    workspace_root: Boolean(normalizeOptionalString(locatorOptions.workspaceRoot)),
    profile: Boolean(normalizeOptionalString(locatorOptions.profileRef)),
    input: Boolean(normalizeOptionalString(locatorOptions.inputPath)),
  };

  const unsupportedLocatorFields = Object.entries(provided)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .filter((key) => {
      if (projectId === 'medautoscience') {
        return key !== 'profile';
      }
      if (projectId === 'medautogrant') {
        return key !== 'input';
      }
      if (projectId === 'redcube') {
        return key !== 'workspace_root';
      }
      return true;
    });

  if (unsupportedLocatorFields.length > 0) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested workspace locator fields are not supported for this project surface.',
      {
        project_id: projectId,
        unsupported_locator_fields: unsupportedLocatorFields,
      },
    );
  }
}

function buildWorkspaceLocator(
  projectId: string,
  workspacePath: string,
  options: {
    workspaceRoot?: string;
    profileRef?: string;
    inputPath?: string;
  },
): BoundWorkspaceLocator | null {
  validateProjectLocatorOptions(projectId, options);

  if (projectId === 'medautoscience') {
    const profileRef = normalizeExistingFilePath(options.profileRef, 'profile');
    if (!profileRef) {
      return null;
    }

    return {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: workspacePath,
      profile_ref: profileRef,
      input_path: null,
    };
  }

  if (projectId === 'medautogrant') {
    const inputPath = normalizeExistingFilePath(options.inputPath, 'input');
    if (!inputPath) {
      return null;
    }

    return {
      surface_kind: 'med_autogrant_workspace_input',
      workspace_root: workspacePath,
      profile_ref: null,
      input_path: inputPath,
    };
  }

  if (projectId === 'redcube') {
    return {
      surface_kind: 'redcube_workspace',
      workspace_root: normalizeExistingDirectoryPath(options.workspaceRoot, 'workspace_root') ?? workspacePath,
      profile_ref: null,
      input_path: null,
    };
  }

  return null;
}

function buildDerivedDirectEntryLocator(workspaceLocator: BoundWorkspaceLocator | null) {
  if (!workspaceLocator) {
    return {
      command: null,
      manifest_command: null,
    };
  }

  if (workspaceLocator.surface_kind === 'med_autoscience_workspace_profile' && workspaceLocator.profile_ref) {
    return {
      command: `uv run python -m med_autoscience.cli product-frontdesk --profile ${workspaceLocator.profile_ref}`,
      manifest_command:
        `uv run python -m med_autoscience.cli product-entry-manifest --profile ${workspaceLocator.profile_ref} --format json`,
    };
  }

  if (workspaceLocator.surface_kind === 'med_autogrant_workspace_input' && workspaceLocator.input_path) {
    return {
      command: `uv run python -m med_autogrant product-frontdesk --input ${workspaceLocator.input_path}`,
      manifest_command:
        `uv run python -m med_autogrant product-entry-manifest --input ${workspaceLocator.input_path} --format json`,
    };
  }

  if (workspaceLocator.surface_kind === 'redcube_workspace' && workspaceLocator.workspace_root) {
    return {
      command: `redcube product frontdesk --workspace-root ${workspaceLocator.workspace_root}`,
      manifest_command: `redcube product manifest --workspace-root ${workspaceLocator.workspace_root}`,
    };
  }

  return {
    command: null,
    manifest_command: null,
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
): ProjectWorkspaceBindingContract {
  if (projectId === 'medautoscience') {
    return {
      surface_id: 'opl_project_workspace_binding_contract',
      project_id: projectId,
      project: projectName,
      workspace_locator_surface_kind: 'med_autoscience_workspace_profile',
      required_locator_fields: ['profile_ref'],
      optional_locator_fields: [],
      derived_frontdesk_command_template:
        'uv run python -m med_autoscience.cli product-frontdesk --profile <profile_ref>',
      derived_manifest_command_template:
        'uv run python -m med_autoscience.cli product-entry-manifest --profile <profile_ref> --format json',
      quick_bind_hint: '绑定现有 MAS workspace_path 后，再给 profile_ref，OPL 就能稳定派生 direct entry 与 manifest surface。',
    };
  }

  if (projectId === 'medautogrant') {
    return {
      surface_id: 'opl_project_workspace_binding_contract',
      project_id: projectId,
      project: projectName,
      workspace_locator_surface_kind: 'med_autogrant_workspace_input',
      required_locator_fields: ['input_path'],
      optional_locator_fields: [],
      derived_frontdesk_command_template:
        'uv run python -m med_autogrant product-frontdesk --input <input_path>',
      derived_manifest_command_template:
        'uv run python -m med_autogrant product-entry-manifest --input <input_path> --format json',
      quick_bind_hint: '绑定现有 MAG workspace_path 后，再给 input_path，OPL 就能诚实派生 grant direct entry 与 manifest command。',
    };
  }

  if (projectId === 'redcube') {
    return {
      surface_id: 'opl_project_workspace_binding_contract',
      project_id: projectId,
      project: projectName,
      workspace_locator_surface_kind: 'redcube_workspace',
      required_locator_fields: [],
      optional_locator_fields: ['workspace_root'],
      derived_frontdesk_command_template: 'redcube product frontdesk --workspace-root <workspace_root>',
      derived_manifest_command_template: 'redcube product manifest --workspace-root <workspace_root>',
      quick_bind_hint: '可只给 workspace_path；若额外提供 workspace_root，则 redcube direct entry 会优先指向它。',
    };
  }

  return {
    surface_id: 'opl_project_workspace_binding_contract',
    project_id: projectId,
    project: projectName,
    workspace_locator_surface_kind: null,
    required_locator_fields: [],
    optional_locator_fields: [],
    derived_frontdesk_command_template: null,
    derived_manifest_command_template: null,
    quick_bind_hint: 'OPL 顶层 workspace binding 只用于 family-level 状态与路由，不直接派生 domain product entry。',
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
    binding_contract: buildProjectBindingContract(projectId, projectName),
    last_updated_at: lastUpdatedAt,
    available_actions: [
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
  contracts: GatewayContracts,
  registry: WorkspaceRegistryFile,
  action: WorkspaceCatalogAction,
  binding: WorkspaceBinding | null,
) {
  const paths = resolveFrontDeskStatePaths();
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
    throw new GatewayContractError(
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

export function buildWorkspaceCatalog(contracts: GatewayContracts) {
  return buildWorkspaceCatalogPayload(contracts, readWorkspaceRegistryFile(), 'catalog', null);
}

export function bindWorkspace(
  contracts: GatewayContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  const project = findAllowedProject(contracts, options.projectId);
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const existing = registry.bindings.find((binding) =>
    binding.project_id === options.projectId && binding.workspace_path === absolutePath,
  );
  const timestamp = nowIso();
  const binding = existing ?? {
    binding_id: randomUUID(),
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

  const workspaceLocator = buildWorkspaceLocator(project.project_id, absolutePath, {
    workspaceRoot: options.workspaceRoot,
    profileRef: options.profileRef,
    inputPath: options.inputPath,
  });
  const derivedDirectEntry = buildDerivedDirectEntryLocator(workspaceLocator);

  binding.project = project.project;
  binding.label = normalizeOptionalString(options.label);
  binding.status = 'active';
  binding.direct_entry = {
    command: normalizeOptionalString(options.entryCommand) ?? derivedDirectEntry.command,
    manifest_command: normalizeOptionalString(options.manifestCommand) ?? derivedDirectEntry.manifest_command,
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
  contracts: GatewayContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  findAllowedProject(contracts, options.projectId);
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const binding = findBindingOrThrow(registry, options.projectId, absolutePath);

  if (binding.status === 'archived') {
    throw new GatewayContractError(
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
  contracts: GatewayContracts,
  options: WorkspaceRegistryOptions,
) {
  const registry = readWorkspaceRegistryFile();
  findAllowedProject(contracts, options.projectId);
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
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

export function resolveWorkspaceBinding(projectId: string, explicitWorkspacePath?: string) {
  const registry = readWorkspaceRegistryFile();

  if (explicitWorkspacePath) {
    return findBinding(registry, projectId, normalizeWorkspacePath(explicitWorkspacePath));
  }

  return registry.bindings.find((binding) =>
    binding.project_id === projectId && binding.status === 'active',
  ) ?? null;
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
