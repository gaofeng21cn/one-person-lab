import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { listWorkspaceAgentProfiles } from '../workspace-agent-defaults.ts';
import { inspectWorkspacePathCurrentness } from './maintenance.ts';
import { readWorkspaceRegistryFile } from './registry-io.ts';
import { resolveStandardAgentInterfaceForWorkspace } from './locator.ts';
import type {
  ProjectWorkspaceBindingContract,
  WorkspaceBinding,
  WorkspaceCatalogAction,
  WorkspaceRegistryFile,
} from './types.ts';

export function allowedProjects(contracts: FrameworkContracts) {
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

export function findAllowedProject(contracts: FrameworkContracts, projectId: string) {
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

export function setProjectActiveBinding(
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
    activeBinding?.workspace_path,
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

export function buildWorkspaceCatalogPayload(
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

export function buildWorkspaceCatalog(contracts: FrameworkContracts) {
  return buildWorkspaceCatalogPayload(contracts, readWorkspaceRegistryFile(), 'catalog', null);
}
