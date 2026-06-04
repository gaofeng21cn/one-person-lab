import test from 'node:test';
import assert from 'node:assert/strict';

import { loadFamilyManifestFixtures } from './cli/helpers.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

function records(value: unknown): JsonRecord[] {
  assert.equal(Array.isArray(value), true);
  return value as JsonRecord[];
}

function stringRefs(value: unknown) {
  return records(value).map((entry) => String(entry.ref));
}

function loadMasStagePlane() {
  return record(loadFamilyManifestFixtures().medautoscience.family_stage_control_plane);
}

function loadMagStagePlane() {
  const payload = record(loadFamilyManifestFixtures().medautogrant.product_entry_manifest);
  return record(payload.family_stage_control_plane);
}

function assertCognitiveKernelStage(stage: JsonRecord) {
  const selectedExecutor = record(stage.selected_executor);
  assert.equal(selectedExecutor.executor_kind, 'codex_cli');
  assert.equal(selectedExecutor.default_executor, true);

  assert.ok(records(stage.prompt_refs).length > 0);
  assert.ok(records(stage.skills).length > 0);
  assert.ok(records(stage.knowledge_refs).length > 0);
  assert.ok(records(stage.tool_refs).length > 0);
  assert.ok(records(stage.evaluation).length > 0);

  const independentGatePolicy = record(stage.independent_gate_policy);
  assert.equal(independentGatePolicy.execution_review_separation_required, true);
  assert.ok(String(independentGatePolicy.gate_ref).startsWith('agent/quality_gates/'));

  const boundary = record(stage.tool_affordance_boundary);
  assert.equal(boundary.catalog_role, 'available_affordance_catalog_not_workflow_script');
  assert.ok(records(boundary.capability_refs).length > 0);
  assert.ok(records(boundary.permission_scope_refs).length > 0);
  assert.ok(records(boundary.credential_boundary_refs).length > 0);
  assert.ok(records(boundary.write_scope_refs).length > 0);
  assert.ok(records(boundary.side_effect_risk_refs).length > 0);
  assert.ok(records(boundary.forbidden_authority_refs).length > 0);

  const autonomy = record(boundary.executor_autonomy);
  assert.equal(autonomy.executor_can_choose_tools, true);
  assert.equal(autonomy.executor_can_skip_tools, true);
  assert.equal(autonomy.executor_can_substitute_tools_within_boundary, true);
  assert.equal(autonomy.executor_can_choose_order_and_parallelism, true);
  assert.equal(autonomy.executor_can_request_missing_context_or_human_gate, true);
  assert.equal(autonomy.tool_catalog_can_prescribe_tool_sequence, false);
  assert.equal(autonomy.tool_catalog_can_define_cognitive_strategy, false);
  assert.equal(autonomy.tool_catalog_can_override_stage_goal, false);
  assert.equal(autonomy.tool_catalog_can_authorize_forbidden_write, false);

  const authorityBoundary = record(stage.authority_boundary);
  assert.equal(authorityBoundary.opl_can_write_domain_truth, false);
  assert.equal(authorityBoundary.opl_can_sign_owner_receipt, false);
}

test('MAS fixture declares cognitive-kernel stage refs without defaulting domain dispatch evidence', () => {
  const plane = loadMasStagePlane();
  const stages = records(plane.stages);
  const defaultStages = stages.filter((stage) => record(stage.selected_executor).default_executor === true);

  assert.equal(plane.target_domain_id, 'med-autoscience');
  assert.equal(defaultStages.length, 1);
  assert.equal(defaultStages[0]?.stage_id, 'paper_evidence_reviewer_human_gate_delta');
  assertCognitiveKernelStage(defaultStages[0] as JsonRecord);

  const planeAuthority = record(plane.authority_boundary);
  assert.equal(planeAuthority.opl_can_interpret_medical_semantics, false);
  assert.equal(planeAuthority.domain_dispatch_evidence_can_be_default_worklist_root, false);

  const stage = defaultStages[0] as JsonRecord;
  assert.deepEqual(records(stage.domain_stage_refs), [
    'paper_delta',
    'evidence_delta',
    'reviewer_delta',
    'human_gate_delta',
  ]);
  const stageContract = record(stage.stage_contract);
  const progressPolicy = record(stageContract.progress_delta_policy);
  assert.equal(progressPolicy.progress_unit, 'paper_evidence_reviewer_human_gate_delta');
  assert.equal(progressPolicy.domain_dispatch_evidence_counts_as_progress, false);
  assert.equal(progressPolicy.open_worklist_count_counts_as_progress, false);
  assert.equal(stringRefs(stageContract.expected_receipt_refs).length, 1);
});

test('MAG fixture keeps one ordinary authoring path with domain or human owner gates', () => {
  const plane = loadMagStagePlane();
  const stages = records(plane.stages);
  const defaultStages = stages.filter((stage) => record(stage.selected_executor).default_executor === true);

  assert.equal(plane.target_domain_id, 'med-autogrant');
  assert.equal(defaultStages.length, 1);
  assert.equal(defaultStages[0]?.stage_id, 'grant_authoring_fundability_export_submission_delta');
  assertCognitiveKernelStage(defaultStages[0] as JsonRecord);

  const planeAuthority = record(plane.authority_boundary);
  assert.equal(planeAuthority.opl_can_interpret_grant_semantics, false);
  assert.equal(planeAuthority.opl_can_authorize_fundability_or_export, false);

  const stage = defaultStages[0] as JsonRecord;
  assert.deepEqual(records(stage.domain_stage_refs), [
    'authoring_delta',
    'fundability_review',
    'export_gate',
    'submission_gate',
  ]);
  const stageContract = record(stage.stage_contract);
  const progressPolicy = record(stageContract.progress_delta_policy);
  assert.equal(progressPolicy.progress_unit, 'grant_authoring_fundability_export_submission_delta');
  assert.equal(progressPolicy.submission_ready_export_gate_owner, 'domain_or_human_owner');
  assert.equal(progressPolicy.shell_or_manifest_diagnostic_counts_as_progress, false);
  assert.equal(progressPolicy.hermes_proof_lane_counts_as_default_progress, false);
  assert.deepEqual(stringRefs(stageContract.expected_receipt_refs), [
    'receipt:mag/authoring-fundability-export-submission/domain-owner-or-typed-blocker',
    'human_gate:mag_route_gate_revision',
  ]);
});
