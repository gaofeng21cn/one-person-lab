import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  STAGE_TRANSITION_INTENT_AUTHORITY_BOUNDARY,
} from '../../../../src/modules/stagecraft/stage-transition-authority.ts';

function transitionIntent(overrides: Record<string, unknown> = {}) {
  return {
    intent_id: 'intent-owner-answer',
    intent_kind: 'domain_owner_answer',
    producer_kind: 'domain_agent',
    stage_run_id: 'stage-run-transition-cli',
    generation: 2,
    domain_id: 'medautoscience',
    stage_id: 'publication_handoff_owner_gate',
    owner: 'med-autoscience',
    source_fingerprint: 'sha256:source-current',
    idempotency_key: 'stage-run-transition-cli:g2',
    stage_manifest_ref: 'opl://stage-manifests/stage-run-transition-cli:g2',
    current_pointer_ref: 'opl://stage-runs/stage-run-transition-cli/current:g2',
    provider_attempt_ref: 'temporal://attempt/stage-run-transition-cli:g2',
    attempt_lease_ref: 'opl://leases/stage-run-transition-cli:g2',
    execution_authorization_decision_ref:
      'opl://execution-authorizations/stage-run-transition-cli:g2',
    observed_at: '2026-06-15T00:00:00.000Z',
    authority_boundary: STAGE_TRANSITION_INTENT_AUTHORITY_BOUNDARY,
    owner_receipt_ref: 'mas://owner-receipts/stage-run-transition-cli:g2',
    owner_answer_stage_run_id: 'stage-run-transition-cli',
    owner_answer_generation: 2,
    owner_answer_manifest_ref: 'opl://stage-manifests/stage-run-transition-cli:g2',
    owner_answer_current_pointer_ref:
      'opl://stage-runs/stage-run-transition-cli/current:g2',
    owner_answer_source_fingerprint: 'sha256:source-current',
    owner_answer_idempotency_key: 'stage-run-transition-cli:g2',
    accepted_answer_shape: ['owner_receipt', 'typed_blocker', 'human_gate_receipt'],
    next_owner: 'med-autoscience',
    ...overrides,
  };
}

function observationIntent(overrides: Record<string, unknown> = {}) {
  return transitionIntent({
    intent_id: 'intent-provider-observation',
    intent_kind: 'provider_observation',
    producer_kind: 'runtime_provider',
    idempotency_key: 'stage-run-transition-cli:g2:provider',
    owner_receipt_ref: undefined,
    owner_answer_stage_run_id: undefined,
    owner_answer_generation: undefined,
    owner_answer_manifest_ref: undefined,
    owner_answer_current_pointer_ref: undefined,
    owner_answer_source_fingerprint: undefined,
    owner_answer_idempotency_key: undefined,
    provider_completion_ref: 'temporal://attempt/stage-run-transition-cli:g2/completed',
    ...overrides,
  });
}

