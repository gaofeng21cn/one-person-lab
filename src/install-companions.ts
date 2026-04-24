import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOplGuiArtifactName, buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from './opl-skills.ts';

export type OplCompanionSkillStatus = 'ready' | 'missing';

type OplCompanionSkillSourceCandidate = {
  report_path: string;
  link_path: string;
};
export type OplCompanionSkillSyncStatus = 'synced' | 'available' | 'missing_source' | 'failed';

export type OplCompanionSkillSyncItem = {
  skill_id: string;
  source_path: string | null;
  target_path: string;
  status: OplCompanionSkillSyncStatus;
  note: string | null;
};

export type OplCompanionSkillSyncResult = {
  surface_id: 'opl_companion_skill_sync';
  codex_skills_dir: string;
  items: OplCompanionSkillSyncItem[];
  summary: {
    total: number;
    synced: number;
    missing_source: number;
    failed: number;
  };
};

export type OplRecommendedSkill = {
  skill_id: string;
  label: string;
  required: boolean;
  source: 'superpowers' | 'skills_manager' | 'codex_builtin';
  expected_paths: string[];
  status: OplCompanionSkillStatus;
  install_hint: string;
  supports: string[];
};

export type OplGuiShellSurface = {
  shell_id: 'opl_aion_shell';
  label: 'OPL Desktop GUI';
  owner: 'opl-aion-shell';
  base_shell: 'aionui';
  relation_to_opl: 'opl_branded_gui_shell';
  repo_url: string;
  release_repo: string;
  release_tag: string;
  opl_release_version: string;
  sibling_checkout_path: string;
  sibling_checkout_found: boolean;
  product_identity: {
    app_name: string;
    bundle_name: string;
    required_branding: string[];
    hidden_upstream_modules: string[];
  };
  release_strategy: 'prefer_prebuilt_release_then_source_build';
  prebuilt_artifacts: Array<{
    platform: 'macos' | 'windows' | 'linux';
    architectures: string[];
    distributable_patterns: string[];
    updater_metadata: string[];
  }>;
  fallback_build_commands: string[];
  notes: string[];
};

function resolveHomeDir() {
  return process.env.HOME?.trim() || os.homedir();
}

function pathExists(filePath: string) {
  return fs.existsSync(filePath);
}

function buildSkillStatus(expectedPaths: string[]): OplCompanionSkillStatus {
  return expectedPaths.some((candidate) => resolveSkillSourceCandidate(candidate)) ? 'ready' : 'missing';
}

function resolveCodexSkillsDir(home: string) {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  return path.join(codexHome, 'skills');
}

function forceSymlinkDirectory(sourcePath: string, targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.symlinkSync(sourcePath, targetPath, 'junction');
}

function resolveSkillSourceCandidate(candidatePath: string): OplCompanionSkillSourceCandidate | null {
  if (!pathExists(candidatePath)) {
    return null;
  }

  const stat = fs.statSync(candidatePath);
  if (stat.isDirectory()) {
    const skillFilePath = path.join(candidatePath, 'SKILL.md');
    return pathExists(skillFilePath) ? { report_path: candidatePath, link_path: candidatePath } : null;
  }

  if (stat.isFile() && path.basename(candidatePath) === 'SKILL.md') {
    return { report_path: candidatePath, link_path: path.dirname(candidatePath) };
  }

  return null;
}

function pickFirstExistingSkillSource(paths: string[]) {
  for (const candidatePath of paths) {
    const source = resolveSkillSourceCandidate(candidatePath);
    if (source) {
      return source;
    }
  }

  return null;
}

