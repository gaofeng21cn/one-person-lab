import {
  assert,
  currentControlCommandOutboxRecord,
  fs,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  record,
  runCli,
  test,
  writeJsonEmitterScript,
} from './family-runtime-current-control-provider-admission-cases/shared.ts';
import {
  buildNonAdvancingApplyRuntimeResult,
  appendDomainProgressTransitionRuntimeResult,
  appendDomainProgressTransitionRuntimeResultJsonl,
  consumeDomainProgressHumanGateResumeToken,
  createDomainProgressTransitionRuntimeLog,
  currentDomainProgressTransitionAggregateVersion,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressHumanGateResumeToken,
  readDomainProgressTransitionIdempotency,
  readDomainProgressTransitionIdempotencyJsonl,
  readDomainProgressTransitionRuntimeReadbackJsonl,
  readDomainProgressTransitionRuntimeLogJsonl,
  rebuildDomainProgressTransitionReadModel,
  reconcileDomainProgressTransitionFixedPoint,
  replayDomainProgressTransitionTrace,
} from '../../../../src/family-runtime-domain-progress-transition-runtime.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('DomainProgressTransitionRuntime normalizes MAS command into exactly-one event, outbox, StageRun identity, and projection metadata', () => {
  const command = currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:transition-runtime',
    sourceGeneration: 'truth-event-transition-runtime',
    idempotencyKey: 'owner-route-attempt::dm003::transition-runtime',
  });
  const normalized = normalizeDomainProgressTransitionCommand(command, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:transition-runtime',
    nextOwner: 'ai_reviewer',
  });

  assert.equal(normalized.blocked, undefined);
  assert.equal(normalized.command?.surface_kind, 'opl_domain_progress_transition_command');
  assert.equal(normalized.command?.transition_kind, 'StartProviderAttempt');
  assert.equal((normalized.command?.stage_run_identity as Record<string, unknown>).stage_run_id, 'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:produce_ai_reviewer_publication_eval_record_against_current_inputs');

  const result = buildNonAdvancingApplyRuntimeResult({
    command: normalized.command!,
    reason: 'same_aggregate_no_postcondition_progress',
  });

  assert.equal(result.transition_event.transition_kind, 'NonAdvancingApply');
  assert.equal(result.transition_event.exactly_one_transition, true);
  assert.equal(result.transactional_outbox.committed_together, true);
  assert.equal(result.transactional_outbox.event_id, result.transition_event.event_id);
  assert.equal(result.transactional_outbox.outbox_item_id, result.transactional_outbox_item.outbox_item_id);
  assert.equal(result.idempotency_readback.same_transaction_event_and_outbox, true);
  assert.equal(result.read_model_rebuild_metadata.derived_from_event_id, result.transition_event.event_id);
  assert.equal(result.replay_evidence.non_advancing_apply, true);
  assert.equal(result.projection_metadata.authority, false);
  assert.equal(result.projection_metadata.derived_from_event_id, result.transition_event.event_id);
});

test('DomainProgressTransitionRuntime appends JSONL-friendly command/event/outbox log with aggregate version and idempotency readback', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:append-log',
    sourceGeneration: 'truth-event-append-log',
    idempotencyKey: 'owner-route-attempt::dm002::append-log',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:append-log',
    nextOwner: 'ai_reviewer',
  }).command!;

  const first = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const secondCommand = {
    ...command,
    idempotency_key: 'owner-route-attempt::dm002::append-log-repeat',
    command_id: 'dptc_repeat',
    expected_version: 'truth-event-append-log-repeat',
  };
  const second = appendDomainProgressTransitionRuntimeResult({
    log: first.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command: secondCommand,
      observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm002/blocked' }],
    }).result,
  });
  const readback = readDomainProgressTransitionIdempotency({
    log: second.log,
    idempotencyKey: 'owner-route-attempt::dm002::append-log',
  });

  assert.equal(first.appended_entry_count, 3);
  assert.equal(first.append_status, 'appended');
  assert.equal(second.current_aggregate_version, 2);
  assert.equal(second.read_model_readback.aggregate_version, 2);
  assert.ok(second.read_model_readback.latest_transition_identity);
  assert.equal(second.read_model_readback.latest_transition_identity.event_id, second.result.transition_event.event_id);
  assert.equal(currentDomainProgressTransitionAggregateVersion({
    log: second.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  }), 2);
  assert.equal(readback.found, true);
  assert.equal(readback.current_aggregate_version, 2);
  assert.equal(readback.same_transaction_event_and_outbox, true);
  assert.equal(second.log.storage_contract, 'jsonl_friendly_append_only');
});

