import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStageRunCurrentnessIdentity,
  missingStageRunCurrentnessIdentityFields,
  sameStageRunCurrentnessIdentity,
  sameStageRunRouteCurrentnessIdentity,
} from '../../src/modules/runway/family-runtime-stage-run-currentness-identity.ts';

const packetRef = 'packet:artifact-owner-current';

function currentnessFixture() {
  return {
    task: {
      domain_id: 'redcube',
      task_id: 'frt-artifact-owner-current',
      payload: {
        quest_id: 'quest-artifact-owner',
        stage_id: 'domain_owner/default-executor-dispatch',
        action_type: 'render_artifact',
        work_unit_id: 'artifact-owner-current',
        work_unit_fingerprint: 'sha256:artifact-owner-current',
        source_fingerprint: 'source:artifact-owner-current',
        truth_epoch: 'truth-epoch-1',
        runtime_health_epoch: 'runtime-health-1',
        source_eval_id: 'artifact-eval::current',
        idempotency_key: 'request::artifact-owner-current',
        route_identity_key: 'route::artifact-owner-current',
        attempt_idempotency_key: 'attempt::artifact-owner-current',
        dispatch_ref: packetRef,
        stage_packet_ref: packetRef,
        stage_packet_refs: [packetRef],
        provider_admission_identity: {
          status: 'provider_admission_pending',
          route_identity_key: 'route::artifact-owner-current',
          attempt_idempotency_key: 'attempt::artifact-owner-current',
        },
        owner_route: {
          source_refs: {
            owner_route_currentness_basis: {
              work_unit_id: 'artifact-owner-current',
              work_unit_fingerprint: 'sha256:artifact-owner-current',
              truth_epoch: 'truth-epoch-1',
              runtime_health_epoch: 'runtime-health-1',
              source_eval_id: 'artifact-eval::current',
            },
          },
        },
      },
    },
    stageAttempt: {
      domain_id: 'redcube',
      stage_id: 'domain_owner/default-executor-dispatch',
      stage_attempt_id: 'sat-artifact-owner-current',
      source_fingerprint: 'source:artifact-owner-current',
      workflow_id: 'wf-artifact-owner-current',
      task_id: 'frt-artifact-owner-current',
      attempt_lease_ref:
        'opl://stage-attempts/sat-artifact-owner-current/leases/frt-artifact-owner-current/active',
      execution_authorization_decision_ref:
        'opl://stage-attempts/sat-artifact-owner-current/execution-authorizations/current',
      workspace_locator: {
        truth_epoch: 'truth-epoch-1',
        runtime_health_epoch: 'runtime-health-1',
      },
    },
  };
}

function withCurrentnessPatch(input: {
  payload?: Record<string, unknown>;
  basis?: Record<string, unknown>;
}) {
  const fixture = currentnessFixture();
  const payload = fixture.task.payload;
  const sourceRefs = payload.owner_route.source_refs;
  return {
    ...fixture,
    task: {
      ...fixture.task,
      payload: {
        ...payload,
        ...input.payload,
        owner_route: {
          ...payload.owner_route,
          source_refs: {
            ...sourceRefs,
            owner_route_currentness_basis: {
              ...sourceRefs.owner_route_currentness_basis,
              ...input.basis,
            },
          },
        },
      },
    },
  };
}

test('StageRun currentness identity projects route, lease, and execution authorization refs', () => {
  const identity = buildStageRunCurrentnessIdentity(currentnessFixture());

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), []);
  assert.equal(identity.stage_attempt_id, 'sat-artifact-owner-current');
  assert.equal(
    identity.active_lease_ref,
    'opl://stage-attempts/sat-artifact-owner-current/leases/frt-artifact-owner-current/active',
  );
  assert.equal(
    identity.execution_authorization_ref,
    'opl://stage-attempts/sat-artifact-owner-current/execution-authorizations/current',
  );
  assert.equal(identity.route_identity_key, 'route::artifact-owner-current');
  assert.equal(identity.dispatch_ref, packetRef);
});

test('StageRun route currentness ignores attempt instance but exact currentness does not', () => {
  const current = buildStageRunCurrentnessIdentity(currentnessFixture());
  const input = currentnessFixture();
  const redrive = buildStageRunCurrentnessIdentity({
    ...input,
    stageAttempt: {
      ...input.stageAttempt,
      stage_attempt_id: 'sat-artifact-owner-redrive',
      workflow_id: 'wf-artifact-owner-redrive',
    },
  });

  assert.equal(sameStageRunCurrentnessIdentity(current, redrive), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(current, redrive), true);
});

for (const scenario of [
  { name: 'quest identity', payload: { quest_id: 'quest-artifact-owner-next' } },
  { name: 'source fingerprint', payload: { source_fingerprint: 'source:artifact-owner-next' } },
  { name: 'truth epoch', basis: { truth_epoch: 'truth-epoch-2' } },
  { name: 'runtime health epoch', basis: { runtime_health_epoch: 'runtime-health-2' } },
  { name: 'source evaluation', basis: { source_eval_id: 'artifact-eval::next' } },
  { name: 'request identity', payload: { idempotency_key: 'request::artifact-owner-next' } },
  { name: 'route identity', payload: { route_identity_key: 'route::artifact-owner-next' } },
  { name: 'attempt identity', payload: { attempt_idempotency_key: 'attempt::artifact-owner-next' } },
  {
    name: 'selected packet',
    payload: {
      dispatch_ref: 'packet:artifact-owner-next',
      stage_packet_ref: 'packet:artifact-owner-next',
      stage_packet_refs: ['packet:artifact-owner-next'],
    },
  },
] as const) {
  test(`StageRun currentness fails closed when ${scenario.name} changes`, () => {
    const current = buildStageRunCurrentnessIdentity(currentnessFixture());
    const stale = buildStageRunCurrentnessIdentity(withCurrentnessPatch(scenario));

    assert.equal(sameStageRunRouteCurrentnessIdentity(current, stale), false);
    assert.equal(sameStageRunCurrentnessIdentity(current, stale), false);
  });
}

test('StageRun currentness uses provider admission request identity, not attempt ledger idempotency', () => {
  const fixture = currentnessFixture();
  const identity = buildStageRunCurrentnessIdentity({
    ...fixture,
    task: {
      ...fixture.task,
      payload: {
        ...fixture.task.payload,
        idempotency_key: undefined,
        provider_admission_identity: {
          ...fixture.task.payload.provider_admission_identity,
          request_idempotency_key: 'provider-request::artifact-owner-current',
        },
      },
    },
    stageAttempt: {
      ...fixture.stageAttempt,
      idempotency_key: 'stage-attempt-ledger::internal-only',
    },
  });

  assert.equal(identity.idempotency_key, 'provider-request::artifact-owner-current');
  assert.equal(identity.attempt_idempotency_key, 'attempt::artifact-owner-current');
  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), []);
});

test('StageRun currentness fails closed when provider admission and packet identity are incomplete', () => {
  const identity = buildStageRunCurrentnessIdentity(withCurrentnessPatch({
    payload: {
      provider_admission_identity: { status: 'provider_admission_pending' },
      route_identity_key: undefined,
      attempt_idempotency_key: undefined,
      dispatch_ref: undefined,
      stage_packet_ref: undefined,
      stage_packet_refs: [],
    },
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
