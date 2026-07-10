import { AGENT_LAB_AUTHORITY_BOUNDARY } from '../agent-lab-authority.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  MECHANISM_REF,
  ROLLBACK_TARGET_REF,
} from '../agent-lab-promotion.ts';

export const AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

export const DEFAULT_EFFICIENCY_NONREGRESSION_REFS = {
  duration_refs: [
    'duration-ref:agent-lab/sample-suite/wall-clock',
    'duration-ref:agent-lab/longline-suite/wall-clock',
  ],
  cost_refs: [
    'cost-ref:agent-lab/domain-owned-profile-estimate',
    'cost-ref:agent-lab/provider-budget-envelope',
  ],
  cache_hit_refs: [
    'cache-hit-ref:agent-lab/source-pack-reuse',
    'cache-hit-ref:agent-lab/stage-context-cache',
  ],
  reuse_scope_refs: [
    'reuse-scope-ref:agent-lab/shared-source-intake',
    'reuse-scope-ref:agent-lab/cross-domain-longline',
  ],
  quality_floor_refs: [
    'quality-floor-ref:agent-lab/domain-owned-scorecard-floor',
    'quality-floor-ref:agent-lab/no-quality-verdict-authority',
  ],
  no_forbidden_write_refs: [
    'no-forbidden-write-ref:agent-lab/sample-suite',
    'no-forbidden-write-ref:agent-lab/longline-suite',
  ],
  owner_route_refs: [
    'owner-route:opl/framework-agent-lab-efficiency',
    'owner-route:domain-owner/quality-floor',
  ],
};

const STAGE_SKILL_HELPER_RECOVERY_REF = 'rollback-ref:agent-lab/integration-contract-last-known-good'; // reuse-first: allow Agent Lab recovery ref, not updater/package manager.
const DOMAIN_OWNER_ROUTE_RECOVERY_REF = 'rollback-ref:agent-lab/no-op-domain-authority'; // reuse-first: allow Agent Lab recovery ref, not updater/package manager.

