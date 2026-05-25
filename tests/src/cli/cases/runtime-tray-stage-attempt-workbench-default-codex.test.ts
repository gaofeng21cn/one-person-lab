import { assert, createFamilyContractsFixtureRoot, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime snapshot projects queued MAS default Codex dispatch packet and workspace refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-default-codex-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const dispatchFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-default-codex-dispatch-'));
  const dispatchPath = path.join(dispatchFixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "dispatch": {
    "execution_policy": "opl_default_executor_stage_attempt_admission",
    "result": {"surface": "default_executor_dispatch_request_admission", "status": "admitted", "next_owner": "write"}
  }
}))
PY
`,
    { mode: 0o755 },
  );
  try {
    const dispatchRef = 'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    };
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        source_refs: [{ role: 'default_executor_dispatch_request', ref: dispatchRef, exists: true, body_included: false }],
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:runtime-snapshot',
    ], env);
    runCli(['family-runtime', 'tick', '--source', 'test'], env);

    const snapshot = runCli(['runtime', 'snapshot'], env).runtime_tray_snapshot;
    const attempt = snapshot.stage_attempt_workbench.attempts.find(
      (entry: { task_id?: string }) => entry.task_id === enqueue.family_runtime_enqueue.task.task_id,
    );

    assert.ok(attempt);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.deepEqual(attempt.control_loop_summary.trigger.stage_packet_refs, [dispatchRef]);
    assert.equal(attempt.workspace_source_intake.profile_ref, '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml');
    assert.deepEqual(attempt.workspace_source_intake.source_refs, [dispatchRef]);
    assert.deepEqual(attempt.workspace_source_intake.checkpoint_refs, [dispatchRef]);
    assert.equal(attempt.control_loop_summary.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(attempt.completion_boundary.provider_completion_is_domain_ready, false);

    const task = runCli(['family-runtime', 'queue', 'inspect', enqueue.family_runtime_enqueue.task.task_id], env)
      .family_runtime_task;
    const stageAttempt = task.stage_attempts[0];
    assert.equal(task.task.status, 'blocked');
    assert.equal(task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(stageAttempt.status, 'blocked');
    assert.match(stageAttempt.blocked_reason, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(stageAttempt.closeout_receipt_status, null);
    assert.deepEqual(stageAttempt.closeout_refs, []);
    assert.deepEqual(stageAttempt.route_impact, {});
    assert.equal(attempt.control_loop_summary.authority_boundary.can_write_domain_truth, false);
    assert.equal(attempt.control_loop_summary.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(attempt.control_loop_summary.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(attempt.current_control_state.surface_kind, 'opl_current_control_state');
    assert.equal(attempt.current_control_state.reconciliation_status, 'blocked');
    assert.equal(attempt.current_control_state.authority_boundary.reads_domain_latest_or_dispatch_latest, false);
    assert.equal(attempt.current_control_state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(attempt.current_control_state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(attempt.current_control_state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(attempt.current_control_state, 'artifact_ready'), false);
    assert.equal(attempt.completion_boundary.provider_completion, 'not_completed');
    assert.equal(attempt.control_loop_summary.state.blocker_status, 'blocked_by_attention');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dispatchFixtureRoot, { recursive: true, force: true });
  }
});
