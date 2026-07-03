import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../charter/index.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { initializeWorkspace } from '../workspace-initializer.ts';
import { normalizeWorkspaceProjectEntry } from '../workspace-artifacts.ts';
import {
  buildCanonicalTopology,
  buildSharedResources,
  buildWorkspaceDisplayLabels,
  profileFromTopologyContract,
  selectWorkspaceProfileId,
  toWorkspaceRelative,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  workspaceProjectEntry,
  type WorkspaceModeInput,
  type WorkspaceProjectIndexEntry,
} from '../workspace-topology.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from '../workspace-agent-defaults.ts';
import {
  isRecord,
  normalizeOptionalString,
} from './policy.ts';

export type WorkspaceAdoptOptions = {
  agentId?: string;
  workspacePath?: string;
  workspaceRoot?: string;
  workspaceId?: string;
  projectId?: string;
  title?: string;
  mode?: WorkspaceModeInput;
  dryRun?: boolean;
  apply?: boolean;
};

function normalizeRequiredSegment(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new FrameworkContractError('cli_usage_error', `${field} cannot be empty.`, { field });
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `${field} must be a single path segment, not a relative or nested path.`,
      { field, value },
    );
  }
  return trimmed;
}

function normalizeMode(value: string | undefined): WorkspaceModeInput {
  const mode = normalizeOptionalString(value) ?? 'auto';
  if (mode === 'auto' || mode === 'one_off' || mode === 'series' || mode === 'portfolio') {
    return mode;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'workspace adopt --mode must be auto, one_off, series, or portfolio.',
    { mode, allowed_modes: ['auto', 'one_off', 'series', 'portfolio'] },
  );
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

function readWorkspaceIndex(indexPath: string) {
  try {
    const parsed = parseJsonText(fs.readFileSync(indexPath, 'utf8'));
    if (!isRecord(parsed)) {
      return null;
    }
    if (parsed.surface_kind !== 'opl_workspace_index' || parsed.version !== 'workspace-index.v1') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveAdoptWorkspacePath(options: WorkspaceAdoptOptions, agent: WorkspaceAgentProfile) {
  const explicitPath = normalizeOptionalString(options.workspacePath);
  const explicitRoot = normalizeOptionalString(options.workspaceRoot);
  if (explicitPath && explicitRoot) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace adopt accepts either --workspace or --workspace-root, not both.',
      { mutually_exclusive: ['--workspace', '--workspace-root'] },
    );
  }
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  if (!explicitRoot) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace adopt requires --workspace or --workspace-root.',
      { required_one_of: ['--workspace', '--workspace-root'] },
    );
  }
  const workspaceId = normalizeRequiredSegment(
    normalizeOptionalString(options.workspaceId) ?? agent.default_workspace_id,
    'workspace_id',
  );
  return path.resolve(explicitRoot, workspaceId);
}

