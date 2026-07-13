import type { WorkspaceDiagnosticFinding } from '../workspace-diagnostics.ts';

export type WorkspaceFleetStatus =
  | 'archived_binding'
  | 'blocked'
  | 'not_bound'
  | 'ready'
  | 'repairable'
  | 'warning';

export function fleetStatusForDoctor(doctor: {
  blockers: WorkspaceDiagnosticFinding[];
  repairable_findings: WorkspaceDiagnosticFinding[];
  advisory_warnings: WorkspaceDiagnosticFinding[];
}): Exclude<WorkspaceFleetStatus, 'archived_binding' | 'not_bound'> {
  if (doctor.blockers.length > 0) {
    return 'blocked';
  }
  if (doctor.repairable_findings.length > 0) {
    return 'repairable';
  }
  if (doctor.advisory_warnings.length > 0) {
    return 'warning';
  }
  return 'ready';
}

export function workspaceFleetEntryAuthorityBoundary() {
  return {
    fleet_report_is_projection_only: true,
    fleet_report_executes_direct_entry: false,
    fleet_report_executes_manifest_command: false,
    fleet_report_writes_domain_truth: false,
  };
}

export function workspaceFleetReportAuthorityBoundary() {
  return {
    ...workspaceFleetEntryAuthorityBoundary(),
    fleet_report_claims_domain_ready: false,
    fleet_report_claims_stage_complete: false,
  };
}

export function unboundWorkspaceProjectFleetEntry(project: { project_id: string; project: string }) {
  return {
    project_id: project.project_id,
    project: project.project,
    fleet_status: 'not_bound' as const,
    workspace_path: null,
    workspace_report_command: null,
    workspace_report_ref: null,
    registry_binding: null,
    workspace_health: null,
    blockers: [],
  };
}

export function workspaceFleetReportStatus(entries: Array<{ fleet_status: unknown }>) {
  if (entries.some((entry) => entry.fleet_status === 'blocked')) {
    return 'blocked';
  }
  if (entries.some((entry) => entry.fleet_status === 'repairable')) {
    return 'repairable';
  }
  if (entries.some((entry) => entry.fleet_status === 'warning')) {
    return 'warning';
  }
  return 'ok';
}

export function workspaceFleetReportSummary(
  entries: Array<{ fleet_status: unknown }>,
  unboundProjects: unknown[],
) {
  return {
    bindings_count: entries.length,
    ready_bindings_count: entries.filter((entry) => entry.fleet_status === 'ready').length,
    repairable_bindings_count: entries.filter((entry) => entry.fleet_status === 'repairable').length,
    warning_bindings_count: entries.filter((entry) => entry.fleet_status === 'warning').length,
    blocked_bindings_count: entries.filter((entry) => entry.fleet_status === 'blocked').length,
    archived_bindings_count: entries.filter((entry) => entry.fleet_status === 'archived_binding').length,
    unbound_projects_count: unboundProjects.length,
  };
}
