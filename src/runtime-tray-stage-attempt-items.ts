import { actionContext, noActionContext, runningActionContext } from './runtime-tray-action.ts';
import type { JsonRecord, RuntimeTrayItem, RuntimeTrayLane, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { firstString, sourceRef, stringList, uniqueByRef } from './runtime-tray-snapshot-utils.ts';

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record).filter((entry) => Object.keys(entry).length > 0) : [];
}

function attemptId(attempt: JsonRecord) {
  return firstString(attempt.stage_attempt_id, attempt.attempt_id) ?? 'unknown-attempt';
}

function attemptStatus(attempt: JsonRecord) {
  return firstString(attempt.local_status, attempt.workflow_status, attempt.status) ?? 'unknown';
}

function attemptStage(attempt: JsonRecord) {
  return firstString(attempt.stage_id) ?? 'unknown-stage';
}

function attemptDomain(attempt: JsonRecord) {
  return firstString(attempt.domain_id) ?? 'unknown-domain';
}

function completionBoundary(attempt: JsonRecord) {
  return record(attempt.completion_boundary);
}

function attentionFlags(attempt: JsonRecord) {
  return stringList(attempt.attention_flags, 12);
}

function operatorConflicts(attempt: JsonRecord) {
  return recordList(attempt.operator_conflicts);
}

function domainReadyVerdict(attempt: JsonRecord) {
  return firstString(completionBoundary(attempt).domain_ready_verdict);
}

function hasOperatorAttention(attempt: JsonRecord) {
  const status = attemptStatus(attempt);
  return attentionFlags(attempt).length > 0
    || ['blocked', 'dead_lettered', 'failed', 'human_gate'].includes(status)
    || domainReadyVerdict(attempt) === 'domain_gate_pending';
}

function laneForAttempt(attempt: JsonRecord): RuntimeTrayLane {
  const status = attemptStatus(attempt);
  if (hasOperatorAttention(attempt)) {
    return 'attention';
  }
  if (['queued', 'running', 'checkpointed'].includes(status)) {
    return 'running';
  }
  return 'recent';
}

function statusLabel(attempt: JsonRecord) {
  const verdict = domainReadyVerdict(attempt);
  const flags = attentionFlags(attempt);
  const status = attemptStatus(attempt);
  if (flags.includes('human_gate')) {
    return 'Stage attempt 等待用户确认';
  }
  if (flags.includes('dead_lettered')) {
    return '已重试用尽，进入待处理';
  }
  if (flags.includes('blocked') || status === 'blocked') {
    return operatorConflicts(attempt)[0]?.operator_label as string ?? '证据不足，不能继续交付';
  }
  if (flags.includes('rejected_writes')) {
    return '回执冲突，已停止覆盖';
  }
  if (verdict === 'domain_gate_pending') {
    return 'Provider 已完成，domain gate 待确认';
  }
  if (['queued', 'running', 'checkpointed'].includes(status)) {
    return 'Stage attempt 运行中';
  }
  if (status === 'completed') {
    return 'Stage attempt 已完成';
  }
  return 'Stage attempt 已记录';
}

function summaryForAttempt(attempt: JsonRecord) {
  const status = attemptStatus(attempt);
  const stage = attemptStage(attempt);
  const verdict = domainReadyVerdict(attempt);
  const consumedMemoryRefs = stringList(attempt.consumed_memory_refs, 4);
  const writebackReceiptRefs = stringList(attempt.writeback_receipt_refs, 4);
  const conflictSummary = operatorConflicts(attempt)[0]?.operator_label;
  const parts = [
    `${stage} / ${status}`,
    typeof conflictSummary === 'string' ? conflictSummary : null,
    verdict ? `domain verdict: ${verdict}` : null,
    consumedMemoryRefs.length > 0 ? `memory refs: ${consumedMemoryRefs.length}` : null,
    writebackReceiptRefs.length > 0 ? `writeback receipts: ${writebackReceiptRefs.length}` : null,
  ];
  return parts.filter((entry): entry is string => Boolean(entry)).join('；');
}

