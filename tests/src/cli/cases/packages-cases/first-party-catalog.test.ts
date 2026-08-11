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
  repoRoot,
  removeFixtureTree,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { createFakeCodexPluginManagerFixture } from '../../helpers.ts';
import { resolveFirstPartyPackageCatalog } from '../../../../../src/modules/connect/agent-package-first-party.ts';
import { refreshFirstPartyPackageCatalogSnapshot } from '../../../../../src/modules/connect/agent-package-registry-parts/first-party-release-catalog.ts';
import { normalizeManifest } from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';
import { assertFirstPartyPackageUpdateSelection } from '../../../../../src/modules/connect/agent-package-registry-parts/update-reconciliation.ts';
import {
  normalizeOplReleaseChannelTag,
  resolveOplReleaseManifestRef,
} from '../../../../../src/modules/connect/system-installation/release-channel.ts';
import { computePackageChannelTreeSha256 } from '../../../../../src/modules/connect/system-installation/module-package-channel.ts';
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
const FLOW_SKILL_IDS = [
  'coordinate-concurrent-tasks',
  'codex-app-owner-migration',
  'develop-and-deliver',
  'github-ssot-patrol',
  'opl-doc',
  'opl-fleet',
  'opl-flow',
  'recover-codex-tasks',
  'task-mode-gate',
];

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

function withMasOwnerGateFixturePath(
  releaseEnv: Record<string, string>,
  binRoot: string,
) {
  return {
    ...releaseEnv,
    PATH: `${binRoot}${path.delimiter}${releaseEnv.PATH ?? process.env.PATH ?? ''}`,
  };
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

function addConfiguredCarrierToCapabilityFixture(manifestPath: string) {
  const sourceRoot = path.dirname(manifestPath);
  const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as any;
  const marketplaceId = `${manifest.package_id}-local`;
  manifest.codex_surface = {
    ...manifest.codex_surface,
    configured_codex_plugin_carrier: {
      kind: 'codex_plugin_manager',
      plugin_selector: `${manifest.package_id}@${marketplaceId}`,
      executor_route: 'codex_cli',
      marketplace_source: sourceRoot,
      publication_ref: `ghcr.io/fixture/one-person-lab-packages/${manifest.package_id}:latest-stable`,
    },
  };
  fs.mkdirSync(path.join(sourceRoot, '.agents', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, '.agents', 'plugins', 'marketplace.json'), formatJsonPayload({
    name: marketplaceId,
    plugins: [{
      name: manifest.package_id,
      source: { source: 'local', path: './' },
    }],
  }));
  fs.writeFileSync(manifestPath, formatJsonPayload(manifest));
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), formatJsonPayload(manifest));
  return sourceRoot;
}

function writeDeveloperMasCarrierAuthority(input: {
  masCheckout: string;
  scholarCheckout: string;
  masManifestPath: string;
  providerManifestPath: string;
}) {
  const masManifest = parseJsonText(fs.readFileSync(input.masManifestPath, 'utf8')) as any;
  const providerManifest = parseJsonText(
    fs.readFileSync(input.providerManifestPath, 'utf8'),
  ) as any;
  assert.ok(masManifest.codex_surface?.configured_codex_plugin_carrier);
  assert.ok(providerManifest.codex_surface?.configured_codex_plugin_carrier);

  const masPluginRoot = path.join(input.masCheckout, 'plugins', 'med-autoscience');
  const openAiInterface = { displayName: 'Med Auto Science' };
  fs.writeFileSync(path.join(masPluginRoot, 'plugin.json'), formatJsonPayload({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'med-autoscience',
    version: masManifest.version,
    description: 'Developer checkout fixture.',
    extensions: { 'com.openai': { interface: openAiInterface } },
  }));
  fs.writeFileSync(
    path.join(masPluginRoot, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'med-autoscience',
      version: masManifest.version,
      description: 'Developer checkout fixture.',
      skills: './skills/',
      interface: openAiInterface,
    }),
  );
  fs.writeFileSync(path.join(masPluginRoot, 'opl-package.json'), formatJsonPayload(masManifest));
  fs.writeFileSync(
    path.join(input.scholarCheckout, 'opl-package.json'),
    formatJsonPayload(providerManifest),
  );
  for (const [checkout, marketplace] of [
    [input.masCheckout, {
      name: 'med-autoscience-local',
      plugins: [{
        name: 'med-autoscience',
        source: { source: 'local', path: './plugins/med-autoscience' },
      }],
    }],
    [input.scholarCheckout, {
      name: 'mas-scholar-skills-local',
      plugins: [{
        name: 'mas-scholar-skills',
        source: { source: 'local', path: './' },
      }],
    }],
  ] as const) {
    const marketplacePath = path.join(checkout, '.agents', 'plugins', 'marketplace.json');
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    fs.writeFileSync(marketplacePath, formatJsonPayload(marketplace));
  }
}

function writeOmaOwnerReleaseFixture(input: {
  root: string;
  generation: string;
  completeRuntime?: boolean;
}) {
  const sourceRoot = path.join(input.root, 'oma-source');
  const manifestPath = path.join(sourceRoot, 'oma.json');
  const requiredRuntimeFiles = [
    'contracts/action_catalog.json',
    'contracts/domain_descriptor.json',
    ...(input.completeRuntime === false ? [] : ['contracts/foundry_provider.json']),
    'contracts/pack_compiler_input.json',
    'agent/stages/manifest.json',
    'agent/primary_skill/SKILL.md',
  ];
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'skills', 'opl-meta-agent'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'opl-meta-agent',
    version: '0.4.3',
  }));
  fs.writeFileSync(
    path.join(sourceRoot, 'skills', 'opl-meta-agent', 'SKILL.md'),
    '# OPL Meta Agent fixture\n',
  );
  fs.writeFileSync(path.join(sourceRoot, 'fixture-generation.txt'), `${input.generation}\n`);
  for (const relativePath of requiredRuntimeFiles) {
    const targetPath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      relativePath.endsWith('.md')
        ? `# ${input.generation}\n`
        : formatJsonPayload({ fixture_generation: input.generation }),
    );
  }
  fs.writeFileSync(manifestPath, formatJsonPayload({
    ...agentPackageManifest({
      packageId: 'oma',
      agentId: 'oma',
      pluginId: 'opl-meta-agent',
      distributionPayload: null,
    }),
    display_name: 'OPL Meta Agent fixture',
    publisher: 'one-person-lab',
    version: '0.4.3',
    source: 'first_party',
    codex_surface: {
      plugin_id: 'opl-meta-agent',
      required_skill_ids: ['opl-meta-agent'],
    },
    runtime_source_carrier: {
      carrier_kind: 'opl_managed_module_source',
      module_id: 'oplmetaagent',
    },
    capability_dependencies: [],
  }));
  const releaseSet = writeCapabilityCatalog(
    path.join(input.root, 'release-set'),
    [manifestPath],
  );
  const ownerChannel = writePackageOwnerChannelFixture({
    root: input.root,
    binRoot: path.join(input.root, 'bin'),
    catalogPath: releaseSet.catalogPath,
    packageIds: ['oma'],
  });
  return { releaseSet, ownerChannel };
}

