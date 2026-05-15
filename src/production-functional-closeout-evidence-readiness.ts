type SummaryProjection = Record<string, unknown>;

type ProviderContinuousProofProjection = {
  continuous_proof_status?: string;
  proof_freshness_status?: string;
  proof_slo_status?: string;
  proof_event_count?: number;
  proven_event_count?: number;
  slo_execution_receipt_event_count?: number;
  operator_slo_repair_loop?: {
    repair_state?: string;
    execution_receipts?: {
      event_count?: number;
      executed_count?: number;
      skipped_count?: number;
      blocked_count?: number;
      proven_count?: number;
    };
    operator_cadence_action?: {
      dispatch_status?: string;
    };
  };
};

type AttemptEvidenceDomain = {
  domain_id: string;
  attempt_count: number;
  closeout_packet_count: number;
  owner_receipt_refs: string[];
  no_regression_evidence_refs: string[];
  typed_blockers: unknown[];
  lifecycle_domain_receipt_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_write_count: number;
  transition_bridge_owner_receipt_refs: string[];
  transition_bridge_no_regression_evidence_refs: string[];
  transition_bridge_typed_blocker_refs: string[];
  transition_bridge_typed_blocker_count: number;
};

type AttemptEvidence = {
  ledger_attempt_count: number;
  closeout_packet_count: number;
  controlled_apply_summary: SummaryProjection;
  lifecycle_guarded_apply_summary: SummaryProjection;
  memory_ref_summary: SummaryProjection;
  transition_bridge_evidence_summary: SummaryProjection;
  domain_breakdown: AttemptEvidenceDomain[];
};

type ProductionEvidenceReadinessInput = {
  providerReady: boolean;
  providerContinuousProof: ProviderContinuousProofProjection;
  attemptEvidence: AttemptEvidence;
  typedBlockerCount: number;
};

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function domainRefsOrTypedBlockers(domain: AttemptEvidenceDomain) {
  return {
    owner_receipt_ref_count: domain.owner_receipt_refs.length,
    no_regression_evidence_ref_count: domain.no_regression_evidence_refs.length,
    typed_blocker_count: domain.typed_blockers.length,
    transition_owner_receipt_ref_count: domain.transition_bridge_owner_receipt_refs.length,
    transition_no_regression_evidence_ref_count: domain.transition_bridge_no_regression_evidence_refs.length,
    transition_typed_blocker_count:
      domain.transition_bridge_typed_blocker_count || domain.transition_bridge_typed_blocker_refs.length,
    memory_writeback_receipt_ref_count: domain.writeback_receipt_refs.length,
    lifecycle_domain_receipt_ref_count: domain.lifecycle_domain_receipt_refs.length,
  };
}

function domainHasOwnerChainEvidence(domain: AttemptEvidenceDomain) {
  const refs = domainRefsOrTypedBlockers(domain);
  return (
    refs.owner_receipt_ref_count
    + refs.no_regression_evidence_ref_count
    + refs.typed_blocker_count
    + refs.transition_owner_receipt_ref_count
    + refs.transition_no_regression_evidence_ref_count
    + refs.transition_typed_blocker_count
  ) > 0;
}

function domainCoverageStatus(domain: AttemptEvidenceDomain) {
  if (domain.attempt_count === 0) {
    return 'missing_stage_attempt_evidence';
  }
  if (domainHasOwnerChainEvidence(domain)) {
    return 'owner_chain_ref_or_typed_blocker_observed';
  }
  return 'stage_attempt_observed_without_owner_chain_ref';
}

function providerSloReady(proof: ProviderContinuousProofProjection) {
  return (
    proof.continuous_proof_status === 'all_observed_proofs_proven'
    && proof.proof_slo_status === 'proof_fresh'
  );
}

function readinessGates(input: ProductionEvidenceReadinessInput) {
  const gates = [];
  if (!input.providerReady) {
    gates.push('production_provider_readiness');
  }
  if (!providerSloReady(input.providerContinuousProof)) {
    gates.push('temporal_provider_slo_fresh_proof');
  }
  if (input.attemptEvidence.domain_breakdown.some((domain) => domain.attempt_count === 0)) {
    gates.push('provider_hosted_domain_stage_attempts');
  }
  if (input.attemptEvidence.domain_breakdown.some((domain) =>
    domain.attempt_count > 0 && !domainHasOwnerChainEvidence(domain)
  )) {
    gates.push('domain_owner_chain_refs_or_typed_blockers');
  }
  return gates;
}

