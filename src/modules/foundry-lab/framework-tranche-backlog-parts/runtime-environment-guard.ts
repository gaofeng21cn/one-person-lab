import type { FrameworkContracts } from '../../../kernel/types.ts';
import { readRuntimeEnvironmentSubstrateContract } from './contract-readers.ts';

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
