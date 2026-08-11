import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  doctorWorkspace,
  type WorkspaceDiagnosticFinding,
  type WorkspaceLifecycleOptions,
  type WorkspaceValidationOptions,
} from './workspace-diagnostics.ts';
import {
  buildWorkspaceHealth,
  buildWorkspaceInspection,
  buildWorkspaceMap,
  buildWorkspaceReport,
  buildWorkspaceResourceInventory,
  ensureDirectory,
  materializeWorkspaceGeneratedArtifacts,
  WORKSPACE_HEALTH_REF,
  WORKSPACE_INSPECTION_REF,
  WORKSPACE_MAP_REF,
  WORKSPACE_REPORT_REF,
  WORKSPACE_RESOURCE_INVENTORY_REF,
  writeJsonArtifact,
} from './workspace-artifacts.ts';
import {
  buildWorkspaceCatalog,
  inspectWorkspacePathCurrentness,
  type WorkspaceBinding,
} from './workspace-registry.ts';
import {
  type TopologyProfile,
  type WorkspaceLifecycleStatus,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';
import {
  type WorkspaceAgentProfile,
} from './workspace-agent-defaults.ts';
import {
  agentFromIndex,
  indexCreatedAt,
  indexTitle,
  indexUpdatedAt,
  indexWorkspaceId,
  normalizeProjectEntry,
  normalizeWorkspaceLifecycle,
  profileFromIndex,
  profileIdFromIndex,
  readWorkspaceIndex,
} from './workspace-index-normalization.ts';
import {
  buildWorkspaceIndex,
  buildWorkspaceYaml,
} from './workspace-initializer.ts';
import {
  fleetStatusForDoctor,
  unboundWorkspaceProjectFleetEntry,
  workspaceFleetEntryAuthorityBoundary,
  workspaceFleetReportAuthorityBoundary,
  workspaceFleetReportStatus,
  workspaceFleetReportSummary,
} from './workspace-lifecycle-parts/fleet-report.ts';
import {
  diagnosticOnlyWorkspaceReport,
  workspaceHealthContext,
  workspaceRegistryContext,
} from './workspace-lifecycle-parts/registry-health.ts';

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function doctorFindingsForArtifacts(doctor: {
  blockers: WorkspaceDiagnosticFinding[];
  findings: WorkspaceDiagnosticFinding[];
  repairable_findings: WorkspaceDiagnosticFinding[];
  advisory_warnings: WorkspaceDiagnosticFinding[];
}) {
  return {
    blockers: doctor.blockers,
    findings: doctor.findings,
    repairableFindings: doctor.repairable_findings,
    advisoryWarnings: doctor.advisory_warnings,
  };
}

export function readValidatedWorkspaceIndex(workspacePathInput: string | undefined) {
  const workspacePath = normalizeOptionalString(workspacePathInput);
  if (!workspacePath) {
    throw new FrameworkContractError('cli_usage_error', 'Workspace lifecycle command requires --workspace.', {
      required: ['--workspace'],
    });
  }
  const absoluteWorkspacePath = path.resolve(workspacePath);
  const indexPath = path.join(absoluteWorkspacePath, 'workspace_index.json');
  const parsed = readWorkspaceIndex(indexPath);
  if (!parsed.index) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace lifecycle command requires a valid workspace_index.json.',
      {
        workspace_path: absoluteWorkspacePath,
        workspace_index_path: indexPath,
        blocker: parsed.blocker,
        ...(parsed.cause ? { cause: parsed.cause } : {}),
      },
    );
  }
  const agent = agentFromIndex(parsed.index);
  const profile = profileFromIndex(parsed.index);
  const profileId = profileIdFromIndex(parsed.index);
  if (!agent || !profile || !profileId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace lifecycle command requires agent and topology profile metadata in workspace_index.json.',
      {
        workspace_path: absoluteWorkspacePath,
        workspace_index_path: indexPath,
      },
    );
  }
  const projects = Array.isArray(parsed.index.projects)
    ? parsed.index.projects.filter(isRecord).map(normalizeProjectEntry).filter((entry): entry is WorkspaceProjectIndexEntry => Boolean(entry))
    : [];
  if (projects.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace lifecycle command requires at least one indexed project.',
      { workspace_path: absoluteWorkspacePath, workspace_index_path: indexPath },
    );
  }
  return {
    workspacePath: absoluteWorkspacePath,
    workspaceIndexPath: indexPath,
    index: parsed.index,
    agent,
    profile,
    profileId,
    projects,
  };
}

