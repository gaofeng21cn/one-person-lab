import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function stateEnv(label: string) {
  return {
    OPL_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), `opl-runtime-env-${label}-`)),
  };
}

test('runtime env CLI exposes deterministic dry-run projections without materializing runtime roots', () => {
  const env = stateEnv('dry-run-');
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
  ], env).runtime_environment;

  assert.equal(inspect.surface_kind, 'opl_runtime_environment_readback');
  assert.equal(inspect.command, 'inspect');
  assert.equal(inspect.domain_id, 'mas');
  assert.equal(inspect.profile_id, 'analysis');
  assert.equal(inspect.platform_id, 'macos-arm64');
  assert.equal(inspect.implementation_status, 'dry_run_lock_manifest_inventory_projection');
  assert.equal(inspect.target_planned, true);
  assert.equal(inspect.dry_run, true);
  assert.equal(inspect.can_claim_runtime_ready, false);
  assert.equal(inspect.can_claim_domain_ready, false);
  assert.equal(inspect.can_claim_app_release_ready, false);
  assert.equal(inspect.authority_boundary.can_claim_runtime_materialized_ready, false);
  assert.equal(inspect.materialization_status.status, 'not_materialized');
  assert.equal(inspect.materialization_status.reason, 'dry_run_projection_only');
  assert.match(inspect.runtime_lock_ref, /^runtime-lock:mas\/analysis\/macos-arm64:sha256:/);
  assert.match(inspect.bundle_manifest_ref, /^runtime-bundle:mas\/analysis\/macos-arm64:sha256:/);

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
  ], env).runtime_environment;
  assert.equal(lock.command, 'lock');
  assert.equal(lock.lock.status, 'dry_run_lock_projected');
  assert.equal(lock.lock.writes_runtime_root, false);
  assert.match(lock.lock.lock_ref, /^runtime-lock:mas\/analysis\/macos-arm64:sha256:/);
  assert.match(lock.lock.lock_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(lock.lock.descriptor_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(lock.lock.layer_count, 6);
  assert.equal(lock.lock.layer_graph[0].layer_type, 'base-toolchain');
  assert.equal(
    lock.lock.layer_graph.every((layer: { archive_present: boolean }) => layer.archive_present === false),
    true,
  );

  const cacheStatus = runCli(['runtime', 'env', 'cache', 'status'], env).runtime_environment;
  assert.equal(cacheStatus.command, 'cache status');
  assert.equal(cacheStatus.cache.status, 'dry_run_inventory_projection');
  assert.equal(cacheStatus.cache.cache_hit_counts_as_ready, false);
  assert.equal(cacheStatus.cache.inventory.scanned_filesystem, false);
});

