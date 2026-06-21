import type { FrameworkContracts } from '../types.ts';
import { buildDomainProgressTransitionRuntimeGuardReadback } from './domain-progress-runtime-guard.ts';
import { buildOrdinaryProgressGuardReadback } from './ordinary-progress-guard.ts';
import { buildRuntimeEnvironmentSubstrateGuardReadback } from './runtime-environment-guard.ts';
import type { JsonRecord } from './shared.ts';
import {
  DEFERRED_LIVE_EVIDENCE,
  NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
} from './shared.ts';

export function buildPrimitiveRuntimeOwnerRouteGuardReadback(contracts: FrameworkContracts) {
  const domainProgressGuard = buildDomainProgressTransitionRuntimeGuardReadback(contracts);
  const runtimeEnvironmentGuard = buildRuntimeEnvironmentSubstrateGuardReadback(contracts);
  const ordinaryProgressGuard = buildOrdinaryProgressGuardReadback(contracts);
  const runtimeEnvironmentAuthority =
    runtimeEnvironmentGuard.authority_boundary as JsonRecord;
  const guardStatusChecks = [
    domainProgressGuard.policy_adapter_contract.source_export_matches_stage_route_scheduler_contract,
    runtimeEnvironmentGuard.contract_identity.implementation_status
      === 'runtime_lock_materializer_cache_prune_run_context_guard_available',
    runtimeEnvironmentAuthority.can_write_domain_truth === false,
    runtimeEnvironmentGuard.false_ready_guard.missing_run_context_allows_host_environment_fallback === false,
    ordinaryProgressGuard.owner_answer_admission_gate.source_schema.owner_answer_required_fields_present,
    ordinaryProgressGuard.owner_route_schema.owner_route_required_fields_present,
    ordinaryProgressGuard.typed_blocker_schema.typed_blocker_required_fields_present,
    ordinaryProgressGuard.human_gate_boundary.opl_can_make_human_decision === false,
    ordinaryProgressGuard.no_second_truth_guard.tranche_backlog_is_execution_index_only === true,
  ];
  return {
    surface_kind: 'opl_primitive_runtime_owner_route_guard_readback',
    readback_role:
      'aggregate_opl_primitive_structure_gate_not_live_evidence_not_domain_ready',
    owner: 'one-person-lab',
    milestone_id: 'opl_primitive_runtime_owner_route_guard',
    status: guardStatusChecks.every(Boolean)
      ? 'closed_structure_gate_not_live_evidence'
      : 'blocked_structure_gate',
    source_guard_refs: {
      domain_progress_transition_runtime_guard:
        'framework_tranche_backlog.domain_progress_transition_runtime_guard',
      runtime_environment_substrate_guard:
        'framework_tranche_backlog.runtime_environment_substrate_guard',
      ordinary_progress_guard:
        'framework_tranche_backlog.ordinary_progress_guard',
    },
    source_contract_refs: [
      'contracts/opl-framework/runtime-environment-substrate-contract.json',
      'contracts/opl-framework/stage-route-scheduler-contract.json#stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice',
      'contracts/family-orchestration/family-owner-route.schema.json',
      'contracts/opl-framework/owner-answer.schema.json',
      'contracts/opl-framework/stage-typed-blocker.schema.json',
      'contracts/opl-framework/target-operating-architecture-contract.json',
    ],
    source_cli_readback_refs: [
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.primitive_runtime_owner_route_guard',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.domain_progress_transition_runtime_guard',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.runtime_environment_substrate_guard',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.ordinary_progress_guard',
      'opl framework readiness --family-defaults --json .framework_readiness.current_owner_delta',
    ],
    runtime_environment_summary: {
      contract_state: runtimeEnvironmentGuard.contract_identity.state,
      implementation_status: runtimeEnvironmentGuard.contract_identity.implementation_status,
      ordinary_path_default_mode: runtimeEnvironmentGuard.ordinary_path.default_mode,
      domain_agents_declare_dependency_intent_only:
        runtimeEnvironmentGuard.ordinary_path.domain_agents_declare_dependency_intent_only,
      host_environment_fallback_allowed:
        runtimeEnvironmentGuard.dependency_prepare_policy.host_environment_fallback_allowed,
      run_context_identity_required:
        runtimeEnvironmentGuard.dependency_prepare_policy.run_context_identity_required,
    },
    domain_progress_runtime_summary: {
      runtime_id: domainProgressGuard.runtime_identity.runtime_id,
      runtime_owner: domainProgressGuard.runtime_identity.runtime_owner,
      policy_adapter_matches_contract:
        domainProgressGuard.policy_adapter_contract.source_export_matches_stage_route_scheduler_contract,
      accepted_request_surfaces:
        domainProgressGuard.policy_adapter_contract.accepted_request_surfaces,
      complete_transaction_requires:
        domainProgressGuard.physical_persistence_refs.live_readback_contract.complete_transaction_requires,
      read_model_projection_consumable_only_when_transaction_complete:
        domainProgressGuard.physical_persistence_refs.live_readback_contract
          .projection_metadata_consumable_only_when_transaction_complete,
      replay_audit_consumable_only_when_complete:
        domainProgressGuard.physical_persistence_refs.live_readback_contract
          .replay_audit_consumable_only_when_complete,
    },
    ordinary_route_summary: {
      default_planning_root: ordinaryProgressGuard.ordinary_route_policy.default_planning_root,
      owner_answer_schema_ready:
        ordinaryProgressGuard.owner_answer_admission_gate.source_schema
          .owner_answer_required_fields_present,
      owner_route_schema_ready:
        ordinaryProgressGuard.owner_route_schema.owner_route_required_fields_present,
      typed_blocker_schema_ready:
        ordinaryProgressGuard.typed_blocker_schema.typed_blocker_required_fields_present,
      human_gate_is_terminal_input:
        ordinaryProgressGuard.human_gate_boundary.human_gate_is_accepted_terminal_input,
      no_second_truth_guard_active:
        ordinaryProgressGuard.no_second_truth_guard.tranche_backlog_is_execution_index_only,
    },
    structural_closeout_guard: {
      can_close_non_live_structure_gate: guardStatusChecks.every(Boolean),
      required_current_truth_surfaces: [
        'runtime_environment_substrate_guard',
        'domain_progress_transition_runtime_guard',
        'ordinary_progress_guard',
        'owner_answer_admission_gate',
        'owner_route_schema',
        'typed_blocker_schema',
        'human_gate_boundary',
        'no_second_truth_guard',
      ],
      deferred_evidence: [
        'domain_owner_receipt_followthrough',
        'domain_typed_blocker_followthrough',
        'human_gate_decision_followthrough',
        ...DEFERRED_LIVE_EVIDENCE,
      ],
      cannot_claim: [
        'runtime_ready',
        'domain_ready',
        'App_release_ready',
        'production_ready',
        'provider_long_soak_complete',
        'owner_receipt_signed',
        'typed_blocker_created',
        'human_decision_made',
        'full_goal_complete',
      ],
    },
    authority_boundary: {
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      primitive_guard_can_write_domain_truth: false,
      primitive_guard_can_mutate_runtime_ledger: false,
      primitive_guard_can_sign_owner_receipt: false,
      primitive_guard_can_create_typed_blocker: false,
      primitive_guard_can_make_human_decision: false,
      primitive_guard_can_claim_runtime_ready: false,
      primitive_guard_can_claim_domain_ready: false,
      primitive_guard_can_claim_app_release_ready: false,
      primitive_guard_can_claim_production_ready: false,
    },
    false_ready_guard: {
      runtime_environment_guard_closed_can_claim_runtime_ready: false,
      domain_progress_runtime_guard_closed_can_claim_domain_progress: false,
      ordinary_route_guard_closed_can_claim_domain_ready: false,
      owner_answer_schema_ready_can_claim_owner_answer_received: false,
      typed_blocker_schema_ready_can_create_typed_blocker: false,
      human_gate_boundary_ready_can_make_human_decision: false,
      no_second_truth_guard_ready_can_claim_full_goal_complete: false,
      provider_completion_can_claim_owner_answer: false,
      current_owner_delta_present_can_claim_domain_ready: false,
    },
  };
}
