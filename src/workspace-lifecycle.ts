import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import type { FrameworkContracts } from './types.ts';
import { doctorWorkspace, type WorkspaceLifecycleOptions, type WorkspaceValidationOptions } from './workspace-diagnostics.ts';
import {
  buildWorkspaceHealth,
  buildWorkspaceMap,
  ensureDirectory,
  materializeWorkspaceGeneratedArtifacts,
  normalizeWorkspaceProjectEntry,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_MAP_REF,
  writeJsonArtifact,
} from './workspace-artifacts.ts';
import {
  type TopologyProfile,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';
import {
  buildWorkspaceIndex,
  buildWorkspaceYaml,
} from './workspace-initializer.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readWorkspaceIndex(indexPath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      return { index: null, blocker: 'workspace_index_shape_invalid' };
    }
    if (parsed.surface_kind !== 'opl_workspace_index' || parsed.version !== 'workspace-index.v1') {
      return { index: null, blocker: 'workspace_index_shape_invalid' };
    }
    return { index: parsed, blocker: null };
  } catch (error) {
    return {
      index: null,
      blocker: 'workspace_index_invalid_json',
      cause: error instanceof Error ? error.message : 'Unknown JSON parse failure.',
    };
  }
}

function profileIdFromIndex(index: Record<string, unknown>): WorkspaceProfileId | null {
  const profile = isRecord(index.workspace_topology_profile) ? index.workspace_topology_profile : null;
  const profileId = profile?.profile_id;
  if (profileId === 'one_off' || profileId === 'rca_series' || profileId === 'mas_portfolio') {
    return profileId;
  }
  return null;
}

function profileFromIndex(index: Record<string, unknown>): TopologyProfile | null {
  const profile = isRecord(index.workspace_topology_profile) ? index.workspace_topology_profile : null;
  if (!profile) {
    return null;
  }
  const mode = profile.workspace_mode;
  const sharedRoots = profile.shared_resource_roots;
  if (
    (mode !== 'one_off' && mode !== 'series' && mode !== 'portfolio')
    || typeof profile.project_collection_path !== 'string'
    || typeof profile.project_stage_outputs_root !== 'string'
    || !Array.isArray(sharedRoots)
    || !sharedRoots.every((entry) => typeof entry === 'string')
  ) {
    return null;
  }
  return {
    workspace_mode: mode,
    project_collection_path: profile.project_collection_path,
    shared_resource_roots: sharedRoots,
    project_stage_outputs_root: profile.project_stage_outputs_root,
    series_capable_skeleton: profile.series_capable_skeleton === true,
  };
}

function agentFromIndex(index: Record<string, unknown>): WorkspaceAgentProfile | null {
  const agent = isRecord(index.agent) ? index.agent : null;
  if (typeof agent?.agent_id !== 'string') {
    return null;
  }
  try {
    return findWorkspaceAgentProfile(agent.agent_id);
  } catch {
    return null;
  }
}

function normalizeProjectEntry(project: Record<string, unknown>): WorkspaceProjectIndexEntry | null {
  const fields = [
    project.project_id,
    project.project_root,
    project.stage_outputs_root,
    project.control_root,
    project.review_root,
    project.handoff_root,
  ];
  if (!fields.every((entry) => typeof entry === 'string' && entry.trim().length > 0)) {
    return null;
  }
  return normalizeWorkspaceProjectEntry(project);
}

function indexWorkspaceId(index: Record<string, unknown>, workspacePath: string) {
  return typeof index.workspace_id === 'string' && index.workspace_id.trim()
    ? index.workspace_id
    : path.basename(workspacePath);
}

function indexTitle(index: Record<string, unknown>) {
  return typeof index.title === 'string' && index.title.trim() ? index.title : null;
}

function indexUpdatedAt(index: Record<string, unknown>) {
  return typeof index.updated_at === 'string' && index.updated_at.trim()
    ? index.updated_at
    : new Date().toISOString();
}

function indexCreatedAt(index: Record<string, unknown>, fallback: string) {
  return typeof index.created_at === 'string' && index.created_at.trim()
    ? index.created_at
    : fallback;
}

function normalizeWorkspaceLifecycle(value: unknown): {
  status: 'active' | 'archived';
  archived_at: string | null;
  archive_reason: string | null;
} {
  const lifecycle = isRecord(value) ? value : {};
  const status: 'active' | 'archived' = lifecycle.status === 'archived' ? 'archived' : 'active';
  return {
    status,
    archived_at: status === 'archived' && typeof lifecycle.archived_at === 'string'
      ? lifecycle.archived_at
      : null,
    archive_reason: status === 'archived' && typeof lifecycle.archive_reason === 'string'
      ? lifecycle.archive_reason
      : null,
  };
}

