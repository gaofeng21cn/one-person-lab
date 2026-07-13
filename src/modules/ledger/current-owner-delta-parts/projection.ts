import { cognitiveKernelBoundary } from '../../stagecraft/index.ts';
import { OBSERVABILITY_EVIDENCE_LEDGER_FIELD } from '../../../kernel/observability-projection-vocabulary.ts';
import {
  type JsonRecord,
  firstString,
  record,
  sanitizeIdPart,
  stringList,
  stringValue,
} from './values.ts';
import { guardedApplyAcceptedAnswerShapes } from './guarded-apply.ts';

export type CompactCurrentOwnerDeltaAction = JsonRecord | null;

export type CompactCurrentOwnerDeltaCountSummary = {
  open_safe_action_count: number;
  payload_required_count: number;
  payload_free_count: number;
  blocked_refs_only_count: number;
  evidence_envelope_open_count: number;
  evidence_envelope_blocked_count: number;
  domain_dispatch_workorder_count: number;
  stage_replay_missing_receipt_workorder_count: number;
};

export function falseFlags(input: JsonRecord = {}) {
  const boundary = record(input.authority_boundary);
  return {
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_authorize_quality_or_export: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
    ...Object.fromEntries(Object.entries(boundary).filter(([, value]) => value === false)),
  };
}

function primaryDomainCurrentWorkUnitOwnerAnswer(primaryItem: JsonRecord) {
  if (stringValue(primaryItem.source) !== 'domain_current_work_unit') {
    return {
      ref: null,
      kind: null,
    };
  }
  const envelope = record(primaryItem.current_execution_envelope);
  const typedBlocker = record(envelope.typed_blocker);
  const typedBlockerRef = firstString(
    typedBlocker.latest_owner_answer_ref,
    typedBlocker.typed_blocker_ref,
    typedBlocker.ref,
    typedBlocker.source_ref,
    envelope.latest_owner_answer_ref,
    envelope.typed_blocker_ref,
  );
  return {
    ref: typedBlockerRef,
    kind: typedBlockerRef ? 'typed_blocker' : null,
  };
}

function desiredDeltaKind(requiredDelta: string) {
  if (requiredDelta === 'no_opl_operator_actionable_delta_required') {
    return 'none';
  }
  if (requiredDelta.includes('typed_blocker')) {
    return requiredDelta.includes('receipt')
      ? 'owner_answer_or_typed_blocker'
      : 'typed_blocker';
  }
  if (requiredDelta.includes('receipt')) {
    return 'owner_answer';
  }
  if (requiredDelta.includes('artifact')) {
    return 'artifact_delta';
  }
  return 'owner_delta';
}

function ownerAnswerOrTypedBlockerRequired(input: {
  desiredDeltaKind: string;
  acceptedAnswerShape: string[];
}) {
  if (input.desiredDeltaKind === 'none') {
    return false;
  }
  return input.desiredDeltaKind === 'owner_answer_or_typed_blocker'
    || input.desiredDeltaKind === 'owner_answer'
    || input.desiredDeltaKind === 'typed_blocker'
    || input.acceptedAnswerShape.some((shape) =>
      shape.includes('receipt')
      || shape.includes('typed_blocker')
      || shape.includes('owner_chain')
      || shape.includes('no_regression')
    );
}

function stageRefFrom(action: CompactCurrentOwnerDeltaAction, ownerDeltaFirst: JsonRecord) {
  return stringValue(record(ownerDeltaFirst.primary_item).stage_id)
    ?? stringValue(record(ownerDeltaFirst.selected_safe_action).stage_id)
    ?? stringValue(action?.stage_id)
    ?? null;
}

function foldedOwnerDeltaRef(ownerDeltaFirst: JsonRecord, key: string) {
  return firstString(
    record(ownerDeltaFirst.primary_item)[key],
    record(ownerDeltaFirst.selected_safe_action)[key],
  );
}

function currentOwnerDeltaSourceFingerprint(input: {
  currentOwner: string;
  domain: string;
  stageRef: string | null;
  taskOrStudyRef: string | null;
  lineageRef: string | null;
  requiredDelta: string;
  acceptedReturnShapes: string[];
}) {
  return [
    'owner_delta_first',
    sanitizeIdPart(input.currentOwner),
    sanitizeIdPart(input.domain),
    input.stageRef ? sanitizeIdPart(input.stageRef) : 'no-stage',
    input.taskOrStudyRef ? sanitizeIdPart(input.taskOrStudyRef) : 'no-task',
    input.lineageRef ? sanitizeIdPart(input.lineageRef) : 'no-lineage',
    sanitizeIdPart(input.requiredDelta),
    sanitizeIdPart(input.acceptedReturnShapes.join('-or-')),
  ].join(':');
}

