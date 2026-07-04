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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((entry): entry is string => Boolean(entry))
    : [];
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

function taskRunProjectionStatusReason(state: string, priorityBucket: string) {
  if (state.includes('stale') || priorityBucket.includes('stale')) {
    return 'stale_task_projection_requires_refresh';
  }
  if (state.includes('waiting') || priorityBucket.includes('waiting')) {
    return 'waiting_for_owner_or_operator_input';
  }
  if (state === 'attention_needed' || priorityBucket === 'needs_attention') {
    return 'attention_lane_selected';
  }
  return priorityBucket;
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
  const statusReason = taskRunProjectionStatusReason(state, priorityBucket);
  const statusSeverity = state === 'attention_needed'
    || statusReason.includes('stale')
    || statusReason.includes('waiting')
    ? 'warning'
    : state === 'running'
      ? 'info'
      : 'none';
  const ownerAttentionReason = statusReason.includes('stale')
    ? 'stale_route_refresh_required'
    : statusReason.includes('waiting')
      ? 'waiting_for_owner_or_operator_input'
      : state === 'attention_needed'
        ? 'attention_lane_selected'
        : 'next_owner_ref_available';
  return [
    taskRunProjectionCondition({
      type: 'task_status',
      status: state,
      reason: statusReason,
      message: statusReason === priorityBucket
        ? asString(task.status_label) ?? asString(task.status) ?? state
        : statusReason,
      severity: statusSeverity,
      owner: domainId,
      lastTransitionTime: lastProgressAt,
      ref: `${ref}.progress`,
    }),
    taskRunProjectionCondition({
      type: 'owner_route',
      status: state === 'attention_needed' || ownerAttentionReason !== 'next_owner_ref_available'
        ? 'owner_attention_required'
        : 'routed',
      reason: ownerAttentionReason,
      message: asString(task.next_visible_step) ?? ownerAttentionReason,
      severity: ownerAttentionReason === 'next_owner_ref_available' ? 'none' : 'warning',
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

function taskOpenAction(taskId: string, actionId: string, actionRef: string | null, route: string | null) {
  return {
    action_id: actionId,
    action_ref: actionRef,
    route,
    required_mode: 'dry_run',
    content_policy: 'refs_only_no_action_body',
    payload_ref: `${baseRef(taskId)}.task_identity`,
  };
}

function taskRunProjectionTask(task: JsonRecord) {
  const taskId = asString(task.task_id) ?? 'unknown-task';
  const ref = baseRef(taskId);
  const artifactOrBlocker = asRecord(task.artifact_or_blocker);
  const reviewReceipt = asRecord(task.review_receipt);
  const actionReceipt = asRecord(task.action_receipt);
  const workflowRefs = asRecord(task.workflow_refs);
  const sourceRefCount = Number(task.source_ref_count ?? 0);
  const domainId = asString(task.domain_id) ?? 'opl';
  const updatedAt = asString(task.last_progress_at);
  const actionId = asString(actionReceipt.action_id) ?? 'task_action_receipt_preview';
  const actionRoute = asString(actionReceipt.route) ?? 'opl app action execute --action task_action_receipt_preview --dry-run';
  const actionPreviewRef = asString(actionReceipt.preview_ref);
  const exportBundleActionId = asString(actionReceipt.export_bundle_action_id) ?? 'task_export_bundle_preview';
  const exportBundleRoute = asString(actionReceipt.export_bundle_route)
    ?? 'opl app action execute --action task_export_bundle_preview --dry-run';
  const exportBundleActionRef = asString(artifactOrBlocker.export_bundle_action_ref)
    ?? 'app_state.actions#task_export_bundle_preview';
  return {
    task_id: taskId,
    title: asString(task.title) ?? taskId,
    domain_id: domainId,
    domain_label: asString(task.domain_label) ?? 'OPL',
    study_id: asString(task.study_id),
    task_identity: {
      task_id: taskId,
      domain_id: domainId,
      domain_label: asString(task.domain_label) ?? 'OPL',
      title: asString(task.title) ?? taskId,
      study_id: asString(task.study_id),
      task_ref: ref,
    },
    state: asString(task.state) ?? 'unknown',
    status_label: asString(task.status_label),
    active_stage_id: asString(task.active_stage_id),
    active_stage_label: asString(task.active_stage_label),
    active_run_id: asString(task.active_run_id),
    stage_attempt_ids: asStringArray(task.stage_attempt_ids),
    next_visible_step: asString(task.next_visible_step),
    last_progress_at: asString(task.last_progress_at),
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
        kind: 'source_refs',
        owner: 'opl_framework',
        updated_at: updatedAt,
        title: 'Source refs',
        summary: `${sourceRefCount} source refs`,
        ref: `${ref}.source_refs`,
        why_it_matters: 'Shows whether the App projection has refs to inspect without exposing source bodies.',
        open_action: taskOpenAction(taskId, actionId, `${ref}.source_refs`, actionRoute),
        content_policy: 'refs_only_no_artifact_body_no_memory_body',
      },
      {
        card_id: `${taskId}:artifact_or_blocker`,
        kind: 'artifact_or_blocker_refs',
        owner: domainId,
        updated_at: updatedAt,
        title: 'Artifact or blocker refs',
        summary: Number(artifactOrBlocker.blocker_ref_count ?? 0) > 0
          ? 'Blocker refs available'
          : 'Artifact refs available',
        ref: `${ref}.artifact_or_blocker`,
        why_it_matters: 'Points to artifact or blocker refs while keeping domain artifact bodies out of App state.',
        open_action: taskOpenAction(taskId, exportBundleActionId, exportBundleActionRef, exportBundleRoute),
        content_policy: asString(artifactOrBlocker.content_policy) ?? 'refs_only_no_artifact_body',
      },
      {
        card_id: `${taskId}:review_receipt`,
        kind: 'review_receipt_refs',
        owner: domainId,
        updated_at: updatedAt,
        title: 'Review receipt refs',
        summary: asString(reviewReceipt.status) ?? 'refs_available',
        ref: `${ref}.review_receipt`,
        why_it_matters: 'Separates reviewer receipt refs from any domain quality verdict authority.',
        open_action: taskOpenAction(taskId, actionId, actionPreviewRef, actionRoute),
        content_policy: 'refs_only_no_quality_verdict',
      },
    ],
    action_cards: [
      {
        card_id: `${taskId}:next_action`,
        risk: {
          mutation_policy: 'no_writes_preview_only',
          authority_boundary: 'cannot_create_owner_receipt_or_domain_truth',
        },
        write_targets: [],
        expected_output: {
          ref: actionPreviewRef,
          content_policy: asString(actionReceipt.content_policy) ?? 'refs_only_no_action_receipt_body',
        },
        rollback_ref: `${ref}.action_receipt`,
        verify_ref: `${ref}.review_receipt`,
        title: 'Next action ref',
        summary: asString(task.next_visible_step),
        ref: `${ref}.action_receipt`,
        action_ref: actionPreviewRef,
        open_action: taskOpenAction(taskId, actionId, actionPreviewRef, actionRoute),
        dry_run_required: asBoolean(actionReceipt.dry_run_required),
        content_policy: asString(actionReceipt.content_policy) ?? 'refs_only_no_action_receipt_body',
      },
    ],
    resource_cards: [
      {
        card_id: `${taskId}:workspace`,
        resource_kind: 'workspace',
        owner: 'opl_framework',
        title: 'Workspace ref',
        summary: asString(task.workspace_path) ? 'Workspace binding available' : 'Workspace binding unavailable',
        ref: `${ref}.workspace_path`,
        status_ref: `${ref}.workspace_path`,
        usage_ref: `${ref}.active_path`,
        quota_ref: `${ref}.workspace_path.quota`,
        permission_ref: `${ref}.workspace_path.permission`,
        cost_estimate_ref: `${ref}.workspace_path.cost_estimate`,
        open_action: taskOpenAction(taskId, 'workspace_inspect', 'app_state.actions#workspace_inspect', 'opl app action execute --action workspace_inspect --dry-run'),
        content_policy: 'refs_only_no_workspace_body',
      },
      {
        card_id: `${taskId}:workflow`,
        resource_kind: 'workflow',
        owner: domainId,
        title: 'Workflow refs',
        summary: 'Workflow refs available',
        ref: `${ref}.workflow_refs`,
        status_ref: asString(workflowRefs.current_workflow_ref) ?? `${ref}.workflow_refs.current_workflow_ref`,
        usage_ref: asString(workflowRefs.stage_workflow_ref) ?? `${ref}.workflow_refs.stage_workflow_ref`,
        quota_ref: `${ref}.workflow_refs.quota`,
        permission_ref: `${ref}.workflow_refs.permission`,
        cost_estimate_ref: `${ref}.workflow_refs.cost_estimate`,
        open_action: taskOpenAction(taskId, actionId, `${ref}.workflow_refs`, actionRoute),
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