function readValidatedWorkspaceIndex(workspacePathInput: string | undefined) {
  const workspacePath = normalizeOptionalString(workspacePathInput);
  if (!workspacePath) {
    throw new FrameworkContractError('cli_usage_error', 'Workspace lifecycle command requires --workspace.', {
      required: ['--workspace'],
    });
  }
  const absoluteWorkspacePath = path.resolve(workspacePath);
  const indexPath = path.join(absoluteWorkspacePath, 'workspace_index.json');
  const parsed = readWorkspaceIndex(indexPath);
  if (!parsed.index) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace lifecycle command requires a valid workspace_index.json.',
      {
        workspace_path: absoluteWorkspacePath,
        workspace_index_path: indexPath,
        blocker: parsed.blocker,
        ...(parsed.cause ? { cause: parsed.cause } : {}),
      },
    );
  }
  const agent = agentFromIndex(parsed.index);
  const profile = profileFromIndex(parsed.index);
  const profileId = profileIdFromIndex(parsed.index);
  if (!agent || !profile || !profileId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace lifecycle command requires agent and topology profile metadata in workspace_index.json.',
      {
        workspace_path: absoluteWorkspacePath,
        workspace_index_path: indexPath,
      },
    );
  }
  const projects = Array.isArray(parsed.index.projects)
    ? parsed.index.projects.filter(isRecord).map(normalizeProjectEntry).filter((entry): entry is WorkspaceProjectIndexEntry => Boolean(entry))
    : [];
  if (projects.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace lifecycle command requires at least one indexed project.',
      { workspace_path: absoluteWorkspacePath, workspace_index_path: indexPath },
    );
  }
  return {
    workspacePath: absoluteWorkspacePath,
    workspaceIndexPath: indexPath,
    index: parsed.index,
    agent,
    profile,
    profileId,
    projects,
  };
}

function writeWorkspaceMetadata(input: {
  contracts: FrameworkContracts;
  workspacePath: string;
  workspaceIndexPath: string;
  existingIndex: Record<string, unknown>;
  agent: WorkspaceAgentProfile;
  profile: TopologyProfile;
  profileId: WorkspaceProfileId;
  projects: WorkspaceProjectIndexEntry[];
  updatedAt: string;
}) {
  const workspaceId = indexWorkspaceId(input.existingIndex, input.workspacePath);
  const title = indexTitle(input.existingIndex);
  const createdAt = indexCreatedAt(input.existingIndex, input.updatedAt);
  const firstProject = input.projects[0];
  const nextIndex = buildWorkspaceIndex({
    contracts: input.contracts,
    workspaceId,
    workspacePath: input.workspacePath,
    title,
    agent: input.agent,
    profileId: input.profileId,
    profile: input.profile,
    projectId: firstProject.project_id,
    projectRootRef: firstProject.project_root,
    stageOutputsRootRef: firstProject.stage_outputs_root,
    createdAt,
    updatedAt: input.updatedAt,
    projects: input.projects,
  });
  nextIndex.workspace_lifecycle = normalizeWorkspaceLifecycle(input.existingIndex.workspace_lifecycle);
  const workspaceYamlPath = path.join(input.workspacePath, 'workspace.yaml');
  writeJsonArtifact(input.workspaceIndexPath, nextIndex);
  fs.writeFileSync(
    workspaceYamlPath,
    buildWorkspaceYaml({
      workspaceId,
      title,
      agent: input.agent,
      profileId: input.profileId,
      profile: input.profile,
      projects: input.projects,
    }),
  );
  const writtenGeneratedFiles = materializeWorkspaceGeneratedArtifacts({
    workspaceId,
    title,
    workspacePath: input.workspacePath,
    agent: input.agent,
    profile: input.profile,
    projects: input.projects,
    createdAt,
    updatedAt: input.updatedAt,
  });
  return {
    workspaceId,
    title,
    createdAt,
    nextIndex,
    workspaceYamlPath,
    writtenGeneratedFiles,
  };
}

