import { assert, fs, os, parseJsonText, path, runCli, runCliFailureInCwd, runCliInCwd, test } from '../helpers.ts';
import { execFileSync } from 'node:child_process';
import {
  fastLocalEnvDefaultFields,
  stateEnv,
  writeFakeRscript,
} from './runtime-environment-substrate-helpers.ts';

type Projection = Record<string, any>;

function writeDomainRuntimeProfile(root: string, domainId: string, packageId = 'mas') {
  const repoDir = path.join(root, packageId);
  fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'contracts/domain_descriptor.json'), JSON.stringify({
    kind: 'agent', agent_id: packageId, package_id: packageId, domain_id: domainId,
    standard_contract_refs: { runtime_environment_requirement_profile: 'contracts/runtime.json' },
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      workspace_binding: {
        locator_surface_kind: 'fixture_workspace_locator', default_profile_id: 'one_off',
        workspace_kind: 'fixture_workspace', project_kind: 'fixture_project',
        project_collection_label: 'projects', project_collection_path: 'projects',
        default_workspace_id: 'fixture-workspace', default_project_id: 'fixture-001',
        required_locator_fields: ['profile_ref'], optional_locator_fields: ['workspace_root'],
      },
      runtime: { runtime_domain_id: domainId, registration_ref: 'contracts/domain_descriptor.json#/runtime' },
      progress: { deliverable_delta_aliases: ['delta'], platform_delta_aliases: ['platform_delta'] },
      routing: {
        explicit_aliases: [packageId], workstream_ids: ['fixture_ops'], intent_signals: ['fixture_delivery'],
        ambiguity_policy: 'require_explicit_workstream',
      },
    },
  }));
  const profilePath = path.join(repoDir, 'contracts/runtime.json');
  fs.writeFileSync(profilePath, JSON.stringify({
    runtime_profile_sources: {
      display: { package_id: 'mas-scholar-skills', relative_path: 'packs/custom/runtime.json' },
    },
  }));
  return { repoDir, profilePath };
}

function assertFields(surface: Projection, expected: Projection) {
  for (const [field, value] of Object.entries(expected)) {
    assert.deepEqual(surface[field], value);
  }
}

function assertRuntimeReadinessGuards(readback: Projection) {
  assertFields(readback, {
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  });
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
    materialization_root_provider: 'local_managed_root',
    can_claim_provider_ready: false,
  });
}

test('runtime env CLI exposes dry-run projections and false-ready guards', () => {
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
  const doctor = runCli(['runtime', 'env', 'doctor'], env).runtime_environment;

  assertFields(inspect, {
    surface_kind: 'opl_runtime_environment_readback',
    command: 'inspect',
    domain_id: 'mas',
    profile_id: 'analysis',
    target_planned: true,
    dry_run: true,
  });
  assertRuntimeReadinessGuards(inspect);
  assertFastLocalDefaultProjection(inspect);
  assertFields(inspect.materialization_status, { status: 'not_materialized' });
  assert.equal(localDocker.sandbox_provider, 'local_docker');
  assert.equal(localDocker.sandbox_provider_plan.status, 'local_docker_preflight_required');
  assert.equal(localDocker.sandbox_provider_plan.can_claim_runtime_ready, false);
  assert.equal(lock.lock.status, 'dry_run_lock_projected');
  assert.equal(lock.lock.writes_runtime_root, false);
  assert.match(lock.lock.lock_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(doctor.doctor.findings.some((finding: { code: string }) =>
    finding.code === 'runtime_environment_materializer_verify_prune_available'
  ), true);
});

test('ordinary opl env prepare supplies MAS display defaults without host fallback', () => {
  const scholarSkillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-env-default-scholarskills-'));
  execFileSync('git', ['init', '--quiet', scholarSkillsRoot]);
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-env-default-family-'));
  const domain = writeDomainRuntimeProfile(familyRoot, 'medautoscience');
  const profilePath = path.join(
    scholarSkillsRoot,
    'packs',
    'custom',
    'runtime.json',
  );
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    schema_version: 1,
    surface_kind: 'opl_dependency_requirement_profile',
    profiles: [{
      profile_id: 'r_ggplot2_fixture_v1',
      runtime_binaries: [],
      language_packages: {
        r: [{ name: 'ggplot2', required: true }],
        python: [],
      },
    }],
  }, null, 2), 'utf8');
  const env = {
    ...stateEnv('ordinary-default-'),
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarSkillsRoot,
    OPL_MODULE_PATH_MAS: domain.repoDir,
    OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
  };
  const paperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-env-default-paper-'));

  try {
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
      /packs\/custom\/runtime\.json$/,
    );
    assert.equal(readback.prepare.managed_required_r_packages.includes('ggplot2'), true);
    assert.equal(readback.prepare.run_context_ref, null);
  } finally {
    fs.rmSync(paperRoot, { recursive: true, force: true });
    fs.rmSync(scholarSkillsRoot, { recursive: true, force: true });
    fs.rmSync(familyRoot, { recursive: true, force: true });
  }
});

