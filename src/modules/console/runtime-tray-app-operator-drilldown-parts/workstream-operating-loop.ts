import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  record,
  recordList,
  refsFromRecord,
  stringList,
  stringValue,
  uniqueStrings,
} from './value-utils.ts';

const CODEX_MAXXING_SOURCE_REF = 'https://jxnl.co/writing/2026/05/10/codex-maxxing/';

function falseAuthorityFlags() {
  return {
    can_read_artifact_body: false,
    can_read_memory_body: false,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_mutate_artifact_body: false,
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_quality_verdict: false,
    can_claim_production_ready: false,
  };
}

function taskKey(attempt: JsonRecord) {
  return stringValue(attempt.task_id)
    ?? stringValue(attempt.stage_attempt_id)
    ?? stringValue(attempt.source_fingerprint)
    ?? 'unknown-task';
}

function workstreamId(attempt: JsonRecord) {
  return `${stringValue(attempt.domain_id) ?? 'domain'}:${taskKey(attempt)}`;
}

function progressClassification(progressLog: JsonRecord) {
  return stringValue(progressLog.progress_delta_classification)
    ?? stringValue(record(progressLog.user_stage_log).progress_delta_classification)
    ?? stringValue(record(progressLog.stage_log_summary).progress_delta_classification)
    ?? 'unknown';
}

function progressRefs(attempt: JsonRecord) {
  const progressLog = record(attempt.stage_progress_log);
  const deliverable = record(progressLog.deliverable_progress_delta);
  const platform = record(progressLog.platform_repair_delta);
  return {
    deliverableChangedSurfaces: uniqueStrings([
      ...stringList(deliverable.changed_stage_surfaces),
      ...stringList(record(progressLog.user_stage_log).changed_stage_surfaces),
      ...stringList(record(progressLog.stage_log_summary).changed_stage_surfaces),
    ]),
    platformChangedSurfaces: uniqueStrings([
      ...stringList(platform.changed_stage_surfaces),
      ...stringList(platform.changed_platform_surfaces),
    ]),
    deliverableArtifactRefs: uniqueStrings([
      ...stringList(deliverable.artifact_refs),
    ]),
  };
}

function routeImpactRefs(attempt: JsonRecord) {
  const routeImpact = record(attempt.route_impact);
  return {
    ownerReceiptRefs: refsFromRecord(routeImpact, [
      'owner_receipt_refs',
      'domain_receipt_refs',
      'owner_chain_refs',
    ]),
    typedBlockerRefs: refsFromRecord(routeImpact, [
      'typed_blocker_refs',
      'typed_blocker_closeout_refs',
    ]),
    qualityGateRefs: refsFromRecord(routeImpact, [
      'quality_refs',
      'readiness_refs',
      'publication_eval_refs',
      'review_receipt_refs',
      'quality_gate_receipt_ref',
      'quality_gate_receipt_refs',
      'gate_receipt_ref',
      'gate_receipt_refs',
      'publication_gate_receipt_ref',
      'publication_gate_receipt_refs',
    ]),
    packageRefs: refsFromRecord(routeImpact, ['package_refs']),
    exportRefs: refsFromRecord(routeImpact, ['export_refs']),
    memoryTraceRefs: refsFromRecord(routeImpact, [
      'memory_recall_trace_refs',
      'memory_retrieval_trace_refs',
    ]),
  };
}

function stageContractRefs(attempt: JsonRecord) {
  const stageContract = record(attempt.stage_contract);
  return {
    expectedDeliverableRefs: refsFromRecord(stageContract, [
      'expected_deliverable_refs',
      'deliverable_target_refs',
      'target_deliverable_refs',
    ]),
    expectedReceiptRefs: refsFromRecord(stageContract, [
      'expected_receipt_refs',
      'goal_oracle_refs',
      'owner_receipt_refs',
      'quality_gate_refs',
    ]),
  };
}

