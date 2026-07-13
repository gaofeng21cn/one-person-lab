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

function executable(filePath: string, output: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `#!/usr/bin/env bash\necho ${JSON.stringify(output)}\n`, { mode: 0o755 });
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
    fs.rmSync(root, { recursive: true, force: true });
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
