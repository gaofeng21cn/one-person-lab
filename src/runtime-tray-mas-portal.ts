import * as path from 'path';
import { pathToFileURL } from 'url';
import { actionContext, noActionContext, runningActionContext } from './runtime-tray-action.ts';
import { humanizeStatusLabel, localizeRuntimeDisplayList } from './runtime-tray-display.ts';
import {
  type JsonRecord,
  type MasWorkspaceProjectionRef,
  type RuntimeTrayCommand,
  type RuntimeTrayItem,
  type RuntimeTrayLane,
  type RuntimeTraySourceRef,
} from './runtime-tray-snapshot-types.ts';
import {
  fileSourceRef,
  firstString,
  jsonRecordList,
  nestedRecord,
  normalizeStatusCode,
  optionalBoolean,
  readJsonRecord,
  shellArgument,
  sourceRef,
  stringList,
  uniqueByRef,
  uniqueStrings,
} from './runtime-tray-snapshot-utils.ts';

export type MasPortalProjection = {
  items: RuntimeTrayItem[];
  source_refs: RuntimeTraySourceRef[];
  portal_workspace_roots: Set<string>;
};

function fileUrl(filePath: string) {
  return pathToFileURL(filePath).href;
}

function relativeOrAbsolutePath(root: string, ref: string | null) {
  if (!ref) {
    return null;
  }
  return path.isAbsolute(ref) ? ref : path.join(root, ref);
}

function commandForMasStudy(profileRef: string | null, studyId: string, command: 'study-progress' | 'study-runtime-status') {
  if (!profileRef) {
    return null;
  }
  return [
    'uv run python -m med_autoscience.cli',
    command,
    '--profile',
    shellArgument(profileRef),
    '--study-id',
    shellArgument(studyId),
    ...(command === 'study-progress' ? ['--format', 'json'] : []),
  ].join(' ');
}

function compactPortalSourceRefs(workspaceRoot: string, portalPayloadPath: string, handoff: JsonRecord) {
  const refs = stringList(handoff.source_refs, 12).map((ref) => fileSourceRef(ref, 'mas_portal_source', path.basename(ref)));
  return uniqueByRef([
    fileSourceRef(portalPayloadPath, 'mas_progress_portal_payload', 'MAS Progress Portal payload'),
    fileSourceRef(path.join(workspaceRoot, 'ops', 'mas', 'progress', 'index.html'), 'mas_progress_portal_html', 'MAS Progress Portal'),
    ...refs,
  ]);
}

function isValidMasPortalHandoff(handoff: JsonRecord | null) {
  return Boolean(
    handoff
      && handoff.handoff_kind === 'mas_progress_portal_opl_family_projection'
      && handoff.authority === 'display_artifact_only'
      && handoff.opl_role === 'family_level_projection_consumer_only',
  );
}

function laneForMasPortalStudy(study: JsonRecord): RuntimeTrayLane | null {
  const stage = normalizeStatusCode(firstString(study.current_stage) ?? '');
  const health = normalizeStatusCode(firstString(study.runtime_health_status) ?? '');
  const freshness = normalizeStatusCode(firstString(study.progress_freshness_status) ?? '');
  const workerRunning = optionalBoolean(study.worker_running);
  const activeRunId = firstString(study.active_run_id);

  if (
    stage === 'live'
      || workerRunning === true
      || Boolean(activeRunId)
      || ['running', 'live', 'recovering'].includes(health)
  ) {
    return 'running';
  }

  if (
    ['blocked', 'failed', 'stale', 'missing'].includes(health)
      || ['stale', 'missing'].includes(freshness)
      || stage.includes('blocked')
  ) {
    return 'attention';
  }

  if (
    ['parked', 'completed', 'manual_hold', 'awaiting_explicit_resume'].includes(stage)
      || ['parked', 'completed', 'awaiting_explicit_resume', 'not_required'].includes(health)
      || ['not_required'].includes(freshness)
  ) {
    return 'recent';
  }

  return null;
}

function actionForMasPortalItem(study: JsonRecord, lane: RuntimeTrayLane) {
  const health = normalizeStatusCode(firstString(study.runtime_health_status) ?? '');
  const freshness = normalizeStatusCode(firstString(study.progress_freshness_status) ?? '');
  const nextAction = firstString(study.next_system_action, study.operator_focus, study.state_summary);
  if (lane === 'attention') {
    return actionContext('opl', 'quality_gate', nextAction ?? 'MAS Portal 报告当前论文线需要 OPL 关注。');
  }
  if (lane === 'recent') {
    return noActionContext(nextAction ?? 'MAS Portal 报告当前论文线不需要自动推进。');
  }
  return runningActionContext(
    health === 'recovering' || freshness === 'stale'
      ? nextAction ?? 'MAS Portal 报告当前论文线运行中，但仍处于恢复或观察状态。'
      : nextAction ?? 'MAS Portal 报告当前论文线运行中。',
  );
}

