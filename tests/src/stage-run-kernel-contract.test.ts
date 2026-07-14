import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  evaluateStageRunProgress,
  rebuildStageRunReadModel,
  stageRunEvent,
} from '../../src/modules/stagecraft/stage-run-kernel.ts';
import { buildAppStageRunCockpit } from '../../src/modules/stagecraft/stage-run-cockpit.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function contract() {
  return parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/stage-run-kernel-contract.json'),
    'utf8',
  )) as Record<string, any>;
}

test('StageRun contract is passive transport and Codex owns semantic routing', () => {
  const value = contract();
  const serialized = JSON.stringify(value);

  assert.equal(value.contract_kind, 'opl_stage_run_kernel_contract.v2');
  assert.equal(value.machine_boundary.codex_cli_owns.semantic_stage_selection, true);
  assert.equal(value.progress_first_policy.readable_artifact_allows_any_declared_stage, true);
  assert.equal(value.progress_first_policy.quality_budget_exhaustion_blocks_route, false);
  assert.equal(
    value.launch_policy.framework_semantic_route_role,
    'validate_attempt_authority_and_route_abi_then_project_declared_target_without_domain_semantic_judgment',
  );
  assert.equal(value.machine_boundary.opl_owns.decisive_attempt_route_abi_validation, true);
  assert.equal(value.machine_boundary.opl_owns.durable_stage_run_invocation_identity, true);
  assert.deepEqual(value.durable_stage_run_launch.stage_run_id_derivation.ordered_inputs, [
    'domain_id',
    'stage_id',
    'stage_run_invocation_id',
  ]);
  assert.equal(
    value.durable_stage_run_launch.stage_run_id_derivation.immutable_spec_fields_participate_directly,
    false,
  );
  assert.ok(value.durable_stage_run_launch.stage_run_spec_sha256.binds.includes(
    'immutable_package_dependency_closure_with_root_content_digest',
  ));
  assert.equal(value.durable_stage_run_launch.content_binding_policy.pack_file_refs_bind_actual_bytes, true);
  assert.equal(
    value.durable_stage_run_launch.content_binding_policy.fresh_bytes_verified_before_every_attempt_materialization,
    true,
  );
  assert.equal(value.durable_stage_run_launch.content_binding_policy.root_package_content_digest_required, true);
  assert.ok(value.durable_stage_run_launch.stage_run_spec_sha256.excludes.includes('checked_at'));
  assert.equal(value.durable_stage_run_launch.launch_registry.table, 'stage_run_launches');
  assert.equal(
    value.durable_stage_run_launch.launch_registry.validate_identity_and_spec_before_registry_write,
    true,
  );
  assert.equal(
    value.durable_stage_run_launch.launch_registry.closed_state_is_monotonic_under_late_start_receipt,
    true,
  );
  assert.deepEqual(value.durable_stage_run_launch.launch_registry.statuses, [
    'registered', 'starting', 'start_failed', 'started', 'closed',
  ]);
  assert.equal(
    value.durable_stage_run_launch.launch_registry.concurrent_start_callers,
    'registry_serializes_state_transitions_but_may_redeliver_the_same_idempotent_provider_start',
  );
  assert.equal(
    value.durable_stage_run_launch.launch_registry.provider_start_delivery,
    'at_least_once_for_starting_unknown_success_recovery',
  );
  assert.equal(
    value.durable_stage_run_launch.launch_registry.temporal_execution_deduplication,
    'deterministic_workflow_id_plus_use_existing_and_reject_duplicate_yields_exactly_one_stage_run_execution',
  );
  assert.equal(value.durable_stage_run_launch.launch_registry.started_cannot_transition_to_start_failed, true);
  assert.equal(
    value.durable_stage_run_launch.launch_registry.same_invocation_different_spec,
    'typed_fail_closed_stage_run_invocation_spec_conflict',
  );
  assert.equal(
    value.durable_stage_run_launch.route_materialization.stage_transition_materialization_owner,
    'opl_stage_run_controller',
  );
  assert.equal(value.route_output_policy.semantic_route_owner, 'decisive_codex_attempt');
  assert.deepEqual(value.route_output_policy.formal_review_decisive_roles, ['reviewer', 're_reviewer']);
  assert.equal(
    value.route_output_policy.missing_or_invalid_route_fallback,
    'domain_pack_declared_default_progression_with_route_quality_debt_only',
  );
  assert.deepEqual(value.route_output_policy.declared_default_progression_resolution, [
    'action_stage_route.required_stage_refs_order',
    'unique_current_stage.next_stage_refs',
  ]);
  assert.equal(value.route_output_policy.manifest_file_order_must_not_select_successor, true);
  assert.equal(value.route_output_policy.ambiguous_declared_successors_require_decisive_codex_route, true);
  assert.equal(value.authority_boundary.opl_can_validate_route_output_abi_and_attempt_authority, true);
  assert.equal(value.authority_boundary.opl_must_reject_non_authoritative_or_malformed_route_output, true);
  assert.equal(value.authority_boundary.opl_can_reject_abi_valid_route_on_domain_semantic_merit, false);
  assert.equal(value.authority_boundary.opl_can_select_semantic_stage_route, false);
  assert.equal(
    Object.hasOwn(value.authority_boundary, 'opl_can_accept_reject_rank_reconcile_or_override_codex_route'),
    false,
  );
  assert.equal(Object.hasOwn(value.authority_boundary, 'opl_can_create_execution_authorization_blocker'), false);
  assert.equal(serialized.includes('stage_run_execution_authorization_ledger'), false);
  assert.equal(serialized.includes('closeout_binding_gate'), false);
});

