import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryFrozenEvaluationPlanDigest,
  type AgentBlueprint,
  type DesignRequest,
  type MaterializedCandidate,
} from '../../src/modules/foundry/index.ts';
import { foundryEvaluationOperationIdentity } from '../../src/modules/foundry/operation-result.ts';
import { ProcessFoundryEvaluationExecutor } from '../../src/modules/runway/foundry-process-evaluator.ts';

const request: DesignRequest = {
  surface_kind: 'opl_foundry_design_request',
  version: FOUNDRY_PROTOCOL_VERSION,
  request_id: 'request:process-evaluator',
  mode: 'create',
  target_agent_id: 'fixture-agent',
  target_domain_id: 'fixture-domain',
  target_version_ref: null,
  objective: 'Evaluate one immutable candidate.',
  acceptance_criteria: ['The required case passes.'],
  non_goals: [],
  source_refs: ['source:fixture'],
  constraints: {
    capability_refs: ['capability:text'],
    permission_refs: [],
    privacy_requirements: ['privacy:no-sensitive-data'],
    cost_limits: { usd: 1 },
    latency_limits: { milliseconds: 1000 },
  },
  delivery_policy: { activation_mode: 'qualify_only', max_generations: 1 },
};

const blueprint: AgentBlueprint = {
  surface_kind: 'opl_foundry_agent_blueprint',
  version: FOUNDRY_PROTOCOL_VERSION,
  blueprint_id: 'blueprint:process-evaluator',
  target_agent_id: request.target_agent_id,
  target_domain_id: request.target_domain_id,
  target_version_ref: null,
  design_request_digest: `sha256:${'1'.repeat(64)}`,
  generation: 0,
  stage_graph: {
    entry_stage_id: 'deliver',
    stages: [{
      stage_id: 'deliver',
      stage_kind: 'domain_delivery',
      goal: 'Deliver the accepted output.',
      input_artifact_types: ['request'],
      output_artifact_types: ['delivery'],
      prompt_ref: 'prompt:fixture',
      skill_refs: [],
      knowledge_refs: [],
      capability_refs: ['capability:text'],
      next_stage_ids: [],
    }],
  },
  actions: [{
    action_id: 'deliver',
    summary: 'Deliver the fixture output.',
    entry_stage_id: 'deliver',
    input_schema_ref: 'schema:input',
    output_schema_ref: 'schema:output',
  }],
  artifact_contracts: [{
    artifact_type: 'delivery',
    schema_ref: 'schema:output',
    authority_owner_ref: 'owner:fixture',
  }],
  content_refs: {
    prompt_refs: ['prompt:fixture'],
    skill_refs: [],
    knowledge_refs: [],
    helper_refs: [],
    model_refs: ['model:fixture'],
    tool_refs: [],
  },
  capability_requirements: ['capability:text'],
  authority_policy: {
    truth_owner_ref: 'owner:fixture',
    artifact_owner_ref: 'owner:fixture',
    quality_owner_ref: 'owner:fixture',
    owner_gate_refs: ['owner:fixture'],
    generated_agent_can_modify_versions: false,
    generated_agent_can_modify_evaluation: false,
    generated_agent_can_modify_permissions: false,
    generated_agent_can_modify_activation: false,
  },
  memory_policy: { memory_classes: [], retention_refs: [], write_authority_refs: [] },
  assumptions: [],
  design_evidence_refs: ['evidence:design'],
  eval_spec: {
    eval_spec_id: 'eval:process-evaluator',
    public_cases: [{ case_id: 'case:required', test_ref: 'test:required', weight: 1, required: true }],
    protected_requirements: [{ category: 'privacy:no-sensitive-data', minimum_case_count: 1 }],
    gates: [{ gate_id: 'gate:required', metric: 'score', operator: 'gte', threshold: 1, required: true }],
    baseline_comparison: { required: false, regression_tolerance: 0 },
    independent_evaluator_required: true,
  },
  risk_hint: 'low',
};

const candidate: MaterializedCandidate = {
  surface_kind: 'opl_foundry_materialized_candidate',
  target_agent_id: request.target_agent_id,
  target_domain_id: request.target_domain_id,
  blueprint_digest: `sha256:${'2'.repeat(64)}`,
  candidate_digest: `sha256:${'3'.repeat(64)}`,
  candidate_ref: 'opl://foundry/candidates/fixture',
  manifest_digest: `sha256:${'4'.repeat(64)}`,
};