function attemptArtifactRefs(attempt: JsonRecord) {
  return refsFromRecord(attempt, [
    'artifact_refs',
    'package_refs',
    'export_refs',
  ]);
}

function attemptPackageLifecycleRefs(input: {
  attempt: JsonRecord;
  packageLifecycle: JsonRecord;
  attemptCount: number;
}) {
  const attemptLifecycle = record(input.attempt.package_export_lifecycle);
  const useGlobalLifecycleFallback =
    input.attemptCount === 1 && Object.keys(attemptLifecycle).length === 0;
  return {
    packageRefs: uniqueStrings([
      ...stringList(attemptLifecycle.package_refs),
      ...(useGlobalLifecycleFallback
        ? stringList(input.packageLifecycle.package_refs)
        : []),
    ]),
    exportRefs: uniqueStrings([
      ...stringList(attemptLifecycle.export_refs),
      ...(useGlobalLifecycleFallback
        ? stringList(input.packageLifecycle.export_refs)
        : []),
    ]),
  };
}

function artifactRefsForAttempt(artifactRefs: JsonRecord[], attempt: JsonRecord) {
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  const domainId = stringValue(attempt.domain_id);
  const stageId = stringValue(attempt.stage_id);
  return uniqueStrings(artifactRefs
    .filter((entry) => {
      const entryAttemptId = stringValue(entry.stage_attempt_id);
      const entryDomainId = stringValue(entry.domain_id);
      const entryStageId = stringValue(entry.stage_id);
      return (stageAttemptId && entryAttemptId === stageAttemptId)
        || (domainId && stageId && entryDomainId === domainId && entryStageId === stageId);
    })
    .map((entry) => stringValue(entry.ref))
    .filter((entry): entry is string => Boolean(entry)));
}

function refsFromSources(sources: JsonRecord[], keys: string[]) {
  return uniqueStrings(sources.flatMap((source) =>
    keys.flatMap((key) => refsFromValue(source[key]))
  ));
}

function refsFromValue(value: unknown): string[] {
  if (typeof value === 'string') {
    const ref = stringValue(value);
    return ref ? [ref] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(refsFromValue);
  }
  const item = record(value);
  return uniqueStrings([
    stringValue(item.ref),
    stringValue(item.ref_id),
    stringValue(item.uri),
    stringValue(item.path),
    stringValue(item.id),
  ].filter((entry): entry is string => Boolean(entry)));
}

function stagePackRefs(attempt: JsonRecord) {
  return refsFromSources([
    attempt,
    record(attempt.workspace_locator),
    record(attempt.stage_progress_log).intended_work as JsonRecord,
    record(attempt.control_loop_summary).trigger as JsonRecord,
    record(attempt.attempt_launch_envelope),
  ].map(record), [
    'stage_pack_ref',
    'stage_pack_refs',
    'stage_packet_ref',
    'stage_packet_refs',
    'stage_manifest_ref',
    'stage_manifest_refs',
  ]);
}

function goalOracleRefs(input: {
  attempt: JsonRecord;
  routeRefs: ReturnType<typeof routeImpactRefs>;
}) {
  const stageContract = record(input.attempt.stage_contract);
  const currentOwnerDelta = record(input.attempt.current_owner_delta);
  const ownerAnswerBinding = record(currentOwnerDelta.owner_answer_binding_projection);
  const closeoutContract = record(input.attempt.closeout_refs_only_contract);
  return uniqueStrings([
    ...input.routeRefs.ownerReceiptRefs,
    ...input.routeRefs.qualityGateRefs,
    ...refsFromSources([
      input.attempt,
      record(input.attempt.route_impact),
      stageContract,
      currentOwnerDelta,
      ownerAnswerBinding,
      closeoutContract,
    ], [
      'goal_oracle_ref',
      'goal_oracle_refs',
      'expected_receipt_ref',
      'expected_receipt_refs',
      'owner_receipt_ref',
      'owner_receipt_refs',
      'owner_answer_ref',
      'owner_answer_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
      'quality_gate_ref',
      'quality_gate_refs',
      'gate_receipt_ref',
      'gate_receipt_refs',
      'review_receipt_ref',
      'review_receipt_refs',
    ]),
  ]);
}

