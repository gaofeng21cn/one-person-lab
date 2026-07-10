import { spawnSync } from 'node:child_process';

import {
  assert,
  cliPath,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

test('family-runtime worker status exposes a fail-closed public envelope', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-status-'));
  try {
    const worker = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      {
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    ).family_runtime_worker;

    assert.equal(worker.surface_id, 'opl_family_runtime_worker');
    assert.equal(worker.action, 'status');
    assert.equal(worker.lifecycle_status, 'not_configured');
    assert.deepEqual(worker.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const scenario of [
  {
    name: 'not configured',
    env: { OPL_TEMPORAL_ADDRESS: '', TEMPORAL_ADDRESS: '' },
    lifecycleStatus: 'not_configured',
  },
  {
    name: 'server unreachable',
    env: { OPL_TEMPORAL_ADDRESS: '127.0.0.1:9', TEMPORAL_ADDRESS: '' },
    lifecycleStatus: 'server_unreachable',
  },
] as const) {
  test(`family-runtime worker start fails closed when Temporal is ${scenario.name}`, () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-start-blocked-'));
    try {
      const result = spawnSync(process.execPath, [
        '--experimental-strip-types',
        cliPath,
        'family-runtime',
        'worker',
        'start',
        '--provider',
        'temporal',
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_STATE_DIR: stateRoot,
          ...scenario.env,
        },
      });
      const payload = parseJsonText(result.stderr) as Record<string, any>;

      assert.equal(result.status, 3);
      assert.equal(payload.error.code, 'contract_shape_invalid');
      assert.equal(payload.error.details.lifecycle_status, scenario.lifecycleStatus);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
}
