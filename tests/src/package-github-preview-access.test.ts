import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { githubPreviewSourceIdentity } from '../../src/adapters/integration/agent-package-registry-parts/package-github-preview-contract.ts';
import { verifyGithubRepositoryAccess } from '../../src/adapters/integration/agent-package-registry-parts/package-github-access-provider.ts';
import { packageAccessSubject, resolvePackageAccessDecision } from '../../src/adapters/integration/agent-package-registry-parts/package-access.ts';

const commit = 'a'.repeat(40);
const handle = 'provider:github_packages:gh-cli';
const source = {
  package_id: 'fixture', visibility: 'authorized_only', publication_channel_admission: 'development_only',
  source_repo: 'https://github.com/owner/private-app.git', access_policy_ref: 'github-repository:owner/private-app',
  credential_provider: 'github_packages', source_commit: commit,
  codex_surface: { configured_codex_plugin_carrier: { publication_ref: null } },
};
const input = { packageId: 'fixture', sourceRef: source.source_repo, sourceCommit: commit,
  accessPolicyRef: source.access_policy_ref, credentialHandle: handle };
const credentialReader = () => ({ provider_id: 'github_packages' as const, credential_handle: handle,
  username: 'x-access-token', token: 'fixture-secret' });
const now = () => new Date('2026-11-10T00:00:00.000Z');
function response(status: number, body: unknown) {
  return { status, stdout: Buffer.from(JSON.stringify(body)), stderr: '', error: null };
}

test('private repository preview requires explicit admission, policy, provider and immutable commit', () => {
  assert.deepEqual(githubPreviewSourceIdentity(packageAccessSubject(source)), {
    repository: 'owner/private-app', sourceRepo: source.source_repo, sourceCommit: commit,
  });
  for (const patch of [
    { visibility: 'public' }, { publication_channel_admission: 'admitted' },
    { access_policy_ref: 'github-repository:other/private-app' }, { source_commit: 'main' },
    { source_repo: 'https://github.com.evil.test/owner/private-app' },
    { source_repo: 'https://token@github.com/owner/private-app' },
    { codex_surface: { configured_codex_plugin_carrier: { publication_ref: 'ghcr.io/owner/package:latest' } } },
  ]) assert.equal(githubPreviewSourceIdentity(packageAccessSubject({ ...source, ...patch })), null);
});

test('repository access verifies exact repository and commit without exposing or forwarding credentials', () => {
  const calls: string[][] = [];
  const result = verifyGithubRepositoryAccess({ ...input, now, credentialReader,
    commandRunner(args, content) {
      calls.push(args);
      assert.ok(content.includes(Buffer.from('x-access-token:fixture-secret').toString('base64')));
      assert.ok(!args.join(' ').includes('fixture-secret'));
      assert.ok(!args.includes('--location'));
      assert.equal(new URL(args.at(-1)!).hostname, 'api.github.com');
      return response(200, calls.length === 1
        ? { id: 123, full_name: 'owner/private-app', permissions: { pull: true } } : { sha: commit });
    },
  });
  assert.equal(result.status, 'authorized');
  assert.equal(result.registry_digest, null);
  assert.match(result.security_revision ?? '', /^sha256:[0-9a-f]{64}$/);
  assert.equal(calls[1].at(-1), `https://api.github.com/repos/owner/private-app/commits/${commit}`);
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
});

test('access rejects missing handles, unsupported providers and substituted credentials before network', () => {
  for (const credentialHandle of [null, 'provider:foreign:token']) {
    const result = verifyGithubRepositoryAccess({ ...input, credentialHandle,
      credentialReader() { throw new Error('unexpected credential read'); },
      commandRunner() { throw new Error('unexpected network'); },
    });
    assert.equal(result.status, 'signed_out');
  }
  assert.equal(verifyGithubRepositoryAccess({ ...input,
    credentialReader: () => ({ ...credentialReader(), credential_handle: 'different' }),
    commandRunner() { throw new Error('unexpected network'); },
  }).download_allowed, false);
});

test('permission denial, redirects and wrong identities cannot authorize a preview download', () => {
  for (const status of [301, 302, 401, 403, 404, 500]) {
    let calls = 0;
    const result = verifyGithubRepositoryAccess({ ...input, credentialReader,
      commandRunner() { calls++; return response(status, { message: 'denied' }); },
    });
    assert.equal(result.download_allowed, false);
    assert.equal(calls, 1);
  }
  for (const wrong of ['repo', 'sha', 'pull']) {
    let calls = 0;
    const result = verifyGithubRepositoryAccess({ ...input, credentialReader,
      commandRunner() { return response(200, ++calls === 1
        ? { id: 123, full_name: wrong === 'repo' ? 'other/repo' : 'owner/private-app', permissions: { pull: wrong !== 'pull' } }
        : { sha: wrong === 'sha' ? 'b'.repeat(40) : commit }); },
    });
    assert.equal(result.download_allowed, false);
  }
});

test('repository source cache binds exact commit and credential source revision without claiming an OCI digest', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-github-preview-access-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { OPL_STATE_DIR: root };
  let calls = 0;
  const subject = packageAccessSubject(source);
  const verifyRepository = () => {
    calls++;
    return verifyGithubRepositoryAccess({ ...input, now, credentialReader,
      commandRunner(args) { return response(200, args.at(-1)!.includes('/commits/')
        ? { sha: commit } : { id: 123, full_name: 'owner/private-app' }); },
    });
  };
  const options = { credentialHandle: handle, now, verifyRepository };
  const live = resolvePackageAccessDecision(subject, env, options);
  assert.equal(live.status, 'authorized');
  assert.equal(live.source_id, 'github-packages:owner');
  assert.equal(live.registry_digest, null);
  assert.equal(resolvePackageAccessDecision(subject, env, { ...options, verification: 'cached' }).status, 'authorized');
  assert.equal(calls, 1);
  assert.equal(resolvePackageAccessDecision({ ...subject, source_commit: 'b'.repeat(40) }, env,
    { ...options, verification: 'cached' }).status, 'unknown');
  assert.equal(resolvePackageAccessDecision(subject, env, { ...options, credentialHandle: null, verification: 'cached' }).status, 'signed_out');
  assert.equal(resolvePackageAccessDecision(subject, env, { ...options, disabled: true }).status, 'revoked');
  assert.equal(calls, 1);
});