function writeFirstPartyCatalogFixture(
  version: string,
  ownerSourceCommit: string,
  options: {
    manifestCarrierSourceCommit?: string | null;
    requiredSkillIds?: string[];
    configuredCarrier?: boolean;
    configuredCarrierMarketplaceSource?: string;
  } = {},
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
    skills: './skills/',
  });
  const requiredSkillIds = options.requiredSkillIds ?? FLOW_SKILL_IDS;
  const skillMarkdown = (skillId: string) =>
    `# ${skillId === 'opl-flow' ? 'OPL Flow' : skillId}\n\nFirst-party catalog fixture.\n`;
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
      mode_default: 'auto',
      configured_default: {
        model: 'gpt-5.6-sol',
        reasoning_effort: 'max',
      },
      override_precedence: [
        'explicit_user_override',
        'opl_flow_recommendation',
        'fresh_codex_model_catalog',
        'app_fallback_when_flow_unavailable',
      ],
      catalog_policy: {
        source: 'codex_cli_model_list',
        prefer_live_default_when_user_has_not_pinned: true,
        unknown_model_reasoning_effort: 'highest_supported',
        preserve_unavailable_fixed_selection_until_user_changes_it: true,
      },
    },
  });
  const workflowPolicySchema = formatJsonPayload({ type: 'object' });
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, '.agents', 'plugins'), { recursive: true });
  for (const skillId of requiredSkillIds) {
    fs.mkdirSync(path.join(sourceRoot, 'skills', skillId), { recursive: true });
  }
  fs.mkdirSync(path.join(sourceRoot, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, '.codex-plugin', 'plugin.json'), pluginJson);
  fs.writeFileSync(
    path.join(sourceRoot, '.agents', 'plugins', 'marketplace.json'),
    formatJsonPayload({
      name: 'opl-flow-local',
      plugins: [{
        name: 'opl-flow',
        source: { source: 'local', path: './' },
      }],
    }),
  );
  for (const skillId of requiredSkillIds) {
    fs.writeFileSync(path.join(sourceRoot, 'skills', skillId, 'SKILL.md'), skillMarkdown(skillId));
  }
  fs.writeFileSync(path.join(sourceRoot, 'templates', 'AGENTS.md'), agentsMarkdown);
  fs.writeFileSync(path.join(sourceRoot, 'templates', 'TASTE.md'), tasteMarkdown);
  fs.writeFileSync(path.join(sourceRoot, 'contracts', 'workflow-policy.json'), workflowPolicy);
  fs.writeFileSync(path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json'), workflowPolicySchema);
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
      ...(options.configuredCarrier === false ? {} : {
        configured_codex_plugin_carrier: {
          kind: 'codex_plugin_manager',
          plugin_selector: 'opl-flow@opl-flow-local',
          executor_route: 'codex_cli',
          marketplace_source: options.configuredCarrierMarketplaceSource ?? sourceRoot,
          publication_ref: 'ghcr.io/fixture/one-person-lab-packages/opl-flow:latest-stable',
        },
      }),
      required_skill_ids: requiredSkillIds,
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
  const manifestJson = formatJsonPayload(manifest);
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), manifestJson);
  const archivePath = path.join(root, `opl-flow-${version}.tar.gz`);
  execFileSync('tar', ['-czf', archivePath, 'opl-flow'], { cwd: sourceParent });
  const archiveSha256 = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
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
      ...requiredSkillIds.map((skillId) => ({
        path: `skills/${skillId}/SKILL.md`,
        source_path: `skills/${skillId}/SKILL.md`,
        source_artifact_ref: sourceArtifactRef,
        migration_source_url: `https://raw.githubusercontent.com/fixture/opl-flow/${ownerSourceCommit}/skills/${skillId}/SKILL.md`,
        sha256: `sha256:${crypto.createHash('sha256').update(skillMarkdown(skillId)).digest('hex')}`,
      })),
      ...[
        ['opl-package.json', manifestJson],
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
  const curlLogPath = path.join(root, 'curl.jsonl');
  const manifests = {
    'fixture/one-person-lab-packages/opl-flow': packageArtifactManifest,
  };
  const blobs = {
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
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  return {
    root,
    sourceRoot,
    env: {
      OPL_PACKAGES_OWNER: 'fixture',
      OPL_PACKAGE_CHANNEL_TAG: 'stable',
      OPL_CODEX_PLUGIN_BIN: codex.codexPath,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    artifactDigest,
    manifestSha256,
    sourceArtifactRef,
    curlLogPath,
  };
}

function writeDescriptorOwnedFlowCarrier(input: {
  root: string;
  version: string;
  localManagedPolicy?: boolean;
}) {
  const marketplaceId = 'opl-agent-opl-flow-local';
  const marketplaceRoot = path.join(input.root, 'marketplace');
  const pluginRoot = path.join(marketplaceRoot, 'plugins', 'opl-flow');
  const selector = `opl-flow@${marketplaceId}`;
  const manifest = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'opl-flow.json'),
    'utf8',
  ));
  manifest.version = input.version;
  manifest.codex_surface.required_skill_ids = FLOW_SKILL_IDS;
  manifest.codex_surface.configured_codex_plugin_carrier = {
    kind: 'codex_plugin_manager',
    plugin_selector: selector,
    executor_route: 'codex_cli',
    marketplace_source: marketplaceRoot,
    publication_ref: null,
  };
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  for (const skillId of FLOW_SKILL_IDS) {
    fs.mkdirSync(path.join(pluginRoot, 'skills', skillId), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`);
  }
  fs.writeFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'opl-flow',
    version: input.version,
    skills: './skills/',
  }));
  fs.writeFileSync(path.join(pluginRoot, 'opl-package.json'), formatJsonPayload(manifest));
  if (input.localManagedPolicy) {
    fs.mkdirSync(path.join(pluginRoot, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, 'contracts', 'workflow-policy.json'), formatJsonPayload({
      schema: 'opl_flow_workflow_policy.v3',
      package: { id: 'opl-flow', version: input.version, owner: 'opl-flow', kind: 'workflow_profile' },
      workflow_generation: 'fixture-local-repair',
      provides: [
        {
          id: 'opl-flow',
          kind: 'codex_plugin',
          owner: 'opl-flow',
          source: 'package:opl-flow',
          online_install_default: true,
          activation: 'always',
        },
        ...FLOW_SKILL_IDS.map((skillId) => ({
          id: skillId,
          kind: 'codex_skill',
          owner: 'opl-flow',
          source: 'https://github.com/fixture/opl-flow',
          source_path: `skills/${skillId}`,
          online_install_default: true,
          activation: 'task_routed',
        })),
      ],
      requires: [],
      recommends: [{
        id: 'fixture-managed-skill',
        kind: 'codex_skill',
        owner: 'fixture-owner',
        install_source: 'framework_git_projection',
        lifecycle_owner: 'opl-framework',
        online_install_default: true,
        activation: 'task_routed',
        source: 'https://github.com/fixture/managed-skill',
        source_path: 'skill',
      }],
      compatible_optional: [],
      conflicts: [{
        id: 'fixture-retirement',
        discovery_ids: ['fixture-retired'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      }],
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
        plugin_ids: ['fixture-retired'],
        skill_ids: ['fixture-retired'],
        service_ids: ['fixture-retired'],
        config_markers: ['fixture-retired'],
        legacy_prompt_ids: ['fixture-retired'],
      },
      codex_model_policy: {
        authority: 'opl-flow',
        mode_default: 'auto',
        configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
        override_precedence: ['explicit_user_override', 'opl_flow_recommendation'],
        catalog_policy: {},
      },
    }));
    fs.writeFileSync(path.join(pluginRoot, 'contracts', 'workflow-policy.schema.json'), formatJsonPayload({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    }));
  }
  fs.mkdirSync(path.join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    formatJsonPayload({
      name: marketplaceId,
      plugins: [{
        name: 'opl-flow',
        source: { source: 'local', path: './plugins/opl-flow' },
      }],
    }),
  );
  return { marketplaceRoot, pluginRoot, selector };
}

function seedDescriptorOwnedFlowCarrier(input: {
  codexPath: string;
  carrier: ReturnType<typeof writeDescriptorOwnedFlowCarrier>;
  env: Record<string, string>;
}) {
  execFileSync(input.codexPath, [
    'plugin', 'marketplace', 'add', input.carrier.marketplaceRoot, '--json',
  ], { env: { ...process.env, ...input.env }, stdio: 'ignore' });
  execFileSync(input.codexPath, [
    'plugin', 'add', input.carrier.selector, '--json',
  ], { env: { ...process.env, ...input.env }, stdio: 'ignore' });
}

function writeNoopPluginAddWrapper(root: string, delegate: string) {
  const binary = path.join(root, 'noop-plugin-add-codex');
  fs.writeFileSync(binary, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (process.env.FIXTURE_PLUGIN_ADD_NOOP === '1'
  && args[0] === 'plugin'
  && args[1] === 'add') {
  process.stdout.write(JSON.stringify({ status: 'ok' }));
  process.exit(0);
}
const result = spawnSync(${JSON.stringify(delegate)}, args, {
  env: process.env,
  encoding: 'utf8',
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  return binary;
}

function writeCarrierReadbackOverrideWrapper(root: string, delegate: string) {
  const binary = path.join(root, 'carrier-readback-override-codex');
  fs.writeFileSync(binary, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const result = spawnSync(${JSON.stringify(delegate)}, args, {
  env: process.env,
  encoding: 'utf8',
});
if (result.status === 0
  && args.join(' ') === 'plugin list --json'
  && process.env.FIXTURE_CARRIER_SOURCE_CONTAINS) {
  const payload = JSON.parse(result.stdout || '{}');
  for (const entry of payload.installed || []) {
    if (!entry?.source?.path?.includes(process.env.FIXTURE_CARRIER_SOURCE_CONTAINS)) continue;
    if (process.env.FIXTURE_CARRIER_CLEAR_VERSION === '1') entry.version = null;
    else if (process.env.FIXTURE_CARRIER_VERSION) entry.version = process.env.FIXTURE_CARRIER_VERSION;
    if (process.env.FIXTURE_CARRIER_SOURCE_PATH) entry.source.path = process.env.FIXTURE_CARRIER_SOURCE_PATH;
    if (process.env.FIXTURE_CARRIER_MARKETPLACE_SOURCE) {
      entry.marketplaceSource = {
        sourceType: 'remote',
        source: process.env.FIXTURE_CARRIER_MARKETPLACE_SOURCE,
      };
    }
  }
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  return binary;
}

function writeRelayOwnerFixture(root: string) {
  const ownerRoot = path.join(root, 'relay-owner');
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/opl-relay.json'),
    'utf8',
  )) as Record<string, any>;
  const manifestPath = path.join(ownerRoot, 'package-manifest.json');
  fs.mkdirSync(path.join(ownerRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(ownerRoot, 'skills', 'opl-relay'), { recursive: true });
  fs.writeFileSync(manifestPath, formatJsonPayload(manifest));
  fs.writeFileSync(path.join(ownerRoot, 'opl-package.json'), formatJsonPayload(manifest));
  fs.writeFileSync(path.join(ownerRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'opl-relay',
    version: manifest.version,
    skills: './skills/',
  }));
  fs.writeFileSync(path.join(ownerRoot, 'skills', 'opl-relay', 'SKILL.md'), '# OPL Relay fixture\n');
  return {
    ownerRoot,
    manifest,
    releaseSet: writeCapabilityCatalog(path.join(root, 'relay-release-set'), [manifestPath]),
  };
}

function writeRelayCodexFixture(binary: string, stateFile: string, sourcePath: string) {
  fs.writeFileSync(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const statePath = ${JSON.stringify(stateFile)};
const sourcePath = ${JSON.stringify(sourcePath)};
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { installed: false, marketplace: null };
const command = args.join(' ');
if (command === 'plugin marketplace list --json') {
  process.stdout.write(JSON.stringify({
    marketplaces: state.marketplace ? [{ marketplaceSource: { source: state.marketplace } }] : [],
  }));
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  state.marketplace = args[3];
  fs.writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write('{}');
} else if (args[0] === 'plugin' && args[1] === 'add') {
  state.installed = true;
  state.version = JSON.parse(
    fs.readFileSync(sourcePath + '/.codex-plugin/plugin.json', 'utf8'),
  ).version;
  fs.writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write('{}');
} else if (args[0] === 'plugin' && args[1] === 'remove') {
  state.installed = false;
  fs.writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write('{}');
} else if (command === 'plugin list --json') {
  process.stdout.write(JSON.stringify({
    installed: state.installed ? [{
      pluginId: 'opl-relay@opl-relay',
      version: state.version,
      installed: true,
      enabled: true,
      source: { source: 'local', path: sourcePath },
      marketplaceSource: { sourceType: 'local', source: state.marketplace },
    }] : [],
    available: [],
  }));
} else {
  process.exitCode = 2;
}
`, { mode: 0o755 });
}