test('runtime Stage Transition Authority evaluate publishes current_owner_delta only for accepted owner answers', () => {
  const accepted = runCli([
    'runtime',
    'stage-transition-authority',
    'evaluate',
    '--payload',
    JSON.stringify(transitionIntent()),
    '--json',
  ]).stage_transition_authority_evaluate;

  assert.equal(accepted.status, 'transition_accepted');
  assert.equal(accepted.can_write_stage_current_pointer, true);
  assert.equal(accepted.can_write_stage_run_terminal_state, true);
  assert.equal(accepted.can_publish_current_owner_delta, true);
  assert.equal(accepted.current_owner_delta.surface_kind, 'opl_current_owner_delta');
  assert.equal(accepted.current_owner_delta.default_planning_root, 'current_owner_delta');
  assert.equal(
    accepted.current_owner_delta.authority_boundary.stage_transition_authority_single_writer,
    true,
  );
  assert.equal(accepted.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(accepted.authority_boundary.opl_can_create_owner_receipt, false);
  assert.equal(accepted.authority_boundary.opl_can_create_typed_blocker, false);

  const observed = runCli([
    'runtime',
    'stage-transition-authority',
    'evaluate',
    '--payload',
    JSON.stringify(observationIntent()),
    '--json',
  ]).stage_transition_authority_evaluate;

  assert.equal(observed.status, 'observation_recorded');
  assert.equal(observed.can_write_stage_current_pointer, false);
  assert.equal(observed.can_write_stage_run_terminal_state, false);
  assert.equal(observed.can_publish_current_owner_delta, false);
  assert.equal(observed.current_owner_delta, null);
  assert.deepEqual(observed.observation_reasons, [
    'provider_observation_cannot_drive_stage_transition',
    'runtime_provider_cannot_write_stage_transition',
  ]);
});

test('runtime Stage Transition Authority read-model folds append-only intent events without clearing accepted transitions', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-transition-authority-'));
  const payloadPath = path.join(stateRoot, 'stage-transition-intents.json');
  fs.writeFileSync(
    payloadPath,
    `${JSON.stringify({
      intents: [
        transitionIntent({
          intent_id: 'intent-accepted-generation-2',
          observed_at: '2026-06-15T00:00:00.000Z',
        }),
        transitionIntent({
          intent_id: 'intent-accepted-generation-2-duplicate',
          observed_at: '2026-06-15T00:01:00.000Z',
        }),
        observationIntent({
          intent_id: 'intent-generation-3-provider-observation',
          generation: 3,
          idempotency_key: 'stage-run-transition-cli:g3:provider',
          stage_manifest_ref: 'opl://stage-manifests/stage-run-transition-cli:g3',
          current_pointer_ref: 'opl://stage-runs/stage-run-transition-cli/current:g3',
          provider_attempt_ref: 'temporal://attempt/stage-run-transition-cli:g3',
          attempt_lease_ref: 'opl://leases/stage-run-transition-cli:g3',
          execution_authorization_decision_ref:
            'opl://execution-authorizations/stage-run-transition-cli:g3',
          observed_at: '2026-06-15T00:02:00.000Z',
        }),
      ],
    })}\n`,
    'utf8',
  );

  const readModel = runCli([
    'runtime',
    'stage-transition-authority',
    'read-model',
    '--payload-file',
    payloadPath,
    '--json',
  ]).stage_transition_authority_read_model;

  assert.equal(readModel.surface_kind, 'opl_stage_transition_authority_read_model');
  assert.equal(
    readModel.event_log_policy,
    'append_only_events_folded_by_stage_run_generation_and_idempotency',
  );
  assert.equal(readModel.events.length, 2);
  assert.equal(readModel.stage_runs.length, 1);
  assert.equal(readModel.stage_runs[0].observed_generation, 3);
  assert.equal(
    readModel.stage_runs[0].accepted_transition_ref,
    'opl://stage-transition-authority/stage-run-transition-cli/g2/stage-run-transition-cli%3Ag2',
  );
  assert.equal(
    readModel.stage_runs[0].current_owner_delta.lineage_ref,
    readModel.stage_runs[0].accepted_transition_ref,
  );
  assert.equal(readModel.stage_runs[0].observation_intent_count, 1);
  assert.equal(readModel.authority_boundary.provider_completion_counts_as_stage_transition, false);
  assert.equal(readModel.authority_boundary.read_model_update_counts_as_stage_transition, false);
  assert.equal(readModel.authority_boundary.worklist_update_counts_as_stage_transition, false);
});

