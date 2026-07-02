import type { JsonRecord } from '../console/runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function deltaCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!isRecord(value)) {
    return 0;
  }
  const count = numberValue(value.count) || numberValue(value.delta_count);
  if (count > 0) {
    return count;
  }
  if (booleanValue(value.has_deliverable_delta) || booleanValue(value.has_delta)) {
    return 1;
  }
  return stringList(value.refs).length;
}

function deltaSummary(value: unknown) {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (!isRecord(value)) {
    return deltaCount(value) > 0 ? `deliverable_delta_count:${deltaCount(value)}` : null;
  }
  return stringValue(value.delta_summary)
    ?? stringValue(value.summary)
    ?? stringList(value.refs)[0]
    ?? (deltaCount(value) > 0 ? `deliverable_delta_count:${deltaCount(value)}` : null);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function attemptRef(attempt: JsonRecord) {
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  return stageAttemptId ? `/stage_attempt_workbench/attempts/${stageAttemptId}` : null;
}

function typedBlockerRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const transition = record(record(attempt.transition_bridge_evidence).evidence);
  const controlled = record(attempt.controlled_apply_contract);
  return uniqueStrings([
    ...stringList(routeImpact.typed_blocker_refs),
    stringValue(routeImpact.typed_blocker_ref),
    ...stringList(transition.typed_blocker_refs),
    stringValue(transition.typed_blocker_ref),
    ...stringList(controlled.typed_blocker_refs),
    stringValue(controlled.typed_blocker_ref),
  ]);
}

function ownerReceiptRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const transition = record(record(attempt.transition_bridge_evidence).evidence);
  const controlled = record(attempt.controlled_apply_contract);
  return uniqueStrings([
    ...stringList(routeImpact.owner_receipt_refs),
    stringValue(routeImpact.owner_receipt_ref),
    ...stringList(routeImpact.domain_owner_receipt_refs),
    stringValue(routeImpact.domain_owner_receipt_ref),
    ...stringList(transition.owner_receipt_refs),
    stringValue(transition.owner_receipt_ref),
    ...stringList(controlled.owner_receipt_refs),
  ]);
}

function stagePacketRefs(attempt: JsonRecord) {
  const workspace = record(attempt.workspace_locator);
  const progressLog = record(attempt.stage_progress_log);
  const intendedWork = record(progressLog.intended_work);
  return uniqueStrings([
    ...stringList(record(attempt.heartbeat).checkpoint_refs).filter((ref) => ref.includes('packet:')),
    ...stringList(attempt.checkpoint_refs).filter((ref) => ref.includes('packet:')),
    ...stringList(intendedWork.stage_packet_refs),
    ...stringList(workspace.stage_packet_refs),
    stringValue(workspace.stage_packet_ref),
    stringValue(workspace.dispatch_ref),
  ]);
}

function latestCloseout(attempt: JsonRecord) {
  return {
    closeout_refs: stringList(attempt.closeout_refs),
    closeout_receipt_status: stringValue(attempt.closeout_receipt_status),
    canonical_outcome: stringValue(attempt.canonical_outcome),
    domain_ready_verdict: stringValue(attempt.domain_ready_verdict),
    next_owner: stringValue(attempt.next_owner),
  };
}

function runningAttempt(attempt: JsonRecord) {
  const current = record(attempt.current_control_state);
  const providerRun = record(attempt.provider_run);
  const running = current.running_provider_attempt === true
    || stringValue(attempt.local_status) === 'running'
    || stringValue(current.reconciliation_status) === 'running';
  return {
    running_provider_attempt: running,
    provider_kind: stringValue(attempt.provider_kind),
    workflow_id: stringValue(attempt.workflow_id),
    last_heartbeat_at:
      stringValue(record(record(attempt.heartbeat).provider_run).last_heartbeat_at)
      ?? stringValue(record(attempt.heartbeat).last_heartbeat_at)
      ?? stringValue(providerRun.last_heartbeat_at)
      ?? stringValue(record(current.provider_run).last_heartbeat_at),
  };
}

