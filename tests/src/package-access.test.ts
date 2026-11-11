import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePackageAccessFields, resolvePackageAccessDecision } from '../../src/adapters/integration/agent-package-registry-parts/package-access.ts';

const manifest = (patch: Record<string, unknown> = {}) => ({
  package_id: 'occ',
  visibility: 'authorized_only' as const,
  access_policy_ref: 'github-package:gaofeng21cn/one-person-lab-packages/occ',
  credential_provider: 'github_packages',
  source_repo: 'https://github.com/gaofeng21cn/opl-capital-compass.git',
  codex_surface: {
    configured_codex_plugin_carrier: {
      publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/occ:latest-stable',
    },
  },
  ...patch,
});

test('public packages remain discoverable without a source credential', () => {
  const access = resolvePackageAccessDecision({ ...manifest(), visibility: 'public', access_policy_ref: null, credential_provider: null }, {});
  assert.equal(access.status, 'public');
  assert.equal(access.discover_allowed, true);
  assert.equal(access.download_allowed, true);
});

test('authorized packages fail closed when no credential is configured', () => {
  const access = resolvePackageAccessDecision(manifest(), {});
  assert.equal(access.status, 'signed_out');
  assert.equal(access.discover_allowed, false);
  assert.equal(access.download_allowed, false);
});

test('authorized packages use the verified provider result', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-access-test-'));
  try {
    const access = resolvePackageAccessDecision(manifest(), { OPL_STATE_DIR: stateDir }, {
      credentialHandle: 'provider:github_packages:ghcr',
      verify: () => ({
      package_id: 'occ', publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/occ:latest-stable',
      provider_id: 'github_packages', credential_handle: 'provider:github_packages:ghcr',
      access_policy_ref: 'github-package:gaofeng21cn/one-person-lab-packages/occ', source_ref: manifest().source_repo,
      verified_at: '2026-11-10T00:00:00.000Z', expires_at: null, security_revision: 'sha256:' + 'a'.repeat(64),
      reason: null, discover_allowed: true, download_allowed: true, status: 'authorized', registry_digest: 'sha256:' + 'a'.repeat(64),
      }),
    });
    assert.equal(access.status, 'authorized');
    assert.equal(access.download_allowed, true);
    assert.equal(access.security_revision, 'sha256:' + 'a'.repeat(64));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('private access contract requires policy and provider fields', () => {
  assert.throws(() => normalizePackageAccessFields({ visibility: 'authorized_only' }, 'occ'), /access_policy_ref/);
  assert.deepEqual(normalizePackageAccessFields({}, 'public'), { visibility: 'public', access_policy_ref: null, credential_provider: null });
});


test('access policy is bound to the declared registry Package and provider', () => {
  let calls = 0;
  const verify = () => { calls++; throw new Error('must not verify mismatched binding'); };
  assert.equal(resolvePackageAccessDecision(manifest({ access_policy_ref: 'github-package:another/occ' }), {}, { verify }).reason, 'package_access_policy_binding_mismatch');
  assert.equal(resolvePackageAccessDecision(manifest({ credential_provider: 'other' }), {}, { verify }).download_allowed, false);
  assert.equal(calls, 0);
});

test('connected source check supports local fast discovery and disconnect invalidates it without fallback', (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-access-cache-'));
  t.after(() => fs.rmSync(state, { recursive: true, force: true }));
  const env = { OPL_STATE_DIR: state, OPL_GITHUB_PACKAGES_TOKEN: 'unused-machine-secret' };
  const source = { source_id: 'github-packages:gaofeng21cn', enabled: true,
    credential_handle: 'provider:github_packages:gh-cli', status: 'authorized',
    verified_at: '2026-11-10T00:00:00.000Z', verification_reason: null, revision: 'one' };
  const writeSource = () => fs.writeFileSync(path.join(state, 'software-sources.json'), JSON.stringify({ surface_kind: 'opl_software_sources_store.v1', sources: [source] }));
  writeSource();
  let calls = 0;
  const now = () => new Date('2026-11-10T00:00:00.000Z');
  const verify = (input: import('../../src/adapters/integration/agent-package-registry-parts/package-registry-access-provider.ts').PackageRegistryAccessProviderInput) => {
    calls++;
    assert.equal(input.credentialHandle, 'provider:github_packages:gh-cli');
    return { package_id: 'occ', publication_ref: String(input.publicationRef), provider_id: 'github_packages',
      credential_handle: input.credentialHandle!, access_policy_ref: input.accessPolicyRef, source_ref: input.sourceRef ?? null,
      verified_at: now().toISOString(), expires_at: '2026-11-10T00:05:00.000Z',
      security_revision: 'sha256:' + 'a'.repeat(64), registry_digest: 'sha256:' + 'a'.repeat(64),
      reason: null, discover_allowed: true, download_allowed: true, status: 'authorized' as const };
  };
  const live = resolvePackageAccessDecision(manifest(), env, { verify, now });
  assert.equal(live.status, 'authorized');
  const cached = resolvePackageAccessDecision(manifest(), env, { verification: 'cached', verify, now });
  assert.equal(cached.status, 'authorized');
  assert.equal(calls, 1);
  assert.equal(resolvePackageAccessDecision(manifest(), env, { verification: 'cached', now: () => new Date('2026-11-10T01:00:00.000Z') }).status, 'unknown');
  source.revision = 'two'; source.credential_handle = null as unknown as string; source.status = 'signed_out';
  writeSource();
  const disconnected = resolvePackageAccessDecision(manifest(), env, { verification: 'cached', verify, now });
  assert.equal(disconnected.status, 'signed_out');
  assert.equal(disconnected.discover_allowed, false);
  assert.equal(calls, 1);
});


test('repository permission cannot authorize an unpublished private Package download', () => {
  let checked = false;
  const decision = resolvePackageAccessDecision(manifest({
    publication_channel_admission: 'development_only',
    access_policy_ref: 'github-repository:gaofeng21cn/opl-capital-compass',
    source_commit: 'a'.repeat(40),
    codex_surface: { configured_codex_plugin_carrier: { publication_ref: null } },
  }), {}, { credentialHandle: 'provider:github_packages:gh-cli', verify: () => { checked = true; throw new Error('unexpected registry check'); } });
  assert.equal(checked, false);
  assert.equal(decision.download_allowed, false);
  assert.equal(decision.discover_allowed, false);
  assert.equal(decision.reason, 'package_access_contract_incomplete_or_provider_unsupported');
});
