import path from 'node:path';

import {
  optionalString,
  readJsonFileResult,
} from '../../kernel/json-file.ts';
import {
  record,
  stringList as arrayStringList,
  uniqueStringList,
} from '../../kernel/json-record.ts';
import {
  stageReplayMissingReceiptTargetKey,
  type StageReplayMissingReceiptReceipt,
} from '../stagecraft/index.ts';
import type { OmaProductionConsumptionReceipt } from './oma-production-consumption-ledger.ts';

export const OMA_PRODUCTION_ACCEPTANCE_RELATIVE_REF =
  'contracts/production_acceptance/meta-agent-production-acceptance.json';

function stringArrayOrScalar(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return arrayStringList(value);
}

function refsOnlyStageReplayAuthorityBoundary(): StageReplayMissingReceiptReceipt['authority_boundary'] {
  return {
    opl: 'stage_replay_missing_receipt_ledger_refs_only',
    domain: 'domain_or_human_gate_owner_receipt_or_typed_blocker_authority',
    refs_only: true,
    can_execute_domain_action: false,
    can_requery_human: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_write_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_authorize_quality_or_export: false,
    can_close_replay_receipt_ref: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    closes_domain_ready: false,
    closes_production_ready: false,
  };
}

function refsOnlyOmaProductionConsumptionAuthorityBoundary():
  OmaProductionConsumptionReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_read_domain_memory_body: false,
    can_read_domain_artifact_body: false,
    can_mutate_domain_artifact_body: false,
    can_create_domain_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_promote_default_agent_without_gate: false,
  };
}

export function readOmaProductionAcceptance(repoDir: string) {
  const absolutePath = path.join(repoDir, OMA_PRODUCTION_ACCEPTANCE_RELATIVE_REF);
  const result = readJsonFileResult(absolutePath);
  return {
    ref: OMA_PRODUCTION_ACCEPTANCE_RELATIVE_REF,
    absolute_path: absolutePath,
    status: result.status,
    payload: result.payload,
    error: result.error,
  };
}

export function omaProductionAcceptanceStageReplayReceipts(
  payload: unknown,
): StageReplayMissingReceiptReceipt[] {
  const acceptance = record(payload);
  const summary = record(acceptance.stage_replay_human_gate_blocker_summary);
  if (summary.payload_path !== 'typed_blocker_path') {
    return [];
  }
  const typedBlockerRefs = uniqueStringList(stringArrayOrScalar(summary.typed_blocker_refs));
  if (typedBlockerRefs.length === 0) {
    return [];
  }
  const targetIdentity = record(summary.target_identity);
  const targetKey = stageReplayMissingReceiptTargetKey(targetIdentity);
  if (!targetKey) {
    return [];
  }
  const normalizedTarget = {
    ...targetIdentity,
    target_key: targetKey,
  };
  const sourceRef =
    optionalString(summary.source_ref)
    ?? `${OMA_PRODUCTION_ACCEPTANCE_RELATIVE_REF}#/stage_replay_human_gate_blocker_summary`;

  return [{
    surface_kind: 'opl_stage_replay_missing_receipt_receipt',
    receipt_ref: `opl://stage-replay-missing-receipt/${encodeURIComponent(sourceRef)}`,
    receipt_status: 'verified',
    recorded_at: 'repo-tracked',
    target_identity: normalizedTarget,
    payload_path: 'typed_blocker_path',
    receipt_refs: [],
    typed_blocker_refs: typedBlockerRefs,
    source_surface: 'opl_stage_replay_missing_receipt_workorder',
    source_ref: sourceRef,
    authority_boundary: refsOnlyStageReplayAuthorityBoundary(),
  }];
}

export function omaProductionAcceptanceConsumptionReceipts(
  payload: unknown,
): OmaProductionConsumptionReceipt[] {
  const acceptance = record(payload);
  const refs = record(acceptance.refs);
  const followthrough = record(acceptance.production_consumption_followthrough);
  const longSoakRefs = uniqueStringList([
    ...stringArrayOrScalar(refs.long_soak_refs),
    ...stringArrayOrScalar(followthrough.long_soak_refs),
  ]);
  const verifiedReceiptRefs = uniqueStringList([
    ...stringArrayOrScalar(refs.production_consumption_receipt_refs),
    ...stringArrayOrScalar(followthrough.verified_receipt_refs),
  ]);
  const historicalTypedBlockerRefs = uniqueStringList([
    ...stringArrayOrScalar(refs.historical_typed_blocker_refs),
    ...stringArrayOrScalar(followthrough.historical_typed_blocker_refs),
  ]);
  if (
    longSoakRefs.length === 0
    && verifiedReceiptRefs.length === 0
    && historicalTypedBlockerRefs.length === 0
  ) {
    return [];
  }
  return [{
    surface_kind: 'opl_oma_production_consumption_receipt',
    receipt_ref:
      optionalString(acceptance.receipt_ref)
      ?? `${OMA_PRODUCTION_ACCEPTANCE_RELATIVE_REF}#/production_consumption_followthrough`,
    receipt_status: 'verified',
    recorded_at: 'repo-tracked',
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    long_soak_refs: longSoakRefs,
    typed_blocker_refs: historicalTypedBlockerRefs,
    operator_evidence_refs: verifiedReceiptRefs,
    source_surface: 'opl_oma_production_consumption_followthrough',
    authority_boundary: refsOnlyOmaProductionConsumptionAuthorityBoundary(),
  }];
}
