import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { isProcessAlive } from '@opl/core';
import { connectTestRpc, createDaemonSandbox, type DaemonSandbox } from './helpers/sandbox.ts';

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

function countCodexExecInvocations(stubLogDir: string): number {
  const logPath = path.join(stubLogDir, 'codex.jsonl');
  if (!fs.existsSync(logPath)) return 0;
  return fs
    .readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { event?: string; subcommand?: string })
    .filter((entry) => entry.event === 'invocation' && entry.subcommand === 'exec').length;
}

describe('Wave 2 Gate 4: opld SIGKILL crash & cold-boot reconcile()', () => {
  it('harvests detached complete_after_detach artifacts + owner_receipt after kill -9 opld with zero blind replay', async () => {
    const sb = trackSandbox({
      OPL_STUB_CODEX_MODE: 'complete_after_detach',
      OPL_STUB_CODEX_DELAY_MS: '600',
      OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([
        { path: 'outputs/detached.md', content: '# Detached OK\n' },
      ]),
    });

    const daemon1 = await sb.spawnDaemonProcess();
    const rpc1 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc1.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Gate4 Detached WS',
    })) as { workspace_id: string };

    const created = (await rpc1.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'mas',
      title: 'Gate 4 Detach Harvest',
      goal_prompt: 'Survive opld SIGKILL and harvest detached Codex output',
      stages: [{ stage_id: 'build', executor_id: 'codex', model_id: 'gpt-5-codex' }],
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string }> };

    await rpc1.call('runway.stage.start', { task_id: created.task_id });

    let stubPid: number | null = null;
    for (let i = 0; i < 80; i++) {
      const bundle = (await rpc1.call('runway.task.get', { task_id: created.task_id })) as {
        attempts: Array<{ local_pid?: number | null; executor_session_ref?: string | null }>;
      };
      const att = bundle.attempts[0];
      if (att?.local_pid && att.executor_session_ref) {
        stubPid = att.local_pid;
        sb.trackPid(stubPid);
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.ok(stubPid && isProcessAlive(stubPid), 'stub-codex must be running and bound before SIGKILL');

    await rpc1.close();
    daemon1.kill('SIGKILL');
    await daemon1.waitForExit();

    // Wait for detached stub-codex to finish writing outputs/detached.md and session JSONL
    const waitDeadline = Date.now() + 5_000;
    while (Date.now() < waitDeadline && isProcessAlive(stubPid)) {
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(isProcessAlive(stubPid), false, 'detached stub-codex should complete naturally');
    assert.equal(fs.existsSync(path.join(sb.workspaceDir, 'outputs', 'detached.md')), true);

    // Boot opld #2 -> reconcile() runs before server.listen()
    await sb.spawnDaemonProcess();
    const rpc2 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const after = (await rpc2.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      stage_runs: Array<{ status: string }>;
      attempts: Array<{ status: string }>;
    };
    assert.equal(after.status, 'completed');
    assert.equal(after.stage_runs[0]?.status, 'completed');
    assert.equal(after.attempts[0]?.status, 'succeeded');

    const artifacts = (await rpc2.call('ledger.artifacts', { task_id: created.task_id })) as {
      artifacts: Array<{ payload: { path: string; sha256: string } }>;
    };
    assert.equal(
      artifacts.artifacts.some((a) => a.payload.path === 'outputs/detached.md'),
      true,
      'Detached workspace diff must be harvested into Ledger artifact_ref',
    );

    const receipts = (await rpc2.call('ledger.receipts', { task_id: created.task_id })) as {
      receipts: Array<{ payload: { status: string } }>;
    };
    assert.equal(
      receipts.receipts.some((r) => r.payload.status === 'completed_reconciled'),
      true,
    );

    const verified = (await rpc2.call('ledger.verify', { task_id: created.task_id })) as { ok: boolean };
    assert.equal(verified.ok, true);
    assert.equal(countCodexExecInvocations(sb.stubLogDir), 1, 'Zero blind replay allowed');

    await rpc2.close();
  });

  it('reattaches still_running child across opld restart and converges lost child to human_gate', async () => {
    const sb = trackSandbox({
      OPL_STUB_CODEX_MODE: 'hang',
    });

    const daemon1 = await sb.spawnDaemonProcess();
    const rpc1 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc1.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Gate4 Reattach WS',
    })) as { workspace_id: string };

    const created = (await rpc1.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'mas',
      title: 'Gate 4 Still Running & Lost',
      goal_prompt: 'Verify reattach and lost->human_gate without replay',
      stages: [{ stage_id: 'run', executor_id: 'codex', model_id: 'gpt-5-codex' }],
    })) as { task_id: string };

    await rpc1.call('runway.stage.start', { task_id: created.task_id });

    let stubPid: number | null = null;
    for (let i = 0; i < 80; i++) {
      const bundle = (await rpc1.call('runway.task.get', { task_id: created.task_id })) as {
        attempts: Array<{ local_pid?: number | null }>;
      };
      if (bundle.attempts[0]?.local_pid) {
        stubPid = bundle.attempts[0].local_pid;
        sb.trackPid(stubPid);
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.ok(stubPid && isProcessAlive(stubPid));

    await rpc1.close();
    daemon1.kill('SIGKILL');
    await daemon1.waitForExit();
    assert.equal(isProcessAlive(stubPid), true, 'Hanging child survives opld crash');

    // Restart opld #2 -> still_running reattached without spawning duplicate child
    const daemon2 = await sb.spawnDaemonProcess();
    const rpc2 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    const reattached = (await rpc2.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      stage_runs: Array<{ status: string }>;
      attempts: Array<{ status: string }>;
    };
    assert.equal(reattached.status, 'active');
    assert.equal(reattached.stage_runs[0]?.status, 'running');
    assert.equal(reattached.attempts[0]?.status, 'running');
    assert.equal(countCodexExecInvocations(sb.stubLogDir), 1);

    // Kill both opld #2 and stub child -> opld #3 converges to human_gate + typed_blocker
    await rpc2.close();
    daemon2.kill('SIGKILL');
    await daemon2.waitForExit();
    if (isProcessAlive(stubPid)) {
      process.kill(stubPid, 'SIGKILL');
      for (let i = 0; i < 50 && isProcessAlive(stubPid); i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    await sb.spawnDaemonProcess();
    const rpc3 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    const lostState = (await rpc3.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      stage_runs: Array<{ status: string }>;
      attempts: Array<{ status: string }>;
    };
    assert.equal(lostState.status, 'awaiting_human');
    assert.equal(lostState.stage_runs[0]?.status, 'human_gate');
    assert.equal(lostState.attempts[0]?.status, 'interrupted');

    const tl = (await rpc3.call('ledger.timeline', {
      task_id: created.task_id,
      entry_kind: 'typed_blocker',
    })) as { entries: Array<{ payload: { code: string } }> };
    assert.equal(tl.entries.length >= 1, true);
    assert.equal(countCodexExecInvocations(sb.stubLogDir), 1);

    await rpc3.close();
  });
});
