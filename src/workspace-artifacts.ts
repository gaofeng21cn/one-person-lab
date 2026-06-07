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
export const SHARED_RESOURCE_MANIFEST_BASENAME = 'opl_resource_manifest.json';
export const STAGE_OUTPUTS_MANIFEST_BASENAME = 'opl_stage_outputs_manifest.json';

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
    stage_outputs_root: stageOutputsRoot,
    stage_outputs_manifest_ref: typeof project.stage_outputs_manifest_ref === 'string'
      ? project.stage_outputs_manifest_ref
      : stageOutputsManifestRef(stageOutputsRoot),
    control_root: typeof project.control_root === 'string' ? project.control_root : `${projectRoot}/control`,
    review_root: typeof project.review_root === 'string' ? project.review_root : `${projectRoot}/review`,
    handoff_root: typeof project.handoff_root === 'string' ? project.handoff_root : `${projectRoot}/handoff`,
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
    stage_artifact_runtime: {
      canonical_stage_manifest_surface: 'opl_stage_manifest',
      canonical_runtime_command: 'opl stage open|commit|validate',
      root_manifest_is_stage_completion_proof: false,
    },
    authority_boundary: {
      file_presence_counts_as_stage_complete: false,
      root_manifest_can_replace_owner_receipt: false,
      root_manifest_can_replace_typed_blocker: false,
      opl_can_write_domain_truth: false,
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
      stage_outputs_root: project.stage_outputs_root,
      stage_outputs_manifest_ref: project.stage_outputs_manifest_ref,
      lifecycle: project.lifecycle,
      user_inspection: {
        stage_outputs_root: project.stage_outputs_root,
        review_root: project.review_root,
        handoff_root: project.handoff_root,
      },
    })),
    generated_refs: {
      workspace_index_ref: 'workspace_index.json',
      workspace_config_ref: 'workspace.yaml',
      workspace_map_ref: WORKSPACE_MAP_REF,
      workspace_health_ref: WORKSPACE_HEALTH_REF,
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
    const manifestPath = path.join(input.workspacePath, project.stage_outputs_manifest_ref);
    writeJsonArtifact(manifestPath, buildStageOutputsManifest({
      workspaceId: input.workspaceId,
      agent: input.agent,
      project,
      updatedAt: input.updatedAt,
    }));
    writtenFiles.push(manifestPath);
  }
  writeJsonArtifact(path.join(input.workspacePath, WORKSPACE_MAP_REF), buildWorkspaceMap(input));
  writtenFiles.push(path.join(input.workspacePath, WORKSPACE_MAP_REF));
  writeJsonArtifact(path.join(input.workspacePath, WORKSPACE_HEALTH_REF), buildWorkspaceHealth(input));
  writtenFiles.push(path.join(input.workspacePath, WORKSPACE_HEALTH_REF));
  return writtenFiles;
}
