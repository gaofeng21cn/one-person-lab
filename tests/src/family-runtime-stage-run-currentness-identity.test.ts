import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStageRunCurrentnessIdentity,
  missingStageRunCurrentnessIdentityFields,
  sameStageRunCurrentnessIdentity,
  sameStageRunRouteCurrentnessIdentity,
} from '../../src/family-runtime-stage-run-currentness-identity.ts';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    task: {
      domain_id: 'medautoscience',
      task_id: 'frt-current',
      payload: {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        stage_id: 'domain_owner/default-executor-dispatch',
        action_type: 'run_gate_clearing_batch',
        work_unit_id: 'publication_gate_replay',
        work_unit_fingerprint: 'sha256:gate-replay-current',
        source_fingerprint: 'mas-source:fresh',
        truth_epoch: 'truth-epoch-1',
        runtime_health_epoch: 'runtime-health-1',
        source_eval_id: 'publication-eval::current',
        idempotency_key: 'provider-admission::003::sha256:gate-replay-current',
        route_identity_key: 'route::003::publication-gate-replay',
        attempt_idempotency_key: 'attempt::003::publication-gate-replay',
        dispatch_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
        stage_packet_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
        stage_packet_refs: [
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
          'current-control://003/run_gate_clearing_batch',
        ],
        provider_admission_identity: {
          status: 'provider_admission_pending',
          route_identity_key: 'route::003::publication-gate-replay',
          attempt_idempotency_key: 'attempt::003::publication-gate-replay',
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
      execution_authorization_decision_ref:
        'opl://stage-attempts/sat-current/execution-authorizations/current',
      workspace_locator: {
        truth_epoch: 'truth-epoch-1',
        runtime_health_epoch: 'runtime-health-1',
      },
    },
    ...overrides,
  };
}

test('builds a reusable StageRun currentness identity from task and attempt refs', () => {
  const identity = buildStageRunCurrentnessIdentity(baseInput());

  assert.deepEqual(identity, {
    surface_kind: 'opl_stage_run_currentness_identity',
    schema_version: 1,
    domain_id: 'medautoscience',
    study_id_or_quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    stage_id: 'domain_owner/default-executor-dispatch',
    stage_attempt_id: 'sat-current',
    action_type: 'run_gate_clearing_batch',
    work_unit_id: 'publication_gate_replay',
    work_unit_fingerprint: 'sha256:gate-replay-current',
    source_fingerprint: 'mas-source:fresh',
    truth_epoch: 'truth-epoch-1',
    runtime_health_epoch: 'runtime-health-1',
    source_eval_id: 'publication-eval::current',
    idempotency_key: 'provider-admission::003::sha256:gate-replay-current',
    route_identity_key: 'route::003::publication-gate-replay',
    attempt_idempotency_key: 'attempt::003::publication-gate-replay',
    recovery_obligation_id: null,
    dispatch_ref:
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
    stage_packet_ref:
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
    stage_packet_refs: [
      'current-control://003/run_gate_clearing_batch',
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
    ],
    provider_admission_identity: {
      status: 'provider_admission_pending',
      route_identity_key: 'route::003::publication-gate-replay',
      attempt_idempotency_key: 'attempt::003::publication-gate-replay',
    },
    owner_route_currentness_basis: {
      work_unit_id: 'publication_gate_replay',
      work_unit_fingerprint: 'sha256:gate-replay-current',
      truth_epoch: 'truth-epoch-1',
      runtime_health_epoch: 'runtime-health-1',
      source_eval_id: 'publication-eval::current',
    },
    provider_attempt_ref: 'opl://stage-attempts/sat-current',
    active_lease_ref: 'opl://stage-attempts/sat-current/leases/frt-current/active',
    execution_authorization_ref:
      'opl://stage-attempts/sat-current/execution-authorizations/current',
    workflow_id: 'wf-current',
    task_id: 'frt-current',
  });
  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), []);
});

test('compares StageRun currentness identity by domain work unit and attempt identity', () => {
  const left = buildStageRunCurrentnessIdentity(baseInput());
  const same = buildStageRunCurrentnessIdentity(baseInput());
  const different = buildStageRunCurrentnessIdentity(baseInput({
    stageAttempt: {
      ...baseInput().stageAttempt,
      stage_attempt_id: 'sat-other',
    },
  }));

  assert.equal(sameStageRunCurrentnessIdentity(left, same), true);
  assert.equal(sameStageRunCurrentnessIdentity(left, different), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(left, different), true);
});

