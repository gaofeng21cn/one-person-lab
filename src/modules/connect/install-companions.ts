import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { buildOplRecommendedSkillSpecs } from './install-companions/catalog.ts';
export { buildOplGuiShellSurface } from './install-companions/gui-shell.ts';
import { runGit } from './system-installation/shared.ts';
import {
  ensureMineruOpenApiTool,
  ensureOfficeCliTool,
  resolveMineruOpenApiTool,
  resolveOfficeCliTool,
  type OplCompanionToolId,
  type OplCompanionToolSyncItem,
} from './install-companions-parts/tools.ts';

export type {
  OplCompanionToolActionStatus,
  OplCompanionToolId,
  OplCompanionToolSyncItem,
} from './install-companions-parts/tools.ts';

export type OplCompanionSkillStatus = 'ready' | 'missing';

type OplCompanionSkillSourceCandidate = {
  report_path: string;
  link_path: string;
  refresh_status?: 'current' | 'updated' | 'manual_required';
  refresh_note?: string | null;
  source_digest?: string | null;
};
export type OplCompanionSkillActionStatus = 'planned' | 'ready' | 'missing_source' | 'synced' | 'available' | 'installed' | 'failed';
export type OplCompanionSkillApplyMode = 'observe' | 'ask_to_apply' | 'managed';

export type OplCompanionSkillSyncItem = {
  skill_id: string;
  source_path: string | null;
  target_path: string;
  status: OplCompanionSkillActionStatus;
  action: 'none' | 'symlink' | 'clone_and_symlink' | 'update_and_symlink' | 'discover_only';
  note: string | null;
};

export type OplCompanionSkillSyncResult = {
  surface_id: 'opl_companion_skill_sync';
  mode: OplCompanionSkillApplyMode;
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
  source: 'skills_manager' | 'codex_builtin' | 'github';
  expected_paths: string[];
  install_source_paths?: string[];
  status: OplCompanionSkillStatus;
  required_tools?: OplCompanionToolId[];
  install_hint: string;
  update_hint?: string;
  supports: string[];
};

export type OplGuiShellSurface = {
  shell_id: 'opl_aion_shell';
  label: 'OPL Desktop GUI';
  owner: 'one-person-lab-app';
  base_shell: 'aionui';
  relation_to_opl: 'opl_branded_gui_shell';
  repo_url: string;
  active_shell_root: 'shells/aionui';
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

function getOfficeCliRepoUrl() {
  return process.env.OPL_OFFICECLI_REPO_URL?.trim() || 'https://github.com/iOfficeAI/OfficeCLI.git';
}

function getUiUxProMaxRepoUrl() {
  return process.env.OPL_UI_UX_PRO_MAX_REPO_URL?.trim() || 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git';
}

function getMineruDocumentExtractorArchiveUrl() {
  return process.env.OPL_MINERU_DOCUMENT_EXTRACTOR_ARCHIVE_URL?.trim()
    || 'https://github.com/MinerU-Extract/mineru-document-extractor/archive/refs/heads/main.tar.gz';
}

function remoteCompanionInstallDisabled() {
  return process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
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

function normalizeMaterializedSkillPermissions(root: string) {
  if (!fs.existsSync(root)) {
    return;
  }
  const stat = fs.statSync(root);
  if (stat.isDirectory()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) {
      normalizeMaterializedSkillPermissions(path.join(root, entry));
    }
    return;
  }
  if (stat.isFile()) {
    const executableBits = stat.mode & 0o111;
    fs.chmodSync(root, executableBits ? 0o755 : 0o644);
  }
}

function isPathWithin(parentPath: string, childPath: string) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeManagedCompanionSourcePermissions(home: string, sourceRoot: string) {
  const companionSourcesRoot = resolveCompanionSourcesRoot(home);
  const resolvedCompanionSourcesRoot = fs.existsSync(companionSourcesRoot)
    ? fs.realpathSync(companionSourcesRoot)
    : path.resolve(companionSourcesRoot);
  const resolvedSourceRoot = fs.existsSync(sourceRoot)
    ? fs.realpathSync(sourceRoot)
    : path.resolve(sourceRoot);
  if (isPathWithin(resolvedCompanionSourcesRoot, resolvedSourceRoot)) {
    normalizeMaterializedSkillPermissions(resolvedSourceRoot);
  }
}

function writeMaterializedFile(sourceFile: string, targetFile: string) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, fs.readFileSync(sourceFile), { mode: 0o644 });
  fs.chmodSync(targetFile, 0o644);
}

