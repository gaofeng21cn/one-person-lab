import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { Worker } from '@temporalio/worker';
import { registerAgentPackageReadinessPort } from '../../src/kernel/agent-package-readiness-port.ts';
import { runOplAgentPackageStatus } from '../../src/adapters/integration/agent-package-registry.ts';
import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { ContentAddressedCandidateCompiler } from '../../src/authority/evidence/index.ts';
import { foundryContentDigest, type AgentBlueprint, type FoundryProviderManifest } from '../../src/authority/evolution/index.ts';
import { FoundryKernel } from '../../src/authority/evolution/kernel.ts';
import { InMemoryFoundryEventStore, InMemoryFoundryObjectStore, InMemoryOwnerGate, InMemoryVersionRegistry } from '../../src/authority/evolution/in-memory-adapters.ts';
import { createCordisBaseHeadlessComposition } from '../../src/host/composition-profiles.ts';
import { runFamilyRuntime } from '../../src/adapters/execution/family-runtime.ts';
import { runAgentStageRunner } from '../../src/adapters/execution/family-runtime-codex-stage-runner.ts';
import { resolveStageRunAttemptExecutorContent } from '../../src/adapters/execution/family-runtime-stage-run-attempt-content.ts';
import { StageRunFoundryProviderCoordinator, type FoundryProviderOperationCursor } from '../../src/adapters/execution/foundry-provider-stage-run.ts';
import { OplFoundryProviderStageRunGateway } from '../../src/adapters/execution/foundry-provider-stage-run-gateway.ts';
import {
  compactCloseoutPacketForTemporalResult,
  stageQualityAttemptMaterializeActivity,
  stageQualityAttemptSyncActivity,
  stageQualityCycleProjectActivity,
  stageQualityReviewReceiptActivity,
  stageRunRouteLaunchActivity,
} from '../../src/adapters/execution/family-runtime-temporal-activities.ts';
import type { TemporalStageAttemptWorkflowInput } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { createTemporalTestWorkflowEnvironment } from './temporal-test-environment.ts';
import { createPackFixture, packageUseBinding, restoreEnv, writeJson, writeText } from './family-runtime-pack-bound-stage-quality-fixture.ts';
import { CONTENT_KINDS, provider, providerResourceBytes, transportBlueprint } from './foundry-provider-stage-run-cases/support.ts';
import { request as designRequestFixture } from './foundry-kernel-cases/shared.ts';

const STAGES = ['mission-intake', 'design-basis-admission', 'stage-architecture', 'agent-blueprint-authoring', 'evaluation-design'];
const repoRoot = path.resolve(import.meta.dirname, '../..');
const sha256 = (bytes: Buffer | string) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function fiveStagePack() {
  const root = createPackFixture({ review_lane_binding: 'domain_fixed_review_lane', review_lane: 'medical' });
  const read = (ref: string) => JSON.parse(fs.readFileSync(path.join(root, ref), 'utf8'));
  const manifest = read('agent/stages/manifest.json');
  const template = manifest.stages[0];
  manifest.stages = STAGES.map((stageId, index) => ({
    ...template, stage_id: stageId, title: stageId, goal: `Write and account for ${stageId}.`,
    policy_ref: `agent/stages/${stageId}.md`, prompt_ref: `agent/prompts/${stageId}.md`,
    allowed_action_refs: ['design-operation'], next_stage_refs: STAGES[index + 1] ? [STAGES[index + 1]] : [],
    stage_quality_cycle_policy_ref: `contracts/stage_quality_cycle_policy.json#/stages/${stageId}`,
  }));
  // File order is deliberately unrelated to the declared action progression.
  manifest.stages.reverse();
  writeJson(root, 'agent/stages/manifest.json', manifest);
  const policy = read('contracts/stage_quality_cycle_policy.json');
  const draftPolicy = policy.stages.draft;
  policy.stages = Object.fromEntries(STAGES.map((stageId, index) => [stageId, {
    ...draftPolicy, stage_prompt_ref: `agent/prompts/${stageId}.md`,
    role_prompt_refs: Object.fromEntries(Object.entries(draftPolicy.role_prompt_refs)
      .map(([role, ref]) => [role, String(ref).replace('/draft.md', `/${stageId}.md`)])),
    formal_review: { ...draftPolicy.formal_review, required: index !== 0, risk_tier: index ? 'high' : 'low', max_repair_rounds: 0 },
  }]));
  writeJson(root, 'contracts/stage_quality_cycle_policy.json', policy);
  for (const stageId of STAGES) {
    writeText(root, `agent/stages/${stageId}.md`, `# ${stageId} policy\n`);
    writeText(root, `agent/prompts/${stageId}.md`, fs.readFileSync(path.join(root, 'agent/prompts/draft.md'), 'utf8'));
  }
  const catalog = read('contracts/action_catalog.json');
  catalog.actions = [{ ...catalog.actions[0], action_id: 'design-operation',
    stage_route: { entry_stage_ref: STAGES[0], required_stage_refs: STAGES,
      optional_stage_refs: [], terminal_stage_refs: [STAGES.at(-1)], route_policy: 'ai_selected_progress_route' } }];
  writeJson(root, 'contracts/action_catalog.json', catalog);
  return root;
}

