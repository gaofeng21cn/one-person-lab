import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('cognitive computation kernel keeps stage cognition executor-first and tool use affordance-based', () => {
  const cognitiveKernel = readJson<{
    contract_id: string;
    surface_kind: string;
    owner: string;
    state: string;
    kernel_layers: Array<{ layer_id: string }>;
    stage_pack_required_sections: string[];
    tool_affordance_boundary: {
      catalog_role: string;
      standardized_boundary_fields: string[];
      executor_autonomy: Record<string, boolean>;
    };
    route_boundary: Record<string, boolean | string>;
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/cognitive-computation-kernel.json');

  assert.equal(cognitiveKernel.contract_id, 'opl_cognitive_computation_kernel');
  assert.equal(cognitiveKernel.surface_kind, 'opl_cognitive_computation_kernel');
  assert.equal(cognitiveKernel.owner, 'one-person-lab');
  assert.equal(cognitiveKernel.state, 'active_contract');
  assert.deepEqual(cognitiveKernel.kernel_layers.map((layer) => layer.layer_id), [
    'goal_and_constraints',
    'candidate_generation',
    'grounded_reflection',
    'comparative_selection',
    'evolution_and_revision',
    'meta_review_learning',
    'independent_quality_gate',
  ]);

  for (const requiredSection of [
    'prompt_refs',
    'skill_refs',
    'tool_refs',
    'tool_affordance_boundary',
    'knowledge_refs',
    'quality_gate_refs',
  ]) {
    assert.equal(
      cognitiveKernel.stage_pack_required_sections.includes(requiredSection),
      true,
      `cognitive kernel must require ${requiredSection}`,
    );
  }

  assert.equal(
    cognitiveKernel.tool_affordance_boundary.catalog_role,
    'available_affordance_catalog_not_workflow_script',
  );
  for (const boundaryField of [
    'capability_refs',
    'permission_scope_refs',
    'credential_boundary_refs',
    'write_scope_refs',
    'side_effect_risk_refs',
    'forbidden_authority_refs',
  ]) {
    assert.equal(
      cognitiveKernel.tool_affordance_boundary.standardized_boundary_fields.includes(boundaryField),
      true,
      `tool affordance boundary must standardize ${boundaryField}`,
    );
  }

  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.executor_can_choose_tools, true);
  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.executor_can_skip_tools, true);
  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.executor_can_substitute_tools_within_boundary, true);
  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.executor_can_choose_order_and_parallelism, true);
  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.tool_catalog_can_prescribe_tool_sequence, false);
  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.tool_catalog_can_define_cognitive_strategy, false);
  assert.equal(cognitiveKernel.tool_affordance_boundary.executor_autonomy.tool_catalog_can_authorize_forbidden_write, false);

  assert.equal(cognitiveKernel.route_boundary.route_not_stage_strategy, true);
  assert.equal(cognitiveKernel.route_boundary.route_is_stage_internal_strategy, false);
  assert.equal(cognitiveKernel.route_boundary.route_is_small_stage, false);
  assert.equal(cognitiveKernel.route_boundary.route_can_complete_stage, false);
  assert.equal(cognitiveKernel.route_boundary.route_can_generate_candidates, false);
  assert.equal(cognitiveKernel.route_boundary.route_can_evaluate_or_rank_candidates, false);
  assert.equal(cognitiveKernel.route_boundary.route_can_sign_receipts, false);
  assert.equal(cognitiveKernel.route_boundary.route_can_create_typed_blockers, false);
  assert.equal(cognitiveKernel.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(cognitiveKernel.authority_boundary.same_attempt_self_review_can_close_quality_gate, false);
  assert.equal(cognitiveKernel.authority_boundary.independent_gate_receipt_required_for_quality_acceptance_claim, true);
  assert.equal(cognitiveKernel.authority_boundary.independent_gate_receipt_required_for_stage_progression, false);
});