test('DomainProgressTransitionRuntime enforces idempotent replay and fail-closes reused keys with different intent', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:idempotent-intent',
    sourceGeneration: 'truth-event-idempotent-intent',
    idempotencyKey: 'owner-route-attempt::dm002::idempotent-intent',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:idempotent-intent',
    nextOwner: 'ai_reviewer',
  }).command!;
  const initial = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const replayed = appendDomainProgressTransitionRuntimeResult({
    log: initial.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const differentIntent = appendDomainProgressTransitionRuntimeResult({
    log: initial.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command: {
        ...command,
        expected_version: 'truth-event-idempotent-intent-different',
      },
      observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm002/idempotent-intent' }],
    }).result,
  });

  assert.equal(initial.appended, true);
  assert.equal(replayed.appended, false);
  assert.equal(replayed.append_status, 'idempotent_replay');
  assert.equal(replayed.idempotent_replay, true);
  assert.equal(replayed.log.entries.length, initial.log.entries.length);
  assert.equal(replayed.result.transition_event.event_id, initial.result.transition_event.event_id);
  assert.equal(replayed.read_model_readback.aggregate_version, 1);
  assert.equal(differentIntent.appended, false);
  assert.equal(differentIntent.append_status, 'blocked');
  assert.ok(differentIntent.blocked);
  assert.equal(
    differentIntent.blocked.reason,
    'domain_progress_transition_idempotency_key_reused_for_different_intent',
  );
  assert.equal(differentIntent.log.entries.length, initial.log.entries.length);
});

test('DomainProgressTransitionRuntime result and read model expose stable identity causality authority and outcome readback', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:stable-readback-shape',
    sourceGeneration: 'truth-event-stable-readback-shape',
    idempotencyKey: 'owner-route-attempt::dm003::stable-readback-shape',
  }), {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:stable-readback-shape',
    nextOwner: 'ai_reviewer',
  }).command!;
  const appended = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const readModel = rebuildDomainProgressTransitionReadModel({
    log: appended.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  });

  assert.equal(appended.result.identity.runtime_id, 'opl_domain_progress_transition_runtime');
  assert.equal(appended.result.identity.idempotency_key, 'owner-route-attempt::dm003::stable-readback-shape');
  assert.equal(appended.result.identity.aggregate_identity.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
  assert.equal(appended.result.identity.stage_run_identity.route_identity_key, 'owner-route-attempt::dm003::stable-readback-shape');
  assert.equal(appended.result.causality.command_id, appended.result.command.command_id);
  assert.equal(appended.result.causality.event_id, appended.result.transition_event.event_id);
  assert.equal(appended.result.causality.outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.equal(appended.result.causality.same_transaction_event_and_outbox, true);
  assert.equal(appended.result.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(appended.result.authority_boundary.provider_completion_is_domain_completion, false);
  assert.equal(appended.result.exactly_one_outcome.selected, true);
  assert.equal(appended.result.exactly_one_outcome.transition_count, 1);
  assert.equal(appended.result.exactly_one_outcome.outcome_kind, 'provider_admission_accepted');
  assert.equal(appended.result.exactly_one_outcome.non_advancing_apply, false);
  assert.equal(appended.result.projection_metadata.authority, false);

  assert.equal(readModel.identity.runtime_id, 'opl_domain_progress_transition_runtime');
  assert.equal(readModel.identity.latest_event_id, appended.result.transition_event.event_id);
  assert.equal(readModel.identity.latest_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.equal(readModel.causality.derived_from_event_id, appended.result.transition_event.event_id);
  assert.equal(readModel.causality.same_transaction_event_and_outbox, true);
  assert.equal(readModel.authority_boundary.authority, false);
  assert.equal(readModel.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(readModel.exactly_one_outcome.outcome_kind, 'provider_admission_accepted');
  assert.equal(readModel.exactly_one_outcome.non_advancing_apply, false);
  assert.equal(readModel.projection_metadata.derived_from_event_id, appended.result.transition_event.event_id);
});

test('DomainProgressTransitionRuntime fail-closed incomplete transaction returns stable readback shape without appending', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:incomplete-transaction-readback',
    sourceGeneration: 'truth-event-incomplete-transaction-readback',
    idempotencyKey: 'owner-route-attempt::dm002::incomplete-transaction-readback',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:incomplete-transaction-readback',
    nextOwner: 'ai_reviewer',
  }).command!;
  const result = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'provider_admission_accepted' }],
  }).result;
  const incompleteLog = createDomainProgressTransitionRuntimeLog([
    result.command_event_log.entries[0],
  ]);
  const append = appendDomainProgressTransitionRuntimeResult({
    log: incompleteLog,
    result,
  });

  assert.equal(append.appended, false);
  assert.equal(append.append_status, 'blocked');
  assert.equal(append.blocked?.reason, 'domain_progress_transition_idempotency_incomplete_transaction');
  assert.equal(append.log.entries.length, 1);
  assert.equal(append.identity.idempotency_key, 'owner-route-attempt::dm002::incomplete-transaction-readback');
  assert.equal(append.causality.append_status, 'blocked');
  assert.equal(append.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(append.exactly_one_outcome.fail_closed, true);
  assert.equal(append.exactly_one_outcome.outcome_kind, 'blocked_incomplete_transaction');
  assert.equal(append.projection_metadata.authority, false);
  assert.equal(append.read_model_readback.projection_metadata.lag_status, 'empty');
  assert.equal(append.read_model_readback.authority_boundary.authority, false);
});

