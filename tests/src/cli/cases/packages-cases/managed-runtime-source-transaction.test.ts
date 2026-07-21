import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

import { removeFixtureTree } from '../../helpers.ts';
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
  writeCapabilityCatalog,
  writeCapabilityProvider,
  writeMasConsumer,
} from './capability-fixtures.ts';
import { writeManagedRuntimeSourceFixture } from './managed-runtime-source-fixture.ts';
import {
  applyManagedRuntimeSourceCarrier,
  cleanupUnreferencedDeveloperRuntimeSnapshots,
  finalizeManagedRuntimeSourceMutation,
  managedRuntimeSourceReadiness,
  recoverManagedRuntimeSourceTransactions,
  rollbackManagedRuntimeSourceMutation,
} from '../../../../../src/modules/connect/agent-package-registry-parts/managed-runtime-source-carrier.ts';
import {
  computePackageChannelTreeSha256,
  readPackageChannelLifecycle,
  rollbackManagedModulePackageChannel,
} from '../../../../../src/modules/connect/system-installation/module-package-channel.ts';
import { resolveOplDomainModuleSpec } from '../../../../../src/modules/connect/system-installation/modules.ts';
import { readDeveloperCheckoutSourceIdentity } from '../../../../../src/modules/connect/agent-package-registry-parts/developer-checkout-runtime-source.ts';

const FIXTURE_MAS_PACKAGE_ID = 'fixture.mas';
const FIXTURE_MAG_PACKAGE_ID = 'fixture.mag';
const FIXTURE_RCA_PACKAGE_ID = 'fixture.rca';
const FIXTURE_PROVIDER_PACKAGE_ID = 'fixture.mas-scholar-skills';

function bindMasWorkspace(workspace: string, env: Record<string, string>) {
  fs.mkdirSync(workspace, { recursive: true });
  runCli([
    'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
  ], env);
}

function runGit(checkoutPath: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: checkoutPath, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function exactTreeInventory(root: string) {
  const inventory: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const stat = fs.lstatSync(absolutePath);
      const kind = entry.isDirectory() ? 'dir' : entry.isSymbolicLink() ? 'link' : 'file';
      const content = entry.isDirectory()
        ? ''
        : entry.isSymbolicLink()
          ? fs.readlinkSync(absolutePath)
          : crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
      inventory.push(`${kind}\0${relativePath}\0${stat.mode & 0o777}\0${content}`);
      if (entry.isDirectory()) visit(absolutePath);
    }
  };
  visit(root);
  return inventory;
}

function exactTreeDigest(root: string) {
  return crypto.createHash('sha256').update(exactTreeInventory(root).join('\n')).digest('hex');
}