function recommendedCommandsForMasStudy(profileRef: string | null, studyId: string) {
  const progressCommand = commandForMasStudy(profileRef, studyId, 'study-progress');
  const runtimeStatusCommand = commandForMasStudy(profileRef, studyId, 'study-runtime-status');
  return [
    progressCommand
      ? {
        step_id: 'inspect_study_progress',
        title: '查看任务进度',
        surface_kind: 'study_progress',
        command: progressCommand,
      }
      : null,
    runtimeStatusCommand
      ? {
        step_id: 'inspect_runtime_status',
        title: '查看运行状态',
        surface_kind: 'study_runtime_status',
        command: runtimeStatusCommand,
      }
      : null,
  ].filter((entry): entry is RuntimeTrayCommand => Boolean(entry));
}

function buildPortalFields(
  portalHtmlPath: string,
  portalPayloadRef: string,
  portalFreshness: JsonRecord | null,
  portalSourceRefs: RuntimeTraySourceRef[],
) {
  return {
    portal_path: portalHtmlPath,
    portal_url: fileUrl(portalHtmlPath),
    portal_payload_ref: portalPayloadRef,
    portal_freshness: portalFreshness,
    portal_source_refs: portalSourceRefs,
  };
}

function buildMasPortalStudyItem(
  workspace: MasWorkspaceProjectionRef,
  portalPayloadPath: string,
  portalHtmlPath: string,
  portalPayloadRef: string,
  portalFreshness: JsonRecord | null,
  portalSourceRefs: RuntimeTraySourceRef[],
  study: JsonRecord,
): RuntimeTrayItem | null {
  const studyId = firstString(study.study_id);
  if (!studyId || studyId === 'workspace-overview') {
    return null;
  }

  const lane = laneForMasPortalStudy(study);
  if (!lane) {
    return null;
  }

  const recommendedCommands = recommendedCommandsForMasStudy(workspace.profile_ref, studyId);
  const action = actionForMasPortalItem(study, lane);
  const summary = firstString(study.state_summary, study.operator_focus, study.progress_freshness_summary);
  const nextActionSummary = firstString(study.next_system_action, study.operator_focus);
  const healthStatus = firstString(study.runtime_health_status);
  const freshnessStatus = firstString(study.progress_freshness_status);
  const statusLabel = firstString(study.state_label) ?? humanizeStatusLabel(healthStatus ?? firstString(study.current_stage) ?? 'running');
  const blockers = uniqueStrings([
    firstString(study.progress_freshness_summary),
    firstString(study.operator_focus),
  ].filter((entry): entry is string => Boolean(entry)));

  return {
    item_id: `medautoscience:portal-study:${studyId}`,
    project_id: 'medautoscience',
    project_label: 'MAS',
    lane,
    title: studyId,
    status: firstString(study.current_stage, healthStatus, freshnessStatus),
    status_label: statusLabel,
    summary,
    updated_at: firstString(portalFreshness?.latest_event_at),
    command: recommendedCommands[0]?.command ?? null,
    workspace_path: workspace.workspace_root,
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: 'med-autoscience',
    source_refs: uniqueByRef([
      ...workspace.source_refs,
      fileSourceRef(portalPayloadPath, 'mas_progress_portal_payload', 'MAS Progress Portal payload'),
      ...portalSourceRefs,
    ]),
    ...action,
    study_id: studyId,
    workspace_label: workspace.profile_name,
    detail_summary: summary,
    next_action_summary: nextActionSummary,
    active_run_id: firstString(study.active_run_id),
    browser_url: null,
    quest_session_api_url: null,
    health_status: healthStatus,
    blockers: localizeRuntimeDisplayList(blockers),
    recommended_commands: recommendedCommands,
    ...buildPortalFields(portalHtmlPath, portalPayloadRef, portalFreshness, portalSourceRefs),
  };
}

