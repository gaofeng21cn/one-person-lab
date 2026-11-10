import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { acquireGithubPreviewSource } from '../../src/adapters/integration/agent-package-registry-parts/configured-github-preview-source.ts';
import type { AgentPackageAccessDecision } from '../../src/adapters/integration/agent-package-registry-parts/package-access.ts';

const commit = '1'.repeat(40);
const token = 'fixture-private-token';
const raw = (relative: string) => `https://raw.githubusercontent.com/fixture/preview/${commit}/${relative}`;

function fixture(options: { status?: number; wrongOwner?: boolean; nested?: boolean } = {}) {
  const sourceRoot = options.nested ? 'plugins/fixture' : '.';
  const relative = (ref: string) => options.nested ? `${sourceRoot}/${ref}` : ref;
  const owner = {
    surface_kind: 'opl_capability_package_manifest.v2', package_id: 'fixture', version: '0.1.0',
    source_repo: 'https://github.com/fixture/preview.git',
    visibility: 'authorized_only', publication_channel_admission: 'development_only',
    credential_provider: 'github_packages', access_policy_ref: 'github-repository:fixture/preview',
    codex_surface: { plugin_id: 'fixture', carrier_source_commit: commit,
      configured_codex_plugin_carrier: { publication_ref: null, plugin_selector: 'fixture@fixture' } },
  };
  const content = new Map([
    [relative('opl-package.json'), JSON.stringify({ ...owner, ...(options.wrongOwner ? { package_id: 'foreign' } : {}) })],
    [relative('plugin.json'), JSON.stringify({ name: 'fixture', version: '0.1.0' })],
    [relative('skills/fixture/SKILL.md'), '# Preview fixture\n'],
    [relative('skills/fixture/医学.md'), '医学资料\n'],
  ]);
  const payload = {
    package_id: 'fixture', plugin_id: 'fixture', package_version: '0.1.0',
    source_repo: owner.source_repo, source_commit: commit, source_root: sourceRoot,
    files: [...content.keys()].map(ref => ({ path: options.nested ? ref.slice(sourceRoot.length + 1) : ref,
      source_url: raw(ref.split('/').map(encodeURIComponent).join('/')) })),
  };
  const access: AgentPackageAccessDecision = {
    visibility: 'authorized_only', status: 'authorized', provider_id: 'github_packages',
    credential_handle: 'env:OPL_GITHUB_PACKAGES_TOKEN', access_policy_ref: owner.access_policy_ref,
    source_ref: owner.source_repo, verified_at: null, expires_at: null, security_revision: null,
    reason: null, discover_allowed: true, download_allowed: true,
  };
  const calls: Array<{ args: string[]; stdin: string; destination: string }> = [];
  let authorizations = 0;
  const dependencies = {
    authorize: () => { authorizations += 1; return access; },
    credentialReader: (_env: NodeJS.ProcessEnv = {}, handle?: string | null) => {
      assert.equal(handle, access.credential_handle);
      return { provider_id: 'github_packages' as const, credential_handle: access.credential_handle!, username: 'fixture', token };
    },
    commandRunner: (args: string[], stdin: string) => {
      const destination = args[args.indexOf('--output') + 1];
      calls.push({ args, stdin, destination });
      const url = new URL(args.at(-1)!);
      assert.equal(url.hostname, 'api.github.com');
      assert.equal(url.searchParams.get('ref'), commit);
      const ref = decodeURIComponent(url.pathname.slice('/repos/fixture/preview/contents/'.length));
      const bytes = content.get(ref);
      if (options.status === undefined) {
        assert.ok(bytes !== undefined, `unexpected source file: ${ref}`);
        fs.writeFileSync(destination, bytes);
      }
      return { status: 0, stdout: Buffer.from(String(options.status ?? 200)),
        stderr: `provider diagnostics must stay private: ${token}`, error: null };
    },
  };
  const input = { packageId: 'fixture', ownerManifest: owner, payload, env: {} };
  return { input, dependencies, calls, content, authorizations: () => authorizations };
}