function projectByIdOrThrow(projects: WorkspaceProjectIndexEntry[], projectId: string, command: string) {
  const existingProject = projects.find((project) => project.project_id === projectId);
  if (!existingProject) {
    throw new FrameworkContractError('contract_shape_invalid', `${command} requires an indexed project.`, {
      project_id: projectId,
      indexed_project_ids: projects.map((project) => project.project_id),
    });
  }
  return existingProject;
}

function writeWorkspaceMetadata(input: {
  contracts: FrameworkContracts;
  workspacePath: string;
  workspaceIndexPath: string;
  existingIndex: Record<string, unknown>;
  agent: WorkspaceAgentProfile;
  profile: TopologyProfile;
  profileId: WorkspaceProfileId;
  projects: WorkspaceProjectIndexEntry[];
  updatedAt: string;
  profileEvent?: 'upgraded' | 'project_lifecycle_updated';
}) {
  const workspaceId = indexWorkspaceId(input.existingIndex, input.workspacePath);
  const title = indexTitle(input.existingIndex);
  const createdAt = indexCreatedAt(input.existingIndex, input.updatedAt);
  const firstProject = input.projects[0];
  const nextIndex = buildWorkspaceIndex({
    contracts: input.contracts,
    workspaceId,
    workspacePath: input.workspacePath,
    title,
    agent: input.agent,
    profileId: input.profileId,
    profile: input.profile,
    projectId: firstProject.project_id,
    projectRootRef: firstProject.project_root,
    stageOutputsRootRef: firstProject.stage_outputs_root,
    createdAt,
    updatedAt: input.updatedAt,
    projects: input.projects,
    existingIndex: input.existingIndex,
    profileAppliedBy: 'opl_workspace_upgrade',
    profileEvent: input.profileEvent ?? 'upgraded',
  });
  nextIndex.workspace_lifecycle = normalizeWorkspaceLifecycle(input.existingIndex.workspace_lifecycle);
  const workspaceYamlPath = path.join(input.workspacePath, 'workspace.yaml');
  writeJsonArtifact(input.workspaceIndexPath, nextIndex);
  fs.writeFileSync(
    workspaceYamlPath,
    buildWorkspaceYaml({
      workspaceId,
      title,
      agent: input.agent,
      profileId: input.profileId,
      profile: input.profile,
      projects: input.projects,
    }),
  );
  const writtenGeneratedFiles = materializeWorkspaceGeneratedArtifacts({
    workspaceId,
    title,
    workspacePath: input.workspacePath,
    agent: input.agent,
    profile: input.profile,
    projects: input.projects,
    createdAt,
    updatedAt: input.updatedAt,
  });
  return {
    workspaceId,
    title,
    createdAt,
    nextIndex,
    workspaceYamlPath,
    writtenGeneratedFiles,
  };
}

function lifecycleSurfaceKey(status: WorkspaceLifecycleStatus) {
  const actionNameByStatus: Record<WorkspaceLifecycleStatus, string> = {
    active: 'restore',
    paused: 'pause',
    archived: 'archive',
    superseded: 'supersede',
    locked: 'lock',
  };
  return `workspace_project_${actionNameByStatus[status]}`;
}

