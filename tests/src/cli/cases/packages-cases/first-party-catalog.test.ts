import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  agentPackageManifest,
  assert,
  formatJsonPayload,
  fs,
  os,
  parseJsonText,
  path,
  removeFixtureTree,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { resolveFirstPartyPackageCatalog } from '../../../../../src/modules/connect/agent-package-first-party.ts';
import { refreshFirstPartyPackageCatalogSnapshot } from '../../../../../src/modules/connect/agent-package-registry-parts/release-catalog-cache.ts';
import { materializeAgentPackageSkillProjection } from '../../../../../src/modules/connect/agent-package-registry-parts/skill-projection.ts';
import {
  normalizeOplReleaseChannelTag,
  resolveOplReleaseManifestRef,
} from '../../../../../src/modules/connect/system-installation/release-channel.ts';
import {
  commitDeveloperCheckout,
  updateDeveloperCapabilityCheckoutClosure,
  writeCapabilityCatalog,
  writeDeveloperCapabilityCheckoutClosure,
  writeCapabilityProvider,
  writeMasConsumer,
} from './capability-fixtures.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const PACKAGE_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.manifest.v1+json';
const PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.payload.v1+json';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

function writeMasOwnerGateFixture(checkoutPath: string, binRoot: string) {
  const packageRoot = path.join(checkoutPath, 'src', 'med_autoscience', 'authority_handlers');
  const uvToolDir = path.join(path.dirname(binRoot), 'uv-tools');
  const ownerGateBin = path.join(
    uvToolDir,
    'med-autoscience',
    'bin',
    'mas-foundry-owner-gate',
  );
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(checkoutPath, 'pyproject.toml'), [
    '[build-system]',
    'requires = ["setuptools>=69"]',
    'build-backend = "setuptools.build_meta"',
    '',
    '[project]',
    'name = "med-autoscience"',
    'version = "0.1.0"',
    '',
    '[project.scripts]',
    'mas-foundry-owner-gate = "med_autoscience.authority_handlers.foundry_owner_gate:main"',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(checkoutPath, 'README.md'), '# MAS developer fixture\n');
  fs.writeFileSync(path.join(checkoutPath, 'src', 'med_autoscience', '__init__.py'), '');
  fs.writeFileSync(path.join(packageRoot, '__init__.py'), '');
  fs.writeFileSync(path.join(packageRoot, 'foundry_owner_gate.py'), 'def main():\n    raise SystemExit(0)\n');
  fs.mkdirSync(path.dirname(ownerGateBin), { recursive: true });
  fs.writeFileSync(ownerGateBin, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  fs.mkdirSync(binRoot, { recursive: true });
  fs.writeFileSync(path.join(binRoot, 'uv'), [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const target = path.join(process.env.UV_TOOL_DIR, 'med-autoscience', 'bin', 'mas-foundry-owner-gate');",
    'fs.mkdirSync(path.dirname(target), { recursive: true });',
    "fs.writeFileSync(target, '#!/usr/bin/env bash\\nexit 0\\n', { mode: 0o755 });",
  ].join('\n'), { mode: 0o755 });
  return { UV_TOOL_DIR: uvToolDir };
}

function writePackageOwnerChannelFixture(input: {
  root: string;
  binRoot: string;
  catalogPath: string;
  packageIds: string[];
}) {
  const catalog = parseJsonText(fs.readFileSync(input.catalogPath, 'utf8')) as any;
  const packageCatalog = catalog.packages.package_catalog;
  const blobRoot = path.join(input.root, 'owner-channel-blobs');
  const manifests: Record<string, unknown> = {};
  const blobs: Record<string, string> = {};
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(input.binRoot, { recursive: true });
  for (const packageId of input.packageIds) {
    const version = packageCatalog[packageId]?.versions?.[0];
    assert.ok(version, `missing fixture catalog entry for ${packageId}`);
    const manifestPath = path.join(blobRoot, `${packageId}-manifest.json`);
    const payloadPath = path.join(blobRoot, `${packageId}-payload.json`);
    fs.writeFileSync(manifestPath, version.manifest_json);
    fs.writeFileSync(payloadPath, version.payload_manifest_json);
    const payload = parseJsonText(version.payload_manifest_json) as any;
    const sourcePath = path.join(
      path.dirname(input.catalogPath),
      'release-set-artifacts',
      `${payload.package_source.archive_root}.tar.gz`,
    );
    assert.equal(fs.existsSync(sourcePath), true, sourcePath);
    manifests[`fixture/one-person-lab-packages/${packageId}`] = {
      schemaVersion: 2,
      layers: [
        { mediaType: PACKAGE_LAYER_MEDIA_TYPE, digest: version.package_content_digest },
        {
          mediaType: PACKAGE_MANIFEST_LAYER_MEDIA_TYPE,
          digest: version.manifest_sha256,
          annotations: { 'org.opencontainers.image.title': 'package-manifest.json' },
        },
        {
          mediaType: PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE,
          digest: version.payload_manifest_sha256,
          annotations: { 'org.opencontainers.image.title': 'payload-manifest.json' },
        },
      ],
    };
    blobs[version.package_content_digest] = sourcePath;
    blobs[version.manifest_sha256] = manifestPath;
    blobs[version.payload_manifest_sha256] = payloadPath;
  }
  const curlLogPath = path.join(input.root, 'owner-channel-curl.jsonl');
  fs.writeFileSync(path.join(input.binRoot, 'curl'), [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    `fs.appendFileSync(${JSON.stringify(curlLogPath)}, JSON.stringify(args) + '\\n');`,
    "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
    "if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: 'fixture' })); process.exit(0); }",
    `const manifests = ${JSON.stringify(manifests)};`,
    `const blobs = ${JSON.stringify(blobs)};`,
    "if (url.includes('/manifests/')) {",
    "  const match = url.match(/\\/v2\\/(.+)\\/manifests\\//);",
    '  const payload = match ? manifests[match[1]] : null;',
    '  if (!payload) process.exit(22);',
    '  process.stdout.write(JSON.stringify(payload));',
    '  process.exit(0);',
    '}',
    "if (url.includes('/blobs/')) {",
    "  const digest = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));",
    "  const outIndex = args.indexOf('-o');",
    '  if (!blobs[digest] || outIndex < 0) process.exit(22);',
    '  fs.copyFileSync(blobs[digest], args[outIndex + 1]);',
    '  process.exit(0);',
    '}',
    'process.exit(22);',
  ].join('\n'), { mode: 0o755 });
  return {
    env: {
      OPL_PACKAGES_OWNER: 'fixture',
      PATH: `${input.binRoot}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    curlLogPath,
  };
}

function writeFirstPartyCatalogFixture(
  version: string,
  ownerSourceCommit: string,
  options: { manifestCarrierSourceCommit?: string | null } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-first-party-catalog-${version}-`));
  const sourceParent = path.join(root, 'source');
  const sourceRoot = path.join(sourceParent, 'opl-flow');
  const blobRoot = path.join(root, 'blobs');
  const fakeBin = path.join(root, 'bin');
  const pluginJson = formatJsonPayload({
    name: 'opl-flow',
    version,
    displayName: 'OPL Flow',
    description: 'First-party catalog fixture.',
  });
  const skillMarkdown = '# OPL Flow\n\nFirst-party catalog fixture.\n';
  const agentsMarkdown = '# OPL Flow fixture profile\n';
  const tasteMarkdown = '# OPL Flow fixture authoring source\n';
  const workflowPolicy = formatJsonPayload({
    schema: 'opl_flow_workflow_policy.v1',
    package: { id: 'opl-flow', version, owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'fixture',
    requires: [],
    recommends: [],
    compatible_optional: [],
    conflicts: [],
    retires: [],
    migration_policy: {
      trigger: 'explicit_opl_flow_install_update_optimize_or_generic_app_post_update_reconcile',
      default_action: 'backup_disable_and_remove_from_discovery',
      physical_delete: false,
      receipt_owner: 'opl-framework',
      rollback_required: true,
      keep_override_supported: true,
      fresh_discovery_required: true,
    },
    historical_fingerprints: {
      plugin_ids: ['opl-flow'],
      skill_ids: ['opl-flow'],
      service_ids: ['opl-flow'],
      config_markers: ['opl-flow'],
      legacy_prompt_ids: ['opl-flow'],
    },
    codex_model_policy: {
      authority: 'opl-flow',
      configured_default: 'fixture',
      override_precedence: [],
    },
  });
  const workflowPolicySchema = formatJsonPayload({ type: 'object' });
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'skills', 'opl-flow'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, '.codex-plugin', 'plugin.json'), pluginJson);
  fs.writeFileSync(path.join(sourceRoot, 'skills', 'opl-flow', 'SKILL.md'), skillMarkdown);
  fs.writeFileSync(path.join(sourceRoot, 'templates', 'AGENTS.md'), agentsMarkdown);
  fs.writeFileSync(path.join(sourceRoot, 'templates', 'TASTE.md'), tasteMarkdown);
  fs.writeFileSync(path.join(sourceRoot, 'contracts', 'workflow-policy.json'), workflowPolicy);
  fs.writeFileSync(path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json'), workflowPolicySchema);
  const archivePath = path.join(root, `opl-flow-${version}.tar.gz`);
  execFileSync('tar', ['-czf', archivePath, 'opl-flow'], { cwd: sourceParent });
  const archiveSha256 = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  const sourceArtifactRef = `ghcr.io/fixture/one-person-lab-packages/opl-flow:${version}`;
  const manifest = {
    surface_kind: 'opl_workflow_profile_package_manifest.v1',
    package_id: 'opl-flow',
    display_name: 'OPL Flow',
    publisher: 'one-person-lab',
    version,
    source: 'first_party',
    package_role: 'workflow_profile',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'opl-flow',
      plugin_payload_manifest_url: 'payload.json',
      ...(options.manifestCarrierSourceCommit === null ? {} : {
        carrier_source_commit: options.manifestCarrierSourceCommit ?? ownerSourceCommit,
      }),
      required_skill_ids: ['opl-flow'],
    },
    profile_surface: {
      runtime_profile: { source_path: 'templates/AGENTS.md', target_id: 'user_agents_profile' },
      authoring_sources: [{ source_path: 'templates/TASTE.md', target_id: 'user_taste_source' }],
      merge_context_paths: [],
      existing_profile_policy: 'semantic_merge_required',
    },
    managed_policy_surface: {
      policy_kind: 'opl_flow_workflow_policy',
      source_path: 'contracts/workflow-policy.json',
      schema_path: 'contracts/workflow-policy.schema.json',
    },
    capability_dependencies: [],
  };
  const payload = {
    surface_kind: 'opl_agent_package_payload_manifest',
    package_id: 'opl-flow',
    package_version: version,
    source_commit: ownerSourceCommit,
    package_source: {
      transport: 'same_oci_artifact_source_archive',
      artifact_ref: sourceArtifactRef,
      archive_sha256: `sha256:${archiveSha256}`,
      archive_root: 'opl-flow',
    },
    files: [
      {
        path: '.codex-plugin/plugin.json',
        source_path: '.codex-plugin/plugin.json',
        source_artifact_ref: sourceArtifactRef,
        migration_source_url: `https://raw.githubusercontent.com/fixture/opl-flow/${ownerSourceCommit}/.codex-plugin/plugin.json`,
        sha256: `sha256:${crypto.createHash('sha256').update(pluginJson).digest('hex')}`,
      },
      {
        path: 'skills/opl-flow/SKILL.md',
        source_path: 'skills/opl-flow/SKILL.md',
        source_artifact_ref: sourceArtifactRef,
        migration_source_url: `https://raw.githubusercontent.com/fixture/opl-flow/${ownerSourceCommit}/skills/opl-flow/SKILL.md`,
        sha256: `sha256:${crypto.createHash('sha256').update(skillMarkdown).digest('hex')}`,
      },
      ...[
        ['templates/AGENTS.md', agentsMarkdown],
        ['templates/TASTE.md', tasteMarkdown],
        ['contracts/workflow-policy.json', workflowPolicy],
        ['contracts/workflow-policy.schema.json', workflowPolicySchema],
      ].map(([filePath, content]) => ({
        path: filePath,
        source_path: filePath,
        source_artifact_ref: sourceArtifactRef,
        migration_source_url: `https://raw.githubusercontent.com/fixture/opl-flow/${ownerSourceCommit}/${filePath}`,
        sha256: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
      })),
    ],
  };
  const manifestJson = formatJsonPayload(manifest);
  const payloadManifestJson = formatJsonPayload(payload);
  const manifestSha256 = `sha256:${crypto.createHash('sha256').update(manifestJson).digest('hex')}`;
  const payloadManifestSha256 = `sha256:${crypto.createHash('sha256').update(payloadManifestJson).digest('hex')}`;
  const manifestPath = path.join(blobRoot, 'package-manifest.json');
  const payloadManifestPath = path.join(blobRoot, 'payload-manifest.json');
  fs.writeFileSync(manifestPath, manifestJson);
  fs.writeFileSync(payloadManifestPath, payloadManifestJson);
  const packageArtifactManifest = {
    schemaVersion: 2,
    layers: [
      { mediaType: PACKAGE_LAYER_MEDIA_TYPE, digest: `sha256:${archiveSha256}` },
      {
        mediaType: PACKAGE_MANIFEST_LAYER_MEDIA_TYPE,
        digest: manifestSha256,
        annotations: { 'org.opencontainers.image.title': 'package-manifest.json' },
      },
      {
        mediaType: PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE,
        digest: payloadManifestSha256,
        annotations: { 'org.opencontainers.image.title': 'payload-manifest.json' },
      },
    ],
  };
  const packageArtifactManifestJson = JSON.stringify(packageArtifactManifest);
  const artifactDigest = `sha256:${crypto.createHash('sha256').update(packageArtifactManifestJson).digest('hex')}`;
  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  const packageCatalog = {
    'opl-flow': {
      package_id: 'opl-flow',
      package_role: 'workflow_profile',
      selected_version: version,
      versions: [{
        package_version: version,
        selection_status: 'selected_for_release_set',
        manifest_url: `opl+oci://${sourceArtifactRef}#/package-manifest.json`,
        manifest_sha256: manifestSha256,
        manifest_json: manifestJson,
        content_digest: manifestSha256,
        payload_digest: payloadManifestSha256,
        payload_manifest_json: payloadManifestJson,
        payload_manifest_sha256: payloadManifestSha256,
        source_artifact_ref: sourceArtifactRef,
        artifact_digest: artifactDigest,
        artifact_status: 'published_immutable',
        package_content_digest: `sha256:${archiveSha256}`,
        owner_source_commit: ownerSourceCommit,
        dependency_package_ids: [],
      }],
    },
  };
  const packageCatalogDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(packageCatalog)).digest('hex')}`;
  fs.writeFileSync(channelManifestPath, formatJsonPayload({
    release_set_generation: `fixture-${version}`,
    packages: {
      package_catalog: packageCatalog,
    },
    package_catalog_digest: packageCatalogDigest,
  }));
  const channelDigest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(channelManifestPath)).digest('hex')}`;
  const channelDescriptor = {
    schemaVersion: 2,
    layers: [{ mediaType: CHANNEL_MANIFEST_LAYER_MEDIA_TYPE, digest: channelDigest }],
  };
  const channelDescriptorDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(channelDescriptor)).digest('hex')}`;
  const curlLogPath = path.join(root, 'curl.jsonl');
  const manifests = {
    'fixture/one-person-lab-manifest': channelDescriptor,
    'fixture/one-person-lab-packages/opl-flow': packageArtifactManifest,
  };
  const blobs = {
    [channelDigest]: channelManifestPath,
    [`sha256:${archiveSha256}`]: archivePath,
    [manifestSha256]: manifestPath,
    [payloadManifestSha256]: payloadManifestPath,
  };
  fs.writeFileSync(path.join(fakeBin, 'curl'), [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    `fs.appendFileSync(${JSON.stringify(curlLogPath)}, JSON.stringify(args) + '\\n');`,
    "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
    "if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: 'fixture' })); process.exit(0); }",
    `const manifests = ${JSON.stringify(manifests)};`,
    `const blobs = ${JSON.stringify(blobs)};`,
    "if (url.includes('/manifests/')) {",
    "  const match = url.match(/\\/v2\\/(.+)\\/manifests\\//);",
    '  const payload = match ? manifests[match[1]] : null;',
    '  if (!payload) process.exit(22);',
    '  process.stdout.write(JSON.stringify(payload));',
    '  process.exit(0);',
    '}',
    "if (url.includes('/blobs/')) {",
    "  const digest = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));",
    "  const outIndex = args.indexOf('-o');",
    '  if (!blobs[digest] || outIndex < 0) process.exit(22);',
    '  fs.copyFileSync(blobs[digest], args[outIndex + 1]);',
    '  process.exit(0);',
    '}',
    'process.exit(22);',
  ].join('\n'), { mode: 0o755 });
  return {
    root,
    env: {
      OPL_PACKAGES_OWNER: 'fixture',
      OPL_PACKAGE_CHANNEL_TAG: 'stable',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    artifactDigest,
    channelDigest,
    channelDescriptorDigest,
    packageCatalogDigest,
    manifestSha256,
    sourceArtifactRef,
    curlLogPath,
  };
}

test('first-party package selection resolves the managed Release Set catalog', () => {
  const previousOwner = process.env.OPL_PACKAGES_OWNER;
  const previousTag = process.env.OPL_PACKAGE_CHANNEL_TAG;
  const previousVersion = process.env.OPL_PACKAGE_CHANNEL_VERSION;
  const previousManifestRef = process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF;
  delete process.env.OPL_PACKAGES_OWNER;
  delete process.env.OPL_PACKAGE_CHANNEL_TAG;
  delete process.env.OPL_PACKAGE_CHANNEL_VERSION;
  delete process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF;
  try {
    const selection = resolveFirstPartyPackageCatalog('opl-flow');

    assert.deepEqual(selection, {
      canonicalId: 'opl-flow',
      trustTier: 'first_party',
      sourceKind: 'first_party_managed_cohort',
      catalogSource: {
        kind: 'managed_version_catalog',
        transport: 'opl_oci_channel',
        catalog_ref: 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest-stable',
        selection_policy: 'highest_stable',
        digest_authority: 'manifest_and_content_digest',
      },
    });
    assert.equal(resolveFirstPartyPackageCatalog('unknown-package'), null);
  } finally {
    for (const [key, value] of Object.entries({
      OPL_PACKAGES_OWNER: previousOwner,
      OPL_PACKAGE_CHANNEL_TAG: previousTag,
      OPL_PACKAGE_CHANNEL_VERSION: previousVersion,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: previousManifestRef,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('release channels normalize stable and preview aliases and reject bare latest', () => {
  assert.equal(normalizeOplReleaseChannelTag(undefined), 'latest-stable');
  assert.equal(normalizeOplReleaseChannelTag('stable'), 'latest-stable');
  assert.equal(normalizeOplReleaseChannelTag('preview'), 'candidate');
  assert.equal(normalizeOplReleaseChannelTag('26.7.13-r4'), '26.7.13-r4');
  assert.throws(
    () => normalizeOplReleaseChannelTag('latest'),
    (error: any) => error?.details?.failure_code === 'opl_release_channel_latest_retired',
  );

  const previousManifestRef = process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF;
  try {
    delete process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF;
    assert.equal(
      resolveOplReleaseManifestRef('ghcr.io/fixture/one-person-lab-manifest:preview'),
      'ghcr.io/fixture/one-person-lab-manifest:candidate',
    );
  } finally {
    if (previousManifestRef === undefined) delete process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF;
    else process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF = previousManifestRef;
  }
});

test('live owner refresh stays ephemeral and does not request the shared manifest', async () => {
  const fixture = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-release-cache-'));
  const environment = {
    ...fixture.env,
    OPL_STATE_DIR: stateDir,
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, environment);
    const snapshot = await refreshFirstPartyPackageCatalogSnapshot('opl-flow');
    assert.equal(snapshot.freshness, 'live');
    assert.equal(snapshot.catalog_ref, 'ghcr.io/fixture/one-person-lab-packages/opl-flow:latest-stable');
    assert.equal(snapshot.release_set_descriptor_digest, fixture.artifactDigest);
    assert.equal(snapshot.channel_manifest_layer_digest, fixture.artifactDigest);
    assert.match(snapshot.package_catalog_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(snapshot.catalog_digest, fixture.artifactDigest);
    assert.equal(fs.existsSync(
      path.join(stateDir, 'agent-package-release-catalog-cache.json'),
    ), false);
    const reads = fs.readFileSync(fixture.curlLogPath, 'utf8').trim().split('\n');
    assert.equal(
      reads.filter((line) =>
        line.includes('/one-person-lab-packages/opl-flow/manifests/latest-stable')).length,
      1,
    );
    assert.equal(reads.filter((line) => line.includes('/one-person-lab-manifest/')).length, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('first-party identities reject explicit registries and unowned manifest bodies without state writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-source-collision-'));
  const stateDir = path.join(root, 'opl-state');
  const homeDir = path.join(root, 'home');
  const registryPath = path.join(root, 'malicious-catalog.json');
  const manifestPath = path.join(root, 'mas-manifest.json');
  const registryUrl = pathToFileURL(registryPath).href;
  const manifestUrl = pathToFileURL(manifestPath).href;
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
  };
  const collisionEntries = Object.fromEntries(['mas', 'oma'].map((packageId) => [packageId, {
    package_id: packageId,
    package_role: 'standard_agent',
    selected_version: '9.9.9',
    versions: [{
      package_version: '9.9.9',
      selection_status: 'selected_for_release_set',
      manifest_url: `https://attacker.invalid/${packageId}.json`,
      manifest_json: formatJsonPayload(agentPackageManifest({
        packageId,
        agentId: packageId,
        pluginId: `attacker-${packageId}`,
      })),
    }],
  }]));
  try {
    fs.writeFileSync(registryPath, formatJsonPayload({
      surface_kind: 'opl_package_catalog.v1',
      packages: { package_catalog: collisionEntries },
    }));
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({
      packageId: 'mas',
      agentId: 'mas',
      pluginId: 'attacker-mas',
    })));

    const registryInstall = runCliFailure([
      'packages', 'install', '--registry-url', registryUrl, '--package-id', 'mas',
    ], env);
    assert.equal(
      registryInstall.payload.error.details.failure_code,
      'first_party_package_explicit_source_forbidden',
    );

    const registryAction = runCliFailure([
      'app', 'action', 'execute',
      '--action', 'install_from_manifest_url',
      '--payload', JSON.stringify({ registry_url: registryUrl, package_id: 'oma' }),
    ], env);
    assert.equal(
      registryAction.payload.error.details.failure_code,
      'first_party_package_explicit_source_forbidden',
    );

    const manifestAction = runCliFailure([
      'app', 'action', 'execute',
      '--action', 'install_from_manifest_url',
      '--payload', JSON.stringify({ manifest_url: manifestUrl, trust_tier: 'first_party' }),
    ], env);
    assert.equal(
      manifestAction.payload.error.details.failure_code,
      'first_party_package_external_manifest_forbidden',
    );
    for (const fileName of [
      'agent-package-locks.json',
      'agent-package-lifecycle-ledger.json',
      'agent-package-registry-cache.json',
    ]) {
      assert.equal(fs.existsSync(path.join(stateDir, fileName)), false, `${fileName} must not be written`);
    }
    assert.equal(fs.existsSync(path.join(homeDir, '.codex')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('first-party install and update read one owner channel without shared-manifest currentness', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-catalog-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-catalog-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-catalog-workspace-'));
  const first = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const second = writeFirstPartyCatalogFixture('0.2.1', '2'.repeat(40));
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CLI_TEST_TIMEOUT_MS: '90000',
  };
  try {
    const installedAction = runCli([
      'app', 'action', 'execute',
      '--action', 'install_from_manifest_url',
      '--payload', JSON.stringify({ package_id: 'opl-flow' }),
    ], {
      ...commonEnv,
      ...first.env,
    }) as any;
    assert.equal(
      installedAction.app_action_execution.delegated_surface,
      'opl packages install --manifest-url <manifest_url>',
    );
    const installed = installedAction.app_action_execution.result;
    const installedLock = installed.opl_agent_package_install.package_lock;
    assert.equal(installedLock.package_id, 'opl-flow');
    assert.equal(installedLock.package_role, 'workflow_profile');
    assert.equal(installedLock.package_version, '0.2.0');
    assert.equal(installedLock.source_kind, 'first_party_managed_cohort');
    assert.equal(installedLock.trust_tier, 'first_party');
    assert.equal(installedLock.owner_source_commit, '1'.repeat(40));
    assert.equal(installedLock.source_artifact_ref, first.sourceArtifactRef);
    assert.equal(installedLock.artifact_digest, first.artifactDigest);
    assert.equal(installedLock.release_channel_ref, 'ghcr.io/fixture/one-person-lab-packages/opl-flow:latest-stable');
    assert.equal(installedLock.release_channel_digest, first.artifactDigest);
    assert.equal(installedLock.manifest_sha256, first.manifestSha256.replace(/^sha256:/, ''));
    assert.equal(installedLock.content_digest, first.manifestSha256);
    assert.equal(
      installedLock.managed_update_source.catalog_ref,
      'ghcr.io/fixture/one-person-lab-packages/opl-flow:latest-stable',
    );
    assert.equal(installedLock.physical_surface.status, 'materialized');
    assert.equal(
      fs.readFileSync(path.join(installedLock.physical_surface.codex_plugin_cache_path, 'skills', 'opl-flow', 'SKILL.md'), 'utf8'),
      '# OPL Flow\n\nFirst-party catalog fixture.\n',
    );
    const firstOwnerReads = fs.readFileSync(first.curlLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('/one-person-lab-packages/opl-flow/manifests/latest-stable'));
    assert.equal(firstOwnerReads.length, 1);
    assert.equal(
      fs.readFileSync(first.curlLogPath, 'utf8').includes('/one-person-lab-manifest/'),
      false,
    );

    const activated = runCli([
      'packages', 'activate', 'opl-flow', '--scope', 'workspace', '--target-workspace', workspace,
    ], {
      ...commonEnv,
      ...first.env,
    }) as any;
    assert.equal(activated.opl_agent_package_activation.package_use_binding.root_package.owner_source_commit, '1'.repeat(40));
    assert.equal(activated.opl_agent_package_activation.use_receipt.owner_source_commit, '1'.repeat(40));
    assert.equal(activated.opl_agent_package_activation.use_receipt.use_binding.root_package.owner_source_commit, '1'.repeat(40));

    const updated = runCli(['packages', 'update', 'opl-flow'], {
      ...commonEnv,
      ...second.env,
    }) as any;
    const updatedLock = updated.opl_agent_package_update.package_lock;
    assert.equal(updatedLock.package_version, '0.2.1');
    assert.equal(updatedLock.owner_source_commit, '2'.repeat(40));
    assert.equal(updatedLock.source_artifact_ref, second.sourceArtifactRef);
    assert.equal(updatedLock.artifact_digest, second.artifactDigest);
    assert.equal(updatedLock.release_channel_digest, second.artifactDigest);
    assert.equal(updatedLock.manifest_sha256, second.manifestSha256.replace(/^sha256:/, ''));
    assert.equal(updated.opl_agent_package_update.lifecycle_receipt.owner_source_commit, '2'.repeat(40));
    assert.equal(updated.opl_agent_package_update.lifecycle_receipt.artifact_digest, second.artifactDigest);
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
  }
});

