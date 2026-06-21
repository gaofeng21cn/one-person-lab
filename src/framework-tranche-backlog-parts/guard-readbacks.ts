import path from 'node:path';

import {
  DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
} from '../family-runtime-domain-progress-transition-runtime.ts';
import {
  memoryArtifactLifecycleEvidenceAuthorityBoundary,
} from '../memory-artifact-lifecycle-evidence-ledger.ts';
import type { FrameworkContracts } from '../types.ts';
import {
  readDomainPackCompilerContract,
  readDomainPackCompilerFamilyReadback,
  readDomainProgressRuntimeFirstSliceContract,
  readGeneratedInterfacesFamilyReadback,
  readRuntimeEnvironmentSubstrateContract,
  sameStringSet,
  schemaIdentityFromContract,
} from './contract-readers.ts';
import type { GeneratedHostedBoundarySurface, JsonRecord } from './shared.ts';
import {
  DEFERRED_LIVE_EVIDENCE,
  GENERATED_HOSTED_BOUNDARY_AUTHORITY,
  MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES,
  NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  ORDINARY_PROGRESS_GUARD_AUTHORITY,
} from './shared.ts';

export function buildDomainProgressTransitionRuntimeGuardReadback(contracts: FrameworkContracts) {
  const firstSlice = readDomainProgressRuntimeFirstSliceContract(contracts.contractsDir);
  const sourcePolicy = DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT;
  const policyAdapterContract = firstSlice.policy_adapter_contract;
  return {
    surface_kind: 'opl_domain_progress_transition_runtime_guard_readback',
    readback_role:
      'domain_progress_transition_runtime_policy_adapter_boundary_not_domain_ready_not_live_evidence',
    owner: 'one-person-lab',
    source_contract_ref:
      'contracts/opl-framework/stage-route-scheduler-contract.json#stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice',
    source_api_readback_refs: [
      'normalizeDomainProgressTransitionCommand',
      'buildDomainProgressTransitionRuntimeResult',
      'appendDomainProgressTransitionRuntimeResultJsonl',
      'readDomainProgressTransitionRuntimeReadbackJsonl',
      'auditDomainProgressTransitionReplay',
      'normalizeDomainProgressPolicyAdapterRequest',
    ],
    source_cli_readback_refs: [
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.domain_progress_transition_runtime_guard',
      'opl family-runtime current-control provider-admission readback carries opl_domain_progress_transition_runtime_live_readback',
    ],
    contract_identity: {
      contract_kind: firstSlice.contract_kind,
      owner: firstSlice.owner,
      surface_kind: firstSlice.surface_kind,
      schema_version: firstSlice.schema_version,
      status: firstSlice.status,
    },
    runtime_identity: {
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      runtime_owner: 'one-person-lab',
      module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
      not_a_new_brand_module: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.not_a_new_brand_module,
    },
    implementation_refs: { ...firstSlice.implementation_refs },
    physical_persistence_refs: {
      runtime_log_read_api: firstSlice.physical_persistence_refs.runtime_log_read_api,
      runtime_log_append_api: firstSlice.physical_persistence_refs.runtime_log_append_api,
      idempotency_readback_api: firstSlice.physical_persistence_refs.idempotency_readback_api,
      runtime_live_readback_api: firstSlice.physical_persistence_refs.runtime_live_readback_api,
      replay_audit_api: firstSlice.physical_persistence_refs.replay_audit_api,
      storage_contract: firstSlice.physical_persistence_refs.storage_contract,
      focused_test: firstSlice.physical_persistence_refs.focused_test,
      live_readback_contract: {
        complete_transaction_status:
          firstSlice.runtime_live_readback_contract.complete_transaction_status,
        incomplete_transaction_status:
          firstSlice.runtime_live_readback_contract.incomplete_transaction_status,
        complete_transaction_requires:
          firstSlice.runtime_live_readback_contract.complete_transaction_requires,
        incomplete_transaction_fail_closed_reason:
          firstSlice.runtime_live_readback_contract.incomplete_transaction_fail_closed_reason,
        incomplete_transaction_outcome_kind:
          firstSlice.runtime_live_readback_contract.incomplete_transaction_outcome_kind,
        projection_metadata_complete_role:
          firstSlice.runtime_live_readback_contract.projection_metadata_complete_role,
        projection_metadata_incomplete_role:
          firstSlice.runtime_live_readback_contract.projection_metadata_incomplete_role,
        projection_metadata_consumable_only_when_transaction_complete:
          firstSlice.runtime_live_readback_contract
            .projection_metadata_consumable_only_when_transaction_complete,
        replay_audit_consumable_only_when_complete:
          firstSlice.runtime_live_readback_contract.replay_audit_consumable_only_when_complete,
        authority_boundary:
          firstSlice.runtime_live_readback_contract.authority_boundary,
      },
    },
    brand_module_partition: { ...firstSlice.brand_module_partition },
    allowed_transition_decisions: [...firstSlice.allowed_transition_decisions],
    decision_surface_policy: { ...firstSlice.decision_surface_policy },
    not_complete_claims: [...firstSlice.not_complete_claims],
    policy_adapter_contract: {
      ...policyAdapterContract,
      source_export_surface_kind: sourcePolicy.surface_kind,
      source_export_runtime_id: sourcePolicy.runtime_id,
      source_export_request_surfaces: [...sourcePolicy.request_surfaces],
      source_export_domain_repo_must_not_create: [
        ...sourcePolicy.domain_repo_must_not_create,
      ],
      source_export_matches_stage_route_scheduler_contract:
        sourcePolicy.surface_kind === policyAdapterContract.surface_kind
        && sourcePolicy.runtime_id === policyAdapterContract.runtime_id
        && sourcePolicy.runtime_owner === policyAdapterContract.runtime_owner
        && sourcePolicy.adapter_role === policyAdapterContract.adapter_role
        && sourcePolicy.first_consumer === policyAdapterContract.first_consumer
        && sameStringSet(
          [...sourcePolicy.request_surfaces],
          policyAdapterContract.accepted_request_surfaces,
        )
        && sourcePolicy.provider_completion_is_domain_ready
          === policyAdapterContract.authority_boundary.provider_completion_is_domain_ready
        && sourcePolicy.opl_runtime_can_write_domain_truth
          === policyAdapterContract.authority_boundary.opl_runtime_can_write_domain_truth,
    },
    authority_boundary: {
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      runtime_can_write_domain_truth: false,
      runtime_can_write_memory_body: false,
      runtime_can_mutate_artifact_body: false,
      runtime_can_sign_owner_receipt: false,
      runtime_can_create_typed_blocker: false,
      runtime_can_authorize_quality_verdict: false,
      runtime_can_authorize_publication_ready: false,
      policy_adapter_can_create_opl_outbox_record:
        policyAdapterContract.authority_boundary.adapter_can_create_opl_outbox_record,
      policy_adapter_can_create_owner_receipt:
        policyAdapterContract.authority_boundary.adapter_can_create_owner_receipt,
      policy_adapter_can_create_typed_blocker:
        policyAdapterContract.authority_boundary.adapter_can_create_typed_blocker,
      provider_completion_is_domain_ready:
        policyAdapterContract.authority_boundary.provider_completion_is_domain_ready,
      provider_completion_is_domain_completion:
        policyAdapterContract.authority_boundary.provider_completion_is_domain_completion,
      readback_guard_can_claim_provider_long_soak_complete: false,
      readback_guard_can_claim_live_evidence_complete: false,
    },
    false_ready_guard: {
      complete_transaction_can_claim_domain_ready: false,
      complete_transaction_can_claim_publication_ready: false,
      read_model_projection_consumable_can_claim_domain_progress: false,
      replay_audit_ready_can_claim_provider_long_soak_complete: false,
      non_advancing_apply_can_claim_paper_progress: false,
      human_gate_resume_token_can_make_human_decision: false,
      policy_adapter_valid_can_claim_owner_receipt: false,
      policy_adapter_valid_can_create_typed_blocker: false,
      provider_completion_can_claim_domain_ready:
        policyAdapterContract.authority_boundary.provider_completion_is_domain_ready,
      stage_route_false_authority_flags: {
        ...firstSlice.stage_route_false_authority_flags,
      },
    },
  };
}

