import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

export type AgentLabMechanismInputTask = {
  mechanism_evolution_inputs?: JsonRecord;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueRefs(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function policyMode(value: unknown) {
  return value === 'advisory' || value === 'fail_closed' ? value : undefined;
}

export function mechanismEvolutionInputsForTask(task: AgentLabMechanismInputTask) {
  if (!isRecord(task.mechanism_evolution_inputs)) {
    return undefined;
  }
  const inputs = task.mechanism_evolution_inputs;
  const researchMemoryGraph = isRecord(inputs.research_memory_graph)
    ? {
      surface_kind: inputs.research_memory_graph.surface_kind,
      graph_kind: inputs.research_memory_graph.graph_kind,
      body_included: inputs.research_memory_graph.body_included === true,
      manifest_refs: stringList(inputs.research_memory_graph.manifest_refs),
      paper_refs: stringList(inputs.research_memory_graph.paper_refs),
      claim_refs: stringList(inputs.research_memory_graph.claim_refs),
      experiment_refs: stringList(inputs.research_memory_graph.experiment_refs),
      failed_idea_refs: stringList(inputs.research_memory_graph.failed_idea_refs),
      negative_result_refs: stringList(inputs.research_memory_graph.negative_result_refs),
      reusable_rationale_refs: stringList(inputs.research_memory_graph.reusable_rationale_refs),
      failed_route_refs: stringList(inputs.research_memory_graph.failed_route_refs),
    }
    : undefined;
  const analysisQueueManifest = isRecord(inputs.analysis_queue_manifest)
    ? {
      surface_kind: inputs.analysis_queue_manifest.surface_kind,
      manifest_kind: inputs.analysis_queue_manifest.manifest_kind,
      body_included: inputs.analysis_queue_manifest.body_included === true,
      queue_ref: typeof inputs.analysis_queue_manifest.queue_ref === 'string'
        ? inputs.analysis_queue_manifest.queue_ref
        : undefined,
      state: typeof inputs.analysis_queue_manifest.state === 'string'
        ? inputs.analysis_queue_manifest.state
        : undefined,
      retry_policy: isRecord(inputs.analysis_queue_manifest.retry_policy)
        ? inputs.analysis_queue_manifest.retry_policy
        : undefined,
      budget: isRecord(inputs.analysis_queue_manifest.budget)
        ? inputs.analysis_queue_manifest.budget
        : undefined,
      items: Array.isArray(inputs.analysis_queue_manifest.items)
        ? inputs.analysis_queue_manifest.items
          .filter(isRecord)
          .map((item) => ({
            ref: typeof item.ref === 'string' ? item.ref : undefined,
            state: typeof item.state === 'string' ? item.state : undefined,
            retry_count: typeof item.retry_count === 'number' ? item.retry_count : undefined,
            budget_cost: typeof item.budget_cost === 'number' ? item.budget_cost : undefined,
            source_refs: stringList(item.source_refs),
          }))
          .filter((item) => item.ref)
        : [],
      manifest_refs: stringList(inputs.analysis_queue_manifest.manifest_refs),
    }
    : undefined;
  const runtimeEventLedger = isRecord(inputs.runtime_event_ledger)
    ? {
      surface_kind: inputs.runtime_event_ledger.surface_kind,
      ledger_kind: inputs.runtime_event_ledger.ledger_kind,
      body_included: inputs.runtime_event_ledger.body_included === true,
      event_ledger_refs: stringList(inputs.runtime_event_ledger.event_ledger_refs),
      runtime_event_refs: stringList(inputs.runtime_event_ledger.runtime_event_refs),
      stage_attempt_event_refs: stringList(inputs.runtime_event_ledger.stage_attempt_event_refs),
      provider_event_refs: stringList(inputs.runtime_event_ledger.provider_event_refs),
      executor_event_refs: stringList(inputs.runtime_event_ledger.executor_event_refs),
      blocker_refs: stringList(inputs.runtime_event_ledger.blocker_refs),
    }
    : undefined;
  const providerExecutorSwitchHygiene = isRecord(inputs.provider_switch_hygiene)
    ? {
      surface_kind: inputs.provider_switch_hygiene.surface_kind,
      hygiene_kind: inputs.provider_switch_hygiene.hygiene_kind,
      body_included: inputs.provider_switch_hygiene.body_included === true,
      provider_switch_hygiene_refs: stringList(
        inputs.provider_switch_hygiene.provider_switch_hygiene_refs,
      ),
      executor_switch_hygiene_refs: stringList(
        inputs.provider_switch_hygiene.executor_switch_hygiene_refs,
      ),
      provider_refs: stringList(inputs.provider_switch_hygiene.provider_refs),
      executor_refs: stringList(inputs.provider_switch_hygiene.executor_refs),
      switch_receipt_refs: stringList(inputs.provider_switch_hygiene.switch_receipt_refs),
      no_downgrade_proof_refs: stringList(inputs.provider_switch_hygiene.no_downgrade_proof_refs),
    }
    : undefined;
  const claimAssurance = isRecord(inputs.claim_assurance_map)
    ? {
      surface_kind: inputs.claim_assurance_map.surface_kind,
      assurance_kind: inputs.claim_assurance_map.assurance_kind,
      body_included: inputs.claim_assurance_map.body_included === true,
      claim_assurance_map_refs: stringList(inputs.claim_assurance_map.claim_assurance_map_refs),
      claim_refs: stringList(inputs.claim_assurance_map.claim_refs),
      direct_evidence_refs: stringList(inputs.claim_assurance_map.direct_evidence_refs),
      reviewer_receipt_refs: stringList(inputs.claim_assurance_map.reviewer_receipt_refs),
      contradiction_refs: stringList(inputs.claim_assurance_map.contradiction_refs),
      uncertainty_refs: stringList(inputs.claim_assurance_map.uncertainty_refs),
      no_unbacked_claim_proof_refs: stringList(inputs.claim_assurance_map.no_unbacked_claim_proof_refs),
    }
    : undefined;
  const helperSkillDriftGuard = isRecord(inputs.helper_skill_drift_guard)
    ? {
      surface_kind: inputs.helper_skill_drift_guard.surface_kind,
      guard_kind: inputs.helper_skill_drift_guard.guard_kind,
      body_included: inputs.helper_skill_drift_guard.body_included === true,
      policy_mode: policyMode(inputs.helper_skill_drift_guard.policy_mode),
      helper_resolver_chain_refs: stringList(inputs.helper_skill_drift_guard.helper_resolver_chain_refs),
      source_commit_pin_refs: stringList(inputs.helper_skill_drift_guard.source_commit_pin_refs),
      drift_test_refs: stringList(inputs.helper_skill_drift_guard.drift_test_refs),
      backfill_command_refs: stringList(inputs.helper_skill_drift_guard.backfill_command_refs),
      advisory_policy_refs: stringList(inputs.helper_skill_drift_guard.advisory_policy_refs),
      fail_closed_policy_refs: stringList(inputs.helper_skill_drift_guard.fail_closed_policy_refs),
      guard_refs: stringList(inputs.helper_skill_drift_guard.guard_refs),
      resolver_chain: Array.isArray(inputs.helper_skill_drift_guard.resolver_chain)
        ? inputs.helper_skill_drift_guard.resolver_chain
          .filter(isRecord)
          .map((entry) => ({
            resolver_ref: typeof entry.resolver_ref === 'string' ? entry.resolver_ref : undefined,
            layer: typeof entry.layer === 'string' ? entry.layer : undefined,
            source_commit_pin_ref: typeof entry.source_commit_pin_ref === 'string'
              ? entry.source_commit_pin_ref
              : undefined,
            drift_test_ref: typeof entry.drift_test_ref === 'string' ? entry.drift_test_ref : undefined,
            backfill_command_ref: typeof entry.backfill_command_ref === 'string'
              ? entry.backfill_command_ref
              : undefined,
            policy_mode: policyMode(entry.policy_mode),
          }))
          .filter((entry) => entry.resolver_ref)
        : [],
      can_execute_helper: false,
      can_modify_helper_source: false,
      can_execute_backfill_command: false,
    }
    : undefined;
  const assuranceContract = isRecord(inputs.assurance_contract)
    ? {
      surface_kind: inputs.assurance_contract.surface_kind,
      contract_kind: inputs.assurance_contract.contract_kind,
      body_included: inputs.assurance_contract.body_included === true,
      assurance_contract_refs: stringList(inputs.assurance_contract.assurance_contract_refs),
      input_hash_refs: stringList(inputs.assurance_contract.input_hash_refs),
      external_verifier_refs: stringList(inputs.assurance_contract.external_verifier_refs),
      currentness_proof_refs: stringList(inputs.assurance_contract.currentness_proof_refs),
      assurance_trace_refs: stringList(inputs.assurance_contract.assurance_trace_refs),
      submission_gate_refs: stringList(inputs.assurance_contract.submission_gate_refs),
      no_silent_skip_proof_refs: stringList(inputs.assurance_contract.no_silent_skip_proof_refs),
      can_authorize_quality_verdict: false,
      can_authorize_submission_action: false,
    }
    : undefined;
  const adversarialReviewGate = isRecord(inputs.adversarial_review_gate)
    ? {
      surface_kind: inputs.adversarial_review_gate.surface_kind,
      gate_kind: inputs.adversarial_review_gate.gate_kind,
      body_included: inputs.adversarial_review_gate.body_included === true,
      adversarial_review_gate_refs: stringList(inputs.adversarial_review_gate.adversarial_review_gate_refs),
      attack_thread_refs: stringList(inputs.adversarial_review_gate.attack_thread_refs),
      defense_thread_refs: stringList(inputs.adversarial_review_gate.defense_thread_refs),
      judge_receipt_refs: stringList(inputs.adversarial_review_gate.judge_receipt_refs),
      negative_evidence_refs: stringList(inputs.adversarial_review_gate.negative_evidence_refs),
      unresolved_attack_refs: stringList(inputs.adversarial_review_gate.unresolved_attack_refs),
      blocker_refs: stringList(inputs.adversarial_review_gate.blocker_refs),
      debate_trace_refs: stringList(inputs.adversarial_review_gate.debate_trace_refs),
      can_authorize_quality_verdict: false,
    }
    : undefined;
  const experimentQueueRecovery = isRecord(inputs.experiment_queue_recovery)
    ? {
      surface_kind: inputs.experiment_queue_recovery.surface_kind,
      recovery_kind: inputs.experiment_queue_recovery.recovery_kind,
      body_included: inputs.experiment_queue_recovery.body_included === true,
      experiment_queue_recovery_refs: stringList(
        inputs.experiment_queue_recovery.experiment_queue_recovery_refs,
      ),
      queue_refs: stringList(inputs.experiment_queue_recovery.queue_refs),
      state_refs: stringList(inputs.experiment_queue_recovery.state_refs),
      retry_refs: stringList(inputs.experiment_queue_recovery.retry_refs),
      retry_reason_refs: stringList(inputs.experiment_queue_recovery.retry_reason_refs),
      resource_failure_refs: stringList(inputs.experiment_queue_recovery.resource_failure_refs),
      wave_gate_refs: stringList(inputs.experiment_queue_recovery.wave_gate_refs),
      stale_worker_cleanup_refs: stringList(inputs.experiment_queue_recovery.stale_worker_cleanup_refs),
      crash_recovery_refs: stringList(inputs.experiment_queue_recovery.crash_recovery_refs),
      budget_guard_refs: stringList(inputs.experiment_queue_recovery.budget_guard_refs),
    }
    : undefined;
  const publicationAftercarePlan = isRecord(inputs.publication_aftercare_plan)
    ? {
      surface_kind: inputs.publication_aftercare_plan.surface_kind,
      plan_kind: inputs.publication_aftercare_plan.plan_kind,
      body_included: inputs.publication_aftercare_plan.body_included === true,
      publication_aftercare_plan_refs: stringList(
        inputs.publication_aftercare_plan.publication_aftercare_plan_refs,
      ),
      resubmission_plan_refs: stringList(inputs.publication_aftercare_plan.resubmission_plan_refs),
      venue_route_refs: stringList(inputs.publication_aftercare_plan.venue_route_refs),
      talk_package_refs: stringList(inputs.publication_aftercare_plan.talk_package_refs),
      slides_polish_refs: stringList(inputs.publication_aftercare_plan.slides_polish_refs),
      overleaf_sync_refs: stringList(inputs.publication_aftercare_plan.overleaf_sync_refs),
      author_handoff_refs: stringList(inputs.publication_aftercare_plan.author_handoff_refs),
      external_suite_task_refs: stringList(inputs.publication_aftercare_plan.external_suite_task_refs),
      can_push_submission: false,
      can_authorize_submission_action: false,
    }
    : undefined;
  const independentAiReviewReceipt = isRecord(inputs.independent_ai_review_receipt)
    ? {
      receipt_ref: typeof inputs.independent_ai_review_receipt.receipt_ref === 'string'
        ? inputs.independent_ai_review_receipt.receipt_ref
        : undefined,
      receipt_source: typeof inputs.independent_ai_review_receipt.receipt_source === 'string'
        ? inputs.independent_ai_review_receipt.receipt_source
        : undefined,
      assessment_mode: typeof inputs.independent_ai_review_receipt.assessment_mode === 'string'
        ? inputs.independent_ai_review_receipt.assessment_mode
        : undefined,
      reviewer_ref: typeof inputs.independent_ai_review_receipt.reviewer_ref === 'string'
        ? inputs.independent_ai_review_receipt.reviewer_ref
        : undefined,
      reviewer_agent_ref: typeof inputs.independent_ai_review_receipt.reviewer_agent_ref === 'string'
        ? inputs.independent_ai_review_receipt.reviewer_agent_ref
        : undefined,
      reviewed_mechanism_candidate_ref:
        typeof inputs.independent_ai_review_receipt.reviewed_mechanism_candidate_ref === 'string'
          ? inputs.independent_ai_review_receipt.reviewed_mechanism_candidate_ref
          : undefined,
      execution_attempt_ref: typeof inputs.independent_ai_review_receipt.execution_attempt_ref === 'string'
        ? inputs.independent_ai_review_receipt.execution_attempt_ref
        : undefined,
      review_attempt_ref: typeof inputs.independent_ai_review_receipt.review_attempt_ref === 'string'
        ? inputs.independent_ai_review_receipt.review_attempt_ref
        : undefined,
      request_ref: typeof inputs.independent_ai_review_receipt.request_ref === 'string'
        ? inputs.independent_ai_review_receipt.request_ref
        : undefined,
      response_ref: typeof inputs.independent_ai_review_receipt.response_ref === 'string'
        ? inputs.independent_ai_review_receipt.response_ref
        : undefined,
      evidence_refs: stringList(inputs.independent_ai_review_receipt.evidence_refs),
      no_shared_context: inputs.independent_ai_review_receipt.no_shared_context === true,
      review_context_inherits_executor_context:
        inputs.independent_ai_review_receipt.review_context_inherits_executor_context === true,
      forbidden_write_scan_ref:
        typeof inputs.independent_ai_review_receipt.forbidden_write_scan_ref === 'string'
          ? inputs.independent_ai_review_receipt.forbidden_write_scan_ref
          : undefined,
      verdict: typeof inputs.independent_ai_review_receipt.verdict === 'string'
        ? inputs.independent_ai_review_receipt.verdict
        : undefined,
      risk_tier: typeof inputs.independent_ai_review_receipt.risk_tier === 'string'
        ? inputs.independent_ai_review_receipt.risk_tier
        : undefined,
    }
    : undefined;

  return {
    surface_kind: inputs.surface_kind,
    target_opl_surface: inputs.target_opl_surface,
    target_opl_cli: inputs.target_opl_cli,
    automatic_mechanism_promotion_route: inputs.automatic_mechanism_promotion_route,
    research_wiki_refs: stringList(inputs.research_wiki_refs),
    failed_route_refs: stringList(inputs.failed_route_refs),
    reviewer_direct_evidence_refs: stringList(inputs.reviewer_direct_evidence_refs),
    analysis_queue_manifest_refs: stringList(inputs.analysis_queue_manifest_refs),
    runtime_event_ledger_refs: stringList(inputs.runtime_event_ledger_refs),
    provider_switch_hygiene_refs: stringList(inputs.provider_switch_hygiene_refs),
    claim_assurance_map_refs: stringList(inputs.claim_assurance_map_refs),
    helper_skill_drift_guard_refs: stringList(inputs.helper_skill_drift_guard_refs),
    assurance_contract_refs: stringList(inputs.assurance_contract_refs),
    adversarial_review_gate_refs: stringList(inputs.adversarial_review_gate_refs),
    experiment_queue_recovery_refs: stringList(inputs.experiment_queue_recovery_refs),
    publication_aftercare_plan_refs: stringList(inputs.publication_aftercare_plan_refs),
    target_editable_surface_refs: stringList(inputs.target_editable_surface_refs),
    evidence_delta_refs: stringList(inputs.evidence_delta_refs),
    independent_ai_review_receipt_ref: typeof inputs.independent_ai_review_receipt_ref === 'string'
      ? inputs.independent_ai_review_receipt_ref
      : undefined,
    version_ledger_ref: typeof inputs.version_ledger_ref === 'string' ? inputs.version_ledger_ref : undefined,
    rollback_ref: typeof inputs.rollback_ref === 'string' ? inputs.rollback_ref : undefined,
    independent_ai_review_receipt: independentAiReviewReceipt,
    research_memory_graph: researchMemoryGraph,
    analysis_queue_manifest: analysisQueueManifest,
    runtime_event_ledger: runtimeEventLedger,
    provider_switch_hygiene: providerExecutorSwitchHygiene,
    claim_assurance_map: claimAssurance,
    helper_skill_drift_guard: helperSkillDriftGuard,
    assurance_contract: assuranceContract,
    adversarial_review_gate: adversarialReviewGate,
    experiment_queue_recovery: experimentQueueRecovery,
    publication_aftercare_plan: publicationAftercarePlan,
    body_included: researchMemoryGraph?.body_included === true
      || analysisQueueManifest?.body_included === true
      || runtimeEventLedger?.body_included === true
      || providerExecutorSwitchHygiene?.body_included === true
      || claimAssurance?.body_included === true
      || helperSkillDriftGuard?.body_included === true
      || assuranceContract?.body_included === true
      || adversarialReviewGate?.body_included === true
      || experimentQueueRecovery?.body_included === true
      || publicationAftercarePlan?.body_included === true,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

export function mechanismEvolutionInputRefs(
  value: ReturnType<typeof mechanismEvolutionInputsForTask> | undefined,
) {
  if (!value) {
    return [];
  }
  return uniqueRefs([
    ...value.research_wiki_refs,
    ...value.failed_route_refs,
    ...value.reviewer_direct_evidence_refs,
    ...value.analysis_queue_manifest_refs,
    ...value.runtime_event_ledger_refs,
    ...value.provider_switch_hygiene_refs,
    ...value.claim_assurance_map_refs,
    ...value.helper_skill_drift_guard_refs,
    ...value.assurance_contract_refs,
    ...value.adversarial_review_gate_refs,
    ...value.experiment_queue_recovery_refs,
    ...value.publication_aftercare_plan_refs,
    ...value.target_editable_surface_refs,
    ...value.evidence_delta_refs,
    ...(value.independent_ai_review_receipt_ref ? [value.independent_ai_review_receipt_ref] : []),
    ...(value.independent_ai_review_receipt?.receipt_ref ? [value.independent_ai_review_receipt.receipt_ref] : []),
    ...(value.independent_ai_review_receipt?.execution_attempt_ref
      ? [value.independent_ai_review_receipt.execution_attempt_ref]
      : []),
    ...(value.independent_ai_review_receipt?.review_attempt_ref
      ? [value.independent_ai_review_receipt.review_attempt_ref]
      : []),
    ...(value.independent_ai_review_receipt?.request_ref ? [value.independent_ai_review_receipt.request_ref] : []),
    ...(value.independent_ai_review_receipt?.response_ref ? [value.independent_ai_review_receipt.response_ref] : []),
    ...(value.independent_ai_review_receipt?.evidence_refs ?? []),
    ...(value.independent_ai_review_receipt?.forbidden_write_scan_ref
      ? [value.independent_ai_review_receipt.forbidden_write_scan_ref]
      : []),
    ...(value.version_ledger_ref ? [value.version_ledger_ref] : []),
    ...(value.rollback_ref ? [value.rollback_ref] : []),
    ...(value.research_memory_graph?.manifest_refs ?? []),
    ...(value.research_memory_graph?.paper_refs ?? []),
    ...(value.research_memory_graph?.claim_refs ?? []),
    ...(value.research_memory_graph?.experiment_refs ?? []),
    ...(value.research_memory_graph?.failed_idea_refs ?? []),
    ...(value.research_memory_graph?.negative_result_refs ?? []),
    ...(value.research_memory_graph?.reusable_rationale_refs ?? []),
    ...(value.research_memory_graph?.failed_route_refs ?? []),
    ...(value.analysis_queue_manifest?.queue_ref ? [value.analysis_queue_manifest.queue_ref] : []),
    ...(value.analysis_queue_manifest?.manifest_refs ?? []),
    ...(value.analysis_queue_manifest?.items.flatMap((item) => [
      item.ref ?? '',
      ...(item.source_refs ?? []),
    ]) ?? []),
    ...(value.runtime_event_ledger?.event_ledger_refs ?? []),
    ...(value.runtime_event_ledger?.runtime_event_refs ?? []),
    ...(value.runtime_event_ledger?.stage_attempt_event_refs ?? []),
    ...(value.runtime_event_ledger?.provider_event_refs ?? []),
    ...(value.runtime_event_ledger?.executor_event_refs ?? []),
    ...(value.runtime_event_ledger?.blocker_refs ?? []),
    ...(value.provider_switch_hygiene?.provider_switch_hygiene_refs ?? []),
    ...(value.provider_switch_hygiene?.executor_switch_hygiene_refs ?? []),
    ...(value.provider_switch_hygiene?.provider_refs ?? []),
    ...(value.provider_switch_hygiene?.executor_refs ?? []),
    ...(value.provider_switch_hygiene?.switch_receipt_refs ?? []),
    ...(value.provider_switch_hygiene?.no_downgrade_proof_refs ?? []),
    ...(value.claim_assurance_map?.claim_assurance_map_refs ?? []),
    ...(value.claim_assurance_map?.claim_refs ?? []),
    ...(value.claim_assurance_map?.direct_evidence_refs ?? []),
    ...(value.claim_assurance_map?.reviewer_receipt_refs ?? []),
    ...(value.claim_assurance_map?.contradiction_refs ?? []),
    ...(value.claim_assurance_map?.uncertainty_refs ?? []),
    ...(value.claim_assurance_map?.no_unbacked_claim_proof_refs ?? []),
    ...(value.helper_skill_drift_guard?.helper_resolver_chain_refs ?? []),
    ...(value.helper_skill_drift_guard?.source_commit_pin_refs ?? []),
    ...(value.helper_skill_drift_guard?.drift_test_refs ?? []),
    ...(value.helper_skill_drift_guard?.backfill_command_refs ?? []),
    ...(value.helper_skill_drift_guard?.advisory_policy_refs ?? []),
    ...(value.helper_skill_drift_guard?.fail_closed_policy_refs ?? []),
    ...(value.helper_skill_drift_guard?.guard_refs ?? []),
    ...(value.helper_skill_drift_guard?.resolver_chain.flatMap((entry) => [
      entry.resolver_ref ?? '',
      entry.source_commit_pin_ref ?? '',
      entry.drift_test_ref ?? '',
      entry.backfill_command_ref ?? '',
    ]) ?? []),
    ...(value.assurance_contract?.assurance_contract_refs ?? []),
    ...(value.assurance_contract?.input_hash_refs ?? []),
    ...(value.assurance_contract?.external_verifier_refs ?? []),
    ...(value.assurance_contract?.currentness_proof_refs ?? []),
    ...(value.assurance_contract?.assurance_trace_refs ?? []),
    ...(value.assurance_contract?.submission_gate_refs ?? []),
    ...(value.assurance_contract?.no_silent_skip_proof_refs ?? []),
    ...(value.adversarial_review_gate?.adversarial_review_gate_refs ?? []),
    ...(value.adversarial_review_gate?.attack_thread_refs ?? []),
    ...(value.adversarial_review_gate?.defense_thread_refs ?? []),
    ...(value.adversarial_review_gate?.judge_receipt_refs ?? []),
    ...(value.adversarial_review_gate?.negative_evidence_refs ?? []),
    ...(value.adversarial_review_gate?.unresolved_attack_refs ?? []),
    ...(value.adversarial_review_gate?.blocker_refs ?? []),
    ...(value.adversarial_review_gate?.debate_trace_refs ?? []),
    ...(value.experiment_queue_recovery?.experiment_queue_recovery_refs ?? []),
    ...(value.experiment_queue_recovery?.queue_refs ?? []),
    ...(value.experiment_queue_recovery?.state_refs ?? []),
    ...(value.experiment_queue_recovery?.retry_refs ?? []),
    ...(value.experiment_queue_recovery?.retry_reason_refs ?? []),
    ...(value.experiment_queue_recovery?.resource_failure_refs ?? []),
    ...(value.experiment_queue_recovery?.wave_gate_refs ?? []),
    ...(value.experiment_queue_recovery?.stale_worker_cleanup_refs ?? []),
    ...(value.experiment_queue_recovery?.crash_recovery_refs ?? []),
    ...(value.experiment_queue_recovery?.budget_guard_refs ?? []),
    ...(value.publication_aftercare_plan?.publication_aftercare_plan_refs ?? []),
    ...(value.publication_aftercare_plan?.resubmission_plan_refs ?? []),
    ...(value.publication_aftercare_plan?.venue_route_refs ?? []),
    ...(value.publication_aftercare_plan?.talk_package_refs ?? []),
    ...(value.publication_aftercare_plan?.slides_polish_refs ?? []),
    ...(value.publication_aftercare_plan?.overleaf_sync_refs ?? []),
    ...(value.publication_aftercare_plan?.author_handoff_refs ?? []),
    ...(value.publication_aftercare_plan?.external_suite_task_refs ?? []),
  ]);
}
