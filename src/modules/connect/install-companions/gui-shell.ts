import fs from 'node:fs';
import path from 'node:path';

import { resolveDefaultFamilyWorkspaceRoot } from '../../workspace/index.ts';
import { buildOplGuiArtifactName, buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from '../opl-release.ts';
import type { OplGuiShellSurface } from '../install-companions.ts';

export function buildOplGuiShellSurface(repoRoot: string): OplGuiShellSurface {
  const workspaceRoot = resolveDefaultFamilyWorkspaceRoot({ repoRootHint: repoRoot });
  const siblingCheckoutPath = path.join(workspaceRoot, 'one-person-lab-app');
  const releaseVersion = getOplReleaseVersion();

  return {
    shell_id: 'opl_aion_shell',
    label: 'OPL Desktop GUI',
    owner: 'one-person-lab-app',
    base_shell: 'aionui',
    relation_to_opl: 'opl_branded_gui_shell',
    repo_url: 'https://github.com/gaofeng21cn/one-person-lab-app',
    active_shell_root: 'shells/aionui',
    release_repo: getOplReleaseRepo(),
    release_tag: buildOplReleaseTag(releaseVersion),
    opl_release_version: releaseVersion,
    sibling_checkout_path: siblingCheckoutPath,
    sibling_checkout_found: fs.existsSync(siblingCheckoutPath) && fs.statSync(siblingCheckoutPath).isDirectory(),
    product_identity: {
      app_name: 'OPL',
      bundle_name: 'OPL.app',
      required_branding: ['One Person Lab', 'OPL iconography', 'OPL product wording'],
      hidden_upstream_modules: ['AionUI team management', 'AionUI scheduled tasks', 'generic upstream branding'],
    },
    release_strategy: 'prefer_prebuilt_release_then_source_build',
    prebuilt_artifacts: [
      {
        platform: 'macos',
        architectures: ['x64', 'arm64'],
        distributable_patterns: [
          buildOplGuiArtifactName({ platform: 'macos', arch: 'x64', ext: 'dmg', version: releaseVersion }),
          buildOplGuiArtifactName({ platform: 'macos', arch: 'arm64', ext: 'dmg', version: releaseVersion }),
        ],
        updater_metadata: ['latest-mac.yml', 'latest-arm64-mac.yml'],
      },
      {
        platform: 'windows',
        architectures: ['x64', 'arm64'],
        distributable_patterns: [
          buildOplGuiArtifactName({ platform: 'windows', arch: 'x64', ext: 'exe', version: releaseVersion }),
          buildOplGuiArtifactName({ platform: 'windows', arch: 'arm64', ext: 'exe', version: releaseVersion }),
        ],
        updater_metadata: ['latest.yml', 'latest-win-arm64.yml'],
      },
      {
        platform: 'linux',
        architectures: ['x64', 'arm64'],
        distributable_patterns: [
          buildOplGuiArtifactName({ platform: 'linux', arch: 'x64', ext: 'deb', version: releaseVersion }),
          buildOplGuiArtifactName({ platform: 'linux', arch: 'arm64', ext: 'deb', version: releaseVersion }),
        ],
        updater_metadata: ['latest-linux.yml', 'latest-linux-arm64.yml'],
      },
    ],
    fallback_build_commands: [
      'bun install',
      'bun run dist:mac',
      'bun run dist:win',
      'bun run dist:linux',
    ],
    notes: [
      'OPL owns the runtime contract and App release discovery surface; one-person-lab-app owns the OPL-branded desktop GUI package built from shells/aionui.',
      'A valid OPL GUI package is an OPL-branded Electron-builder distributable uploaded to the one-person-lab-app GitHub Release.',
      'The upstream AionUI app is not itself the OPL GUI.',
      'Source build is only the fallback when no release asset matches the local platform and architecture.',
    ],
  };
}
