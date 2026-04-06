import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath: string): Json {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

function findReadyForInclusionClause(schema: Json) {
  return schema.$defs.formalInclusionGate.allOf.find(
    (clause: Json) => clause?.if?.properties?.overall_status?.const === 'ready_for_inclusion',
  );
}

test('domain-onboarding readiness schema requires execution-model alignment before ready_for_inclusion', () => {
  const schema = readJson('contracts/opl-gateway/domain-onboarding-readiness.schema.json');

  assert.ok(schema.required.includes('execution_model'));
  assert.ok(schema.$defs.formalInclusionGate.required.includes('execution_model_aligned'));

  const executionModel = schema.$defs.executionModelDeclaration;
  assert.equal(executionModel.properties.default_executor.const, 'agent_first');
  assert.equal(executionModel.properties.auto_human_share_one_base.const, true);
  assert.equal(executionModel.properties.fixed_code_first_mainline_forbidden.const, true);
  assert.equal(executionModel.properties.single_mode_steady_state_forbidden.const, true);
  assert.ok(executionModel.required.includes('stable_agent_runtime_surface_refs'));
  assert.ok(executionModel.required.includes('convergence_surface_refs'));
  assert.ok(executionModel.required.includes('code_responsibility_surface_refs'));

  const readyClause = findReadyForInclusionClause(schema);
  assert.ok(readyClause, 'Expected a ready_for_inclusion clause in formalInclusionGate.');
  assert.equal(
    readyClause.then.properties.execution_model_aligned.properties.status.const,
    'ready',
  );
});

test('example onboarding record declares the agent-first execution model and aligned gate', () => {
  const schema = readJson('contracts/opl-gateway/domain-onboarding-readiness.schema.json');
  const example = readJson('examples/opl-gateway/domain-onboarding-readiness.json');
  const embeddedExample = schema.examples[0];

  for (const record of [embeddedExample, example]) {
    assert.equal(record.execution_model.default_executor, 'agent_first');
    assert.equal(record.execution_model.auto_human_share_one_base, true);
    assert.equal(record.execution_model.fixed_code_first_mainline_forbidden, true);
    assert.equal(record.execution_model.single_mode_steady_state_forbidden, true);
    assert.ok(record.execution_model.stable_agent_runtime_surface_refs.length > 0);
    assert.ok(record.execution_model.convergence_surface_refs.length > 0);
    assert.ok(record.execution_model.code_responsibility_surface_refs.length > 0);
    assert.equal(record.formal_inclusion_gate.execution_model_aligned.status, 'ready');
    assert.match(
      record.formal_inclusion_gate.execution_model_aligned.evidence_refs.join(' '),
      /stable_agent_runtime_surface|shared_base_auto_hitl|default_executor=agent_first/i,
    );
  }
});

test('task topology keeps under-definition workstreams blocked without stable runtime and shared-base convergence', () => {
  const topology = readJson('contracts/opl-gateway/task-topology.json');

  assert.ok(
    topology.topology_rules.some((rule: string) =>
      /stable agent runtime surface.*Auto\/Human-in-the-loop convergence path.*under definition \/ deferred/i.test(
        rule,
      ),
    ),
  );

  for (const workstreamId of ['grant_ops', 'thesis_ops', 'review_ops']) {
    const workstream = topology.workstreams.find(
      (entry: Json) => entry.workstream_id === workstreamId,
    );
    assert.ok(workstream, `Expected ${workstreamId} in task-topology.json.`);
    assert.equal(workstream.boundary_state, 'under_definition');
    assert.equal(workstream.routing_state, 'unknown_domain_only');
    assert.match(workstream.notes, /stable agent runtime surface/i);
    assert.match(workstream.notes, /shared-base Auto\/Human-in-the-loop convergence path/i);
    assert.match(workstream.notes, /under definition/i);
  }
});

test('candidate-domain backlog makes execution-model blockers explicit for under-definition workstreams', () => {
  const backlog = readJson('contracts/opl-gateway/candidate-domain-backlog.json');

  assert.ok(backlog.required_package_ids.includes('execution_model'));
  assert.ok(backlog.formal_inclusion_check_ids.includes('execution_model_aligned'));
  assert.ok(
    backlog.backlog_rules.some((rule: string) =>
      /under definition \/ deferred.*stable agent runtime surface.*Auto\/Human-in-the-loop convergence path/i.test(
        rule,
      ),
    ),
  );

  for (const workstreamId of ['grant_ops', 'thesis_ops', 'review_ops']) {
    const candidate = backlog.candidate_workstreams.find(
      (entry: Json) => entry.workstream_id === workstreamId,
    );
    assert.ok(candidate, `Expected ${workstreamId} in candidate-domain-backlog.json.`);

    const executionModelPackage = candidate.required_onboarding_materials.find(
      (entry: Json) => entry.package_id === 'execution_model',
    );
    assert.ok(executionModelPackage, `Expected execution_model package for ${workstreamId}.`);
    assert.equal(executionModelPackage.status, 'missing');
    assert.match(
      executionModelPackage.required_evidence.join(' '),
      /stable agent runtime surface.*Auto\/Human-in-the-loop shared-base convergence path/i,
    );

    const executionModelMissing = candidate.missing_boundary_materials.find(
      (entry: Json) => entry.maps_to_formal_inclusion_check === 'execution_model_aligned',
    );
    assert.ok(executionModelMissing, `Expected execution_model_aligned blocker for ${workstreamId}.`);
    assert.equal(executionModelMissing.package_id, 'execution_model');
    assert.equal(executionModelMissing.status, 'missing');

    assert.deepEqual(candidate.formal_inclusion_gate.execution_model_aligned, {
      status: 'blocked',
      blocking_package_ids: ['execution_model'],
    });
    assert.equal(candidate.formal_inclusion_gate.review_ready.status, 'blocked');
    assert.equal(candidate.formal_inclusion_gate.cross_domain_wording_aligned.status, 'blocked');
  }
});
