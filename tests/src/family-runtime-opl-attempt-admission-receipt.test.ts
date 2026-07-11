import assert from 'node:assert/strict';
import test from 'node:test';

import * as admissionReceipt from '../../src/modules/runway/family-runtime-opl-attempt-admission-receipt.ts';

test('owner-answer observation uses generic domain reasons', () => {
  const observe = (admissionReceipt as Record<string, unknown>)
    .domainOwnerAnswerObservationFromRecords;

  assert.equal(typeof observe, 'function');
  assert.deepEqual((observe as (records: Array<{ source: string; value: Record<string, unknown> }>) => unknown)([
    {
      source: 'domain_closeout',
      value: {
        status: 'typed_blocker',
        typed_blocker_ref: 'domain://typed-blockers/current',
      },
    },
  ]), {
    reason: 'domain_typed_blocker_observed',
    answer_kind: 'typed_blocker_ref',
    refs: ['domain://typed-blockers/current'],
    evidence_paths: ['domain_closeout.status'],
  });
});
