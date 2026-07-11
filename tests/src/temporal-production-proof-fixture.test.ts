import assert from 'node:assert/strict';
import test from 'node:test';

import {
  temporalProductionProbeInput,
  temporalProductionTypedCloseoutPacket,
} from '../../src/modules/runway/family-runtime-temporal-provider-parts/production-proof.ts';

test('Temporal production proof uses a generic example-domain fixture', () => {
  const closeout = temporalProductionTypedCloseoutPacket();
  const input = temporalProductionProbeInput('test', closeout);
  const serialized = JSON.stringify(input);

  assert.equal(input.domain_id, 'example-domain');
  assert.equal(closeout.next_owner, 'example-domain');
  assert.deepEqual(closeout.consumed_memory_refs, ['memory:example-domain-production-residency']);
  assert.doesNotMatch(serialized, /medauto|publication/i);
});
