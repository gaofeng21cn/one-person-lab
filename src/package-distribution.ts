import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
import { readBundledCodexDefaultProfile } from './local-codex-defaults.ts';

type PackageModuleId = 'medautoscience' | 'meddeepscientist' | 'medautogrant' | 'redcube';

type PackageModuleSpec = {
  module_id: PackageModuleId;
  label: string;
  repo_name: string;
  repo_url: string;
  scope: 'domain_module' | 'runtime_dependency';
  package_name: string;
  dependency_of?: PackageModuleId[];
};

type BuildPackageManifestInput = Partial<{
  version: string;
  generatedAt: string;
  owner: string;
  rollbackVersion: string | null;
  retainVersions: number;
}>;

export type OplPackageManifest = ReturnType<typeof buildOplPackageManifest>;

const MODULE_SPECS: PackageModuleSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    package_name: 'med-autoscience',
  },
  {
    module_id: 'meddeepscientist',
    label: 'Med Deep Scientist',
    repo_name: 'med-deepscientist',
    repo_url: 'https://github.com/gaofeng21cn/med-deepscientist.git',
    scope: 'runtime_dependency',
    package_name: 'med-deepscientist',
    dependency_of: ['medautoscience'],
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    package_name: 'med-autogrant',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    package_name: 'redcube-ai',
  },
];

function resolveOwner(inputOwner?: string) {
  if (inputOwner?.trim()) {
    return inputOwner.trim();
  }
  const repo = getOplReleaseRepo();
  return repo.split('/')[0] || 'gaofeng21cn';
}

function buildPackageRef(owner: string, name: string, version: string) {
  return `ghcr.io/${owner}/one-person-lab-modules/${name}:${version}`;
}

function normalizeRetainVersions(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }
  return Math.max(2, Math.floor(value));
}

function buildReleaseAutomation(retainVersions: number, rollbackVersion: string | null) {
  return {
    status: 'prepared_not_consumed_by_module_install_update',
    channel_manifest: {
      manifest_kind: 'opl_release_channel_manifest.v1',
      generated_by: 'scripts/package-module-archives.mjs',
      outputs: {
        release_manifest: 'opl-release-manifest.json',
        channel_manifest: 'opl-channel-manifest.json',
        checksums: 'SHA256SUMS',
      },
      latest_source_until_packages_consumed: 'git_checkout_upstream_default_branch',
    },
    artifact_build: {
      workflow: '.github/workflows/packages.yml',
      command: 'npm run packages:manifest -- --version <opl_version>',
      artifact_kind: 'git_archive_source_tarball',
    },
    checksum: {
      algorithm: 'sha256',
      recorded_in: ['source_archive.sha256', 'SHA256SUMS'],
      required_before_publish: true,
    },
    rollback: {
      strategy: 'previous_channel_manifest_target',
      previous_version: rollbackVersion,
      input: '--previous-manifest <path>',
      failure_behavior: 'keep_current_git_checkout_or_restore_previous_manifest_target',
    },
    cleanup: {
      strategy: 'retain_latest_n_versions_and_declared_rollbacks',
      retain_versions: retainVersions,
      applies_to: ['one-person-lab-modules/*', 'one-person-lab-manifest'],
    },
  };
}

function buildModuleReleaseDiscipline(spec: PackageModuleSpec, rollbackVersion: string | null) {
  return {
    module_truth_owner: spec.repo_name,
    package_publish_owner: 'one-person-lab_central_packages_workflow',
    current_latest_source: 'git_checkout_upstream_default_branch',
    future_package_latest_source: 'opl_release_channel_manifest',
    required_gates: [
      'upstream_default_branch_reachable',
      'clean_checkout_or_fresh_clone',
      'source_archive_built_from_head',
      'sha256_recorded',
      'channel_manifest_written',
      'rollback_target_declared_when_previous_manifest_exists',
    ],
    rollback: rollbackVersion
      ? {
          version: rollbackVersion,
          source: 'previous_channel_manifest',
        }
      : null,
  };
}

export function buildOplPackageManifest(input: BuildPackageManifestInput = {}) {
  const version = input.version?.trim() || getOplReleaseVersion();
  const owner = resolveOwner(input.owner);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const retainVersions = normalizeRetainVersions(input.retainVersions);
  const rollbackVersion = input.rollbackVersion === undefined ? null : input.rollbackVersion;

  return {
    manifest_version: 1,
    opl_version: version,
    gui_version: process.env.OPL_GUI_VERSION?.trim() || null,
    release_channel: process.env.OPL_RELEASE_CHANNEL?.trim() || 'stable',
    generated_at: generatedAt,
    module_install_update_source: 'git_checkout',
    package_consumption_status: 'packages_defined_not_consumed_by_install_update',
    release_automation: buildReleaseAutomation(retainVersions, rollbackVersion),
    packages: {
      codex_default_profile: readBundledCodexDefaultProfile(),
      webui_docker_image: {
        image: `ghcr.io/${owner}/one-person-lab-webui:${version}`,
        aliases: [`ghcr.io/${owner}/one-person-lab-webui:latest`],
      },
      native_helper: {
        image: `ghcr.io/${owner}/one-person-lab-native-helper`,
        version_source: 'native/opl-native-helper/Cargo.toml',
        target_tag_template: `ghcr.io/${owner}/one-person-lab-native-helper:<target>-<native_helper_version>`,
      },
      modules: Object.fromEntries(
        MODULE_SPECS.map((spec) => [
          spec.module_id,
          {
            module_id: spec.module_id,
            label: spec.label,
            repo_name: spec.repo_name,
            repo_url: spec.repo_url,
            scope: spec.scope,
            version,
            artifact_kind: 'source_archive',
            artifact: buildPackageRef(owner, spec.package_name, version),
            package_consumption_status: 'defined_not_consumed_by_install_update',
            current_install_update_source: 'git_checkout',
            fallback_git: {
              repo_url: spec.repo_url,
              ref: 'main',
            },
            release_discipline: buildModuleReleaseDiscipline(spec, rollbackVersion),
            install_strategy: 'extract_to_managed_modules_root',
            dependency_of: spec.dependency_of ?? [],
          },
        ]),
      ),
    },
  };
}

export function getOplPackageModuleSpecs() {
  return [...MODULE_SPECS];
}

export function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function writeOplPackageManifest(outputPath: string, manifest = buildOplPackageManifest()) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return outputPath;
}
