import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import type { FrameworkContracts } from './types.ts';
import {
  buildCanonicalTopology,
  buildSharedResources,
  buildWorkspaceDisplayLabels,
  expectedDomainTopologyProfile,
  profileFromTopologyContract,
  selectWorkspaceProfileId,
  toWorkspaceRelative,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  workspaceProjectEntry,
  type TopologyProfile,
  type WorkspaceModeInput,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';

export type WorkspaceValidationOptions = {
  workspacePath?: string;
};

export type WorkspaceDoctorOptions = WorkspaceValidationOptions;

export type WorkspaceAdoptOptions = {
  agentId?: string;
  workspacePath?: string;
  workspaceRoot?: string;
  workspaceId?: string;
  projectId?: string;
  title?: string;
  mode?: WorkspaceModeInput;
  dryRun?: boolean;
};

const BLOCKER_MESSAGES: Record<string, string> = {
  workspace_path_required: 'Provide --workspace for workspace validation or doctor.',
  workspace_root_missing: 'Workspace directory does not exist.',
  workspace_root_not_directory: 'Workspace path exists but is not a directory.',
  workspace_index_missing: 'workspace_index.json is missing.',
  workspace_config_missing: 'workspace.yaml is missing.',
  workspace_index_invalid_json: 'workspace_index.json is not valid JSON.',
  workspace_index_shape_invalid: 'workspace_index.json does not have the OPL workspace index shape.',
  agent_metadata_missing: 'workspace_index.json is missing agent metadata.',
  workspace_topology_profile_missing: 'workspace_index.json is missing workspace_topology_profile.',
  canonical_topology_missing: 'workspace_index.json is missing canonical_topology.',
  canonical_topology_drift: 'canonical_topology does not match the agent topology profile.',
  display_labels_missing: 'workspace_index.json is missing display_labels.',
  display_labels_drift: 'display_labels do not match the agent topology profile.',
  shared_resources_missing: 'workspace_index.json is missing shared_resources.',
  shared_resources_drift: 'shared_resources do not match shared_resource_roots.',
  shared_resource_root_missing: 'A declared shared resource root is missing on disk.',
  project_collection_missing: 'The project collection directory is missing.',
  indexed_projects_missing: 'workspace_index.json does not list any projects.',
  indexed_project_shape_invalid: 'An indexed project has invalid path fields.',
  indexed_project_root_missing: 'An indexed project root is missing on disk.',
  indexed_stage_outputs_root_missing: 'An indexed project stage outputs root is missing on disk.',
  indexed_control_root_missing: 'An indexed project control root is missing on disk.',
  indexed_review_root_missing: 'An indexed project review root is missing on disk.',
  indexed_handoff_root_missing: 'An indexed project handoff root is missing on disk.',
  authority_boundary_overclaim: 'authority_boundary grants authority that OPL must not hold.',
  runtime_state_boundary_overclaim: 'runtime_state_boundary treats runtime-state as user/project truth.',
  workspace_norm_missing: 'workspace_index.json is missing workspace_norm projection.',
  workspace_norm_drift: 'workspace_norm projection does not match the executable norm contract.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

function addBlocker(
  blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }>,
  code: string,
  details?: Record<string, unknown>,
) {
  blockers.push({
    code,
    message: BLOCKER_MESSAGES[code] ?? code,
    ...(details ? { details } : {}),
  });
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  return {
    project_id: String(project.project_id),
    project_root: String(project.project_root),
    stage_outputs_root: String(project.stage_outputs_root),
    control_root: String(project.control_root),
    review_root: String(project.review_root),
    handoff_root: String(project.handoff_root),
  };
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

function validateIndexSemantics(input: {
  contracts: FrameworkContracts;
  workspacePath: string;
  index: Record<string, unknown>;
}) {
  const blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];
  const agent = agentFromIndex(input.index);
  const profile = profileFromIndex(input.index);
  const profileId = profileIdFromIndex(input.index);

  if (!agent) {
    addBlocker(blockers, 'agent_metadata_missing');
  }
  if (!profile || !profileId) {
    addBlocker(blockers, 'workspace_topology_profile_missing');
  }

  if (agent && profile && profileId) {
    const expectedCanonical = buildCanonicalTopology(agent, profile);
    const expectedDisplayLabels = buildWorkspaceDisplayLabels(agent, profile);
    const expectedSharedResources = buildSharedResources(profile);
    const expectedNormProfile = expectedDomainTopologyProfile({
      contract: input.contracts.agentWorkspaceNorm,
      agent,
      profileId,
      profile,
    });

    if (!isRecord(input.index.canonical_topology)) {
      addBlocker(blockers, 'canonical_topology_missing');
    } else if (!sameJson(input.index.canonical_topology, expectedCanonical)) {
      addBlocker(blockers, 'canonical_topology_drift', {
        expected: expectedCanonical,
        actual: input.index.canonical_topology,
      });
    }

    if (!isRecord(input.index.display_labels)) {
      addBlocker(blockers, 'display_labels_missing');
    } else if (!sameJson(input.index.display_labels, expectedDisplayLabels)) {
      addBlocker(blockers, 'display_labels_drift', {
        expected: expectedDisplayLabels,
        actual: input.index.display_labels,
      });
    }

    if (!Array.isArray(input.index.shared_resources)) {
      addBlocker(blockers, 'shared_resources_missing');
    } else if (!sameJson(input.index.shared_resources, expectedSharedResources)) {
      addBlocker(blockers, 'shared_resources_drift', {
        expected: expectedSharedResources,
        actual: input.index.shared_resources,
      });
    }

    if (
      !isRecord(input.index.expected_domain_topology_profile)
      || !sameJson(input.index.expected_domain_topology_profile, expectedNormProfile)
    ) {
      addBlocker(blockers, 'workspace_norm_drift', {
        field: 'expected_domain_topology_profile',
        expected: expectedNormProfile,
      });
    }

    for (const sharedRoot of profile.shared_resource_roots) {
      const absolute = path.join(input.workspacePath, sharedRoot);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
        addBlocker(blockers, 'shared_resource_root_missing', { path: sharedRoot });
      }
    }

    const collectionPath = path.join(input.workspacePath, profile.project_collection_path);
    if (!fs.existsSync(collectionPath) || !fs.statSync(collectionPath).isDirectory()) {
      addBlocker(blockers, 'project_collection_missing', {
        path: profile.project_collection_path,
      });
    }
  }

  if (!isRecord(input.index.workspace_norm)) {
    addBlocker(blockers, 'workspace_norm_missing');
  } else {
    const norm = input.index.workspace_norm;
    const expectedNorm = {
      norm_id: input.contracts.agentWorkspaceNorm.norm_id,
      version: input.contracts.agentWorkspaceNorm.version,
    };
    if (norm.norm_id !== expectedNorm.norm_id || norm.version !== expectedNorm.version) {
      addBlocker(blockers, 'workspace_norm_drift', { expected: expectedNorm });
    }
  }

  const projects = Array.isArray(input.index.projects) ? input.index.projects : [];
  if (projects.length === 0) {
    addBlocker(blockers, 'indexed_projects_missing');
  }
  const normalizedProjects: WorkspaceProjectIndexEntry[] = [];
  projects.forEach((project, index) => {
    if (!isRecord(project)) {
      addBlocker(blockers, 'indexed_project_shape_invalid', { index });
      return;
    }
    const normalized = normalizeProjectEntry(project);
    if (!normalized) {
      addBlocker(blockers, 'indexed_project_shape_invalid', { index });
      return;
    }
    normalizedProjects.push(normalized);
    const requiredDirs = [
      ['indexed_project_root_missing', normalized.project_root],
      ['indexed_stage_outputs_root_missing', normalized.stage_outputs_root],
      ['indexed_control_root_missing', normalized.control_root],
      ['indexed_review_root_missing', normalized.review_root],
      ['indexed_handoff_root_missing', normalized.handoff_root],
    ] as const;
    for (const [code, relativePath] of requiredDirs) {
      const absolute = path.join(input.workspacePath, relativePath);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
        addBlocker(blockers, code, {
          project_id: normalized.project_id,
          path: relativePath,
        });
      }
    }
  });

  const authority = isRecord(input.index.authority_boundary) ? input.index.authority_boundary : {};
  if (
    authority.opl_can_write_domain_truth !== false
    || authority.opl_can_mutate_artifact_body !== false
    || authority.opl_can_create_owner_receipt !== false
    || authority.opl_can_create_typed_blocker !== false
    || authority.runtime_state_counts_as_user_default_surface !== false
  ) {
    addBlocker(blockers, 'authority_boundary_overclaim');
  }

  const runtime = isRecord(input.index.runtime_state_boundary) ? input.index.runtime_state_boundary : {};
  if (
    runtime.runtime_state_can_be_canonical_project_root !== false
    || runtime.runtime_state_can_close_stage !== false
    || runtime.runtime_state_can_replace_owner_receipt_or_typed_blocker !== false
  ) {
    addBlocker(blockers, 'runtime_state_boundary_overclaim');
  }

  return {
    agent,
    profile,
    profileId,
    indexedProjects: normalizedProjects,
    blockers,
  };
}

