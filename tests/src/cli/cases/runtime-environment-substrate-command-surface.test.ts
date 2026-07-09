import { assert, fs, os, parseJsonText, path, runCli, runCliInCwd, test } from '../helpers.ts';
import {
  fastLocalEnvDefaultFields,
  modalLikeEnvSpecIds,
  stateEnv,
  writeFakeExecutable,
  writeFakeRscript,
} from './runtime-environment-substrate-helpers.ts';

type Projection = Record<string, any>;

function assertFields(surface: Projection, expected: Projection) {
  for (const [field, value] of Object.entries(expected)) {
    assert.deepEqual(surface[field], value);
  }
}

function assertFalseFields(surface: Projection, fields: string[]) {
  assertFields(surface, Object.fromEntries(fields.map((field) => [field, false])));
}

function assertRuntimeReadinessGuards(readback: Projection) {
  assertFalseFields(readback, [
    'can_claim_runtime_ready',
    'can_claim_domain_ready',
    'can_claim_app_release_ready',
  ]);
}

function assertFastLocalDefaultProjection(readback: Projection) {
  assertFields(fastLocalEnvDefaultFields(readback), {
    sandbox_provider: 'fast_local_env',
    default_strategy: 'fast_local_env',
    default_path: 'default_current_path',
    renv_handoff: 'renv',
    uv_handoff: 'uv',
    host_environment_fallback_allowed: false,
  });
  assertFields(readback.sandbox_provider_plan, {
    selected_provider: 'fast_local_env',
    provider_role: 'fast_local_env_default_current_path',
    later_sandbox_provider_kinds: ['local_docker', 'external_sandbox'],
    later_external_sandbox_substrates: ['e2b', 'daytona', 'modal'],
    materialization_root_provider: 'local_managed_root',
    can_claim_provider_ready: false,
  });
}

function assertProviderPlanHasNoSideEffects(plan: Projection) {
  assertFalseFields(plan, [
    'credential_material_read',
    'external_api_called',
    'provider_lifecycle_managed',
    'creates_cloud_resource',
  ]);
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

  assertFields(inspect, {
    surface_kind: 'opl_runtime_environment_readback',
    command: 'inspect',
    domain_id: 'mas',
    profile_id: 'analysis',
    platform_id: 'macos-arm64',
    implementation_status: 'runtime_lock_materializer_cache_prune_run_context_guard_available',
    target_planned: true,
    dry_run: true,
  });
  assertRuntimeReadinessGuards(inspect);
  assertFastLocalDefaultProjection(inspect);
  assertFields(inspect.authority_boundary, { can_claim_runtime_materialized_ready: false });
  assertFields(inspect.materialization_status, { status: 'not_materialized' });
  assert.match(inspect.runtime_lock_ref, /^runtime-lock:mas\/analysis\/macos-arm64:sha256:/);
  assert.match(inspect.bundle_manifest_ref, /^runtime-bundle:mas\/analysis\/macos-arm64:sha256:/);

  const localDocker = runCli([
    'runtime',
    'env',
    'inspect',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
    '--sandbox-provider',
    'local_docker',
  ], env).runtime_environment;
  assert.equal(localDocker.sandbox_provider, 'local_docker');
  assertFields(localDocker.sandbox_provider_plan, {
    status: 'local_docker_preflight_required',
    provider_role: 'local_agent_sandbox_execution_substrate',
    template_ref: 'local-sandbox-template:local_docker:mas/analysis/macos-arm64',
    required_receipt_kind: 'sandbox_execution_receipt',
    live_provider_receipt_required: true,
    false_ready_guard: 'local_sandbox_preflight_is_not_provider_ready',
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
  });
  assertFields(localDocker.sandbox_provider_plan.local_sandbox_preflight, {
    required_cli: 'docker',
    external_api_called: false,
    credential_material_read: false,
  });

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
  assertFields(doctor.doctor, {
    status: 'runtime_lock_materializer_verify_cache_prune_run_context_guard_available',
  });
  assertFields(doctor.doctor.findings[0], { severity: 'info', can_block_domain_progress: false });
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
});

