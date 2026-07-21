import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(
    fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'),
  ) as Record<string, any>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256Stable(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function assertFalseAuthority(boundary: Record<string, unknown>) {
  for (const key of [
    'can_execute_domain_action',
    'can_write_domain_truth',
    'can_claim_domain_ready',
    'can_claim_publication_ready',
    'can_claim_artifact_ready',
    'can_claim_production_ready',
    'provider_completion_is_domain_ready',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

test('family runtime attempt contract keeps Temporal attempt, progress-first closeout, and refs-only authority boundaries', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');

  assert.equal(contract.provider_model, 'provider_backed_stage_attempt_runtime');
  assert.deepEqual(contract.allowed_providers, ['temporal']);
  assert.equal(contract.progress_closeout_contract.typed_packet_required_for_progress, false);
  assert.equal(contract.progress_closeout_contract.raw_or_free_text_artifact_accepted_for_progress, true);
  assert.equal(contract.progress_closeout_contract.framework_derives_minimal_progress_envelope, true);
  assert.equal(
    contract.progress_closeout_contract.closeout_receipt_status_contract
      .framework_progress_envelope_can_supply_formal_review_artifact_identity,
    false,
  );
  assert.equal(
    contract.progress_closeout_contract.closeout_receipt_status_contract
      .framework_progress_envelope_can_authorize_domain_ready,
    false,
  );
  assert.equal(contract.progress_closeout_contract.output_schema_control_plane_enabled, false);
  assert.equal(contract.progress_closeout_contract.same_session_closeout_enforcement_enabled, false);
  assert.ok(contract.progress_closeout_contract.tracked_refs.includes('domain_output.output_ref'));
  assert.equal(
    contract.progress_closeout_contract.domain_output_contract.transport_policy,
    'refs_only_no_domain_output_body_in_temporal_or_opl_ledger',
  );
  assert.equal(contract.progress_closeout_contract.domain_output_contract.unknown_fields_allowed, false);
  assert.deepEqual(contract.progress_closeout_contract.domain_output_contract.allowed_fields, [
    'surface_kind',
    'version',
    'domain_id',
    'output_ref',
  ]);
  assert.ok(contract.operator_visibility_fields.includes('domain_output_ref'));
  assert.equal(contract.progress_closeout_contract.closeout_ref_metadata_contract.unknown_fields_allowed, false);
  assert.deepEqual(contract.progress_closeout_contract.closeout_ref_metadata_contract.allowed_fields, [
    'ref_kind',
    'kind',
    'uri',
    'sha256',
    'ref',
    'size_bytes',
    'artifact_identity_receipt_ref',
  ]);
  assert.equal(
    contract.provider_lifecycle_contract.temporal.workflow_name,
    'StageAttemptWorkflow',
  );
  assert.ok(contract.required_ledger_fields.includes('stage_attempt_id'));
  assert.equal(contract.required_ledger_fields.includes('execution_authorization_decision_ref'), false);
  assert.equal(contract.required_ledger_fields.includes('attempt_lease_ref'), false);
  assert.ok(contract.required_projection_fields.includes('stage_progress_log'));
  assert.ok(contract.required_projection_fields.includes('attempt_true_path_proof'));
  assert.equal(contract.stage_progress_log_contract.surface_kind, 'opl_stage_progress_log');
  assert.equal(
    contract.stage_progress_log_contract.projection_policy,
    'temporal_backed_opl_refs_only_stage_observability_no_domain_truth',
  );
  assertFalseAuthority(contract.stage_progress_log_contract.authority_boundary);
  assert.equal(Object.hasOwn(contract.current_control_state_projection, 'stop_loss_state_contract_ref'), false);
  assert.equal(Object.hasOwn(contract.current_control_state_projection, 'no_progress_budget_exhaustion_effect'), false);
  assert.deepEqual(contract.current_control_state_projection.forbidden_derivation_sources, [
    'domain_latest',
    'domain_dispatch_latest',
    'domain_readiness_verdict',
    'domain_artifact_ready_verdict',
  ]);
  assert.deepEqual(contract.current_control_state_projection.quality_debt_projection.fields, [
    'quality_debt_refs',
    'quality_debt_reason_codes',
    'quality_summary',
  ]);
  assert.equal(
    contract.current_control_state_projection.quality_debt_projection.source_policy,
    'copy_domain_or_runtime_authored_quality_debt_without_semantic_inference',
  );
  assert.equal(
    contract.current_control_state_projection.quality_debt_projection.domain_quality_verdict_inferred,
    false,
  );
  assert.equal(
    Object.hasOwn(contract.current_control_state_projection.authority_boundary, 'can_claim_publication_ready'),
    false,
  );
  assertFalseAuthority(contract.current_control_state_projection.authority_boundary);
  assertFalseAuthority(contract.stability_projection_authority_boundary);
});

test('stage route transport cannot become a second semantic control plane', () => {
  const contract = readJson('contracts/opl-framework/stage-route-transport-contract.json');

  assert.equal(contract.codex_semantic_route_boundary.semantic_owner, 'decisive_codex_attempt');
  assert.equal(
    contract.codex_semantic_route_boundary.stage_transition_materialization_owner,
    'opl_stage_run_controller',
  );
  assert.equal(contract.codex_semantic_route_boundary.framework_can_reject_abi_valid_route_on_domain_semantic_merit, false);
  assert.equal(
    contract.codex_semantic_route_boundary.framework_must_validate_route_output_abi_and_attempt_authority,
    true,
  );
  assert.equal(
    contract.codex_semantic_route_boundary.framework_must_reject_non_authoritative_or_malformed_route_output,
    true,
  );
  assert.equal(
    contract.codex_semantic_route_boundary.missing_or_rejected_route_fallback,
    'domain_pack_declared_default_progression_with_route_quality_debt_only',
  );
  assert.deepEqual(contract.codex_semantic_route_boundary.declared_default_progression_resolution, [
    'action_stage_route.required_stage_refs_order',
    'unique_current_stage.next_stage_refs',
  ]);
  assert.equal(contract.codex_semantic_route_boundary.manifest_file_order_must_not_select_successor, true);
  assert.equal(contract.codex_semantic_route_boundary.ambiguous_declared_successors_require_decisive_codex_route, true);
  assert.equal(contract.progress_policy.readable_artifact_counts_as_progress, true);
  assert.equal(contract.route_back_policy.may_target_any_declared_stage, true);
  assert.equal(contract.authority_boundary.opl_can_transport_codex_selected_route, true);
  assert.equal(contract.authority_boundary.opl_can_choose_semantic_stage_route, false);
  assert.equal(contract.authority_boundary.opl_can_sign_domain_owner_receipt, false);
});

test('standard domain-agent skeleton contract keeps generic framework primitives OPL-owned', () => {
  const contract = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');
  const scaffold = contract.new_agent_scaffold;
  const primitiveIds = scaffold.opl_owned_generic_primitives.map(
    (primitive: { primitive_id: string }) => primitive.primitive_id,
  );

  assert.deepEqual(contract.required_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
  assert.deepEqual(contract.forbidden_repo_source_dirs, ['artifacts']);
  for (const primitive of [
    'scheduler_supervision_cadence',
    'provider_slo_and_wakeup_transport',
    'stage_attempt_projection_ledger',
    'operator_workbench_drilldown_shell',
    'pack_compiler_generated_surface',
  ]) {
    assert.ok(primitiveIds.includes(primitive), primitive);
  }
  assert.ok(scaffold.forbidden_domain_generic_owner_roles.includes('generic_scheduler_owner'));
  assert.equal(scaffold.default_runtime_policy.default_runtime_path, 'opl_temporal_hosted_autonomous');
  assert.equal(scaffold.default_runtime_policy.domain_agent_internal_daemon_allowed, false);
  assert.equal(scaffold.pack_compiler_contract.generated_surface_owner, 'one-person-lab');
  assert.equal(scaffold.default_runtime_policy.required_user_stage_log.authority_boundary.opl_can_infer_domain_semantics, false);
});

test('foundry agent series policy release fingerprint stays tied to the skeleton contract', () => {
  const release = readJson('contracts/opl-framework/foundry-agent-series-policy-release.json');
  const foundryContract = readJson('contracts/opl-framework/foundry-agent-series-contract.json');
  const skeleton = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');

  assert.equal(release.release_contract_ref, 'contracts/opl-framework/foundry-agent-series-policy-release.json');
  assert.equal(release.policy_bundle_fingerprint, sha256Stable(release.policy_bundle));
  assert.deepEqual(foundryContract.shared_policy_release, {
    policy_release_contract_ref: release.release_contract_ref,
    policy_bundle_fingerprint: release.policy_bundle_fingerprint,
    fingerprint_algorithm: 'sha256:stable-json',
    domain_contract_policy_release_pin_required: true,
    domain_adapter_must_not_copy_policy_body_as_authority: true,
    consumer_alignment_check: 'foundry:policy-release',
  });
  assert.deepEqual(
    skeleton.new_agent_scaffold.agent_pack_contract.foundry_agent_series_policy_release,
    release,
  );
  assert.equal(release.policy_bundle.authority_boundary.policy_release_can_claim_domain_ready, false);
});

test('StageRun creation contracts expose one pack-bound write entry and a query-only StageRun CLI', () => {
  const quality = readJson('contracts/opl-framework/stage-quality-cycle-contract.json');
  const attempts = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');
  const temporal = readJson('contracts/opl-framework/family-runtime-temporal-first-contract.json');
  const manager = readJson('contracts/opl-framework/runtime-manager-contract.json');
  const compiler = readJson('contracts/opl-framework/domain-pack-compiler-contract.json');
  const skeleton = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');

  assert.equal(quality.pack_bound_creation.canonical_request_surface,
    'opl family-runtime attempt create');
  assert.equal(quality.pack_bound_creation.raw_stage_run_start_cli_retired, true);
  assert.deepEqual(quality.pack_bound_creation.stage_run_cli_allowed_actions, ['query']);
  assert.equal(quality.pack_bound_creation.stage_run_id_binds_manifest_sha256, false);
  assert.equal(quality.pack_bound_creation.stage_run_spec_sha256_binds_manifest_sha256, true);
  assert.ok(quality.pack_bound_creation.required_binding_fields.includes('manifest_sha256'));
  assert.ok(quality.pack_bound_creation.required_binding_fields.includes('declared_stage_ids'));
  assert.equal(attempts.stage_quality_cycle_contract.pack_bound_runtime_binding_required, true);
  assert.equal(temporal.workflow_activity_signal_mapping.stage_run_workflow.creation_entry,
    'pack_bound_family_runtime_attempt_create_only');
  assert.equal(temporal.workflow_activity_signal_mapping.stage_run_workflow.raw_stage_run_start_cli_retired, true);
  assert.equal(manager.pack_bound_stage_run.direct_unbound_stage_run_creation_forbidden, true);
  assert.deepEqual(manager.pack_bound_stage_run.stage_run_cli_allowed_actions, ['query']);
  assert.deepEqual(manager.pack_bound_stage_run.stage_run_id_derives_only_from,
    ['domain_id', 'stage_id', 'stage_run_invocation_id']);
  assert.equal(manager.pack_bound_stage_run.manifest_sha256_participates_in_stage_run_id, false);
  assert.equal(manager.pack_bound_stage_run.manifest_sha256_participates_in_stage_run_spec_sha256, true);
  assert.equal(
    manager.pack_bound_stage_run.prompt_rubric_checkpoint_source_and_lineage_bytes_participate_in_stage_run_spec_sha256,
    true,
  );
  assert.equal(manager.pack_bound_stage_run.root_package_id_required, true);
  assert.equal(manager.pack_bound_stage_run.missing_package_provenance_alone_can_block_execution, false);
  assert.equal(
    manager.pack_bound_stage_run.child_attempt_content_binding_version,
    'opl-stage-run-attempt-content-binding.v1',
  );
  assert.equal(manager.pack_bound_stage_run.child_attempt_execution_content_binding_version,
    'opl-stage-attempt-execution-content-binding.v1');
  assert.equal(manager.pack_bound_stage_run.child_attempt_resolves_current_or_lkg_package_generation, true);
  assert.equal(manager.pack_bound_stage_run.child_attempt_execution_bytes_revalidated_before_executor_use, true);
  assert.equal(manager.pack_bound_stage_run.historical_parent_pack_bytes_may_change_without_invalidating_evidence, true);
  assert.equal(manager.pack_bound_stage_run.route_target_stage_run_resolves_current_or_lkg_package_generation, true);
  assert.equal(manager.pack_bound_stage_run.currentness_or_digest_observation_alone_can_block_execution, false);
  assert.match(manager.pack_bound_stage_run.same_run_provider_start_rpc_delivery, /at_least_once/);
  assert.equal(manager.pack_bound_stage_run.same_run_temporal_execution_count, 1);
  assert.equal(manager.pack_bound_stage_run.register_exact_input_before_temporal_start, true);
  assert.equal(compiler.standard_agent_stage_quality_runtime_binding.surface_kind,
    'opl_pack_bound_stage_quality_runtime_binding');
  assert.equal(compiler.standard_agent_stage_quality_runtime_binding.manifest_sha256_is_exact_compiled_manifest_identity, true);
  assert.deepEqual(compiler.standard_agent_stage_quality_runtime_binding.role_prompt_keys,
    ['producer', 'reviewer', 'repairer', 're_reviewer']);
  assert.equal(
    compiler.standard_agent_stage_quality_runtime_binding.required_fields.includes('handoff_review_boundary'),
    true,
  );
  assert.equal(
    compiler.standard_agent_stage_quality_runtime_binding.required_fields.includes('declared_stage_ids'),
    true,
  );
  assert.equal(
    compiler.standard_agent_stage_quality_runtime_binding.new_attempt_re_resolves_current_or_lkg_binding,
    true,
  );
  assert.equal(
    compiler.standard_agent_stage_quality_runtime_binding
      .attempt_execution_binding_sha256_covers_spec_and_declared_stage_ids,
    true,
  );
  assert.equal(skeleton.stage_quality_runtime.runtime_creation_surface,
    'opl family-runtime attempt create');
  assert.equal(skeleton.stage_quality_runtime.raw_stage_run_start_cli_retired, true);
});

test('Stage quality contracts bind bounded Attempts, exact artifact identity, receipts, and retry budgets', () => {
  const quality = readJson('contracts/opl-framework/stage-quality-cycle-contract.json');
  const attempts = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');
  const temporal = readJson('contracts/opl-framework/family-runtime-temporal-first-contract.json');
  const operator = readJson('contracts/opl-framework/family-product-operator-projection.json');

  assert.deepEqual(quality.stage_attempt_roles,
    ['producer', 'reviewer', 'repairer', 're_reviewer']);
  assert.deepEqual(quality.multi_attempt_stage_boundary.role_round_contract, {
    producer: [0], reviewer: [0], repairer: [1, 2, 3], re_reviewer: [1, 2, 3],
  });
  assert.equal(quality.multi_attempt_stage_boundary.forbidden_attempt_fields_rejected_recursively, true);
  assert.equal(quality.multi_attempt_stage_boundary.parent_lineage_must_match_current_stage_run_and_quality_cycle, true);
  assert.equal(quality.stage_run_controller.maximum_attempt_instances, 8);
  assert.equal(
    quality.stage_run_controller.formal_review_declared_artifact_identity_patch_marker,
    'opl-stage-run-formal-review-declared-artifact-identity-v1',
  );
  assert.equal(
    quality.policy.scope_budget.usage_projection.attempts_used_semantics,
    'completed_repair_rounds_for_v1_max_attempts_compatibility',
  );
  assert.equal(
    quality.policy.scope_budget.usage_projection.managed_attempts_used_semantics,
    'all_materialized_child_stage_attempts_including_producer_reviewer_repairer_and_re_reviewer',
  );
  assert.equal(
    quality.policy.scope_budget.usage_projection.managed_attempts_used_is_budget_counter,
    false,
  );
  assert.deepEqual(quality.review_receipt.required_fields, [
    'stage_run_id', 'quality_cycle_id', 'producer_attempt_ref', 'reviewer_attempt_ref',
    'producer_session_ref', 'reviewer_session_ref', 'no_context_inheritance',
    'reviewed_artifact_refs', 'reviewed_artifact_hashes', 'rubric_refs', 'verdict',
    'review_input_snapshot_status', 'review_input_snapshot_binding',
    'opl_reviewer_input_snapshot_manifest_ref', 'opl_reviewer_input_snapshot_manifest',
    'review_input_snapshot_quality_debt_receipt_ref',
    'review_input_snapshot_quality_debt_receipt',
    'opl_review_evidence_artifact_receipt_ref', 'opl_review_evidence_artifact_receipt',
    'finding_lineage',
  ]);
  assert.ok(quality.context_isolation.review_context_allowlist
    .includes('opl_reviewer_input_snapshot_manifest_exact_ref_and_body'));
  assert.equal(
    quality.context_isolation.review_input_snapshot
      .missing_request_adds_quality_debt_without_overwriting_reviewer_outcome_findings_or_hard_stop,
    true,
  );
  assert.equal(
    quality.review_receipt.review_transport_binding
      .review_evidence_artifact_defines_cache_reuse_or_domain_verdict,
    false,
  );
  assert.deepEqual(
    quality.review_receipt.review_transport_binding.review_evidence_artifact_receipt_fields,
    [
      'candidate_ref', 'producer_attempt_ref', 'execution_content_binding_sha256',
      'producer_package', 'origin_evidence_ref',
    ],
  );
  assert.equal(
    quality.review_receipt.review_transport_binding
      .review_evidence_artifact_candidate_is_opaque_to_framework,
    true,
  );
  assert.equal(
    quality.review_receipt.review_transport_binding
      .review_evidence_artifact_producer_package_comes_from_attempt_execution_binding,
    true,
  );
  assert.equal(
    quality.review_receipt.review_transport_binding
      .review_evidence_artifact_origin_ref_must_match_closeout_metadata,
    true,
  );
  assert.equal(
    quality.review_receipt.local_artifact_identity_receipt_surface_kind,
    'opl_transport_artifact_identity_receipt',
  );
  assert.equal(
    quality.review_receipt.producer_and_repairer_artifact_identity_receipt_refs_required_before_formal_review,
    true,
  );
  assert.equal(quality.review_receipt.trusted_identity_receipt_filename_must_equal_sha256_of_receipt_bytes, true);
  assert.equal(quality.review_receipt.artifact_bytes_reverified_before_each_non_producer_attempt_materialization, true);
  assert.equal(quality.review_receipt.artifact_identity_receipt_must_match_artifact_producer_attempt_ref, true);
  assert.equal(quality.review_receipt.artifact_producer_attempt_ref_is_distinct_from_parent_attempt_ref, true);
  assert.equal(
    quality.review_receipt.repair_without_new_artifact_identity_terminalizes_quality_debt_without_re_review,
    true,
  );
  assert.equal(quality.review_receipt.reviewed_artifact_ref_hash_cardinality_must_match, true);
  assert.equal(attempts.stage_quality_cycle_contract.review_receipt_surface_kind,
    'opl_stage_review_receipt');
  assert.equal(
    attempts.stage_quality_cycle_contract.review_transport_persistence
      .review_input_snapshot_materialization_request_participates_in_attempt_idempotency,
    true,
  );
  assert.equal(
    attempts.stage_quality_cycle_contract.review_transport_persistence
      .stage_review_receipt_binds_snapshot_or_debt_and_optional_review_evidence_artifact_receipt,
    true,
  );
  assert.equal(
    attempts.stage_quality_cycle_contract.review_transport_persistence
      .review_evidence_artifact_public_cli_requires_explicit_attempt_context,
    true,
  );
  assert.equal(
    attempts.stage_quality_cycle_contract.review_transport_persistence
      .review_evidence_artifact_receipt_cannot_emit_domain_verdict_or_authority,
    true,
  );
  assert.ok(attempts.required_ledger_fields.includes('context_manifest'));
  assert.ok(attempts.required_ledger_fields.includes('quality_context'));
  assert.equal(attempts.stage_quality_cycle_contract.terminal_route_output,
    'route_impact.stage_route_decision');
  assert.equal(attempts.stage_quality_cycle_contract.non_terminal_route_output,
    'route_impact.stage_route_recommendation');
  assert.equal(
    attempts.stage_quality_cycle_contract.non_producer_materialization_requires_artifact_producer_attempt_ref,
    true,
  );
  assert.equal(
    temporal.workflow_activity_signal_mapping.stage_attempt_workflow.artifact_identity_revalidated_before_child_workflow_start,
    true,
  );
  assert.equal(temporal.event_history_mapping.legacy_history_replay_fixture_required, true);
  assert.ok(temporal.event_history_mapping.active_stage_run_patch_markers.includes(
    'opl-stage-run-formal-review-declared-artifact-identity-v1',
  ));
  assert.equal(
    attempts.stage_route_boundary.missing_or_invalid_route_fallback,
    'domain_pack_declared_default_progression_with_route_quality_debt_only',
  );
  assert.equal(
    attempts.stage_route_boundary.framework_can_reject_abi_valid_route_on_domain_semantic_merit,
    false,
  );
  assert.equal(
    attempts.stage_route_boundary.framework_must_reject_non_authoritative_or_malformed_route_output,
    true,
  );
  assert.equal(attempts.stage_route_boundary.hard_stop_attempt_may_select_terminal_route, false);
  assert.equal(
    Object.hasOwn(
      attempts.stage_route_boundary,
      'framework_can_accept_reject_rank_reconcile_or_override_codex_route',
    ),
    false,
  );
  assert.deepEqual(attempts.stage_route_boundary.declared_default_progression_resolution, [
    'action_stage_route.required_stage_refs_order',
    'unique_current_stage.next_stage_refs',
  ]);
  assert.equal(quality.cross_stage_route_selection.attempt_route_output_is_closeout_judgment_not_stage_topology_or_transition_authority, true);
  assert.equal(quality.cross_stage_route_selection.manifest_file_order_must_not_select_successor, true);
  assert.equal(quality.cross_stage_route_selection.ambiguous_declared_successors_require_decisive_codex_route, true);
  assert.equal(
    attempts.stage_quality_cycle_contract.route_output_abi_validation_required_before_stage_run_projection,
    true,
  );

  const retry = temporal.retry_mapping.stage_quality_revision_budget;
  assert.equal(retry.default_max_repair_rounds, 3);
  assert.equal(retry.initial_review_consumes_repair_round, false);
  for (const field of [
    'separate_from_provider_retry',
    'separate_from_temporal_activity_retry',
    'separate_from_structured_output_retry',
    'separate_from_stage_run_runtime_retry',
  ]) assert.equal(retry[field], true, field);

  for (const field of [
    'attempt_role', 'quality_round_index', 'execution_session_ref',
    'artifact_identity_receipt_refs', 'review_receipts', 'finding_lineage',
    'repair_lineage', 'quality_debt_refs',
  ]) {
    assert.ok(operator.stage_quality_cycle_visibility.developer_operator_drilldown_only.includes(field), field);
    assert.ok(attempts.operator_visibility_fields.includes(field), field);
  }
  assert.equal(operator.stage_quality_cycle_visibility.attempt_must_not_be_presented_as_sub_stage, true);
  assert.equal(operator.stage_quality_cycle_visibility.completed_with_quality_debt_blocks_quality_export_publication_submission_ready_claims, true);
});
