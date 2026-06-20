import {
  assert,
  currentControlCommandOutboxRecord,
  test,
} from '../family-runtime-current-control-provider-admission-cases/shared.ts';
import {
  appendDomainProgressTransitionRuntimeResult,
  createDomainProgressTransitionRuntimeLog,
  normalizeDomainProgressTransitionCommand,
  reconcileDomainProgressTransitionFixedPoint,
} from '../../../../../src/family-runtime-domain-progress-transition-runtime.ts';

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