export function buildRuntimeEnvironmentSubstrateGuardReadback(contracts: FrameworkContracts) {
  const runtimeEnvironment = readRuntimeEnvironmentSubstrateContract(contracts.contractsDir);
  return {
    surface_kind: 'opl_runtime_environment_substrate_guard_readback',
    readback_role:
      'runtime_environment_substrate_owner_policy_not_domain_ready_not_live_evidence_not_app_release_ready',
    owner: 'one-person-lab',
    source_contract_ref:
      'contracts/opl-framework/runtime-environment-substrate-contract.json#opl-runtime-environment-substrate.v1',
    source_cli_readback_refs: [
      'opl runtime env contract --json .runtime_environment.contract',
      'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform> --json',
      'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> --apply --json',
      'opl runtime env verify --runtime-root <path> --json',
      'opl runtime env cache inventory --json',
      'opl runtime env cache prune --apply --json',
      'opl runtime env run-context --domain <domain> --profile <profile> --json',
    ],
    contract_identity: {
      contract_id: runtimeEnvironment.contract_id,
      schema_version: runtimeEnvironment.schema_version,
      owner: runtimeEnvironment.owner,
      state: runtimeEnvironment.state,
      implementation_status: runtimeEnvironment.implementation_status,
      target_planned: runtimeEnvironment.target_planned,
    },
    ordinary_path: {
      ...runtimeEnvironment.ordinary_path,
      ordinary_path_can_schedule_domain_stage: false,
      ordinary_path_can_write_domain_truth: false,
    },
    materialization_policy: {
      default_command_mode: runtimeEnvironment.materialization_policy.default_command_mode,
      writes_development_checkout: runtimeEnvironment.materialization_policy.writes_development_checkout,
      writes_domain_repo: runtimeEnvironment.materialization_policy.writes_domain_repo,
      materializer_landed: runtimeEnvironment.materialization_policy.materializer_landed,
      writes_runtime_root_only_with_apply:
        runtimeEnvironment.materialization_policy.writes_runtime_root_only_with_apply,
      materialization_receipt_required:
        runtimeEnvironment.materialization_policy.materialization_receipt_required,
      protect_current_and_rollback_pointers:
        runtimeEnvironment.materialization_policy.protect_current_and_rollback_pointers,
      cleanup_apply_requires_receipt:
        runtimeEnvironment.materialization_policy.cleanup_apply_requires_receipt,
    },
    cache_policy: {
      cache_key_inputs: runtimeEnvironment.cache_policy.cache_key_inputs,
      cache_hit_counts_as_ready: runtimeEnvironment.cache_policy.cache_hit_counts_as_ready,
      cache_miss_counts_as_readiness_failure:
        runtimeEnvironment.cache_policy.cache_miss_counts_as_readiness_failure,
      materialization_failure_counts_as_runtime_environment_failure:
        runtimeEnvironment.cache_policy.materialization_failure_counts_as_runtime_environment_failure,
    },
    cache_inventory_policy: {
      status: runtimeEnvironment.cache_inventory_policy.status,
      inventory_may_be_empty_without_failure:
        runtimeEnvironment.cache_inventory_policy.inventory_may_be_empty_without_failure,
      prune_apply_requires_materialization_receipt:
        runtimeEnvironment.cache_inventory_policy.prune_apply_requires_materialization_receipt,
      deletes_domain_artifacts: runtimeEnvironment.cache_inventory_policy.deletes_domain_artifacts,
      deletes_development_checkout: runtimeEnvironment.cache_inventory_policy.deletes_development_checkout,
    },
    dependency_prepare_policy: {
      status: runtimeEnvironment.dependency_prepare_policy.status,
      writes_dependency_lock: runtimeEnvironment.dependency_prepare_policy.writes_dependency_lock,
      writes_dependency_receipt: runtimeEnvironment.dependency_prepare_policy.writes_dependency_receipt,
      writes_run_context_on_success:
        runtimeEnvironment.dependency_prepare_policy.writes_run_context_on_success,
      run_context_consumer_preflight:
        runtimeEnvironment.dependency_prepare_policy.run_context_consumer_preflight,
      run_context_identity_required:
        runtimeEnvironment.dependency_prepare_policy.run_context_identity_required,
      dependency_lock_counts_as_materialized_runtime_lock:
        runtimeEnvironment.dependency_prepare_policy.dependency_lock_counts_as_materialized_runtime_lock,
      installs_packages: runtimeEnvironment.dependency_prepare_policy.installs_packages,
      host_environment_fallback_allowed:
        runtimeEnvironment.dependency_prepare_policy.host_environment_fallback_allowed,
      writes_domain_truth: runtimeEnvironment.dependency_prepare_policy.writes_domain_truth,
      writes_runtime_root: runtimeEnvironment.dependency_prepare_policy.writes_runtime_root,
      can_claim_provider_ready:
        runtimeEnvironment.dependency_prepare_policy.can_claim_provider_ready,
      can_claim_runtime_ready: runtimeEnvironment.dependency_prepare_policy.can_claim_runtime_ready,
      can_claim_domain_ready: runtimeEnvironment.dependency_prepare_policy.can_claim_domain_ready,
      can_claim_publication_ready:
        runtimeEnvironment.dependency_prepare_policy.can_claim_publication_ready,
    },
    run_context_consumer_policy: {
      ...runtimeEnvironment.run_context_consumer_policy,
    },
    required_readback_claim_fields: [...runtimeEnvironment.required_readback_claim_fields],
    readback_commands: [...runtimeEnvironment.readback_commands],
    forbidden_claims: [...runtimeEnvironment.forbidden_claims],
    live_evidence_deferred: [...runtimeEnvironment.live_evidence_deferred],
    authority_boundary: {
      ...runtimeEnvironment.authority_boundary,
      runtime_environment_guard_can_claim_plan_completion: false,
      runtime_environment_guard_can_claim_provider_long_soak_complete: false,
      runtime_environment_guard_can_claim_live_evidence_complete: false,
    },
    false_ready_guard: {
      cache_hit_counts_as_ready: runtimeEnvironment.cache_policy.cache_hit_counts_as_ready,
      cache_miss_counts_as_readiness_failure:
        runtimeEnvironment.cache_policy.cache_miss_counts_as_readiness_failure,
      descriptor_exists_can_claim_runtime_materialized: false,
      run_context_exists_can_claim_provider_ready: false,
      missing_run_context_allows_host_environment_fallback: false,
      run_context_target_mismatch_allows_consumer_execution: false,
      materialization_skeleton_can_claim_runtime_ready: false,
      materialization_receipt_can_claim_domain_ready: false,
      verification_receipt_can_claim_app_release_ready: false,
      runtime_environment_receipt_can_claim_owner_receipt: false,
      runtime_environment_readback_can_create_typed_blocker: false,
      runtime_environment_readback_can_schedule_domain_stage: false,
      runtime_environment_guard_can_claim_production_ready: false,
    },
  };
}