export const MECHANISM_EDITABLE_SURFACES = [
  {
    surface_ref: 'mechanism-surface:agent-lab/stage-policy',
    surface_kind: 'stage_policy_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:opl/framework-stage-policy',
  },
  {
    surface_ref: 'mechanism-surface:agent-lab/tool-policy',
    surface_kind: 'tool_policy_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:opl/framework-tool-policy',
  },
  {
    surface_ref: 'mechanism-surface:agent-lab/prompt',
    surface_kind: 'prompt_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:domain-owner/prompt-review',
  },
  {
    surface_ref: 'mechanism-surface:agent-lab/rubric-gap',
    surface_kind: 'rubric_gap_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:domain-owner/quality-rubric',
  },
];

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function buildAgentLabIntegrationContractReadModel() {
  const integrationContracts = [
    {
      contract_ref: 'integration-contract:agent-lab/stage-skill-helper',
      integration_kind: 'cross_skill_stage_helper',
      activation_predicate: 'stage_attempt_refs_present && domain_agent_entry_ref_present',
      canonical_entry_ref: 'canonical-entry:opl-agent-lab/run-suite',
      artifact_verifier_ref: 'artifact-verifier:opl-agent-lab/refs-only-suite-result',
      failure_policy: 'typed_blocker_then_owner_route_retry_or_dead_letter',
      failure_outputs: {
        typed_blocker_ref: 'typed-blocker-ref:agent-lab/integration-contract-failed',
        owner_route_ref: 'owner-route:opl/framework-agent-lab',
        retry_or_dead_letter_ref: 'retry-or-dead-letter-ref:agent-lab/integration-contract-failed',
        rollback_ref: STAGE_SKILL_HELPER_RECOVERY_REF,
      },
    },
    {
      contract_ref: 'integration-contract:agent-lab/mechanism-promotion',
      integration_kind: 'mechanism_candidate_promotion',
      activation_predicate: 'mechanism_candidate_ref_present && independent_ai_review_ref_present',
      canonical_entry_ref: 'canonical-entry:opl-agent-lab/evolve',
      artifact_verifier_ref: 'artifact-verifier:opl-agent-lab/mechanism-evolution-result',
      failure_policy: 'block_promotion_emit_evidence_delta_and_rollback_ref',
      failure_outputs: {
        typed_blocker_ref: 'typed-blocker-ref:agent-lab/mechanism-promotion-blocked',
        owner_route_ref: 'owner-route:opl/mechanism-policy-owner',
        retry_or_dead_letter_ref: 'retry-or-dead-letter-ref:agent-lab/mechanism-promotion-blocked',
        rollback_ref: ROLLBACK_TARGET_REF,
      },
    },
    {
      contract_ref: 'integration-contract:agent-lab/domain-owner-route',
      integration_kind: 'domain_owner_route_projection',
      activation_predicate: 'high_risk_surface_ref_present || forbidden_authority_flag_present',
      canonical_entry_ref: 'canonical-entry:opl-agent-lab/owner-route-projection',
      artifact_verifier_ref: 'artifact-verifier:opl-agent-lab/no-domain-authority-write',
      failure_policy: 'fail_closed_with_owner_visible_blocker_ref',
      failure_outputs: {
        typed_blocker_ref: 'typed-blocker-ref:agent-lab/domain-owner-route-required',
        owner_route_ref: 'owner-route:domain-owner/high-risk-surface',
        retry_or_dead_letter_ref: 'retry-or-dead-letter-ref:agent-lab/domain-owner-route-required',
        rollback_ref: DOMAIN_OWNER_ROUTE_RECOVERY_REF,
      },
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_integration_contract_read_model',
    version: 'opl-agent-lab.v1.integration-contracts',
    read_model_id: stableId('oalic', [integrationContracts]),
    status: 'ready_for_cross_surface_integration_gates',
    refs_only: true,
    integration_contracts: integrationContracts,
    required_contract_fields: [
      'activation_predicate',
      'canonical_entry_ref',
      'artifact_verifier_ref',
      'failure_policy',
      'failure_outputs',
    ],
    summary: {
      contract_count: integrationContracts.length,
      fail_closed_contract_count: integrationContracts.filter((contract) =>
        contract.failure_policy.includes('fail_closed') || contract.failure_policy.includes('block')).length,
      rollback_ref_count: unique(integrationContracts.map((contract) => contract.failure_outputs.rollback_ref)).length,
      owner_route_ref_count: unique(integrationContracts.map((contract) =>
        contract.failure_outputs.owner_route_ref)).length,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabReviewTraceLedger(sourceRefs: string[] = []) {
  const traceEntries = [
    {
      trace_ref: stableId('oalrtl', ['independent-ai-review', MECHANISM_REF, sourceRefs]),
      trace_kind: 'independent_ai_reviewer_trace_ref',
      request_ref: 'review-request-ref:agent-lab/mechanism-candidate',
      response_ref: 'review-response-ref:agent-lab/mechanism-candidate',
      evidence_refs: [
        'evidence-ref:agent-lab/no-forbidden-write-proof',
        'evidence-ref:agent-lab/regression-suite-result',
        ...sourceRefs,
      ],
      reviewed_diff_ref: 'diff-ref:agent-lab/mechanism-candidate',
      contract_ref: 'contract:opl-framework/agent-lab-contract',
      test_result_ref: 'test-result-ref:agent-lab/mechanism-promotion',
      reviewer_agent_ref: 'agent-ref:opl-agent-lab/independent-ai-reviewer',
      review_context_inherits_executor_context: false,
      no_shared_context: true,
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      writes_owner_receipt: false,
    },
    {
      trace_ref: stableId('oalrtl', ['web-research', MECHANISM_REF, sourceRefs]),
      trace_kind: 'web_research_trace_ref',
      request_ref: 'web-research-request-ref:agent-lab/mechanism-context',
      response_ref: 'web-research-response-ref:agent-lab/mechanism-context',
      evidence_refs: [
        'evidence-ref:agent-lab/external-pattern-research',
        'source-ref:github/wanshuiyin/Auto-claude-code-research-in-sleep',
        ...sourceRefs,
      ],
      reviewed_diff_ref: 'diff-ref:agent-lab/mechanism-candidate',
      contract_ref: 'contract:opl-framework/agent-lab-contract',
      test_result_ref: 'test-result-ref:agent-lab/external-pattern-intake',
      reviewer_agent_ref: 'agent-ref:opl-agent-lab/research-reviewer',
      review_context_inherits_executor_context: false,
      no_shared_context: true,
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      writes_owner_receipt: false,
    },
    {
      trace_ref: stableId('oalrtl', ['mechanism-patch', MECHANISM_REF, sourceRefs]),
      trace_kind: 'mechanism_patch_trace_ref',
      request_ref: 'mechanism-patch-request-ref:agent-lab/default-stage-led-agent-mechanism',
      response_ref: 'mechanism-patch-response-ref:agent-lab/default-stage-led-agent-mechanism',
      evidence_refs: [
        'evidence-ref:agent-lab/log-mined-candidate',
        'evidence-ref:agent-lab/integration-contract-check',
        ...sourceRefs,
      ],
      reviewed_diff_ref: 'diff-ref:agent-lab/mechanism-candidate',
      contract_ref: 'contract:opl-framework/agent-lab-contract',
      test_result_ref: 'test-result-ref:agent-lab/evolution-suite',
      reviewer_agent_ref: 'agent-ref:opl-agent-lab/mechanism-patch-generator',
      review_context_inherits_executor_context: true,
      no_shared_context: false,
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      writes_owner_receipt: false,
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_review_trace_ledger',
    version: 'opl-agent-lab.v1.review-trace-ledger',
    ledger_ref: stableId('oalrtl', [traceEntries, sourceRefs]),
    status: 'ready_for_mechanism_patch_replay_and_audit',
    refs_only: true,
    trace_entries: traceEntries,
    summary: {
      trace_count: traceEntries.length,
      independent_no_shared_context_count: traceEntries.filter((entry) =>
        entry.no_shared_context && entry.review_context_inherits_executor_context === false).length,
      evidence_ref_count: unique(traceEntries.flatMap((entry) => entry.evidence_refs)).length,
      request_ref_count: unique(traceEntries.map((entry) => entry.request_ref)).length,
      response_ref_count: unique(traceEntries.map((entry) => entry.response_ref)).length,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
