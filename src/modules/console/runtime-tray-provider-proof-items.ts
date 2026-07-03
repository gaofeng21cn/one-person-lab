import { actionContext, noActionContext } from './runtime-tray-action.ts';
import type { RuntimeTrayItem, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { sourceRef } from './runtime-tray-snapshot-utils.ts';
import {
  providerProofStatusIsCurrentlyProven,
  type buildProviderContinuousProof,
} from '../runway/index.ts';

type ProviderContinuousProof = ReturnType<typeof buildProviderContinuousProof>;

function proofStatusLabel(status: string) {
  const labels: Record<string, string> = {
    all_observed_proofs_proven: 'Provider proof 已通过',
    latest_proof_proven: 'Provider proof 已恢复',
    no_proof_observed: '缺少 provider proof',
    proof_blocker_observed: 'Provider proof 待修复',
    proof_stale: 'Provider proof 已过期',
    proof_freshness_unknown: 'Provider proof 时间未知',
  };
  return labels[status] ?? 'Provider proof 已记录';
}

function proofSummary(proof: ProviderContinuousProof) {
  if (
    proof.continuous_proof_status === 'all_observed_proofs_proven'
    || proof.continuous_proof_status === 'latest_proof_proven'
  ) {
    return proof.latest_closeout_status
      ? `最近 Temporal production proof 为 ${proof.latest_closeout_status}；该结论只证明 provider residency。`
      : 'Temporal production proof 已记录；该结论只证明 provider residency。';
  }
  if (proof.continuous_proof_status === 'no_proof_observed') {
    return '尚未观察到 Temporal production proof receipt；需要先运行生产 proof。';
  }
  return 'Temporal production proof ledger 中存在未通过 receipt；需要修复 provider readiness 后重跑 proof。';
}

function proofSourceRefs(): RuntimeTraySourceRef[] {
  return [
    sourceRef('/provider_continuous_proof', 'provider_continuous_proof'),
    sourceRef('/runtime_tray_snapshot/provider_continuous_proof', 'operator_drilldown_source'),
  ];
}

export function buildProviderProofTrayItem(proof: ProviderContinuousProof): RuntimeTrayItem | null {
  const proofFresh = proof.proof_slo_status === 'proof_fresh';
  if (proofFresh && providerProofStatusIsCurrentlyProven(proof.continuous_proof_status)) {
    return null;
  }
  const labelStatus = proofFresh ? proof.continuous_proof_status : proof.proof_slo_status;
  return {
    item_id: 'opl:provider-continuous-proof:temporal',
    project_id: 'opl',
    project_label: 'OPL Provider',
    lane: proofFresh ? 'recent' : 'attention',
    title: 'Temporal provider proof',
    status: proof.continuous_proof_status,
    status_label: proofStatusLabel(labelStatus),
    summary: proofSummary(proof),
    updated_at: null,
    command: 'opl family-runtime residency proof --provider temporal --production',
    workspace_path: null,
    runtime_owner: 'provider_backed_family_runtime',
    domain_owner: 'opl_provider_runtime',
    source_refs: proofSourceRefs(),
    ...(proofFresh
      ? noActionContext('继续按 operator cadence 重跑 production proof；domain owner chain 仍需单独闭合。')
      : actionContext(
        'infrastructure',
        'infrastructure_recovery',
        proof.required_next_action,
      )),
    next_action_summary: proof.required_next_action,
    provider_continuous_proof: {
      surface_kind: proof.surface_kind,
      provider_kind: proof.provider_kind,
      proof_event_count: proof.proof_event_count,
      proven_event_count: proof.proven_event_count,
      slo_execution_receipt_event_count: proof.slo_execution_receipt_event_count,
      latest_slo_execution_event_id: proof.latest_slo_execution_event_id,
      latest_slo_execution_event_created_at: proof.latest_slo_execution_event_created_at,
      latest_slo_execution_event_age_seconds: proof.latest_slo_execution_event_age_seconds,
      latest_slo_execution_receipt: proof.latest_slo_execution_receipt,
      latest_event_id: proof.latest_event_id,
      latest_event_created_at: proof.latest_event_created_at,
      latest_event_age_seconds: proof.latest_event_age_seconds,
      max_proof_age_seconds: proof.max_proof_age_seconds,
      proof_freshness_status: proof.proof_freshness_status,
      latest_proof_mode: proof.latest_proof_mode,
      latest_closeout_status: proof.latest_closeout_status,
      latest_proof_receipt: proof.latest_proof_receipt,
      continuous_proof_status: proof.continuous_proof_status,
      proof_slo_status: proof.proof_slo_status,
      cadence_window: proof.cadence_window,
      operator_slo_repair_loop: proof.operator_slo_repair_loop,
      required_next_action: proof.required_next_action,
      authority_boundary: proof.authority_boundary,
    },
  };
}