function lifecycleActionAuthorityBoundary(action: WorkspaceLifecycleStatus) {
  const actionNameByStatus: Record<WorkspaceLifecycleStatus, string> = {
    active: 'restore',
    paused: 'pause',
    archived: 'archive',
    superseded: 'supersede',
    locked: 'lock',
  };
  const actionName = actionNameByStatus[action];
  return {
    lifecycle_deletes_files: false,
    lifecycle_moves_project_roots: false,
    lifecycle_archives_registry_binding: false,
    lifecycle_writes_domain_truth: false,
    lifecycle_creates_owner_receipt: false,
    lifecycle_creates_typed_blocker: false,
    [`${actionName}_deletes_files`]: false,
    [`${actionName}_moves_project_roots`]: false,
    [`${actionName}_archives_registry_binding`]: false,
    [`${actionName}_writes_domain_truth`]: false,
  };
}

function transitionProjectLifecycle(input: {
  project: WorkspaceProjectIndexEntry;
  status: WorkspaceLifecycleStatus;
  updatedAt: string;
  reason: string | null;
  supersededByProjectId: string | null;
}) {
  const lifecycle = {
    ...input.project.lifecycle,
    status: input.status,
  };
  if (input.status === 'active') {
    return {
      ...lifecycle,
      status: 'active' as const,
      archived_at: null,
      archive_reason: null,
      paused_at: null,
      pause_reason: null,
      superseded_at: null,
      superseded_by_project_id: null,
      locked_at: null,
      lock_reason: null,
      retention_policy: 'keep_until_explicit_archive' as const,
      safe_delete_gate: 'domain_owner_receipt_required' as const,
    };
  }
  if (input.status === 'paused') {
    return {
      ...lifecycle,
      status: 'paused' as const,
      paused_at: input.updatedAt,
      pause_reason: input.reason,
    };
  }
  if (input.status === 'locked') {
    return {
      ...lifecycle,
      status: 'locked' as const,
      locked_at: input.updatedAt,
      lock_reason: input.reason,
    };
  }
  if (input.status === 'superseded') {
    return {
      ...lifecycle,
      status: 'superseded' as const,
      superseded_at: input.updatedAt,
      superseded_by_project_id: input.supersededByProjectId,
      retention_policy: 'keep_until_explicit_delete_receipt' as const,
    };
  }
  return {
    ...lifecycle,
    status: 'archived' as const,
    archived_at: input.updatedAt,
    archive_reason: input.reason,
    retention_policy: 'keep_until_explicit_delete_receipt' as const,
  };
}