export function doctorWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceDoctorOptions,
) {
  const workspacePathInput = normalizeOptionalString(options.workspacePath);
  const blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];

  if (!workspacePathInput) {
    addBlocker(blockers, 'workspace_path_required');
    return buildDoctorPayload(contracts, null, null, blockers, null);
  }

  const workspacePath = path.resolve(workspacePathInput);
  if (!fs.existsSync(workspacePath)) {
    addBlocker(blockers, 'workspace_root_missing', { path: workspacePath });
    return buildDoctorPayload(contracts, workspacePath, null, blockers, null);
  }
  if (!fs.statSync(workspacePath).isDirectory()) {
    addBlocker(blockers, 'workspace_root_not_directory', { path: workspacePath });
    return buildDoctorPayload(contracts, workspacePath, null, blockers, null);
  }

  const workspaceConfigPath = path.join(workspacePath, 'workspace.yaml');
  if (!fs.existsSync(workspaceConfigPath)) {
    addBlocker(blockers, 'workspace_config_missing', { file: workspaceConfigPath });
  }

  const workspaceIndexPath = path.join(workspacePath, 'workspace_index.json');
  if (!fs.existsSync(workspaceIndexPath)) {
    addBlocker(blockers, 'workspace_index_missing', { file: workspaceIndexPath });
    return buildDoctorPayload(contracts, workspacePath, workspaceIndexPath, blockers, null);
  }

  const parsed = readWorkspaceIndex(workspaceIndexPath);
  if (!parsed.index) {
    addBlocker(blockers, parsed.blocker ?? 'workspace_index_shape_invalid', {
      file: workspaceIndexPath,
      ...(parsed.cause ? { cause: parsed.cause } : {}),
    });
    return buildDoctorPayload(contracts, workspacePath, workspaceIndexPath, blockers, null);
  }

  const semantic = validateIndexSemantics({
    contracts,
    workspacePath,
    index: parsed.index,
  });
  blockers.push(...semantic.blockers);

  return buildDoctorPayload(contracts, workspacePath, workspaceIndexPath, blockers, {
    index: parsed.index,
    agent: semantic.agent,
    profile: semantic.profile,
    profileId: semantic.profileId,
    indexedProjects: semantic.indexedProjects,
  });
}

