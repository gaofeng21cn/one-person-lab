import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { isProcessAlive, openSqliteStore } from '@opl/core';
import { ChannelError, type ChannelThreadCallback, type ChannelTurnTerminalEvent } from '@opl/connect';
import { RunwayError } from '@opl/runway';
import { runDaemonForeground, startDaemonServer } from '../src/daemon.ts';
import { mapErrorToCliExitCode } from '../src/errors.ts';
import {
  TestRpcClient,
  connectTestRpc,
  createDaemonSandbox,
  writeMinimalV2Package,
  type DaemonSandbox,
} from './helpers/sandbox.ts';

const sandboxes: DaemonSandbox[] = [];

function trackSandbox(extraEnv: NodeJS.ProcessEnv = {}): DaemonSandbox {
  const sb = createDaemonSandbox(extraEnv);
  sandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (sandboxes.length > 0) {
    await sandboxes.pop()!.cleanup();
  }
});

describe('opld lifecycle, transport, auth, and AppStateCache', () => {
  it('enforces single-instance lock, 0600 socket/session, handshake security, malformed NDJSON, and EPIPE-safe broadcast', async () => {
    const sb = trackSandbox();
    const srv = await sb.startInProcess();

    assert.equal(fs.existsSync(sb.lockPath), true);
    assert.equal(fs.existsSync(sb.sockPath), true);
    assert.equal(fs.existsSync(sb.sessionPath), true);
    assert.equal(fs.statSync(sb.sockPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(sb.sessionPath).mode & 0o777, 0o600);
    assert.match(srv.session.token, /^[0-9a-f]{64}$/);

    // Lock contention rejects immediately
    await assert.rejects(() => startDaemonServer({ stateDir: sb.stateDir }), /LOCK_CONTENTION|lock/i);

    // Pre-handshake RPC rejected
    const unauthed = new TestRpcClient(sb.sessionPath);
    await unauthed.connect();
    await assert.rejects(
      () => unauthed.call('daemon.health', {}),
      (err: Error & { code?: number }) => err.code === -32001 && /HANDSHAKE_REQUIRED/i.test(err.message),
    );
    await unauthed.close();

    // Bad token rejected + socket destroyed
    const badTokenClient = new TestRpcClient(sb.sessionPath, '0'.repeat(64));
    await badTokenClient.connect();
    await assert.rejects(
      () => badTokenClient.handshake('opl_app', '2.0'),
      (err: Error & { code?: number }) => err.code === -32001 && /UNAUTHORIZED/i.test(err.message),
    );
    assert.equal(await badTokenClient.waitForClose(1500), true);

    // Major api_version mismatch returns base_upgrade_required
    const oldApiClient = new TestRpcClient(sb.sessionPath);
    await oldApiClient.connect();
    await assert.rejects(
      () => oldApiClient.handshake('opl_app', '1.0'),
      (err: Error & { code?: number }) => err.code === -32002 && /base_upgrade_required/i.test(err.message),
    );
    await oldApiClient.close();

    // Omitted api_version defaults cleanly to 2.0 (PoC / opl_client.py compatibility)
    const sdkClient = await connectTestRpc(sb.sessionPath, 'sdk_python');
    assert.equal(sdkClient.handshakeResult?.api_version, '2.0');

    // Untrusted host blocked on privileged RPCs
    for (const method of [
      'connect.approveRequest',
      'pack.install',
      'pack.update',
      'pack.updateAll',
      'pack.uninstall',
      'runway.humanGate.resolve',
    ]) {
      await assert.rejects(
        () => sdkClient.call(method, {}),
        (err: Error & { code?: number }) => err.code === -32003 && /TRUSTED_HOST_REQUIRED/i.test(err.message),
      );
    }

    // Malformed NDJSON emits -32700 without crashing opld
    const appClient = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    appClient.sendRaw('{malformed-json\n');
    const health = (await appClient.call('daemon.health', {})) as Record<string, unknown>;
    assert.equal(health.ok, true);

    // Doctor reports live SQLite PRAGMAs and repairs drifted 0644 -> 0600 permissions (Fix 2f)
    if (process.platform !== 'win32') {
      fs.chmodSync(sb.sockPath, 0o644);
      fs.chmodSync(sb.sessionPath, 0o644);
    }
    const doc = (await appClient.call('daemon.doctor', {})) as {
      pragmas: Record<string, unknown>;
      permissions: Array<{ path: string; repaired: boolean; current_mode?: string }>;
    };
    assert.equal(doc.pragmas.journal_mode, 'wal');
    assert.equal(doc.pragmas.foreign_keys, 1);
    assert.ok(Number(doc.pragmas.busy_timeout) >= 5000);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(sb.sockPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(sb.sessionPath).mode & 0o777, 0o600);
      assert.equal(doc.permissions.some((p) => p.path === sb.sockPath && p.repaired === true), true);
      assert.equal(doc.permissions.some((p) => p.path === sb.sessionPath && p.repaired === true), true);
    }

    // Verify WorkspaceError / RunwayError JSON-RPC mapping & exit code 4
    await assert.rejects(
      () => appClient.call('workspace.inspect', { workspace_id: 'ws_missing' }),
      (err: Error & { code?: number }) => err.code === -32004 && /WORKSPACE_NOT_FOUND/.test(err.message),
    );
    await assert.rejects(
      () => appClient.call('runway.task.get', { task_id: 'task_missing' }),
      (err: Error & { code?: number }) => err.code === -32004 && /TASK_NOT_FOUND/.test(err.message),
    );
    assert.equal(mapErrorToCliExitCode(new RunwayError('TASK_PAUSED_BY_HUMAN', 'paused')), 4);
    assert.equal(mapErrorToCliExitCode(new RunwayError('INVALID_STAGE_STATE', 'bad state')), 2);

    // Verify ChannelProviderHost fail-closed without workspace + real Runway/stub execution with workspace
    let channelCallback!: ChannelThreadCallback;
    await srv.runtime.channelHost.attach({
      provider_id: 'test-channel',
      start(input) {
        channelCallback = input.callback;
        return { dispose() {} };
      },
    });
    const thread = await channelCallback.startThread({
      provider_id: 'test-channel',
      account_id: 'acct-1',
      channel_session_id: 'sess-1',
    });

    // Fail-closed when no workspace is initialized
    await assert.rejects(
      () =>
        channelCallback.startTurn({
          ...thread,
          text: 'fail without workspace',
        }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_PROVIDER_UNAVAILABLE',
    );

    // Initialize workspace -> startTurn creates real Runway task & executes stub codex
    const ws = (await appClient.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Channel Turn WS',
    })) as { workspace_id: string };

    let terminalEvent: ChannelTurnTerminalEvent | null = null;
    const turn = await channelCallback.startTurn({
      ...thread,
      text: 'hello channel',
    });
    const sub = channelCallback.subscribeTurn(turn, {
      onTerminal(ev) {
        terminalEvent = ev;
      },
    });
    for (let i = 0; i < 100 && !terminalEvent; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await sub.dispose();

    assert.ok(terminalEvent, 'Channel turn must reach terminal event');
    const completedTerminal = terminalEvent as Extract<ChannelTurnTerminalEvent, { status: 'completed' }>;
    assert.equal(completedTerminal.status, 'completed');
    assert.ok(completedTerminal.response_text.trim().length > 0);
    assert.doesNotMatch(completedTerminal.response_text, /^Accepted channel turn/i);

    const chanProj = (await appClient.call('connect.channels.list', {})) as {
      transport_bindings: {
        status: string;
        bindings: Array<{ provider_id: string; canonical_thread_id: string }>;
      };
    };
    assert.equal(chanProj.transport_bindings.status, 'available');
    assert.equal(
      chanProj.transport_bindings.bindings.some(
        (b) => b.provider_id === 'test-channel' && b.canonical_thread_id === thread.canonical_thread_id,
      ),
      true,
    );

    const persistedBinding = srv.runtime.channelBindingStore.getBindingByThread(thread);
    assert.equal(persistedBinding?.workspace_id, ws.workspace_id);
    assert.ok(persistedBinding?.last_task_id);
    const channelTask = (await appClient.call('runway.task.get', {
      task_id: persistedBinding!.last_task_id!,
    })) as {
      status: string;
      stage_runs: Array<{ status: string }>;
      attempts: Array<{ status: string }>;
    };
    assert.equal(channelTask.status, 'completed');
    assert.equal(channelTask.stage_runs[0]?.status, 'completed');
    assert.equal(channelTask.attempts[0]?.status, 'succeeded');

    // EPIPE-safe broadcast when a subscribed socket drops abruptly before mutation
    const transient = await connectTestRpc(sb.sessionPath, 'opl_cli', '2.0');
    await transient.close();

    const pkgDir = writeMinimalV2Package(path.join(sb.workspaceDir, 'alpha-agent'), {
      id: 'alpha-agent',
      intent: 'agent',
    });
    await appClient.call('pack.link', { dir: pkgDir });
    const fastState = (await appClient.call('app.state.get', { profile: 'fast' })) as {
      packages: Array<{ package_id: string }>;
    };
    assert.equal(
      fastState.packages.some((p) => p.package_id === 'alpha-agent'),
      true,
    );

    // Verify graceful shutdown checkpoints WAL without killing detached child processes
    const sleeper = sb.trackChild(
      spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)'], {
        detached: true,
        stdio: 'ignore',
      }),
    );
    sleeper.unref();
    assert.equal(isProcessAlive(sleeper.pid!), true);

    await appClient.close();
    await sdkClient.close();
    await srv.shutdown();
    assert.equal(fs.existsSync(sb.sockPath), false);
    assert.equal(fs.existsSync(sb.lockPath), false);
    assert.equal(isProcessAlive(sleeper.pid!), true);
  });

  it('persists ChannelProviderHost bindings across opld restart, fails closed when no healthy executor exists, and exits 1 on foreground lock contention', async () => {
    // 1. Cross-restart ChannelProviderHost SQLite binding persistence
    const sb = trackSandbox();
    const srv1 = await sb.startInProcess();
    const rpc1 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    await rpc1.call('workspace.init', { root_path: sb.workspaceDir, name: 'Persist Chan WS' });

    let cb1!: ChannelThreadCallback;
    await srv1.runtime.channelHost.attach({
      provider_id: 'persist-chan',
      start(input) {
        cb1 = input.callback;
        return { dispose() {} };
      },
    });
    const identity = {
      provider_id: 'persist-chan',
      account_id: 'acct-restart',
      channel_session_id: 'sess-restart',
    };
    const thread1 = await cb1.startThread(identity);
    let done1: ChannelTurnTerminalEvent | null = null;
    const turn1 = await cb1.startTurn({ ...thread1, text: 'turn before restart' });
    const sub1 = cb1.subscribeTurn(turn1, {
      onTerminal(ev) {
        done1 = ev;
      },
    });
    for (let i = 0; i < 100 && !done1; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await sub1.dispose();
    assert.equal(done1?.status, 'completed');

    await rpc1.close();
    await srv1.shutdown();

    // Restart DaemonRuntime on the same stateDir
    const srv2 = await startDaemonServer({ stateDir: sb.stateDir });
    try {
      const rpc2 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
      // Before provider attach, store already has binding in SQLite while projection reports producer_absent
      assert.equal(
        srv2.runtime.channelBindingStore.listBindings().some((b) => b.canonical_thread_id === thread1.canonical_thread_id),
        true,
      );
      const preAttachList = (await rpc2.call('connect.channels.list', {})) as {
        transport_bindings: { status: string; unavailable_reason?: string };
      };
      assert.equal(preAttachList.transport_bindings.status, 'unavailable');
      assert.equal(preAttachList.transport_bindings.unavailable_reason, 'producer_absent');

      // Attach provider without calling startThread again -> connect.channels.list immediately projects persisted binding
      let cb2!: ChannelThreadCallback;
      await srv2.runtime.channelHost.attach({
        provider_id: 'persist-chan',
        start(input) {
          cb2 = input.callback;
          return { dispose() {} };
        },
      });
      const postAttachList = (await rpc2.call('connect.channels.list', {})) as {
        transport_bindings: {
          status: string;
          bindings: Array<{ provider_id: string; canonical_thread_id: string }>;
        };
      };
      assert.equal(postAttachList.transport_bindings.status, 'available');
      assert.equal(
        postAttachList.transport_bindings.bindings.some(
          (b) => b.provider_id === 'persist-chan' && b.canonical_thread_id === thread1.canonical_thread_id,
        ),
        true,
      );
      await cb2.resumeThread(thread1);
      await assert.rejects(
        () => cb2.resumeThread({ canonical_thread_host: 'opld', canonical_thread_id: 'thread_nonexistent' }),
        (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_IDENTITY_MISMATCH',
      );
      const threadAfterRestart = await cb2.startThread(identity);
      assert.deepEqual(threadAfterRestart, thread1);

      // Verify foreground lock contention returns exit 1 (both in-process and via CLI processes)
      const prevExitCode = process.exitCode;
      try {
        const fgCode = await runDaemonForeground({ stateDir: sb.stateDir });
        assert.equal(fgCode, 1);
      } finally {
        process.exitCode = prevExitCode;
      }

      const dupCli = await sb.spawnCli(['daemon', 'start', '--foreground']);
      assert.equal(dupCli.code, 1);
      assert.match(`${dupCli.stderr}\n${dupCli.stdout}`, /LOCK_CONTENTION:/);

      const dupRoot = await sb.spawnRootCli(['daemon', 'start', '--foreground']);
      assert.equal(dupRoot.code, 1);
      assert.match(`${dupRoot.stderr}\n${dupRoot.stdout}`, /LOCK_CONTENTION:/);

      const health = (await rpc2.call('daemon.health', {})) as { ok: boolean };
      assert.equal(health.ok, true);
      const sess = JSON.parse(fs.readFileSync(sb.sessionPath, 'utf8')) as { pid: number };
      assert.equal(sess.pid, process.pid);

      await rpc2.close();
    } finally {
      await srv2.shutdown();
    }

    // Verify SQLite row directly in opl.db
    const checkDb = openSqliteStore(sb.dbPath, { readOnly: true });
    try {
      const row = checkDb
        .prepare('SELECT canonical_thread_id, last_resumed_at, last_task_id FROM channel_thread_bindings WHERE provider_id = ?')
        .get('persist-chan') as { canonical_thread_id: string; last_resumed_at: string | null; last_task_id: string | null } | undefined;
      assert.equal(row?.canonical_thread_id, thread1.canonical_thread_id);
      assert.ok(row?.last_resumed_at);
      assert.ok(row?.last_task_id);
    } finally {
      checkDb.close();
    }
  });

  it('fails closed on channel startTurn when no healthy executor is available', async () => {
    const sbNoExec = trackSandbox({
      OPL_CODEX_BIN: '/nonexistent/missing-codex-bin',
      OPL_AGY_BIN: '/nonexistent/missing-agy-bin',
    });
    const srvNoExec = await sbNoExec.startInProcess();
    const rpcNoExec = await connectTestRpc(sbNoExec.sessionPath, 'opl_app', '2.0');
    await rpcNoExec.call('workspace.init', { root_path: sbNoExec.workspaceDir, name: 'NoExec WS' });
    let cbNoExec!: ChannelThreadCallback;
    await srvNoExec.runtime.channelHost.attach({
      provider_id: 'noexec-chan',
      start(input) {
        cbNoExec = input.callback;
        return { dispose() {} };
      },
    });
    const noExecThread = await cbNoExec.startThread({
      provider_id: 'noexec-chan',
      account_id: 'acct-1',
      channel_session_id: 'sess-1',
    });
    const health = await srvNoExec.runtime.executorRegistry.healthCheckAll();
    assert.equal(Object.values(health).some((h) => h.available), false);
    await assert.rejects(
      () => cbNoExec.startTurn({ ...noExecThread, text: 'should fail closed' }),
      (err: unknown) => err instanceof ChannelError && err.code === 'CHANNEL_PROVIDER_UNAVAILABLE',
    );
    await rpcNoExec.close();
  });

  it('isolates synchronous onTerminal throws across live and already-completed channel observers', async () => {
    const sb = trackSandbox({ OPL_STUB_CODEX_DELAY_MS: '60' });
    const srv = await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    await rpc.call('workspace.init', { root_path: sb.workspaceDir, name: 'Observer Isolation WS' });

    let cb!: ChannelThreadCallback;
    await srv.runtime.channelHost.attach({
      provider_id: 'obs-iso-chan',
      start(input) {
        cb = input.callback;
        return { dispose() {} };
      },
    });
    const thread = await cb.startThread({
      provider_id: 'obs-iso-chan',
      account_id: 'acct-obs',
      channel_session_id: 'sess-obs',
    });

    const uncaught: unknown[] = [];
    const unhandled: unknown[] = [];
    const onUncaught = (err: unknown) => uncaught.push(err);
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUnhandled);

    try {
      const turn = await cb.startTurn({ ...thread, text: 'observer throw isolation' });
      let liveHealthyEvent: ChannelTurnTerminalEvent | null = null;
      const liveBadSub = cb.subscribeTurn(turn, {
        onTerminal() {
          throw new Error('sync live observer throw');
        },
      });
      const liveGoodSub = cb.subscribeTurn(turn, {
        onTerminal(ev) {
          liveHealthyEvent = ev;
        },
      });

      for (let i = 0; i < 120 && !liveHealthyEvent; i++) {
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.equal(liveHealthyEvent?.status, 'completed');
      await liveBadSub.dispose();
      await liveGoodSub.dispose();

      // Already-completed subscribeTurn path
      let cachedHealthyEvent: ChannelTurnTerminalEvent | null = null;
      const cachedBadSub = cb.subscribeTurn(turn, {
        onTerminal() {
          throw new Error('sync cached observer throw');
        },
      });
      const cachedGoodSub = cb.subscribeTurn(turn, {
        onTerminal(ev) {
          cachedHealthyEvent = ev;
        },
      });

      for (let i = 0; i < 80 && !cachedHealthyEvent; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(cachedHealthyEvent?.status, 'completed');
      await cachedBadSub.dispose();
      await cachedGoodSub.dispose();

      // Allow a couple ticks for any deferred unhandledRejection / uncaughtException
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(uncaught.length, 0);
      assert.equal(unhandled.length, 0);

      // Verify auto-pruning without dispose() on both live completion & alreadyDone subscribeTurn
      const liveTurn = await cb.startTurn({ ...thread, text: 'auto prune live' });
      let liveDone: ChannelTurnTerminalEvent | null = null;
      const liveSubNoDispose = cb.subscribeTurn(liveTurn, {
        onTerminal(ev) {
          liveDone = ev;
        },
      });
      assert.equal(srv.runtime.getChannelTurnObserverCount(liveTurn.canonical_turn_id), 1);
      for (let i = 0; i < 120 && !liveDone; i++) {
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.equal(liveDone?.status, 'completed');
      assert.equal(srv.runtime.getChannelTurnObserverCount(liveTurn.canonical_turn_id), 0);
      // Calling dispose() later remains idempotent
      await liveSubNoDispose.dispose();
      assert.equal(srv.runtime.getChannelTurnObserverCount(liveTurn.canonical_turn_id), 0);

      // Already-completed without dispose() auto-prunes in setImmediate
      let cachedDoneNoDispose: ChannelTurnTerminalEvent | null = null;
      const cachedSubNoDispose = cb.subscribeTurn(liveTurn, {
        onTerminal(ev) {
          cachedDoneNoDispose = ev;
        },
      });
      for (let i = 0; i < 80 && !cachedDoneNoDispose; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(cachedDoneNoDispose?.status, 'completed');
      assert.equal(srv.runtime.getChannelTurnObserverCount(liveTurn.canonical_turn_id), 0);
      await cachedSubNoDispose.dispose();

      // Immediate dispose() before setImmediate cancels delivery and prunes cleanly
      let cancelledCalled = false;
      const cancelledSub = cb.subscribeTurn(liveTurn, {
        onTerminal() {
          cancelledCalled = true;
        },
      });
      await cancelledSub.dispose();
      assert.equal(srv.runtime.getChannelTurnObserverCount(liveTurn.canonical_turn_id), 0);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(cancelledCalled, false);
    } finally {
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onUnhandled);
      await rpc.close();
    }
  });
});
