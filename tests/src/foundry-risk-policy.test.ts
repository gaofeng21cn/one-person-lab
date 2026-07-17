import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentBlueprint } from '../../src/modules/foundry/index.ts';
import {
  assertEvaluationPolicyNonWeakening,
  recomputeBlueprintRisk,
} from '../../src/modules/foundry/risk-policy.ts';

function blueprint(): AgentBlueprint {
  const inputSchemaRef = `opl-content://sha256/${'3'.repeat(64)}`;
  const outputSchemaRef = `opl-content://sha256/${'4'.repeat(64)}`;
  const artifactSchemaRef = `opl-content://sha256/${'5'.repeat(64)}`;
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: 'opl-foundry-protocol.v1',
    blueprint_id: 'blueprint:risk',
    target_agent_id: 'risk-agent',
    target_domain_id: 'risk-domain',
    target_version_ref: null,
    design_request_digest: `sha256:${'1'.repeat(64)}`,
    generation: 0,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'delivery',
        goal: 'Deliver',
        input_artifact_types: ['request'],
        output_artifact_types: ['result'],
        prompt_ref: 'prompt:one',
        skill_refs: ['skill:one'],
        knowledge_refs: ['knowledge:one'],
        capability_refs: ['capability:one'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver',
      entry_stage_id: 'deliver',
      input_schema_ref: inputSchemaRef,
      output_schema_ref: outputSchemaRef,
    }],
    artifact_contracts: [{
      artifact_type: 'result',
      schema_ref: artifactSchemaRef,
      authority_owner_ref: 'owner:result',
    }],
    content_refs: {
      prompt_refs: ['prompt:one', 'prompt:two'],
      skill_refs: ['skill:one', 'skill:two'],
      knowledge_refs: ['knowledge:one', 'knowledge:two'],
      helper_refs: [],
      model_refs: ['model:one'],
      tool_refs: ['tool:one'],
      schema_refs: [inputSchemaRef, outputSchemaRef, artifactSchemaRef],
    },
    capability_requirements: ['capability:one'],
    authority_policy: {
      truth_owner_ref: 'owner:truth',
      artifact_owner_ref: 'owner:artifact',
      quality_owner_ref: 'owner:quality',
      permission_refs: [],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: [],
      retention_refs: [],
      write_authority_refs: [],
    },
    assumptions: [],
    design_evidence_refs: ['evidence:design'],
    eval_spec: {
      eval_spec_id: 'eval:risk',
      public_cases: [{ case_id: 'public:one', test_ref: 'test:one', weight: 1, required: true }],
      protected_requirements: [{ category: 'safety', minimum_case_count: 1 }],
      gates: [{ gate_id: 'gate:score', metric: 'score', operator: 'gte', threshold: 0.8, required: true }],
      baseline_comparison: { required: true, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

test('risk recomputation sees Stage-local bindings and classifies routing separately from I/O', () => {
  const previous = blueprint();
  const skillRebind = structuredClone(previous);
  skillRebind.stage_graph.stages[0]!.skill_refs = ['skill:two'];
  assert.deepEqual(recomputeBlueprintRisk(previous, skillRebind), {
    risk_tier: 'medium',
    reasons: ['stage_skill_binding_changed'],
  });

  const actionRoute = structuredClone(previous);
  actionRoute.actions[0]!.entry_stage_id = 'other';
  const routeRisk = recomputeBlueprintRisk(previous, actionRoute);
  assert.equal(routeRisk.risk_tier, 'medium');
  assert.ok(routeRisk.reasons.includes('action_routing_changed'));

  const actionIo = structuredClone(previous);
  actionIo.actions[0]!.output_schema_ref = 'schema:changed';
  assert.equal(recomputeBlueprintRisk(previous, actionIo).risk_tier, 'high');
});

test('risk recomputation treats protected-suite strengthening as low and weakening as high', () => {
  const previous = blueprint();
  const stronger = structuredClone(previous);
  stronger.eval_spec.protected_requirements[0]!.minimum_case_count = 2;
  const strongerRisk = recomputeBlueprintRisk(previous, stronger);
  assert.equal(strongerRisk.risk_tier, 'low');
  assert.ok(strongerRisk.reasons.includes('protected_evaluation_requirements_strengthened'));
  assert.doesNotThrow(() => assertEvaluationPolicyNonWeakening(previous, stronger));

  const weaker = structuredClone(previous);
  weaker.eval_spec.protected_requirements[0]!.minimum_case_count = 0;
  assert.equal(recomputeBlueprintRisk(previous, weaker).risk_tier, 'high');
  assert.throws(() => assertEvaluationPolicyNonWeakening(previous, weaker), /deletes or weakens/);
});

test('baseline comparison cannot be disabled or relaxed during evolution', () => {
  const previous = blueprint();
  const disabled = structuredClone(previous);
  disabled.eval_spec.baseline_comparison.required = false;
  assert.throws(() => assertEvaluationPolicyNonWeakening(previous, disabled), (error: any) => (
    error.details?.violations?.includes('baseline_comparison_disabled') === true
  ));

  const relaxed = structuredClone(previous);
  relaxed.eval_spec.baseline_comparison.regression_tolerance = 0.1;
  assert.throws(() => assertEvaluationPolicyNonWeakening(previous, relaxed), (error: any) => (
    error.details?.violations?.includes('baseline_regression_tolerance_weakened') === true
  ));
  assert.equal(recomputeBlueprintRisk(previous, relaxed).risk_tier, 'high');
});

test('risk recomputation fails closed for previously unclassified Blueprint changes', () => {
  const previous = blueprint();
  const assumptionChanged = structuredClone(previous);
  assumptionChanged.assumptions = ['new operational assumption'];
  assert.deepEqual(recomputeBlueprintRisk(previous, assumptionChanged), {
    risk_tier: 'high',
    reasons: ['unclassified_blueprint_change'],
  });

  const actionSummaryChanged = structuredClone(previous);
  actionSummaryChanged.actions[0]!.summary = 'A materially different command';
  assert.deepEqual(recomputeBlueprintRisk(previous, actionSummaryChanged), {
    risk_tier: 'high',
    reasons: ['unclassified_blueprint_change'],
  });
});
