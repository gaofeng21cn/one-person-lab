import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildOplGuiArtifactName, buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from './family-workspace-root.ts';
import { runGit } from './system-installation/shared.ts';

export type OplCompanionSkillStatus = 'ready' | 'missing';

type OplCompanionSkillSourceCandidate = {
  report_path: string;
  link_path: string;
};
export type OplCompanionSkillActionStatus = 'planned' | 'ready' | 'missing_source' | 'synced' | 'available' | 'installed' | 'failed';
export type OplCompanionSkillApplyMode = 'observe' | 'ask_to_apply' | 'managed';
export type OplSuperpowersProfile = 'keep' | 'lite' | 'full';
export type OplCompanionToolActionStatus = 'ready' | 'installed' | 'missing' | 'failed';

export type OplCompanionSkillSyncItem = {
  skill_id: string;
  source_path: string | null;
  target_path: string;
  status: OplCompanionSkillActionStatus;
  action: 'none' | 'symlink' | 'clone_and_symlink' | 'update_and_symlink' | 'discover_only';
  note: string | null;
};

export type OplCompanionToolSyncItem = {
  tool_id: 'officecli';
  binary_path: string | null;
  version: string | null;
  status: OplCompanionToolActionStatus;
  action: 'none' | 'install';
  note: string | null;
};

export type OplCompanionSkillSyncResult = {
  surface_id: 'opl_companion_skill_sync';
  mode: OplCompanionSkillApplyMode;
  superpowers_profile: OplSuperpowersProfile;
  codex_skills_dir: string;
  agents_skills_dir: string;
  items: OplCompanionSkillSyncItem[];
  tools: OplCompanionToolSyncItem[];
  summary: {
    total: number;
    ready: number;
    synced: number;
    missing_source: number;
    failed: number;
    tools_ready: number;
    tools_total: number;
  };
};