export function buildOrdinaryProgressGuardReadback(contracts: FrameworkContracts) {
  const contractsRoot = path.dirname(contracts.contractsDir);
  const ownerRouteSchema = schemaIdentityFromContract(
    path.join(contractsRoot, 'family-orchestration', 'family-owner-route.schema.json'),
    'family-owner-route.schema.json',
    ['surface_kind', 'version'],
  );
  const typedBlockerSchema = schemaIdentityFromContract(
    path.join(contracts.contractsDir, 'stage-typed-blocker.schema.json'),
    'stage-typed-blocker.schema.json',
    ['surface_kind', 'schema_version'],
  );
  const ownerAnswerSchema = schemaIdentityFromContract(
    path.join(contracts.contractsDir, 'owner-answer.schema.json'),
    'owner-answer.schema.json',
    ['surface_kind', 'schema_version'],
  );

  return {
    surface_kind: 'opl_ordinary_progress_owner_route_guard_readback',
    readback_role:
      'current_owner_delta_single_ordinary_route_guard_not_live_evidence_not_domain_ready',
    owner: 'one-person-lab',
    source_contract_refs: [
      'contracts/family-orchestration/family-owner-route.schema.json',
      'contracts/opl-framework/owner-answer.schema.json',
      'contracts/opl-framework/stage-typed-blocker.schema.json',
      'contracts/opl-framework/progress-delta-receipt.schema.json',
      'contracts/opl-framework/target-operating-architecture-contract.json',
    ],
    source_cli_readback_refs: [
      'opl framework readiness --family-defaults --json .framework_readiness.current_owner_delta',
      'opl framework readiness --family-defaults --json .framework_readiness.owner_delta_handoff_summary',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.ordinary_progress_guard',
    ],
    ordinary_route_policy: {
      default_planning_root: 'current_owner_delta',
      accepted_terminal_inputs: [
        'domain_owner_receipt',
        'domain_typed_blocker',
        'human_gate_decision',
        'quality_export_review_receipt',
        'app_release_verdict',
        'route_back_evidence',
        'progress_delta_receipt',
      ],
      next_delta_derivation: 'owner_answer_or_typed_blocker_or_human_gate_to_next_current_owner_delta',
      raw_worklist_policy: 'audit_sidecar_or_full_detail_only_not_default_next_action',
      provider_trace_policy: 'runway_repair_or_diagnostic_only_not_domain_owner_answer',
      private_residue_policy: 'cleanup_lane_only_requires_no_active_caller_and_owner_gate',
    },
    owner_answer_admission_gate: {
      surface_kind: 'opl_owner_answer_admission_gate_readback',
      gate_role:
        'ordinary_terminal_input_shape_guard_for_current_owner_delta_derivation_not_owner_authority',
      source_schema: {
        surface_kind: ownerAnswerSchema.consts.surface_kind,
        schema_version: ownerAnswerSchema.consts.schema_version,
        required_fields: ownerAnswerSchema.required,
        owner_answer_required_fields_present: [
          'answer_id',
          'domain',
          'answer_kind',
          'answer_status',
          'answer_ref',
          'target_delta_ref',
          'audit_refs',
          'authority_boundary',
        ].every((field) => ownerAnswerSchema.required.includes(field)),
      },
      accepted_answer_kinds: [
        'owner_receipt',
        'typed_blocker',
        'human_decision',
        'route_back',
      ],
      accepted_answer_statuses: [
        'accepted',
        'blocked',
        'rejected',
        'route_back',
        'needs_human',
      ],
      derives_next_current_owner_delta_from: [
        'owner_answer_ref',
        'target_delta_ref',
        'effective_delta_ref',
        'stage_ref',
        'attempt_ref',
        'audit_refs',
      ],
      default_next_action_source_priority: [
        'fresh_current_owner_delta',
        'owner_answer_admission_gate',
        'typed_blocker_or_human_gate_projection',
        'route_back_evidence',
      ],
      rejected_default_roots: [
        'raw_worklist',
        'provider_trace',
        'refs_only_evidence_ledger',
        'cleanup_work_order',
        'release_cohort_diagnostic',
        'brand_l5_evidence_tail',
        'stale_projection_cache',
      ],
      required_followthrough:
        'accepted_owner_answer_or_typed_blocker_or_human_decision_ref_then_rederive_current_owner_delta',
      authority_boundary: {
        opl_can_consume_owner_answer: true,
        opl_can_fold_answer_into_delta: true,
        opl_can_sign_domain_owner_answer: false,
        opl_can_create_typed_blocker: false,
        opl_can_make_human_decision: false,
        opl_can_infer_domain_truth_from_answer: false,
        opl_can_authorize_domain_ready: false,
        opl_can_authorize_quality_verdict: false,
        opl_can_mutate_artifact_body: false,
        owner_answer_readback_can_claim_live_evidence_complete: false,
      },
      false_ready_guard: {
        owner_answer_shape_valid_can_claim_domain_ready: false,
        owner_answer_ref_observed_can_claim_stage_success: false,
        route_back_ref_can_claim_progress_complete: false,
        human_decision_required_can_claim_human_decision_complete: false,
        progress_delta_receipt_can_replace_domain_owner_answer: false,
      },
    },
    owner_route_schema: {
      surface_kind: ownerRouteSchema.consts.surface_kind,
      version: ownerRouteSchema.consts.version,
      required_fields: ownerRouteSchema.required,
      owner_route_required_fields_present: [
        'target_domain_id',
        'route_id',
        'route_epoch',
        'source_fingerprint',
        'next_owner',
        'allowed_actions',
        'idempotency_key',
        'status',
        'handoff_refs',
        'projection_refs',
      ].every((field) => ownerRouteSchema.required.includes(field)),
      authority_role:
        'route_projection_for_current_truth_handoff_allowed_actions_idempotency_and_refs_only_projection',
    },
    typed_blocker_schema: {
      surface_kind: typedBlockerSchema.consts.surface_kind,
      schema_version: typedBlockerSchema.consts.schema_version,
      required_fields: typedBlockerSchema.required,
      typed_blocker_required_fields_present: [
        'blocker_id',
        'domain_id',
        'stage_id',
        'stage_run_id',
        'generation',
        'blocked_surface',
        'missing_or_failed_input',
        'required_owner',
        'next_safe_action',
        'stability_or_retry_policy',
        'authority_boundary',
      ].every((field) => typedBlockerSchema.required.includes(field)),
      authority_role:
        'domain_or_human_owner_signed_blocker_consumed_by_opl_not_created_by_opl',
    },
    human_gate_boundary: {
      surface_kind: 'opl_human_gate_boundary_projection',
      human_gate_is_accepted_terminal_input: true,
      opl_can_request_human_gate: true,
      opl_can_make_human_decision: false,
      human_gate_counts_as_ready_claim: false,
      required_followthrough: 'owner_or_human_decision_ref_then_next_current_owner_delta',
    },
    no_second_truth_guard: {
      active_gap_owner_ref: 'docs/active/current-state-vs-ideal-gap.md',
      tranche_backlog_is_execution_index_only: true,
      readiness_readback_is_projection_only: true,
      worklist_and_evidence_vault_are_audit_sidecars: true,
      app_operator_projection_can_not_replace_current_owner_delta: true,
    },
    authority_boundary: { ...ORDINARY_PROGRESS_GUARD_AUTHORITY },
    false_ready_guard: {
      current_owner_delta_present_can_claim_goal_complete: false,
      owner_route_current_can_claim_domain_ready: false,
      typed_blocker_ref_can_claim_stage_success: false,
      human_gate_ref_can_claim_human_decision_complete: false,
      progress_delta_receipt_can_claim_artifact_ready: false,
      provider_completion_can_claim_owner_answer: false,
      readback_guard_can_claim_live_evidence_complete: false,
    },
  };
}

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

