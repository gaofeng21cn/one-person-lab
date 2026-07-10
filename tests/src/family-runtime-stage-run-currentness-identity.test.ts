import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStageRunCurrentnessIdentity,
  missingStageRunCurrentnessIdentityFields,
  sameStageRunCurrentnessIdentity,
  sameStageRunRouteCurrentnessIdentity,
} from '../../src/modules/runway/family-runtime-stage-run-currentness-identity.ts';

const packetRef = 'packet:publication-gate-replay';

function currentnessFixture() {
  return {
    task: {
      domain_id: 'medautoscience',
      task_id: 'frt-current',
      payload: {
        study_id: 'dm003',
        stage_id: 'domain_owner/default-executor-dispatch',
        action_type: 'run_gate_clearing_batch',
        work_unit_id: 'publication_gate_replay',
        work_unit_fingerprint: 'sha256:gate-replay-current',
        source_fingerprint: 'mas-source:fresh',
        truth_epoch: 'truth-epoch-1',
        runtime_health_epoch: 'runtime-health-1',
        source_eval_id: 'publication-eval::current',
        idempotency_key: 'provider-admission::dm003::current',
        route_identity_key: 'route::dm003::publication-gate-replay',
        attempt_idempotency_key: 'attempt::dm003::publication-gate-replay',
        dispatch_ref: packetRef,
        stage_packet_ref: packetRef,
        stage_packet_refs: [packetRef],
        provider_admission_identity: {
          status: 'provider_admission_pending',
          route_identity_key: 'route::dm003::publication-gate-replay',
          attempt_idempotency_key: 'attempt::dm003::publication-gate-replay',
        },
        owner_route: {
          source_refs: {
            owner_route_currentness_basis: {
              work_unit_id: 'publication_gate_replay',
              work_unit_fingerprint: 'sha256:gate-replay-current',
              truth_epoch: 'truth-epoch-1',
              runtime_health_epoch: 'runtime-health-1',
              source_eval_id: 'publication-eval::current',
            },
          },
        },
      },
    },
    stageAttempt: {
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      stage_attempt_id: 'sat-current',
      source_fingerprint: 'mas-source:fresh',
      workflow_id: 'wf-current',
      task_id: 'frt-current',
      attempt_lease_ref: 'opl://stage-attempts/sat-current/leases/frt-current/active',
      execution_authorization_decision_ref: 'opl://stage-attempts/sat-current/execution-authorizations/current',
      workspace_locator: {
        truth_epoch: 'truth-epoch-1',
        runtime_health_epoch: 'runtime-health-1',
      },
    },
  };
}

function withTaskPayload(patch: Record<string, unknown>) {
  const input = currentnessFixture();
  return {
    ...input,
    task: {
      ...input.task,
      payload: { ...input.task.payload, ...patch },
    },
  };
}

test('StageRun currentness identity owns attempt lease and route identity', () => {
  const identity = buildStageRunCurrentnessIdentity(currentnessFixture());

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), []);
  assert.equal(identity.stage_attempt_id, 'sat-current');
  assert.equal(identity.active_lease_ref, 'opl://stage-attempts/sat-current/leases/frt-current/active');
  assert.equal(identity.route_identity_key, 'route::dm003::publication-gate-replay');
  assert.equal(identity.dispatch_ref, packetRef);
});

test('StageRun route currentness ignores attempt instance but exact currentness does not', () => {
  const current = buildStageRunCurrentnessIdentity(currentnessFixture());
  const input = currentnessFixture();
  const redrive = buildStageRunCurrentnessIdentity({
    ...input,
    stageAttempt: {
      ...input.stageAttempt,
      stage_attempt_id: 'sat-redrive',
      workflow_id: 'wf-redrive',
    },
  });

  assert.equal(sameStageRunCurrentnessIdentity(current, redrive), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(current, redrive), true);
});

for (const [name, patch] of [
  ['study identity', { study_id: 'dm004' }],
  ['selected packet', {
    dispatch_ref: 'packet:stale',
    stage_packet_ref: 'packet:stale',
    stage_packet_refs: ['packet:stale'],
  }],
] as const) {
  test(`StageRun route currentness fails closed when ${name} changes`, () => {
    const current = buildStageRunCurrentnessIdentity(currentnessFixture());
    const stale = buildStageRunCurrentnessIdentity(withTaskPayload(patch));

    assert.equal(sameStageRunRouteCurrentnessIdentity(current, stale), false);
    assert.equal(sameStageRunCurrentnessIdentity(current, stale), false);
  });
}

test('StageRun currentness fails closed when provider admission and packet identity are incomplete', () => {
  const identity = buildStageRunCurrentnessIdentity(withTaskPayload({
    provider_admission_identity: { status: 'provider_admission_pending' },
    route_identity_key: undefined,
    attempt_idempotency_key: undefined,
    dispatch_ref: undefined,
    stage_packet_ref: undefined,
    stage_packet_refs: [],
  }));

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), [
    'route_identity_key',
    'attempt_idempotency_key',
    'dispatch_ref',
    'stage_packet_ref',
    'stage_packet_refs',
  ]);
  assert.equal(sameStageRunCurrentnessIdentity(identity, identity), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(identity, identity), false);
});