test('DomainProgressTransitionRuntime persists append-only JSONL log and replays idempotency readback from disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-progress-transition-jsonl-'));
  const logPath = path.join(root, 'domain-progress-transition.jsonl');
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:durable-jsonl',
    sourceGeneration: 'truth-event-durable-jsonl',
    idempotencyKey: 'owner-route-attempt::dm003::durable-jsonl',
  }), {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:durable-jsonl',
    nextOwner: 'ai_reviewer',
  }).command!;

  try {
    const first = appendDomainProgressTransitionRuntimeResultJsonl({
      logPath,
      result: reconcileDomainProgressTransitionFixedPoint({
        command,
        observations: [{ kind: 'provider_admission_accepted' }],
      }).result,
    });
    const second = appendDomainProgressTransitionRuntimeResultJsonl({
      logPath,
      result: reconcileDomainProgressTransitionFixedPoint({
        command: {
          ...command,
          idempotency_key: 'owner-route-attempt::dm003::durable-jsonl-repeat',
          command_id: 'dptc_dm003_durable_jsonl_repeat',
          expected_version: 'truth-event-durable-jsonl-repeat',
        },
        observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm003/durable-jsonl' }],
      }).result,
    });
    const replayed = readDomainProgressTransitionRuntimeLogJsonl(logPath);
    const readback = readDomainProgressTransitionIdempotencyJsonl({
      logPath,
      idempotencyKey: 'owner-route-attempt::dm003::durable-jsonl',
    });

    assert.equal(first.storage_contract, 'append_only_physical_jsonl');
    assert.equal(second.current_aggregate_version, 2);
    assert.equal(replayed.entries.length, 6);
    assert.equal(currentDomainProgressTransitionAggregateVersion({
      log: replayed,
      aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
    }), 2);
    assert.equal(readback.found, true);
    assert.equal(readback.current_aggregate_version, 2);
    assert.equal(readback.same_transaction_event_and_outbox, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DomainProgressTransitionRuntime live readback rebuilds complete physical transaction state from JSONL', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-progress-transition-live-readback-'));
  const logPath = path.join(root, 'domain-progress-transition.jsonl');
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:live-readback',
    sourceGeneration: 'truth-event-live-readback',
    idempotencyKey: 'owner-route-attempt::dm003::live-readback',
  }), {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:live-readback',
    nextOwner: 'ai_reviewer',
  }).command!;

  try {
    const append = appendDomainProgressTransitionRuntimeResultJsonl({
      logPath,
      result: reconcileDomainProgressTransitionFixedPoint({
        command,
        observations: [{ kind: 'provider_admission_accepted' }],
      }).result,
    });
    const readback = readDomainProgressTransitionRuntimeReadbackJsonl({
      logPath,
      aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
      idempotencyKey: 'owner-route-attempt::dm003::live-readback',
    });

    assert.equal(readback.surface_kind, 'opl_domain_progress_transition_runtime_live_readback');
    assert.equal(readback.runtime_readback_status, 'complete_transaction');
    assert.equal(readback.transaction_complete, true);
    assert.equal(readback.append_only_log_entry_count, 3);
    assert.equal(readback.identity.latest_event_id, append.result.transition_event.event_id);
    assert.equal(readback.identity.latest_outbox_item_id, append.result.transactional_outbox_item.outbox_item_id);
    assert.equal(readback.causality.same_transaction_event_and_outbox, true);
    assert.equal(readback.causality.transaction_complete, true);
    assert.equal(readback.authority_boundary.authority, false);
    assert.equal(readback.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(readback.exactly_one_outcome.outcome_kind, 'provider_admission_accepted');
    assert.equal(readback.exactly_one_outcome.fail_closed, false);
    assert.equal(readback.projection_metadata.authority, false);
    assert.equal(readback.projection_metadata.projection_role, 'complete_runtime_readback');
    assert.equal(readback.projection_metadata.read_model_projection_consumable, true);
    assert.equal(readback.projection_metadata.runtime_readback_status, 'complete_transaction');
    assert.equal(readback.projection_metadata.transaction_complete, true);
    assert.equal(readback.projection_metadata.derived_from_event_id, append.result.transition_event.event_id);
    assert.equal(readback.idempotency_readback?.found, true);
    assert.equal(readback.idempotency_readback?.same_transaction_event_and_outbox, true);
    assert.equal(readback.latest_transaction_readback.command_present, true);
    assert.equal(readback.latest_transaction_readback.event_present, true);
    assert.equal(readback.latest_transaction_readback.outbox_item_present, true);
    assert.equal(readback.latest_transaction_readback.same_transaction_event_and_outbox, true);
    assert.equal(readback.latest_transaction_readback.same_stage_run_identity, true);
    assert.equal(
      readback.latest_transaction_readback.stage_run_identity_readback.stage_run_id,
      'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:produce_ai_reviewer_publication_eval_record_against_current_inputs',
    );
    const latestTransactionIdentity = readback.read_model_readback.latest_transaction_identity;
    assert.ok(latestTransactionIdentity);
    const stageRunIdentityReadback = latestTransactionIdentity.stage_run_identity_readback;
    assert.ok(stageRunIdentityReadback);
    assert.equal(stageRunIdentityReadback.same_stage_run_identity, true);
    assert.equal(latestTransactionIdentity.transaction_complete, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DomainProgressTransitionRuntime live readback fail-closes StageRun identity mismatch inside a physical transaction', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-progress-transition-stage-run-mismatch-'));
  const logPath = path.join(root, 'domain-progress-transition.jsonl');
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:stage-run-identity-mismatch',
    sourceGeneration: 'truth-event-stage-run-identity-mismatch',
    idempotencyKey: 'owner-route-attempt::dm003::stage-run-identity-mismatch',
  }), {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:stage-run-identity-mismatch',
    nextOwner: 'ai_reviewer',
  }).command!;

  try {
    const result = reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(
      logPath,
      result.command_event_log.entries
        .map((entry) => {
          if (entry.entry_kind !== 'event') {
            return entry;
          }
          const payload = record(entry.payload);
          return {
            ...entry,
            payload: {
              ...payload,
              stage_run_identity: {
                ...record(payload.stage_run_identity),
                stage_run_id: 'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:stale-owner-route',
              },
            },
          };
        })
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n',
      'utf8',
    );
    const readback = readDomainProgressTransitionRuntimeReadbackJsonl({
      logPath,
      aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
      idempotencyKey: 'owner-route-attempt::dm003::stage-run-identity-mismatch',
    });

    assert.equal(readback.runtime_readback_status, 'incomplete_transaction');
    assert.equal(readback.transaction_complete, false);
    assert.equal(readback.causality.same_transaction_event_and_outbox, true);
    assert.equal(readback.causality.transaction_complete, false);
    assert.equal(readback.exactly_one_outcome.fail_closed, true);
    assert.equal(readback.exactly_one_outcome.outcome_kind, 'blocked_incomplete_transaction');
    assert.equal(readback.projection_metadata.projection_role, 'fail_closed_runtime_readback');
    assert.equal(readback.projection_metadata.read_model_projection_consumable, false);
    assert.equal(readback.projection_metadata.runtime_readback_status, 'incomplete_transaction');
    assert.equal(readback.projection_metadata.transaction_complete, false);
    assert.equal(readback.projection_metadata.outcome_kind, 'blocked_incomplete_transaction');
    assert.equal(
      readback.projection_metadata.fail_closed_reason,
      'domain_progress_transition_readback_incomplete_transaction',
    );
    assert.equal(
      record(readback.projection_metadata.source_read_model_projection_metadata).authority,
      false,
    );
    assert.equal(readback.latest_transaction_readback.same_transaction_event_and_outbox, true);
    assert.equal(readback.latest_transaction_readback.same_stage_run_identity, false);
    assert.equal(
      readback.latest_transaction_readback.stage_run_identity_readback.fail_closed_reason,
      'domain_progress_transition_readback_stage_run_identity_mismatch',
    );
    assert.equal(readback.read_model_readback.latest_stage_run_identity, null);
    const latestTransactionIdentity = readback.read_model_readback.latest_transaction_identity;
    assert.ok(latestTransactionIdentity);
    const stageRunIdentityReadback = latestTransactionIdentity.stage_run_identity_readback;
    assert.ok(stageRunIdentityReadback);
    assert.equal(stageRunIdentityReadback.same_stage_run_identity, false);
    assert.equal(latestTransactionIdentity.transaction_complete, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DomainProgressTransitionRuntime live readback fail-closes outbox identity mismatch inside a physical transaction', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-progress-transition-outbox-mismatch-'));
  const logPath = path.join(root, 'domain-progress-transition.jsonl');
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:outbox-identity-mismatch',
    sourceGeneration: 'truth-event-outbox-identity-mismatch',
    idempotencyKey: 'owner-route-attempt::dm002::outbox-identity-mismatch',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:outbox-identity-mismatch',
    nextOwner: 'ai_reviewer',
  }).command!;

  try {
    const result = reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(
      logPath,
      result.command_event_log.entries
        .map((entry) => entry.entry_kind === 'outbox_item'
          ? { ...entry, outbox_item_id: 'dpto_physical_outbox_identity_mismatch' }
          : entry)
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n',
      'utf8',
    );
    const readback = readDomainProgressTransitionRuntimeReadbackJsonl({
      logPath,
      aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
      idempotencyKey: 'owner-route-attempt::dm002::outbox-identity-mismatch',
    });

    assert.equal(readback.runtime_readback_status, 'incomplete_transaction');
    assert.equal(readback.transaction_complete, false);
    assert.equal(readback.causality.same_transaction_event_and_outbox, false);
    assert.equal(readback.projection_metadata.projection_role, 'fail_closed_runtime_readback');
    assert.equal(readback.projection_metadata.read_model_projection_consumable, false);
    assert.equal(readback.projection_metadata.runtime_readback_status, 'incomplete_transaction');
    assert.equal(readback.projection_metadata.transaction_complete, false);
    assert.equal(readback.projection_metadata.outcome_kind, 'blocked_incomplete_transaction');
    assert.equal(readback.latest_transaction_readback.same_transaction_event_and_outbox, false);
    assert.equal(readback.latest_transaction_readback.outbox_log_entry_item_id, 'dpto_physical_outbox_identity_mismatch');
    assert.equal(readback.latest_transaction_readback.outbox_payload_item_id, result.transactional_outbox_item.outbox_item_id);
    assert.equal(readback.latest_transaction_readback.outbox_item_id, result.transactional_outbox_item.outbox_item_id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DomainProgressTransitionRuntime live readback fail-closes incomplete physical transactions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-progress-transition-incomplete-readback-'));
  const logPath = path.join(root, 'domain-progress-transition.jsonl');
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:incomplete-live-readback',
    sourceGeneration: 'truth-event-incomplete-live-readback',
    idempotencyKey: 'owner-route-attempt::dm002::incomplete-live-readback',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:incomplete-live-readback',
    nextOwner: 'ai_reviewer',
  }).command!;

  try {
    const result = reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(
      logPath,
      result.command_event_log.entries
        .filter((entry) => entry.entry_kind !== 'outbox_item')
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n',
      'utf8',
    );
    const readback = readDomainProgressTransitionRuntimeReadbackJsonl({
      logPath,
      aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
      idempotencyKey: 'owner-route-attempt::dm002::incomplete-live-readback',
    });

    assert.equal(readback.runtime_readback_status, 'incomplete_transaction');
    assert.equal(readback.transaction_complete, false);
    assert.equal(readback.append_only_log_entry_count, 2);
    assert.equal(readback.causality.fail_closed_reason, 'domain_progress_transition_readback_incomplete_transaction');
    assert.equal(readback.exactly_one_outcome.fail_closed, true);
    assert.equal(readback.exactly_one_outcome.outcome_kind, 'blocked_incomplete_transaction');
    assert.equal(readback.authority_boundary.authority, false);
    assert.equal(readback.projection_metadata.authority, false);
    assert.equal(readback.projection_metadata.projection_role, 'fail_closed_runtime_readback');
    assert.equal(readback.projection_metadata.read_model_projection_consumable, false);
    assert.equal(readback.projection_metadata.runtime_readback_status, 'incomplete_transaction');
    assert.equal(readback.projection_metadata.transaction_complete, false);
    assert.equal(readback.projection_metadata.outcome_kind, 'blocked_incomplete_transaction');
    assert.equal(
      readback.projection_metadata.fail_closed_reason,
      'domain_progress_transition_readback_incomplete_transaction',
    );
    assert.equal(readback.idempotency_readback?.found, false);
    assert.equal(readback.latest_transaction_readback.command_present, true);
    assert.equal(readback.latest_transaction_readback.event_present, true);
    assert.equal(readback.latest_transaction_readback.outbox_item_present, false);
    assert.equal(readback.latest_transaction_readback.same_transaction_event_and_outbox, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DomainProgressTransitionRuntime rebuilds read model from append-only command/event/outbox log', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:read-model-rebuild',
    sourceGeneration: 'truth-event-read-model-rebuild-1',
    idempotencyKey: 'owner-route-attempt::dm002::read-model-rebuild-1',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:read-model-rebuild',
    nextOwner: 'ai_reviewer',
  }).command!;
  const first = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const secondCommand = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'RecordTypedBlocker',
    aggregate_identity: command.aggregate_identity,
    action_type: 'return_to_ai_reviewer_workflow',
    next_owner: 'ai_reviewer',
    idempotency_key: 'owner-route-attempt::dm002::read-model-rebuild-2',
    source_generation: 'truth-event-read-model-rebuild-2',
    expected_version: 'truth-event-read-model-rebuild-2',
    postcondition: {
      kind: 'typed_blocker_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
  }, {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:read-model-rebuild',
    nextOwner: 'ai_reviewer',
  }).command!;
  const second = appendDomainProgressTransitionRuntimeResult({
    log: first.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command: secondCommand,
      observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm002/read-model-rebuild' }],
    }).result,
  });
  const readModel = rebuildDomainProgressTransitionReadModel({
    log: second.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  });

  assert.equal(readModel.surface_kind, 'opl_domain_progress_transition_read_model');
  assert.equal(readModel.aggregate_version, 2);
  assert.ok(readModel.latest_transition_identity);
  assert.ok(readModel.latest_outbox_identity);
  assert.ok(readModel.latest_stage_run_identity);
  assert.ok(readModel.latest_transaction_identity);
  assert.equal(readModel.latest_transition_identity.event_id, second.result.transition_event.event_id);
  assert.equal(readModel.latest_transition_identity.transition_kind, 'RecordTypedBlocker');
  assert.equal(readModel.latest_outbox_identity.outbox_item_id, second.result.transactional_outbox_item.outbox_item_id);
  assert.equal(readModel.latest_stage_run_identity.stage_run_id, (secondCommand.stage_run_identity as Record<string, unknown>).stage_run_id);
  assert.equal(readModel.projection_metadata.authority, false);
  assert.equal(readModel.projection_metadata.derived_from_event_id, second.result.transition_event.event_id);
  assert.equal(readModel.projection_metadata.observed_generation, 'truth-event-read-model-rebuild-2');
  assert.equal(readModel.projection_metadata.lag_status, 'current');
  assert.equal(readModel.read_model_rebuild_metadata.derived_from_event_id, second.result.transition_event.event_id);
  assert.equal(readModel.latest_transaction_identity.same_transaction_event_and_outbox, true);
});

