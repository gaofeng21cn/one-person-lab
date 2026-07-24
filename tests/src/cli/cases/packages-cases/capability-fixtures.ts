import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { formatJsonPayload, fs, path } from './helpers.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from '../../../../../src/modules/connect/agent-package-registry-parts/payload-content-lock.ts';
import { resolveOplDomainModuleSpec } from '../../../../../src/modules/connect/system-installation/modules.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const PACKAGE_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.manifest.v1+json';
const PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.payload.v1+json';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';
const FIXTURE_PACKAGE_CHANNEL_REF = 'ghcr.io/fixture/one-person-lab-manifest:fixture';

export const scholarSkillsCoreSkillIds = [
  'mas-scholar-skills',
  'medical-manuscript-writing',
  'medical-manuscript-review',
  'medical-figure-design',
  'medical-figure-style',
  'medical-figure-composer',
  'medical-research-lit',
  'medical-statistical-review',
  'medical-table-design',
  'medical-submission-prep',
  'medical-data-governance',
];

export const scholarSkillsModuleIds = [
  'mas-scholar-skills.display',
  'mas-scholar-skills.tables',
  'mas-scholar-skills.stats',
  'mas-scholar-skills.lit',
  'mas-scholar-skills.write',
  'mas-scholar-skills.review',
  'mas-scholar-skills.submit',
  'mas-scholar-skills.data',
];

export const scholarSkillsSpecialtySkillIds = [
  'medical-advanced-biomed-router',
  'medical-methodology-planner',
  'medical-evidence-integrity-reviewer',
  'medical-publication-routeback-reviewer',
  'medical-structural-biology',
  'medical-protein-design',
  'medical-genomics-foundation-models',
  'medical-single-cell-modeling',
  'medical-indication-dossier',
  'research-pdf-evidence-explorer',
  'scientific-compute-runner',
  'medical-protocol-and-sap-planner',
  'medical-cohort-phenotyping',
  'medical-evidence-synthesis-and-claim-map',
  'medical-reference-integrity-auditor',
  'medical-rebuttal-strategy',
  'medical-display-qc',
  'medical-causal-inference-plan',
  'medical-survival-analysis-plan',
  'medical-risk-model-transportability-reviewer',
  'medical-registry-atlas-story-architect',
  'medical-display-regression-debugger',
  'medical-data-freeze-and-analysis-readiness-reviewer',
  'medical-research-portfolio-memory-curator',
];

function contentDigest(root: string, paths: string[]) {
  const digest = crypto.createHash('sha256');
  for (const relativePath of paths) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(root, relativePath)));
  }
  return `sha256:${digest.digest('hex')}`;
}

