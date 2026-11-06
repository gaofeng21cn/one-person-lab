import {
  assert, fs, os, path, test, binding, packageUseBinding, workspaceLocator,
  stageRunInput, domainPackRoot, buildCliStageRunInvocationId, stageRunSpecSha256,
  stageAttemptExecutionContentBindingSha256, registerStageRunInConfiguredState,
  requireTemporalStageRunWorkflowInputLaunchable, stageQualityAttemptMaterializeActivity,
  resolveStageRunAttemptExecutorContent,
} from './family-runtime-stage-run-launch-cases/shared.ts';

test('native package refresh preserves task identity and binds new execution bytes', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-closure-identity-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const oldClosure = packageUseBinding();
    const newClosure = { ...packageUseBinding({ packageVersion: '0.2.2' }),
      core_skill_tree_digest: 'a'.repeat(64), skill_tree_digest: 'b'.repeat(64) };
    const oldLocator = { ...workspaceLocator(oldClosure), native_package_closure: oldClosure };
    const newLocator = { ...workspaceLocator(newClosure), native_package_closure: newClosure };
    const invocation = (locator: Record<string, unknown>) => buildCliStageRunInvocationId({
      domainId: 'medautoscience', stageId: 'intake', workspaceLocator: locator,
      actionId: 'draft-paper', taskId: 'task:one',
    });
    assert.equal(invocation(oldLocator), invocation(newLocator));
    const parent = stageRunInput({ invocationId: invocation(oldLocator), locator: oldLocator });
    const refreshed = stageRunInput({ invocationId: invocation(newLocator), locator: newLocator });
    assert.equal(parent.stage_run_id, refreshed.stage_run_id);
    assert.notEqual(parent.stage_run_spec_sha256, refreshed.stage_run_spec_sha256);
    assert.equal(parent.stage_run_spec.workspace_identity.native_package_closure, undefined);

    // Emulate a persisted pre-fix parent without rewriting its original bytes/hash.
    parent.stage_run_spec.workspace_identity.native_package_closure = oldClosure;
    parent.stage_run_spec_sha256 = stageRunSpecSha256(parent.stage_run_spec);
    const historicalHash = parent.stage_run_spec_sha256;
    assert.doesNotThrow(() => requireTemporalStageRunWorkflowInputLaunchable(parent));
    registerStageRunInConfiguredState(parent);
    const materialized = await stageQualityAttemptMaterializeActivity({
      stage_run: parent, quality_cycle_id: 'sqc_native_closure_refresh',
      attempt_role: 'producer', quality_round_index: 0,
      artifact_refs: parent.artifact_refs ?? [], artifact_hashes: parent.artifact_hashes ?? [],
      artifact_identity_receipt_refs: parent.artifact_identity_receipt_refs ?? [],
    }, {
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { status: 'current', checkout_path: domainPackRoot, operational_ready: true },
        configured_carrier: { status: 'installed', executor: { status: 'callable' }, plugin_source_path: domainPackRoot },
        package_use_binding: newClosure, native_package_closure: newClosure,
      }),
      resolveStageBinding: () => binding(),
    });
    const child = materialized.workflow_input;
    const execution = child.execution_content_binding!;
    assert.equal(child.stage_run_spec_sha256, historicalHash);
    assert.equal(stageRunSpecSha256(child.stage_run_spec!), historicalHash);
    assert.equal((execution.spec.package_closure!.root_package as any).package_version, '0.2.2');
    assert.doesNotThrow(() => resolveStageRunAttemptExecutorContent(child));

    // Stable workspace changes and package mismatch remain invalid, even when rehashed.
    for (const mutation of ['workspace', 'package']) {
      const altered = structuredClone(child);
      const binding = altered.execution_content_binding!;
      if (mutation === 'workspace') binding.spec.workspace_identity.workspace_root = '/tmp/another-task';
      else (binding.spec.package_closure!.root_package as any).package_version = 'unbound';
      binding.spec_sha256 = stageRunSpecSha256(binding.spec);
      binding.binding_sha256 = stageAttemptExecutionContentBindingSha256(binding);
      assert.throws(() => resolveStageRunAttemptExecutorContent(altered), (error: any) => {
        assert.equal(error.details.failure_code, 'stage_attempt_execution_content_binding_mismatch');
        return true;
      });
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
