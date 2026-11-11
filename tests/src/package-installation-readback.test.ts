import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { readPackageInstallationReadback } from '../../src/adapters/integration/agent-package-registry-parts/package-installation-readback.ts';

function fixture(run: (home: string, env: NodeJS.ProcessEnv) => void) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installation-readback-'));
  try { run(home, { HOME: home }); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function write(file: string, value: string | object) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}

function ownerFixture(home: string) {
  const packageId = 'sample-native-app';
  const root = path.join(home, '.local/share', packageId, 'app');
  const current = path.join(root, 'releases/1.2.3-001');
  const bin = path.join(home, '.local/bin');
  const target = path.join(bin, 'sample-cli');
  write(path.join(current, 'package.json'), { name: packageId, version: '1.2.3', bin: { 'sample-cli': 'src/cli.mjs' } });
  write(path.join(current, 'src/cli.mjs'), 'throw new Error("Never execute inspection fixtures");');
  write(target, '#!/bin/sh\nexit 91\n');
  fs.chmodSync(target, 0o755);
  fs.symlinkSync(current, path.join(root, 'current'));
  const receipt = {
    product: packageId, root, current, bin, version: '1.2.3', sourceRevision: 'a'.repeat(40),
    wrappers: [{ path: target, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') }],
  };
  const receiptPath = path.join(root, 'install.json');
  write(receiptPath, receipt);
  return { packageId, root, current, target, receipt, receiptPath };
}

function uvFixture(home: string, editable: boolean) {
  const packageId = 'sample-python-tool';
  const root = path.join(home, '.local/share/uv/tools', packageId);
  const project = path.join(home, 'workspace', packageId);
  const executable = path.join(root, 'bin/sample-python-tool');
  const installedCommand = path.join(home, '.local/bin/sample-python-tool');
  const dist = path.join(root, 'lib/python3.12/site-packages/sample_python_tool-0.1.0.dist-info');
  write(executable, '#!/bin/sh\nexit 92\n');
  fs.chmodSync(executable, 0o755);
  fs.mkdirSync(path.dirname(installedCommand), { recursive: true });
  fs.symlinkSync(executable, installedCommand);
  write(path.join(dist, 'METADATA'), 'Metadata-Version: 2.3\nName: sample-python-tool\nVersion: 0.1.0\n');
  write(path.join(root, 'uv-receipt.toml'), `[tool]\nrequirements = [{name = "${packageId}"${editable ? `, editable = ${JSON.stringify(project)}` : ''}}]\nentrypoints = [{name = "${packageId}", from = "${packageId}", install-path = ${JSON.stringify(installedCommand)}}]\n`);
  if (editable) {
    write(path.join(project, 'pyproject.toml'), '[project]\nname = "sample-python-tool"\nversion = "0.1.0"\n');
    write(path.join(dist, 'direct_url.json'), { url: pathToFileURL(project).href, dir_info: { editable: true } });
  }
  return { packageId, root, project, executable, installedCommand, dist };
}

test('owner receipts prove an installed instance without claiming plugin lifecycle or executing entrypoints', () => fixture((home, env) => {
  const sample = ownerFixture(home);
  const result = readPackageInstallationReadback(sample.packageId, env);
  assert.equal(result.length, 1);
  assert.equal(result[0].version, '1.2.3');
  assert.equal(result[0].mode, 'installed');
  assert.equal(result[0].manager, 'package_owner');
  assert.equal(result[0].management_scope, 'owner_only');
  assert.equal(result[0].entrypoint_verified, true);
  assert.equal(result[0].source_revision, 'a'.repeat(40));
  assert.ok(path.isAbsolute(result[0].location));
  assert.equal(result[0].active, true);
  assert.equal('installed' in result[0], false);
}));

test('stale owner identity, changed wrappers and broken current links are not installed evidence', () => fixture((home, env) => {
  const sample = ownerFixture(home);
  write(sample.receiptPath, { ...sample.receipt, product: 'different-product' });
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
  write(sample.receiptPath, sample.receipt);
  write(path.join(sample.current, 'package.json'), { name: sample.packageId, version: '9.9.9', bin: { 'sample-cli': 'src/cli.mjs' } });
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
  write(path.join(sample.current, 'package.json'), { name: sample.packageId, version: '1.2.3', bin: { 'sample-cli': 'src/cli.mjs' } });
  write(sample.target, '#!/bin/sh\nexit 0\n');
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
  write(sample.target, '#!/bin/sh\nexit 91\n');
  fs.unlinkSync(path.join(sample.root, 'current'));
  fs.symlinkSync(path.join(sample.root, 'missing'), path.join(sample.root, 'current'));
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
}));

test('uv editable links are development installations while ordinary uv tools remain installed', () => {
  for (const editable of [true, false]) fixture((home, env) => {
    const sample = uvFixture(home, editable);
    const result = readPackageInstallationReadback(sample.packageId, env);
    assert.equal(result.length, 1);
    assert.equal(result[0].version, '0.1.0');
    assert.equal(result[0].mode, editable ? 'development' : 'installed');
    assert.equal(result[0].manager, 'uv');
    assert.equal(result[0].management_scope, 'owner_only');
    assert.ok(path.isAbsolute(result[0].location));
  assert.equal(result[0].active, true);
  });
});

test('uv metadata requires the same installed entrypoint and a live matching editable project', () => fixture((home, env) => {
  const sample = uvFixture(home, true);
  fs.unlinkSync(sample.installedCommand);
  write(sample.installedCommand, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(sample.installedCommand, 0o755);
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
  fs.unlinkSync(sample.installedCommand);
  fs.symlinkSync(sample.executable, sample.installedCommand);
  write(path.join(sample.project, 'pyproject.toml'), '[project]\nname = "another-project"\n');
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
  fs.rmSync(sample.project, { recursive: true });
  assert.deepEqual(readPackageInstallationReadback(sample.packageId, env), []);
}));

test('a checkout or arbitrary package metadata alone does not become an installation', () => fixture((home, env) => {
  write(path.join(home, '.local/share/example/app/current/package.json'), { name: 'example', version: '1.0.0' });
  assert.deepEqual(readPackageInstallationReadback('example', env), []);
  assert.deepEqual(readPackageInstallationReadback('../example', env), []);
}));