function ordinaryProgressSpinePolicy() {
  return {
    surface_kind: 'opl_ordinary_progress_spine_policy',
    spine_id: 'ordinary_progress_spine',
    default_planning_root: 'current_owner_delta',
    default_next_action_derives_from: 'current_owner_delta',
    default_next_action_must_not_derive_from: [
      'raw_worklist',
      'raw_evidence',
      OBSERVABILITY_EVIDENCE_LEDGER_FIELD,
      'provider_trace',
      'replay_packet',
      'typed_blocker_group',
      'private_residue_inventory',
      'audit_sidecar',
    ],
    required_operator_answers: [
      'current_owner',
      'desired_delta_description',
      'accepted_answer_shape',
      'hard_gate',
      'next_owner_or_stage',
    ],
    raw_worklist_can_generate_default_next_action: false,
    evidence_sidecar_can_generate_default_next_action: false,
  };
}

function progressDeltaReceiptPolicy() {
  return {
    surface_kind: 'opl_progress_delta_receipt_policy',
    receipt_id: 'progress_delta_receipt',
    schema_ref: 'contracts/opl-framework/progress-delta-receipt.schema.json',
    ordinary_receipt_kind: 'ProgressDeltaReceipt',
    ordinary_delta_classes: [
      'deliverable_progress_delta',
      'platform_repair_delta',
      'advisory_delta',
    ],
    non_closing_delta_classes: [
      'platform_repair_delta',
      'advisory_delta',
    ],
    typed_blocker_class: 'typed_blocker',
    human_gate_class: 'human_gate',
    required_refs: [
      'changed_surfaces',
      'produced_refs',
      'consumed_refs',
      'next_owner',
      'next_required_delta',
    ],
    authority_boundary: {
      can_authorize_stage_complete: false,
      can_authorize_publication_ready: false,
      can_authorize_package_ready: false,
      can_mutate_artifact_body: false,
      can_accept_or_reject_memory: false,
      can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      platform_repair_counts_as_deliverable_progress: false,
    },
    cannot_authorize: [
      'stage_complete',
      'publication_ready',
      'package_ready',
      'artifact_mutation',
      'memory_accept_reject',
      'production_ready',
      'owner_receipt_signature',
      'typed_blocker_creation',
    ],
    stage_transition_accepts_consumable_artifact_progress: true,
    quality_debt_transition_status: 'completed_with_quality_debt',
    owner_receipt_required_for_quality_or_ready_claim: true,
    hard_stop_requires_typed_blocker_or_human_gate: true,
  };
}

function artifactTierPolicy() {
  return {
    surface_kind: 'opl_artifact_tier_policy',
    policy_id: 'artifact_tier_policy',
    default_ordinary_tier: 'T0_progress_delta',
    tiers: {
      T0_progress_delta: {
        applies_to: [
          'ordinary_writing',
          'analysis_delta',
          'evidence_organization',
          'review_revision',
          'platform_repair',
        ],
        requires: ['ProgressDeltaReceipt', 'changed_surfaces', 'minimal_refs', 'next_owner_or_blocker'],
        cannot_claim_stage_complete: true,
        cannot_claim_publication_or_package_ready: true,
      },
      T1_stage_transition: {
        requires: [
          'stage_manifest',
          'consumable_role_artifact',
          'ProgressDeltaReceipt_or_OwnerReceipt_or_TypedHardBlocker',
          'current_pointer_or_StageRun_binding',
        ],
        cannot_claim_domain_or_production_ready: true,
      },
      T2_delivery_artifact: {
        requires: ['package_manifest', 'authority_receipt', 'independent_review_or_human_gate', 'restore_or_retention_refs'],
      },
      T3_production_evidence: {
        requires: ['refs_only_ledger', 'operator_evidence', 'owner_acceptance', 'no_regression_refs'],
        enters_ordinary_next_action_only_when_current_owner_delta_requires_it: true,
      },
    },
  };
}