function buildMasPortalWorkspaceAttentionItem(
  workspace: MasWorkspaceProjectionRef,
  portalPayloadPath: string,
  portalHtmlPath: string,
  portalPayloadRef: string,
  portalFreshness: JsonRecord | null,
  portalSourceRefs: RuntimeTraySourceRef[],
  alert: JsonRecord,
  index: number,
): RuntimeTrayItem | null {
  const output = firstString(alert.current_output, alert.purpose, alert.expected);
  if (!output) {
    return null;
  }
  const recommendedCommand = firstString(alert.recommended_command);
  const recommendedCommands = recommendedCommand
    ? [{
      step_id: `mas_portal_workspace_alert_${index}`,
      title: '检查 MAS 工作区告警',
      surface_kind: firstString(alert.source) ?? 'mas_progress_portal_alert',
      command: recommendedCommand,
    }]
    : [];
  const action = actionContext('opl', 'quality_gate', output);
  return {
    item_id: `medautoscience:portal-workspace-alert:${workspace.profile_name ?? path.basename(workspace.workspace_root)}:${index}`,
    project_id: 'medautoscience',
    project_label: 'MAS 工作区',
    lane: 'attention',
    title: workspace.profile_name ?? path.basename(workspace.workspace_root),
    status: 'workspace_alert',
    status_label: '工作区告警',
    summary: output,
    updated_at: firstString(portalFreshness?.latest_event_at),
    command: recommendedCommand,
    workspace_path: workspace.workspace_root,
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: 'med-autoscience',
    source_refs: uniqueByRef([
      ...workspace.source_refs,
      fileSourceRef(portalPayloadPath, 'mas_progress_portal_payload', 'MAS Progress Portal payload'),
      ...portalSourceRefs,
    ]),
    ...action,
    workspace_label: workspace.profile_name,
    detail_summary: firstString(alert.purpose, output),
    next_action_summary: firstString(alert.expected, output),
    browser_url: null,
    quest_session_api_url: null,
    health_status: 'workspace_alert',
    blockers: [output],
    recommended_commands: recommendedCommands,
    ...buildPortalFields(portalHtmlPath, portalPayloadRef, portalFreshness, portalSourceRefs),
  };
}

export function buildMasPortalItems(workspace: MasWorkspaceProjectionRef): MasPortalProjection {
  const portalPayloadPath = path.join(workspace.workspace_root, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  const payload = readJsonRecord(portalPayloadPath);
  const handoff = nestedRecord(payload, 'opl_handoff');
  if (!payload || !isValidMasPortalHandoff(handoff)) {
    return { items: [], source_refs: [], portal_workspace_roots: new Set() };
  }
  const validHandoff = handoff as JsonRecord;

  const payloadRefs = nestedRecord(validHandoff, 'payload_refs');
  const portalPayloadRef = firstString(payloadRefs?.progress_portal) ?? portalPayloadPath;
  const portalHtmlPath = relativeOrAbsolutePath(
    workspace.workspace_root,
    firstString(validHandoff.deep_link) ?? path.join('ops', 'mas', 'progress', 'index.html'),
  ) ?? path.join(workspace.workspace_root, 'ops', 'mas', 'progress', 'index.html');
  const portalFreshness = nestedRecord(validHandoff, 'freshness') ?? nestedRecord(payload, 'freshness');
  const portalSourceRefs = compactPortalSourceRefs(workspace.workspace_root, portalPayloadPath, validHandoff);
  const workspaceRecord = nestedRecord(payload, 'workspace');
  const studyItems = jsonRecordList(workspaceRecord?.studies)
    .map((study) =>
      buildMasPortalStudyItem(
        workspace,
        portalPayloadPath,
        portalHtmlPath,
        portalPayloadRef,
        portalFreshness,
        portalSourceRefs,
        study,
      )
    )
    .filter((entry): entry is RuntimeTrayItem => Boolean(entry));
  const alertItems = jsonRecordList(workspaceRecord?.workspace_alert_items)
    .map((alert, index) =>
      buildMasPortalWorkspaceAttentionItem(
        workspace,
        portalPayloadPath,
        portalHtmlPath,
        portalPayloadRef,
        portalFreshness,
        portalSourceRefs,
        alert,
        index,
      )
    )
    .filter((entry): entry is RuntimeTrayItem => Boolean(entry));

  return {
    items: [...alertItems, ...studyItems],
    source_refs: [
      sourceRef('/runtime_tray_snapshot/mas_progress_portal_items', 'runtime_projection'),
      fileSourceRef(portalPayloadPath, 'mas_progress_portal_payload', 'MAS Progress Portal payload'),
    ],
    portal_workspace_roots: new Set([path.resolve(workspace.workspace_root)]),
  };
}