test('private preview files use only the authenticated API and keep credentials out of argv and provenance', () => {
  const f = fixture();
  const source = acquireGithubPreviewSource(f.input, f.dependencies);
  assert.ok(source);
  try {
    assert.equal(source.pathFor(new URL(raw('skills/fixture/SKILL.md'))).toString('utf8'), '# Preview fixture\n');
    assert.equal(source.pathFor(new URL(raw('skills/fixture/%E5%8C%BB%E5%AD%A6.md'))).toString('utf8'), '医学资料\n');
    assert.equal(f.authorizations(), 1);
    assert.equal(f.calls.length, f.content.size);
    assert.ok(!JSON.stringify(source.provenance).includes(token));
    for (const call of f.calls) {
      assert.ok(!JSON.stringify(call.args).includes(token));
      assert.match(call.stdin, /Authorization: Bearer fixture-private-token/);
      assert.ok(call.args.includes('--config'));
      assert.ok(!call.args.some(arg => ['--location', '--location-trusted', '-L'].includes(arg)));
    }
  } finally { source.cleanup(); }
  assert.equal(fs.existsSync(source.sourceRoot), false);
});

test('nested plugin payloads use repository source paths independently of installation paths', () => {
  const f = fixture({ nested: true });
  const source = acquireGithubPreviewSource(f.input, f.dependencies);
  assert.ok(source);
  try {
    assert.equal(source.pathFor(new URL(raw('plugins/fixture/skills/fixture/SKILL.md'))).toString('utf8'), '# Preview fixture\n');
    assert.ok(f.calls.every(call => call.args.at(-1)!.includes('/contents/plugins/fixture/')));
  } finally { source.cleanup(); }
});

test('non-private or non-preview packages do not enter this transport', () => {
  for (const mutation of [{ visibility: 'public' }, { publication_channel_admission: 'admitted' }]) {
    const f = fixture();
    Object.assign(f.input.ownerManifest, mutation);
    assert.equal(acquireGithubPreviewSource(f.input, f.dependencies), null);
    assert.equal(f.authorizations(), 0);
    assert.equal(f.calls.length, 0);
  }
});

test('wrong repository or source commit is rejected before authorization or network access', () => {
  for (const mutation of [
    { source_repo: 'https://github.com/other/preview.git' },
    { source_commit: '2'.repeat(40) },
  ]) {
    const f = fixture();
    Object.assign(f.input.payload, mutation);
    assert.throws(() => acquireGithubPreviewSource(f.input, f.dependencies), /selected Package owner and source/);
    assert.equal(f.authorizations(), 0);
    assert.equal(f.calls.length, 0);
  }
});

test('untrusted, mutable, and escaping raw file references never trigger downloads', () => {
  for (const url of [
    raw('plugin.json').replace('/fixture/preview/', '/other/preview/'),
    raw('plugin.json').replace(commit, 'main'),
    raw('plugin.json').replace('raw.githubusercontent.com', 'example.com'),
    raw('skills/%2e%2e%2foutside'),
    `${raw('plugin.json')}?token=ignored`,
  ]) {
    const f = fixture();
    f.input.payload.files[0].source_url = url;
    assert.throws(() => acquireGithubPreviewSource(f.input, f.dependencies));
    assert.equal(f.calls.length, 0);
  }
});

test('redirects and denied downloads fail without anonymous retry, credentials in errors, or leftover files', () => {
  for (const status of [302, 403, 404]) {
    const f = fixture({ status });
    assert.throws(() => acquireGithubPreviewSource(f.input, f.dependencies), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /could not be downloaded/);
      assert.ok(!JSON.stringify(error).includes(token));
      return true;
    });
    assert.equal(f.calls.length, 1);
    assert.equal(fs.existsSync(path.dirname(f.calls[0].destination)), false);
  }
});

test('the downloaded owner identity is checked before fetching the rest of the payload', () => {
  const f = fixture({ wrongOwner: true });
  assert.throws(() => acquireGithubPreviewSource(f.input, f.dependencies), /selected Package owner/);
  assert.equal(f.calls.length, 1);
  assert.equal(fs.existsSync(path.dirname(f.calls[0].destination)), false);
});

test('pathFor rejects foreign, missing, or symlinked physical files after acquisition', () => {
  const f = fixture();
  const source = acquireGithubPreviewSource(f.input, f.dependencies);
  assert.ok(source);
  try {
    assert.throws(() => source.pathFor(new URL(raw('plugin.json').replace(commit, '2'.repeat(40)))));
    assert.throws(() => source.pathFor(new URL(raw('not-in-payload'))));
    const file = path.join(source.sourceRoot, 'plugin.json');
    fs.unlinkSync(file);
    fs.symlinkSync('/etc/hosts', file);
    assert.throws(() => source.pathFor(new URL(raw('plugin.json'))), /does not contain/);
  } finally { source.cleanup(); }
});
