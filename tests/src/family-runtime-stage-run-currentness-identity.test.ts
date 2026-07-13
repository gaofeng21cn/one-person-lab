import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStageRunCurrentnessIdentity,
  missingStageRunCurrentnessIdentityFields,
  sameStageRunCurrentnessIdentity,
  sameStageRunRouteCurrentnessIdentity,
} from '../../src/modules/runway/family-runtime-stage-run-currentness-identity.ts';

const packetRef = 'packet:artifact-owner-current', routeIdentity = 'route::artifact-owner-current';
const attemptIdentity = 'attempt::artifact-owner-current';
const basis = {
  work_unit_id: 'artifact-owner-current', work_unit_fingerprint: 'sha256:artifact-owner-current',
  truth_epoch: 'truth-epoch-1', runtime_health_epoch: 'runtime-health-1', source_eval_id: 'artifact-eval::current',
};

function baseInput() {
  return {
    task: { domain_id: 'redcube', task_id: 'frt-artifact-owner-current', payload: {
        quest_id: 'quest-artifact-owner', stage_id: 'domain_owner/default-executor-dispatch',
        action_type: 'render_artifact', ...basis,
        source_fingerprint: 'source:artifact-owner-current', idempotency_key: 'request::artifact-owner-current',
        route_identity_key: routeIdentity, attempt_idempotency_key: attemptIdentity,
        dispatch_ref: packetRef, stage_packet_ref: packetRef, stage_packet_refs: [packetRef],
        provider_attempt_identity: { status: 'provider_attempt_pending', route_identity_key: routeIdentity,
          attempt_idempotency_key: attemptIdentity },
        owner_route: { source_refs: { owner_route_currentness_basis: basis } },
    } },
    stageAttempt: {
      domain_id: 'redcube', stage_id: 'domain_owner/default-executor-dispatch',
      stage_attempt_id: 'sat-artifact-owner-current', source_fingerprint: 'source:artifact-owner-current',
      workflow_id: 'wf-artifact-owner-current', task_id: 'frt-artifact-owner-current',
      workspace_locator: basis,
    },
  };
}

function withPayload(patch: Record<string, unknown>) {
  const input = baseInput();
  return { ...input, task: { ...input.task, payload: { ...input.task.payload, ...patch } } };
}

function withBasis(patch: Record<string, unknown>) {
  const input = baseInput();
  const owner_route = { source_refs: { owner_route_currentness_basis: { ...basis, ...patch } } };
  return { ...input, task: { ...input.task, payload: { ...input.task.payload, owner_route } } };
}

test('StageRun currentness separates route reuse from attempt identity without authorization refs', () => {
  const identity = buildStageRunCurrentnessIdentity(baseInput());
  const input = baseInput();
  const redrive = buildStageRunCurrentnessIdentity({ ...input, stageAttempt: { ...input.stageAttempt,
    stage_attempt_id: 'sat-artifact-owner-redrive', workflow_id: 'wf-artifact-owner-redrive' } });

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), []);
  assert.equal(Object.hasOwn(identity, 'active_lease_ref'), false);
  assert.equal(Object.hasOwn(identity, 'execution_authorization_ref'), false);
  assert.equal(sameStageRunCurrentnessIdentity(identity, redrive), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(identity, redrive), true);
});

for (const [name, staleInput] of [
  ['quest identity', () => withPayload({ quest_id: 'quest-artifact-owner-next' })],
  ['source fingerprint', () => withPayload({ source_fingerprint: 'source:artifact-owner-next' })],
  ['request identity', () => withPayload({ idempotency_key: 'request::artifact-owner-next' })],
  ['route identity', () => withPayload({ route_identity_key: 'route::artifact-owner-next' })],
  ['attempt identity', () => withPayload({ attempt_idempotency_key: 'attempt::artifact-owner-next' })],
  ['selected packet', () => withPayload({ dispatch_ref: 'packet:artifact-owner-next',
    stage_packet_ref: 'packet:artifact-owner-next', stage_packet_refs: ['packet:artifact-owner-next'] })],
  ['truth epoch', () => withBasis({ truth_epoch: 'truth-epoch-2' })],
  ['runtime health epoch', () => withBasis({ runtime_health_epoch: 'runtime-health-2' })],
  ['source evaluation', () => withBasis({ source_eval_id: 'artifact-eval::next' })],
] as const) {
  test(`StageRun currentness fails closed when ${name} changes`, () => {
    const current = buildStageRunCurrentnessIdentity(baseInput());
    const stale = buildStageRunCurrentnessIdentity(staleInput());
    assert.equal(sameStageRunRouteCurrentnessIdentity(current, stale), false);
    assert.equal(sameStageRunCurrentnessIdentity(current, stale), false);
  });
}

for (const scenario of [
  { name: 'uses provider request identity', requestId: 'provider-request::artifact-owner-current', missing: [] },
  { name: 'fails closed without request identity', requestId: null, missing: ['idempotency_key'] },
] as const) {
  test(`StageRun currentness ${scenario.name} when attempt identity exists`, () => {
    const input = baseInput();
    const identity = buildStageRunCurrentnessIdentity({ ...input,
      task: { ...input.task, payload: { ...input.task.payload, idempotency_key: undefined,
        provider_attempt_identity: { ...input.task.payload.provider_attempt_identity,
          ...(scenario.requestId ? { request_idempotency_key: scenario.requestId } : {}) } } },
      stageAttempt: { ...input.stageAttempt, idempotency_key: 'stage-attempt-ledger::internal' },
    });

    assert.equal(identity.idempotency_key, scenario.requestId); assert.equal(identity.attempt_idempotency_key, attemptIdentity);
    assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), scenario.missing);
    assert.equal(sameStageRunRouteCurrentnessIdentity(identity, identity), scenario.missing.length === 0);
  });
}

test('StageRun currentness fails closed when admission and packet identity are incomplete', () => {
  const identity = buildStageRunCurrentnessIdentity(withPayload({
    provider_attempt_identity: { status: 'provider_attempt_pending' }, route_identity_key: undefined,
    attempt_idempotency_key: undefined, dispatch_ref: undefined, stage_packet_ref: undefined, stage_packet_refs: [],
  }));

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), [
    'route_identity_key', 'attempt_idempotency_key', 'dispatch_ref', 'stage_packet_ref', 'stage_packet_refs']);
  assert.equal(sameStageRunCurrentnessIdentity(identity, identity), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(identity, identity), false);
});
