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
  type OplCompanionNetworkAccess,
  type OplCompanionToolSyncItem,
} from './install-companions-parts/tools.ts';

export type {
  OplCompanionToolActionStatus,
  OplCompanionToolId,
  OplCompanionNetworkAccess,
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
export type OplCompanionSkillSourceAuthority =
  | 'skills_manager'
  | 'github_repository'
  | 'packaged_runtime'
  | 'framework_materialized_fallback'
  | 'codex_builtin'
  | 'existing_codex_entry'
  | 'external'
  | 'missing';

export type OplCompanionSkillSyncItem = {
  skill_id: string;
  source_path: string | null;
  target_path: string;
  agents_target_path: string;
  status: OplCompanionSkillActionStatus;
  action: 'none' | 'install' | 'package_update_or_repair' | 'symlink' | 'clone_and_symlink' | 'update_and_symlink' | 'discover_only';
  source_authority: OplCompanionSkillSourceAuthority;
  source_payload_sha256: string | null;
  installed_payload_sha256: string | null;
  payload_currentness: 'current' | 'diverged' | 'missing' | 'not_applicable';
  frontmatter_schema_status: 'valid' | 'invalid' | 'not_checked';
  resource_closure_status: 'complete' | 'incomplete' | 'not_checked';
  missing_resource_paths: string[];
  codex_entry_realpath: string | null;
  agents_entry_realpath: string | null;
  entrypoint_authority_status: 'converged' | 'diverged' | 'missing' | 'not_applicable';
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
  source: 'skills_manager' | 'codex_builtin' | 'github' | 'existing_entrypoint';
  managed_dependency?: boolean;
  managed_dependency_mode?: 'github' | 'observe_existing';
  repository_url?: string;
  repository_source_path?: string;
  expected_paths: string[];
  install_source_paths?: string[];
  status: OplCompanionSkillStatus;
  required_tools?: OplCompanionToolId[];
  install_hint: string;
  update_hint?: string;
  supports: string[];
};

type OplManagedSkillDependencyBase = {
  id: string;
  versionRequirement?: string;
  installSource?: string;
  required: boolean;
};

export type OplManagedSkillDependency = OplManagedSkillDependencyBase & (
  | {
      sourceMode: 'github';
      repositoryUrl: string;
      repositorySourcePath: string;
    }
  | {
      sourceMode: 'observe_existing';
      legacySource: string;
    }
);

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

function resolveManagedGithubSourcesRoot(home: string) {
  return path.join(resolveCompanionSourcesRoot(home), 'github');
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

function remoteCompanionInstallDisabled(networkAccess: OplCompanionNetworkAccess = 'allowed') {
  return networkAccess === 'forbidden' || process.env.OPL_COMPANION_DISABLE_REMOTE_INSTALL === '1';
}

function forceSymlinkDirectory(sourcePath: string, targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.symlinkSync(sourcePath, targetPath, 'junction');
}

function isSameResolvedPath(left: string, right: string) {
  const leftResolved = realPathOrNull(left);
  const rightResolved = realPathOrNull(right);
  if (leftResolved && rightResolved) {
    return leftResolved === rightResolved;
  }
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

const SKILL_FRONTMATTER_FIELDS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata']);
const SKILL_RESOURCE_PATTERN = /(?:^|[^/A-Za-z0-9_.-])((?:references|scripts|templates|assets)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)/gm;

type SkillPayloadInspection = {
  payloadSha256: string | null;
  frontmatterStatus: OplCompanionSkillSyncItem['frontmatter_schema_status'];
  resourceClosureStatus: OplCompanionSkillSyncItem['resource_closure_status'];
  missingResourcePaths: string[];
  errors: string[];
};

function realPathOrNull(targetPath: string) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function isIgnoredRuntimeArtifact(name: string, isDirectory: boolean) {
  return (isDirectory && name === '__pycache__')
    || (!isDirectory && (name.endsWith('.pyc') || name.endsWith('.pyo')));
}

function skillPayloadSha256(skillRoot: string) {
  const resolvedRoot = realPathOrNull(skillRoot);
  if (!resolvedRoot || !fs.statSync(resolvedRoot).isDirectory()) return null;
  const digest = crypto.createHash('sha256');
  const visit = (currentPath: string, relativePath: string) => {
    const stat = fs.lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      digest.update(`link\0${relativePath}\0${fs.readlinkSync(currentPath)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      digest.update(`dir\0${relativePath}\0`);
      for (const entry of fs.readdirSync(currentPath).sort()) {
        const entryPath = path.join(currentPath, entry);
        const entryStat = fs.lstatSync(entryPath);
        if (isIgnoredRuntimeArtifact(entry, entryStat.isDirectory())) continue;
        visit(entryPath, path.posix.join(relativePath, entry));
      }
      return;
    }
    if (stat.isFile()) {
      digest.update(`file\0${relativePath}\0`);
      digest.update(fs.readFileSync(currentPath));
    }
  };
  visit(resolvedRoot, '.');
  return digest.digest('hex');
}

function normalizeFrontmatterScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function frontmatterFieldValue(frontmatterLines: string[], key: string) {
  const index = frontmatterLines.findIndex((line) => line.match(/^([A-Za-z0-9_-]+)\s*:/)?.[1] === key);
  if (index < 0) return '';
  const inline = frontmatterLines[index].slice(frontmatterLines[index].indexOf(':') + 1).trim();
  if (!/^[>|][+-]?$/.test(inline)) return normalizeFrontmatterScalar(inline);

  const blockLines: string[] = [];
  for (const line of frontmatterLines.slice(index + 1)) {
    if (line.trim() === '') {
      blockLines.push('');
      continue;
    }
    if (!/^\s/.test(line)) break;
    blockLines.push(line.replace(/^\s+/, ''));
  }
  const value = inline.startsWith('>')
    ? blockLines.join(' ').replace(/\s+/g, ' ')
    : blockLines.join('\n');
  return value.trim();
}

function normalizedSkillIdentity(value: string) {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function upstreamSkillSlug(skillRoot: string) {
  const metadataPath = path.join(skillRoot, '_meta.json');
  if (!fs.existsSync(metadataPath) || !fs.statSync(metadataPath).isFile()) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return typeof payload?.slug === 'string' && payload.slug.trim()
      ? payload.slug.trim()
      : null;
  } catch {
    return null;
  }
}

function validateSkillFrontmatter(
  content: string,
  expectedName: string,
  options: { allowUpstreamIdentity?: boolean; upstreamSlug?: string | null } = {},
) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return ['missing_or_invalid_frontmatter'];
  const lines = match[1].split(/\r?\n/);
  const keys = lines.flatMap((line) => {
    const key = line.match(/^([A-Za-z0-9_-]+)\s*:/)?.[1];
    return key ? [key] : [];
  });
  const errors: string[] = [];
  const unexpected = [...new Set(keys.filter((key) => !SKILL_FRONTMATTER_FIELDS.has(key)))].sort();
  if (unexpected.length > 0) errors.push(`unexpected_frontmatter_fields:${unexpected.join(',')}`);
  if (new Set(keys).size !== keys.length) errors.push('duplicate_frontmatter_fields');
  for (const required of ['name', 'description']) {
    if (!keys.includes(required)) errors.push(`missing_frontmatter_field:${required}`);
  }
  const name = frontmatterFieldValue(lines, 'name');
  const upstreamIdentityMatches = options.allowUpstreamIdentity === true
    && (
      normalizedSkillIdentity(name) === expectedName
      || options.upstreamSlug === expectedName
    );
  if (!name || ((!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) && !upstreamIdentityMatches)) {
    errors.push('invalid_frontmatter_name');
  } else if (name !== expectedName && !upstreamIdentityMatches) {
    errors.push(`frontmatter_name_mismatch:${name}`);
  }
  const description = frontmatterFieldValue(lines, 'description');
  if (!description) errors.push('empty_frontmatter_description');
  if (description.includes('<') || description.includes('>') || description.length > 1024) {
    errors.push('invalid_frontmatter_description');
  }
  return errors;
}

function inspectSkillPayload(
  skillRoot: string,
  expectedName: string,
  options: { allowUpstreamIdentity?: boolean } = {},
): SkillPayloadInspection {
  const skillPath = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isFile()) {
    return {
      payloadSha256: null,
      frontmatterStatus: 'not_checked',
      resourceClosureStatus: 'not_checked',
      missingResourcePaths: [],
      errors: ['missing_skill_entry'],
    };
  }
  const content = fs.readFileSync(skillPath, 'utf8');
  const frontmatterErrors = validateSkillFrontmatter(content, expectedName, {
    allowUpstreamIdentity: options.allowUpstreamIdentity,
    upstreamSlug: options.allowUpstreamIdentity ? upstreamSkillSlug(skillRoot) : null,
  });
  const resolvedRoot = realPathOrNull(skillRoot) ?? path.resolve(skillRoot);
  const resourcePaths = [...content.matchAll(SKILL_RESOURCE_PATTERN)]
    .map((match) => match[1].replace(/[.,;:)]*$/, ''));
  const missingResourcePaths = [...new Set(resourcePaths)]
    .filter((relativePath) => {
      const candidate = path.resolve(skillRoot, relativePath);
      const resolvedCandidate = realPathOrNull(candidate);
      return !isPathWithin(path.resolve(skillRoot), candidate)
        || !resolvedCandidate
        || !isPathWithin(resolvedRoot, resolvedCandidate);
    })
    .sort();
  return {
    payloadSha256: skillPayloadSha256(skillRoot),
    frontmatterStatus: frontmatterErrors.length === 0 ? 'valid' : 'invalid',
    resourceClosureStatus: missingResourcePaths.length === 0 ? 'complete' : 'incomplete',
    missingResourcePaths,
    errors: [
      ...frontmatterErrors,
      ...missingResourcePaths.map((relativePath) => `missing_skill_resource:${relativePath}`),
    ],
  };
}

function skillSourceAuthority(home: string, skillRoot: string): OplCompanionSkillSourceAuthority {
  const resolvedRoot = realPathOrNull(skillRoot) ?? path.resolve(skillRoot);
  const packagedSkillsRoot = resolvePackagedSkillsRoot();
  const candidates: Array<[string | null, OplCompanionSkillSourceAuthority]> = [
    [path.join(home, '.skills-manager', 'skills'), 'skills_manager'],
    [resolveManagedGithubSourcesRoot(home), 'github_repository'],
    [packagedSkillsRoot, 'packaged_runtime'],
    [resolveCompanionSourcesRoot(home), 'framework_materialized_fallback'],
    [path.join(resolveCodexHome(home), 'plugins', 'cache'), 'codex_builtin'],
    [resolveCodexSkillsDir(home), 'existing_codex_entry'],
  ];
  return candidates.find(([root]) => root && isPathWithin(realPathOrNull(root) ?? path.resolve(root), resolvedRoot))?.[1]
    ?? 'external';
}

type SkillEntrypointSnapshot =
  | { kind: 'missing' }
  | { kind: 'symlink'; link: string };

function entrypointSnapshot(targetPath: string): SkillEntrypointSnapshot {
  try {
    const stat = fs.lstatSync(targetPath);
    return stat.isSymbolicLink()
      ? { kind: 'symlink', link: fs.readlinkSync(targetPath) }
      : { kind: 'missing' };
  } catch {
    return { kind: 'missing' };
  }
}

function hasUserManagedEntrypointConflict(targetPath: string, sourcePath: string) {
  try {
    const stat = fs.lstatSync(targetPath);
    return !stat.isSymbolicLink() && !isSameResolvedPath(targetPath, sourcePath);
  } catch {
    return false;
  }
}

function restoreEntrypoint(targetPath: string, snapshot: SkillEntrypointSnapshot) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  if (snapshot.kind === 'symlink') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.symlinkSync(snapshot.link, targetPath, 'junction');
  }
}

function convergeSkillEntrypoints(sourcePath: string, targetPaths: string[]) {
  const pendingTargets = targetPaths.filter((targetPath) => !isSameResolvedPath(sourcePath, targetPath));
  const conflicts = pendingTargets.filter((targetPath) => hasUserManagedEntrypointConflict(targetPath, sourcePath));
  if (conflicts.length > 0) {
    throw new Error(`User-managed skill entrypoint conflict: ${conflicts.join(', ')}`);
  }
  const snapshots = new Map(pendingTargets.map((targetPath) => [targetPath, entrypointSnapshot(targetPath)]));
  const changed: string[] = [];
  try {
    for (const targetPath of pendingTargets) {
      forceSymlinkDirectory(sourcePath, targetPath);
      changed.push(targetPath);
    }
  } catch (error) {
    for (const targetPath of [...pendingTargets].reverse()) {
      restoreEntrypoint(targetPath, snapshots.get(targetPath) ?? { kind: 'missing' });
    }
    throw error;
  }
  return changed.length;
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

function canonicalGithubRepositoryUrl(value: string) {
  return value.trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

function githubRepositoryOriginMatches(repoUrl: string, repoDir: string) {
  const remoteResult = runGit(['config', '--get', 'remote.origin.url'], repoDir);
  return remoteResult.exitCode === 0
    && canonicalGithubRepositoryUrl(remoteResult.stdout) === canonicalGithubRepositoryUrl(repoUrl);
}

function cloneOrUpdateRepo(repoUrl: string, repoDir: string) {
  if (fs.existsSync(path.join(repoDir, '.git'))) {
    if (!githubRepositoryOriginMatches(repoUrl, repoDir)) {
      return {
        ok: false,
        status: 'manual_required' as const,
        note: `Managed companion source origin does not match ${repoUrl}: ${repoDir}`,
        sourceDigest: null,
      };
    }
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

function managedGithubRepositoryRoot(home: string, repositoryUrl: string) {
  const digest = crypto.createHash('sha256')
    .update(canonicalGithubRepositoryUrl(repositoryUrl))
    .digest('hex')
    .slice(0, 20);
  return path.join(resolveManagedGithubSourcesRoot(home), digest);
}

function materializeManagedGithubSkillSource(
  home: string,
  skill: OplRecommendedSkill,
  networkAccess: OplCompanionNetworkAccess,
): OplCompanionSkillSourceCandidate | null {
  if (!skill.repository_url || !skill.repository_source_path) return null;
  const repoDir = managedGithubRepositoryRoot(home, skill.repository_url);
  let refresh: ReturnType<typeof cloneOrUpdateRepo> | null = null;
  if (!remoteCompanionInstallDisabled(networkAccess)) {
    refresh = cloneOrUpdateRepo(skill.repository_url, repoDir);
    if (!refresh.ok) {
      return {
        report_path: repoDir,
        link_path: repoDir,
        refresh_status: 'manual_required',
        refresh_note: refresh.note,
        source_digest: null,
      };
    }
  } else {
    if (!fs.existsSync(path.join(repoDir, '.git'))) return null;
    if (!githubRepositoryOriginMatches(skill.repository_url, repoDir)) {
      return {
        report_path: repoDir,
        link_path: repoDir,
        refresh_status: 'manual_required',
        refresh_note: `Managed companion source origin does not match ${skill.repository_url}: ${repoDir}`,
        source_digest: null,
      };
    }
  }
  const sourceRoot = path.resolve(repoDir, skill.repository_source_path);
  if (!isPathWithin(path.resolve(repoDir), sourceRoot)) return null;
  const resolvedRepoRoot = realPathOrNull(repoDir);
  const resolvedSourceRoot = realPathOrNull(sourceRoot);
  if (
    resolvedSourceRoot
    && (!resolvedRepoRoot || !isPathWithin(resolvedRepoRoot, resolvedSourceRoot))
  ) {
    return {
      report_path: sourceRoot,
      link_path: sourceRoot,
      refresh_status: 'manual_required',
      refresh_note: `GitHub repository source_path escapes the repository: ${skill.repository_source_path}`,
      source_digest: refresh?.sourceDigest ?? null,
    };
  }
  const source = resolveSkillSourceCandidate(sourceRoot);
  if (!source) {
    return {
      report_path: sourceRoot,
      link_path: sourceRoot,
      refresh_status: 'manual_required',
      refresh_note: `GitHub repository source_path does not contain SKILL.md: ${skill.repository_source_path}`,
      source_digest: refresh?.sourceDigest ?? null,
    };
  }
  return {
    ...source,
    refresh_status: refresh?.status ?? 'current',
    refresh_note: refresh?.note ?? null,
    source_digest: refresh?.sourceDigest ?? null,
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

function materializeOfficeCliSkillSource(
  home: string,
  skillId: string,
  networkAccess: OplCompanionNetworkAccess,
): OplCompanionSkillSourceCandidate | null {
  const repoDir = resolveOfficeCliSourceRoot(home);
  let refresh: ReturnType<typeof cloneOrUpdateRepo> | null = null;
  if (isPathWithin(resolveCompanionSourcesRoot(home), repoDir) && !remoteCompanionInstallDisabled(networkAccess)) {
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

function materializeUiUxProMaxSkillSource(
  home: string,
  networkAccess: OplCompanionNetworkAccess,
): OplCompanionSkillSourceCandidate | null {
  const repoDir = resolveUiUxProMaxSourceRoot(home);
  let refresh: ReturnType<typeof cloneOrUpdateRepo> | null = null;
  if (isPathWithin(resolveCompanionSourcesRoot(home), repoDir) && !remoteCompanionInstallDisabled(networkAccess)) {
    refresh = cloneOrUpdateRepo(getUiUxProMaxRepoUrl(), repoDir);
    if (!refresh.ok) return {
      report_path: repoDir, link_path: repoDir, refresh_status: 'manual_required' as const,
      refresh_note: refresh.note, source_digest: null,
    };
  }
  const skillFile = path.join(repoDir, '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md');
  const skillRoot = path.dirname(skillFile);
  const sourceRoot = path.join(repoDir, 'src', 'ui-ux-pro-max');
  if (!fs.existsSync(skillFile) || !fs.existsSync(sourceRoot)) {
    return null;
  }
  normalizeManagedCompanionSourcePermissions(home, repoDir);
  const materializedRoot = path.join(resolveCompanionSourcesRoot(home), 'materialized', 'ui-ux-pro-max');
  fs.rmSync(materializedRoot, { recursive: true, force: true });
  fs.mkdirSync(materializedRoot, { recursive: true });
  writeMaterializedFile(skillFile, path.join(materializedRoot, 'SKILL.md'));
  const referencesRoot = path.join(skillRoot, 'references');
  if (fs.existsSync(referencesRoot)) {
    copyMaterializedTree(referencesRoot, path.join(materializedRoot, 'references'));
  }
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

function materializeMineruDocumentExtractorSkillSource(
  home: string,
  networkAccess: OplCompanionNetworkAccess,
): OplCompanionSkillSourceCandidate | null {
  const repoDir = resolveMineruDocumentExtractorSourceRoot(home);
  let refresh: ReturnType<typeof downloadArchiveToDirectory> | null = null;
  if (isPathWithin(resolveCompanionSourcesRoot(home), repoDir) && !remoteCompanionInstallDisabled(networkAccess)) {
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

function ensureRecommendedSkillSource(
  home: string,
  skill: OplRecommendedSkill,
  networkAccess: OplCompanionNetworkAccess,
): OplCompanionSkillSourceCandidate | null {
  if (skill.managed_dependency_mode === 'observe_existing') {
    return pickFirstExistingSkillSource(skill.expected_paths);
  }
  if (skill.managed_dependency_mode === 'github') {
    return materializeManagedGithubSkillSource(home, skill, networkAccess);
  }
  const installed = pickFirstExistingSkillSource(skill.install_source_paths ?? skill.expected_paths);
  if (installed) return installed;

  if (skill.skill_id === 'ui-ux-pro-max') {
    const managed = materializeUiUxProMaxSkillSource(home, networkAccess);
    if (managed) return managed;
  }
  if (skill.skill_id === 'officecli' || skill.skill_id.startsWith('officecli-')) {
    const managed = materializeOfficeCliSkillSource(home, skill.skill_id, networkAccess);
    if (managed) return managed;
  }
  if (skill.skill_id === 'mineru-document-extractor') {
    const managed = materializeMineruDocumentExtractorSkillSource(home, networkAccess);
    if (managed) return managed;
  }
  return null;
}

function buildFreshCompanionItem(
  home: string,
  skill: OplRecommendedSkill,
  input: {
    source: OplCompanionSkillSourceCandidate | null;
    status: OplCompanionSkillActionStatus;
    action: OplCompanionSkillSyncItem['action'];
    note: string | null;
  },
): OplCompanionSkillSyncItem {
  const targetPath = path.join(resolveCodexSkillsDir(home), skill.skill_id);
  const agentsTargetPath = path.join(resolveAgentsSkillsDir(home), skill.skill_id);
  const sourceRoot = input.source?.link_path ?? null;
  const builtin = skill.source === 'codex_builtin';
  const sourceInspection = sourceRoot && !builtin
    ? inspectSkillPayload(sourceRoot, skill.skill_id, { allowUpstreamIdentity: skill.source === 'github' })
    : null;
  const sourceRealPath = sourceRoot ? realPathOrNull(sourceRoot) : null;
  const codexEntryRealPath = realPathOrNull(targetPath);
  const agentsEntryRealPath = realPathOrNull(agentsTargetPath);
  const entrypointAuthorityStatus: OplCompanionSkillSyncItem['entrypoint_authority_status'] = builtin
    ? 'not_applicable'
    : !sourceRealPath
      ? 'missing'
      : codexEntryRealPath && agentsEntryRealPath
        ? codexEntryRealPath === sourceRealPath && agentsEntryRealPath === sourceRealPath
          ? 'converged'
          : 'diverged'
        : 'missing';
  const installedPayloadSha256 = codexEntryRealPath ? skillPayloadSha256(targetPath) : null;
  const payloadCurrentness: OplCompanionSkillSyncItem['payload_currentness'] = builtin
    ? 'not_applicable'
    : !sourceInspection?.payloadSha256 || !installedPayloadSha256
      ? 'missing'
      : sourceInspection.payloadSha256 === installedPayloadSha256 && entrypointAuthorityStatus === 'converged'
        ? 'current'
        : 'diverged';

  return {
    skill_id: skill.skill_id,
    source_path: input.source?.report_path ?? null,
    target_path: targetPath,
    agents_target_path: agentsTargetPath,
    status: input.status,
    action: input.action,
    source_authority: sourceRoot ? skillSourceAuthority(home, sourceRoot) : 'missing',
    source_payload_sha256: sourceInspection?.payloadSha256 ?? null,
    installed_payload_sha256: installedPayloadSha256,
    payload_currentness: payloadCurrentness,
    frontmatter_schema_status: sourceInspection?.frontmatterStatus ?? 'not_checked',
    resource_closure_status: sourceInspection?.resourceClosureStatus ?? 'not_checked',
    missing_resource_paths: sourceInspection?.missingResourcePaths ?? [],
    codex_entry_realpath: codexEntryRealPath,
    agents_entry_realpath: agentsEntryRealPath,
    entrypoint_authority_status: entrypointAuthorityStatus,
    note: input.note,
  };
}

function buildObservedCompanionItem(
  home: string,
  skill: OplRecommendedSkill,
  mode: OplCompanionSkillApplyMode,
): OplCompanionSkillSyncItem {
  const source = pickFirstExistingSkillSource(skill.expected_paths);
  if (!source) {
    return buildFreshCompanionItem(home, skill, {
      source: null,
      status: mode === 'ask_to_apply' ? 'planned' : 'missing_source',
      action: skill.source === 'codex_builtin'
        ? 'discover_only'
        : skill.managed_dependency_mode === 'observe_existing'
          ? 'package_update_or_repair'
        : skill.managed_dependency
          ? 'install'
          : 'none',
      note: skill.install_hint,
    });
  }
  if (skill.source === 'codex_builtin') {
    return buildFreshCompanionItem(home, skill, {
      source,
      status: 'available',
      action: 'discover_only',
      note: 'Codex bundled skill is available from its plugin cache.',
    });
  }
  const inspection = inspectSkillPayload(source.link_path, skill.skill_id, {
    allowUpstreamIdentity: skill.source === 'github',
  });
  if (inspection.errors.length > 0) {
    return buildFreshCompanionItem(home, skill, {
      source,
      status: 'failed',
      action: 'none',
      note: `Skill payload validation failed: ${inspection.errors.join(', ')}`,
    });
  }
  const observed = buildFreshCompanionItem(home, skill, {
    source,
    status: 'ready',
    action: 'none',
    note: null,
  });
  if (skill.managed_dependency_mode === 'observe_existing') {
    return {
      ...observed,
      source_authority: 'existing_codex_entry',
      entrypoint_authority_status: 'not_applicable',
      payload_currentness: observed.source_payload_sha256 ? 'current' : 'missing',
    };
  }
  if (observed.payload_currentness === 'current'
    && observed.entrypoint_authority_status === 'converged') {
    return observed;
  }
  return {
    ...observed,
    status: 'planned',
    note: 'Managed Codex and Agents skill entrypoints require convergence.',
  };
}

function buildNoApplyCompanionResult(
  home: string,
  mode: OplCompanionSkillApplyMode,
  skillIds?: string[],
  toolIds?: OplCompanionToolId[],
  managedSkillDependencies: OplManagedSkillDependency[] = [],
): OplCompanionSkillSyncResult {
  const selectedSkills = skillIds ? new Set(skillIds) : null;
  const selectedTools = toolIds ? new Set(toolIds) : null;
  const items = buildOplRecommendedSkills(home, managedSkillDependencies)
    .filter((skill) => !selectedSkills || selectedSkills.has(skill.skill_id))
    .map((skill) => buildObservedCompanionItem(home, skill, mode));
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
    networkAccess: OplCompanionNetworkAccess;
    managedSkillDependencies: OplManagedSkillDependency[];
  }> = {},
): OplCompanionSkillSyncResult {
  const mode = options.mode ?? 'observe';
  if (mode !== 'managed') {
    return buildNoApplyCompanionResult(
      home,
      mode,
      options.skillIds,
      options.toolIds,
      options.managedSkillDependencies,
    );
  }

  const codexSkillsDir = resolveCodexSkillsDir(home);
  const selectedSkills = options.skillIds ? new Set(options.skillIds) : null;
  const recommendedSkills = buildOplRecommendedSkills(home, options.managedSkillDependencies)
    .filter((skill) => !selectedSkills || selectedSkills.has(skill.skill_id));
  const items: OplCompanionSkillSyncItem[] = [];
  const selectedTools = options.toolIds ? new Set(options.toolIds) : null;
  const networkAccess = options.networkAccess ?? 'allowed';
  const tools = [
    ...(selectedTools && !selectedTools.has('officecli') ? [] : [ensureOfficeCliTool(home, { networkAccess })]),
    ...(selectedTools && !selectedTools.has('mineru-open-api') ? [] : [ensureMineruOpenApiTool(home, { networkAccess })]),
  ];

  for (const skill of recommendedSkills) {
    const source = ensureRecommendedSkillSource(home, skill, networkAccess);
    const targetPath = path.join(codexSkillsDir, skill.skill_id);
    const agentsTargetPath = path.join(resolveAgentsSkillsDir(home), skill.skill_id);
    if (!source) {
      items.push(buildFreshCompanionItem(home, skill, {
        source: null,
        status: 'missing_source',
        action: skill.managed_dependency_mode === 'observe_existing'
          ? 'package_update_or_repair'
          : skill.managed_dependency ? 'install' : 'none',
        note: skill.install_hint,
      }));
      continue;
    }

    try {
      if (skill.managed_dependency_mode === 'observe_existing') {
        const inspection = inspectSkillPayload(source.link_path, skill.skill_id);
        items.push(buildFreshCompanionItem(home, skill, {
          source,
          status: inspection.errors.length > 0 ? 'failed' : 'ready',
          action: 'none',
          note: inspection.errors.length > 0
            ? `Existing Skill payload validation failed: ${inspection.errors.join(', ')}`
            : 'Existing compatible Skill entrypoint observed; legacy policy sources are not used to fetch, copy, or update bytes.',
        }));
        const observed = items.at(-1);
        if (observed) {
          observed.source_authority = 'existing_codex_entry';
          observed.entrypoint_authority_status = 'not_applicable';
          observed.payload_currentness = observed.source_payload_sha256 ? 'current' : 'missing';
        }
        continue;
      }
      if (source.refresh_status === 'manual_required') {
        items.push(buildFreshCompanionItem(home, skill, {
          source,
          status: 'failed',
          action: 'update_and_symlink',
          note: source.refresh_note ?? 'Managed companion source update requires review.',
        }));
        continue;
      }
      if (skill.source === 'codex_builtin') {
        items.push(buildFreshCompanionItem(home, skill, {
          source,
          status: 'available',
          action: 'discover_only',
          note: 'Codex bundled skills are discovered from the plugin cache and are not mirrored into ~/.codex/skills.',
        }));
        continue;
      }
      const inspection = inspectSkillPayload(source.link_path, skill.skill_id, {
        allowUpstreamIdentity: skill.source === 'github',
      });
      if (inspection.errors.length > 0) {
        items.push(buildFreshCompanionItem(home, skill, {
          source,
          status: 'failed',
          action: 'none',
          note: `Skill payload validation failed: ${inspection.errors.join(', ')}`,
        }));
        continue;
      }
      const changedEntrypointCount = convergeSkillEntrypoints(
        source.link_path,
        [targetPath, agentsTargetPath],
      );
      items.push(buildFreshCompanionItem(home, skill, {
        source,
        status: changedEntrypointCount > 0 ? 'synced' : 'ready',
        action: changedEntrypointCount > 0 ? 'symlink' : 'none',
        note: null,
      }));
    } catch (error) {
      items.push(buildFreshCompanionItem(home, skill, {
        source,
        status: 'failed',
        action: 'none',
        note: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return buildCompanionResult(home, mode, items, tools);
}

export function buildOplRecommendedSkills(
  home = resolveHomeDir(),
  managedSkillDependencies: OplManagedSkillDependency[] = [],
): OplRecommendedSkill[] {
  const codexHome = resolveCodexHome(home);
  const skillsManagerHome = path.join(home, '.skills-manager');
  const packagedSkillsRoot = resolvePackagedSkillsRoot();
  const toolReadyById: Record<OplCompanionToolId, boolean> = {
    officecli: Boolean(resolveOfficeCliTool(home)),
    'mineru-open-api': Boolean(resolveMineruOpenApiTool(home)),
  };

  const managedSpecs = managedSkillDependencies.map((dependency): Omit<OplRecommendedSkill, 'status'> => {
    const github = dependency.sourceMode === 'github';
    return {
      skill_id: dependency.id,
      label: dependency.id,
      required: dependency.required,
      source: github ? 'github' : 'existing_entrypoint',
      managed_dependency: true,
      managed_dependency_mode: github ? 'github' : 'observe_existing',
      ...(github
        ? {
            repository_url: dependency.repositoryUrl,
            repository_source_path: dependency.repositorySourcePath,
          }
        : {}),
      expected_paths: github
        ? [
            path.join(
              managedGithubRepositoryRoot(home, dependency.repositoryUrl),
              dependency.repositorySourcePath,
              'SKILL.md',
            ),
          ]
        : [
            path.join(resolveCodexSkillsDir(home), dependency.id, 'SKILL.md'),
            path.join(resolveAgentsSkillsDir(home), dependency.id, 'SKILL.md'),
            path.join(home, '.skills-manager', 'skills', dependency.id, 'SKILL.md'),
          ],
      install_hint: github
        ? [
            `Install ${dependency.id} from ${dependency.repositoryUrl} (${dependency.repositorySourcePath}).`,
            dependency.versionRequirement ? `Requested version: ${dependency.versionRequirement}.` : null,
            dependency.installSource ? `Preferred source: ${dependency.installSource}.` : null,
          ].filter(Boolean).join(' ')
        : `Update or repair the package to migrate ${dependency.id} to a public repository source; only an existing compatible entrypoint is observed for this legacy policy.`,
      supports: [dependency.id],
    };
  });
  const managedIds = new Set(managedSpecs.map((entry) => entry.skill_id));
  const specs = [
    ...buildOplRecommendedSkillSpecs({
      codexHome,
      skillsManagerHome,
      packagedSkillsRoot,
    }).filter((entry) => !managedIds.has(entry.skill_id)),
    ...managedSpecs,
  ];

  return specs.map((spec) => {
    const independentlyResolved = spec.source === 'codex_builtin'
      || spec.managed_dependency === true;
    const expectedPaths = independentlyResolved
      ? spec.expected_paths
      : [
          ...spec.expected_paths,
          path.join(codexHome, 'skills', spec.skill_id, 'SKILL.md'),
        ];
    const installSourcePaths = independentlyResolved
      ? expectedPaths
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