test('runtime env build materialize and cache prune expose fail-closed materializer path', () => {
  const env = stateEnv('materializer-');
  const build = runCli([
    'runtime',
    'env',
    'build',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
  ], env).runtime_environment;

  assert.equal(build.command, 'build');
  assert.equal(build.build_plan.status, 'dry_run_build_plan_projected');
  assert.equal(build.build_plan.writes_runtime_root, false);
  assert.equal(build.build_plan.creates_archive, false);
  assert.equal(build.build_plan.can_claim_runtime_ready, false);
  assert.equal(build.bundle_manifest.status, 'dry_run_bundle_manifest_projected');
  assert.match(build.bundle_manifest.bundle_ref, /^runtime-bundle:mas\/analysis\/macos-arm64:sha256:/);
  assert.equal(build.bundle_manifest.layer_count, 6);
  assert.equal(build.bundle_manifest.all_layer_archives_present, false);
  assert.equal(build.bundle_manifest.can_claim_runtime_ready, false);

  const dryRun = runCli([
    'runtime',
    'env',
    'materialize',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
    '--dry-run',
  ], env).runtime_environment;
  assert.equal(dryRun.command, 'materialize');
  assert.equal(dryRun.materialization_plan.status, 'dry_run_materialization_plan_projected');
  assert.equal(dryRun.materialization_plan.target_pointer, 'current');
  assert.equal(dryRun.materialization_plan.applied, false);
  assert.equal(dryRun.materialization_plan.can_apply, false);
  assert.equal(dryRun.materialization_plan.writes_runtime_root, false);
  assert.equal(dryRun.materialization_plan.apply_blocker_ref, null);

  const apply = runCli([
    'runtime',
    'env',
    'materialize',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
    '--target',
    'staged',
    '--apply',
  ], env).runtime_environment;
  assert.equal(apply.materialization_plan.status, 'blocked_apply_requires_materializer_receipt');
  assert.equal(apply.materialization_plan.target_pointer, 'staged');
  assert.equal(apply.materialization_plan.requested_apply, true);
  assert.equal(apply.materialization_plan.applied, false);
  assert.equal(apply.materialization_plan.can_apply, false);
  assert.match(apply.materialization_plan.apply_blocker_ref, /^runtime-blocker-ref:opl-runtime-env/);

  const inventory = runCli(['runtime', 'env', 'cache', 'inventory'], env).runtime_environment;
  assert.equal(inventory.command, 'cache inventory');
  assert.equal(inventory.cache_inventory.status, 'dry_run_inventory_projection');
  assert.equal(inventory.cache_inventory.scanned_filesystem, false);
  assert.equal(inventory.cache_inventory.cache_hit_counts_as_ready, false);

  const pruneDryRun = runCli(['runtime', 'env', 'cache', 'prune', '--dry-run'], env).runtime_environment;
  assert.equal(pruneDryRun.command, 'cache prune');
  assert.equal(pruneDryRun.cleanup_plan.status, 'dry_run_prune_plan_projected');
  assert.equal(pruneDryRun.cleanup_plan.protects_current_pointer, true);
  assert.equal(pruneDryRun.cleanup_plan.protects_rollback_pointer, true);
  assert.equal(pruneDryRun.cleanup_plan.deletes_domain_artifacts, false);
  assert.equal(pruneDryRun.cleanup_plan.applied, false);

  const pruneApply = runCli(['runtime', 'env', 'cache', 'prune', '--apply'], env).runtime_environment;
  assert.equal(pruneApply.cleanup_plan.status, 'blocked_apply_requires_materialization_receipt');
  assert.equal(pruneApply.cleanup_plan.requested_apply, true);
  assert.equal(pruneApply.cleanup_plan.can_apply, false);
  assert.match(pruneApply.cleanup_plan.apply_blocker_ref, /^runtime-blocker-ref:opl-runtime-env/);
});