export function updateWorkspaceProjectLifecycle(
  contracts: FrameworkContracts,
  options: WorkspaceLifecycleOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const projectId = normalizeOptionalString(options.projectId);
  if (!projectId) {
    throw new FrameworkContractError('cli_usage_error', 'workspace project lifecycle requires --project-id.', {
      required: ['--project-id'],
    });
  }
  const status = options.status;
  if (!status) {
    throw new FrameworkContractError('cli_usage_error', 'workspace project lifecycle requires --status.', {
      required: ['--status'],
    });
  }
  const existingProject = projectByIdOrThrow(context.projects, projectId, 'workspace project lifecycle');
  const currentStatus = existingProject.lifecycle.status;
  const supersededByProjectId = normalizeOptionalString(options.supersededByProjectId);
  if (status === 'superseded') {
    if (!supersededByProjectId) {
      throw new FrameworkContractError('cli_usage_error', 'workspace project lifecycle --status superseded requires --superseded-by-project-id.', {
        required: ['--superseded-by-project-id'],
      });
    }
    if (supersededByProjectId === projectId) {
      throw new FrameworkContractError('cli_usage_error', 'A workspace project cannot supersede itself.', {
        project_id: projectId,
        superseded_by_project_id: supersededByProjectId,
      });
    }
    projectByIdOrThrow(context.projects, supersededByProjectId, 'workspace project lifecycle superseded');
  }
  if (status === 'active' && currentStatus !== 'paused' && currentStatus !== 'locked') {
    throw new FrameworkContractError('cli_usage_error', 'workspace project lifecycle can restore active only from paused or locked.', {
      project_id: projectId,
      current_status: currentStatus,
      allowed_current_statuses: ['paused', 'locked'],
    });
  }
  if ((currentStatus === 'archived' || currentStatus === 'superseded') && status !== currentStatus) {
    throw new FrameworkContractError('cli_usage_error', 'Archived or superseded workspace projects are terminal without an explicit owner restore path.', {
      project_id: projectId,
      current_status: currentStatus,
      requested_status: status,
    });
  }
  const apply = options.apply === true && options.dryRun !== true;
  const updatedAt = new Date().toISOString();
  const reason = normalizeOptionalString(options.reason);
  const projects = context.projects.map((project) => (
    project.project_id === projectId
      ? {
          ...project,
          lifecycle: transitionProjectLifecycle({
            project,
            status,
            updatedAt,
            reason,
            supersededByProjectId,
          }),
        }
      : project
  ));
  const written = apply
    ? writeWorkspaceMetadata({
        contracts,
        workspacePath: context.workspacePath,
        workspaceIndexPath: context.workspaceIndexPath,
        existingIndex: context.index,
        agent: context.agent,
        profile: context.profile,
        profileId: context.profileId,
        projects,
        updatedAt,
        profileEvent: 'project_lifecycle_updated',
      })
    : null;
  const lifecycle = projects.find((project) => project.project_id === projectId)?.lifecycle;
  const authorityBoundary = lifecycleActionAuthorityBoundary(status);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_project_lifecycle: {
      surface_kind: 'opl_workspace_project_lifecycle',
      action: status,
      status: apply ? 'applied' : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      workspace_path: context.workspacePath,
      workspace_index_path: context.workspaceIndexPath,
      project_id: projectId,
      project_root: existingProject.project_root,
      previous_lifecycle: existingProject.lifecycle,
      lifecycle,
      written_generated_files: written?.writtenGeneratedFiles ?? [],
      authority_boundary: authorityBoundary,
    },
    [lifecycleSurfaceKey(status)]: {
      surface_kind: `opl_${lifecycleSurfaceKey(status)}`,
      status: apply ? 'applied' : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      workspace_path: context.workspacePath,
      workspace_index_path: context.workspaceIndexPath,
      project_id: projectId,
      project_root: existingProject.project_root,
      lifecycle,
      written_generated_files: written?.writtenGeneratedFiles ?? [],
      authority_boundary: authorityBoundary,
    },
  };
}

export function deleteWorkspaceProject(
  contracts: FrameworkContracts,
  options: WorkspaceLifecycleOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const projectId = normalizeOptionalString(options.projectId);
  if (!projectId) {
    throw new FrameworkContractError('cli_usage_error', 'workspace project delete requires --project-id.', {
      required: ['--project-id'],
    });
  }
  const existingProject = projectByIdOrThrow(context.projects, projectId, 'workspace project delete');
  const ownerReceiptRef = normalizeOptionalString(options.ownerReceiptRef);
  const applyRequested = options.apply === true && options.dryRun !== true;
  const deletionAllowed = Boolean(ownerReceiptRef);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_project_delete: {
      surface_kind: 'opl_workspace_project_delete',
      status: applyRequested && !deletionAllowed ? 'blocked_owner_receipt_required' : 'dry_run_ready',
      dry_run: true,
      write_allowed: false,
      workspace_path: context.workspacePath,
      workspace_index_path: context.workspaceIndexPath,
      project_id: projectId,
      project_root: existingProject.project_root,
      owner_receipt_ref: ownerReceiptRef,
      blockers: deletionAllowed
        ? []
        : [
            {
              code: 'domain_owner_receipt_required',
              message: 'Physical workspace project delete requires a domain owner receipt ref and remains non-applied by OPL.',
            },
          ],
      physical_delete_applied: false,
      authority_boundary: {
        delete_deletes_files: false,
        delete_moves_project_roots: false,
        delete_archives_registry_binding: false,
        delete_writes_domain_truth: false,
        delete_requires_domain_owner_receipt: true,
        opl_can_perform_physical_delete: false,
      },
    },
  };
}