test('DomainProgressTransitionRuntime normalizes MAS policy request without accepting legacy supervisor apply alias', () => {
  const request = {
    surface_kind: 'mas_domain_progress_transition_request',
    target_runtime_kind: 'DomainProgressTransitionRuntime',
    target_runtime_owner: 'one-person-lab',
    request_owner: 'med-autoscience',
    authority_role: 'domain_policy_request_only',
    mas_can_create_opl_outbox_record: false,
    runtime_kind: 'DomainProgressTransitionRuntime',
    recommended_transition_kind: 'StartProviderAttempt',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::medical_prose_write_repair',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'medical_prose_write_repair',
      work_unit_fingerprint: 'publication-blockers::0915410f804b3697',
    },
    action_type: 'run_quality_repair_batch',
    next_owner: 'write',
    idempotency_key: 'paper-policy-request::dm003::write-repair',
    source_generation: 'truth-event-dm003-write-repair',
    expected_version: 'truth-event-dm003-write-repair',
    required_postcondition: {
      kind: 'provider_admission_enqueued_or_blocked',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
  };

  const normalized = normalizeDomainProgressTransitionCommand(request, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'run_quality_repair_batch',
    workUnitId: 'medical_prose_write_repair',
    workUnitFingerprint: 'publication-blockers::0915410f804b3697',
    nextOwner: 'write',
  });
  assert.equal(normalized.blocked, undefined);
  assert.equal(normalized.command?.surface_kind, 'opl_domain_progress_transition_command');
  assert.equal(normalized.command?.transition_kind, 'StartProviderAttempt');
  assert.equal((normalized.command?.postcondition as Record<string, unknown>).kind, 'provider_admission_enqueued_or_blocked');

  const forbidden = normalizeDomainProgressTransitionCommand({
    ...request,
    paper_autonomy_supervisor_apply: { legacy_alias: true },
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'run_quality_repair_batch',
    workUnitId: 'medical_prose_write_repair',
    workUnitFingerprint: 'publication-blockers::0915410f804b3697',
    nextOwner: 'write',
  });
  assert.equal(
    forbidden.blocked?.reason,
    'domain_progress_transition_legacy_supervisor_apply_alias_forbidden',
  );

  const runtimeArtifactPolluted = normalizeDomainProgressTransitionCommand({
    ...request,
    opl_domain_progress_transition_outbox_item: { surface_kind: 'opl_domain_progress_transition_outbox_item' },
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'run_quality_repair_batch',
    workUnitId: 'medical_prose_write_repair',
    workUnitFingerprint: 'publication-blockers::0915410f804b3697',
    nextOwner: 'write',
  });
  assert.equal(
    runtimeArtifactPolluted.blocked?.reason,
    'domain_progress_transition_request_runtime_field_forbidden',
  );
});

