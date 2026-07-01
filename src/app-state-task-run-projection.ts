type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function baseRef(taskId: string) {
  return `app_state.operator.workbench.task_drilldowns.${encodeURIComponent(taskId)}`;
}

function taskRunProjectionCondition(input: {
  type: string;
  status: string;
  reason: string;
  message: string | null;
  severity: string;
  owner: string;
  lastTransitionTime: string | null;
  ref: string;
}) {
  return {
    type: input.type,
    status: input.status,
    reason: input.reason,
    message: input.message ?? input.reason,
    severity: input.severity,
    owner: input.owner,
    last_transition_time: input.lastTransitionTime,
    ref: input.ref,
  };
}

function taskRunProjectionConditions(task: JsonRecord) {
  const taskId = asString(task.task_id) ?? 'unknown-task';
  const ref = baseRef(taskId);
  const state = asString(task.state) ?? 'unknown';
  const priorityBucket = asString(task.priority_bucket) ?? 'unknown';
  const domainId = asString(task.domain_id) ?? 'opl';
  const nextOwner = asRecord(task.next_owner);
  const sourceRefCount = Number(task.source_ref_count ?? 0);
  const lastProgressAt = asString(task.last_progress_at);
  const statusSeverity = state === 'attention_needed'
    ? 'warning'
    : state === 'running'
      ? 'info'
      : 'none';
  return [
    taskRunProjectionCondition({
      type: 'task_status',
      status: state,
      reason: priorityBucket,
      message: asString(task.status_label) ?? asString(task.status) ?? state,
      severity: statusSeverity,
      owner: domainId,
      lastTransitionTime: lastProgressAt,
      ref: `${ref}.progress`,
    }),
    taskRunProjectionCondition({
      type: 'owner_route',
      status: state === 'attention_needed' ? 'owner_attention_required' : 'routed',
      reason: state === 'attention_needed' ? 'attention_lane_selected' : 'next_owner_ref_available',
      message: asString(task.next_visible_step),
      severity: state === 'attention_needed' ? 'warning' : 'none',
      owner: asString(nextOwner.owner) ?? domainId,
      lastTransitionTime: lastProgressAt,
      ref: `${ref}.next_owner`,
    }),
    taskRunProjectionCondition({
      type: 'evidence_refs',
      status: sourceRefCount > 0 ? 'available' : 'missing',
      reason: sourceRefCount > 0 ? 'source_refs_available' : 'source_refs_missing',
      message: `${sourceRefCount} source refs`,
      severity: sourceRefCount > 0 ? 'none' : 'warning',
      owner: 'opl_framework',
      lastTransitionTime: lastProgressAt,
      ref: `${ref}.source_refs`,
    }),
  ];
}

function taskRunProjectionTask(task: JsonRecord) {
  const taskId = asString(task.task_id) ?? 'unknown-task';
  const ref = baseRef(taskId);
  const artifactOrBlocker = asRecord(task.artifact_or_blocker);
  const reviewReceipt = asRecord(task.review_receipt);
  const actionReceipt = asRecord(task.action_receipt);
  const workflowRefs = asRecord(task.workflow_refs);
  const sourceRefCount = Number(task.source_ref_count ?? 0);
  return {
    task_identity: {
      task_id: taskId,
      domain_id: asString(task.domain_id) ?? 'opl',
      domain_label: asString(task.domain_label) ?? 'OPL',
      title: asString(task.title) ?? taskId,
      study_id: asString(task.study_id),
      task_ref: ref,
    },
    status: {
      state: asString(task.state) ?? 'unknown',
      status: asString(task.status),
      status_label: asString(task.status_label),
      priority_bucket: asString(task.priority_bucket) ?? 'unknown',
      active_stage_id: asString(task.active_stage_id),
      active_stage_label: asString(task.active_stage_label),
      active_run_ref: asString(task.active_run_id) ? `${ref}.active_run_id` : null,
    },
    progress: {
      progress_label: asString(asRecord(task.progress).label),
      current_step: asString(task.next_visible_step),
      last_progress_at: asString(task.last_progress_at),
      progress_ref: `${ref}.progress`,
      stage_ref: `${ref}.stage`,
    },
    conditions: taskRunProjectionConditions(task),
    evidence_cards: [
      {
        card_id: `${taskId}:source_refs`,
        title: 'Source refs',
        summary: `${sourceRefCount} source refs`,
        ref: `${ref}.source_refs`,
        content_policy: 'refs_only_no_artifact_body_no_memory_body',
      },
      {
        card_id: `${taskId}:artifact_or_blocker`,
        title: 'Artifact or blocker refs',
        summary: Number(artifactOrBlocker.blocker_ref_count ?? 0) > 0
          ? 'Blocker refs available'
          : 'Artifact refs available',
        ref: `${ref}.artifact_or_blocker`,
        content_policy: asString(artifactOrBlocker.content_policy) ?? 'refs_only_no_artifact_body',
      },
      {
        card_id: `${taskId}:review_receipt`,
        title: 'Review receipt refs',
        summary: asString(reviewReceipt.status) ?? 'refs_available',
        ref: `${ref}.review_receipt`,
        content_policy: 'refs_only_no_quality_verdict',
      },
    ],
    action_cards: [
      {
        card_id: `${taskId}:next_action`,
        title: 'Next action ref',
        summary: asString(task.next_visible_step),
        ref: `${ref}.action_receipt`,
        action_ref: asString(actionReceipt.preview_ref),
        dry_run_required: asBoolean(actionReceipt.dry_run_required),
        content_policy: asString(actionReceipt.content_policy) ?? 'refs_only_no_action_receipt_body',
      },
    ],
    resource_cards: [
      {
        card_id: `${taskId}:workspace`,
        title: 'Workspace ref',
        summary: asString(task.workspace_path) ? 'Workspace binding available' : 'Workspace binding unavailable',
        ref: `${ref}.workspace_path`,
        content_policy: 'refs_only_no_workspace_body',
      },
      {
        card_id: `${taskId}:workflow`,
        title: 'Workflow refs',
        summary: 'Workflow refs available',
        ref: `${ref}.workflow_refs`,
        content_policy: asString(workflowRefs.content_policy) ?? 'refs_only_no_workflow_body',
      },
    ],
    diagnostics_ref: 'app_state.provider.temporal',
  };
}

export function buildTaskRunProjectionV2(rawTasks: ReadonlyArray<JsonRecord>) {
  const tasks = rawTasks.map(taskRunProjectionTask);
  return {
    surface_kind: 'task_run_projection_v2',
    schema_version: 'task-run-projection.v2',
    source_ref: 'app_state.operator.workbench.task_drilldowns',
    authority: 'opl_framework_refs_only_user_task_projection',
    refs_only: true,
    summary: {
      task_count: tasks.length,
      running_task_count: tasks.filter((task) => task.status.priority_bucket === 'running').length,
      attention_task_count: tasks.filter((task) => task.status.priority_bucket === 'needs_attention').length,
      recent_task_count: tasks.filter((task) => task.status.priority_bucket === 'recent').length,
    },
    tasks,
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_artifact_body: false,
      can_read_memory_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
    },
  };
}
