import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileStandardAgentStageManifest } from '../../src/modules/pack/index.ts';
import { loadFamilyManifestFixtures } from './cli/helpers.ts';
import { createAdmittedStagePackFixture } from './cli/cases/workspace-domain-test-helper.ts';

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

function buildGeneratedPlane(
  payload: JsonRecord,
  targetDomainId: string,
  owner: string,
) {
  const fixture = createAdmittedStagePackFixture(payload, targetDomainId, owner);
  return {
    fixture,
    plane: compileStandardAgentStageManifest(fixture.repoDir).stage_control_plane as unknown as JsonRecord,
  };
}

function assertGeneratedCognitiveStage(stage: JsonRecord) {
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
  for (const field of [
    'capability_refs',
    'permission_scope_refs',
    'credential_boundary_refs',
    'write_scope_refs',
    'side_effect_risk_refs',
    'forbidden_authority_refs',
  ]) assert.ok(records(boundary[field]).length > 0);

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

function assertGeneratedPlane(payload: JsonRecord, targetDomainId: string, owner: string) {
  const { fixture, plane } = buildGeneratedPlane(payload, targetDomainId, owner);
  try {
    const stages = records(plane.stages);
    const defaultStages = stages.filter((stage) => record(stage.selected_executor).default_executor === true);

    assert.equal(plane.target_domain_id, targetDomainId);
    assert.equal(stages.length, 6);
    assert.equal(defaultStages.length, 1);
    assert.equal(defaultStages[0]?.stage_id, 'stage_1');
    assertGeneratedCognitiveStage(defaultStages[0] as JsonRecord);

    const planeAuthority = record(plane.authority_boundary);
    assert.equal(planeAuthority.opl_can_write_domain_truth, false);
    assert.equal(planeAuthority.opl_can_authorize_quality_or_export, false);

    const stageContract = record((defaultStages[0] as JsonRecord).stage_contract);
    const progressPolicy = record(stageContract.progress_delta_policy);
    assert.equal(progressPolicy.platform_only_is_not_deliverable_progress, true);
    assert.equal(records(stageContract.expected_receipt_refs).length, 1);
    assert.equal(records(stageContract.expected_receipt_refs)[0]?.ref, 'domain_owner_receipt_or_typed_blocker_ref');
  } finally {
    fs.rmSync(fixture.repoDir, { recursive: true, force: true });
  }
}

test('MAS fixture compiles its cognitive stage refs from the canonical generated surface', () => {
  assertGeneratedPlane(
    loadFamilyManifestFixtures().medautoscience,
    'med-autoscience',
    'MedAutoScience',
  );
});

test('MAG fixture compiles its authoring stages from the canonical generated surface', () => {
  assertGeneratedPlane(
    loadFamilyManifestFixtures().medautogrant,
    'med-autogrant',
    'MedAutoGrant',
  );
});