test('DomainProgressTransitionRuntime replay accepts stable steps and records NonAdvancingApply for no-outcome history', () => {
  const command = normalizeDomainProgressTransitionCommand(
    currentControlCommandOutboxRecord({
      studyId: '002-dm-china-us-mortality-attribution',
      actionType: 'return_to_ai_reviewer_workflow',
      workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      workUnitFingerprint: 'sha256:dm002-replay',
      sourceGeneration: 'truth-event-dm002-replay',
      idempotencyKey: 'owner-route-attempt::dm002::replay',
    }),
    {
      studyId: '002-dm-china-us-mortality-attribution',
      actionType: 'return_to_ai_reviewer_workflow',
      workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      workUnitFingerprint: 'sha256:dm002-replay',
      nextOwner: 'ai_reviewer',
    },
  ).command!;
  const replay = replayDomainProgressTransitionTrace({
    traceId: 'dm002-owner-receipt-recorded-no-progress',
    steps: [
      {
        command,
        observed_outcome: {
          kind: 'provider_admission_accepted',
          provider_completion_is_domain_completion: false,
        },
      },
      {
        command: {
          ...command,
          expected_version: 'truth-event-dm002-replay-repeat',
        },
        observed_outcome: null,
      },
    ],
  });

  assert.equal(replay.replay_status, 'accepted');
  assert.equal(replay.exactly_one_transition_per_step, true);
  assert.equal(replay.non_advancing_apply_count, 1);
  assert.equal(replay.replay_evidence.exactly_one_or_non_advancing_per_step, true);
  assert.equal(replay.replay_evidence.step_evidence[1].non_advancing_apply, true);
  assert.equal(replay.results[1].transition_event.transition_kind, 'NonAdvancingApply');
});

