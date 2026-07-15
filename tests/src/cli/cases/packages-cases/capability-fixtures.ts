import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { formatJsonPayload, fs, path } from './helpers.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from '../../../../../src/modules/connect/agent-package-registry-parts/payload-content-lock.ts';
import { resolveOplDomainModuleSpec } from '../../../../../src/modules/connect/system-installation/modules.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
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
    ...coreSkillIds.map((skillId) => `skills/${skillId}/SKILL.md`),
    ...specialtySkillIds.map((skillId) => `skills/${skillId}/SKILL.md`),
  ];
  const manifestPath = path.join(root, 'provider.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_capability_package_manifest.v2',
    package_id: packageId,
    display_name: 'MAS Scholar Skills',
    publisher: 'one-person-lab',
    version,
    source: 'test_provider',
    package_role: 'required_agent_capability_package',
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

export function writePackageCatalog(root: string, manifestPaths: string[]) {
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
    const packageArtifactManifest = {
      schemaVersion: 2,
      layers: [{
        mediaType: PACKAGE_LAYER_MEDIA_TYPE,
        digest: archiveDigest,
      }],
    };
    const artifactDigest = sha256(JSON.stringify(packageArtifactManifest));
    const artifactRepository = `fixture/one-person-lab-packages/${packageId}`;
    artifactManifests[artifactRepository] = packageArtifactManifest;
    artifactManifests[`${artifactRepository}@${manifest.version}`] = packageArtifactManifest;
    artifactManifests[`${artifactRepository}@${artifactDigest}`] = packageArtifactManifest;
    artifactBlobs[archiveDigest] = archivePath;
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
  } = {},
) {
  const packageVersion = version.replace(/^(\d+\.\d+\.\d+)a(\d+)$/, '$1-alpha.$2');
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, 'mas.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'mas',
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
      required_skill_ids: ['med-autoscience'],
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
      required: true,
      version_requirement: '>=0.1.0 <0.2.0',
      capability_abi: 'mas-scholar-skills.v1',
      required_export_ids: scholarSkillsCoreSkillIds,
      required_module_ids: scholarSkillsModuleIds,
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