// This executable is the entire agent fixture: it writes real artifact bytes and emits
// Codex JSONL. It neither calls a provider nor substitutes framework closeout metadata.
const FAKE_AGENT = String.raw`#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
if (process.argv.includes('--version')) { console.log('codex-cli 0.134.0'); process.exit(0); }
const plan = JSON.parse(fs.readFileSync(process.env.OPL_FIVE_STAGE_PLAN, 'utf8'));
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const save = (relative, bytes) => {
  const file = path.join(process.cwd(), relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  return { ref: pathToFileURL(file).href, sha256: digest(bytes) };
};
let artifact;
if (plan.role === 'producer') {
  if (plan.blueprint) {
    for (const resource of plan.resources) save('content/' + resource.sha256.slice(7), Buffer.from(resource.base64, 'base64'));
    artifact = save('artifacts/' + plan.attemptId + '/agent-blueprint-final.json', Buffer.from(plan.blueprint));
  } else artifact = save('artifacts/' + plan.attemptId + '/result.txt', Buffer.from(plan.stageId + ' completed\n'));
} else artifact = save('reviews/' + plan.attemptId + '/review.txt', Buffer.from('Independent fixture review: pass\n'));
const cycle = plan.role === 'producer'
  ? { artifact_refs: [artifact.ref], artifact_hashes: [artifact.sha256] }
  : { outcome: 'pass', findings: [] };
const route = plan.role === 'reviewer' || plan.raw
  ? { stage_route_decision: { decision_kind: plan.next ? 'advance' : 'complete',
      ...(plan.next ? { target_stage_id: plan.next } : {}), evidence_refs: [artifact.ref] } }
  : {};
const packet = { surface_kind: 'stage_attempt_closeout_packet', stage_attempt_id: plan.attemptId,
  stage_run_id: plan.stageRunId, scope_digest: plan.scopeDigest,
  closeout_refs: [artifact.ref], closeout_ref_metadata: [artifact], consumed_refs: [],
  consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [], next_owner: null,
  route_impact: { stage_quality_cycle: cycle, ...route } };
const text = (plan.raw ? 'RAW JSON PACKET:\n' : '') + JSON.stringify(packet);
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread-' + plan.attemptId }));
console.log(JSON.stringify({ type: 'turn.started' }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-final', text } }));
console.log(JSON.stringify({ type: 'turn.completed' }));
`;

