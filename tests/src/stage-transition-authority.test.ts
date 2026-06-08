import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateStageTransitionIntent,
  normalizeStageTransitionIntent,
  rebuildStageTransitionAuthorityReadModel,
  STAGE_TRANSITION_INTENT_AUTHORITY_BOUNDARY,
} from '../../src/stage-transition-authority.ts';

function baseIntent(overrides: Record<string, unknown> = {}) {
  return {
    intent_id: 'intent-owner-answer',
    intent_kind: 'domain_owner_answer',
    producer_kind: 'domain_agent',
    stage_run_id: 'stage-run-transition',
    generation: 2,
    domain_id: 'medautoscience',
    stage_id: 'publication_handoff_owner_gate',
    owner: 'med-autoscience',
    source_fingerprint: 'sha256:source-current',
    idempotency_key: 'stage-run-transition:g2',
    stage_manifest_ref: 'opl://stage-manifests/stage-run-transition:g2',
    current_pointer_ref: 'opl://stage-runs/stage-run-transition/current:g2',
    provider_attempt_ref: 'temporal://attempt/stage-run-transition',
    attempt_lease_ref: 'opl://leases/stage-run-transition:g2',
    execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-transition:g2',
    observed_at: '2026-06-08T00:00:00.000Z',
    authority_boundary: STAGE_TRANSITION_INTENT_AUTHORITY_BOUNDARY,
    owner_receipt_ref: 'mas://owner-receipts/stage-run-transition:g2',
    owner_answer_stage_run_id: 'stage-run-transition',
    owner_answer_generation: 2,
    owner_answer_manifest_ref: 'opl://stage-manifests/stage-run-transition:g2',
    owner_answer_current_pointer_ref: 'opl://stage-runs/stage-run-transition/current:g2',
    owner_answer_source_fingerprint: 'sha256:source-current',
    owner_answer_idempotency_key: 'stage-run-transition:g2',
    accepted_answer_shape: ['owner_receipt', 'typed_blocker'],
    next_owner: 'med-autoscience',
    ...overrides,
  };
}

test('Stage Transition Authority accepts only current bound owner answers as stage transitions', () => {
  const decision = evaluateStageTransitionIntent(baseIntent());

  assert.equal(decision.surface_kind, 'opl_stage_transition_authority_decision');
  assert.equal(decision.status, 'transition_accepted');
  assert.equal(decision.can_write_stage_current_pointer, true);
  assert.equal(decision.can_write_stage_run_terminal_state, true);
  assert.equal(decision.can_publish_current_owner_delta, true);
  assert.equal(decision.rejection_reasons.length, 0);
  assert.equal(decision.observation_reasons.length, 0);
  assert.ok(decision.accepted_transition_ref?.startsWith('opl://stage-transition-authority/'));
  assert.equal(decision.current_owner_delta?.surface_kind, 'opl_current_owner_delta');
  assert.equal(decision.current_owner_delta?.default_planning_root, 'current_owner_delta');
  assert.equal(
    (decision.current_owner_delta?.authority_boundary as Record<string, unknown>)
      .stage_transition_authority_single_writer,
    true,
  );
  assert.equal(decision.authority_boundary.stage_transition_single_writer, true);
  assert.equal(
    decision.authority_boundary.intent_producer_can_write_stage_current_pointer,
    false,
  );
});

test('Stage Transition Authority records provider completion as observation only', () => {
  const decision = evaluateStageTransitionIntent(baseIntent({
    intent_id: 'intent-provider-completed',
    intent_kind: 'provider_observation',
    producer_kind: 'runtime_provider',
    owner_receipt_ref: undefined,
    owner_answer_stage_run_id: undefined,
    owner_answer_generation: undefined,
    owner_answer_manifest_ref: undefined,
    owner_answer_current_pointer_ref: undefined,
    owner_answer_source_fingerprint: undefined,
    owner_answer_idempotency_key: undefined,
    provider_completion_ref: 'temporal://attempt/stage-run-transition/completed',
  }));

  assert.equal(decision.status, 'observation_recorded');
  assert.equal(decision.can_write_stage_current_pointer, false);
  assert.equal(decision.can_write_stage_run_terminal_state, false);
  assert.equal(decision.can_publish_current_owner_delta, false);
  assert.deepEqual(decision.observation_reasons, [
    'provider_observation_cannot_drive_stage_transition',
    'runtime_provider_cannot_write_stage_transition',
  ]);
  assert.equal(decision.current_owner_delta, null);
  assert.equal(
    decision.authority_boundary.provider_completion_counts_as_stage_transition,
    false,
  );
});

test('Stage Transition Authority records read model and worklist signals without default planning authority', () => {
  for (const [intentKind, producerKind] of [
    ['read_model_observation', 'read_model'],
    ['worklist_observation', 'worklist'],
    ['agent_lab_observation', 'agent_lab'],
  ] as const) {
    const decision = evaluateStageTransitionIntent(baseIntent({
      intent_id: `intent-${intentKind}`,
      intent_kind: intentKind,
      producer_kind: producerKind,
      owner_receipt_ref: undefined,
      owner_answer_stage_run_id: undefined,
      owner_answer_generation: undefined,
      owner_answer_manifest_ref: undefined,
      owner_answer_current_pointer_ref: undefined,
      owner_answer_source_fingerprint: undefined,
      owner_answer_idempotency_key: undefined,
    }));

    assert.equal(decision.status, 'observation_recorded');
    assert.equal(decision.can_publish_current_owner_delta, false);
    assert.equal(decision.current_owner_delta, null);
  }
});

