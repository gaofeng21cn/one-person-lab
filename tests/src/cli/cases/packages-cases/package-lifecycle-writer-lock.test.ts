import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { removeFixtureTree } from '../../helpers.ts';
import {
  agentPackageManifest,
  assert,
  createPluginSourceFixture,
  formatJsonPayload,
  fs,
  os,
  path,
  runCliAsync,
  runCliFailure,
  test,
} from './helpers.ts';
import {
  withAgentPackageLifecycleTransaction,
} from '../../../../../src/modules/connect/agent-package-registry-parts/store.ts';
import {
  writeCapabilityCatalog,
  writeCapabilityProvider,
  writeMasConsumer,
} from './capability-fixtures.ts';

async function withProcessEnv<T>(
  overrides: Record<string, string>,
  operation: () => Promise<T>,
) {
  const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return await operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function lifecycleLockPath(stateDir: string) {
  return path.join(stateDir, 'agent-package-lifecycle.sqlite');
}

function assertNoScopeTransactionArtifacts(workspace: string) {
  const transactionRoot = path.join(workspace, '.codex', '.opl-package-transactions');
  if (fs.existsSync(transactionRoot)) {
    assert.deepEqual(fs.readdirSync(transactionRoot), []);
  }
}

test('package lifecycle SQLite writer mutex times out on live contention and recovers after release or failure', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-writer-lock-state-'));
  const lockPath = lifecycleLockPath(stateDir);
  try {
    await withProcessEnv({ OPL_STATE_DIR: stateDir }, async () => {
      await withAgentPackageLifecycleTransaction(true, async () => 'dry-run');
      assert.equal(fs.existsSync(lockPath), false);

      fs.mkdirSync(stateDir, { recursive: true });
      const liveOwner = new DatabaseSync(lockPath);
      liveOwner.exec('PRAGMA journal_mode = WAL;');
      liveOwner.exec('BEGIN IMMEDIATE;');
      await assert.rejects(
        withAgentPackageLifecycleTransaction(
          false,
          async () => 'must-not-run',
          { timeoutMs: 0 },
        ),
        (error: any) => error?.details?.failure_code === 'agent_package_lifecycle_lock_timeout'
          && error?.details?.owner_pid_alive === null,
      );
      liveOwner.exec('ROLLBACK;');
      liveOwner.close();

      assert.equal(await withAgentPackageLifecycleTransaction(
        false,
        async () => 'recovered',
        { timeoutMs: 100 },
      ), 'recovered');

      await assert.rejects(
        withAgentPackageLifecycleTransaction(false, async () => {
          throw new Error('fixture operation failed');
        }),
        /fixture operation failed/,
      );
      assert.equal(await withAgentPackageLifecycleTransaction(
        false,
        async () => 'successor',
        { timeoutMs: 100 },
      ), 'successor');
      assert.equal(fs.existsSync(lockPath), true);
    });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('concurrent package activation preserves distinct workspaces and avoids shared-workspace staging conflicts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-writer-concurrency-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const workspaceA = path.join(root, 'workspace-a');
  const workspaceB = path.join(root, 'workspace-b');
  const sharedWorkspace = path.join(root, 'workspace-shared');
  const provider = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), provider, '0.1.0');
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumer, provider]);
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_SOURCE_MODE: 'package_channel',
    ...releaseSet.env,
  };

  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    await Promise.all([workspaceA, workspaceB].map((workspace) => runCliAsync([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env)));

    const lockFile = path.join(stateDir, 'agent-package-locks.json');
    const ledgerFile = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
    const afterDistinct = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const mas = afterDistinct.packages.find((entry: any) => entry.package_id === 'mas');
    assert.deepEqual(
      mas.scope_materializations.map((entry: any) => path.resolve(entry.target_root)).sort(),
      [path.resolve(workspaceA), path.resolve(workspaceB)].sort(),
    );
    const distinctUseTargets = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).receipts
      .filter((entry: any) => entry.action === 'use')
      .map((entry: any) => path.resolve(entry.use_binding.target_root));
    assert.equal(distinctUseTargets.includes(path.resolve(workspaceA)), true);
    assert.equal(distinctUseTargets.includes(path.resolve(workspaceB)), true);
    assertNoScopeTransactionArtifacts(workspaceA);
    assertNoScopeTransactionArtifacts(workspaceB);

    await Promise.all([0, 1].map(() => runCliAsync([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', sharedWorkspace,
    ], env)));
    const afterShared = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const sharedMas = afterShared.packages.find((entry: any) => entry.package_id === 'mas');
    assert.equal(
      sharedMas.scope_materializations.filter(
        (entry: any) => path.resolve(entry.target_root) === path.resolve(sharedWorkspace),
      ).length,
      1,
    );
    assertNoScopeTransactionArtifacts(sharedWorkspace);
    assert.equal(fs.existsSync(lifecycleLockPath(stateDir)), true);

    const liveOwner = new DatabaseSync(lifecycleLockPath(stateDir));
    liveOwner.exec('PRAGMA journal_mode = WAL;');
    liveOwner.exec('BEGIN IMMEDIATE;');
    try {
      const lkgActivation = await runCliAsync([
        'packages', 'activate', 'mas',
        '--scope', 'workspace', '--target-workspace', sharedWorkspace,
      ], env) as any;
      assert.equal(lkgActivation.opl_agent_package_activation.status, 'using_last_known_good');
      assert.equal(lkgActivation.opl_agent_package_activation.writes_performed, false);
      assert.equal(lkgActivation.opl_agent_package_activation.launch_allowed, true);
      assert.equal(
        lkgActivation.opl_agent_package_activation.package_use_binding.refresh_outcome,
        'recovered_last_known_good',
      );
      assert.equal(
        lkgActivation.opl_agent_package_activation.package_use_binding.reconciliation_issue.failure_code,
        'agent_package_lifecycle_lock_timeout',
      );
    } finally {
      liveOwner.exec('ROLLBACK;');
      liveOwner.close();
    }
    const recoveredActivation = await runCliAsync([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', sharedWorkspace,
    ], env) as any;
    assert.equal(recoveredActivation.opl_agent_package_activation.launch_allowed, true);
    assert.notEqual(recoveredActivation.opl_agent_package_activation.status, 'using_last_known_good');
  } finally {
    removeFixtureTree(root);
  }
});

