import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isProcessAlive } from '@opl/core';
import { stopDaemonGracefully } from '../src/cli/client.ts';
import { createDaemonSandbox } from './helpers/sandbox.ts';

test('stop reclaims the runtime files left by a crashed daemon and permits restart', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const first = await sb.spawnDaemonProcess();
  first.kill('SIGKILL');
  await first.waitForExit();
  assert.equal(isProcessAlive(first.pid), false);
  assert.ok(fs.existsSync(sb.lockPath));
  assert.ok(fs.existsSync(sb.sessionPath));
  assert.equal((await stopDaemonGracefully(sb.stateDir)).stopped, true);
  for (const file of [sb.lockPath, sb.sessionPath, sb.sockPath]) assert.equal(fs.existsSync(file), false);
  const second = await sb.spawnDaemonProcess();
  assert.notEqual(second.session.token, first.session.token);
});

test('a stale session cannot stop or unlink a replacement holding the daemon lock', async t => {
  const sb = createDaemonSandbox();
  t.after(() => sb.cleanup());
  const first = await sb.spawnDaemonProcess();
  first.kill('SIGKILL');
  await first.waitForExit();
  const next = await sb.spawnDaemonProcess();
  const activeSession = fs.readFileSync(sb.sessionPath);
  try {
    fs.writeFileSync(sb.sessionPath, JSON.stringify(first.session));
    assert.equal((await stopDaemonGracefully(sb.stateDir)).stopped, false);
    for (const command of ['stop', 'restart']) {
      const attempted = await sb.spawnCli(['daemon', command, '--json']);
      assert.notEqual(attempted.code, 0);
      assert.match(attempted.stdout, /DAEMON_STOP_INCOMPLETE/);
    }
    assert.equal(isProcessAlive(next.pid), true);
    assert.ok(fs.existsSync(sb.lockPath));
    assert.ok(fs.existsSync(sb.sockPath));
    assert.equal(JSON.parse(fs.readFileSync(sb.sessionPath, 'utf8')).pid, first.pid);
  } finally {
    fs.writeFileSync(sb.sessionPath, activeSession);
  }
});
