import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { assert, execFileSync, fs, os, parseJsonText, path, repoRoot, test } from './helpers.ts';

const remoteDigest = `sha256:${'d'.repeat(64)}`;

function sha256(content: Buffer) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oci-preflight-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const layerPath = path.join(root, 'package.tar.gz');
  fs.writeFileSync(layerPath, 'package-bytes\n');
  const layer = {
    mediaType: 'application/vnd.onepersonlab.package.source.v1+gzip',
    digest: sha256(fs.readFileSync(layerPath)),
    size: fs.statSync(layerPath).size,
  };
  const manifest = {
    schemaVersion: 2,
    artifactType: 'application/vnd.onepersonlab.package.v1',
    annotations: {
      'org.opencontainers.image.source': 'https://github.com/example/one-person-lab',
    },
    layers: [layer],
  };
  const orasPath = path.join(bin, 'oras');
  fs.writeFileSync(orasPath, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_ORAS_LOG, JSON.stringify(args) + '\\n');
if (process.env.FAKE_ORAS_MODE === 'missing') {
  console.error('manifest unknown');
  process.exit(1);
}
if (args.includes('--descriptor')) {
  process.stdout.write(process.env.FAKE_ORAS_DESCRIPTOR);
} else {
  process.stdout.write(process.env.FAKE_ORAS_MANIFEST);
}
`, 'utf8');
  fs.chmodSync(orasPath, 0o755);
  return {
    root,
    layerPath,
    manifest,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_ORAS_LOG: path.join(root, 'oras.log'),
      FAKE_ORAS_MANIFEST: JSON.stringify(manifest),
      FAKE_ORAS_DESCRIPTOR: JSON.stringify({ digest: remoteDigest }),
    },
  };
}

function args(layerPath: string) {
  return [
    path.join(repoRoot, 'scripts/oci-publication-preflight.mjs'),
    '--ref', 'ghcr.io/example/one-person-lab-packages/mas:0.1.0',
    '--artifact-type', 'application/vnd.onepersonlab.package.v1',
    '--source-url', 'https://github.com/example/one-person-lab',
    '--layer', `${layerPath}=application/vnd.onepersonlab.package.source.v1+gzip`,
  ];
}

test('OCI publication preflight publishes only absent immutable tags', () => {
  const value = fixture();
  const output = parseJsonText(execFileSync(process.execPath, args(value.layerPath), {
    encoding: 'utf8',
    env: { ...value.env, FAKE_ORAS_MODE: 'missing' },
  })) as Record<string, unknown>;
  assert.equal(output.status, 'absent_publish_required');
  assert.equal(output.action, 'publish');
  assert.equal(output.digest, null);
});

test('OCI publication preflight reuses an identical immutable remote artifact', () => {
  const value = fixture();
  const output = parseJsonText(execFileSync(process.execPath, args(value.layerPath), {
    encoding: 'utf8',
    env: value.env,
  })) as Record<string, unknown>;
  assert.equal(output.status, 'existing_identical_reuse');
  assert.equal(output.action, 'reuse');
  assert.equal(output.digest, remoteDigest);
});

test('OCI publication preflight rejects same-tag content mutation', () => {
  const value = fixture();
  const changed = { ...value.manifest, layers: [{ ...value.manifest.layers[0], digest: `sha256:${'a'.repeat(64)}` }] };
  assert.throws(() => execFileSync(process.execPath, args(value.layerPath), {
    encoding: 'utf8',
    env: { ...value.env, FAKE_ORAS_MANIFEST: JSON.stringify(changed) },
  }), /Immutable OCI tag mutation rejected/);
});

test('OCI publication readback verifies exact digest with an anonymous registry config', () => {
  const value = fixture();
  const output = parseJsonText(execFileSync(process.execPath, [
    ...args(value.layerPath),
    '--verify-only',
    '--expected-digest', remoteDigest,
    '--anonymous',
  ], { encoding: 'utf8', env: value.env })) as Record<string, unknown>;
  assert.equal(output.status, 'verified');
  assert.equal(output.anonymous_pull_verified, true);
  assert.match(fs.readFileSync(value.env.FAKE_ORAS_LOG, 'utf8'), /--registry-config/);
  assert.throws(() => execFileSync(process.execPath, [
    ...args(value.layerPath),
    '--verify-only',
    '--expected-digest', `sha256:${'e'.repeat(64)}`,
    '--anonymous',
  ], { encoding: 'utf8', env: value.env }), /OCI digest readback mismatch/);
});

test('complete publication-set preflight reports every conflict before any push', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-publication-set-preflight-'));
  const packageRoot = path.join(root, 'packages', 'mas');
  const frameworkRoot = path.join(root, 'framework');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.mkdirSync(frameworkRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'mas-0.2.1.tar.gz'), 'mas archive\n');
  fs.writeFileSync(path.join(packageRoot, 'package-manifest.json'), '{}\n');
  fs.writeFileSync(path.join(packageRoot, 'payload-manifest.json'), '{}\n');
  fs.writeFileSync(path.join(frameworkRoot, 'one-person-lab-framework-0.1.0.tar.gz'), 'base archive\n');
  fs.writeFileSync(path.join(root, 'opl-release-manifest.json'), `${JSON.stringify({
    release_set_generation: '26.7.13-r5',
    release_set: {
      owner_cohort_lock: { ref: 'owner-cohort-lock.json', digest: `sha256:${'1'.repeat(64)}` },
      components: {
        packages: {
          members: {
            mas: {
              package_version: '0.2.1',
              owner_source_commit: '2'.repeat(40),
              artifact_ref: 'ghcr.io/example/one-person-lab-packages/mas:0.2.1',
            },
          },
        },
        base: {
          version: '0.1.0',
          source_commit: '3'.repeat(40),
          artifact_ref: 'ghcr.io/example/one-person-lab-framework:0.1.0',
        },
        app: {
          version: '26.7.13',
          source_commit: '4'.repeat(40),
          artifact_digest: `sha256:${'5'.repeat(64)}`,
        },
      },
    },
  }, null, 2)}\n`);
  const fakePreflight = path.join(root, 'fake-preflight.mjs');
  fs.writeFileSync(fakePreflight, `
