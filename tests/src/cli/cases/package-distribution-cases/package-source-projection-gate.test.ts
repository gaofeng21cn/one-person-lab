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

function lengthPrefixedFileDigest(entries: Array<{ path: string; absolute: string }>) {
  const hash = crypto.createHash('sha256');
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.path, 'utf8');
    const fileBytes = fs.readFileSync(entry.absolute);
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    hash.update(pathLength);
    hash.update(pathBytes);
    hash.update(fileLength);
    hash.update(fileBytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function standardFixture(t: TestContext, skillRelativePath = 'skills/med-autoscience/SKILL.md') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-projection-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner');
  const frameworkRoot = path.join(root, 'framework');
  const version = '0.3.0';
  const packageId = 'mas';
  const sourceRoot = 'plugins/med-autoscience';
  const repoUrl = 'https://github.com/example/med-autoscience.git';
  const pluginPath = path.join(ownerRoot, sourceRoot, '.codex-plugin', 'plugin.json');
  const skillPath = path.join(ownerRoot, sourceRoot, skillRelativePath);
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
  const fileSources = [
    { path: '.codex-plugin/plugin.json', absolute: pluginPath },
    { path: skillRelativePath, absolute: skillPath },
  ];
  const files = fileSources.map((entry) => ({
    path: entry.path,
    mode: '100644',
    source_url: `https://raw.githubusercontent.com/example/med-autoscience/${carrierCommit}/${sourceRoot}/${entry.path.split('/').map(encodeURIComponent).join('/')}`,
    sha256: digest(entry.absolute),
  }));
  writeJson(manifestPath, {
    package_id: packageId,
    agent_id: packageId,
    version,
    source_repo: repoUrl,
    codex_surface: {
      plugin_id: 'med-autoscience',
      plugin_payload_manifest_url: payloadRef,
      carrier_source_commit: carrierCommit,
    },
  });
  writeJson(payloadPath, {
    surface_kind: 'opl_package_payload_manifest.v2',
    schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
    package_id: packageId,
    plugin_id: 'med-autoscience',
    package_version: version,
    source_repo: repoUrl,
    source_commit: carrierCommit,
    source_root: sourceRoot,
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_length_file_length_bytes',
      digest: lengthPrefixedFileDigest(fileSources),
    },
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

test('package source projection gate preserves Unicode and spaced carrier paths with Git quoting enabled', (t) => {
  const fixture = standardFixture(t, 'skills/med-autoscience/医学科普 说明.md');
  git(fixture.ownerRoot, ['config', 'core.quotePath', 'true']);
  const result = validatePackageSourceProjection({
    frameworkRoot: fixture.frameworkRoot,
    spec: fixture.spec,
    ownerRepoPath: fixture.ownerRoot,
  });
  assert.equal(result.status, 'validated');
  assert.equal(result.file_count, 2);
});

test('package source projection gate rejects historical payload envelopes', (t) => {
  const fixture = standardFixture(t);
  const payload = JSON.parse(fs.readFileSync(fixture.payloadPath, 'utf8'));
  payload.surface_kind = 'unsupported_payload_manifest';
  writeJson(fixture.payloadPath, payload);

  assert.throws(
    () => validatePackageSourceProjection({
      frameworkRoot: fixture.frameworkRoot,
      spec: fixture.spec,
      ownerRepoPath: fixture.ownerRoot,
    }),
    (error: unknown) => (error as { code?: string }).code === 'payload_surface_invalid',
  );
});

test('package source projection gate accepts the annotated owner tag without a self-referential manifest commit', (t) => {
  const fixture = standardFixture(t);
  const ownerManifestPath = path.join(fixture.ownerRoot, 'contracts', 'owner-package.json');
  const ownerManifest = JSON.parse(fs.readFileSync(ownerManifestPath, 'utf8'));
  delete ownerManifest.codex_surface.carrier_source_commit;
  writeJson(ownerManifestPath, ownerManifest);

  const result = validatePackageSourceProjection({
    frameworkRoot: fixture.frameworkRoot,
    spec: fixture.spec,
    ownerRepoPath: fixture.ownerRoot,
  });
  assert.equal(result.status, 'validated');
  assert.equal(result.owner_source_commit, fixture.carrierCommit);
  assert.equal(result.owner_version_tag, `v${fixture.version}`);
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

test('package source projection gate verifies every capability Package ordered content lock bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-projection-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner');
  const frameworkRoot = path.join(root, 'framework');
  const repoUrl = 'https://github.com/example/opl-relay.git';
  const packageId = 'opl-relay';
  const version = '0.2.0';
  const sourceRoot = 'plugins/opl-relay';
  const paths = ['.codex-plugin/plugin.json', 'plugin.json', 'skills/example/SKILL.md'];
  writeJson(path.join(ownerRoot, sourceRoot, paths[0]), { id: packageId, version });
  writeJson(path.join(ownerRoot, sourceRoot, paths[1]), { name: packageId, version });
  fs.mkdirSync(path.dirname(path.join(ownerRoot, sourceRoot, paths[2])), { recursive: true });
  fs.writeFileSync(path.join(ownerRoot, sourceRoot, paths[2]), '# Skill\n');
  const contentLockDigest = () => {
    const lockHash = crypto.createHash('sha256');
    for (const declaredPath of paths) {
      const pathBytes = Buffer.from(declaredPath);
      const fileBytes = fs.readFileSync(path.join(ownerRoot, sourceRoot, declaredPath));
      const pathLength = Buffer.allocUnsafe(8);
      const fileLength = Buffer.allocUnsafe(8);
      pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
      fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
      lockHash.update(pathLength);
      lockHash.update(pathBytes);
      lockHash.update(fileLength);
      lockHash.update(fileBytes);
    }
    return `sha256:${lockHash.digest('hex')}`;
  };
  const canonicalization = 'ordered_path_length_file_length_bytes';
  const contentLock = {
    algorithm: 'sha256',
    canonicalization,
    paths,
    digest: contentLockDigest(),
  };
  const ownerPackageManifestRef = `${sourceRoot}/opl-package.json`;
  writeJson(path.join(ownerRoot, ownerPackageManifestRef), {
    package_id: packageId,
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
  const manifestPath = path.join(frameworkRoot, `contracts/opl-framework/packages/${packageId}.json`);
  const payloadRef = `payloads/${packageId}-${version}.json`;
  writeJson(manifestPath, {
    package_id: packageId,
    version,
    source_repo: repoUrl,
    content_lock: contentLock,
    codex_surface: {
      plugin_id: packageId,
      plugin_payload_manifest_url: payloadRef,
      carrier_source_commit: head,
    },
  });
  writeJson(path.join(path.dirname(manifestPath), payloadRef), {
    surface_kind: 'opl_package_payload_manifest.v2',
    schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
    package_id: packageId,
    plugin_id: packageId,
    package_version: version,
    source_repo: repoUrl,
    source_commit: head,
    source_root: sourceRoot,
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_length_file_length_bytes',
      digest: contentLock.digest,
    },
    files: paths.map((declaredPath) => ({
      path: declaredPath,
      mode: '100644',
      source_url: `https://raw.githubusercontent.com/example/opl-relay/${head}/${sourceRoot}/${declaredPath}`,
      sha256: digest(path.join(ownerRoot, sourceRoot, declaredPath)),
    })),
  });
  const spec = {
    package_id: packageId,
    repo_url: repoUrl,
    package_manifest_ref: `contracts/opl-framework/packages/${packageId}.json`,
    owner_package_manifest_ref: ownerPackageManifestRef,
    owner_plugin_manifest_ref: `${sourceRoot}/plugin.json`,
    owner_manifest_kind: 'capability_package',
  };
  assert.equal(validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot }).status, 'validated');
  const ownerManifestPath = path.join(ownerRoot, ownerPackageManifestRef);
  const ownerManifest = JSON.parse(fs.readFileSync(ownerManifestPath, 'utf8'));
  const projected = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const legacyLock = {
    ...contentLock,
    canonicalization: 'ordered_path_nul_file_bytes',
  } as Record<string, unknown>;
  ownerManifest.content_lock = legacyLock;
  projected.content_lock = legacyLock;
  writeJson(ownerManifestPath, ownerManifest);
  writeJson(manifestPath, projected);
  assert.throws(
    () => validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot }),
    (error: unknown) => (error as { code?: string }).code === 'content_lock_invalid',
  );
  ownerManifest.content_lock = contentLock;
  projected.content_lock = contentLock;
  writeJson(ownerManifestPath, ownerManifest);
  writeJson(manifestPath, projected);
  projected.content_lock.digest = `sha256:${'0'.repeat(64)}`;
  writeJson(manifestPath, projected);
  assert.throws(
    () => validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot }),
    (error: unknown) => (error as { code?: string }).code === 'content_lock_drift',
  );
});

