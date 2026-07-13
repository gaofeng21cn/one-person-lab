import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFamilyStageConformanceReview } from '../../src/modules/stagecraft/family-stage-conformance.ts';
import { buildFamilyStageAssumptionLifecycleProjection } from '../../src/modules/stagecraft/family-stage-assumption-lifecycle.ts';
import { normalizeFamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import type { FamilyStageContract, FamilyStageControlPlane } from '../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';
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

function progressFirstPolicies(): Pick<
  FamilyStageContract,
  'progress_delta_policy' | 'typed_blocker_lineage_policy'
> {
  return {
    progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
    typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  };
}

function buildPlane(runtimeAssumptions: unknown[], monitorRefs: JsonRecord[] = []): FamilyStageControlPlane {
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
          runtime_assumptions: runtimeAssumptions,
          monitor_refs: monitorRefs,
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
          ...progressFirstPolicies(),
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

test('family stage assumption lifecycle keeps string assumptions and monitor refs compatible', () => {
  const plane = buildPlane(['source_freshness_current'], [
    { ref_kind: 'json_pointer', ref: '/runtime/source_freshness', role: 'runtime_assumption_monitor' },
  ]);
  const projection = buildFamilyStageAssumptionLifecycleProjection(plane);

  assert.equal(projection.summary.assumption_count, 1);
  assert.equal(projection.summary.current_count, 1);
  assert.equal(projection.summary.blocker_count, 0);
  assert.deepEqual(projection.assumptions[0]?.monitor_refs, [
    { ref_kind: 'json_pointer', ref: '/runtime/source_freshness', role: 'runtime_assumption_monitor' },
  ]);
  assert.equal(projection.authority_boundary.can_execute_stage, false);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
});

test('family stage assumption lifecycle blocks stale typed assumptions with counterexample', () => {
  const plane = buildPlane([
    {
      assumption_id: 'provider_slo_current',
      owner: 'opl',
      monitor_refs: [{ ref_kind: 'receipt', ref: 'receipt:provider-slo/latest', role: 'runtime_assumption_monitor' }],
      invalidated_by: ['receipt:provider-slo/stale'],
      freshness_window_ref: 'policy:provider-slo-window',
      observed_at_ref: 'receipt:provider-slo/latest',
      repair_action: 'opl family-runtime provider-slo tick --provider temporal',
    },
  ]);
  const projection = buildFamilyStageAssumptionLifecycleProjection(plane);

  assert.equal(projection.summary.stale_count, 1);
  assert.equal(projection.summary.blocker_count, 0);
  assert.equal(projection.summary.warning_count, 1);
  assert.equal(projection.assumptions[0]?.status, 'stale');
  assert.equal(projection.assumptions[0]?.severity, 'warning');
  assert.deepEqual(projection.assumptions[0]?.minimal_counterexample, {
    assumption_id: 'provider_slo_current',
    stage_id: 'manuscript_authoring',
    invalidated_by: ['receipt:provider-slo/stale'],
    reason: 'runtime assumption has invalidation refs',
  });

  const admission = buildFamilyStageConformanceReview(plane);
  assert.equal(admission.status, 'quality_debt');
  assert.ok(admission.findings.some((finding) => (
    finding.code === 'runtime_assumption_stale'
    && finding.assumption_id === 'provider_slo_current'
    && finding.severity === 'warning'
    && finding.minimal_counterexample?.reason === 'runtime assumption has invalidation refs'
  )));
});

test('family stage admission warns on runtime assumptions without monitor refs', () => {
  const admission = buildFamilyStageConformanceReview(buildPlane(['artifact_locator_fresh']));

  assert.equal(admission.status, 'quality_debt');
  assert.ok(admission.findings.some((finding) => (
    finding.code === 'runtime_assumption_missing_monitor_ref'
    && finding.assumption_id === 'artifact_locator_fresh'
    && finding.severity === 'warning'
    && finding.minimal_counterexample?.missing_field === 'monitor_refs'
  )));
});

test('family stage assumption schemas expose typed assumptions and non-authority projection', () => {
  const controlPlaneSchema = readJson('contracts/family-orchestration/family-stage-control-plane.schema.json');
  const lifecycleSchema = readJson('contracts/family-orchestration/family-stage-assumption-lifecycle.schema.json');
  const runtimeAssumption = record(record(controlPlaneSchema.$defs).runtime_assumption);
  const authority = record(record(record(lifecycleSchema.properties).authority_boundary).properties);

  assert.equal(Boolean(runtimeAssumption), true);
  assert.equal(record(authority.opl_role).const, 'assumption_lifecycle_projection_only');
  assert.equal(record(authority.can_execute_stage).const, false);
  assert.equal(record(authority.can_write_domain_truth).const, false);
  assert.equal(record(authority.can_authorize_quality_verdict).const, false);
});
