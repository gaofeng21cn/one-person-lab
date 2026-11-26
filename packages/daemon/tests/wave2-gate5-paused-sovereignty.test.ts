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

describe('Wave 2 Gate 5: paused_by_human sovereignty across pause interrupt, SIGKILL, and restart', () => {
  it('interrupts stubborn child (SIGTERM -> SIGKILL), preserves paused_by_human across kill -9 + restart, rejects start, exits 4 on CLI, and allows explicit resume', async () => {
    const sb = trackSandbox({
      OPL_STUB_CODEX_MODE: 'hang',
      OPL_STUB_IGNORE_SIGTERM: '1',
    });

    const daemon1 = await sb.spawnDaemonProcess();
    const rpc1 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc1.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Gate5 Paused WS',
    })) as { workspace_id: string };

    const created = (await rpc1.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'mas',
      title: 'Gate 5 Paused Sovereignty',
      goal_prompt: 'Hold paused_by_human across daemon crash and restart',
      stages: [{ stage_id: 's1', executor_id: 'codex', model_id: 'gpt-5-codex' }],
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
    assert.ok(stubPid && isProcessAlive(stubPid), 'stub-codex child must be running before pause');

    // Pause running task -> LeaseManager escalates SIGTERM -> SIGKILL
    const paused = (await rpc1.call('runway.task.pause', {
      task_id: created.task_id,
      reason: 'operator_weekend_pause',
    })) as { status: string; stage_runs: Array<{ status: string }> };
    assert.equal(paused.status, 'paused_by_human');
    assert.equal(paused.stage_runs[0]?.status, 'paused_by_human');
    assert.equal(isProcessAlive(stubPid), false, 'Stubborn child must be killed after pauseTask SIGTERM->SIGKILL');

    const tlBefore = (await rpc1.call('ledger.timeline', {
      task_id: created.task_id,
      entry_kind: 'human_decision',
    })) as { entries: Array<{ payload: { decision: string } }> };
    assert.equal(
      tlBefore.entries.some((e) => e.payload.decision === 'pause'),
      true,
    );

    // Force-kill opld #1 and restart opld #2
    await rpc1.close();
    daemon1.kill('SIGKILL');
    await daemon1.waitForExit();

    await sb.spawnDaemonProcess();
    const rpc2 = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const afterRestart = (await rpc2.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      stage_runs: Array<{ status: string }>;
    };
    assert.equal(afterRestart.status, 'paused_by_human');
    assert.equal(afterRestart.stage_runs[0]?.status, 'paused_by_human');

    // Starting stage while paused_by_human MUST reject with TASK_PAUSED_BY_HUMAN (-32009)
    await assert.rejects(
      () => rpc2.call('runway.stage.start', { task_id: created.task_id }),
      (err: Error & { code?: number }) => err.code === -32009 && /TASK_PAUSED_BY_HUMAN/i.test(err.message),
    );

    // CLI `opl runway status` MUST exit 4
    const statusCli = await sb.spawnCli(['runway', 'status', created.task_id, '--json']);
    assert.equal(statusCli.code, 4);
    assert.equal((statusCli.json as { status: string }).status, 'paused_by_human');

    // Verify no extra stub invocation occurred during restart/rejection
    const codexLogPath = path.join(sb.stubLogDir, 'codex.jsonl');
    const execCount = fs
      .readFileSync(codexLogPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { event?: string; subcommand?: string })
      .filter((e) => e.event === 'invocation' && e.subcommand === 'exec').length;
    assert.equal(execCount, 1);

    // Explicit resume restores active / queued and allows execution to finish
    const resumed = (await rpc2.call('runway.task.resume', {
      task_id: created.task_id,
      reason: 'operator_resume',
    })) as { status: string; stage_runs: Array<{ status: string }> };
    assert.equal(resumed.status, 'active');
    assert.equal(resumed.stage_runs[0]?.status, 'queued');

    // Reattached attempt converged immediately on pauseTask (no lingering 'running' attempt)
    const sb2 = trackSandbox({
      OPL_STUB_CODEX_MODE: 'hang',
      OPL_STUB_IGNORE_SIGTERM: '1',
    });
    const d1 = await sb2.spawnDaemonProcess();
    const r1 = await connectTestRpc(sb2.sessionPath, 'opl_app', '2.0');
    const ws2 = (await r1.call('workspace.init', {
      root_path: sb2.workspaceDir,
      name: 'Reattached Pause WS',
    })) as { workspace_id: string };
    const t2 = (await r1.call('runway.task.create', {
      workspace_id: ws2.workspace_id,
      agent_id: 'mas',
      title: 'Reattached Pause Convergence',
      goal_prompt: 'Verify pauseTask converges reattached running attempts immediately',
      stages: [{ stage_id: 's1', executor_id: 'codex', model_id: 'gpt-5-codex' }],
    })) as { task_id: string };
    await r1.call('runway.stage.start', { task_id: t2.task_id });

    let reattachPid: number | null = null;
    for (let i = 0; i < 80; i++) {
      const b = (await r1.call('runway.task.get', { task_id: t2.task_id })) as {
        attempts: Array<{ local_pid?: number | null }>;
      };
      if (b.attempts[0]?.local_pid) {
        reattachPid = b.attempts[0].local_pid;
        sb2.trackPid(reattachPid);
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.ok(reattachPid && isProcessAlive(reattachPid));
    await r1.close();
    d1.kill('SIGKILL');
    await d1.waitForExit();

    await sb2.spawnDaemonProcess();
    const r2 = await connectTestRpc(sb2.sessionPath, 'opl_app', '2.0');
    await r2.call('runway.task.pause', { task_id: t2.task_id, reason: 'pause_after_reattach' });
    const afterReattachPause = (await r2.call('runway.task.get', { task_id: t2.task_id })) as {
      status: string;
      attempts: Array<{ status: string; error_json?: string | null }>;
    };
    assert.equal(afterReattachPause.status, 'paused_by_human');
    assert.equal(afterReattachPause.attempts[0]?.status, 'interrupted');
    assert.equal(
      (JSON.parse(afterReattachPause.attempts[0]?.error_json ?? '{}') as { code?: string }).code,
      'paused_by_human_preserved',
    );
    assert.equal(isProcessAlive(reattachPid), false);

    await r2.close();
    await rpc2.close();
  });
});
