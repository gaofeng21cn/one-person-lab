import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function stateEnv(label: string) {
  return {
    OPL_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), `opl-runtime-env-${label}-`)),
  };
}

function writeFakeRscript(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true });
  const rscriptPath = path.join(binDir, 'Rscript');
  fs.writeFileSync(
    rscriptPath,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const expression = process.argv[3] || '';
const libMatch = expression.match(/lib\\.loc\\s*=\\s*"([^"]+)"/)
  || expression.match(/lib\\s*=\\s*"([^"]+)"/)
  || expression.match(/dir\\.exists\\("([^"]+)"\\)/);
const libPath = libMatch ? libMatch[1] : '';
const markerPath = libPath ? path.join(libPath, '.fake-installed-packages.json') : '';
const readPackages = () => {
  if (!markerPath || !fs.existsSync(markerPath)) return [];
  return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
};
if (expression.includes('priority = c("base", "recommended")')) {
  process.stdout.write('grid\\n');
  process.exit(0);
}
if (expression.includes('install_github')) {
  fs.mkdirSync(libPath, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(Array.from(new Set([...readPackages(), 'ggconsort']))));
  process.exit(0);
}
if (expression.includes('install.packages')) {
  const packageMatch = expression.match(/install\\.packages\\(c\\(([^)]*)\\)/);
  const packages = packageMatch
    ? packageMatch[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : [];
  fs.mkdirSync(libPath, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(Array.from(new Set([...readPackages(), ...packages]))));
  process.exit(0);
}
if (expression.includes('installed.packages')) {
  if (libPath) {
    process.stdout.write(readPackages().join('\\n'));
    process.exit(0);
  }
  process.stdout.write('globalOnlyPackage\\n');
  process.exit(0);
}
process.exit(0);
`,
    { mode: 0o755 },
  );
  return rscriptPath;
}

test('runtime env CLI exposes deterministic projections before materializing runtime roots', () => {
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
  assert.equal(inspect.implementation_status, 'runtime_lock_materializer_cache_prune_run_context_guard_available');
  assert.equal(inspect.target_planned, true);
  assert.equal(inspect.dry_run, true);
  assert.equal(inspect.can_claim_runtime_ready, false);
  assert.equal(inspect.can_claim_domain_ready, false);
  assert.equal(inspect.can_claim_app_release_ready, false);
  assert.equal(inspect.authority_boundary.can_claim_runtime_materialized_ready, false);
  assert.equal(inspect.materialization_status.status, 'not_materialized');
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
  assert.equal(cacheStatus.cache.inventory.scanned_filesystem, true);

  const doctor = runCli(['runtime', 'env', 'doctor'], env).runtime_environment;
  assert.equal(doctor.command, 'doctor');
  assert.equal(
    doctor.doctor.status,
    'runtime_lock_materializer_verify_cache_prune_run_context_guard_available',
  );
  assert.equal(
    doctor.doctor.findings.some((finding: { code: string }) => (
      finding.code === 'runtime_environment_materializer_verify_prune_available'
    )),
    true,
  );
});

test('runtime env build materialize verify and cache prune operate on OPL-managed runtime roots', () => {
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
  assert.equal(build.build_plan.status, 'bundle_manifest_projected');
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
  assert.equal(dryRun.materialization_plan.can_apply, true);
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
  assert.equal(apply.materialization_plan.status, 'materialized_receipt_written');
  assert.equal(apply.materialization_plan.target_pointer, 'staged');
  assert.equal(apply.materialization_plan.requested_apply, true);
  assert.equal(apply.materialization_plan.applied, true);
  assert.equal(apply.materialization_plan.can_apply, true);
  assert.equal(apply.materialization_plan.writes_runtime_root, true);
  assert.equal(apply.materialization_plan.apply_blocker_ref, null);
  assert.equal(fs.existsSync(apply.materialization_plan.runtime_root), true);
  assert.equal(
    fs.existsSync(path.join(apply.materialization_plan.runtime_root, 'materialization-receipt.json')),
    true,
  );
  assert.equal(fs.existsSync(path.join(apply.materialization_plan.runtime_root, 'env.json')), true);

  const inspectMaterialized = runCli([
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
  assert.equal(inspectMaterialized.materialization_status.status, 'materialized_runtime_root_observed');
  assert.equal(inspectMaterialized.materialization_status.reason, 'materialization_receipt_observed');
  assert.equal(inspectMaterialized.materialization_status.runtime_root, apply.materialization_plan.runtime_root);
  assert.equal(inspectMaterialized.materialization_status.receipt_ref, apply.materialization_plan.receipt_ref);
  assert.equal(inspectMaterialized.materialization_status.can_claim_runtime_ready, true);
  assert.equal(inspectMaterialized.materialization_status.can_claim_domain_ready, false);
  assert.equal(inspectMaterialized.materialization_status.can_claim_app_release_ready, false);

  const verified = runCli([
    'runtime',
    'env',
    'verify',
    '--runtime-root',
    apply.materialization_plan.runtime_root,
  ], env).runtime_environment;
  assert.equal(verified.command, 'verify');
  assert.equal(verified.verification.status, 'verified');
  assert.equal(verified.verification.can_claim_runtime_ready, true);
  assert.equal(verified.verification.can_claim_domain_ready, false);

  const inventory = runCli(['runtime', 'env', 'cache', 'inventory'], env).runtime_environment;
  assert.equal(inventory.command, 'cache inventory');
  assert.equal(inventory.cache_inventory.status, 'scanned');
  assert.equal(inventory.cache_inventory.scanned_filesystem, true);
  assert.equal(inventory.cache_inventory.cache_hit_counts_as_ready, false);
  assert.equal(inventory.cache_inventory.materialized_runtime_root_count, 1);

  const pruneDryRun = runCli(['runtime', 'env', 'cache', 'prune', '--dry-run'], env).runtime_environment;
  assert.equal(pruneDryRun.command, 'cache prune');
  assert.equal(pruneDryRun.cleanup_plan.status, 'dry_run_prune_plan_projected');
  assert.equal(pruneDryRun.cleanup_plan.protects_current_pointer, true);
  assert.equal(pruneDryRun.cleanup_plan.protects_rollback_pointer, true);
  assert.equal(pruneDryRun.cleanup_plan.deletes_domain_artifacts, false);
  assert.equal(pruneDryRun.cleanup_plan.applied, false);

  const pruneApply = runCli(['runtime', 'env', 'cache', 'prune', '--apply'], env).runtime_environment;
  assert.equal(pruneApply.cleanup_plan.status, 'applied_prune_receipt_written');
  assert.equal(pruneApply.cleanup_plan.requested_apply, true);
  assert.equal(pruneApply.cleanup_plan.can_apply, true);
  assert.equal(pruneApply.cleanup_plan.apply_blocker_ref, null);
  assert.equal(pruneApply.cleanup_plan.deleted_runtime_roots.length, 1);
  assert.equal(fs.existsSync(apply.materialization_plan.runtime_root), false);
});

test('runtime env prepare writes a dependency failure receipt without installing packages', () => {
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
  assert.equal(prepared.prepare.status, 'missing_language_package');
  assert.equal(prepared.prepare.failure_class, 'missing_language_package');
  assert.equal(prepared.prepare.installed_packages, false);
  assert.equal(prepared.prepare.writes_domain_truth, false);
  assert.equal(prepared.prepare.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(prepared.prepare.receipt_ref, 'paper/build/dependency_environment_receipt.json');
  assert.equal(prepared.prepare.run_context_ref, null);
  assert.equal(prepared.prepare.binary_paths.Rscript.endsWith('Rscript'), true);

  const lock = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json'), 'utf8'),
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_receipt.json'), 'utf8'),
  );
  assert.equal(lock.status, 'missing_language_package');
  assert.equal(lock.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.match(lock.lock_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(lock.required_r_packages, ['jsonlite', 'ggplot2', 'ggsci', 'grid', 'Rtsne', 'uwot']);
  assert.equal(receipt.status, 'missing_language_package');
  assert.equal(receipt.failure_class, 'missing_language_package');
  assert.equal(receipt.lock_ref, 'paper/build/dependency_environment_lock.json');
  assert.equal(receipt.lock_sha256, lock.lock_sha256);
  assert.equal(receipt.run_context_ref, null);
  assert.equal(receipt.authority_boundary.can_authorize_publication_readiness, false);
  assert.equal(fs.existsSync(path.join(paperRoot, 'build', 'dependency_run_context.json')), false);

  const cacheStatus = runCli(['runtime', 'env', 'cache', 'status'], {
    OPL_STATE_DIR: stateRoot,
  }).runtime_environment;
  assert.equal(cacheStatus.cache.status, 'dry_run_inventory_projection');
  assert.equal(cacheStatus.cache.layer_count, 0);
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
  assert.equal(readback.run_context.status, 'missing_run_context');
  assert.equal(readback.run_context.consumer_preflight.status, 'missing_run_context');
  assert.equal(readback.run_context.consumer_preflight.can_consume_run_context, false);
  assert.equal(readback.run_context.consumer_preflight.route_hint, 'opl_runtime_env_prepare');
  assert.equal(readback.run_context.consumer_boundary.host_environment_fallback_allowed, false);
  assert.equal(readback.run_context.writes_runtime_root, false);
});

test('runtime env prepare aggregates multi-profile dependency requirements instead of only the first profile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-profile-aggregate-'));
  const stateRoot = path.join(root, 'opl-state');
  const paperRoot = path.join(root, 'paper');
  const profilePath = path.join(root, 'renderer_dependency_profile.json');
  const binDir = path.join(root, 'bin');
  const rscriptPath = writeFakeRscript(binDir);
  fs.mkdirSync(paperRoot, { recursive: true });
  fs.writeFileSync(
    profilePath,
    JSON.stringify({
      surface_kind: 'opl_dependency_requirement_profile',
      profiles: [
        {
          profile_id: 'r_ggplot2_evidence_subprocess_v1',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [
              { name: 'jsonlite', required: true },
              { name: 'ggplot2', required: true },
            ],
          },
        },
        {
          profile_id: 'r_ggplot2_ggconsort_reporting_flow_v1',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [
              { name: 'jsonlite', required: true },
              { name: 'ggconsort', required: true },
              { name: 'grid', required: true },
            ],
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
  ], {
    OPL_STATE_DIR: stateRoot,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
  }).runtime_environment;

  assert.equal(result.prepare.status, 'missing_language_package');
  assert.equal(result.prepare.binary_paths.Rscript, rscriptPath);
  assert.deepEqual(result.prepare.selected_requirement_profile_ids, [
    'r_ggplot2_evidence_subprocess_v1',
    'r_ggplot2_ggconsort_reporting_flow_v1',
  ]);
  assert.deepEqual(result.prepare.missing_r_packages, ['jsonlite', 'ggplot2', 'ggconsort']);
  assert.deepEqual(result.prepare.base_or_recommended_r_packages, ['grid']);
  const lock = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json'), 'utf8'),
  );
  assert.deepEqual(lock.required_r_packages, ['jsonlite', 'ggplot2', 'ggconsort', 'grid']);
  assert.deepEqual(lock.managed_required_r_packages, ['jsonlite', 'ggplot2', 'ggconsort']);
  assert.deepEqual(lock.base_or_recommended_r_packages, ['grid']);
});

test('runtime env prepare --apply verifies packages in the OPL-managed R library only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-managed-apply-'));
  const stateRoot = path.join(root, 'opl-state');
  const paperRoot = path.join(root, 'paper');
  const profilePath = path.join(root, 'renderer_dependency_profile.json');
  const binDir = path.join(root, 'bin');
  writeFakeRscript(binDir);
  fs.mkdirSync(paperRoot, { recursive: true });
  fs.writeFileSync(
    profilePath,
    JSON.stringify({
      surface_kind: 'opl_dependency_requirement_profile',
      profiles: [
        {
          profile_id: 'r_ggplot2_evidence_subprocess_v1',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [{ name: 'globalOnlyPackage', required: true }],
          },
        },
        {
          profile_id: 'r_ggplot2_ggconsort_reporting_flow_v1',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [
              {
                name: 'ggconsort',
                required: true,
                source: { type: 'github', repo: 'tgerke/ggconsort' },
              },
              { name: 'grid', required: true },
            ],
          },
        },
      ],
    }),
  );
  const env = {
    OPL_STATE_DIR: stateRoot,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  const dryRun = runCli([
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
    '--requirement-profile-id',
    'r_ggplot2_evidence_subprocess_v1',
    '--paper-root',
    paperRoot,
  ], env).runtime_environment;
  assert.equal(dryRun.prepare.status, 'missing_language_package');
  assert.deepEqual(dryRun.prepare.missing_r_packages, ['globalOnlyPackage']);
  assert.equal(fs.existsSync(path.join(paperRoot, 'build', 'dependency_run_context.json')), false);

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
    '--requirement-profile-id',
    'r_ggplot2_ggconsort_reporting_flow_v1',
    '--paper-root',
    paperRoot,
    '--apply',
  ], env).runtime_environment;

  assert.equal(prepared.prepare.status, 'prepared');
  assert.equal(prepared.prepare.package_installation_requested, true);
  assert.equal(prepared.prepare.installed_packages, true);
  assert.deepEqual(prepared.prepare.selected_requirement_profile_ids, [
    'r_ggplot2_ggconsort_reporting_flow_v1',
  ]);
  assert.deepEqual(prepared.prepare.missing_r_packages, []);
  assert.deepEqual(prepared.prepare.managed_required_r_packages, ['ggconsort']);
  assert.deepEqual(prepared.prepare.base_or_recommended_r_packages, ['grid']);
  assert.equal(prepared.prepare.package_installation_receipt.status, 'installed');
  assert.equal(
    prepared.prepare.package_installation_receipt.verified_with,
    'installed.packages(lib.loc = managed_library_path)',
  );

  const runContext = JSON.parse(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_run_context.json'), 'utf8'),
  );
  assert.equal(runContext.status, 'prepared');
  assert.equal(runContext.env_vars.R_LIBS_USER, prepared.prepare.managed_r_library_path);
  assert.deepEqual(runContext.selected_requirement_profile_ids, [
    'r_ggplot2_ggconsort_reporting_flow_v1',
  ]);
  assert.deepEqual(runContext.managed_required_r_packages, ['ggconsort']);
  assert.deepEqual(runContext.base_or_recommended_r_packages, ['grid']);
  assert.equal(runContext.consumer_boundary.host_environment_fallback_allowed, false);
  assert.equal(runContext.consumer_boundary.can_schedule_domain_stage, false);
  assert.equal(runContext.consumer_boundary.can_claim_provider_ready, false);
  assert.equal(runContext.consumer_preflight.status, 'bound');
  assert.equal(runContext.consumer_preflight.can_consume_run_context, true);
  assert.equal(runContext.consumer_preflight.fail_closed, true);
  assert.equal(runContext.consumer_preflight.route_hint, null);
  assert.match(runContext.requirement_profile_identity.profile_fingerprint, /^sha256:[a-f0-9]{64}$/);
  const managedMarker = path.join(
    runContext.env_vars.R_LIBS_USER,
    '.fake-installed-packages.json',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(managedMarker, 'utf8')), ['ggconsort']);

  const readback = runCli([
    'runtime',
    'env',
    'run-context',
    '--domain',
    'mas',
    '--profile',
    'display',
    '--platform',
    'macos-arm64',
    '--paper-root',
    paperRoot,
  ], env).runtime_environment;
  assert.equal(readback.run_context.status, 'prepared');
  assert.equal(readback.run_context.consumer_preflight.status, 'bound');
  assert.equal(readback.run_context.consumer_preflight.can_consume_run_context, true);
  assert.equal(readback.run_context.consumer_preflight.target_mismatch_fields.length, 0);
  assert.equal(readback.run_context.consumer_boundary.host_environment_fallback_allowed, false);
  assert.equal(readback.run_context.can_claim_provider_ready, false);
  assert.equal(readback.run_context.can_schedule_domain_stage, false);

  const mismatchReadback = runCli([
    'runtime',
    'env',
    'run-context',
    '--domain',
    'mag',
    '--profile',
    'display',
    '--platform',
    'macos-arm64',
    '--paper-root',
    paperRoot,
  ], env).runtime_environment;
  assert.equal(mismatchReadback.run_context.status, 'prepared');
  assert.equal(mismatchReadback.run_context.consumer_preflight.status, 'target_mismatch');
  assert.equal(mismatchReadback.run_context.consumer_preflight.can_consume_run_context, false);
  assert.deepEqual(mismatchReadback.run_context.consumer_preflight.target_mismatch_fields, ['domain_id']);
  assert.equal(mismatchReadback.run_context.consumer_preflight.route_hint, 'opl_runtime_env_prepare');
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
  assert.equal(
    doctor.doctor.status,
    'runtime_lock_materializer_verify_cache_prune_run_context_guard_available',
  );
  assert.equal(doctor.doctor.findings[0].severity, 'info');
  assert.equal(doctor.doctor.findings[0].can_block_domain_progress, false);
  assert.equal(
    doctor.doctor.findings.some((finding: { code: string }) => (
      finding.code === 'runtime_environment_materializer_verify_prune_available'
    )),
    true,
  );
  assert.equal(
    doctor.doctor.findings.some((finding: { code: string; host_environment_fallback_allowed?: boolean }) => (
      finding.code === 'runtime_environment_run_context_consumer_preflight_available'
        && finding.host_environment_fallback_allowed === false
    )),
    true,
  );

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
  assert.equal(runContext.run_context.consumer_preflight.status, 'paper_root_not_supplied');
  assert.equal(runContext.run_context.consumer_preflight.can_consume_run_context, false);
  assert.equal(runContext.run_context.consumer_boundary.host_environment_fallback_allowed, false);
});
