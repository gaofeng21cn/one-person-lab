import crypto from 'node:crypto';

import { formatJsonPayload, fs, path } from './helpers.ts';

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
  for (const manifestPath of manifestPaths) {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    const packageId = manifest.package_id;
    const manifestDigest = `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`;
    const capabilityAbi = manifest.surface_kind === 'opl_capability_package_manifest.v2'
      ? manifest.capability_abi.id
      : null;
    const version = {
      package_version: manifest.version,
      capability_abi: capabilityAbi,
      manifest_url: manifestPath,
      manifest_sha256: manifestDigest,
      manifest_json: raw,
      package_manifest: {
        ref: manifestPath,
        sha256: manifestDigest,
      },
      content_digest: manifest.content_lock?.digest ?? null,
      payload_digest: manifest.content_lock?.digest ?? null,
      source_artifact_ref: manifestPath,
      artifact_digest: `sha256:${crypto.createHash('sha256').update(`artifact:${packageId}:${manifest.version}`).digest('hex')}`,
      artifact_status: 'published_immutable',
      package_content_digest: manifest.content_lock?.digest ?? manifestDigest,
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
    packages: { package_catalog: packages },
  }));
  return catalogPath;
}

export const writeCapabilityCatalog = writePackageCatalog;

export function writeMasConsumer(
  root: string,
  providerManifestPath: string,
  version = '0.1.0a4',
  options: { runtimeSourceCarrier?: boolean; capabilityCatalogRef?: string; packageCatalogRef?: string } = {},
) {
  const packageVersion = version.replace(/^(\d+\.\d+\.\d+)a(\d+)$/, '$1-alpha.$2');
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, 'mas.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'mas',
    package_id: 'mas',
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
      package_id: 'mas-scholar-skills',
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