function writeOrdinaryUserMasRelease(root: string, version: string) {
  const provider = writeCapabilityProvider(path.join(root, 'provider'), version);
  const masRoot = path.join(root, 'mas');
  const mas = writeMasConsumer(masRoot, provider, version, { runtimeSourceCarrier: true });
  const runtimeFiles = [
    'contracts/action_catalog.json',
    'contracts/domain_handler_registry.json',
    'contracts/pack_compiler_input.json',
    'agent/stages/manifest.json',
  ];
  for (const relativePath of runtimeFiles) {
    const targetPath = path.join(masRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, formatJsonPayload({ fixture_version: version }));
  }
  const primarySkillPath = path.join(masRoot, 'agent', 'primary_skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(primarySkillPath), { recursive: true });
  fs.writeFileSync(primarySkillPath, `# MAS ${version}\n`);
  return writeCapabilityCatalog(path.join(root, 'release-set'), [mas, provider]);
}

function writeStandardAgentPackProbeFixture(root: string, version: string) {
  for (const relativePath of [
    'contracts/action_catalog.json',
    'contracts/domain_descriptor.json',
    'contracts/pack_compiler_input.json',
    'agent/stages/manifest.json',
  ]) {
    const targetPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, formatJsonPayload({ fixture_version: version }));
  }
  const skillPath = path.join(root, 'agent', 'primary_skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, `# Standard Agent ${version}\n`);
}

function writeFoundryAgentPackProbeFixture(root: string, version: string) {
  writeStandardAgentPackProbeFixture(root, version);
  fs.writeFileSync(
    path.join(root, 'contracts', 'foundry_provider.json'),
    formatJsonPayload({ fixture_version: version }),
  );
}

test('explicit developer checkout records provenance and runs an immutable managed snapshot', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const checkoutPath = path.join(fixtureRoot, 'med-autogrant');
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  const previousStateDir = process.env.OPL_STATE_DIR;
  fs.mkdirSync(path.join(checkoutPath, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutPath, 'package.json'), formatJsonPayload({ name: 'med-autogrant-fixture' }));
  fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'developer source v1\n');
  writeStandardAgentPackProbeFixture(checkoutPath, 'v1');
  fs.writeFileSync(
    path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh'),
    '#!/bin/sh\nset -eu\nprintf "ready\\n"\n',
  );
  fs.chmodSync(path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh'), 0o755);
  fs.writeFileSync(path.join(checkoutPath, 'scripts', 'run-python-clean.sh'), [
    '#!/bin/sh',
    'set -eu',
    'test "$1" = "-m"',
    'test "$3" = "--help"',
    'printf "handler-ready\\n"',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(manifestPath, formatJsonPayload({
    ...agentPackageManifest({ packageId: FIXTURE_MAS_PACKAGE_ID, agentId: 'mas', pluginSourcePath }),
    runtime_source_carrier: {
      carrier_kind: 'opl_managed_module_source',
      module_id: 'medautogrant',
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
  process.env.OPL_STATE_DIR = stateDir;

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
    const snapshotPath = installedSource.checkout_path;
    assert.notEqual(snapshotPath, checkoutPath);
    assert.equal(
      path.dirname(snapshotPath),
      path.join(stateDir, 'agent-package-developer-runtime-snapshots', 'medautogrant'),
    );
    assert.match(path.basename(snapshotPath), /^[0-9a-f]{64}$/);
    assert.equal(installedSource.source_checkout_path, checkoutPath);
    assert.equal(installedSource.source_mode, 'developer_checkout');
    assert.equal(installedSource.source_git_head_sha, headSha);
    assert.equal(installedSource.preparation_scope, 'developer_snapshot_root');
    assert.match(installedSource.runtime_snapshot_sha256, /^[0-9a-f]{64}$/);
    assert.match(installedSource.health_output_sha256, /^sha256:/);
    assert.match(installedSource.handler_probe_output_sha256, /^sha256:/);
    assert.equal(fs.existsSync(path.join(checkoutPath, 'opl-runtime-module.json')), false);
    assert.equal(fs.existsSync(snapshotPath), true);
    assert.equal(fs.existsSync(path.join(snapshotPath, '.git')), false);
    assert.equal(fs.existsSync(path.join(snapshotPath, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(snapshotPath, '.venv')), false);
    assert.equal(fs.statSync(snapshotPath).mode & 0o777, 0o555);
    assert.equal(fs.statSync(path.join(snapshotPath, 'runtime.txt')).mode & 0o777, 0o444);
    assert.equal(
      fs.statSync(path.join(snapshotPath, 'scripts', 'opl-module-healthcheck.sh')).mode & 0o777,
      0o555,
    );
    const snapshotInventory = exactTreeInventory(snapshotPath);
    assert.deepEqual(
      snapshotInventory.map((entry) => entry.split('\0')[1]).sort(),
      [
        'agent',
        'agent/primary_skill',
        'agent/primary_skill/SKILL.md',
        'agent/stages',
        'agent/stages/manifest.json',
        'contracts',
        'contracts/action_catalog.json',
        'contracts/domain_descriptor.json',
        'contracts/pack_compiler_input.json',
        'package.json',
        'runtime.txt',
        'scripts',
        'scripts/opl-module-healthcheck.sh',
        'scripts/run-python-clean.sh',
      ].sort(),
    );
    const current = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(current.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.deepEqual(exactTreeInventory(snapshotPath), snapshotInventory);

    fs.chmodSync(snapshotPath, 0o755);
    const unexpectedSnapshotPath = path.join(snapshotPath, 'unexpected-runtime-file.txt');
    fs.writeFileSync(unexpectedSnapshotPath, 'must not survive exact generation reuse\n');
    fs.chmodSync(snapshotPath, 0o555);
    assert.equal(managedRuntimeSourceReadiness(installedSource).status, 'incompatible');
    const restoredSnapshot = applyManagedRuntimeSourceCarrier({
      config: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'medautogrant',
      },
      previous: installedSource,
      action: 'update',
      dryRun: false,
      packageId: FIXTURE_MAS_PACKAGE_ID,
      sourceKind: 'developer_checkout_override',
      checkoutPath,
    });
    assert.equal(restoredSnapshot.after?.checkout_path, snapshotPath);
    assert.equal(fs.existsSync(unexpectedSnapshotPath), false);
    assert.equal(managedRuntimeSourceReadiness(restoredSnapshot.after).status, 'current');
    assert.deepEqual(exactTreeInventory(snapshotPath), snapshotInventory);

    fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'developer source v2\n');
    const dirty = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    const dirtyReadiness = dirty.opl_agent_package_status.runtime_source_readiness;
    assert.equal(dirtyReadiness.status, 'current');
    assert.equal(dirtyReadiness.operational_ready, true);
    assert.equal(dirty.opl_agent_package_status.launch_allowed, true);
    assert.equal(dirtyReadiness.expected_tree_sha256, installedSource.tree_sha256);
    assert.notEqual(dirtyReadiness.actual_tree_sha256, installedSource.tree_sha256);
    assert.equal(dirtyReadiness.provenance_observation.policy, 'observation_only');
    assert.equal(dirtyReadiness.provenance_observation.status, 'changed');
    assert.equal(dirtyReadiness.provenance_observation.recorded_source_git_head_sha, headSha);

    fs.mkdirSync(path.join(checkoutPath, 'docs'));
    fs.writeFileSync(path.join(checkoutPath, 'docs', 'notes.md'), 'developer notes\n');
    const untracked = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(untracked.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(untracked.opl_agent_package_status.launch_allowed, true);

    runGit(checkoutPath, ['add', '.']);
    runGit(checkoutPath, ['commit', '-qm', 'fixture v2']);
    const advancedHeadSha = runGit(checkoutPath, ['rev-parse', 'HEAD']);
    const advanced = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(advanced.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(advanced.opl_agent_package_status.launch_allowed, true);
    assert.equal(
      advanced.opl_agent_package_status.runtime_source_readiness.provenance_observation.actual_source_git_head_sha,
      advancedHeadSha,
    );

    const healthPath = path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh');
    const healthyScript = fs.readFileSync(healthPath, 'utf8');
    fs.writeFileSync(healthPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const liveProbeBroken = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(liveProbeBroken.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(liveProbeBroken.opl_agent_package_status.runtime_source_readiness.operational_ready, true);
    assert.equal(liveProbeBroken.opl_agent_package_status.launch_allowed, true);
    fs.writeFileSync(healthPath, healthyScript, { mode: 0o755 });

    const snapshotRuntimePath = path.join(snapshotPath, 'runtime.txt');
    const snapshotRuntime = fs.readFileSync(snapshotRuntimePath);
    fs.chmodSync(snapshotRuntimePath, 0o644);
    fs.writeFileSync(snapshotRuntimePath, 'snapshot provenance drift\n');
    const snapshotDrift = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(snapshotDrift.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(snapshotDrift.opl_agent_package_status.runtime_source_readiness.operational_ready, false);
    assert.equal(
      snapshotDrift.opl_agent_package_status.runtime_source_readiness.reason,
      'managed_runtime_source_snapshot_integrity_mismatch',
    );
    assert.equal(snapshotDrift.opl_agent_package_status.runtime_source_readiness.provenance_observation.runtime_snapshot.status, 'changed');
    assert.equal(snapshotDrift.opl_agent_package_status.launch_allowed, false);
    fs.writeFileSync(snapshotRuntimePath, snapshotRuntime);
    fs.chmodSync(snapshotRuntimePath, 0o444);

    const missingSnapshotDigest = managedRuntimeSourceReadiness({
      ...installedSource,
      runtime_snapshot_sha256: null,
    } as any);
    assert.equal(missingSnapshotDigest.operational_ready, false);
    assert.equal(missingSnapshotDigest.reason, 'managed_runtime_source_snapshot_digest_missing');

    const snapshotContractPath = path.join(snapshotPath, 'contracts', 'domain_descriptor.json');
    const snapshotContract = fs.readFileSync(snapshotContractPath);
    fs.chmodSync(path.dirname(snapshotContractPath), 0o755);
    fs.rmSync(snapshotContractPath);
    const snapshotContractMissing = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(snapshotContractMissing.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(
      snapshotContractMissing.opl_agent_package_status.runtime_source_readiness.reason,
      'managed_runtime_source_snapshot_integrity_mismatch',
    );
    assert.equal(snapshotContractMissing.opl_agent_package_status.launch_allowed, false);
    fs.writeFileSync(snapshotContractPath, snapshotContract, { mode: 0o444 });
    fs.chmodSync(path.dirname(snapshotContractPath), 0o555);
    const recovered = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(recovered.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(recovered.opl_agent_package_status.launch_allowed, true);
    assert.deepEqual(exactTreeInventory(snapshotPath), snapshotInventory);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('OMA developer snapshot binds package identity and stays ready through its Foundry pack probe', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-oma-developer-snapshot-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-oma-source-'));
  const checkoutPath = path.join(fixtureRoot, 'opl-meta-agent');
  const previousStateDir = process.env.OPL_STATE_DIR;
  fs.mkdirSync(path.join(checkoutPath, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutPath, 'package.json'), formatJsonPayload({
    name: 'opl-meta-agent-fixture',
    version: '0.4.0',
  }));
  writeFoundryAgentPackProbeFixture(checkoutPath, '0.4.0');
  fs.writeFileSync(path.join(checkoutPath, 'scripts', 'verify.sh'), [
    '#!/bin/sh',
    'test -d .git',
    'exit 97',
  ].join('\n'), { mode: 0o755 });
  runGit(checkoutPath, ['init', '-q']);
  runGit(checkoutPath, ['config', 'user.email', 'fixture@example.com']);
  runGit(checkoutPath, ['config', 'user.name', 'Fixture']);
  runGit(checkoutPath, ['add', '.']);
  runGit(checkoutPath, ['commit', '-qm', 'OMA 0.4.0 fixture']);
  const expectedIdentity = readDeveloperCheckoutSourceIdentity(checkoutPath);
  process.env.OPL_STATE_DIR = stateDir;

  try {
    fs.writeFileSync(path.join(checkoutPath, 'runtime-drift.txt'), 'newer source moment\n');
    assert.throws(() => applyManagedRuntimeSourceCarrier({
      config: { carrier_kind: 'opl_managed_module_source', module_id: 'oplmetaagent' },
      previous: null,
      action: 'install',
      dryRun: false,
      packageId: 'oma',
      transactionId: 'oma-identity-mismatch',
      sourceKind: 'developer_checkout_override',
      checkoutPath,
      expectedDeveloperSourceIdentity: expectedIdentity,
    }), (error: any) =>
      error?.details?.failure_code === 'agent_package_runtime_source_carrier_invalid'
      && error?.details?.expected_tree_sha256 === expectedIdentity.tree_sha256
      && error?.details?.actual_tree_sha256 !== expectedIdentity.tree_sha256);
    fs.rmSync(path.join(checkoutPath, 'runtime-drift.txt'));

    const installed = applyManagedRuntimeSourceCarrier({
      config: { carrier_kind: 'opl_managed_module_source', module_id: 'oplmetaagent' },
      previous: null,
      action: 'install',
      dryRun: false,
      packageId: 'oma',
      transactionId: 'oma-foundry-snapshot',
      sourceKind: 'developer_checkout_override',
      checkoutPath,
      expectedDeveloperSourceIdentity: expectedIdentity,
    });
    assert.ok(installed.after);
    assert.equal(installed.after.preparation_scope, 'developer_snapshot_root');
    assert.equal(fs.existsSync(path.join(installed.after.checkout_path, '.git')), false);
    const readiness = managedRuntimeSourceReadiness(installed.after);
    assert.equal(readiness.status, 'current');
    assert.equal(readiness.operational_ready, true);
    rollbackManagedRuntimeSourceMutation(installed);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixtureTree(stateDir);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('developer checkout source switch does not validate a displaced managed carrier', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-source-switch-'));
  const developerCheckout = path.join(fixtureRoot, 'med-autogrant');
  const displacedCheckout = path.join(fixtureRoot, 'managed-med-autogrant');
  fs.mkdirSync(path.join(developerCheckout, 'scripts'), { recursive: true });
  fs.mkdirSync(displacedCheckout, { recursive: true });
  fs.writeFileSync(path.join(developerCheckout, 'package.json'), formatJsonPayload({
    name: 'med-autogrant-fixture',
  }));
  fs.writeFileSync(path.join(developerCheckout, 'scripts', 'opl-module-healthcheck.sh'), [
    '#!/bin/sh',
    'set -eu',
    'printf "healthy\\n"',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(developerCheckout, 'scripts', 'run-python-clean.sh'), [
    '#!/bin/sh',
    'set -eu',
    'test "$1" = "-m"',
    'test "$3" = "--help"',
    'printf "ready\\n"',
  ].join('\n'), { mode: 0o755 });
  runGit(developerCheckout, ['init', '-q']);
  runGit(developerCheckout, ['config', 'user.email', 'fixture@example.com']);
  runGit(developerCheckout, ['config', 'user.name', 'Fixture']);
  runGit(developerCheckout, ['add', '.']);
  runGit(developerCheckout, ['commit', '-qm', 'developer checkout']);
  const previous = {
    surface_kind: 'opl_agent_package_managed_runtime_source' as const,
    status: 'current' as const,
    carrier_kind: 'opl_managed_module_source' as const,
    module_id: 'medautogrant',
    checkout_path: displacedCheckout,
    ownership: 'package_created' as const,
    source_mode: 'package_channel' as const,
    channel_version: '0.1.0',
    artifact_ref: 'ghcr.io/fixture/mas:0.1.0@sha256:deadbeef',
    layer_digest: `sha256:${'1'.repeat(64)}`,
    source_archive_sha256: '2'.repeat(64),
    source_git_head_sha: '3'.repeat(40),
    tree_sha256: '4'.repeat(64),
    rollback_ref: null,
    preparation_status: 'completed' as const,
    bootstrap_command: null,
    package_prepare_command: null,
    health_check_command: ['/bin/false'],
    handler_probe_command: ['/bin/false'],
    health_output_sha256: `sha256:${'5'.repeat(64)}`,
    handler_probe_output_sha256: `sha256:${'6'.repeat(64)}`,
    preparation_root: null,
    preparation_scope: 'managed_source_root' as const,
  };

  try {
    const preview = applyManagedRuntimeSourceCarrier({
      config: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'medautogrant',
      },
      previous,
      action: 'install',
      dryRun: true,
      packageId: FIXTURE_MAG_PACKAGE_ID,
      sourceKind: 'developer_checkout_override',
      checkoutPath: developerCheckout,
    });
    assert.equal(preview.before, previous);
    assert.equal(preview.after?.checkout_path, developerCheckout);
    assert.equal(preview.after?.source_mode, 'developer_checkout');
    assert.equal(preview.after?.status, 'validated_no_write');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('interrupted developer snapshot activation removes only the uncommitted snapshot and retains LKG', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-snapshot-recovery-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-snapshot-source-'));
  const checkoutPath = path.join(fixtureRoot, 'med-autogrant');
  const previousStateDir = process.env.OPL_STATE_DIR;
  fs.mkdirSync(path.join(checkoutPath, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'runtime v1\n');
  writeStandardAgentPackProbeFixture(checkoutPath, 'v1');
  fs.writeFileSync(path.join(checkoutPath, 'scripts', 'opl-module-healthcheck.sh'), [
    '#!/bin/sh',
    'set -eu',
    'printf "healthy\\n"',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(checkoutPath, 'scripts', 'run-python-clean.sh'), [
    '#!/bin/sh',
    'set -eu',
    'test "$1" = "-m"',
    'test "$3" = "--help"',
    'printf "ready\\n"',
  ].join('\n'), { mode: 0o755 });
  runGit(checkoutPath, ['init', '-q']);
  runGit(checkoutPath, ['config', 'user.email', 'fixture@example.com']);
  runGit(checkoutPath, ['config', 'user.name', 'Fixture']);
  runGit(checkoutPath, ['add', '.']);
  runGit(checkoutPath, ['commit', '-qm', 'runtime v1']);
  process.env.OPL_STATE_DIR = stateDir;

  try {
    const carrier = {
      carrier_kind: 'opl_managed_module_source' as const,
      module_id: 'medautogrant',
    };
    const installed = applyManagedRuntimeSourceCarrier({
      config: carrier,
      previous: null,
      action: 'install',
      dryRun: false,
      packageId: FIXTURE_MAG_PACKAGE_ID,
      transactionId: 'developer-snapshot-v1',
      sourceKind: 'developer_checkout_override',
      checkoutPath,
    });
    assert.ok(installed.after);
    finalizeManagedRuntimeSourceMutation(installed);
    const lkgSnapshotPath = installed.after.checkout_path;
    assert.equal(fs.existsSync(lkgSnapshotPath), true);

    fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'runtime v2\n');
    const interrupted = applyManagedRuntimeSourceCarrier({
      config: carrier,
      previous: installed.after,
      action: 'update',
      dryRun: false,
      packageId: FIXTURE_MAG_PACKAGE_ID,
      transactionId: 'developer-snapshot-v2',
      sourceKind: 'developer_checkout_override',
      checkoutPath,
    });
    assert.ok(interrupted.after);
    const uncommittedSnapshotPath = interrupted.after.checkout_path;
    assert.notEqual(uncommittedSnapshotPath, lkgSnapshotPath);
    assert.equal(fs.existsSync(uncommittedSnapshotPath), true);
    assert.equal(fs.existsSync(interrupted.marker_path!), true);
    const preparedMarker = JSON.parse(fs.readFileSync(interrupted.marker_path!, 'utf8'));
    preparedMarker.phase = 'prepared';
    preparedMarker.mutation.after = null;
    fs.writeFileSync(interrupted.marker_path!, formatJsonPayload(preparedMarker));

    const recovery = recoverManagedRuntimeSourceTransactions({
      surface_kind: 'opl_agent_package_lock_index',
      packages: [{
        package_id: FIXTURE_MAG_PACKAGE_ID,
        managed_runtime_source: installed.after,
      }],
      last_known_good_transactions: [],
    } as any);
    assert.equal(recovery.status, 'recovered');
    assert.equal(recovery.recovered_transaction_count, 1);
    assert.equal(fs.existsSync(uncommittedSnapshotPath), false);
    assert.equal(fs.existsSync(lkgSnapshotPath), true);
    assert.equal(fs.existsSync(interrupted.marker_path!), false);

    fs.writeFileSync(path.join(checkoutPath, 'runtime.txt'), 'runtime v3\n');
    const physicalApplied = applyManagedRuntimeSourceCarrier({
      config: carrier,
      previous: installed.after,
      action: 'update',
      dryRun: false,
      packageId: FIXTURE_MAG_PACKAGE_ID,
      transactionId: 'developer-snapshot-v3',
      sourceKind: 'developer_checkout_override',
      checkoutPath,
    });
    assert.ok(physicalApplied.after);
    const physicalAppliedPath = physicalApplied.after.checkout_path;
    const pathMismatchedLock = {
      ...physicalApplied.after,
      checkout_path: lkgSnapshotPath,
    };
    const physicalRecovery = recoverManagedRuntimeSourceTransactions({
      surface_kind: 'opl_agent_package_lock_index',
      packages: [{
        package_id: FIXTURE_MAG_PACKAGE_ID,
        managed_runtime_source: pathMismatchedLock,
      }],
      last_known_good_transactions: [],
    } as any);
    assert.equal(physicalRecovery.recovered_transaction_count, 1);
    assert.equal(fs.existsSync(physicalAppliedPath), false);
    assert.equal(fs.existsSync(lkgSnapshotPath), true);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixtureTree(stateDir);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('developer snapshot garbage collection ignores forged and symlinked persisted paths', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-snapshot-gc-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-developer-snapshot-outside-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;

  try {
    const snapshotRoot = path.join(stateDir, 'agent-package-developer-runtime-snapshots');
    const redcubeRoot = path.join(snapshotRoot, 'redcube');
    const staleDigest = '1'.repeat(64);
    const retainedDigest = '2'.repeat(64);
    const linkedDigest = '3'.repeat(64);
    const stalePath = path.join(redcubeRoot, staleDigest);
    const retainedPath = path.join(redcubeRoot, retainedDigest);
    const linkedPath = path.join(redcubeRoot, linkedDigest);
    fs.mkdirSync(stalePath, { recursive: true });
    fs.mkdirSync(retainedPath, { recursive: true });
    fs.writeFileSync(path.join(stalePath, 'runtime.txt'), 'stale\n');
    fs.writeFileSync(path.join(retainedPath, 'runtime.txt'), 'retained\n');
    const linkedSentinel = path.join(outsideRoot, 'linked-sentinel.txt');
    fs.writeFileSync(linkedSentinel, 'must remain\n');
    fs.symlinkSync(outsideRoot, linkedPath, 'dir');

    const linkedModuleTarget = path.join(outsideRoot, 'linked-module');
    const linkedModuleDigest = '4'.repeat(64);
    const linkedModuleSnapshot = path.join(linkedModuleTarget, linkedModuleDigest);
    fs.mkdirSync(linkedModuleSnapshot, { recursive: true });
    const linkedModuleSentinel = path.join(linkedModuleSnapshot, 'sentinel.txt');
    fs.writeFileSync(linkedModuleSentinel, 'must also remain\n');
    fs.symlinkSync(linkedModuleTarget, path.join(snapshotRoot, 'medautogrant'), 'dir');

    const forgedOutsidePath = path.join(outsideRoot, '5'.repeat(64));
    fs.mkdirSync(forgedOutsidePath);
    fs.writeFileSync(path.join(forgedOutsidePath, 'sentinel.txt'), 'outside\n');
    const lock = (packageId: string, moduleId: string, checkoutPath: string) => ({
      package_id: packageId,
      managed_runtime_source: {
        source_mode: 'developer_checkout',
        preparation_scope: 'developer_snapshot_root',
        module_id: moduleId,
        checkout_path: checkoutPath,
      },
    });
    const previous = {
      packages: [
        lock('fixture.stale', 'redcube', stalePath),
        lock('fixture.retained', 'redcube', retainedPath),
        lock('fixture.linked', 'redcube', linkedPath),
        lock('fixture.linked-module', 'medautogrant', path.join(snapshotRoot, 'medautogrant', linkedModuleDigest)),
        lock('fixture.forged', 'redcube', forgedOutsidePath),
      ],
      last_known_good_transactions: [],
    } as any;
    const current = {
      packages: [
        lock(
          'fixture.retained',
          'redcube',
          `${redcubeRoot}${path.sep}.${path.sep}${retainedDigest}`,
        ),
      ],
      last_known_good_transactions: [],
    } as any;

    cleanupUnreferencedDeveloperRuntimeSnapshots(previous, current);
    assert.equal(fs.existsSync(stalePath), false);
    assert.equal(fs.existsSync(retainedPath), true);
    assert.equal(fs.lstatSync(linkedPath).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(linkedSentinel, 'utf8'), 'must remain\n');
    assert.equal(fs.lstatSync(path.join(snapshotRoot, 'medautogrant')).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(linkedModuleSentinel, 'utf8'), 'must also remain\n');
    assert.equal(fs.readFileSync(path.join(forgedOutsidePath, 'sentinel.txt'), 'utf8'), 'outside\n');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixtureTree(stateDir);
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('bundled Full runtime source requires a matching carrier marker and rejects public injection', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-bundled-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-bundled-source-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const bundledRoot = path.join(fixtureRoot, 'full-runtime', 'modules', 'redcube-ai');
  const unmanagedRoot = path.join(fixtureRoot, 'unmarked-redcube-ai');
  const symlinkRoot = path.join(fixtureRoot, 'linked-redcube-ai');
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  fs.mkdirSync(bundledRoot, { recursive: true });
  fs.mkdirSync(unmanagedRoot, { recursive: true });
  fs.symlinkSync(bundledRoot, symlinkRoot, 'dir');
  fs.writeFileSync(path.join(bundledRoot, 'runtime.txt'), 'immutable bundled source\n');
  fs.mkdirSync(path.join(bundledRoot, 'scripts'));
  fs.writeFileSync(path.join(bundledRoot, 'scripts', 'opl-module-healthcheck.sh'), [
    '#!/bin/sh',
    'set -eu',
    'printf "development health checks must not run for bundled Full runtimes\\n" >&2',
    'exit 91',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(unmanagedRoot, 'runtime.txt'), 'unmarked source\n');
  writeStandardAgentPackProbeFixture(bundledRoot, '0.1.0');
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
      () => applyManagedRuntimeSourceCarrier({
        ...carrierInput,
        checkoutPath: unmanagedRoot,
        dryRun: true,
      }),
      (error: any) => error?.details?.failure_code === 'agent_package_runtime_source_carrier_invalid',
    );
    assert.throws(
      () => applyManagedRuntimeSourceCarrier({
        ...carrierInput,
        checkoutPath: symlinkRoot,
        dryRun: true,
      }),
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
      package_channel: true,
      source_git: { head_sha: 'a'.repeat(40) },
      package_channel_lifecycle: { stale: true },
    }));
    assert.throws(
      () => applyManagedRuntimeSourceCarrier({
        ...carrierInput,
        checkoutPath: bundledRoot,
        verifiedCarrierSourceCommit: null,
      }),
      (error: any) => error?.details?.failure_code === 'agent_package_runtime_source_carrier_invalid',
    );
    const preview = applyManagedRuntimeSourceCarrier({
      ...carrierInput,
      checkoutPath: bundledRoot,
      dryRun: true,
    });
    assert.equal(preview.after?.status, 'validated_no_write');
    assert.equal(preview.after?.source_mode, 'bundled_full_runtime');
    assert.equal(preview.after?.channel_version, null);
    const adopted = applyManagedRuntimeSourceCarrier({ ...carrierInput, checkoutPath: bundledRoot });
    assert.equal(adopted.after?.source_git_head_sha, 'a'.repeat(40));
    assert.equal(adopted.after?.source_mode, 'bundled_full_runtime');
    assert.equal(adopted.after?.channel_version, null);
    const ready = managedRuntimeSourceReadiness(adopted.after);
    assert.equal(ready.status, 'current');
    assert.equal(ready.operational_ready, true);

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
    assert.equal(drifted.operational_ready, false);
    assert.equal(
      drifted.reason,
      'managed_runtime_source_identity_mismatch',
    );
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('ordinary-user latest-stable use advances MAS and ScholarSkills by immutable V1 V2 V3 generations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-ordinary-generation-history-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const workspace = path.join(root, 'workspace');
  const badWorkspace = path.join(root, 'bad-workspace');
  const releaseV1 = writeOrdinaryUserMasRelease(path.join(root, 'release-v1'), '0.1.0');
  const releaseV2 = writeOrdinaryUserMasRelease(path.join(root, 'release-v2'), '0.1.1');
  const releaseV3 = writeOrdinaryUserMasRelease(path.join(root, 'release-v3'), '0.1.2');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_SOURCE_MODE: 'package_channel',
  };
  const lockFile = path.join(stateDir, 'agent-package-locks.json');
  const ledgerFile = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(badWorkspace, 'not a directory\n');

  try {
    bindMasWorkspace(workspace, commonEnv);
    const installed = runCli(['packages', 'install', 'mas'], {
      ...commonEnv,
      ...releaseV1.env,
    }) as any;
    const v1Lock = installed.opl_agent_package_install.package_lock;
    const v1Provider = installed.opl_agent_package_install.dependency_package_locks.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assert.equal(v1Lock.source_kind, 'first_party_managed_cohort');
    assert.equal(v1Provider.source_kind, 'first_party_managed_cohort');
    assert.equal(v1Lock.package_version, '0.1.0');
    assert.equal(v1Provider.package_version, '0.1.0');
    const v1Paths = {
      runtime: v1Lock.managed_runtime_source.checkout_path,
      payload: v1Lock.physical_surface.plugin_payload_cache_path,
      plugin: v1Lock.physical_surface.codex_plugin_cache_path,
      providerPlugin: v1Provider.physical_surface.codex_plugin_cache_path,
    };
    for (const generationPath of Object.values(v1Paths)) {
      assert.equal(fs.existsSync(generationPath), true, generationPath);
    }
    const v1Digests = Object.fromEntries(
      Object.entries(v1Paths).map(([key, generationPath]) => [key, exactTreeDigest(generationPath)]),
    );

    runCli(['packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', workspace], {
      ...commonEnv,
      ...releaseV1.env,
    });
    const updatedV2 = runCli(['packages', 'update', 'mas'], {
      ...commonEnv,
      ...releaseV2.env,
    }) as any;
    const v2Lock = updatedV2.opl_agent_package_update.package_lock;
    const v2Provider = updatedV2.opl_agent_package_update.dependency_package_locks.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assert.equal(v2Lock.package_version, '0.1.1');
    assert.equal(v2Provider.package_version, '0.1.1');
    const v2Paths = {
      runtime: v2Lock.managed_runtime_source.checkout_path,
      payload: v2Lock.physical_surface.plugin_payload_cache_path,
      plugin: v2Lock.physical_surface.codex_plugin_cache_path,
      providerPlugin: v2Provider.physical_surface.codex_plugin_cache_path,
    };
    for (const [key, generationPath] of Object.entries(v1Paths)) {
      assert.equal(fs.existsSync(generationPath), true, generationPath);
      assert.equal(exactTreeDigest(generationPath), v1Digests[key]);
      assert.notEqual(generationPath, v2Paths[key as keyof typeof v2Paths]);
    }
    const v2Digests = Object.fromEntries(
      Object.entries(v2Paths).map(([key, generationPath]) => [key, exactTreeDigest(generationPath)]),
    );

    const beforeDryRunLock = fs.readFileSync(lockFile);
    const beforeDryRunLedger = fs.readFileSync(ledgerFile);
    const runtimeGenerationRoot = path.dirname(v2Paths.runtime);
    const payloadGenerationRoot = path.dirname(v2Paths.payload);
    const pluginCacheRoot = path.join(homeDir, '.codex', 'plugins', 'cache');
    const beforeDryRunTrees = {
      runtime: exactTreeDigest(runtimeGenerationRoot),
      payload: exactTreeDigest(payloadGenerationRoot),
      plugin: exactTreeDigest(pluginCacheRoot),
    };
    const beforeFailedUpdatePluginInventory = exactTreeInventory(pluginCacheRoot);
    const previewV3 = runCli(['packages', 'update', 'mas', '--dry-run'], {
      ...commonEnv,
      ...releaseV3.env,
    }) as any;
    assert.equal(previewV3.opl_agent_package_update.status, 'validated_no_write');
    assert.equal(previewV3.opl_agent_package_update.target_version, '0.1.2');
    assert.deepEqual(fs.readFileSync(lockFile), beforeDryRunLock);
    assert.deepEqual(fs.readFileSync(ledgerFile), beforeDryRunLedger);
    assert.deepEqual({
      runtime: exactTreeDigest(runtimeGenerationRoot),
      payload: exactTreeDigest(payloadGenerationRoot),
    }, {
      runtime: beforeDryRunTrees.runtime,
      payload: beforeDryRunTrees.payload,
    });
    assert.deepEqual(exactTreeInventory(pluginCacheRoot), beforeFailedUpdatePluginInventory);

    const failedV3 = runCliFailure([
      'packages', 'update', 'mas',
      '--scope', 'workspace', '--target-workspace', badWorkspace,
    ], {
      ...commonEnv,
      ...releaseV3.env,
    });
    assert.equal(failedV3.payload.error.code, 'contract_shape_invalid');
    assert.deepEqual(fs.readFileSync(lockFile), beforeDryRunLock);
    assert.deepEqual(fs.readFileSync(ledgerFile), beforeDryRunLedger);
    assert.deepEqual({
      runtime: exactTreeDigest(runtimeGenerationRoot),
      payload: exactTreeDigest(payloadGenerationRoot),
    }, {
      runtime: beforeDryRunTrees.runtime,
      payload: beforeDryRunTrees.payload,
    });
    assert.deepEqual(exactTreeInventory(pluginCacheRoot), beforeFailedUpdatePluginInventory);
    for (const [key, generationPath] of Object.entries(v1Paths)) {
      assert.equal(exactTreeDigest(generationPath), v1Digests[key]);
    }
    for (const [key, generationPath] of Object.entries(v2Paths)) {
      assert.equal(exactTreeDigest(generationPath), v2Digests[key]);
    }

    const activationV3 = runCli([
      'packages', 'activate', 'mas', '--scope', 'workspace', '--target-workspace', workspace,
    ], {
      ...commonEnv,
      ...releaseV3.env,
    }) as any;
    const useBinding = activationV3.opl_agent_package_activation.package_use_binding;
    assert.equal(activationV3.opl_agent_package_activation.status, 'already_activated');
    assert.equal(useBinding.refresh_outcome, 'updated');
    assert.equal(useBinding.latest_verified, true);
    assert.equal(useBinding.root_package.package_version, '0.1.2');
    assert.equal(useBinding.provider_packages.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    ).package_version, '0.1.2');
    const currentIndex = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const currentMas = currentIndex.packages.find((entry: any) => entry.package_id === 'mas');
    assert.equal(useBinding.root_package.package_lock_ref, currentMas.lock_ref);
    assert.equal(useBinding.dependency_closure_digest, currentMas.dependency_closure_digest);
    const unexpectedPayloadFile = path.join(
      currentMas.physical_surface.plugin_payload_cache_path,
      'unexpected-generation-file.txt',
    );
    fs.writeFileSync(unexpectedPayloadFile, 'must not be accepted as the same generation\n');
    const exactPayloadFailure = runCliFailure(['packages', 'repair', 'mas'], {
      ...commonEnv,
      ...releaseV3.env,
    });
    assert.equal(
      exactPayloadFailure.payload.error.details.failure_code,
      'agent_package_payload_generation_digest_mismatch',
    );
    fs.rmSync(unexpectedPayloadFile);
    for (const [key, generationPath] of Object.entries(v1Paths)) {
      assert.equal(exactTreeDigest(generationPath), v1Digests[key]);
    }
    for (const [key, generationPath] of Object.entries(v2Paths)) {
      assert.equal(exactTreeDigest(generationPath), v2Digests[key]);
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('new managed runtime generation refuses a symlinked generation ancestor', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-runtime-generation-state-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-runtime-generation-outside-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  fs.symlinkSync(outsideRoot, path.join(stateDir, 'agent-package-runtime-generations'), 'dir');
  try {
    assert.throws(() => applyManagedRuntimeSourceCarrier({
      config: { carrier_kind: 'opl_managed_module_source', module_id: 'medautoscience' },
      previous: null,
      action: 'install',
      dryRun: false,
      packageId: 'mas',
      sourceKind: 'first_party_managed_cohort',
      packageChannelSelection: {
        package_id: 'mas',
        package_version: '0.1.0',
        source_artifact_ref: 'ghcr.io/fixture/mas:0.1.0',
        artifact_digest: `sha256:${'1'.repeat(64)}`,
        artifact_status: 'published_immutable',
        package_content_digest: `sha256:${'2'.repeat(64)}`,
        owner_source_commit: '3'.repeat(40),
      },
    }), (error: any) =>
      error?.details?.failure_code === 'agent_package_runtime_source_carrier_invalid');
    assert.deepEqual(fs.readdirSync(outsideRoot), []);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    removeFixtureTree(stateDir);
    fs.rmSync(outsideRoot, { recursive: true, force: true });
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
    bindMasWorkspace(workspaceRoot, env);
    const installArgs = [
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'first_party',
    ];
    const failedFresh = runCliFailure([
      ...installArgs,
      '--scope', 'workspace',
      '--target-workspace', badWorkspaceTarget,
    ], env);
    assert.equal(failedFresh.payload.error.code, 'contract_shape_invalid');
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
    assert.equal(failedCurrentUpdate.payload.error.code, 'contract_shape_invalid', JSON.stringify(failedCurrentUpdate.payload));
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
    assert.equal(failedUpdate.payload.error.code, 'contract_shape_invalid', JSON.stringify(failedUpdate.payload));
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

    const requiredPackPath = path.join(modulesRoot, 'redcube-ai', 'contracts', 'domain_descriptor.json');
    const requiredPackBytes = fs.readFileSync(requiredPackPath);
    fs.rmSync(requiredPackPath);
    const missingRuntimeStatus = runCli([
      'packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID,
      '--scope', 'workspace', '--target-workspace', workspaceRoot,
    ], env) as any;
    assert.equal(missingRuntimeStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(
      missingRuntimeStatus.opl_agent_package_status.runtime_source_readiness.reason,
      'managed_runtime_source_identity_mismatch',
    );
    assert.equal(missingRuntimeStatus.opl_agent_package_status.launch_allowed, false);
    fs.writeFileSync(requiredPackPath, requiredPackBytes);
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
    assert.equal(driftedStatus.opl_agent_package_status.runtime_source_readiness.operational_ready, false);
    assert.equal(
      driftedStatus.opl_agent_package_status.runtime_source_readiness.reason,
      'managed_runtime_source_identity_mismatch',
    );
    assert.equal(driftedStatus.opl_agent_package_status.launch_allowed, false);
    assert.equal(
      driftedStatus.opl_agent_package_status.launch_blocked_reason,
      'runtime_source_incompatible',
    );
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
    const managedCheckout = path.join(modulesRoot, 'redcube-ai');
    const previousCheckout = `${managedCheckout}.previous`;
    const repairedSource = missingSourceRepaired.opl_agent_package_repair.package_lock.managed_runtime_source;
    const pythonCacheRoot = path.join(managedCheckout, 'src', '__pycache__');
    fs.mkdirSync(pythonCacheRoot, { recursive: true });
    fs.writeFileSync(path.join(pythonCacheRoot, 'fixture_agent.cpython-312.pyc'), 'derived bytecode\n');
    const cacheStatus = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(cacheStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');
    assert.equal(computePackageChannelTreeSha256(managedCheckout), repairedSource.tree_sha256);

    const previousPreparedPath = path.join(previousCheckout, '.runtime-prepared');
    const previousPreparedBytes = fs.readFileSync(previousPreparedPath);
    fs.writeFileSync(previousPreparedPath, 'previous generation drift\n');
    assert.throws(
      () => rollbackManagedModulePackageChannel(spec, managedCheckout),
      /clean managed package root/,
    );
    fs.writeFileSync(previousPreparedPath, previousPreparedBytes);

    const preservedFailurePath = path.join(managedCheckout, 'failed-update-diagnostic.txt');
    fs.writeFileSync(preservedFailurePath, 'retain failed RCA generation for diagnosis\n');
    const dirtyCurrentTreeSha256 = computePackageChannelTreeSha256(managedCheckout);
    assert.notEqual(dirtyCurrentTreeSha256, repairedSource.tree_sha256);
    for (const failureAt of [2, 3]) {
      let renameCount = 0;
      assert.throws(() => rollbackManagedModulePackageChannel(spec, managedCheckout, {
        renameSync(from: string, to: string) {
          renameCount += 1;
          if (renameCount === failureAt) throw new Error(`injected rename failure ${failureAt}`);
          fs.renameSync(from, to);
        },
      } as any), /injected rename failure/);
      assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
      assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai.previous', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
      assert.equal(fs.readFileSync(preservedFailurePath, 'utf8').trim(), 'retain failed RCA generation for diagnosis');
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
    assert.equal(
      fs.readFileSync(path.join(previousCheckout, 'failed-update-diagnostic.txt'), 'utf8').trim(),
      'retain failed RCA generation for diagnosis',
    );
    const preservedFailureLifecycle = readPackageChannelLifecycle(previousCheckout, spec);
    assert.equal(preservedFailureLifecycle?.current.tree_sha256, dirtyCurrentTreeSha256);
    const rollbackCleanup = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(rollbackCleanup.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(rollbackCleanup.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(rollbackCleanup.opl_agent_package_status.runtime_source_recovery.cleanup_completed_count, 0);

    const moduleRuntimeEnvRoot = path.join(stateDir, 'agent-package-runtime-envs', 'redcube');
    assert.ok(fs.readdirSync(moduleRuntimeEnvRoot).length >= 2);
    runCli(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], env);
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);
    assert.equal(fs.existsSync(moduleRuntimeEnvRoot), false);
  } finally {
    removeFixtureTree(stateDir);
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
    const env = {
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: modulesRoot,
      OPL_CLI_TEST_TIMEOUT_MS: '90000',
      ...fixtureEnv,
    };
    const installed = runCli([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    const installedSource = installed.opl_agent_package_install.package_lock.managed_runtime_source;
    const markerDir = path.join(stateDir, 'agent-package-runtime-source-transactions');
    const markerPath = path.join(markerDir, `${FIXTURE_RCA_PACKAGE_ID}-stale-current-update.json`);
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
    const staleMarkerBytes = fs.readFileSync(markerPath);
    const staleMarkerRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 0);
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(staleMarkerRecovery.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.deepEqual(fs.readFileSync(markerPath), staleMarkerBytes);
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai', 'generated-drift.txt')), true);
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
    const preparedMarkerPath = fs.readdirSync(markerDir).map((entry) => path.join(markerDir, entry))[0]!;
    const preparedMarkerBytes = fs.readFileSync(preparedMarkerPath);
    const preparedUpdateRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 0);
    assert.equal(preparedUpdateRecovery.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');
    assert.equal(fs.existsSync(interruptedStagePath), true);
    assert.deepEqual(fs.readFileSync(preparedMarkerPath), preparedMarkerBytes);
    const dryRunUpdate = runCli([
      'packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID, '--dry-run',
    ], env) as any;
    assert.equal(dryRunUpdate.opl_agent_package_update.dry_run, true);
    assert.equal(fs.existsSync(interruptedStagePath), true);
    assert.deepEqual(fs.readFileSync(preparedMarkerPath), preparedMarkerBytes);

    const interruptedUpdate = runCliFailure(['packages', 'update', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_APPLY: '1',
    });
    assert.equal(interruptedUpdate.payload.error.details.failure_code, 'test_runtime_source_interrupted_after_apply', JSON.stringify(interruptedUpdate.payload));
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    const appliedMarkerPath = fs.readdirSync(markerDir).map((entry) => path.join(markerDir, entry))[0]!;
    const appliedMarkerBytes = fs.readFileSync(appliedMarkerPath);
    const recoveredStatus = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_readiness.status, 'incompatible');
    assert.equal(recoveredStatus.opl_agent_package_status.runtime_source_readiness.operational_ready, false);
    assert.equal(
      recoveredStatus.opl_agent_package_status.runtime_source_readiness.reason,
      'managed_runtime_source_identity_mismatch',
    );
    assert.equal(recoveredStatus.opl_agent_package_status.launch_allowed, false);
    assert.deepEqual(fs.readFileSync(appliedMarkerPath), appliedMarkerBytes);

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
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(preparedRollbackRecovery.opl_agent_package_status.runtime_source_recovery.cleared_prepared_transaction_count, 0);
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
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_recovery.recovered_transaction_count, 0);
    assert.equal(restoredStatus.opl_agent_package_status.runtime_source_readiness.status, 'missing');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);

    const uninstalled = runCli(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], {
      ...env,
      OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED: '1',
      OPL_TEST_RUNTIME_SOURCE_FINALIZE_FAIL: '1',
    }) as any;
    assert.equal(uninstalled.opl_agent_package_uninstall.runtime_source_cleanup.status, 'cleanup_pending');
    assert.equal(fs.readdirSync(markerDir).length, 1);
    const postCommitRecovery = runCli(['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID], env) as any;
    assert.equal(postCommitRecovery.opl_agent_package_status.runtime_source_recovery.status, 'recovery_required');
    assert.equal(postCommitRecovery.opl_agent_package_status.runtime_source_recovery.pending_transaction_count, 1);
    assert.equal(postCommitRecovery.opl_agent_package_status.runtime_source_recovery.cleanup_completed_count, 0);
    runCliFailure(['packages', 'uninstall', '--package-id', FIXTURE_RCA_PACKAGE_ID], env);
    assert.equal(fs.readdirSync(markerDir).length, 0);

    const corruptTransactionId = 'corrupt-target';
    const corruptMarkerPath = path.join(
      markerDir,
      `${FIXTURE_RCA_PACKAGE_ID}-${corruptTransactionId}.json`,
    );
    const outsideRoot = path.join(fixtureRoot, 'outside-managed-modules');
    const sentinelPath = path.join(outsideRoot, 'sentinel.txt');
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.writeFileSync(sentinelPath, 'must remain unchanged\n');
    fs.writeFileSync(corruptMarkerPath, formatJsonPayload({
      surface_kind: 'opl_agent_package_runtime_source_transaction',
      version: 1,
      phase: 'prepared',
      mutation: {
        kind: 'installed_fresh',
        package_id: FIXTURE_RCA_PACKAGE_ID,
        action: 'install',
        transaction_id: corruptTransactionId,
        marker_path: corruptMarkerPath,
        module_id: 'redcube',
        checkout_path: outsideRoot,
        before: null,
        after: null,
        staged_removal_paths: [],
        repair_displaced_path: null,
        checkout_existed_before: false,
      },
    }));
    const corruptMarkerBytes = fs.readFileSync(corruptMarkerPath);
    const lockFile = path.join(stateDir, 'agent-package-locks.json');
    const lockBytes = fs.readFileSync(lockFile);
    for (const args of [
      ['packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID],
      ['packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party'],
    ]) {
      const failure = runCliFailure(args, env);
      assert.equal(failure.payload.error.code, 'contract_shape_invalid');
      assert.equal(
        failure.payload.error.details.failure_code,
        'agent_package_runtime_source_transaction_invalid',
      );
      assert.equal(failure.payload.error.details.recovery_status, 'recovery_required');
      assert.deepEqual(fs.readFileSync(corruptMarkerPath), corruptMarkerBytes);
      assert.deepEqual(fs.readFileSync(lockFile), lockBytes);
      assert.equal(fs.readFileSync(sentinelPath, 'utf8'), 'must remain unchanged\n');
    }

    fs.rmSync(corruptMarkerPath);
    const nonCanonicalPackageId = 'Fixture.RCA';
    const invalidIdentityMarkerPath = path.join(
      markerDir,
      `${nonCanonicalPackageId}-invalid-package-identity.json`,
    );
    fs.writeFileSync(invalidIdentityMarkerPath, formatJsonPayload({
      surface_kind: 'opl_agent_package_runtime_source_transaction',
      version: 1,
      phase: 'prepared',
      mutation: {
        kind: 'installed_fresh',
        package_id: nonCanonicalPackageId,
        action: 'install',
        transaction_id: 'invalid-package-identity',
        marker_path: invalidIdentityMarkerPath,
        module_id: 'redcube',
        checkout_path: path.join(modulesRoot, 'redcube-ai'),
        before: null,
        after: null,
        staged_removal_paths: [],
        repair_displaced_path: null,
        checkout_existed_before: false,
      },
    }));
    const invalidIdentityMarkerBytes = fs.readFileSync(invalidIdentityMarkerPath);
    const invalidIdentity = runCliFailure([
      'packages', 'status', '--package-id', FIXTURE_RCA_PACKAGE_ID,
    ], env);
    assert.equal(
      invalidIdentity.payload.error.details.failure_code,
      'agent_package_runtime_source_transaction_invalid',
    );
    assert.equal(
      invalidIdentity.payload.error.details.recovery_action_state,
      'manual_owner_intervention_required',
    );
    assert.deepEqual(fs.readFileSync(invalidIdentityMarkerPath), invalidIdentityMarkerBytes);
    assert.deepEqual(fs.readFileSync(lockFile), lockBytes);
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('MAS package install probes its declarative source carrier instead of a retired private CLI', () => {
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
      sourceFiles: [
        { sourcePath: 'contracts/action_catalog.json', content: '{}\n' },
        { sourcePath: 'contracts/domain_handler_registry.json', content: '{}\n' },
        { sourcePath: 'contracts/pack_compiler_input.json', content: '{}\n' },
        { sourcePath: 'agent/stages/manifest.json', content: '{}\n' },
        { sourcePath: 'agent/primary_skill/SKILL.md', content: '# MAS\n' },
      ],
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
    const expectedProbe = [
      'node',
      '-e',
      'const fs=require("node:fs");for(const p of process.argv.slice(1)){if(!fs.statSync(p).isFile())process.exit(1)}',
      path.join(checkoutPath, 'contracts', 'action_catalog.json'),
      path.join(checkoutPath, 'contracts', 'domain_handler_registry.json'),
      path.join(checkoutPath, 'contracts', 'pack_compiler_input.json'),
      path.join(checkoutPath, 'agent', 'stages', 'manifest.json'),
      path.join(checkoutPath, 'agent', 'primary_skill', 'SKILL.md'),
    ];
    assert.deepEqual(
      installed.opl_agent_package_install.package_lock.managed_runtime_source.handler_probe_command,
      expectedProbe,
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
    assert.equal(tamperedStatus.opl_agent_package_status.runtime_source_readiness.operational_ready, false);
    assert.equal(
      tamperedStatus.opl_agent_package_status.runtime_source_readiness.reason,
      'managed_runtime_source_command_drift',
    );
    assert.equal(tamperedStatus.opl_agent_package_status.launch_allowed, false);

    const repaired = runCli(['packages', 'repair', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.notDeepEqual(
      repaired.opl_agent_package_repair.package_lock.managed_runtime_source.health_check_command,
      ['bash', maliciousCommand],
    );
    const repairedStatus = runCli(['packages', 'status', '--package-id', FIXTURE_MAS_PACKAGE_ID], env) as any;
    assert.equal(repairedStatus.opl_agent_package_status.runtime_source_readiness.status, 'current');
  } finally {
    removeFixtureTree(stateDir);
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
    removeFixtureTree(stateDir);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});
