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
      ...stringList(deliverable.changed_paper_surfaces),
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
      'gate_receipt_refs',
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

function stagePackRefs(attempt: JsonRecord) {
  return uniqueStrings([
    ...stringList(attempt.stage_pack_refs),
    ...stringList(attempt.stage_pack_ref),
    ...stringList(record(attempt.workspace_locator).stage_pack_refs),
    ...stringList(record(attempt.workspace_locator).stage_packet_refs),
    stringValue(record(attempt.workspace_locator).stage_pack_ref),
    stringValue(record(attempt.workspace_locator).stage_packet_ref),
  ].filter((entry): entry is string => Boolean(entry)));
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

function goalOracleStatus(input: {
  ownerReceiptRefs: string[];
  qualityGateRefs: string[];
  typedBlockerRefs: string[];
  progressClassification: string;
  deliverableChangedSurfaces: string[];
  deliverableTargetRefs: string[];
  goalOracleRefs: string[];
}) {
  if (input.ownerReceiptRefs.length > 0 || input.qualityGateRefs.length > 0) {
    return 'observed';
  }
  if (input.typedBlockerRefs.length > 0 && input.deliverableChangedSurfaces.length > 0) {
    return 'blocked_by_domain_typed_blocker';
  }
  if (input.deliverableTargetRefs.length > 0 || input.goalOracleRefs.length > 0) {
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
  progressClassification: string;
}) {
  if (input.goalOracle === 'target_anchor_observed_owner_or_gate_needed') {
    return {
      action_id: 'record_owner_or_gate_for_target_anchor',
      action_kind: 'owner_steering_required',
      owner: 'domain_repository_or_app_live_operator',
      status: 'target_anchor_observed_owner_or_gate_needed',
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
  artifactRefs: JsonRecord[];
  packageLifecycle: JsonRecord;
  memoryRefs: JsonRecord;
}) {
  const workstreams = input.attempts.map((attempt) => {
    const progressLog = record(attempt.stage_progress_log);
    const progress = progressRefs(attempt);
    const routeRefs = routeImpactRefs(attempt);
    const contractRefs = stageContractRefs(attempt);
    const packRefs = stagePackRefs(attempt);
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
    const memoryRefs = uniqueStrings([
      ...stringList(attempt.consumed_memory_refs),
      ...stringList(input.memoryRefs.consumed_memory_refs),
    ]);
    const memoryWritebackReceiptRefs = uniqueStrings([
      ...stringList(attempt.writeback_receipt_refs),
      ...stringList(input.memoryRefs.writeback_receipt_refs),
    ]);
    const classification = progressClassification(progressLog);
    const goalOracle = goalOracleStatus({
      ownerReceiptRefs: routeRefs.ownerReceiptRefs,
      qualityGateRefs: routeRefs.qualityGateRefs,
      typedBlockerRefs: routeRefs.typedBlockerRefs,
      progressClassification: classification,
      deliverableChangedSurfaces: progress.deliverableChangedSurfaces,
      deliverableTargetRefs: contractRefs.expectedDeliverableRefs,
      goalOracleRefs: contractRefs.expectedReceiptRefs,
    });
    const nextAction = nextSteeringAction({
      goalOracle,
      artifactReviewRefs,
      typedBlockerRefs: routeRefs.typedBlockerRefs,
      progressClassification: classification,
    });
    return {
      workstream_id: workstreamId(attempt),
      domain_id: stringValue(attempt.domain_id),
      task_id: taskKey(attempt),
      stage_id: stringValue(attempt.stage_id),
      stage_attempt_id: stringValue(attempt.stage_attempt_id),
      operating_loop_status: operatingLoopStatus({
        goalOracle,
        artifactReviewRefs,
        progressClassification: classification,
        typedBlockerRefs: routeRefs.typedBlockerRefs,
      }),
      goal_oracle_status: goalOracle,
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
      goal_oracle_refs: contractRefs.expectedReceiptRefs,
      deliverable_target_refs: contractRefs.expectedDeliverableRefs,
      owner_handoff_packet_refs: stringList(attempt.owner_handoff_packet_refs),
      stage_pack_refs: packRefs,
      missing_goal_oracle_signal:
        goalOracle === 'target_anchor_observed_owner_or_gate_needed'
          ? {
              signal_kind: 'bounded_goal_oracle_advisory',
              hard_gate: false,
              target_anchor_observed: true,
              required_next_refs_any_of: [
                'domain_owner_receipt_ref',
                'quality_gate_receipt_ref',
                'typed_blocker_ref',
              ],
            }
          : null,
      package_refs: uniqueStrings([
        ...routeRefs.packageRefs,
        ...packageLifecycleRefs.packageRefs,
      ]),
      export_refs: uniqueStrings([
        ...routeRefs.exportRefs,
        ...packageLifecycleRefs.exportRefs,
      ]),
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