test('first-party package selection resolves its independent owner latest-stable channel', () => {
  const previousOwner = process.env.OPL_PACKAGES_OWNER;
  const previousTag = process.env.OPL_PACKAGE_CHANNEL_TAG;
  const previousVersion = process.env.OPL_PACKAGE_CHANNEL_VERSION;
  const previousManifestRef = process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF;
  delete process.env.OPL_PACKAGES_OWNER;
  delete process.env.OPL_PACKAGE_CHANNEL_TAG;
  delete process.env.OPL_PACKAGE_CHANNEL_VERSION;
  process.env.OPL_PACKAGE_CHANNEL_MANIFEST_REF = 'ghcr.io/stale/one-person-lab-manifest:latest-stable';
  try {
    const selection = resolveFirstPartyPackageCatalog('opl-flow');

    assert.deepEqual(selection, {
      canonicalId: 'opl-flow',
      trustTier: 'first_party',
      sourceKind: 'first_party_managed_cohort',
      catalogSource: {
        kind: 'managed_version_catalog',
        transport: 'opl_oci_channel',
        catalog_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-flow:latest-stable',
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

test('Relay carrier projection is explicit in the Framework manifest and capability schema', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/opl-relay.json'),
    'utf8',
  )) as any;
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/capability-package-manifest.schema.json'),
    'utf8',
  )) as any;
  const carrier = manifest.codex_surface.configured_codex_plugin_carrier;
  const carrierSchema = schema.properties.codex_surface.properties.configured_codex_plugin_carrier;
  assert.deepEqual(carrier, {
    kind: 'codex_plugin_manager',
    plugin_selector: 'opl-relay@opl-relay',
    executor_route: 'codex_cli',
    marketplace_source: 'gaofeng21cn/opl-relay',
    publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-relay:latest-stable',
  });
  assert.deepEqual(carrierSchema.required, [
    'kind',
    'plugin_selector',
    'executor_route',
    'marketplace_source',
    'publication_ref',
  ]);
  assert.equal(carrierSchema.properties.kind.const, 'codex_plugin_manager');
  assert.equal(carrierSchema.properties.executor_route.const, 'codex_cli');
  assert.equal(carrierSchema.additionalProperties, false);
});

test('legacy top-level managed update source is accepted as inert input but omitted from normalized manifests', () => {
  const manifestUrl = 'https://packages.example.test/third-party-research/manifest.json';
  const manifest = normalizeManifest({
    ...agentPackageManifest(),
    managed_update_source: {
      kind: 'managed_version_catalog',
      transport: 'json_url',
      catalog_ref: './catalog.json',
      selection_policy: 'highest_stable',
      digest_authority: 'manifest_and_content_digest',
    },
  }, manifestUrl);

  assert.equal('managed_update_source' in manifest, false);
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
    assert.equal(snapshot.catalog_digest, fixture.artifactDigest);
    assert.equal(
      snapshot.catalog.get('opl-flow')?.versions[0]?.selection_status,
      'selected_for_owner_channel',
    );
    assert.equal(Object.hasOwn(snapshot, 'release_set_descriptor_digest'), false);
    assert.equal(Object.hasOwn(snapshot, 'channel_manifest_layer_digest'), false);
    assert.equal(Object.hasOwn(snapshot, 'package_catalog_digest'), false);
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

test('bare Relay install resolves its carrier from the live owner artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-relay-bare-owner-'));
  const fixture = writeRelayOwnerFixture(root);
  const binary = path.join(root, 'fake-codex');
  const stateFile = path.join(root, 'plugin-state.json');
  const stateDir = path.join(root, 'opl-state');
  writeRelayCodexFixture(binary, stateFile, fixture.ownerRoot);
  const env = {
    ...fixture.releaseSet.env,
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
  };
  try {
    const installed = runCli(['packages', 'install', 'opl-relay'], env) as any;
    const surface = installed.opl_agent_package_install;
    assert.equal(surface.status, 'installed');
    assert.equal(surface.package_id, 'opl-relay');
    assert.equal(surface.configured_carrier.carrier.plugin_id, 'opl-relay@opl-relay');
    assert.equal(
      surface.configured_carrier.publication_ref,
      'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-relay:latest-stable',
    );
    assert.equal(Object.hasOwn(surface, 'package_lock'), false);
    assert.equal(Object.hasOwn(surface, 'lifecycle_receipt'), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('Relay owner source failure is typed and does not enter Framework lifecycle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-relay-owner-failure-'));
  const fixture = writeRelayOwnerFixture(root);
  const binary = path.join(root, 'fake-codex');
  const stateFile = path.join(root, 'plugin-state.json');
  const stateDir = path.join(root, 'opl-state');
  writeRelayCodexFixture(binary, stateFile, fixture.ownerRoot);
  const env = {
    ...fixture.releaseSet.env,
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    OPL_PACKAGES_OWNER: 'missing',
    OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/missing/one-person-lab-manifest:latest-stable',
  };
  try {
    const failure = runCliFailure(['packages', 'install', 'opl-relay'], env);
    assert.equal(
      failure.payload.error.details.failure_code,
      'agent_package_capability_channel_unavailable',
    );
    assert.equal(
      failure.payload.error.details.command.some((part: string) => part.includes(
        'one-person-lab-packages/opl-relay',
      )),
      true,
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('first-party identities reject explicit registries and unowned local manifests without state writes', () => {
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
    assert.match(registryInstall.payload.error.message, /per-Package owner OCI latest-stable channel/);
    assert.doesNotMatch(registryInstall.payload.error.message, /Release Set/);

    const masOwner = resolveFirstPartyPackageCatalog('mas');
    assert.ok(masOwner);
    assert.throws(
      () => assertFirstPartyPackageUpdateSelection(
        { packageId: 'mas', registryUrl },
        masOwner,
        {
          package_id: 'mas',
          module_id: 'medautoscience',
          desired_source_kind: 'first_party_managed_cohort',
          effective_install_update_source: 'package_channel',
          configured_by: 'package_distribution',
          reason: 'package_distribution',
          developer_checkout_path: null,
          developer_checkout_available: false,
          package_channel_auto_update: true,
        },
      ),
      (error: any) => {
        assert.equal(error?.details?.failure_code, 'first_party_package_explicit_source_forbidden');
        assert.match(error.message, /per-Package owner OCI latest-stable channel/);
        assert.doesNotMatch(error.message, /Release Set/);
        return true;
      },
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
    assert.match(registryAction.payload.error.message, /per-Package owner OCI latest-stable channel/);
    assert.doesNotMatch(registryAction.payload.error.message, /Release Set/);

    const manifestAction = runCliFailure([
      'app', 'action', 'execute',
      '--action', 'install_from_manifest_url',
      '--payload', JSON.stringify({ manifest_url: manifestUrl, trust_tier: 'first_party' }),
    ], env);
    assert.equal(
      manifestAction.payload.error.details.failure_code,
      'agent_package_lifecycle_native_owner_required',
    );
    assert.match(manifestAction.payload.error.message, /configured native carrier/);
    assert.doesNotMatch(manifestAction.payload.error.message, /Release Set/);
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
  const codex = createFakeCodexPluginManagerFixture(path.join(stateDir, 'fake-codex'));
  const first = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const second = writeFirstPartyCatalogFixture('0.2.1', '2'.repeat(40));
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
    OPL_CLI_TEST_TIMEOUT_MS: '90000',
  };
  try {
    const installedAction = runCli([
      'app', 'action', 'execute',
      '--action', 'install_from_manifest_url',
      '--payload', JSON.stringify({ package_id: 'opl-flow' }),
    ], {
      ...first.env,
      ...commonEnv,
    }) as any;
    assert.equal(
      installedAction.app_action_execution.delegated_surface,
      'opl packages install --manifest-url <manifest_url>',
    );
    const installed = installedAction.app_action_execution.result;
    const installedSurface = installed.opl_agent_package_install;
    assert.equal(installedSurface.status, 'installed');
    assert.equal(installedSurface.package_id, 'opl-flow');
    assert.equal(installedSurface.configured_carrier.installed_version, '0.2.0');
    assert.equal(installedSurface.configured_carrier.executor.status, 'callable');
    assert.equal(installedSurface.configured_carrier.plugin_source_path, first.sourceRoot);
    const firstOwnerReads = fs.readFileSync(first.curlLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('/one-person-lab-packages/opl-flow/manifests/latest-stable'));
    assert.equal(firstOwnerReads.length, 1);
    assert.equal(
      fs.readFileSync(first.curlLogPath, 'utf8').includes('/one-person-lab-manifest/'),
      false,
    );

    const updated = runCli(['packages', 'update', 'opl-flow'], {
      ...second.env,
      ...commonEnv,
    }) as any;
    const updatedSurface = updated.opl_agent_package_update;
    assert.equal(updatedSurface.status, 'updated');
    assert.equal(updatedSurface.target_version, '0.2.1');
    assert.equal(updatedSurface.observed_version, '0.2.1');
    assert.equal(updatedSurface.currentness.status, 'update_available');
    assert.equal(updatedSurface.target_source_artifact_ref, second.sourceArtifactRef);
    assert.equal(updatedSurface.configured_carrier.plugin_source_path, second.sourceRoot);
    const secondOwnerReads = fs.readFileSync(second.curlLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('/one-person-lab-packages/opl-flow/manifests/latest-stable'));
    assert.equal(secondOwnerReads.length, 1);
    assert.equal(fs.readFileSync(second.curlLogPath, 'utf8').includes('/one-person-lab-manifest/'), false);
    for (const fileName of [
      'agent-package-locks.json',
      'agent-package-lifecycle-ledger.json',
      'agent-package-registry-cache.json',
    ]) {
      assert.equal(fs.existsSync(path.join(stateDir, fileName)), false, fileName);
    }
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
  }
});

test('descriptor-owned Flow update adopts the exact live owner target and becomes a current no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-descriptor-adoption-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const codexHome = path.join(homeDir, '.codex');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const currentOwner = writeFirstPartyCatalogFixture('0.1.31', '1'.repeat(40), {
    requiredSkillIds: FLOW_SKILL_IDS,
  });
  const nextOwner = writeFirstPartyCatalogFixture('0.1.32', '2'.repeat(40), {
    requiredSkillIds: FLOW_SKILL_IDS,
  });
  const carrier = writeDescriptorOwnedFlowCarrier({ root, version: '0.1.31' });
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
    OPL_CLI_TEST_TIMEOUT_MS: '90000',
  };
  try {
    seedDescriptorOwnedFlowCarrier({ codexPath: codex.codexPath, carrier, env: commonEnv });

    const adopted = runCli(['packages', 'update', 'opl-flow'], {
      ...currentOwner.env,
      ...commonEnv,
    }) as any;
    const adoptedSurface = adopted.opl_agent_package_update;
    assert.equal(adoptedSurface.status, 'updated');
    assert.equal(adoptedSurface.currentness.status, 'update_available');
    assert.ok(adoptedSurface.currentness.reasons.includes('configured_carrier_route_changed'));
    assert.equal(adoptedSurface.configured_carrier.plugin_source_path, currentOwner.sourceRoot);

    const current = runCli(['packages', 'update', 'opl-flow'], {
      ...currentOwner.env,
      ...commonEnv,
    }) as any;
    const currentSurface = current.opl_agent_package_update;
    assert.equal(currentSurface.status, 'current_noop');
    assert.equal(currentSurface.currentness.status, 'current');
    assert.equal(currentSurface.target_version, '0.1.31');
    assert.equal(currentSurface.observed_version, '0.1.31');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const repaired = runCli(['packages', 'repair', '--package-id', 'opl-flow'], {
      ...currentOwner.env,
      ...commonEnv,
    }) as any;
    const repairedSurface = repaired.opl_agent_package_repair;
    assert.equal(repairedSurface.status, 'repaired');
    assert.equal(repairedSurface.currentness.status, 'current');
    assert.equal(repairedSurface.target_version, '0.1.31');
    assert.equal(repairedSurface.observed_version, '0.1.31');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const updated = runCli(['packages', 'update', 'opl-flow'], {
      ...nextOwner.env,
      ...commonEnv,
    }) as any;
    const updatedSurface = updated.opl_agent_package_update;
    assert.equal(updatedSurface.status, 'updated');
    assert.equal(updatedSurface.currentness.status, 'update_available');
    assert.ok(updatedSurface.currentness.reasons.includes('package_version_changed'));
    assert.equal(updatedSurface.target_version, '0.1.32');
    assert.equal(updatedSurface.configured_carrier.installed_version, '0.1.32');
    assert.equal(updatedSurface.configured_carrier.plugin_source_path, nextOwner.sourceRoot);
    assert.equal(updatedSurface.target_source_artifact_ref, nextOwner.sourceArtifactRef);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const status = runCli(['packages', 'status', '--package-id', 'opl-flow'], commonEnv) as any;
    assert.equal(status.opl_agent_package_status.installed_package_count, 1);
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'installed_packages'), false);
    assert.equal(status.opl_agent_package_status.configured_carrier.installed_version, '0.1.32');

    for (const [args, surfaceKey] of [
      [['packages', 'update', 'opl-flow'], 'opl_agent_package_update'],
      [['packages', 'repair', '--package-id', 'opl-flow'], 'opl_agent_package_repair'],
    ] as const) {
      const preserved = runCli([...args], {
        ...currentOwner.env,
        ...commonEnv,
      }) as any;
      const surface = preserved[surfaceKey];
      assert.equal(surface.status, 'current_noop');
      assert.equal(surface.currentness.status, 'newer_source_preserved');
      assert.ok(surface.currentness.reasons.includes('newer_installed_version_preserved'));
      assert.equal(surface.reconciliation_action, 'preserve_newer_installed_source');
      assert.equal(surface.observed_version, '0.1.32');
      assert.equal(surface.target_version, '0.1.31');
      assert.equal(surface.configured_carrier.plugin_source_path, nextOwner.sourceRoot);
    }
  } finally {
    removeFixtureTree(root);
    fs.rmSync(currentOwner.root, { recursive: true, force: true });
    fs.rmSync(nextOwner.root, { recursive: true, force: true });
  }
});

