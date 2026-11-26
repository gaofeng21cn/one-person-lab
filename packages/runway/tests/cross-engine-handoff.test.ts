import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ConsumerBindTokenAuthority } from '@opl/connect';
import { createClientContext } from '@opl/core';
import { queryArtifacts, queryDebts, recordReviewWithDb, verifyTaskLineage } from '@opl/ledger';
import { parsePackageManifestV2 } from '@opl/pack';
import { sha256Prefixed } from '@opl/workspace';
import {
  AntigravityExecutorAdapter,
  CodexExecutorAdapter,
  RunwayRuntime,
} from '../src/index.ts';
import { createRunwayTestEnv } from './helpers/test-db.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB_CODEX_PATH = path.join(HERE, 'helpers', 'stub-codex.mjs');
const STUB_AGY_PATH = path.join(HERE, 'helpers', 'stub-agy.mjs');

test('Cross-engine handoff (antigravity -> codex -> antigravity reviewer) via Workspace + Ledger + Pack with zero chat-history coupling', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const vaultDir = path.join(env.tmpDir, 'vault');
  const pkgDir = path.join(env.tmpDir, 'pkgs', 'mas');
  const codexHome = path.join(env.tmpDir, 'codex-home');
  const spoolDir = path.join(env.tmpDir, 'agy-spools');
  const agyLog = path.join(env.tmpDir, 'agy-handoff.jsonl');
  const codexLog = path.join(env.tmpDir, 'codex-handoff.jsonl');

  fs.mkdirSync(vaultDir, { recursive: true });
  fs.writeFileSync(path.join(vaultDir, 'cohort.md'), '# Cardiology Cohort\nn=1200\n');
  fs.mkdirSync(path.join(pkgDir, 'skills', 'biostat'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'skills', 'biostat', 'SKILL.md'), '# Biostat skill\n');

  const manifest = parsePackageManifestV2({
    schema_version: 'opl.package.v2',
    identity: {
      id: 'med-autoscience',
      version: '1.0.0',
      intent: 'agent',
      name: { 'zh-CN': '医学自动科研', 'en-US': 'Med AutoScience' },
      summary: { 'zh-CN': '科研智能体', 'en-US': 'Research agent' },
      publisher: 'OPL',
    },
    provides: {
      skills: [{ id: 'biostat', path: 'skills/biostat' }],
      mcp_servers: [{ id: 'pubmed', transport: 'stdio', command: 'node', args: ['pubmed.mjs'] }],
    },
  });

  env.packStore.upsertInstalledPackage({
    manifest,
    origin: 'local_dev',
    install_mode: 'dev_link',
    install_path: pkgDir,
    content_digest: 'sha256:mas-digest-1',
    enabled: true,
  });

  const src = env.workspaceService.bindSource({
    workspace_id: env.workspaceId,
    scope: 'long_term_topic',
    adapter_kind: 'obsidian_vault',
    root_path: vaultDir,
  });

  const taskBundle = env.store.createTask({
    workspace_id: env.workspaceId,
    agent_id: 'med-autoscience',
    title: 'Lancet Manuscript Pipeline',
    goal_prompt: 'Produce study plan, generate Figure 1, and perform independent read-only review',
    stages: [
      { stage_id: 'study_plan', executor_id: 'antigravity', model_id: 'gemini-4-neon-high' },
      { stage_id: 'figure_build', executor_id: 'codex', model_id: 'gpt-5-codex' },
      { stage_id: 'peer_review', executor_id: 'antigravity', model_id: 'gemini-4-neon-xhigh' },
    ],
  });

  const stage1 = taskBundle.stage_runs[0]!;
  const stage2 = taskBundle.stage_runs[1]!;
  const stage3 = taskBundle.stage_runs[2]!;

  // Verify ConsumerBindTokenAuthority + PackStore + WorkspaceService integration in buildStageHandoffPacket
  const bindAuthority = new ConsumerBindTokenAuthority({
    db: env.db,
    signingSecret: '0123456789abcdef0123456789abcdef',
  });
  const runtimeWithConnect = new RunwayRuntime({
    db: env.db,
    store: env.store,
    registry: env.registry,
    workspaceService: env.workspaceService,
    packStore: env.packStore,
    bindTokenAuthority: bindAuthority,
    trustedHostClientContext: createClientContext({
      session_id: 'test-session',
      client_kind: 'opl_app',
    }),
    daemonSessionId: 'test-session',
  });
  const handoffProbe = await runtimeWithConnect.buildStageHandoffPacket(taskBundle.task, stage1);
  assert.ok(handoffProbe.consumer_bind_token?.startsWith('oplcbt1.'));
  assert.equal(handoffProbe.skill_dirs.length, 1);
  assert.equal(handoffProbe.mcp_servers[0]?.id, 'pubmed');
  // Regression (E2E-M4/M6 2d): bound active knowledge_sources appear even before explicit createSnapshot
  assert.ok(handoffProbe.knowledge_snapshot_refs.includes(src.root_path));

  env.workspaceService.createSnapshot({
    stage_run_id: stage1.stage_run_id,
    source_id: src.source_id,
  });

  // Register stub adapters with dynamic env pointers
  const agyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OPL_STUB_AGY_LOG: agyLog,
    OPL_STUB_ARTIFACT_REL: 'analysis/plan.md',
    OPL_STUB_ARTIFACT_CONTENT: '# Statistical Plan\n- Endpoint: MACE\n',
  };
  const codexEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: codexHome,
    OPL_STUB_CODEX_LOG: codexLog,
    OPL_STUB_ARTIFACT_REL: 'figures/fig1.svg',
    OPL_STUB_ARTIFACT_CONTENT: '<svg><text>KM Curve</text></svg>',
  };

  env.registry.register(new AntigravityExecutorAdapter({ binaryPath: STUB_AGY_PATH, env: agyEnv, spoolDir }));
  env.registry.register(new CodexExecutorAdapter({ binaryPath: STUB_CODEX_PATH, env: codexEnv }));

  // Stage 1: Antigravity (gemini-4-neon-high, producer) creates analysis/plan.md
  const res1 = await env.runtime.runNextStage(taskBundle.task_id);
  assert.ok(res1);
  assert.equal(res1.stage_run.stage_id, 'study_plan');
  assert.equal(res1.stage_run.status, 'completed');
  assert.equal(res1.outcome.artifact_refs.length, 1);
  assert.equal(res1.outcome.artifact_refs[0]!.path, 'analysis/plan.md');

  // Record a blocking quality debt from Stage 1
  env.ledgerStore.append({
    task_id: taskBundle.task_id,
    stage_run_id: stage1.stage_run_id,
    attempt_id: res1.attempt_id,
    entry_kind: 'quality_debt',
    owner_id: 'med-autoscience',
    payload: {
      debt_id: 'debt-fig1',
      code: 'missing_figure_1',
      summary: 'Figure 1 KM Curve must be generated before review',
      severity: 'high',
      blocks_submission: true,
    },
  });

  // Stage 2: Codex (gpt-5-codex, producer) receives Stage Handoff Packet from Workspace + Ledger (NOT chat history)
  const res2 = await env.runtime.runNextStage(taskBundle.task_id);
  assert.ok(res2);
  assert.equal(res2.stage_run.stage_id, 'figure_build');
  assert.equal(res2.stage_run.status, 'completed');
  assert.equal(res2.outcome.artifact_refs[0]!.path, 'figures/fig1.svg');

  // Verify Codex received Stage 1 artifact + open debt + skill_dirs + mcp_servers in handoff
  const codexInv = JSON.parse(fs.readFileSync(codexLog, 'utf8').trim()) as { argv: string[] };
  const codexPrompt = codexInv.argv[codexInv.argv.length - 1]!;
  assert.ok(codexPrompt.includes('analysis/plan.md'));
  assert.ok(codexPrompt.includes('debt-fig1'));
  assert.ok(codexInv.argv.some((a) => a.includes('skills.config=')));
  assert.ok(codexInv.argv.some((a) => a.includes('mcp_servers.pubmed.command=')));

  // Resolve debt via owner_receipt
  env.ledgerStore.append({
    task_id: taskBundle.task_id,
    stage_run_id: stage2.stage_run_id,
    attempt_id: res2.attempt_id,
    entry_kind: 'owner_receipt',
    owner_id: 'med-autoscience',
    payload: {
      resolves_debt: 'debt-fig1',
      produced_refs: ['figures/fig1.svg'],
      status: 'resolved',
    },
  });
  assert.equal(queryDebts(env.db, { task_id: taskBundle.task_id, unresolved_only: true }).length, 0);

  // Stage 3: Antigravity (gemini-4-neon-xhigh, reviewer, read-only)
  delete agyEnv.OPL_STUB_ARTIFACT_REL;
  const res3 = await env.runtime.runNextStage(taskBundle.task_id, {
    role: 'reviewer',
    sandbox_mode: 'read-only',
  });
  assert.ok(res3);
  assert.equal(res3.stage_run.stage_id, 'peer_review');
  assert.equal(res3.stage_run.status, 'completed');
  assert.equal(res3.task.status, 'completed');

  // Verify reviewer was forced into --mode plan --sandbox and received both prior artifacts in prompt
  const agyLogs = fs
    .readFileSync(agyLog, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { argv: string[] });
  const reviewLog = agyLogs[1]!;
  assert.equal(reviewLog.argv[reviewLog.argv.indexOf('--mode') + 1], 'plan');
  assert.ok(reviewLog.argv.includes('--sandbox'));
  assert.ok(reviewLog.argv.includes('--add-dir'));
  assert.equal(reviewLog.argv[reviewLog.argv.indexOf('--add-dir') + 1], fs.realpathSync(env.workspaceDir));
  assert.ok(reviewLog.argv.includes(src.root_path));
  const reviewPrompt = reviewLog.argv[reviewLog.argv.length - 1]!;
  assert.ok(reviewPrompt.includes('analysis/plan.md'));
  assert.ok(reviewPrompt.includes('figures/fig1.svg'));

  // Record review verdict and verify full Task Lineage SHA-256 integrity
  const planSha = sha256Prefixed(fs.readFileSync(path.join(env.workspaceDir, 'analysis/plan.md')));
  const figSha = sha256Prefixed(fs.readFileSync(path.join(env.workspaceDir, 'figures/fig1.svg')));
  recordReviewWithDb(env.db, {
    task_id: taskBundle.task_id,
    stage_run_id: stage3.stage_run_id,
    attempt_id: res3.attempt_id,
    owner_id: 'med-autoscience.reviewer',
    verdict: 'approved',
    reviewer_role: 'reviewer',
    reviewed_artifact_refs: ['analysis/plan.md', 'figures/fig1.svg'],
    verified_hashes: [planSha, figSha],
  });

  const lineage = verifyTaskLineage(env.db, taskBundle.task_id, env.workspaceDir);
  assert.equal(lineage.ok, true);
  assert.equal(lineage.artifact_count, 2);
  assert.equal(lineage.open_debt_count, 0);
  assert.equal(lineage.latest_review_verdict, 'approved');
  assert.equal(queryArtifacts(env.db, { task_id: taskBundle.task_id }).length, 2);
});
