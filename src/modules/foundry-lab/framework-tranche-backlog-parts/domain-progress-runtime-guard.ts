import {
  DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
} from '../../runway/family-runtime-domain-progress-transition-runtime.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  readDomainProgressRuntimeFirstSliceContract,
  sameStringSet,
} from './contract-readers.ts';
import { NO_SECOND_TRUTH_AUTHORITY_BOUNDARY } from './shared.ts';

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