test('opl env prepare supplies the MAS display defaults for ordinary users', () => {
  const env = stateEnv('ordinary-default-');
  const paperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-env-default-paper-'));
  const readback = runCliInCwd([
    'env',
    'prepare',
    '--domain',
    'mas',
    '--profile',
    'display',
  ], paperRoot, env).runtime_environment;

  assert.equal(readback.prepare.environment_tier, 'fast_local_env');
  assert.equal(readback.prepare.host_package_fallback_allowed, false);
  assert.match(
    readback.prepare.requirement_profile_identity.requirement_profile_ref,
    /runtime-environment-profiles\/mas-display\.json$/,
  );
  assert.equal(readback.prepare.selected_requirement_profile_ids[0], 'r_ggplot2_ggconsort_reporting_flow_v1');
  assert.equal(readback.prepare.managed_required_r_packages.includes('ggplot2'), true);
  assert.equal(readback.prepare.managed_required_r_packages.includes('ggconsort'), true);
  assert.equal(readback.prepare.run_context_ref, null);
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

  assertFields(build, { command: 'build' });
  assertFields(build.build_plan, {
    status: 'bundle_manifest_projected',
    writes_runtime_root: false,
    creates_archive: false,
    can_claim_runtime_ready: false,
  });
  assertFastLocalDefaultProjection(build);
  assertFields(build.sandbox_provider_plan, { temporal_replacement: false });
  assertFields(build.bundle_manifest, {
    status: 'dry_run_bundle_manifest_projected',
    layer_count: 6,
    all_layer_archives_present: false,
    can_claim_runtime_ready: false,
  });
  assert.match(build.bundle_manifest.bundle_ref, /^runtime-bundle:mas\/analysis\/macos-arm64:sha256:/);

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
  assertFields(dryRun, { command: 'materialize' });
  assertFields(dryRun.materialization_plan, {
    status: 'dry_run_materialization_plan_projected',
    target_pointer: 'current',
    applied: false,
    can_apply: true,
    writes_runtime_root: false,
    apply_blocker_ref: null,
  });

  const externalSandbox = runCli([
    'runtime',
    'env',
    'materialize',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
    '--sandbox-provider',
    'external_sandbox',
    '--apply',
  ], env).runtime_environment;
  const externalPlan = externalSandbox.sandbox_provider_plan;
  const requiredExternalSandboxRefs = [
    'OPL_EXTERNAL_SANDBOX_ENDPOINT',
    'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
    'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
  ];
  assertFields(externalSandbox, { sandbox_provider: 'external_sandbox' });
  assertFields(externalPlan, {
    status: 'external_sandbox_provider_adapter_unconfigured',
    provider_role: 'agent_sandbox_execution_substrate',
    e2b_default_dependency: false,
    e2b_package_dependency_class: 'optional_dependency',
    e2b_connect_configuration_assist_only: true,
    required_external_sandbox_refs: requiredExternalSandboxRefs,
    can_claim_provider_ready: false,
  });
  assert.deepEqual(
    externalPlan.provider_family_catalog.map(
      (entry: { substrate: string }) => entry.substrate,
    ),
    ['e2b', 'daytona', 'modal'],
  );
  assertFields(externalPlan.modal_like_env_spec_catalog, {
    env_ids: modalLikeEnvSpecIds,
    env_id_counts_as_provider_ready: false,
  });
  assertFields(externalPlan.adapter, {
    adapter_id: 'opl.external_sandbox_provider_adapter.v1',
    missing_required_env: requiredExternalSandboxRefs,
  });
  assertProviderPlanHasNoSideEffects(externalPlan);
  assertProviderPlanHasNoSideEffects(externalPlan.adapter);
  assertFields(externalPlan.model_endpoint_provider_family, {
    required_endpoint_refs: [
      'OPL_MODEL_ENDPOINT_URL_REF',
      'OPL_MODEL_ENDPOINT_CREDENTIAL_REF',
      'OPL_MODEL_ENDPOINT_PROVIDER_RECEIPT_REF',
    ],
  });
  assertFalseFields(externalPlan.model_endpoint_provider_family, [
    'endpoint_lifecycle_managed',
    'creates_endpoint',
    'updates_endpoint',
    'deletes_endpoint',
    'submit_job_supported',
    'harvest_job_supported',
    'credential_material_read',
    'endpoint_api_called_by_readback',
  ]);
  assertFields(externalSandbox.materialization_plan, {
    status: 'external_sandbox_provider_apply_blocked',
    can_apply: false,
    applied: false,
    writes_runtime_root: false,
    apply_blocker_ref: 'external_sandbox_provider_adapter_unconfigured',
    can_claim_runtime_ready: false,
  });

  const configuredExternalSandbox = runCli([
    'runtime',
    'env',
    'materialize',
    '--domain',
    'mas',
    '--profile',
    'analysis',
    '--platform',
    'macos-arm64',
    '--sandbox-provider',
    'external_sandbox',
    '--apply',
  ], {
    ...env,
    OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.invalid',
    OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'keychain://opl/external-sandbox/test',
    OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'opl://provider/e2b/test-receipt',
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
  }).runtime_environment;
  assertFields(configuredExternalSandbox.sandbox_provider_plan, {
    status: 'external_sandbox_provider_adapter_configured',
  });
  assertFields(configuredExternalSandbox.sandbox_provider_plan.adapter, {
    selected_external_substrate: 'e2b',
  });
  assertProviderPlanHasNoSideEffects(configuredExternalSandbox.sandbox_provider_plan.adapter);
  assertFields(configuredExternalSandbox.materialization_plan, {
    status: 'external_sandbox_provider_binding_receipt_written',
    applied: true,
    can_apply: true,
    writes_runtime_root: false,
    apply_blocker_ref: null,
    can_claim_runtime_ready: false,
  });
  assertFields(configuredExternalSandbox.materialization_plan.receipt, {
    provider_receipt_ref: 'opl://provider/e2b/test-receipt',
  });
  assertProviderPlanHasNoSideEffects(configuredExternalSandbox.materialization_plan.receipt);

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
  assertFields(apply.materialization_plan, {
    status: 'materialized_receipt_written',
    target_pointer: 'staged',
    requested_apply: true,
    applied: true,
    can_apply: true,
    writes_runtime_root: true,
    apply_blocker_ref: null,
  });
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
  assertFields(inspectMaterialized.materialization_status, {
    status: 'materialized_runtime_root_observed',
    reason: 'materialization_receipt_observed',
    runtime_root: apply.materialization_plan.runtime_root,
    receipt_ref: apply.materialization_plan.receipt_ref,
    can_claim_runtime_ready: true,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  });

  const verified = runCli([
    'runtime',
    'env',
    'verify',
    '--runtime-root',
    apply.materialization_plan.runtime_root,
  ], env).runtime_environment;
  assert.equal(verified.command, 'verify');
  assertFields(verified.verification, {
    status: 'verified',
    can_claim_runtime_ready: true,
    can_claim_domain_ready: false,
  });

  const inventory = runCli(['runtime', 'env', 'cache', 'inventory'], env).runtime_environment;
  assert.equal(inventory.command, 'cache inventory');
  assertFields(inventory.cache_inventory, {
    status: 'scanned',
    scanned_filesystem: true,
    cache_hit_counts_as_ready: false,
    materialized_runtime_root_count: 1,
  });

  const pruneDryRun = runCli(['runtime', 'env', 'cache', 'prune', '--dry-run'], env).runtime_environment;
  assert.equal(pruneDryRun.command, 'cache prune');
  assertFields(pruneDryRun.cleanup_plan, {
    status: 'dry_run_prune_plan_projected',
    protects_current_pointer: true,
    protects_rollback_pointer: true,
    deletes_domain_artifacts: false,
    applied: false,
  });

  const pruneApply = runCli(['runtime', 'env', 'cache', 'prune', '--apply'], env).runtime_environment;
  assertFields(pruneApply.cleanup_plan, {
    status: 'applied_prune_receipt_written',
    requested_apply: true,
    can_apply: true,
    apply_blocker_ref: null,
  });
  assert.equal(pruneApply.cleanup_plan.deleted_runtime_roots.length, 1);
  assert.equal(fs.existsSync(apply.materialization_plan.runtime_root), false);
});