export function syncOplCompanionSkills(home = resolveHomeDir()): OplCompanionSkillSyncResult {
  const codexSkillsDir = resolveCodexSkillsDir(home);
  const recommendedSkills = buildOplRecommendedSkills(home);
  const items: OplCompanionSkillSyncItem[] = [];

  for (const skill of recommendedSkills) {
    const source = pickFirstExistingSkillSource(skill.expected_paths);
    const targetPath = path.join(codexSkillsDir, skill.skill_id);
    if (!source) {
      items.push({
        skill_id: skill.skill_id,
        source_path: null,
        target_path: targetPath,
        status: 'missing_source',
        note: skill.install_hint,
      });
      continue;
    }

    try {
      if (skill.source === 'codex_builtin') {
        fs.rmSync(targetPath, { recursive: true, force: true });
        items.push({
          skill_id: skill.skill_id,
          source_path: source.report_path,
          target_path: targetPath,
          status: 'available',
          note: 'Codex bundled skills are discovered from the plugin cache and are not mirrored into ~/.codex/skills.',
        });
      } else {
        forceSymlinkDirectory(source.link_path, targetPath);
        items.push({
          skill_id: skill.skill_id,
          source_path: source.report_path,
          target_path: targetPath,
          status: 'synced',
          note: null,
        });
      }
    } catch (error) {
      items.push({
        skill_id: skill.skill_id,
        source_path: source.report_path,
        target_path: targetPath,
        status: 'failed',
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    surface_id: 'opl_companion_skill_sync',
    codex_skills_dir: codexSkillsDir,
    items,
    summary: {
      total: items.length,
      synced: items.filter((entry) => entry.status === 'synced' || entry.status === 'available').length,
      missing_source: items.filter((entry) => entry.status === 'missing_source').length,
      failed: items.filter((entry) => entry.status === 'failed').length,
    },
  };
}

export function buildOplRecommendedSkills(home = resolveHomeDir()): OplRecommendedSkill[] {
  const codexHome = path.join(home, '.codex');
  const skillsManagerHome = path.join(home, '.skills-manager');

  const specs: Array<Omit<OplRecommendedSkill, 'status'>> = [
    {
      skill_id: 'superpowers',
      label: 'Superpowers process skills',
      required: false,
      source: 'superpowers',
      expected_paths: [
        path.join(codexHome, 'superpowers', 'skills', 'using-superpowers', 'SKILL.md'),
        path.join(codexHome, 'superpowers', 'skills', 'verification-before-completion', 'SKILL.md'),
      ],
      install_hint: 'Install the Superpowers skill pack into ~/.codex/superpowers before first OPL use.',
      supports: ['planning', 'debugging', 'verification', 'branch_finish'],
    },
    {
      skill_id: 'officecli',
      label: 'officecli core skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli', 'SKILL.md')],
      install_hint: 'Install the officecli skill and binary so MAS/MAG/RCA can handle Office deliverables.',
      supports: ['docx', 'pptx', 'xlsx'],
    },
    {
      skill_id: 'officecli-docx',
      label: 'officecli Word skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-docx', 'SKILL.md')],
      install_hint: 'Install officecli-docx for Word document creation and editing.',
      supports: ['docx', 'academic_paper'],
    },
    {
      skill_id: 'officecli-pptx',
      label: 'officecli PowerPoint skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-pptx', 'SKILL.md')],
      install_hint: 'Install officecli-pptx for presentation creation and editing.',
      supports: ['pptx', 'pitch_deck'],
    },
    {
      skill_id: 'officecli-xlsx',
      label: 'officecli Excel skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-xlsx', 'SKILL.md')],
      install_hint: 'Install officecli-xlsx for spreadsheet and dashboard work.',
      supports: ['xlsx', 'dashboard'],
    },
    {
      skill_id: 'morph-ppt',
      label: 'Morph presentation skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'morph-ppt', 'SKILL.md')],
      install_hint: 'Install morph-ppt for animated presentation deliverables.',
      supports: ['pptx', 'morph_transition'],
    },
    {
      skill_id: 'openai_primary_runtime_office',
      label: 'Codex native Office skills',
      required: false,
      source: 'codex_builtin',
      expected_paths: [
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'documents', '26.423.10653', 'skills', 'documents', 'SKILL.md'),
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'presentations', '26.423.10653', 'skills', 'presentations', 'SKILL.md'),
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'spreadsheets', '26.423.10653', 'skills', 'spreadsheets', 'SKILL.md'),
      ],
      install_hint: 'Use Codex bundled Documents, Presentations, and Spreadsheets skills when available.',
      supports: ['documents', 'presentations', 'spreadsheets'],
    },
  ];

  return specs.map((spec) => ({
    ...spec,
    status: buildSkillStatus(spec.expected_paths),
  }));
}

export function buildOplGuiShellSurface(repoRoot: string): OplGuiShellSurface {
  const workspaceRoot = resolveFamilyWorkspaceRootFromRepoRoot(repoRoot);
  const siblingCheckoutPath = path.join(workspaceRoot, 'opl-aion-shell');
  const releaseVersion = getOplReleaseVersion();

  return {
    shell_id: 'opl_aion_shell',
    label: 'OPL Desktop GUI',
    owner: 'opl-aion-shell',
    base_shell: 'aionui',
    relation_to_opl: 'opl_branded_gui_shell',
    repo_url: 'https://github.com/gaofeng21cn/opl-aion-shell',
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
      'OPL owns the runtime contract and Product API truth; opl-aion-shell owns the OPL-branded desktop GUI package built on the AionUI codebase.',
      'A valid OPL GUI package is an OPL-branded Electron-builder distributable uploaded to the one-person-lab GitHub Release. The GUI source repository is internal build input.',
      'The upstream AionUI app is not itself the OPL GUI.',
      'Source build is only the fallback when no release asset matches the local platform and architecture.',
    ],
  };
}
