import fs from 'node:fs';
import path from 'node:path';

import {
  buildSharedResources,
  OPL_GENERATED_PROJECTIONS_ROOT,
  OPL_GENERATED_REPORTS_ROOT,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';
import {
  GENERATED_WORKSPACE_HEALTH_REF,
  GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF,
  GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
  PROJECT_CONFIG_BASENAME,
  PROJECT_INDEX_BASENAME,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_PROJECT_LIFECYCLE_STATUSES,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  currentStagePointerRef,
  sharedResourceManifestRef,
  stageOutputsIndexRef,
  stageOutputsManifestRef,
} from './workspace-artifacts-parts/refs.ts';
import {
  buildCurrentStagePointer,
  buildProjectIndex,
  buildProjectYaml,
  buildSharedResourceManifest,
  buildStageOutputsIndex,
  buildStageOutputsManifest,
  buildWorkspaceHealth,
  buildWorkspaceInspection,
  buildWorkspaceMap,
  buildWorkspaceReport,
  buildWorkspaceResourceInventory,
  readExistingSharedResourceRecords,
  type SharedResourceRecord,
  type WorkspaceArtifactContext,
} from './workspace-artifacts-parts/builders.ts';

export {
  CURRENT_STAGE_POINTER_BASENAME,
  GENERATED_WORKSPACE_HEALTH_REF,
  GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF,
  GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
  PROJECT_CONFIG_BASENAME,
  PROJECT_INDEX_BASENAME,
  SHARED_RESOURCE_MANIFEST_BASENAME,
  STAGE_LIFECYCLE_STATUSES,
  STAGE_OUTPUTS_INDEX_BASENAME,
  STAGE_OUTPUTS_MANIFEST_BASENAME,
  STAGE_OUTPUT_REQUIRED_DIRECTORIES,
  STAGE_OUTPUT_REQUIRED_FILES,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_PROJECT_LIFECYCLE_STATUSES,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  currentStagePointerRef,
  sharedResourceManifestRef,
  stageOutputsIndexRef,
  stageOutputsManifestRef,
} from './workspace-artifacts-parts/refs.ts';
export {
  buildCurrentStagePointer,
  buildProjectIndex,
  buildProjectYaml,
  buildSharedResourceManifest,
  buildStageOutputsIndex,
  buildStageOutputsManifest,
  buildWorkspaceHealth,
  buildWorkspaceInspection,
  buildWorkspaceLifecycle,
  buildWorkspaceMap,
  buildWorkspaceReport,
  buildWorkspaceResourceInventory,
  readExistingSharedResourceRecords,
} from './workspace-artifacts-parts/builders.ts';
export type {
  SharedResourceRecord,
  WorkspaceLifecycleProjection,
} from './workspace-artifacts-parts/builders.ts';

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
  const status = WORKSPACE_PROJECT_LIFECYCLE_STATUSES.includes(
    lifecycle?.status as typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number],
  )
    ? lifecycle?.status as typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number]
    : 'active';
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
      archived_at: typeof lifecycle?.archived_at === 'string'
        ? lifecycle.archived_at
        : null,
      archive_reason: typeof lifecycle?.archive_reason === 'string'
        ? lifecycle.archive_reason
        : null,
      paused_at: typeof lifecycle?.paused_at === 'string' ? lifecycle.paused_at : null,
      pause_reason: typeof lifecycle?.pause_reason === 'string' ? lifecycle.pause_reason : null,
      superseded_at: typeof lifecycle?.superseded_at === 'string' ? lifecycle.superseded_at : null,
      superseded_by_project_id: typeof lifecycle?.superseded_by_project_id === 'string'
        ? lifecycle.superseded_by_project_id
        : null,
      locked_at: typeof lifecycle?.locked_at === 'string' ? lifecycle.locked_at : null,
      lock_reason: typeof lifecycle?.lock_reason === 'string' ? lifecycle.lock_reason : null,
      retention_policy: lifecycle?.retention_policy === 'keep_until_explicit_delete_receipt'
        ? 'keep_until_explicit_delete_receipt'
        : 'keep_until_explicit_archive',
      safe_delete_gate: 'domain_owner_receipt_required',
    },
  } satisfies WorkspaceProjectIndexEntry;
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
  ensureDirectory(path.join(input.workspacePath, OPL_GENERATED_PROJECTIONS_ROOT), []);
  ensureDirectory(path.join(input.workspacePath, OPL_GENERATED_REPORTS_ROOT), []);
  const sharedResources = buildSharedResources(input.profile);
  const resourceRecordsByPath: Record<string, SharedResourceRecord[]> = {};
  for (const resource of sharedResources) {
    const manifestPath = path.join(input.workspacePath, sharedResourceManifestRef(resource.path));
    const existingRecords = readExistingSharedResourceRecords(manifestPath);
    resourceRecordsByPath[resource.path] = existingRecords;
    writeJsonArtifact(manifestPath, buildSharedResourceManifest({
      workspaceId: input.workspaceId,
      agent: input.agent,
      resource,
      updatedAt: input.updatedAt,
      existingRecords,
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
  const generatedArtifacts = [
    [GENERATED_WORKSPACE_MAP_REF, WORKSPACE_MAP_REF, buildWorkspaceMap(input)],
    [GENERATED_WORKSPACE_HEALTH_REF, WORKSPACE_HEALTH_REF, buildWorkspaceHealth(input)],
    [GENERATED_WORKSPACE_INSPECTION_REF, WORKSPACE_INSPECTION_REF, buildWorkspaceInspection(input)],
    [
      GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
      WORKSPACE_RESOURCE_INVENTORY_REF,
      buildWorkspaceResourceInventory({
        ...input,
        resourceRecordsByPath,
      }),
    ],
    [GENERATED_WORKSPACE_REPORT_REF, WORKSPACE_REPORT_REF, buildWorkspaceReport(input)],
  ] as const;
  for (const [canonicalRef, mirrorRef, payload] of generatedArtifacts) {
    const canonicalPath = path.join(input.workspacePath, canonicalRef);
    writeJsonArtifact(canonicalPath, payload);
    writtenFiles.push(canonicalPath);
    const mirrorPath = path.join(input.workspacePath, mirrorRef);
    writeJsonArtifact(mirrorPath, payload);
    writtenFiles.push(mirrorPath);
  }
  return writtenFiles;
}