test('compares StageRun route currentness without letting stage attempt id split live admission', () => {
  const base = baseInput();
  const basePayload = (base.task as Record<string, unknown>).payload as Record<string, unknown>;
  const admitted = buildStageRunCurrentnessIdentity(baseInput({
    stageAttempt: {
      ...baseInput().stageAttempt,
      stage_attempt_id: 'sat-admitted',
      workflow_id: 'wf-admitted',
    },
  }));
  const candidate = buildStageRunCurrentnessIdentity(baseInput({
    stageAttempt: {
      ...baseInput().stageAttempt,
      stage_attempt_id: 'sat-candidate',
      workflow_id: 'wf-candidate',
    },
  }));
  const stale = buildStageRunCurrentnessIdentity(baseInput({
    task: {
      ...base.task,
      payload: {
        ...basePayload,
        work_unit_fingerprint: 'sha256:stale',
        source_fingerprint: 'mas-source:stale',
      },
    },
  }));

  assert.equal(sameStageRunCurrentnessIdentity(admitted, candidate), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(admitted, candidate), true);
  assert.equal(sameStageRunRouteCurrentnessIdentity(admitted, stale), false);
});

test('fails closed when selected dispatch or stage packet identity changes', () => {
  const base = baseInput();
  const basePayload = (base.task as Record<string, unknown>).payload as Record<string, unknown>;
  const current = buildStageRunCurrentnessIdentity(base);
  const staleSelectedDispatch = buildStageRunCurrentnessIdentity(baseInput({
    task: {
      ...base.task,
      payload: {
        ...basePayload,
        dispatch_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/stale.json',
        stage_packet_ref:
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/stale.json',
        stage_packet_refs: [
          'current-control://003/run_gate_clearing_batch',
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_gate_clearing_batch/stale.json',
        ],
      },
    },
  }));
  const reorderedRefs = buildStageRunCurrentnessIdentity(baseInput({
    task: {
      ...base.task,
      payload: {
        ...basePayload,
        stage_packet_refs: [
          'current-control://003/run_gate_clearing_batch',
          'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
        ],
      },
    },
  }));

  assert.equal(sameStageRunRouteCurrentnessIdentity(current, staleSelectedDispatch), false);
  assert.equal(sameStageRunCurrentnessIdentity(current, staleSelectedDispatch), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(current, reorderedRefs), true);
});

test('fails closed when provider admission or selected stage packet identity is incomplete', () => {
  const base = baseInput();
  const basePayload = (base.task as Record<string, unknown>).payload as Record<string, unknown>;
  const incomplete = buildStageRunCurrentnessIdentity(baseInput({
    task: {
      ...base.task,
      payload: {
        ...basePayload,
        provider_admission_identity: {
          status: 'provider_admission_pending',
        },
        route_identity_key: undefined,
        attempt_idempotency_key: undefined,
        dispatch_ref: undefined,
        stage_packet_ref: undefined,
        stage_packet_refs: [],
      },
    },
  }));

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(incomplete), [
    'route_identity_key',
    'attempt_idempotency_key',
    'dispatch_ref',
    'stage_packet_ref',
    'stage_packet_refs',
  ]);
  assert.equal(sameStageRunCurrentnessIdentity(incomplete, incomplete), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(incomplete, incomplete), false);
});

