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
  resolveBundledFullRuntimeManifestPhysicalSource,
  resolveManifestPhysicalSource,
} from '../../../../../src/modules/connect/agent-package-registry-parts/physical-surface.ts';
import type {
  BundledFullRuntimeCatalogEntry,
} from '../../../../../src/modules/connect/agent-package-registry-parts/bundled-full-runtime-catalog.ts';
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
    package_role: 'standard_agent',
    display_name: 'Example Agent',
    publisher: 'example',
    version: packageVersion,
    owner_language_version: null,
    source: 'first_party',
    source_repo: sourceRepo,
    source_commit: sourceCommit,
    carrier_source_commit: sourceCommit,
    verified_payload_source_commit: null,
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

function bundledPhysicalFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bundled-payload-source-'));
  const packageRoot = path.join(root, 'package');
  const sourceRoot = 'nested/source';
  const sourceRootPath = path.join(packageRoot, sourceRoot);
  const fixture = canonicalFixture();
  const payload = structuredClone(fixture.payload);
  payload.source_root = sourceRoot;
  payload.files = payload.files.map((entry) => ({
    ...entry,
    source_url: sourceUrl(`${sourceRoot}/${entry.path}`),
  }));
  for (const file of fixture.files) {
    const filePath = path.join(sourceRootPath, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, { mode: file.mode === '100755' ? 0o755 : 0o644 });
  }
  const payloadManifestJson = `${JSON.stringify(payload, null, 2)}\n`;
  const payloadManifestSha256 = `sha256:${crypto.createHash('sha256').update(payloadManifestJson).digest('hex')}`;
  const catalogEntry: BundledFullRuntimeCatalogEntry = {
    packageId,
    packageRole: 'standard_agent',
    packageVersion,
    ownerSourceCommit: sourceCommit,
    manifestUrl: 'file:///fixture/manifest.json',
    manifestJson: '{}\n',
    manifestSha256: `sha256:${'0'.repeat(64)}`,
    payloadManifestUrl: 'file:///fixture/payload.json',
    payloadManifestJson,
    payloadManifestSha256,
    runtimeModuleRelativePath: 'modules/example-agent',
    dependencyPackageIds: [],
  };
  return { ...fixture, root, packageRoot, sourceRootPath, catalogEntry };
}