function copyMaterializedTree(sourceRoot: string, targetRoot: string) {
  const stat = fs.statSync(sourceRoot);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetRoot, { recursive: true, mode: 0o755 });
    fs.chmodSync(targetRoot, 0o755);
    for (const entry of fs.readdirSync(sourceRoot)) {
      copyMaterializedTree(path.join(sourceRoot, entry), path.join(targetRoot, entry));
    }
    return;
  }
  if (stat.isFile()) {
    writeMaterializedFile(sourceRoot, targetRoot);
  }
}

function materializeSkillDir(sourceRoot: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  copyMaterializedTree(sourceRoot, targetRoot);
  normalizeMaterializedSkillPermissions(targetRoot);
}

function materializeSkillFile(sourceFile: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  writeMaterializedFile(sourceFile, path.join(targetRoot, 'SKILL.md'));
  normalizeMaterializedSkillPermissions(targetRoot);
}

function materializeSingleSkillRoot(sourceRoot: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  writeMaterializedFile(path.join(sourceRoot, 'SKILL.md'), path.join(targetRoot, 'SKILL.md'));
  const metaPath = path.join(sourceRoot, '_meta.json');
  if (fs.existsSync(metaPath)) {
    writeMaterializedFile(metaPath, path.join(targetRoot, '_meta.json'));
  }
  normalizeMaterializedSkillPermissions(targetRoot);
}

function cloneOrUpdateRepo(repoUrl: string, repoDir: string) {
  if (fs.existsSync(path.join(repoDir, '.git'))) {
    const statusResult = runGit(['status', '--porcelain'], repoDir);
    if (statusResult.exitCode !== 0 || statusResult.stdout.trim()) {
      return {
        ok: false,
        status: 'manual_required' as const,
        note: statusResult.exitCode === 0
          ? `Managed companion source is dirty and was not updated: ${repoDir}`
          : statusResult.stderr || statusResult.stdout || `git status failed for ${repoDir}`,
        sourceDigest: null,
      };
    }
    const pullResult = runGit(['pull', '--ff-only'], repoDir);
    const headResult = pullResult.exitCode === 0 ? runGit(['rev-parse', 'HEAD'], repoDir) : null;
    return {
      ok: pullResult.exitCode === 0,
      status: pullResult.exitCode === 0 ? 'updated' as const : 'manual_required' as const,
      note: pullResult.exitCode === 0 ? null : pullResult.stderr || pullResult.stdout || `git pull failed for ${repoDir}`,
      sourceDigest: headResult?.exitCode === 0 ? headResult.stdout.trim() : null,
    };
  }
  if (fs.existsSync(repoDir)) {
    return {
      ok: false,
      status: 'manual_required' as const,
      note: `Companion source path exists but is not a git checkout: ${repoDir}`,
      sourceDigest: null,
    };
  }
  fs.mkdirSync(path.dirname(repoDir), { recursive: true });
  const cloneResult = runGit(['clone', '--depth', '1', repoUrl, repoDir]);
  return {
    ok: cloneResult.exitCode === 0,
    status: cloneResult.exitCode === 0 ? 'updated' as const : 'manual_required' as const,
    note: cloneResult.exitCode === 0 ? null : cloneResult.stderr || cloneResult.stdout || `git clone failed for ${repoUrl}`,
    sourceDigest: cloneResult.exitCode === 0
      ? runGit(['rev-parse', 'HEAD'], repoDir).stdout.trim() || null
      : null,
  };
}