test('package source projection gate binds one regular owner descriptor outside capability content-lock paths', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-descriptor-projection-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner');
  const frameworkRoot = path.join(root, 'framework');
  const packageId = 'mas-scholar-skills';
  const version = '0.2.23';
  const repoUrl = 'https://github.com/example/mas-scholar-skills.git';
  const lockPaths = ['.codex-plugin/plugin.json', 'skills/mas-scholar-skills/SKILL.md'];
  writeJson(path.join(ownerRoot, lockPaths[0]), { name: packageId, version });
  fs.mkdirSync(path.dirname(path.join(ownerRoot, lockPaths[1])), { recursive: true });
  fs.writeFileSync(path.join(ownerRoot, lockPaths[1]), '# Scholar Skills\n');
  const lockHash = crypto.createHash('sha256');
  for (const declaredPath of lockPaths) {
    const pathBytes = Buffer.from(declaredPath);
    const fileBytes = fs.readFileSync(path.join(ownerRoot, declaredPath));
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    lockHash.update(pathLength);
    lockHash.update(pathBytes);
    lockHash.update(fileLength);
    lockHash.update(fileBytes);
  }
  const contentLock = {
    algorithm: 'sha256',
    canonicalization: 'ordered_path_length_file_length_bytes',
    paths: lockPaths,
    digest: `sha256:${lockHash.digest('hex')}`,
  };
  const ownerPackageManifestRef = 'contracts/owner-package.json';
  const ownerPackageDescriptorRef = 'opl-package.json';
  const ownerPackage = { package_id: packageId, version, content_lock: contentLock };
  writeJson(path.join(ownerRoot, ownerPackageManifestRef), ownerPackage);
  writeJson(path.join(ownerRoot, ownerPackageDescriptorRef), ownerPackage);
  git(ownerRoot, ['init', '-q']);
  git(ownerRoot, ['config', 'user.name', 'OPL Test']);
  git(ownerRoot, ['config', 'user.email', 'test@example.com']);
  git(ownerRoot, ['add', '.']);
  git(ownerRoot, ['commit', '-qm', 'portable owner descriptor']);
  const head = git(ownerRoot, ['rev-parse', 'HEAD']);
  git(ownerRoot, ['tag', '-a', `v${version}`, '-m', `v${version}`]);

  const manifestPath = path.join(frameworkRoot, `contracts/opl-framework/packages/${packageId}.json`);
  const payloadRef = `payloads/${packageId}-${version}.json`;
  writeJson(manifestPath, {
    package_id: packageId,
    version,
    source_repo: repoUrl,
    content_lock: contentLock,
    owner_package_manifest_ref: ownerPackageManifestRef,
    owner_package_descriptor_ref: ownerPackageDescriptorRef,
    codex_surface: {
      plugin_id: packageId,
      plugin_payload_manifest_url: payloadRef,
      carrier_source_commit: head,
    },
  });
  const payloadPath = path.join(path.dirname(manifestPath), payloadRef);
  const payloadPaths = [lockPaths[0], ownerPackageDescriptorRef, lockPaths[1]];
  writeJson(payloadPath, {
    surface_kind: 'opl_package_payload_manifest.v2',
    schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
    package_id: packageId,
    plugin_id: packageId,
    package_version: version,
    source_repo: repoUrl,
    source_commit: head,
    source_root: '.',
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_length_file_length_bytes',
      digest: contentLock.digest,
    },
    files: payloadPaths.map((declaredPath) => ({
      path: declaredPath,
      mode: '100644',
      source_url: `https://raw.githubusercontent.com/example/mas-scholar-skills/${head}/${declaredPath}`,
      sha256: digest(path.join(ownerRoot, declaredPath)),
    })),
  });
  const spec = {
    package_id: packageId,
    repo_url: repoUrl,
    package_manifest_ref: `contracts/opl-framework/packages/${packageId}.json`,
    owner_package_manifest_ref: ownerPackageManifestRef,
    owner_plugin_manifest_ref: lockPaths[0],
    owner_manifest_kind: 'capability_package',
  };

  const result = validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot });
  assert.equal(result.status, 'validated');
  assert.equal(result.file_count, 3);

  const payload = JSON.parse(fs.readFileSync(
    payloadPath,
    'utf8',
  ));
  payload.files[1].mode = '100755';
  writeJson(payloadPath, payload);
  assert.throws(
    () => validatePackageSourceProjection({ frameworkRoot, spec, ownerRepoPath: ownerRoot }),
    (error: unknown) => (error as { code?: string }).code === 'payload_source_mode_mismatch',
  );
});