test('use-boundary catalog refresh has a short total budget and launches the LKG when the channel hangs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-use-refresh-budget-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const workspace = path.join(root, 'workspace');
  const hangingBin = path.join(root, 'hanging-bin');
  const provider = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), provider, '0.1.0');
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [consumer, provider]);
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_SOURCE_MODE: 'package_channel',
    ...releaseSet.env,
  };

  try {
    await runCliAsync(['packages', 'install', 'mas'], env);
    fs.mkdirSync(hangingBin, { recursive: true });
    fs.writeFileSync(
      path.join(hangingBin, 'curl'),
      [
        '#!/bin/sh',
        'while :; do :; done',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );

    const activated = await runCliAsync([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], {
      ...env,
      PATH: `${hangingBin}:${env.PATH}`,
      OPL_TEST_AGENT_PACKAGE_USE_REFRESH_TIMEOUT_MS: '500',
    }) as any;
    const activation = activated.opl_agent_package_activation;

    assert.equal(activation.launch_allowed, true);
    assert.equal(activation.operational_ready, true);
    assert.equal(activation.package_use_binding.latest_verified, false);
    assert.equal(activation.package_use_binding.freshness_mode, 'offline_lkg');
    assert.equal(activation.package_use_binding.refresh_outcome, 'recovered_last_known_good');
    assert.equal(
      activation.package_use_binding.reconciliation_issue.failure_code,
      'agent_package_capability_channel_unavailable',
    );
    assert.equal(
      activation.package_use_binding.reconciliation_issue.refresh_timeout_ms,
      500,
    );

    const ledgerPath = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as any;
    const persistedUseReceipt = ledger.receipts.find(
      (entry: any) => entry.receipt_ref === activation.package_use_binding.use_receipt_ref,
    );
    delete persistedUseReceipt.use_binding.reconciliation_issue.refresh_timeout_ms;
    fs.writeFileSync(ledgerPath, formatJsonPayload(ledger));

    const status = await runCliAsync(['packages', 'status', '--package-id', 'mas'], env) as any;
    const legacyUseReceipt = status.opl_agent_package_status.lifecycle_receipts.find(
      (entry: any) => entry.receipt_ref === activation.package_use_binding.use_receipt_ref,
    );
    assert.equal(
      Object.hasOwn(legacyUseReceipt.use_binding.reconciliation_issue, 'refresh_timeout_ms'),
      false,
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('forged package cleanup paths fail closed without deleting outside or symlink canaries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-persisted-path-canary-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const fixtureDir = path.join(root, 'fixture');
  const outsideRoot = path.join(root, 'outside-canary');
  const pluginSourcePath = createPluginSourceFixture();
  const manifestPath = path.join(fixtureDir, 'manifest.json');
  const lockFile = path.join(stateDir, 'agent-package-locks.json');
  const canaryPath = path.join(outsideRoot, 'canary.txt');
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
  };
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.writeFileSync(canaryPath, 'must remain\n');
  fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath })));

  try {
    await runCliAsync([
      'packages', 'install',
      '--manifest-url', pathToFileURL(manifestPath).href,
      '--trust-tier', 'third_party_verified',
    ], env);
    const installed = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const packageLock = installed.packages.find(
      (entry: any) => entry.package_id === 'third.party.research',
    );
    packageLock.physical_surface.codex_plugin_cache_path = outsideRoot;
    fs.writeFileSync(lockFile, formatJsonPayload(installed));
    const outsideFailure = runCliFailure([
      'packages', 'uninstall', 'third.party.research',
    ], env);
    assert.equal(
      outsideFailure.payload.error.details.failure_code,
      'agent_package_persisted_path_unsafe',
    );
    assert.equal(fs.readFileSync(canaryPath, 'utf8'), 'must remain\n');

    const cacheRoot = path.join(homeDir, '.codex', 'plugins', 'cache');
    const linkedCachePath = path.join(cacheRoot, 'forged-link');
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.symlinkSync(outsideRoot, linkedCachePath, 'dir');
    packageLock.physical_surface.codex_plugin_cache_path = linkedCachePath;
    fs.writeFileSync(lockFile, formatJsonPayload(installed));
    const symlinkFailure = runCliFailure([
      'packages', 'uninstall', 'third.party.research',
    ], env);
    assert.equal(
      symlinkFailure.payload.error.details.failure_code,
      'agent_package_persisted_path_unsafe',
    );
    assert.equal(fs.lstatSync(linkedCachePath).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(canaryPath, 'utf8'), 'must remain\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});
