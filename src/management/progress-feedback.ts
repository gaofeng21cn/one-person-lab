import type { NormalizedDomainManifest } from '../domain-manifest.ts';
import { humanizeProgressCode, readStatusNarrationContract, statusNarrationLatestUpdate, statusNarrationNextStep, statusNarrationStageSummary, statusNarrationSummary } from '../status-narration.ts';

import { buildStudyProgressSurface } from './progress-study.ts';
import {
  isRecord,
  normalizeInlineText,
  optionalString,
} from './shared.ts';

export function buildProgressFeedback(options: {
  studySurface: ReturnType<typeof buildStudyProgressSurface>;
  progressSummary: string;
  nextFocus: string | null;
  recentSession: {
    session_id: string;
    last_active: string;
    source: string;
    preview: string;
  } | null;
}) {
  const currentStudy = options.studySurface.currentStudy;
  const continuitySession = isRecord(options.studySurface.continuity?.session)
    ? options.studySurface.continuity.session
    : null;
  const continuityProgress = isRecord(options.studySurface.continuity?.progress)
    ? options.studySurface.continuity.progress
    : null;
  const preferContinuity = !currentStudy;
  const monitoring = isRecord(currentStudy?.monitoring) ? currentStudy.monitoring : null;
  const latestProgress = isRecord(currentStudy?.latest_progress) ? currentStudy.latest_progress : null;
  const latestEvent = isRecord(currentStudy?.latest_event) ? currentStudy.latest_event : null;
  const narrationContract = readStatusNarrationContract(currentStudy?.status_narration_contract);
  const recentActivity = options.studySurface.recentActivity;
  const currentStatus =
    optionalString(currentStudy?.current_stage)
    ?? optionalString(continuityProgress?.current_status)
    ?? optionalString(continuitySession?.status);
  const runtimeStatus =
    optionalString(monitoring?.health_status)
    ?? optionalString(continuityProgress?.runtime_status);
  const headline =
    normalizeInlineText(
      (preferContinuity ? optionalString(continuityProgress?.headline) : null)
      ?? (preferContinuity ? optionalString(continuitySession?.summary) : null)
      ?? statusNarrationLatestUpdate(narrationContract)
      ?? statusNarrationStageSummary(narrationContract)
      ?? optionalString(currentStudy?.current_stage_summary)
      ?? optionalString(latestProgress?.summary)
      ?? optionalString(latestEvent?.summary)
      ?? options.progressSummary,
    )
    ?? '当前还没有读到结构化的研究推进摘要。';
  const latestUpdate =
    normalizeInlineText([
      (preferContinuity ? optionalString(continuityProgress?.latest_update) : null)
      ?? optionalString(latestProgress?.time_label)
      ?? optionalString(latestEvent?.time_label)
      ?? recentActivity?.last_active
      ?? options.recentSession?.last_active
      ?? null,
      (preferContinuity ? optionalString(continuityProgress?.headline) : null)
      ?? statusNarrationLatestUpdate(narrationContract)
      ?? optionalString(latestProgress?.summary)
      ?? optionalString(latestEvent?.summary)
      ?? recentActivity?.preview
      ?? options.recentSession?.preview
      ?? optionalString(currentStudy?.current_stage_summary)
      ?? (preferContinuity ? optionalString(continuitySession?.summary) : null)
      ?? null,
    ].filter(Boolean).join(' · '))
    ?? '当前还没有读到新的进度更新时间。';
  const nextStep =
    normalizeInlineText(
      (preferContinuity ? optionalString(continuityProgress?.next_step) : null)
      ?? (preferContinuity
        ? optionalString((continuitySession?.restore_surface as Record<string, unknown> | undefined)?.summary)
        : null)
      ?? statusNarrationNextStep(narrationContract)
      ?? optionalString(currentStudy?.next_system_action)
      ?? options.nextFocus
      ?? '继续展开当前任务的详细进度。',
    )
    ?? '继续展开当前任务的详细进度。';
  const statusSummary =
    normalizeInlineText([
      preferContinuity ? optionalString(continuityProgress?.status_summary) : null,
      statusNarrationSummary(narrationContract),
      currentStatus ? `当前状态：${humanizeProgressCode(currentStatus) ?? currentStatus}` : null,
      runtimeStatus ? `运行态：${humanizeProgressCode(runtimeStatus) ?? runtimeStatus}` : null,
    ].filter(Boolean).join('；'))
    ?? '当前还没有读到结构化状态。';

  return {
    headline,
    current_status: currentStatus,
    runtime_status: runtimeStatus,
    latest_update: latestUpdate,
    next_step: nextStep,
    status_summary: statusSummary,
  };
}

function buildTaskLifecycleInboxCard(options: {
  taskLifecycle: NormalizedDomainManifest['task_lifecycle'];
  workspacePath: string;
}) {
  const taskLifecycle = options.taskLifecycle;
  if (!taskLifecycle) {
    return null;
  }

  const lane =
    taskLifecycle.human_gate_ids.length > 0
      ? 'waiting'
      : (
          ['running', 'active', 'in_progress', 'recovering'].includes(taskLifecycle.status)
            ? 'running'
            : taskLifecycle.resume_surface
              ? 'ready'
              : 'ready'
        );
  const latestUpdate =
    normalizeInlineText([
      taskLifecycle.checkpoint_summary?.recorded_at,
      taskLifecycle.checkpoint_summary?.summary,
    ].filter(Boolean).join(' · '))
    ?? taskLifecycle.checkpoint_summary?.summary
    ?? '当前还没有新的 checkpoint 更新时间。';
  const nextStep =
    taskLifecycle.resume_surface
      ? `从 ${taskLifecycle.resume_surface.surface_kind} 继续这个任务。`
      : '继续查看这个任务的详细进度。';

  return {
    task_id: taskLifecycle.task_id,
    title: taskLifecycle.task_kind,
    lane: lane as 'running' | 'waiting' | 'ready',
    status_label: humanizeProgressCode(taskLifecycle.status) ?? taskLifecycle.status,
    summary: taskLifecycle.summary,
    latest_update: latestUpdate,
    next_step: nextStep,
    inspect_path: options.workspacePath,
    deliverable_count: 0,
    source_surface: 'task_lifecycle',
  };
}

