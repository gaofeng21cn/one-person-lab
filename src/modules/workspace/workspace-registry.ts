import fs from 'node:fs';
import path from 'node:path';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import {
  randomUUID } from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';
import {
  assertStandardAgentDescriptorIdentity,
  materializeStandardAgentCommand,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorInterface,
  type StandardAgentInterface,
  type StandardAgentLocatorField,
} from '../../kernel/standard-agent-interface.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { OPL_WORKSPACE_AGENT_PROFILES } from './workspace-agent-defaults.ts';

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
  derived_entry_command_template: string | null;
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
  deriveDirectEntry?: boolean;
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
  const normalized: WorkspaceBinding = {
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
  };

  return normalized;
}

function writeWorkspaceRegistryFile(payload: WorkspaceRegistryFile) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(paths.workspace_registry_file, `${JSON.stringify(payload, null, 2)}\n`);
}

function allowedProjects(contracts: FrameworkContracts) {
  const domainProjects = contracts.domains.domains.map((domain) => ({
    project_id: domain.domain_id,
    project: domain.project,
  }));
  const projectIds = new Set(['opl', ...domainProjects.map((entry) => entry.project_id)]);
  const generatedAgentProjects = OPL_WORKSPACE_AGENT_PROFILES
    .filter((entry) => !projectIds.has(entry.project_id))
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

function normalizeWorkspacePath(workspacePath: string) {
  const absolutePath = path.resolve(workspacePath);
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

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

function commandString(tokens: string[]) {
  return tokens.map((token) => /^[A-Za-z0-9_./:@%+=,-]+$/.test(token) ? token : shellSingleQuote(token)).join(' ');
}

function buildDerivedDirectEntryLocator(
  standardInterface: StandardAgentInterface | null,
  workspacePath: string,
  workspaceLocator: BoundWorkspaceLocator | null,
) {
  if (!standardInterface || !workspaceLocator) {
    return {
      command: null,
      manifest_command: null,
    };
  }
  const locator = {
    workspace_path: workspacePath,
    workspace_root: workspaceLocator.workspace_root,
    profile_ref: workspaceLocator.profile_ref,
    input_path: workspaceLocator.input_path,
  };
  return {
    command: standardInterface.workspace_binding.entry_command_template
      ? commandString(materializeStandardAgentCommand(
          standardInterface.workspace_binding.entry_command_template,
          locator,
        ))
      : null,
    manifest_command: standardInterface.workspace_binding.manifest_command_template
      ? commandString(materializeStandardAgentCommand(
          standardInterface.workspace_binding.manifest_command_template,
          locator,
        ))
      : null,
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
      derived_entry_command_template: resolved.descriptor.workspace_binding.entry_command_template?.join(' ') ?? null,
      derived_manifest_command_template: resolved.descriptor.workspace_binding.manifest_command_template?.join(' ') ?? null,
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
    derived_entry_command_template: null,
    derived_manifest_command_template: null,
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
  const derivedDirectEntry = options.deriveDirectEntry === false
    ? {
        command: null,
        manifest_command: null,
      }
    : buildDerivedDirectEntryLocator(
        resolvedStandardInterface?.descriptor ?? null,
        absolutePath,
        workspaceLocator,
      );

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

export function listWorkspaceBindings() {
  return readWorkspaceRegistryFile().bindings;
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
