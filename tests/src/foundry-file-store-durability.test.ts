import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import {
  FileFoundryContentStore,
  LedgerFoundryEventStore,
  foundryStoragePaths,
} from '../../src/modules/ledger/foundry-persistent-adapters.ts';
import {
  buildFoundryEvent,
  verifyFoundryEventChain,
} from '../../src/modules/foundry/state-machine.ts';

const worker = path.resolve('tests/fixtures/foundry-crash-worker.ts');
const requestDigest = `sha256:${crypto.createHash('sha256').update('durability-request').digest('hex')}`;

function acceptanceEvent(
  runId: string,
  targetAgentId = 'durability-agent',
  targetDomainId = 'durability_domain',
) {
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

function designingEvent(runId: string, previousEventHash: string) {
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

function targetKey(agentId = 'durability-agent', domainId = 'durability_domain') {
  return `${agentId}\0${domainId}`;
}

function launchWorker(
  mode: string,
  root: string,
  runId = 'run:durability',
  targetAgentId = 'durability-agent',
  targetDomainId = 'durability_domain',
) {
  return spawn(process.execPath, [
    '--experimental-strip-types',
    worker,
    mode,
    root,
    runId,
    targetAgentId,
    targetDomainId,
  ], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForReady(child: ReturnType<typeof launchWorker>, label: string) {
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}: ${output}`)), 15_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (!output.includes(`READY:${label}`)) return;
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      resolve();
    };
    const onExit = () => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited before ${label}: ${output}`));
    };
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

async function killWorker(child: ReturnType<typeof launchWorker>) {
  child.kill('SIGKILL');
  await once(child, 'exit');
}

async function runWorker(
  mode: string,
  root: string,
  runId: string,
  targetAgentId = 'durability-agent',
  targetDomainId = 'durability_domain',
) {
  const child = launchWorker(mode, root, runId, targetAgentId, targetDomainId);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  const [code, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null];
  assert.equal(signal, null, stderr);
  assert.equal(code, 0, stderr);
  return stdout.trim();
}

test('Foundry event storage closes transition, target, metadata, and physical ordering identities', async (t) => {
  const accepted = acceptanceEvent('run:identity');
  const wrongTransition = buildFoundryEvent({
    runId: accepted.run_id,
    revision: 2,
    eventType: 'evolution_proposal_admitted',
    fromState: 'accepted',
    toState: 'designing',
    occurredAt: '2026-07-17T00:01:00.000Z',
    idempotencyKey: 'run:identity/wrong-transition',
    previousEventHash: accepted.event_hash,
  });
  assert.throws(
    () => verifyFoundryEventChain([accepted, wrongTransition]),
    /exact transition/,
  );

  const mismatchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-identity-target-'));
  t.after(() => fs.rmSync(mismatchRoot, { recursive: true, force: true }));
  await assert.rejects(
    new LedgerFoundryEventStore(mismatchRoot).create({
      target_key: targetKey('other-agent', 'other_domain'),
      event: accepted,
    }),
    /does not match the authoritative run target/,
  );

  const physicalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-identity-physical-'));
  t.after(() => fs.rmSync(physicalRoot, { recursive: true, force: true }));
  const physicalStore = new LedgerFoundryEventStore(physicalRoot);
  await physicalStore.create({ target_key: targetKey(), event: accepted });
  const eventsDirectory = path.join(physicalRoot, 'ledger', 'runs', accepted.run_id, 'events');
  fs.renameSync(
    path.join(eventsDirectory, '0000000001.json'),
    path.join(eventsDirectory, '0000000002.json'),
  );
  await assert.rejects(physicalStore.read(accepted.run_id), /physical address does not match/);

  const metadataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-identity-metadata-'));
  t.after(() => fs.rmSync(metadataRoot, { recursive: true, force: true }));
  const metadataStore = new LedgerFoundryEventStore(metadataRoot);
  await metadataStore.create({ target_key: targetKey(), event: accepted });
  const metadataFile = path.join(metadataRoot, 'ledger', 'runs', accepted.run_id, 'run.json');
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(metadataFile, canonicalJsonBytes({ ...metadata, target_key: targetKey('other-agent', 'other_domain') }));
  await assert.rejects(metadataStore.read(accepted.run_id), /does not match the authoritative run target/);

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-identity-symlink-'));
  t.after(() => fs.rmSync(symlinkRoot, { recursive: true, force: true }));
  const symlinkStore = new LedgerFoundryEventStore(symlinkRoot);
  await symlinkStore.create({ target_key: targetKey(), event: accepted });
  const eventFile = path.join(symlinkRoot, 'ledger', 'runs', accepted.run_id, 'events', '0000000001.json');
  const eventBytes = fs.readFileSync(eventFile);
  const outside = path.join(symlinkRoot, 'outside-event.json');
  fs.writeFileSync(outside, eventBytes);
  fs.rmSync(eventFile);
  fs.symlinkSync(outside, eventFile);
  await assert.rejects(symlinkStore.read(accepted.run_id), /forbidden entry/);
});

test('SIGKILL before immutable link leaves no visible partial content and dead staging is reclaimed', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-content-crash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const child = launchWorker('content-before-link', root);
  await waitForReady(child, 'content-before-link');
  const bytes = Buffer.from('durable shared content\n');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(fs.existsSync(path.join(root, 'content', `${digest}.blob`)), false);
  await killWorker(child);

  const stored = new FileFoundryContentStore(root).put(bytes);
  assert.equal(stored.digest, `sha256:${digest}`);
  assert.deepEqual(fs.readdirSync(foundryStoragePaths(root).staging), []);
});

