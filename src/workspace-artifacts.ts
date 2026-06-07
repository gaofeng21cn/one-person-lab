import fs from 'node:fs';
import path from 'node:path';

import {
  buildSharedResources,
  type TopologyProfile,
  type WorkspaceProjectIndexEntry,
  type WorkspaceSharedResourceEntry,
} from './workspace-topology.ts';
import type { WorkspaceAgentProfile } from './workspace-agent-defaults.ts';

export const WORKSPACE_MAP_REF = 'workspace_map.json';
export const WORKSPACE_HEALTH_REF = 'workspace_health.json';
export const WORKSPACE_INSPECTION_REF = 'workspace_inspection.json';
export const WORKSPACE_RESOURCE_INVENTORY_REF = 'workspace_resource_inventory.json';
export const PROJECT_CONFIG_BASENAME = 'project.yaml';
export const PROJECT_INDEX_BASENAME = 'project_index.json';
export const SHARED_RESOURCE_MANIFEST_BASENAME = 'opl_resource_manifest.json';
export const STAGE_OUTPUTS_MANIFEST_BASENAME = 'opl_stage_outputs_manifest.json';
export const STAGE_OUTPUTS_INDEX_BASENAME = 'stage_outputs_index.json';
export const CURRENT_STAGE_POINTER_BASENAME = 'current_stage.json';
export const STAGE_OUTPUT_REQUIRED_DIRECTORIES = [
  'inputs',
  'outputs',
  'review',
  'receipts',
  'handoff',
] as const;
export const STAGE_OUTPUT_REQUIRED_FILES = [
  'stage_manifest.json',
] as const;

type WorkspaceArtifactContext = {
  workspaceId: string;
  title: string | null;
  workspacePath: string;
  agent: WorkspaceAgentProfile;
  profile: TopologyProfile;
  projects: WorkspaceProjectIndexEntry[];
  createdAt: string;
  updatedAt: string;
};

export function stageOutputsIndexRef(stageOutputsRootRef: string) {
  return `${stageOutputsRootRef}/${STAGE_OUTPUTS_INDEX_BASENAME}`;
}

export function currentStagePointerRef(stageOutputsRootRef: string) {
  return `${stageOutputsRootRef}/${CURRENT_STAGE_POINTER_BASENAME}`;
}

export function sharedResourceManifestRef(resourcePath: string) {
  return `${resourcePath}/${SHARED_RESOURCE_MANIFEST_BASENAME}`;
}

export function stageOutputsManifestRef(stageOutputsRootRef: string) {
  return `${stageOutputsRootRef}/${STAGE_OUTPUTS_MANIFEST_BASENAME}`;
}

