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
  assert.equal(
    Object.hasOwn(contract.current_control_state_projection.authority_boundary, 'can_claim_publication_ready'),
    false,
  );
  assertFalseAuthority(contract.current_control_state_projection.authority_boundary);
  assertFalseAuthority(contract.stability_projection_authority_boundary);
});

test('stage route transport cannot become a second semantic control plane', () => {
  const contract = readJson('contracts/opl-framework/stage-route-transport-contract.json');

  assert.equal(contract.codex_semantic_route_boundary.semantic_owner, 'codex_cli');
  assert.equal(contract.codex_semantic_route_boundary.framework_can_accept_reject_rank_select_reconcile_or_override_route, false);
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
