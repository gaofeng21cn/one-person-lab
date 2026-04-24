import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveFamilyWorkspaceRootFromRepoRoot } from './opl-skills.ts';

export type OplCompanionSkillStatus = 'ready' | 'missing';

export type OplRecommendedSkill = {
  skill_id: string;
  label: string;
  required: boolean;
  source: 'superpowers' | 'skills_manager' | 'codex_system';
  expected_paths: string[];
  status: OplCompanionSkillStatus;
  install_hint: string;
  supports: string[];
};

export type OplGuiShellSurface = {
  shell_id: 'aionui';
  label: 'AionUI';
  owner: 'opl-aion-shell';
  relation_to_opl: 'external_gui_shell';
  repo_url: string;
  sibling_checkout_path: string;
  sibling_checkout_found: boolean;
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
  return expectedPaths.some((candidate) => pathExists(candidate)) ? 'ready' : 'missing';
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
      label: 'officecli document skills',
      required: false,
      source: 'skills_manager',
      expected_paths: [
        path.join(skillsManagerHome, 'skills', 'officecli', 'SKILL.md'),
        path.join(skillsManagerHome, 'skills', 'officecli-docx', 'SKILL.md'),
        path.join(skillsManagerHome, 'skills', 'officecli-pptx', 'SKILL.md'),
        path.join(skillsManagerHome, 'skills', 'officecli-xlsx', 'SKILL.md'),
      ],
      install_hint: 'Install officecli skills and the officecli binary so MAS/MAG/RCA can handle Office deliverables.',
      supports: ['docx', 'pptx', 'xlsx', 'academic_paper', 'pitch_deck'],
    },
    {
      skill_id: 'openai_primary_runtime_office',
      label: 'Codex native Office skills',
      required: false,
      source: 'codex_system',
      expected_paths: [
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'documents'),
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'presentations'),
        path.join(codexHome, 'plugins', 'cache', 'openai-primary-runtime', 'spreadsheets'),
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

  return {
    shell_id: 'aionui',
    label: 'AionUI',
    owner: 'opl-aion-shell',
    relation_to_opl: 'external_gui_shell',
    repo_url: 'https://github.com/gaofeng21cn/opl-aion-shell',
    sibling_checkout_path: siblingCheckoutPath,
    sibling_checkout_found: fs.existsSync(siblingCheckoutPath) && fs.statSync(siblingCheckoutPath).isDirectory(),
    release_strategy: 'prefer_prebuilt_release_then_source_build',
    prebuilt_artifacts: [
      {
        platform: 'macos',
        architectures: ['x64', 'arm64'],
        distributable_patterns: ['AionUi-<version>-mac-x64.dmg', 'AionUi-<version>-mac-arm64.dmg'],
        updater_metadata: ['latest-mac.yml', 'latest-arm64-mac.yml'],
      },
      {
        platform: 'windows',
        architectures: ['x64', 'arm64'],
        distributable_patterns: ['AionUi-<version>-win-x64.exe', 'AionUi-<version>-win-arm64.exe'],
        updater_metadata: ['latest.yml', 'latest-win-arm64.yml'],
      },
      {
        platform: 'linux',
        architectures: ['x64', 'arm64'],
        distributable_patterns: ['AionUi-<version>.deb', 'AionUi-<version>-arm64.deb'],
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
      'OPL owns the runtime contract and Product API truth; opl-aion-shell owns the desktop GUI package.',
      'A prebuilt package is the Electron-builder distributable plus updater metadata uploaded to a GitHub Release.',
      'Source build is only the fallback when no release asset matches the local platform and architecture.',
    ],
  };
}
