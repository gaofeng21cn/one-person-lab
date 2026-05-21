import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentLabEfficiencyNonRegressionReadModel,
  buildSampleAgentLabSuite,
  runAgentLabSuite,
} from '../../src/agent-lab.ts';

test('Agent Lab builds refs-only efficiency non-regression read model from suite result and explicit refs', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks[0].trajectory.duration_ref = 'duration-ref:mas/paper-repair-smoke';
  suite.tasks[0].trajectory.cost_ref = 'cost-ref:mas/paper-repair-smoke';
  suite.tasks[0].trajectory.cache_hit_ref = 'cache-hit-ref:mas/source-pack-reuse';
  suite.tasks[0].trajectory.reuse_scope_ref = 'reuse-scope-ref:mas/shared-source-intake';
  (suite.tasks[0].scorecard as typeof suite.tasks[0]['scorecard'] & {
    quality_floor_ref: string;
  }).quality_floor_ref = 'quality-floor-ref:mas/domain-scorecard-floor';
  suite.tasks[0].promotion_gate.no_forbidden_write_proof_refs = [
    'no-forbidden-write-ref:mas/agent-lab-efficiency',
  ];
  (suite.tasks[0].improvement_candidate as typeof suite.tasks[0]['improvement_candidate'] & {
    owner_route_ref: string;
  }).owner_route_ref = 'owner-route:mas/domain-quality-owner';

  const suiteResult = runAgentLabSuite(suite);
  const readModel = buildAgentLabEfficiencyNonRegressionReadModel({
    suiteResults: [suiteResult],
    explicitRefs: {
      duration_refs: ['duration-ref:explicit/wall-clock-p95'],
      cost_refs: ['cost-ref:explicit/provider-cost-window'],
      cache_hit_refs: ['cache-hit-ref:explicit/source-cache-hit-rate'],
      reuse_scope_refs: ['reuse-scope-ref:explicit/shared-stage-intake'],
      quality_floor_refs: ['quality-floor-ref:explicit/domain-owned-floor'],
      no_forbidden_write_refs: ['no-forbidden-write-ref:explicit/no-domain-write'],
      owner_route_refs: ['owner-route:opl/framework-agent-lab-efficiency'],
    },
  });

  assert.equal(readModel.surface_kind, 'opl_agent_lab_efficiency_nonregression_read_model');
  assert.equal(readModel.refs_only, true);
  assert.equal(readModel.status, 'ready');
  assert.equal(readModel.readiness_status, 'ready');
  assert.equal(readModel.evidence_groups.duration_refs.includes('duration-ref:mas/paper-repair-smoke'), true);
  assert.equal(readModel.evidence_groups.duration_refs.includes('duration-ref:explicit/wall-clock-p95'), true);
  assert.equal(readModel.evidence_groups.cost_refs.includes('cost-ref:mas/paper-repair-smoke'), true);
  assert.equal(readModel.evidence_groups.cache_hit_refs.includes('cache-hit-ref:mas/source-pack-reuse'), true);
  assert.equal(readModel.evidence_groups.reuse_scope_refs.includes('reuse-scope-ref:mas/shared-source-intake'), true);
  assert.equal(readModel.evidence_groups.quality_floor_refs.includes('quality-floor-ref:mas/domain-scorecard-floor'), true);
  assert.equal(readModel.evidence_groups.no_forbidden_write_refs.includes(
    'no-forbidden-write-ref:mas/agent-lab-efficiency',
  ), true);
  assert.equal(readModel.evidence_groups.owner_route_refs.includes('owner-route:mas/domain-quality-owner'), true);
  assert.deepEqual(readModel.typed_blockers, []);
  assert.equal(readModel.summary.evidence_group_count, 7);
  assert.equal(readModel.summary.source_suite_result_count, 1);
  assert.equal(readModel.authority_boundary.can_write_domain_truth, false);
  assert.equal(readModel.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(readModel.authority_boundary.can_mutate_domain_artifact, false);
  assert.equal(readModel.authority_boundary.can_write_owner_receipt, false);
  assert.equal(readModel.authority_boundary.can_promote_default_agent_without_gate, false);
  assert.equal('quality_verdict' in readModel, false);
  assert.equal('domain_truth' in readModel, false);
  assert.equal('artifact_body' in readModel, false);
});

test('Agent Lab blocks efficiency non-regression readiness when required evidence refs are missing', () => {
  const readModel = buildAgentLabEfficiencyNonRegressionReadModel({
    explicitRefs: {
      duration_refs: ['duration-ref:explicit/wall-clock-p95'],
      cost_refs: ['cost-ref:explicit/provider-cost-window'],
      cache_hit_refs: ['cache-hit-ref:explicit/source-cache-hit-rate'],
      reuse_scope_refs: ['reuse-scope-ref:explicit/shared-stage-intake'],
    },
  });

  assert.equal(readModel.status, 'blocked');
  assert.equal(readModel.readiness_status, 'blocked');
  assert.equal(readModel.ready, false);
  assert.deepEqual(readModel.typed_blockers, [
    {
      blocker_ref: 'typed-blocker-ref:agent-lab/efficiency-nonregression-quality-floor-refs-missing',
      missing_group: 'quality_floor_refs',
    },
    {
      blocker_ref: 'typed-blocker-ref:agent-lab/efficiency-nonregression-no-forbidden-write-refs-missing',
      missing_group: 'no_forbidden_write_refs',
    },
    {
      blocker_ref: 'typed-blocker-ref:agent-lab/efficiency-nonregression-owner-route-refs-missing',
      missing_group: 'owner_route_refs',
    },
  ]);
  assert.equal(readModel.authority_boundary.can_authorize_quality_verdict, false);
});
