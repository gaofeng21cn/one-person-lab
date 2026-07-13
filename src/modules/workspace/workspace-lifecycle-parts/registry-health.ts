import path from 'node:path';

import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { WorkspaceDiagnosticFinding } from '../workspace-diagnostics.ts';
import { buildWorkspaceCatalog, type WorkspaceBinding } from '../workspace-registry.ts';

type WorkspaceDoctorProjection = {
  status: string;
  checked_at: string;
  finding_count: number;
  hard_blocker_count: number;
  repairable_finding_count: number;
  advisory_warning_count: number;
  findings: WorkspaceDiagnosticFinding[];
  blockers: WorkspaceDiagnosticFinding[];
  hard_blockers: WorkspaceDiagnosticFinding[];
  repairable_findings: WorkspaceDiagnosticFinding[];
  advisory_warnings: WorkspaceDiagnosticFinding[];
};

export function workspaceRegistryContext(
  contracts: FrameworkContracts,
  workspacePath: string,
) {
  const catalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const bindings = (catalog.bindings as WorkspaceBinding[])
    .filter((binding) => path.resolve(binding.workspace_path) === workspacePath)
    .map((binding) => ({
      binding_id: binding.binding_id,
      project_id: binding.project_id,
      project: binding.project,
      registry_status: binding.status,
      is_default_context: binding.status === 'active',
    }));
  return {
    catalog_status: bindings.length > 0 ? 'bound' : 'unbound',
    bindings,
    active_binding_ids: bindings
      .filter((binding) => binding.is_default_context)
      .map((binding) => binding.binding_id),
  };
}

export function workspaceHealthContext(doctor: WorkspaceDoctorProjection) {
  return {
    status: doctor.status,
    checked_at: doctor.checked_at,
    finding_count: doctor.finding_count,
    hard_blocker_count: doctor.hard_blocker_count,
    repairable_finding_count: doctor.repairable_finding_count,
    advisory_warning_count: doctor.advisory_warning_count,
    findings: doctor.findings,
  };
}

export function diagnosticOnlyWorkspaceReport(
  workspacePath: string,
  doctor: WorkspaceDoctorProjection,
  registryContext: ReturnType<typeof workspaceRegistryContext>,
) {
  return {
    surface_kind: 'opl_workspace_report',
    version: 'workspace-report.v1',
    report_status: 'diagnostic_only',
    workspace_id: null,
    title: path.basename(workspacePath),
    workspace_path: workspacePath,
    registry: registryContext,
    workspace_health: workspaceHealthContext(doctor),
    agent: null,
    topology: null,
    current_project: null,
    projects: [],
    shared_resources: [],
    projection_refs: null,
    finding_count: doctor.finding_count,
    blockers: doctor.blockers,
    hard_blockers: doctor.hard_blockers,
    repairable_findings: doctor.repairable_findings,
    advisory_warnings: doctor.advisory_warnings,
    authority_boundary: {
      report_is_projection_only: true,
      report_can_claim_stage_complete: false,
      report_can_replace_owner_receipt: false,
      report_can_replace_typed_blocker: false,
      opl_can_write_domain_truth: false,
    },
    updated_at: doctor.checked_at,
  };
}
