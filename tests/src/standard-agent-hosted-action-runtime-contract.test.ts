import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID } from '../../src/modules/pack/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readContract() {
  return parseJsonText(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/standard-agent-hosted-action-runtime-contract.json',
  ), 'utf8')) as Record<string, any>;
}

test('hosted Standard Agent actions enforce immutable releases and live-probe developer checkouts', () => {
  const contract = readContract();
  const packageGate = contract.managed_package_gate;
  const actionAbi = contract.domain_pack_action_abi;

  assert.equal(contract.contract_kind, 'opl_standard_agent_hosted_action_runtime_contract.v1');
  assert.equal(contract.brand_module_ownership.primary_module, 'runway');
  assert.equal(packageGate.ordinary_user_distribution.moving_pointer, 'latest-stable');
  assert.equal(packageGate.ordinary_user_distribution.install_truth, 'resolved_digest_lock');
  assert.equal(packageGate.moving_pointer_is_install_truth, false);
  assert.equal(packageGate.origin_main_is_implicit_launch_target, false);
  assert.equal(packageGate.launch_requirements.package_status_launch_allowed, true);
  assert.equal(packageGate.launch_requirements.immutable_runtime_source_identity_matches_recorded_digest, true);
  assert.equal(packageGate.launch_requirements.developer_checkout_identity_is_provenance_observation_only, true);
  assert.equal(packageGate.launch_requirements.developer_checkout_live_health_and_handler_probe_required, true);
  assert.equal(packageGate.dirty_or_diverged_development_checkout_blocks_launch, false);
  assert.equal(actionAbi.catalog_version, 'family-action-catalog.v2');
  assert.equal(actionAbi.handler_registry_version, 'domain-handler-registry.v1');
  assert.deepEqual(actionAbi.execution_binding_union.map((binding: any) => binding.required_shape), [
    { kind: 'handler_ref', handler_ref: 'handler:<handler_id>' },
    { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
    { kind: 'foundry_binding', provider_manifest_ref: 'contracts/foundry_provider.json' },
  ]);
});

test('hosted action persistence and ledger distinguish Stage launch from completion', () => {
  const contract = readContract();

  assert.equal(contract.handler_execution.completed_status_is_domain_ready, false);
  assert.equal(contract.stage_execution.request_persisted_before_launch, true);
  assert.equal(contract.stage_execution.request_sha256_bound_as_source_fingerprint, true);
  assert.equal(contract.stage_execution.request_ref_and_sha256_bound_as_input_artifact, true);
  assert.equal(
    contract.stage_execution.stage_run_invocation_id_source,
    'domain_id_plus_entry_stage_plus_action_id_plus_run_id_plus_action_run_ref',
  );
  assert.equal(contract.stage_execution.same_action_run_replay_returns_same_stage_run, true);
  assert.equal(contract.stage_execution.same_action_run_replay_uses_durable_launch_registry, true);
  assert.equal(contract.stage_execution.same_action_run_temporal_execution_count, 1);
  assert.match(contract.stage_execution.same_action_run_provider_start_rpc_delivery, /at_least_once/);
  assert.equal(contract.stage_execution.later_action_run_creates_new_stage_run, true);
  assert.equal(contract.stage_execution.stage_run_spec_sha256_binds_managed_package_closure_and_exact_request, true);
  assert.equal(
    contract.stage_execution.stage_run_spec_sha256_binds_prompt_rubric_policy_source_checkpoint_and_manifest_bytes,
    true,
  );
  assert.equal(contract.stage_execution.root_package_id_required, true);
  assert.equal(contract.stage_execution.package_provenance_fields_nullable, true);
  assert.equal(contract.stage_execution.missing_package_provenance_alone_can_block_execution, false);
  assert.equal(contract.stage_execution.exact_stage_run_input_registered_before_temporal_start, true);
  assert.equal(contract.stage_execution.same_invocation_different_spec_fails_closed, true);
  assert.equal(contract.stage_execution.pre_and_post_start_crash_recovery_required, true);
  assert.equal(contract.stage_execution.started_is_domain_completion, false);
  assert.equal(contract.stage_execution.post_launch_query_is_observation_only, true);
  assert.equal(contract.stage_execution.post_launch_query_failure_changes_started_to_failed, false);
  assert.equal(contract.stage_execution.provider_completion_is_domain_ready, false);
  assert.equal(contract.foundry_execution.design_request_protocol_validation_before_launch, true);
  assert.equal(contract.foundry_execution.same_action_run_reuses_exact_foundry_run_id, true);
  assert.match(contract.foundry_execution.same_action_run_provider_start_rpc_delivery, /at_least_once/);
  assert.equal(contract.foundry_execution.unknown_provider_success_requires_same_run_retry, true);
  assert.equal(contract.foundry_execution.started_is_foundry_terminal_completion, false);
  assert.equal(contract.foundry_execution.started_is_target_agent_delivery, false);
  assert.equal(contract.foundry_execution.semantic_provider_can_execute_evaluation, false);
  assert.equal(contract.foundry_execution.semantic_provider_can_activate_version, false);
  assert.equal(contract.exact_byte_persistence.workspace_relative_root, 'control/opl/action_runs');
  assert.equal(contract.exact_byte_persistence.same_run_identity_conflicting_bytes_fail_closed, true);
  assert.equal(contract.durable_run_binding_and_completion.workspace_relative_root, 'control/opl/action_run_state');
  assert.equal(contract.durable_run_binding_and_completion.first_writer_binding_is_immutable, true);
  assert.equal(
    contract.durable_run_binding_and_completion.non_terminal_run_replay_uses_exact_pinned_runtime_provenance,
    true,
  );
  assert.equal(
    contract.durable_run_binding_and_completion
      .completed_handler_replay_uses_durable_binding_completion_request_and_output,
    true,
  );
  assert.equal(
    contract.durable_run_binding_and_completion.completed_handler_replay_requires_historical_managed_checkout,
    false,
  );
  assert.equal(
    contract.durable_run_binding_and_completion.completed_handler_replay_requires_exact_original_payload_digest,
    true,
  );
  assert.equal(
    contract.durable_run_binding_and_completion.completed_handler_replay_requires_exact_request_and_output_digests,
    true,
  );
  assert.equal(contract.durable_run_binding_and_completion.activation_change_cannot_rebind_existing_run, true);
  assert.equal(
    contract.durable_run_binding_and_completion.foundry_active_binding_requires_durable_activation_transaction_verification,
    true,
  );
  assert.equal(
    contract.durable_run_binding_and_completion.activation_pointer_without_matching_transaction_verification_fails_closed,
    true,
  );
  assert.equal(
    contract.durable_run_binding_and_completion
      .non_terminal_corrupt_or_unresolvable_pinned_binding_fails_before_downstream_launch,
    true,
  );
  assert.equal(
    contract.durable_run_binding_and_completion
      .completed_handler_corrupt_durable_binding_or_bytes_fails_before_replay,
    true,
  );
  assert.equal(contract.durable_run_binding_and_completion.unknown_provider_success_does_not_publish_false_completion, true);
  assert.deepEqual(contract.refs_only_ledger.statuses, ['started', 'completed', 'blocked', 'failed']);
  assert.deepEqual(contract.refs_only_ledger.timestamp_fields, ['started_at', 'recorded_at']);
  assert.equal(contract.refs_only_ledger.contains_request_or_output_body, false);
  assert.equal(contract.refs_only_ledger.started_is_terminal_domain_completion, false);
});

test('hosted action runtime exposes one receipt-bound qualification provisioning argv', () => {
  const provisioning = readContract().qualification_provisioning;

  assert.equal(
    provisioning.exact_argv,
    'opl agents run --domain mas --action qualification_work_item_provisioning_authority_evaluate '
      + '--workspace <workspace_root> --payload-file <request.json> --run-id <stable_run_id> --json',
  );
  assert.equal(provisioning.framework_trusted_route, true);
  assert.equal(provisioning.domain_action_remains_internal_only, true);
  assert.equal(provisioning.shell_direct_internal_handler_invocation_allowed, false);
  assert.equal(provisioning.input.framework_derives_or_selects_study_id, false);
  assert.equal(provisioning.domain_output.study_id_pointer,
    '/standard_agent_action_run/result/study_identity/study_id');
  assert.equal(provisioning.domain_output.provisioning_receipt_path_pointer,
    '/standard_agent_action_run/result/provisioning_receipt/receipt_relative_path');
  assert.equal(provisioning.host_materialization.framework_receipt_path_pointer,
    '/standard_agent_action_run/host_materialization/receipt_path');
  assert.equal(provisioning.host_materialization.operation_count, 3);
  assert.equal(provisioning.host_materialization.journaled_all_or_rollback, true);
  assert.equal(provisioning.host_materialization.exact_request_replay_is_idempotent, true);
  assert.equal(provisioning.qualification_boundary.ordinary_stage_admission_reuse_allowed, false);
  assert.equal(provisioning.qualification_boundary.shell_requires_domain_and_framework_receipts_before_provider_start,
    true);
  for (const field of [
    'stage_body_authorized',
    'business_action_authorized',
    'publication_authorized',
    'submission_authorized',
  ]) assert.equal(provisioning.qualification_boundary[field], false, field);
});

test('hosted Foundry conformance profile is jointly selected and keeps live evidence OPL-owned', () => {
  const profile = readContract().conformance_profile;

  assert.equal(profile.profile_id, OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID);
  assert.equal(profile.selection.domain_descriptor_agent_role, 'foundry_semantic_provider');
  assert.equal(profile.selection.all_action_execution_bindings, 'foundry_binding');
  assert.equal(profile.selection.joint_match_required, true);
  assert.equal(profile.selection.agent_id_special_case_allowed, false);
  assert.equal(profile.raw_repo_diagnostics_preserved, true);
  assert.equal(profile.effective_blockers_are_profile_aware, true);
  assert.equal(profile.managed_runtime_identity_and_currentness_owner, 'opl_managed_package_gate');
  assert.equal(profile.live_qualification_and_canary_evidence_owner, 'opl_foundry_kernel');
  assert.equal(profile.provider_completion_is_qualification_or_closeout, false);
  assert.equal(profile.repo_local_placeholder_contracts_can_close_hosted_evidence, false);
});

test('hosted action runtime does not restore private control planes or domain authority', () => {
  const contract = readContract();
  const retired = new Set(contract.retired_private_control_plane_fields as string[]);
  const authority = contract.authority_boundary;

  for (const field of [
    'entry_command_template',
    'manifest_command_template',
    'runtime.dispatch_command',
    'source_command',
    'per_agent_scheduler',
    'per_agent_queue',
    'per_agent_session_store',
    'per_agent_lifecycle_store',
    'per_agent_workbench',
  ]) {
    assert.equal(retired.has(field), true, field);
  }
  for (const field of [
    'opl_can_write_domain_truth',
    'opl_can_write_memory_body',
    'opl_can_mutate_domain_artifact_body',
    'opl_can_sign_owner_receipt',
    'opl_can_create_typed_blocker',
    'opl_can_satisfy_human_gate',
    'opl_can_claim_quality_or_export_ready',
    'opl_can_claim_domain_ready',
    'opl_can_claim_production_ready',
  ]) {
    assert.equal(authority[field], false, field);
  }
});