export function buildGeneratedHostedBoundaryReadback(contracts: FrameworkContracts) {
  const generated = readDomainPackCompilerContract(contracts.contractsDir).generated_interface_bundle;
  const packCompilerFamilyReadback = readDomainPackCompilerFamilyReadback(contracts);
  const generatedInterfacesFamilyReadback = readGeneratedInterfacesFamilyReadback(contracts);
  const surfaces = generated.supported_derived_surfaces.map((surface) => ({
    surface_id: surface.surface_id,
    owner: surface.owner,
    default_entry: surface.default_entry,
    source_catalogs: [...surface.source_catalogs],
    domain_repo_role: surface.domain_repo_role,
    domain_repo_can_own_generated_surface: surface.domain_repo_can_own_generated_surface,
  })) satisfies GeneratedHostedBoundarySurface[];

  return {
    surface_kind: 'opl_generated_hosted_surface_authority_boundary_readback',
    readback_role:
      'generated_hosted_surface_owner_policy_not_domain_ready_not_live_evidence_not_default_caller_cutover',
    owner: 'one-person-lab',
    source_contract_ref: 'contracts/opl-framework/domain-pack-compiler-contract.json#generated_interface_bundle',
    source_api_readback_refs: [
      'buildDomainPackCompilerList({ familyDefaults: true })',
      "buildGeneratedAgentInterfaces(['--family-defaults'])",
      'buildGeneratedSurfaceConsumptionBundle',
      'buildActiveCallerTargetProof',
    ],
    source_cli_readback_refs: [
      'opl agents pack-compiler --family-defaults --json',
      'opl agents interfaces --family-defaults --json',
      'opl agents interfaces --family-defaults --format product-entry --json',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.generated_hosted_surface_boundary',
    ],
    generated_surface_owner: generated.generated_surface_owner,
    domain_repo_can_own_generated_surface: generated.domain_repo_can_own_generated_surface,
    default_entry_policy: {
      surface_kind: generated.default_entry_policy.surface_kind,
      status: generated.default_entry_policy.status,
      owner: generated.default_entry_policy.owner,
      domain_repo_wrapper_policy: generated.default_entry_policy.domain_repo_wrapper_policy,
      domain_repo_can_own_default_entry: generated.default_entry_policy.domain_repo_can_own_default_entry,
      default_entry_surface_ids: [...generated.default_entry_policy.default_entry_surface_ids],
    },
    source_of_work_lineage: {
      surface_kind: generated.source_of_work_lineage.surface_kind,
      owner: generated.source_of_work_lineage.owner,
      source_catalogs: [...generated.source_of_work_lineage.source_catalogs],
      derived_surface_policy: generated.source_of_work_lineage.derived_surface_policy,
      domain_repo_wrapper_policy: generated.source_of_work_lineage.domain_repo_wrapper_policy,
      authority_boundary: { ...generated.source_of_work_lineage.authority_boundary },
    },
    no_resurrection_gate: {
      surface_kind: generated.generated_default_entry_no_resurrection_gate.surface_kind,
      owner: generated.generated_default_entry_no_resurrection_gate.owner,
      release_gate: generated.generated_default_entry_no_resurrection_gate.release_gate,
      required_default_entry_surface_ids: [
        ...generated.generated_default_entry_no_resurrection_gate.required_default_entry_surface_ids,
      ],
      blocked_resurrection_surface_classes: [
        ...generated.generated_default_entry_no_resurrection_gate.blocked_resurrection_surface_classes,
      ],
      authority_boundary: {
        ...generated.generated_default_entry_no_resurrection_gate.authority_boundary,
      },
    },
    supported_derived_surfaces: surfaces,
    generated_surface_consumption_guard: {
      surface_kind: 'opl_generated_surface_consumption_guard_readback',
      readback_role:
        'family_default_generated_surface_consumption_counts_not_domain_ready_not_live_app_rendering',
      owner: 'one-person-lab',
      domain_pack_compiler_family_readback: packCompilerFamilyReadback,
      generated_interfaces_family_readback: generatedInterfacesFamilyReadback,
      selected_consumer_surface_ids:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.consumer_surface_ids]
          : [],
      selected_format_consumption_status:
        generatedInterfacesFamilyReadback.status === 'available'
          ? 'family_default_all_formats_consumption_readback_available'
          : 'blocked_family_default_interfaces_unavailable',
      active_caller_cutover_statuses:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.active_caller_cutover_statuses]
          : [],
      generated_wrapper_bundle_statuses:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.generated_wrapper_bundle_statuses]
          : [],
      domain_generated_surface_owner_claim_count:
        generatedInterfacesFamilyReadback.status === 'available'
          ? generatedInterfacesFamilyReadback.domain_generated_surface_owner_claim_count
          : null,
      family_default_pack_compiler_status:
        packCompilerFamilyReadback.status === 'available'
          ? 'family_default_pack_compiler_readback_available'
          : 'blocked_family_default_pack_compiler_unavailable',
      family_default_interfaces_status:
        generatedInterfacesFamilyReadback.status === 'available'
          ? 'family_default_generated_interfaces_readback_available'
          : 'blocked_family_default_generated_interfaces_unavailable',
      authority_boundary: {
        consumption_guard_can_write_domain_truth: false,
        consumption_guard_can_sign_owner_receipt: false,
        consumption_guard_can_create_typed_blocker: false,
        consumption_guard_can_authorize_physical_delete: false,
        consumption_guard_can_claim_default_caller_cutover: false,
        consumption_guard_can_claim_app_live_rendering_complete: false,
        consumption_guard_can_claim_domain_ready: false,
        consumption_guard_can_claim_production_ready: false,
      },
    },
    structural_closeout_guard: {
      milestone_id: 'domain_pack_generated_hosted_surfaces',
      status: 'closed_structure_gate_not_live_evidence',
      required_current_truth_surfaces: [
        'domain-pack-compiler-contract.generated_interface_bundle',
        'opl agents pack-compiler --family-defaults --json',
        'opl agents interfaces --family-defaults --json',
        'generated_surface_consumption_bundle',
        'active_caller_cutover_proof',
      ],
      can_close_non_live_structure_gate:
        packCompilerFamilyReadback.status === 'available'
        && generatedInterfacesFamilyReadback.status === 'available',
      cannot_claim: [
        'domain_ready',
        'production_ready',
        'App_live_rendering_complete',
        'default_caller_live_scaleout',
        'physical_delete_authorized',
        'owner_receipt_signed',
        'typed_blocker_created',
        'full_goal_complete',
      ],
    },
    domain_repo_required_role:
      'declarative_domain_pack_plus_domain_handler_targets_refs_only_adapters_or_tombstone_candidates',
    support_repo_boundary: {
      support_repos_are_explicit_extensions_only: true,
      support_repos_can_join_default_foundry_agent_truth_set: false,
      support_repos_can_claim_generated_surface_owner: false,
      support_repos_can_claim_app_shell_owner: false,
      support_repos_can_claim_production_readiness: false,
    },
    authority_boundary: { ...GENERATED_HOSTED_BOUNDARY_AUTHORITY },
    false_ready_guard: {
      descriptor_ready_can_claim_domain_ready: false,
      generated_bundle_ready_can_claim_production_ready: false,
      refs_only_consumption_can_claim_live_evidence_complete: false,
      generated_consumption_bundle_ready_can_claim_domain_ready: false,
      generated_consumption_bundle_ready_can_claim_default_caller_cutover: false,
      generated_consumption_bundle_ready_can_claim_App_GUI_complete: false,
      family_default_pack_compiler_ready_can_claim_domain_ready: false,
      app_projection_can_claim_live_rendering_complete: false,
      support_profile_clean_can_claim_foundry_agent_truth: false,
      default_caller_evidence_worklist_can_authorize_physical_delete: false,
    },
  };
}