export function ensureDirectory(dirPath: string, created: string[]) {
  if (fs.existsSync(dirPath)) {
    if (!fs.statSync(dirPath).isDirectory()) {
      throw new Error(`Expected directory but found non-directory path: ${dirPath}`);
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  created.push(dirPath);
}

export function normalizeWorkspaceProjectEntry(project: Partial<WorkspaceProjectIndexEntry>) {
  const projectRoot = String(project.project_root ?? '');
  const stageOutputsRoot = String(project.stage_outputs_root ?? '');
  const lifecycle = project.lifecycle && typeof project.lifecycle === 'object'
    ? project.lifecycle
    : null;
  const status = lifecycle?.status === 'archived' ? 'archived' : 'active';
  return {
    project_id: String(project.project_id ?? ''),
    project_root: projectRoot,
    project_config_ref: typeof project.project_config_ref === 'string'
      ? project.project_config_ref
      : `${projectRoot}/${PROJECT_CONFIG_BASENAME}`,
    project_index_ref: typeof project.project_index_ref === 'string'
      ? project.project_index_ref
      : `${projectRoot}/${PROJECT_INDEX_BASENAME}`,
    stage_outputs_root: stageOutputsRoot,
    stage_outputs_manifest_ref: typeof project.stage_outputs_manifest_ref === 'string'
      ? project.stage_outputs_manifest_ref
      : stageOutputsManifestRef(stageOutputsRoot),
    stage_outputs_index_ref: typeof project.stage_outputs_index_ref === 'string'
      ? project.stage_outputs_index_ref
      : stageOutputsIndexRef(stageOutputsRoot),
    current_stage_pointer_ref: typeof project.current_stage_pointer_ref === 'string'
      ? project.current_stage_pointer_ref
      : currentStagePointerRef(stageOutputsRoot),
    control_root: typeof project.control_root === 'string' ? project.control_root : `${projectRoot}/control`,
    inputs_root: typeof project.inputs_root === 'string' ? project.inputs_root : `${projectRoot}/inputs`,
    exports_root: typeof project.exports_root === 'string' ? project.exports_root : `${projectRoot}/artifacts/exports`,
    packages_root: typeof project.packages_root === 'string' ? project.packages_root : `${projectRoot}/artifacts/packages`,
    review_root: typeof project.review_root === 'string' ? project.review_root : `${projectRoot}/review`,
    handoff_root: typeof project.handoff_root === 'string' ? project.handoff_root : `${projectRoot}/handoff`,
    archive_root: typeof project.archive_root === 'string' ? project.archive_root : `${projectRoot}/archive`,
    canonical_semantics: {
      unit: 'project_unit',
      collection_role: 'project_units',
      domain_alias_is_canonical: false,
    },
    lifecycle: {
      status,
      archived_at: status === 'archived' && typeof lifecycle?.archived_at === 'string'
        ? lifecycle.archived_at
        : null,
      archive_reason: status === 'archived' && typeof lifecycle?.archive_reason === 'string'
        ? lifecycle.archive_reason
        : null,
    },
  } satisfies WorkspaceProjectIndexEntry;
}

export function buildWorkspaceLifecycle(input: {
  status?: 'active' | 'archived';
  archivedAt?: string | null;
  archiveReason?: string | null;
}) {
  return {
    status: input.status ?? 'active',
    archived_at: input.archivedAt ?? null,
    archive_reason: input.archiveReason ?? null,
  };
}

export function buildSharedResourceManifest(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  resource: WorkspaceSharedResourceEntry;
  updatedAt: string;
}) {
  return {
    surface_kind: 'opl_shared_resource_manifest',
    version: 'workspace-shared-resource-manifest.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    path: input.resource.path,
    role: input.resource.role,
    owner: input.resource.owner,
    user_visible: input.resource.user_visible,
    domain_truth_owner: input.resource.domain_truth_owner,
    body_authority: {
      opl_can_write_domain_truth: false,
      opl_can_store_resource_body: false,
      manifest_is_index_only: true,
    },
    inventory_entry_protocol: {
      may_record_source_refs: true,
      may_record_material_refs: true,
      may_record_checksum: true,
      may_record_provenance: true,
      may_record_reuse_scope: true,
      may_record_staleness: true,
      body_storage_allowed: false,
    },
    updated_at: input.updatedAt,
  };
}

export function buildStageOutputsManifest(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  project: WorkspaceProjectIndexEntry;
  updatedAt: string;
}) {
  return {
    surface_kind: 'opl_stage_outputs_root_manifest',
    version: 'workspace-stage-outputs-root-manifest.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    project_id: input.project.project_id,
    stage_outputs_root: input.project.stage_outputs_root,
    user_inspection_role: 'workspace_local_project_stage_outputs',
    stage_folder_pattern: `${input.project.stage_outputs_root}/<stage-id>/`,
    stage_folder_required_shape: {
      stage_manifest_ref: `${input.project.stage_outputs_root}/<stage-id>/stage_manifest.json`,
      required_directories: [...STAGE_OUTPUT_REQUIRED_DIRECTORIES],
      required_files: [...STAGE_OUTPUT_REQUIRED_FILES],
      optional_directories: [
        'scratch',
        'exports',
      ],
    },
    stage_artifact_runtime: {
      canonical_stage_manifest_surface: 'opl_stage_manifest',
      canonical_runtime_command: 'opl stage open|commit|validate',
      stage_outputs_index_ref: stageOutputsIndexRef(input.project.stage_outputs_root),
      current_stage_pointer_ref: currentStagePointerRef(input.project.stage_outputs_root),
      root_manifest_is_stage_completion_proof: false,
      stage_folder_shape_is_completion_proof: false,
      current_pointer_is_progress_truth: false,
    },
    authority_boundary: {
      file_presence_counts_as_stage_complete: false,
      root_manifest_can_replace_owner_receipt: false,
      root_manifest_can_replace_typed_blocker: false,
      stage_folder_shape_can_replace_owner_receipt: false,
      stage_folder_shape_can_replace_typed_blocker: false,
      current_pointer_can_replace_owner_receipt: false,
      current_pointer_can_replace_typed_blocker: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}

export function buildStageOutputsIndex(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  project: WorkspaceProjectIndexEntry;
  updatedAt: string;
}) {
  return {
    surface_kind: 'opl_stage_outputs_index',
    version: 'workspace-stage-outputs-index.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    project_id: input.project.project_id,
    stage_outputs_root: input.project.stage_outputs_root,
    stage_lifecycle_model: [
      'open',
      'active',
      'completed',
      'blocked',
      'superseded',
      'archived',
    ],
    current_stage_pointer_ref: currentStagePointerRef(input.project.stage_outputs_root),
    stage_folder_protocol: {
      stage_folder_pattern: `${input.project.stage_outputs_root}/<stage-id>/`,
      required_directories: [...STAGE_OUTPUT_REQUIRED_DIRECTORIES],
      required_files: [...STAGE_OUTPUT_REQUIRED_FILES],
      closeout_answer_unit: 'owner_receipt_or_typed_blocker',
    },
    stages: [],
    authority_boundary: {
      index_is_projection_only: true,
      index_can_claim_stage_complete: false,
      index_can_replace_owner_receipt: false,
      index_can_replace_typed_blocker: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}

export function buildCurrentStagePointer(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  project: WorkspaceProjectIndexEntry;
  updatedAt: string;
}) {
  return {
    surface_kind: 'opl_current_stage_pointer',
    version: 'workspace-current-stage-pointer.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    project_id: input.project.project_id,
    project_root: input.project.project_root,
    stage_outputs_root: input.project.stage_outputs_root,
    current_stage: null,
    current_stage_manifest_ref: null,
    latest_owner_receipt_ref: null,
    latest_typed_blocker_ref: null,
    lifecycle_model: [
      'open',
      'active',
      'completed',
      'blocked',
      'superseded',
      'archived',
    ],
    empty_state: 'no_stage_opened_yet',
    authority_boundary: {
      pointer_is_projection_only: true,
      pointer_can_claim_stage_complete: false,
      pointer_can_replace_owner_receipt: false,
      pointer_can_replace_typed_blocker: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}

function yamlScalar(value: string | boolean | number | null) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function buildProjectYaml(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  profile: TopologyProfile;
  project: WorkspaceProjectIndexEntry;
  updatedAt: string;
}) {
  const lines = [
    'surface_kind: opl_workspace_project_config',
    'version: workspace-project-config.v1',
    `workspace_id: ${yamlScalar(input.workspaceId)}`,
    `agent_id: ${yamlScalar(input.agent.agent_id)}`,
    `project_id: ${yamlScalar(input.project.project_id)}`,
    `project_kind: ${yamlScalar(input.agent.project_kind)}`,
    'canonical_semantics:',
    '  unit: project_unit',
    `  collection_role: ${yamlScalar('project_units')}`,
    `  collection_path: ${yamlScalar(input.profile.project_collection_path)}`,
    `  domain_display_kind: ${yamlScalar(input.agent.project_kind)}`,
    `project_root: ${yamlScalar(input.project.project_root)}`,
    `control_root: ${yamlScalar(input.project.control_root)}`,
    `stage_outputs_root: ${yamlScalar(input.project.stage_outputs_root)}`,
    `stage_outputs_manifest_ref: ${yamlScalar(input.project.stage_outputs_manifest_ref)}`,
    `review_root: ${yamlScalar(input.project.review_root)}`,
    `handoff_root: ${yamlScalar(input.project.handoff_root)}`,
    'stage_artifact_unit:',
    '  stage_folder_pattern: <project-root>/artifacts/stage_outputs/<stage-id>/',
    '  required_directories:',
    ...STAGE_OUTPUT_REQUIRED_DIRECTORIES.map((entry) => `    - ${entry}`),
    '  required_files:',
    ...STAGE_OUTPUT_REQUIRED_FILES.map((entry) => `    - ${entry}`),
    'authority_boundary:',
    '  project_config_is_index_only: true',
    '  opl_can_write_domain_truth: false',
    '  project_config_can_replace_owner_receipt: false',
    '  project_config_can_replace_typed_blocker: false',
    `updated_at: ${yamlScalar(input.updatedAt)}`,
  ];
  return `${lines.join('\n')}\n`;
}

export function buildProjectIndex(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  profile: TopologyProfile;
  project: WorkspaceProjectIndexEntry;
  updatedAt: string;
}) {
  return {
    surface_kind: 'opl_workspace_project_index',
    version: 'workspace-project-index.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    project_id: input.project.project_id,
    canonical_semantics: {
      unit: 'project_unit',
      collection_role: 'project_units',
      collection_path: input.profile.project_collection_path,
      domain_display_kind: input.agent.project_kind,
      domain_alias_is_canonical: false,
    },
    project_root: input.project.project_root,
    roots: {
      control: input.project.control_root,
      inputs: input.project.inputs_root,
      stage_outputs: input.project.stage_outputs_root,
      review: input.project.review_root,
      handoff: input.project.handoff_root,
      exports: input.project.exports_root,
      packages: input.project.packages_root,
      archive: input.project.archive_root,
    },
    stage_artifact_unit: {
      root: input.project.stage_outputs_root,
      manifest_ref: input.project.stage_outputs_manifest_ref,
      index_ref: stageOutputsIndexRef(input.project.stage_outputs_root),
      current_stage_pointer_ref: currentStagePointerRef(input.project.stage_outputs_root),
      stage_folder_pattern: `${input.project.stage_outputs_root}/<stage-id>/`,
      required_directories: [...STAGE_OUTPUT_REQUIRED_DIRECTORIES],
      required_files: [...STAGE_OUTPUT_REQUIRED_FILES],
      ordinary_user_default_surface: true,
      lifecycle_model: [
        'open',
        'active',
        'completed',
        'blocked',
        'superseded',
        'archived',
      ],
    },
    lifecycle: input.project.lifecycle,
    authority_boundary: {
      project_index_is_projection_only: true,
      opl_can_write_domain_truth: false,
      project_index_can_replace_owner_receipt: false,
      project_index_can_replace_typed_blocker: false,
      project_index_can_claim_stage_complete: false,
    },
    updated_at: input.updatedAt,
  };
}

export function buildWorkspaceMap(input: WorkspaceArtifactContext) {
  return {
    surface_kind: 'opl_workspace_map',
    version: 'workspace-map.v1',
    workspace_id: input.workspaceId,
    title: input.title,
    workspace_path: input.workspacePath,
    agent: {
      agent_id: input.agent.agent_id,
      project_id: input.agent.project_id,
      workspace_kind: input.agent.workspace_kind,
      project_kind: input.agent.project_kind,
    },
    topology: {
      workspace_mode: input.profile.workspace_mode,
      project_collection_path: input.profile.project_collection_path,
      project_stage_outputs_root: input.profile.project_stage_outputs_root,
    },
    shared_resources: buildSharedResources(input.profile),
    projects: input.projects.map((project) => ({
      project_id: project.project_id,
      project_root: project.project_root,
      project_config_ref: `${project.project_root}/${PROJECT_CONFIG_BASENAME}`,
      project_index_ref: `${project.project_root}/${PROJECT_INDEX_BASENAME}`,
      stage_outputs_root: project.stage_outputs_root,
      stage_outputs_manifest_ref: project.stage_outputs_manifest_ref,
      stage_outputs_index_ref: stageOutputsIndexRef(project.stage_outputs_root),
      current_stage_pointer_ref: currentStagePointerRef(project.stage_outputs_root),
      lifecycle: project.lifecycle,
      user_inspection: {
        stage_outputs_root: project.stage_outputs_root,
        stage_outputs_index_ref: stageOutputsIndexRef(project.stage_outputs_root),
        current_stage_pointer_ref: currentStagePointerRef(project.stage_outputs_root),
        stage_folder_pattern: `${project.stage_outputs_root}/<stage-id>/`,
        stage_manifest_pattern: `${project.stage_outputs_root}/<stage-id>/stage_manifest.json`,
        inputs_pattern: `${project.stage_outputs_root}/<stage-id>/inputs`,
        outputs_pattern: `${project.stage_outputs_root}/<stage-id>/outputs`,
        review_pattern: `${project.stage_outputs_root}/<stage-id>/review`,
        receipts_pattern: `${project.stage_outputs_root}/<stage-id>/receipts`,
        handoff_pattern: `${project.stage_outputs_root}/<stage-id>/handoff`,
        required_stage_folder_shape: [
          ...STAGE_OUTPUT_REQUIRED_DIRECTORIES,
          ...STAGE_OUTPUT_REQUIRED_FILES,
        ],
        inputs_root: project.inputs_root,
        review_root: project.review_root,
        handoff_root: project.handoff_root,
        exports_root: project.exports_root,
        archive_root: project.archive_root,
        runtime_state_is_default_user_surface: false,
        product_views_are_stage_outputs: false,
      },
    })),
    generated_refs: {
      workspace_index_ref: 'workspace_index.json',
      workspace_config_ref: 'workspace.yaml',
      workspace_map_ref: WORKSPACE_MAP_REF,
      workspace_health_ref: WORKSPACE_HEALTH_REF,
      workspace_inspection_ref: WORKSPACE_INSPECTION_REF,
      workspace_resource_inventory_ref: WORKSPACE_RESOURCE_INVENTORY_REF,
      project_config_basename: PROJECT_CONFIG_BASENAME,
      project_index_basename: PROJECT_INDEX_BASENAME,
      stage_outputs_index_basename: STAGE_OUTPUTS_INDEX_BASENAME,
      current_stage_pointer_basename: CURRENT_STAGE_POINTER_BASENAME,
    },
    authority_boundary: {
      map_is_projection_only: true,
      opl_can_write_domain_truth: false,
      map_can_replace_owner_receipt_or_typed_blocker: false,
    },
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  };
}

export function buildWorkspaceInspection(input: WorkspaceArtifactContext) {
  const activeProjects = input.projects.filter((project) => project.lifecycle.status === 'active');
  const currentProject = activeProjects[activeProjects.length - 1] ?? input.projects[input.projects.length - 1] ?? null;
  return {
    surface_kind: 'opl_workspace_inspection',
    version: 'workspace-inspection.v1',
    workspace_id: input.workspaceId,
    workspace_path: input.workspacePath,
    agent_id: input.agent.agent_id,
    ordinary_user_default_surface: 'workspace_local_project_stage_outputs',
    current_project_id: currentProject?.project_id ?? null,
    current_project_root: currentProject?.project_root ?? null,
    current_stage_outputs_root: currentProject?.stage_outputs_root ?? null,
    current_stage_pointer_ref: currentProject
      ? currentStagePointerRef(currentProject.stage_outputs_root)
      : null,
    latest_stage_outputs_index_ref: currentProject
      ? stageOutputsIndexRef(currentProject.stage_outputs_root)
      : null,
    project_inspection: input.projects.map((project) => ({
      project_id: project.project_id,
      lifecycle: project.lifecycle,
      project_root: project.project_root,
      stage_outputs_root: project.stage_outputs_root,
      stage_outputs_manifest_ref: project.stage_outputs_manifest_ref,
      stage_outputs_index_ref: stageOutputsIndexRef(project.stage_outputs_root),
      current_stage_pointer_ref: currentStagePointerRef(project.stage_outputs_root),
      stage_folder_pattern: `${project.stage_outputs_root}/<stage-id>/`,
      stage_manifest_pattern: `${project.stage_outputs_root}/<stage-id>/stage_manifest.json`,
      receipts_pattern: `${project.stage_outputs_root}/<stage-id>/receipts`,
      exports_root: project.exports_root,
      review_root: project.review_root,
      handoff_root: project.handoff_root,
      archive_root: project.archive_root,
    })),
    domain_product_views_are_separate: true,
    runtime_state_is_default_user_surface: false,
    authority_boundary: {
      inspection_is_projection_only: true,
      inspection_can_replace_owner_receipt: false,
      inspection_can_replace_typed_blocker: false,
      inspection_can_claim_stage_complete: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}

export function buildWorkspaceResourceInventory(input: WorkspaceArtifactContext) {
  const resources = buildSharedResources(input.profile);
  return {
    surface_kind: 'opl_workspace_resource_inventory',
    version: 'workspace-resource-inventory.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    workspace_path: input.workspacePath,
    inventory_scope: 'workspace_shared_resources',
    resources: resources.map((resource) => ({
      path: resource.path,
      role: resource.role,
      manifest_ref: resource.manifest_ref,
      owner: resource.owner,
      user_visible: resource.user_visible,
      domain_truth_owner: resource.domain_truth_owner,
      provenance_policy: 'manifest_records_source_refs_not_resource_body',
      checksum_policy: 'resource_entry_may_record_checksum_when_known',
      reuse_scope: input.profile.workspace_mode === 'portfolio' ? 'workspace_group' : 'workspace_group_or_project_series',
      staleness_policy: 'domain_agent_or_owner_updates_staleness',
    })),
    authority_boundary: {
      inventory_is_index_only: true,
      inventory_can_store_resource_body: false,
      inventory_can_write_domain_truth: false,
      inventory_can_replace_source_provenance: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}

export function buildWorkspaceHealth(input: WorkspaceArtifactContext & {
  blockers?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
}) {
  const blockers = input.blockers ?? [];
  return {
    surface_kind: 'opl_workspace_health',
    version: 'workspace-health.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    checked_at: input.updatedAt,
    blocker_count: blockers.length,
    blockers,
    project_count: input.projects.length,
    active_project_count: input.projects.filter((project) => project.lifecycle.status === 'active').length,
    archived_project_count: input.projects.filter((project) => project.lifecycle.status === 'archived').length,
    shared_resource_count: input.profile.shared_resource_roots.length,
    readiness_boundary: {
      health_is_structure_only: true,
      health_does_not_claim_domain_ready: true,
      health_does_not_claim_stage_complete: true,
    },
  };
}

export function writeJsonArtifact(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeJsonArtifactIfMissing(filePath: string, payload: unknown) {
  if (fs.existsSync(filePath)) {
    if (!fs.statSync(filePath).isFile()) {
      throw new Error(`Expected file but found non-file path: ${filePath}`);
    }
    return false;
  }
  writeJsonArtifact(filePath, payload);
  return true;
}

export function materializeWorkspaceGeneratedArtifacts(input: WorkspaceArtifactContext) {
  const writtenFiles: string[] = [];
  const sharedResources = buildSharedResources(input.profile);
  for (const resource of sharedResources) {
    const manifestPath = path.join(input.workspacePath, sharedResourceManifestRef(resource.path));
    writeJsonArtifact(manifestPath, buildSharedResourceManifest({
      workspaceId: input.workspaceId,
      agent: input.agent,
      resource,
      updatedAt: input.updatedAt,
    }));
    writtenFiles.push(manifestPath);
  }
  for (const project of input.projects) {
    const projectConfigPath = path.join(input.workspacePath, project.project_root, PROJECT_CONFIG_BASENAME);
    fs.writeFileSync(projectConfigPath, buildProjectYaml({
      workspaceId: input.workspaceId,
      agent: input.agent,
      profile: input.profile,
      project,
      updatedAt: input.updatedAt,
    }));
    writtenFiles.push(projectConfigPath);
    const projectIndexPath = path.join(input.workspacePath, project.project_root, PROJECT_INDEX_BASENAME);
    writeJsonArtifact(projectIndexPath, buildProjectIndex({
      workspaceId: input.workspaceId,
      agent: input.agent,
      profile: input.profile,
      project,
      updatedAt: input.updatedAt,
    }));
    writtenFiles.push(projectIndexPath);
    const manifestPath = path.join(input.workspacePath, project.stage_outputs_manifest_ref);
    writeJsonArtifact(manifestPath, buildStageOutputsManifest({
      workspaceId: input.workspaceId,
      agent: input.agent,
      project,
      updatedAt: input.updatedAt,
    }));
    writtenFiles.push(manifestPath);
    const stageOutputsIndexPath = path.join(input.workspacePath, stageOutputsIndexRef(project.stage_outputs_root));
    if (writeJsonArtifactIfMissing(stageOutputsIndexPath, buildStageOutputsIndex({
      workspaceId: input.workspaceId,
      agent: input.agent,
      project,
      updatedAt: input.updatedAt,
    }))) {
      writtenFiles.push(stageOutputsIndexPath);
    }
    const currentStagePointerPath = path.join(input.workspacePath, currentStagePointerRef(project.stage_outputs_root));
    if (writeJsonArtifactIfMissing(currentStagePointerPath, buildCurrentStagePointer({
      workspaceId: input.workspaceId,
      agent: input.agent,
      project,
      updatedAt: input.updatedAt,
    }))) {
      writtenFiles.push(currentStagePointerPath);
    }
  }
  writeJsonArtifact(path.join(input.workspacePath, WORKSPACE_MAP_REF), buildWorkspaceMap(input));
  writtenFiles.push(path.join(input.workspacePath, WORKSPACE_MAP_REF));
  writeJsonArtifact(path.join(input.workspacePath, WORKSPACE_HEALTH_REF), buildWorkspaceHealth(input));
  writtenFiles.push(path.join(input.workspacePath, WORKSPACE_HEALTH_REF));
  writeJsonArtifact(path.join(input.workspacePath, WORKSPACE_INSPECTION_REF), buildWorkspaceInspection(input));
  writtenFiles.push(path.join(input.workspacePath, WORKSPACE_INSPECTION_REF));
  writeJsonArtifact(path.join(input.workspacePath, WORKSPACE_RESOURCE_INVENTORY_REF), buildWorkspaceResourceInventory(input));
  writtenFiles.push(path.join(input.workspacePath, WORKSPACE_RESOURCE_INVENTORY_REF));
  return writtenFiles;
}
