import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Connection } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { registerAgentPackageReadinessPort } from '../../src/kernel/agent-package-readiness-port.ts';
import { runOplAgentPackageStatus } from '../../src/adapters/integration/agent-package-registry.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/authority/workspace/index.ts';
import { runFamilyRuntime } from '../../src/adapters/execution/family-runtime.ts';
import { createCordisBaseHeadlessComposition } from '../../src/host/composition-profiles.ts';
import { resolveStageRunAttemptExecutorContent } from '../../src/adapters/execution/family-runtime-stage-run-attempt-content.ts';
import { stageQualityAttemptMaterializeActivity, stageQualityAttemptSyncActivity,
  stageQualityCycleProjectActivity, stageQualityReviewReceiptActivity } from '../../src/adapters/execution/family-runtime-temporal-activities.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import type { TemporalStageAttemptWorkflowInput } from '../../src/adapters/execution/family-runtime-temporal.ts';

const checkoutRoot = process.env.OPL_PROFESSIONAL_DOMAIN_ROOT;
const evidenceRoot = process.env.OPL_PROFESSIONAL_EVIDENCE_ROOT;
const cases = [
  { repo: 'med-autoscience', packageId: 'mas', domain: 'medautoscience', stage: 'manuscript_authoring', action: 'manuscript_authoring', alias: 'study_id' },
  { repo: 'redcube-ai', packageId: 'rca', domain: 'redcube_ai', stage: 'review_and_revision', action: 'invoke_product_entry', alias: 'project_id' },
  { repo: 'opl-bookforge', packageId: 'obf', domain: 'opl-bookforge', stage: 'chapter-materialization', action: 'materialize-book', alias: 'book_id' },
  { repo: 'opl-capital-compass', packageId: 'occ', domain: 'occ', stage: 'decision-design', action: 'advise-capital-allocation', alias: 'project_id' },
];
const sha = (bytes: Buffer | string) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return { ref: pathToFileURL(file).href, sha256: sha(fs.readFileSync(file)) };
}
function useBinding(root: string, packageId: string) {
  const manifestHash = sha(fs.readFileSync(path.join(root, 'agent/stages/manifest.json')));
  return { surface_kind: 'opl_agent_package_use_binding.v1', use_boundary_id: `package-use:synthetic:${packageId}`,
    root_package: { package_id: packageId, package_version: '0.0.0-test',
      owner_language_version: { scheme: 'semver', value: '0.0.0-test' },
      package_lock_ref: `opl://synthetic-package-lock/${packageId}`, manifest_sha256: manifestHash.slice(7),
      content_digest: sha(`synthetic-source-closure:${root}:${manifestHash}`), source_artifact_ref: null, artifact_digest: null },
    provider_packages: [], dependency_closure_digest: sha(`synthetic-closure:${packageId}`).slice(7) };
}

