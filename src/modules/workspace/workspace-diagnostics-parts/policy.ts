import { isRecord } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

export { isRecord };

export type WorkspaceDiagnosticSeverity = 'hard_blocker' | 'repairable' | 'advisory';

export type WorkspaceDiagnosticFinding = {
  code: string;
  message: string;
  severity: WorkspaceDiagnosticSeverity;
  default_blocks_execution: boolean;
  details?: Record<string, unknown>;
  repair_command?: string;
};

export const BLOCKER_MESSAGES: Record<string, string> = {
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

export const DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY = {
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

export function workspaceDiagnosticPolicy(contracts: FrameworkContracts) {
  return contracts.agentWorkspaceNorm.workspace_diagnostic_policy ?? DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY;
}

function classifyDiagnostic(
  policy: typeof DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  code: string,
): WorkspaceDiagnosticSeverity {
  if (policy.hard_blocker_codes.includes(code)) {
    return 'hard_blocker';
  }
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

export function materializeFindings(
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

export function addBlocker(
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

export function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
