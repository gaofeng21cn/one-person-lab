import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeFamilyStageControlPlane } from '../../src/family-stage-control-plane-contract.ts';
import { buildFamilyStageCapacityBudgetProjection } from '../../src/family-stage-capacity-budget.ts';
import type { FamilyStageControlPlane } from '../../src/family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

function buildPlane(overrides: {
  properties?: string[];
  monitorRefs?: JsonRecord[];
  metricRefs?: JsonRecord[];
  dashboardMetricRefs?: JsonRecord[];
  triggerRefs?: JsonRecord[];
  trustBoundary?: JsonRecord;
} = {}): FamilyStageControlPlane {
  const plane = normalizeFamilyStageControlPlane({
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'mas_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'manuscript_authoring',
        stage_kind: 'creation',
        title: 'Manuscript authoring',
        summary: 'Author from explicit source refs.',
        goal: 'Produce a manuscript draft under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [
          {
            ref_kind: 'eval_ref',
            ref: 'eval:proof-guard/runtime-cost',
            role: 'guard_eval_cost_ref',
          },
        ],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          boundary_assumptions: ['provider_boundary'],
          properties: overrides.properties ?? [
            'event_log_growth_ref:metric:event-log/growth-budget',
            'replay_sla_ref:metric:replay/sla',
          ],
          runtime_event_refs: ['event:stage-runtime-guard'],
          runtime_assumptions: [],
          monitor_refs: overrides.monitorRefs ?? [
            {
              ref_kind: 'monitor_ref',
              ref: 'monitor:capacity/event-log-growth',
              role: 'event_log_growth_ref',
            },
          ],
          trigger_refs: overrides.triggerRefs ?? [
            {
              ref_kind: 'queue_policy_ref',
              ref: 'queue:provider/concurrency-limit',
              role: 'concurrency_limit_ref',
            },
            {
              ref_kind: 'provider_rate_limit_ref',
              ref: 'provider:temporal/rate-limit',
              role: 'launch_backpressure',
            },
          ],
          metric_refs: overrides.metricRefs ?? [
            {
              ref_kind: 'metric_ref',
              ref: 'metric:proof/check-cost',
              role: 'proof_check_cost_ref',
            },
          ],
          dashboard_metric_refs: overrides.dashboardMetricRefs ?? [
            {
              ref_kind: 'dashboard_metric_ref',
              ref: 'dashboard:guard/eval-cost',
              role: 'guard_eval_cost_ref',
            },
          ],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['event:owner-receipt'],
          runtime_guard_required: true,
          ...(overrides.trustBoundary ?? {}),
        },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
    ],
    notes: [],
  });
  assert.ok(plane);
  return plane;
}