function buildDoctorPayload(
  contracts: FrameworkContracts,
  workspacePath: string | null,
  workspaceIndexPath: string | null,
  blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }>,
  context: {
    index: Record<string, unknown>;
    agent: WorkspaceAgentProfile | null;
    profile: TopologyProfile | null;
    profileId: WorkspaceProfileId | null;
    indexedProjects: WorkspaceProjectIndexEntry[];
  } | null,
) {
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_doctor: {
      surface_kind: 'opl_workspace_doctor',
      status: blockers.length === 0 ? 'passed' : 'blocked',
      workspace_path: workspacePath,
      workspace_index_path: workspaceIndexPath,
      checked_at: new Date().toISOString(),
      blockers,
      canonical_topology: context?.index.canonical_topology ?? null,
      display_labels: context?.index.display_labels ?? null,
      shared_resources: context?.index.shared_resources ?? null,
      agent: context?.agent
        ? {
            agent_id: context.agent.agent_id,
            project_id: context.agent.project_id,
            project_kind: context.agent.project_kind,
            workspace_kind: context.agent.workspace_kind,
          }
        : null,
      profile: context?.profile && context.profileId
        ? {
            contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
            profile_id: context.profileId,
            workspace_mode: context.profile.workspace_mode,
            project_collection_path: context.profile.project_collection_path,
            shared_resource_roots: context.profile.shared_resource_roots,
            project_stage_outputs_root: context.profile.project_stage_outputs_root,
          }
        : null,
      indexed_projects: context?.indexedProjects ?? [],
      user_inspection: context?.index.user_inspection ?? null,
      authority_boundary: context?.index.authority_boundary ?? null,
      runtime_state_boundary: context?.index.runtime_state_boundary ?? null,
    },
  };
}

export function validateWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const payload = doctorWorkspace(contracts, options);
  const doctor = payload.workspace_doctor;
  if (doctor.status !== 'passed') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace validation failed.',
      {
        workspace_path: doctor.workspace_path,
        workspace_index_path: doctor.workspace_index_path,
        blockers: doctor.blockers,
      },
    );
  }
  return {
    ...payload,
    workspace_validation: {
      surface_kind: 'opl_workspace_validation',
      status: 'passed',
      workspace_path: doctor.workspace_path,
      workspace_index_path: doctor.workspace_index_path,
      checked_at: doctor.checked_at,
      canonical_topology: doctor.canonical_topology,
      display_labels: doctor.display_labels,
      shared_resources: doctor.shared_resources,
      indexed_projects: doctor.indexed_projects,
      authority_boundary: doctor.authority_boundary,
      runtime_state_boundary: doctor.runtime_state_boundary,
    },
  };
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
  if (options.dryRun !== true) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'workspace adopt currently requires --dry-run; use workspace init/ensure to write OPL metadata.',
      { required: ['--dry-run'] },
    );
  }

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
    stageOutputsRoot,
    path.join(projectRoot, 'review'),
    path.join(projectRoot, 'handoff'),
  ];
  const existingIndexPath = path.join(workspacePath, 'workspace_index.json');
  const existingIndex = fs.existsSync(existingIndexPath)
    ? readWorkspaceIndex(existingIndexPath).index
    : null;
  const indexedProjects = existingIndex && Array.isArray(existingIndex.projects)
    ? existingIndex.projects.filter(isRecord).map(normalizeProjectEntry).filter((entry): entry is WorkspaceProjectIndexEntry => Boolean(entry))
    : [];
  const projectIds = new Set(indexedProjects.map((entry) => entry.project_id));
  const wouldIndexProjects = projectIds.has(projectId)
    ? indexedProjects
    : [...indexedProjects, currentProject];

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
      next_apply_command: `opl workspace init --agent ${agent.agent_id} --workspace ${workspacePath} --project-id ${projectId} --mode ${profile.workspace_mode}`,
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
