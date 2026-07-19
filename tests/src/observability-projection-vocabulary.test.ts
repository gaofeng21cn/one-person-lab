import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OBSERVABILITY_EVIDENCE_LEDGER_FIELD,
  OBSERVABILITY_EVIDENCE_LEDGER_FILE,
  OBSERVABILITY_SOURCE_LEDGER_FIELD,
  OBSERVABILITY_SOURCE_LEDGER_FILE,
} from '../../src/kernel/observability-projection-vocabulary.ts';

test('observability projection vocabulary keeps generic evidence and source ledgers canonical', () => {
  assert.equal(OBSERVABILITY_EVIDENCE_LEDGER_FIELD, 'evidence_ledger');
  assert.equal(OBSERVABILITY_SOURCE_LEDGER_FIELD, 'source_ledger');
  assert.equal(OBSERVABILITY_EVIDENCE_LEDGER_FILE, '/evidence/evidence_ledger.json');
  assert.equal(OBSERVABILITY_SOURCE_LEDGER_FILE, '/source/source_ledger.json');
});