test('family stage capacity budget projects capacity refs without provider scheduling authority', () => {
  const projection = buildFamilyStageCapacityBudgetProjection(buildPlane());
  const stage = projection.stages[0];

  assert.equal(projection.summary.stage_count, 1);
  assert.equal(projection.summary.ready_count, 1);
  assert.equal(projection.summary.capacity_ref_count, 6);
  assert.equal(projection.summary.runtime_boundary_required_count, 1);
  assert.equal(projection.summary.provider_launch_eligible_count, 1);
  assert.equal(stage?.capacity_status, 'ready');
  assert.equal(stage?.runtime_boundary_required, true);
  assert.equal(stage?.provider_launch_eligible, true);
  assert.equal(stage?.capacity_ref_count, 6);
  assert.deepEqual(stage?.event_log_growth_ref, {
    ref_kind: 'property_ref',
    ref: 'metric:event-log/growth-budget',
    role: 'event_log_growth_ref',
  });
  assert.deepEqual(stage?.provider_rate_limit_ref, {
    ref_kind: 'provider_rate_limit_ref',
    ref: 'provider:temporal/rate-limit',
    role: 'launch_backpressure',
  });
  assert.deepEqual(stage?.proof_check_cost_ref, {
    ref_kind: 'metric_ref',
    ref: 'metric:proof/check-cost',
    role: 'proof_check_cost_ref',
  });
  assert.deepEqual(stage?.guard_eval_cost_ref, {
    ref_kind: 'dashboard_metric_ref',
    ref: 'dashboard:guard/eval-cost',
    role: 'guard_eval_cost_ref',
  });
  assert.equal(projection.authority_boundary.opl_role, 'capacity_projection_only');
  assert.equal(projection.authority_boundary.can_schedule_provider, false);
  assert.equal(projection.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(projection.authority_boundary.probability_truth_claim, false);
});

test('family stage capacity budget needs budget refs when non-launch capacity refs are absent', () => {
  const projection = buildFamilyStageCapacityBudgetProjection(buildPlane({
    properties: ['replay_sla_ref:metric:replay/sla'],
    monitorRefs: [],
    metricRefs: [],
    dashboardMetricRefs: [],
  }));
  const stage = projection.stages[0];

  assert.equal(projection.summary.needs_capacity_budget_count, 1);
  assert.equal(stage?.capacity_status, 'needs_capacity_budget');
  assert.ok(stage?.minimal_counterexamples.some((entry) => (
    entry.missing_field === 'event_log_growth_ref'
    && entry.reason.includes('event-log growth')
  )));
  assert.ok(stage?.minimal_counterexamples.some((entry) => entry.missing_field === 'proof_check_cost_ref'));
  assert.ok(stage?.minimal_counterexamples.some((entry) => entry.missing_field === 'guard_eval_cost_ref'));
});

test('family stage capacity budget blocks runtime launch without replay SLA and backpressure refs', () => {
  const projection = buildFamilyStageCapacityBudgetProjection(buildPlane({
    properties: ['event_log_growth_ref:metric:event-log/growth-budget'],
    triggerRefs: [],
  }));
  const stage = projection.stages[0];

  assert.equal(projection.summary.blocker_count, 1);
  assert.equal(stage?.capacity_status, 'blocker');
  assert.ok(stage?.minimal_counterexamples.some((entry) => (
    entry.missing_field === 'replay_sla_ref'
    && entry.reason === 'runtime boundary or provider launch eligible stage lacks replay SLA ref'
  )));
  assert.ok(stage?.minimal_counterexamples.some((entry) => (
    entry.missing_field === 'rate_or_concurrency_limit_ref'
    && entry.reason === 'runtime boundary or provider launch eligible stage lacks rate-limit or concurrency-limit ref'
  )));
});

test('family stage capacity budget can read all capacity refs from roles and ref_kind', () => {
  const projection = buildFamilyStageCapacityBudgetProjection(buildPlane({
    properties: [],
    monitorRefs: [
      {
        ref_kind: 'event_log_growth_ref',
        ref: 'monitor:event-log/growth',
        role: 'capacity_budget',
      },
      {
        ref_kind: 'replay_sla_ref',
        ref: 'monitor:replay/sla',
        role: 'capacity_budget',
      },
    ],
    triggerRefs: [
      {
        ref_kind: 'trigger_ref',
        ref: 'queue:stage/concurrency',
        role: 'concurrency_limit_ref',
      },
      {
        ref_kind: 'trigger_ref',
        ref: 'provider:stage/rate-limit',
        role: 'provider_rate_limit_ref',
      },
    ],
    metricRefs: [
      {
        ref_kind: 'proof_check_cost_ref',
        ref: 'metric:proof/check-cost',
        role: 'capacity_budget',
      },
    ],
    dashboardMetricRefs: [
      {
        ref_kind: 'dashboard_metric_ref',
        ref: 'dashboard:guard/eval-cost',
        role: 'guard_eval_cost_ref',
      },
    ],
  }));
  const stage = projection.stages[0];

  assert.equal(stage?.capacity_status, 'ready');
  assert.equal(stage?.event_log_growth_ref?.ref, 'monitor:event-log/growth');
  assert.equal(stage?.replay_sla_ref?.ref, 'monitor:replay/sla');
  assert.equal(stage?.concurrency_limit_ref?.ref, 'queue:stage/concurrency');
  assert.equal(stage?.provider_rate_limit_ref?.ref, 'provider:stage/rate-limit');
});

test('family stage capacity budget schema freezes refs-only authority boundary', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-capacity-budget.schema.json');
  const properties = record(schema.properties);
  const authority = record(record(record(properties.authority_boundary).$ref ? record(schema.$defs).authority_boundary : {}).properties);
  const stage = record(record(schema.$defs).stage);
  const stageProperties = record(stage.properties);

  assert.equal(record(properties.surface_kind).const, 'opl_family_stage_capacity_budget_projection');
  assert.equal(record(properties.version).const, 'family-stage-capacity-budget.v1');
  assert.equal(Boolean(stageProperties.event_log_growth_ref), true);
  assert.equal(Boolean(stageProperties.replay_sla_ref), true);
  assert.equal(Boolean(stageProperties.concurrency_limit_ref), true);
  assert.equal(Boolean(stageProperties.provider_rate_limit_ref), true);
  assert.equal(Boolean(stageProperties.proof_check_cost_ref), true);
  assert.equal(Boolean(stageProperties.guard_eval_cost_ref), true);
  assert.equal(record(authority.opl_role).const, 'capacity_projection_only');
  assert.equal(record(authority.can_execute_stage).const, false);
  assert.equal(record(authority.can_schedule_provider).const, false);
  assert.equal(record(authority.can_write_domain_truth).const, false);
  assert.equal(record(authority.can_authorize_domain_ready).const, false);
  assert.equal(record(authority.can_authorize_quality_verdict).const, false);
  assert.equal(record(authority.can_mutate_artifact_body).const, false);
});