function currentOwnerDeltaRefs(attempt: JsonRecord) {
  const currentOwnerDelta = record(attempt.current_owner_delta);
  return refsFromSources([
    currentOwnerDelta,
    record(currentOwnerDelta.audit_refs),
    record(currentOwnerDelta.hard_gate),
  ], [
    'current_owner_delta_ref',
    'delta_ref',
    'delta_id',
    'task_or_study_ref',
    'lineage_ref',
    'live_attempt_ref',
    'source_fingerprint',
  ]);
}

function deliverableTargetRefs(input: {
  attempt: JsonRecord;
  progress: ReturnType<typeof progressRefs>;
  artifactReviewRefs: string[];
  packageRefs: string[];
  exportRefs: string[];
}) {
  const stageContract = record(input.attempt.stage_contract);
  const currentOwnerDelta = record(input.attempt.current_owner_delta);
  const progressLog = record(input.attempt.stage_progress_log);
  const intendedWork = record(progressLog.intended_work);
  const deliverable = record(progressLog.deliverable_progress_delta);
  return uniqueStrings([
    ...input.artifactReviewRefs,
    ...input.packageRefs,
    ...input.exportRefs,
    ...refsFromSources([
      input.attempt,
      stageContract,
      currentOwnerDelta,
      progressLog,
      intendedWork,
      deliverable,
    ], [
      'deliverable_target_ref',
      'deliverable_target_refs',
      'expected_deliverable_ref',
      'expected_deliverable_refs',
      'artifact_scope_ref',
      'artifact_scope_refs',
      'artifact_ref',
      'artifact_refs',
      'package_ref',
      'package_refs',
      'export_ref',
      'export_refs',
      'target_artifact_ref',
      'target_artifact_refs',
      'lineage_ref',
      'lineage_refs',
    ]),
  ]);
}

function ownerHandoffPacketRefs(attempt: JsonRecord) {
  return refsFromSources([
    attempt,
    record(attempt.route_impact),
    record(attempt.current_owner_delta),
    record(attempt.owner_handoff_packet),
    record(attempt.control_loop_summary).decision as JsonRecord,
  ].map(record), [
    'owner_handoff_packet_ref',
    'owner_handoff_packet_refs',
    'owner_route_handoff_ref',
    'owner_route_handoff_refs',
    'handoff_ref',
    'handoff_refs',
  ]);
}

function targetAnchorRefs(input: {
  goalOracleRefs: string[];
  deliverableTargetRefs: string[];
  currentOwnerDeltaRefs: string[];
  ownerHandoffPacketRefs: string[];
  stagePackRefs: string[];
}) {
  return uniqueStrings([
    ...input.goalOracleRefs,
    ...input.deliverableTargetRefs,
    ...input.currentOwnerDeltaRefs,
    ...input.ownerHandoffPacketRefs,
    ...input.stagePackRefs,
  ]);
}

