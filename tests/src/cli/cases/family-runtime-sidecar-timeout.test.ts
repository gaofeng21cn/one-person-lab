import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_RUNTIME_SIDECAR_TIMEOUT_MS: '100',
    ...extra,
  };
}

function hangingSidecarFixture(name: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-family-runtime-${name}-timeout-`));
  const sidecarPath = path.join(fixtureRoot, name);
  fs.writeFileSync(
    sidecarPath,
    `#!/usr/bin/env bash
set -euo pipefail
sleep 30
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, sidecarPath };
}

test('family-runtime intake fails closed when a domain export sidecar times out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-timeout-state-'));
  const exportSidecar = hangingSidecarFixture('export');
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'timeout-test',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportSidecar.sidecarPath,
    }));
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(exportResult.status, 'timeout');
    assert.match(exportResult.error, /Domain export timed out after 100ms/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportSidecar.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch fails closed when a domain dispatch sidecar times out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-timeout-state-'));
  const dispatchSidecar = hangingSidecarFixture('dispatch');
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchSidecar.sidecarPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"study_id":"DM002"}',
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'timeout-test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', enqueue.family_runtime_enqueue.task.task_id], env)
      .family_runtime_task.task;

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'retry_waiting');
    assert.equal(tick.family_runtime_tick.dispatches[0].exit_code, 124);
    assert.match(tick.family_runtime_tick.dispatches[0].error, /Domain dispatch timed out after 100ms/);
    assert.equal(task.status, 'retry_waiting');
    assert.match(task.last_error, /Domain dispatch timed out after 100ms/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatchSidecar.fixtureRoot, { recursive: true, force: true });
  }
});