function downloadArchiveToDirectory(archiveUrl: string, targetRoot: string) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-companion-archive-'));
  const archivePath = path.join(tempRoot, 'source.tar.gz');
  const unpackRoot = path.join(tempRoot, 'unpack');
  try {
    const curlResult = spawnSync('curl', ['-fsSL', archiveUrl, '-o', archivePath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (curlResult.status !== 0) {
      return { ok: false, note: curlResult.stderr || curlResult.stdout || 'archive download failed', sourceDigest: null };
    }
    fs.mkdirSync(unpackRoot, { recursive: true });
    const tarResult = spawnSync('tar', ['-xzf', archivePath, '-C', unpackRoot], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (tarResult.status !== 0) {
      return { ok: false, note: tarResult.stderr || tarResult.stdout || 'archive extraction failed', sourceDigest: null };
    }
    const unpackedRoot = fs.readdirSync(unpackRoot)
      .map((entry) => path.join(unpackRoot, entry))
      .find((entryPath) => fs.statSync(entryPath).isDirectory());
    if (!unpackedRoot || !fs.existsSync(path.join(unpackedRoot, 'SKILL.md'))) {
      return { ok: false, note: 'archive does not contain a Skill root', sourceDigest: null };
    }
    const incomingRoot = `${targetRoot}.incoming-${process.pid}-${Date.now()}`;
    const previousRoot = `${targetRoot}.previous`;
    fs.rmSync(incomingRoot, { recursive: true, force: true });
    copyMaterializedTree(unpackedRoot, incomingRoot);
    fs.rmSync(previousRoot, { recursive: true, force: true });
    if (fs.existsSync(targetRoot)) fs.renameSync(targetRoot, previousRoot);
    try {
      fs.renameSync(incomingRoot, targetRoot);
    } catch (error) {
      if (!fs.existsSync(targetRoot) && fs.existsSync(previousRoot)) fs.renameSync(previousRoot, targetRoot);
      throw error;
    }
    fs.rmSync(previousRoot, { recursive: true, force: true });
    return {
      ok: true,
      note: null,
      sourceDigest: crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex'),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function resolveOfficeCliSourceRoot(home: string) {
  return process.env.OPL_OFFICECLI_SOURCE_ROOT?.trim() || path.join(resolveCompanionSourcesRoot(home), 'OfficeCLI');
}

function resolveUiUxProMaxSourceRoot(home: string) {
  return process.env.OPL_UI_UX_PRO_MAX_SOURCE_ROOT?.trim() || path.join(resolveCompanionSourcesRoot(home), 'ui-ux-pro-max-skill');
}

function resolveMineruDocumentExtractorSourceRoot(home: string) {
  return process.env.OPL_MINERU_DOCUMENT_EXTRACTOR_SOURCE_ROOT?.trim()
    || path.join(resolveCompanionSourcesRoot(home), 'mineru-document-extractor');
}

function materializeOfficeCliSkillSource(home: string, skillId: string) {
  const repoDir = resolveOfficeCliSourceRoot(home);
  let refresh: ReturnType<typeof cloneOrUpdateRepo> | null = null;
  if (isPathWithin(resolveCompanionSourcesRoot(home), repoDir) && !remoteCompanionInstallDisabled()) {
    refresh = cloneOrUpdateRepo(getOfficeCliRepoUrl(), repoDir);
    if (!refresh.ok) {
      return {
        report_path: repoDir,
        link_path: repoDir,
        refresh_status: 'manual_required' as const,
        refresh_note: refresh.note,
        source_digest: null,
      };
    }
  }
  const materializedRoot = path.join(resolveCompanionSourcesRoot(home), 'materialized', skillId);
  const sourceRoot = skillId === 'officecli'
    ? repoDir
    : path.join(repoDir, 'skills', skillId);
  if (!fs.existsSync(repoDir) || !fs.existsSync(path.join(sourceRoot, 'SKILL.md'))) {
    return null;
  }
  normalizeManagedCompanionSourcePermissions(home, sourceRoot);
  if (skillId === 'officecli') {
    materializeSkillFile(path.join(sourceRoot, 'SKILL.md'), materializedRoot);
  } else {
    materializeSkillDir(sourceRoot, materializedRoot);
  }
  const source = resolveSkillSourceCandidate(materializedRoot);
  return source ? {
    ...source,
    refresh_status: refresh?.status ?? 'current',
    refresh_note: refresh?.note ?? null,
    source_digest: refresh?.sourceDigest ?? null,
  } : null;
}

function materializeUiUxProMaxSkillSource(home: string) {
  const repoDir = resolveUiUxProMaxSourceRoot(home);
  let refresh: ReturnType<typeof cloneOrUpdateRepo> | null = null;
  if (isPathWithin(resolveCompanionSourcesRoot(home), repoDir) && !remoteCompanionInstallDisabled()) {
    refresh = cloneOrUpdateRepo(getUiUxProMaxRepoUrl(), repoDir);
    if (!refresh.ok) return {
      report_path: repoDir, link_path: repoDir, refresh_status: 'manual_required' as const,
      refresh_note: refresh.note, source_digest: null,
    };
  }
  const skillFile = path.join(repoDir, '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md');
  const sourceRoot = path.join(repoDir, 'src', 'ui-ux-pro-max');
  if (!fs.existsSync(skillFile) || !fs.existsSync(sourceRoot)) {
    return null;
  }
  normalizeManagedCompanionSourcePermissions(home, repoDir);
  const materializedRoot = path.join(resolveCompanionSourcesRoot(home), 'materialized', 'ui-ux-pro-max');
  fs.rmSync(materializedRoot, { recursive: true, force: true });
  fs.mkdirSync(materializedRoot, { recursive: true });
  writeMaterializedFile(skillFile, path.join(materializedRoot, 'SKILL.md'));
  for (const entry of ['data', 'scripts', 'templates']) {
    const source = path.join(sourceRoot, entry);
    if (fs.existsSync(source)) {
      copyMaterializedTree(source, path.join(materializedRoot, entry));
    }
  }
  normalizeMaterializedSkillPermissions(materializedRoot);
  const source = resolveSkillSourceCandidate(materializedRoot);
  return source ? { ...source, refresh_status: refresh?.status ?? 'current', refresh_note: refresh?.note ?? null, source_digest: refresh?.sourceDigest ?? null } : null;
}

function materializeMineruDocumentExtractorSkillSource(home: string) {
  const repoDir = resolveMineruDocumentExtractorSourceRoot(home);
  let refresh: ReturnType<typeof downloadArchiveToDirectory> | null = null;
  if (isPathWithin(resolveCompanionSourcesRoot(home), repoDir) && !remoteCompanionInstallDisabled()) {
    refresh = downloadArchiveToDirectory(getMineruDocumentExtractorArchiveUrl(), repoDir);
    if (!refresh.ok) return {
      report_path: repoDir, link_path: repoDir, refresh_status: 'manual_required' as const,
      refresh_note: refresh.note, source_digest: null,
    };
  }
  if (!fs.existsSync(path.join(repoDir, 'SKILL.md'))) {
    return null;
  }
  normalizeManagedCompanionSourcePermissions(home, repoDir);
  const materializedRoot = path.join(resolveCompanionSourcesRoot(home), 'materialized', 'mineru-document-extractor');
  materializeSingleSkillRoot(repoDir, materializedRoot);
  const source = resolveSkillSourceCandidate(materializedRoot);
  return source ? { ...source, refresh_status: refresh ? 'updated' : 'current', refresh_note: refresh?.note ?? null, source_digest: refresh?.sourceDigest ?? null } : null;
}

function ensureRecommendedSkillSource(home: string, skill: OplRecommendedSkill) {
  if (skill.skill_id === 'ui-ux-pro-max') {
    const managed = materializeUiUxProMaxSkillSource(home);
    if (managed) return managed;
  }
  if (skill.skill_id === 'officecli' || skill.skill_id.startsWith('officecli-')) {
    const managed = materializeOfficeCliSkillSource(home, skill.skill_id);
    if (managed) return managed;
  }
  if (skill.skill_id === 'mineru-document-extractor') {
    const managed = materializeMineruDocumentExtractorSkillSource(home);
    if (managed) return managed;
  }
  return pickFirstExistingSkillSource(skill.install_source_paths ?? skill.expected_paths);
}

function buildObservedCompanionItem(
  home: string,
  skill: OplRecommendedSkill,
): OplCompanionSkillSyncItem {
  const targetPath = path.join(resolveCodexSkillsDir(home), skill.skill_id);
  const source = pickFirstExistingSkillSource(skill.expected_paths);

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
  skillIds?: string[],
  toolIds?: OplCompanionToolId[],
): OplCompanionSkillSyncResult {
  const selectedSkills = skillIds ? new Set(skillIds) : null;
  const selectedTools = toolIds ? new Set(toolIds) : null;
  const items = buildOplRecommendedSkills(home)
    .filter((skill) => !selectedSkills || selectedSkills.has(skill.skill_id))
    .map((skill) => buildObservedCompanionItem(home, skill));
  const tools = [resolveOfficeCliTool(home), resolveMineruOpenApiTool(home)]
    .filter((tool): tool is OplCompanionToolSyncItem => Boolean(tool))
    .filter((tool) => !selectedTools || selectedTools.has(tool.tool_id));
  return buildCompanionResult(home, mode, items, tools);
}

function buildCompanionResult(
  home: string,
  mode: OplCompanionSkillApplyMode,
  items: OplCompanionSkillSyncItem[],
  tools: OplCompanionToolSyncItem[] = [
    resolveOfficeCliTool(home) ?? {
      tool_id: 'officecli',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'officecli binary is not available.',
      ownership: 'missing',
      content_sha256: null,
      latest_version: null,
      currentness: 'missing',
      latest_version_source: null,
    },
    resolveMineruOpenApiTool(home) ?? {
      tool_id: 'mineru-open-api',
      binary_path: null,
      version: null,
      status: 'missing',
      action: 'none',
      note: 'mineru-open-api binary is not available.',
      ownership: 'missing',
      content_sha256: null,
      latest_version: null,
      currentness: 'missing',
      latest_version_source: null,
    },
  ],
): OplCompanionSkillSyncResult {
  return {
    surface_id: 'opl_companion_skill_sync',
    mode,
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
      tools_ready: tools.filter((entry) => entry.status === 'ready' || entry.status === 'installed' || entry.status === 'updated').length,
      tools_total: tools.length,
    },
  };
}

export function syncOplCompanionSkills(
  home = resolveHomeDir(),
  options: Partial<{
    mode: OplCompanionSkillApplyMode;
    skillIds: string[];
    toolIds: OplCompanionToolId[];
  }> = {},
): OplCompanionSkillSyncResult {
  const mode = options.mode ?? 'observe';
  if (mode !== 'managed') {
    return buildNoApplyCompanionResult(home, mode, options.skillIds, options.toolIds);
  }

  const codexSkillsDir = resolveCodexSkillsDir(home);
  const selectedSkills = options.skillIds ? new Set(options.skillIds) : null;
  const recommendedSkills = buildOplRecommendedSkills(home)
    .filter((skill) => !selectedSkills || selectedSkills.has(skill.skill_id));
  const items: OplCompanionSkillSyncItem[] = [];
  const selectedTools = options.toolIds ? new Set(options.toolIds) : null;
  const tools = [
    ...(selectedTools && !selectedTools.has('officecli') ? [] : [ensureOfficeCliTool(home)]),
    ...(selectedTools && !selectedTools.has('mineru-open-api') ? [] : [ensureMineruOpenApiTool(home)]),
  ];

  for (const skill of recommendedSkills) {
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
      if (source.refresh_status === 'manual_required') {
        items.push({
          skill_id: skill.skill_id,
          source_path: source.report_path,
          target_path: targetPath,
          status: 'failed',
          action: 'update_and_symlink',
          note: source.refresh_note ?? 'Managed companion source update requires review.',
        });
        continue;
      }
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

  return buildCompanionResult(home, mode, items, tools);
}

export function buildOplRecommendedSkills(home = resolveHomeDir()): OplRecommendedSkill[] {
  const codexHome = resolveCodexHome(home);
  const skillsManagerHome = path.join(home, '.skills-manager');
  const packagedSkillsRoot = resolvePackagedSkillsRoot();
  const toolReadyById: Record<OplCompanionToolId, boolean> = {
    officecli: Boolean(resolveOfficeCliTool(home)),
    'mineru-open-api': Boolean(resolveMineruOpenApiTool(home)),
  };

  const specs = buildOplRecommendedSkillSpecs({
    codexHome,
    skillsManagerHome,
    packagedSkillsRoot,
  });

  return specs.map((spec) => {
    const expectedPaths = spec.source === 'codex_builtin'
      ? spec.expected_paths
      : [
        ...spec.expected_paths,
        path.join(codexHome, 'skills', spec.skill_id, 'SKILL.md'),
      ];
    const installSourcePaths = spec.source === 'codex_builtin'
      ? spec.expected_paths
      : [
        ...expectedPaths,
        ...(packagedSkillsRoot ? [path.join(packagedSkillsRoot, spec.skill_id, 'SKILL.md')] : []),
      ];
    const skillStatus = buildSkillStatus(expectedPaths);
    const toolStatus = spec.required_tools?.every((toolId) => toolReadyById[toolId]) ?? true;
    return {
      ...spec,
      expected_paths: expectedPaths,
      install_source_paths: installSourcePaths,
      status: skillStatus === 'ready' && toolStatus ? 'ready' : 'missing',
    };
  });
}
