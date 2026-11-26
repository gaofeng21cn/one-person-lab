import assert from 'node:assert/strict';
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

describe('Wave 2 Gate 6: Cross-engine handoff (antigravity -> codex -> antigravity reviewer) via live opld RPC', () => {
  it('executes 3-stage cross-engine handoff via Workspace + Ledger + Pack with --mode plan --sandbox and passes ledger.verify', async () => {
    const sb = trackSandbox();
    const rulesFile = path.join(sb.root, 'stub-rules.json');
    fs.writeFileSync(
      rulesFile,
      JSON.stringify([
        {
          tool: 'agy',
          subcommand: 'print',
          model: 'gemini-4-neon-high',
          config: {
            mode: 'success',
            artifacts: [
              { path: 'analysis/plan.md', content: '# Clinical Plan\nEndpoint: MACE\n' },
            ],
            response_text: 'Stage 1 study plan complete',
          },
        },
        {
          tool: 'codex',
          subcommand: 'exec',
          config: {
            mode: 'success',
            artifacts: [
              { path: 'figures/fig1.svg', content: '<svg><text>KM</text></svg>' },
            ],
            response_text: 'Stage 2 figure generated',
          },
        },
        {
          tool: 'agy',
          subcommand: 'print',
          model: 'gemini-4-neon-xhigh',
          sandbox_mode: 'read-only',
          config: {
            mode: 'success',
            artifacts: [],
            response_text: 'Stage 3 independent review approved',
          },
        },
      ]),
      'utf8',
    );

    await sb.spawnDaemonProcess({ OPL_STUB_RULES_FILE: rulesFile });
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    // Link test agent package with skill + MCP server
    const pkgDir = writeMinimalV2Package(path.join(sb.root, 'mas-gate6'), {
      id: 'med-autoscience',
      intent: 'agent',
      extraManifest: {
        provides: {
          skills: [{ id: 'biostat', path: './skills/med-autoscience', exposure: 'default' }],
          mcp_servers: [{ id: 'pubmed', transport: 'stdio', command: 'node', args: ['pubmed.mjs'] }],
        },
      },
    });
    await rpc.call('pack.link', { dir: pkgDir, sync_codex: false });

    const ws = (await rpc.call('workspace.init', {
      root_path: sb.workspaceDir,
      name: 'Gate6 Handoff WS',
      domain_id: 'med-autoscience',
    })) as { workspace_id: string; root_path: string };

    const vaultDir = path.join(sb.root, 'vault');
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.writeFileSync(path.join(vaultDir, 'cohort.md'), '# Cohort\nn=800\n', 'utf8');
    const boundSource = (await rpc.call('workspace.sources.bind', {
      workspace_id: ws.workspace_id,
      scope: 'long_term_topic',
      adapter_kind: 'obsidian_vault',
      root_path: vaultDir,
    })) as { source_id: string; root_path: string };

    const created = (await rpc.call('runway.task.create', {
      workspace_id: ws.workspace_id,
      agent_id: 'med-autoscience',
      title: 'Gate 6 Cross-Engine Handoff',
      goal_prompt: 'Plan with Antigravity, build figure with Codex, review read-only with Antigravity',
      stages: [
        { stage_id: 'study_plan', executor_id: 'antigravity', model_id: 'gemini-4-neon-high' },
        { stage_id: 'figure_build', executor_id: 'codex', model_id: 'gpt-5-codex' },
        { stage_id: 'peer_review', executor_id: 'antigravity', model_id: 'gemini-4-neon-xhigh' },
      ],
    })) as { task_id: string; stage_runs: Array<{ stage_run_id: string; stage_id: string }> };

    // Stage 1: Antigravity (gemini-4-neon-high)
    const stage1Out = (await rpc.call('runway.stage.start', {
      task_id: created.task_id,
      stage_run_id: created.stage_runs[0]!.stage_run_id,
      await_completion: true,
    })) as { attempt_id: string; stage_run: { status: string } };
    assert.equal(stage1Out.stage_run.status, 'completed');

    // Record quality debt from Stage 1
    await rpc.call('ledger.append', {
      task_id: created.task_id,
      stage_run_id: created.stage_runs[0]!.stage_run_id,
      attempt_id: stage1Out.attempt_id,
      entry_kind: 'quality_debt',
      owner_id: 'med-autoscience',
      payload: {
        debt_id: 'debt-fig1',
        code: 'missing_figure_1',
        summary: 'Generate Figure 1 KM curve before review',
        severity: 'high',
        blocks_submission: true,
      },
    });

    // Stage 2: Codex (gpt-5-codex) reads Stage 1 artifact + debt via Runway handoff
    const stage2Out = (await rpc.call('runway.stage.start', {
      task_id: created.task_id,
      stage_run_id: created.stage_runs[1]!.stage_run_id,
      await_completion: true,
    })) as { attempt_id: string; stage_run: { status: string } };
    assert.equal(stage2Out.stage_run.status, 'completed');

    await rpc.call('ledger.append', {
      task_id: created.task_id,
      stage_run_id: created.stage_runs[1]!.stage_run_id,
      attempt_id: stage2Out.attempt_id,
      entry_kind: 'owner_receipt',
      owner_id: 'med-autoscience',
      payload: {
        resolves_debt: 'debt-fig1',
        produced_refs: ['figures/fig1.svg'],
        status: 'resolved',
      },
    });

    // Stage 3: Antigravity reviewer (--mode plan --sandbox)
    const stage3Out = (await rpc.call('runway.stage.start', {
      task_id: created.task_id,
      stage_run_id: created.stage_runs[2]!.stage_run_id,
      role: 'reviewer',
      sandbox_mode: 'read-only',
      await_completion: true,
    })) as { attempt_id: string; stage_run: { status: string }; task: { status: string } };
    assert.equal(stage3Out.stage_run.status, 'completed');
    assert.equal(stage3Out.task.status, 'completed');

    const artifacts = (await rpc.call('ledger.artifacts', { task_id: created.task_id })) as {
      artifacts: Array<{ payload: { path: string; sha256: string } }>;
    };
    const planArt = artifacts.artifacts.find((a) => a.payload.path === 'analysis/plan.md');
    const figArt = artifacts.artifacts.find((a) => a.payload.path === 'figures/fig1.svg');
    assert.ok(planArt && figArt, 'Both Stage 1 and Stage 2 artifacts must be recorded in Ledger');

    await rpc.call('ledger.review.record', {
      task_id: created.task_id,
      stage_run_id: created.stage_runs[2]!.stage_run_id,
      attempt_id: stage3Out.attempt_id,
      owner_id: 'med-autoscience.reviewer',
      verdict: 'approved',
      reviewer_role: 'reviewer',
      reviewed_artifact_refs: ['analysis/plan.md', 'figures/fig1.svg'],
      verified_hashes: [planArt.payload.sha256, figArt.payload.sha256],
      summary: 'Independent read-only review passed.',
    });

    // Verify stub invocation logs
    const codexLogs = fs
      .readFileSync(path.join(sb.stubLogDir, 'codex.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { event?: string; subcommand?: string; argv?: string[]; stdin_preview?: string });
    const codexExec = codexLogs.find((e) => e.event === 'invocation' && e.subcommand === 'exec');
    assert.ok(codexExec, 'Codex exec invocation must be logged');
    assert.ok(codexExec.argv?.some((a) => a.includes('skills.config=')));
    assert.ok(codexExec.argv?.some((a) => a.includes('mcp_servers.pubmed.command=')));

    const agyLogs = fs
      .readFileSync(path.join(sb.stubLogDir, 'agy.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { event?: string; subcommand?: string; argv?: string[] });
    const agyPrints = agyLogs.filter((e) => e.event === 'invocation' && e.subcommand === 'print');
    assert.equal(agyPrints.length, 2);
    const reviewArgv = agyPrints[1]!.argv!;
    assert.equal(reviewArgv[reviewArgv.indexOf('--mode') + 1], 'plan');
    assert.ok(reviewArgv.includes('--sandbox'));
    assert.equal(reviewArgv[reviewArgv.indexOf('--add-dir') + 1], ws.root_path);
    assert.ok(reviewArgv.includes(boundSource.root_path));
    const reviewPrompt = reviewArgv[reviewArgv.length - 1]!;
    assert.ok(reviewPrompt.includes('analysis/plan.md'));
    assert.ok(reviewPrompt.includes('figures/fig1.svg'));

    const verified = (await rpc.call('ledger.verify', { task_id: created.task_id })) as { ok: boolean };
    assert.equal(verified.ok, true);

    await rpc.close();
  });
});
