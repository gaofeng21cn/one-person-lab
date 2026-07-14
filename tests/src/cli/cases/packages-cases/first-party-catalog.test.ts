import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import {
  assert,
  formatJsonPayload,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { resolveFirstPartyPackageCatalog } from '../../../../../src/modules/connect/agent-package-first-party.ts';
import {
  normalizeOplReleaseChannelTag,
  resolveOplReleaseManifestRef,
} from '../../../../../src/modules/connect/system-installation/release-channel.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

function writeFirstPartyCatalogFixture(version: string, ownerSourceCommit: string) {
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
  const packageArtifactManifest = {
    schemaVersion: 2,
    layers: [{ mediaType: PACKAGE_LAYER_MEDIA_TYPE, digest: `sha256:${archiveSha256}` }],
  };
  const packageArtifactManifestJson = JSON.stringify(packageArtifactManifest);
  const artifactDigest = `sha256:${crypto.createHash('sha256').update(packageArtifactManifestJson).digest('hex')}`;
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
  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  fs.writeFileSync(channelManifestPath, formatJsonPayload({
    release_set_generation: `fixture-${version}`,
    packages: {
      package_catalog: {
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
      },
    },
  }));
  const channelDigest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(channelManifestPath)).digest('hex')}`;
  const curlLogPath = path.join(root, 'curl.jsonl');
  const manifests = {
    'fixture/one-person-lab-manifest': {
      layers: [{ mediaType: CHANNEL_MANIFEST_LAYER_MEDIA_TYPE, digest: channelDigest }],
    },
    'fixture/one-person-lab-packages/opl-flow': packageArtifactManifest,
  };
  const blobs = {
    [channelDigest]: channelManifestPath,
    [`sha256:${archiveSha256}`]: archivePath,
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

test('first-party install and update lock one Release Set catalog member by version commit and digest', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-catalog-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-catalog-home-'));
  const first = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const second = writeFirstPartyCatalogFixture('0.2.1', '2'.repeat(40));
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
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
    assert.equal(installedLock.release_channel_ref, 'ghcr.io/fixture/one-person-lab-manifest:latest-stable');
    assert.equal(installedLock.release_channel_digest, first.channelDigest);
    assert.equal(installedLock.manifest_sha256, first.manifestSha256.replace(/^sha256:/, ''));
    assert.equal(installedLock.content_digest, first.manifestSha256);
    assert.equal(
      installedLock.managed_update_source.catalog_ref,
      'ghcr.io/fixture/one-person-lab-manifest:latest-stable',
    );
    assert.equal(installedLock.physical_surface.status, 'materialized');
    assert.equal(
      fs.readFileSync(path.join(installedLock.physical_surface.codex_plugin_cache_path, 'skills', 'opl-flow', 'SKILL.md'), 'utf8'),
      '# OPL Flow\n\nFirst-party catalog fixture.\n',
    );
    const firstChannelReads = fs.readFileSync(first.curlLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('/one-person-lab-manifest/manifests/latest-stable'));
    assert.equal(firstChannelReads.length, 1);

    const updated = runCli(['packages', 'update', 'opl-flow'], {
      ...commonEnv,
      ...second.env,
    }) as any;
    const updatedLock = updated.opl_agent_package_update.package_lock;
    assert.equal(updatedLock.package_version, '0.2.1');
    assert.equal(updatedLock.owner_source_commit, '2'.repeat(40));
    assert.equal(updatedLock.source_artifact_ref, second.sourceArtifactRef);
    assert.equal(updatedLock.artifact_digest, second.artifactDigest);
    assert.equal(updatedLock.release_channel_digest, second.channelDigest);
    assert.equal(updatedLock.manifest_sha256, second.manifestSha256.replace(/^sha256:/, ''));
    assert.equal(updated.opl_agent_package_update.lifecycle_receipt.owner_source_commit, '2'.repeat(40));
    assert.equal(updated.opl_agent_package_update.lifecycle_receipt.artifact_digest, second.artifactDigest);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
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
    assert.equal(failure.payload.error.details.failure_code, 'first_party_package_catalog_selection_invalid');
    assert.deepEqual(failure.payload.error.details.failures, ['owner_source_commit_invalid']);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('first-party activation rejects an internally resolved catalog member without an immutable owner commit', () => {
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

    const failure = runCliFailure([
      'packages', 'activate', 'opl-flow',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], {
      ...commonEnv,
      ...invalidFixture.env,
    });
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'first_party_package_catalog_selection_invalid');
    assert.deepEqual(failure.payload.error.details.failures, ['owner_source_commit_invalid']);
    assert.equal(JSON.parse(fs.readFileSync(pluginPath, 'utf8')).version, '0.2.0');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(installedFixture.root, { recursive: true, force: true });
    fs.rmSync(invalidFixture.root, { recursive: true, force: true });
  }
});