test('launch metadata gaps are advisory while unsafe authority and forbidden writes hard stop', () => {
  const advisory = evaluateStageRunProgress({
    phase: 'launch',
    stage_run_id: 'run:1',
    domain_id: 'rca',
    stage_id: 'author_image_pages',
  });
  assert.equal(advisory.status, 'progress_ready_with_quality_debt');
  assert.deepEqual(advisory.launch_hard_stop_reasons, []);

  const unsafe = evaluateStageRunProgress({
    phase: 'launch',
    stage_run_id: 'run:1',
    domain_id: 'rca',
    stage_id: 'author_image_pages',
    authority_boundary: {
      opl_can_write_domain_truth: true,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: true,
  });
  assert.deepEqual(unsafe.launch_hard_stop_reasons.sort(), [
    'authority_boundary_invalid',
    'forbidden_write_required',
  ]);
});

test('readable artifact advances without typed closeout owner answer or review receipt', () => {
  const report = evaluateStageRunProgress({
    phase: 'closeout',
    stage_run_id: 'run:mas:negative-result',
    domain_id: 'mas',
    stage_id: 'bounded_analysis_campaign',
    consumable_artifact_refs: ['mas://analysis/null-result-with-diagnostic'],
  });

  assert.equal(report.transition_outcome, 'completed_with_quality_debt');
  assert.deepEqual(report.closeout_hard_stop_reasons, []);
  assert.ok(report.quality_debt_reasons.includes('owner_answer_missing_for_quality_or_ready_claim'));
});

test('zero readable artifact becomes a no-output diagnostic and next-stage quality debt', () => {
  const report = evaluateStageRunProgress({
    phase: 'closeout',
    stage_run_id: 'run:empty',
    domain_id: 'rca',
    stage_id: 'author_image_pages',
  });

  assert.equal(report.status, 'progress_ready_with_quality_debt');
  assert.equal(report.transition_outcome, 'completed_with_quality_debt');
  assert.deepEqual(report.closeout_hard_stop_reasons, []);
  assert.ok(report.progress_diagnostic_refs.includes('opl://stage-run/run%3Aempty/no-output-diagnostic'));
  assert.ok(report.quality_debt_reasons.includes('no_consumable_artifact_or_owner_answer'));
});

test('StageRun event log stays refs-only and ignores stale identity-bound authority events', () => {
  const events = [
    stageRunEvent({
      event_id: 'e1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'run:1',
      generation: 1,
      observed_at: '2026-07-12T00:00:00Z',
    }),
    stageRunEvent({
      event_id: 'e2',
      event_kind: 'artifact_ref_observed',
      stage_run_id: 'run:1',
      generation: 1,
      observed_at: '2026-07-12T00:01:00Z',
      artifact_ref: 'rca://deck/page-1',
    }),
  ];
  const projection = rebuildStageRunReadModel(events).stage_runs[0];

  assert.equal(projection.stage_run_id, 'run:1');
  assert.equal(projection.artifact_body_included, false);
  assert.equal(projection.domain_truth_included, false);
});

test('StageRun event rejects embedded body and domain verdict authority', () => {
  assert.throws(() => stageRunEvent({
    event_id: 'e1',
    event_kind: 'artifact_ref_observed',
    stage_run_id: 'run:1',
    generation: 1,
    observed_at: '2026-07-12T00:00:00Z',
    artifact_body: 'forbidden',
  }));
  assert.throws(() => stageRunEvent({
    event_id: 'e2',
    event_kind: 'provider_completed',
    stage_run_id: 'run:1',
    generation: 1,
    observed_at: '2026-07-12T00:00:00Z',
    domain_ready: true,
  }));
});

test('App cockpit exposes progress and route options without a next authorization action', () => {
  const cockpit = buildAppStageRunCockpit({
    domain: 'rca',
    current_owner: 'rca',
    stage_id: 'author_image_pages',
    consumable_artifact_refs: ['rca://deck/page-draft'],
  });

  assert.equal(cockpit.next_required_owner_action, null);
  assert.equal(cockpit.stage_run_current_owner_delta.next_stage_may_start, true);
  assert.deepEqual(cockpit.stage_run_current_owner_delta.route_options, [
    'skip',
    'repeat',
    'reverse',
    'route_back',
    'advance',
  ]);
  assert.equal(Object.hasOwn(cockpit, 'execution_authorization'), false);
});
