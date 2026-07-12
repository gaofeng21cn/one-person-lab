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

function contentDigest(root: string, paths: string[]) {
  const digest = crypto.createHash('sha256');
  for (const relativePath of paths) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(root, relativePath)));
  }
  return `sha256:${digest.digest('hex')}`;
}

export function writeCapabilityProvider(root: string, version = '0.1.0') {
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'mas-scholar-skills',
    version,
  }));
  for (const skillId of [...scholarSkillsCoreSkillIds, 'medical-optional-specialty']) {
    const skillRoot = path.join(root, 'skills', skillId);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${skillId}\n`);
    fs.writeFileSync(path.join(skillRoot, 'helper.txt'), `${skillId} helper ${version}\n`);
  }
  const lockPaths = [
    '.codex-plugin/plugin.json',
    ...scholarSkillsCoreSkillIds.map((skillId) => `skills/${skillId}/SKILL.md`),
  ];
  const manifestPath = path.join(root, 'provider.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_capability_package_manifest.v2',
    package_id: 'mas-scholar-skills',
    display_name: 'MAS Scholar Skills',
    publisher: 'one-person-lab',
    version,
    source: 'test_provider',
    package_role: 'required_agent_capability_package',
    capability_abi: {
      id: 'mas-scholar-skills.v1',
      version: '1.0.0',
      compatibility_policy: 'same_major',
    },
    exports: {
      core_skill_ids: scholarSkillsCoreSkillIds,
      core_module_ids: scholarSkillsModuleIds,
      optional_skill_policy_ref: 'test://optional-specialties',
      optional_skills_installed_by_default: false,
    },
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_nul_file_bytes',
      paths: lockPaths,
      digest: contentDigest(root, lockPaths),
    },
    codex_surface: {
      plugin_id: 'mas-scholar-skills',
      plugin_source_path: '.',
      codex_default_exposure: false,
      optional_install_policy: 'named_specialty_only',
    },
  }));
  return manifestPath;
}

export function writeMasConsumer(root: string, providerManifestPath: string, version = '0.1.0a4') {
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, 'mas.json');
  fs.writeFileSync(manifestPath, formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'med-autoscience',
    package_id: 'med-autoscience',
    display_name: 'Med Auto Science',
    publisher: 'one-person-lab',
    version,
    source: 'test_consumer',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'med-autoscience',
      required_skill_ids: ['med-autoscience'],
    },
    capability_dependencies: [{
      module_id: 'scholarskills',
      package_id: 'mas-scholar-skills',
      kind: 'framework_capability_package',
      required: true,
      version_requirement: '>=0.1.0 <0.2.0',
      capability_abi: 'mas-scholar-skills.v1',
      required_export_ids: scholarSkillsCoreSkillIds,
      required_module_ids: scholarSkillsModuleIds,
      manifest_url: providerManifestPath,
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
