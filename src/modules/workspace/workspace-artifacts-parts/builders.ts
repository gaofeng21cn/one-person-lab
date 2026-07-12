import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import {
  buildSharedResources,
  OPL_GENERATED_ROOT,
  type TopologyProfile,
  type WorkspaceLifecycleStatus,
  type WorkspaceProjectIndexEntry,
  type WorkspaceSharedResourceEntry,
} from '../workspace-topology.ts';
import type { WorkspaceAgentProfile } from '../workspace-agent-defaults.ts';
import {
  CURRENT_STAGE_POINTER_BASENAME,
  GENERATED_WORKSPACE_HEALTH_REF,
  GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF,
  GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
  PROJECT_CONFIG_BASENAME,
  PROJECT_INDEX_BASENAME,
  STAGE_LIFECYCLE_STATUSES,
  STAGE_OUTPUTS_INDEX_BASENAME,
  STAGE_OUTPUT_REQUIRED_DIRECTORIES,
  STAGE_OUTPUT_REQUIRED_FILES,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_PROJECT_LIFECYCLE_STATUSES,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  currentStagePointerRef,
  stageOutputsIndexRef,
} from './refs.ts';

export type WorkspaceArtifactContext = {
  workspaceId: string;
  title: string | null;
  workspacePath: string;
  agent: WorkspaceAgentProfile;
  profile: TopologyProfile;
  projects: WorkspaceProjectIndexEntry[];
  createdAt: string;
  updatedAt: string;
};

export type SharedResourceRecord = {
  resource_id: string;
  source_ref: string | null;
  material_ref: string | null;
  checksum: string | null;
  provenance_ref: string | null;
  reuse_scope: string | null;
  staleness: string | null;
  recorded_at: string | null;
  body_ref: null;
};

export type WorkspaceLifecycleProjection = {
  status: WorkspaceLifecycleStatus;
  archived_at: string | null;
  archive_reason: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  superseded_at: string | null;
  superseded_by_project_id: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  retention_policy: 'keep_until_explicit_archive' | 'keep_until_explicit_delete_receipt';
  safe_delete_gate: 'domain_owner_receipt_required';
};

export function buildWorkspaceLifecycle(input: {
  status?: WorkspaceLifecycleStatus;
  archivedAt?: string | null;
  archiveReason?: string | null;
}): WorkspaceLifecycleProjection {
  return {
    status: input.status ?? 'active',
    archived_at: input.archivedAt ?? null,
    archive_reason: input.archiveReason ?? null,
    paused_at: null,
    pause_reason: null,
    superseded_at: null,
    superseded_by_project_id: null,
    locked_at: null,
    lock_reason: null,
    retention_policy: 'keep_until_explicit_archive',
    safe_delete_gate: 'domain_owner_receipt_required',
  };
}