export function buildEffectiveCurrentContextPacket(attempts: JsonRecord[]) {
  const contexts = attempts.map((attempt) => {
    const workspace = record(attempt.workspace_locator);
    const current = record(attempt.current_control_state);
    const stageAttemptId = stringValue(attempt.stage_attempt_id);
    return {
      packet_version: 'effective_current_context.v1',
      ref: attemptRef(attempt),
      owner_route: {
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        next_owner: stringValue(attempt.next_owner) ?? stringValue(record(attempt.route_impact).next_owner),
        owner_receipt_refs: ownerReceiptRefs(attempt),
        typed_blocker_refs: typedBlockerRefs(attempt),
      },
      source_fingerprint: {
        stage_attempt_source_fingerprint: stringValue(attempt.source_fingerprint),
        domain_source_fingerprint: stringValue(workspace.domain_source_fingerprint),
        source_refs: stringList(workspace.source_refs),
      },
      stage_packet: {
        stage_packet_refs: stagePacketRefs(attempt),
        checkpoint_refs: stringList(attempt.checkpoint_refs),
      },
      workspace_session: {
        workspace_root: stringValue(workspace.workspace_root),
        runtime_root: stringValue(workspace.runtime_root),
        artifact_root: stringValue(workspace.artifact_root),
        study_id: stringValue(workspace.study_id),
        profile: stringValue(workspace.profile) ?? stringValue(workspace.profile_name),
        task_id: stringValue(attempt.task_id),
        stage_attempt_id: stageAttemptId,
        workflow_id: stringValue(attempt.workflow_id),
        current_control_state: stringValue(current.reconciliation_status),
      },
      latest_closeout: latestCloseout(attempt),
      running_attempt: runningAttempt(attempt),
      superseded_lineage: {
        superseded_by_stage_attempt_id: stringValue(attempt.superseded_by_stage_attempt_id),
        superseded_reason: stringValue(attempt.superseded_reason),
        default_actionability_status: stringValue(attempt.default_actionability_status),
      },
    };
  });
  return {
    surface_kind: 'opl_effective_current_context_packet',
    packet_version: 'effective_current_context.v1',
    projection_policy: 'refs_only_current_context_packet_no_domain_truth_or_ready_verdict',
    contexts,
    summary: {
      context_count: contexts.length,
      running_attempt_count: contexts.filter((context) =>
        context.running_attempt.running_provider_attempt
      ).length,
      latest_closeout_count: contexts.filter((context) =>
        context.latest_closeout.closeout_refs.length > 0
      ).length,
      superseded_context_count: contexts.filter((context) =>
        Boolean(context.superseded_lineage.superseded_by_stage_attempt_id)
      ).length,
    },
    authority_boundary: authorityBoundary(),
  };
}

function blockerFamily(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const blocker = record(recordList(routeImpact.typed_blockers)[0]
    ?? recordList(record(attempt.controlled_apply_contract).typed_blockers)[0]
    ?? recordList(record(record(attempt.transition_bridge_evidence).evidence).typed_blockers)[0]);
  return stringValue(blocker.blocker_family)
    ?? stringValue(blocker.blocker_kind)
    ?? stringValue(blocker.blocker_id)
    ?? stringValue(record(attempt.control_loop_summary).blocked_reason)
    ?? typedBlockerRefs(attempt)[0]
    ?? stringValue(attempt.blocked_reason);
}

function deliverableDelta(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  const progressLog = record(attempt.stage_progress_log);
  const userStageLog = record(progressLog.user_stage_log);
  const routeImpactDelta = routeImpact.deliverable_progress_delta;
  const userStageLogDelta = userStageLog.deliverable_progress_delta;
  const explicitDeltaSummary =
    stringValue(routeImpactDelta)
    ?? stringValue(userStageLogDelta);
  if (explicitDeltaSummary) {
    return explicitDeltaSummary;
  }
  for (const delta of [routeImpactDelta, userStageLogDelta]) {
    if (deltaCount(delta) > 0) {
      return deltaSummary(delta) ?? 'deliverable_delta_observed';
    }
  }
  const classification =
    stringValue(routeImpact.progress_delta_classification)
    ?? stringValue(userStageLog.progress_delta_classification);
  if (classification === 'deliverable_progress' || classification === 'mixed') {
    return `${classification}_classified`;
  }
  if (classification === 'typed_blocker'
    || classification === 'platform_repair'
    || classification === 'human_gate'
    || classification === 'stop_loss') {
    return deltaSummary(routeImpactDelta) ?? deltaSummary(userStageLogDelta) ?? 'none';
  }
  return (stringList(attempt.artifact_refs).length > 0 ? 'artifact_refs_observed' : null)
    ?? 'none';
}