export function adoptWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceAdoptOptions,
) {
  if (options.dryRun === true && options.apply === true) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace adopt accepts either --dry-run or --apply, not both.',
      { mutually_exclusive: ['--dry-run', '--apply'] },
    );
  }
  const apply = options.apply === true;

  const agent = findWorkspaceAgentProfile(options.agentId);
  const mode = normalizeMode(options.mode);
  const profileId = selectWorkspaceProfileId(agent, mode, 'workspace adopt');
  const profile = profileFromTopologyContract(profileId);
  const workspacePath = resolveAdoptWorkspacePath(options, agent);
  const workspaceId = normalizeRequiredSegment(path.basename(workspacePath), 'workspace_id');
  const projectId = normalizeRequiredSegment(
    normalizeOptionalString(options.projectId) ?? agent.default_project_id,
    'project_id',
  );
  const projectRoot = path.join(workspacePath, profile.project_collection_path, projectId);
  const stageOutputsRoot = path.join(projectRoot, profile.project_stage_outputs_root);
  const projectRootRef = toWorkspaceRelative(workspacePath, projectRoot);
  const stageOutputsRootRef = toWorkspaceRelative(workspacePath, stageOutputsRoot);
  const currentProject = workspaceProjectEntry(projectId, projectRootRef, stageOutputsRootRef);
  const directories = [
    workspacePath,
    ...profile.shared_resource_roots.map((entry) => path.join(workspacePath, entry)),
    path.join(workspacePath, profile.project_collection_path),
    projectRoot,
    path.join(projectRoot, 'control'),
    path.join(projectRoot, 'inputs'),
    stageOutputsRoot,
    path.join(projectRoot, 'artifacts', 'exports'),
    path.join(projectRoot, 'artifacts', 'packages'),
    path.join(projectRoot, 'review'),
    path.join(projectRoot, 'handoff'),
    path.join(projectRoot, 'archive'),
  ];
  const existingIndexPath = path.join(workspacePath, 'workspace_index.json');
  const existingIndex = fs.existsSync(existingIndexPath)
    ? readWorkspaceIndex(existingIndexPath)
    : null;
  const indexedProjects = existingIndex && Array.isArray(existingIndex.projects)
    ? existingIndex.projects.filter(isRecord).map(normalizeProjectEntry).filter((entry): entry is WorkspaceProjectIndexEntry => Boolean(entry))
    : [];
  const projectIds = new Set(indexedProjects.map((entry) => entry.project_id));
  const wouldIndexProjects = projectIds.has(projectId)
    ? indexedProjects
    : [...indexedProjects, currentProject];

  if (apply) {
    const initialized = initializeWorkspace(contracts, {
      agentId: agent.agent_id,
      workspacePath,
      projectId,
      title: options.title,
      mode: options.mode,
      bind: false,
      force: false,
    });
    return {
      version: 'g2',
      contracts_context: initialized.contracts_context,
      workspace_adoption: {
        surface_kind: 'opl_workspace_adoption',
        status: 'applied',
        dry_run: false,
        write_allowed: true,
        workspace_path: workspacePath,
        workspace_id: workspaceId,
        project: initialized.workspace_initialization.project,
        profile: initialized.workspace_initialization.profile,
        created_directories: initialized.workspace_initialization.created_directories,
        written_generated_files: initialized.workspace_initialization.written_generated_files,
        workspace_index_path: initialized.workspace_initialization.workspace_index_path,
        workspace_map_path: initialized.workspace_initialization.workspace_map_path,
        workspace_health_path: initialized.workspace_initialization.workspace_health_path,
        workspace_inspection_path: initialized.workspace_initialization.workspace_inspection_path,
        workspace_resource_inventory_path: initialized.workspace_initialization.workspace_resource_inventory_path,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_mutate_artifact_body: false,
          opl_can_create_owner_receipt: false,
          opl_can_create_typed_blocker: false,
        },
      },
    };
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_adoption: {
      surface_kind: 'opl_workspace_adoption_plan',
      status: 'dry_run_ready',
      dry_run: true,
      write_allowed: false,
      workspace_path: workspacePath,
      workspace_id: workspaceId,
      title: normalizeOptionalString(options.title),
      agent: {
        agent_id: agent.agent_id,
        label: agent.label,
        project_id: agent.project_id,
        project: agent.project,
        workspace_kind: agent.workspace_kind,
        project_kind: agent.project_kind,
      },
      profile: {
        contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
        profile_id: profileId,
        workspace_mode: profile.workspace_mode,
        project_collection_path: profile.project_collection_path,
        shared_resource_roots: profile.shared_resource_roots,
        project_stage_outputs_root: profile.project_stage_outputs_root,
      },
      canonical_topology: buildCanonicalTopology(agent, profile),
      display_labels: buildWorkspaceDisplayLabels(agent, profile),
      shared_resources: buildSharedResources(profile),
      project: currentProject,
      would_create_metadata_files: [
        path.join(workspacePath, 'workspace.yaml'),
        existingIndexPath,
      ].filter((filePath) => !fs.existsSync(filePath)),
      would_create_directories: directories.filter((dirPath) => (
        !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()
      )),
      would_index_projects: wouldIndexProjects,
      existing_workspace_index_detected: Boolean(existingIndex),
      next_apply_command: `opl workspace adopt --agent ${agent.agent_id} --workspace ${workspacePath} --project-id ${projectId} --mode ${profile.workspace_mode} --apply`,
      authority_boundary: {
        adopt_dry_run_can_write_files: false,
        opl_can_write_domain_truth: false,
        opl_can_mutate_artifact_body: false,
        opl_can_create_owner_receipt: false,
        opl_can_create_typed_blocker: false,
      },
    },
  };
}
