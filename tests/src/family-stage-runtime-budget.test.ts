import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeFamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import { buildFamilyStageRuntimeBudgetProjection } from '../../src/modules/stagecraft/family-stage-runtime-budget.ts';
import type { FamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';

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
  boundaryAssumptions?: string[];
  properties?: string[];
  runtimeAssumptions?: unknown[];
  monitorRefs?: JsonRecord[];
  metricRefs?: JsonRecord[];
  dashboardMetricRefs?: JsonRecord[];
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
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          boundary_assumptions: overrides.boundaryAssumptions ?? ['provider_boundary'],
          properties: overrides.properties ?? [],
          runtime_event_refs: ['event:stage-runtime-guard'],
          runtime_assumptions: overrides.runtimeAssumptions ?? [
            {
              assumption_id: 'provider_slo_current',
              owner: 'opl',
              monitor_refs: [
                {
                  ref_kind: 'receipt',
                  ref: 'receipt:provider-slo/latest',
                  role: 'runtime_boundary_monitor',
                },
              ],
            },
          ],
          monitor_refs: overrides.monitorRefs ?? [
            {
              ref_kind: 'receipt',
              ref: 'receipt:runtime-monitor/latest',
              role: 'runtime_boundary_monitor',
            },
          ],
          metric_refs: overrides.metricRefs ?? [
            {
              ref_kind: 'metric_ref',
              ref: 'metric:runtime/boundary-success-rate',
              role: 'boundary_success_rate',
            },
          ],
          dashboard_metric_refs: overrides.dashboardMetricRefs ?? [
            {
              ref_kind: 'dashboard_metric_ref',
              ref: 'dashboard:runtime/boundary-coverage',
              role: 'runtime_boundary_monitor',
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

test('family stage runtime budget projects boundary, guard, monitor, and success refs without probability claims', () => {
  const projection = buildFamilyStageRuntimeBudgetProjection(buildPlane());
  const stage = projection.stages[0];

  assert.equal(projection.summary.stage_count, 1);
  assert.equal(projection.summary.ready_count, 1);
  assert.equal(projection.summary.boundary_count, 4);
  assert.equal(stage?.boundary_count, 4);
  assert.equal(stage?.runtime_guard_count, 3);
  assert.equal(stage?.runtime_event_ref_count, 2);
  assert.equal(stage?.monitor_count, 2);
  assert.equal(stage?.metric_count, 1);
  assert.equal(stage?.dashboard_metric_count, 1);
  assert.equal(stage?.reliability_budget_status, 'ready');
  assert.deepEqual(stage?.boundary_success_rate_ref, {
    ref_kind: 'metric_ref',
    ref: 'metric:runtime/boundary-success-rate',
    role: 'boundary_success_rate',
  });
  assert.equal(stage?.expected_success_ref, null);
  assert.equal(projection.authority_boundary.graphflow_runtime_dependency, false);
  assert.equal(projection.authority_boundary.probability_truth_claim, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
});

test('family stage runtime budget needs monitor when success-rate refs are absent', () => {
  const projection = buildFamilyStageRuntimeBudgetProjection(buildPlane({
    metricRefs: [],
    dashboardMetricRefs: [],
  }));
  const stage = projection.stages[0];

  assert.equal(stage?.reliability_budget_status, 'needs_monitor');
  assert.ok(stage?.minimal_counterexamples.some((entry) => (
    entry.missing_field === 'expected_success_ref_or_boundary_success_rate_ref'
    && entry.reason.includes('success-rate ref')
  )));
});

test('family stage runtime budget blocks runtime guards without monitor refs', () => {
  const projection = buildFamilyStageRuntimeBudgetProjection(buildPlane({
    runtimeAssumptions: ['provider_slo_current'],
    monitorRefs: [],
    metricRefs: [],
  }));
  const stage = projection.stages[0];

  assert.equal(projection.summary.blocker_count, 1);
  assert.equal(stage?.monitor_count, 0);
  assert.equal(stage?.reliability_budget_status, 'blocker');
  assert.ok(stage?.minimal_counterexamples.some((entry) => (
    entry.missing_field === 'monitor_refs'
    && entry.reason === 'runtime boundary or guard exists without an auditable monitor ref'
  )));
});

test('family stage runtime budget can read expected success refs from properties', () => {
  const projection = buildFamilyStageRuntimeBudgetProjection(buildPlane({
    properties: ['expected_success_ref:metric:runtime/expected-success'],
    metricRefs: [],
    dashboardMetricRefs: [],
    trustBoundary: { runtime_guard_required: false, effect_boundary: false },
  }));
  const stage = projection.stages[0];

  assert.equal(stage?.reliability_budget_status, 'ready');
  assert.deepEqual(stage?.expected_success_ref, {
    ref_kind: 'property_ref',
    ref: 'metric:runtime/expected-success',
    role: 'expected_success_ref',
  });
});

test('family stage runtime budget schema freezes projection-only authority boundary', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-runtime-budget.schema.json');
  const properties = record(schema.properties);
  const authority = record(record(record(properties.authority_boundary).$ref ? record(schema.$defs).authority_boundary : {}).properties);
  const stage = record(record(schema.$defs).stage);
  const stageProperties = record(stage.properties);

  assert.equal(record(properties.surface_kind).const, 'opl_family_stage_runtime_budget_projection');
  assert.equal(Boolean(stageProperties.boundary_count), true);
  assert.equal(Boolean(stageProperties.runtime_guard_count), true);
  assert.equal(Boolean(stageProperties.unmonitored_boundary_count), true);
  assert.equal(Boolean(record(properties).usage_cost_projection), true);
  assert.equal(Boolean(stageProperties.usage_cost_estimate_ref), true);
  assert.equal(record(authority.opl_role).const, 'runtime_budget_projection_only');
  assert.equal(record(authority.graphflow_runtime_dependency).const, false);
  assert.equal(record(authority.probability_truth_claim).const, false);
  assert.equal(record(authority.can_write_domain_truth).const, false);
  assert.equal(record(authority.can_authorize_domain_ready).const, false);
  assert.equal(record(authority.can_authorize_quality_verdict).const, false);
  assert.equal(record(authority.can_mutate_artifact_body).const, false);
});

test('family stage runtime budget schema freezes refs-only usage cost estimate companion boundary', () => {
  const schema = readJson('contracts/family-orchestration/family-stage-runtime-budget.schema.json');
  const defs = record(schema.$defs);
  const usageCostProjection = record(defs.usage_cost_projection);
  const usageProperties = record(usageCostProjection.properties);
  const usageAuthority = record(record(defs.usage_cost_authority_boundary).properties);
  const example = record(Array.isArray(schema.examples) ? schema.examples[0] : null);
  const exampleUsage = record(example.usage_cost_projection);

  assert.equal(record(usageProperties.surface_kind).const, 'opl_family_stage_usage_cost_budget_projection');
  assert.equal(record(usageProperties.projection_role).const, 'usage_cost_estimate_projection_only');
  assert.equal(record(usageProperties.refs_only).const, true);
  assert.ok((usageCostProjection.required as string[]).includes('model_pricing_profile_ref'));
  assert.ok((usageCostProjection.required as string[]).includes('calibration_sample_refs'));
  assert.ok((usageCostProjection.required as string[]).includes('estimated_cost_usd_p50'));
  assert.ok((usageCostProjection.required as string[]).includes('estimated_cost_usd_p90'));
  assert.equal(Boolean(usageProperties.visual_stage_profile_refs), true);
  assert.equal(Boolean(usageProperties.artifact_locator_refs), true);
  assert.equal(record(usageAuthority.opl_role).const, 'refs_only_usage_cost_estimate_projection');
  assert.equal(record(usageAuthority.can_read_domain_body).const, false);
  assert.equal(record(usageAuthority.can_read_artifact_body).const, false);
  assert.equal(record(usageAuthority.can_execute_stage).const, false);
  assert.equal(record(usageAuthority.can_write_domain_truth).const, false);
  assert.equal(record(usageAuthority.can_authorize_domain_ready).const, false);
  assert.equal(record(usageAuthority.can_authorize_quality_verdict).const, false);
  assert.equal(record(usageAuthority.can_mutate_artifact_body).const, false);
  assert.equal(record(usageAuthority.can_authorize_artifact_mutation).const, false);
  assert.equal(record(usageAuthority.can_authorize_budget_spend).const, false);
  assert.equal(record(usageAuthority.can_write_owner_receipt).const, false);
  assert.equal(exampleUsage.target_domain_id, 'redcube-ai');
  assert.equal(exampleUsage.task_family, 'ppt_deck');
  assert.equal(exampleUsage.model_id, 'gpt-5.5');
  assert.equal(exampleUsage.reasoning_effort, 'xhigh');
  assert.equal(record(exampleUsage.authority_boundary).can_authorize_budget_spend, false);
});
