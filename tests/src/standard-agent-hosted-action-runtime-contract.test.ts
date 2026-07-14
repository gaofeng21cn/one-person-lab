import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readContract() {
  return parseJsonText(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/standard-agent-hosted-action-runtime-contract.json',
  ), 'utf8')) as Record<string, any>;
}

test('hosted Standard Agent actions use exact managed packages and typed bindings', () => {
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
  assert.equal(packageGate.launch_requirements.expected_tree_sha256_equals_actual_tree_sha256, true);
  assert.equal(actionAbi.catalog_version, 'family-action-catalog.v2');
  assert.equal(actionAbi.handler_registry_version, 'domain-handler-registry.v1');
  assert.deepEqual(actionAbi.execution_binding_union.map((binding: any) => binding.required_shape), [
    { kind: 'handler_ref', handler_ref: 'handler:<handler_id>' },
    { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
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
  assert.equal(
    contract.stage_execution.same_action_run_provider_start_rpc_delivery,
    'at_least_once_when_starting_has_unknown_success',
  );
  assert.equal(contract.stage_execution.same_action_run_temporal_execution_count, 1);
  assert.equal(
    contract.stage_execution.concurrent_action_run_output_policy,
    'first_published_exact_bytes_are_canonical_and_all_callers_read_back_the_winner',
  );
  assert.equal(Object.hasOwn(
    contract.stage_execution,
    'same_action_run_concurrent_or_replayed_provider_start_count',
  ), false);
  assert.equal(contract.stage_execution.later_action_run_creates_new_stage_run, true);
  assert.equal(contract.stage_execution.stage_run_spec_sha256_binds_managed_package_closure_and_exact_request, true);
  assert.equal(
    contract.stage_execution.stage_run_spec_sha256_binds_prompt_rubric_policy_source_checkpoint_and_manifest_bytes,
    true,
  );
  assert.equal(contract.stage_execution.root_package_content_digest_required, true);
  assert.equal(contract.stage_execution.exact_stage_run_input_registered_before_temporal_start, true);
  assert.equal(contract.stage_execution.same_invocation_different_spec_fails_closed, true);
  assert.equal(contract.stage_execution.pre_and_post_start_crash_recovery_required, true);
  assert.equal(contract.stage_execution.started_is_domain_completion, false);
  assert.equal(contract.stage_execution.post_launch_query_is_observation_only, true);
  assert.equal(contract.stage_execution.post_launch_query_failure_changes_started_to_failed, false);
  assert.equal(contract.stage_execution.provider_completion_is_domain_ready, false);
  assert.equal(contract.exact_byte_persistence.workspace_relative_root, 'control/opl/action_runs');
  assert.equal(contract.exact_byte_persistence.same_run_identity_conflicting_bytes_fail_closed, true);
  assert.deepEqual(contract.refs_only_ledger.statuses, ['started', 'completed', 'blocked', 'failed']);
  assert.deepEqual(contract.refs_only_ledger.timestamp_fields, ['started_at', 'recorded_at']);
  assert.equal(contract.refs_only_ledger.contains_request_or_output_body, false);
  assert.equal(contract.refs_only_ledger.started_is_terminal_domain_completion, false);
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