test('five real StageRuns account for raw progress and materialize exact candidates in two isolated rounds', { timeout: 240_000 }, async (t) => {
  const startedAt = Date.now();
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-five-stage-')));
  const stateRoot = path.join(root, 'state'), workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(stateRoot); fs.mkdirSync(workspaceRoot);
  const packRoot = fiveStagePack();
  const envKeys = ['OPL_STATE_DIR', 'OPL_FAMILY_WORKSPACE_ROOT', 'OPL_TEMPORAL_ADDRESS', 'TEMPORAL_ADDRESS',
    'OPL_TEMPORAL_NAMESPACE', 'OPL_TEMPORAL_TASK_QUEUE', 'OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY',
    'OPL_CODEX_BIN', 'OPL_CODEX_STAGE_SANDBOX_PROVIDER', 'OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS'];
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_WORKSPACE_ROOT = path.join(root, 'family');
  writeJson(stateRoot, 'workspace-registry.json', { version: 'g2', bindings: [{
    binding_id: 'binding:five-stage', project_scope_id: 'project:five-stage', project_id: 'medautoscience',
    project: 'Five-stage accounting fixture', workspace_path: workspaceRoot, status: 'active',
  }] });
  const codexPath = path.join(root, 'fake-codex.cjs'); fs.writeFileSync(codexPath, FAKE_AGENT, { mode: 0o755 });
  process.env.OPL_CODEX_BIN = codexPath;
  process.env.OPL_CODEX_STAGE_SANDBOX_PROVIDER = 'host';
  process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '0';
  const useBinding = packageUseBinding(packRoot);
  const readiness = () => ({ runtime_source_readiness: { status: 'current', operational_ready: true, checkout_path: packRoot }, package_use_binding: useBinding });
  registerAgentPackageReadinessPort({ readStatus: () => ({ opl_agent_package_status: { installed_package_count: 1, launch_allowed: true, ...readiness() } }) });
  const testEnv = await createTemporalTestWorkflowEnvironment();
  process.env.OPL_TEMPORAL_ADDRESS = testEnv.address; delete process.env.TEMPORAL_ADDRESS;
  process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
  const taskQueue = `opl-foundry-five-stage-${Date.now()}`;
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY = '1';
  const host = await createCordisBaseHeadlessComposition();
  const composition = host.services.childFactories.createStageRouteComposition;
  const resources = Object.fromEntries(CONTENT_KINDS.map((kind) => {
    const bytes = providerResourceBytes(kind, 'five-stage local agent bytes');
    return [kind, { bytes, ref: '', sha256: sha256(bytes), content_ref: `opl-content://sha256/${sha256(bytes).slice(7)}` }];
  })) as Parameters<typeof transportBlueprint>[0];
  const blueprint = transportBlueprint(resources);
  const designRequest = designRequestFixture({ target_agent_id: blueprint.target_agent_id, target_domain_id: blueprint.target_domain_id,
    source_refs: [], constraints: { capability_refs: ['capability:fixture'], permission_refs: [], privacy_requirements: [],
      cost_limits: { usd: 0 }, latency_limits: { milliseconds: 60_000 } },
    delivery_policy: { activation_mode: 'qualify_only', max_generations: 1 } });
  blueprint.design_request_digest = foundryContentDigest(designRequest);
  const plans = path.join(stateRoot, 'plans'); fs.mkdirSync(plans);
  const observed: Array<{ input: TemporalStageAttemptWorkflowInput; receipt: any }> = [];
  const runtimeOptions = { stageRunRuntime: { ensurePackageLaunchReady: async () => readiness() as never }, createStageRouteComposition: composition };
  const activities = {
    stageQualityAttemptMaterializeActivity: (input: Parameters<typeof stageQualityAttemptMaterializeActivity>[0]) =>
      stageQualityAttemptMaterializeActivity(input, { createStageRouteComposition: composition }),
    stageQualityAttemptSyncActivity, stageQualityCycleProjectActivity, stageQualityReviewReceiptActivity,
    stageRunRouteLaunchActivity: (input: Parameters<typeof stageRunRouteLaunchActivity>[0]) =>
      stageRunRouteLaunchActivity(input, { createStageRouteComposition: composition }),
    async codexStageActivity(attempt: TemporalStageAttemptWorkflowInput) {
      const index = STAGES.indexOf(attempt.stage_id), terminalProducer = index === 4 && attempt.attempt_role === 'producer';
      const planFile = path.join(plans, `${attempt.stage_attempt_id}.json`);
      writeJson(plans, path.basename(planFile), { attemptId: attempt.stage_attempt_id, stageRunId: attempt.stage_run_id,
        stageId: attempt.stage_id, role: attempt.attempt_role, scopeDigest: attempt.execution_scope?.scope_digest,
        next: STAGES[index + 1], raw: index === 0,
        ...(terminalProducer ? { blueprint: canonicalJsonBytes(blueprint).toString('utf8'), resources: CONTENT_KINDS.map((kind) => ({ sha256: resources[kind].sha256, base64: resources[kind].bytes.toString('base64') })) } : {}),
      });
      const receipt = await runAgentStageRunner({ attempt: attempt as unknown as Record<string, unknown>,
        ...resolveStageRunAttemptExecutorContent(attempt), stagePacketRef: attempt.stage_packet_ref,
        runnerMode: 'codex_cli', timeoutMs: 15_000, env: { OPL_FIVE_STAGE_PLAN: planFile, OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host' } });
      observed.push({ input: attempt, receipt });
      assert.ok('closeout_packet' in receipt, 'The Codex CLI runner must expose a closeout packet.');
      return { surface_kind: 'temporal_codex_stage_activity_receipt', ...receipt,
        closeout_packet: compactCloseoutPacketForTemporalResult(receipt.closeout_packet) };
    },
    async domainHandlerDispatchActivity(attempt: TemporalStageAttemptWorkflowInput) {
      assert.ok(attempt.closeout_packet, `real runner closeout missing for ${attempt.stage_id}/${attempt.attempt_role}`);
      return { ...attempt.closeout_packet, closeout_packet_surface_kind: attempt.closeout_packet.surface_kind };
    },
  };
  try {
    const worker = await Worker.create({ connection: testEnv.nativeConnection, namespace: testEnv.namespace ?? 'default', taskQueue,
      workflowsPath: path.join(repoRoot, 'src/adapters/execution/family-runtime-temporal-workflows.ts'), activities });
    await worker.runUntil(async () => {
      const actualProvider: FoundryProviderManifest = { ...provider, provider_id: 'medautoscience', agent_id: 'medautoscience', package_id: 'medautoscience', domain_id: 'medautoscience',
        operations: { ...provider.operations, design: { ...provider.operations.design, required_stage_refs: STAGES } },
        projection_policy: { ...provider.projection_policy, public_action_ids: ['design-operation'] } };
      const gateway = new OplFoundryProviderStageRunGateway((args, options) => runFamilyRuntime(args, { ...options, ...runtimeOptions }),
        { create_stage_route_composition: composition });
      for (let round = 1; round <= 2; round += 1) {
        const coordinator = new StageRunFoundryProviderCoordinator({ gateway, storage_root: workspaceRoot });
        const compiler = new ContentAddressedCandidateCompiler(workspaceRoot);
        const events = new InMemoryFoundryEventStore();
        const kernel = new FoundryKernel({
          designer: { producer_id: 'designer:offline-five-stage', async design(request, activity) {
            let cursor: FoundryProviderOperationCursor = await coordinator.launch({ operation: 'design', provider: actualProvider, checkout_root: packRoot,
              provider_source_digest: `sha256:${'a'.repeat(64)}`, payload: { request }, activity }, `operation:five-stage-${round}`);
            const deadline = Date.now() + 90_000;
            while (cursor.status !== 'terminal') {
              cursor = await coordinator.observe(cursor, cursor.operation_key);
              assert.ok(Date.now() < deadline, `five-stage round ${round} timed out`);
              if (cursor.status !== 'terminal') await new Promise((resolve) => setTimeout(resolve, 25));
            }
            assert.deepEqual(cursor.visited_path.map((entry) => entry.stage_id), STAGES);
            const transported = await coordinator.readTerminal(cursor, cursor.operation_key) as AgentBlueprint;
            assert.deepEqual(transported, blueprint);
            return transported;
          }, async diagnose() { throw new Error('Diagnosis is outside the accounting fixture.'); } },
          compiler, objects: new InMemoryFoundryObjectStore(), events, versions: new InMemoryVersionRegistry(),
          ownerGate: new InMemoryOwnerGate(), activityMaxAttempts: 1,
          evaluator: { evaluator_id: 'unavailable:accounting-only',
            async evaluate() { throw new Error('Qualification is outside the accounting fixture.'); },
            async canary() { throw new Error('Canary is outside the accounting fixture.'); } },
        });
        const runId = `run:five-stage-${round}`;
        await kernel.startRun({ request: designRequest, run_id: runId });
        assert.equal((await kernel.advanceRunStep(runId)).run.state, 'designing');
        const designInspection = await kernel.advanceRunStep(runId);
        assert.equal(designInspection.run.state, 'materializing', JSON.stringify({
          run: designInspection.run, events: await events.read(runId),
          attempts: observed.map(({ input, receipt }) => ({
            stage_id: input.stage_id, attempt_role: input.attempt_role,
            runner_status: receipt.runner_status,
            normalization_findings: receipt.closeout_packet?.route_impact?.normalization_findings,
          })),
        }));
        const inspection = await kernel.advanceRunStep(runId);
        assert.equal(inspection.run.state, 'evaluating');
        const runEvents = await events.read(runId);
        assert.deepEqual(runEvents.map((event) => event.event_type), [
          'foundry_run_accepted', 'design_started', 'blueprint_admitted', 'candidate_materialized',
        ]);
        assert.equal(inspection.run.version_digest, null);
        assert.equal(inspection.run.evidence_digest, null);
        const candidateDigest = inspection.run.candidate_digest!;
        const candidateRoot = compiler.candidateDirectory(candidateDigest);
        const index = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'candidate-index.json'), 'utf8'));
        assert.equal(index.blueprint_digest, inspection.run.blueprint_digest);
        assert.equal(index.candidate_digest, candidateDigest);
        assert.equal(foundryContentDigest({ surface_kind: index.surface_kind, version: index.version, blueprint_digest: index.blueprint_digest, files: index.files }), candidateDigest);
        assert.equal(JSON.parse(fs.readFileSync(path.join(candidateRoot, 'contracts/agent-pack-conformance.json'), 'utf8')).status, 'valid');
        for (const entry of index.files) assert.equal(sha256(fs.readFileSync(path.join(candidateRoot, entry.path))).slice(7), entry.sha256);
        t.diagnostic(`round=${round} stages=5 blueprint_admitted=${index.blueprint_digest} candidate_materialized=${candidateDigest} conformance=valid qualification=not_executed`);
      }
    });
    assert.equal(observed.length, 18);
    const intake = observed.filter(({ input }) => input.stage_id === STAGES[0]);
    assert.equal(intake.length, 2);
    for (const { receipt } of intake) {
      assert.equal(receipt.closeout_packet.route_impact.framework_generated_envelope, true);
      assert.ok(receipt.closeout_packet.route_impact.normalization_findings.includes('typed_closeout_not_required_raw_artifact_advanced'));
      assert.equal(receipt.closeout_packet.route_impact.stage_route_decision, undefined);
    }
    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime/queue.sqlite'));
    try {
      const states = db.prepare('SELECT stage_id, state_json FROM stage_quality_cycles').all().map((row: any) => ({ ...JSON.parse(row.state_json).controller_readback, stage_id: row.stage_id }));
      assert.equal(states.length, 10);
      for (const state of states) {
        assert.ok(['completed', 'completed_with_quality_debt'].includes(state.controller_status ?? state.status));
        assert.equal(state.decisive_attempt_role, state.stage_id === STAGES[0] ? 'producer' : 'reviewer');
        assert.equal(state.selected_stage_route.decision_kind, state.stage_id === STAGES.at(-1) ? 'complete' : 'advance');
        if (state.stage_id === STAGES[0]) assert.ok(state.route_quality_debt_refs.some((ref: string) => ref.includes('controller_missing_route_fallback_applied')));
      }
    } finally { db.close(); }
    assert.ok(Date.now() - startedAt < 300_000, 'accounting fixture must complete within five minutes');
  } finally {
    registerAgentPackageReadinessPort({ readStatus: runOplAgentPackageStatus });
    await host.dispose(); await testEnv.teardown(); restoreEnv(previous);
    fs.rmSync(packRoot, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true });
  }
});