function missingGoalOracleSignal(input: {
  goalOracle: string;
  targetAnchorRefs: string[];
  typedBlockerRefs: string[];
}) {
  if (input.goalOracle === 'target_anchor_observed_owner_or_gate_needed') {
    return {
      signal_kind: 'bounded_goal_oracle_advisory',
      status: 'target_anchor_observed_completion_oracle_pending',
      missing_refs_any_of: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      target_anchor_refs: input.targetAnchorRefs,
      hard_gate: false,
      launch_gate: false,
      can_claim_domain_ready: false,
    };
  }
  if (input.goalOracle === 'missing') {
    return {
      signal_kind: 'typed_missing_goal_oracle_warning',
      status: 'goal_oracle_and_target_anchor_missing',
      missing_refs_any_of: [
        'goal_oracle_ref',
        'deliverable_target_ref',
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      target_anchor_refs: [],
      hard_gate: false,
      launch_gate: false,
      can_claim_domain_ready: false,
    };
  }
  if (input.goalOracle === 'blocked_by_domain_typed_blocker') {
    return {
      signal_kind: 'domain_typed_blocker_goal_oracle_signal',
      status: 'domain_typed_blocker_observed',
      typed_blocker_refs: input.typedBlockerRefs,
      hard_gate: false,
      launch_gate: false,
      can_claim_domain_ready: false,
    };
  }
  return null;
}

function goalOracleStatus(input: {
  ownerReceiptRefs: string[];
  qualityGateRefs: string[];
  typedBlockerRefs: string[];
  targetAnchorRefs: string[];
  progressClassification: string;
  deliverableChangedSurfaces: string[];
}) {
  if (input.ownerReceiptRefs.length > 0 || input.qualityGateRefs.length > 0) {
    return 'observed';
  }
  if (input.typedBlockerRefs.length > 0 && input.deliverableChangedSurfaces.length > 0) {
    return 'blocked_by_domain_typed_blocker';
  }
  if (input.targetAnchorRefs.length > 0) {
    return 'target_anchor_observed_owner_or_gate_needed';
  }
  if (
    input.progressClassification === 'deliverable_progress'
    && input.deliverableChangedSurfaces.length > 0
  ) {
    return 'needs_owner_receipt_or_quality_gate';
  }
  return 'missing';
}

function latestOwnerAnswer(input: {
  ownerReceiptRefs: string[];
  qualityGateRefs: string[];
  typedBlockerRefs: string[];
}) {
  const ownerReceiptRef = input.ownerReceiptRefs[0];
  if (ownerReceiptRef) {
    return { ref: ownerReceiptRef, kind: 'domain_owner_receipt' };
  }
  const qualityGateRef = input.qualityGateRefs[0];
  if (qualityGateRef) {
    return { ref: qualityGateRef, kind: 'quality_gate_receipt' };
  }
  const typedBlockerRef = input.typedBlockerRefs[0];
  if (typedBlockerRef) {
    return { ref: typedBlockerRef, kind: 'typed_blocker' };
  }
  return { ref: null, kind: null };
}

function heartbeatStatus(attempt: JsonRecord) {
  const status = stringValue(attempt.status)
    ?? stringValue(attempt.local_status)
    ?? stringValue(record(attempt.current_control_state).current_attempt_state);
  if (status === 'running' || status === 'checkpointed') {
    return status;
  }
  if (status === 'dead_lettered' || status === 'blocked') {
    return 'blocked';
  }
  if (status === 'completed' || status === 'succeeded') {
    return 'closed';
  }
  return status ?? 'unknown';
}

function nextSteeringAction(input: {
  goalOracle: string;
  artifactReviewRefs: string[];
  typedBlockerRefs: string[];
  targetAnchorRefs: string[];
  progressClassification: string;
}) {
  if (input.goalOracle === 'target_anchor_observed_owner_or_gate_needed') {
    return {
      action_id: 'record_owner_or_gate_for_target_anchor',
      action_kind: 'owner_steering_required',
      owner: 'domain_repository_or_app_live_operator',
      status: 'target_anchor_observed_completion_oracle_pending',
      required_next_refs_any_of: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      target_anchor_refs: input.targetAnchorRefs,
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    };
  }
  if (input.goalOracle === 'missing') {
    return {
      action_id: 'provide_goal_oracle_or_owner_receipt',
      action_kind: 'owner_steering_required',
      owner: 'domain_repository_or_app_live_operator',
      status: 'needs_goal_oracle_owner_receipt_or_typed_blocker',
      required_next_refs_any_of: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    };
  }
  if (input.artifactReviewRefs.length > 0 && input.progressClassification === 'deliverable_progress') {
    return {
      action_id: 'review_latest_artifact_delta',
      action_kind: 'artifact_first_review',
      owner: 'domain_repository_or_app_live_operator',
      status: 'artifact_delta_ready_for_owner_or_independent_gate_review',
      required_next_refs_any_of: [
        'artifact_review_ref',
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      artifact_review_refs: input.artifactReviewRefs,
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    };
  }
  if (input.typedBlockerRefs.length > 0) {
    return {
      action_id: 'route_back_domain_typed_blocker',
      action_kind: 'typed_blocker_followthrough',
      owner: 'domain_repository_or_app_live_operator',
      status: 'domain_typed_blocker_requires_owner_followthrough',
      typed_blocker_refs: input.typedBlockerRefs,
      required_next_refs_any_of: [
        'owner_followthrough_ref',
        'typed_blocker_closeout_ref',
      ],
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_claim_domain_ready: false,
    };
  }
  return {
    action_id: 'continue_workstream_observation',
    action_kind: 'operator_observation',
    owner: 'one-person-lab',
    status: 'wait_for_next_stage_closeout_or_owner_receipt',
    required_next_refs_any_of: [
      'stage_closeout_ref',
      'domain_owner_receipt_ref',
      'typed_blocker_ref',
    ],
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
  };
}

function operatingLoopStatus(input: {
  goalOracle: string;
  artifactReviewRefs: string[];
  progressClassification: string;
  typedBlockerRefs: string[];
}) {
  if (input.goalOracle === 'missing') {
    return 'needs_goal_oracle_or_owner_receipt';
  }
  if (input.goalOracle === 'target_anchor_observed_owner_or_gate_needed') {
    return 'needs_owner_oracle_for_target_anchor';
  }
  if (input.typedBlockerRefs.length > 0) {
    return 'blocked_by_domain_typed_blocker';
  }
  if (
    input.progressClassification === 'deliverable_progress'
    && input.artifactReviewRefs.length > 0
  ) {
    return 'artifact_review_ready';
  }
  if (input.progressClassification === 'platform_repair') {
    return 'platform_repair_only';
  }
  return 'observe_next_closeout';
}

export function buildWorkstreamOperatingLoop(input: {
  attempts: JsonRecord[];
  domainDispatchEvidence?: JsonRecord;
  artifactRefs: JsonRecord[];
  packageLifecycle: JsonRecord;
  memoryRefs: JsonRecord;
}) {
  const domainDispatchEvidenceByAttempt = new Map(
    recordList(input.domainDispatchEvidence?.attempts)
      .map((attempt) => [stringValue(attempt.stage_attempt_id), attempt])
      .filter((entry): entry is [string, JsonRecord] => Boolean(entry[0])),
  );
  const workstreams = input.attempts.map((attempt) => {
    const stageAttemptId = stringValue(attempt.stage_attempt_id);
    const domainDispatchAttempt = stageAttemptId
      ? domainDispatchEvidenceByAttempt.get(stageAttemptId) ?? {}
      : {};
    const progressLog = record(attempt.stage_progress_log);
    const progress = progressRefs(attempt);
    const routeRefs = routeImpactRefs(attempt);
    const packageLifecycleRefs = attemptPackageLifecycleRefs({
      attempt,
      packageLifecycle: input.packageLifecycle,
      attemptCount: input.attempts.length,
    });
    const artifactReviewRefs = uniqueStrings([
      ...artifactRefsForAttempt(input.artifactRefs, attempt),
      ...progress.deliverableArtifactRefs,
      ...attemptArtifactRefs(attempt),
    ]);
    const packageRefs = uniqueStrings([
      ...routeRefs.packageRefs,
      ...packageLifecycleRefs.packageRefs,
    ]);
    const exportRefs = uniqueStrings([
      ...routeRefs.exportRefs,
      ...packageLifecycleRefs.exportRefs,
    ]);
    const goalOracleAnchorRefs = goalOracleRefs({ attempt, routeRefs });
    const currentOwnerDeltaAnchors = currentOwnerDeltaRefs(attempt);
    const deliverableTargets = deliverableTargetRefs({
      attempt,
      progress,
      artifactReviewRefs,
      packageRefs,
      exportRefs,
    });
    const ownerHandoffRefs = ownerHandoffPacketRefs(attempt);
    const stagePacks = stagePackRefs(attempt);
    const targetAnchors = targetAnchorRefs({
      goalOracleRefs: goalOracleAnchorRefs,
      deliverableTargetRefs: deliverableTargets,
      currentOwnerDeltaRefs: currentOwnerDeltaAnchors,
      ownerHandoffPacketRefs: ownerHandoffRefs,
      stagePackRefs: stagePacks,
    });
    const memoryRefs = uniqueStrings([
      ...stringList(attempt.consumed_memory_refs),
      ...stringList(input.memoryRefs.consumed_memory_refs),
    ]);
    const memoryWritebackReceiptRefs = uniqueStrings([
      ...stringList(attempt.writeback_receipt_refs),
      ...stringList(input.memoryRefs.writeback_receipt_refs),
    ]);
    const classification = progressClassification(progressLog);
    const ownerAnswer = latestOwnerAnswer({
      ownerReceiptRefs: routeRefs.ownerReceiptRefs,
      qualityGateRefs: routeRefs.qualityGateRefs,
      typedBlockerRefs: routeRefs.typedBlockerRefs,
    });
    const goalOracle = goalOracleStatus({
      ownerReceiptRefs: routeRefs.ownerReceiptRefs,
      qualityGateRefs: routeRefs.qualityGateRefs,
      typedBlockerRefs: routeRefs.typedBlockerRefs,
      targetAnchorRefs: targetAnchors,
      progressClassification: classification,
      deliverableChangedSurfaces: progress.deliverableChangedSurfaces,
    });
    const nextAction = nextSteeringAction({
      goalOracle,
      artifactReviewRefs,
      typedBlockerRefs: routeRefs.typedBlockerRefs,
      targetAnchorRefs: targetAnchors,
      progressClassification: classification,
    });
    const goalOracleSignal = missingGoalOracleSignal({
      goalOracle,
      targetAnchorRefs: targetAnchors,
      typedBlockerRefs: routeRefs.typedBlockerRefs,
    });
    return {
      workstream_id: workstreamId(attempt),
      domain_id: stringValue(attempt.domain_id),
      task_id: taskKey(attempt),
      stage_id: stringValue(attempt.stage_id),
      stage_attempt_id: stageAttemptId,
      attempt_status: stringValue(attempt.status) ?? stringValue(attempt.local_status),
      local_status: stringValue(attempt.local_status) ?? stringValue(attempt.status),
      closeout_receipt_status: stringValue(attempt.closeout_receipt_status),
      source_fingerprint: stringValue(attempt.source_fingerprint),
      created_at: stringValue(attempt.created_at),
      updated_at: stringValue(attempt.updated_at),
      default_actionability_status:
        stringValue(domainDispatchAttempt.default_actionability_status),
      default_actionable: domainDispatchAttempt.default_actionable === true,
      default_actionability_blocker:
        stringValue(domainDispatchAttempt.default_actionability_blocker),
      superseded_by_stage_attempt_id:
        stringValue(domainDispatchAttempt.superseded_by_stage_attempt_id),
      superseded_reason: stringValue(domainDispatchAttempt.superseded_reason),
      dispatch_identity_key: stringValue(domainDispatchAttempt.dispatch_identity_key),
      dispatch_supersession_identity_key:
        stringValue(domainDispatchAttempt.dispatch_supersession_identity_key),
      operating_loop_status: operatingLoopStatus({
        goalOracle,
        artifactReviewRefs,
        progressClassification: classification,
        typedBlockerRefs: routeRefs.typedBlockerRefs,
      }),
      goal_oracle_status: goalOracle,
      goal_oracle_refs: goalOracleAnchorRefs,
      deliverable_target_refs: deliverableTargets,
      current_owner_delta_refs: currentOwnerDeltaAnchors,
      owner_handoff_packet_refs: ownerHandoffRefs,
      stage_pack_refs: stagePacks,
      target_anchor_refs: targetAnchors,
      ...(goalOracleSignal ? { missing_goal_oracle_signal: goalOracleSignal } : {}),
      heartbeat_status: heartbeatStatus(attempt),
      progress_classification: classification,
      deliverable_changed_surfaces: progress.deliverableChangedSurfaces,
      platform_changed_surfaces: progress.platformChangedSurfaces,
      artifact_review_refs: artifactReviewRefs,
      memory_refs: memoryRefs,
      memory_trace_refs: routeRefs.memoryTraceRefs,
      memory_writeback_receipt_refs: memoryWritebackReceiptRefs,
      owner_receipt_refs: routeRefs.ownerReceiptRefs,
      typed_blocker_refs: routeRefs.typedBlockerRefs,
      quality_gate_refs: routeRefs.qualityGateRefs,
      latest_owner_answer_ref: ownerAnswer.ref,
      latest_owner_answer_kind: ownerAnswer.kind,
      latest_owner_answer_is_domain_ready_verdict: false,
      package_refs: packageRefs,
      export_refs: exportRefs,
      next_steering_action: nextAction,
      source_refs: [
        `/stage_attempt_workbench/attempts/${stringValue(attempt.stage_attempt_id) ?? taskKey(attempt)}`,
        ...(Object.keys(progressLog).length > 0
          ? [`/stage_attempt_workbench/attempts/${stringValue(attempt.stage_attempt_id) ?? taskKey(attempt)}/stage_progress_log`]
          : []),
      ],
      false_authority_flags: falseAuthorityFlags(),
    };
  });
  const deliverableProgressWorkstreams = workstreams.filter((item) =>
    item.progress_classification === 'deliverable_progress'
  );
  const platformRepairOnlyWorkstreams = workstreams.filter((item) =>
    item.progress_classification === 'platform_repair'
      || (
        item.deliverable_changed_surfaces.length === 0
        && item.platform_changed_surfaces.length > 0
      )
  );
  return {
    surface_kind: 'opl_workstream_operating_loop_projection',
    projection_policy: 'refs_only_operator_steering_no_domain_truth_or_artifact_body',
    pattern_source_refs: [{
      ref: CODEX_MAXXING_SOURCE_REF,
      role: 'external_operating_loop_pattern_reference',
      adoption_boundary: 'pattern_only_not_runtime_or_authority_source',
    }],
    summary: {
      workstream_count: workstreams.length,
      artifact_first_review_available_count: workstreams.filter((item) =>
        item.operating_loop_status === 'artifact_review_ready'
      ).length,
      deliverable_progress_workstream_count: deliverableProgressWorkstreams.length,
      platform_repair_only_workstream_count: platformRepairOnlyWorkstreams.length,
      goal_oracle_missing_count: workstreams.filter((item) =>
        item.goal_oracle_status === 'missing'
      ).length,
      goal_oracle_target_anchor_observed_count: workstreams.filter((item) =>
        item.goal_oracle_status === 'target_anchor_observed_owner_or_gate_needed'
      ).length,
      deliverable_target_ref_observed_count: workstreams.filter((item) =>
        item.deliverable_target_refs.length > 0
      ).length,
      goal_oracle_advisory_count: workstreams.filter((item) =>
        record(item.missing_goal_oracle_signal).signal_kind === 'bounded_goal_oracle_advisory'
      ).length,
      typed_blocker_workstream_count: workstreams.filter((item) =>
        item.typed_blocker_refs.length > 0
      ).length,
      next_steering_action_count: workstreams.filter((item) =>
        item.next_steering_action.action_id !== 'continue_workstream_observation'
      ).length,
    },
    workstreams,
    authority_boundary: {
      ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
      operating_loop_is_operator_projection: true,
      pattern_source_is_not_runtime_authority: true,
    },
    false_authority_flags: falseAuthorityFlags(),
  };
}