export function upgradeWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceLifecycleOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const updatedAt = new Date().toISOString();
  const createdDirectories: string[] = [];
  const apply = options.apply === true && options.dryRun !== true;

  for (const sharedRoot of context.profile.shared_resource_roots) {
    const dirPath = path.join(context.workspacePath, sharedRoot);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      if (apply) {
        ensureDirectory(dirPath, createdDirectories);
      } else {
        createdDirectories.push(dirPath);
      }
    }
  }
  for (const project of context.projects) {
    for (const relativePath of [
      project.project_root,
      project.control_root,
      project.inputs_root,
      project.stage_outputs_root,
      project.exports_root,
      project.packages_root,
      project.review_root,
      project.handoff_root,
      project.archive_root,
    ]) {
      const dirPath = path.join(context.workspacePath, relativePath);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        if (apply) {
          ensureDirectory(dirPath, createdDirectories);
        } else {
          createdDirectories.push(dirPath);
        }
      }
    }
  }

  const written = apply
    ? writeWorkspaceMetadata({
        contracts,
        workspacePath: context.workspacePath,
        workspaceIndexPath: context.workspaceIndexPath,
        existingIndex: context.index,
        agent: context.agent,
        profile: context.profile,
        profileId: context.profileId,
        projects: context.projects,
        updatedAt,
      })
    : null;
  const doctor = apply
    ? doctorWorkspace(contracts, { workspacePath: context.workspacePath }).workspace_doctor
    : null;
  const hardBlockersAfterApply = doctor?.blockers ?? [];
  const repairableFindingsAfterApply = doctor?.repairable_findings ?? [];
  const advisoryWarningsAfterApply = doctor?.advisory_warnings ?? [];

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_upgrade: {
      surface_kind: 'opl_workspace_upgrade',
      status: apply
        ? hardBlockersAfterApply.length > 0
          ? 'applied_with_blockers'
          : repairableFindingsAfterApply.length > 0
            ? 'applied_with_repairable_findings'
            : advisoryWarningsAfterApply.length > 0
              ? 'applied_with_warnings'
              : 'applied'
        : 'dry_run_ready',
      dry_run: !apply,
      write_allowed: apply,
      workspace_path: context.workspacePath,
      workspace_index_path: context.workspaceIndexPath,
      workspace_map_path: path.join(context.workspacePath, WORKSPACE_MAP_REF),
      workspace_health_path: path.join(context.workspacePath, WORKSPACE_HEALTH_REF),
      workspace_inspection_path: path.join(context.workspacePath, WORKSPACE_INSPECTION_REF),
      workspace_resource_inventory_path: path.join(context.workspacePath, WORKSPACE_RESOURCE_INVENTORY_REF),
      workspace_report_path: path.join(context.workspacePath, WORKSPACE_REPORT_REF),
      would_or_did_create_directories: createdDirectories,
      written_generated_files: written?.writtenGeneratedFiles ?? [],
      blockers_after_apply: hardBlockersAfterApply,
      repairable_findings_after_apply: repairableFindingsAfterApply,
      advisory_warnings_after_apply: advisoryWarningsAfterApply,
      authority_boundary: {
        upgrade_moves_project_roots: false,
        upgrade_writes_domain_truth: false,
        upgrade_changes_domain_artifact_bodies: false,
      },
    },
  };
}

export function archiveWorkspaceProject(
  contracts: FrameworkContracts,
  options: WorkspaceLifecycleOptions,
) {
  return updateWorkspaceProjectLifecycle(contracts, {
    ...options,
    status: 'archived',
  });
}

export function exportWorkspaceMap(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const updatedAt = indexUpdatedAt(context.index);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_map: buildWorkspaceMap({
      workspaceId: indexWorkspaceId(context.index, context.workspacePath),
      title: indexTitle(context.index),
      workspacePath: context.workspacePath,
      agent: context.agent,
      profile: context.profile,
      projects: context.projects,
      createdAt: indexCreatedAt(context.index, updatedAt),
      updatedAt,
    }),
  };
}