test('Connect admits only strict canonical first-party payload identity and explicit legacy envelopes', () => {
  const fixture = canonicalFixture();
  assert.equal(admitPackagePayloadManifest({
    payload: fixture.payload,
    manifest: fixture.manifest,
    payloadManifestUrl: '/fixture/payload.json',
    catalogSelection: null,
  }).sourceCommit, sourceCommit);

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
      name: 'manifest carrier commit missing',
      payload: structuredClone(fixture.payload),
      manifest: { ...fixture.manifest, carrier_source_commit: null },
      failureCode: 'first_party_package_payload_identity_mismatch',
    },
    {
      name: 'manifest source authority drift',
      payload: structuredClone(fixture.payload),
      manifest: { ...fixture.manifest, source_commit: 'b'.repeat(40) },
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

  assert.throws(() => admitPackagePayloadManifest({
    payload: fixture.payload,
    manifest: fixture.manifest,
    payloadManifestUrl: '/fixture/catalog-drift.json',
    catalogSelection: {
      package_id: packageId,
      package_version: packageVersion,
      source_artifact_ref: 'ghcr.io/example/example-agent:0.3.1',
      artifact_digest: `sha256:${'1'.repeat(64)}`,
      artifact_status: 'published_immutable',
      package_content_digest: `sha256:${'2'.repeat(64)}`,
      owner_source_commit: 'b'.repeat(40),
    },
  }), (error: any) => error?.details?.failure_code === 'first_party_package_payload_identity_mismatch');
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
    assert.equal(resolved.verified_payload_source_commit, sourceCommit);
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

test('bundled Full runtime payloads stay offline and reject source-root or file path escape', () => {
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('bundled payload resolution must stay offline');
  };
  const success = bundledPhysicalFixture();
  try {
    const resolved = resolveBundledFullRuntimeManifestPhysicalSource({
      manifest: success.manifest,
      catalogEntry: success.catalogEntry,
      packageRoot: success.packageRoot,
    });
    assert.equal(resolved.plugin_source_path, success.sourceRootPath);
    assert.equal(resolved.verified_payload_source_commit, sourceCommit);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
    fs.rmSync(success.root, { recursive: true, force: true });
  }

  const sourceEscape = bundledPhysicalFixture();
  const outsideSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bundled-payload-outside-source-'));
  try {
    fs.cpSync(sourceEscape.sourceRootPath, path.join(outsideSourceRoot, 'source'), { recursive: true });
    fs.rmSync(path.join(sourceEscape.packageRoot, 'nested'), { recursive: true, force: true });
    fs.symlinkSync(outsideSourceRoot, path.join(sourceEscape.packageRoot, 'nested'), 'dir');
    assert.throws(() => resolveBundledFullRuntimeManifestPhysicalSource({
      manifest: sourceEscape.manifest,
      catalogEntry: sourceEscape.catalogEntry,
      packageRoot: sourceEscape.packageRoot,
    }), (error: any) => error?.details?.failure_code === 'agent_package_bundled_payload_symlink_forbidden');
  } finally {
    fs.rmSync(sourceEscape.root, { recursive: true, force: true });
    fs.rmSync(outsideSourceRoot, { recursive: true, force: true });
  }

  const fileEscape = bundledPhysicalFixture();
  const outsideFilesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bundled-payload-outside-files-'));
  try {
    const skillsRoot = path.join(fileEscape.sourceRootPath, 'skills');
    fs.cpSync(skillsRoot, path.join(outsideFilesRoot, 'skills'), { recursive: true });
    fs.rmSync(skillsRoot, { recursive: true, force: true });
    fs.symlinkSync(path.join(outsideFilesRoot, 'skills'), skillsRoot, 'dir');
    assert.throws(() => resolveBundledFullRuntimeManifestPhysicalSource({
      manifest: fileEscape.manifest,
      catalogEntry: fileEscape.catalogEntry,
      packageRoot: fileEscape.packageRoot,
    }), (error: any) => error?.details?.failure_code === 'agent_package_bundled_payload_path_escape');
  } finally {
    fs.rmSync(fileEscape.root, { recursive: true, force: true });
    fs.rmSync(outsideFilesRoot, { recursive: true, force: true });
  }
});

test('bundled Full runtime payloads reject missing bytes digest drift and mode drift', () => {
  const cases = [
    {
      name: 'missing',
      failureCode: 'agent_package_bundled_payload_file_missing',
      mutate: (fixture: ReturnType<typeof bundledPhysicalFixture>) => {
        fs.rmSync(path.join(fixture.sourceRootPath, fixture.files[0].path));
      },
    },
    {
      name: 'digest',
      failureCode: 'agent_package_bundled_payload_file_sha256_mismatch',
      mutate: (fixture: ReturnType<typeof bundledPhysicalFixture>) => {
        fs.appendFileSync(path.join(fixture.sourceRootPath, fixture.files[0].path), 'drift\n');
      },
    },
    {
      name: 'mode',
      failureCode: 'agent_package_bundled_payload_file_mode_mismatch',
      mutate: (fixture: ReturnType<typeof bundledPhysicalFixture>) => {
        fs.chmodSync(path.join(fixture.sourceRootPath, fixture.files[1].path), 0o644);
      },
    },
  ];
  for (const invalid of cases) {
    const fixture = bundledPhysicalFixture();
    try {
      invalid.mutate(fixture);
      assert.throws(() => resolveBundledFullRuntimeManifestPhysicalSource({
        manifest: fixture.manifest,
        catalogEntry: fixture.catalogEntry,
        packageRoot: fixture.packageRoot,
      }), (error: any) => error?.details?.failure_code === invalid.failureCode, invalid.name);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});
