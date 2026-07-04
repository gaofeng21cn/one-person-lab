import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import { recordList, stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import { listStageAttempts, openFamilyRuntimeSqlite, resolveOplStatePaths } from '../runway/index.ts';
import { getActiveWorkspaceBinding } from '../workspace/index.ts';

const RUNNING_STAGE_ATTEMPT_STATUSES = new Set(['running']);
const ATTENTION_STAGE_ATTEMPT_STATUSES = new Set(['blocked', 'dead_lettered', 'failed', 'human_gate']);

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

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function sourceRef(filePath: string, role: string, label: string) {
  return {
    ref_kind: 'file',
    ref: filePath,
    role,
    label,
  };
}

function queueDbPath() {
  return path.join(resolveOplStatePaths().state_dir, 'family-runtime', 'queue.sqlite');
}

function readFamilyRuntimeStageAttempts() {
  const dbPath = queueDbPath();
  if (!fs.existsSync(dbPath)) {
    return { queueDb: dbPath, attempts: [] };
  }
  const db = openFamilyRuntimeSqlite(dbPath, { readOnly: true });
  try {
    return {
      queueDb: dbPath,
      attempts: listStageAttempts(db).filter(isRecord),
    };
  } catch {
    return { queueDb: dbPath, attempts: [] };
  } finally {
    db.close();
  }
}

function rootMatches(candidate: string | null, roots: ReadonlySet<string>) {
  if (!candidate) {
    return false;
  }
  const resolvedCandidate = path.resolve(candidate);
  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    if (resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

function stageAttemptWorkspaceMatches(attempt: JsonRecord, roots: ReadonlySet<string>) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return rootMatches(firstString(workspaceLocator.workspace_root, workspaceLocator.command_cwd), roots);
}

function stageAttemptHasWorkspaceRoot(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return Boolean(firstString(workspaceLocator.workspace_root, workspaceLocator.command_cwd));
}

function stageAttemptStudyId(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return firstString(workspaceLocator.study_id, workspaceLocator.quest_id);
}

function stageAttemptSourceRef(queueDb: string, attemptId: string) {
  return {
    ref_kind: 'sqlite',
    ref: `${queueDb}#stage_attempts/${attemptId}`,
    role: 'opl_family_runtime_stage_attempt',
    label: 'OPL family-runtime stage attempt',
  };
}

function stageAttemptLane(status: string): 'running' | 'attention' | null {
  if (RUNNING_STAGE_ATTEMPT_STATUSES.has(status)) {
    return 'running';
  }
  if (ATTENTION_STAGE_ATTEMPT_STATUSES.has(status)) {
    return 'attention';
  }
  return null;
}

function overlayStageAttemptsByStudyId(input: {
  attempts: JsonRecord[];
  candidateRoots: string[];
  knownStudyIds: ReadonlySet<string>;
}) {
  const roots = new Set(input.candidateRoots);
  const byStudyId = new Map<string, JsonRecord[]>();
  for (const attempt of input.attempts) {
    const studyId = stageAttemptStudyId(attempt);
    const status = normalizeStatus(attempt.status);
    const lane = stageAttemptLane(status);
    const workspaceMatches = stageAttemptWorkspaceMatches(attempt, roots);
    if (
      optionalString(attempt.domain_id) !== 'medautoscience'
      || !studyId
      || !lane
      || (!workspaceMatches && (stageAttemptHasWorkspaceRoot(attempt) || !input.knownStudyIds.has(studyId)))
    ) {
      continue;
    }
    if (!byStudyId.has(studyId)) {
      byStudyId.set(studyId, [attempt]);
    }
  }
  return byStudyId;
}

function overlayStageAttempts(input: {
  item: JsonRecord;
  attempts: JsonRecord[];
  queueDb: string;
}) {
  const [latest] = input.attempts;
  const latestStatus = normalizeStatus(latest.status);
  const lane = stageAttemptLane(latestStatus) ?? 'attention';
  const stageAttemptIds = input.attempts
    .map((attempt) => firstString(attempt.stage_attempt_id))
    .filter((entry): entry is string => Boolean(entry));
  const sourceRefs = [
    ...recordList(input.item.source_refs),
    ...input.attempts.flatMap((attempt) => {
      const attemptId = firstString(attempt.stage_attempt_id);
      return attemptId ? [stageAttemptSourceRef(input.queueDb, attemptId)] : [];
    }),
  ];
  const stageId = firstString(latest.stage_id);
  const workflowId = firstString(latest.workflow_id);
  const attemptId = firstString(latest.stage_attempt_id);
  const updatedAt = firstString(latest.updated_at, input.item.updated_at);

  return {
    ...input.item,
    lane,
    status: firstString(latest.status, input.item.status),
    status_label: lane === 'running'
      ? (firstString(input.item.status_label) ?? 'OPL runtime running')
      : `OPL runtime ${latestStatus || 'needs attention'}`,
    summary: firstString(input.item.summary)
      ?? (attemptId
        ? `OPL runtime attempt ${attemptId} is ${latestStatus || 'not advancing'}.`
        : `OPL runtime attempt is ${latestStatus || 'not advancing'}.`),
    updated_at: updatedAt,
    source_refs: sourceRefs,
    action_owner: lane === 'running' ? 'runtime' : 'opl',
    action_kind: lane === 'running' ? null : 'quality_gate',
    action_summary: lane === 'running'
      ? 'OPL runtime stage attempt is running; MAS terminalization is still required before any paper-progress claim.'
      : 'OPL runtime stage attempt needs operator attention; MAS terminalization is still required before any paper-progress claim.',
    next_action_summary: firstString(input.item.next_action_summary, input.item.action_summary),
    active_run_id: workflowId ?? attemptId ?? firstString(input.item.active_run_id),
    active_stage_id: stageId ?? firstString(input.item.active_stage_id, input.item.status),
    active_stage_label: stageId ?? firstString(input.item.active_stage_label, input.item.status_label),
    stage_attempt_ids: [
      ...new Set([
        ...stringList(input.item.stage_attempt_ids),
        ...stageAttemptIds,
      ]),
    ],
    runtime_readback_source: 'opl_family_runtime_queue_stage_attempts',
    runtime_attempt_status: firstString(latest.status),
    provider_kind: firstString(latest.provider_kind),
    workflow_id: workflowId,
    authority_boundary: {
      projection_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function mergeFamilyRuntimeStageAttempts(input: {
  items: JsonRecord[];
  candidateRoots: string[];
}) {
  const { queueDb, attempts } = readFamilyRuntimeStageAttempts();
  if (attempts.length === 0) {
    return input.items;
  }
  const knownStudyIds = new Set(
    input.items.map((item) => firstString(item.study_id)).filter((entry): entry is string => Boolean(entry)),
  );
  const overlayByStudyId = overlayStageAttemptsByStudyId({
    attempts,
    candidateRoots: input.candidateRoots,
    knownStudyIds,
  });
  if (overlayByStudyId.size === 0) {
    return input.items;
  }
  return input.items.map((item) => {
    const studyId = firstString(item.study_id);
    const studyAttempts = studyId ? overlayByStudyId.get(studyId) : null;
    return studyAttempts && studyAttempts.length > 0
      ? overlayStageAttempts({ item, attempts: studyAttempts, queueDb })
      : item;
  });
}

function commandForMasStudy(profileRef: string | null, studyId: string) {
  if (!profileRef) {
    return null;
  }
  return [
    'uv run python -m med_autoscience.cli',
    'study',
    'progress',
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
      command: commandForMasStudy(profileRef, studyId),
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
    const supervisionPayload = readJsonFileOrNull(supervisionPath);
    const statusPayload = readJsonFileOrNull(statusPath);
    const supervision = isRecord(supervisionPayload) ? supervisionPayload : null;
    const status = isRecord(statusPayload) ? statusPayload : null;
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
  const candidateRoots = workspaceRootCandidates(workspaceRoot, profileRef);
  for (const candidateRoot of candidateRoots) {
    const portalPath = portalPayloadPath(candidateRoot);
    const portalPayload = readJsonFileOrNull(portalPath);
    if (isRecord(portalPayload)) {
      return mergeFamilyRuntimeStageAttempts({
        items: buildFromPortalPayload(candidateRoot, profileRef, portalPath, portalPayload),
        candidateRoots,
      });
    }
  }

  for (const candidateRoot of candidateRoots) {
    const items = buildFromStudyRuntimeFiles(candidateRoot, profileRef);
    if (items.length > 0) {
      return mergeFamilyRuntimeStageAttempts({ items, candidateRoots });
    }
  }
  return [];
}
