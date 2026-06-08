import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { buildAgentWorkspaceNormProjection } from './agent-workspace-norm.ts';
import type { FrameworkContracts } from './types.ts';
import { initializeWorkspace } from './workspace-initializer.ts';
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
  WORKSPACE_PROFILE_FINGERPRINT,
  WORKSPACE_PROFILE_VERSION,
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

export type WorkspaceDiagnosticSeverity = 'hard_blocker' | 'repairable' | 'advisory';

export type WorkspaceDiagnosticFinding = {
  code: string;
  message: string;
  severity: WorkspaceDiagnosticSeverity;
  default_blocks_execution: boolean;
  details?: Record<string, unknown>;
  repair_command?: string;
};

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
  shared_resource_manifest_missing: 'A declared shared resource manifest is missing on disk.',
  shared_resource_manifest_drift: 'A declared shared resource manifest does not match the OPL projection.',
  domain_topology_profile_drift: 'workspace_index.json agent topology profile does not match the executable OPL norm contract.',
  project_collection_missing: 'The project collection directory is missing.',
  indexed_projects_missing: 'workspace_index.json does not list any projects.',
  indexed_project_shape_invalid: 'An indexed project has invalid path fields.',
  indexed_project_root_missing: 'An indexed project root is missing on disk.',
  indexed_project_config_missing: 'An indexed project config is missing on disk.',
  indexed_project_index_missing: 'An indexed project index is missing on disk.',
  indexed_project_index_drift: 'An indexed project index does not match the OPL projection.',
  indexed_inputs_root_missing: 'An indexed project inputs root is missing on disk.',
  indexed_exports_root_missing: 'An indexed project exports root is missing on disk.',
  indexed_packages_root_missing: 'An indexed project packages root is missing on disk.',
  indexed_archive_root_missing: 'An indexed project archive root is missing on disk.',
  indexed_stage_outputs_root_missing: 'An indexed project stage outputs root is missing on disk.',
  indexed_stage_outputs_manifest_missing: 'An indexed project stage outputs manifest is missing on disk.',
  indexed_stage_outputs_manifest_drift: 'An indexed project stage outputs manifest does not match the OPL projection.',
  indexed_stage_outputs_index_missing: 'An indexed project stage outputs index is missing on disk.',
  indexed_stage_outputs_index_drift: 'An indexed project stage outputs index does not match the OPL projection.',
  indexed_current_stage_pointer_missing: 'An indexed project current stage pointer is missing on disk.',
  indexed_current_stage_pointer_drift: 'An indexed project current stage pointer does not match the OPL projection.',
  indexed_control_root_missing: 'An indexed project control root is missing on disk.',
  indexed_review_root_missing: 'An indexed project review root is missing on disk.',
  indexed_handoff_root_missing: 'An indexed project handoff root is missing on disk.',
  workspace_map_missing: 'workspace_map.json is missing.',
  workspace_map_drift: 'workspace_map.json does not match the OPL projection.',
  workspace_health_missing: 'workspace_health.json is missing.',
  workspace_health_drift: 'workspace_health.json does not match the OPL projection.',
  workspace_inspection_missing: 'workspace_inspection.json is missing.',
  workspace_inspection_drift: 'workspace_inspection.json does not match the OPL projection.',
  workspace_resource_inventory_missing: 'workspace_resource_inventory.json is missing.',
  workspace_resource_inventory_drift: 'workspace_resource_inventory.json does not match the OPL projection.',
  workspace_report_missing: 'workspace_report.json is missing.',
  workspace_report_drift: 'workspace_report.json does not match the OPL projection.',
  canonical_generated_projection_missing: 'A canonical control/opl generated projection is missing.',
  canonical_generated_projection_drift: 'A canonical control/opl generated projection does not match its root mirror projection.',
  profile_binding_missing: 'workspace_index.json is missing profile binding metadata.',
  profile_binding_drift: 'workspace profile binding metadata is stale or does not match the current protocol.',
  topology_events_missing: 'workspace_index.json is missing topology event history.',
  workspace_norm_projection_drift: 'workspace_norm projection does not match the executable norm projection.',
  generated_refs_missing: 'workspace_index.json is missing generated_refs.',
  interface_projection_missing: 'workspace_index.json is missing interface_projection.',
  authority_boundary_overclaim: 'authority_boundary grants authority that OPL must not hold.',
  runtime_state_boundary_overclaim: 'runtime_state_boundary treats runtime-state as user/project truth.',
  workspace_norm_missing: 'workspace_index.json is missing workspace_norm projection.',
  workspace_norm_drift: 'workspace_norm projection does not match the executable norm contract.',
};