function auditSidecarPolicy(input: {
  auditRefs: JsonRecord;
  countSummary: CompactCurrentOwnerDeltaCountSummary;
  compactAction: CompactCurrentOwnerDeltaAction;
}) {
  return {
    surface_kind: 'opl_audit_sidecar_policy',
    sidecar_id: 'audit_sidecar_policy',
    role: ['passive_', OBSERVABILITY_EVIDENCE_LEDGER_FIELD, '_and_drilldown'].join(''),
    default_planning_role: 'never_default_planning_root_until_folded_into_current_owner_delta',
    raw_worklist_can_generate_default_next_action: false,
    raw_evidence_can_generate_default_next_action: false,
    evidence_ledger_can_generate_default_next_action: false,
    provider_trace_can_generate_default_next_action: false,
    replay_packet_can_generate_default_next_action: false,
    typed_blocker_group_can_generate_default_next_action: false,
    private_residue_inventory_can_generate_default_next_action: false,
    blocked_refs_only_can_generate_default_next_action: false,
    audit_next_safe_action_can_generate_default_next_action: false,
    hard_gate_upgrade_conditions: [
      'invalid_owner_scope_executor_or_authority_boundary',
      'forbidden_write_guard_missing',
      'accepted_answer_shape_invalid_or_unbound',
      'domain_truth_artifact_memory_package_submission_release_or_delete_write',
      'publication_export_release_production_ready_or_l5_claim',
      'human_safety_or_compliance_gate_open',
      'current_pointer_manifest_hash_or_restore_proof_unrecoverable',
    ],
    audit_refs: input.auditRefs,
    audit_counts: input.countSummary,
    audit_next_safe_action_or_none: input.compactAction,
  };
}

export function buildDefaultNextActionFromCurrentOwnerDelta(
  currentOwnerDelta: unknown,
): JsonRecord | null {
  const delta = record(currentOwnerDelta);
  if (Object.keys(delta).length === 0) {
    return null;
  }
  const hardGate = record(delta.hard_gate);
  const desiredDeltaKindValue = stringValue(delta.desired_delta_kind) ?? 'none';
  const hardGateState = stringValue(hardGate.state) ?? 'none';
  if (desiredDeltaKindValue === 'none' && hardGateState === 'none') {
    return null;
  }
  const acceptedAnswerShape = guardedApplyAcceptedAnswerShapes({
    stageId: firstString(delta.stage_id, delta.stage_ref),
    desiredDelta: firstString(delta.payload_requirement, delta.desired_delta_description),
    shapes: stringList(delta.accepted_answer_shape),
  });
  const deltaId = stringValue(delta.delta_id) ?? 'current-owner-delta';
  const owner = stringValue(delta.current_owner) ?? 'one-person-lab';
  const providerLivenessRequired = hardGate.provider_liveness_required === true;
  if (hardGateState === 'domain_owner_answer_recorded') {
    return null;
  }
  const ownerAnswerRequired = ownerAnswerOrTypedBlockerRequired({
    desiredDeltaKind: desiredDeltaKindValue,
    acceptedAnswerShape,
  });
  const humanOrDomainOwnerRequired = providerLivenessRequired
    ? false
    : hardGate.human_or_domain_owner_required === true || ownerAnswerRequired;
  const actionKind = providerLivenessRequired
    ? 'provider_hard_gate_required'
    : humanOrDomainOwnerRequired
      ? 'current_owner_delta_owner_answer_or_typed_blocker_required'
      : 'current_owner_delta_followthrough_required';
  return {
    surface_kind: 'opl_current_owner_delta_default_next_action',
    schema_version: 'current-owner-delta-default-next-action.v1',
    action_id: `${deltaId}:default-next-action`,
    action_kind: actionKind,
    step_kind: actionKind,
    derivation_source: 'current_owner_delta',
    default_planning_root: 'current_owner_delta',
    delta_id: deltaId,
    owner,
    current_owner: owner,
    domain_id: firstString(delta.domain_id, delta.domain),
    stage_id: firstString(delta.stage_id, delta.stage_ref),
    desired_delta_kind: desiredDeltaKindValue,
    payload_requirement:
      firstString(delta.payload_requirement, delta.desired_delta_description)
      ?? 'owner_delta_followthrough_required',
    required_return_shapes: acceptedAnswerShape,
    accepted_answer_shape: acceptedAnswerShape,
    missing_input_refs: stringList(delta.missing_input_refs),
    required_ref_shape: record(delta.required_ref_shape),
    hard_gate: {
      state: hardGateState,
      provider_liveness_required: providerLivenessRequired,
      human_or_domain_owner_required: humanOrDomainOwnerRequired,
      source: stringValue(hardGate.source) ?? 'owner_delta_controller',
    },
    next_safe_action_ref: `current_owner_delta:${deltaId}`,
    current_owner_delta_ref: '/current_owner_delta',
    audit_refs: record(delta.audit_refs),
    can_submit_to_safe_action_shell: false,
    route_requires_opl_runtime_refs: providerLivenessRequired,
    route_requires_domain_or_app_payload: humanOrDomainOwnerRequired,
    can_close_without_domain_or_app_payload: !humanOrDomainOwnerRequired,
    authority: 'owner_delta_default_projection_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    worklist_item_is_completion_claim: false,
    raw_worklist_can_drive_default_planning: false,
    raw_evidence_can_drive_default_planning: false,
    replay_packet_can_drive_default_planning: false,
    typed_blocker_group_can_drive_default_planning: false,
    private_residue_inventory_can_drive_default_planning: false,
    audit_tail_can_drive_default_planning: false,
  };
}

