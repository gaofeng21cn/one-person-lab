import { spawnSync } from 'node:child_process';

import {
  agentPackageManifest,
  assert,
  createPluginSourceFixture,
  formatJsonPayload,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import {
  scholarSkillsCoreSkillIds,
  scholarSkillsModuleIds,
  writeCapabilityProvider,
} from './capability-fixtures.ts';
import { writeManagedRuntimeSourceFixture } from './managed-runtime-source-fixture.ts';
import {
  applyManagedRuntimeSourceCarrier,
  managedRuntimeSourceReadiness,
} from '../../../../../src/modules/connect/agent-package-registry-parts/managed-runtime-source-carrier.ts';
import { rollbackManagedModulePackageChannel } from '../../../../../src/modules/connect/system-installation/module-package-channel.ts';
import { resolveOplDomainModuleSpec } from '../../../../../src/modules/connect/system-installation/modules.ts';

const FIXTURE_MAS_PACKAGE_ID = 'fixture.mas';
const FIXTURE_RCA_PACKAGE_ID = 'fixture.rca';
const FIXTURE_PROVIDER_PACKAGE_ID = 'fixture.mas-scholar-skills';

function runGit(checkoutPath: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: checkoutPath, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test('explicit developer checkout install locks the selected checkout without package-channel metadata', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const checkoutPath = path.join(fixtureRoot, 'med-autoscience');
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  fs.mkdirSync(path.join(checkoutPath, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutPath, 'package.json'), formatJsonPayload({ name: 'med-autoscience-fixture' }));
  fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'developer source v1\n');
  fs.writeFileSync(
    path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh'),
    '#!/bin/sh\nset -eu\nprintf "ready\\n"\n',
  );
  fs.chmodSync(path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh'), 0o755);
  fs.writeFileSync(manifestPath, formatJsonPayload({
    ...agentPackageManifest({ packageId: FIXTURE_MAS_PACKAGE_ID, agentId: 'mas', pluginSourcePath }),
    runtime_source_carrier: {
      carrier_kind: 'opl_managed_module_source',
      module_id: 'medautoscience',
    },
  }));
  runGit(checkoutPath, ['init', '-q']);
  runGit(checkoutPath, ['config', 'user.email', 'fixture@example.com']);
  runGit(checkoutPath, ['config', 'user.name', 'Fixture']);
  runGit(checkoutPath, ['add', '.']);
  runGit(checkoutPath, ['commit', '-qm', 'fixture v1']);
  const headSha = runGit(checkoutPath, ['rev-parse', 'HEAD']);
  const env = {
    OPL_STATE_DIR: stateDir,
    OPL_MODULES_ROOT: path.join(stateDir, 'managed-modules'),
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  const installArgs = [
    'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    '--source-kind', 'developer_checkout_override', '--agent-root', checkoutPath,
  ];

  try {
    const preview = runCli([...installArgs, '--dry-run'], env) as any;
    const previewSource = preview.opl_agent_package_install.package_lock.managed_runtime_source;
    assert.equal(previewSource.status, 'validated_no_write');
    assert.equal(previewSource.checkout_path, checkoutPath);
    assert.equal(previewSource.source_mode, 'developer_checkout');
    assert.equal(previewSource.source_git_head_sha, headSha);
    assert.equal(previewSource.preparation_scope, 'developer_checkout_root');
    assert.equal(fs.existsSync(path.join(checkoutPath, 'opl-runtime-module.json')), false);

    const installed = runCli(installArgs, env) as any;
    const installedSource = installed.opl_agent_package_install.package_lock.managed_runtime_source;
    assert.equal(installedSource.status, 'current');
    assert.equal(installedSource.checkout_path, checkoutPath);
    assert.equal(installedSource.source_mode, 'developer_checkout');
    assert.equal(installedSource.source_git_head_sha, headSha);
    assert.match(installedSource.health_output_sha256, /^sha256:/);
    assert.match(installedSource.handler_probe_output_sha256, /^sha256:/);
    assert.equal(fs.existsSync(path.join(checkoutPath, 'opl-runtime-module.json')), false);
    assert.equal(
      (runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any)
        .opl_agent_package_status.runtime_source_readiness.status,
      'current',
    );

    fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'developer source v2\n');
    const drifted = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(drifted.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(
      runCliFailure(['packages', 'update', '--package-id', FIXTURE_MAS_PACKAGE_ID], env).payload.error.details.failure_code,
      'agent_package_developer_checkout_auto_update_forbidden',
    );
    assert.equal(
      runCliFailure(['packages', 'repair', '--package-id', FIXTURE_MAS_PACKAGE_ID], env).payload.error.details.failure_code,
      'agent_package_developer_checkout_auto_update_forbidden',
    );

    const reinstalled = runCli(installArgs, env) as any;
    assert.notEqual(
      reinstalled.opl_agent_package_install.package_lock.managed_runtime_source.tree_sha256,
      installedSource.tree_sha256,
    );
    assert.equal(
      (runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any)
        .opl_agent_package_status.runtime_source_readiness.status,
      'current',
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('bundled Full runtime source requires a matching carrier marker and rejects public injection', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-bundled-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-bundled-source-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const bundledRoot = path.join(fixtureRoot, 'full-runtime', 'modules', 'redcube-ai');
  const unmanagedRoot = path.join(fixtureRoot, 'unmarked-redcube-ai');
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  fs.mkdirSync(bundledRoot, { recursive: true });
  fs.mkdirSync(unmanagedRoot, { recursive: true });
  fs.writeFileSync(path.join(bundledRoot, 'runtime.txt'), 'immutable bundled source\n');
  fs.writeFileSync(path.join(unmanagedRoot, 'runtime.txt'), 'unmarked source\n');
  fs.writeFileSync(path.join(bundledRoot, 'opl-runtime-module.json'), formatJsonPayload({
    marker_version: 1,
    module_id: 'redcube',
    repo_name: 'redcube-ai',
    packaged_runtime: true,
    source_git: { head_sha: 'b'.repeat(40) },
  }));
  fs.writeFileSync(manifestPath, formatJsonPayload({
    ...agentPackageManifest({ packageId: FIXTURE_RCA_PACKAGE_ID, agentId: 'rca', pluginSourcePath }),
    runtime_source_carrier: {
      carrier_kind: 'opl_managed_module_source',
      module_id: 'redcube',
    },
  }));
  const env = {
    OPL_STATE_DIR: stateDir,
    OPL_MODULES_ROOT: path.join(stateDir, 'managed-modules'),
  };

  try {
    const carrierInput = {
      config: {
        carrier_kind: 'opl_managed_module_source' as const,
        module_id: 'redcube',
      },
      previous: null,
      action: 'install' as const,
      dryRun: false,
      packageId: FIXTURE_RCA_PACKAGE_ID,
      sourceKind: 'bundled_full_runtime_modules' as const,
      verifiedCarrierSourceCommit: 'a'.repeat(40),
    };
    assert.throws(
      () => applyManagedRuntimeSourceCarrier({ ...carrierInput, checkoutPath: unmanagedRoot }),
      (error: any) => error?.details?.failure_code === 'agent_package_runtime_source_carrier_invalid',
    );
    assert.throws(
      () => applyManagedRuntimeSourceCarrier({ ...carrierInput, checkoutPath: bundledRoot }),
      (error: any) => error?.details?.actual_owner_source_commit === 'b'.repeat(40),
    );

    fs.writeFileSync(path.join(bundledRoot, 'opl-runtime-module.json'), formatJsonPayload({
      marker_version: 1,
      module_id: 'redcube',
      repo_name: 'redcube-ai',
      packaged_runtime: true,
      source_git: { head_sha: 'a'.repeat(40) },
    }));
    assert.throws(
      () => applyManagedRuntimeSourceCarrier({
        ...carrierInput,
        checkoutPath: bundledRoot,
        verifiedCarrierSourceCommit: null,
      }),
      (error: any) => error?.details?.failure_code === 'agent_package_runtime_source_carrier_invalid',
    );
    const adopted = applyManagedRuntimeSourceCarrier({ ...carrierInput, checkoutPath: bundledRoot });
    assert.equal(adopted.after?.source_git_head_sha, 'a'.repeat(40));

    const invalid = runCliFailure([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
      '--source-kind', 'bundled_full_runtime_modules', '--agent-root', unmanagedRoot,
    ], env);
    assert.equal(invalid.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      invalid.payload.error.details.failure_code,
      'agent_package_bundled_full_runtime_source_internal_only',
    );

    const blocked = runCliFailure([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
      '--source-kind', 'bundled_full_runtime_modules', '--agent-root', bundledRoot,
    ], env);
    assert.equal(blocked.payload.error.details.failure_code, 'agent_package_bundled_full_runtime_source_internal_only');

    fs.writeFileSync(path.join(bundledRoot, 'runtime.txt'), 'drifted bundled source\n');
    const drifted = managedRuntimeSourceReadiness(adopted.after);
    assert.equal(drifted.status, 'incompatible');
    assert.equal(
      drifted.reason,
      'managed_runtime_source_lock_mismatch',
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('Packages compensates managed runtime source across downstream failure update rollback and uninstall', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-transaction-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-transaction-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-transaction-fixture-'));
  const providerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-provider-'));
  const pluginSourcePath = createPluginSourceFixture();
  const modulesRoot = path.join(fixtureRoot, 'modules');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const badWorkspaceTarget = path.join(fixtureRoot, 'not-a-directory');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(badWorkspaceTarget, 'file blocks scope materialization\n');
  try {
    const providerManifest = writeCapabilityProvider(providerRoot, '0.1.0', {
      packageId: FIXTURE_PROVIDER_PACKAGE_ID,
    });
    const consumerManifest = path.join(fixtureRoot, 'consumer.json');
    fs.writeFileSync(consumerManifest, formatJsonPayload({
      ...agentPackageManifest({
        packageId: FIXTURE_RCA_PACKAGE_ID,
        agentId: 'rca',
        pluginSourcePath,
      }),
      runtime_source_carrier: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'redcube',
      },
      capability_dependencies: [{
        module_id: 'scholarskills',
        package_id: FIXTURE_PROVIDER_PACKAGE_ID,
        kind: 'framework_capability_package',
        required: true,
        version_requirement: '>=0.1.0 <0.2.0',
        capability_abi: 'mas-scholar-skills.v1',
        required_export_ids: scholarSkillsCoreSkillIds,
        required_module_ids: scholarSkillsModuleIds,
        manifest_url: providerManifest,
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
        required_for: ['workspace_or_quest_codex_discovery'],
        install_owner: 'one-person-lab',
        install_update_source: 'ghcr_capability_packages_channel',
        sync_scopes: ['workspace', 'quest'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      }],
    }));
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.0',
      sourceHeadSha: 'source-transaction-v1',
    });
    const env = {
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: modulesRoot,
      HOME: homeDir,
      CODEX_HOME: path.join(homeDir, '.codex'),
      ...fixtureEnv,
    };
    const installArgs = [
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
    ];
    const failedFresh = runCliFailure([
      ...installArgs,
      '--scope', 'workspace',
      '--target-workspace', badWorkspaceTarget,
    ], env);
    assert.equal(failedFresh.payload.error.code, 'unexpected_error');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const installed = runCli([
      ...installArgs,
      '--scope', 'workspace',
      '--target-workspace', workspaceRoot,
    ], env) as any;
    const installedSource = installed.opl_agent_package_install.package_lock.managed_runtime_source;
    assert.equal(installedSource.source_git_head_sha, 'source-transaction-v1');
    assert.equal(installedSource.preparation_status, 'completed');
    assert.match(installedSource.health_output_sha256, /^sha256:/);
    assert.match(installedSource.handler_probe_output_sha256, /^sha256:/);
    assert.equal(
      installed.opl_agent_package_install.lifecycle_receipt.managed_runtime_source.tree_sha256,
      installedSource.tree_sha256,
    );

    const failedCurrentUpdate = runCliFailure([
      'packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace',
      '--target-workspace', badWorkspaceTarget,
    ], env);
    assert.equal(failedCurrentUpdate.payload.error.code, 'unexpected_error', JSON.stringify(failedCurrentUpdate.payload));
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai.previous')), false);
    const currentAfterFailure = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(currentAfterFailure.opl_agent_package_status.runtime_source_readiness.status, 'current');

    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'source-transaction-v2',
    }));
    const failedUpdate = runCliFailure([
      'packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace',
      '--target-workspace', badWorkspaceTarget,
    ], env);
    assert.equal(failedUpdate.payload.error.code, 'unexpected_error', JSON.stringify(failedUpdate.payload));
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    const persistedAfterFailure = JSON.parse(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'));
    assert.equal(
      persistedAfterFailure.packages.find((entry: any) => entry.package_id === FIXTURE_RCA_PACKAGE_ID)
        .managed_runtime_source.source_git_head_sha,
      'source-transaction-v1',
    );

    const updated = runCli(['packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(updated.opl_agent_package_update.package_lock.managed_runtime_source.source_git_head_sha, 'source-transaction-v2');
    env.OPL_PACKAGES_OWNER = 'missing-fixture-owner';
    const preActivationFailure = runCliFailure(['packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID], env);
    assert.equal(preActivationFailure.payload.error.code, 'build_command_failed');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    env.OPL_PACKAGES_OWNER = 'fixture';
    const status = runCli([
      'packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(status.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(status.opl_agent_package_status.runtime_source_readiness.operational_ready, true);
    assert.equal(status.opl_agent_package_status.launch_allowed, true);

    const failingRuntimeToolPath = path.join(fixtureRoot, 'bin', 'external-runtime-tool');
    fs.writeFileSync(failingRuntimeToolPath, '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
    const missingRuntimeStatus = runCli([
      'packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(missingRuntimeStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(missingRuntimeStatus.opl_agent_package_status.runtime_source_readiness.reason, 'managed_runtime_source_probe_failed');
    assert.equal(missingRuntimeStatus.opl_agent_package_status.launch_allowed, false);
    fs.rmSync(failingRuntimeToolPath);
    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'source-transaction-v2',
    }));

    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const missingStateIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const missingStateLock = missingStateIndex.packages.find(
      (entry: any) => entry.package_id === FIXTURE_RCA_PACKAGE_ID,
    );
    const retainedSourceState = missingStateLock.managed_runtime_source;
    delete missingStateLock.managed_runtime_source;
    fs.writeFileSync(lockPath, formatJsonPayload(missingStateIndex));
    const missingStateStatus = runCli([
      'packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(missingStateStatus.opl_agent_package_status.runtime_source_readiness.status, 'missing');
    assert.equal(missingStateStatus.opl_agent_package_status.launch_allowed, false);
    missingStateLock.managed_runtime_source = retainedSourceState;
    fs.writeFileSync(lockPath, formatJsonPayload(missingStateIndex));

    fs.rmSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'));
    const driftedStatus = runCli([
      'packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(driftedStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(driftedStatus.opl_agent_package_status.launch_allowed, false);
    assert.equal(driftedStatus.opl_agent_package_status.launch_blocked_reason, 'runtime_source_incompatible');
    const staleManifestIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    staleManifestIndex.packages.find(
      (entry: any) => entry.package_id === FIXTURE_RCA_PACKAGE_ID,
    ).manifest_url = path.join(
      fixtureRoot,
      'retired-worktree',
      'consumer.json',
    );
    fs.writeFileSync(lockPath, formatJsonPayload(staleManifestIndex));
    const driftRepaired = runCli([
      'packages', 'repair', FIXTURE_RCA_PACKAGE_ID,
      '--manifest-url', consumerManifest,
      '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(driftRepaired.opl_agent_package_repair.package_lock.managed_runtime_source.preparation_status, 'completed');
    assert.equal(driftRepaired.opl_agent_package_repair.package_lock.manifest_url, consumerManifest);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');

    fs.rmSync(path.join(modulesRoot, 'redcube-ai'), { recursive: true, force: true });
    const missingSourceStatus = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(missingSourceStatus.opl_agent_package_status.runtime_source_readiness.status, 'missing');
    const missingSourceRepaired = runCli(['packages', 'repair', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(missingSourceRepaired.opl_agent_package_repair.package_lock.managed_runtime_source.source_git_head_sha, 'source-transaction-v2');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');

    const spec = resolveOplDomainModuleSpec('redcube');
    for (const failureAt of [2, 3]) {
      let renameCount = 0;
      assert.throws(() => rollbackManagedModulePackageChannel(spec, path.join(modulesRoot, 'redcube-ai'), {
        renameSync(from: string, to: string) {
          renameCount += 1;
          if (renameCount === failureAt) throw new Error(`injected rename failure ${failureAt}`);
          fs.renameSync(from, to);
        },
      } as any), /injected rename failure/);
      assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
      assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai.previous', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
      assert.equal(fs.existsSync(`${path.join(modulesRoot, 'redcube-ai')}.revert-${process.pid}`), false);
    }

    const rolledBack = runCli(['packages', 'rollback', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_FINALIZE_FAIL: '1',
    }) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.runtime_source_cleanup.status, 'cleanup_pending');
    assert.equal(rolledBack.opl_agent_package_rollback.package_lock.managed_runtime_source.source_git_head_sha, 'source-transaction-v1');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    const rollbackCleanup = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(rollbackCleanup.opl_agent_package_status.runtime_source_recovery.cleanup_completed_count, 1);

    const moduleRuntimeEnvRoot = path.join(stateDir, 'agent-package-runtime-envs', 'redcube');
    assert.ok(fs.readdirSync(moduleRuntimeEnvRoot).length >= 2);
    runCli(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], env);
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);
    assert.equal(fs.existsSync(moduleRuntimeEnvRoot), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(providerRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('Packages recovers durable runtime-source markers after interrupted apply and uninstall', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-recovery-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-recovery-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const modulesRoot = path.join(fixtureRoot, 'modules');
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  try {
    fs.writeFileSync(manifestPath, formatJsonPayload({
      ...agentPackageManifest({ packageId: FIXTURE_RCA_PACKAGE_ID, agentId: 'rca', pluginSourcePath }),
      runtime_source_carrier: { carrier_kind: 'opl_managed_module_source', module_id: 'redcube' },
    }));
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.0',
      sourceHeadSha: 'recovery-v1',
    });
    const env = { OPL_STATE_DIR: stateDir, OPL_MODULES_ROOT: modulesRoot, ...fixtureEnv };
    const installed = runCli([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    const installedSource = installed.opl_agent_package_install.package_lock.managed_runtime_source;
    const markerDir = path.join(stateDir, 'agent-package-runtime-source-transactions');
    const markerPath = path.join(markerDir, 'rca-stale-current-update.json');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(modulesRoot, 'redcube-ai', 'generated-drift.txt'), 'stale generated output\n');
    fs.writeFileSync(markerPath, formatJsonPayload({
      surface_kind: 'opl_agent_package_runtime_source_transaction',
      version: 1,
      phase: 'prepared',
      mutation: {
        kind: 'activated_with_previous',
        package_id: FIXTURE_RCA_PACKAGE_ID,
        action: 'update',
        transaction_id: 'stale-current-update',
        marker_path: markerPath,
        module_id: 'redcube',
        checkout_path: path.join(modulesRoot, 'redcube-ai'),
        before: installedSource,
        after: null,
        staged_removal_paths: [],
        repair_displaced_path: null,
        checkout_existed_before: true,
      },
    }));
    const staleMarkerRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 1);
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    runCli(['packages', 'repair', '--package-id', FIXTURE_RCA_PACKAGE_ID], env);
    assert.equal(fs.existsSync(markerPath), false);

    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'recovery-v2',
    }));
    const preparedUpdate = runCliFailure(['packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_PREPARE_APPLY: '1',
    });
    assert.equal(preparedUpdate.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_prepare_apply');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    const interruptedStagePath = path.join(modulesRoot, 'redcube-ai.stage');
    fs.mkdirSync(interruptedStagePath, { recursive: true });
    fs.writeFileSync(path.join(interruptedStagePath, 'partial-download'), 'staged but not activated\n');
    const preparedUpdateRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 1);
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    assert.equal(fs.existsSync(interruptedStagePath), false);

    const interruptedUpdate = runCliFailure(['packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_APPLY: '1',
    });
    assert.equal(interruptedUpdate.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_apply', JSON.stringify(interruptedUpdate.payload));
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const recoveredStatus = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 1);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');

    runCli(['packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID], env);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const preparedRollback = runCliFailure(['packages', 'rollback', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_PREPARE_ROLLBACK: '1',
    });
    assert.equal(preparedRollback.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_prepare_rollback');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const preparedRollbackRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 1);
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');

    const interruptedUninstall = runCliFailure(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_STAGE_UNINSTALL: '1',
    });
    assert.equal(interruptedUninstall.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_stage_uninstall');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);
    const restoredStatus = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 1);
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), true);

    const uninstalled = runCli(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_FINALIZE_FAIL: '1',
    }) as any;
    assert.equal(uninstalled.opl_agent_package_uninstall.runtime_source_cleanup.status, 'cleanup_pending');
    assert.equal(fs.readdirSync(markerDir).length, 1);
    const postCommitRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(postCommitRecovery.opl_agent_package_status.runtime_source_recovery.cleanup_completed_count, 1);
    assert.equal(fs.readdirSync(markerDir).length, 0);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('MAS package install executes the owner runtime probe instead of a retired private CLI', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-mas-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-mas-source-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const modulesRoot = path.join(fixtureRoot, 'modules');
  try {
    const manifestPath = path.join(fixtureRoot, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload({
      ...agentPackageManifest({
        packageId: FIXTURE_MAS_PACKAGE_ID,
        agentId: 'mas',
        pluginSourcePath,
      }),
      runtime_source_carrier: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'medautoscience',
      },
    }));
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'medautoscience',
      repoName: 'med-autoscience',
      version: '0.1.0a4',
      sourceHeadSha: 'mas-owner-probe-v1',
    });
    const env = {
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: modulesRoot,
      ...fixtureEnv,
    };

    const installed = runCli([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    const checkoutPath = path.join(modulesRoot, 'med-autoscience');
    assert.equal(fs.readFileSync(path.join(checkoutPath, '.runtime-probed'), 'utf8').trim(), '0.1.0a4');
    assert.deepEqual(
      installed.opl_agent_package_install.package_lock.managed_runtime_source.handler_probe_command,
      ['bash', path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh'), '--probe'],
    );
    assert.doesNotMatch(
      installed.opl_agent_package_install.package_lock.managed_runtime_source.handler_probe_command.join(' '),
      /med_autoscience\.cli|run-python-clean/,
    );

    const maliciousSentinel = path.join(fixtureRoot, 'malicious-command-executed');
    const maliciousCommand = path.join(fixtureRoot, 'malicious-health.sh');
    fs.writeFileSync(maliciousCommand, [
      '#!/usr/bin/env bash',
      `printf 'executed\\n' > ${JSON.stringify(maliciousSentinel)}`,
    ].join('\n'), { mode: 0o755 });
    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const lockIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const masLock = lockIndex.packages.find((entry: any) => entry.package_id === FIXTURE_MAS_PACKAGE_ID);
    masLock.managed_runtime_source.health_check_command = ['bash', maliciousCommand];
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));
    const tamperedStatus = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(fs.existsSync(maliciousSentinel), false);
    assert.equal(tamperedStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(tamperedStatus.opl_agent_package_status.runtime_source_readiness.reason, 'managed_runtime_source_command_drift');

    const repaired = runCli(['packages', 'repair', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.notDeepEqual(
      repaired.opl_agent_package_repair.package_lock.managed_runtime_source.health_check_command,
      ['bash', maliciousCommand],
    );
    const repairedStatus = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(repairedStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('uninstall validates but never deletes a preexisting adopted runtime source', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-adopted-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-adopted-source-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const modulesRoot = path.join(fixtureRoot, 'modules');
  try {
    const manifestPath = path.join(fixtureRoot, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload({
      ...agentPackageManifest({
        packageId: FIXTURE_RCA_PACKAGE_ID,
        agentId: 'rca',
        pluginSourcePath,
      }),
      runtime_source_carrier: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'redcube',
      },
    }));
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.0',
      sourceHeadSha: 'adopted-source-v1',
    });
    const env = { OPL_STATE_DIR: stateDir, OPL_MODULES_ROOT: modulesRoot, ...fixtureEnv };
    runCli([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env);
    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const lockIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lockIndex.packages.find((entry: any) => entry.package_id === FIXTURE_RCA_PACKAGE_ID)
      .managed_runtime_source.ownership = 'preexisting_adopted';
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));

    const removed = runCli(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(
      removed.opl_agent_package_uninstall.lifecycle_receipt.managed_runtime_source.status,
      'retained_on_uninstall',
    );
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared')), true);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});