export function buildMemoryArtifactLifecycleBoundaryGuardReadback() {
  const evidenceAuthority = memoryArtifactLifecycleEvidenceAuthorityBoundary();
  const structuralChecks = [
    evidenceAuthority.refs_only === true,
    evidenceAuthority.can_write_domain_truth === false,
    evidenceAuthority.can_write_memory_body === false,
    evidenceAuthority.can_read_memory_body === false,
    evidenceAuthority.can_mutate_artifact_body === false,
    evidenceAuthority.can_authorize_package_readiness === false,
    evidenceAuthority.can_authorize_export_readiness === false,
    evidenceAuthority.can_create_owner_receipt === false,
    evidenceAuthority.can_generate_typed_blocker === false,
    MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES.includes('memory_receipt_ref'),
    MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES.includes('artifact_mutation_receipt_ref'),
    MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES.includes('typed_blocker_ref'),
    MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES.includes('owner_acceptance_ref'),
  ];
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_boundary_guard_readback',
    readback_role:
      'memory_artifact_lifecycle_refs_only_boundary_not_memory_ready_not_artifact_ready_not_package_export_ready',
    owner: 'one-person-lab',
    target_surface: 'memory_artifact_lifecycle',
    milestone_id: 'memory_artifact_lifecycle_functional_boundary',
    status: structuralChecks.every(Boolean)
      ? 'closed_structure_gate_not_live_evidence'
      : 'blocked_structure_gate',
    source_refs: [
      'src/memory-artifact-lifecycle-evidence-ledger.ts',
      'src/memory-artifact-lifecycle-readback.ts',
      'src/runtime-tray-app-operator-drilldown-parts/memory-artifact-lifecycle-evidence.ts',
      'src/cli/cases/runtime-memory-artifact-lifecycle-evidence-command-spec.ts',
    ],
    source_api_readback_refs: [
      'memoryArtifactLifecycleEvidenceAuthorityBoundary',
      'buildMemoryArtifactLifecycleEvidenceProjection',
      'buildMemoryArtifactLifecycleReadback',
      'buildMemoryArtifactLifecycleEvidence',
      'recordMemoryArtifactLifecycleEvidenceReceipts',
      'verifyMemoryArtifactLifecycleEvidenceReceipt',
      'listMemoryArtifactLifecycleEvidenceReceipts',
    ],
    source_cli_readback_refs: [
      'opl runtime memory-artifact-lifecycle-evidence record|verify|list --json',
      'opl runtime memory-artifact-lifecycle --json .memory_artifact_lifecycle_readback',
      'opl runtime app-operator-drilldown --json .app_operator_drilldown.memory_artifact_lifecycle',
      'opl framework operating-maturity --family-defaults --json .framework_operating_maturity.memory_artifact_lifecycle',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.memory_artifact_lifecycle_boundary_guard',
    ],
    evidence_intake_policy: {
      refs_only: true,
      ledger_surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger',
      receipt_surface_kind: 'opl_memory_artifact_lifecycle_evidence_receipt',
      record_command_writes_opl_state_ledger_only: true,
      verify_command_marks_refs_only_receipt_only: true,
      record_or_verify_command_can_write_memory_body: false,
      record_or_verify_command_can_mutate_artifact_body: false,
      record_or_verify_command_can_create_owner_receipt: false,
      record_or_verify_command_can_create_typed_blocker: false,
      accepted_refs_only_result_shapes: [...MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES],
    },
    projection_policy: {
      readback_surface_kind: 'opl_memory_artifact_lifecycle_readback',
      app_drilldown_surface_kind: 'opl_app_drilldown_memory_artifact_lifecycle_evidence',
      projection_source:
        'runtime_app_operator_drilldown_plus_refs_only_evidence_projection',
      owner_work_order_surface_kind: 'opl_memory_artifact_lifecycle_owner_work_order',
      owner_work_order_lane_id: 'memory_artifact_lifecycle_apply',
      next_required_owner_action:
        'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
      open_count_zero_authorizes_ready_claim: false,
      verified_refs_only_ledger_authorizes_ready_claim: false,
      typed_blocker_ref_without_owner_followthrough_closes_lane: false,
      owner_acceptance_ref_without_owner_native_receipt_closes_domain_ready: false,
    },
    workspace_transport_policy: {
      workspace_artifact_lifecycle_transport_ref:
        'opl workspace artifact-lifecycle --workspace <path> --project-id <id> --apply',
      source_handoff_ref: 'handoff/review-repair-transport.json',
      materialized_opl_projection_ref:
        'control/opl/artifact_lifecycle/review_repair_transport.json',
      transport_is_opaque_ref_projection: true,
      transport_can_parse_repair_semantics: false,
      transport_can_claim_repair_accepted: false,
      transport_can_authorize_physical_delete: false,
    },
    accepted_refs_only_result_shapes: [...MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES],
    structural_closeout_guard: {
      can_close_non_live_structure_gate: structuralChecks.every(Boolean),
      required_current_truth_surfaces: [
        'memory_artifact_lifecycle_evidence_ledger',
        'memory_artifact_lifecycle_readback',
        'app_operator_drilldown_memory_artifact_lifecycle',
        'framework_operating_maturity_memory_artifact_lifecycle',
        'workspace_artifact_lifecycle_review_repair_transport',
        'framework_tranche_backlog_memory_artifact_lifecycle_boundary_guard',
      ],
      cannot_claim: [
        'memory_body_saved_or_accepted',
        'memory_writeback_accepted_or_rejected',
        'artifact_body_mutated',
        'artifact_ready',
        'repair_accepted',
        'package_ready',
        'export_ready',
        'domain_ready',
        'App_release_ready',
        'production_ready',
        'provider_long_soak_complete',
        'owner_receipt_signed',
        'typed_blocker_created',
        'human_decision_made',
        'physical_delete_authorized',
        'full_goal_complete',
      ],
    },
    non_closing_inputs: [
      'app_projection',
      'verified_refs_only_ledger',
      'lifecycle_reconcile_zero_issue_count',
      'open_count_zero',
      'opl_cleanup_apply_available',
      'typed_blocker_ref_without_owner_followthrough',
      'owner_acceptance_ref_without_owner_native_receipt',
      'review_repair_transport_passed',
    ],
    forbidden_opl_claims: [
      'memory_body_saved_or_accepted',
      'memory_writeback_accepted_or_rejected',
      'artifact_body_mutated',
      'artifact_ready',
      'repair_accepted',
      'package_ready',
      'export_ready',
      'domain_ready',
      'production_ready',
      'domain_physical_delete_authorization',
    ],
    authority_boundary: {
      ...evidenceAuthority,
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      can_project_refs: true,
      can_record_refs_only_evidence: true,
      can_verify_refs_only_evidence_receipt: true,
      can_emit_owner_work_order_projection: true,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_parse_review_repair_semantics: false,
      can_authorize_repair_acceptance: false,
      can_authorize_package_readiness: false,
      can_authorize_export_readiness: false,
      can_execute_domain_physical_delete: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_memory_ready: false,
      can_claim_artifact_ready: false,
      can_claim_package_ready: false,
      can_claim_export_ready: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    false_ready_guard: {
      refs_observed_can_claim_memory_ready: false,
      refs_observed_can_claim_artifact_ready: false,
      lifecycle_reconcile_clean_can_claim_ready: false,
      open_count_zero_can_claim_memory_ready: false,
      verified_refs_only_ledger_can_claim_memory_ready: false,
      verified_refs_only_ledger_can_claim_artifact_ready: false,
      verified_refs_only_ledger_can_claim_package_ready: false,
      verified_refs_only_ledger_can_claim_export_ready: false,
      typed_blocker_ref_can_claim_lane_closed: false,
      owner_acceptance_ref_can_claim_domain_ready: false,
      review_repair_transport_passed_can_claim_repair_accepted: false,
      opl_cleanup_apply_can_authorize_physical_delete: false,
      tranche_guard_can_claim_live_evidence_complete: false,
    },
  };
}