function sha256(value: Buffer | string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function listFixtureFiles(
  root: string,
  manifestPath: string,
  pluginId: string,
  version: string,
  requiredSkillIds: string[],
) {
  const manifestAbsolute = path.resolve(manifestPath);
  const files: Array<{ path: string; content: Buffer; mode: '100644' | '100755' }> = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && path.resolve(absolute) !== manifestAbsolute) {
        files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          content: fs.readFileSync(absolute),
          mode: (fs.statSync(absolute).mode & 0o111) === 0 ? '100644' : '100755',
        });
      }
    }
  };
  visit(root);
  if (!files.some((file) => file.path === '.codex-plugin/plugin.json')) {
    files.push({
      path: '.codex-plugin/plugin.json',
      content: Buffer.from(formatJsonPayload({ name: pluginId, version })),
      mode: '100644',
    });
  }
  for (const skillId of requiredSkillIds) {
    const skillPath = `skills/${skillId}/SKILL.md`;
    if (!files.some((file) => file.path === skillPath)) {
      files.push({
        path: skillPath,
        content: Buffer.from(`# ${skillId}\n`),
        mode: '100644',
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function writeReleaseSetCurlFixture(input: {
  root: string;
  manifests: Record<string, Record<string, unknown>>;
  blobs: Record<string, string>;
}) {
  const { root, manifests, blobs } = input;
  const binRoot = path.join(root, 'release-set-bin');
  const curlPath = path.join(binRoot, 'curl');
  fs.mkdirSync(binRoot, { recursive: true });
  fs.writeFileSync(curlPath, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
    "if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: 'fixture' })); process.exit(0); }",
    `const manifests = ${JSON.stringify(manifests)};`,
    `const blobs = ${JSON.stringify(blobs)};`,
    "if (url.includes('/manifests/')) {",
    "  const match = url.match(/\\/v2\\/(.+)\\/manifests\\/(.+)$/);",
    "  const payload = match ? manifests[`${match[1]}@${decodeURIComponent(match[2])}`] || manifests[match[1]] : null;",
    '  if (!payload) process.exit(22);',
    '  process.stdout.write(JSON.stringify(payload));',
    '  process.exit(0);',
    '}',
    "if (url.includes('/blobs/')) {",
    "  const digest = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));",
    "  const outIndex = args.indexOf('-o');",
    '  const out = outIndex >= 0 ? args[outIndex + 1] : null;',
    '  if (!out || !blobs[digest]) process.exit(22);',
    '  fs.copyFileSync(blobs[digest], out);',
    '  process.exit(0);',
    '}',
    'process.exit(22);',
  ].join('\n'), { mode: 0o755 });
  return binRoot;
}

export function writeCapabilityProvider(
  root: string,
  version = '0.1.0',
  options: {
    packageId?: string;
    capabilityAbi?: string;
    coreSkillIds?: string[];
    moduleIds?: string[];
    specialtySkillIds?: string[];
    consumerProfiles?: Array<{
      profile_id: string;
      consumer_agent_id: string;
      required_export_ids: string[];
      required_module_ids: string[];
    }>;
  } = {},
) {
  const packageId = options.packageId ?? 'mas-scholar-skills';
  const capabilityAbi = options.capabilityAbi ?? 'mas-scholar-skills.v1';
  const coreSkillIds = options.coreSkillIds ?? scholarSkillsCoreSkillIds;
  const moduleIds = options.moduleIds ?? scholarSkillsModuleIds;
  const specialtySkillIds = options.specialtySkillIds ?? [];
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: packageId,
    version,
  }));
  for (const skillId of [...coreSkillIds, ...specialtySkillIds, 'medical-optional-specialty']) {
    const skillRoot = path.join(root, 'skills', skillId);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${skillId}\n`);
    fs.writeFileSync(path.join(skillRoot, 'helper.txt'), `${skillId} helper ${version}\n`);
  }
  const lockPaths = [
    '.codex-plugin/plugin.json',
    ...coreSkillIds.flatMap((skillId) => [
      `skills/${skillId}/SKILL.md`,
      `skills/${skillId}/helper.txt`,
    ]),
    ...specialtySkillIds.flatMap((skillId) => [
      `skills/${skillId}/SKILL.md`,
      `skills/${skillId}/helper.txt`,
    ]),
  ];
  const manifestPath = path.join(root, 'provider.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_capability_package_manifest.v2',
    package_id: packageId,
    display_name: 'MAS Scholar Skills',
    publisher: 'one-person-lab',
    version,
    source: 'test_provider',
    package_role: 'framework_capability_package',
    capability_abi: {
      id: capabilityAbi,
      version: '1.0.0',
      compatibility_policy: 'same_major',
    },
    exports: {
      core_skill_ids: coreSkillIds,
      core_module_ids: moduleIds,
      specialty_skill_ids: specialtySkillIds,
      optional_skill_policy_ref: 'test://optional-specialties',
      optional_skills_installed_by_default: true,
      default_materialization_policy: 'all_exported_skills',
    },
    consumer_profiles: options.consumerProfiles ?? [],
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_nul_file_bytes',
      paths: lockPaths,
      digest: contentDigest(root, lockPaths),
    },
    codex_surface: {
      plugin_id: packageId,
      plugin_source_path: '.',
      codex_default_exposure: false,
      optional_install_policy: 'all_exported_skills',
    },
  }));
  return manifestPath;
}

export function writePackageCatalog(
  root: string,
  manifestPaths: string[],
  options: { corruptInlineManifestPackageId?: string } = {},
) {
  fs.mkdirSync(root, { recursive: true });
  const packages: Record<string, { package_id: string; package_role: string; selected_version: string; versions: any[] }> = {};
  const artifactManifests: Record<string, Record<string, unknown>> = {};
  const artifactBlobs: Record<string, string> = {};
  for (const manifestPath of manifestPaths) {
    const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const packageId = sourceManifest.package_id;
    const sourceCommit = crypto.createHash('sha256')
      .update(`release-set:${packageId}:${sourceManifest.version}`)
      .digest('hex')
      .slice(0, 40);
    const pluginId = sourceManifest.codex_surface?.plugin_id
      ?? sourceManifest.codex_surface?.required_skill_ids?.[0]
      ?? (sourceManifest.surface_kind === 'opl_capability_package_manifest.v2'
        ? packageId
        : sourceManifest.agent_id);
    const requiredSkillIds = sourceManifest.codex_surface?.required_skill_ids ?? [];
    const sourceRepo = `https://github.com/fixture/${packageId}.git`;
    const manifest = {
      ...sourceManifest,
      source: 'first_party_owner_projection',
      source_repo: sourceRepo,
      ...(sourceManifest.managed_update_source ? {
        managed_update_source: {
          ...sourceManifest.managed_update_source,
          transport: 'opl_oci_channel',
          catalog_ref: FIXTURE_PACKAGE_CHANNEL_REF,
        },
      } : {}),
      ...(Array.isArray(sourceManifest.capability_dependencies) ? {
        capability_dependencies: sourceManifest.capability_dependencies.map((dependency: any) => ({
          ...dependency,
          ...(dependency.dependency_source ? {
            dependency_source: {
              ...dependency.dependency_source,
              transport: 'opl_oci_channel',
              catalog_ref: FIXTURE_PACKAGE_CHANNEL_REF,
            },
          } : {}),
        })),
      } : {}),
      codex_surface: {
        ...(sourceManifest.codex_surface ?? {}),
        plugin_id: pluginId,
        carrier_source_commit: sourceCommit,
      },
    };
    const raw = formatJsonPayload(manifest);
    const manifestDigest = sha256(raw);
    const capabilityAbi = manifest.surface_kind === 'opl_capability_package_manifest.v2'
      ? manifest.capability_abi.id
      : null;
    const payloadFiles = listFixtureFiles(
      path.dirname(manifestPath),
      manifestPath,
      pluginId,
      manifest.version,
      requiredSkillIds,
    );
    const runtimeSourceModuleId = sourceManifest.runtime_source_carrier?.module_id;
    const archiveRoot = typeof runtimeSourceModuleId === 'string'
      ? resolveOplDomainModuleSpec(runtimeSourceModuleId).repo_name
      : `${packageId}-${manifest.version}`;
    const archiveParent = path.join(root, 'release-set-sources');
    const archiveSourceRoot = path.join(archiveParent, archiveRoot);
    const archivePath = path.join(root, 'release-set-artifacts', `${archiveRoot}.tar.gz`);
    fs.rmSync(archiveSourceRoot, { recursive: true, force: true });
    fs.mkdirSync(archiveSourceRoot, { recursive: true });
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    for (const file of payloadFiles) {
      const target = path.join(archiveSourceRoot, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, { mode: file.mode === '100755' ? 0o755 : 0o644 });
    }
    execFileSync('tar', ['-czf', archivePath, archiveRoot], { cwd: archiveParent });
    const archiveDigest = sha256(fs.readFileSync(archivePath));
    const sourceArtifactRef = `ghcr.io/fixture/one-person-lab-packages/${packageId}:${manifest.version}`;
    const payload = {
      surface_kind: 'opl_package_payload_manifest.v2',
      schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
      package_id: packageId,
      plugin_id: pluginId,
      package_version: manifest.version,
      source_repo: sourceRepo,
      source_commit: sourceCommit,
      source_root: '.',
      content_lock: {
        algorithm: 'sha256',
        canonicalization: CANONICAL_PACKAGE_CONTENT_LOCK,
        digest: packageContentLockDigest(CANONICAL_PACKAGE_CONTENT_LOCK, payloadFiles),
      },
      package_source: {
        transport: 'same_oci_artifact_source_archive',
        artifact_ref: sourceArtifactRef,
        archive_sha256: archiveDigest,
        archive_root: archiveRoot,
      },
      files: payloadFiles.map((file) => ({
        path: file.path,
        mode: file.mode,
        sha256: sha256(file.content),
        source_path: file.path,
        source_artifact_ref: sourceArtifactRef,
      })),
    };
    const payloadManifestJson = formatJsonPayload(payload);
    const payloadDigest = sha256(payloadManifestJson);
    const manifestLayerPath = path.join(
      root,
      'release-set-artifacts',
      `${packageId}-${manifest.version}-package-manifest.json`,
    );
    const payloadLayerPath = path.join(
      root,
      'release-set-artifacts',
      `${packageId}-${manifest.version}-payload-manifest.json`,
    );
    fs.writeFileSync(manifestLayerPath, raw);
    fs.writeFileSync(payloadLayerPath, payloadManifestJson);
    const packageArtifactManifest = {
      schemaVersion: 2,
      layers: [
        {
          mediaType: PACKAGE_LAYER_MEDIA_TYPE,
          digest: archiveDigest,
        },
        {
          mediaType: PACKAGE_MANIFEST_LAYER_MEDIA_TYPE,
          digest: manifestDigest,
          annotations: { 'org.opencontainers.image.title': 'package-manifest.json' },
        },
        {
          mediaType: PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE,
          digest: payloadDigest,
          annotations: { 'org.opencontainers.image.title': 'payload-manifest.json' },
        },
      ],
    };
    const artifactDigest = sha256(JSON.stringify(packageArtifactManifest));
    const artifactRepository = `fixture/one-person-lab-packages/${packageId}`;
    artifactManifests[artifactRepository] = packageArtifactManifest;
    artifactManifests[`${artifactRepository}@${manifest.version}`] = packageArtifactManifest;
    artifactManifests[`${artifactRepository}@${artifactDigest}`] = packageArtifactManifest;
    artifactBlobs[archiveDigest] = archivePath;
    artifactBlobs[manifestDigest] = manifestLayerPath;
    artifactBlobs[payloadDigest] = payloadLayerPath;
    const version = {
      package_version: manifest.version,
      capability_abi: capabilityAbi,
      manifest_url: `opl+oci://${sourceArtifactRef}#/package-manifest.json`,
      manifest_sha256: manifestDigest,
      manifest_json: raw,
      package_manifest: {
        ref: `opl+oci://${sourceArtifactRef}#/package-manifest.json`,
        sha256: manifestDigest,
      },
      content_digest: manifest.content_lock?.digest ?? manifestDigest,
      payload_digest: payloadDigest,
      payload_manifest_json: payloadManifestJson,
      payload_manifest_sha256: payloadDigest,
      source_artifact_ref: sourceArtifactRef,
      artifact_digest: artifactDigest,
      artifact_status: 'published_immutable',
      package_content_digest: archiveDigest,
      owner_source_commit: sourceCommit,
      dependency_package_ids: manifest.capability_dependencies?.map((entry: any) => entry.package_id) ?? [],
      selection_status: 'selected_for_release_set',
    };
    const entry = packages[packageId] ?? {
      package_id: packageId,
      package_role: capabilityAbi ? 'framework_capability_package' : 'standard_agent',
      selected_version: manifest.version,
      versions: [],
    };
    entry.selected_version = manifest.version;
    entry.versions.push(version);
    packages[packageId] = entry;
  }
  const corruptInlineManifest = options.corruptInlineManifestPackageId
    ? packages[options.corruptInlineManifestPackageId]?.versions[0]
    : null;
  if (corruptInlineManifest?.manifest_json) {
    corruptInlineManifest.manifest_json = `${corruptInlineManifest.manifest_json} `;
  }
  const catalogPath = path.join(root, 'capability-catalog.json');
  fs.writeFileSync(catalogPath, formatJsonPayload({
    surface_kind: 'opl_package_catalog.v1',
    release_set_generation: 'fixture',
    packages: { package_catalog: packages },
  }));
  const catalogDigest = sha256(fs.readFileSync(catalogPath));
  const channelRepository = 'fixture/one-person-lab-manifest';
  const channelManifest = {
    schemaVersion: 2,
    layers: [{
      mediaType: CHANNEL_MANIFEST_LAYER_MEDIA_TYPE,
      digest: catalogDigest,
    }],
  };
  artifactManifests[channelRepository] = channelManifest;
  artifactManifests[`${channelRepository}@fixture`] = channelManifest;
  artifactBlobs[catalogDigest] = catalogPath;
  const binRoot = writeReleaseSetCurlFixture({
    root,
    manifests: artifactManifests,
    blobs: artifactBlobs,
  });
  return {
    catalogPath,
    env: {
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: FIXTURE_PACKAGE_CHANNEL_REF,
      OPL_PACKAGES_OWNER: 'fixture',
      PATH: `${binRoot}:${process.env.PATH ?? ''}`,
    },
  };
}

