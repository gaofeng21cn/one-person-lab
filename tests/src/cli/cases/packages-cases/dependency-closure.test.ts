import {
  assert,
  formatJsonPayload,
  fs,
  os,
  path,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from './helpers.ts';
import {
  scholarSkillsCoreSkillIds as coreSkillIds,
  scholarSkillsModuleIds as moduleIds,
  writeCapabilityProvider,
  writeMasConsumer,
} from './capability-fixtures.ts';

test('MAS package lifecycle atomically installs and repairs its 11-core capability closure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-dependency-closure-'));
  const stateDir = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const providerRoot = path.join(root, 'provider');
  const providerManifestPath = writeCapabilityProvider(providerRoot);
  const consumerManifestPath = writeMasConsumer(root, providerManifestPath);
  const env = { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome };
  try {
    const install = await runCliAsync([
      'packages', 'install', '--manifest-url', consumerManifestPath,
      '--trust-tier', 'first_party', '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(install.opl_agent_package_install.status, 'installed');
    assert.deepEqual(
      install.opl_agent_package_install.dependency_package_locks.map((entry: any) => entry.package_id).sort(),
      ['mas-scholar-skills', 'med-autoscience'],
    );
    const masLock = install.opl_agent_package_install.package_lock;
    assert.equal(masLock.resolved_dependencies[0].installed_version, '0.1.0');
    assert.match(masLock.resolved_dependencies[0].manifest_sha256, /^[0-9a-f]{64}$/);
    assert.match(masLock.resolved_dependencies[0].content_digest, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(masLock.capability_dependencies[0].required_module_ids, moduleIds);
    const localSkillRoot = path.join(workspace, '.codex', 'skills');
    assert.deepEqual(fs.readdirSync(localSkillRoot).sort(), [...coreSkillIds].sort());
    assert.equal(fs.existsSync(path.join(localSkillRoot, 'medical-optional-specialty')), false);
    assert.equal(fs.existsSync(path.join(localSkillRoot, 'medical-manuscript-writing', 'helper.txt')), true);

    const current = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(current.opl_agent_package_status.package_dependency_readiness.status, 'current');
    assert.equal(current.opl_agent_package_status.materialization_readiness.status, 'current');
    assert.match(current.opl_agent_package_status.materialization_readiness.lifecycle_receipt_ref, /^opl:\/\//);
    assert.equal(current.opl_agent_package_status.operational_ready, true);
    assert.equal(current.opl_agent_package_status.launch_allowed, true);

    fs.rmSync(path.join(localSkillRoot, 'medical-manuscript-writing'), { recursive: true, force: true });
    const degraded = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(degraded.opl_agent_package_status.materialization_readiness.status, 'missing');
    assert.equal(degraded.opl_agent_package_status.operational_ready, false);
    assert.equal(degraded.opl_agent_package_status.launch_allowed, false);
    assert.deepEqual(degraded.opl_agent_package_status.allowed_when_blocked, ['status', 'doctor', 'repair']);

    const repaired = await runCliAsync([
      'packages', 'repair', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(repaired.opl_agent_package_repair.status, 'repaired');
    assert.equal(fs.existsSync(path.join(localSkillRoot, 'medical-manuscript-writing', 'SKILL.md')), true);

    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const lockIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const providerLock = lockIndex.packages.find((entry: any) => entry.package_id === 'mas-scholar-skills');
    providerLock.capability_provider.module_export_ids = providerLock.capability_provider.module_export_ids.slice(1);
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));
    const moduleMissing = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    const dependencyItem = moduleMissing.opl_agent_package_status.package_dependency_readiness.dependencies[0];
    assert.equal(dependencyItem.status, 'incompatible');
    assert.deepEqual(dependencyItem.missing_required_export_ids, []);
    assert.deepEqual(dependencyItem.missing_required_module_ids, ['mas-scholar-skills.display']);
    assert.equal(moduleMissing.opl_agent_package_status.operational_ready, false);
    providerLock.capability_provider.module_export_ids = moduleIds;
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));

    for (const action of ['disable', 'uninstall']) {
      const blocked = runCliFailure(['packages', action, 'mas-scholar-skills'], env);
      assert.equal(blocked.payload.error.details.failure_code, 'agent_package_required_by_installed_dependents');
      assert.deepEqual(blocked.payload.error.details.dependent_package_ids, ['med-autoscience']);
    }

    const ledgerPath = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const statusBeforeReceiptRemoval = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    const receiptRef = statusBeforeReceiptRemoval.opl_agent_package_status.materialization_readiness.lifecycle_receipt_ref;
    ledger.receipts = ledger.receipts.filter((entry: any) => entry.receipt_ref !== receiptRef);
    fs.writeFileSync(ledgerPath, formatJsonPayload(ledger));
    const receiptMissing = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(receiptMissing.opl_agent_package_status.materialization_readiness.status, 'incompatible');
    assert.equal(receiptMissing.opl_agent_package_status.materialization_readiness.lifecycle_receipt_ref, null);
    assert.equal(receiptMissing.opl_agent_package_status.operational_ready, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('MAS dependency closure update and rollback atomically rematerialize known scopes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-dependency-rollback-'));
  const stateDir = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0');
  const consumerV1 = writeMasConsumer(path.join(root, 'consumer-v1'), providerV1, '0.1.0a4');
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1');
  const consumerV2 = writeMasConsumer(path.join(root, 'consumer-v2'), providerV2, '0.1.0a5');
  const env = { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome };
  const helperPath = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt');
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerV1, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.0/);

    const updated = await runCliAsync([
      'packages', 'update', 'mas', '--manifest-url', consumerV2, '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(updated.opl_agent_package_update.status, 'updated');
    assert.deepEqual(
      updated.opl_agent_package_update.dependency_package_locks
        .map((entry: any) => `${entry.package_id}@${entry.package_version}`).sort(),
      ['mas-scholar-skills@0.1.1', 'med-autoscience@0.1.0a5'],
    );
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.1/);
    const updatedStatus = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(updatedStatus.opl_agent_package_status.materialization_readiness.status, 'current');

    const rolledBack = runCli(['packages', 'rollback', 'mas'], env) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.status, 'rolled_back');
    assert.deepEqual(
      rolledBack.opl_agent_package_rollback.dependency_package_locks
        .map((entry: any) => `${entry.package_id}@${entry.package_version}`).sort(),
      ['mas-scholar-skills@0.1.0', 'med-autoscience@0.1.0a4'],
    );
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.0/);
    const rollbackStatus = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(rollbackStatus.opl_agent_package_status.materialization_readiness.status, 'current');
    assert.equal(rollbackStatus.opl_agent_package_status.operational_ready, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed MAS closure update and rollback restore package state and scope files together', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-dependency-failure-'));
  const stateDir = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0');
  const consumerV1 = writeMasConsumer(path.join(root, 'consumer-v1'), providerV1, '0.1.0a4');
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1');
  const consumerV2 = writeMasConsumer(path.join(root, 'consumer-v2'), providerV2, '0.1.0a5');
  const env = { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome };
  const helperPath = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt');
  const status = () => runCli([
    'packages', 'status', '--package-id', 'mas',
    '--scope', 'workspace', '--target-workspace', workspace,
  ], env).opl_agent_package_status;
  const withReadOnlyState = (action: () => void) => {
    fs.chmodSync(stateDir, 0o555);
    try {
      action();
    } finally {
      fs.chmodSync(stateDir, 0o755);
    }
  };
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    withReadOnlyState(() => {
      runCliFailure([
        'packages', 'install', '--manifest-url', consumerV1, '--trust-tier', 'first_party',
        '--scope', 'workspace', '--target-workspace', workspace,
      ], env);
    });
    assert.equal(fs.existsSync(path.join(workspace, '.codex', 'skills')), false);
    assert.equal(runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status.installed_package_count, 0);

    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerV1, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);

    withReadOnlyState(() => {
      runCliFailure([
        'packages', 'update', 'mas', '--manifest-url', consumerV2, '--trust-tier', 'first_party',
      ], env);
    });
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.0/);
    assert.equal(status().materialization_readiness.status, 'current');
    assert.equal(status().installed_packages[0].package_version, '0.1.0a4');

    await runCliAsync([
      'packages', 'update', 'mas', '--manifest-url', consumerV2, '--trust-tier', 'first_party',
    ], env);
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.1/);

    withReadOnlyState(() => {
      runCliFailure(['packages', 'rollback', 'mas'], env);
    });
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.1/);
    assert.equal(status().materialization_readiness.status, 'current');
    assert.equal(status().installed_packages[0].package_version, '0.1.0a5');
  } finally {
    if (fs.existsSync(stateDir)) fs.chmodSync(stateDir, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