export function upgradeWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceLifecycleOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const updatedAt = new Date().toISOString();
  const createdDirectories: string[] = [];
  const apply = options.apply === true && options.dryRun !== true;

  for (const sharedRoot of context.profile.shared_resource_roots) {
    const dirPath = path.join(context.workspacePath, sharedRoot);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      if (apply) {
        ensureDirectory(dirPath, createdDirectories);
      } else {
        createdDirectories.push(dirPath);
      }
    }
  }
  for (const project of context.projects) {
    for (const relativePath of [
      project.project_root,
      project.control_root,
      project.stage_outputs_root,
      project.review_root,
      project.handoff_root,
    ]) {
      const dirPath = path.join(context.workspacePath, relativePath);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        if (apply) {
          ensureDirectory(dirPath, createdDirectories);
        } else {
          createdDirectories.push(dirPath);
        }
      }
    }
  }

  const written = apply
    ? writeWorkspaceMetadata({
        contracts,
        workspacePath: context.workspacePath,
        workspaceIndexPath: context.workspaceIndexPath,
        existingIndex: context.index,
        agent: context.agent,
        profile: context.profile,
        profileId: context.profileId,
        projects: context.projects,
        updatedAt,
      })
    : null;
  const doctor = apply
    ? doctorWorkspace(contracts, { workspacePath: context.workspacePath }).workspace_doctor
    : null;

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_upgrade: {
      surface_kind: 'opl_workspace_upgrade',
      status: apply ? (doctor?.status === 'passed' ? 'applied' : 'applied_with_blockers') : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      workspace_path: context.workspacePath,
      workspace_index_path: context.workspaceIndexPath,
      workspace_map_path: path.join(context.workspacePath, WORKSPACE_MAP_REF),
      workspace_health_path: path.join(context.workspacePath, WORKSPACE_HEALTH_REF),
      would_or_did_create_directories: createdDirectories,
      written_generated_files: written?.writtenGeneratedFiles ?? [],
      blockers_after_apply: doctor?.blockers ?? [],
      authority_boundary: {
        upgrade_moves_project_roots: false,
        upgrade_writes_domain_truth: false,
        upgrade_changes_domain_artifact_bodies: false,
      },
    },
  };
}

export function archiveWorkspaceProject(
  contracts: FrameworkContracts,
  options: WorkspaceLifecycleOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const projectId = normalizeOptionalString(options.projectId);
  if (!projectId) {
    throw new FrameworkContractError('cli_usage_error', 'workspace project archive requires --project-id.', {
      required: ['--project-id'],
    });
  }
  const existingProject = context.projects.find((project) => project.project_id === projectId);
  if (!existingProject) {
    throw new FrameworkContractError('contract_shape_invalid', 'workspace project archive requires an indexed project.', {
      project_id: projectId,
      indexed_project_ids: context.projects.map((project) => project.project_id),
    });
  }
  const apply = options.apply === true && options.dryRun !== true;
  const updatedAt = new Date().toISOString();
  const projects = context.projects.map((project) => (
    project.project_id === projectId
      ? {
          ...project,
          lifecycle: {
            status: 'archived' as const,
            archived_at: updatedAt,
            archive_reason: normalizeOptionalString(options.reason),
          },
        }
      : project
  ));
  const written = apply
    ? writeWorkspaceMetadata({
        contracts,
        workspacePath: context.workspacePath,
        workspaceIndexPath: context.workspaceIndexPath,
        existingIndex: context.index,
        agent: context.agent,
        profile: context.profile,
        profileId: context.profileId,
        projects,
        updatedAt,
      })
    : null;

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_project_archive: {
      surface_kind: 'opl_workspace_project_archive',
      status: apply ? 'applied' : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      workspace_path: context.workspacePath,
      workspace_index_path: context.workspaceIndexPath,
      project_id: projectId,
      project_root: existingProject.project_root,
      lifecycle: projects.find((project) => project.project_id === projectId)?.lifecycle,
      written_generated_files: written?.writtenGeneratedFiles ?? [],
      authority_boundary: {
        archive_deletes_files: false,
        archive_archives_registry_binding: false,
        archive_writes_domain_truth: false,
      },
    },
  };
}

export function exportWorkspaceMap(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const updatedAt = indexUpdatedAt(context.index);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_map: buildWorkspaceMap({
      workspaceId: indexWorkspaceId(context.index, context.workspacePath),
      title: indexTitle(context.index),
      workspacePath: context.workspacePath,
      agent: context.agent,
      profile: context.profile,
      projects: context.projects,
      createdAt: indexCreatedAt(context.index, updatedAt),
      updatedAt,
    }),
  };
}

export function workspaceHealth(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const doctor = doctorWorkspace(contracts, options).workspace_doctor;
  const updatedAt = doctor.checked_at;
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_health: buildWorkspaceHealth({
      workspaceId: indexWorkspaceId(context.index, context.workspacePath),
      title: indexTitle(context.index),
      workspacePath: context.workspacePath,
      agent: context.agent,
      profile: context.profile,
      projects: context.projects,
      createdAt: indexCreatedAt(context.index, updatedAt),
      updatedAt,
      blockers: doctor.blockers,
    }),
  };
}
