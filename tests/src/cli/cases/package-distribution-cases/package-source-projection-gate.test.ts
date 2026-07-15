import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { TestContext } from 'node:test';

import {
  resolveAnnotatedOwnerVersionTag,
  validatePackageSourceProjection,
} from '../../../../../scripts/package-source-projection-gate.mjs';
import { assert, fs, os, path, test } from './helpers.ts';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function digest(filePath: string) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function standardFixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-projection-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner');
  const frameworkRoot = path.join(root, 'framework');
  const version = '0.3.0';
  const packageId = 'mas';
  const sourceRoot = 'plugins/med-autoscience';
  const repoUrl = 'https://github.com/example/med-autoscience.git';
  const pluginPath = path.join(ownerRoot, sourceRoot, '.codex-plugin', 'plugin.json');
  const skillPath = path.join(ownerRoot, sourceRoot, 'skills', 'med-autoscience', 'SKILL.md');
  writeJson(path.join(ownerRoot, 'contracts', 'owner-package.json'), {
    package_id: packageId,
    agent_id: packageId,
    version,
  });
  writeJson(pluginPath, { id: 'med-autoscience', version });
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, '# MAS\n');
  git(ownerRoot, ['init', '-q']);
  git(ownerRoot, ['config', 'user.name', 'OPL Test']);
  git(ownerRoot, ['config', 'user.email', 'test@example.com']);
  git(ownerRoot, ['add', '.']);
  git(ownerRoot, ['commit', '-qm', 'owner source']);
  const carrierCommit = git(ownerRoot, ['rev-parse', 'HEAD']);
  git(ownerRoot, ['tag', '-a', `v${version}`, '-m', `v${version}`]);
  writeJson(path.join(ownerRoot, 'contracts', 'owner-package.json'), {
    package_id: packageId,
    agent_id: packageId,
    version,
    codex_surface: { carrier_source_commit: carrierCommit },
  });
  git(ownerRoot, ['add', 'contracts/owner-package.json']);
  git(ownerRoot, ['commit', '-qm', 'bind carrier source authority']);
  const head = git(ownerRoot, ['rev-parse', 'HEAD']);
  const payloadRef = `payloads/${packageId}-${version}.json`;
  const manifestPath = path.join(frameworkRoot, 'contracts', 'opl-framework', 'packages', `${packageId}.json`);
  const payloadPath = path.join(path.dirname(manifestPath), payloadRef);
  const files = [
    { path: '.codex-plugin/plugin.json', absolute: pluginPath },
    { path: 'skills/med-autoscience/SKILL.md', absolute: skillPath },
  ].map((entry) => ({
    path: entry.path,
    source_url: `https://raw.githubusercontent.com/example/med-autoscience/${carrierCommit}/${sourceRoot}/${entry.path}`,
    sha256: digest(entry.absolute),
  }));
  writeJson(manifestPath, {
    package_id: packageId,
    agent_id: packageId,
    version,
    source_repo: repoUrl,
    codex_surface: {
      plugin_payload_manifest_url: payloadRef,
      carrier_source_commit: carrierCommit,
    },
  });
  writeJson(payloadPath, {
    package_id: packageId,
    package_version: version,
    source_repo: repoUrl,
    source_commit: carrierCommit,
    source_root: sourceRoot,
    files,
  });
  const spec = {
    package_id: packageId,
    repo_url: repoUrl,
    package_manifest_ref: `contracts/opl-framework/packages/${packageId}.json`,
    owner_package_manifest_ref: 'contracts/owner-package.json',
    owner_manifest_kind: 'standard_agent',
  };
  return {
    ownerRoot,
    frameworkRoot,
    manifestPath,
    payloadPath,
    spec,
    version,
    head,
    carrierCommit,
    skillPath,
  };
}

test('package source projection gate binds annotated owner tag, exact commit, URLs, and bytes', (t) => {
  const fixture = standardFixture(t);
  const result = validatePackageSourceProjection({
    frameworkRoot: fixture.frameworkRoot,
    spec: fixture.spec,
    ownerRepoPath: fixture.ownerRoot,
  });
  assert.equal(result.status, 'validated');
  assert.equal(result.owner_source_commit, fixture.carrierCommit);
  assert.equal(result.owner_head, fixture.head);
  assert.notEqual(result.owner_head, result.owner_source_commit);
  assert.equal(result.owner_version_tag, `v${fixture.version}`);
  assert.equal(result.file_count, 2);
});

test('package source projection gate requires owner carrier authority for standard Agents', (t) => {
  const fixture = standardFixture(t);
  const ownerManifestPath = path.join(fixture.ownerRoot, 'contracts', 'owner-package.json');
  const ownerManifest = JSON.parse(fs.readFileSync(ownerManifestPath, 'utf8'));
  delete ownerManifest.codex_surface.carrier_source_commit;
  writeJson(ownerManifestPath, ownerManifest);

  assert.throws(
    () => validatePackageSourceProjection({
      frameworkRoot: fixture.frameworkRoot,
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
    }),
    (error: unknown) => (error as { code?: string }).code === 'carrier_source_commit_missing',
  );
});

test('package source projection gate rejects central carrier authority drift', (t) => {
  const fixture = standardFixture(t);
  const projected = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
  projected.codex_surface.carrier_source_commit = '0'.repeat(40);
  writeJson(fixture.manifestPath, projected);

  assert.throws(
    () => validatePackageSourceProjection({
      frameworkRoot: fixture.frameworkRoot,
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
    }),
    (error: unknown) => (error as { code?: string }).code === 'carrier_source_commit_drift',
  );
});