export function buildProductionEvidenceReadiness(input: ProductionEvidenceReadinessInput) {
  const pendingGates = readinessGates(input);
  const domains = input.attemptEvidence.domain_breakdown.map((domain) => ({
    domain_id: domain.domain_id,
    coverage_status: domainCoverageStatus(domain),
    attempt_count: domain.attempt_count,
    closeout_packet_count: domain.closeout_packet_count,
    ...domainRefsOrTypedBlockers(domain),
    consumed_memory_ref_count: domain.consumed_memory_refs.length,
    rejected_write_count: domain.rejected_write_count,
  }));
  const domainEvidenceReadyCount = domains.filter((domain) =>
    domain.coverage_status === 'owner_chain_ref_or_typed_blocker_observed'
  ).length;

  return {
    surface_kind: 'opl_production_evidence_readiness_summary',
    projection_scope: 'production_functional_closeout',
    readiness_status: pendingGates.length === 0
      ? 'functional_evidence_ready_for_live_soak'
      : 'functional_evidence_has_pending_gates',
    pending_gate_count: pendingGates.length,
    pending_gates: pendingGates,
    live_soak_gate: {
      gate_status: 'external_live_soak_evidence_required',
      claims_live_soak_complete: false,
      required_evidence: [
        'long_window_temporal_provider_slo_receipts',
        'real_domain_owner_chain_receipts_or_typed_blockers',
        'domain_memory_body_or_writeback_apply_receipts',
        'domain_lifecycle_apply_receipts',
      ],
    },
    provider_slo_evidence: {
      provider_ready: input.providerReady,
      continuous_proof_status: input.providerContinuousProof.continuous_proof_status ?? null,
      proof_freshness_status: input.providerContinuousProof.proof_freshness_status ?? null,
      proof_slo_status: input.providerContinuousProof.proof_slo_status ?? null,
      proof_event_count: numberValue(input.providerContinuousProof.proof_event_count),
      proven_event_count: numberValue(input.providerContinuousProof.proven_event_count),
      slo_execution_receipt_event_count:
        numberValue(input.providerContinuousProof.slo_execution_receipt_event_count),
      slo_execution_receipts: {
        event_count:
          numberValue(input.providerContinuousProof.operator_slo_repair_loop?.execution_receipts?.event_count),
        executed_count:
          numberValue(input.providerContinuousProof.operator_slo_repair_loop?.execution_receipts?.executed_count),
        skipped_count:
          numberValue(input.providerContinuousProof.operator_slo_repair_loop?.execution_receipts?.skipped_count),
        blocked_count:
          numberValue(input.providerContinuousProof.operator_slo_repair_loop?.execution_receipts?.blocked_count),
        proven_count:
          numberValue(input.providerContinuousProof.operator_slo_repair_loop?.execution_receipts?.proven_count),
      },
      repair_state: input.providerContinuousProof.operator_slo_repair_loop?.repair_state ?? null,
      cadence_dispatch_status:
        input.providerContinuousProof.operator_slo_repair_loop?.operator_cadence_action?.dispatch_status ?? null,
    },
    stage_attempt_evidence: {
      ledger_attempt_count: input.attemptEvidence.ledger_attempt_count,
      closeout_packet_count: input.attemptEvidence.closeout_packet_count,
      controlled_apply: input.attemptEvidence.controlled_apply_summary,
      lifecycle_guarded_apply: input.attemptEvidence.lifecycle_guarded_apply_summary,
      memory_refs: input.attemptEvidence.memory_ref_summary,
      transition_bridge: input.attemptEvidence.transition_bridge_evidence_summary,
    },
    domain_coverage: {
      domain_count: domains.length,
      domain_with_attempt_count: domains.filter((domain) => domain.attempt_count > 0).length,
      domain_owner_chain_ref_or_typed_blocker_observed_count: domainEvidenceReadyCount,
      domains,
    },
    typed_blocker_count: input.typedBlockerCount,
    authority_boundary: {
      opl: 'refs_only_evidence_readiness_projection',
      domain: 'truth_quality_artifact_memory_lifecycle_owner',
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}
