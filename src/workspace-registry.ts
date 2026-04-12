import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import type { GatewayContracts } from './types.ts';

type DirectEntryLocator = {
  command: string | null;
  url: string | null;
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

type WorkspaceRegistryFile = {
  version: 'g2';
  bindings: WorkspaceBinding[];
};

export type WorkspaceCatalogAction =
  | 'catalog'
  | 'bind'
  | 'activate'
  | 'archive';

type WorkspaceRegistryOptions = {
  projectId: string;
  workspacePath: string;
  label?: string;
  entryCommand?: string;
  entryUrl?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
          url: normalizeOptionalString(binding.direct_entry?.url),
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
    },
    last_updated_at: lastUpdatedAt,
    available_actions: ['bind', 'activate', 'archive'],
  };
}

function buildWorkspaceCatalogSummary(projects: ReturnType<typeof buildProjectCatalogEntry>[], bindings: WorkspaceBinding[]) {
  return {
    total_projects_count: projects.length,
    active_projects_count: projects.filter((project) => project.active_binding !== null).length,
    direct_entry_ready_projects_count: projects.filter((project) => project.bindings_count.direct_entry_ready > 0).length,
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
      url: null,
    },
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  };

  binding.project = project.project;
  binding.label = normalizeOptionalString(options.label);
  binding.status = 'active';
  binding.direct_entry = {
    command: normalizeOptionalString(options.entryCommand),
    url: normalizeOptionalString(options.entryUrl),
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

export function resolveWorkspaceLocator(projectId: string, explicitWorkspacePath?: string) {
  const activeBinding = getActiveWorkspaceBinding(projectId);
  const absolutePath = explicitWorkspacePath ? normalizeWorkspacePath(explicitWorkspacePath) : activeBinding?.workspace_path ?? null;

  return {
    project_id: projectId,
    requested_path: explicitWorkspacePath ?? null,
    absolute_path: absolutePath,
    source: explicitWorkspacePath ? 'explicit_path' : activeBinding ? 'workspace_registry' : 'none',
    binding: activeBinding,
  };
}