export const writeCapabilityCatalog = writePackageCatalog;

export function writeMasConsumer(
  root: string,
  providerManifestPath: string,
  version = '0.1.0a4',
  options: {
    runtimeSourceCarrier?: boolean;
    capabilityCatalogRef?: string;
    packageCatalogRef?: string;
    packageId?: string;
    providerPackageId?: string;
    agentId?: string;
    pluginId?: string;
    consumerProfileId?: string;
    requiredExportIds?: string[];
    requiredModuleIds?: string[];
    required?: boolean;
    dependencyKind?: 'hard_runtime_dependency' | 'optional_enhancement';
  } = {},
) {
  const packageVersion = version.replace(/^(\d+\.\d+\.\d+)a(\d+)$/, '$1-alpha.$2');
  const agentId = options.agentId ?? 'mas';
  const dependencyRequired = options.required ?? true;
  const pluginId = options.pluginId ?? (agentId === 'mas' ? 'med-autoscience' : agentId);
  const pluginRoot = path.join(root, 'plugins', pluginId);
  fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, 'skills', pluginId), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: pluginId,
    version: packageVersion,
  }));
  fs.writeFileSync(
    path.join(pluginRoot, 'skills', pluginId, 'SKILL.md'),
    `# ${pluginId}\n`,
  );
  const manifestPath = path.join(root, 'mas.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: agentId,
    package_id: options.packageId ?? 'mas',
    display_name: 'Med Auto Science',
    publisher: 'one-person-lab',
    version: packageVersion,
    owner_language_version: { scheme: 'pep440', value: version },
    source: 'test_consumer',
    ...((options.packageCatalogRef ?? options.capabilityCatalogRef) ? {
      managed_update_source: {
        kind: 'managed_version_catalog',
        transport: 'json_url',
        catalog_ref: options.packageCatalogRef ?? options.capabilityCatalogRef,
        selection_policy: 'highest_stable',
        digest_authority: 'manifest_and_content_digest',
      },
    } : {}),
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: pluginId,
      plugin_source_path: pluginRoot,
      required_skill_ids: [pluginId],
    },
    ...(options.runtimeSourceCarrier ? {
      runtime_source_carrier: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'medautoscience',
      },
    } : {}),
    capability_dependencies: [{
      module_id: 'scholarskills',
      package_id: options.providerPackageId ?? 'mas-scholar-skills',
      kind: 'framework_capability_package',
      required: dependencyRequired,
      dependency_kind: options.dependencyKind
        ?? (dependencyRequired ? 'hard_runtime_dependency' : 'optional_enhancement'),
      version_requirement: '>=0.1.0 <0.2.0',
      capability_abi: 'mas-scholar-skills.v1',
      ...(options.consumerProfileId ? { consumer_profile_id: options.consumerProfileId } : {}),
      required_export_ids: options.requiredExportIds ?? scholarSkillsCoreSkillIds,
      required_module_ids: options.requiredModuleIds ?? scholarSkillsModuleIds,
      bootstrap_manifest_url: providerManifestPath,
      ...(options.capabilityCatalogRef ? {
        dependency_source: {
          kind: 'managed_version_catalog',
          transport: 'json_url',
          catalog_ref: options.capabilityCatalogRef,
          selection_policy: 'highest_compatible',
          digest_authority: 'manifest_and_content_digest',
        },
      } : {
        manifest_url: providerManifestPath,
      }),
      codex_distribution: 'bundled',
      opl_distribution: 'managed_dependency',
      developer_distribution: 'source_checkout',
      required_for: ['workspace_or_quest_codex_discovery'],
      install_owner: 'one-person-lab',
      install_update_source: 'ghcr_capability_packages_channel',
      sync_scopes: ['workspace', 'quest'],
      authority_boundary: {
        can_write_domain_truth: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_write_runtime_queue: false,
      },
    }],
  }));
  return manifestPath;
}

