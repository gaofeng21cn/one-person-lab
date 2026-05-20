import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('framework production-closeout times out stalled domain manifests as typed blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-closeout-timeout-state-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} -e "setTimeout(() => {}, 30000)"`,
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const startedAt = Date.now();
    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_STATE_DIR: stateRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '100',
    }).production_functional_closeout;
    const elapsedMs = Date.now() - startedAt;
    const mas = closeout.domains.find((entry: { project_id: string }) =>
      entry.project_id === 'medautoscience'
    );

    assert.equal(mas.manifest_status, 'command_timeout');
    assert.equal(mas.manifest_error.code, 'command_timeout');
    assert.equal(mas.manifest_error.timeout_ms, 100);
    assert.match(mas.manifest_error.manifest_command, /setTimeout/);
    assert.equal(mas.manifest_error.repair_command, 'OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=10000 opl framework production-closeout');
    assert.match(mas.manifest_error.next_action, /Increase OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS/);
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'medautoscience:manifest_not_resolved'
      ),
      true,
    );
    const timeoutBlocker = closeout.typed_blockers.find((blocker: { blocker_id: string }) =>
      blocker.blocker_id === 'medautoscience:manifest_not_resolved'
    );
    assert.equal(timeoutBlocker.blocker_kind, 'domain_manifest_timeout');
    assert.equal(timeoutBlocker.repair_command, 'OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS=10000 opl framework production-closeout');
    assert.equal(timeoutBlocker.timeout_ms, 100);
    assert.match(timeoutBlocker.manifest_command, /setTimeout/);
    assert.match(timeoutBlocker.next_action, /Increase OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS/);
    assert.equal(closeout.authority_boundary.opl_writes_domain_truth, false);
    assert.equal(elapsedMs < 15000, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
