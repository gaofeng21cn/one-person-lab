import { buildWorkspaceCatalog } from '../../workspace/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildDomainManifestCatalog } from '../../atlas/index.ts';

import {
  buildConfiguredHumanGates,
  buildProgressAttentionItems,
  buildProgressInspectPaths,
  buildProgressSummary,
  buildProjectState,
  currentReadinessEntryForProject,
  pickProgressNextFocus,
  splitProgressWorkspaceFiles,
} from './progress-brief.ts';
import { buildCurrentReadinessProjection } from './readiness.ts';
import { buildProgressFeedback, buildWorkspaceInbox } from './progress-feedback.ts';
import {
  buildDomainOperatorProgressSurface,
  pickCurrentProjectEntry,
} from './progress-study.ts';
import { normalizeWorkspacePath } from './shared.ts';
import type { DashboardOptions } from './types.ts';
import { buildRuntimeStatus } from './workspace-runtime.ts';

export async function buildProjectProgressBrief(
  contracts: FrameworkContracts,
  options: DashboardOptions = {},
) {
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const readiness = buildCurrentReadinessProjection(domainManifests.projects, workspaceCatalog);
  const runtimeStatus = (await buildRuntimeStatus({
    sessionsLimit: options.sessionsLimit,
    ledgerLimit: options.sessionsLimit,
  })).runtime_status;
  const currentProject = pickCurrentProjectEntry(domainManifests, workspaceCatalog, workspacePath);
  const readinessEntry = currentReadinessEntryForProject(readiness.projects, currentProject.projectId);
  const manifestEntry = currentProject.manifestEntry;
  const manifest = manifestEntry?.manifest ?? null;
  const overview = manifest?.product_entry_overview ?? null;
  const productStatus = manifest?.product_entry_status ?? null;
  const repoMainline = manifest?.repo_mainline ?? null;
  const operatorSurface = buildDomainOperatorProgressSurface({
    workspacePath,
    overview,
    manifest,
  });
  const recentLedgerSession = runtimeStatus.managed_session_ledger.sessions[0] ?? null;
  const recentSession = recentLedgerSession
    ? {
        session_id: recentLedgerSession.session_id,
        last_active: recentLedgerSession.last_recorded_at,
        source: recentLedgerSession.source_surfaces[0] ?? 'opl_managed_session_ledger',
        preview: recentLedgerSession.latest_goal_preview ?? '',
      }
    : null;
  const projectState = buildProjectState(manifestEntry, readinessEntry);
  const progressSummary = buildProgressSummary({
    manifestEntry,
    overview,
    productStatus,
    readinessEntry,
    operatorSurface,
  });
  const nextFocus = pickProgressNextFocus({
    overview,
    productStatus,
    readinessEntry,
    repoMainline,
    operatorSurface,
  });
  const attentionItems = buildProgressAttentionItems({
    manifestEntry,
    readinessEntry,
    operatorSurface,
  });
  const inspectPaths = buildProgressInspectPaths({
    currentProject,
    manifest,
    manifestEntry,
    operatorSurface,
    workspacePath,
  });
  const configuredHumanGates = buildConfiguredHumanGates({ manifest, overview });
  const { deliverableFiles, supportingFiles } = splitProgressWorkspaceFiles(operatorSurface.workspaceFiles);
  const progressFeedback = buildProgressFeedback({
    operatorSurface,
    progressSummary,
    nextFocus,
    recentSession,
  });
  const workspaceInbox = buildWorkspaceInbox({
    operatorSurface,
    manifest,
    recentSession,
    deliverableFiles,
    progressFeedback,
    workspacePath,
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    project_progress: {
      surface_id: 'opl_project_progress_brief',
      project_state: projectState,
      current_project: {
        project_id: currentProject.projectId,
        label: currentProject.projectLabel,
        workspace_path: workspacePath,
        active_binding_status: currentProject.activeBindingEntry?.active_binding?.status ?? null,
      },
      progress_summary: progressSummary,
      current_study: null,
      next_focus: nextFocus,
      progress_feedback: progressFeedback,
      workspace_inbox: workspaceInbox,
      recent_activity: recentSession
        ? {
            session_id: recentSession.session_id,
            last_active: recentSession.last_active,
            source: recentSession.source,
            preview: recentSession.preview,
          }
        : operatorSurface.recentActivity,
      workspace_files: {
        deliverable_files: deliverableFiles,
        supporting_files: supportingFiles,
      },
      runtime_continuity: {
        control: manifest?.runtime_control ?? null,
        session: manifest?.session_continuity ?? null,
        progress: manifest?.progress_projection ?? null,
        artifacts: manifest?.artifact_inventory ?? null,
        runtime_inventory: manifest?.runtime_inventory ?? null,
        task_lifecycle: manifest?.task_lifecycle ?? null,
      },
      inspect_paths: inspectPaths,
      attention_items: attentionItems,
      user_options: operatorSurface.userOptions,
      configured_human_gates: configuredHumanGates,
      recommended_commands: {
        progress: operatorSurface.recommendedCommands.progress ?? overview?.progress_surface?.command ?? null,
        resume: operatorSurface.recommendedCommands.resume ?? overview?.resume_surface?.command ?? null,
        approval: operatorSurface.recommendedCommands.approval ?? manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
        interrupt: operatorSurface.recommendedCommands.interrupt ?? manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
        artifacts:
          operatorSurface.recommendedCommands.artifacts
          ?? manifest?.runtime_control?.control_surfaces.artifact_pickup?.command
          ?? manifest?.artifact_inventory?.artifact_surface?.command
          ?? null,
        start: readinessEntry?.recommended_start_command ?? null,
      },
      notes: [
        'This brief is a user-facing summary derived from workspace binding, domain manifest, product readiness, and runtime visibility.',
        'Domain-specific progress meaning is supplied by the domain-owned progress projection; Console does not inspect domain artifact bodies or infer domain verdicts.',
        'Configured human gates are identifiers from the domain manifest; their decision semantics and authority remain domain-owned.',
      ],
    },
  };
}
