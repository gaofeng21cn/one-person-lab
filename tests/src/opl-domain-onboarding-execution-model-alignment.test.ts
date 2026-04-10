import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): Json {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

function findReadyForInclusionClause(schema: Json) {
  return schema.$defs.formalInclusionGate.allOf.find(
    (clause: Json) => clause?.if?.properties?.overall_status?.const === 'ready_for_inclusion',
  );
}

const expectedSchemaRequired = [
  'version',
  'onboarding_id',
  'candidate_domain',
  'candidate_workstreams',
  'routing_vocabulary_impact',
  'public_documentation',
  'truth_ownership',
  'review_surfaces',
  'execution_model',
  'discovery_readiness',
  'routing_readiness',
  'cross_domain_wording',
  'formal_inclusion_gate',
  'boundary_guards',
];

const expectedFormalGateRequired = [
  'overall_status',
  'registry_complete',
  'boundary_explicit',
  'truth_ownership_explicit',
  'discovery_ready',
  'routing_ready',
  'review_ready',
  'execution_model_aligned',
  'cross_domain_wording_aligned',
];

const expectedRequiredPackageIds = [
  'registry_material',
  'public_documentation',
  'truth_ownership',
  'review_surfaces',
  'execution_model',
  'discovery_readiness',
  'routing_readiness',
  'cross_domain_wording',
];

const expectedMissingBoundaryMapping = {
  registry_complete: 'registry_material',
  boundary_explicit: 'public_documentation',
  truth_ownership_explicit: 'truth_ownership',
  discovery_ready: 'discovery_readiness',
  routing_ready: 'routing_readiness',
  review_ready: 'review_surfaces',
  execution_model_aligned: 'execution_model',
  cross_domain_wording_aligned: 'cross_domain_wording',
};

test('domain-onboarding readiness schema requires execution-model alignment before ready_for_inclusion', () => {
  const schema = readJson('contracts/opl-gateway/domain-onboarding-readiness.schema.json');

  assert.deepEqual(schema.required, expectedSchemaRequired);
  assert.ok(!schema.required.includes('discovery_routing_readiness'));
  assert.deepEqual(schema.$defs.formalInclusionGate.required, expectedFormalGateRequired);

  const executionModel = schema.$defs.executionModelDeclaration;
  assert.equal(executionModel.properties.default_executor.const, 'agent_first');
  assert.equal(executionModel.properties.auto_human_share_one_base.const, true);
  assert.equal(executionModel.properties.fixed_code_first_mainline_forbidden.const, true);
  assert.equal(executionModel.properties.single_mode_steady_state_forbidden.const, true);
  assert.ok(executionModel.required.includes('stable_agent_runtime_surface_refs'));
  assert.ok(executionModel.required.includes('convergence_surface_refs'));
  assert.ok(executionModel.required.includes('code_responsibility_surface_refs'));

  const discoveryReadiness = schema.$defs.discoveryReadinessDeclaration;
  assert.equal(discoveryReadiness.properties.discovery_entry_surface.const, 'domain_gateway');
  assert.equal(discoveryReadiness.properties.discovery_evidence_explicit.const, true);
  assert.ok(discoveryReadiness.required.includes('discovery_workstream_ids'));

  const routingReadiness = schema.$defs.routingReadinessDeclaration;
  assert.equal(routingReadiness.properties.routing_entry_surface.const, 'domain_gateway');
  assert.equal(routingReadiness.properties.direct_harness_bypass_allowed.const, false);
  assert.equal(routingReadiness.properties.routing_evidence_explicit.const, true);
  assert.equal(routingReadiness.properties.handoff_payload_targets_domain_gateway_only.const, true);
  assert.ok(routingReadiness.required.includes('routing_workstream_ids'));

  const crossDomainWording = schema.$defs.crossDomainWordingDeclaration;
  assert.equal(crossDomainWording.properties.top_level_role_language_aligned.const, true);
  assert.equal(crossDomainWording.properties.signal_only_scaffold_does_not_imply_admission.const, true);
  assert.ok(crossDomainWording.required.includes('opl_surface_refs'));
  assert.ok(crossDomainWording.required.includes('domain_surface_refs'));

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
    assert.equal(record.discovery_readiness.discovery_entry_surface, 'domain_gateway');
    assert.equal(record.discovery_readiness.discovery_evidence_explicit, true);
    assert.equal(record.routing_readiness.routing_entry_surface, 'domain_gateway');
    assert.equal(record.routing_readiness.direct_harness_bypass_allowed, false);
    assert.equal(record.routing_readiness.routing_evidence_explicit, true);
    assert.equal(record.routing_readiness.handoff_payload_targets_domain_gateway_only, true);
    assert.equal(record.cross_domain_wording.top_level_role_language_aligned, true);
    assert.equal(record.cross_domain_wording.signal_only_scaffold_does_not_imply_admission, true);
    assert.ok(record.cross_domain_wording.opl_surface_refs.length > 0);
    assert.ok(record.cross_domain_wording.domain_surface_refs.length > 0);
    assert.equal(record.boundary_guards.placeholder_first_forbidden, true);
    assert.equal(record.boundary_guards.internal_module_framing_forbidden, true);
    assert.equal(record.boundary_guards.implicit_truth_transfer_forbidden, true);
    assert.equal(record.boundary_guards.family_name_not_auto_workstream, true);
    assert.equal(record.formal_inclusion_gate.registry_complete.status, 'ready');
    assert.equal(record.formal_inclusion_gate.boundary_explicit.status, 'ready');
    assert.equal(record.formal_inclusion_gate.truth_ownership_explicit.status, 'ready');
    assert.equal(record.formal_inclusion_gate.discovery_ready.status, 'ready');
    assert.equal(record.formal_inclusion_gate.routing_ready.status, 'ready');
    assert.equal(record.formal_inclusion_gate.review_ready.status, 'ready');
    assert.equal(record.formal_inclusion_gate.execution_model_aligned.status, 'ready');
    assert.equal(record.formal_inclusion_gate.cross_domain_wording_aligned.status, 'ready');
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

  const grantOps = topology.workstreams.find((entry: Json) => entry.workstream_id === 'grant_ops');
  assert.match(grantOps.notes, /Grant Foundry -> Med Auto Grant/i);
  assert.match(grantOps.notes, /top-level signal/i);
  assert.match(grantOps.notes, /domain-direction evidence/i);
  assert.match(grantOps.notes, /not an admitted domain gateway/i);
});

test('candidate-domain backlog makes execution-model blockers explicit for under-definition workstreams', () => {
  const backlog = readJson('contracts/opl-gateway/candidate-domain-backlog.json');

  assert.deepEqual(backlog.required_package_ids, expectedRequiredPackageIds);
  assert.ok(!backlog.required_package_ids.includes('discovery_routing_readiness'));
  assert.deepEqual(backlog.formal_inclusion_check_ids, expectedFormalGateRequired.slice(1));
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
    assert.deepEqual(
      candidate.required_onboarding_materials.map((entry: Json) => entry.package_id),
      expectedRequiredPackageIds,
    );
    assert.ok(
      candidate.required_onboarding_materials.every((entry: Json) => entry.status === 'missing'),
      `Expected all onboarding materials to stay missing for ${workstreamId}.`,
    );

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

    const discoveryMissing = candidate.missing_boundary_materials.find(
      (entry: Json) => entry.maps_to_formal_inclusion_check === 'discovery_ready',
    );
    assert.ok(discoveryMissing, `Expected discovery_ready blocker for ${workstreamId}.`);
    assert.equal(discoveryMissing.package_id, 'discovery_readiness');
    assert.equal(discoveryMissing.status, 'missing');

    const routingMissing = candidate.missing_boundary_materials.find(
      (entry: Json) => entry.maps_to_formal_inclusion_check === 'routing_ready',
    );
    assert.ok(routingMissing, `Expected routing_ready blocker for ${workstreamId}.`);
    assert.equal(routingMissing.package_id, 'routing_readiness');
    assert.equal(routingMissing.status, 'missing');
    assert.deepEqual(
      Object.fromEntries(
        candidate.missing_boundary_materials.map((entry: Json) => [
          entry.maps_to_formal_inclusion_check,
          entry.package_id,
        ]),
      ),
      expectedMissingBoundaryMapping,
    );
    assert.ok(
      candidate.missing_boundary_materials.every((entry: Json) => entry.status === 'missing'),
      `Expected all missing_boundary_materials to stay missing for ${workstreamId}.`,
    );

    assert.deepEqual(candidate.formal_inclusion_gate.execution_model_aligned, {
      status: 'blocked',
      blocking_package_ids: ['execution_model'],
    });
    assert.deepEqual(candidate.formal_inclusion_gate.discovery_ready, {
      status: 'blocked',
      blocking_package_ids: ['discovery_readiness'],
    });
    assert.deepEqual(candidate.formal_inclusion_gate.routing_ready, {
      status: 'blocked',
      blocking_package_ids: ['routing_readiness'],
    });
    assert.deepEqual(candidate.formal_inclusion_gate.registry_complete, {
      status: 'blocked',
      blocking_package_ids: ['registry_material'],
    });
    assert.deepEqual(candidate.formal_inclusion_gate.boundary_explicit, {
      status: 'blocked',
      blocking_package_ids: ['public_documentation'],
    });
    assert.deepEqual(candidate.formal_inclusion_gate.truth_ownership_explicit, {
      status: 'blocked',
      blocking_package_ids: ['truth_ownership'],
    });
    assert.deepEqual(candidate.formal_inclusion_gate.review_ready, {
      status: 'blocked',
      blocking_package_ids: ['review_surfaces'],
    });
    assert.equal(candidate.formal_inclusion_gate.review_ready.status, 'blocked');
    assert.deepEqual(candidate.formal_inclusion_gate.cross_domain_wording_aligned, {
      status: 'blocked',
      blocking_package_ids: ['cross_domain_wording'],
    });
  }

  const grantOps = backlog.candidate_workstreams.find((entry: Json) => entry.workstream_id === 'grant_ops');
  assert.ok(grantOps.top_level_signal_refs.includes('https://github.com/gaofeng21cn/med-autogrant'));
  assert.match(grantOps.notes, /Grant Foundry -> Med Auto Grant/i);
  assert.match(grantOps.notes, /top-level signal/i);
  assert.match(grantOps.notes, /domain-direction evidence/i);
  assert.match(grantOps.notes, /not an admitted domain gateway/i);
});