export function workspaceHealth(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const doctor = doctorWorkspace(contracts, options).workspace_doctor;
  const updatedAt = doctor.checked_at;
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_health: buildWorkspaceHealth({
      workspaceId: indexWorkspaceId(context.index, context.workspacePath),
      title: indexTitle(context.index),
      workspacePath: context.workspacePath,
      agent: context.agent,
      profile: context.profile,
      projects: context.projects,
      createdAt: indexCreatedAt(context.index, updatedAt),
      updatedAt,
      ...doctorFindingsForArtifacts(doctor),
    }),
  };
}

export function inspectWorkspace(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const updatedAt = indexUpdatedAt(context.index);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_inspection: buildWorkspaceInspection({
      workspaceId: indexWorkspaceId(context.index, context.workspacePath),
      title: indexTitle(context.index),
      workspacePath: context.workspacePath,
      agent: context.agent,
      profile: context.profile,
      projects: context.projects,
      createdAt: indexCreatedAt(context.index, updatedAt),
      updatedAt,
    }),
  };
}

export function workspaceInventory(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const context = readValidatedWorkspaceIndex(options.workspacePath);
  const updatedAt = indexUpdatedAt(context.index);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_resource_inventory: buildWorkspaceResourceInventory({
      workspaceId: indexWorkspaceId(context.index, context.workspacePath),
      title: indexTitle(context.index),
      workspacePath: context.workspacePath,
      agent: context.agent,
      profile: context.profile,
      projects: context.projects,
      createdAt: indexCreatedAt(context.index, updatedAt),
      updatedAt,
    }),
  };
}

export function workspaceReport(
  contracts: FrameworkContracts,
  options: WorkspaceValidationOptions,
) {
  const workspacePathInput = normalizeOptionalString(options.workspacePath);
  if (!workspacePathInput) {
    throw new FrameworkContractError('cli_usage_error', 'Workspace report requires --workspace.', {
      required: ['--workspace'],
    });
  }
  const workspacePath = path.resolve(workspacePathInput);
  const doctor = doctorWorkspace(contracts, options).workspace_doctor;
  const registryContext = workspaceRegistryContext(contracts, workspacePath);
  if (doctor.blockers.length > 0) {
    return {
      version: 'g2',
      contracts_context: {
        contracts_dir: contracts.contractsDir,
        contracts_root_source: contracts.contractsRootSource,
      },
      workspace_report: diagnosticOnlyWorkspaceReport(workspacePath, doctor, registryContext),
    };
  }
  const context = readValidatedWorkspaceIndex(workspacePath);
  const updatedAt = doctor.checked_at;
  const report = buildWorkspaceReport({
    workspaceId: indexWorkspaceId(context.index, context.workspacePath),
    title: indexTitle(context.index),
    workspacePath: context.workspacePath,
    agent: context.agent,
    profile: context.profile,
    projects: context.projects,
    createdAt: indexCreatedAt(context.index, updatedAt),
    updatedAt,
    ...doctorFindingsForArtifacts(doctor),
  });
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_report: {
      ...report,
      report_status: 'available',
      registry: registryContext,
      workspace_health: workspaceHealthContext(doctor),
    },
  };
}