const operationIdentity = foundryEvaluationOperationIdentity({
  run_id: 'run:process-evaluator',
  generation: 0,
  phase: 'evaluate',
  input_digest: `sha256:${'5'.repeat(64)}`,
});

function evaluatorScript(extraFields = '', costUsd = 0.25) {
  const planDigest = foundryFrozenEvaluationPlanDigest(blueprint.eval_spec);
  return `
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (/hidden_test_bod|protected_test_bod/.test(JSON.stringify(input))) process.exit(91);
    process.stdout.write(JSON.stringify({
      surface_kind: 'opl_foundry_evaluation_observation',
      version: 'opl-foundry-evaluation-observation.v1',
      evidence_id: 'evidence:process-evaluator',
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      baseline_version_digest: null,
      frozen_test_plan_digest: '${planDigest}',
      public_results: [{ case_id: 'case:required', status: 'pass', score: 1, evidence_refs: ['evidence:public'] }],
      baseline_public_results: null,
      baseline_protected_aggregates: null,
      protected_aggregates: [{ category: 'privacy:no-sensitive-data', total: 1, passed: 1, failed: 0, score: 1 }],
      safety_delta: { incidents: 0 },
      cost_delta: { usd: ${costUsd} },
      latency_delta: { milliseconds: 250 },
      failure_classification: [],
      provenance: {
        foundry_run_id: input.run_id,
        generation: input.blueprint.generation,
        producer_id: input.evaluator_id,
        evaluated_at: '2026-07-16T00:00:00.000Z',
        source_refs: ['evidence:evaluator-process']
      }${extraFields}
    }));
  `;
}

const reviewerScript = `
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const transport = JSON.stringify(input);
  if (/hidden_test_bod|protected_test_bod/.test(transport)) process.exit(91);
  if (input.protected_test_transport?.bodies_in_request !== false) process.exit(92);
  process.stdout.write(JSON.stringify({
    surface_kind: 'opl_foundry_independent_review_result',
    version: 'opl-foundry-independent-review-result.v1',
    verdict: 'pass',
    findings: [],
    evidence_refs: ['evidence:reviewer-process']
  }));
`;

function evaluator(extraFields = '', costUsd = 0.25) {
  return new ProcessFoundryEvaluationExecutor({
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorScript(extraFields, costUsd)],
    reviewer_executable: process.execPath,
    reviewer_args: ['--input-type=module', '--eval', reviewerScript],
    reviewer_id: 'reviewer:separate-process',
    candidate_directory: () => process.cwd(),
    timeout_ms: 10_000,
    reviewer_timeout_ms: 10_000,
  });
}

test('process evaluation launches a separate reviewer and OPL authors the final review and qualification', async () => {
  const evidence = await evaluator().evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  });

  assert.equal(evidence.qualified, true);
  assert.equal(evidence.gate_score, 1);
  assert.equal(evidence.independent_review.evaluator_ref, 'reviewer:separate-process');
  assert.notEqual(
    evidence.independent_review.evaluation_execution_ref,
    evidence.independent_review.review_execution_ref,
  );
  assert.deepEqual(evidence.independent_review.evidence_refs, ['evidence:reviewer-process']);
  assert.deepEqual(evidence.cost_delta, { usd: 0.25 });
  assert.deepEqual(evidence.latency_delta, { milliseconds: 250 });
});

test('process evaluator cannot self-report independent review or qualification fields', async () => {
  await assert.rejects(evaluator(`,
    independent_review: {
      evaluator_ref: 'reviewer:self-reported',
      evaluation_execution_ref: 'evaluation:self-reported',
      review_execution_ref: 'review:self-reported',
      verdict: 'pass', findings: [], evidence_refs: ['evidence:self-reported']
    },
    qualified: true,
    gate_score: 1
  `).evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  }), /evaluation observation/i);
});

test('process evaluation cannot qualify a candidate that exceeds a DesignRequest resource limit', async () => {
  const evidence = await evaluator('', 2).evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  });

  assert.equal(evidence.qualified, false);
  assert.ok(evidence.failure_classification.some((entry) =>
    entry.gate_id === 'request_constraint:cost:usd'
    && entry.failure_class === 'cost_constraint_exceeded'));
});

test('process evaluation fails closed without a separately configured reviewer executable', async () => {
  const withoutReviewer = new ProcessFoundryEvaluationExecutor({
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorScript()],
    candidate_directory: () => process.cwd(),
  });
  await assert.rejects(withoutReviewer.evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  }), /separately configured reviewer executable/);
});