test('ordinary env prepare consumes arbitrary domain declarations and rejects escaped provider paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-env-domain-source-'));
  try {
    const domain = writeDomainRuntimeProfile(root, 'custom-runtime-domain', 'custom-agent');
    const provider = path.join(root, 'provider');
    const resource = path.join(provider, 'packs/custom/runtime.json');
    fs.mkdirSync(path.dirname(resource), { recursive: true });
    execFileSync('git', ['init', '--quiet', provider]);
    fs.writeFileSync(resource, JSON.stringify({ profiles: [{
      profile_id: 'fixture', runtime_binaries: [], language_packages: { r: [], python: [] },
    }] }));
    const env = { ...stateEnv('custom-source-'), OPL_FAMILY_WORKSPACE_ROOT: root, OPL_MODULE_PATH_SCHOLARSKILLS: provider };
    const args = ['env', 'prepare', '--domain', 'custom-runtime-domain', '--profile', 'display'];
    const readback = runCliInCwd(args, root, env).runtime_environment;
    assert.equal(readback.prepare.requirement_profile_identity.requirement_profile_ref, fs.realpathSync(resource));
    for (const relativePath of ['../outside.json', '/outside.json', 'packs/custom/escape.json']) {
      fs.writeFileSync(path.join(root, 'outside.json'), '{}');
      if (relativePath.endsWith('escape.json')) fs.symlinkSync(path.join(root, 'outside.json'), path.join(provider, relativePath));
      fs.writeFileSync(domain.profilePath, JSON.stringify({
        runtime_profile_sources: { display: { package_id: 'mas-scholar-skills', relative_path: relativePath } },
      }));
      const failure = runCliFailureInCwd(args, root, env);
      assert.match(JSON.stringify(failure), /escapes|repo-relative/, relativePath);
    }
    fs.writeFileSync(domain.profilePath, JSON.stringify({ runtime_profile_sources: { display: {} } }));
    const failure = runCliFailureInCwd(args, root, env);
    assert.match(JSON.stringify(failure), /provider is unavailable or invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime env materialize verify and cache prune operate on managed roots', () => {
  const env = stateEnv('materializer-');
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
    requested_apply: true,
    applied: true,
    writes_runtime_root: true,
  });
  assert.equal(fs.existsSync(path.join(apply.materialization_plan.runtime_root, 'materialization-receipt.json')), true);

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
  const verified = runCli([
    'runtime',
    'env',
    'verify',
    '--runtime-root',
    apply.materialization_plan.runtime_root,
  ], env).runtime_environment;
  const prune = runCli(['runtime', 'env', 'cache', 'prune', '--apply'], env).runtime_environment;

  assert.equal(inspect.materialization_status.status, 'materialized_runtime_root_observed');
  assert.equal(inspect.materialization_status.can_claim_domain_ready, false);
  assert.equal(verified.verification.status, 'verified');
  assert.equal(verified.verification.can_claim_domain_ready, false);
  assert.equal(prune.cleanup_plan.status, 'applied_prune_receipt_written');
  assert.equal(fs.existsSync(apply.materialization_plan.runtime_root), false);
});

test('runtime env prepare records missing R packages and managed-library apply', () => {
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
          profile_id: 'r_missing_fixture',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [
              { name: 'jsonlite', required: true },
              { name: 'ggplot2', required: true },
            ],
          },
        },
        {
          profile_id: 'r_apply_fixture',
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

  try {
    const missing = runCli([
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
      'r_missing_fixture',
      '--artifact-root',
      paperRoot,
    ], env).runtime_environment;
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
      'r_apply_fixture',
      '--artifact-root',
      paperRoot,
      '--apply',
    ], env).runtime_environment;

    assert.equal(missing.prepare.status, 'missing_language_package');
    assert.deepEqual(missing.prepare.missing_r_packages, ['jsonlite', 'ggplot2']);
    assert.equal(missing.prepare.host_package_fallback_allowed, false);
    assert.equal(prepared.prepare.status, 'prepared');
    assert.deepEqual(prepared.prepare.managed_required_r_packages, ['ggconsort']);
    assert.deepEqual(prepared.prepare.base_or_recommended_r_packages, ['grid']);
    assert.equal(prepared.prepare.package_installation_receipt.status, 'installed');

    const runContext = parseJsonText(
      fs.readFileSync(path.join(paperRoot, 'build', 'dependency_run_context.json'), 'utf8'),
    ) as Record<string, any>;
    assert.equal(runContext.consumer_boundary.host_environment_fallback_allowed, false);
    assert.equal(runContext.consumer_preflight.can_consume_run_context, true);
    assert.deepEqual(parseJsonText(
      fs.readFileSync(path.join(runContext.env_vars.R_LIBS_USER, '.fake-installed-packages.json'), 'utf8'),
    ), ['ggconsort']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime env run-context preserves no-authority boundary', () => {
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
  assert.equal(runContext.run_context.status, 'planned_not_bound');
  assert.equal(runContext.run_context.writes_domain_truth, false);
  assert.equal(runContext.run_context.writes_runtime_root, false);
  assert.equal(runContext.run_context.consumer_preflight.can_consume_run_context, false);
  assert.equal(runContext.run_context.consumer_boundary.host_environment_fallback_allowed, false);
});