function commitDeveloperFixture(checkoutPath: string, message: string) {
  execFileSync('git', ['init', '-q'], { cwd: checkoutPath });
  execFileSync('git', ['config', 'user.name', 'OPL Fixture'], { cwd: checkoutPath });
  execFileSync('git', ['config', 'user.email', 'opl-fixture@example.test'], { cwd: checkoutPath });
  execFileSync('git', ['add', '.'], { cwd: checkoutPath });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: checkoutPath });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkoutPath, encoding: 'utf8' }).trim();
}

export function commitDeveloperCheckout(checkoutPath: string, message: string) {
  execFileSync('git', ['add', '-A'], { cwd: checkoutPath });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: checkoutPath });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkoutPath, encoding: 'utf8' }).trim();
}

function writeDeveloperMasRuntimeProbeFixtures(checkoutPath: string, version: string) {
  const writeJson = (relativePath: string, value: unknown) => {
    const targetPath = path.join(checkoutPath, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, formatJsonPayload(value));
  };
  const packRefs = [
    'agent/stages/manifest.json',
    'agent/stages/scout.md',
    'agent/prompts/scout.md',
    'agent/knowledge/domain.md',
    'agent/quality_gates/quality.md',
    'agent/skills/domain.md',
    'agent/tools/domain.md',
  ];
  for (const relativePath of packRefs.filter((entry) => !entry.endsWith('manifest.json'))) {
    const targetPath = path.join(checkoutPath, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `# MAS developer fixture ${relativePath}\n`);
  }
  fs.writeFileSync(
    path.join(checkoutPath, 'contracts', 'domain_descriptor.json'),
    formatJsonPayload({
      surface_kind: 'domain_agent_descriptor',
      schema_version: 1,
      domain_id: 'medautoscience',
      domain_label: 'MAS developer package fixture',
      standard_agent_interface: {
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          locator_surface_kind: 'mas_workspace_locator',
          default_profile_id: 'one_off',
          workspace_kind: 'medical_research_workspace',
          project_kind: 'medical_research_project',
          project_collection_label: 'studies',
          default_workspace_id: 'mas-workspace',
          default_project_id: 'mas-project',
          required_locator_fields: ['workspace_root'],
          optional_locator_fields: ['profile_ref'],
        },
        runtime: {
          runtime_domain_id: 'medautoscience',
          registration_ref: null,
        },
        progress: {
          deliverable_delta_aliases: ['deliverable_progress_delta'],
          platform_delta_aliases: ['platform_repair_delta'],
        },
        routing: {
          explicit_aliases: ['mas', 'med-autoscience'],
          workstream_ids: ['medical_research'],
          intent_signals: ['medical research'],
          ambiguity_policy: 'require_explicit_workstream',
        },
      },
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    }),
  );
  writeJson('contracts/action_catalog.json', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'medautoscience.developer-fixture.actions',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [{
      action_id: 'fixture-action',
      title: 'Fixture action',
      summary: 'Exercise the developer package fixture ABI.',
      owner: 'medautoscience',
      effect: 'mutating',
      execution_binding: {
        kind: 'stage_binding',
        stage_manifest_ref: 'agent/stages/manifest.json',
      },
      input_schema_ref: 'contracts/input.schema.json',
      output_schema_ref: 'contracts/output.schema.json',
      required_fields: ['workspace_root'],
      optional_fields: [],
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      stage_route: {
        entry_stage_ref: 'scout',
        required_stage_refs: ['scout'],
        optional_stage_refs: [],
        terminal_stage_refs: ['scout'],
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'domain_cli' },
        mcp: { tool_name: 'mas_fixture_action', surface_kind: 'domain_mcp' },
        skill: { command_contract_id: 'mas.fixture-action', surface_kind: 'domain_skill' },
        product_entry: { action_key: 'fixture-action', surface_kind: 'domain_product_entry' },
        openai: { tool_name: 'mas_fixture_action' },
        ai_sdk: { tool_name: 'mas_fixture_action' },
      },
    }],
    notes: [],
  });
  writeJson('contracts/domain_handler_registry.json', {
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [],
  });
  writeJson('contracts/input.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { workspace_root: { type: 'string' } },
    required: ['workspace_root'],
  });
  writeJson('contracts/output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
  });
  writeJson('contracts/owner_receipt_contract.json', {
    surface_kind: 'owner_receipt_contract',
  });
  const authorityFunctionReadme = path.join(
    checkoutPath,
    'runtime',
    'authority_functions',
    'README.md',
  );
  fs.mkdirSync(path.dirname(authorityFunctionReadme), { recursive: true });
  fs.writeFileSync(authorityFunctionReadme, '# MAS fixture authority functions\n');
  writeJson('contracts/pack_compiler_input.json', {
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: 'medautoscience',
    canonical_agent_id: 'mas',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generated_surface_owner: false,
    },
    required_domain_pack_paths: packRefs,
  });
  writeJson('agent/stages/manifest.json', {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: [{
      stage_id: 'scout',
      stage_kind: 'intake',
      title: 'Fixture stage',
      display_names: { 'en-US': 'Fixture stage' },
      summary: 'Exercise the developer package fixture ABI.',
      goal: 'Keep the package fixture structurally valid.',
      policy_ref: 'agent/stages/scout.md',
      prompt_ref: 'agent/prompts/scout.md',
      knowledge_refs: ['agent/knowledge/domain.md'],
      quality_gate_refs: ['agent/quality_gates/quality.md'],
      allowed_action_refs: ['fixture-action'],
      requires: ['fixture_request'],
      ensures: ['fixture_observation'],
      next_stage_refs: [],
      trust_lane: 'domain_agent',
    }],
  });
  const primarySkillPath = path.join(checkoutPath, 'agent', 'primary_skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(primarySkillPath), { recursive: true });
  fs.writeFileSync(primarySkillPath, `# Med Auto Science\n\nDeveloper runtime probe fixture ${version}.\n`);
}