test('runtime env prepare writes a dependency failure receipt without installing packages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-prepare-'));
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
    '--artifact-root',
    paperRoot,
  ], {
    OPL_STATE_DIR: stateRoot,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
  }).runtime_environment;

  assert.equal(prepared.command, 'prepare');
  assert.equal(prepared.prepare.status, 'missing_language_package');
  assert.equal(prepared.prepare.failure_class, 'missing_language_package');
  assert.equal(prepared.prepare.installed_packages, false);
  assert.equal(prepared.prepare.writes_domain_truth, false);
  assert.equal(prepared.prepare.lock_ref, 'artifact-root/build/dependency_environment_lock.json');
  assert.equal(prepared.prepare.receipt_ref, 'artifact-root/build/dependency_environment_receipt.json');
  assert.equal(prepared.prepare.run_context_ref, null);
  assert.equal(prepared.prepare.route_hint, 'opl_runtime_env_doctor');
  assert.equal(prepared.prepare.binary_paths.Rscript, rscriptPath);

  const lock = parseJsonText(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json'), 'utf8'),
  ) as Record<string, any>;
  const receipt = parseJsonText(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_receipt.json'), 'utf8'),
  ) as Record<string, any>;
  assert.equal(lock.status, 'missing_language_package');
  assert.equal(lock.lock_ref, 'artifact-root/build/dependency_environment_lock.json');
  assert.match(lock.lock_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(lock.required_r_packages, ['jsonlite', 'ggplot2', 'ggsci', 'grid', 'Rtsne', 'uwot']);
  assert.equal(receipt.status, 'missing_language_package');
  assert.equal(receipt.failure_class, 'missing_language_package');
  assert.equal(receipt.lock_ref, 'artifact-root/build/dependency_environment_lock.json');
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
    '--artifact-root',
    paperRoot,
  ], { OPL_STATE_DIR: stateRoot }).runtime_environment;
  assert.equal(readback.run_context.status, 'missing_run_context');
  assert.equal(readback.run_context.consumer_preflight.status, 'missing_run_context');
  assert.equal(readback.run_context.consumer_preflight.can_consume_run_context, false);
  assert.equal(readback.run_context.consumer_preflight.route_hint, 'opl_runtime_env_prepare');
  assert.equal(readback.run_context.consumer_boundary.host_environment_fallback_allowed, false);
  assert.equal(readback.run_context.writes_runtime_root, false);
});