export type OplRecommendedSkill = {
  skill_id: string;
  label: string;
  required: boolean;
  source: 'superpowers' | 'skills_manager' | 'codex_builtin' | 'github';
  expected_paths: string[];
  install_source_paths?: string[];
  status: OplCompanionSkillStatus;
  required_tools?: string[];
  install_hint: string;
  update_hint?: string;
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

function resolveCodexHome(home: string) {
  return process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
}

function resolveCodexSkillsDir(home: string) {
  return path.join(resolveCodexHome(home), 'skills');
}

function resolveAgentsSkillsDir(home: string) {
  return path.join(home, '.agents', 'skills');
}

function resolveSuperpowersRepoDir(home: string) {
  return process.env.OPL_SUPERPOWERS_DIR?.trim() || path.join(resolveCodexHome(home), 'superpowers');
}

function resolveCompanionSourcesRoot(home: string) {
  return process.env.OPL_COMPANION_SOURCES_ROOT?.trim() || path.join(resolveCodexHome(home), 'opl-companion-sources');
}

function resolvePackagedSkillsRoot() {
  const explicit = process.env.OPL_PACKAGED_SKILLS_ROOT?.trim();
  if (explicit) {
    return explicit;
  }
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  return runtimeHome ? path.join(runtimeHome, 'skills') : null;
}

function getSuperpowersRepoUrl() {
  return process.env.OPL_SUPERPOWERS_REPO_URL?.trim() || 'https://github.com/obra/superpowers.git';
}

function getOfficeCliRepoUrl() {
  return process.env.OPL_OFFICECLI_REPO_URL?.trim() || 'https://github.com/iOfficeAI/OfficeCLI.git';
}

function getUiUxProMaxRepoUrl() {
  return process.env.OPL_UI_UX_PRO_MAX_REPO_URL?.trim() || 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git';
}

function remoteCompanionInstallDisabled() {
  return process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
}

function ensurePathEntry(entry: string) {
  const current = process.env.PATH ?? '';
  if (!entry || current.split(path.delimiter).includes(entry)) {
    return;
  }
  process.env.PATH = `${entry}${path.delimiter}${current}`;
}

function findExecutableInPath(command: string) {
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
  const names = process.platform === 'win32' ? [command, `${command}.exe`] : [command];
  for (const entry of pathEntries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

function runCommandForOutput(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    return null;
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || null;
}

function inspectOfficeCliBinary(binaryPath: string | null): OplCompanionToolSyncItem | null {
  if (!binaryPath || !fs.existsSync(binaryPath) || !fs.statSync(binaryPath).isFile()) {
    return null;
  }
  const version = runCommandForOutput(binaryPath, ['--version']);
  if (!version) {
    return null;
  }
  return {
    tool_id: 'officecli',
    binary_path: binaryPath,
    version,
    status: 'ready',
    action: 'none',
    note: null,
  };
}

function resolveOfficeCliTool(home: string): OplCompanionToolSyncItem | null {
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const candidates = [
    process.env.OPL_OFFICECLI_BIN?.trim() || null,
    runtimeHome ? path.join(runtimeHome, 'bin', 'officecli') : null,
    findExecutableInPath('officecli'),
    path.join(home, '.local', 'bin', 'officecli'),
  ];
  for (const candidate of candidates) {
    const inspected = inspectOfficeCliBinary(candidate);
    if (inspected) {
      return inspected;
    }
  }
  return null;
}

function buildOfficeCliInstallCommand() {
  return process.env.OPL_OFFICECLI_INSTALL_COMMAND?.trim()
    || 'curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash';
}

function ensureOfficeCliTool(home: string): OplCompanionToolSyncItem {
  const existing = resolveOfficeCliTool(home);
  if (existing) {
    return existing;
  }
  if (remoteCompanionInstallDisabled()) {
    return {
      tool_id: 'officecli',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'Remote companion install is disabled; officecli binary was not installed.',
    };
  }

  const localBin = path.join(home, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  ensurePathEntry(localBin);
  const installCommand = buildOfficeCliInstallCommand();
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', installCommand], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: process.env.PATH,
    },
    stdio: 'pipe',
  });
  const installed = resolveOfficeCliTool(home);
  if (result.status === 0 && installed) {
    return {
      ...installed,
      status: 'installed',
      action: 'install',
    };
  }
  return {
    tool_id: 'officecli',
    binary_path: null,
    version: null,
    status: 'failed',
    action: 'install',
    note: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'officecli install did not produce a runnable binary.',
  };
}

function forceSymlinkDirectory(sourcePath: string, targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.symlinkSync(sourcePath, targetPath, 'junction');
}

function isUserManagedSkillDirectory(targetPath: string) {
  if (!pathExists(targetPath)) {
    return false;
  }

  try {
    const stat = fs.lstatSync(targetPath);
    return !stat.isSymbolicLink() && stat.isDirectory() && pathExists(path.join(targetPath, 'SKILL.md'));
  } catch {
    return false;
  }
}

function isSameResolvedPath(left: string, right: string) {
  return path.resolve(left) === path.resolve(right);
}

function removeLegacySuperpowersCodexSkillLink(home: string) {
  const legacyPath = path.join(resolveCodexSkillsDir(home), 'superpowers');
  if (!pathExists(legacyPath)) {
    return;
  }

  try {
    const stat = fs.lstatSync(legacyPath);
    if (stat.isSymbolicLink()) {
      fs.rmSync(legacyPath, { recursive: true, force: true });
    }
  } catch {
    // Leave non-removable user-managed paths alone; the install report still records the official target.
  }
}

function isSuperpowersBundleReady(repoDir: string) {
  return (
    pathExists(path.join(repoDir, 'skills', 'using-superpowers', 'SKILL.md'))
    && pathExists(path.join(repoDir, 'skills', 'verification-before-completion', 'SKILL.md'))
  );
}

function resolveSuperpowersSourceCandidate(home: string): OplCompanionSkillSourceCandidate | null {
  const repoDir = resolveSuperpowersRepoDir(home);
  if (!isSuperpowersBundleReady(repoDir)) {
    return null;
  }
  return { report_path: repoDir, link_path: path.join(repoDir, 'skills') };
}

function ensureSuperpowersSource(home: string) {
  const repoDir = resolveSuperpowersRepoDir(home);
  const existing = resolveSuperpowersSourceCandidate(home);
  if (existing) {
    const pullResult = runGit(['pull', '--ff-only'], repoDir);
    if (pullResult.exitCode !== 0) {
      return { source: existing, action: 'symlink' as const, note: pullResult.stderr || pullResult.stdout || 'Superpowers update skipped.' };
    }
    return { source: existing, action: 'update_and_symlink' as const, note: null };
  }

  if (pathExists(repoDir) && !pathExists(path.join(repoDir, '.git'))) {
    return { source: null, action: 'clone_and_symlink' as const, note: `Superpowers path exists but is not a git checkout: ${repoDir}` };
  }

  fs.mkdirSync(path.dirname(repoDir), { recursive: true });
  const cloneResult = runGit(['clone', getSuperpowersRepoUrl(), repoDir]);
  if (cloneResult.exitCode !== 0) {
    return { source: null, action: 'clone_and_symlink' as const, note: cloneResult.stderr || cloneResult.stdout || 'Superpowers git clone failed.' };
  }

  return { source: resolveSuperpowersSourceCandidate(home), action: 'clone_and_symlink' as const, note: null };
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

function materializeSkillDir(sourceRoot: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    dereference: true,
    preserveTimestamps: true,
  });
}

