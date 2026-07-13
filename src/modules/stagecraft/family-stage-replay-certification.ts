import type {
  FamilyStageProofBundle,
  FamilyStageProofBundleExpectedReceiptRef,
  FamilyStageProofBundleRuntimeEventRequirement,
} from './family-stage-proof-bundle.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';
import { OBSERVABILITY_ATTEMPT_LEDGER_LABEL } from '../../kernel/observability-projection-vocabulary.ts';

type JsonRecord = Record<string, unknown>;

export interface FamilyStageReplayEvidence {
  append_only_event_log_refs?: string[];
  attempt_ledger_refs?: string[];
  codex_attempt_trace_refs?: string[];
  stage_manifest_refs?: string[];
  current_pointer_refs?: string[];
  owner_answer_binding_refs?: string[];
  recorded_runtime_event_refs?: string[];
  closeout_receipt_refs?: string[];
  closeout_packet?: JsonRecord | null;
}

export interface FamilyStageReplayBlocker {
  blocker_kind: 'replay_certification_blocker';
  blocker_id:
    | 'stage_pack_not_conformant'
    | 'append_only_event_log_ref_missing'
    | 'attempt_ledger_ref_missing'
    | 'stage_manifest_ref_missing'
    | 'current_pointer_ref_missing'
    | 'owner_answer_binding_ref_missing'
    | 'runtime_event_ref_missing'
    | 'expected_receipt_ref_missing';
  stage_id: string | null;
  minimal_counterexample: {
    stage_id?: string;
    expected_ref?: string;
    missing_ref?: string;
    reason: string;
  };
  repair_action:
    | 'repair_stage_pack_conformance'
    | 'record_append_only_event_log_ref'
    | 'record_attempt_ledger_ref'
    | 'record_stage_manifest_ref'
    | 'record_current_pointer_ref'
    | 'record_owner_answer_binding_ref'
    | 'record_runtime_event_ref'
    | 'record_expected_receipt_ref';
  payload_workorder?: FamilyStageReplayMissingReceiptWorkorder;
}

export interface FamilyStageReplayMissingReceiptWorkorder {
  surface_kind: 'opl_stage_replay_missing_receipt_workorder';
  stage_id: string;
  missing_ref: string;
  missing_ref_kind: 'human_gate_ref' | 'owner_receipt_ref' | 'domain_receipt_ref';
  payload_owner: 'domain_or_human_gate_owner';
  payload_path_policy: 'success_receipt_ref_or_domain_owned_typed_blocker_ref';
  required_success_ref: string;
  required_return_shapes: string[];
  payload_template: {
    receipt_refs: string[];
    typed_blocker_refs: string[];
  };
  accepted_payload_paths: {
    success_refs_path: {
      required_receipt_ref: string;
      typed_blocker_refs_must_be_absent: true;
      closes_replay_receipt_ref: true;
      closes_domain_ready: false;
      closes_production_ready: false;
    };
    typed_blocker_path: {
      required_typed_blocker_refs: string[];
      success_claimed: false;
      closes_replay_receipt_ref: false;
      closes_domain_ready: false;
      closes_production_ready: false;
    };
  };
  authority_boundary: {
    refs_only: true;
    can_execute_domain_action: false;
    can_requery_human: false;
    can_write_domain_truth: false;
    can_create_owner_receipt: false;
    can_write_owner_receipt: false;
    can_authorize_quality_or_export: false;
    can_close_domain_ready: false;
    can_claim_production_ready: false;
  };
}

export interface FamilyStageReplayCertificationStage {
  stage_id: string;
  replay_status: 'replay_ready' | 'blocked';
  required_runtime_event_refs: string[];
  recorded_runtime_event_refs: string[];
  missing_runtime_event_refs: string[];
  expected_receipt_refs: string[];
  recorded_receipt_refs: string[];
  missing_receipt_refs: string[];
  missing_receipt_workorders: FamilyStageReplayMissingReceiptWorkorder[];
}

