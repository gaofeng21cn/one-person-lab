import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { executeSoftwareInstallationAction } from '../../src/adapters/integration/software-installation.ts';
import { readInstalledSoftwareProducts } from '../../src/adapters/integration/software-sources-framework-installation.ts';
import { refreshFrameworkSoftwareRelease } from '../../src/adapters/integration/software-sources-framework-release.ts';
import { acquireManagedUpdateLock } from '../../src/adapters/integration/managed-update-lock.ts';
import { activatePendingOplFrameworkRuntime, readOplFrameworkRuntimeUpdateStatus, runOplFrameworkSelfUpdate } from '../../src/adapters/integration/system-installation/framework-self-update.ts';

test('a newer installed Framework is not downgraded or reported as an available channel update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-newer-framework-'));
  const previous = process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT;
  try {
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist', 'entrypoints'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(root, 'dist', 'entrypoints', 'cli.js'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework', version: '0.3.17' }));
    const channelEntry = { channel_version: '0.3.16', artifact: 'ghcr.io/fixture/framework@sha256:' + 'a'.repeat(64),
      artifact_digest: 'sha256:' + 'a'.repeat(64), source_archive_sha256: 'b'.repeat(64), source_git_head_sha: 'c'.repeat(40) };
    process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = root;
    const status = readOplFrameworkRuntimeUpdateStatus(root, { channelEntry });
    assert.equal(status.installed_newer_than_channel, true);
    assert.equal(status.update_available, false);
    assert.equal(runOplFrameworkSelfUpdate({ targetRoot: root, channelEntry }).reason, 'framework_installed_version_newer_than_channel');
    assert.equal(fs.existsSync(root + '.pending'), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, '0.3.17');
  } finally {
    if (previous === undefined) delete process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT; else process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Framework updates its receipted Git installation, pins the release and preserves changes until restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-installation-'));
  const installedRoot = path.join(root, '.opl', 'one-person-lab');
  const incomingRoot = path.join(root, 'incoming');
  const archive = path.join(root, 'release.tar.gz');
  const channel = path.join(root, 'channel.json');
  const curl = path.join(root, 'curl');
  for (const [directory, version] of [[installedRoot, '0.3.12'], [incomingRoot, '0.3.13']]) {
    fs.mkdirSync(path.join(directory, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'dist', 'entrypoints'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'bin', 'opl'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(directory, 'dist', 'entrypoints', 'cli.js'), 'export {};\n');
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'opl-framework', version }));
  }
  fs.writeFileSync(path.join(installedRoot, '.gitignore'), '.opl-framework-installed-source-identity.json\n');
  execFileSync('git', ['init', '-q', installedRoot]);
  execFileSync('git', ['add', '.'], { cwd: installedRoot });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Installed release'], { cwd: installedRoot });
  const installedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: installedRoot, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(installedRoot, '.opl-framework-installed-source-identity.json'), JSON.stringify({
    schema: 'opl_framework_installed_source_identity.v1', framework_sha: installedCommit, install_mode: 'git', identity_source: 'git_head',
  }));
  fs.mkdirSync(path.join(root, '.local', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(installedRoot, 'bin', 'opl'), path.join(root, '.local', 'bin', 'opl'));
  fs.writeFileSync(path.join(root, 'business-data.txt'), 'preserved');
  execFileSync('tar', ['-czf', archive, '-C', incomingRoot, '.']);
  const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  const manifest = { schemaVersion: 2, artifactType: 'application/vnd.onepersonlab.framework.v1',
    annotations: { 'org.opencontainers.image.version': '0.3.13', 'org.opencontainers.image.revision': 'b'.repeat(40) },
    layers: [{ mediaType: 'application/vnd.onepersonlab.framework.source.v1+gzip', digest: `sha256:${digest}` }] };
  fs.writeFileSync(channel, JSON.stringify(manifest));
  fs.writeFileSync(curl, `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst url = args.find(x => x.startsWith('https://')) || '';\nif (url.includes('/token?')) process.stdout.write('{"token":"fixture"}');\nelse if (url.includes('/manifests/')) process.stdout.write(fs.readFileSync(${JSON.stringify(channel)}, 'utf8'));\nelse if (url.includes('/blobs/')) fs.copyFileSync(${JSON.stringify(archive)}, args[args.indexOf('-o') + 1]);\nelse process.exit(22);\n`, { mode: 0o755 });
  const env = { HOME: root, OPL_STATE_DIR: path.join(root, 'state'), OPL_FULL_RUNTIME_HOME: '',
    OPL_CURL_BIN: curl, OPL_FRAMEWORK_ARTIFACT_REF: 'ghcr.io/owner/one-person-lab-framework:latest-stable',
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '0', OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: '1',
    OPL_APP_PROCESS_INSTANCE_ID: 'before-restart' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    assert.equal(readInstalledSoftwareProducts()[0].update_status, 'unknown');
    refreshFrameworkSoftwareRelease();
    assert.equal(readInstalledSoftwareProducts()[0].installations[0].mode, 'installed');
    const identityPath = path.join(installedRoot, '.opl-framework-installed-source-identity.json');
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    fs.writeFileSync(identityPath, JSON.stringify({ ...identity, identity_source: 'explicit_source_commit' }));
    const product = readInstalledSoftwareProducts()[0];
    assert.equal(product.update_status, 'available');
    assert.equal(product.available_version, '0.3.13');
    assert.equal(product.installations[0].location, fs.realpathSync(installedRoot));
    const payload = product.available_actions[0].payload as Record<string, unknown>;
    fs.writeFileSync(path.join(installedRoot, 'local-change.txt'), 'keep');
    assert.equal(readInstalledSoftwareProducts()[0].installations[0].mode, 'installed');
    assert.deepEqual(readInstalledSoftwareProducts()[0].available_actions, []);
    await assert.rejects(() => executeSoftwareInstallationAction(payload), /Refresh this Framework/);
    assert.equal(fs.readFileSync(path.join(installedRoot, 'local-change.txt'), 'utf8'), 'keep');
    fs.rmSync(path.join(installedRoot, 'local-change.txt'));
    await assert.rejects(() => executeSoftwareInstallationAction({ ...payload, installation_id: 'wrong' }), /Refresh this Framework/);
    await assert.rejects(() => executeSoftwareInstallationAction({ ...payload, version: '0.3.14' }), /Refresh this Framework/);
    const lock = acquireManagedUpdateLock({ operation: 'apply', componentId: 'opl_base' });
    try { await assert.rejects(() => executeSoftwareInstallationAction(payload)); } finally { lock.release(); }
    fs.writeFileSync(channel, JSON.stringify({ ...manifest, annotations: { ...manifest.annotations, 'org.opencontainers.image.version': '0.3.14' } }));
    await assert.rejects(() => executeSoftwareInstallationAction(payload), /Refresh this Framework/);
    assert.equal(fs.existsSync(`${installedRoot}.pending`), false);
    fs.writeFileSync(channel, JSON.stringify(manifest));
    const result = await executeSoftwareInstallationAction(payload);
    assert.equal(result.status, 'needs_restart');
    assert.equal(readInstalledSoftwareProducts()[0].installed_version, '0.3.12');
    assert.equal(readInstalledSoftwareProducts()[0].update_status, 'needs_restart');
    assert.equal(readInstalledSoftwareProducts()[0].pending_version, '0.3.13');
    assert.deepEqual(readInstalledSoftwareProducts()[0].available_actions, []);
    fs.writeFileSync(path.join(installedRoot, 'local-change.txt'), 'keep after staging');
    assert.equal(activatePendingOplFrameworkRuntime(fs.realpathSync(installedRoot)).status, 'manual_required');
    assert.equal(fs.readFileSync(path.join(installedRoot, 'local-change.txt'), 'utf8'), 'keep after staging');
    fs.rmSync(path.join(installedRoot, 'local-change.txt'));
    assert.equal(activatePendingOplFrameworkRuntime(fs.realpathSync(installedRoot)).status, 'deferred_same_app_instance');
    process.env.OPL_APP_PROCESS_INSTANCE_ID = 'after-restart';
    assert.equal(activatePendingOplFrameworkRuntime(fs.realpathSync(installedRoot)).status, 'activated');
    assert.equal(readInstalledSoftwareProducts()[0].installed_version, '0.3.13');
    assert.equal(readInstalledSoftwareProducts()[0].update_status, 'current');
    assert.equal(fs.existsSync(path.join(`${installedRoot}.previous`, '.git')), true);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: `${installedRoot}.previous`, encoding: 'utf8' }).trim(), installedCommit);
    assert.equal(fs.readFileSync(path.join(root, 'business-data.txt'), 'utf8'), 'preserved');
    await assert.rejects(() => executeSoftwareInstallationAction(payload), /Refresh this Framework/);
    execFileSync('git', ['init', '-q', installedRoot]);
    fs.writeFileSync(channel, JSON.stringify({ ...manifest, annotations: { ...manifest.annotations, 'org.opencontainers.image.version': '0.3.14' } }));
    refreshFrameworkSoftwareRelease();
    assert.equal(readInstalledSoftwareProducts()[0].installations[0].mode, 'development');
    assert.deepEqual(readInstalledSoftwareProducts()[0].available_actions, []);
    refreshFrameworkSoftwareRelease(process.env, () => { throw new Error('offline'); });
    assert.equal(readInstalledSoftwareProducts()[0].update_status, 'unknown');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full runtime installation takes precedence over legacy CLI install and discards older pending generations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-precedence-'));
  const legacyRoot = path.join(root, '.opl', 'one-person-lab');
  const fullRuntimeHome = path.join(root, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  const fullOplRoot = path.join(fullRuntimeHome, 'opl');
  const stalePendingRoot = `${fullOplRoot}.pending`;
  for (const [directory, version] of [[legacyRoot, '0.3.16'], [fullOplRoot, '0.3.20'], [stalePendingRoot, '0.3.18']]) {
    fs.mkdirSync(path.join(directory, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'dist', 'entrypoints'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'bin', 'opl'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(directory, 'dist', 'entrypoints', 'cli.js'), 'export {};\n');
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'opl-framework', version }));
  }
  fs.writeFileSync(path.join(legacyRoot, '.opl-framework-installed-source-identity.json'), JSON.stringify({
    schema: 'opl_framework_installed_source_identity.v1', framework_sha: 'a'.repeat(40), install_mode: 'archive', identity_source: 'install_ref',
  }));
  fs.mkdirSync(path.join(root, '.local', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(legacyRoot, 'bin', 'opl'), path.join(root, '.local', 'bin', 'opl'));
  fs.writeFileSync(path.join(fullRuntimeHome, '.opl-full-runtime-installed.json'), JSON.stringify({
    version: '26.11.20-r1', manifest_sha256: '1'.repeat(64), installed_at: new Date().toISOString(),
  }));
  const realFullOplRoot = fs.realpathSync(fullOplRoot);
  const realPendingRoot = fs.realpathSync(stalePendingRoot);
  const env = { HOME: root, OPL_STATE_DIR: path.join(root, 'state'), OPL_FULL_RUNTIME_HOME: fullRuntimeHome };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    refreshFrameworkSoftwareRelease(process.env, () => ({
      channel_version: '0.3.22',
      artifact: `ghcr.io/owner/one-person-lab-framework@sha256:${'d'.repeat(64)}`,
      artifact_digest: `sha256:${'d'.repeat(64)}`,
      source_archive_sha256: 'e'.repeat(64),
      source_git_head_sha: 'f'.repeat(40),
    }));
    // Seed a valid but older pending generation on the Full runtime root.
    const olderArchive = path.join(root, 'older.tar.gz');
    execFileSync('tar', ['-czf', olderArchive, '-C', stalePendingRoot, '.']);
    const olderSha = createHash('sha256').update(fs.readFileSync(olderArchive)).digest('hex');
    fs.rmSync(stalePendingRoot, { recursive: true, force: true });
    const staged = runOplFrameworkSelfUpdate({
      targetRoot: realFullOplRoot,
      sourceArchive: olderArchive,
      sourceArchiveSha256: olderSha,
      allowChannelArtifact: false,
      skipDependencyInstall: true,
    });
    assert.equal(staged.status, 'completed');
    assert.equal(fs.existsSync(`${realFullOplRoot}.pending.json`), true);
    const product = readInstalledSoftwareProducts(process.env)[0];
    assert.equal(product.location, realFullOplRoot);
    assert.equal(product.installed_version, '0.3.20');
    assert.equal(product.update_status, 'available');
    assert.equal(product.pending_version, null);
    assert.equal(product.available_actions.length, 1);
    const activation = activatePendingOplFrameworkRuntime(realFullOplRoot);
    assert.equal(activation.status, 'no_pending_generation');
    assert.equal(activation.reason, 'framework_pending_generation_older_than_installed_discarded');
    assert.equal(fs.existsSync(realPendingRoot), false);
    assert.equal(fs.existsSync(`${realFullOplRoot}.pending.json`), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(realFullOplRoot, 'package.json'), 'utf8')).version, '0.3.20');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