export function buildSharedResourceManifest(input: {
  workspaceId: string;
  agent: WorkspaceAgentProfile;
  resource: WorkspaceSharedResourceEntry;
  updatedAt: string;
  existingRecords?: SharedResourceRecord[];
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
    content_addressing_policy: {
      digest_algorithm: 'sha256',
      accepted_digest_prefixes: ['sha256:'],
      checksum_field: 'checksum',
      body_ref_must_be_null: true,
      manifest_stores_body: false,
    },
    resources: input.existingRecords ?? [],
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
    stage_lifecycle_model: [...STAGE_LIFECYCLE_STATUSES],
    current_stage_pointer_ref: currentStagePointerRef(input.project.stage_outputs_root),
    stage_folder_protocol: {
      stage_folder_pattern: `${input.project.stage_outputs_root}/<stage-id>/`,
      required_directories: [...STAGE_OUTPUT_REQUIRED_DIRECTORIES],
      required_files: [...STAGE_OUTPUT_REQUIRED_FILES],
      closeout_answer_unit: 'progress_receipt_or_owner_answer_or_hard_stop',
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
    lifecycle_model: [...STAGE_LIFECYCLE_STATUSES],
    empty_state: 'no_stage_opened_yet',
    authority_boundary: {
      pointer_is_projection_only: true,
      pointer_role: 'workspace_stage_artifact_projection_not_stage_run_current_pointer',
      pointer_can_claim_stage_complete: false,
      pointer_can_write_stage_run_current_pointer: false,
      pointer_can_write_stage_run_terminal_state: false,
      pointer_can_publish_current_owner_delta: false,
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

export function buildWorkspaceResourceInventory(input: WorkspaceArtifactContext & {
  resourceRecordsByPath?: Record<string, SharedResourceRecord[]>;
}) {
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
      content_addressing_policy: {
        digest_algorithm: 'sha256',
        accepted_digest_prefixes: ['sha256:'],
        checksum_field: 'checksum',
        body_ref_must_be_null: true,
        body_storage_allowed: false,
      },
      reuse_scope: input.profile.workspace_mode === 'portfolio' ? 'workspace_group' : 'workspace_group_or_project_series',
      staleness_policy: 'domain_agent_or_owner_updates_staleness',
      resource_record_count: (
        input.resourceRecordsByPath?.[resource.path]
        ?? readExistingSharedResourceRecords(path.join(input.workspacePath, resource.manifest_ref))
      ).length,
      resource_records: input.resourceRecordsByPath?.[resource.path]
        ?? readExistingSharedResourceRecords(path.join(input.workspacePath, resource.manifest_ref)),
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

function normalizeSharedResourceRecord(value: unknown): SharedResourceRecord | null {
  if (!isRecord(value) || typeof value.resource_id !== 'string' || !value.resource_id.trim()) {
    return null;
  }
  return {
    resource_id: value.resource_id,
    source_ref: typeof value.source_ref === 'string' ? value.source_ref : null,
    material_ref: typeof value.material_ref === 'string' ? value.material_ref : null,
    checksum: typeof value.checksum === 'string' ? value.checksum : null,
    provenance_ref: typeof value.provenance_ref === 'string' ? value.provenance_ref : null,
    reuse_scope: typeof value.reuse_scope === 'string' ? value.reuse_scope : null,
    staleness: typeof value.staleness === 'string' ? value.staleness : null,
    recorded_at: typeof value.recorded_at === 'string' ? value.recorded_at : null,
    body_ref: null,
  };
}

export function readExistingSharedResourceRecords(manifestPath: string) {
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    return [];
  }
  const parsed = readJsonFileOrNull(manifestPath);
  if (!isRecord(parsed) || !Array.isArray(parsed.resources)) {
    return [];
  }
  return parsed.resources
    .map(normalizeSharedResourceRecord)
    .filter((entry): entry is SharedResourceRecord => Boolean(entry));
}

function projectLifecycleCounts(projects: WorkspaceProjectIndexEntry[]) {
  return Object.fromEntries(
    WORKSPACE_PROJECT_LIFECYCLE_STATUSES.map((status) => [
      status,
      projects.filter((project) => project.lifecycle.status === status).length,
    ]),
  );
}

export function buildWorkspaceHealth(input: WorkspaceArtifactContext & {
  blockers?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  findings?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  repairableFindings?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  advisoryWarnings?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
}) {
  const blockers = input.blockers ?? [];
  const findings = input.findings ?? blockers;
  const repairableFindings = input.repairableFindings ?? [];
  const advisoryWarnings = input.advisoryWarnings ?? [];
  const lifecycleCounts = projectLifecycleCounts(input.projects);
  return {
    surface_kind: 'opl_workspace_health',
    version: 'workspace-health.v1',
    workspace_id: input.workspaceId,
    agent_id: input.agent.agent_id,
    status: blockers.length > 0
      ? 'blocked'
      : repairableFindings.length > 0
        ? 'repairable'
        : advisoryWarnings.length > 0
          ? 'warning'
          : 'passed',
    checked_at: input.updatedAt,
    finding_count: findings.length,
    blocker_count: blockers.length,
    blockers,
    hard_blockers: blockers,
    repairable_findings: repairableFindings,
    advisory_warnings: advisoryWarnings,
    project_count: input.projects.length,
    project_lifecycle_counts: lifecycleCounts,
    active_project_count: lifecycleCounts.active,
    archived_project_count: lifecycleCounts.archived,
    shared_resource_count: input.profile.shared_resource_roots.length,
    readiness_boundary: {
      health_is_structure_only: true,
      health_does_not_claim_domain_ready: true,
      health_does_not_claim_stage_complete: true,
    },
  };
}

export function buildWorkspaceReport(input: WorkspaceArtifactContext & {
  blockers?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  findings?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  repairableFindings?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  advisoryWarnings?: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
}) {
  const activeProjects = input.projects.filter((project) => project.lifecycle.status === 'active');
  const currentProject = activeProjects[activeProjects.length - 1] ?? input.projects[input.projects.length - 1] ?? null;
  const blockers = input.blockers ?? [];
  const findings = input.findings ?? blockers;
  const repairableFindings = input.repairableFindings ?? [];
  const advisoryWarnings = input.advisoryWarnings ?? [];
  return {
    surface_kind: 'opl_workspace_report',
    version: 'workspace-report.v1',
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
      user_stage_folder_pattern: '<project-root>/artifacts/stage_outputs/<stage-id>/',
    },
    current_project: currentProject
      ? {
          project_id: currentProject.project_id,
          lifecycle: currentProject.lifecycle,
          project_root: currentProject.project_root,
          stage_outputs_root: currentProject.stage_outputs_root,
          current_stage_pointer_ref: currentStagePointerRef(currentProject.stage_outputs_root),
          next_user_check: currentStagePointerRef(currentProject.stage_outputs_root),
        }
      : null,
    projects: input.projects.map((project) => ({
      project_id: project.project_id,
      lifecycle: project.lifecycle,
      project_root: project.project_root,
      stage_outputs_root: project.stage_outputs_root,
      stage_outputs_index_ref: stageOutputsIndexRef(project.stage_outputs_root),
      current_stage_pointer_ref: currentStagePointerRef(project.stage_outputs_root),
    })),
    shared_resources: buildSharedResources(input.profile).map((resource) => ({
      path: resource.path,
      role: resource.role,
      manifest_ref: resource.manifest_ref,
      reuse_scope: input.profile.workspace_mode === 'portfolio' ? 'workspace_group' : 'workspace_group_or_project_series',
    })),
    projection_refs: {
      canonical_generated_root: OPL_GENERATED_ROOT,
      workspace_map_ref: GENERATED_WORKSPACE_MAP_REF,
      workspace_health_ref: GENERATED_WORKSPACE_HEALTH_REF,
      workspace_inspection_ref: GENERATED_WORKSPACE_INSPECTION_REF,
      workspace_resource_inventory_ref: GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
      workspace_report_ref: GENERATED_WORKSPACE_REPORT_REF,
      root_mirror_refs: [
        WORKSPACE_MAP_REF,
        WORKSPACE_HEALTH_REF,
        WORKSPACE_INSPECTION_REF,
        WORKSPACE_RESOURCE_INVENTORY_REF,
        WORKSPACE_REPORT_REF,
      ],
    },
    finding_count: findings.length,
    blockers,
    hard_blockers: blockers,
    repairable_findings: repairableFindings,
    advisory_warnings: advisoryWarnings,
    authority_boundary: {
      report_is_projection_only: true,
      report_can_claim_stage_complete: false,
      report_can_replace_owner_receipt: false,
      report_can_replace_typed_blocker: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: input.updatedAt,
  };
}