export interface FamilyStageReplayCertification {
  surface_kind: 'opl_family_stage_replay_certification';
  version: 'family-stage-replay-certification.v1';
  stage_pack_id: string;
  target_domain_id: string;
  stage_pack_hash: string;
  replay_status: 'replay_ready' | 'blocked';
  summary: {
    stage_count: number;
    replay_ready_stage_count: number;
    blocked_stage_count: number;
    missing_runtime_event_ref_count: number;
    missing_receipt_ref_count: number;
    append_only_event_log_ref_count: number;
    attempt_ledger_ref_count: number;
    codex_attempt_trace_ref_count: number;
    stage_manifest_ref_count: number;
    current_pointer_ref_count: number;
    owner_answer_binding_ref_count: number;
    blocker_count: number;
  };
  stage_results: FamilyStageReplayCertificationStage[];
  blockers: FamilyStageReplayBlocker[];
  authority_boundary: {
    opl_role: 'replay_certification_projection_only';
    replay_reads_append_only_log_refs_only: true;
    can_requery_ai: false;
    can_requery_human: false;
    can_requery_external_system: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
    can_accept_or_reject_owner_receipt: false;
  };
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function uniq(values: string[]) {
  return [...new Set(values)];
}

type FamilyStageReplayEvidenceBucket =
  | 'append_only_event_log_refs'
  | 'attempt_ledger_refs'
  | 'stage_manifest_refs'
  | 'current_pointer_refs'
  | 'owner_answer_binding_refs'
  | 'recorded_runtime_event_refs'
  | 'closeout_receipt_refs';

const REPLAY_EVIDENCE_BUCKET_BY_ROLE: Record<string, FamilyStageReplayEvidenceBucket> = {
  append_only_event_log_ref: 'append_only_event_log_refs',
  append_only_event_log_refs: 'append_only_event_log_refs',
  attempt_ledger_ref: 'attempt_ledger_refs',
  attempt_ledger_refs: 'attempt_ledger_refs',
  stage_attempt_ledger_ref: 'attempt_ledger_refs',
  opl_stage_attempt_ledger_ref: 'attempt_ledger_refs',
  codex_attempt_trace_ref: 'attempt_ledger_refs',
  codex_attempt_trace_refs: 'attempt_ledger_refs',
  agent_lab_codex_attempt_trace_ref: 'attempt_ledger_refs',
  stage_manifest_ref: 'stage_manifest_refs',
  stage_manifest_refs: 'stage_manifest_refs',
  current_pointer_ref: 'current_pointer_refs',
  current_pointer_refs: 'current_pointer_refs',
  owner_answer_binding_ref: 'owner_answer_binding_refs',
  owner_answer_binding_refs: 'owner_answer_binding_refs',
  recorded_runtime_event_ref: 'recorded_runtime_event_refs',
  recorded_runtime_event_refs: 'recorded_runtime_event_refs',
  runtime_event_ref: 'recorded_runtime_event_refs',
  runtime_event_refs: 'recorded_runtime_event_refs',
  closeout_receipt_ref: 'closeout_receipt_refs',
  closeout_receipt_refs: 'closeout_receipt_refs',
  owner_receipt_ref: 'closeout_receipt_refs',
  domain_owner_receipt_ref: 'closeout_receipt_refs',
  stage_closeout_receipt_ref: 'closeout_receipt_refs',
  replay_receipt_ref: 'closeout_receipt_refs',
};

const REPLAY_EVIDENCE_BUCKET_BY_REF_KIND: Record<string, FamilyStageReplayEvidenceBucket> = {
  append_only_event_log_ref: 'append_only_event_log_refs',
  event_log_ref: 'append_only_event_log_refs',
  attempt_ledger_ref: 'attempt_ledger_refs',
  codex_attempt_trace_ref: 'attempt_ledger_refs',
  stage_manifest_ref: 'stage_manifest_refs',
  current_pointer_ref: 'current_pointer_refs',
  owner_answer_binding_ref: 'owner_answer_binding_refs',
  runtime_event_ref: 'recorded_runtime_event_refs',
  recorded_runtime_event_ref: 'recorded_runtime_event_refs',
  closeout_receipt_ref: 'closeout_receipt_refs',
  owner_receipt_ref: 'closeout_receipt_refs',
};

function normalizedToken(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/[-\s]+/g, '_') ?? '';
}