test('DomainProgressTransitionRuntime fixed-point helper chooses exactly one transition or NonAdvancingApply and exposes human gate token', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate',
      work_unit_fingerprint: 'sha256:human-gate',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate',
    source_generation: 'truth-event-human-gate',
    expected_version: 'truth-event-human-gate',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate',
    workUnitFingerprint: 'sha256:human-gate',
    nextOwner: 'human_operator',
  }).command!;
  const stable = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/operator' }],
  });
  const nonAdvancing = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'provider_admission_requested' }],
  });

  assert.equal(stable.exactly_one_transition, true);
  assert.equal(stable.result.transition_event.transition_kind, 'OpenHumanGate');
  const resumeToken = stable.result.human_gate_resume_token as Record<string, unknown>;
  assert.equal(resumeToken.owner, 'human_operator');
  assert.deepEqual(resumeToken.allowed_decisions, ['approve', 'route_back']);
  assert.equal(record(resumeToken.authority_boundary).opl_can_supply_human_answer, false);
  assert.equal(nonAdvancing.non_advancing_apply, true);
  assert.equal(nonAdvancing.result.transition_event.transition_kind, 'NonAdvancingApply');
});

test('DomainProgressTransitionRuntime stores, reads back, consumes, and idempotently replays human gate resume token', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate_resume',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate_resume',
      work_unit_fingerprint: 'sha256:human-gate-resume',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate-resume',
    source_generation: 'truth-event-human-gate-resume',
    expected_version: 'truth-event-human-gate-resume',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate_resume',
    workUnitFingerprint: 'sha256:human-gate-resume',
    nextOwner: 'human_operator',
  }).command!;
  const appended = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/resume' }],
    }).result,
  });
  const token = appended.result.human_gate_resume_token as Record<string, unknown>;
  const issuedReadback = readDomainProgressHumanGateResumeToken({
    log: appended.log,
    resumeToken: String(token.resume_token),
  });

  assert.equal(issuedReadback.found, true);
  assert.equal(issuedReadback.lifecycle_status, 'issued');
  assert.equal(issuedReadback.issued_event_id, appended.result.transition_event.event_id);
  assert.equal(issuedReadback.issued_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.ok(issuedReadback.stage_run_identity);
  assert.equal(issuedReadback.stage_run_identity.stage_run_id, (command.stage_run_identity as Record<string, unknown>).stage_run_id);

  const consumed = consumeDomainProgressHumanGateResumeToken({
    log: appended.log,
    resumeToken: String(token.resume_token),
    decision: 'approve',
    evidenceRef: 'owner-answer:dm003/human-gate-resume',
    consumedBy: 'human_operator',
  });
  assert.equal(consumed.consumption_status, 'consumed');
  assert.equal(consumed.appended, true);
  assert.equal(consumed.token_readback.lifecycle_status, 'consumed');
  assert.ok(consumed.consumption_event);
  assert.equal(consumed.token_readback.consumed_event_id, consumed.consumption_event.event_id);
  assert.equal(consumed.token_readback.consumed_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.ok(consumed.token_readback.stage_run_identity);
  assert.equal(consumed.token_readback.stage_run_identity.stage_run_id, (command.stage_run_identity as Record<string, unknown>).stage_run_id);

  const repeated = consumeDomainProgressHumanGateResumeToken({
    log: consumed.log,
    resumeToken: String(token.resume_token),
    decision: 'approve',
    evidenceRef: 'owner-answer:dm003/human-gate-resume',
    consumedBy: 'human_operator',
  });
  assert.equal(repeated.consumption_status, 'already_consumed');
  assert.equal(repeated.idempotent_replay, true);
  assert.equal(repeated.appended, false);
  assert.equal(repeated.log.entries.length, consumed.log.entries.length);

  const readModel = rebuildDomainProgressTransitionReadModel({
    log: consumed.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  });
  assert.ok(readModel.latest_human_gate_resume_token);
  assert.equal(readModel.latest_human_gate_resume_token.lifecycle_status, 'consumed');
  assert.equal(readModel.latest_human_gate_resume_token.consumed_event_id, consumed.consumption_event.event_id);
});

