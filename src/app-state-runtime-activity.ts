import fs from 'node:fs';
import path from 'node:path';

import { getActiveWorkspaceBinding } from './workspace-registry.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => isRecord(entry))
    : [];
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function normalizeStatus(value: unknown) {
  return optionalString(value)?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

function readJsonRecord(filePath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sourceRef(filePath: string, role: string, label: string) {
  return {
    ref_kind: 'file',
    ref: filePath,
    role,
    label,
  };
}

function commandForMasStudy(profileRef: string | null, studyId: string, command: 'progress' | 'progress-projection') {
  if (!profileRef) {
    return null;
  }
  return [
    'uv run python -m med_autoscience.cli',
    'study',
    command,
    '--profile',
    JSON.stringify(profileRef),
    '--study-id',
    JSON.stringify(studyId),
    '--format',
    'json',
  ].join(' ');
}

function recommendedCommands(profileRef: string | null, studyId: string) {
  return [
    {
      step_id: 'inspect_study_progress',
      title: '查看任务进度',
      surface_kind: 'study_progress',
      command: commandForMasStudy(profileRef, studyId, 'progress'),
    },
    {
      step_id: 'inspect_progress_projection',
      title: '查看运行投影',
      surface_kind: 'study_progress_projection',
      command: commandForMasStudy(profileRef, studyId, 'progress-projection'),
    },
  ].filter((entry): entry is {
    step_id: string;
    title: string;
    surface_kind: string;
    command: string;
  } => Boolean(entry.command));
}

function laneForStudy(study: JsonRecord) {
  const macroState = normalizeStatus(study.macro_state);
  const currentStage = normalizeStatus(study.current_stage);
  const workerState = normalizeStatus(study.worker_state);
  const writerState = normalizeStatus(study.writer_state);
  const runtimeHealth = normalizeStatus(study.runtime_health_status);
  const workerRunning = study.worker_running === true;
  const actualWriteActive = study.actual_write_active === true;
  const activeRunId = firstString(study.active_run_id);
  const providerLivenessObserved = workerRunning
    || actualWriteActive
    || ['running', 'live', 'active'].includes(workerState)
    || ['running', 'live', 'active'].includes(writerState);
  const liveStageObserved = ['running', 'live', 'active'].includes(currentStage)
    || ['running', 'live', 'active'].includes(macroState);

  if (providerLivenessObserved || (activeRunId && liveStageObserved)) {
    return 'running';
  }

  if (
    Boolean(activeRunId)
      || ['attention', 'blocked', 'failed', 'human_gate', 'needs_attention', 'queued', 'stale'].includes(macroState)
      || ['blocked', 'failed', 'human_gate', 'needs_attention', 'queued', 'stale'].includes(currentStage)
      || ['blocked', 'failed', 'stale', 'missing', 'escalated'].includes(runtimeHealth)
  ) {
    return 'attention';
  }

  return 'recent';
}

function normalizeStudyItem(input: {
  workspaceRoot: string;
  profileRef: string | null;
  sourcePath: string;
  sourceRole: string;
  sourceLabel: string;
  study: JsonRecord;
}): JsonRecord | null {
  const studyId = firstString(input.study.study_id);
  if (!studyId || studyId === 'workspace-overview') {
    return null;
  }
  const lane = laneForStudy(input.study);
  const freshness = isRecord(input.study.freshness) ? input.study.freshness : {};
  const commands = recommendedCommands(input.profileRef, studyId);
  const summary = firstString(input.study.state_summary, input.study.summary, freshness.summary, input.study.user_next);

  return {
    item_id: `medautoscience:study:${studyId}`,
    project_id: 'medautoscience',
    project_label: 'MAS',
    lane,
    title: firstString(input.study.display_title) ?? studyId,
    status: firstString(input.study.current_stage, input.study.macro_state, input.study.worker_state, input.study.runtime_health_status),
    status_label: firstString(input.study.state_label),
    summary,
    updated_at: firstString(input.study.last_seen_at, freshness.latest_event_at),
    command: commands[0]?.command ?? null,
    workspace_path: input.workspaceRoot,
    runtime_owner: 'provider_backed_family_runtime',
    domain_owner: 'med-autoscience',
    source_refs: [
      sourceRef(input.sourcePath, input.sourceRole, input.sourceLabel),
    ],
    action_owner: lane === 'attention' ? 'opl' : lane === 'running' ? 'runtime' : 'none',
    requires_user_action: false,
    action_kind: lane === 'attention' ? 'quality_gate' : null,
    action_summary: firstString(input.study.next_action_summary, input.study.next_system_action, input.study.operator_focus, summary)
      ?? (lane === 'running' ? 'MAS 论文线正在运行。' : 'MAS 论文线当前没有活跃运行任务。'),
    study_id: studyId,
    workspace_label: firstString(input.study.profile_name),
    detail_summary: summary,
    next_action_summary: firstString(input.study.next_action_summary, input.study.next_system_action, input.study.operator_focus),
    active_run_id: firstString(input.study.active_run_id),
    health_status: firstString(input.study.worker_state, input.study.macro_state, input.study.runtime_health_status),
    blockers: [],
    recommended_commands: commands,
  };
}

function portalPayloadPath(workspaceRoot: string) {
  return path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
}

function workspaceRootFromProfileRef(profileRef: string | null) {
  if (!profileRef) {
    return null;
  }
  const profileDir = path.dirname(profileRef);
  const medAutoScienceDir = path.dirname(profileDir);
  const opsDir = path.dirname(medAutoScienceDir);
  return path.basename(profileDir) === 'profiles'
    && path.basename(medAutoScienceDir) === 'medautoscience'
    && path.basename(opsDir) === 'ops'
    ? path.dirname(opsDir)
    : null;
}

function workspaceRootCandidates(workspaceRoot: string, profileRef: string | null) {
  return [...new Set([
    workspaceRootFromProfileRef(profileRef),
    workspaceRoot,
  ].filter((entry): entry is string => Boolean(entry)))];
}

function buildFromPortalPayload(workspaceRoot: string, profileRef: string | null, payloadPath: string, payload: JsonRecord) {
  const workbenchProjection = isRecord(payload.mas_opl_runtime_workbench_projection)
    ? payload.mas_opl_runtime_workbench_projection
    : null;
  if (workbenchProjection && workbenchProjection.surface_kind === 'mas_opl_runtime_workbench_projection') {
    return recordList(workbenchProjection.studies)
      .map((study) => normalizeStudyItem({
        workspaceRoot,
        profileRef,
        sourcePath: payloadPath,
        sourceRole: 'mas_opl_runtime_workbench_projection',
        sourceLabel: 'MAS OPL Runtime Workbench projection',
        study,
      }))
      .filter((entry): entry is JsonRecord => Boolean(entry));
  }

  const workspace = isRecord(payload.workspace) ? payload.workspace : {};
  return recordList(workspace.studies)
    .map((study) => normalizeStudyItem({
      workspaceRoot,
      profileRef,
      sourcePath: payloadPath,
      sourceRole: 'mas_progress_portal_payload',
      sourceLabel: 'MAS Progress Portal payload',
      study,
    }))
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function buildFromStudyRuntimeFiles(workspaceRoot: string, profileRef: string | null) {
  const studiesDir = path.join(workspaceRoot, 'studies');
  let names: string[];
  try {
    names = fs.readdirSync(studiesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  return names.flatMap((studyId) => {
    const studyRoot = path.join(studiesDir, studyId);
    const supervisionPath = path.join(studyRoot, 'artifacts', 'runtime', 'runtime_supervision', 'latest.json');
    const statusPath = path.join(studyRoot, 'artifacts', 'runtime', 'runtime_status_summary.json');
    const supervision = readJsonRecord(supervisionPath);
    const status = readJsonRecord(statusPath);
    if (!supervision && !status) {
      return [];
    }
    const study = {
      study_id: studyId,
      current_stage: firstString(supervision?.quest_status, status?.current_stage),
      macro_state: firstString(supervision?.health_status, status?.health_status),
      runtime_health_status: firstString(supervision?.health_status, status?.health_status),
      active_run_id: firstString(supervision?.active_run_id),
      worker_running: supervision?.worker_running,
      state_summary: firstString(status?.status_summary, supervision?.summary),
      next_action_summary: firstString(status?.next_action_summary, supervision?.next_action_summary),
      last_seen_at: firstString(status?.generated_at, supervision?.recorded_at),
    };
    const item = normalizeStudyItem({
      workspaceRoot,
      profileRef,
      sourcePath: supervision ? supervisionPath : statusPath,
      sourceRole: supervision ? 'runtime_supervision' : 'runtime_status_summary',
      sourceLabel: supervision ? 'runtime_supervision/latest.json' : 'runtime_status_summary.json',
      study,
    });
    return item ? [item] : [];
  });
}

export function buildAppStateRuntimeActivityItems() {
  const binding = getActiveWorkspaceBinding('medautoscience');
  const locator = binding?.direct_entry.workspace_locator;
  const workspaceRoot = locator?.workspace_root ?? binding?.workspace_path ?? null;
  if (!workspaceRoot) {
    return [];
  }

  const profileRef = locator?.profile_ref ?? null;
  for (const candidateRoot of workspaceRootCandidates(workspaceRoot, profileRef)) {
    const portalPath = portalPayloadPath(candidateRoot);
    const portalPayload = readJsonRecord(portalPath);
    if (portalPayload) {
      return buildFromPortalPayload(candidateRoot, profileRef, portalPath, portalPayload);
    }
  }

  for (const candidateRoot of workspaceRootCandidates(workspaceRoot, profileRef)) {
    const items = buildFromStudyRuntimeFiles(candidateRoot, profileRef);
    if (items.length > 0) {
      return items;
    }
  }
  return [];
}
