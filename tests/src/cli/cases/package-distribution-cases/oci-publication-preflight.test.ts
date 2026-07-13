import crypto from 'node:crypto';

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