function materializeSkillFile(sourceFile: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.copyFileSync(sourceFile, path.join(targetRoot, 'SKILL.md'));
}

function cloneOrUpdateRepo(repoUrl: string, repoDir: string) {
  if (fs.existsSync(path.join(repoDir, '.git'))) {
    const pullResult = runGit(['pull', '--ff-only'], repoDir);
    return {
      ok: pullResult.exitCode === 0,
      note: pullResult.exitCode === 0 ? null : pullResult.stderr || pullResult.stdout || `git pull failed for ${repoDir}`,
    };
  }
  if (fs.existsSync(repoDir)) {
    return {
      ok: false,
      note: `Companion source path exists but is not a git checkout: ${repoDir}`,
    };
  }
  fs.mkdirSync(path.dirname(repoDir), { recursive: true });
  const cloneResult = runGit(['clone', '--depth', '1', repoUrl, repoDir]);
  return {
    ok: cloneResult.exitCode === 0,
    note: cloneResult.exitCode === 0 ? null : cloneResult.stderr || cloneResult.stdout || `git clone failed for ${repoUrl}`,
  };
}

function resolveOfficeCliSourceRoot(home: string) {
  return process.env.OPL_OFFICECLI_SOURCE_ROOT?.trim() || path.join(resolveCompanionSourcesRoot(home), 'OfficeCLI');
}

function resolveUiUxProMaxSourceRoot(home: string) {
  return process.env.OPL_UI_UX_PRO_MAX_SOURCE_ROOT?.trim() || path.join(resolveCompanionSourcesRoot(home), 'ui-ux-pro-max-skill');
}

function materializeOfficeCliSkillSource(home: string, skillId: string) {
  const repoDir = resolveOfficeCliSourceRoot(home);
  if (!fs.existsSync(repoDir) && !remoteCompanionInstallDisabled()) {
    cloneOrUpdateRepo(getOfficeCliRepoUrl(), repoDir);
  }
  const materializedRoot = path.join(resolveCompanionSourcesRoot(home), 'materialized', skillId);
  const sourceRoot = skillId === 'officecli'
    ? repoDir
    : path.join(repoDir, 'skills', skillId);
  if (!fs.existsSync(repoDir) || !fs.existsSync(path.join(sourceRoot, 'SKILL.md'))) {
    return null;
  }
  if (skillId === 'officecli') {
    materializeSkillFile(path.join(sourceRoot, 'SKILL.md'), materializedRoot);
  } else {
    materializeSkillDir(sourceRoot, materializedRoot);
  }
  return resolveSkillSourceCandidate(materializedRoot);
}

function materializeUiUxProMaxSkillSource(home: string) {
  const repoDir = resolveUiUxProMaxSourceRoot(home);
  if (!fs.existsSync(repoDir) && !remoteCompanionInstallDisabled()) {
    cloneOrUpdateRepo(getUiUxProMaxRepoUrl(), repoDir);
  }
  const skillFile = path.join(repoDir, '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md');
  const sourceRoot = path.join(repoDir, 'src', 'ui-ux-pro-max');
  if (!fs.existsSync(skillFile) || !fs.existsSync(sourceRoot)) {
    return null;
  }
  const materializedRoot = path.join(resolveCompanionSourcesRoot(home), 'materialized', 'ui-ux-pro-max');
  fs.rmSync(materializedRoot, { recursive: true, force: true });
  fs.mkdirSync(materializedRoot, { recursive: true });
  fs.copyFileSync(skillFile, path.join(materializedRoot, 'SKILL.md'));
  for (const entry of ['data', 'scripts', 'templates']) {
    const source = path.join(sourceRoot, entry);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(materializedRoot, entry), {
        recursive: true,
        dereference: true,
        preserveTimestamps: true,
      });
    }
  }
  return resolveSkillSourceCandidate(materializedRoot);
}

