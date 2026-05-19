import type {
  FamilyStageProofBundle,
  FamilyStageProofBundleExpectedReceiptRef,
  FamilyStageProofBundleRuntimeEventRequirement,
} from './family-stage-proof-bundle.ts';

type JsonRecord = Record<string, unknown>;

export interface FamilyStageReplayEvidence {
  append_only_event_log_refs?: string[];
  attempt_ledger_refs?: string[];
  recorded_runtime_event_refs?: string[];
  closeout_receipt_refs?: string[];
  closeout_packet?: JsonRecord | null;
}

export interface FamilyStageReplayBlocker {
  blocker_kind: 'replay_certification_blocker';
  blocker_id:
    | 'stage_pack_not_admitted'
    | 'append_only_event_log_ref_missing'
    | 'attempt_ledger_ref_missing'
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
    | 'repair_stage_pack_admission'
    | 'record_append_only_event_log_ref'
    | 'record_attempt_ledger_ref'
    | 'record_runtime_event_ref'
    | 'record_expected_receipt_ref';
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

function receiptsByStage(expectedRefs: FamilyStageProofBundleExpectedReceiptRef[]) {
  const refs = new Map<string, string[]>();
  for (const expected of expectedRefs) {
    refs.set(expected.stage_id, [...(refs.get(expected.stage_id) ?? []), expected.ref]);
  }
  return refs;
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
  };
}

export function buildFamilyStageReplayCertification(
  proofBundle: FamilyStageProofBundle,
  evidence: FamilyStageReplayEvidence = {},
): FamilyStageReplayCertification {
  const appendOnlyEventLogRefs = evidence.append_only_event_log_refs ?? [];
  const attemptLedgerRefs = evidence.attempt_ledger_refs ?? [];
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
    };
  });

  const blockers: FamilyStageReplayBlocker[] = [];
  if (proofBundle.admission_status !== 'admitted') {
    blockers.push(blocker(
      'stage_pack_not_admitted',
      'repair_stage_pack_admission',
      `stage pack admission is ${proofBundle.admission_status}`,
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
    blockers.push(blocker(
      'attempt_ledger_ref_missing',
      'record_attempt_ledger_ref',
      'replay certification requires at least one attempt ledger ref',
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
