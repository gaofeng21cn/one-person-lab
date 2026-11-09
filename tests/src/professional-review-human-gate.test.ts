import {
  assert, fs, os, path, test, pathToFileURL, runFamilyRuntime,
  domainPackRoot, workspaceRoot, manifestFixture, writeFixture,
  binding, packageUseBinding, temporalStartReceipt,
  stageQualityAttemptMaterializeActivity, resolveStageRunAttemptExecutorContent,
} from './family-runtime-stage-run-launch-cases/shared.ts';
import { createCordisBaseHeadlessComposition } from '../../src/host/composition-profiles.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';

test('StageRun retains human decisions through child Attempts and replay identity', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-gate-state-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const firstDecision = writeFixture(workspaceRoot, 'artifacts/human-first.json', '{"decision":"revise"}\n');
  const laterDecision = writeFixture(workspaceRoot, 'artifacts/human-later.json', '{"decision":"accept"}\n');
  const firstRef = pathToFileURL(firstDecision.filePath).href;
  const laterRef = pathToFileURL(laterDecision.filePath).href;
  const host = await createCordisBaseHeadlessComposition();
  let starts = 0;
  const runtime = {
    createStageRouteComposition: host.services.childFactories.createStageRouteComposition,
    stageRunRuntime: {
      ensurePackageLaunchReady: (async () => ({
        runtime_source_readiness: { status: 'current', checkout_path: domainPackRoot, operational_ready: true },
        package_use_binding: packageUseBinding(),
      })) as any,
      resolveStageBinding: () => binding(),
      startWorkflow: async (input: any) => { starts += 1; return temporalStartReceipt(input); },
      describeWorkflow: async (input: any) => temporalStartReceipt(input),
    },
  };
  const baseArgs = ['attempt', 'create', '--domain', 'medautoscience', '--stage', 'intake',
    '--provider', 'temporal', '--workspace-locator', JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: domainPackRoot }),
    '--source-fingerprint', manifestFixture.sha256, '--task', 'task:original-review',
    '--stage-run-invocation-id', 'human-decision-checkpoints',
    '--input-artifact-ref', firstRef, '--input-artifact-sha256', firstDecision.sha256,
    '--input-artifact-ref', laterRef, '--input-artifact-sha256', laterDecision.sha256, '--start'];
  try {
    const args = [...baseArgs, '--human-gate-ref', firstRef];
    const first = await runFamilyRuntime(args, runtime) as any;
    const launch = first.family_runtime_stage_run;
    assert.equal(launch.durable_launch.start_status, 'started');
    assert.notEqual(launch.stage_run_input.stage_packet_ref, firstRef);
    assert.ok(launch.stage_run_input.checkpoint_refs.includes(firstRef));
    assert.ok(launch.stage_run_input.stage_run_spec.checkpoint_refs.includes(firstRef));
    const replay = await runFamilyRuntime(args, runtime) as any;
    assert.equal(replay.family_runtime_stage_run.durable_launch.start_status, 'existing');
    assert.equal(replay.family_runtime_stage_run.stage_run_input.stage_run_spec_sha256,
      launch.stage_run_input.stage_run_spec_sha256);
    assert.equal(starts, 1);
    await assert.rejects(() => runFamilyRuntime([...baseArgs, '--human-gate-ref', laterRef], runtime),
      (error: any) => error.details?.failure_code === 'stage_run_invocation_spec_conflict');
    await assert.rejects(() => runFamilyRuntime(baseArgs, runtime),
      (error: any) => error.details?.failure_code === 'stage_run_invocation_spec_conflict');

    const duplicateArgs = baseArgs.map(value => value === 'human-decision-checkpoints' ? 'duplicate-decision-checkpoints' : value);
    const duplicate = await runFamilyRuntime([...duplicateArgs, '--checkpoint-ref', firstRef, '--human-gate-ref', firstRef], runtime) as any;
    assert.notEqual(duplicate.family_runtime_stage_run.stage_run_input.stage_packet_ref, firstRef);
    assert.equal(duplicate.family_runtime_stage_run.stage_run_input.checkpoint_refs.filter((ref: string) => ref === firstRef).length, 1);

    const stageRun = launch.stage_run_input;
    const producer = await stageQualityAttemptMaterializeActivity({
      stage_run: stageRun, quality_cycle_id: 'human-decision-child-attempts',
      attempt_role: 'producer', quality_round_index: 0,
      artifact_refs: stageRun.artifact_refs, artifact_hashes: stageRun.artifact_hashes,
      artifact_identity_receipt_refs: stageRun.artifact_identity_receipt_refs,
    }, runtime.stageRunRuntime);
    resolveStageRunAttemptExecutorContent(producer.workflow_input);
    assert.equal(producer.workflow_input.task_id, 'task:original-review');
    assert.ok(producer.workflow_input.checkpoint_refs?.includes(firstRef));

    const producedArtifact = writeFixture(workspaceRoot, 'artifacts/revised-output.json', '{"revision":"applied"}\n');
    const producedRef = pathToFileURL(producedArtifact.filePath).href;
    const closeout = verifyStageQualityCloseoutArtifactIdentity({
      attempt: producer.workflow_input,
      workspaceRoot,
      closeoutPacket: {
        surface_kind: 'stage_attempt_closeout_packet',
        stage_attempt_id: producer.workflow_input.stage_attempt_id,
        closeout_refs: [producedRef],
        closeout_ref_metadata: [{ ref: producedRef, sha256: producedArtifact.sha256 }],
        consumed_refs: [firstRef], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
        next_owner: null, domain_ready_verdict: null,
        route_impact: { stage_quality_cycle: { artifact_refs: [producedRef], artifact_hashes: [producedArtifact.sha256] } },
        authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' },
      },
    });
    const reviewerInput = {
      stage_run: stageRun, quality_cycle_id: 'human-decision-child-attempts',
      attempt_role: 'reviewer' as const, quality_round_index: 0,
      parent_attempt_ref: producer.attempt_ref, artifact_producer_attempt_ref: producer.attempt_ref,
      artifact_refs: [producedRef], artifact_hashes: [producedArtifact.sha256],
      artifact_identity_receipt_refs: [String(closeout?.closeout_ref_metadata?.[0]?.artifact_identity_receipt_ref)],
    };
    const reviewer = await stageQualityAttemptMaterializeActivity(reviewerInput, runtime.stageRunRuntime);
    resolveStageRunAttemptExecutorContent(reviewer.workflow_input);
    assert.equal(reviewer.workflow_input.task_id, 'task:original-review');
    assert.deepEqual(reviewer.workflow_input.input_artifact_refs, [producedRef]);
    assert.deepEqual(reviewer.workflow_input.execution_content_binding?.spec.input_artifacts.map(artifact => artifact.ref), [producedRef]);
    assert.ok(reviewer.workflow_input.checkpoint_refs?.includes(firstRef));
    assert.equal(reviewer.workflow_input.execution_content_binding?.spec.content_bindings.find(
      entry => entry.purpose === 'checkpoint' && entry.ref === firstRef,
    )?.sha256, firstDecision.sha256);
    assert.ok(!reviewer.workflow_input.execution_content_binding?.spec.content_bindings.some(
      entry => entry.ref === laterRef,
    ));

    fs.writeFileSync(firstDecision.filePath, '{"decision":"changed after launch"}\n');
    await assert.rejects(() => stageQualityAttemptMaterializeActivity({
      ...reviewerInput, quality_round_index: 1,
    }, runtime.stageRunRuntime), (error: any) => error.details?.failure_code === 'stage_run_content_binding_stale');
  } finally {
    await host.dispose();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
