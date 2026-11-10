import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ensurePrivatePackageRegistry } from '../../../../../scripts/private-package-registry-bootstrap.mjs';

const ownerRepo = 'example/private-owner';
const image = 'ghcr.io/example/one-person-lab-private-packages/private-agent';
const privateMetadata = { visibility: 'private', repository: { full_name: ownerRepo, private: true } };
const ok = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });
const missing = { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
const denied = { status: 1, stdout: '', stderr: 'unauthorized: authentication required' };

function fixture(options: {
  publisher?: string; ownerPrivate?: boolean; metadata?: any[]; anonymous?: any; push?: any;
} = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  let packageReads = 0;
  const markerBytes: string[] = [];
  const state = options.metadata ?? [privateMetadata, privateMetadata];
  const run = (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === 'gh') {
      if (args.at(-1) === `/repos/${ownerRepo}`) return ok({ full_name: ownerRepo, private: options.ownerPrivate ?? true });
      const metadata = state[Math.min(packageReads++, state.length - 1)];
      return metadata === null ? missing : ok(metadata);
    }
    if (args[0] === 'push') {
      const layer = args.at(-1)!;
      markerBytes.push(fs.readFileSync(layer.slice(0, layer.indexOf(':application/')), 'utf8'));
      return options.push ?? ok({ digest: `sha256:${'1'.repeat(64)}` });
    }
    assert.equal(args.slice(0, 2).join(' '), 'repo tags');
    const config = args[args.indexOf('--registry-config') + 1]!;
    assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), { auths: {} });
    return options.anonymous ?? denied;
  };
  return {
    calls, markerBytes,
    execute: () => ensurePrivatePackageRegistry({ ownerRepo, image }, {
      env: { GITHUB_REPOSITORY: options.publisher ?? ownerRepo, GH_TOKEN: 'fixture-private-secret' }, run,
    }),
  };
}

test('private publisher rejects public or unrelated callers before any registry write', () => {
  for (const options of [{ publisher: 'example/public-framework' }, { ownerPrivate: false }]) {
    const f = fixture(options);
    assert.throws(f.execute, /private.*repository/);
    assert.equal(f.calls.filter((c) => c.command === 'oras').length, 0);
  }
});

test('new private namespace receives only a fixed harmless marker before private metadata and anonymous denial', () => {
  const f = fixture({ metadata: [null, privateMetadata, privateMetadata] });
  assert.deepEqual(f.execute(), { status: 'private_registry_verified', bootstrapped: true, anonymous_access: 'denied_verified' });
  assert.equal(f.markerBytes.length, 1);
  assert.deepEqual(JSON.parse(f.markerBytes[0]!), { schema_version: 1, purpose: 'Private registry access check; no Package content' });
  const push = f.calls.find((c) => c.args[0] === 'push')!;
  assert.ok(push.args.includes(`${image}:opl-access-bootstrap`));
  assert.ok(push.args.includes(`org.opencontainers.image.source=https://github.com/${ownerRepo}`));
  assert.equal(push.args.filter((a) => a.includes(':application/')).length, 1);
  assert.equal(fs.existsSync(path.dirname(push.args.at(-1)!.split(':application/')[0]!)), false, 'temporary marker is removed');
});

test('public bootstrap result never authorizes sensitive publication and is not retried', () => {
  const f = fixture({ metadata: [null, { ...privateMetadata, visibility: 'public' }] });
  assert.throws(f.execute, /private visibility/);
  assert.equal(f.calls.filter((c) => c.args[0] === 'push').length, 1);
  assert.equal(f.calls.filter((c) => c.args[0] === 'repo').length, 0);
});

test('existing public, internal, wrong-owner or publicly owned registry fails without writes', () => {
  const values = [
    { ...privateMetadata, visibility: 'public' },
    { ...privateMetadata, visibility: 'internal' },
    { ...privateMetadata, repository: { full_name: 'example/other', private: true } },
    { ...privateMetadata, repository: { full_name: ownerRepo, private: false } },
  ];
  for (const metadata of values) {
    const f = fixture({ metadata: [metadata] });
    assert.throws(f.execute, /private visibility/);
    assert.equal(f.calls.filter((c) => c.command === 'oras').length, 0);
  }
});

test('anonymous success, ambiguous network failure or changed metadata blocks the source-upload gate', () => {
  for (const anonymous of [ok(['0.2.0']), { status: 1, stdout: '', stderr: 'network timed out' }]) {
    assert.throws(fixture({ anonymous }).execute, /anonymous.*not denied/);
  }
  assert.throws(fixture({ metadata: [privateMetadata, { ...privateMetadata, visibility: 'public' }] }).execute, /private visibility/);
});

test('unknown bootstrap write is reconciled once and requires private metadata', () => {
  const f = fixture({ metadata: [null, privateMetadata, privateMetadata], push: { status: 1, stdout: '', stderr: 'timed out' } });
  assert.equal(f.execute().status, 'private_registry_verified');
  assert.equal(f.calls.filter((c) => c.args[0] === 'push').length, 1);
  const missingAfterWrite = fixture({ metadata: [null, null] });
  assert.throws(missingAfterWrite.execute, /private visibility/);
  assert.equal(missingAfterWrite.calls.filter((c) => c.args[0] === 'push').length, 1);
});
