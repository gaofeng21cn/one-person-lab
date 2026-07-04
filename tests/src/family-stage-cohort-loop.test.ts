import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFamilyStageCohortLoopProjection } from '../../src/modules/stagecraft/family-stage-cohort-loop.ts';
import { normalizeFamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import type { FamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonRecord {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

function buildPlane(stageContract: JsonRecord): FamilyStageControlPlane {
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
          boundary_assumptions: [],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
          ...stageContract,
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
        },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
    ],
    notes: [],
  });
  assert.ok(plane);
  return plane;
}

test('family stage cohort loop projects closed source-query-trigger-monitor refs', () => {
  const projection = buildFamilyStageCohortLoopProjection(buildPlane({
    source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope', role: 'launch_source_scope' }],
    cohort_query_refs: [{ ref_kind: 'json_pointer', ref: '/cohort_query', role: 'cohort_query' }],
    trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:mas/manuscript_authoring', role: 'launch_trigger' }],
    metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:source_freshness', role: 'cohort_metric' }],
  }));

  assert.equal(projection.surface_kind, 'opl_family_stage_cohort_loop');
  assert.equal(projection.summary.closed_loop_ready_count, 1);
  assert.equal(projection.summary.blocker_count, 0);
  assert.equal(projection.stages[0]?.closure_status, 'closed_loop_ready');
  assert.deepEqual(projection.stages[0]?.counts, {
    source_scope_ref_count: 1,
    cohort_query_ref_count: 1,
    trigger_ref_count: 1,
    monitor_ref_count: 0,
    metric_ref_count: 1,
    dashboard_metric_ref_count: 0,
  });
  assert.equal(projection.authority_boundary.graphflow_runtime_dependency, false);
  assert.equal(projection.authority_boundary.can_write_source_truth, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
});

test('family stage cohort loop blocks missing query, trigger, and monitor refs with counterexamples', () => {
  const projection = buildFamilyStageCohortLoopProjection(buildPlane({
    source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope', role: 'launch_source_scope' }],
  }));
  const stage = projection.stages[0];

  assert.equal(stage?.closure_status, 'missing_query');
  assert.equal(projection.summary.blocked_stage_count, 1);
  assert.equal(projection.summary.missing_query_count, 1);
  assert.deepEqual(stage?.blockers.map((entry) => entry.blocker_id), [
    'cohort_query_missing',
    'cohort_trigger_missing',
    'cohort_monitor_or_metric_missing',
  ]);
  assert.deepEqual(stage?.blockers[0]?.minimal_counterexample, {
    stage_id: 'manuscript_authoring',
    missing_field: 'cohort_query_refs',
    reason: 'stage has no auditable cohort query ref linking source scope to execution and monitoring',
  });
});

test('family stage cohort loop remains compatible with legacy stage contracts', () => {
  const projection = buildFamilyStageCohortLoopProjection(buildPlane({}));

  assert.equal(projection.stages[0]?.closure_status, 'missing_scope');
  assert.ok(projection.stages[0]?.blockers.some((entry) => (
    entry.blocker_id === 'cohort_scope_missing'
    && entry.minimal_counterexample.missing_field === 'source_scope_refs'
  )));
});

test('family stage cohort loop schema freezes refs-only non-authority boundary', () => {
  const controlPlaneSchema = readJson('contracts/family-orchestration/family-stage-control-plane.schema.json');
  const cohortSchema = readJson('contracts/family-orchestration/family-stage-cohort-loop.schema.json');
  const controlPlaneDefs = record(controlPlaneSchema.$defs);
  const stageContract = record(controlPlaneDefs.stage_contract);
  const stageContractProperties = record(stageContract.properties);
  const cohortDefs = record(cohortSchema.$defs);
  const authorityProperties = record(record(cohortDefs.authority_boundary).properties);
  const examples = cohortSchema.examples as JsonRecord[];
  const exampleAuthority = record(record(examples[0]).authority_boundary);

  assert.equal(Boolean(stageContractProperties.cohort_query_refs), true);
  assert.equal(Boolean(stageContractProperties.trigger_refs), true);
  assert.equal(Boolean(stageContractProperties.metric_refs), true);
  assert.equal(Boolean(stageContractProperties.dashboard_metric_refs), true);
  assert.equal(record(record(cohortSchema.properties).surface_kind).const, 'opl_family_stage_cohort_loop');
  assert.equal(record(authorityProperties.opl_role).const, 'cohort_loop_projection_only');
  assert.equal(record(authorityProperties.graphflow_runtime_dependency).const, false);
  assert.equal(record(authorityProperties.can_execute_stage).const, false);
  assert.equal(record(authorityProperties.can_write_source_truth).const, false);
  assert.equal(record(authorityProperties.can_write_domain_truth).const, false);
  assert.equal(exampleAuthority.graphflow_runtime_dependency, false);
});