export function writeDeveloperCapabilityCheckoutClosure(input: {
  masCheckout: string;
  scholarCheckout: string;
  masManifestPath: string;
  providerManifestPath: string;
}) {
  const masManifest = JSON.parse(fs.readFileSync(input.masManifestPath, 'utf8'));
  const providerRoot = path.dirname(input.providerManifestPath);
  fs.mkdirSync(path.join(input.masCheckout, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(input.masCheckout, 'plugins', 'med-autoscience', '.codex-plugin'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(input.masCheckout, 'plugins', 'med-autoscience', 'skills', 'med-autoscience'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(input.masCheckout, 'contracts', 'opl_agent_package_manifest.json'),
    formatJsonPayload(masManifest),
  );
  writeDeveloperMasRuntimeProbeFixtures(input.masCheckout, masManifest.version);
  fs.writeFileSync(
    path.join(input.masCheckout, 'plugins', 'med-autoscience', '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'med-autoscience',
      version: masManifest.version,
      displayName: 'Med Auto Science',
      description: 'Developer checkout fixture.',
    }),
  );
  fs.writeFileSync(
    path.join(input.masCheckout, 'plugins', 'med-autoscience', 'skills', 'med-autoscience', 'SKILL.md'),
    '# Med Auto Science\n\nDeveloper checkout fixture.\n',
  );
  fs.writeFileSync(
    path.join(input.masCheckout, 'plugins', 'med-autoscience', 'skills', 'med-autoscience', 'helper.txt'),
    'MAS developer helper A\n',
  );

  fs.mkdirSync(path.join(input.scholarCheckout, 'contracts'), { recursive: true });
  fs.copyFileSync(
    input.providerManifestPath,
    path.join(input.scholarCheckout, 'contracts', 'opl_capability_package_manifest.json'),
  );
  fs.cpSync(
    path.join(providerRoot, '.codex-plugin'),
    path.join(input.scholarCheckout, '.codex-plugin'),
    { recursive: true },
  );
  fs.cpSync(
    path.join(providerRoot, 'skills'),
    path.join(input.scholarCheckout, 'skills'),
    { recursive: true },
  );
  const nestedAsset = path.join(
    input.scholarCheckout,
    'skills',
    'medical-manuscript-writing',
    'fixtures',
    'nested.txt',
  );
  fs.mkdirSync(path.dirname(nestedAsset), { recursive: true });
  fs.writeFileSync(nestedAsset, 'nested developer fixture A\n');

  return {
    masHead: commitDeveloperFixture(input.masCheckout, 'fixture A'),
    scholarHead: commitDeveloperFixture(input.scholarCheckout, 'fixture A'),
    providerHelperPath: path.join(
      input.scholarCheckout,
      'skills',
      'medical-manuscript-writing',
      'helper.txt',
    ),
    providerRequiredSkillPath: path.join(
      input.scholarCheckout,
      'skills',
      'medical-manuscript-writing',
      'SKILL.md',
    ),
    providerNestedAssetPath: nestedAsset,
  };
}

export function updateDeveloperCapabilityCheckoutClosure(input: {
  masCheckout: string;
  scholarCheckout: string;
  masManifestPath: string;
  providerManifestPath: string;
  message?: string;
}) {
  const masManifest = JSON.parse(fs.readFileSync(input.masManifestPath, 'utf8'));
  const providerRoot = path.dirname(input.providerManifestPath);
  fs.writeFileSync(
    path.join(input.masCheckout, 'contracts', 'opl_agent_package_manifest.json'),
    formatJsonPayload(masManifest),
  );
  writeDeveloperMasRuntimeProbeFixtures(input.masCheckout, masManifest.version);
  fs.writeFileSync(
    path.join(input.masCheckout, 'plugins', 'med-autoscience', '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'med-autoscience',
      version: masManifest.version,
      displayName: 'Med Auto Science',
      description: 'Developer checkout fixture.',
    }),
  );
  fs.copyFileSync(
    input.providerManifestPath,
    path.join(input.scholarCheckout, 'contracts', 'opl_capability_package_manifest.json'),
  );
  fs.cpSync(
    path.join(providerRoot, '.codex-plugin'),
    path.join(input.scholarCheckout, '.codex-plugin'),
    { recursive: true, force: true },
  );
  fs.cpSync(
    path.join(providerRoot, 'skills'),
    path.join(input.scholarCheckout, 'skills'),
    { recursive: true, force: true },
  );
  const message = input.message ?? 'fixture update';
  return {
    masHead: commitDeveloperCheckout(input.masCheckout, message),
    scholarHead: commitDeveloperCheckout(input.scholarCheckout, message),
  };
}
