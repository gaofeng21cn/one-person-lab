import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { spawnSync } from 'node:child_process';
import { verifyPrivatePackagePublication } from '../../src/adapters/integration/agent-package-registry-parts/private-package-publication.ts';

const subject = `ghcr.io/example/one-person-lab-packages/private-agent@sha256:${'a'.repeat(64)}`;
const base = {
  subject, packageId: 'private-agent', version: '1.0.0', sourceRepo: 'https://github.com/example/private-agent.git',
  sourceCommit: 'b'.repeat(40), accessPolicyRef: 'github-package:example/one-person-lab-packages/private-agent',
  credential: { provider_id: 'github_packages' as const, credential_handle: 'provider:github_packages:gh-cli', username: 'user', token: 'secret-test-token' },
};

test('private publication requires a Host-pinned key before invoking tools', () => {
  assert.throws(() => verifyPrivatePackagePublication({ ...base, env: {}, run: (() => { throw new Error('must not run'); }) as typeof spawnSync }),
    (error: unknown) => typeof error === 'object' && error !== null && 'details' in error && (error.details as Record<string, unknown>).reason === 'trusted_signing_key_required');
});

test('private publication forwards credentials only through a protected temporary config and removes it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-publication-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = path.join(root, 'trusted.pub');
  fs.writeFileSync(key, 'trusted-test-key');
  let observedConfig = '';
  const run = ((_binary: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    assert.equal(JSON.stringify(args).includes(base.credential.token), false);
    assert.ok(args.includes(key));
    observedConfig = options.env.DOCKER_CONFIG!;
    assert.equal(fs.statSync(observedConfig).mode & 0o777, 0o700);
    const file = path.join(observedConfig, 'config.json');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(Buffer.from(config.auths['ghcr.io'].auth, 'base64').toString(), 'user:secret-test-token');
    return { status: 0, stdout: JSON.stringify({ status: 'verified', subject }) };
  }) as unknown as typeof spawnSync;
  const result = verifyPrivatePackagePublication({ ...base, env: { OPL_PACKAGE_SIGNING_PUBLIC_KEY: key }, run });
  assert.equal(result.subject, subject);
  assert.equal(fs.existsSync(observedConfig), false);
});

test('private publication rejects wrong-subject verifier output and never exposes stderr', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-publication-reject-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = path.join(root, 'trusted.pub'); fs.writeFileSync(key, 'trusted-test-key');
  const run = (() => ({ status: 0, stdout: JSON.stringify({ status: 'verified', subject: 'other' }), stderr: base.credential.token })) as unknown as typeof spawnSync;
  assert.throws(() => verifyPrivatePackagePublication({ ...base, env: { OPL_PACKAGE_SIGNING_PUBLIC_KEY: key }, run }), (error: unknown) => {
    assert.equal(String(error).includes(base.credential.token), false);
    return true;
  });
});
