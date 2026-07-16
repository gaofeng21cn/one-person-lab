import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  FileFoundryContentStore,
  LedgerFoundryEventStore,
} from '../../src/modules/ledger/foundry-persistent-adapters.ts';
import { buildFoundryEvent } from '../../src/modules/foundry/state-machine.ts';

const [mode, root, runId = 'run:durability', targetAgentId = 'durability-agent', targetDomainId = 'durability_domain'] =
  process.argv.slice(2);

if (!mode || !root) throw new Error('foundry-crash-worker requires mode and root.');

const requestDigest = `sha256:${crypto.createHash('sha256').update('durability-request').digest('hex')}`;
const targetKey = `${targetAgentId}\0${targetDomainId}`;

function acceptanceEvent() {
  return buildFoundryEvent({
    runId,
    revision: 1,
    eventType: 'foundry_run_accepted',
    fromState: null,
    toState: 'accepted',
    occurredAt: '2026-07-17T00:00:00.000Z',
    idempotencyKey: `${runId}/0/accepted/${requestDigest}`,
    previousEventHash: null,
    payload: {
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      request_digest: requestDigest,
      activation_revision_at_start: 0,
      generation: 0,
    },
  });
}

function designingEvent(previousEventHash: string) {
  return buildFoundryEvent({
    runId,
    revision: 2,
    eventType: 'design_started',
    fromState: 'accepted',
    toState: 'designing',
    occurredAt: '2026-07-17T00:01:00.000Z',
    idempotencyKey: `${runId}/0/design/durability`,
    previousEventHash,
  });
}

function pause(label: string): never {
  fs.writeSync(1, `READY:${label}\n`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  throw new Error('unreachable');
}

function interceptLink(
  predicate: (destination: string) => boolean,
  timing: 'before' | 'after',
  label: string,
) {
  const descriptor = Object.getOwnPropertyDescriptor(fs, 'linkSync')!;
  const original = fs.linkSync;
  Object.defineProperty(fs, 'linkSync', {
    ...descriptor,
    value(source: fs.PathLike, destination: fs.PathLike) {
      const selected = predicate(path.resolve(String(destination)));
      if (selected && timing === 'before') pause(label);
      const result = original(source, destination);
      if (selected && timing === 'after') pause(label);
      return result;
    },
  });
}

function interceptRename(
  predicate: (destination: string) => boolean,
  timing: 'before' | 'after',
  label: string,
) {
  const descriptor = Object.getOwnPropertyDescriptor(fs, 'renameSync')!;
  const original = fs.renameSync;
  Object.defineProperty(fs, 'renameSync', {
    ...descriptor,
    value(source: fs.PathLike, destination: fs.PathLike) {
      const selected = predicate(path.resolve(String(destination)));
      if (selected && timing === 'before') pause(label);
      const result = original(source, destination);
      if (selected && timing === 'after') pause(label);
      return result;
    },
  });
}

async function main() {
  if (mode === 'content-before-link') {
    interceptLink((destination) => destination.includes(`${path.sep}content${path.sep}`), 'before', mode);
    new FileFoundryContentStore(root).put(Buffer.from('durable shared content\n'));
    return;
  }

  if (mode === 'create-after-run-publish') {
    interceptRename(
      (destination) => destination === path.resolve(root, 'ledger', 'runs', runId),
      'after',
      mode,
    );
    await new LedgerFoundryEventStore(root).create({ target_key: targetKey, event: acceptanceEvent() });
    return;
  }

  if (mode === 'append-after-event-publish' || mode === 'append-after-run-lock') {
    const store = new LedgerFoundryEventStore(root);
    const events = await store.read(runId);
    if (events.length !== 1) throw new Error('append crash worker requires one acceptance event.');
    if (mode === 'append-after-event-publish') {
      interceptLink(
        (destination) => destination.endsWith(`${path.sep}events${path.sep}0000000002.json`),
        'after',
        mode,
      );
    } else {
      interceptLink(
        (destination) => /^run-[a-f0-9]{64}\.lock$/.test(path.basename(destination)),
        'after',
        mode,
      );
    }
    await store.append({
      target_key: targetKey,
      expected_revision: 1,
      event: designingEvent(events[0]!.event_hash),
    });
    return;
  }

  if (mode === 'rebuild-before-swap') {
    interceptRename(
      (destination) => destination === path.resolve(root, 'state-index.sqlite'),
      'before',
      mode,
    );
    new LedgerFoundryEventStore(root).rebuildStateIndex();
    return;
  }

  if (mode === 'create') {
    await new LedgerFoundryEventStore(root).create({ target_key: targetKey, event: acceptanceEvent() });
    return;
  }

  if (mode === 'content-put') {
    new FileFoundryContentStore(root).put(Buffer.from('durable shared content\n'));
    return;
  }

  throw new Error(`Unknown foundry crash worker mode: ${mode}`);
}

try {
  await main();
  fs.writeSync(1, 'RESULT:ok\n');
} catch (error) {
  fs.writeSync(1, `RESULT:error:${error instanceof Error ? error.message : String(error)}\n`);
}
