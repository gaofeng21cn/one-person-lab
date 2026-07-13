import {
  assert,
  fs,
  os,
  path,
  runCliFailure,
  test,
} from '../../helpers.ts';

test('packages update reports lock contention without running a parallel writer', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-lock-'));
  const stateRoot = path.join(homeRoot, 'state');
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(stateRoot, 'managed-update-kernel.lock'),
    JSON.stringify({
      lock_id: 'opl_managed_updater_kernel.global',
      acquired_at: new Date().toISOString(),
      operation: 'apply',
      pid: 999999,
    }),
    'utf8',
  );

  try {
    const failure = runCliFailure(['packages', 'update'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: stateRoot,
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
    }) as {
      status: number;
      payload: {
        error: {
          code: string;
          message: string;
          details: {
            surface_id: string;
            lock_status: string;
            repair_action: string;
          };
        };
      };
    };

    assert.equal(failure.status, 3);
    assert.equal(failure.payload.error.code, 'managed_update_lock_contention');
    assert.equal(failure.payload.error.details.surface_id, 'opl_managed_updater_kernel');
    assert.equal(failure.payload.error.details.lock_status, 'held');
    assert.equal(failure.payload.error.details.repair_action, 'retry_after_current_update_finishes_or_remove_stale_lock_after_timeout');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