function fleetEntryForBinding(
  contracts: FrameworkContracts,
  binding: WorkspaceBinding,
) {
  const workspacePath = binding.workspace_path;
  const reportCommand = `opl workspace report --workspace ${JSON.stringify(workspacePath)}`;
  const registryBinding = {
    binding_id: binding.binding_id,
    project_id: binding.project_id,
    project: binding.project,
    status: binding.status,
    is_default_context: binding.status === 'active',
    workspace_path: workspacePath,
    workspace_path_currentness: inspectWorkspacePathCurrentness(workspacePath),
  };
  const base = {
    binding_id: binding.binding_id,
    project_id: binding.project_id,
    project: binding.project,
    registry_status: binding.status,
    workspace_path: workspacePath,
    workspace_report_command: reportCommand,
    workspace_report_ref: path.join(workspacePath, WORKSPACE_REPORT_REF),
    direct_entry_configured: Boolean(binding.direct_entry.command || binding.direct_entry.url),
    manifest_command_configured: Boolean(binding.direct_entry.manifest_command),
    registry_binding: registryBinding,
  };
  if (binding.status === 'archived') {
    return {
      ...base,
      fleet_status: 'archived_binding',
      doctor_status: null,
      workspace_health: null,
      blockers: [],
      current_project: null,
      project_lifecycle_counts: null,
      authority_boundary: workspaceFleetEntryAuthorityBoundary(),
    };
  }
  const doctor = doctorWorkspace(contracts, { workspacePath }).workspace_doctor;
  const workspaceHealth = workspaceHealthContext(doctor);
  const fleetStatus = fleetStatusForDoctor(doctor);
  if (fleetStatus === 'blocked') {
    return {
      ...base,
      fleet_status: 'blocked',
      doctor_status: doctor.status,
      workspace_health: workspaceHealth,
      blockers: doctor.blockers,
      hard_blockers: doctor.hard_blockers,
      repairable_findings: doctor.repairable_findings,
      advisory_warnings: doctor.advisory_warnings,
      current_project: null,
      project_lifecycle_counts: null,
      authority_boundary: workspaceFleetEntryAuthorityBoundary(),
    };
  }
  const report = workspaceReport(contracts, { workspacePath }).workspace_report;
  if (typeof report.workspace_id !== 'string' || !report.agent || !report.topology) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace fleet report could not materialize a healthy workspace report after doctor passed.',
      {
        workspace_path: workspacePath,
        doctor_status: doctor.status,
      },
    );
  }
  const indexContext = readValidatedWorkspaceIndex(workspacePath);
  return {
    ...base,
    fleet_status: fleetStatus,
    doctor_status: doctor.status,
    workspace_health: workspaceHealth,
    blockers: doctor.blockers,
    hard_blockers: doctor.hard_blockers,
    repairable_findings: doctor.repairable_findings,
    advisory_warnings: doctor.advisory_warnings,
    current_project: report.current_project,
    project_lifecycle_counts: buildWorkspaceHealth({
      workspaceId: report.workspace_id,
      title: report.title,
      workspacePath,
      agent: indexContext.agent,
      profile: {
        workspace_mode: report.topology.workspace_mode,
        project_collection_path: report.topology.project_collection_path,
        shared_resource_roots: (doctor.profile?.shared_resource_roots ?? []) as string[],
        project_stage_outputs_root: report.topology.project_stage_outputs_root,
      },
      projects: doctor.indexed_projects,
      createdAt: doctor.checked_at,
      updatedAt: doctor.checked_at,
    }).project_lifecycle_counts,
    authority_boundary: workspaceFleetEntryAuthorityBoundary(),
  };
}

export function workspaceFleetReport(contracts: FrameworkContracts) {
  const catalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const bindings = catalog.bindings as WorkspaceBinding[];
  const entries = bindings.map((binding) => fleetEntryForBinding(contracts, binding));
  const unboundProjects = catalog.projects
    .filter((project: { active_binding: unknown }) => project.active_binding === null)
    .map(unboundWorkspaceProjectFleetEntry);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    workspace_fleet_report: {
      surface_kind: 'opl_workspace_fleet_report',
      status: workspaceFleetReportStatus(entries),
      checked_at: new Date().toISOString(),
      registry_summary: catalog.summary,
      summary: workspaceFleetReportSummary(entries, unboundProjects),
      bindings: entries,
      unbound_projects: unboundProjects,
      authority_boundary: workspaceFleetReportAuthorityBoundary(),
    },
  };
}