function buildRecentSessionInboxCard(options: {
  recentSession: {
    session_id: string;
    last_active: string;
    source: string;
    preview: string;
  } | null;
  workspacePath: string;
}) {
  if (!options.recentSession) {
    return null;
  }

  return {
    task_id: options.recentSession.session_id,
    title: 'Recent agent session',
    lane: 'running' as const,
    status_label: '后台会话活跃',
    summary: options.recentSession.preview || '当前有后台会话仍在持续推进。',
    latest_update: normalizeInlineText([
      options.recentSession.last_active,
      options.recentSession.preview,
    ].filter(Boolean).join(' · ')) ?? options.recentSession.last_active,
    next_step: '继续查看这条后台会话的最新输出。',
    inspect_path: options.workspacePath,
    deliverable_count: 0,
    source_surface: 'recent_sessions',
  };
}

function buildDeliverableInboxCard(options: {
  currentStudy: ReturnType<typeof buildStudyProgressSurface>['currentStudy'];
  deliverableFiles: Array<{
    file_id: string;
    label: string;
    kind: 'deliverable' | 'supporting';
    path: string;
    summary: string;
  }>;
  progressFeedback: ReturnType<typeof buildProgressFeedback>;
  workspacePath: string;
}) {
  if (options.deliverableFiles.length === 0) {
    return null;
  }

  const firstDeliverable = options.deliverableFiles[0];
  const title =
    optionalString(options.currentStudy?.title)
    ?? optionalString(options.currentStudy?.study_id)
    ?? 'Workspace deliverables';
  const studyId = optionalString(options.currentStudy?.study_id);

  return {
    task_id: studyId
      ? `${studyId}:deliverables`
      : 'workspace-deliverables',
    title,
    lane: 'delivered' as const,
    status_label: '已形成交付',
    summary: `已产出 ${options.deliverableFiles.length} 个 deliverable 文件，当前最值得先看的文件是 ${firstDeliverable.label}。`,
    latest_update: options.progressFeedback.latest_update,
    next_step: `优先检查 ${firstDeliverable.label}，确认交付面和当前进度保持一致。`,
    inspect_path: firstDeliverable.path ?? optionalString(options.currentStudy?.study_root) ?? options.workspacePath,
    deliverable_count: options.deliverableFiles.length,
    source_surface: 'workspace_files',
  };
}

export function buildWorkspaceInbox(options: {
  studySurface: ReturnType<typeof buildStudyProgressSurface>;
  manifest: NormalizedDomainManifest | null;
  recentSession: {
    session_id: string;
    last_active: string;
    source: string;
    preview: string;
  } | null;
  deliverableFiles: Array<{
    file_id: string;
    label: string;
    kind: 'deliverable' | 'supporting';
    path: string;
    summary: string;
  }>;
  progressFeedback: ReturnType<typeof buildProgressFeedback>;
  workspacePath: string;
}) {
  const cards: Array<{
    task_id: string;
    title: string;
    lane: 'running' | 'waiting' | 'ready' | 'delivered';
    status_label: string;
    summary: string;
    latest_update: string;
    next_step: string;
    inspect_path: string;
    deliverable_count: number;
    source_surface: string;
  }> = [];
  const studyQueue = options.studySurface.studyQueue ?? [];

  if (studyQueue.length > 0) {
    cards.push(...studyQueue);
  } else {
    const taskLifecycleCard = buildTaskLifecycleInboxCard({
      taskLifecycle: options.manifest?.task_lifecycle ?? null,
      workspacePath: options.workspacePath,
    });
    if (taskLifecycleCard) {
      cards.push(taskLifecycleCard);
    }

    const recentSessionCard = buildRecentSessionInboxCard({
      recentSession: options.recentSession,
      workspacePath: options.workspacePath,
    });
    if (recentSessionCard) {
      cards.push(recentSessionCard);
    }
  }

  const deliverableCard = buildDeliverableInboxCard({
    currentStudy: options.studySurface.currentStudy,
    deliverableFiles: options.deliverableFiles,
    progressFeedback: options.progressFeedback,
    workspacePath: options.workspacePath,
  });
  if (deliverableCard) {
    cards.push(deliverableCard);
  }

  const sections = {
    running: cards.filter((entry) => entry.lane === 'running'),
    waiting: cards.filter((entry) => entry.lane === 'waiting'),
    ready: cards.filter((entry) => entry.lane === 'ready'),
    delivered: cards.filter((entry) => entry.lane === 'delivered'),
  };
  const activeTaskId =
    sections.running[0]?.task_id
    ?? sections.waiting[0]?.task_id
    ?? sections.ready[0]?.task_id
    ?? sections.delivered[0]?.task_id
    ?? null;

  return {
    summary: {
      known_task_count: cards.length,
      running_count: sections.running.length,
      waiting_count: sections.waiting.length,
      ready_count: sections.ready.length,
      delivered_count: sections.delivered.length,
      active_task_id: activeTaskId,
    },
    sections,
  };
}