test('runtime env prepare writes MAS dependency receipt and run-context refs without installing packages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-prepare-'));
  const stateRoot = path.join(root, 'opl-state');
  const paperRoot = path.join(root, 'paper');
  const profilePath = path.join(root, 'renderer_dependency_profile.json');
  fs.mkdirSync(paperRoot, { recursive: true });
  fs.writeFileSync(
    profilePath,
    JSON.stringify({
      surface_kind: 'opl_dependency_requirement_profile',
      profile_owner: 'MedAutoScience Display Pack',
      canonical_substrate_owner: 'OPL Framework',
      profiles: [
        {
          profile_id: 'r_ggplot2_evidence_subprocess_v1',
          execution_mode: 'subprocess',
          renderer_family: 'r_ggplot2',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [
              { name: 'jsonlite', required: true },
              { name: 'ggplot2', required: true },
              { name: 'ggsci', required: true },
              { name: 'grid', required: true },
              { name: 'Rtsne', required: true },
              { name: 'uwot', required: true },
            ],
          },
          run_context_requirements: {
            binary_path_handoff_required: true,
            r_lib_path_required: true,
            package_install_during_render_allowed: false,
          },
        },
      ],
    }),
  );

  const prepared = runCli([
    'runtime',
    'env',
    'prepare',
    '--domain',
    'mas',
    '--profile',
    'display',
    '--platform',
    'macos-arm64',
    '--requirement-profile',
    profilePath,
    '--paper-root',
    paperRoot,
  ], { OPL_STATE_DIR: stateRoot }).runtime_environment;

  assert.equal(prepared.command, 'prepare');
  assert.equal(prepared.prepare.status, 'prepared');
  assert.equal(prepared.prepare.installed_packages, false);
  assert.equal(prepared.prepare.writes_domain_truth, false);
  assert.equal(prepared.prepare.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(prepared.prepare.receipt_ref, 'paper/build/dependency_environment_receipt.json');
  assert.equal(prepared.prepare.run_context_ref, 'paper/build/dependency_run_context.json');
  assert.equal(prepared.prepare.binary_paths.Rscript.endsWith('Rscript'), true);

  const lock = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json'), 'utf8'),
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_receipt.json'), 'utf8'),
  );
  const runContext = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_run_context.json'), 'utf8'),
  );
  assert.equal(lock.status, 'prepared');
  assert.equal(lock.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.match(lock.lock_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(lock.required_r_packages, ['jsonlite', 'ggplot2', 'ggsci', 'grid', 'Rtsne', 'uwot']);
  assert.equal(receipt.status, 'prepared');
  assert.equal(receipt.failure_class, '');
  assert.equal(receipt.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(receipt.lock_sha256, lock.lock_sha256);
  assert.equal(receipt.run_context_ref, 'paper/build/dependency_run_context.json');
  assert.equal(receipt.authority_boundary.can_authorize_publication_readiness, false);
  assert.equal(runContext.status, 'prepared');
  assert.equal(runContext.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(runContext.lock_sha256, lock.lock_sha256);
  assert.match(runContext.run_context_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(runContext.binary_paths.Rscript, prepared.prepare.binary_paths.Rscript);
  assert.equal(runContext.env_vars.OPL_RUNTIME_ENVIRONMENT_STATUS, 'prepared');

  const cacheStatus = runCli(['runtime', 'env', 'cache', 'status'], {
    OPL_STATE_DIR: stateRoot,
  }).runtime_environment;
  assert.equal(cacheStatus.cache.status, 'observed');
  assert.equal(cacheStatus.cache.layer_count, 1);
  assert.equal(cacheStatus.cache.cache_hit_counts_as_ready, false);

  const readback = runCli([
    'runtime',
    'env',
    'run-context',
    '--domain',
    'mas',
    '--profile',
    'display',
    '--paper-root',
    paperRoot,
  ], { OPL_STATE_DIR: stateRoot }).runtime_environment;
  assert.equal(readback.run_context.status, 'prepared');
  assert.equal(readback.run_context.binary_paths.Rscript, prepared.prepare.binary_paths.Rscript);
});

test('runtime env prepare returns a dependency failure without installing missing R packages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-missing-'));
  const stateRoot = path.join(root, 'opl-state');
  const paperRoot = path.join(root, 'paper');
  const profilePath = path.join(root, 'renderer_dependency_profile.json');
  fs.mkdirSync(paperRoot, { recursive: true });
  fs.writeFileSync(
    profilePath,
    JSON.stringify({
      surface_kind: 'opl_dependency_requirement_profile',
      profiles: [
        {
          profile_id: 'r_ggplot2_evidence_subprocess_v1',
          execution_mode: 'subprocess',
          renderer_family: 'r_ggplot2',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [{ name: 'oplDefinitelyMissingPackageForRuntimeEnvTest', required: true }],
          },
        },
      ],
    }),
  );

  const result = runCli([
    'runtime',
    'env',
    'prepare',
    '--domain',
    'mas',
    '--profile',
    'display',
    '--platform',
    'macos-arm64',
    '--requirement-profile',
    profilePath,
    '--paper-root',
    paperRoot,
  ], { OPL_STATE_DIR: stateRoot }).runtime_environment;

  assert.equal(result.prepare.status, 'missing_language_package');
  assert.equal(result.prepare.failure_class, 'missing_language_package');
  assert.equal(result.prepare.installed_packages, false);
  assert.equal(result.prepare.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(result.prepare.missing_r_packages[0], 'oplDefinitelyMissingPackageForRuntimeEnvTest');
  assert.equal(result.prepare.route_hint, 'opl_runtime_env_doctor');

  const lock = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json'), 'utf8'),
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_receipt.json'), 'utf8'),
  );
  assert.equal(lock.status, 'missing_language_package');
  assert.equal(lock.required_r_packages[0], 'oplDefinitelyMissingPackageForRuntimeEnvTest');
  assert.equal(receipt.status, 'missing_language_package');
  assert.equal(receipt.failure_class, 'missing_language_package');
  assert.equal(receipt.installed_packages, false);
  assert.equal(receipt.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(fs.existsSync(path.join(paperRoot, 'build', 'dependency_run_context.json')), false);
});

test('runtime env doctor and run-context preserve no-authority boundary', () => {
  const doctor = runCli(['runtime', 'env', 'doctor']).runtime_environment;
  assert.equal(doctor.command, 'doctor');
  assert.equal(doctor.doctor.status, 'dry_run_projection_available_materializer_not_landed');
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
  assert.match(
    runContext.run_context.runtime_lock_ref,
    /^runtime-lock:bookforge\/publication_proof\//,
  );
  assert.match(
    runContext.run_context.bundle_manifest_ref,
    /^runtime-bundle:bookforge\/publication_proof\//,
  );
  assert.equal(runContext.run_context.writes_domain_truth, false);
  assert.equal(runContext.run_context.writes_runtime_root, false);
});
