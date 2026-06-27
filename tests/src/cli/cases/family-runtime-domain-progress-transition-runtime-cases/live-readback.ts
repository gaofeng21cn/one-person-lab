import {
  assert,
  currentControlCommandOutboxRecord,
  fs,
  os,
  path,
  record,
  test,
} from '../family-runtime-current-control-provider-admission-cases/shared.ts';
import {
  appendDomainProgressTransitionRuntimeResultJsonl,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from '../../../../../src/family-runtime-domain-progress-transition-runtime.ts';
import {
  reconcileDomainProgressTransitionFixedPoint,
} from '../../../../../src/family-runtime-domain-progress-transition-runtime-parts/fixed-point-replay.ts';

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
    assert.equal(readback.projection_metadata.replay_audit_status, 'replay_ready');
    assert.equal(readback.projection_metadata.replay_audit_consumable, true);
    assert.equal(readback.replay_audit.replay_status, 'replay_ready');
    assert.equal(readback.replay_audit.read_model_projection_consumable, true);
    assert.equal(readback.replay_audit.exactly_one_complete_transaction, true);
    assert.equal(readback.replay_audit.exactly_one_outcome.outcome_kind, 'provider_admission_accepted');
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
    assert.equal(readback.projection_metadata.replay_audit_status, 'fail_closed');
    assert.equal(readback.projection_metadata.replay_audit_consumable, false);
    assert.equal(
      readback.projection_metadata.fail_closed_reason,
      'domain_progress_transition_readback_incomplete_transaction',
    );
    assert.equal(readback.replay_audit.replay_status, 'fail_closed');
    assert.equal(readback.replay_audit.read_model_projection_consumable, false);
    assert.equal(readback.replay_audit.exactly_one_complete_transaction, false);
    assert.equal(
      readback.replay_audit.fail_closed_reason,
      'domain_progress_transition_replay_stage_run_identity_mismatch',
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
    assert.equal(readback.projection_metadata.replay_audit_status, 'fail_closed');
    assert.equal(readback.projection_metadata.replay_audit_consumable, false);
    assert.equal(readback.replay_audit.replay_status, 'fail_closed');
    assert.equal(readback.replay_audit.read_model_projection_consumable, false);
    assert.equal(
      readback.replay_audit.fail_closed_reason,
      'domain_progress_transition_replay_outbox_identity_mismatch',
    );
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
    assert.equal(readback.projection_metadata.replay_audit_status, 'fail_closed');
    assert.equal(readback.projection_metadata.replay_audit_consumable, false);
    assert.equal(readback.replay_audit.replay_status, 'fail_closed');
    assert.equal(readback.replay_audit.read_model_projection_consumable, false);
    assert.equal(
      readback.replay_audit.fail_closed_reason,
      'domain_progress_transition_replay_outbox_entry_missing',
    );
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