const REPAIRABLE_DIAGNOSTIC_CODES = new Set([
  'workspace_config_missing',
  'canonical_topology_missing',
  'canonical_topology_drift',
  'display_labels_missing',
  'display_labels_drift',
  'shared_resources_missing',
  'shared_resources_drift',
  'shared_resource_root_missing',
  'shared_resource_manifest_missing',
  'shared_resource_manifest_drift',
  'generated_refs_missing',
  'workspace_norm_missing',
  'workspace_norm_drift',
  'workspace_norm_projection_drift',
  'profile_binding_missing',
  'profile_binding_drift',
  'topology_events_missing',
  'indexed_project_config_missing',
  'indexed_project_index_missing',
  'indexed_project_index_drift',
  'indexed_inputs_root_missing',
  'indexed_exports_root_missing',
  'indexed_packages_root_missing',
  'indexed_archive_root_missing',
  'indexed_stage_outputs_root_missing',
  'indexed_stage_outputs_manifest_missing',
  'indexed_stage_outputs_manifest_drift',
  'indexed_stage_outputs_index_missing',
  'indexed_current_stage_pointer_missing',
  'indexed_control_root_missing',
  'indexed_review_root_missing',
  'indexed_handoff_root_missing',
  'workspace_map_missing',
  'workspace_map_drift',
  'workspace_health_missing',
  'workspace_health_drift',
  'workspace_inspection_missing',
  'workspace_inspection_drift',
  'workspace_resource_inventory_missing',
  'workspace_resource_inventory_drift',
  'workspace_report_missing',
  'workspace_report_drift',
  'canonical_generated_projection_missing',
  'canonical_generated_projection_drift',
  'interface_projection_missing',
]);

const ADVISORY_DIAGNOSTIC_CODES = new Set<string>();

const DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY = {
  policy_id: 'opl.workspace_diagnostics.contract_light.v1',
  surface_kind: 'opl_workspace_diagnostic_policy',
  default_execution_blocks_on: 'hard_blockers_only',
  hard_blocker_rule:
    'Only missing/invalid workspace identity, unsafe project shape, authority overclaim, runtime-state overclaim, and closeout-sensitive stage pointer/index shape drift stop default execution.',
  repairable_rule:
    'Generated metadata, profile binding, topology events, shared manifests, directory skeletons, root mirrors, reports, and missing stage projections are repairable through workspace upgrade.',
  advisory_rule:
    'Advisory warnings are operator hints only and never block default execution.',
  auto_repair_command_template: 'opl workspace upgrade --workspace <path> --apply',
  repairable_findings_block_default_execution: false,
  advisory_warnings_block_default_execution: false,
  hard_blocker_codes: [
    'workspace_path_required',
    'workspace_root_missing',
    'workspace_root_not_directory',
    'workspace_index_missing',
    'workspace_index_invalid_json',
    'workspace_index_shape_invalid',
    'agent_metadata_missing',
    'workspace_topology_profile_missing',
    'domain_topology_profile_drift',
    'project_collection_missing',
    'indexed_projects_missing',
    'indexed_project_shape_invalid',
    'indexed_project_root_missing',
    'indexed_stage_outputs_index_drift',
    'indexed_current_stage_pointer_drift',
    'authority_boundary_overclaim',
    'runtime_state_boundary_overclaim',
  ],
  repairable_finding_codes: [...REPAIRABLE_DIAGNOSTIC_CODES],
  advisory_warning_codes: [...ADVISORY_DIAGNOSTIC_CODES],
};

function workspaceDiagnosticPolicy(contracts: FrameworkContracts) {
  return contracts.agentWorkspaceNorm.workspace_diagnostic_policy ?? DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY;
}

function classifyDiagnostic(
  policy: typeof DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  code: string,
): WorkspaceDiagnosticSeverity {
  if (policy.repairable_finding_codes.includes(code)) {
    return 'repairable';
  }
  if (policy.advisory_warning_codes.includes(code)) {
    return 'advisory';
  }
  return 'hard_blocker';
}

function repairCommand(workspacePath: string | null, severity: WorkspaceDiagnosticSeverity) {
  return severity === 'repairable' && workspacePath
    ? `opl workspace upgrade --workspace ${JSON.stringify(workspacePath)} --apply`
    : undefined;
}

function materializeFindings(
  policy: typeof DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  workspacePath: string | null,
  findings: Array<{ code: string; message: string; details?: Record<string, unknown> }>,
): WorkspaceDiagnosticFinding[] {
  return findings.map((finding) => {
    const severity = classifyDiagnostic(policy, finding.code);
    const command = repairCommand(workspacePath, severity);
    return {
      ...finding,
      severity,
      default_blocks_execution: severity === 'hard_blocker',
      ...(command ? { repair_command: command } : {}),
    };
  });
}

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
  return normalizeWorkspaceProjectEntry(project);
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

function readJsonRecord(filePath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
      contract: input.contracts.agentWorkspaceNorm,
      agent,
      profileId,
      profile,
    });
    const declaredDomainProfile = input.contracts.agentWorkspaceNorm.domain_topology_profiles[agent.agent_id];
    const domainProfileMatches = declaredDomainProfile
      && declaredDomainProfile.profile === profileId
      && declaredDomainProfile.workspace_mode === profile.workspace_mode
      && declaredDomainProfile.project_kind === agent.project_kind
      && declaredDomainProfile.project_collection_path === profile.project_collection_path
      && sameJson(declaredDomainProfile.shared_resource_roots, profile.shared_resource_roots);
    if (!domainProfileMatches) {
      addBlocker(blockers, 'domain_topology_profile_drift', {
        agent_id: agent.agent_id,
        expected: declaredDomainProfile ?? null,
        actual: {
          profile: profileId,
          workspace_mode: profile.workspace_mode,
          project_kind: agent.project_kind,
          project_collection_path: profile.project_collection_path,
          shared_resource_roots: profile.shared_resource_roots,
        },
      });
    }

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
    ? readWorkspaceIndex(existingIndexPath).index
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