const ref = process.argv[process.argv.indexOf('--ref') + 1];
if (ref.includes('/mas:')) {
  console.error('mas immutable conflict');
  process.exit(1);
}
console.log(JSON.stringify({ status: 'absent_publish_required', action: 'publish', digest: null }));
`);
  const reportPath = path.join(root, 'report.json');
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/preflight-package-publication-set.mjs'),
    '--root', root,
    '--owner', 'example',
    '--source-url', 'https://github.com/example/one-person-lab',
    '--harness-sha', '6'.repeat(40),
    '--report', reportPath,
    '--preflight-script', fakePreflight,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = parseJsonText(fs.readFileSync(reportPath, 'utf8')) as Record<string, any>;
  assert.equal(report.status, 'failed');
  assert.equal(report.summary.component_count, 2);
  assert.equal(report.summary.conflict_count, 1);
  assert.equal(report.summary.publish_count, 1);
  assert.deepEqual(
    report.components.map((entry: Record<string, unknown>) => entry.component_id),
    ['mas', 'opl-base'],
  );
  assert.match(report.components[0].error, /mas immutable conflict/);
  assert.equal(report.components[1].action, 'publish');

  const wrongOwnerManifest = parseJsonText(fs.readFileSync(
    path.join(root, 'opl-release-manifest.json'),
    'utf8',
  )) as Record<string, any>;
  wrongOwnerManifest.release_set.components.packages.members.mas.artifact_ref =
    'ghcr.io/not-example/one-person-lab-packages/mas:0.2.1';
  fs.writeFileSync(
    path.join(root, 'opl-release-manifest.json'),
    `${JSON.stringify(wrongOwnerManifest, null, 2)}\n`,
  );
  const wrongOwner = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/preflight-package-publication-set.mjs'),
    '--root', root,
    '--owner', 'example',
    '--source-url', 'https://github.com/example/one-person-lab',
    '--harness-sha', '6'.repeat(40),
    '--preflight-script', fakePreflight,
  ], { encoding: 'utf8' });
  assert.equal(wrongOwner.status, 1);
  assert.match(wrongOwner.stderr, /mas\.artifact_ref must belong to ghcr\.io\/example\//);
});