test('a previous first-party lock cannot mask a new manifest missing carrier authority', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-carrier-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-carrier-home-'));
  const first = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const missing = writeFirstPartyCatalogFixture('0.2.1', '2'.repeat(40), {
    manifestCarrierSourceCommit: null,
  });
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
  };
  try {
    const installed = runCli(['packages', 'install', 'opl-flow'], { ...commonEnv, ...first.env }) as any;
    const originalLockRef = installed.opl_agent_package_install.package_lock.lock_ref;
    const failure = runCliFailure(['packages', 'update', 'opl-flow'], { ...commonEnv, ...missing.env });
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'first_party_package_payload_identity_mismatch');
    assert.ok(failure.payload.error.details.mismatches.includes('manifest_carrier_source_commit'));
    const retained = runCli(['packages', 'status', '--package-id', 'opl-flow'], commonEnv) as any;
    assert.equal(retained.opl_agent_package_status.installed_packages[0].lock_ref, originalLockRef);
    assert.equal(retained.opl_agent_package_status.installed_packages[0].owner_source_commit, '1'.repeat(40));
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(missing.root, { recursive: true, force: true });
  }
});

test('first-party install rejects a catalog member without an immutable owner commit', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-invalid-catalog-state-'));
  const fixture = writeFirstPartyCatalogFixture('0.2.0', 'not-an-owner-commit');
  try {
    const failure = runCliFailure(['packages', 'install', 'opl-flow'], {
      OPL_STATE_DIR: stateDir,
      ...fixture.env,
    });
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      failure.payload.error.details.failure_code,
      'agent_package_manifest_carrier_source_commit_invalid',
    );
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('first-party activation keeps the installed LKG when the next catalog member is invalid', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-activation-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-activation-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-activation-workspace-'));
  const installedFixture = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const invalidFixture = writeFirstPartyCatalogFixture('0.2.1', 'not-an-owner-commit');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
  };
  try {
    const installed = runCli(['packages', 'install', 'opl-flow'], {
      ...commonEnv,
      ...installedFixture.env,
    }) as any;
    const pluginPath = path.join(
      installed.opl_agent_package_install.package_lock.physical_surface.codex_plugin_cache_path,
      '.codex-plugin',
      'plugin.json',
    );

    const activation = runCli([
      'packages', 'activate', 'opl-flow',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], {
      ...commonEnv,
      ...invalidFixture.env,
    }).opl_agent_package_activation;
    assert.equal(activation.package_lock.package_version, '0.2.0');
    assert.equal(activation.package_use_binding.freshness_mode, 'offline_lkg');
    assert.equal(
      activation.package_use_binding.reconciliation_issue.failure_code,
      'agent_package_capability_channel_unavailable',
    );
    assert.equal(JSON.parse(fs.readFileSync(pluginPath, 'utf8')).version, '0.2.0');
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(installedFixture.root, { recursive: true, force: true });
    fs.rmSync(invalidFixture.root, { recursive: true, force: true });
  }
});

