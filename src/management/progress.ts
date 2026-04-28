import { buildWorkspaceCatalog } from '../workspace-registry.ts';
import type { GatewayContracts } from '../types.ts';

import { buildDomainManifestCatalog } from './domain-manifest-catalog.ts';
import { buildFrontDeskReadiness } from './frontdesk.ts';
import { buildProgressFeedback, buildWorkspaceInbox } from './progress-feedback.ts';
import {
  buildStudyProgressSurface,
  describeHumanGate,
  explainManifestFailure,
  pickCurrentProjectEntry,
} from './progress-study.ts';
import {
  normalizeWorkspacePath,
  uniqueStrings,
} from './shared.ts';
import type { DashboardOptions } from './types.ts';
import { buildRuntimeStatus } from './workspace-runtime.ts';

export async function buildProjectProgressBrief(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const readiness = (await buildFrontDeskReadiness(contracts, {
    workspacePath,
    sessionsLimit: options.sessionsLimit,
    basePath: options.basePath,
  })).frontdesk_readiness;
  const runtimeStatus = buildRuntimeStatus({
    sessionsLimit: options.sessionsLimit,
    ledgerLimit: options.sessionsLimit,
  }).runtime_status;
  const currentProject = pickCurrentProjectEntry(domainManifests, workspaceCatalog, workspacePath);
  const readinessEntry = currentProject.projectId
    ? readiness.projects.find((entry) => entry.project_id === currentProject.projectId) ?? null
    : null;
  const manifestEntry = currentProject.manifestEntry;
  const manifest = manifestEntry?.manifest ?? null;
  const overview = manifest?.product_entry_overview ?? null;
  const productStatus = manifest?.product_entry_status ?? null;
  const repoMainline = manifest?.repo_mainline ?? null;
  const studySurface = buildStudyProgressSurface({
    workspacePath,
    overview,
    manifest,
  });
  const recentSession = runtimeStatus.recent_sessions.sessions[0] ?? null;
  const projectState =
    manifestEntry === null
      ? 'unbound'
      : manifestEntry.status !== 'resolved'
        ? 'attention_needed'
        : readinessEntry?.usable_now === false
          ? 'attention_needed'
          : 'active';
  const progressSummary =
    studySurface.progressSummary
    ?? studySurface.currentStudy?.story_summary
    ?? overview?.summary
    ?? productStatus?.summary
    ?? readinessEntry?.summary
    ?? (
      manifestEntry === null
        ? '当前 workspace 还没有绑定到可直接汇报进度的项目。'
        : '当前还没有读到结构化的项目进度摘要。'
    );
  const nextFocus =
    [
      studySurface.nextFocus,
      ...(overview?.next_focus ?? []),
      ...(productStatus?.next_focus ?? []),
      ...(Array.isArray(repoMainline?.next_focus)
        ? repoMainline.next_focus.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
      ...(readinessEntry?.recommended_next_actions ?? []),
    ][0] ?? null;
  const attentionItems = uniqueStrings([
    ...studySurface.attentionItems,
    ...(readinessEntry?.usable_now === false ? readinessEntry.blocking_gaps : []),
    explainManifestFailure(manifestEntry?.error ?? null),
  ]);
  const inspectPaths = uniqueStrings([
    workspacePath,
    currentProject.activeBindingEntry?.active_binding?.workspace_path ?? null,
    manifestEntry?.workspace_path ?? null,
    typeof manifest?.workspace_locator?.workspace_root === 'string' ? manifest.workspace_locator.workspace_root : null,
    typeof manifest?.workspace_locator?.profile_ref === 'string' ? manifest.workspace_locator.profile_ref : null,
    ...studySurface.inspectPaths,
  ]);
  const configuredHumanGates = uniqueStrings([
    ...(overview?.human_gate_ids ?? []),
    ...(manifest?.product_entry_start?.human_gate_ids ?? []),
  ]).map((gateId) => describeHumanGate(gateId));
  const workspaceFiles = studySurface.workspaceFiles;
  const deliverableFiles = workspaceFiles.filter((entry) => entry.kind === 'deliverable');
  const supportingFiles = workspaceFiles.filter((entry) => entry.kind === 'supporting');
  const progressFeedback = buildProgressFeedback({
    studySurface,
    progressSummary,
    nextFocus,
    recentSession,
  });
  const workspaceInbox = buildWorkspaceInbox({
    studySurface,
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
      current_study: studySurface.currentStudy,
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
        : studySurface.recentActivity,
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
      user_options: studySurface.userOptions,
      configured_human_gates: configuredHumanGates,
      recommended_commands: {
        progress: studySurface.recommendedCommands.progress ?? overview?.progress_surface?.command ?? null,
        resume: studySurface.recommendedCommands.resume ?? overview?.resume_surface?.command ?? null,
        approval: studySurface.recommendedCommands.approval ?? manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
        interrupt: studySurface.recommendedCommands.interrupt ?? manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
        artifacts:
          studySurface.recommendedCommands.artifacts
          ?? manifest?.runtime_control?.control_surfaces.artifact_pickup?.command
          ?? manifest?.artifact_inventory?.artifact_surface?.command
          ?? null,
        start: readinessEntry?.recommended_start_command ?? null,
      },
      notes: [
        'This brief is a user-facing summary derived from workspace binding, domain manifest, product readiness, and runtime visibility.',
        'When the current domain exposes study-level truth, this brief promotes the most active study into a paper-facing summary instead of stopping at project-level wording.',
        'Configured human gates are capability hints from the domain manifest; they do not by themselves mean the system is currently waiting for user input.',
      ],
    },
  };
}