export function buildCurrentOwnerDeltaProjection(input: {
  currentOwner: string;
  requiredDelta: string;
  acceptedReturnShapes: string[];
  ownerDeltaFirst: JsonRecord;
  handoff: JsonRecord;
  compactAction: CompactCurrentOwnerDeltaAction;
  countSummary: CompactCurrentOwnerDeltaCountSummary;
  fullDetailRefs: JsonRecord;
}) {
  const currentOwner = input.currentOwner;
  const requiredDelta = input.requiredDelta;
  const domain = stringValue(input.handoff.domain_id)
    ?? stringValue(input.ownerDeltaFirst.domain_id)
    ?? foldedOwnerDeltaRef(input.ownerDeltaFirst, 'domain_id')
    ?? currentOwner;
  const stageRef = stageRefFrom(input.compactAction, input.ownerDeltaFirst);
  const acceptedReturnShapes = guardedApplyAcceptedAnswerShapes({
    stageId: stageRef,
    desiredDelta: requiredDelta,
    shapes: input.acceptedReturnShapes,
  });
  const primaryItem = record(input.ownerDeltaFirst.primary_item);
  const currentnessBasis = record(primaryItem.currentness_basis);
  const workUnitId = stringValue(primaryItem.work_unit_id);
  const workUnitFingerprint = stringValue(primaryItem.work_unit_fingerprint);
  const studyId = stringValue(primaryItem.study_id);
  const primaryStageAttemptId = firstString(
    primaryItem.stage_attempt_id,
    currentnessBasis.stage_attempt_id,
  );
  const taskOrStudyRef = firstString(
    stringValue(input.compactAction?.next_safe_action_ref),
    studyId,
    workUnitId,
    stringValue(primaryItem.workstream_id),
    primaryStageAttemptId,
  );
  const lineageRef = firstString(
    primaryStageAttemptId,
    workUnitFingerprint,
    workUnitId,
    stringValue(input.compactAction?.next_safe_action_ref),
    stringValue(input.handoff.lineage_ref),
  );
  const auditRefs = {
    ...input.fullDetailRefs,
    owner_delta_first_ref:
      stringValue(input.fullDetailRefs.owner_delta_first_ref)
      ?? '/framework_readiness/owner_delta_first',
    audit_next_safe_action_ref: stringValue(input.compactAction?.next_safe_action_ref),
  };
  const selectedActionRequiresDomainOrAppPayload =
    input.compactAction?.route_requires_domain_or_app_payload === true;
  const explicitOwnerDeltaOpen = requiredDelta !== 'no_opl_operator_actionable_delta_required';
  const blockedRefsOnly = input.countSummary.blocked_refs_only_count > 0;
  const auditSidecar = auditSidecarPolicy({
    auditRefs,
    countSummary: input.countSummary,
    compactAction: input.compactAction,
  });
  const primaryOwnerAnswer = primaryDomainCurrentWorkUnitOwnerAnswer(primaryItem);
  const latestOwnerAnswerRef = firstString(
    stringValue(input.handoff.latest_owner_answer_ref),
    stringValue(primaryItem.latest_owner_answer_ref),
    primaryOwnerAnswer.ref,
  );
  const latestOwnerAnswerKind = firstString(
    stringValue(input.handoff.latest_owner_answer_kind),
    stringValue(primaryItem.latest_owner_answer_kind),
    primaryOwnerAnswer.kind,
  );
  const ownerAnswerRecorded = latestOwnerAnswerRef !== null;
  const ownerAnswerRequired = ownerAnswerOrTypedBlockerRequired({
    desiredDeltaKind: desiredDeltaKind(requiredDelta),
    acceptedAnswerShape: acceptedReturnShapes,
  });
  const hardGate = {
    state:
      ownerAnswerRecorded
        ? 'domain_owner_answer_recorded'
        : explicitOwnerDeltaOpen
        ? 'owner_delta_open'
        : 'none',
    provider_liveness_required: false,
    human_or_domain_owner_required:
      ownerAnswerRecorded
        ? false
        : selectedActionRequiresDomainOrAppPayload
        || ownerAnswerRequired
        || (explicitOwnerDeltaOpen && input.countSummary.payload_required_count > 0),
    source: 'owner_delta_controller',
    owner_answer_ref: latestOwnerAnswerRef,
    owner_answer_kind: latestOwnerAnswerKind,
    domain_ready_authorized: false,
    quality_or_export_authorized: false,
    audit_sidecar_blocked_refs_only_count: blockedRefsOnly
      ? input.countSummary.blocked_refs_only_count
      : 0,
    audit_sidecar_hard_gate_upgrade_required: false,
  };

  return {
    surface_kind: 'opl_current_owner_delta',
    schema_version: 'current-owner-delta.v1',
    projection_policy: 'default_owner_delta_root_audit_tail_passive',
    default_planning_root: 'current_owner_delta',
    ordinary_progress_spine: ordinaryProgressSpinePolicy(),
    progress_delta_receipt: progressDeltaReceiptPolicy(),
    artifact_tier_policy: artifactTierPolicy(),
    audit_sidecar_policy: auditSidecar,
    audit_tail_policy:
      'raw_worklist_raw_evidence_replay_typed_blocker_group_private_residue_are_passive_until_folded',
    evidence_ledger_policy: 'record_everything_plan_from_nothing',
    delta_id: [
      'current-owner-delta',
      sanitizeIdPart(domain),
      stageRef ? sanitizeIdPart(stageRef) : 'no-stage',
      sanitizeIdPart(desiredDeltaKind(requiredDelta)),
    ].join(':'),
    domain,
    domain_id: domain,
    task_or_study_ref: taskOrStudyRef,
    study_id: studyId,
    stage_ref: stageRef,
    stage_id: stageRef,
    lineage_ref: lineageRef,
    stage_attempt_id: primaryStageAttemptId,
    work_unit_id: workUnitId,
    work_unit_fingerprint: workUnitFingerprint,
    action_type: stringValue(primaryItem.action_type),
    owner_route_currentness_basis: {
      ...currentnessBasis,
      work_unit_id: firstString(currentnessBasis.work_unit_id, workUnitId),
      work_unit_fingerprint: firstString(
        currentnessBasis.work_unit_fingerprint,
        workUnitFingerprint,
      ),
    },
    source_fingerprint: currentOwnerDeltaSourceFingerprint({
      currentOwner,
      domain,
      stageRef,
      taskOrStudyRef,
      lineageRef,
      requiredDelta,
      acceptedReturnShapes,
    }),
    desired_delta_kind: desiredDeltaKind(requiredDelta),
    desired_delta_description: requiredDelta,
    payload_requirement: requiredDelta,
    current_owner: currentOwner,
    owner: currentOwner,
    accepted_answer_shape: acceptedReturnShapes,
    required_return_shapes: acceptedReturnShapes,
    hard_gate: hardGate,
    advisory_warnings: [
      ...(input.countSummary.domain_dispatch_workorder_count > 0
        ? [{
            warning_id: 'domain_dispatch_workorders_are_audit_tail',
            count: input.countSummary.domain_dispatch_workorder_count,
            default_planning_role: 'audit_metric_only',
          }]
        : []),
      ...(input.countSummary.stage_replay_missing_receipt_workorder_count > 0
        ? [{
            warning_id: 'stage_replay_missing_receipts_are_audit_tail',
            count: input.countSummary.stage_replay_missing_receipt_workorder_count,
            default_planning_role: 'audit_metric_only',
          }]
        : []),
    ],
    live_attempt_ref: stringValue(input.compactAction?.next_safe_action_ref),
    latest_owner_answer_ref: latestOwnerAnswerRef,
    latest_owner_answer_kind: latestOwnerAnswerKind,
    cognitive_kernel_boundary: cognitiveKernelBoundary(),
    audit_refs: auditRefs,
    authority_boundary: {
      route_not_stage_strategy: true,
      route_reconciler_role: 'hydrate_reconcile_owner_routes_only',
      route_reconciler_can_generate_candidates: false,
      route_reconciler_can_evaluate_or_rank_candidates: false,
      route_reconciler_can_complete_stage: false,
      route_reconciler_can_sign_receipts: false,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      raw_worklist_can_drive_default_planning: false,
      raw_evidence_can_drive_default_planning: false,
      replay_packet_can_drive_default_planning: false,
      typed_blocker_group_can_drive_default_planning: false,
      private_residue_inventory_can_drive_default_planning: false,
      audit_tail_can_drive_default_planning: false,
      evidence_ledger_event_is_progress_claim: false,
      blocked_refs_only_can_drive_default_planning: false,
    },
  };
}
