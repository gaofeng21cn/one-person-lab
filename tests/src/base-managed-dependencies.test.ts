import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { inspectBaseManagedDependencies } from '../../src/modules/connect/base-managed-dependencies.ts';
import { activatePendingCodexRuntimeGeneration } from '../../src/modules/connect/system-installation/engine-helpers.ts';
import {
  activatePendingOplFrameworkRuntime,
  runOplFrameworkSelfRollback,
  runOplFrameworkSelfUpdate,
} from '../../src/modules/connect/system-installation/framework-self-update.ts';
import { syncOplCompanionSkills } from '../../src/modules/connect/install-companions.ts';
import {
  reconcileManagedCompanionTools,
  resolveOfficeCliTool,
} from '../../src/modules/connect/install-companions-parts/tools.ts';
import {
  inspectExternalCodexInstallation,
  inspectExternalTemporalInstallation,
  runExternalOwnerDelegatedUpdate,
} from '../../src/modules/connect/external-dependency-currentness.ts';
import { buildRuntimeSubstrateComponent } from '../../src/modules/connect/managed-update-kernel-parts/runtime-substrate.ts';

function executable(filePath: string, output: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `#!/usr/bin/env bash\necho ${JSON.stringify(output)}\n`, { mode: 0o755 });
}

function toolInstaller(filePath: string, binaryName: string, versionCommand: string, versionOutput: string) {
  fs.writeFileSync(filePath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'mkdir -p "$HOME/.local/bin"',
    `cat > "$HOME/.local/bin/${binaryName}" <<'EOS'`,
    '#!/usr/bin/env bash',
    `if [ "\${1:-}" = ${JSON.stringify(versionCommand)} ]; then echo ${JSON.stringify(versionOutput)}; else echo ${binaryName}; fi`,
    'EOS',
    `chmod +x "$HOME/.local/bin/${binaryName}"`,
    '',
  ].join('\n'), { mode: 0o755 });
}

function writeFlowDependencyLock(stateRoot: string, dependencyIds: string[]) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(path.join(stateRoot, 'agent-package-locks.json'), `${JSON.stringify({
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [{
      package_id: 'opl-flow',
      lock_ref: 'opl://agent-package-lock/opl-flow/test',
      physical_surface: {
        workflow_policy_migration: {
          dependency_ids: dependencyIds,
          dependencies: dependencyIds.map((id) => ({
            id,
            kind: id === 'opl-base' ? 'base' : 'cli',
            offline_bundle: 'full',
            online_install_default: true,
            activation: 'always',
            source: id,
          })),
        },
      },
    }],
  }, null, 2)}\n`, 'utf8');
}

function writeLegacyFlowDependencyLock(stateRoot: string) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(path.join(stateRoot, 'agent-package-locks.json'), `${JSON.stringify({
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [{
      package_id: 'opl-flow',
      lock_ref: 'opl://agent-package-lock/opl-flow/legacy',
      physical_surface: {
        workflow_policy_migration: {
          dependency_ids: ['opl-base', 'officecli', 'officecli-docx', 'mineru-open-api'],
          dependency_sync: {
            items: [
              { skill_id: 'officecli', source_path: '/skills/officecli/SKILL.md', status: 'synced' },
              { skill_id: 'officecli-docx', source_path: '/skills/officecli-docx/SKILL.md', status: 'synced' },
            ],
            tools: [
              { tool_id: 'officecli', binary_path: '/bin/officecli', status: 'ready' },
              { tool_id: 'mineru-open-api', binary_path: '/bin/mineru-open-api', status: 'ready' },
            ],
          },
        },
      },
    }],
  }, null, 2)}\n`, 'utf8');
}

function withEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Base dependency catalog identifies the App-owned runtime Codex by owner path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-codex-'));
  const runtimeRoot = path.join(root, 'runtime');
  const codexPath = path.join(runtimeRoot, 'current', 'bin', 'codex');
  executable(codexPath, 'codex-cli 0.134.0');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_RUNTIME_ROOT: runtimeRoot,
      OPL_CODEX_BIN: codexPath,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
    }, () => {
      const catalog = inspectBaseManagedDependencies(root);
      const codex = catalog.dependencies.find((entry) => entry.dependency_id === 'codex-cli');
      const temporal = catalog.dependencies.find((entry) => entry.dependency_id === 'temporal-runtime');
      assert.equal(codex?.ownership, 'opl_managed');
      assert.equal(codex?.binary_path, codexPath);
      assert.equal(codex?.activation_policy, 'app_restart_generation_switch');
      assert.equal(temporal?.ownership, 'opl_managed_runtime_generation');
      assert.equal(temporal?.update_policy, 'updated_with_opl_base_framework_generation');
      assert.equal(temporal?.activation_policy, 'app_launch_reconcile_generation_switch');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('App Full tool bytes seed the Base managed root and then lose source priority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-seed-'));
  const bundledRoot = path.join(root, 'full-runtime');
  executable(path.join(bundledRoot, 'bin', 'officecli'), 'officecli 1.2.3');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_FULL_RUNTIME_HOME: bundledRoot,
      OPL_OFFICECLI_BIN: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const result = reconcileManagedCompanionTools(root, ['officecli'])[0];
      assert.equal(result.ownership, 'opl_managed');
      assert.equal(result.status, 'installed');
      assert.match(result.note ?? '', /offline seed/);
      const resolved = resolveOfficeCliTool(root);
      assert.equal(resolved?.ownership, 'opl_managed');
      assert.match(resolved?.binary_path ?? '', /base-dependencies/);
      assert.equal(fs.existsSync(path.join(root, 'state', 'base-dependencies', 'receipts', 'officecli.json')), true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit or PATH tools remain detect-only and are not copied into the managed root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-external-'));
  const external = path.join(root, 'external', 'officecli');
  executable(external, 'officecli 9.9.9');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_OFFICECLI_BIN: external,
      OPL_FULL_RUNTIME_HOME: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const result = reconcileManagedCompanionTools(root, ['officecli'])[0];
      assert.equal(result.ownership, 'global_path');
      assert.equal(result.action, 'none');
      assert.match(result.note ?? '', /not overwritten/);
      assert.equal(fs.existsSync(path.join(root, 'state', 'base-dependencies', '.local', 'bin', 'officecli')), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OPL-managed OfficeCLI and MinerU refresh latest currentness and silently upgrade only outdated managed bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-dependency-currentness-'));
  const stateRoot = path.join(root, 'state');
  const managedBin = path.join(stateRoot, 'base-dependencies', '.local', 'bin');
  const officeInstaller = path.join(root, 'office-installer.sh');
  const mineruInstaller = path.join(root, 'mineru-installer.sh');
  executable(path.join(managedBin, 'officecli'), 'officecli 1.0.1');
  executable(path.join(managedBin, 'mineru-open-api'), 'mineru-open-api version v0.1.0');
  toolInstaller(officeInstaller, 'officecli', '--version', 'officecli 1.0.2');
  toolInstaller(mineruInstaller, 'mineru-open-api', 'version', 'mineru-open-api version v0.2.0');
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      OPL_OFFICECLI_LATEST_VERSION: '1.0.2',
      OPL_MINERU_OPEN_API_LATEST_VERSION: '0.2.0',
      OPL_OFFICECLI_INSTALL_COMMAND: officeInstaller,
      OPL_MINERU_OPEN_API_INSTALL_COMMAND: mineruInstaller,
      PATH: '/usr/bin:/bin',
    }, () => {
      const results = reconcileManagedCompanionTools(root);
      assert.deepEqual(results.map((entry) => entry.status), ['updated', 'updated']);
      assert.deepEqual(results.map((entry) => entry.action), ['update', 'update']);
      assert.deepEqual(results.map((entry) => entry.currentness), ['current', 'current']);
      assert.deepEqual(results.map((entry) => entry.latest_version), ['1.0.2', '0.2.0']);
      const second = reconcileManagedCompanionTools(root);
      assert.deepEqual(second.map((entry) => entry.action), ['none', 'none']);
      assert.deepEqual(second.map((entry) => entry.currentness), ['current', 'current']);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Homebrew external dependencies expose confirmation-only owner actions and never enter Base auto-apply', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-homebrew-'));
  const brew = path.join(root, 'bin', 'brew');
  const codex = path.join(root, 'Cellar', 'codex', '0.1.0', 'bin', 'codex');
  const log = path.join(root, 'brew.log');
  executable(codex, 'codex-cli 0.1.0');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    `echo "$*" >> ${JSON.stringify(log)}`,
    'if [ "$*" = "list --formula --versions codex" ]; then echo "codex 0.1.0"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_HOMEBREW_BIN: brew,
      OPL_CODEX_BIN: codex,
      OPL_CODEX_CLI_LATEST_VERSION: '0.2.0',
      PATH: `${path.dirname(codex)}:/usr/bin:/bin`,
    }, () => {
      const installation = inspectExternalCodexInstallation({
        binaryPath: codex,
        version: 'codex-cli 0.1.0',
        latestVersion: '0.2.0',
      });
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.update_mode, 'explicit_owner_delegated');
      assert.equal(installation.update_action?.action_id, 'external_codex_update_homebrew');
      assert.equal(installation.update_action?.confirmation_required, true);
      assert.equal(installation.update_action?.auto_apply_allowed, false);
      const catalog = inspectBaseManagedDependencies(root, { refreshManagedLatest: true });
      const catalogCodex = catalog.dependencies.find((entry) => entry.dependency_id === 'codex-cli');
      assert.equal(catalogCodex?.ownership, 'homebrew_formula');
      assert.equal(catalogCodex?.update_action?.action_id, 'external_codex_update_homebrew');
      assert.equal(
        catalogCodex?.external_installations?.some((entry) => path.resolve(entry.binary_path ?? '') === codex),
        false,
      );
      const component = buildRuntimeSubstrateComponent({ core_engines: { codex: {
        installed: true,
        update_available: true,
        latest_version_status: 'outdated',
        binary_path: codex,
        version: 'codex-cli 0.1.0',
      } } }, 'stable', { allowFrameworkChannelLookup: false, refreshManagedDependencyLatest: true });
      assert.equal(component.state, 'current');
      assert.equal(component.auto_apply.eligible, false);
      const delegated = runExternalOwnerDelegatedUpdate('external_codex_update_homebrew', false);
      assert.equal(delegated.external_dependency_update.status, 'completed');
      assert.match(fs.readFileSync(log, 'utf8'), /upgrade codex/);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unverified PATH Codex stays detect-only without an executable update action', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-path-'));
  const codex = path.join(root, 'custom', 'codex');
  executable(codex, 'codex-cli 0.1.0');
  try {
    withEnvironment({ OPL_HOMEBREW_BIN: undefined, OPL_NPM_BIN: undefined, PATH: '/usr/bin:/bin' }, () => {
      const installation = inspectExternalCodexInstallation({ binaryPath: codex, version: '0.1.0', latestVersion: '0.2.0' });
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.update_mode, 'detect_only_guidance');
      assert.equal(installation.update_action, null);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Homebrew cask and global npm Codex owners receive their exact delegated routes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-codex-owners-'));
  const brew = path.join(root, 'bin', 'brew');
  const npm = path.join(root, 'bin', 'npm');
  const caskCodex = path.join(root, 'Caskroom', 'codex', '0.2.0', 'Codex.app', 'Contents', 'Resources', 'codex');
  const npmPackage = path.join(root, 'lib', 'node_modules', '@openai', 'codex');
  const npmCodex = path.join(npmPackage, 'bin', 'codex');
  executable(caskCodex, 'codex-cli 0.2.0');
  executable(npmCodex, 'codex-cli 0.2.0');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    'if [ "$*" = "list --cask --versions codex" ]; then echo "codex 0.2.0"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  executable(npm, 'npm fixture');
  fs.writeFileSync(path.join(npmPackage, 'package.json'), '{"name":"@openai/codex","version":"0.2.0"}\n', 'utf8');
  try {
    withEnvironment({ OPL_HOMEBREW_BIN: brew, OPL_NPM_BIN: npm, PATH: '/usr/bin:/bin' }, () => {
      const cask = inspectExternalCodexInstallation({ binaryPath: caskCodex, version: '0.2.0', latestVersion: '0.3.0' });
      const globalNpm = inspectExternalCodexInstallation({ binaryPath: npmCodex, version: '0.2.0', latestVersion: '0.3.0' });
      assert.equal(cask.ownership, 'homebrew_cask');
      assert.equal(cask.update_action?.action_id, 'external_codex_update_homebrew_cask');
      assert.equal(cask.update_action?.delegated_surface, 'brew upgrade --cask codex');
      assert.equal(globalNpm.ownership, 'global_npm');
      assert.equal(globalNpm.update_action?.action_id, 'external_codex_update_global_npm');
      assert.equal(globalNpm.update_action?.delegated_surface, 'npm install --global @openai/codex@latest');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Homebrew Temporal CLI reports currentness without inferring Temporal Server state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-external-temporal-owner-'));
  const brew = path.join(root, 'bin', 'brew');
  const temporal = path.join(root, 'Cellar', 'temporal', '1.0.0', 'bin', 'temporal');
  executable(temporal, 'temporal version 1.0.0');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    'if [ "$*" = "list --formula --versions temporal" ]; then echo "temporal 1.0.0"; fi',
    'if [ "$*" = "info --json=v2 temporal" ]; then echo \"{\\\"formulae\\\":[{\\\"versions\\\":{\\\"stable\\\":\\\"1.1.0\\\"}}]}\"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  try {
    withEnvironment({
      OPL_HOMEBREW_BIN: brew,
      OPL_TEMPORAL_BIN: temporal,
      OPL_TEMPORAL_CLI_LATEST_VERSION: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const installation = inspectExternalTemporalInstallation({ refreshLatest: true });
      assert.equal(installation.ownership, 'homebrew_formula');
      assert.equal(installation.currentness, 'update_available');
      assert.equal(installation.update_action?.action_id, 'external_temporal_update_homebrew');
      assert.match(installation.guidance, /Temporal CLI/);
      assert.equal(JSON.stringify(installation).includes('server_version'), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed companion currentness makes OPL Base background apply eligible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-companion-plan-'));
  const stateRoot = path.join(root, 'state');
  const office = path.join(stateRoot, 'base-dependencies', '.local', 'bin', 'officecli');
  const runtimeRoot = path.join(root, 'runtime');
  const codex = path.join(runtimeRoot, 'current', 'bin', 'codex');
  executable(office, 'officecli 1.0.1');
  executable(codex, 'codex-cli 0.2.0');
  writeFlowDependencyLock(stateRoot, ['opl-base', 'officecli']);
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_RUNTIME_ROOT: runtimeRoot,
      OPL_CODEX_BIN: codex,
      OPL_CODEX_CLI_LATEST_VERSION: '0.2.0',
      OPL_OFFICECLI_LATEST_VERSION: '1.0.2',
      OPL_COMPANION_SKIP_LATEST_LOOKUP: '1',
      PATH: '/usr/bin:/bin',
    }, () => {
      const component = buildRuntimeSubstrateComponent({ core_engines: { codex: {
        installed: true,
        update_available: false,
        latest_version_status: 'current',
        binary_path: codex,
        version: 'codex-cli 0.2.0',
        runtime_substrate_updater: { current_binary_path: codex, latest_version_status: 'current' },
      } } }, 'stable', { allowFrameworkChannelLookup: false, refreshManagedDependencyLatest: true });
      assert.equal(component.state, 'update_available');
      assert.equal(component.auto_apply.eligible, true);
      const catalog = component.current.dependency_catalog as ReturnType<typeof inspectBaseManagedDependencies>;
      assert.equal(catalog.dependencies.find((entry) => entry.dependency_id === 'officecli')?.currentness, 'update_available');
      assert.deepEqual(catalog.flow_dependencies.map((entry) => [entry.dependency_id, entry.dependency_kind]), [
        ['opl-base', 'base'],
        ['officecli', 'cli'],
      ]);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy OPL Flow locks project a typed dependency catalog from recorded sync receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-legacy-dependency-lock-'));
  const stateRoot = path.join(root, 'state');
  writeLegacyFlowDependencyLock(stateRoot);
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_CODEX_BIN: undefined,
      OPL_OFFICECLI_BIN: undefined,
      OPL_MINERU_OPEN_API_BIN: undefined,
      PATH: '/usr/bin:/bin',
    }, () => {
      const catalog = inspectBaseManagedDependencies(root);
      assert.deepEqual(catalog.flow_dependencies.map((entry) => [entry.dependency_id, entry.dependency_kind]), [
        ['opl-base', 'base'],
        ['officecli', 'codex_skill'],
        ['officecli-docx', 'codex_skill'],
        ['officecli', 'cli'],
        ['mineru-open-api', 'cli'],
      ]);
      assert.equal(catalog.flow_dependencies.every((entry) => typeof entry.status === 'string'), true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cached Base status skips companion latest network lookup while explicit refresh performs it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-companion-cached-status-'));
  const stateRoot = path.join(root, 'state');
  const office = path.join(stateRoot, 'base-dependencies', '.local', 'bin', 'officecli');
  const fakeGit = path.join(root, 'bin', 'git');
  const marker = path.join(root, 'git-called');
  executable(office, 'officecli 1.0.1');
  writeFlowDependencyLock(stateRoot, ['opl-base', 'officecli']);
  fs.mkdirSync(path.dirname(fakeGit), { recursive: true });
  fs.writeFileSync(fakeGit, [
    '#!/usr/bin/env bash',
    `echo called >> ${JSON.stringify(marker)}`,
    'echo "0000000000000000000000000000000000000000 refs/tags/v1.0.2"',
    '',
  ].join('\n'), { mode: 0o755 });
  try {
    withEnvironment({
      HOME: root,
      OPL_STATE_DIR: stateRoot,
      OPL_COMPANION_SKIP_LATEST_LOOKUP: undefined,
      OPL_OFFICECLI_LATEST_VERSION: undefined,
      PATH: `${path.dirname(fakeGit)}:/usr/bin:/bin`,
    }, () => {
      const cached = inspectBaseManagedDependencies(root);
      assert.equal(cached.dependencies.find((entry) => entry.dependency_id === 'officecli')?.currentness, 'unknown');
      assert.equal(fs.existsSync(marker), false);
      const refreshed = inspectBaseManagedDependencies(root, { refreshManagedLatest: true });
      assert.equal(refreshed.dependencies.find((entry) => entry.dependency_id === 'officecli')?.currentness, 'update_available');
      assert.equal(fs.existsSync(marker), true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('corrupt pending runtime metadata becomes attention instead of aborting startup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-pending-corrupt-'));
  const runtimeRoot = path.join(root, 'runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'pending-codex-generation.json'), '{broken', 'utf8');
  try {
    withEnvironment({ HOME: root, OPL_RUNTIME_ROOT: runtimeRoot }, () => {
      const result = activatePendingCodexRuntimeGeneration();
      assert.equal(result.status, 'manual_required');
      assert.equal(result.reason, 'pending_generation_metadata_invalid');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dirty OPL-managed skill source is reported and never materialized as a successful update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-skill-dirty-'));
  const codexHome = path.join(root, '.codex');
  const sourceRoot = path.join(codexHome, 'opl-companion-sources', 'OfficeCLI');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), '# OfficeCLI\n', 'utf8');
  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: sourceRoot, stdio: 'ignore' });
  execFileSync('git', ['add', 'SKILL.md'], { cwd: sourceRoot });
  execFileSync('git', ['-c', 'user.name=OPL Test', '-c', 'user.email=opl@example.test', 'commit', '-m', 'seed'], { cwd: sourceRoot, stdio: 'ignore' });
  fs.appendFileSync(path.join(sourceRoot, 'SKILL.md'), 'dirty\n', 'utf8');
  try {
    withEnvironment({
      HOME: root,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: undefined,
      OPL_COMPANION_SOURCES_ROOT: undefined,
      OPL_OFFICECLI_SOURCE_ROOT: undefined,
    }, () => {
      const result = syncOplCompanionSkills(root, { mode: 'managed', skillIds: ['officecli'], toolIds: [] });
      assert.equal(result.items[0].status, 'failed');
      assert.equal(result.items[0].action, 'update_and_symlink');
      assert.match(result.items[0].note ?? '', /dirty/);
      assert.equal(fs.existsSync(path.join(codexHome, 'skills', 'officecli')), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function frameworkFixture(root: string, version: string) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'entrypoints'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'opl-framework-fixture', version })}\n`, 'utf8');
  executable(path.join(root, 'bin', 'opl'), version);
  fs.writeFileSync(path.join(root, 'src', 'entrypoints', 'cli.ts'), `export const version = ${JSON.stringify(version)};\n`, 'utf8');
}

test('Framework and Temporal generation stages, activates on startup, and rolls back through the existing owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-pending-'));
  const targetRoot = path.join(root, 'framework');
  const archiveParent = path.join(root, 'archive-source');
  const archiveRoot = path.join(archiveParent, 'one-person-lab');
  const archivePath = path.join(root, 'framework.tar.gz');
  frameworkFixture(targetRoot, 'old');
  frameworkFixture(archiveRoot, 'new');
  execFileSync('tar', ['-czf', archivePath, '-C', archiveParent, 'one-person-lab']);
  const archiveSha256 = execFileSync('shasum', ['-a', '256', archivePath], { encoding: 'utf8' }).trim().split(/\s+/)[0];
  try {
    withEnvironment({ OPL_APP_PROCESS_INSTANCE_ID: 'framework-app-before-restart' }, () => {
      const staged = runOplFrameworkSelfUpdate({
        targetRoot,
        sourceArchive: archivePath,
        sourceArchiveSha256: archiveSha256,
        allowChannelArtifact: false,
        skipDependencyInstall: true,
      });
      assert.equal(staged.status, 'completed');
      assert.equal(staged.reason, 'framework_runtime_artifact_staged_for_restart');
      assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8')).version, 'old');
      assert.equal(fs.existsSync(`${targetRoot}.pending.json`), true);
      assert.equal(activatePendingOplFrameworkRuntime(targetRoot).status, 'deferred_same_app_instance');
      const pendingBefore = fs.readFileSync(`${targetRoot}.pending.json`, 'utf8');
      const repeated = runOplFrameworkSelfUpdate({
        targetRoot,
        sourceArchive: archivePath,
        sourceArchiveSha256: archiveSha256,
        allowChannelArtifact: false,
        skipDependencyInstall: true,
      });
      assert.equal(repeated.status, 'skipped');
      assert.equal(repeated.reason, 'framework_runtime_artifact_pending_restart');
      assert.equal(fs.readFileSync(`${targetRoot}.pending.json`, 'utf8'), pendingBefore);
    });
    const activated = withEnvironment(
      { OPL_APP_PROCESS_INSTANCE_ID: 'framework-app-after-restart' },
      () => activatePendingOplFrameworkRuntime(targetRoot),
    );
    assert.equal(activated.status, 'activated');
    assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8')).version, 'new');
    assert.equal(fs.existsSync(`${targetRoot}.previous`), true);

    const rollback = runOplFrameworkSelfRollback({ targetRoot });
    assert.equal(rollback.status, 'completed');
    assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8')).version, 'old');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
