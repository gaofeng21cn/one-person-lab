type JsonRecord = Record<string, unknown>;
type ActionKind = 'user_action' | 'system_action' | 'agent_action' | 'safe_action' | 'blocked_no_action';

const ACTION_KINDS = new Set<ActionKind>([
  'user_action',
  'system_action',
  'agent_action',
  'safe_action',
  'blocked_no_action',
]);

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asObservedGeneration(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return asString(value);
}

function asActionKind(value: unknown): ActionKind | null {
  const candidate = asString(value) as ActionKind | null;
  return candidate && ACTION_KINDS.has(candidate) ? candidate : null;
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  observedGeneration: string | number | null;
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
    observed_generation: input.observedGeneration,
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
  const observedGeneration = asObservedGeneration(task.observed_generation);
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
      observedGeneration,
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
      observedGeneration,
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
      observedGeneration,
      ref: `${ref}.source_refs`,
    }),
  ];
}

function taskOpenAction(
  taskId: string,
  actionId: string,
  actionRef: string | null,
  route: string | null,
  actionKind: ActionKind = 'safe_action',
) {
  return {
    action_id: actionId,
    action_kind: actionKind,
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
  const taskIdentityBase = asRecord(task.task_identity);
  const artifactOrBlocker = asRecord(task.artifact_or_blocker);
  const reviewReceipt = asRecord(task.review_receipt);
  const actionReceipt = asRecord(task.action_receipt);
  const workflowRefs = asRecord(task.workflow_refs);
  const stageRunCockpit = asRecord(task.stage_run_cockpit);
  const stageRunCockpitSummary = asRecord(task.stage_run_cockpit_summary);
  const currentStageUsage = asRecord(task.current_stage_usage);
  const taskTotalUsage = asRecord(task.task_total_usage);
  const sourceRefCount = Number(task.source_ref_count ?? 0);
  const domainId = asString(task.domain_id) ?? 'opl';
  const domainLabel = asString(task.domain_label) ?? 'OPL';
  const projectIdentityBase = asRecord(taskIdentityBase.project);
  const projectIdentity = {
    project_id: asString(projectIdentityBase.project_id) ?? domainId,
    label: asString(task.project_display_name)
      ?? asString(task.workspace_label)
      ?? asString(projectIdentityBase.workspace_label)
      ?? asString(projectIdentityBase.label)
      ?? domainLabel,
    scope_id: asString(projectIdentityBase.scope_id) ?? asString(task.project_scope_id) ?? `project:${domainId}`,
    workspace_binding_id: asString(projectIdentityBase.workspace_binding_id) ?? asString(task.workspace_binding_id),
    workspace_path: asString(projectIdentityBase.workspace_path) ?? asString(task.workspace_path),
    workspace_label: asString(task.workspace_label) ?? asString(projectIdentityBase.workspace_label),
  };
  const updatedAt = asString(task.last_progress_at);
  const actionId = asString(actionReceipt.action_id) ?? 'task_action_receipt_preview';
  const actionRoute = asString(actionReceipt.route) ?? 'opl app action execute --action task_action_receipt_preview --dry-run';
  const actionPreviewRef = asString(actionReceipt.preview_ref);
  const exportBundleActionId = asString(actionReceipt.export_bundle_action_id) ?? 'task_export_bundle_preview';
  const exportBundleRoute = asString(actionReceipt.export_bundle_route)
    ?? 'opl app action execute --action task_export_bundle_preview --dry-run';
  const exportBundleActionRef = asString(artifactOrBlocker.export_bundle_action_ref)
    ?? 'app_state.actions#task_export_bundle_preview';
  const taskIdentity = {
    task_id: taskId,
    domain_id: domainId,
    domain_label: domainLabel,
    title: asString(task.title) ?? taskId,
    study_id: asString(task.study_id),
    task_ref: asString(taskIdentityBase.task_ref) ?? ref,
    agent_display_name: asString(task.agent_display_name),
    work_item_display_name: asString(task.work_item_display_name),
    execution_run_label: asString(task.execution_run_label),
    agent: asRecord(taskIdentityBase.agent),
    project: projectIdentity,
    work_item: asRecord(taskIdentityBase.work_item),
    execution_run: asRecord(taskIdentityBase.execution_run),
  };
  return {
    task_id: taskId,
    title: asString(task.title) ?? taskId,
    domain_id: domainId,
    domain_label: domainLabel,
    study_id: asString(task.study_id),
    task_identity: taskIdentity,
    state: asString(task.state) ?? 'unknown',
    status_label: asString(task.status_label),
    active_stage_id: asString(task.active_stage_id),
    active_stage_label: asString(task.active_stage_label),
    active_run_id: asString(task.active_run_id),
    stage_attempt_ids: asStringArray(task.stage_attempt_ids),
    runtime_readback_source: asString(task.runtime_readback_source),
    runtime_attempt_status: asString(task.runtime_attempt_status),
    runtime_closeout_observed: task.runtime_closeout_observed === true,
    runtime_closeout_ref: asString(task.runtime_closeout_ref),
    primary_state: asString(task.primary_state),
    primary_state_label: asString(task.primary_state_label),
    primary_state_reason: asString(task.primary_state_reason),
    automation_state: asString(task.automation_state),
    automation_state_label: asString(task.automation_state_label),
    automation_state_reason: asString(task.automation_state_reason),
    agent_display_name: asString(task.agent_display_name),
    work_item_display_name: asString(task.work_item_display_name),
    execution_run_label: asString(task.execution_run_label),
    workspace_label: asString(task.workspace_label) ?? projectIdentity.workspace_label,
    workspace_binding_id: asString(task.workspace_binding_id) ?? projectIdentity.workspace_binding_id,
    workspace_scope_id: asString(task.workspace_scope_id),
    project_scope_id: projectIdentity.scope_id,
    project_id: projectIdentity.project_id,
    project_display_name: projectIdentity.label,
    agent_scope_id: asString(task.agent_scope_id),
    task_scope_id: asString(task.task_scope_id),
    stage_started_at: asString(task.stage_started_at),
    elapsed_seconds: asNumber(task.elapsed_seconds),
    last_heartbeat_at: asString(task.last_heartbeat_at),
    running_proof_status: asString(task.running_proof_status),
    running_proof_summary: asString(task.running_proof_summary),
    current_stage_usage: currentStageUsage,
    task_total_usage: taskTotalUsage,
    usage_telemetry_status: asString(task.usage_telemetry_status),
    typed_blocker_summary: asString(task.typed_blocker_summary),
    typed_blocker_owner: asString(task.typed_blocker_owner),
    runtime_blocker_summary: asString(task.runtime_blocker_summary),
    resolution_route: asString(task.resolution_route),
    gateway_status_ref: asString(task.gateway_status_ref),
    connector_readiness_refs: asStringArray(task.connector_readiness_refs).length > 0
      ? asStringArray(task.connector_readiness_refs)
      : task.connector_readiness_refs,
    diagnostic_substrate_refs: asStringArray(task.diagnostic_substrate_refs).length > 0
      ? asStringArray(task.diagnostic_substrate_refs)
      : task.diagnostic_substrate_refs,
    stage_run_cockpit: stageRunCockpit,
    stage_run_cockpit_summary: stageRunCockpitSummary,
    stage_run_current_owner_delta: asRecord(task.stage_run_current_owner_delta),
    next_visible_step: asString(task.next_visible_step),
    last_progress_at: asString(task.last_progress_at),
    status: {
      state: asString(task.state) ?? 'unknown',
      status: asString(task.status),
      status_label: asString(task.status_label),
      priority_bucket: asString(task.priority_bucket) ?? 'unknown',
      primary_state: asString(task.primary_state),
      primary_state_label: asString(task.primary_state_label),
      primary_state_reason: asString(task.primary_state_reason),
      automation_state: asString(task.automation_state),
      automation_state_label: asString(task.automation_state_label),
      automation_state_reason: asString(task.automation_state_reason),
      active_stage_id: asString(task.active_stage_id),
      active_stage_label: asString(task.active_stage_label),
      active_run_ref: asString(task.active_run_id) ? `${ref}.active_run_id` : null,
      running_proof_status: asString(task.running_proof_status),
      last_heartbeat_at: asString(task.last_heartbeat_at),
      elapsed_seconds: asNumber(task.elapsed_seconds),
    },
    progress: {
      progress_label: asString(asRecord(task.progress).label),
      current_step: asString(task.next_visible_step),
      last_progress_at: asString(task.last_progress_at),
      progress_ref: `${ref}.progress`,
      stage_ref: `${ref}.stage`,
      resolution_route: asString(task.resolution_route),
      stage_usage: currentStageUsage,
      task_total_usage: taskTotalUsage,
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
        action_kind: asActionKind(actionReceipt.action_kind) ?? 'safe_action',
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

function workItemActionKind(task: JsonRecord): ActionKind {
  const primaryState = asString(task.primary_state);
  const automationState = asString(task.automation_state);
  if (primaryState === 'owner_decision_required' || primaryState === 'paused_waiting_for_direction') {
    return 'user_action';
  }
  if (primaryState === 'system_attention_required') {
    return 'system_action';
  }
  if (primaryState === 'in_progress' || automationState === 'automation_running') {
    return 'agent_action';
  }
  return asRecordArray(task.action_cards).length > 0 ? 'safe_action' : 'blocked_no_action';
}

function workItemStageCatalogSummary() {
  return {
    source_catalog: 'family_stage_control_plane',
    source_catalog_ref: 'contracts/family-orchestration/family-stage-control-plane.schema.json',
    action_catalog_ref: 'contracts/family-orchestration/family-action-catalog.schema.json',
    action_lineage_ref: 'family_action_catalog.source_of_work.stage_catalog_ref',
    label_source_policy: 'task_drilldowns.active_stage_label_else_active_stage_id',
    next_action_template_source_policy:
      'stage_run_cockpit_summary.next_safe_action_ref_else_family_action_catalog.source_of_work.stage_catalog_ref',
    refs_only: true,
  };
}

function workItemCondition(condition: JsonRecord) {
  return {
    type: asString(condition.type) ?? 'unknown',
    status: asString(condition.status) ?? 'unknown',
    reason: asString(condition.reason) ?? 'unknown',
    message: asString(condition.message),
    owner: asString(condition.owner) ?? 'unknown',
    last_transition_time: asString(condition.last_transition_time),
    observed_generation: asObservedGeneration(condition.observed_generation),
    ref: asString(condition.ref),
  };
}

function hasUsageOrHeartbeat(task: JsonRecord) {
  return asString(task.last_heartbeat_at) !== null
    || asNumber(task.elapsed_seconds) !== null
    || Object.keys(asRecord(task.current_stage_usage)).length > 0
    || Object.keys(asRecord(task.task_total_usage)).length > 0;
}

function canonicalWorkItemCondition(input: {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message: string;
  owner: string;
  lastTransitionTime: string | null;
  observedGeneration: string | number | null;
  ref: string;
}) {
  return {
    type: input.type,
    status: input.status,
    reason: input.reason,
    message: input.message,
    owner: input.owner,
    last_transition_time: input.lastTransitionTime,
    observed_generation: input.observedGeneration,
    ref: input.ref,
  };
}

function canonicalWorkItemConditions(task: JsonRecord) {
  const taskId = asString(task.task_id) ?? 'unknown-task';
  const ref = baseRef(taskId);
  const primaryState = asString(task.primary_state);
  const automationState = asString(task.automation_state);
  const owner = asString(task.domain_id) ?? 'opl_framework';
  const lastTransitionTime = asString(task.last_progress_at);
  const observedGeneration = asObservedGeneration(task.observed_generation);
  const running = primaryState === 'in_progress' || automationState === 'automation_running';
  const succeeded = primaryState === 'delivered_auto_paused';
  const needsUserDecision = primaryState === 'owner_decision_required' || primaryState === 'paused_waiting_for_direction';
  const needsSystemRepair = primaryState === 'system_attention_required';
  const paused = succeeded || primaryState === 'paused_waiting_for_direction';
  const telemetryFresh = hasUsageOrHeartbeat(task);

  return [
    canonicalWorkItemCondition({
      type: 'Running',
      status: running ? 'True' : 'False',
      reason: running ? 'automation_or_user_progress_running' : 'not_running',
      message: running ? 'Work item is being advanced.' : 'No active running proof is projected.',
      owner,
      lastTransitionTime,
      observedGeneration,
      ref: `${ref}.status`,
    }),
    canonicalWorkItemCondition({
      type: 'Succeeded',
      status: succeeded ? 'True' : 'False',
      reason: succeeded ? 'delivered_auto_paused' : 'not_delivered',
      message: succeeded ? 'Milestone deliverable is present and automation is paused.' : 'No delivered milestone is projected.',
      owner,
      lastTransitionTime,
      observedGeneration,
      ref: `${ref}.status.primary_state`,
    }),
    canonicalWorkItemCondition({
      type: 'NeedsUserDecision',
      status: needsUserDecision ? 'True' : 'False',
      reason: needsUserDecision ? 'user_direction_required' : 'no_user_decision_required',
      message: needsUserDecision ? 'User direction is needed before the work item can continue.' : 'No user decision is projected.',
      owner: needsUserDecision ? 'user' : owner,
      lastTransitionTime,
      observedGeneration,
      ref: `${ref}.next_owner`,
    }),
    canonicalWorkItemCondition({
      type: 'NeedsSystemRepair',
      status: needsSystemRepair ? 'True' : 'False',
      reason: needsSystemRepair ? 'system_attention_required' : 'no_system_repair_required',
      message: needsSystemRepair ? 'System or framework repair is needed.' : 'No system repair is projected.',
      owner: needsSystemRepair ? 'opl_framework' : owner,
      lastTransitionTime,
      observedGeneration,
      ref: `${ref}.next_owner`,
    }),
    canonicalWorkItemCondition({
      type: 'Paused',
      status: paused ? 'True' : 'False',
      reason: paused ? primaryState ?? 'paused' : 'not_paused',
      message: paused ? 'Work item is paused from the user perspective.' : 'Work item is not paused.',
      owner,
      lastTransitionTime,
      observedGeneration,
      ref: `${ref}.status.primary_state`,
    }),
    canonicalWorkItemCondition({
      type: 'TelemetryFresh',
      status: telemetryFresh ? 'True' : 'Unknown',
      reason: telemetryFresh ? 'telemetry_projected' : 'telemetry_not_projected',
      message: telemetryFresh ? 'Runtime telemetry is projected.' : 'Runtime telemetry is missing from the fast projection.',
      owner: 'opl_framework',
      lastTransitionTime: asString(task.last_heartbeat_at) ?? lastTransitionTime,
      observedGeneration,
      ref: `${ref}.telemetry`,
    }),
  ];
}

function workItemEvidenceCard(card: JsonRecord) {
  return {
    card_id: asString(card.card_id) ?? 'unknown',
    kind: asString(card.kind) ?? 'unknown',
    title: asString(card.title) ?? 'Evidence refs',
    summary: asString(card.summary) ?? 'refs_available',
    owner: asString(card.owner) ?? 'unknown',
    ref: asString(card.ref),
    content_policy: asString(card.content_policy) ?? 'refs_only',
  };
}

function workItemProjectionItem(task: JsonRecord) {
  const taskId = asString(task.task_id) ?? 'unknown-task';
  const identity = asRecord(task.task_identity);
  const agent = asRecord(identity.agent);
  const project = asRecord(identity.project);
  const workItem = asRecord(identity.work_item);
  const executionRun = asRecord(identity.execution_run);
  const status = asRecord(task.status);
  const actionCard = asRecordArray(task.action_cards)[0] ?? {};
  const openAction = asRecord(actionCard.open_action);
  const stageCatalog = workItemStageCatalogSummary();
  const stageRunCockpitSummary = asRecord(task.stage_run_cockpit_summary);
  const stageRunCockpit = asRecord(task.stage_run_cockpit);
  const currentStageUsage = asRecord(task.current_stage_usage);
  const taskTotalUsage = asRecord(task.task_total_usage);
  const stageAttemptIds = asStringArray(task.stage_attempt_ids);
  const stageId = asString(task.active_stage_id) ?? asString(executionRun.stage_id) ?? 'unknown';
  const stageLabel = asString(task.active_stage_label)
    ?? asString(executionRun.stage_label)
    ?? asString(stageRunCockpitSummary.current_stage)
    ?? stageId;
  const actionKind = workItemActionKind(task);
  const evidenceCards = asRecordArray(task.evidence_cards).map(workItemEvidenceCard);
  const projectScopeId = asString(project.scope_id);

  return {
    item_id: taskId,
    title: asString(task.title) ?? taskId,
    scope: {
      scope_kind: 'work_item',
      scope_id: asString(workItem.scope_id) ?? `task:${taskId}`,
      agent_scope_id: asString(agent.scope_id),
      project_scope_id: asString(project.scope_id),
      work_item_scope_id: asString(workItem.scope_id),
      task_ref: asString(identity.task_ref) ?? baseRef(taskId),
    },
    work_item: {
      work_item_id: asString(workItem.work_item_id) ?? taskId,
      label: asString(workItem.label) ?? asString(task.work_item_display_name) ?? asString(task.title) ?? taskId,
      kind: asString(workItem.kind) ?? 'runtime_activity',
      study_id: asString(task.study_id),
      project_label: asString(project.label) ?? asString(task.project_display_name),
      project_scope_id: projectScopeId,
      workspace_binding_id: asString(project.workspace_binding_id),
      workspace_path: asString(project.workspace_path),
      workspace_label: asString(project.workspace_label),
    },
    agent: {
      agent_id: asString(agent.agent_id) ?? asString(task.domain_id) ?? 'unknown',
      label: asString(agent.label) ?? asString(task.agent_display_name) ?? asString(task.domain_label) ?? 'unknown',
      owner: asString(task.domain_id) ?? 'unknown',
    },
    stage: {
      stage_id: stageId,
      display_label: stageLabel,
      display_label_source: asString(task.active_stage_label)
        ? `${baseRef(taskId)}.active_stage_label`
        : `${baseRef(taskId)}.active_stage_id`,
      catalog_ref: stageCatalog.source_catalog_ref,
      next_action_template_source: stageCatalog.next_action_template_source_policy,
      execution_run_label: asString(executionRun.label) ?? asString(task.execution_run_label),
    },
    attempt: {
      attempt_id: stageAttemptIds[0] ?? null,
      attempt_ref: stageAttemptIds[0] ? `${baseRef(taskId)}.stage_attempt_ids[0]` : null,
      attempt_ids_ref: `${baseRef(taskId)}.stage_attempt_ids`,
      attempt_count: stageAttemptIds.length,
      active_run_ref: asString(task.active_run_id) ? `${baseRef(taskId)}.active_run_id` : null,
      active_run_label: asString(executionRun.label) ?? asString(task.execution_run_label),
      status: asString(task.runtime_attempt_status)
        ?? asString(task.running_proof_status)
        ?? asString(task.automation_state),
      elapsed_seconds: asNumber(task.elapsed_seconds) ?? asNumber(stageRunCockpit.elapsed_seconds),
      last_heartbeat_at: asString(task.last_heartbeat_at) ?? asString(stageRunCockpit.last_heartbeat_at),
      stage_usage: currentStageUsage,
      task_total_usage: taskTotalUsage,
      telemetry_status: asString(task.usage_telemetry_status),
      refs_only: true,
    },
    action: {
      action_kind: actionKind,
      title: asString(actionCard.title) ?? 'Next action',
      summary: asString(actionCard.summary) ?? asString(task.next_visible_step),
      owner: actionKind === 'user_action'
        ? 'user'
        : actionKind === 'system_action'
          ? 'opl_framework'
          : asString(task.domain_id) ?? 'unknown',
      ref: asString(actionCard.ref),
      action_ref: asString(actionCard.action_ref) ?? asString(openAction.action_ref),
      route: asString(openAction.route),
      dry_run_required: asBoolean(actionCard.dry_run_required) || asString(openAction.required_mode) === 'dry_run',
      catalog_ref: stageCatalog.action_catalog_ref,
    },
    evidence: {
      refs_only: true,
      card_count: evidenceCards.length,
      cards: evidenceCards,
      source_ref: `${baseRef(taskId)}.source_refs`,
      body_policy: 'no_artifact_body_no_memory_body_no_quality_verdict',
    },
    status: {
      primary_state: asString(task.primary_state) ?? asString(status.primary_state) ?? 'unknown',
      primary_state_label: asString(task.primary_state_label) ?? asString(status.primary_state_label),
      automation_state: asString(task.automation_state) ?? asString(status.automation_state) ?? 'unknown',
      automation_state_label: asString(task.automation_state_label) ?? asString(status.automation_state_label),
    },
    diagnostic_conditions: asRecordArray(task.conditions).map(workItemCondition),
    conditions: canonicalWorkItemConditions(task),
  };
}

function buildWorkItemProjectionV1(tasks: ReadonlyArray<JsonRecord>) {
  return {
    surface_kind: 'opl_work_item_projection',
    schema_version: 'work-item-projection.v1',
    source_ref: 'app_state.operator.workbench.task_run_projection_v2.tasks',
    derived_from: 'task_run_projection_v2',
    refs_only: true,
    stage_catalog_summary: workItemStageCatalogSummary(),
    summary: {
      item_count: tasks.length,
      agent_action_count: tasks.filter((task) => workItemActionKind(task) === 'agent_action').length,
      user_action_count: tasks.filter((task) => workItemActionKind(task) === 'user_action').length,
      system_action_count: tasks.filter((task) => workItemActionKind(task) === 'system_action').length,
      safe_action_count: tasks.filter((task) => workItemActionKind(task) === 'safe_action').length,
      blocked_no_action_count: tasks.filter((task) => workItemActionKind(task) === 'blocked_no_action').length,
    },
    items: tasks.map(workItemProjectionItem),
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

export function buildTaskRunProjectionV2(rawTasks: ReadonlyArray<JsonRecord>) {
  const tasks = rawTasks.map(taskRunProjectionTask);
  const workItemProjection = buildWorkItemProjectionV1(tasks);
  return {
    surface_kind: 'task_run_projection_v2',
    schema_version: 'task-run-projection.v2',
    source_ref: 'app_state.operator.workbench.task_drilldowns',
    authority: 'opl_framework_refs_only_user_task_projection',
    refs_only: true,
    summary: {
      task_count: tasks.length,
      running_task_count: tasks.filter((task) => task.primary_state === 'in_progress').length,
      active_project_count: tasks.length,
      queued_project_count: tasks.filter((task) =>
        ['paused_waiting_for_direction', 'owner_decision_required'].includes(task.primary_state ?? '')
      ).length,
      attention_count: tasks.filter((task) =>
        ['owner_decision_required', 'system_attention_required'].includes(task.primary_state ?? '')
      ).length,
      attention_task_count: tasks.filter((task) => task.status.priority_bucket === 'needs_attention').length,
      recent_task_count: tasks.filter((task) => task.status.priority_bucket === 'recent').length,
      in_progress_count: tasks.filter((task) => task.primary_state === 'in_progress').length,
      delivered_auto_paused_count: tasks.filter((task) => task.primary_state === 'delivered_auto_paused').length,
      paused_count: tasks.filter((task) => task.primary_state === 'paused_waiting_for_direction').length,
      owner_decision_count: tasks.filter((task) => task.primary_state === 'owner_decision_required').length,
      system_attention_count: tasks.filter((task) => task.primary_state === 'system_attention_required').length,
      automation_running_count: tasks.filter((task) => task.automation_state === 'automation_running').length,
    },
    work_item_projection_v1: workItemProjection,
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