test('DomainProgressTransitionRuntime replay consumes human resume token and rebuilds read model', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate_replay_resume',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate_replay_resume',
      work_unit_fingerprint: 'sha256:human-gate-replay-resume',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate-replay-resume',
    source_generation: 'truth-event-human-gate-replay-resume',
    expected_version: 'truth-event-human-gate-replay-resume',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate_replay_resume',
    workUnitFingerprint: 'sha256:human-gate-replay-resume',
    nextOwner: 'human_operator',
  }).command!;
  const replay = replayDomainProgressTransitionTrace({
    traceId: 'dm003-human-gate-resume-token-consumed',
    steps: [
      {
        command,
        observed_outcome: { kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/replay-resume' },
        consume_human_gate_resume: {
          decision: 'approve',
          evidence_ref: 'owner-answer:dm003/human-gate-replay-resume',
          consumed_by: 'human_operator',
        },
      },
    ],
  });

  assert.equal(replay.replay_status, 'accepted');
  assert.equal(replay.replay_evidence.human_gate_resume_consumption_count, 1);
  assert.equal(replay.replay_evidence.step_evidence[0].human_gate_resume_token_consumed, true);
  assert.equal(replay.replay_evidence.step_evidence[0].read_model_rebuilt_after_human_gate_resume, true);
  assert.equal(replay.read_model_rebuilds[0].latest_human_gate_resume_token?.lifecycle_status, 'consumed');
  assert.equal(replay.read_model_rebuilds[0].projection_metadata.derived_from_event_id, replay.results[0].transition_event.event_id);
});

