import crypto from 'node:crypto';

import {
  assert,
  fs,
  os,
  path,
  test,
} from './helpers.ts';
import {
  materializePhysicalCodexSurface,
  resolveManifestPhysicalSource,
} from '../../../../../src/modules/connect/agent-package-registry-parts/physical-surface.ts';
import {
  admitPackagePayloadManifest,
} from '../../../../../src/modules/connect/agent-package-registry-parts/payload-manifest.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from '../../../../../src/modules/connect/agent-package-registry-parts/payload-content-lock.ts';
import type {
  AgentPackageManifest,
} from '../../../../../src/modules/connect/agent-package-registry-parts/types.ts';

const packageId = 'example-agent';
const pluginId = 'example-plugin';
const packageVersion = '0.3.1';
const sourceRepo = 'https://github.com/example/example-agent.git';
const sourceCommit = 'a'.repeat(40);

function sourceUrl(relativePath: string) {
  return `https://raw.githubusercontent.com/example/example-agent/${sourceCommit}/${relativePath}`;
}

function canonicalFixture() {
  const plugin = Buffer.from(`${JSON.stringify({ name: pluginId, version: packageVersion })}\n`);
  const skill = Buffer.from('#!/bin/sh\necho example\n');
  const files = [
    { path: '.codex-plugin/plugin.json', content: plugin, mode: '100644' as const },
    { path: `skills/${pluginId}/SKILL.md`, content: skill, mode: '100755' as const },
  ];
  const payload = {
    surface_kind: 'opl_package_payload_manifest.v2',
    schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
    package_id: packageId,
    plugin_id: pluginId,
    package_version: packageVersion,
    source_repo: sourceRepo,
    source_commit: sourceCommit,
    source_root: '.',
    content_lock: {
      algorithm: 'sha256',
      canonicalization: CANONICAL_PACKAGE_CONTENT_LOCK,
      digest: packageContentLockDigest(CANONICAL_PACKAGE_CONTENT_LOCK, files),
    },
    files: files.map((file) => ({
      path: file.path,
      mode: file.mode,
      source_url: sourceUrl(file.path),
      sha256: `sha256:${crypto.createHash('sha256').update(file.content).digest('hex')}`,
    })),
  };
  const manifest: AgentPackageManifest = {
    package_id: packageId,
    agent_id: packageId,
    display_name: 'Example Agent',
    publisher: 'example',
    version: packageVersion,
    owner_language_version: null,
    source: 'first_party',
    source_repo: sourceRepo,
    source_commit: sourceCommit,
    codex_surface: {},
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    distribution_payload: null,
    update_channel: 'manifest_url',
    rollback_ref: 'rollback-ref:example-agent',
    codex_visible_entry: pluginId,
    required_skill_ids: [pluginId],
    optional_skill_refs: [],
    plugin_id: pluginId,
    plugin_source_path: null,
    plugin_payload_manifest_url: null,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: null,
    managed_policy_surface: null,
    runtime_source_carrier: null,
    managed_update_source: null,
    capability_dependencies: [],
    capability_provider: null,
    content_digest: null,
    content_lock_canonicalization: null,
    content_lock_paths: [],
  };
  return { files, manifest, payload };
}

test('Connect admits only strict canonical first-party payload identity and explicit legacy envelopes', () => {
  const fixture = canonicalFixture();
  assert.equal(admitPackagePayloadManifest({
    payload: fixture.payload,
    manifest: fixture.manifest,
    payloadManifestUrl: '/fixture/payload.json',
    catalogSelection: null,
  }).kind, 'canonical_v2');

  const cases: Array<{ name: string; payload: Record<string, any>; manifest?: AgentPackageManifest; failureCode: string }> = [
    {
      name: 'schema mode missing',
      payload: structuredClone(fixture.payload),
      failureCode: 'first_party_package_payload_schema_invalid',
    },
    {
      name: 'plugin identity mismatch',
      payload: { ...structuredClone(fixture.payload), plugin_id: 'wrong-plugin' },
      failureCode: 'first_party_package_payload_identity_mismatch',
    },
    {
      name: 'source commit mismatch',
      payload: { ...structuredClone(fixture.payload), source_commit: 'b'.repeat(40) },
      failureCode: 'first_party_package_payload_identity_mismatch',
    },
    {
      name: 'source URL mismatch',
      payload: {
        ...structuredClone(fixture.payload),
        files: fixture.payload.files.map((file, index) => index === 0
          ? { ...file, source_url: sourceUrl('wrong/plugin.json') }
          : file),
      },
      failureCode: 'first_party_package_payload_source_identity_mismatch',
    },
    {
      name: 'canonical third party',
      payload: structuredClone(fixture.payload),
      manifest: { ...fixture.manifest, source: 'third_party' },
      failureCode: 'canonical_package_payload_requires_first_party_source',
    },
    {
      name: 'legacy carrying v2 mode',
      payload: {
        surface_kind: 'opl_agent_package_payload_manifest',
        files: [{ path: 'file.txt', mode: '100755', content_utf8: 'x' }],
      },
      failureCode: 'legacy_package_payload_boundary_invalid',
    },
    {
      name: 'unknown envelope',
      payload: { surface_kind: 'unknown.v1', files: [] },
      failureCode: 'agent_package_payload_envelope_unsupported',
    },
  ];
  delete cases[0].payload.files[0].mode;

  for (const invalid of cases) {
    assert.throws(() => admitPackagePayloadManifest({
      payload: invalid.payload,
      manifest: invalid.manifest ?? fixture.manifest,
      payloadManifestUrl: `/fixture/${invalid.name}.json`,
      catalogSelection: null,
    }), (error: any) => error?.details?.failure_code === invalid.failureCode, invalid.name);
  }
});

test('Connect verifies canonical bytes and preserves 100755 through physical Codex materialization', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-canonical-payload-mode-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const payloadPath = path.join(root, 'payload.json');
  const fixture = canonicalFixture();
  fs.writeFileSync(payloadPath, `${JSON.stringify(fixture.payload, null, 2)}\n`);
  const previousEnvironment = {
    HOME: process.env.HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
  };
  const previousFetch = globalThis.fetch;
  process.env.HOME = homeDir;
  process.env.CODEX_HOME = path.join(homeDir, '.codex');
  process.env.OPL_STATE_DIR = stateDir;
  fixture.manifest.plugin_payload_manifest_url = payloadPath;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const file = fixture.files.find((candidate) => sourceUrl(candidate.path) === url);
    return file
      ? new Response(file.content, { status: 200 })
      : new Response('not found', { status: 404 });
  };

  try {
    const resolved = await resolveManifestPhysicalSource(fixture.manifest, false);
    const stagedSkill = path.join(resolved.plugin_source_path!, 'skills', pluginId, 'SKILL.md');
    assert.equal(fs.statSync(stagedSkill).mode & 0o777, 0o755);
    const physical = materializePhysicalCodexSurface(resolved, false);
    const installedSkill = path.join(physical.codex_plugin_cache_path!, 'skills', pluginId, 'SKILL.md');
    assert.equal(fs.statSync(installedSkill).mode & 0o777, 0o755);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
