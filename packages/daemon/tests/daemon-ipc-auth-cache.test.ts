import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { isProcessAlive } from '@opl/core';
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
      'pack.build',
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

    // Idle Runway keeps running health projection while holding zero background polling timers
    assert.equal(srv.runtime.scheduleRunner.running, true);
    assert.equal(srv.runtime.scheduleRunner.hasActiveTimer, false);
    assert.equal(srv.runtime.runwayRuntime.leaseManager.hasActiveSweepTimer, false);

    const idleWs = srv.runtime.workspaceService.initWorkspace({
      root_path: sb.workspaceDir,
      name: 'Idle Schedule Check',
    });
    await appClient.call('runway.schedule.create', {
      schedule_id: 'sch-idle-check',
      workspace_id: idleWs.workspace_id,
      cron_expr: '* * * * *',
      timezone: 'UTC',
      next_run_at: '2099-01-01T00:00:00.000Z',
    });
    assert.equal(srv.runtime.scheduleRunner.hasActiveTimer, true);
    await appClient.call('runway.schedule.toggle', {
      schedule_id: 'sch-idle-check',
      enabled: false,
    });
    assert.equal(srv.runtime.scheduleRunner.hasActiveTimer, false);

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
    await assert.rejects(
      () => appClient.call('pack.migrateV1', {}),
      (err: Error & { code?: number }) => err.code === -32601,
    );
    assert.equal(mapErrorToCliExitCode(new RunwayError('TASK_PAUSED_BY_HUMAN', 'paused')), 4);
    assert.equal(mapErrorToCliExitCode(new RunwayError('INVALID_STAGE_STATE', 'bad state')), 2);

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

  it('exits 1 on foreground lock contention and exposes retired studio-owned transport_bindings compatibility projection', async () => {
    const sb = trackSandbox();
    const srv = await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    try {
      const appState = (await rpc.call('app.state.get', { profile: 'fast' })) as {
        app_state: {
          transport_bindings?: { surface_kind: string; status: string; bindings: unknown[] };
        };
      };
      assert.equal(appState.app_state.transport_bindings?.surface_kind, 'opl_app_transport_bindings_projection.v1');
      assert.equal(appState.app_state.transport_bindings?.status, 'unavailable');
      assert.deepEqual(appState.app_state.transport_bindings?.bindings, []);

      // A quiet long-running daemon still owns the lock.
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      fs.utimesSync(sb.lockPath, oneHourAgo, oneHourAgo);
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

      const health = (await rpc.call('daemon.health', {})) as { ok: boolean };
      assert.equal(health.ok, true);
      const sess = JSON.parse(fs.readFileSync(sb.sessionPath, 'utf8')) as { pid: number };
      assert.equal(sess.pid, process.pid);
    } finally {
      await rpc.close();
      await srv.shutdown();
    }
  });
});