function ensureRecommendedSkillSource(home: string, skill: OplRecommendedSkill) {
  const existing = pickFirstExistingSkillSource(skill.install_source_paths ?? skill.expected_paths);
  if (existing) {
    return existing;
  }
  if (skill.skill_id === 'ui-ux-pro-max') {
    return materializeUiUxProMaxSkillSource(home);
  }
  if (skill.skill_id === 'officecli' || skill.skill_id.startsWith('officecli-')) {
    return materializeOfficeCliSkillSource(home, skill.skill_id);
  }
  return null;
}

function resolveSuperpowersLiteSource(home: string): OplCompanionSkillSourceCandidate | null {
  const liteSkillPath = path.join(home, '.skills-manager', 'skills', 'superpowers-lite');
  return resolveSkillSourceCandidate(liteSkillPath);
}

function resolveRecommendedSkillTarget(home: string, skill: OplRecommendedSkill, superpowersProfile: OplSuperpowersProfile) {
  if (skill.source !== 'superpowers') {
    return path.join(resolveCodexSkillsDir(home), skill.skill_id);
  }
  if (superpowersProfile === 'lite') {
    return path.join(resolveAgentsSkillsDir(home), 'superpowers-lite');
  }
  if (superpowersProfile === 'full') {
    return path.join(resolveAgentsSkillsDir(home), 'superpowers');
  }
  return path.join(resolveAgentsSkillsDir(home), 'superpowers');
}

function buildObservedCompanionItem(
  home: string,
  skill: OplRecommendedSkill,
  superpowersProfile: OplSuperpowersProfile,
): OplCompanionSkillSyncItem {
  const targetPath = resolveRecommendedSkillTarget(home, skill, superpowersProfile);
  const source = skill.source === 'superpowers'
    ? (superpowersProfile === 'lite' ? resolveSuperpowersLiteSource(home) : resolveSuperpowersSourceCandidate(home))
    : pickFirstExistingSkillSource(skill.expected_paths);

  return {
    skill_id: skill.skill_id,
    source_path: source?.report_path ?? null,
    target_path: targetPath,
    status: skill.status === 'ready' ? 'ready' : 'planned',
    action: skill.source === 'codex_builtin' ? 'discover_only' : 'none',
    note: skill.status === 'ready' ? null : skill.install_hint,
  };
}

function buildNoApplyCompanionResult(
  home: string,
  mode: OplCompanionSkillApplyMode,
  superpowersProfile: OplSuperpowersProfile,
): OplCompanionSkillSyncResult {
  const items = buildOplRecommendedSkills(home).map((skill) => buildObservedCompanionItem(home, skill, superpowersProfile));
  return buildCompanionResult(home, mode, superpowersProfile, items);
}

function buildCompanionResult(
  home: string,
  mode: OplCompanionSkillApplyMode,
  superpowersProfile: OplSuperpowersProfile,
  items: OplCompanionSkillSyncItem[],
  tools: OplCompanionToolSyncItem[] = [resolveOfficeCliTool(home) ?? {
    tool_id: 'officecli',
    binary_path: null,
    version: null,
    status: 'missing',
    action: 'none',
    note: 'officecli binary is not available.',
  }],
): OplCompanionSkillSyncResult {
  return {
    surface_id: 'opl_companion_skill_sync',
    mode,
    superpowers_profile: superpowersProfile,
    codex_skills_dir: resolveCodexSkillsDir(home),
    agents_skills_dir: resolveAgentsSkillsDir(home),
    items,
    tools,
    summary: {
      total: items.length,
      ready: items.filter((entry) => entry.status === 'ready' || entry.status === 'available').length,
      synced: items.filter((entry) => entry.status === 'synced' || entry.status === 'installed' || entry.status === 'available').length,
      missing_source: items.filter((entry) => entry.status === 'missing_source').length,
      failed: items.filter((entry) => entry.status === 'failed').length,
      tools_ready: tools.filter((entry) => entry.status === 'ready' || entry.status === 'installed').length,
      tools_total: tools.length,
    },
  };
}