test('package source projection gate rejects a lightweight or missing owner version tag', (t) => {
  const fixture = standardFixture(t);
  git(fixture.ownerRoot, ['tag', '-d', `v${fixture.version}`]);
  git(fixture.ownerRoot, ['tag', `v${fixture.version}`]);
  assert.throws(
    () => resolveAnnotatedOwnerVersionTag({
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
      packageVersion: fixture.version,
      sourceCommit: fixture.carrierCommit,
      releaseGate: 'daily_package_channel_detection',
    }),
    (error: unknown) => (error as { code?: string }).code === 'version_bump_required',
  );
});

test('package source projection gate rejects an annotated bare-version tag', (t) => {
  const fixture = standardFixture(t);
  git(fixture.ownerRoot, ['tag', '-d', `v${fixture.version}`]);
  git(fixture.ownerRoot, ['tag', '-a', fixture.version, '-m', fixture.version]);
  assert.throws(
    () => resolveAnnotatedOwnerVersionTag({
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
      packageVersion: fixture.version,
      sourceCommit: fixture.carrierCommit,
      releaseGate: 'daily_package_channel_detection',
    }),
    (error: unknown) => (error as { code?: string }).code === 'version_bump_required',
  );
});

test('package source projection gate rejects stale payload authority and validates exact committed bytes', (t) => {
  const fixture = standardFixture(t);
  const payload = JSON.parse(fs.readFileSync(fixture.payloadPath, 'utf8'));
  payload.source_commit = '0'.repeat(40);
  writeJson(fixture.payloadPath, payload);
  assert.throws(
    () => validatePackageSourceProjection({
      frameworkRoot: fixture.frameworkRoot,
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
    }),
    (error: unknown) => (error as { code?: string }).code === 'payload_source_drift',
  );

  payload.source_commit = fixture.carrierCommit;
  writeJson(fixture.payloadPath, payload);
  fs.writeFileSync(fixture.skillPath, '# changed bytes\n');
  assert.equal(validatePackageSourceProjection({
    frameworkRoot: fixture.frameworkRoot,
    spec: fixture.spec,
    ownerRepoPath: fixture.ownerRoot,
  }).status, 'validated');

  payload.files[1].sha256 = `sha256:${'0'.repeat(64)}`;
  writeJson(fixture.payloadPath, payload);
  assert.throws(
    () => validatePackageSourceProjection({
      frameworkRoot: fixture.frameworkRoot,
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
    }),
    (error: unknown) => (error as { code?: string }).code === 'payload_source_digest_mismatch',
  );
});

test('package source projection gate verifies Scholar Skills ordered content lock bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-projection-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner');
  const frameworkRoot = path.join(root, 'framework');
  const repoUrl = 'https://github.com/example/mas-scholar-skills.git';
  const version = '0.2.0';
  const paths = ['.codex-plugin/plugin.json', 'skills/example/SKILL.md'];
  writeJson(path.join(ownerRoot, paths[0]), { id: 'mas-scholar-skills', version });
  fs.mkdirSync(path.dirname(path.join(ownerRoot, paths[1])), { recursive: true });
  fs.writeFileSync(path.join(ownerRoot, paths[1]), '# Skill\n');
  const lockHash = crypto.createHash('sha256');
  for (const declaredPath of paths) {
    lockHash.update(Buffer.from(declaredPath));
    lockHash.update(Buffer.from([0]));
    lockHash.update(fs.readFileSync(path.join(ownerRoot, declaredPath)));
  }
  const contentLock = {
    algorithm: 'sha256',
    canonicalization: 'ordered_path_nul_file_bytes',
    paths,
    digest: `sha256:${lockHash.digest('hex')}`,
  };
  writeJson(path.join(ownerRoot, 'contracts', 'owner-package.json'), {
    package_id: 'mas-scholar-skills',
    version,
    content_lock: contentLock,
  });
  git(ownerRoot, ['init', '-q']);
  git(ownerRoot, ['config', 'user.name', 'OPL Test']);
  git(ownerRoot, ['config', 'user.email', 'test@example.com']);
  git(ownerRoot, ['add', '.']);
  git(ownerRoot, ['commit', '-qm', 'owner source']);
  const head = git(ownerRoot, ['rev-parse', 'HEAD']);
  git(ownerRoot, ['tag', '-a', `v${version}`, '-m', `v${version}`]);
  const manifestPath = path.join(frameworkRoot, 'contracts/opl-framework/packages/mas-scholar-skills.json');
  const payloadRef = `payloads/mas-scholar-skills-${version}.json`;
  writeJson(manifestPath, {
    package_id: 'mas-scholar-skills',
    version,
    source_repo: repoUrl,
    content_lock: contentLock,
    codex_surface: {
      plugin_payload_manifest_url: payloadRef,
      carrier_source_commit: head,
    },
  });
  writeJson(path.join(path.dirname(manifestPath), payloadRef), {
    package_id: 'mas-scholar-skills',
    package_version: version,
    source_repo: repoUrl,
    source_commit: head,
    source_root: '.',
    files: paths.map((declaredPath) => ({
      path: declaredPath,
      source_url: `https://raw.githubusercontent.com/example/mas-scholar-skills/${head}/${declaredPath}`,
      sha256: digest(path.join(ownerRoot, declaredPath)),
    })),
  });
  const spec = {
    package_id: 'mas-scholar-skills',
    repo_url: repoUrl,
    package_manifest_ref: 'contracts/opl-framework/packages/mas-scholar-skills.json',
    owner_package_manifest_ref: 'contracts/owner-package.json',
    owner_manifest_kind: 'capability_package',
  };
  assert.equal(validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot }).status, 'validated');
  const projected = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  projected.content_lock.digest = `sha256:${'0'.repeat(64)}`;
  writeJson(manifestPath, projected);
  assert.throws(
    () => validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot }),
    (error: unknown) => (error as { code?: string }).code === 'content_lock_drift',
  );
});
