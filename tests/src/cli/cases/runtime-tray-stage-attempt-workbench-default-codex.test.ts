import { assert, createFamilyContractsFixtureRoot, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime snapshot keeps queued MAS default Codex dispatch fail-closed when Temporal provider is offline', () => {
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
    const task = runCli(['family-runtime', 'queue', 'inspect', enqueue.family_runtime_enqueue.task.task_id], env)
      .family_runtime_task;
    assert.equal(snapshot.runtime_health.status, 'offline');
    assert.equal(snapshot.runtime_health.provider_kind, 'temporal');
    assert.equal(snapshot.runtime_health.provider_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.summary.total, 0);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts, []);

    assert.equal(task.task.status, 'queued');
    assert.equal(task.task.dead_letter_reason, null);
    assert.equal(task.stage_attempts.length, 0);
    assert.equal(task.task.payload.profile, '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml');
    assert.equal(task.task.payload.dispatch_ref, dispatchRef);
    assert.deepEqual(task.task.payload.source_refs, [
      {
        role: 'default_executor_dispatch_request',
        ref: dispatchRef,
        exists: true,
        body_included: false,
      },
    ]);
    assert.equal(task.task.current_control_state.surface_kind, 'opl_current_control_state');
    assert.equal(task.task.current_control_state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(task.task.current_control_state.active_stage_attempt_id, null);
    assert.equal(task.task.current_control_state.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      task.task.current_control_state.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(
      snapshot.attention_items.some(
        (item: { item_id: string; action_kind: string; action_owner: string }) =>
          item.item_id === 'opl:provider-continuous-proof:temporal'
          && item.action_kind === 'infrastructure_recovery'
          && item.action_owner === 'infrastructure',
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dispatchFixtureRoot, { recursive: true, force: true });
  }
});
