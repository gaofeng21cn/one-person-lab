import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText, readJsonFileOrNull } from '../../kernel/json-file.ts';
import { buildAgentWorkspaceNormProjection } from './agent-workspace-norm.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  buildProjectIndex,
  buildSharedResourceManifest,
  buildStageOutputsManifest,
  buildWorkspaceHealth,
  buildWorkspaceInspection,
  buildWorkspaceMap,
  buildWorkspaceReport,
  buildWorkspaceResourceInventory,
  currentStagePointerRef,
  GENERATED_WORKSPACE_HEALTH_REF,
  GENERATED_WORKSPACE_INSPECTION_REF,
  GENERATED_WORKSPACE_MAP_REF,
  GENERATED_WORKSPACE_REPORT_REF,
  GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF,
  normalizeWorkspaceProjectEntry,
  PROJECT_CONFIG_BASENAME,
  PROJECT_INDEX_BASENAME,
  readExistingSharedResourceRecords,
  sharedResourceManifestRef,
  stageOutputsIndexRef,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  WORKSPACE_PROJECT_LIFECYCLE_STATUSES,
} from './workspace-artifacts.ts';
import {
  validateCurrentStagePointerShape,
  validateStageOutputsIndexShape,
} from './workspace-projection-shape.ts';
import {
  buildCanonicalTopology,
  buildSharedResources,
  buildWorkspaceDisplayLabels,
  expectedDomainTopologyProfile,
  isWorkspaceProfileId,
  WORKSPACE_PROFILE_FINGERPRINT,
  WORKSPACE_PROFILE_VERSION,
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  type TopologyProfile,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';
import {
  findWorkspaceAgentProfile,
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';
import {
  addBlocker,
  isRecord,
  materializeFindings,
  normalizeOptionalString,
  sameJson,
  workspaceDiagnosticPolicy,
} from './workspace-diagnostics-parts/policy.ts';
import type { WorkspaceDiagnosticFinding } from './workspace-diagnostics-parts/policy.ts';
export type { WorkspaceDiagnosticFinding } from './workspace-diagnostics-parts/policy.ts';
export {
  DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  materializeFindings,
} from './workspace-diagnostics-parts/policy.ts';
export {
  adoptWorkspace,
  type WorkspaceAdoptOptions,
} from './workspace-diagnostics-parts/adoption.ts';

export type WorkspaceValidationOptions = {
  workspacePath?: string;
};

export type WorkspaceDoctorOptions = WorkspaceValidationOptions;

export type WorkspaceLifecycleOptions = {
  workspacePath?: string;
  projectId?: string;
  status?: 'active' | 'paused' | 'archived' | 'superseded' | 'locked';
  reason?: string;
  supersededByProjectId?: string;
  ownerReceiptRef?: string;
  dryRun?: boolean;
  apply?: boolean;
};

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

function profileIdFromIndex(index: Record<string, unknown>): WorkspaceProfileId | null {
  const profile = isRecord(index.workspace_topology_profile) ? index.workspace_topology_profile : null;
  const profileId = profile?.profile_id;
  return isWorkspaceProfileId(profileId) ? profileId : null;
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
    const parsed = parseJsonText(fs.readFileSync(indexPath, 'utf8'));
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

function readJsonRecord(filePath: string) {
  const parsed = readJsonFileOrNull(filePath);
  return isRecord(parsed) ? parsed : null;
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
  status: typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number];
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
} {
  const lifecycle = isRecord(value) ? value : {};
  const status = WORKSPACE_PROJECT_LIFECYCLE_STATUSES.includes(
    lifecycle.status as typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number],
  )
    ? lifecycle.status as typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number]
    : 'active';
  return {
    status,
    archived_at: typeof lifecycle.archived_at === 'string'
      ? lifecycle.archived_at
      : null,
    archive_reason: typeof lifecycle.archive_reason === 'string'
      ? lifecycle.archive_reason
      : null,
    paused_at: typeof lifecycle.paused_at === 'string' ? lifecycle.paused_at : null,
    pause_reason: typeof lifecycle.pause_reason === 'string' ? lifecycle.pause_reason : null,
    superseded_at: typeof lifecycle.superseded_at === 'string' ? lifecycle.superseded_at : null,
    superseded_by_project_id: typeof lifecycle.superseded_by_project_id === 'string'
      ? lifecycle.superseded_by_project_id
      : null,
    locked_at: typeof lifecycle.locked_at === 'string' ? lifecycle.locked_at : null,
    lock_reason: typeof lifecycle.lock_reason === 'string' ? lifecycle.lock_reason : null,
    retention_policy: lifecycle.retention_policy === 'keep_until_explicit_delete_receipt'
      ? 'keep_until_explicit_delete_receipt'
      : 'keep_until_explicit_archive',
    safe_delete_gate: 'domain_owner_receipt_required',
  };
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

    if (!isRecord(input.index.generated_refs)) {
      addBlocker(blockers, 'generated_refs_missing');
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
    for (const resource of expectedSharedResources) {
      const manifestRef = sharedResourceManifestRef(resource.path);
      const manifestPath = path.join(input.workspacePath, manifestRef);
      if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
        addBlocker(blockers, 'shared_resource_manifest_missing', { path: manifestRef });
      } else {
        const actual = readJsonRecord(manifestPath);
        const existingRecords = readExistingSharedResourceRecords(manifestPath);
        const expected = buildSharedResourceManifest({
          workspaceId: indexWorkspaceId(input.index, input.workspacePath),
          agent,
          resource,
          updatedAt: indexUpdatedAt(input.index),
          existingRecords,
        });
        if (!actual || !sameJson(actual, expected)) {
          addBlocker(blockers, 'shared_resource_manifest_drift', {
            path: manifestRef,
            expected,
          });
        }
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
    const expectedNorm = buildAgentWorkspaceNormProjection({
      contract: input.contracts.agentWorkspaceNorm,
      agentId: agent?.agent_id ?? null,
    });
    if (norm.norm_id !== expectedNorm.norm_id || norm.version !== expectedNorm.version) {
      addBlocker(blockers, 'workspace_norm_drift', {
        expected: {
          norm_id: expectedNorm.norm_id,
          version: expectedNorm.version,
        },
      });
    }
    if (!sameJson(norm, expectedNorm)) {
      addBlocker(blockers, 'workspace_norm_projection_drift', { expected: expectedNorm });
    }
  }

  if (!isRecord(input.index.profile_binding)) {
    addBlocker(blockers, 'profile_binding_missing');
  } else if (
    input.index.profile_binding.profile_version !== WORKSPACE_PROFILE_VERSION
    || input.index.profile_binding.profile_fingerprint !== WORKSPACE_PROFILE_FINGERPRINT
    || input.index.profile_binding.profile_contract_ref !== WORKSPACE_TOPOLOGY_CONTRACT_REF
    || !Array.isArray(input.index.profile_binding.migration_history)
  ) {
    addBlocker(blockers, 'profile_binding_drift', {
      expected: {
        profile_version: WORKSPACE_PROFILE_VERSION,
        profile_fingerprint: WORKSPACE_PROFILE_FINGERPRINT,
        profile_contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
      },
    });
  }
  if (!Array.isArray(input.index.topology_events) || input.index.topology_events.length === 0) {
    addBlocker(blockers, 'topology_events_missing');
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
      ['indexed_control_root_missing', normalized.control_root],
      ['indexed_inputs_root_missing', normalized.inputs_root],
      ['indexed_stage_outputs_root_missing', normalized.stage_outputs_root],
      ['indexed_exports_root_missing', normalized.exports_root],
      ['indexed_packages_root_missing', normalized.packages_root],
      ['indexed_review_root_missing', normalized.review_root],
      ['indexed_handoff_root_missing', normalized.handoff_root],
      ['indexed_archive_root_missing', normalized.archive_root],
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
    const projectConfigRef = normalized.project_config_ref || `${normalized.project_root}/${PROJECT_CONFIG_BASENAME}`;
    const projectConfigPath = path.join(input.workspacePath, projectConfigRef);
    if (!fs.existsSync(projectConfigPath) || !fs.statSync(projectConfigPath).isFile()) {
      addBlocker(blockers, 'indexed_project_config_missing', {
        project_id: normalized.project_id,
        path: projectConfigRef,
      });
    }
    if (agent && profile) {
      const projectIndexRef = normalized.project_index_ref || `${normalized.project_root}/${PROJECT_INDEX_BASENAME}`;
      const projectIndexPath = path.join(input.workspacePath, projectIndexRef);
      if (!fs.existsSync(projectIndexPath) || !fs.statSync(projectIndexPath).isFile()) {
        addBlocker(blockers, 'indexed_project_index_missing', {
          project_id: normalized.project_id,
          path: projectIndexRef,
        });
      } else {
        const actual = readJsonRecord(projectIndexPath);
        const expected = buildProjectIndex({
          workspaceId: indexWorkspaceId(input.index, input.workspacePath),
          agent,
          profile,
          project: normalized,
          updatedAt: indexUpdatedAt(input.index),
        });
        if (!actual || !sameJson(actual, expected)) {
          addBlocker(blockers, 'indexed_project_index_drift', {
            project_id: normalized.project_id,
            path: projectIndexRef,
            expected,
          });
        }
      }
      const manifestPath = path.join(input.workspacePath, normalized.stage_outputs_manifest_ref);
      if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
        addBlocker(blockers, 'indexed_stage_outputs_manifest_missing', {
          project_id: normalized.project_id,
          path: normalized.stage_outputs_manifest_ref,
        });
      } else {
        const actual = readJsonRecord(manifestPath);
        const expected = buildStageOutputsManifest({
          workspaceId: indexWorkspaceId(input.index, input.workspacePath),
          agent,
          project: normalized,
          updatedAt: indexUpdatedAt(input.index),
        });
        if (!actual || !sameJson(actual, expected)) {
          addBlocker(blockers, 'indexed_stage_outputs_manifest_drift', {
            project_id: normalized.project_id,
            path: normalized.stage_outputs_manifest_ref,
            expected,
          });
        }
      }
      const stageIndexRef = normalized.stage_outputs_index_ref || stageOutputsIndexRef(normalized.stage_outputs_root);
      const stageIndexPath = path.join(input.workspacePath, stageIndexRef);
      if (!fs.existsSync(stageIndexPath) || !fs.statSync(stageIndexPath).isFile()) {
        addBlocker(blockers, 'indexed_stage_outputs_index_missing', {
          project_id: normalized.project_id,
          path: stageIndexRef,
        });
      } else {
        const actual = readJsonRecord(stageIndexPath);
        const driftFields = actual
          ? validateStageOutputsIndexShape({
              actual,
              workspaceId: indexWorkspaceId(input.index, input.workspacePath),
              agent,
              project: normalized,
            })
          : ['invalid_json'];
        if (driftFields.length > 0) {
          addBlocker(blockers, 'indexed_stage_outputs_index_drift', {
            project_id: normalized.project_id,
            path: stageIndexRef,
            drift_fields: driftFields,
          });
        }
      }
      const currentPointerRef = normalized.current_stage_pointer_ref || currentStagePointerRef(normalized.stage_outputs_root);
      const currentPointerPath = path.join(input.workspacePath, currentPointerRef);
      if (!fs.existsSync(currentPointerPath) || !fs.statSync(currentPointerPath).isFile()) {
        addBlocker(blockers, 'indexed_current_stage_pointer_missing', {
          project_id: normalized.project_id,
          path: currentPointerRef,
        });
      } else {
        const actual = readJsonRecord(currentPointerPath);
        const driftFields = actual
          ? validateCurrentStagePointerShape({
              actual,
              workspaceId: indexWorkspaceId(input.index, input.workspacePath),
              agent,
              project: normalized,
            })
          : ['invalid_json'];
        if (driftFields.length > 0) {
          addBlocker(blockers, 'indexed_current_stage_pointer_drift', {
            project_id: normalized.project_id,
            path: currentPointerRef,
            drift_fields: driftFields,
          });
        }
      }
    }
  });

  if (!isRecord(input.index.interface_projection)) {
    addBlocker(blockers, 'interface_projection_missing');
  }

  if (agent && profile) {
    const now = indexUpdatedAt(input.index);
    const context = {
      workspaceId: indexWorkspaceId(input.index, input.workspacePath),
      title: indexTitle(input.index),
      workspacePath: input.workspacePath,
      agent,
      profile,
      projects: normalizedProjects,
      createdAt: indexCreatedAt(input.index, now),
      updatedAt: now,
    };
    const generatedProjectionPairs: Array<[string, string]> = [
      [GENERATED_WORKSPACE_MAP_REF, WORKSPACE_MAP_REF],
      [GENERATED_WORKSPACE_HEALTH_REF, WORKSPACE_HEALTH_REF],
      [GENERATED_WORKSPACE_INSPECTION_REF, WORKSPACE_INSPECTION_REF],
      [GENERATED_WORKSPACE_RESOURCE_INVENTORY_REF, WORKSPACE_RESOURCE_INVENTORY_REF],
      [GENERATED_WORKSPACE_REPORT_REF, WORKSPACE_REPORT_REF],
    ];
    for (const [canonicalRef, mirrorRef] of generatedProjectionPairs) {
      const canonicalPath = path.join(input.workspacePath, canonicalRef);
      const mirrorPath = path.join(input.workspacePath, mirrorRef);
      if (!fs.existsSync(canonicalPath) || !fs.statSync(canonicalPath).isFile()) {
        addBlocker(blockers, 'canonical_generated_projection_missing', { path: canonicalRef });
      } else if (fs.existsSync(mirrorPath) && fs.statSync(mirrorPath).isFile()) {
        const canonicalPayload = readJsonRecord(canonicalPath);
        const mirrorPayload = readJsonRecord(mirrorPath);
        if (!canonicalPayload || !mirrorPayload || !sameJson(canonicalPayload, mirrorPayload)) {
          addBlocker(blockers, 'canonical_generated_projection_drift', {
            canonical_path: canonicalRef,
            root_mirror_path: mirrorRef,
          });
        }
      }
    }
    const mapPath = path.join(input.workspacePath, WORKSPACE_MAP_REF);
    if (!fs.existsSync(mapPath) || !fs.statSync(mapPath).isFile()) {
      addBlocker(blockers, 'workspace_map_missing', { path: WORKSPACE_MAP_REF });
    } else {
      const actualMap = readJsonRecord(mapPath);
      const expectedMap = buildWorkspaceMap(context);
      if (!actualMap || !sameJson(actualMap, expectedMap)) {
        addBlocker(blockers, 'workspace_map_drift', { path: WORKSPACE_MAP_REF });
      }
    }
    const healthPath = path.join(input.workspacePath, WORKSPACE_HEALTH_REF);
    if (!fs.existsSync(healthPath) || !fs.statSync(healthPath).isFile()) {
      addBlocker(blockers, 'workspace_health_missing', { path: WORKSPACE_HEALTH_REF });
    } else {
      const actualHealth = readJsonRecord(healthPath);
      const expectedHealth = buildWorkspaceHealth(context);
      if (!actualHealth || !sameJson(actualHealth, expectedHealth)) {
        addBlocker(blockers, 'workspace_health_drift', { path: WORKSPACE_HEALTH_REF });
      }
    }
    const inspectionPath = path.join(input.workspacePath, WORKSPACE_INSPECTION_REF);
    if (!fs.existsSync(inspectionPath) || !fs.statSync(inspectionPath).isFile()) {
      addBlocker(blockers, 'workspace_inspection_missing', { path: WORKSPACE_INSPECTION_REF });
    } else {
      const actualInspection = readJsonRecord(inspectionPath);
      const expectedInspection = buildWorkspaceInspection(context);
      if (!actualInspection || !sameJson(actualInspection, expectedInspection)) {
        addBlocker(blockers, 'workspace_inspection_drift', { path: WORKSPACE_INSPECTION_REF });
      }
    }
    const resourceInventoryPath = path.join(input.workspacePath, WORKSPACE_RESOURCE_INVENTORY_REF);
    if (!fs.existsSync(resourceInventoryPath) || !fs.statSync(resourceInventoryPath).isFile()) {
      addBlocker(blockers, 'workspace_resource_inventory_missing', { path: WORKSPACE_RESOURCE_INVENTORY_REF });
    } else {
      const actualInventory = readJsonRecord(resourceInventoryPath);
      const expectedInventory = buildWorkspaceResourceInventory(context);
      if (!actualInventory || !sameJson(actualInventory, expectedInventory)) {
        addBlocker(blockers, 'workspace_resource_inventory_drift', {
          path: WORKSPACE_RESOURCE_INVENTORY_REF,
        });
      }
    }
    const reportPath = path.join(input.workspacePath, WORKSPACE_REPORT_REF);
    if (!fs.existsSync(reportPath) || !fs.statSync(reportPath).isFile()) {
      addBlocker(blockers, 'workspace_report_missing', { path: WORKSPACE_REPORT_REF });
    } else {
      const actualReport = readJsonRecord(reportPath);
      const expectedReport = buildWorkspaceReport(context);
      if (!actualReport || !sameJson(actualReport, expectedReport)) {
        addBlocker(blockers, 'workspace_report_drift', { path: WORKSPACE_REPORT_REF });
      }
    }
  }

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
  findingsInput: Array<{ code: string; message: string; details?: Record<string, unknown> }>,
  context: {
    index: Record<string, unknown>;
    agent: WorkspaceAgentProfile | null;
    profile: TopologyProfile | null;
    profileId: WorkspaceProfileId | null;
    indexedProjects: WorkspaceProjectIndexEntry[];
  } | null,
) {
  const diagnosticPolicy = workspaceDiagnosticPolicy(contracts);
  const findings = materializeFindings(diagnosticPolicy, workspacePath, findingsInput);
  const hardBlockers = findings.filter((finding) => finding.severity === 'hard_blocker');
  const repairableFindings = findings.filter((finding) => finding.severity === 'repairable');
  const advisoryWarnings = findings.filter((finding) => finding.severity === 'advisory');
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_doctor: {
      surface_kind: 'opl_workspace_doctor',
      status: hardBlockers.length > 0
        ? 'blocked'
        : repairableFindings.length > 0
          ? 'repairable'
          : advisoryWarnings.length > 0
            ? 'warning'
            : 'passed',
      workspace_path: workspacePath,
      workspace_index_path: workspaceIndexPath,
      checked_at: new Date().toISOString(),
      diagnostic_policy: diagnosticPolicy,
      finding_count: findings.length,
      hard_blocker_count: hardBlockers.length,
      repairable_finding_count: repairableFindings.length,
      advisory_warning_count: advisoryWarnings.length,
      findings,
      blockers: hardBlockers,
      hard_blockers: hardBlockers,
      repairable_findings: repairableFindings,
      advisory_warnings: advisoryWarnings,
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
      profile_binding: context?.index.profile_binding ?? null,
      topology_events: context?.index.topology_events ?? null,
      generated_refs: context?.index.generated_refs ?? null,
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
  if (doctor.blockers.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace validation failed.',
      {
        workspace_path: doctor.workspace_path,
        workspace_index_path: doctor.workspace_index_path,
        blockers: doctor.blockers,
        repairable_findings: doctor.repairable_findings,
        advisory_warnings: doctor.advisory_warnings,
        findings: doctor.findings,
        diagnostic_policy: doctor.diagnostic_policy,
      },
    );
  }
  return {
    ...payload,
    workspace_validation: {
      surface_kind: 'opl_workspace_validation',
      status: doctor.repairable_findings.length > 0
        ? 'passed_with_repairable_findings'
        : doctor.advisory_warnings.length > 0
          ? 'passed_with_warnings'
          : 'passed',
      workspace_path: doctor.workspace_path,
      workspace_index_path: doctor.workspace_index_path,
      checked_at: doctor.checked_at,
      diagnostic_policy: doctor.diagnostic_policy,
      finding_count: doctor.finding_count,
      hard_blocker_count: doctor.hard_blocker_count,
      repairable_finding_count: doctor.repairable_finding_count,
      advisory_warning_count: doctor.advisory_warning_count,
      blockers: doctor.blockers,
      hard_blockers: doctor.hard_blockers,
      repairable_findings: doctor.repairable_findings,
      advisory_warnings: doctor.advisory_warnings,
      canonical_topology: doctor.canonical_topology,
      display_labels: doctor.display_labels,
      shared_resources: doctor.shared_resources,
      indexed_projects: doctor.indexed_projects,
      authority_boundary: doctor.authority_boundary,
      runtime_state_boundary: doctor.runtime_state_boundary,
    },
  };
}