test('preserves explicit MAS provider admission identity fields in StageRun currentness identity', () => {
  const identity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: 'medautoscience',
      task_id: 'frt-current',
      payload: {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        stage_id: 'domain_owner/default-executor-dispatch',
        action_type: 'return_to_ai_reviewer_workflow',
        source_fingerprint: 'mas-source:fresh',
      },
    },
    taskPayload: {
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      stage_id: 'domain_owner/default-executor-dispatch',
      action_type: 'return_to_ai_reviewer_workflow',
      source_fingerprint: 'mas-source:fresh',
      dispatch_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/ai_reviewer.json',
      stage_packet_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/ai_reviewer.json',
      stage_packet_refs: [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/ai_reviewer.json',
      ],
      provider_admission_identity: {
        status: 'provider_admission_pending',
        route_identity_key: 'mas-route::003::ai-reviewer',
        attempt_idempotency_key: 'mas-attempt::003::ai-reviewer',
        request_idempotency_key: 'mas-request::003::ai-reviewer',
        idempotency_key: 'mas-provider-admission::003::ai-reviewer',
      },
      owner_route_currentness_basis: {
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:ai-reviewer-current',
        truth_epoch: 'truth-epoch-current',
        runtime_health_epoch: 'runtime-health-current',
        source_eval_id: 'publication-eval::current',
      },
    },
    stageAttempt: {
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      stage_attempt_id: 'sat-current',
      task_id: 'frt-current',
    },
  });

  assert.equal(identity.route_identity_key, 'mas-route::003::ai-reviewer');
  assert.equal(identity.attempt_idempotency_key, 'mas-attempt::003::ai-reviewer');
  assert.equal(identity.idempotency_key, 'mas-request::003::ai-reviewer');
  assert.deepEqual(identity.provider_admission_identity, {
    status: 'provider_admission_pending',
    route_identity_key: 'mas-route::003::ai-reviewer',
    attempt_idempotency_key: 'mas-attempt::003::ai-reviewer',
    request_idempotency_key: 'mas-request::003::ai-reviewer',
    idempotency_key: 'mas-provider-admission::003::ai-reviewer',
  });
  assert.deepEqual(identity.owner_route_currentness_basis, {
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: 'sha256:ai-reviewer-current',
    truth_epoch: 'truth-epoch-current',
    runtime_health_epoch: 'runtime-health-current',
    source_eval_id: 'publication-eval::current',
  });
  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), []);
});

test('does not derive StageRun currentness identity from MAS legacy current-owner or exact-id fields', () => {
  const identity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: 'medautoscience',
      task_id: 'frt-current',
      payload: {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        stage_id: 'paper_mission/stage-route',
        next_action_id: 'mas-next-action::003::submission_milestone_candidate',
        route_identity_key: 'route::003::submission_milestone_candidate',
        attempt_idempotency_key: 'attempt::003::submission_milestone_candidate',
        dispatch_ref: 'paper-mission-transaction::003::submission_milestone_candidate#opl_route_command',
        stage_packet_ref: 'paper-mission-transaction::003::submission_milestone_candidate#opl_route_command',
        stage_packet_refs: [
          'paper-mission-transaction::003::submission_milestone_candidate#opl_route_command',
        ],
      },
    },
    currentOwnerDelta: {
      study_id: 'legacy-study-id',
      quest_id: 'legacy-quest-id',
      action_type: 'legacy_owner_action',
      work_unit_id: 'legacy_work_unit',
      work_unit_fingerprint: 'legacy-fingerprint',
      source_fingerprint: 'legacy-source',
      current_work_unit: 'legacy_current_work_unit',
      exact_work_unit_id: 'legacy_exact_work_unit_id',
      current_executable_owner_action: {
        action_type: 'legacy_nested_owner_action',
        exact_work_unit_id: 'legacy_nested_exact_work_unit_id',
      },
      currentness_basis: {
        work_unit_id: 'legacy_basis_work_unit',
        work_unit_fingerprint: 'legacy-basis-fingerprint',
        truth_epoch: 'legacy-truth-epoch',
        runtime_health_epoch: 'legacy-runtime-health-epoch',
        source_eval_id: 'legacy-source-eval',
      },
    },
  });

  assert.equal(identity.study_id_or_quest_id, '003-dpcc-primary-care-phenotype-treatment-gap');
  assert.equal(identity.action_type, null);
  assert.equal(identity.work_unit_id, null);
  assert.equal(identity.work_unit_fingerprint, null);
  assert.equal(identity.source_fingerprint, null);
  assert.equal(identity.truth_epoch, null);
  assert.equal(identity.runtime_health_epoch, null);
  assert.equal(identity.source_eval_id, null);
  assert.equal(identity.idempotency_key, 'mas-next-action::003::submission_milestone_candidate');
  assert.equal(identity.route_identity_key, 'route::003::submission_milestone_candidate');
  assert.equal(identity.attempt_idempotency_key, 'attempt::003::submission_milestone_candidate');
  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), [
    'stage_attempt_id',
    'action_type',
    'work_unit_id',
    'work_unit_fingerprint',
    'source_fingerprint',
    'truth_epoch',
    'runtime_health_epoch',
    'source_eval_id',
  ]);
  assert.equal(sameStageRunRouteCurrentnessIdentity(identity, identity), false);
});

