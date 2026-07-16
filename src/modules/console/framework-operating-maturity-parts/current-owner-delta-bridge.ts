import {
  domainOwnerPayloadSummaryTargetKey,
  listDomainOwnerPayloadSummaryReceipts,
} from '../../ledger/index.ts';
import {
  record,
  stringValue,
} from '../framework-readiness-values.ts';
import {
  stringListValue,
  unique,
} from './evidence-lanes.ts';

function ownerPayloadFieldForAnswerShape(shape: string) {
  const shapeToPayloadField: Record<string, string> = {
    domain_owner_receipt_ref: 'domain_owner_receipt_refs',
    domain_receipt_ref: 'domain_receipt_refs',
    quality_gate_receipt_ref: 'quality_or_export_receipt_refs',
    quality_or_export_receipt_ref: 'quality_or_export_receipt_refs',
    human_gate_ref: 'human_gate_refs',
    no_regression_ref: 'no_regression_evidence_refs',
    reviewer_receipt_ref: 'reviewer_receipt_refs',
    long_soak_ref: 'long_soak_refs',
    owner_chain_ref: 'owner_chain_refs',
    runtime_event_ref: 'runtime_event_refs',
    typed_blocker_ref: 'typed_blocker_refs',
  };
  return shapeToPayloadField[shape];
}

function ownerPayloadSummaryReceiptRefs(receipt: {
  receipt_ref: string;
  domain_owner_receipt_refs: string[];
  domain_receipt_refs: string[];
  no_regression_evidence_refs: string[];
  owner_chain_refs: string[];
  human_gate_refs: string[];
  quality_or_export_receipt_refs: string[];
  reviewer_receipt_refs: string[];
  long_soak_refs: string[];
  monitor_freshness_refs: string[];
  runtime_event_refs: string[];
  typed_blocker_refs: string[];
}) {
  return unique([
    receipt.receipt_ref,
    ...receipt.domain_owner_receipt_refs,
    ...receipt.domain_receipt_refs,
    ...receipt.no_regression_evidence_refs,
    ...receipt.owner_chain_refs,
    ...receipt.human_gate_refs,
    ...receipt.quality_or_export_receipt_refs,
    ...receipt.reviewer_receipt_refs,
    ...receipt.long_soak_refs,
    ...receipt.monitor_freshness_refs,
    ...receipt.runtime_event_refs,
    ...receipt.typed_blocker_refs,
  ]);
}

function domainKey(value: unknown) {
  const raw = typeof value === 'string' ? value : '';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    redcubeai: 'redcube',
  };
  return aliases[compact] ?? compact;
}

function currentOwnerPayloadTargetKey(input: {
  domainId: string | null;
  deltaId: string | null;
  taskOrStudyRef: string | null;
  lineageRef: string | null;
  sourceFingerprint: string | null;
}) {
  return [
    input.domainId,
    'current_owner_delta_bridge',
    'owner_payload_item',
    input.deltaId,
    input.taskOrStudyRef,
    input.lineageRef,
    input.sourceFingerprint,
  ].filter((entry): entry is string => Boolean(entry)).join('/');
}

function currentOwnerBindingValue(target: Record<string, unknown>, field: string) {
  if (field === 'current_owner_delta_id') {
    return stringValue(target.current_owner_delta_id) ?? stringValue(target.delta_id);
  }
  return stringValue(target[field]);
}

function currentOwnerPayloadBindingMismatches(
  receiptTarget: Record<string, unknown>,
  expected: Record<string, string | null>,
) {
  return Object.entries(expected)
    .filter(([, expectedValue]) => expectedValue !== null)
    .flatMap(([field, expectedValue]) => {
      const observed = currentOwnerBindingValue(receiptTarget, field);
      return observed === expectedValue ? [] : [field];
    });
}

