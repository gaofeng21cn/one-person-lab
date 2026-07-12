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
import { rollbackManagedModulePackageChannel } from '../../../../../src/modules/connect/system-installation/module-package-channel.ts';
import { resolveOplDomainModuleSpec } from '../../../../../src/modules/connect/system-installation/modules.ts';

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
    const providerManifest = writeCapabilityProvider(providerRoot);
    const consumerManifest = path.join(fixtureRoot, 'consumer.json');
    fs.writeFileSync(consumerManifest, formatJsonPayload({
      ...agentPackageManifest({
        packageId: 'rca',
        agentId: 'rca',
        pluginSourcePath,
      }),
      runtime_source_carrier: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'redcube',
      },
      capability_dependencies: [{
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
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

    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'source-transaction-v2',
    }));
    const failedUpdate = runCliFailure([
      'packages', 'update', '--package-id', 'redcube-ai',
      '--scope', 'workspace',
      '--target-workspace', badWorkspaceTarget,
    ], env);
    assert.equal(failedUpdate.payload.error.code, 'unexpected_error', JSON.stringify(failedUpdate.payload));
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    const persistedAfterFailure = JSON.parse(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'));
    assert.equal(
      persistedAfterFailure.packages.find((entry: any) => entry.package_id === 'rca')
        .managed_runtime_source.source_git_head_sha,
      'source-transaction-v1',
    );

    const updated = runCli(['packages', 'update', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(updated.opl_agent_package_update.package_lock.managed_runtime_source.source_git_head_sha, 'source-transaction-v2');
    env.OPL_PACKAGES_OWNER = 'missing-fixture-owner';
    const preActivationFailure = runCliFailure(['packages', 'update', '--package-id', 'redcube-ai'], env);
    assert.equal(preActivationFailure.payload.error.code, 'build_command_failed');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    env.OPL_PACKAGES_OWNER = 'fixture';
    const status = runCli([
      'packages', 'status', '--package-id', 'redcube-ai',
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(status.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(status.opl_agent_package_status.runtime_source_readiness.operational_ready, true);
    assert.equal(status.opl_agent_package_status.launch_allowed, true);

    fs.rmSync(path.join(fixtureRoot, 'bin', 'external-runtime-tool'));
    const missingRuntimeStatus = runCli([
      'packages', 'status', '--package-id', 'redcube-ai',
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(missingRuntimeStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(missingRuntimeStatus.opl_agent_package_status.runtime_source_readiness.reason, 'managed_runtime_source_probe_failed');
    assert.equal(missingRuntimeStatus.opl_agent_package_status.launch_allowed, false);
    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'source-transaction-v2',
    }));

    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const missingStateIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const missingStateLock = missingStateIndex.packages.find((entry: any) => entry.package_id === 'rca');
    const retainedSourceState = missingStateLock.managed_runtime_source;
    delete missingStateLock.managed_runtime_source;
    fs.writeFileSync(lockPath, formatJsonPayload(missingStateIndex));
    const missingStateStatus = runCli([
      'packages', 'status', '--package-id', 'redcube-ai',
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(missingStateStatus.opl_agent_package_status.runtime_source_readiness.status, 'missing');
    assert.equal(missingStateStatus.opl_agent_package_status.launch_allowed, false);
    missingStateLock.managed_runtime_source = retainedSourceState;
    fs.writeFileSync(lockPath, formatJsonPayload(missingStateIndex));

    fs.rmSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'));
    const driftedStatus = runCli([
      'packages', 'status', '--package-id', 'redcube-ai',
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(driftedStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(driftedStatus.opl_agent_package_status.launch_allowed, false);
    assert.equal(driftedStatus.opl_agent_package_status.launch_blocked_reason, 'runtime_source_incompatible');
    const driftRepaired = runCli(['packages', 'repair', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(driftRepaired.opl_agent_package_repair.package_lock.managed_runtime_source.preparation_status, 'completed');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');

    fs.rmSync(path.join(modulesRoot, 'redcube-ai'), { recursive: true, force: true });
    const missingSourceStatus = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(missingSourceStatus.opl_agent_package_status.runtime_source_readiness.status, 'missing');
    const missingSourceRepaired = runCli(['packages', 'repair', '--package-id', 'redcube-ai'], env) as any;
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

    const rolledBack = runCli(['packages', 'rollback', '--package-id', 'redcube-ai'], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_FINALIZE_FAIL: '1',
    }) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.runtime_source_cleanup.status, 'cleanup_pending');
    assert.equal(rolledBack.opl_agent_package_rollback.package_lock.managed_runtime_source.source_git_head_sha, 'source-transaction-v1');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    const rollbackCleanup = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(rollbackCleanup.opl_agent_package_status.runtime_source_recovery.cleanup_completed_count, 1);

    const moduleRuntimeEnvRoot = path.join(stateDir, 'agent-package-runtime-envs', 'redcube');
    assert.ok(fs.readdirSync(moduleRuntimeEnvRoot).length >= 2);
    runCli(['packages', 'uninstall', '--package-id', 'redcube-ai'], env);
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
      ...agentPackageManifest({ packageId: 'rca', agentId: 'rca', pluginSourcePath }),
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
    runCli(['packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party'], env);

    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'recovery-v2',
    }));
    const preparedUpdate = runCliFailure(['packages', 'update', '--package-id', 'redcube-ai'], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_PREPARE_APPLY: '1',
    });
    assert.equal(preparedUpdate.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_prepare_apply');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    const interruptedStagePath = path.join(modulesRoot, 'redcube-ai.stage');
    fs.mkdirSync(interruptedStagePath, { recursive: true });
    fs.writeFileSync(path.join(interruptedStagePath, 'partial-download'), 'staged but not activated\n');
    const preparedUpdateRecovery = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 1);
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    assert.equal(fs.existsSync(interruptedStagePath), false);

    const interruptedUpdate = runCliFailure(['packages', 'update', '--package-id', 'redcube-ai'], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_APPLY: '1',
    });
    assert.equal(interruptedUpdate.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_apply', JSON.stringify(interruptedUpdate.payload));
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const recoveredStatus = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 1);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');

    runCli(['packages', 'update', '--package-id', 'redcube-ai'], env);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const preparedRollback = runCliFailure(['packages', 'rollback', '--package-id', 'redcube-ai'], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_PREPARE_ROLLBACK: '1',
    });
    assert.equal(preparedRollback.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_prepare_rollback');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const preparedRollbackRecovery = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 1);
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');

    const interruptedUninstall = runCliFailure(['packages', 'uninstall', '--package-id', 'redcube-ai'], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_STAGE_UNINSTALL: '1',
    });
    assert.equal(interruptedUninstall.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_stage_uninstall');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);
    const restoredStatus = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 1);
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), true);

    const uninstalled = runCli(['packages', 'uninstall', '--package-id', 'redcube-ai'], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_FINALIZE_FAIL: '1',
    }) as any;
    assert.equal(uninstalled.opl_agent_package_uninstall.runtime_source_cleanup.status, 'cleanup_pending');
    const markerDir = path.join(stateDir, 'agent-package-runtime-source-transactions');
    assert.equal(fs.readdirSync(markerDir).length, 1);
    const postCommitRecovery = runCli(['packages', 'status', '--package-id', 'redcube-ai'], env) as any;
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
        packageId: 'mas',
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
    const masLock = lockIndex.packages.find((entry: any) => entry.package_id === 'mas');
    masLock.managed_runtime_source.health_check_command = ['bash', maliciousCommand];
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));
    const tamperedStatus = runCli(['packages', 'status', '--package-id', 'med-autoscience'], env) as any;
    assert.equal(fs.existsSync(maliciousSentinel), false);
    assert.equal(tamperedStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(tamperedStatus.opl_agent_package_status.runtime_source_readiness.reason, 'managed_runtime_source_command_drift');

    const repaired = runCli(['packages', 'repair', '--package-id', 'med-autoscience'], env) as any;
    assert.notDeepEqual(
      repaired.opl_agent_package_repair.package_lock.managed_runtime_source.health_check_command,
      ['bash', maliciousCommand],
    );
    const repairedStatus = runCli(['packages', 'status', '--package-id', 'med-autoscience'], env) as any;
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
        packageId: 'rca',
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
    lockIndex.packages.find((entry: any) => entry.package_id === 'rca')
      .managed_runtime_source.ownership = 'preexisting_adopted';
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));

    const removed = runCli(['packages', 'uninstall', '--package-id', 'redcube-ai'], env) as any;
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