export function syncOplCompanionSkills(
  home = resolveHomeDir(),
  options: Partial<{
    mode: OplCompanionSkillApplyMode;
    superpowersProfile: OplSuperpowersProfile;
  }> = {},
): OplCompanionSkillSyncResult {
  const mode = options.mode ?? 'observe';
  const superpowersProfile = options.superpowersProfile ?? 'keep';
  if (mode !== 'managed') {
    return buildNoApplyCompanionResult(home, mode, superpowersProfile);
  }

  const codexSkillsDir = resolveCodexSkillsDir(home);
  const recommendedSkills = buildOplRecommendedSkills(home);
  const items: OplCompanionSkillSyncItem[] = [];
  const tools = [ensureOfficeCliTool(home)];

  for (const skill of recommendedSkills) {
    if (skill.source === 'superpowers') {
      const targetPath = resolveRecommendedSkillTarget(home, skill, superpowersProfile);
      if (superpowersProfile === 'keep') {
        items.push(buildObservedCompanionItem(home, skill, superpowersProfile));
        continue;
      }
      if (superpowersProfile === 'lite') {
        const source = resolveSuperpowersLiteSource(home);
        if (!source) {
          items.push({
            skill_id: skill.skill_id,
            source_path: null,
            target_path: targetPath,
            status: 'missing_source',
            action: 'symlink',
            note: 'Superpowers lite profile requires ~/.skills-manager/skills/superpowers-lite.',
          });
          continue;
        }
        try {
          forceSymlinkDirectory(source.link_path, targetPath);
          items.push({
            skill_id: skill.skill_id,
            source_path: source.report_path,
            target_path: targetPath,
            status: 'synced',
            action: 'symlink',
            note: 'Preserved lite Superpowers profile instead of enabling upstream using-superpowers.',
          });
        } catch (error) {
          items.push({
            skill_id: skill.skill_id,
            source_path: source.report_path,
            target_path: targetPath,
            status: 'failed',
            action: 'symlink',
            note: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      const ensured = ensureSuperpowersSource(home);
      if (!ensured.source) {
        items.push({
          skill_id: skill.skill_id,
          source_path: null,
          target_path: targetPath,
          status: 'missing_source',
          action: ensured.action,
          note: ensured.note || skill.install_hint,
        });
        continue;
      }

      try {
        forceSymlinkDirectory(ensured.source.link_path, targetPath);
        removeLegacySuperpowersCodexSkillLink(home);
        items.push({
          skill_id: skill.skill_id,
          source_path: ensured.source.report_path,
          target_path: targetPath,
          status: ensured.action === 'clone_and_symlink' ? 'installed' : 'synced',
          action: ensured.action,
          note: ensured.note,
        });
      } catch (error) {
        items.push({
          skill_id: skill.skill_id,
          source_path: ensured.source.report_path,
          target_path: targetPath,
          status: 'failed',
          action: ensured.action,
          note: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    const source = ensureRecommendedSkillSource(home, skill);
    const targetPath = path.join(codexSkillsDir, skill.skill_id);
    if (!source) {
      if (resolveSkillSourceCandidate(targetPath)) {
        items.push({
          skill_id: skill.skill_id,
          source_path: targetPath,
          target_path: targetPath,
          status: 'ready',
          action: 'none',
          note: 'Existing Codex skill is already available.',
        });
        continue;
      }

      items.push({
        skill_id: skill.skill_id,
        source_path: null,
        target_path: targetPath,
        status: 'missing_source',
        action: 'symlink',
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
          action: 'discover_only',
          note: 'Codex bundled skills are discovered from the plugin cache and are not mirrored into ~/.codex/skills.',
        });
      } else if (isSameResolvedPath(source.link_path, targetPath)) {
        items.push({
          skill_id: skill.skill_id,
          source_path: source.report_path,
          target_path: targetPath,
          status: 'ready',
          action: 'none',
          note: 'Existing Codex skill is already installed at the target path.',
        });
      } else if (isUserManagedSkillDirectory(targetPath)) {
        items.push({
          skill_id: skill.skill_id,
          source_path: targetPath,
          target_path: targetPath,
          status: 'ready',
          action: 'none',
          note: 'Preserved existing user-managed Codex skill directory.',
        });
      } else {
        forceSymlinkDirectory(source.link_path, targetPath);
        items.push({
          skill_id: skill.skill_id,
          source_path: source.report_path,
          target_path: targetPath,
          status: 'synced',
          action: 'symlink',
          note: null,
        });
      }
    } catch (error) {
      items.push({
        skill_id: skill.skill_id,
        source_path: source.report_path,
        target_path: targetPath,
        status: 'failed',
        action: 'symlink',
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return buildCompanionResult(home, mode, superpowersProfile, items, tools);
}

export function buildOplRecommendedSkills(home = resolveHomeDir()): OplRecommendedSkill[] {
  const codexHome = resolveCodexHome(home);
  const superpowersRepoDir = resolveSuperpowersRepoDir(home);
  const agentsSuperpowersDir = path.join(resolveAgentsSkillsDir(home), 'superpowers');
  const skillsManagerHome = path.join(home, '.skills-manager');
  const packagedSkillsRoot = resolvePackagedSkillsRoot();
  const officeCliToolReady = Boolean(resolveOfficeCliTool(home));

  const specs: Array<Omit<OplRecommendedSkill, 'status'>> = [
    {
      skill_id: 'superpowers',
      label: 'Superpowers process skills',
      required: false,
      source: 'superpowers',
      expected_paths: [
        path.join(superpowersRepoDir, 'skills', 'using-superpowers', 'SKILL.md'),
        path.join(superpowersRepoDir, 'skills', 'verification-before-completion', 'SKILL.md'),
        path.join(agentsSuperpowersDir, 'using-superpowers', 'SKILL.md'),
      ],
      install_hint: 'OPL installs the official Superpowers bundle by cloning https://github.com/obra/superpowers.git into ~/.codex/superpowers and linking ~/.agents/skills/superpowers to the full skills directory.',
      update_hint: 'Update with: cd ~/.codex/superpowers && git pull --ff-only. The ~/.agents/skills/superpowers symlink makes updates visible after Codex/App restart.',
      supports: ['planning', 'debugging', 'verification', 'branch_finish', 'skill_methodology'],
    },
    {
      skill_id: 'officecli',
      label: 'officecli core skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install the officecli skill and binary so MAS/MAG/RCA can handle Office deliverables.',
      supports: ['docx', 'pptx', 'xlsx'],
    },
    {
      skill_id: 'ui-ux-pro-max',
      label: 'UI UX Pro Max skill',
      required: false,
      source: 'github',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'ui-ux-pro-max', 'SKILL.md')],
      install_hint: 'Install https://github.com/nextlevelbuilder/ui-ux-pro-max-skill so RCA can review and improve visual deliverables.',
      supports: ['rca', 'ui_review', 'ux_design', 'presentation_visuals'],
    },
    {
      skill_id: 'officecli-docx',
      label: 'officecli Word skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-docx', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-docx for Word document creation and editing.',
      supports: ['docx', 'academic_paper'],
    },
    {
      skill_id: 'officecli-pptx',
      label: 'officecli PowerPoint skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-pptx', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-pptx for presentation creation and editing.',
      supports: ['pptx', 'pitch_deck'],
    },
    {
      skill_id: 'officecli-xlsx',
      label: 'officecli Excel skill',
      required: false,
      source: 'skills_manager',
      expected_paths: [path.join(skillsManagerHome, 'skills', 'officecli-xlsx', 'SKILL.md')],
      required_tools: ['officecli'],
      install_hint: 'Install officecli-xlsx for spreadsheet and dashboard work.',
      supports: ['xlsx', 'dashboard'],
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

  return specs.map((spec) => {
    const expectedPaths = spec.source === 'codex_builtin' || spec.source === 'superpowers'
      ? spec.expected_paths
      : [
        ...spec.expected_paths,
        path.join(codexHome, 'skills', spec.skill_id, 'SKILL.md'),
      ];
    const installSourcePaths = spec.source === 'codex_builtin' || spec.source === 'superpowers'
      ? spec.expected_paths
      : [
        ...expectedPaths,
        ...(packagedSkillsRoot ? [path.join(packagedSkillsRoot, spec.skill_id, 'SKILL.md')] : []),
      ];
    const skillStatus = buildSkillStatus(expectedPaths);
    const toolStatus = spec.required_tools?.includes('officecli') ? officeCliToolReady : true;
    return {
      ...spec,
      expected_paths: expectedPaths,
      install_source_paths: installSourcePaths,
      status: skillStatus === 'ready' && toolStatus ? 'ready' : 'missing',
    };
  });
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
      'OPL owns the runtime contract and release distribution surface; opl-aion-shell owns the OPL-branded desktop GUI package built on the AionUI codebase.',
      'A valid OPL GUI package is an OPL-branded Electron-builder distributable uploaded to the one-person-lab GitHub Release. The GUI source repository is internal build input.',
      'The upstream AionUI app is not itself the OPL GUI.',
      'Source build is only the fallback when no release asset matches the local platform and architecture.',
    ],
  };
}