function replayEvidenceBucket(ref: FamilyStageSurfaceRef): FamilyStageReplayEvidenceBucket | null {
  const roleBucket = REPLAY_EVIDENCE_BUCKET_BY_ROLE[normalizedToken(ref.role)];
  if (roleBucket) {
    return roleBucket;
  }
  return REPLAY_EVIDENCE_BUCKET_BY_REF_KIND[normalizedToken(ref.ref_kind)] ?? null;
}

function surfaceRefValues(ref: FamilyStageSurfaceRef) {
  const values = Array.isArray(ref.ref) ? ref.ref : [ref.ref];
  return values.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

export function buildFamilyStageReplayEvidenceFromControlPlane(
  plane: FamilyStageControlPlane,
): FamilyStageReplayEvidence {
  const evidence: Required<Pick<
    FamilyStageReplayEvidence,
    | 'append_only_event_log_refs'
    | 'attempt_ledger_refs'
    | 'stage_manifest_refs'
    | 'current_pointer_refs'
    | 'owner_answer_binding_refs'
    | 'recorded_runtime_event_refs'
    | 'closeout_receipt_refs'
  >> = {
    append_only_event_log_refs: [],
    attempt_ledger_refs: [],
    stage_manifest_refs: [],
    current_pointer_refs: [],
    owner_answer_binding_refs: [],
    recorded_runtime_event_refs: [],
    closeout_receipt_refs: [],
  };
  const refs = [
    ...(plane.replay_evidence_refs ?? []),
    ...plane.stages.flatMap((stage) => stage.stage_contract?.replay_evidence_refs ?? []),
  ];
  for (const ref of refs) {
    const bucket = replayEvidenceBucket(ref);
    if (!bucket) {
      continue;
    }
    evidence[bucket].push(...surfaceRefValues(ref));
  }
  return {
    append_only_event_log_refs: uniq(evidence.append_only_event_log_refs),
    attempt_ledger_refs: uniq(evidence.attempt_ledger_refs),
    stage_manifest_refs: uniq(evidence.stage_manifest_refs),
    current_pointer_refs: uniq(evidence.current_pointer_refs),
    owner_answer_binding_refs: uniq(evidence.owner_answer_binding_refs),
    recorded_runtime_event_refs: uniq(evidence.recorded_runtime_event_refs),
    closeout_receipt_refs: uniq(evidence.closeout_receipt_refs),
  };
}

function closeoutRefsFromPacket(packet: JsonRecord | null | undefined) {
  if (!packet) {
    return [];
  }
  return uniq([
    ...readStringList(packet.closeout_refs),
    ...readStringList(packet.receipt_refs),
    ...readStringList(packet.owner_receipt_refs),
    ...readStringList(packet.replay_receipt_refs),
    ...(typeof packet.closeout_ref === 'string' ? [packet.closeout_ref] : []),
    ...(typeof packet.receipt_ref === 'string' ? [packet.receipt_ref] : []),
    ...(typeof packet.packet_ref === 'string' ? [packet.packet_ref] : []),
  ]);
}

function runtimeEventRefsFromPacket(packet: JsonRecord | null | undefined) {
  if (!packet) {
    return [];
  }
  return uniq([
    ...readStringList(packet.runtime_event_refs),
    ...readStringList(packet.replay_event_refs),
    ...readStringList(packet.recorded_runtime_event_refs),
    ...(typeof packet.runtime_event_ref === 'string' ? [packet.runtime_event_ref] : []),
    ...(typeof packet.replay_event_ref === 'string' ? [packet.replay_event_ref] : []),
  ]);
}

function stageManifestRefsFromPacket(packet: JsonRecord | null | undefined) {
  if (!packet) {
    return [];
  }
  return uniq([
    ...readStringList(packet.stage_manifest_refs),
    ...(typeof packet.stage_manifest_ref === 'string' ? [packet.stage_manifest_ref] : []),
  ]);
}

function currentPointerRefsFromPacket(packet: JsonRecord | null | undefined) {
  if (!packet) {
    return [];
  }
  return uniq([
    ...readStringList(packet.current_pointer_refs),
    ...(typeof packet.current_pointer_ref === 'string' ? [packet.current_pointer_ref] : []),
  ]);
}

function ownerAnswerBindingRefsFromPacket(packet: JsonRecord | null | undefined) {
  if (!packet) {
    return [];
  }
  return uniq([
    ...readStringList(packet.owner_answer_binding_refs),
    ...(typeof packet.owner_answer_binding_ref === 'string' ? [packet.owner_answer_binding_ref] : []),
  ]);
}

function receiptsByStage(expectedRefs: FamilyStageProofBundleExpectedReceiptRef[]) {
  const refs = new Map<string, string[]>();
  for (const expected of expectedRefs) {
    refs.set(expected.stage_id, [...(refs.get(expected.stage_id) ?? []), expected.ref]);
  }
  return refs;
}

function missingReceiptRefKind(ref: string): FamilyStageReplayMissingReceiptWorkorder['missing_ref_kind'] {
  if (ref.startsWith('human_gate:')) {
    return 'human_gate_ref';
  }
  if (ref.startsWith('owner_receipt:')) {
    return 'owner_receipt_ref';
  }
  return 'domain_receipt_ref';
}

function missingReceiptReturnShapes(ref: string) {
  const refKind = missingReceiptRefKind(ref);
  const successShape = refKind === 'human_gate_ref'
    ? 'human_gate_receipt_ref'
    : (refKind === 'owner_receipt_ref' ? 'domain_owner_receipt_ref' : 'domain_receipt_ref');
  return [successShape, 'typed_blocker_ref'];
}

function missingReceiptWorkorder(stageId: string, ref: string): FamilyStageReplayMissingReceiptWorkorder {
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_workorder',
    stage_id: stageId,
    missing_ref: ref,
    missing_ref_kind: missingReceiptRefKind(ref),
    payload_owner: 'domain_or_human_gate_owner',
    payload_path_policy: 'success_receipt_ref_or_domain_owned_typed_blocker_ref',
    required_success_ref: ref,
    required_return_shapes: missingReceiptReturnShapes(ref),
    payload_template: {
      receipt_refs: [],
      typed_blocker_refs: [],
    },
    accepted_payload_paths: {
      success_refs_path: {
        required_receipt_ref: ref,
        typed_blocker_refs_must_be_absent: true,
        closes_replay_receipt_ref: true,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
      typed_blocker_path: {
        required_typed_blocker_refs: ['typed_blocker_ref'],
        success_claimed: false,
        closes_replay_receipt_ref: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
    authority_boundary: {
      refs_only: true,
      can_execute_domain_action: false,
      can_requery_human: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_write_owner_receipt: false,
      can_authorize_quality_or_export: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}

function eventsByStage(requirements: FamilyStageProofBundleRuntimeEventRequirement[]) {
  const refs = new Map<string, string[]>();
  for (const requirement of requirements) {
    if (!requirement.required) {
      continue;
    }
    refs.set(requirement.stage_id, [...(refs.get(requirement.stage_id) ?? []), ...requirement.runtime_event_refs]);
  }
  return refs;
}

function blocker(
  blocker_id: FamilyStageReplayBlocker['blocker_id'],
  repair_action: FamilyStageReplayBlocker['repair_action'],
  reason: string,
  stageId: string | null = null,
  missingRef?: string,
  payloadWorkorder?: FamilyStageReplayMissingReceiptWorkorder,
): FamilyStageReplayBlocker {
  return {
    blocker_kind: 'replay_certification_blocker',
    blocker_id,
    stage_id: stageId,
    minimal_counterexample: {
      ...(stageId ? { stage_id: stageId } : {}),
      ...(missingRef ? { expected_ref: missingRef, missing_ref: missingRef } : {}),
      reason,
    },
    repair_action,
    ...(payloadWorkorder ? { payload_workorder: payloadWorkorder } : {}),
  };
}

export function buildFamilyStageReplayCertification(
  proofBundle: FamilyStageProofBundle,
  evidence: FamilyStageReplayEvidence = {},
): FamilyStageReplayCertification {
  const appendOnlyEventLogRefs = evidence.append_only_event_log_refs ?? [];
  const attemptLedgerRefs = evidence.attempt_ledger_refs ?? [];
  const codexAttemptTraceRefs = evidence.codex_attempt_trace_refs ?? [];
  const stageManifestRefs = uniq([
    ...(evidence.stage_manifest_refs ?? []),
    ...stageManifestRefsFromPacket(evidence.closeout_packet ?? null),
  ]);
  const currentPointerRefs = uniq([
    ...(evidence.current_pointer_refs ?? []),
    ...currentPointerRefsFromPacket(evidence.closeout_packet ?? null),
  ]);
  const ownerAnswerBindingRefs = uniq([
    ...(evidence.owner_answer_binding_refs ?? []),
    ...ownerAnswerBindingRefsFromPacket(evidence.closeout_packet ?? null),
  ]);
  const recordedRuntimeEventRefs = uniq([
    ...(evidence.recorded_runtime_event_refs ?? []),
    ...runtimeEventRefsFromPacket(evidence.closeout_packet ?? null),
  ]);
  const closeoutReceiptRefs = uniq([
    ...(evidence.closeout_receipt_refs ?? []),
    ...closeoutRefsFromPacket(evidence.closeout_packet ?? null),
  ]);
  const recordedRuntimeEventRefSet = new Set(recordedRuntimeEventRefs);
  const closeoutReceiptRefSet = new Set(closeoutReceiptRefs);
  const expectedEvents = eventsByStage(proofBundle.runtime_event_requirements);
  const expectedReceipts = receiptsByStage(proofBundle.expected_receipt_refs);
  const stageIds = proofBundle.identity.stage_ids;

  const stageResults = stageIds.map((stageId) => {
    const requiredRuntimeEventRefs = uniq(expectedEvents.get(stageId) ?? []);
    const expectedReceiptRefs = uniq(expectedReceipts.get(stageId) ?? []);
    const missingRuntimeEventRefs = requiredRuntimeEventRefs.filter((ref) => !recordedRuntimeEventRefSet.has(ref));
    const missingReceiptRefs = expectedReceiptRefs.filter((ref) => !closeoutReceiptRefSet.has(ref));
    const missingReceiptWorkorders = missingReceiptRefs.map((ref) => missingReceiptWorkorder(stageId, ref));
    return {
      stage_id: stageId,
      replay_status: missingRuntimeEventRefs.length === 0 && missingReceiptRefs.length === 0
        ? 'replay_ready' as const
        : 'blocked' as const,
      required_runtime_event_refs: requiredRuntimeEventRefs,
      recorded_runtime_event_refs: requiredRuntimeEventRefs.filter((ref) => recordedRuntimeEventRefSet.has(ref)),
      missing_runtime_event_refs: missingRuntimeEventRefs,
      expected_receipt_refs: expectedReceiptRefs,
      recorded_receipt_refs: expectedReceiptRefs.filter((ref) => closeoutReceiptRefSet.has(ref)),
      missing_receipt_refs: missingReceiptRefs,
      missing_receipt_workorders: missingReceiptWorkorders,
    };
  });

  const blockers: FamilyStageReplayBlocker[] = [];
  if (proofBundle.conformance_status !== 'conformant') {
    blockers.push(blocker(
      'stage_pack_not_conformant',
      'repair_stage_pack_conformance',
      `stage pack conformance is ${proofBundle.conformance_status}`,
    ));
  }
  if (appendOnlyEventLogRefs.length === 0) {
    blockers.push(blocker(
      'append_only_event_log_ref_missing',
      'record_append_only_event_log_ref',
      'replay certification requires at least one append-only event log ref',
    ));
  }
  if (attemptLedgerRefs.length === 0) {
    if (codexAttemptTraceRefs.length > 0) {
      attemptLedgerRefs.push(...codexAttemptTraceRefs);
    }
  }
  if (attemptLedgerRefs.length === 0) {
    blockers.push(blocker(
      'attempt_ledger_ref_missing',
      'record_attempt_ledger_ref',
      `replay certification requires at least one ${OBSERVABILITY_ATTEMPT_LEDGER_LABEL} ref`,
    ));
  }
  if (stageManifestRefs.length === 0) {
    blockers.push(blocker(
      'stage_manifest_ref_missing',
      'record_stage_manifest_ref',
      'replay certification requires at least one stage manifest ref',
    ));
  }
  if (currentPointerRefs.length === 0) {
    blockers.push(blocker(
      'current_pointer_ref_missing',
      'record_current_pointer_ref',
      'replay certification requires at least one current pointer ref',
    ));
  }
  if (ownerAnswerBindingRefs.length === 0) {
    blockers.push(blocker(
      'owner_answer_binding_ref_missing',
      'record_owner_answer_binding_ref',
      'replay certification requires at least one owner answer binding ref',
    ));
  }
  for (const stage of stageResults) {
    for (const ref of stage.missing_runtime_event_refs) {
      blockers.push(blocker(
        'runtime_event_ref_missing',
        'record_runtime_event_ref',
        'required runtime event ref is not present in replay evidence',
        stage.stage_id,
        ref,
      ));
    }
    for (const ref of stage.missing_receipt_refs) {
      blockers.push(blocker(
        'expected_receipt_ref_missing',
        'record_expected_receipt_ref',
        'expected receipt ref is not present in closeout replay evidence',
        stage.stage_id,
        ref,
        missingReceiptWorkorder(stage.stage_id, ref),
      ));
    }
  }

  return {
    surface_kind: 'opl_family_stage_replay_certification',
    version: 'family-stage-replay-certification.v1',
    stage_pack_id: proofBundle.identity.stage_pack_id,
    target_domain_id: proofBundle.identity.target_domain_id,
    stage_pack_hash: proofBundle.integrity.stage_pack_hash,
    replay_status: blockers.length === 0 ? 'replay_ready' : 'blocked',
    summary: {
      stage_count: stageResults.length,
      replay_ready_stage_count: stageResults.filter((stage) => stage.replay_status === 'replay_ready').length,
      blocked_stage_count: stageResults.filter((stage) => stage.replay_status === 'blocked').length,
      missing_runtime_event_ref_count: stageResults.reduce((count, stage) => count + stage.missing_runtime_event_refs.length, 0),
      missing_receipt_ref_count: stageResults.reduce((count, stage) => count + stage.missing_receipt_refs.length, 0),
      append_only_event_log_ref_count: appendOnlyEventLogRefs.length,
      attempt_ledger_ref_count: attemptLedgerRefs.length,
      codex_attempt_trace_ref_count: codexAttemptTraceRefs.length,
      stage_manifest_ref_count: stageManifestRefs.length,
      current_pointer_ref_count: currentPointerRefs.length,
      owner_answer_binding_ref_count: ownerAnswerBindingRefs.length,
      blocker_count: blockers.length,
    },
    stage_results: stageResults,
    blockers,
    authority_boundary: {
      opl_role: 'replay_certification_projection_only',
      replay_reads_append_only_log_refs_only: true,
      can_requery_ai: false,
      can_requery_human: false,
      can_requery_external_system: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      can_accept_or_reject_owner_receipt: false,
    },
  };
}