test('developer checkout policy tracks Release Set currentness without accepting an arbitrary checkout path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-developer-currentness-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const wrongCheckout = path.join(root, 'workspace', 'wrong-med-autoscience');
  const oldProvider = writeCapabilityProvider(path.join(root, 'old-provider'), '0.1.0');
  const oldMas = writeMasConsumer(path.join(root, 'old-mas'), oldProvider, '0.1.0');
  const oldReleaseSet = writeCapabilityCatalog(path.join(root, 'old-release-set'), [oldMas, oldProvider]);
  const nextProvider = writeCapabilityProvider(path.join(root, 'next-provider'), '0.1.1');
  const nextMas = writeMasConsumer(path.join(root, 'next-mas'), nextProvider, '0.1.1');
  const nextReleaseSet = writeCapabilityCatalog(path.join(root, 'next-release-set'), [nextMas, nextProvider]);
  const fakeBin = path.join(root, 'bin');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
  };
  fs.mkdirSync(masCheckout, { recursive: true });
  fs.mkdirSync(scholarCheckout, { recursive: true });
  fs.mkdirSync(wrongCheckout, { recursive: true });
  writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: oldMas,
    providerManifestPath: oldProvider,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');

  try {
    const pathFailure = runCliFailure([
      'packages', 'install', 'mas',
      '--source-kind', 'developer_checkout_override',
      '--agent-root', wrongCheckout,
    ], { ...commonEnv, ...oldReleaseSet.env });
    assert.equal(pathFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      pathFailure.payload.error.details.failure_code,
      'first_party_package_developer_checkout_path_mismatch',
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const installed = runCli(['packages', 'install', 'mas'], {
      ...commonEnv,
      ...oldReleaseSet.env,
    }) as any;
    assert.equal(installed.opl_agent_package_install.package_lock.package_version, '0.1.0');
    assert.equal(installed.opl_agent_package_install.package_lock.source_kind, 'developer_checkout_override');
    assert.deepEqual(
      installed.opl_agent_package_install.dependency_package_locks.map((lock: any) => [
        lock.package_id,
        lock.package_version,
        lock.source_kind,
      ]),
      [
        ['mas-scholar-skills', '0.1.0', 'developer_checkout_override'],
        ['mas', '0.1.0', 'developer_checkout_override'],
      ],
    );

    updateDeveloperCapabilityCheckoutClosure({
      masCheckout,
      scholarCheckout,
      masManifestPath: nextMas,
      providerManifestPath: nextProvider,
      message: 'fixture B',
    });

    const releaseCatalogCache = path.join(stateDir, 'agent-package-release-catalog-cache.json');
    const cachedOldReleaseSet = formatJsonPayload({
      surface_kind: 'opl_agent_package_release_catalog_cache.v1',
      catalog_ref: 'ghcr.io/fixture/one-person-lab-manifest:fixture',
      catalog_digest: `sha256:${'9'.repeat(64)}`,
      checked_at: new Date().toISOString(),
      catalog_payload: JSON.parse(fs.readFileSync(oldReleaseSet.catalogPath, 'utf8')),
    });
    fs.writeFileSync(releaseCatalogCache, cachedOldReleaseSet);
    const preview = runCli(['packages', 'update', '--dry-run'], {
      ...commonEnv,
      ...nextReleaseSet.env,
    }) as any;
    const previewPackages = preview.managed_update.components.find(
      (entry: any) => entry.component_id === 'opl_packages',
    );
    const previewMas = previewPackages.current.package_lock_states.find(
      (entry: any) => entry.package_id === 'mas',
    );
    assert.equal(previewMas.state, 'update_available');
    assert.equal(previewMas.currentness.status, 'update_available');
    assert.equal(fs.readFileSync(releaseCatalogCache, 'utf8'), cachedOldReleaseSet);

    const updated = runCli(['update', 'apply'], {
      ...commonEnv,
      ...nextReleaseSet.env,
      OPL_CLI_TEST_TIMEOUT_MS: '90000',
    }) as any;
    const adapter = updated.managed_update.execution.adapter_results.find(
      (entry: any) => entry.component_id === 'opl_packages',
    );
    const target = adapter.result.targets.find((entry: any) => entry.target_id === 'mas');
    assert.equal(target.status, 'completed', JSON.stringify(target, null, 2));
    assert.equal(target.action, 'source_reconcile');
    assert.equal(target.currentness.status, 'update_available');
    assert.ok(target.currentness.reasons.includes('package_version_changed'));
    assert.equal(target.result.package_lock.package_version, '0.1.1');
    assert.equal(target.result.package_lock.source_kind, 'developer_checkout_override');
    assert.equal(target.result.lifecycle_receipt.trigger, 'managed_update_kernel_apply');

    const lockIndex = JSON.parse(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'));
    assert.deepEqual(
      lockIndex.packages
        .map((lock: any) => [lock.package_id, lock.package_version, lock.source_kind])
        .sort((left: string[], right: string[]) => left[0].localeCompare(right[0])),
      [
        ['mas', '0.1.1', 'developer_checkout_override'],
        ['mas-scholar-skills', '0.1.1', 'developer_checkout_override'],
      ],
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('fresh Developer install admits owner checkout manifests without channel payload or content lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-developer-direct-admission-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const providerPayload = JSON.parse(fs.readFileSync(providerManifest, 'utf8'));
  delete providerPayload.content_lock;
  fs.writeFileSync(providerManifest, formatJsonPayload(providerPayload));
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.1.0');
  const fakeBin = path.join(root, 'bin');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
  };
  fs.mkdirSync(masCheckout, { recursive: true });
  fs.mkdirSync(scholarCheckout, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: masManifest,
    providerManifestPath: providerManifest,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');

  try {
    const installed = runCli(['packages', 'install', 'mas'], commonEnv) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.deepEqual(
      installed.opl_agent_package_install.dependency_package_locks.map(
        (lock: any) => [lock.package_id, lock.source_kind],
      ),
      [
        ['mas-scholar-skills', 'developer_checkout_override'],
        ['mas', 'developer_checkout_override'],
      ],
    );
    assert.equal(
      installed.opl_agent_package_install.dependency_package_locks.every(
        (lock: any) => lock.release_channel_ref === null && lock.artifact_digest === null,
      ),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(stateDir, 'agent-package-release-catalog-cache.json')),
      false,
    );

    const status = runCli(['packages', 'status', '--package-id', 'mas'], commonEnv) as any;
    assert.equal(status.opl_agent_package_status.operational_ready, true);
    assert.equal(status.opl_agent_package_status.launch_allowed, true);
    runCli(['workspace', 'bind', '--project', 'medautoscience', '--path', workspace], commonEnv);
    const activation = runCli([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], commonEnv) as any;
    assert.equal(activation.opl_agent_package_activation.package_lock.source_kind, 'developer_checkout_override');
    assert.equal(activation.opl_agent_package_activation.package_use_binding.root_package.package_id, 'mas');
  } finally {
    removeFixtureTree(root);
  }
});

test('bad optional inline catalog entry stays diagnostic and does not block consumer install use or launch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-optional-inline-diagnostic-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const fakeBin = path.join(root, 'bin');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.1.0', {
    required: false,
    dependencyKind: 'optional_enhancement',
  });
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [masManifest, providerManifest],
    { corruptInlineManifestPackageId: 'mas-scholar-skills' },
  );
  writeMasOwnerGateFixture(path.dirname(masManifest), fakeBin);
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: fakeBin,
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas'],
  });
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    ...releaseSet.env,
    ...ownerChannel.env,
  };
  fs.mkdirSync(workspace, { recursive: true });

  try {
    const installed = runCli(['packages', 'install', 'mas'], commonEnv) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.deepEqual(
      installed.opl_agent_package_install.dependency_package_locks.map(
        (lock: any) => lock.package_id,
      ),
      ['mas'],
    );
    assert.deepEqual(installed.opl_agent_package_install.package_lock.resolved_dependencies, []);

    const status = runCli(['packages', 'status', '--package-id', 'mas'], commonEnv) as any;
    const readiness = status.opl_agent_package_status.package_dependency_readiness;
    assert.equal(readiness.status, 'missing');
    assert.equal(readiness.operational_ready, true);
    assert.deepEqual(readiness.dependencies[0].reasons, [
      'dependency_lock_missing',
    ]);
    assert.equal(status.opl_agent_package_status.operational_ready, true);
    assert.equal(status.opl_agent_package_status.launch_allowed, true);
    const networkReads = fs.readFileSync(ownerChannel.curlLogPath, 'utf8');
    assert.equal(
      networkReads.includes('/one-person-lab-packages/mas/manifests/latest-stable'),
      true,
    );
    assert.equal(networkReads.includes('/one-person-lab-packages/mas-scholar-skills/'), false);
    assert.equal(networkReads.includes('/one-person-lab-manifest/'), false);

    runCli(['workspace', 'bind', '--project', 'medautoscience', '--path', workspace], commonEnv);
    const activation = runCli([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], commonEnv) as any;
    assert.equal(activation.opl_agent_package_activation.launch_state, 'degraded');
    assert.equal(
      activation.opl_agent_package_activation.launch_state_reason,
      'optional_dependency_missing',
    );
    assert.deepEqual(
      activation.opl_agent_package_activation.package_use_binding.provider_packages,
      [],
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('MAS owner refresh reads only MAS and required ScholarSkills owner channels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-required-owner-closure-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const fakeBin = path.join(root, 'bin');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.1.0');
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [masManifest, providerManifest],
  );
  writeMasOwnerGateFixture(path.dirname(masManifest), fakeBin);
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: fakeBin,
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    ...releaseSet.env,
    ...ownerChannel.env,
  };

  try {
    const installed = runCli(['packages', 'install', 'mas'], env) as any;
    const locks = installed.opl_agent_package_install.dependency_package_locks;
    assert.deepEqual(locks.map((lock: any) => lock.package_id), [
      'mas-scholar-skills',
      'mas',
    ]);
    assert.deepEqual(
      locks.map((lock: any) => lock.release_channel_ref),
      [
        'ghcr.io/fixture/one-person-lab-packages/mas-scholar-skills:latest-stable',
        'ghcr.io/fixture/one-person-lab-packages/mas:latest-stable',
      ],
    );
    const reads = fs.readFileSync(ownerChannel.curlLogPath, 'utf8');
    for (const packageId of ['mas', 'mas-scholar-skills']) {
      assert.equal(
        reads.split('\n').filter((line) =>
          line.includes(`/one-person-lab-packages/${packageId}/manifests/latest-stable`)).length,
        1,
      );
    }
    assert.equal(reads.includes('/one-person-lab-manifest/'), false);
    for (const packageId of ['mag', 'rca', 'oma', 'obf', 'opl-flow']) {
      assert.equal(reads.includes(`/one-person-lab-packages/${packageId}/`), false);
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('single-package developer update reconciles from the live Release Set and becomes a byte-stable no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-single-developer-update-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const wrongCheckout = path.join(root, 'workspace', 'wrong-med-autoscience');
  const oldProvider = writeCapabilityProvider(path.join(root, 'old-provider'), '0.1.0');
  const oldMas = writeMasConsumer(path.join(root, 'old-mas'), oldProvider, '0.1.0');
  const oldReleaseSet = writeCapabilityCatalog(path.join(root, 'old-release-set'), [oldMas, oldProvider]);
  const nextProvider = writeCapabilityProvider(path.join(root, 'next-provider'), '0.1.1');
  const nextMas = writeMasConsumer(path.join(root, 'next-mas'), nextProvider, '0.1.1');
  const nextReleaseSet = writeCapabilityCatalog(path.join(root, 'next-release-set'), [nextMas, nextProvider]);
  const fakeBin = path.join(root, 'bin');
  const lockFile = path.join(stateDir, 'agent-package-locks.json');
  const ledgerFile = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
  const releaseCatalogCache = path.join(stateDir, 'agent-package-release-catalog-cache.json');
  const masSentinel = path.join(masCheckout, 'developer-source.txt');
  const scholarSentinel = path.join(scholarCheckout, 'developer-source.txt');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
  };
  fs.mkdirSync(masCheckout, { recursive: true });
  fs.mkdirSync(scholarCheckout, { recursive: true });
  fs.mkdirSync(wrongCheckout, { recursive: true });
  const developerFixture = writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: oldMas,
    providerManifestPath: oldProvider,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');
  fs.writeFileSync(masSentinel, 'developer MAS source\n');
  fs.writeFileSync(scholarSentinel, 'developer ScholarSkills source\n');

  try {
    const installed = runCli(['packages', 'install', 'mas'], {
      ...commonEnv,
      ...oldReleaseSet.env,
    }) as any;
    assert.equal(installed.opl_agent_package_install.package_lock.package_version, '0.1.0');
    assert.equal(installed.opl_agent_package_install.package_lock.source_kind, 'developer_checkout_override');
    const installedLockBytes = fs.readFileSync(lockFile, 'utf8');
    const installedLedgerBytes = fs.readFileSync(ledgerFile, 'utf8');
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const pathFailure = runCliFailure([
      'packages', 'update', 'mas', '--agent-root', wrongCheckout,
    ], {
      ...commonEnv,
      ...nextReleaseSet.env,
    });
    assert.equal(pathFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      pathFailure.payload.error.details.failure_code,
      'first_party_package_developer_checkout_path_mismatch',
    );
    assert.equal(fs.readFileSync(lockFile, 'utf8'), installedLockBytes);
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), installedLedgerBytes);
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    updateDeveloperCapabilityCheckoutClosure({
      masCheckout,
      scholarCheckout,
      masManifestPath: nextMas,
      providerManifestPath: nextProvider,
      message: 'fixture B',
    });

    const preview = runCli(['packages', 'update', 'mas', '--dry-run'], {
      ...commonEnv,
      ...nextReleaseSet.env,
    }) as any;
    const previewUpdate = preview.opl_agent_package_update;
    assert.equal(previewUpdate.status, 'validated_no_write');
    assert.equal(previewUpdate.reconciliation_action, 'source_reconcile');
    assert.equal(previewUpdate.currentness.status, 'update_available');
    assert.ok(previewUpdate.currentness.reasons.includes('package_version_changed'));
    assert.equal(previewUpdate.target_version, '0.1.1');
    assert.equal(previewUpdate.package_lock.package_version, '0.1.1');
    assert.equal(previewUpdate.lifecycle_receipt.writes_performed, false);
    assert.equal(fs.existsSync(releaseCatalogCache), false);
    assert.equal(fs.readFileSync(lockFile, 'utf8'), installedLockBytes);
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), installedLedgerBytes);

    const updated = runCli(['packages', 'update', 'mas'], {
      ...commonEnv,
      ...nextReleaseSet.env,
    }) as any;
    const appliedUpdate = updated.opl_agent_package_update;
    assert.equal(appliedUpdate.status, 'updated');
    assert.equal(appliedUpdate.reconciliation_action, 'source_reconcile');
    assert.equal(appliedUpdate.currentness.status, 'update_available');
    assert.equal(appliedUpdate.package_lock.package_version, '0.1.1');
    assert.equal(appliedUpdate.package_lock.source_kind, 'developer_checkout_override');
    assert.deepEqual(
      appliedUpdate.dependency_package_locks.map((lock: any) => [
        lock.package_id,
        lock.package_version,
        lock.source_kind,
      ]),
      [
        ['mas-scholar-skills', '0.1.1', 'developer_checkout_override'],
        ['mas', '0.1.1', 'developer_checkout_override'],
      ],
    );
    const updatedLockIndex = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.deepEqual(
      updatedLockIndex.packages
        .map((lock: any) => [lock.package_id, lock.package_version, lock.source_kind])
        .sort((left: string[], right: string[]) => left[0].localeCompare(right[0])),
      [
        ['mas', '0.1.1', 'developer_checkout_override'],
        ['mas-scholar-skills', '0.1.1', 'developer_checkout_override'],
      ],
    );
    assert.equal(fs.readFileSync(masSentinel, 'utf8'), 'developer MAS source\n');
    assert.equal(fs.readFileSync(scholarSentinel, 'utf8'), 'developer ScholarSkills source\n');
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const driftedLockIndex = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const driftedScholarLock = driftedLockIndex.packages.find(
      (lock: any) => lock.package_id === 'mas-scholar-skills',
    );
    driftedScholarLock.source_kind = 'first_party_managed_cohort';
    fs.writeFileSync(lockFile, `${JSON.stringify(driftedLockIndex, null, 2)}\n`);
    const dependencyReconciled = runCli(['packages', 'update', 'mas'], {
      ...commonEnv,
      ...nextReleaseSet.env,
    }) as any;
    const dependencyUpdate = dependencyReconciled.opl_agent_package_update;
    assert.equal(dependencyUpdate.status, 'updated');
    assert.equal(dependencyUpdate.currentness.status, 'update_available');
    assert.deepEqual(dependencyUpdate.currentness.reasons, ['dependency_closure_changed']);
    assert.equal(
      dependencyUpdate.closure_currentness.find(
        (entry: any) => entry.package_id === 'mas-scholar-skills',
      ).status,
      'update_available',
    );
    assert.equal(
      dependencyUpdate.dependency_package_locks.find(
        (lock: any) => lock.package_id === 'mas-scholar-skills',
      ).source_kind,
      'developer_checkout_override',
    );
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const currentLockBytes = fs.readFileSync(lockFile, 'utf8');
    const currentLedgerBytes = fs.readFileSync(ledgerFile, 'utf8');
    const current = runCli(['packages', 'update', 'mas'], {
      ...commonEnv,
      ...nextReleaseSet.env,
    }) as any;
    const currentUpdate = current.opl_agent_package_update;
    assert.equal(currentUpdate.status, 'current_noop');
    assert.equal(currentUpdate.currentness.status, 'current');
    assert.equal(currentUpdate.reconciliation_action, null);
    assert.equal(currentUpdate.lifecycle_receipt, null);
    assert.deepEqual(
      currentUpdate.dependency_package_locks.map((lock: any) => [lock.package_id, lock.source_kind]),
      [
        ['mas-scholar-skills', 'developer_checkout_override'],
        ['mas', 'developer_checkout_override'],
      ],
    );
    assert.equal(fs.readFileSync(lockFile, 'utf8'), currentLockBytes);
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), currentLedgerBytes);
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const scholarHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: scholarCheckout,
      encoding: 'utf8',
    }).trim();
    fs.appendFileSync(developerFixture.providerHelperPath, 'offline dirty developer update\n');
    fs.rmSync(nextReleaseSet.catalogPath, { force: true });
    const offlineDeveloper = runCli(['packages', 'update', 'mas'], {
      ...commonEnv,
      ...nextReleaseSet.env,
    }) as any;
    const offlineUpdate = offlineDeveloper.opl_agent_package_update;
    const offlineProvider = offlineUpdate.dependency_package_locks.find(
      (entry: any) => entry.package_id === 'mas-scholar-skills',
    );
    assert.equal(offlineUpdate.status, 'updated');
    assert.equal(offlineUpdate.reconciliation_action, 'source_reconcile');
    assert.equal(offlineUpdate.release_catalog_freshness, null);
    assert.equal(offlineProvider.developer_checkout_source.source_git_head_sha, scholarHead);
    assert.match(
      fs.readFileSync(
        path.join(offlineProvider.physical_surface.codex_plugin_cache_path, 'skills', 'medical-manuscript-writing', 'helper.txt'),
        'utf8',
      ),
      /offline dirty developer update/,
    );
    assert.notEqual(execFileSync('git', ['status', '--porcelain'], {
      cwd: scholarCheckout,
      encoding: 'utf8',
    }), '');
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const providerSkillRoot = path.join(
      offlineProvider.physical_surface.codex_plugin_cache_path,
      'skills',
      'medical-manuscript-writing',
    );
    assert.equal(fs.statSync(offlineProvider.physical_surface.codex_plugin_cache_path).mode & 0o777, 0o555);
    assert.equal(fs.statSync(path.join(providerSkillRoot, 'SKILL.md')).mode & 0o777, 0o444);
    fs.chmodSync(providerSkillRoot, 0o755);
    const injectedSkillInstruction = path.join(providerSkillRoot, 'untracked-instruction.md');
    fs.writeFileSync(injectedSkillInstruction, 'must never enter a Skill projection\n', { mode: 0o444 });
    fs.chmodSync(providerSkillRoot, 0o555);
    assert.throws(() => materializeAgentPackageSkillProjection({
      root: offlineUpdate.package_lock,
      providers: [offlineProvider],
      dryRun: true,
    }), (error: any) =>
      error?.details?.failure_code === 'agent_package_plugin_cache_generation_invalid');
  } finally {
    removeFixtureTree(root);
  }
});
