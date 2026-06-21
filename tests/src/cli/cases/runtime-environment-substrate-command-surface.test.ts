import { assert, runCli, test } from '../helpers.ts';

test('runtime env CLI exposes fail-closed readback skeletons without materializing runtime roots', () => {
  const inspect = runCli([
    'runtime',
    'env',
    'inspect',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
  ]).runtime_environment;

  assert.equal(inspect.surface_kind, 'opl_runtime_environment_readback');
  assert.equal(inspect.command, 'inspect');
  assert.equal(inspect.domain_id, 'mas');
  assert.equal(inspect.profile_id, 'analysis');
  assert.equal(inspect.platform_id, 'macos-arm64');
  assert.equal(inspect.implementation_status, 'contract_and_readback_skeleton');
  assert.equal(inspect.target_planned, true);
  assert.equal(inspect.dry_run, true);
  assert.equal(inspect.can_claim_runtime_ready, false);
  assert.equal(inspect.can_claim_domain_ready, false);
  assert.equal(inspect.can_claim_app_release_ready, false);
  assert.equal(inspect.authority_boundary.can_claim_runtime_materialized_ready, false);
  assert.equal(inspect.materialization_status.status, 'not_materialized');
  assert.equal(inspect.materialization_status.reason, 'skeleton_readback_only');

  const lock = runCli([
    'runtime',
    'env',
    'lock',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
  ]).runtime_environment;
  assert.equal(lock.command, 'lock');
  assert.equal(lock.lock.status, 'planned_not_generated');
  assert.equal(lock.lock.writes_runtime_root, false);

  const cacheStatus = runCli(['runtime', 'env', 'cache', 'status']).runtime_environment;
  assert.equal(cacheStatus.command, 'cache status');
  assert.equal(cacheStatus.cache.status, 'planned_not_inspected');
  assert.equal(cacheStatus.cache.cache_hit_counts_as_ready, false);
});

test('runtime env doctor and run-context preserve no-authority boundary', () => {
  const doctor = runCli(['runtime', 'env', 'doctor']).runtime_environment;
  assert.equal(doctor.command, 'doctor');
  assert.equal(doctor.doctor.status, 'planned_not_executed');
  assert.equal(doctor.doctor.findings[0].severity, 'info');
  assert.equal(doctor.doctor.findings[0].can_block_domain_progress, false);

  const runContext = runCli([
    'runtime',
    'env',
    'run-context',
    '--domain',
    'bookforge',
    '--profile',
    'publication_proof',
  ]).runtime_environment;
  assert.equal(runContext.command, 'run-context');
  assert.equal(runContext.domain_id, 'bookforge');
  assert.equal(runContext.profile_id, 'publication_proof');
  assert.equal(runContext.run_context.status, 'planned_not_bound');
  assert.equal(runContext.run_context.writes_domain_truth, false);
  assert.equal(runContext.run_context.writes_runtime_root, false);
});
