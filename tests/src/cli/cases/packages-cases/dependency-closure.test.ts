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

function appendCapabilityDependency(
  consumerManifestPath: string,
  input: {
    packageId: string;
    manifestPath: string;
    capabilityAbi: string;
    skillIds: string[];
    moduleIds: string[];
  },
) {
  const manifest = JSON.parse(fs.readFileSync(consumerManifestPath, 'utf8'));
  manifest.capability_dependencies.push({
    ...manifest.capability_dependencies[0],
    module_id: input.packageId,
    package_id: input.packageId,
    manifest_url: input.manifestPath,
    capability_abi: input.capabilityAbi,
    required_export_ids: input.skillIds,
    required_module_ids: input.moduleIds,
  });
  delete manifest.capability_dependencies.at(-1).bootstrap_manifest_url;
  delete manifest.capability_dependencies.at(-1).dependency_source;
  fs.writeFileSync(consumerManifestPath, formatJsonPayload(manifest));
}

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
      ['mas', 'mas-scholar-skills'],
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
      assert.deepEqual(blocked.payload.error.details.dependent_package_ids, ['mas']);
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
  const secondWorkspace = path.join(root, 'workspace-two');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(secondWorkspace, { recursive: true });
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'), '0.1.0');
  const consumerV1 = writeMasConsumer(path.join(root, 'consumer-v1'), providerV1, '0.1.0a4');
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1');
  const consumerV2 = writeMasConsumer(path.join(root, 'consumer-v2'), providerV2, '0.1.0');
  const env = { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome };
  const helperPath = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing', 'helper.txt');
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerV1, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    runCli([
      'packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', secondWorkspace,
    ], env);
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.0/);

    const updated = await runCliAsync([
      'packages', 'update', 'mas', '--manifest-url', consumerV2, '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(updated.opl_agent_package_update.status, 'updated');
    assert.deepEqual(
      updated.opl_agent_package_update.dependency_package_locks
        .map((entry: any) => `${entry.package_id}@${entry.package_version}`).sort(),
      ['mas-scholar-skills@0.1.1', 'mas@0.1.0'],
    );
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.1/);
    const updatedStatus = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(updatedStatus.opl_agent_package_status.materialization_readiness.status, 'current');
    const secondUpdatedStatus = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', secondWorkspace,
    ], env) as any;
    assert.equal(secondUpdatedStatus.opl_agent_package_status.materialization_readiness.status, 'current');

    const rolledBack = runCli(['packages', 'rollback', 'mas'], env) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.status, 'rolled_back');
    assert.deepEqual(
      rolledBack.opl_agent_package_rollback.dependency_package_locks
        .map((entry: any) => `${entry.package_id}@${entry.package_version}`).sort(),
      ['mas-scholar-skills@0.1.0', 'mas@0.1.0-alpha.4'],
    );
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.0/);
    const rollbackStatus = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(rollbackStatus.opl_agent_package_status.materialization_readiness.status, 'current');
    assert.equal(rollbackStatus.opl_agent_package_status.operational_ready, true);
    const secondRollbackStatus = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', secondWorkspace,
    ], env) as any;
    assert.equal(secondRollbackStatus.opl_agent_package_status.materialization_readiness.status, 'current');
    assert.equal(secondRollbackStatus.opl_agent_package_status.operational_ready, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('MAS scope materialization never overwrites an unowned local Skill', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-scope-collision-'));
  const workspace = path.join(root, 'workspace');
  const localSkill = path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest);
  const env = { OPL_STATE_DIR: path.join(root, 'state'), CODEX_HOME: path.join(root, 'codex-home') };
  try {
    fs.mkdirSync(localSkill, { recursive: true });
    fs.writeFileSync(path.join(localSkill, 'SKILL.md'), '# user-owned local Skill\n');
    const blocked = await runCliFailure([
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    assert.equal(blocked.payload.error.details.failure_code, 'agent_package_scope_unowned_skill_collision');
    assert.deepEqual(blocked.payload.error.details.collision_skill_ids, ['medical-manuscript-writing']);
    assert.equal(fs.readFileSync(path.join(localSkill, 'SKILL.md'), 'utf8'), '# user-owned local Skill\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('initial MAS rollback preserves a preinstalled provider and restores the workspace prestate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-initial-rollback-'));
  const stateDir = path.join(root, 'state');
  const codexHome = path.join(root, 'codex-home');
  const workspace = path.join(root, 'workspace');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest);
  const originalSkillRoot = path.join(workspace, '.codex', 'skills', 'workspace-user-skill');
  const env = { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome };
  try {
    fs.mkdirSync(originalSkillRoot, { recursive: true });
    fs.writeFileSync(path.join(originalSkillRoot, 'SKILL.md'), '# workspace-owned prestate\n');
    fs.writeFileSync(path.join(originalSkillRoot, 'local.txt'), 'preserve me\n');

    await runCliAsync([
      'packages', 'install', '--manifest-url', providerManifest, '--trust-tier', 'first_party',
    ], env);
    const providerBefore = runCli([
      'packages', 'status', '--package-id', 'mas-scholar-skills',
    ], env).opl_agent_package_status.installed_packages[0];

    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    assert.equal(fs.existsSync(path.join(originalSkillRoot, 'local.txt')), true);

    const rolledBack = runCli(['packages', 'rollback', 'mas'], env) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.package_lock, null);
    assert.deepEqual(
      rolledBack.opl_agent_package_rollback.dependency_package_locks.map((entry: any) => entry.package_id),
      ['mas-scholar-skills'],
    );
    assert.equal(fs.readFileSync(path.join(originalSkillRoot, 'SKILL.md'), 'utf8'), '# workspace-owned prestate\n');
    assert.equal(fs.readFileSync(path.join(originalSkillRoot, 'local.txt'), 'utf8'), 'preserve me\n');

    const masStatus = runCli(['packages', 'status', '--package-id', 'mas'], env) as any;
    assert.equal(masStatus.opl_agent_package_status.installed_package_count, 0);
    const providerAfter = runCli([
      'packages', 'status', '--package-id', 'mas-scholar-skills',
    ], env).opl_agent_package_status.installed_packages[0];
    assert.equal(providerAfter.package_version, providerBefore.package_version);
    assert.equal(providerAfter.lock_ref, providerBefore.lock_ref);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fresh MAS install has no virtual rollback target and preserves its installed closure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-fresh-install-rollback-'));
  const workspace = path.join(root, 'workspace');
  const originalSkillRoot = path.join(workspace, '.codex', 'skills', 'workspace-user-skill');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest);
  const env = { OPL_STATE_DIR: path.join(root, 'state'), CODEX_HOME: path.join(root, 'codex-home') };
  try {
    fs.mkdirSync(originalSkillRoot, { recursive: true });
    fs.writeFileSync(path.join(originalSkillRoot, 'SKILL.md'), '# workspace prestate\n');
    fs.writeFileSync(path.join(originalSkillRoot, 'local.txt'), 'keep me\n');
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);

    const lockIndex = JSON.parse(fs.readFileSync(
      path.join(env.OPL_STATE_DIR, 'agent-package-locks.json'),
      'utf8',
    ));
    assert.deepEqual(lockIndex.last_known_good_transactions, []);
    const rollbackFailure = runCliFailure(['packages', 'rollback', 'mas'], env);
    assert.equal(rollbackFailure.payload.error.details.failure_code, 'agent_package_last_known_good_missing');
    assert.equal(runCli(['packages', 'status', '--package-id', 'mas'], env)
      .opl_agent_package_status.installed_package_count, 1);
    assert.equal(runCli(['packages', 'status', '--package-id', 'mas-scholar-skills'], env)
      .opl_agent_package_status.installed_package_count, 1);
    assert.equal(fs.readFileSync(path.join(originalSkillRoot, 'SKILL.md'), 'utf8'), '# workspace prestate\n');
    assert.equal(fs.readFileSync(path.join(originalSkillRoot, 'local.txt'), 'utf8'), 'keep me\n');
    assert.equal(fs.existsSync(path.join(workspace, '.codex', 'skills', 'medical-manuscript-writing')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('last-known-good generations are retained per root package', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-lkg-per-root-'));
  const stateDir = path.join(root, 'state');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'));
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest);
  const env = { OPL_STATE_DIR: stateDir, CODEX_HOME: path.join(root, 'codex-home') };
  try {
    await runCliAsync(['packages', 'install', '--manifest-url', providerManifest, '--trust-tier', 'first_party'], env);
    await runCliAsync(['packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party'], env);
    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const lockIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const masLkg = lockIndex.last_known_good_transactions.find((entry: any) => entry.root_package_id === 'mas');
    lockIndex.last_known_good_transactions = [0, 1, 2, 3, 4].map((index) => ({
      root_package_id: `unrelated-${index}`,
      transaction_id: `transaction-${index}`,
      closure_digest: `digest-${index}`,
      package_locks: [],
    })).concat(masLkg);
    fs.writeFileSync(lockPath, formatJsonPayload(lockIndex));

    assert.equal(runCli(['packages', 'rollback', 'mas'], env).opl_agent_package_rollback.status, 'rolled_back');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('multi-provider scope readiness checks every provider and activation compensates partial writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-multi-provider-scope-'));
  const workspace = path.join(root, 'workspace');
  const failedWorkspace = path.join(root, 'failed-workspace');
  const providerA = writeCapabilityProvider(path.join(root, 'provider-a'), '0.1.0', {
    packageId: 'capability-provider-a',
    capabilityAbi: 'capability-provider-a.v1',
    coreSkillIds: ['provider-a-skill'],
    moduleIds: ['provider-a.module'],
  });
  const providerBRoot = path.join(root, 'provider-b');
  const providerB = writeCapabilityProvider(providerBRoot, '0.1.0', {
    packageId: 'capability-provider-b',
    capabilityAbi: 'capability-provider-b.v1',
    coreSkillIds: ['provider-b-skill'],
    moduleIds: ['provider-b.module'],
  });
  const consumer = writeMasConsumer(path.join(root, 'consumer'), providerA);
  const manifest = JSON.parse(fs.readFileSync(consumer, 'utf8'));
  Object.assign(manifest.capability_dependencies[0], {
    module_id: 'provider-a',
    package_id: 'capability-provider-a',
    manifest_url: providerA,
    capability_abi: 'capability-provider-a.v1',
    required_export_ids: ['provider-a-skill'],
    required_module_ids: ['provider-a.module'],
  });
  fs.writeFileSync(consumer, formatJsonPayload(manifest));
  appendCapabilityDependency(consumer, {
    packageId: 'capability-provider-b',
    manifestPath: providerB,
    capabilityAbi: 'capability-provider-b.v1',
    skillIds: ['provider-b-skill'],
    moduleIds: ['provider-b.module'],
  });
  const env = { OPL_STATE_DIR: path.join(root, 'state'), CODEX_HOME: path.join(root, 'codex-home') };
  try {
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(failedWorkspace, { recursive: true });
    await runCliAsync(['packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party'], env);
    runCli(['packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', workspace], env);
    fs.rmSync(path.join(workspace, '.codex', 'skills', 'provider-b-skill'), { recursive: true, force: true });
    const degraded = runCli([
      'packages', 'status', '--package-id', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status;
    assert.equal(degraded.materialization_readiness.status, 'missing');
    assert.equal(degraded.launch_allowed, false);

    fs.rmSync(path.join(providerBRoot, 'skills', 'provider-b-skill', 'SKILL.md'), { force: true });
    const failure = runCliFailure([
      'packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', failedWorkspace,
    ], env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_scope_core_skill_missing');
    assert.equal(fs.existsSync(path.join(failedWorkspace, '.codex', 'skills', 'provider-a-skill')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('install cannot overwrite a provider that has installed required dependents', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-provider-install-guard-'));
  const providerV1 = writeCapabilityProvider(path.join(root, 'provider-v1'));
  const providerV2 = writeCapabilityProvider(path.join(root, 'provider-v2'), '0.1.1');
  const consumer = writeMasConsumer(path.join(root, 'consumer'), providerV1);
  const env = { OPL_STATE_DIR: path.join(root, 'state'), CODEX_HOME: path.join(root, 'codex-home') };
  try {
    await runCliAsync(['packages', 'install', '--manifest-url', consumer, '--trust-tier', 'first_party'], env);
    const failure = await runCliFailure([
      'packages', 'install', '--manifest-url', providerV2, '--trust-tier', 'first_party',
    ], env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_required_by_installed_dependents');
    assert.deepEqual(failure.payload.error.details.dependent_package_ids, ['mas']);
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
  const consumerV2 = writeMasConsumer(path.join(root, 'consumer-v2'), providerV2, '0.1.0');
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
    assert.equal(status().installed_packages[0].package_version, '0.1.0-alpha.4');

    await runCliAsync([
      'packages', 'update', 'mas', '--manifest-url', consumerV2, '--trust-tier', 'first_party',
    ], env);
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.1/);

    withReadOnlyState(() => {
      runCliFailure(['packages', 'rollback', 'mas'], env);
    });
    assert.match(fs.readFileSync(helperPath, 'utf8'), /0\.1\.1/);
    assert.equal(status().materialization_readiness.status, 'current');
    assert.equal(status().installed_packages[0].package_version, '0.1.0');
  } finally {
    if (fs.existsSync(stateDir)) fs.chmodSync(stateDir, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