test('family-runtime intake exposes OPL transition event, outbox, and read-model metadata for provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-progress-transition-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-progress-transition-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:transition-runtime-readback',
        action_fingerprint: 'sha256:transition-runtime-readback',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        dispatch_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
        stage_packet_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        route_identity_key: 'owner-route::dm003::transition-runtime-readback',
        attempt_idempotency_key: 'owner-route-attempt::dm003::transition-runtime-readback',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
          studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:transition-runtime-readback',
          sourceGeneration: 'truth-event-transition-runtime-readback',
          idempotencyKey: 'owner-route-attempt::dm003::transition-runtime-readback',
        }),
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  try {
    runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const payload = queue.family_runtime_queue.tasks[0].payload;
    const logPath = path.join(
      workspaceRoot,
      'runtime',
      'artifacts',
      'supervision',
      'domain_progress_transition_runtime',
      'command_event_log.jsonl',
    );
    const logLineCount = () => fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/u).length;

    assert.equal(payload.domain_progress_transition_runtime.runtime_id, 'opl_domain_progress_transition_runtime');
    assert.equal(payload.domain_progress_transition_log_ref, 'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl');
    assert.equal(payload.domain_progress_transition_log_append.append_status, 'appended');
    assert.equal(payload.domain_progress_transition_log_append.appended_entry_count, 3);
    assert.equal(payload.domain_progress_transition_log_append.persisted, true);
    assert.equal(payload.provider_admission_identity.domain_progress_transition_log_ref, 'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl');
    assert.equal(payload.opl_transition_event.transition_kind, 'StartProviderAttempt');
    assert.equal(payload.opl_transition_event.exactly_one_transition, true);
    assert.equal(payload.opl_transition_outbox_item.outbox_kind, 'start_provider_attempt');
    assert.equal(payload.domain_progress_transition_runtime.transactional_outbox.committed_together, true);
    assert.equal(payload.domain_progress_transition_runtime.idempotency_readback.idempotency_key, 'owner-route-attempt::dm003::transition-runtime-readback');
    assert.equal(payload.domain_progress_transition_runtime.read_model_readback.aggregate_version, 1);
    assert.equal(
      payload.domain_progress_transition_runtime.read_model_readback.latest_transition_identity.event_id,
      payload.opl_transition_event.event_id,
    );
    assert.equal(payload.opl_transition_outbox_item.stage_run_identity.stage_run_id, 'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:produce_ai_reviewer_publication_eval_record_against_current_inputs');
    assert.equal(payload.projection_metadata.authority, false);
    assert.equal(payload.projection_metadata.observed_generation, 'truth-event-transition-runtime-readback');
    assert.equal(payload.read_model_rebuild_metadata.derived_from_event_id, payload.opl_transition_event.event_id);
    assert.equal(payload.transition_idempotency_readback.same_transaction_event_and_outbox, true);
    assert.equal(payload.domain_progress_transition_runtime.brand_module_allocation.not_a_new_brand_module, true);
    assert.equal(logLineCount(), 3);

    runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    assert.equal(logLineCount(), 3);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
