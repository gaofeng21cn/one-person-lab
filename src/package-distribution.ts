import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';

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

export function buildOplPackageManifest(input: BuildPackageManifestInput = {}) {
  const version = input.version?.trim() || getOplReleaseVersion();
  const owner = resolveOwner(input.owner);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    manifest_version: 1,
    opl_version: version,
    gui_version: process.env.OPL_GUI_VERSION?.trim() || null,
    release_channel: process.env.OPL_RELEASE_CHANNEL?.trim() || 'stable',
    generated_at: generatedAt,
    packages: {
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
            fallback_git: {
              repo_url: spec.repo_url,
              ref: 'main',
            },
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