function nextForcedDelta(input: {
  lastDeliverableDelta: string | null;
  ownerReceiptRefs: string[];
  terminal: boolean;
}) {
  if (input.terminal) {
    return 'terminal_blocker_requires_human_stop_or_owner_override';
  }
  if (input.ownerReceiptRefs.length > 0) {
    return 'domain_deliverable_delta_required';
  }
  if (!input.lastDeliverableDelta || input.lastDeliverableDelta === 'none') {
    return 'domain_deliverable_or_owner_receipt_delta_required';
  }
  return 'new_deliverable_delta_or_terminal_decision_required';
}

function compareByUpdatedAt(left: JsonRecord, right: JsonRecord) {
  const leftTime = Date.parse(stringValue(left.updated_at) ?? '') || 0;
  const rightTime = Date.parse(stringValue(right.updated_at) ?? '') || 0;
  return leftTime - rightTime;
}

export function buildFamilyStallLineage(attempts: JsonRecord[]) {
  const groups = attempts.reduce<Record<string, JsonRecord[]>>((acc, attempt) => {
    const family = blockerFamily(attempt);
    if (!family) {
      return acc;
    }
    acc[family] = [...(acc[family] ?? []), attempt];
    return acc;
  }, {});
  const lineages = Object.entries(groups)
    .filter(([, group]) => group.length > 1)
    .map(([family, group]) => {
      const sorted = [...group].sort(compareByUpdatedAt);
      const last = sorted.at(-1) ?? {};
      const ownerReceiptRefList = uniqueStrings(sorted.flatMap(ownerReceiptRefs));
      const terminal = sorted.some((attempt) =>
        booleanValue(record(attempt.route_impact).terminal)
        || stringValue(attempt.local_status) === 'dead_lettered'
      );
      const lastDeliverableDelta = deliverableDelta(last);
      return {
        blocker_family: family,
        attempt_refs: sorted.map(attemptRef).filter((ref): ref is string => Boolean(ref)),
        typed_blocker_refs: uniqueStrings(sorted.flatMap(typedBlockerRefs)),
        repeat_count: sorted.length,
        first_seen: stringValue(sorted[0]?.created_at) ?? stringValue(sorted[0]?.updated_at),
        last_seen: stringValue(last.updated_at) ?? stringValue(last.created_at),
        last_deliverable_delta: lastDeliverableDelta,
        next_forced_delta: nextForcedDelta({
          lastDeliverableDelta,
          ownerReceiptRefs: ownerReceiptRefList,
          terminal,
        }),
        escalation_owner:
          stringValue(record(last.route_impact).required_owner)
          ?? stringValue(last.next_owner)
          ?? stringValue(last.domain_id),
        terminal,
        owner_receipt_refs: ownerReceiptRefList,
      };
    });
  return {
    surface_kind: 'opl_family_stall_lineage',
    packet_version: 'family-stall-lineage.v1',
    projection_policy:
      'repeated_blocker_lineage_requires_next_forced_delta_without_claiming_domain_or_production_ready',
    lineages,
    summary: {
      lineage_count: lineages.length,
      repeated_lineage_count: lineages.filter((lineage) => numberValue(lineage.repeat_count) > 1).length,
      terminal_lineage_count: lineages.filter((lineage) => lineage.terminal).length,
    },
    authority_boundary: authorityBoundary(),
  };
}

function authorityBoundary() {
  return {
    opl: 'refs_only_context_and_stall_lineage_projection',
    domain: 'truth_quality_artifact_owner',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}