// Opt-in cross-repository acceptance: uses the actual domain pack sources and the
// real local Temporal server/workflows. Only external model/domain verdicts and
// installed-package readiness are synthetic, as in the existing pack-bound E2E.
test('four domain reviews continue the original task through real local Temporal StageRuns', {
  skip: !checkoutRoot,
  timeout: 240_000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-professional-continuation-'));
  const stateRoot = path.join(root, 'state');
  const familyRoot = path.join(root, 'family');
  const envKeys = ['OPL_STATE_DIR', 'OPL_FAMILY_WORKSPACE_ROOT', 'OPL_TEMPORAL_ADDRESS', 'TEMPORAL_ADDRESS',
    'OPL_TEMPORAL_NAMESPACE', 'OPL_TEMPORAL_TASK_QUEUE', 'OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY'];
  const previous = new Map(envKeys.map(key => [key, process.env[key]]));
  const environment = await TestWorkflowEnvironment.createLocal({ server: { searchAttributes: [] } });
  const namespace = environment.namespace ?? 'default';
  const queue = `professional-continuation-${Date.now()}`;
  Object.assign(process.env, { OPL_STATE_DIR: stateRoot, OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
    OPL_TEMPORAL_ADDRESS: environment.address, OPL_TEMPORAL_NAMESPACE: namespace,
    OPL_TEMPORAL_TASK_QUEUE: queue, OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY: '1' });
  delete process.env.TEMPORAL_ADDRESS;
  const host = await createCordisBaseHeadlessComposition();
  const connection = await Connection.connect({ address: environment.address });
  const client = new Client({ connection, namespace });
  let active = { root: '', binding: {} as ReturnType<typeof useBinding> };
  const observed: Array<Record<string, any>> = [];
  const outputs = new Map<string, { ref: string; sha256: string }>();
  const results: Array<Record<string, unknown>> = [];
  const readiness = () => ({ runtime_source_readiness: { status: 'current', operational_ready: true, checkout_path: active.root }, package_use_binding: active.binding });
  registerAgentPackageReadinessPort({ readStatus: () => ({ opl_agent_package_status: { installed_package_count: 1, launch_allowed: true, ...readiness() } }) });
  const runtimeOptions = { stageRunRuntime: { ensurePackageLaunchReady: async () => readiness() as never },
    createStageRouteComposition: host.services.childFactories.createStageRouteComposition };
  const activities = {
    stageQualityAttemptMaterializeActivity: (input: Parameters<typeof stageQualityAttemptMaterializeActivity>[0]) =>
      stageQualityAttemptMaterializeActivity(input, { createStageRouteComposition: host.services.childFactories.createStageRouteComposition }),
    stageQualityAttemptSyncActivity, stageQualityCycleProjectActivity, stageQualityReviewReceiptActivity,
    async codexStageActivity(attempt: TemporalStageAttemptWorkflowInput) {
      const content = resolveStageRunAttemptExecutorContent(attempt);
      const inputs = (attempt.execution_content_binding?.spec.input_artifacts ?? []).map(input => {
        const bytes = fs.readFileSync(fileURLToPath(input.ref));
        assert.equal(sha(bytes), input.sha256);
        return { ref: input.ref, sha256: input.sha256, body: JSON.parse(bytes.toString()) };
      });
      observed.push({ attempt, inputs, content_bound: Boolean(content) });
      const output = attempt.attempt_role === 'producer'
        ? writeJson(path.join(attempt.execution_scope!.canonical_work_item_root!, 'outputs', `${attempt.stage_run_id}.json`), {
          surface_kind: 'synthetic_professional_revision', domain_id: attempt.domain_id, task_id: attempt.task_id,
          stage_run_id: attempt.stage_run_id, consumed: inputs, professional_verdict: 'not_evaluated',
        }) : outputs.get(attempt.stage_run_id!)!;
      if (attempt.attempt_role === 'producer') outputs.set(attempt.stage_run_id!, output);
      const closeout = attempt.attempt_role === 'producer' ? verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: { surface_kind: 'stage_attempt_closeout_packet', stage_attempt_id: attempt.stage_attempt_id,
          stage_run_id: attempt.stage_run_id!, scope_digest: attempt.execution_scope?.scope_digest,
          closeout_refs: [output.ref], closeout_ref_metadata: [{ ref: output.ref, sha256: output.sha256.slice(7) }],
          consumed_refs: inputs.map(item => item.ref), consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
          next_owner: null, domain_ready_verdict: null,
          route_impact: { stage_quality_cycle: { artifact_refs: [output.ref], artifact_hashes: [output.sha256.slice(7)] } },
          authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' } },
        attempt: attempt as unknown as Record<string, unknown>, workspaceRoot: attempt.execution_scope!.workspace_root,
      }) : { surface_kind: 'stage_attempt_closeout_packet', stage_attempt_id: attempt.stage_attempt_id,
        stage_run_id: attempt.stage_run_id!, scope_digest: attempt.execution_scope?.scope_digest,
        closeout_refs: [`synthetic-review:${attempt.stage_attempt_id}`] };
      return { surface_kind: 'temporal_codex_stage_activity_receipt', stage_attempt_id: attempt.stage_attempt_id,
        stage_id: attempt.stage_id, executor_kind: attempt.executor_kind, checkpoint_refs: attempt.checkpoint_refs,
        progress_summary: { thread_id: `synthetic-${attempt.stage_attempt_id}`, execution_session_ref: `synthetic://session/${attempt.stage_attempt_id}` },
        closeout_packet: closeout };
    },
    async domainHandlerDispatchActivity(attempt: TemporalStageAttemptWorkflowInput) {
      const output = outputs.get(attempt.stage_run_id!)!;
      return { surface_kind: 'temporal_domain_handler_dispatch_receipt', closeout_refs: [output.ref],
        consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
        next_owner: attempt.domain_id, domain_ready_verdict: 'domain_gate_pending',
        route_impact: { stage_quality_cycle: { artifact_refs: [output.ref], artifact_hashes: [output.sha256.slice(7)],
          ...(attempt.attempt_role === 'reviewer' ? { outcome: 'pass', findings: [] } : {}) } },
        closeout_packet_surface_kind: 'domain_stage_closeout_packet',
        closeout_ref_metadata: attempt.attempt_role === 'producer' ? attempt.closeout_packet?.closeout_ref_metadata ?? [] : [] };
    },
  };
  try {
    const worker = await Worker.create({ connection: environment.nativeConnection, namespace, taskQueue: queue,
      workflowsPath: path.resolve('src/adapters/execution/family-runtime-temporal-workflows.ts'), activities });
    await worker.runUntil(async () => {
      for (const config of cases) {
        active = { root: path.join(checkoutRoot!, config.repo), binding: useBinding(path.join(checkoutRoot!, config.repo), config.packageId) };
        const workspace = path.join(root, 'workspaces', config.packageId);
        const workItemId = `${config.packageId}-review-fixture`;
        const workItem = path.join(workspace, config.packageId === 'mas' ? 'studies' : 'items', workItemId);
        fs.mkdirSync(workItem, { recursive: true });
        const task = `task:${config.packageId}:original`;
        const scope = createWorkItemExecutionScopeSnapshot({ projectScopeId: `project:${config.packageId}`,
          workspaceBindingId: `binding:${config.packageId}`, domainId: config.domain, workspaceRoot: workspace,
          canonicalWorkItemRoot: workItem, payload: { [config.alias]: workItemId },
          requirement: { kind: 'work_item', alias_fields: [config.alias] } });
        if (config.packageId === 'mas') {
          writeJson(path.join(workspace, 'workspace_index.json'), {
            surface_kind: 'workspace_index', schema_version: 'mas.workspace_index.v1',
            studies: [{ study_id: workItemId, canonical_study_root: path.relative(workspace, workItem),
              lifecycle_ref: 'control/lifecycle.json', lifecycle_state: 'active', status: 'active',
              current_stage_id: null, current_stage_status: null, package_status: 'not_ready' }],
          });
          writeJson(path.join(workItem, 'control/lifecycle.json'), {
            schema_version: 'mas.study_lifecycle_control.v1', surface_kind: 'study_lifecycle_control',
            study_id: workItemId, lifecycle_state: 'active', business_status: 'active', generation: 1,
            lifecycle_ref: 'control/lifecycle.json', package_status: 'not_ready', submission_ready: false,
          });
        }
        const locatorPath = path.join(root, 'launches', config.packageId, 'locator.json');
        const scopePath = path.join(root, 'launches', config.packageId, 'scope.json');
        writeJson(locatorPath, { workspace_root: workspace, domain_pack_root: active.root, [config.alias]: workItemId,
          work_item_root: workItem, execution_scope: scope });
        writeJson(scopePath, scope);
        const request = writeJson(path.join(workItem, 'review', 'request.json'), { task_id: task, domain_id: config.domain, request: 'Produce a synthetic revision for exact-input continuation verification.' });
        const base = ['attempt', 'create', '--domain', config.domain, '--stage', config.stage, '--action', config.action,
          '--provider', 'temporal', '--task', task, '--scope-kind', 'work_item', '--execution-scope-file', scopePath,
          '--workspace-locator-file', locatorPath, '--start'];
        const launch = async (args: string[]) => {
          const cli = await runFamilyRuntime(args, runtimeOptions);
          const surface = cli.family_runtime_stage_run as any;
          assert.equal(surface.durable_launch.start_status, 'started');
          const result = await client.workflow.getHandle(surface.stage_run_input.workflow_id, surface.temporal_start.first_execution_run_id).result() as any;
          assert.ok(['completed', 'completed_with_quality_debt'].includes(result.status), JSON.stringify(result));
          return { surface, result };
        };
        const firstArgs = [...base, '--stage-run-invocation-id', `${config.packageId}:initial`, '--input-artifact-ref', request.ref, '--input-artifact-sha256', request.sha256];
        const first = await launch(firstArgs);
        const firstInput = first.surface.stage_run_input;
        const previousOutput = outputs.get(firstInput.stage_run_id)!;
        const decision = writeJson(path.join(workItem, 'review', 'human-decision.json'), { task_id: task,
          reviewed_stage_run_id: firstInput.stage_run_id, reviewed_artifact_ref: previousOutput.ref,
          reviewed_artifact_sha256: previousOutput.sha256, instruction: 'Revise the synthetic artifact using this exact review decision.',
          quality_approval: false, external_action_authorization: false });
        const nextArgs = [...base, '--stage-run-invocation-id', `${config.packageId}:review-001`, '--human-gate-ref', decision.ref,
          '--input-artifact-ref', decision.ref, '--input-artifact-sha256', decision.sha256,
          '--input-artifact-ref', previousOutput.ref, '--input-artifact-sha256', previousOutput.sha256];
        const next = await launch(nextArgs);
        const nextInput = next.surface.stage_run_input;
        assert.equal(firstInput.task_id, task);
        assert.equal(nextInput.task_id, task);
        assert.notEqual(firstInput.stage_run_id, nextInput.stage_run_id);
        assert.equal(nextInput.execution_scope.scope_digest, firstInput.execution_scope.scope_digest);
        assert.ok(nextInput.stage_run_spec.checkpoint_refs.includes(decision.ref));
        const producer = observed.find(item => item.attempt.stage_run_id === nextInput.stage_run_id && item.attempt.attempt_role === 'producer')!;
        assert.equal(producer.attempt.task_id, task);
        assert.ok(producer.attempt.checkpoint_refs.includes(decision.ref));
        assert.equal(producer.inputs.find((item: any) => item.ref === decision.ref).body.reviewed_stage_run_id, firstInput.stage_run_id);
        const reviewRequired = nextInput.stage_run_spec.quality_policy.body.formal_review.required;
        const reviewer = observed.find(item => item.attempt.stage_run_id === nextInput.stage_run_id && item.attempt.attempt_role === 'reviewer');
        if (reviewRequired) {
          assert.ok(reviewer, `${config.repo}: the domain-required reviewer role must execute.`);
          assert.equal(reviewer.attempt.task_id, task);
          assert.ok(reviewer.attempt.checkpoint_refs.includes(decision.ref));
          assert.ok(reviewer.attempt.execution_content_binding.spec.content_bindings.some((binding: any) =>
            binding.purpose === 'checkpoint' && binding.ref === decision.ref && binding.sha256 === decision.sha256));
          assert.ok(!reviewer.inputs.some((item: any) => item.ref === decision.ref), 'A decision checkpoint is not a reviewer artifact subject.');
        }
        const output = outputs.get(nextInput.stage_run_id)!;
        const finalBytes = fs.readFileSync(fileURLToPath(output.ref));
        assert.equal(sha(finalBytes), output.sha256);
        const final = JSON.parse(finalBytes.toString());
        assert.equal(final.task_id, task);
        assert.ok(final.consumed.some((item: any) => item.ref === decision.ref && item.sha256 === decision.sha256));
        const replay = await runFamilyRuntime(nextArgs, runtimeOptions) as any;
        assert.equal(replay.family_runtime_stage_run.stage_run_input.stage_run_id, nextInput.stage_run_id);
        assert.equal(replay.family_runtime_stage_run.durable_launch.start_status, 'existing');
        const executionCount = observed.length;
        const decisionPath = fileURLToPath(decision.ref);
        const decisionBytes = fs.readFileSync(decisionPath);
        try {
          fs.appendFileSync(decisionPath, '\n');
          const staleArgs = nextArgs.map(value => value === `${config.packageId}:review-001` ? `${config.packageId}:review-stale` : value);
          await assert.rejects(() => runFamilyRuntime(staleArgs, runtimeOptions), (error: any) =>
            error.details?.failure_code === 'stage_run_artifact_byte_identity_mismatch');
          assert.equal(observed.length, executionCount);
        } finally { fs.writeFileSync(decisionPath, decisionBytes); }
        const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
        try {
          const rows = db.prepare('SELECT task_id, stage_run_id, input_artifact_refs_json, checkpoint_refs_json FROM stage_attempts WHERE stage_run_id = ?').all(nextInput.stage_run_id) as any[];
          assert.ok(rows.length > 0);
          assert.ok(rows.every(row => row.task_id === task));
        } finally { db.close(); }
        results.push({ repo: config.repo, source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: active.root, encoding: 'utf8' }).trim(),
          domain_id: config.domain, task_id: task, original_stage_run_id: firstInput.stage_run_id, next_stage_run_id: nextInput.stage_run_id,
          execution_scope_digest: scope.scope_digest, decision, previous_artifact: previousOutput, output,
          next_status: next.result.status, replay_status: 'existing', task_preserved: true, feedback_consumed: true,
          review_required_by_domain: reviewRequired, reviewer_task_preserved: reviewer ? true : null,
          reviewer_subject_excludes_decision: reviewer ? true : null, stale_decision_rejected_before_execution: true,
          real_temporal_server: true, real_workflows_and_persistence: true, synthetic_model_executor: true, professional_quality: 'not_evaluated' });
        if (evidenceRoot) {
          fs.mkdirSync(path.join(evidenceRoot, config.packageId), { recursive: true });
          for (const [name, value] of Object.entries({ first: first.surface, next: next.surface, state: next.result, output: final }))
            fs.writeFileSync(path.join(evidenceRoot, config.packageId, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
          for (const [name, artifact] of Object.entries({ decision, previous: previousOutput }))
            fs.copyFileSync(fileURLToPath(artifact.ref), path.join(evidenceRoot, config.packageId, `${name}.json`));
        }
      }
    });
  } finally {
    if (evidenceRoot) {
      fs.mkdirSync(evidenceRoot, { recursive: true });
      fs.writeFileSync(path.join(evidenceRoot, 'summary.json'), `${JSON.stringify({ cases: results, external_actions_performed: false, acceptance_layer: 'local_temporal_synthetic_executor_actual_domain_sources' }, null, 2)}\n`);
    }
    registerAgentPackageReadinessPort({ readStatus: runOplAgentPackageStatus });
    await connection.close();
    await host.dispose();
    await environment.teardown();
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