test('descriptor-owned Flow repair completes locally before an unavailable owner channel', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-local-repair-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const carrier = writeDescriptorOwnedFlowCarrier({
    root,
    version: '0.1.42',
    localManagedPolicy: true,
  });
  const curlMarker = path.join(root, 'curl-called');
  const binRoot = path.join(root, 'bin');
  fs.mkdirSync(binRoot, { recursive: true });
  fs.writeFileSync(path.join(binRoot, 'curl'), [
    '#!/usr/bin/env bash',
    `touch ${JSON.stringify(curlMarker)}`,
    'exit 97',
    '',
  ].join('\n'), { mode: 0o755 });
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
    OPL_PACKAGES_OWNER: 'unavailable-fixture',
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    PATH: `${binRoot}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  try {
    const repositoryUrl = 'https://github.com/fixture/managed-skill';
    const repositoryDigest = crypto.createHash('sha256')
      .update(repositoryUrl)
      .digest('hex')
      .slice(0, 20);
    const repositoryRoot = path.join(
      env.CODEX_HOME,
      'opl-companion-sources',
      'github',
      repositoryDigest,
    );
    const skillRoot = path.join(repositoryRoot, 'skill');
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), [
      '---',
      'name: fixture-managed-skill',
      'description: First-party local repair fixture.',
      '---',
      '',
      '# Fixture Managed Skill',
      '',
    ].join('\n'), 'utf8');
    execFileSync('git', ['init', '--quiet'], { cwd: repositoryRoot });
    execFileSync('git', ['config', 'user.name', 'OPL Test'], { cwd: repositoryRoot });
    execFileSync('git', ['config', 'user.email', 'opl-test@example.invalid'], { cwd: repositoryRoot });
    execFileSync('git', ['remote', 'add', 'origin', repositoryUrl], { cwd: repositoryRoot });
    execFileSync('git', ['add', '.'], { cwd: repositoryRoot });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repositoryRoot });
    seedDescriptorOwnedFlowCarrier({ codexPath: codex.codexPath, carrier, env });
    const repaired = runCli(['packages', 'repair', '--package-id', 'opl-flow'], env) as any;
    assert.equal(repaired.opl_agent_package_repair.status, 'repaired');
    assert.equal(
      repaired.opl_agent_package_repair.repair_scope,
      'installed_managed_policy_dependencies',
    );
    assert.equal(repaired.opl_agent_package_repair.managed_policy_repair.status, 'repaired');
    assert.equal(
      fs.realpathSync(path.join(env.CODEX_HOME, 'skills', 'fixture-managed-skill')),
      fs.realpathSync(skillRoot),
    );
    assert.equal(fs.existsSync(curlMarker), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('descriptor-owned Flow accepts only the exact content-qualified carrier generation and source path', () => {
  function runCase(input: {
    versionSuffix: 'matching' | 'missing' | string;
    wrongSourcePath?: boolean;
    expectSuccess: boolean;
  }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-content-qualified-carrier-'));
    const stateDir = path.join(root, 'state');
    const homeDir = path.join(root, 'home');
    const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
    const overrideCodex = writeCarrierReadbackOverrideWrapper(root, codex.codexPath);
    const nextOwner = writeFirstPartyCatalogFixture('0.1.32', '2'.repeat(40), {
      requiredSkillIds: FLOW_SKILL_IDS,
    });
    const carrier = writeDescriptorOwnedFlowCarrier({ root, version: '0.1.31' });
    const baseEnv = {
      HOME: homeDir,
      CODEX_HOME: path.join(homeDir, '.codex'),
      OPL_STATE_DIR: stateDir,
      OPL_CODEX_PLUGIN_BIN: overrideCodex,
      OPL_CLI_TEST_TIMEOUT_MS: '90000',
      FIXTURE_CARRIER_SOURCE_CONTAINS: nextOwner.sourceRoot,
    };
    try {
      seedDescriptorOwnedFlowCarrier({ codexPath: codex.codexPath, carrier, env: baseEnv });
      const expectedGeneration = computePackageChannelTreeSha256(nextOwner.sourceRoot);
      const expectedContentQualifiedVersion = `0.1.32-${expectedGeneration}`;
      const observedGeneration = input.versionSuffix === 'matching'
        ? expectedGeneration
        : input.versionSuffix;
      const overrideSourcePath = input.wrongSourcePath
        ? path.join(root, 'wrong-carrier-source')
        : null;
      if (overrideSourcePath) {
        fs.cpSync(nextOwner.sourceRoot, overrideSourcePath, { recursive: true });
        fs.writeFileSync(path.join(overrideSourcePath, 'wrong-source-marker.txt'), 'wrong\n');
      }
      const commonEnv = {
        ...baseEnv,
        ...(input.versionSuffix === 'missing'
          ? { FIXTURE_CARRIER_CLEAR_VERSION: '1' }
          : { FIXTURE_CARRIER_VERSION: `0.1.32-${observedGeneration}` }),
        ...(overrideSourcePath ? { FIXTURE_CARRIER_SOURCE_PATH: overrideSourcePath } : {}),
      };
      if (input.expectSuccess) {
        const updated = runCli(['packages', 'update', 'opl-flow'], {
          ...nextOwner.env,
          ...commonEnv,
        }) as any;
        assert.equal(updated.opl_agent_package_update.status, 'updated');
        assert.equal(
          updated.opl_agent_package_update.configured_carrier.installed_version,
          expectedContentQualifiedVersion,
        );
        assert.equal(updated.opl_agent_package_update.configured_carrier.executor.status, 'callable');
        const pluginRoot = updated.opl_agent_package_update.configured_carrier.plugin_source_path;
        assert.equal(pluginRoot, nextOwner.sourceRoot);
        for (const skillId of FLOW_SKILL_IDS) {
          assert.equal(
            fs.existsSync(path.join(pluginRoot, 'skills', skillId, 'SKILL.md')),
            true,
            skillId,
          );
        }
        return;
      }
      const failure = runCliFailure(['packages', 'update', 'opl-flow'], {
        ...nextOwner.env,
        ...commonEnv,
      });
      assert.equal(
        failure.payload.error.details.failure_code,
        'configured_codex_plugin_carrier_target_currentness_mismatch',
      );
      assert.equal(failure.payload.error.details.target_version, '0.1.32');
      assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    } finally {
      removeFixtureTree(root);
      fs.rmSync(nextOwner.root, { recursive: true, force: true });
    }
  }

  runCase({ versionSuffix: 'matching', expectSuccess: true });
  runCase({ versionSuffix: 'missing', expectSuccess: false });
  runCase({ versionSuffix: 'f'.repeat(64), expectSuccess: false });
  runCase({
    versionSuffix: 'matching',
    wrongSourcePath: true,
    expectSuccess: false,
  });
});

test('descriptor-owned currentness accepts only the canonical GitHub form of the owner marketplace source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-github-marketplace-currentness-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const ownerMarketplaceSource = 'gaofeng21cn/opl-flow';
  const installedOwner = writeFirstPartyCatalogFixture('0.1.38', '1'.repeat(40));
  const targetOwner = writeFirstPartyCatalogFixture('0.1.38', '1'.repeat(40), {
    configuredCarrierMarketplaceSource: ownerMarketplaceSource,
    requiredSkillIds: FLOW_SKILL_IDS,
  });
  const overrideCodex = writeCarrierReadbackOverrideWrapper(
    root,
    installedOwner.env.OPL_CODEX_PLUGIN_BIN,
  );
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: overrideCodex,
    OPL_CLI_TEST_TIMEOUT_MS: '90000',
    FIXTURE_CARRIER_SOURCE_CONTAINS: installedOwner.sourceRoot,
  };
  const dryRun = (overrides: Record<string, string>) => runCli([
    'packages', 'update', 'opl-flow', '--dry-run',
  ], {
    ...targetOwner.env,
    ...commonEnv,
    ...overrides,
  }) as any;
  try {
    const installed = runCli(['packages', 'install', 'opl-flow'], {
      ...installedOwner.env,
      ...commonEnv,
    }) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');

    const installedManifestPath = path.join(installedOwner.sourceRoot, 'opl-package.json');
    const installedManifest = parseJsonText(
      fs.readFileSync(installedManifestPath, 'utf8'),
    ) as any;
    installedManifest.codex_surface.configured_codex_plugin_carrier.marketplace_source =
      'https://github.com/gaofeng21cn/opl-flow.git';
    fs.writeFileSync(installedManifestPath, formatJsonPayload(installedManifest));

    const current = dryRun({
      FIXTURE_CARRIER_MARKETPLACE_SOURCE: 'https://github.com/gaofeng21cn/opl-flow.git',
    }).opl_agent_package_update;
    assert.equal(current.status, 'validated_no_write');
    assert.equal(current.currentness.status, 'current');
    assert.deepEqual(current.currentness.reasons, []);

    const wrongRepository = dryRun({
      FIXTURE_CARRIER_MARKETPLACE_SOURCE: 'https://github.com/gaofeng21cn/not-opl-flow.git',
    }).opl_agent_package_update;
    assert.equal(wrongRepository.currentness.status, 'update_available');
    assert.ok(wrongRepository.currentness.reasons.includes('package_version_changed'));

    const wrongVersion = dryRun({
      FIXTURE_CARRIER_MARKETPLACE_SOURCE: 'https://github.com/gaofeng21cn/opl-flow.git',
      FIXTURE_CARRIER_VERSION: '0.1.37',
    }).opl_agent_package_update;
    assert.equal(wrongVersion.currentness.status, 'update_available');
    assert.ok(wrongVersion.currentness.reasons.includes('package_version_changed'));
  } finally {
    removeFixtureTree(root);
    fs.rmSync(installedOwner.root, { recursive: true, force: true });
    fs.rmSync(targetOwner.root, { recursive: true, force: true });
  }
});

test('descriptor-owned Flow update rejects a successful native no-op and preserves the previous carrier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-descriptor-noop-'));
  const stateDir = path.join(root, 'state');
  const homeDir = path.join(root, 'home');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const noopCodex = writeNoopPluginAddWrapper(root, codex.codexPath);
  const nextOwner = writeFirstPartyCatalogFixture('0.1.32', '2'.repeat(40), {
    requiredSkillIds: FLOW_SKILL_IDS,
  });
  const carrier = writeDescriptorOwnedFlowCarrier({ root, version: '0.1.31' });
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: noopCodex,
    OPL_CLI_TEST_TIMEOUT_MS: '90000',
    FIXTURE_PLUGIN_ADD_NOOP: '1',
  };
  try {
    seedDescriptorOwnedFlowCarrier({ codexPath: codex.codexPath, carrier, env: commonEnv });
    for (const args of [
      ['packages', 'update', 'opl-flow'],
      ['packages', 'repair', '--package-id', 'opl-flow'],
    ]) {
      const failure = runCliFailure(args, {
        ...nextOwner.env,
        ...commonEnv,
      });
      assert.equal(
        failure.payload.error.details.failure_code,
        'configured_codex_plugin_carrier_target_currentness_mismatch',
      );
      assert.equal(failure.payload.error.details.target_version, '0.1.32');
      assert.equal(failure.payload.error.details.observed_version, '0.1.31');
      assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
      const pluginList = JSON.parse(execFileSync(codex.codexPath, ['plugin', 'list', '--json'], {
        env: { ...process.env, ...commonEnv },
        encoding: 'utf8',
      }));
      assert.equal(pluginList.installed.length, 1);
      assert.equal(pluginList.installed[0].version, '0.1.31');
    }
  } finally {
    removeFixtureTree(root);
    fs.rmSync(nextOwner.root, { recursive: true, force: true });
  }
});

test('bundled OMA legacy state cannot substitute for missing native owner authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-oma-native-owner-required-'));
  const initial = writeOmaOwnerReleaseFixture({
    root: path.join(root, 'initial'),
    generation: 'initial',
  });
  const stateDir = path.join(root, 'state');
  try {
    const failure = runCliFailure(['packages', 'install', 'oma'], {
      HOME: path.join(root, 'home'),
      CODEX_HOME: path.join(root, 'home', '.codex'),
      OPL_STATE_DIR: stateDir,
      ...initial.releaseSet.env,
      ...initial.ownerChannel.env,
    });
    assert.equal(
      failure.payload.error.details.failure_code,
      'configured_codex_plugin_carrier_owner_descriptor_missing',
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle.sqlite')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-runtime-transactions')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('an installed first-party descriptor cannot mask a new manifest missing carrier authority', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-carrier-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-carrier-home-'));
  const codex = createFakeCodexPluginManagerFixture(path.join(stateDir, 'fake-codex'));
  const first = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const missing = writeFirstPartyCatalogFixture('0.2.1', '2'.repeat(40), {
    configuredCarrier: false,
  });
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };
  try {
    const installed = runCli(['packages', 'install', 'opl-flow'], { ...first.env, ...commonEnv }) as any;
    assert.equal(installed.opl_agent_package_install.configured_carrier.installed_version, '0.2.0');
    assert.equal(installed.opl_agent_package_install.configured_carrier.plugin_source_path, first.sourceRoot);
    const failure = runCliFailure(['packages', 'update', 'opl-flow'], { ...missing.env, ...commonEnv });
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      failure.payload.error.details.failure_code,
      'configured_codex_plugin_carrier_owner_authority_missing',
    );
    const retained = runCli(['packages', 'status', '--package-id', 'opl-flow'], commonEnv) as any;
    assert.equal(retained.opl_agent_package_status.installed_package_count, 1);
    assert.equal(Object.hasOwn(retained.opl_agent_package_status, 'installed_packages'), false);
    assert.equal(retained.opl_agent_package_status.configured_carrier.installed_version, '0.2.0');
    assert.equal(retained.opl_agent_package_status.configured_carrier.plugin_source_path, first.sourceRoot);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(missing.root, { recursive: true, force: true });
  }
});

test('legacy Flow 0.1.35 owner artifact cannot resurrect the managed carrier bridge', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-0135-native-owner-required-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-0135-native-owner-required-home-'));
  const exact = writeFirstPartyCatalogFixture(
    '0.1.35',
    '6d8772cd9a8b2a14b2292c15afbf3c3cb5bfa8a4',
    { configuredCarrier: false },
  );
  try {
    const failure = runCliFailure(['packages', 'install', 'opl-flow'], {
      ...exact.env,
      HOME: homeDir,
      CODEX_HOME: path.join(homeDir, '.codex'),
      OPL_STATE_DIR: stateDir,
    });
    assert.equal(
      failure.payload.error.details.failure_code,
      'configured_codex_plugin_carrier_owner_descriptor_missing',
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle.sqlite')), false);
    const ownerReads = fs.readFileSync(exact.curlLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('/one-person-lab-packages/opl-flow/manifests/latest-stable'));
    assert.equal(ownerReads.length, 1);
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(exact.root, { recursive: true, force: true });
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

test('first-party activation uses the installed package without reading an invalid next catalog member', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-activation-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-activation-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-activation-workspace-'));
  const codex = createFakeCodexPluginManagerFixture(path.join(stateDir, 'fake-codex'));
  const installedFixture = writeFirstPartyCatalogFixture('0.2.0', '1'.repeat(40));
  const invalidFixture = writeFirstPartyCatalogFixture('0.2.1', 'not-an-owner-commit');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };
  try {
    const installed = runCli(['packages', 'install', 'opl-flow'], {
      ...installedFixture.env,
      ...commonEnv,
    }) as any;
    assert.equal(installed.opl_agent_package_install.configured_carrier.installed_version, '0.2.0');
    const pluginPath = path.join(installedFixture.sourceRoot, '.codex-plugin', 'plugin.json');
    const invalidCatalogReadsBefore = fs.existsSync(invalidFixture.curlLogPath)
      ? fs.readFileSync(invalidFixture.curlLogPath, 'utf8').trim()
      : '';

    const activation = runCli([
      'packages', 'activate', 'opl-flow',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], {
      ...invalidFixture.env,
      ...commonEnv,
    }).opl_agent_package_activation;
    assert.equal(activation.status, 'already_activated');
    assert.equal(activation.operational_ready, true);
    assert.equal(activation.launch_allowed, true);
    assert.equal(activation.writes_performed, false);
    const invalidCatalogReadsAfter = fs.existsSync(invalidFixture.curlLogPath)
      ? fs.readFileSync(invalidFixture.curlLogPath, 'utf8').trim()
      : '';
    assert.equal(invalidCatalogReadsAfter, invalidCatalogReadsBefore);
    assert.equal(JSON.parse(fs.readFileSync(pluginPath, 'utf8')).version, '0.2.0');
  } finally {
    removeFixtureTree(stateDir);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(installedFixture.root, { recursive: true, force: true });
    fs.rmSync(invalidFixture.root, { recursive: true, force: true });
  }
});

test('developer checkout policy stays explicit and is not a managed-update authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-developer-currentness-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const wrongCheckout = path.join(root, 'workspace', 'wrong-med-autoscience');
  const oldProvider = writeCapabilityProvider(path.join(root, 'old-provider'), '0.1.0');
  addConfiguredCarrierToCapabilityFixture(oldProvider);
  const oldMas = writeMasConsumer(path.join(root, 'old-mas'), oldProvider, '0.1.0', {
    configuredCarrier: true,
  });
  const oldReleaseSet = writeCapabilityCatalog(path.join(root, 'old-release-set'), [oldMas, oldProvider]);
  const nextProvider = writeCapabilityProvider(path.join(root, 'next-provider'), '0.1.1');
  addConfiguredCarrierToCapabilityFixture(nextProvider);
  const nextMas = writeMasConsumer(path.join(root, 'next-mas'), nextProvider, '0.1.1', {
    configuredCarrier: true,
  });
  const nextReleaseSet = writeCapabilityCatalog(path.join(root, 'next-release-set'), [nextMas, nextProvider]);
  const fakeBin = path.join(root, 'bin');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
    OPL_CLI_TEST_TIMEOUT_MS: '120000',
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
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
  writeDeveloperMasCarrierAuthority({
    masCheckout,
    scholarCheckout,
    masManifestPath: oldMas,
    providerManifestPath: oldProvider,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');
  commitDeveloperCheckout(scholarCheckout, 'add native owner authority');
  const oldEnv = { ...commonEnv, ...withMasOwnerGateFixturePath(oldReleaseSet.env, fakeBin) };
  const nextEnv = { ...commonEnv, ...withMasOwnerGateFixturePath(nextReleaseSet.env, fakeBin) };

  try {
    const pathFailure = runCliFailure([
      'packages', 'install', 'mas',
      '--source-kind', 'developer_checkout_override',
      '--agent-root', wrongCheckout,
    ], oldEnv);
    assert.equal(pathFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      pathFailure.payload.error.details.failure_code,
      'first_party_package_developer_checkout_path_mismatch',
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const installed = runCli(['packages', 'install', 'mas'], oldEnv) as any;
    assert.equal(installed.opl_agent_package_install.configured_carrier.installed_version, '0.1.0');
    assert.deepEqual(
      installed.opl_agent_package_install.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.1.0:installed'],
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    updateDeveloperCapabilityCheckoutClosure({
      masCheckout,
      scholarCheckout,
      masManifestPath: nextMas,
      providerManifestPath: nextProvider,
      message: 'fixture B',
    });
    writeDeveloperMasCarrierAuthority({
      masCheckout,
      scholarCheckout,
      masManifestPath: nextMas,
      providerManifestPath: nextProvider,
    });
    commitDeveloperCheckout(masCheckout, 'add next native owner authority');
    commitDeveloperCheckout(scholarCheckout, 'add next native owner authority');

    const releaseCatalogCache = path.join(stateDir, 'agent-package-release-catalog-cache.json');
    const cachedOldReleaseSet = formatJsonPayload({
      surface_kind: 'opl_agent_package_release_catalog_cache.v1',
      catalog_ref: 'ghcr.io/fixture/one-person-lab-manifest:fixture',
      catalog_digest: `sha256:${'9'.repeat(64)}`,
      checked_at: new Date().toISOString(),
      catalog_payload: JSON.parse(fs.readFileSync(oldReleaseSet.catalogPath, 'utf8')),
    });
    fs.writeFileSync(releaseCatalogCache, cachedOldReleaseSet);
    const preview = runCli(['packages', 'update', '--dry-run'], nextEnv) as any;
    const previewPackages = preview.managed_update.components.find(
      (entry: any) => entry.component_id === 'opl_packages',
    );
    assert.equal(previewPackages.current.projection_source, 'native_module_directory');
    assert.equal(Object.hasOwn(previewPackages.current, 'package_lock_states'), false);
    assert.equal(previewPackages.state, 'skipped_manual_required');
    assert.equal(previewPackages.plan.action, 'manual_review');
    assert.equal(previewPackages.auto_apply.eligible, false);
    assert.equal(previewPackages.auto_apply.command_ref, null);
    assert.equal(fs.readFileSync(releaseCatalogCache, 'utf8'), cachedOldReleaseSet);

    const updated = runCli(['update', 'apply'], nextEnv) as any;
    const adapter = updated.managed_update.execution.adapter_results.find(
      (entry: any) => entry.component_id === 'opl_packages',
    );
    assert.equal(adapter, undefined);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    const status = runCli(['packages', 'status', '--package-id', 'mas'], nextEnv) as any;
    assert.equal(status.opl_agent_package_status.configured_carrier.installed_version, '0.1.0');
  } finally {
    removeFixtureTree(root);
  }
});

test('fresh Developer install admits owner checkout manifests without a channel payload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-developer-direct-admission-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  addConfiguredCarrierToCapabilityFixture(providerManifest);
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.1.0', {
    configuredCarrier: true,
  });
  const fakeBin = path.join(root, 'bin');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
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
  fs.writeFileSync(
    path.join(masCheckout, 'contracts', 'capability_map.json'),
    formatJsonPayload({
      surface_kind: 'opl_standard_agent_capability_map',
      capabilities: [{
        capability_id: 'mas-review-fixture',
        surface_role: 'professional_skill',
        capability_kind: 'professional_skill',
        physical_source_ref: {
          ref_kind: 'repo_path',
          ref: 'agent/professional_skills/mas-review-fixture/SKILL.md',
        },
      }],
    }),
  );
  const professionalSkill = path.join(
    masCheckout,
    'agent',
    'professional_skills',
    'mas-review-fixture',
    'SKILL.md',
  );
  fs.mkdirSync(path.dirname(professionalSkill), { recursive: true });
  fs.writeFileSync(professionalSkill, '# MAS review fixture\n');
  writeDeveloperMasCarrierAuthority({
    masCheckout,
    scholarCheckout,
    masManifestPath: masManifest,
    providerManifestPath: providerManifest,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');
  commitDeveloperCheckout(scholarCheckout, 'add native owner authority');

  try {
    const installed = runCli(['packages', 'install', 'mas'], commonEnv) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.deepEqual(
      installed.opl_agent_package_install.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.1.0:installed'],
    );
    assert.equal(
      fs.existsSync(path.join(stateDir, 'agent-package-release-catalog-cache.json')),
      false,
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const status = runCli(['packages', 'status', '--package-id', 'mas'], commonEnv) as any;
    const scholarStatus = runCli([
      'packages', 'status', '--package-id', 'mas-scholar-skills',
    ], commonEnv) as any;
    assert.equal(
      scholarStatus.opl_agent_package_status.installed_package_count,
      1,
      JSON.stringify(scholarStatus.opl_agent_package_status),
    );
    assert.equal(
      fs.existsSync(path.join(
        status.opl_agent_package_status.configured_carrier.plugin_source_path,
        'opl-package.json',
      )),
      true,
    );
    assert.equal(
      status.opl_agent_package_status.operational_ready,
      true,
      JSON.stringify(status.opl_agent_package_status),
    );
    assert.equal(status.opl_agent_package_status.launch_allowed, true);
    runCli(['workspace', 'bind', '--project', 'medautoscience', '--path', workspace], commonEnv);
    const activation = runCli([
      'packages', 'activate', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], commonEnv) as any;
    assert.equal(activation.opl_agent_package_activation.status, 'already_activated');
    assert.equal(activation.opl_agent_package_activation.writes_performed, true);
    assert.equal(activation.opl_agent_package_activation.operational_ready, true);
    assert.equal(activation.opl_agent_package_activation.launch_allowed, true);
    assert.equal(
      activation.opl_agent_package_activation.workspace_skill_projection.skill_ids.includes(
        'mas-review-fixture',
      ),
      true,
    );
    assert.equal(Object.hasOwn(activation.opl_agent_package_activation, 'package_lock'), false);
    assert.equal(Object.hasOwn(activation.opl_agent_package_activation, 'package_use_binding'), false);

    const descriptorPath = path.join(
      masCheckout,
      'plugins',
      'med-autoscience',
      'opl-package.json',
    );
    const mismatchedDescriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    mismatchedDescriptor.version = '9.9.9';
    fs.writeFileSync(descriptorPath, formatJsonPayload(mismatchedDescriptor));
    commitDeveloperCheckout(masCheckout, 'drift configured carrier owner descriptor');
    const descriptorMismatch = runCliFailure(['packages', 'update', 'mas'], commonEnv);
    assert.equal(
      descriptorMismatch.payload.error.details.failure_code,
      'agent_package_developer_checkout_source_invalid',
    );
    assert.match(descriptorMismatch.payload.error.message, /does not match its owner manifest/);
  } finally {
    removeFixtureTree(root);
  }
});

test('optional owner dependencies are omitted from ordinary owner refresh', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-optional-owner-refresh-'));
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
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: fakeBin,
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas'],
  });
  const environment = { ...releaseSet.env, ...ownerChannel.env };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, environment);
    const snapshot = await refreshFirstPartyPackageCatalogSnapshot('mas');
    assert.equal(snapshot.freshness, 'live');
    const reads = fs.readFileSync(ownerChannel.curlLogPath, 'utf8');
    assert.equal(reads.includes('/one-person-lab-packages/mas/manifests/latest-stable'), true);
    assert.equal(reads.includes('/one-person-lab-packages/mas-scholar-skills/'), false);
    assert.equal(reads.includes('/one-person-lab-manifest/'), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeFixtureTree(root);
  }
});

test('MAS owner refresh reads only MAS and required ScholarSkills owner channels', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-required-owner-closure-'));
  const fakeBin = path.join(root, 'bin');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0');
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.1.0');
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [masManifest, providerManifest],
  );
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: fakeBin,
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  const environment = { ...releaseSet.env, ...ownerChannel.env };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, environment);
    const snapshot = await refreshFirstPartyPackageCatalogSnapshot('mas');
    assert.equal(snapshot.freshness, 'live');
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
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeFixtureTree(root);
  }
});

test('first-party native install converges the required MAS ScholarSkills closure without legacy state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-required-owner-closure-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.2.23');
  addConfiguredCarrierToCapabilityFixture(providerManifest);
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.2.24', {
    configuredCarrier: true,
  });
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [masManifest, providerManifest],
  );
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: path.join(root, 'owner-bin'),
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const env = {
    ...releaseSet.env,
    ...ownerChannel.env,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };
  try {
    const installed = runCli(['packages', 'install', 'mas'], env) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.deepEqual(
      installed.opl_agent_package_install.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.2.23:installed'],
    );
    for (const packageId of ['mas', 'mas-scholar-skills']) {
      const status = runCli(['packages', 'status', '--package-id', packageId], env) as any;
      assert.equal(status.opl_agent_package_status.package_operational.status, 'operational');
      assert.equal(status.opl_agent_package_status.installed_readiness.callability, 'callable');
    }
    for (const fileName of [
      'agent-package-locks.json',
      'agent-package-lifecycle-ledger.json',
      'agent-package-registry-cache.json',
    ]) {
      assert.equal(fs.existsSync(path.join(stateDir, fileName)), false, fileName);
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('first-party native update repairs a missing required carrier for an already installed root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-required-owner-update-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.2.23');
  addConfiguredCarrierToCapabilityFixture(providerManifest);
  const masRoot = path.join(root, 'mas');
  const masManifest = writeMasConsumer(masRoot, providerManifest, '0.2.24', {
    configuredCarrier: true,
  });
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [masManifest, providerManifest],
  );
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: path.join(root, 'owner-bin'),
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const env = {
    ...process.env,
    ...releaseSet.env,
    ...ownerChannel.env,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };
  try {
    execFileSync(codex.codexPath, ['plugin', 'marketplace', 'add', masRoot, '--json'], { env });
    execFileSync(
      codex.codexPath,
      ['plugin', 'add', 'med-autoscience@med-autoscience-local', '--json'],
      { env },
    );
    const before = runCli(['packages', 'status', '--package-id', 'mas-scholar-skills'], env) as any;
    assert.equal(before.opl_agent_package_status.status, 'not_installed');

    const updated = runCli(['packages', 'update', 'mas'], env) as any;
    assert.equal(updated.opl_agent_package_update.status, 'current_noop');
    assert.deepEqual(
      updated.opl_agent_package_update.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.2.23:installed'],
    );
    const after = runCli(['packages', 'status', '--package-id', 'mas-scholar-skills'], env) as any;
    assert.equal(after.opl_agent_package_status.package_operational.status, 'operational');
    assert.equal(after.opl_agent_package_status.installed_readiness.callability, 'callable');
  } finally {
    removeFixtureTree(root);
  }
});

test('first-party native install compensates a newly installed required carrier when closure callability fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-required-owner-failure-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const providerRoot = path.join(root, 'provider');
  const providerManifest = writeCapabilityProvider(providerRoot, '0.2.23');
  addConfiguredCarrierToCapabilityFixture(providerManifest);
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.2.24', {
    configuredCarrier: true,
  });
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [masManifest, providerManifest],
  );
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: path.join(root, 'owner-bin'),
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  const provider = parseJsonText(fs.readFileSync(providerManifest, 'utf8')) as any;
  fs.rmSync(path.join(providerRoot, 'skills', provider.exports.core_skill_ids[0]), {
    recursive: true,
    force: true,
  });
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const env = {
    ...releaseSet.env,
    ...ownerChannel.env,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };
  try {
    const failure = runCliFailure(['packages', 'install', 'mas'], env);
    assert.equal(
      failure.payload.error.details.failure_code,
      'configured_codex_plugin_carrier_target_currentness_mismatch',
    );
    for (const packageId of ['mas', 'mas-scholar-skills']) {
      const status = runCli(['packages', 'status', '--package-id', packageId], env) as any;
      assert.equal(status.opl_agent_package_status.status, 'not_installed');
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('first-party native install does not fetch or require an optional capability dependency', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-optional-owner-closure-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.2.23');
  addConfiguredCarrierToCapabilityFixture(providerManifest);
  const masManifest = writeMasConsumer(path.join(root, 'mas'), providerManifest, '0.2.24', {
    configuredCarrier: true,
    required: false,
    dependencyKind: 'optional_enhancement',
  });
  const releaseSet = writeCapabilityCatalog(path.join(root, 'release-set'), [masManifest]);
  const ownerChannel = writePackageOwnerChannelFixture({
    root,
    binRoot: path.join(root, 'owner-bin'),
    catalogPath: releaseSet.catalogPath,
    packageIds: ['mas'],
  });
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const env = {
    ...releaseSet.env,
    ...ownerChannel.env,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };
  try {
    const installed = runCli(['packages', 'install', 'mas'], env) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.deepEqual(installed.opl_agent_package_install.required_dependency_packages, []);
    const scholar = runCli(['packages', 'status', '--package-id', 'mas-scholar-skills'], env) as any;
    assert.equal(scholar.opl_agent_package_status.status, 'not_installed');
    assert.equal(
      fs.readFileSync(ownerChannel.curlLogPath, 'utf8')
        .includes('/one-person-lab-packages/mas-scholar-skills/'),
      false,
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('developer native carrier stays intact when the owner artifact has no native carrier authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-developer-to-managed-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const oldProvider = writeCapabilityProvider(path.join(root, 'old-provider'), '0.1.0');
  addConfiguredCarrierToCapabilityFixture(oldProvider);
  const oldMas = writeMasConsumer(path.join(root, 'old-mas'), oldProvider, '0.1.0', {
    configuredCarrier: true,
  });
  const oldReleaseSet = writeCapabilityCatalog(path.join(root, 'old-release-set'), [oldMas, oldProvider]);
  const nextProvider = writeCapabilityProvider(path.join(root, 'next-provider'), '0.1.1');
  const nextMas = writeMasConsumer(path.join(root, 'next-mas'), nextProvider, '0.1.1', {
    configuredCarrier: false,
  });
  const nextReleaseSet = writeCapabilityCatalog(path.join(root, 'next-release-set'), [nextMas, nextProvider]);
  const fakeBin = path.join(root, 'bin');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const ownerChannel = writePackageOwnerChannelFixture({
    root: path.join(root, 'owner-channel'),
    binRoot: path.join(root, 'owner-channel-bin'),
    catalogPath: nextReleaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  fs.mkdirSync(masCheckout, { recursive: true });
  fs.mkdirSync(scholarCheckout, { recursive: true });
  writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: oldMas,
    providerManifestPath: oldProvider,
  });
  writeDeveloperMasCarrierAuthority({
    masCheckout,
    scholarCheckout,
    masManifestPath: oldMas,
    providerManifestPath: oldProvider,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');
  commitDeveloperCheckout(scholarCheckout, 'add native owner authority');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
  };

  try {
    const installed = runCli(['packages', 'install', 'mas'], {
      ...commonEnv,
      ...withMasOwnerGateFixturePath(oldReleaseSet.env, fakeBin),
      OPL_MODULE_SOURCE_MODE: 'git_checkout',
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
      UV_TOOL_DIR: path.join(root, 'uv-tools'),
    }) as any;
    assert.equal(installed.opl_agent_package_install.configured_carrier.installed_version, '0.1.0');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    const failure = runCliFailure(['packages', 'update', 'mas'], {
      ...commonEnv,
      ...ownerChannel.env,
      OPL_MODULE_SOURCE_MODE: 'package_channel',
      OPL_MODULE_PATH_MEDAUTOSCIENCE: '',
      OPL_MODULE_PATH_SCHOLARSKILLS: '',
    });
    assert.equal(
      failure.payload.error.details.failure_code,
      'configured_codex_plugin_carrier_owner_authority_missing',
    );
    const retained = runCli(['packages', 'status', '--package-id', 'mas'], commonEnv) as any;
    assert.equal(retained.opl_agent_package_status.configured_carrier.installed_version, '0.1.0');
    assert.equal(retained.opl_agent_package_status.installed_readiness.callability, 'callable');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.deepEqual(
      fs.existsSync(path.join(stateDir, 'agent-package-runtime-transactions'))
        ? fs.readdirSync(path.join(stateDir, 'agent-package-runtime-transactions'))
        : [],
      [],
    );
    const reads = fs.readFileSync(ownerChannel.curlLogPath, 'utf8');
    assert.equal(reads.includes('/one-person-lab-manifest/'), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('developer-to-managed transition preserves newer native carriers when the owner target is older', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-managed-downgrade-guard-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const newerProvider = writeCapabilityProvider(path.join(root, 'newer-provider'), '0.1.1');
  addConfiguredCarrierToCapabilityFixture(newerProvider);
  const newerMas = writeMasConsumer(path.join(root, 'newer-mas'), newerProvider, '0.1.1', {
    configuredCarrier: true,
  });
  const staleProvider = writeCapabilityProvider(path.join(root, 'stale-provider'), '0.1.0');
  addConfiguredCarrierToCapabilityFixture(staleProvider);
  const staleMas = writeMasConsumer(path.join(root, 'stale-mas'), staleProvider, '0.1.0', {
    configuredCarrier: true,
  });
  const staleReleaseSet = writeCapabilityCatalog(
    path.join(root, 'stale-release-set'),
    [staleMas, staleProvider],
  );
  const fakeBin = path.join(root, 'bin');
  const ownerChannel = writePackageOwnerChannelFixture({
    root: path.join(root, 'owner-channel'),
    binRoot: path.join(root, 'owner-channel-bin'),
    catalogPath: staleReleaseSet.catalogPath,
    packageIds: ['mas', 'mas-scholar-skills'],
  });
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  fs.mkdirSync(masCheckout, { recursive: true });
  fs.mkdirSync(scholarCheckout, { recursive: true });
  writeDeveloperCapabilityCheckoutClosure({
    masCheckout,
    scholarCheckout,
    masManifestPath: newerMas,
    providerManifestPath: newerProvider,
  });
  writeDeveloperMasCarrierAuthority({
    masCheckout,
    scholarCheckout,
    masManifestPath: newerMas,
    providerManifestPath: newerProvider,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'newer developer carrier');
  commitDeveloperCheckout(scholarCheckout, 'newer developer dependency carrier');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
  };
  const managedEnv = {
    ...commonEnv,
    ...ownerChannel.env,
    PATH: `${ownerChannel.env.PATH}${path.delimiter}${fakeBin}`,
    OPL_MODULE_SOURCE_MODE: 'package_channel',
    OPL_MODULE_PATH_MEDAUTOSCIENCE: '',
    OPL_MODULE_PATH_SCHOLARSKILLS: '',
  };

  try {
    const installed = runCli(['packages', 'install', 'mas'], {
      ...commonEnv,
      OPL_MODULE_SOURCE_MODE: 'git_checkout',
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    }) as any;
    assert.equal(installed.opl_agent_package_install.configured_carrier.installed_version, '0.1.1');
    assert.deepEqual(
      installed.opl_agent_package_install.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.1.1:installed'],
    );

    for (const [args, surfaceKey] of [
      [['packages', 'update', 'mas'], 'opl_agent_package_update'],
      [['packages', 'repair', '--package-id', 'mas'], 'opl_agent_package_repair'],
    ] as const) {
      const result = runCli([...args], managedEnv) as any;
      const surface = result[surfaceKey];
      assert.equal(surface.status, 'current_noop');
      assert.equal(surface.currentness.status, 'newer_source_preserved');
      assert.equal(surface.reconciliation_action, 'preserve_newer_installed_source');
      assert.equal(surface.observed_version, '0.1.1');
      assert.equal(surface.target_version, '0.1.0');
      assert.equal(
        fs.realpathSync(surface.configured_carrier.plugin_source_path),
        fs.realpathSync(path.join(masCheckout, 'plugins', 'med-autoscience')),
      );
      assert.deepEqual(
        surface.required_dependency_packages.map(
          (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
        ),
        ['mas-scholar-skills@0.1.1:newer_source_preserved'],
      );
    }

    const retainedMas = runCli(['packages', 'status', '--package-id', 'mas'], commonEnv) as any;
    const retainedScholar = runCli(
      ['packages', 'status', '--package-id', 'mas-scholar-skills'],
      commonEnv,
    ) as any;
    assert.equal(retainedMas.opl_agent_package_status.configured_carrier.installed_version, '0.1.1');
    assert.equal(retainedScholar.opl_agent_package_status.configured_carrier.installed_version, '0.1.1');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('single-package developer update reconciles from the live owner checkout without private state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-single-developer-update-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const masCheckout = path.join(root, 'workspace', 'med-autoscience');
  const scholarCheckout = path.join(root, 'workspace', 'mas-scholar-skills');
  const wrongCheckout = path.join(root, 'workspace', 'wrong-med-autoscience');
  const oldProvider = writeCapabilityProvider(path.join(root, 'old-provider'), '0.1.0');
  addConfiguredCarrierToCapabilityFixture(oldProvider);
  const oldMas = writeMasConsumer(path.join(root, 'old-mas'), oldProvider, '0.1.0', {
    configuredCarrier: true,
  });
  const oldReleaseSet = writeCapabilityCatalog(path.join(root, 'old-release-set'), [oldMas, oldProvider]);
  const nextProvider = writeCapabilityProvider(path.join(root, 'next-provider'), '0.1.1');
  addConfiguredCarrierToCapabilityFixture(nextProvider);
  const nextMas = writeMasConsumer(path.join(root, 'next-mas'), nextProvider, '0.1.1', {
    configuredCarrier: true,
  });
  const nextReleaseSet = writeCapabilityCatalog(path.join(root, 'next-release-set'), [nextMas, nextProvider]);
  const fakeBin = path.join(root, 'bin');
  const codex = createFakeCodexPluginManagerFixture(path.join(root, 'fake-codex'));
  const releaseCatalogCache = path.join(stateDir, 'agent-package-release-catalog-cache.json');
  const commonEnv = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masCheckout,
    OPL_MODULE_PATH_SCHOLARSKILLS: scholarCheckout,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    UV_TOOL_DIR: path.join(root, 'uv-tools'),
    OPL_CODEX_PLUGIN_BIN: codex.codexPath,
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
  writeDeveloperMasCarrierAuthority({
    masCheckout,
    scholarCheckout,
    masManifestPath: oldMas,
    providerManifestPath: oldProvider,
  });
  writeMasOwnerGateFixture(masCheckout, fakeBin);
  commitDeveloperCheckout(masCheckout, 'add owner gate fixture');
  commitDeveloperCheckout(scholarCheckout, 'add native owner authority');
  const oldEnv = { ...commonEnv, ...withMasOwnerGateFixturePath(oldReleaseSet.env, fakeBin) };
  const nextEnv = { ...commonEnv, ...withMasOwnerGateFixturePath(nextReleaseSet.env, fakeBin) };

  try {
    const installed = runCli(['packages', 'install', 'mas'], oldEnv) as any;
    assert.equal(installed.opl_agent_package_install.configured_carrier.installed_version, '0.1.0');
    assert.deepEqual(
      installed.opl_agent_package_install.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.1.0:installed'],
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const pathFailure = runCliFailure([
      'packages', 'update', 'mas',
      '--source-kind', 'developer_checkout_override',
      '--agent-root', wrongCheckout,
    ], nextEnv);
    assert.equal(pathFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      pathFailure.payload.error.details.failure_code,
      'first_party_package_developer_checkout_path_mismatch',
    );
    const retained = runCli(['packages', 'status', '--package-id', 'mas'], nextEnv) as any;
    assert.equal(retained.opl_agent_package_status.configured_carrier.installed_version, '0.1.0');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    updateDeveloperCapabilityCheckoutClosure({
      masCheckout,
      scholarCheckout,
      masManifestPath: nextMas,
      providerManifestPath: nextProvider,
      message: 'fixture B',
    });
    writeDeveloperMasCarrierAuthority({
      masCheckout,
      scholarCheckout,
      masManifestPath: nextMas,
      providerManifestPath: nextProvider,
    });
    commitDeveloperCheckout(masCheckout, 'add next native owner authority');
    commitDeveloperCheckout(scholarCheckout, 'add next native owner authority');

    const preview = runCli(['packages', 'update', 'mas', '--dry-run'], nextEnv) as any;
    const previewUpdate = preview.opl_agent_package_update;
    assert.equal(previewUpdate.status, 'validated_no_write');
    assert.equal(Object.hasOwn(previewUpdate, 'package_lock'), false);
    assert.equal(previewUpdate.configured_carrier.installed_version, '0.1.0');
    assert.equal(Object.hasOwn(previewUpdate, 'lifecycle_receipt'), false);
    assert.equal(fs.existsSync(releaseCatalogCache), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);

    const updated = runCli(['packages', 'update', 'mas'], nextEnv) as any;
    const appliedUpdate = updated.opl_agent_package_update;
    assert.equal(appliedUpdate.status, 'updated');
    assert.equal(Object.hasOwn(appliedUpdate, 'package_lock'), false);
    assert.equal(appliedUpdate.configured_carrier.installed_version, '0.1.1');
    assert.equal(appliedUpdate.configured_carrier.executor.status, 'callable');
    assert.deepEqual(
      appliedUpdate.required_dependency_packages.map(
        (entry: any) => `${entry.package_id}@${entry.observed_version}:${entry.status}`,
      ),
      ['mas-scholar-skills@0.1.1:updated'],
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    const current = runCli(['packages', 'update', 'mas'], nextEnv) as any;
    const currentUpdate = current.opl_agent_package_update;
    assert.equal(currentUpdate.status, 'updated');
    assert.equal(Object.hasOwn(currentUpdate, 'package_lock'), false);
    assert.equal(Object.hasOwn(currentUpdate, 'lifecycle_receipt'), false);
    assert.equal(currentUpdate.configured_carrier.installed_version, '0.1.1');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(releaseCatalogCache), false);

    fs.appendFileSync(developerFixture.providerHelperPath, 'offline dirty developer update\n');
    fs.rmSync(nextReleaseSet.catalogPath, { force: true });
    const offlineDeveloper = runCli(['packages', 'update', 'mas'], nextEnv) as any;
    const offlineUpdate = offlineDeveloper.opl_agent_package_update;
    assert.equal(offlineUpdate.status, 'updated');
    assert.equal(offlineUpdate.configured_carrier.installed_version, '0.1.1');
    assert.equal(offlineUpdate.configured_carrier.executor.status, 'callable');
    assert.match(
      fs.readFileSync(
        developerFixture.providerHelperPath,
        'utf8',
      ),
      /offline dirty developer update/,
    );
    assert.notEqual(execFileSync('git', ['status', '--porcelain'], {
      cwd: scholarCheckout,
      encoding: 'utf8',
    }), '');
    assert.equal(fs.existsSync(releaseCatalogCache), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    removeFixtureTree(root);
  }
});
