import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { connectTestRpc, createDaemonSandbox, writeMinimalV2Package, type DaemonSandbox } from './helpers/sandbox.ts';

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

describe('contributions, workspace.read capability gate, workspace/runway/ledger RPCs', () => {
  it('enforces workspace.read host capability, socket-derived session_id, and workspace root confinement', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();

    const appRpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    const extRpc = await connectTestRpc(sb.sessionPath, 'external', '2.0');
    const otherExtRpc = await connectTestRpc(sb.sessionPath, 'external', '2.0');

    const ws = (await appRpc.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Contrib WS',
    })) as { workspace_id: string };
    fs.mkdirSync(path.join(sb.workspaceDir, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(sb.workspaceDir, 'notes', 'pub.md'), 'Allowed Workspace Read\n', 'utf8');
    const outsideFile = path.join(sb.root, 'outside.txt');
    fs.writeFileSync(outsideFile, 'SECRET_OUTSIDE', 'utf8');
    fs.symlinkSync(outsideFile, path.join(sb.workspaceDir, 'notes', 'escape.txt'));

    const allowedPkg = writeMinimalV2Package(path.join(sb.root, 'app-allowed'), {
      id: 'app-allowed',
      intent: 'app',
      extraManifest: {
        provides: {
          mcp_servers: [{ id: 'srv', transport: 'stdio', command: 'node', args: ['-e', ''] }],
        },
        ui: {
          mcp_apps: [
            {
              id: 'wb',
              title: { 'zh-CN': 'WB', 'en-US': 'WB' },
              mcp_server_id: 'srv',
              resource_uri: 'ui://app-allowed/wb',
              host_capabilities: ['workspace_read'],
            },
          ],
        },
      },
    });
    const restrictedPkg = writeMinimalV2Package(path.join(sb.root, 'app-restricted'), {
      id: 'app-restricted',
      intent: 'app',
      extraManifest: {
        provides: {
          mcp_servers: [{ id: 'srv', transport: 'stdio', command: 'node', args: ['-e', ''] }],
        },
        ui: {
          mcp_apps: [
            {
              id: 'wb',
              title: { 'zh-CN': 'WB', 'en-US': 'WB' },
              mcp_server_id: 'srv',
              resource_uri: 'ui://app-restricted/wb',
              host_capabilities: ['theme_sync'],
            },
          ],
        },
      },
    });

    await appRpc.call('pack.link', { dir: allowedPkg });
    await appRpc.call('pack.link', { dir: restrictedPkg });

    const tokAllowed = (await appRpc.call('connect.issueConsumerBindToken', {
      consumer_package_id: 'app-allowed',
      session_id: extRpc.handshakeResult!.session_id,
    })) as { token: string };

    const tokRestricted = (await appRpc.call('connect.issueConsumerBindToken', {
      consumer_package_id: 'app-restricted',
      session_id: extRpc.handshakeResult!.session_id,
    })) as { token: string };

    // Valid read
    const readRes = (await extRpc.call('app.contribution.read', {
      package_id: 'app-allowed',
      ref: 'workspace.read',
      consumer_bind_token: tokAllowed.token,
      input: { workspace_id: ws.workspace_id, path: 'notes/pub.md' },
    })) as { content: string };
    assert.equal(readRes.content, 'Allowed Workspace Read\n');

    // Wrong socket session rejected even when session_id omitted
    await assert.rejects(
      () =>
        otherExtRpc.call('app.contribution.read', {
          package_id: 'app-allowed',
          ref: 'workspace.read',
          consumer_bind_token: tokAllowed.token,
          input: { workspace_id: ws.workspace_id, path: 'notes/pub.md' },
        }),
      (err: Error & { code?: number }) => err.code === -32001 && /SESSION_MISMATCH/i.test(err.message),
    );

    // Missing workspace_read capability rejected
    await assert.rejects(
      () =>
        extRpc.call('app.contribution.read', {
          package_id: 'app-restricted',
          ref: 'workspace.read',
          consumer_bind_token: tokRestricted.token,
          input: { workspace_id: ws.workspace_id, path: 'notes/pub.md' },
        }),
      (err: Error & { code?: number }) => err.code === -32003 && /WORKSPACE_READ_CAPABILITY_REQUIRED/i.test(err.message),
    );

    // Traversal and symlink escape rejected
    for (const badPath of ['../outside.txt', 'notes/escape.txt']) {
      await assert.rejects(
        () =>
          extRpc.call('app.contribution.read', {
            package_id: 'app-allowed',
            ref: 'workspace.read',
            consumer_bind_token: tokAllowed.token,
            input: { workspace_id: ws.workspace_id, path: badPath },
          }),
        (err: Error & { code?: number }) => err.code === -32003,
      );
    }

    // Dry-run execute preserves authorityBoundary
    const execRes = (await appRpc.call('app.action.execute', {
      actionId: 'agent_package_uninstall',
      dryRun: true,
      mode: 'preview',
      payload: { package_id: 'app-allowed' },
    })) as Record<string, unknown>;
    assert.equal(execRes.dryRun, true);
    assert.equal(execRes.authorityBoundary, 'app_bridge_no_domain_authority');

    await appRpc.close();
    await extRpc.close();
    await otherExtRpc.close();
  });

  it('previews and executes supported App Package actions through the Pack owner', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');
    const external = await connectTestRpc(sb.sessionPath, 'external', '2.0');
    try {
      const id = 'lifecycle-example';
      const dir = writeMinimalV2Package(path.join(sb.root, id), { id, intent: 'app' });
      await rpc.call('pack.link', { dir, sync_codex: false });
      const toggle = { action_id: 'agent_package_preferences_set', payload: { package_id: id, exposure_action: 'disable' } };
      const read = async () => ((await rpc.call('app.state.get', {})) as {
        packages: { package_id: string; enabled: boolean }[];
      }).packages.find(item => item.package_id === id);
      await rpc.call('app.action.execute', { ...toggle, mode: 'preview' });
      assert.equal((await read())?.enabled, true);
      await assert.rejects(external.call('app.action.execute', toggle), /TRUSTED_HOST_REQUIRED/);
      await assert.rejects(rpc.call('app.action.execute', { ...toggle, package_id: 'different' }), /INVALID_INPUT/);
      await rpc.call('app.action.execute', toggle);
      assert.equal((await read())?.enabled, false);
      await rpc.call('app.action.execute', { ...toggle, payload: { package_id: id, exposure_action: 'enable' } });
      assert.equal((await read())?.enabled, true);

      await assert.rejects(
        rpc.call('app.action.execute', { action_id: 'not_a_real_action', payload: { package_id: id } }),
        /ACTION_NOT_FOUND/,
      );
      const remove = { action_id: 'agent_package_uninstall', payload: { package_id: id } };
      await assert.rejects(rpc.call('app.action.execute', remove), /CONFIRMATION_REQUIRED/);
      assert.ok(await read());
      await rpc.call('app.action.execute', { ...remove, payload: { package_id: id, confirmed: true } });
      assert.equal(await read(), undefined);
      assert.ok(fs.existsSync(path.join(dir, 'opl-package.json')), 'uninstalling a development link preserves its source');
    } finally {
      await rpc.close();
      await external.close();
    }
  });

  it('handles workspace writeback revision conflicts, atomic runway humanGate REVISION_CONFLICT, and ledger verify', async () => {
    const sb = trackSandbox();
    const srv = await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Runway Ledger WS',
    })) as { workspace_id: string };

    const extDocs = path.join(sb.root, 'ext-docs');
    fs.mkdirSync(extDocs, { recursive: true });
    fs.writeFileSync(path.join(extDocs, 'guide.md'), '# Guide v1\n', 'utf8');

    const bound = (await rpc.call('workspace.sources.bind', {
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      adapter_kind: 'local_dir',
      root_path: extDocs,
    })) as { source_id: string; accepted_revision: string };

    const snap = (await rpc.call('workspace.snapshots.create', {
      workspace_id: ws.workspace_id,
      stage_run_id: 'sr-snap-1',
      source_id: bound.source_id,
    })) as { manifest: { file_count: number } };
    assert.equal(snap.manifest.file_count, 1);

    await rpc.call('workspace.writeback.commit', {
      source_id: bound.source_id,
      target_path: 'guide.md',
      content: '# Guide v2\n',
      accepted_revision: bound.accepted_revision,
    });

    await assert.rejects(
      () =>
        rpc.call('workspace.writeback.commit', {
          source_id: bound.source_id,
          target_path: 'guide.md',
          content: '# Guide STALE\n',
          accepted_revision: bound.accepted_revision,
        }),
      (err: Error & { code?: number }) => err.code === -32009 && /REVISION_CONFLICT/i.test(err.message),
    );
    assert.equal(fs.readFileSync(path.join(extDocs, 'guide.md'), 'utf8'), '# Guide v2\n');

    // Runway task + atomic humanGate resolve conflict
    const created = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'mas',
      title: 'Atomic Gate Task',
      goal_prompt: 'Test revision lock',
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string; revision: number }> };
    const sr = created.stage_runs[0]!;

    // Transition stage into 'human_gate' before resolving the human gate
    const gated = srv.runtime.runwayStore.commitStageTransitionAtomic({
      stage_run_id: sr.stage_run_id,
      expected_revision: sr.revision,
      next_stage_status: 'human_gate',
      human_gate_json: JSON.stringify({ question: 'Proceed?' }),
      task_status: 'awaiting_human',
      ledger_entries: [],
    });

    rpc.drainEvents();
    const workbench = srv.runtime.appStateCache.getState().app_state.operator.workbench.work_item_projection_v2;
    const action = workbench.items.find(item => item.identity.work_item_id === created.task_id)!.action;
    assert.equal(action.action_ref, 'app_state.actions#runway_human_gate_resolve');
    assert.deepEqual(action.action_payload, { stage_run_id: sr.stage_run_id, expected_revision: gated.stage_run.revision });
    await rpc.call('app.action.execute', {
      action_id: action.action_ref.split('#')[1],
      payload: { ...action.action_payload, decision: 'approve' },
    });
    rpc.drainEvents('event.ledger.appended');

    await assert.rejects(
      () =>
        rpc.call('runway.stage.decide', {
          stage_run_id: sr.stage_run_id,
          decision: 'reject',
          expected_revision: gated.stage_run.revision,
        }),
      (err: Error & { code?: number }) => err.code === -32009 && /REVISION_CONFLICT/i.test(err.message),
    );
    assert.equal(rpc.drainEvents('event.ledger.appended').length, 0);

    // Ledger append + verify + disallow update/delete
    const artifactPath = path.join(sb.workspaceDir, 'out.md');
    fs.writeFileSync(artifactPath, 'verified output\n', 'utf8');
    const sha = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex')}`;
    await rpc.call('ledger.append', {
      task_id: created.task_id,
      entry_kind: 'artifact_ref',
      owner_id: 'mas',
      payload: { path: 'out.md', sha256: sha },
    });

    const verifiedOk = (await rpc.call('ledger.verify', { task_id: created.task_id })) as { ok: boolean };
    assert.equal(verifiedOk.ok, true);

    fs.appendFileSync(artifactPath, 'tampered\n', 'utf8');
    const verifiedFail = (await rpc.call('ledger.verify', { task_id: created.task_id })) as {
      ok: boolean;
      artifact_hash_mismatches: Array<{ reason: string }>;
    };
    assert.equal(verifiedFail.ok, false);
    assert.equal(verifiedFail.artifact_hash_mismatches[0]?.reason, 'hash_mismatch');

    await assert.rejects(
      () => rpc.call('ledger.update', { entry_id: 'x' }),
      (err: Error & { code?: number }) => err.code === -32601,
    );

    // Verify resolveHumanGate auto-resume gating:
    // 1) attempts.length === 0 (seeded synthetic gate above): stage stays 'queued' at revision=3
    const zeroAttTask = (await rpc.call('runway.task.get', { task_id: created.task_id })) as {
      stage_runs: Array<{ status: string; revision: number }>;
    };
    assert.equal(zeroAttTask.stage_runs[0]?.status, 'queued');
    assert.equal(zeroAttTask.stage_runs[0]?.revision, gated.stage_run.revision + 1);

    // 2) attempts.length > 0: resolving human gate automatically resumes & executes stage
    const taskWithAttempt = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'mas',
      title: 'Auto-resume Gate Task',
      goal_prompt: 'Auto-resume when attempts > 0',
      stages: [{ stage_id: 's1', executor_id: 'codex', model_id: 'gpt-5-codex' }],
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string; revision: number }> };
    const srWithAtt = taskWithAttempt.stage_runs[0]!;
    const attCreated = srv.runtime.runwayStore.createAttempt({
      stage_run_id: srWithAtt.stage_run_id,
      expected_stage_revision: srWithAtt.revision,
      role: 'producer',
      executor_id: 'codex',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const gatedWithAtt = srv.runtime.runwayStore.commitStageTransitionAtomic({
      stage_run_id: srWithAtt.stage_run_id,
      expected_revision: attCreated.stage_run.revision,
      next_stage_status: 'human_gate',
      human_gate_json: JSON.stringify({ question: 'Resume?' }),
      task_status: 'awaiting_human',
      attempt_update: { attempt_id: attCreated.attempt.attempt_id, status: 'interrupted' },
      ledger_entries: [],
    });
    await rpc.call('runway.humanGate.resolve', {
      stage_run_id: srWithAtt.stage_run_id,
      decision: 'approve',
      expected_revision: gatedWithAtt.stage_run.revision,
    });
    let completedAfterResolve = false;
    for (let i = 0; i < 80; i++) {
      const check = (await rpc.call('runway.task.get', { task_id: taskWithAttempt.task_id })) as {
        status: string;
        stage_runs: Array<{ status: string }>;
      };
      if (check.status === 'completed' && check.stage_runs[0]?.status === 'completed') {
        completedAfterResolve = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(completedAfterResolve, true, 'Stage with prior attempt must auto-resume after resolveHumanGate');

    // 3) 2-stage (producer -> reviewer) task: resolving human_gate on stage 1 auto-advances and completes stage 2 with stage roleMap
    const multiAgentDir = writeMinimalV2Package(path.join(sb.root, 'multi-gate-agent'), {
      id: 'multi-gate-agent',
      intent: 'agent',
      extraManifest: {
        provides: {
          skills: [{ id: 'multi-gate-agent', path: './skills/multi-gate-agent', exposure: 'default' }],
          agent: {
            stages_ref: './stages.json',
          },
        },
      },
    });
    fs.writeFileSync(
      path.join(multiAgentDir, 'stages.json'),
      JSON.stringify([
        { stage_id: 'plan', executor: 'codex', role: 'producer' },
        { stage_id: 'review', executor: 'codex', role: 'reviewer' },
      ]),
      'utf8',
    );
    await rpc.call('pack.link', { dir: multiAgentDir });

    const twoStageTask = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'multi-gate-agent',
      title: 'Two-stage Gate Advance Task',
      goal_prompt: 'Auto-advance stage 1 -> stage 2 after humanGate.resolve',
      stages: [
        { stage_id: 'plan', executor_id: 'codex', model_id: 'gpt-5-codex' },
        { stage_id: 'review', executor_id: 'codex', model_id: 'gpt-5-codex' },
      ],
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string; revision: number; stage_id: string }> };
    const sr1 = twoStageTask.stage_runs[0]!;
    const sr2 = twoStageTask.stage_runs[1]!;
    const att1 = srv.runtime.runwayStore.createAttempt({
      stage_run_id: sr1.stage_run_id,
      expected_stage_revision: sr1.revision,
      role: 'producer',
      executor_id: 'codex',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const gatedStage1 = srv.runtime.runwayStore.commitStageTransitionAtomic({
      stage_run_id: sr1.stage_run_id,
      expected_revision: att1.stage_run.revision,
      next_stage_status: 'human_gate',
      human_gate_json: JSON.stringify({ question: 'Continue multi-stage?' }),
      task_status: 'awaiting_human',
      attempt_update: { attempt_id: att1.attempt.attempt_id, status: 'interrupted' },
      ledger_entries: [],
    });

    await rpc.call('runway.humanGate.resolve', {
      stage_run_id: sr1.stage_run_id,
      decision: 'approve',
      expected_revision: gatedStage1.stage_run.revision,
    });

    let twoStageCompleted: {
      status: string;
      stage_runs: Array<{ stage_run_id: string; status: string }>;
      attempts: Array<{ stage_run_id: string; role: string; status: string }>;
    } | null = null;
    for (let i = 0; i < 120; i++) {
      const check = (await rpc.call('runway.task.get', { task_id: twoStageTask.task_id })) as {
        status: string;
        stage_runs: Array<{ stage_run_id: string; status: string }>;
        attempts: Array<{ stage_run_id: string; role: string; status: string }>;
      };
      if (
        check.status === 'completed'
        && check.stage_runs[0]?.status === 'completed'
        && check.stage_runs[1]?.status === 'completed'
      ) {
        twoStageCompleted = check;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.ok(twoStageCompleted, 'Both stages must complete after resolving human gate on stage 1');
    assert.equal(
      twoStageCompleted.attempts.some((a) => a.stage_run_id === sr2.stage_run_id && a.role === 'reviewer' && a.status === 'succeeded'),
      true,
      'Stage 2 must run with reviewer role resolved from agent stages.json',
    );

    // Verify dynamic runway.stage.start (placeholder stage_1 replacement + dynamic stage + resume_session_ref)
    const dynTask = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      title: 'Dynamic stage task',
      goal_prompt: 'Dynamic stage checks',
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string; stage_id: string }> };
    assert.equal(dynTask.stage_runs[0]?.stage_id, 'stage_1');

    const startedDyn1 = (await rpc.call('runway.stage.start', {
      task_id: dynTask.task_id,
      stage_id: 'plan_phase',
      executor_id: 'codex',
      await_completion: true,
    })) as { stage_run: { stage_id: string; stage_run_id: string; status: string } };
    assert.equal(startedDyn1.stage_run.stage_id, 'plan_phase');
    assert.equal(startedDyn1.stage_run.stage_run_id, dynTask.stage_runs[0]!.stage_run_id);
    assert.equal(startedDyn1.stage_run.status, 'completed');

    const startedDyn2 = (await rpc.call('runway.stage.start', {
      task_id: dynTask.task_id,
      stage_id: 'review_phase',
      executor_id: 'codex',
      role: 'reviewer',
      sandbox_mode: 'read-only',
      await_completion: true,
    })) as { stage_run: { stage_id: string; seq_no: number; status: string } };
    assert.equal(startedDyn2.stage_run.stage_id, 'review_phase');
    assert.equal(startedDyn2.stage_run.seq_no, 2);
    assert.equal(startedDyn2.stage_run.status, 'completed');

    const resumedDyn1 = (await rpc.call('runway.stage.start', {
      stage_run_id: startedDyn1.stage_run.stage_run_id,
      resume_session_ref: 'codex-thread-resume-test',
      await_completion: true,
    })) as { stage_run: { status: string } };
    assert.equal(resumedDyn1.stage_run.status, 'completed');

    await rpc.close();
  });

  it('does not poison #activeTaskLoops when launchNextStageInBackground exits with zero awaits', async () => {
    const sb = trackSandbox();
    const srv = await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Zero-Await Loop WS',
    })) as { workspace_id: string };

    const created = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      title: 'Zero-await loop recovery',
      goal_prompt: 'Verify zero-await launchNextStageInBackground never wedges task',
      stages: [{ stage_id: 's1', executor_id: 'codex', model_id: 'gpt-5-codex' }],
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string }> };

    await rpc.call('runway.task.pause', { task_id: created.task_id, reason: 'test pause' });

    // Zero-await exits: non-active task status & missing task ID
    await srv.runtime.launchNextStageInBackground(created.task_id);
    await srv.runtime.launchNextStageInBackground('task-does-not-exist');

    // Resuming and launching again must execute cleanly (must not hit stale settled Promise)
    await rpc.call('runway.task.resume', { task_id: created.task_id, auto_start: false });
    await srv.runtime.launchNextStageInBackground(created.task_id);

    const afterRun = (await rpc.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      stage_runs: Array<{ status: string }>;
      attempts: Array<{ status: string }>;
    };
    assert.equal(afterRun.status, 'completed');
    assert.equal(afterRun.stage_runs[0]?.status, 'completed');
    assert.equal(afterRun.attempts.length, 1);

    // Zero-await exit when 0 queued stages remain (claimNextQueuedStage returns null)
    await srv.runtime.launchNextStageInBackground(created.task_id);
    srv.runtime.requeueStageForResume(created.stage_runs[0]!.stage_run_id);
    srv.runtime.db
      .prepare('UPDATE tasks SET status = \'active\', updated_at = ? WHERE task_id = ?')
      .run(new Date().toISOString(), created.task_id);

    await srv.runtime.launchNextStageInBackground(created.task_id);
    const afterRequeue = (await rpc.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      attempts: Array<{ status: string }>;
    };
    assert.equal(afterRequeue.status, 'completed');
    assert.equal(afterRequeue.attempts.length, 2);

    await rpc.close();
  });

  it('rejects concurrent explicit stage_id runway.stage.start with INVALID_STAGE_STATE (-32602) without stranding s3', async () => {
    const sb = trackSandbox({ OPL_STUB_CODEX_DELAY_MS: '80' });
    await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Probe5 Concurrency WS',
    })) as { workspace_id: string };

    const created = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      title: 'Three-stage race test',
      goal_prompt: 'Verify s1 -> s2 -> s3 completes with no stranded queued stage',
      stages: [
        { stage_id: 's1', executor_id: 'codex', model_id: 'gpt-5-codex' },
        { stage_id: 's2', executor_id: 'codex', model_id: 'gpt-5-codex' },
        { stage_id: 's3', executor_id: 'codex', model_id: 'gpt-5-codex' },
      ],
    })) as { task_id: string };

    await rpc.call('runway.task.pause', { task_id: created.task_id, reason: 'prepare concurrent resume' });

    const [resumeRes, s1Res, s2Res] = await Promise.allSettled([
      rpc.call('runway.task.resume', { task_id: created.task_id, auto_start: true }),
      rpc.call('runway.stage.start', { task_id: created.task_id, stage_id: 's1' }),
      rpc.call('runway.stage.start', { task_id: created.task_id, stage_id: 's2' }),
    ]);

    assert.equal(resumeRes.status, 'fulfilled');
    assert.equal(s1Res.status, 'rejected');
    assert.equal((s1Res.reason as { code?: number }).code, -32602);
    assert.match((s1Res.reason as Error).message, /INVALID_STAGE_STATE/);
    assert.equal(s2Res.status, 'rejected');
    assert.equal((s2Res.reason as { code?: number }).code, -32602);
    assert.match((s2Res.reason as Error).message, /INVALID_STAGE_STATE/);

    let finalTask: {
      status: string;
      stage_runs: Array<{ stage_id: string; status: string }>;
      attempts: Array<{ status: string }>;
    } | null = null;
    for (let i = 0; i < 120; i++) {
      const check = (await rpc.call('runway.task.get', { task_id: created.task_id })) as {
        status: string;
        stage_runs: Array<{ stage_id: string; status: string }>;
        attempts: Array<{ status: string }>;
      };
      if (check.status === 'completed') {
        finalTask = check;
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }

    assert.ok(finalTask, 'All 3 stages must complete cleanly without stranding s3');
    assert.deepEqual(
      finalTask.stage_runs.map((sr) => [sr.stage_id, sr.status]),
      [
        ['s1', 'completed'],
        ['s2', 'completed'],
        ['s3', 'completed'],
      ],
    );
    assert.equal(finalTask.attempts.length, 3);

    await rpc.close();
  });

  it('waits on #launchingTaskStages barrier before claiming the next queued stage in launchNextStageInBackground', async () => {
    const sb = trackSandbox();
    const srv = await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    const ws = (await rpc.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Barrier Ordering WS',
    })) as { workspace_id: string };

    const created = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      title: 'Barrier ordering test',
      goal_prompt: 'Verify launchNextStageInBackground awaits tracked in-flight stage before claiming s2',
      stages: [
        { stage_id: 's1', executor_id: 'codex', model_id: 'gpt-5-codex' },
        { stage_id: 's2', executor_id: 'codex', model_id: 'gpt-5-codex' },
      ],
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string; stage_id: string }> };

    await rpc.call('runway.task.pause', { task_id: created.task_id, reason: 'pause for tracked barrier check' });
    await rpc.call('runway.task.resume', { task_id: created.task_id, auto_start: false });

    const s1 = created.stage_runs.find((s) => s.stage_id === 's1')!;
    const s2 = created.stage_runs.find((s) => s.stage_id === 's2')!;

    let releaseBarrier!: () => void;
    const barrierHeld = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    let releaseEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      releaseEntered = resolve;
    });

    const trackedPromise = srv.runtime.runStageExecutionTracked(created.task_id, s1.stage_run_id, async () => {
      releaseEntered();
      await barrierHeld;
      return srv.runtime.runwayRuntime.executeStage(s1.stage_run_id);
    });
    await entered;

    // Trigger launchNextStageInBackground while s1 is tracked in-flight
    const loopPromise = srv.runtime.launchNextStageInBackground(created.task_id);
    await new Promise((r) => setTimeout(r, 40));

    // s2 MUST still be queued (not claimed prematurely while #launchingTaskStages is held)
    const midS2 = srv.runtime.runwayStore.getStageRun(s2.stage_run_id);
    assert.equal(midS2.status, 'queued');

    releaseBarrier();
    await trackedPromise;
    await loopPromise;

    const afterTask = (await rpc.call('runway.task.get', { task_id: created.task_id })) as {
      status: string;
      stage_runs: Array<{ stage_id: string; status: string }>;
    };
    assert.equal(afterTask.status, 'completed');
    assert.deepEqual(
      afterTask.stage_runs.map((sr) => [sr.stage_id, sr.status]),
      [
        ['s1', 'completed'],
        ['s2', 'completed'],
      ],
    );

    await rpc.close();
  });
});
