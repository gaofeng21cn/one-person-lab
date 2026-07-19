import assert from 'node:assert/strict';
import test from 'node:test';

import { requireStageQualityAttemptBoundary } from '../../src/modules/runway/family-runtime-stage-quality-attempt-boundary.ts';

const base = {
  stage_run_id: 'stage-run:artifact-creation',
  quality_cycle_id: 'quality-cycle:artifact-creation',
  quality_role_prompt_ref: 'prompt:quality-role',
  context_manifest_ref: 'context:quality-role',
  no_context_inheritance: true,
  quality_rubric_refs: ['rubric:visual-quality'],
};

const parent = {
  parent_attempt_ref: 'opl://stage_attempts/parent-attempt',
  parent_attempt_lineage: {
    stage_run_id: base.stage_run_id,
    quality_cycle_id: base.quality_cycle_id,
  },
};

const managedBudget = {
  surface_kind: 'opl_stage_quality_scope_budget',
  version: 'opl-stage-quality-scope-budget.v1',
  max_attempts: 3,
  max_elapsed_ms: 21_600_000,
  max_tokens: 1_000_000,
  token_budget_requires_observed_usage: true,
  foreground_execution_must_use_managed_attempt: true,
} as const;

test('quality Attempt roles accept only their bounded round indexes', () => {
  assert.doesNotThrow(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 'producer',
    quality_round_index: 0,
  }));
  assert.doesNotThrow(() => requireStageQualityAttemptBoundary({
    ...base,
    ...parent,
    attempt_role: 'reviewer',
    quality_round_index: 0,
    input_artifact_refs: ['artifact:deck-v1'],
    reviewed_artifact_hashes: ['sha256:deck-v1'],
  }));
  for (const attempt_role of ['repairer', 're_reviewer'] as const) {
    for (const quality_round_index of [1, 2, 3]) {
      assert.doesNotThrow(() => requireStageQualityAttemptBoundary({
        ...base,
        ...parent,
        attempt_role,
        quality_round_index,
        prior_finding_refs: ['finding:visual-clipping'],
        ...(attempt_role === 're_reviewer' ? {
          repair_map_refs: ['repair-map:visual-clipping'],
          input_artifact_refs: ['artifact:deck-v2'],
          reviewed_artifact_hashes: ['sha256:deck-v2'],
        } : {}),
      }));
    }
  }

  for (const [attempt_role, invalidRounds] of [
    ['producer', [-1, 1, 3]],
    ['reviewer', [-1, 1, 3]],
    ['repairer', [0, 4]],
    ['re_reviewer', [0, 4]],
  ] as const) {
    for (const quality_round_index of invalidRounds) {
      assert.throws(() => requireStageQualityAttemptBoundary({
        ...base,
        ...(attempt_role === 'producer' ? {} : parent),
        attempt_role,
        quality_round_index,
      }), /role and quality_round_index are inconsistent/);
    }
  }
});

test('non-producer Attempt requires a machine-verifiable parent in the same lineage', () => {
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 'reviewer',
    quality_round_index: 0,
  }), /requires parent_attempt_ref/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 'reviewer',
    quality_round_index: 0,
    parent_attempt_ref: 'opl://stage_attempts/parent-attempt',
  }), /requires parent_attempt_lineage/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    ...parent,
    parent_attempt_lineage: {
      stage_run_id: 'stage-run:other',
      quality_cycle_id: base.quality_cycle_id,
    },
    attempt_role: 'reviewer',
    quality_round_index: 0,
  }), /same stage_run_id and quality_cycle_id lineage/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    ...parent,
    parent_attempt_lineage: {
      stage_run_id: base.stage_run_id,
      quality_cycle_id: 'quality-cycle:other',
    },
    attempt_role: 'reviewer',
    quality_round_index: 0,
  }), /same stage_run_id and quality_cycle_id lineage/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 'producer',
    quality_round_index: 0,
    ...parent,
  }), /Producer StageAttempt cannot declare a parent attempt/);
});

test('managed quality Attempts require the same explicit scope budget in retry and context bindings', () => {
  const managed = {
    ...base,
    attempt_role: 'producer',
    quality_round_index: 0,
    stage_run_content_binding_version: 'opl-stage-run-attempt-content-binding.v1',
    retry_budget: { quality_scope_budget: managedBudget },
    quality_context: { context_manifest: { quality_scope_budget: managedBudget } },
  };
  assert.doesNotThrow(() => requireStageQualityAttemptBoundary(managed));
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...managed,
    retry_budget: {},
  }), (error: unknown) => (
    (error as { details?: { failure_code?: string } }).details?.failure_code
      === 'stage_quality_scope_budget_missing'
  ));
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...managed,
    quality_context: { context_manifest: {} },
  }), (error: unknown) => (
    (error as { details?: { failure_code?: string } }).details?.failure_code
      === 'stage_quality_scope_budget_missing'
  ));
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...managed,
    quality_context: {
      context_manifest: {
        quality_scope_budget: { ...managedBudget, max_tokens: 999_999 },
      },
    },
  }), (error: unknown) => (
    (error as { details?: { failure_code?: string } }).details?.failure_code
      === 'stage_quality_scope_budget_binding_mismatch'
  ));
});

test('forbidden Stage authority fields are rejected recursively', () => {
  for (const field of [
    'next_stage_refs',
    'requires',
    'ensures',
    'stage_route',
    'sub_stage_graph',
    'independent_owner',
    'stage_current_pointer',
    'stage_transition_authority',
  ]) {
    assert.throws(() => requireStageQualityAttemptBoundary({
      ...base,
      attempt_role: 'producer',
      quality_round_index: 0,
      quality_context: { nested_overlay: { [field]: true } },
    }), /cannot own Stage semantics or transition authority/);
  }

  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 'producer',
    quality_round_index: 0,
    quality_context: {
      findings: [{
        finding_id: 'finding:hidden-stage-authority',
        repair_expectation: {
          route_overlay: {
            stage_transition_authority: true,
          },
        },
      }],
    },
  }), (error: unknown) => {
    assert.match(String(error), /cannot own Stage semantics or transition authority/);
    assert.deepEqual(
      (error as { details?: { forbidden_fields?: string[] } }).details?.forbidden_fields,
      ['quality_context.findings.0.repair_expectation.route_overlay.stage_transition_authority'],
    );
    return true;
  });
});