export function currentOwnerDeltaBridge(appOperatorDrilldown: Record<string, unknown>) {
  const attentionFirstPayload = record(appOperatorDrilldown.attention_first_payload);
  const currentOwnerDelta = record(attentionFirstPayload.current_owner_delta);
  const currentOwnerDeltaReadModel = record(attentionFirstPayload.current_owner_delta_read_model);
  const nextSafeAction = record(currentOwnerDeltaReadModel.next_safe_action_or_none);
  const hardGate = record(currentOwnerDelta.hard_gate);
  const ownerAnswerRef =
    stringValue(currentOwnerDelta.latest_owner_answer_ref)
    ?? stringValue(hardGate.owner_answer_ref);
  const deltaId = stringValue(currentOwnerDelta.delta_id);
  const domainId = stringValue(currentOwnerDelta.domain_id);
  const stageId = stringValue(currentOwnerDelta.stage_id);
  const taskOrStudyRef = stringValue(currentOwnerDelta.task_or_study_ref);
  const lineageRef = stringValue(currentOwnerDelta.lineage_ref);
  const sourceFingerprint = stringValue(currentOwnerDelta.source_fingerprint);
  const acceptedAnswerShape = stringListValue(currentOwnerDelta.accepted_answer_shape);
  const acceptedSuccessAnswerShapes = acceptedAnswerShape.filter((shape) =>
    shape !== 'typed_blocker_ref'
  );
  const acceptedSuccessPayloadRefs = unique(
    acceptedSuccessAnswerShapes
      .map(ownerPayloadFieldForAnswerShape)
      .filter((entry): entry is string => Boolean(entry)),
  );
  const unsupportedSuccessAnswerShapes = acceptedSuccessAnswerShapes.filter((shape) =>
    ownerPayloadFieldForAnswerShape(shape) === undefined
  );
  const usesDomainOwnerPayloadSummary = acceptedSuccessPayloadRefs.length > 0;
  const recordCommand = usesDomainOwnerPayloadSummary
    ? 'opl runtime domain-owner-payload-summary record --target-identity <json> --payload <json>'
    : 'owner-native refs-only record command for current_owner_delta accepted answer shape';
  const verifyCommand = usesDomainOwnerPayloadSummary
    ? 'opl runtime domain-owner-payload-summary verify --receipt-ref <receipt-ref>'
    : 'owner-native verify command for current_owner_delta owner answer ref';
  const targetIdentity = {
    domain_id: domainId,
    current_owner: stringValue(currentOwnerDelta.current_owner),
    stage_id: stageId,
    task_or_study_ref: taskOrStudyRef,
    lineage_ref: lineageRef,
    current_owner_delta_id: deltaId,
    source_fingerprint: sourceFingerprint,
  };
  const recordTargetKey = currentOwnerPayloadTargetKey({
    domainId,
    deltaId,
    taskOrStudyRef,
    lineageRef,
    sourceFingerprint,
  });
  const recordTargetIdentityTemplate = {
    target_key: recordTargetKey,
    domain_id: domainId,
    current_owner: stringValue(currentOwnerDelta.current_owner),
    source_surface: 'current_owner_delta_bridge',
    summary_kind: 'owner_payload_item',
    item_id: deltaId ?? stageId ?? 'current-owner-delta',
    stage_id: stageId,
    task_or_study_ref: taskOrStudyRef,
    lineage_ref: lineageRef,
    current_owner_delta_id: deltaId,
    source_fingerprint: sourceFingerprint,
    payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    current_owner_delta_ref:
      '/framework_readiness/attention_first_payload/current_owner_delta',
  };
  const currentOwnerBindingExpected = {
    current_owner_delta_id: deltaId,
    stage_id: stageId,
    task_or_study_ref: taskOrStudyRef,
    lineage_ref: lineageRef,
    source_fingerprint: sourceFingerprint,
  };
  const ownerPayloadSummaryCandidateReceipts = listDomainOwnerPayloadSummaryReceipts()
    .filter((receipt) => {
      const receiptTarget = record(receipt.target_identity);
      const receiptDomain =
        stringValue(receiptTarget.domain_id)
        ?? stringValue(receiptTarget.target_domain_id)
        ?? stringValue(receiptTarget.project);
      if (domainKey(receiptDomain) !== domainKey(domainId)) {
        return false;
      }
      const candidateKeys = unique([
        domainOwnerPayloadSummaryTargetKey(receiptTarget),
        stringValue(receiptTarget.target_key) ?? '',
        stringValue(receiptTarget.current_owner_delta_id) ?? '',
        stringValue(receiptTarget.delta_id) ?? '',
        stringValue(receiptTarget.item_id) ?? '',
      ]);
      return candidateKeys.includes(deltaId ?? '')
        || candidateKeys.includes(recordTargetKey);
    });
  const matchingOwnerPayloadSummaryReceipts = ownerPayloadSummaryCandidateReceipts
    .filter((receipt) =>
      currentOwnerPayloadBindingMismatches(
        record(receipt.target_identity),
        currentOwnerBindingExpected,
      ).length === 0
    );
  const staleOwnerPayloadSummaryReceipts = ownerPayloadSummaryCandidateReceipts
    .filter((receipt) =>
      currentOwnerPayloadBindingMismatches(
        record(receipt.target_identity),
        currentOwnerBindingExpected,
      ).length > 0
    );
  const observedOwnerPayloadSummaryReceiptRefs =
    matchingOwnerPayloadSummaryReceipts.map((receipt) => receipt.receipt_ref);
  const staleOwnerPayloadSummaryReceiptRefs =
    staleOwnerPayloadSummaryReceipts.map((receipt) => receipt.receipt_ref);
  const verifiedOwnerPayloadSummaryReceiptRefs = matchingOwnerPayloadSummaryReceipts
    .filter((receipt) => receipt.receipt_status === 'verified')
    .map((receipt) => receipt.receipt_ref);
  const observedOwnerAnswerRefs = unique(
    matchingOwnerPayloadSummaryReceipts.flatMap(ownerPayloadSummaryReceiptRefs),
  );
  const observedOwnerAnswerShapes = unique(
    matchingOwnerPayloadSummaryReceipts.flatMap((receipt) => [
      receipt.domain_owner_receipt_refs.length > 0 ? 'domain_owner_receipt_ref' : '',
      receipt.domain_receipt_refs.length > 0 ? 'domain_receipt_ref' : '',
      receipt.no_regression_evidence_refs.length > 0 ? 'no_regression_ref' : '',
      receipt.owner_chain_refs.length > 0 ? 'owner_chain_ref' : '',
      receipt.human_gate_refs.length > 0 ? 'human_gate_ref' : '',
      receipt.quality_or_export_receipt_refs.length > 0 ? 'quality_or_export_receipt_ref' : '',
      receipt.reviewer_receipt_refs.length > 0 ? 'reviewer_receipt_ref' : '',
      receipt.long_soak_refs.length > 0 ? 'long_soak_ref' : '',
      receipt.monitor_freshness_refs.length > 0 ? 'monitor_freshness_ref' : '',
      receipt.runtime_event_refs.length > 0 ? 'runtime_event_ref' : '',
      receipt.typed_blocker_refs.length > 0 ? 'typed_blocker_ref' : '',
    ]),
  );
  const ownerPayloadSummaryObserved = observedOwnerPayloadSummaryReceiptRefs.length > 0;
  const ownerAnswerMissing =
    ownerAnswerRef === null
    && acceptedAnswerShape.length > 0;
  const ownerAnswerStillRequired =
    ownerAnswerRef === null
    && hardGate.human_or_domain_owner_required === true;
  const ownerAnswerClosureStatus = ownerAnswerMissing || ownerAnswerStillRequired
    ? ownerPayloadSummaryObserved
      ? 'owner_payload_summary_observed_not_current_pointer_claim'
      : 'domain_owner_payload_required'
    : 'owner_answer_ref_observed_not_ready_claim';

  return {
    surface_kind: 'opl_operating_maturity_current_owner_delta_bridge',
    source_command: 'opl framework readiness --family-defaults --json',
    source_read_model_ref:
      '/framework_readiness/attention_first_payload/current_owner_delta',
    delta_id: deltaId,
    default_planning_root:
      stringValue(currentOwnerDelta.default_planning_root) ?? 'current_owner_delta',
    current_owner: stringValue(currentOwnerDelta.current_owner),
    domain_id: domainId,
    stage_id: stageId,
    task_or_study_ref: taskOrStudyRef,
    lineage_ref: lineageRef,
    source_fingerprint: sourceFingerprint,
    desired_delta_kind: stringValue(currentOwnerDelta.desired_delta_kind),
    desired_delta_description:
      stringValue(currentOwnerDelta.desired_delta_description),
    payload_requirement: stringValue(currentOwnerDelta.payload_requirement),
    accepted_answer_shape: acceptedAnswerShape,
    required_return_shapes: stringListValue(currentOwnerDelta.required_return_shapes),
    missing_input_refs: stringListValue(currentOwnerDelta.missing_input_refs),
    required_ref_shape: record(currentOwnerDelta.required_ref_shape),
    hard_gate: {
      state: stringValue(hardGate.state),
      human_or_domain_owner_required:
        hardGate.human_or_domain_owner_required === true,
      provider_liveness_required:
        hardGate.provider_liveness_required === true,
      owner_answer_ref: ownerAnswerRef,
      owner_answer_kind:
        stringValue(currentOwnerDelta.latest_owner_answer_kind)
        ?? stringValue(hardGate.owner_answer_kind),
      domain_ready_authorized: hardGate.domain_ready_authorized === true,
      quality_or_export_authorized: hardGate.quality_or_export_authorized === true,
      audit_sidecar_hard_gate_upgrade_required:
        hardGate.audit_sidecar_hard_gate_upgrade_required === true,
    },
    latest_owner_answer_ref: ownerAnswerRef ?? observedOwnerAnswerRefs[0] ?? null,
    latest_owner_answer_kind:
      stringValue(currentOwnerDelta.latest_owner_answer_kind)
      ?? observedOwnerAnswerShapes[0],
    readiness_current_pointer_owner_answer_ref: ownerAnswerRef,
    observed_owner_payload_summary_receipt_refs: observedOwnerPayloadSummaryReceiptRefs,
    verified_owner_payload_summary_receipt_refs: verifiedOwnerPayloadSummaryReceiptRefs,
    stale_owner_payload_summary_receipt_refs: staleOwnerPayloadSummaryReceiptRefs,
    observed_owner_answer_refs: observedOwnerAnswerRefs,
    observed_owner_answer_ref_shapes: observedOwnerAnswerShapes,
    owner_payload_summary_observed: ownerPayloadSummaryObserved,
    owner_payload_summary_verified:
      verifiedOwnerPayloadSummaryReceiptRefs.length > 0,
    owner_payload_summary_closure_state: verifiedOwnerPayloadSummaryReceiptRefs.length > 0
      ? 'verified_owner_payload_summary_observed_not_current_pointer_claim'
      : ownerPayloadSummaryObserved
        ? 'recorded_owner_payload_summary_observed_verify_pending'
        : 'owner_payload_summary_required',
    next_safe_action_or_none: Object.keys(nextSafeAction).length > 0
      ? nextSafeAction
      : null,
    owner_answer_missing: ownerAnswerMissing,
    owner_answer_still_required: ownerAnswerStillRequired,
    owner_answer_closure_handoff: {
      surface_kind: 'opl_current_owner_delta_owner_answer_closure_handoff',
      status: ownerAnswerClosureStatus,
      route_kind: usesDomainOwnerPayloadSummary
        ? 'refs_only_domain_owner_payload_summary'
        : 'owner_native_refs_only_payload',
      target_identity: targetIdentity,
      observed_owner_payload_summary_receipt_refs: observedOwnerPayloadSummaryReceiptRefs,
      verified_owner_payload_summary_receipt_refs: verifiedOwnerPayloadSummaryReceiptRefs,
      stale_owner_payload_summary_receipt_refs: staleOwnerPayloadSummaryReceiptRefs,
      observed_owner_answer_refs: observedOwnerAnswerRefs,
      observed_owner_answer_ref_shapes: observedOwnerAnswerShapes,
      current_pointer_update_still_required:
        ownerAnswerRef === null && ownerPayloadSummaryObserved,
      missing_binding_checklist: [
        'domain_id_matches_current_owner_delta',
        'current_owner_matches_current_owner_delta',
        'stage_or_work_unit_matches_current_owner_delta',
        'source_fingerprint_matches_current_owner_delta',
        'transport_identity_conflict_absent',
        'idempotency_key_matches_owner_work_unit_or_stage_run',
      ],
      accepted_return_shape: {
        success_refs_path: {
          accepted_answer_shapes: acceptedSuccessAnswerShapes,
          required_any_payload_refs: acceptedSuccessPayloadRefs,
          unsupported_by_domain_owner_payload_summary: unsupportedSuccessAnswerShapes,
          typed_blocker_refs_must_be_absent: true,
          closes_domain_ready: false,
          can_claim_production_ready: false,
        },
        typed_blocker_path: {
          accepted_answer_shapes: ['typed_blocker_ref'],
          required_payload_refs: ['typed_blocker_refs'],
          success_claimed: false,
          closes_domain_ready: false,
          can_claim_production_ready: false,
        },
      },
      record_command: recordCommand,
      verify_command: verifyCommand,
      record_target_identity_template: recordTargetIdentityTemplate,
      success_refs_payload_template: {
        domain_owner_receipt_refs: ['<domain-owned-owner-receipt-ref>'],
        quality_or_export_receipt_refs: ['<domain-owned-quality-or-export-receipt-ref>'],
        human_gate_refs: ['<human-gate-ref>'],
        no_regression_evidence_refs: ['<no-regression-ref>'],
        long_soak_refs: ['<long-soak-ref>'],
      },
      typed_blocker_payload_template: {
        typed_blocker_refs: ['<domain-owned-typed-blocker-ref>'],
      },
      non_closing_inputs: [
        'docs_foldback',
        'conformance_pass',
        'provider_completion',
        'verified_refs_only_ledger_without_current_owner_delta_binding',
        'stale_attempt_owner_answer_ref',
      ],
      ready_claim_authorized: false,
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
        handoff_is_payload_route_only: true,
      },
    },
    evidence_lanes_are_audit_sidecar: true,
    evidence_lanes_can_generate_default_next_action: false,
    required_owner_answer_shapes:
      acceptedAnswerShape,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_l5: false,
      can_claim_production_ready: false,
      bridge_is_projection_only: true,
    },
  };
}