test('runtime Stage Transition Authority records local append-only event ledger and rebuilds read model', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-transition-authority-ledger-'));
  const env = {
    OPL_STATE_DIR: stateRoot,
  };
  try {
    const acceptedRecord = runCli([
      'runtime',
      'stage-transition-authority',
      'record',
      '--payload',
      JSON.stringify(transitionIntent({
        intent_id: 'intent-ledger-accepted-generation-2',
      })),
      '--json',
    ], env).stage_transition_authority_event_ledger_record;

    assert.equal(acceptedRecord.status, 'recorded');
    assert.equal(acceptedRecord.writes_performed, true);
    assert.equal(acceptedRecord.decision.status, 'transition_accepted');
    assert.equal(acceptedRecord.event.current_owner_delta.surface_kind, 'opl_current_owner_delta');
    assert.equal(acceptedRecord.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(acceptedRecord.authority_boundary.opl_can_create_owner_receipt, false);
    assert.equal(acceptedRecord.authority_boundary.opl_can_create_typed_blocker, false);

    const duplicateRecord = runCli([
      'runtime',
      'stage-transition-authority',
      'record',
      '--payload',
      JSON.stringify(transitionIntent({
        intent_id: 'intent-ledger-accepted-generation-2-duplicate',
      })),
      '--json',
    ], env).stage_transition_authority_event_ledger_record;

    assert.equal(duplicateRecord.status, 'deduped_existing_event');
    assert.equal(duplicateRecord.writes_performed, false);

    const observationRecord = runCli([
      'runtime',
      'stage-transition-authority',
      'record',
      '--payload',
      JSON.stringify(observationIntent({
        intent_id: 'intent-ledger-generation-3-provider-observation',
        generation: 3,
        idempotency_key: 'stage-run-transition-cli:g3:provider',
        stage_manifest_ref: 'opl://stage-manifests/stage-run-transition-cli:g3',
        current_pointer_ref: 'opl://stage-runs/stage-run-transition-cli/current:g3',
        provider_attempt_ref: 'temporal://attempt/stage-run-transition-cli:g3',
        attempt_lease_ref: 'opl://leases/stage-run-transition-cli:g3',
        execution_authorization_decision_ref:
          'opl://execution-authorizations/stage-run-transition-cli:g3',
        observed_at: '2026-06-15T00:02:00.000Z',
      })),
      '--json',
    ], env).stage_transition_authority_event_ledger_record;

    assert.equal(observationRecord.status, 'recorded');
    assert.equal(observationRecord.decision.status, 'observation_recorded');
    assert.equal(observationRecord.event.current_owner_delta, null);

    const ledger = runCli([
      'runtime',
      'stage-transition-authority',
      'list',
      '--json',
    ], env).stage_transition_authority_event_ledger;

    assert.equal(ledger.event_count, 2);
    assert.equal(ledger.raw_event_count, 2);
    assert.equal(ledger.strict_schema_rejected_event_count, 0);
    assert.equal(ledger.events[0].decision_status, 'transition_accepted');
    assert.equal(ledger.events[1].decision_status, 'observation_recorded');

    const readModel = runCli([
      'runtime',
      'stage-transition-authority',
      'read-model',
      '--from-ledger',
      '--json',
    ], env).stage_transition_authority_read_model;

    assert.equal(readModel.ledger_exists, true);
    assert.equal(readModel.raw_event_count, 2);
    assert.equal(readModel.events.length, 2);
    assert.equal(readModel.stage_runs.length, 1);
    assert.equal(readModel.stage_runs[0].observed_generation, 3);
    assert.equal(readModel.stage_runs[0].observation_intent_count, 1);
    assert.equal(
      readModel.stage_runs[0].current_owner_delta.lineage_ref,
      readModel.stage_runs[0].accepted_transition_ref,
    );
    assert.equal(
      readModel.authority_boundary.provider_completion_counts_as_stage_transition,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime Stage Transition Authority commands reject body payloads and non-object read-model payloads', () => {
  const rejectedIntent = runCliFailure([
    'runtime',
    'stage-transition-authority',
    'evaluate',
    '--payload',
    JSON.stringify(transitionIntent({ artifact_body: 'forbidden' })),
    '--json',
  ]);

  assert.equal(rejectedIntent.payload.error.code, 'contract_shape_invalid');
  assert.match(rejectedIntent.payload.error.message, /forbidden_body_payload/);

  const rejectedReadModel = runCliFailure([
    'runtime',
    'stage-transition-authority',
    'read-model',
    '--payload',
    JSON.stringify({ intent: transitionIntent() }),
    '--json',
  ]);

  assert.equal(rejectedReadModel.payload.error.code, 'cli_usage_error');
  assert.match(rejectedReadModel.payload.error.message, /payload must be a JSON array/);
});
