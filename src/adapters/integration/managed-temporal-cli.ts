import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { extract as extractTar } from 'tar';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { compareDependencyVersions, type ResolvedDependencyRelease } from './dependency-release-resolution.ts';
import { resolveDependencyReleaseSync } from './dependency-release-resolution-sync.ts';

export function managedTemporalCliPath(root = resolveOplStatePaths().state_dir) {
  return path.join(root, 'base-dependencies', 'temporal-cli', 'bin', 'temporal');
}

// A dangling symlink, a partially written download, and a non-executable file
// all report as "present" to lstat and as "unusable" to a run check. They are
// owner state, not installation targets.
function existsButCannotRun(candidate: string) {
  try { fs.lstatSync(candidate); } catch { return false; }
  try {
    if (!fs.statSync(candidate).isFile()) return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return false;
  } catch { return true; }
}

function binaryVersion(binary: string, run: typeof execFileSync = execFileSync) {
  try { return String(run(binary, ['--version'], { encoding: 'utf8', timeout: 8000 })).match(/\d+\.\d+\.\d+/)?.[0] ?? null; }
  catch { return null; }
}

export function inspectManagedTemporalCli(options: { refreshLatest?: boolean; root?: string } = {}) {
  const binary = managedTemporalCliPath(options.root);
  const version = fs.existsSync(binary) ? binaryVersion(binary) : null;
  let latest: string | null = null;
  if (options.refreshLatest) {
    try { latest = resolveDependencyReleaseSync('temporal-cli', { verifyArchive: false }).version; } catch { /* projection reports unknown */ }
  }
  return { dependency_id: 'temporal-cli', dependency_kind: 'cli', installed: Boolean(version), version,
    latest_version: latest, currentness: !version ? 'missing' : latest ? compareDependencyVersions(version, latest) < 0 ? 'update_available' : 'current' : 'unknown',
    ownership: 'opl_managed', update_policy: 'silent_managed_reconcile', update_mode: 'silent_managed',
    update_action: null, activation_policy: 'next_process_discovery', binary_path: version ? binary : null,
    status: version ? 'ready' : 'missing', note: 'Only the OPL-owned Temporal CLI is maintained; user PATH installations are preserved.' };
}

export function installTemporalCli(options: {
  homeDir?: string; platform?: string; arch?: string; searchPath?: string; root?: string;
  run?: typeof execFileSync; target?: ResolvedDependencyRelease; resolveRelease?: () => ResolvedDependencyRelease;
  reuseExternal?: boolean;
  cohort?: { cli?: { version?: string; release_tag?: string; linux_amd64_artifact?: { file_name?: string; sha256?: string } } };
} = {}) {
  const platform = options.platform ?? process.platform;
  if (!['darwin', 'linux', 'win32'].includes(platform)) return { status: 'not_applicable' };
  const run = options.run ?? execFileSync;
  const root = options.root ?? (options.homeDir ? path.join(options.homeDir, '.opl-state') : resolveOplStatePaths().state_dir);
  const homeDir = options.homeDir ?? os.homedir();
  const userTemporalPath = path.join(homeDir, '.local/bin/temporal');
  const destination = options.root ? managedTemporalCliPath(root) : userTemporalPath;
  // Protect the user-owned entry when it is the installation destination.
  // A broken optional reuse source must not block an independent managed CLI.
  if (path.resolve(destination) === path.resolve(userTemporalPath) && existsButCannotRun(userTemporalPath)) {
    throw new Error('Existing user Temporal CLI is not executable; preserve it for its owner.');
  }
  // Existing user executables remain owner-controlled. Initial service bootstrap may reuse them.
  if (options.reuseExternal !== false && !fs.existsSync(destination)) {
    for (const candidate of [...(options.searchPath ?? process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
      .map(dir => path.join(dir, 'temporal')), userTemporalPath]) {
      if (path.resolve(candidate) === path.resolve(destination)) continue;
      try { fs.accessSync(candidate, fs.constants.X_OK); return { status: 'reused', path: candidate }; } catch {}
    }
  }
  const cohort = options.cohort?.cli;
  const target = options.target ?? options.resolveRelease?.() ?? (cohort?.version && cohort.linux_amd64_artifact?.sha256
    ? { dependency_id: 'temporal-cli', version: cohort.version, source_ref: cohort.release_tag ?? `v${cohort.version}`,
      archive_url: `https://github.com/temporalio/cli/releases/download/${cohort.release_tag ?? `v${cohort.version}`}/${cohort.linux_amd64_artifact.file_name ?? `temporal_cli_${cohort.version}_linux_amd64.tar.gz`}`,
      archive_sha256: cohort.linux_amd64_artifact.sha256, platform, architecture: options.arch ?? process.arch, install_metadata: {} }
    : resolveDependencyReleaseSync('temporal-cli', { platform, architecture: options.arch ?? process.arch, verifyArchive: false }));
  const installedVersion = fs.existsSync(destination) ? binaryVersion(destination, run) : null;
  if (installedVersion && compareDependencyVersions(installedVersion, target.version) >= 0) {
    return { status: 'ready', path: destination, version: installedVersion };
  }
  if (!target.archive_url || !target.archive_sha256) throw new Error('Temporal CLI release has no verified archive.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.temporal-install-'));
  try {
    const archive = path.join(staging, 'download.tar.gz');
    run('curl', ['-q', '--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '180', '--silent', '--show-error', '--output', archive, target.archive_url], { timeout: 190000, stdio: 'pipe' });
    const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (digest !== target.archive_sha256) throw new Error('Temporal CLI archive digest mismatch');
    extractTar({ file: archive, cwd: staging, sync: true }, ['temporal']);
    const executable = path.join(staging, 'temporal');
    if (!fs.lstatSync(executable).isFile()) throw new Error('Temporal CLI archive entry is not a regular file');
    fs.chmodSync(executable, 0o755);
    if (binaryVersion(executable, run) !== target.version) throw new Error('Temporal CLI version mismatch');
    // Same filesystem rename gives existing readers their old executable while new processes see the verified update.
    fs.renameSync(executable, destination);
    return { status: installedVersion ? 'updated' : 'installed', path: destination, version: target.version, archive_sha256: digest };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
