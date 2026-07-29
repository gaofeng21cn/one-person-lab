import {
  assert,
  fs,
  os,
  path,
  runCliFailure,
  spawn,
  test,
} from '../../helpers.ts';
import { FrameworkContractError } from '../../../../../src/kernel/contract-validation.ts';
import { acquireManagedUpdateLock } from '../../../../../src/modules/connect/managed-update-lock.ts';

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
      // Keep the owner alive so this fixture exercises genuine contention.
      pid: process.pid,
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

test('managed update reclaims a recent lock whose owner process is gone', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-orphan-lock-'));
  const stateRoot = path.join(homeRoot, 'state');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockFile = path.join(stateRoot, 'managed-update-kernel.lock');
  fs.writeFileSync(
    lockFile,
    JSON.stringify({
      lock_id: 'opl_managed_updater_kernel.global',
      acquired_at: new Date().toISOString(),
      operation: 'apply',
      pid: 999999,
      process_identity: {
        pid: 999999,
        proc_start_time_ticks: '1',
        boot_id: 'dead-boot',
      },
    }),
    'utf8',
  );

  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousHome = process.env.HOME;
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.HOME = homeRoot;
  try {
    const lock = acquireManagedUpdateLock({ operation: 'apply' });
    assert.equal(lock.status, 'acquired');
    const receipt = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(receipt.pid, process.pid);
    assert.equal(receipt.process_identity.pid, process.pid);
    if (process.platform === 'linux') {
      assert.equal(typeof receipt.process_identity.proc_start_time_ticks, 'string');
      assert.equal(typeof receipt.process_identity.boot_id, 'string');
    } else {
      assert.equal(receipt.process_identity.proc_start_time_ticks, null);
      assert.equal(receipt.process_identity.boot_id, null);
    }
    lock.release();
    assert.equal(fs.existsSync(lockFile), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('same pid handling follows the available process identity', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-same-pid-'));
  const stateRoot = path.join(homeRoot, 'state');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockFile = path.join(stateRoot, 'managed-update-kernel.lock');
  fs.writeFileSync(
    lockFile,
    JSON.stringify({
      lock_id: 'opl_managed_updater_kernel.global',
      acquired_at: new Date().toISOString(),
      operation: 'apply',
      pid: process.pid,
      process_identity: {
        pid: process.pid,
        proc_start_time_ticks: 'different-start-time',
        boot_id: 'different-boot',
      },
    }),
    'utf8',
  );

  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousHome = process.env.HOME;
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.HOME = homeRoot;
  try {
    if (process.platform !== 'linux') {
      assert.throws(
        () => acquireManagedUpdateLock({ operation: 'apply' }),
        (error: unknown) => error instanceof FrameworkContractError
          && error.code === 'managed_update_lock_contention',
      );
      assert.equal(fs.existsSync(lockFile), true);
      return;
    }
    const lock = acquireManagedUpdateLock({ operation: 'apply' });
    assert.equal(lock.status, 'acquired');
    lock.release();
    assert.equal(fs.existsSync(lockFile), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('concurrent reclaim has one lock winner', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-concurrent-reclaim-'));
  const stateRoot = path.join(homeRoot, 'state');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockFile = path.join(stateRoot, 'managed-update-kernel.lock');
  fs.writeFileSync(
    lockFile,
    JSON.stringify({
      lock_id: 'opl_managed_updater_kernel.global',
      acquired_at: new Date().toISOString(),
      operation: 'apply',
      pid: 999999,
      process_identity: {
        pid: 999999,
        proc_start_time_ticks: '1',
        boot_id: 'dead-boot',
      },
    }),
    'utf8',
  );

  const scriptFile = path.join(homeRoot, 'acquire-lock.ts');
  fs.writeFileSync(
    scriptFile,
    [
      `import { acquireManagedUpdateLock } from ${JSON.stringify(path.join(process.cwd(), 'src/modules/connect/managed-update-lock.ts'))};`,
      'const lock = acquireManagedUpdateLock({ operation: "apply" });',
      'process.stdout.write("acquired\\n");',
      'setTimeout(() => lock.release(), 300);',
    ].join('\n'),
    'utf8',
  );
  const env = {
    ...process.env,
    HOME: homeRoot,
    OPL_STATE_DIR: stateRoot,
  };
  const startChild = () => spawn(process.execPath, ['--experimental-strip-types', scriptFile], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const children = [startChild(), startChild()];
  const results = await Promise.all(children.map((child) => new Promise<{ code: number | null; stdout: string }>((resolve) => {
    let stdout = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout }));
  })));
  assert.equal(results.filter((result) => result.code === 0 && result.stdout.includes('acquired')).length, 1);
  assert.equal(fs.existsSync(lockFile), false);
  fs.rmSync(homeRoot, { recursive: true, force: true });
});
