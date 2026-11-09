import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  findTemporalForegroundWorkerPids,
  stopOrphanTemporalForegroundWorkers,
  temporalForegroundWorkerCommand,
} from '../../src/adapters/execution/family-runtime-temporal-provider-parts/worker-process.ts';
import { resolveTemporalWorkerForegroundPathsFromArgv } from '../../src/adapters/execution/family-runtime-temporal-provider-parts/foreground-paths.ts';

const modulePath = '/fixture/family-runtime-temporal-provider.ts';

function fixtureWorker(root: string, marker = '--temporal-worker-foreground', module = modulePath, extraArgs: string[] = []) {
  return spawn(process.execPath, [
    '-e', 'setTimeout(() => {}, 30_000);', '--',
    marker, '--family-runtime-root', root, module, ...extraArgs,
  ], { detached: true, stdio: 'ignore' });
}

function removeFixtureWorker(pid: number | undefined) {
  if (pid === undefined) return;
  try { process.kill(pid, 'SIGKILL'); } catch { /* The owner already stopped the fixture. */ }
}

test('foreground entrypoint and discovery share pair, equals and conflicting root semantics', () => {
  const root = path.resolve('/tmp/worker root');
  for (const argv of [
    ['--family-runtime-root', root],
    [`--family-runtime-root=${root}`],
    ['--family-runtime-root', root, `--family-runtime-root=${root}`],
  ]) assert.deepEqual(resolveTemporalWorkerForegroundPathsFromArgv(argv), { root });
  for (const argv of [
    ['--family-runtime-root', root, '--family-runtime-root', `${root} backup`],
    ['--family-runtime-root'],
    ['--family-runtime-root='],
    ['--family-runtime-root', '--other-option'],
  ]) assert.throws(() => resolveTemporalWorkerForegroundPathsFromArgv(argv), /unambiguous/);
});

test('Linux worker discovery and stop preserve exact roots without ps or pgrep', {
  skip: process.platform !== 'linux',
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-linux-worker-native-'));
  const targetRoot = path.join(root, 'target root');
  const otherRoot = path.join(root, 'other root');
  const target = fixtureWorker(targetRoot);
  const other = fixtureWorker(otherRoot);
  const neighbor = fixtureWorker(`${targetRoot} backup`);
  const fakeMarker = fixtureWorker(targetRoot, 'note--temporal-worker-foreground');
  const fakeModule = fixtureWorker(otherRoot, '--temporal-worker-foreground', `${modulePath}.backup`);
  const conflictingRoot = fixtureWorker(otherRoot, '--temporal-worker-foreground', modulePath, ['--family-runtime-root', targetRoot]);
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = '/nonexistent-process-tools';
    assert.ok(temporalForegroundWorkerCommand(target.pid!)?.includes(targetRoot));
    const input = { modulePath, familyRuntimeRoot: targetRoot };
    assert.deepEqual(findTemporalForegroundWorkerPids(input), [target.pid]);
    assert.deepEqual(
      findTemporalForegroundWorkerPids({ modulePath }),
      [target.pid!, other.pid!, neighbor.pid!, conflictingRoot.pid!].sort((a, b) => a - b),
    );
    assert.deepEqual(findTemporalForegroundWorkerPids({ ...input, excludePids: [target.pid!] }), []);
    const stopped = await stopOrphanTemporalForegroundWorkers(input);
    assert.deepEqual(stopped.orphan_stopped_pids, [target.pid]);
    assert.throws(() => process.kill(target.pid!, 0));
    assert.doesNotThrow(() => process.kill(other.pid!, 0));
    assert.doesNotThrow(() => process.kill(neighbor.pid!, 0));
    assert.doesNotThrow(() => process.kill(fakeMarker.pid!, 0));
    assert.doesNotThrow(() => process.kill(fakeModule.pid!, 0));
    assert.doesNotThrow(() => process.kill(conflictingRoot.pid!, 0));
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    removeFixtureWorker(target.pid);
    removeFixtureWorker(other.pid);
    removeFixtureWorker(neighbor.pid);
    removeFixtureWorker(fakeMarker.pid);
    removeFixtureWorker(fakeModule.pid);
    removeFixtureWorker(conflictingRoot.pid);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux discovery distinguishes inaccessible unknown processes from lost candidate readback', {
  skip: process.platform !== 'linux',
}, (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-linux-worker-permission-'));
  const child = fixtureWorker(root);
  const originalRead = fs.readFileSync;
  const candidatePath = `/proc/${child.pid}/cmdline`;
  try {
    context.mock.method(fs, 'readdirSync', () => ['unknown', '0', '1', String(child.pid)]);
    const read = context.mock.method(fs, 'readFileSync', (...args: any[]) => {
      if (args[0] === '/proc/1/cmdline') throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      return Reflect.apply(originalRead, fs, args);
    });
    assert.deepEqual(findTemporalForegroundWorkerPids({ modulePath, familyRuntimeRoot: root }), [child.pid]);
    read.mock.restore();

    let candidateReads = 0;
    context.mock.method(fs, 'readFileSync', (...args: any[]) => {
      if (args[0] === '/proc/1/cmdline' || (args[0] === candidatePath && ++candidateReads > 1)) {
        throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      }
      return Reflect.apply(originalRead, fs, args);
    });
    assert.throws(
      () => findTemporalForegroundWorkerPids({ modulePath, familyRuntimeRoot: root }),
      /Unable to inspect Temporal foreground worker process/,
    );
    assert.doesNotThrow(() => process.kill(child.pid!, 0));
  } finally {
    context.mock.restoreAll();
    removeFixtureWorker(child.pid);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux discovery fails closed when procfs or candidate signal authority is unavailable', {
  skip: process.platform !== 'linux',
}, (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-linux-worker-unavailable-'));
  const child = fixtureWorker(root);
  const originalKill = process.kill;
  try {
    const listing = context.mock.method(fs, 'readdirSync', () => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });
    assert.throws(
      () => findTemporalForegroundWorkerPids({ modulePath, familyRuntimeRoot: root }),
      /Unable to discover Temporal foreground worker processes from \/proc/,
    );
    listing.mock.restore();
    context.mock.method(process, 'kill', (pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === child.pid) throw Object.assign(new Error('Operation not permitted'), { code: 'EPERM' });
      return originalKill(pid, signal);
    });
    assert.throws(
      () => findTemporalForegroundWorkerPids({ modulePath, familyRuntimeRoot: root }),
      /Unable to inspect Temporal foreground worker process/,
    );
  } finally {
    context.mock.restoreAll();
    removeFixtureWorker(child.pid);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