test('Stage Transition Authority rejects stale owner answers bound to another generation', () => {
  const decision = evaluateStageTransitionIntent(baseIntent({
    intent_id: 'intent-stale-owner-answer',
    owner_answer_generation: 1,
    owner_answer_manifest_ref: 'opl://stage-manifests/stage-run-transition:g1',
    owner_answer_current_pointer_ref: 'opl://stage-runs/stage-run-transition/current:g1',
    owner_answer_source_fingerprint: 'sha256:source-stale',
    owner_answer_idempotency_key: 'stage-run-transition:g1',
  }));

  assert.equal(decision.status, 'rejected');
  assert.equal(decision.can_write_stage_current_pointer, false);
  assert.equal(decision.can_write_stage_run_terminal_state, false);
  assert.deepEqual(decision.rejection_reasons, [
    'closeout_receipt_stage_run_binding_missing',
    'closeout_receipt_stage_manifest_binding_missing',
    'closeout_receipt_current_pointer_binding_missing',
    'closeout_receipt_source_fingerprint_binding_missing',
    'closeout_owner_answer_idempotency_binding_missing',
  ]);
});

test('Stage Transition Authority accepts current typed blocker but never creates it', () => {
  const decision = evaluateStageTransitionIntent(baseIntent({
    intent_id: 'intent-typed-blocker',
    intent_kind: 'typed_blocker',
    typed_blocker_ref: 'mas://typed-blockers/stage-run-transition:g2',
    owner_receipt_ref: undefined,
  }));

  assert.equal(decision.status, 'transition_accepted');
  assert.equal(decision.current_owner_delta?.desired_delta_kind, 'typed_blocker');
  assert.equal(decision.current_owner_delta?.latest_owner_answer_ref, 'mas://typed-blockers/stage-run-transition:g2');
  assert.equal(decision.authority_boundary.opl_can_create_typed_blocker, false);
});

test('Stage Transition Authority rebuild deduplicates idempotent intents and ignores stale generation closeout', () => {
  const readModel = rebuildStageTransitionAuthorityReadModel([
    baseIntent({
      intent_id: 'intent-old',
      generation: 1,
      idempotency_key: 'stage-run-transition:g1',
      stage_manifest_ref: 'opl://stage-manifests/stage-run-transition:g1',
      current_pointer_ref: 'opl://stage-runs/stage-run-transition/current:g1',
      provider_attempt_ref: 'temporal://attempt/stage-run-transition:g1',
      attempt_lease_ref: 'opl://leases/stage-run-transition:g1',
      execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-transition:g1',
      owner_answer_generation: 1,
      owner_answer_manifest_ref: 'opl://stage-manifests/stage-run-transition:g1',
      owner_answer_current_pointer_ref: 'opl://stage-runs/stage-run-transition/current:g1',
      owner_answer_idempotency_key: 'stage-run-transition:g1',
      observed_at: '2026-06-08T00:00:00.000Z',
    }),
    baseIntent({
      intent_id: 'intent-current',
      observed_at: '2026-06-08T00:01:00.000Z',
    }),
    baseIntent({
      intent_id: 'intent-current-duplicate',
      observed_at: '2026-06-08T00:02:00.000Z',
    }),
    baseIntent({
      intent_id: 'intent-current-provider-observation',
      intent_kind: 'provider_observation',
      producer_kind: 'runtime_provider',
      idempotency_key: 'stage-run-transition:g2:provider',
      owner_receipt_ref: undefined,
      owner_answer_stage_run_id: undefined,
      owner_answer_generation: undefined,
      owner_answer_manifest_ref: undefined,
      owner_answer_current_pointer_ref: undefined,
      owner_answer_source_fingerprint: undefined,
      owner_answer_idempotency_key: undefined,
      observed_at: '2026-06-08T00:03:00.000Z',
    }),
  ]);

  assert.equal(readModel.surface_kind, 'opl_stage_transition_authority_read_model');
  assert.equal(readModel.projection_role, 'single_writer_stage_transition_projection');
  assert.equal(readModel.stage_runs.length, 1);
  assert.equal(readModel.stage_runs[0].observed_generation, 2);
  assert.equal(readModel.stage_runs[0].current_owner_delta?.surface_kind, 'opl_current_owner_delta');
  assert.equal(readModel.stage_runs[0].observation_intent_count, 1);
  assert.equal(readModel.events.length, 3);
  assert.equal(readModel.authority_boundary.read_model_update_counts_as_stage_transition, false);
});

test('Stage Transition Authority rejects forbidden body or authority claims', () => {
  assert.throws(
    () => normalizeStageTransitionIntent(baseIntent({ artifact_body: 'body' })),
    /forbidden_body_payload/,
  );
  assert.throws(
    () => normalizeStageTransitionIntent(baseIntent({ production_ready: true })),
    /forbidden_domain_authority/,
  );
  assert.throws(
    () => normalizeStageTransitionIntent(baseIntent({ authority_boundary: {
      ...STAGE_TRANSITION_INTENT_AUTHORITY_BOUNDARY,
      intent_can_write_stage_current_pointer: true,
    } })),
    /stage_transition_intent_authority_boundary_invalid/,
  );
  assert.throws(
    () => normalizeStageTransitionIntent(baseIntent({ authority_boundary: undefined })),
    /requires refs-only non-authoritative authority_boundary/,
  );
  assert.throws(
    () => normalizeStageTransitionIntent(baseIntent({ intent_kind: 'provider_completed' })),
    /unsupported intent_kind/,
  );
  assert.throws(
    () => normalizeStageTransitionIntent(baseIntent({ producer_kind: 'stage_index' })),
    /unsupported producer_kind/,
  );
});