test('SIGKILL after run publish converges exact create and reconstructs target reservation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-create-crash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runId = 'run:create-after-publish';
  const child = launchWorker('create-after-run-publish', root, runId);
  await waitForReady(child, 'create-after-run-publish');
  assert.equal(fs.existsSync(path.join(root, 'ledger', 'runs', runId, 'events', '0000000001.json')), true);
  await killWorker(child);

  const store = new LedgerFoundryEventStore(root);
  await store.create({ target_key: targetKey(), event: acceptanceEvent(runId) });
  assert.equal((await store.read(runId)).length, 1);
  assert.equal(fs.readdirSync(foundryStoragePaths(root).target_locks).length, 1);
  assert.deepEqual(fs.readdirSync(foundryStoragePaths(root).mutation_locks), []);
  assert.deepEqual(fs.readdirSync(foundryStoragePaths(root).staging), []);
});

test('SIGKILL after event publish and while holding mutation locks recovers by exact append replay', async (t) => {
  for (const mode of ['append-after-event-publish', 'append-after-run-lock'] as const) {
    await t.test(mode, async (st) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-foundry-${mode}-`));
      st.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const runId = `run:${mode}`;
      const store = new LedgerFoundryEventStore(root);
      const accepted = acceptanceEvent(runId);
      await store.create({ target_key: targetKey(), event: accepted });
      const child = launchWorker(mode, root, runId);
      await waitForReady(child, mode);
      await killWorker(child);

      const recoveredStore = new LedgerFoundryEventStore(root);
      const recovered = await recoveredStore.append({
        target_key: targetKey(),
        expected_revision: 1,
        event: designingEvent(runId, accepted.event_hash),
      });
      assert.equal(recovered.revision, 2);
      assert.equal((await recoveredStore.read(runId)).length, 2);
      assert.equal((await recoveredStore.list())[0]?.revision, 2);
      assert.deepEqual(fs.readdirSync(foundryStoragePaths(root).mutation_locks), []);
    });
  }
});

test('SQLite projection automatically rebuilds from authoritative ledgers and swap is SIGKILL atomic', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-index-rebuild-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new LedgerFoundryEventStore(root);
  await store.create({
    target_key: targetKey('durability-agent-one', 'durability_domain_one'),
    event: acceptanceEvent('run:index-one', 'durability-agent-one', 'durability_domain_one'),
  });
  await store.create({
    target_key: targetKey('durability-agent-two', 'durability_domain_two'),
    event: acceptanceEvent('run:index-two', 'durability-agent-two', 'durability_domain_two'),
  });
  assert.equal((await store.list()).length, 2);
  const paths = foundryStoragePaths(root);

  fs.rmSync(paths.state_index, { force: true });
  assert.equal((await new LedgerFoundryEventStore(root).list()).length, 2);
  assert.equal(fs.existsSync(paths.state_index), true);

  fs.writeFileSync(paths.state_index, 'not a sqlite database');
  assert.equal((await new LedgerFoundryEventStore(root).list()).length, 2);

  const child = launchWorker('rebuild-before-swap', root);
  await waitForReady(child, 'rebuild-before-swap');
  assert.equal((await new LedgerFoundryEventStore(root).list()).length, 2);
  await killWorker(child);
  assert.equal((await new LedgerFoundryEventStore(root).list()).length, 2);
  assert.deepEqual(fs.readdirSync(paths.staging), []);
  assert.deepEqual(fs.readdirSync(paths.mutation_locks), []);
});

test('cross-process target admission is single-writer while identical content publication converges', async (t) => {
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-process-target-'));
  const contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-process-content-'));
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(contentRoot, { recursive: true, force: true }));

  const createResults = await Promise.all([
    runWorker('create', runRoot, 'run:process-one'),
    runWorker('create', runRoot, 'run:process-two'),
  ]);
  assert.equal(createResults.filter((result) => result === 'RESULT:ok').length, 1);
  assert.equal(createResults.filter((result) => result.startsWith('RESULT:error:')).length, 1);
  assert.equal((await new LedgerFoundryEventStore(runRoot).list()).length, 1);

  const contentResults = await Promise.all([
    runWorker('content-put', contentRoot, 'unused-one'),
    runWorker('content-put', contentRoot, 'unused-two'),
  ]);
  assert.deepEqual(contentResults, ['RESULT:ok', 'RESULT:ok']);
  assert.equal(fs.readdirSync(foundryStoragePaths(contentRoot).content).length, 1);
});