test('does not treat StageAttempt idempotency as MAS NextAction request identity', () => {
  const identity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: 'medautoscience',
      task_id: 'frt-current',
      payload: {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        stage_id: 'paper_mission/stage-route',
        action_type: 'continue_same_stage',
        work_unit_id: 'submission_milestone_candidate',
        work_unit_fingerprint: 'paper-mission::003::submission_milestone_candidate::followthrough',
        source_fingerprint: 'mas-source:fresh',
        truth_epoch: 'truth-epoch-current',
        runtime_health_epoch: 'runtime-health-current',
        source_eval_id: 'paper-mission-eval::current',
        route_identity_key: 'paper-mission-route::003::submission_milestone_candidate',
        attempt_idempotency_key: 'paper-mission-attempt::003::submission_milestone_candidate',
        dispatch_ref: 'paper-mission-transaction::003::submission_milestone_candidate#opl_route_command',
        stage_packet_ref: 'paper-mission-transaction::003::submission_milestone_candidate#opl_route_command',
        stage_packet_refs: [
          'paper-mission-transaction::003::submission_milestone_candidate#opl_route_command',
        ],
      },
    },
    stageAttempt: {
      domain_id: 'medautoscience',
      stage_id: 'paper_mission/stage-route',
      stage_attempt_id: 'sat-paper-mission-current',
      task_id: 'frt-current',
      idempotency_key: 'stage-attempt-ledger::sat-paper-mission-current',
      source_fingerprint: 'mas-source:fresh',
    },
  });

  assert.equal(identity.idempotency_key, null);
  assert.equal(
    identity.attempt_idempotency_key,
    'paper-mission-attempt::003::submission_milestone_candidate',
  );
  assert.equal(identity.provider_attempt_ref, 'opl://stage-attempts/sat-paper-mission-current');
  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), ['idempotency_key']);
  assert.equal(sameStageRunRouteCurrentnessIdentity(identity, identity), false);
});

test('uses explicit MAS NextAction id before request idempotency for request identity', () => {
  const base = baseInput();
  const basePayload = (base.task as Record<string, unknown>).payload as Record<string, unknown>;
  const identity = buildStageRunCurrentnessIdentity(baseInput({
    task: {
      ...base.task,
      payload: {
        ...basePayload,
        next_action_id: 'mas-next-action::003::submission_milestone_candidate',
        request_idempotency_key: 'mas-request::003::submission_milestone_candidate',
        attempt_idempotency_key: 'mas-attempt::003::submission_milestone_candidate',
      },
    },
  }));

  assert.equal(identity.idempotency_key, 'mas-next-action::003::submission_milestone_candidate');
  assert.equal(identity.attempt_idempotency_key, 'mas-attempt::003::submission_milestone_candidate');
  assert.equal(missingStageRunCurrentnessIdentityFields(identity).includes('idempotency_key'), false);
});

test('fails closed when required StageRun currentness identity fields are missing', () => {
  const identity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: 'medautoscience',
      task_id: 'frt-incomplete',
      payload: {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'run_gate_clearing_batch',
      },
    },
    stageAttempt: {
      domain_id: 'medautoscience',
      stage_attempt_id: 'sat-incomplete',
    },
  });

  assert.deepEqual(missingStageRunCurrentnessIdentityFields(identity), [
    'stage_id',
    'work_unit_fingerprint',
    'source_fingerprint',
    'truth_epoch',
    'runtime_health_epoch',
    'source_eval_id',
    'idempotency_key',
    'route_identity_key',
    'attempt_idempotency_key',
    'dispatch_ref',
    'stage_packet_ref',
    'stage_packet_refs',
  ]);
  assert.equal(sameStageRunCurrentnessIdentity(identity, identity), false);
  assert.equal(sameStageRunRouteCurrentnessIdentity(identity, identity), false);
});