function actionForAttempt(attempt: JsonRecord, lane: RuntimeTrayLane) {
  const flags = attentionFlags(attempt);
  if (flags.includes('human_gate')) {
    return actionContext('user', 'human_gate', 'Stage attempt 等待用户确认；先查看 attempt query 与 human gate refs。');
  }
  if (flags.includes('dead_lettered') || ['blocked', 'failed', 'dead_lettered'].includes(attemptStatus(attempt))) {
    return actionContext('infrastructure', 'infrastructure_recovery', '查看 attempt query、dead-letter 和 blocker refs 后按 owner 修复。');
  }
  if (lane === 'attention') {
    return actionContext('opl', 'quality_gate', '查看 provider closeout、domain verdict、memory refs 和 owner receipt refs。');
  }
  if (lane === 'running') {
    return runningActionContext('Stage attempt 仍在 provider-backed runtime 中推进。');
  }
  return noActionContext('Stage attempt 已记录；provider completion 不等于 domain ready。');
}

function stageAttemptSourceRefs(attempt: JsonRecord, workbenchRefs: RuntimeTraySourceRef[]) {
  return uniqueByRef([
    ...workbenchRefs,
    sourceRef(`/stage_attempt_workbench/attempts/${attemptId(attempt)}`, 'stage_attempt_operator_item'),
  ]);
}

export function buildStageAttemptTrayItems(input: {
  workbench: JsonRecord;
  sourceRefs: RuntimeTraySourceRef[];
}): RuntimeTrayItem[] {
  const attempts = recordList(input.workbench.attempts);
  return attempts.map((attempt) => {
    const id = attemptId(attempt);
    const domainId = attemptDomain(attempt);
    const stageId = attemptStage(attempt);
    const lane = laneForAttempt(attempt);
    return {
      item_id: `opl:stage-attempt:${id}`,
      project_id: domainId,
      project_label: domainId,
      lane,
      title: `Stage attempt: ${stageId}`,
      status: attemptStatus(attempt),
      status_label: statusLabel(attempt),
      summary: summaryForAttempt(attempt),
      updated_at: firstString(attempt.updated_at),
      command: `opl family-runtime attempt query ${id}`,
      workspace_path: firstString(record(attempt.workspace_locator).workspace_root),
      runtime_owner: 'provider_backed_family_runtime',
      domain_owner: domainId,
      source_refs: stageAttemptSourceRefs(attempt, input.sourceRefs),
      ...actionForAttempt(attempt, lane),
      detail_summary: summaryForAttempt(attempt),
      next_action_summary: actionForAttempt(attempt, lane).action_summary,
      blockers: attentionFlags(attempt),
      operator_conflicts: operatorConflicts(attempt),
      stage_attempt_workbench: {
        surface_kind: 'opl_stage_attempt_operator_item_projection',
        provider_completion_is_domain_ready: false,
        attempt,
        completion_boundary: completionBoundary(attempt),
        controlled_apply_contract: record(attempt.controlled_apply_contract),
        lifecycle_primitives: record(attempt.lifecycle_primitives),
        artifact_gallery: record(attempt.artifact_gallery),
        consumed_refs: stringList(attempt.consumed_refs, 8),
        consumed_memory_refs: stringList(attempt.consumed_memory_refs, 8),
        writeback_receipt_refs: stringList(attempt.writeback_receipt_refs, 8),
        rejected_writes: recordList(attempt.rejected_writes),
        operator_conflicts: operatorConflicts(attempt),
        route_decision_graph: record(attempt.route_decision_graph),
        review_repair_queue: record(attempt.review_repair_queue),
        quality_readiness: record(attempt.quality_readiness),
        observability_slo: record(attempt.observability_slo),
        workspace_source_intake: record(attempt.workspace_source_intake),
        memory_locator_index: record(attempt.memory_locator_index),
        package_export_lifecycle: record(attempt.package_export_lifecycle),
        action_routing: record(attempt.action_routing),
        transition_bridge_evidence: record(attempt.transition_bridge_evidence),
        authority_boundary: {
          opl: 'operator_projection_over_attempt_refs_only',
          domain: 'truth_quality_artifact_gate_owner',
          opl_writes_memory_body: false,
          provider_completion_is_domain_ready: false,
        },
      },
    };
  });
}
