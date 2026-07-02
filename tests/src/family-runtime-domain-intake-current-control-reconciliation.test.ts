import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reconcileCurrentControlExecutableOwners,
  suppressStaleDefaultExecutorInputs,
} from '../../src/modules/runway/family-runtime-domain-intake-parts/current-control-reconciliation.ts';
import type { EnqueueInput } from '../../src/modules/runway/family-runtime-command.ts';

function defaultExecutorInput(payload: Record<string, unknown>): EnqueueInput {
  return {
    domainId: 'medautoscience',
    taskKind: 'domain_owner/default-executor-dispatch',
    payload: {
      study_id: 'DM002',
      action_type: 'return_to_ai_reviewer_workflow',
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      source_fingerprint: 'sha256:source',
      ...payload,
    },
    source: 'test',
  };
}

test('current-control reconciliation adopts executable owner from matching pending task', () => {
  const current = defaultExecutorInput({
    next_executable_owner: 'write',
    provider_admission_identity: {
      status: 'provider_admission_pending',
      next_executable_owner: 'write',
    },
  });
  const pending = defaultExecutorInput({
    domain_owner: 'ai_reviewer',
  });

  const result = reconcileCurrentControlExecutableOwners([current], [pending]);

  assert.equal(result.length, 1);
  assert.equal(result[0].payload.next_executable_owner, 'ai_reviewer');
  assert.equal(result[0].payload.domain_owner, 'ai_reviewer');
  assert.equal(result[0].payload.executable_owner_source, 'domain_handler_current_owner_action');
  assert.deepEqual(result[0].payload.provider_admission_identity, {
    status: 'provider_admission_pending',
    next_executable_owner: 'ai_reviewer',
    executable_owner_source: 'domain_handler_current_owner_action',
  });
});

test('current-control reconciliation requires same owner-action identity', () => {
  const current = defaultExecutorInput({
    next_executable_owner: 'write',
    provider_admission_identity: {
      status: 'provider_admission_pending',
      next_executable_owner: 'write',
    },
  });
  const pending = defaultExecutorInput({
    action_fingerprint: 'sha256:other-action',
    source_fingerprint: 'sha256:other-source',
    work_unit_fingerprint: 'sha256:other-work-unit',
    domain_owner: 'ai_reviewer',
  });

  const result = reconcileCurrentControlExecutableOwners([current], [pending]);

  assert.equal(result[0], current);
});

test('current-control suppression removes stale default-executor pending tasks for admitted studies', () => {
  const stalePending = defaultExecutorInput({ study_id: 'DM002' });
  const retainedDifferentStudy = defaultExecutorInput({ study_id: 'DM003' });
  const retainedDifferentKind: EnqueueInput = {
    domainId: 'medautoscience',
    taskKind: 'paper_autonomy/guarded-apply',
    payload: {
      study_id: 'DM002',
    },
    source: 'test',
  };
  const current = defaultExecutorInput({ study_id: 'DM002' });

  const result = suppressStaleDefaultExecutorInputs(
    [stalePending, retainedDifferentStudy, retainedDifferentKind],
    [current],
  );

  assert.equal(result.suppressed_count, 1);
  assert.deepEqual(result.inputs, [retainedDifferentStudy, retainedDifferentKind]);
});
