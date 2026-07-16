import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFoundryOperatorProjection } from '../../src/modules/console/foundry-operator-projection.ts';
import { buildFoundryEvent } from '../../src/modules/foundry/state-machine.ts';
import {
  foundryStoragePaths,
  LedgerFoundryEventStore,
} from '../../src/modules/ledger/foundry-persistent-adapters.ts';

const requestDigest = `sha256:${crypto.createHash('sha256').update('operator-projection-request').digest('hex')}`;

test('operator projection rebuilds a missing state index from the authoritative ledger', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-operator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const event = buildFoundryEvent({
    runId: 'run:operator-projection',
    revision: 1,
    eventType: 'foundry_run_accepted',
    fromState: null,
    toState: 'accepted',
    occurredAt: '2026-07-16T00:00:00.000Z',
    idempotencyKey: `run:operator-projection/0/accepted/${requestDigest}`,
    previousEventHash: null,
    payload: {
      target_agent_id: 'operator-projection-agent',
      target_domain_id: 'operator_projection_domain',
      request_digest: requestDigest,
      activation_revision_at_start: 0,
      generation: 0,
    },
  });
  await new LedgerFoundryEventStore(root).create({
    target_key: 'operator-projection-agent\0operator_projection_domain',
    event,
  });

  const paths = foundryStoragePaths(root);
  fs.rmSync(paths.state_index, { force: true });
  assert.equal(fs.existsSync(paths.state_index), false);

  const projection = await buildFoundryOperatorProjection({ storageRoot: root });
  assert.equal(projection.status, 'running');
  assert.equal(projection.summary.run_count, 1);
  assert.equal(projection.runs[0]?.run_id, 'run:operator-projection');
  assert.equal(fs.existsSync(paths.state_index), true);
});