test('runtime env prepare treats Python packages as Fast Local Env managed uv requirements', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-python-prepare-'));
  const stateRoot = path.join(root, 'opl-state');
  const paperRoot = path.join(root, 'paper');
  const binDir = path.join(root, 'bin');
  const profilePath = path.join(root, 'python_dependency_profile.json');
  const pythonPath = writeFakeExecutable(binDir, 'python3');
  const uvPath = writeFakeExecutable(binDir, 'uv');
  fs.writeFileSync(profilePath, JSON.stringify({
    profiles: [
      {
        profile_id: 'python_display',
        language_packages: {
          python: [
            { name: 'plotnine' },
            { name: 'pandas' },
          ],
        },
      },
    ],
  }));

  const readback = runCli([
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
    '--artifact-root',
    paperRoot,
  ], {
    OPL_STATE_DIR: stateRoot,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
  }).runtime_environment;

  assert.equal(readback.prepare.status, 'missing_language_package');
  assert.equal(readback.prepare.environment_tier, 'fast_local_env');
  assert.deepEqual(readback.prepare.managed_required_python_packages, ['plotnine', 'pandas']);
  assert.deepEqual(readback.prepare.missing_python_packages, ['plotnine', 'pandas']);
  assert.equal(readback.prepare.binary_paths.python3, pythonPath);
  assert.equal(readback.prepare.binary_paths.uv, uvPath);
  assert.match(readback.prepare.managed_python_environment_path, /dependency-libraries\/[^/]+\/python$/);
  assert.equal(readback.prepare.python_package_installation_receipt.status, 'not_requested');
  assert.equal(readback.prepare.host_package_fallback_allowed, false);
  assert.equal(readback.run_context, null);

  const receipt = parseJsonText(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_receipt.json'), 'utf8'),
  ) as Record<string, any>;
  assert.deepEqual(receipt.missing_python_packages, ['plotnine', 'pandas']);
  assert.equal(receipt.managed_python_environment_path, readback.prepare.managed_python_environment_path);
  assert.equal(receipt.host_package_fallback_allowed, false);
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
    '--artifact-root',
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
  const lock = parseJsonText(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json'), 'utf8'),
  ) as Record<string, any>;
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
    '--artifact-root',
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
    '--artifact-root',
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

  const runContext = parseJsonText(
    fs.readFileSync(path.join(paperRoot, 'build', 'dependency_run_context.json'), 'utf8'),
  ) as Record<string, any>;
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
  assert.deepEqual(parseJsonText(fs.readFileSync(managedMarker, 'utf8')), ['ggconsort']);

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
    '--artifact-root',
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
    '--artifact-root',
    paperRoot,
  ], env).runtime_environment;
  assert.equal(mismatchReadback.run_context.status, 'prepared');
  assert.equal(mismatchReadback.run_context.consumer_preflight.status, 'target_mismatch');
  assert.equal(mismatchReadback.run_context.consumer_preflight.can_consume_run_context, false);
  assert.deepEqual(mismatchReadback.run_context.consumer_preflight.target_mismatch_fields, ['domain_id']);
  assert.equal(mismatchReadback.run_context.consumer_preflight.route_hint, 'opl_runtime_env_prepare');
});

test('runtime env doctor and run-context preserve no-authority boundary', () => {
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
  assert.equal(runContext.run_context.consumer_preflight.status, 'artifact_root_not_supplied');
  assert.equal(runContext.run_context.consumer_preflight.can_consume_run_context, false);
  assert.equal(runContext.run_context.consumer_boundary.host_environment_fallback_allowed, false);
});
