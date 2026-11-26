import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CARRIER_TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CARRIER_TMP_LOCK_QUIET_MS = 5 * 60 * 1000;
export const DEFAULT_CARRIER_TMP_MAX_ENTRIES_PER_PASS = 2_000;
export const DEFAULT_DEAD_PID_STAGE_GRACE_MS = 60 * 60 * 1000;
export const DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES = 1_536 * 1024 * 1024;

const GIT_TMP_ENTRY_PATTERN = /^git-[A-Za-z0-9._-]+$/;
const SHA256_DIR_PATTERN = /^[0-9a-f]{64}$/;
const MARKETPLACE_STAGING_PATTERN = /^.+\.(\d+)\.[0-9a-f-]{36}\.staging$/i;
const MARKETPLACE_PREVIOUS_PATTERN = /^.+\.(\d+)\.previous$/;

export type CodexCarrierTmpSnapshot = {
  codexHome: string;
  startedAtMs: number;
  topLevelGitNames: Set<string>;
  topLevelCapped: boolean;
  stagingNames: Set<string>;
  marketplaceStagingNames: Set<string>;
};

export type CodexCarrierTmpPruneSummary = {
  codex_home: string;
  tmp_root: string;
  existed: boolean;
  scanned_entries: number;
  removed_entries: number;
  skipped_locked: number;
  skipped_recent: number;
  truncated: boolean;
};

export type PackageDownloadCachePruneSummary = {
  cache_root: string;
  existed: boolean;
  removed_digests: string[];
  retained_digests: string[];
  skipped_active_digests: string[];
  reclaimed_bytes: number;
  retained_bytes: number;
};

export type OplPackageStateHygieneSummary = {
  surface_kind: 'opl_package_state_hygiene.v1';
  state_root: string;
  carrier_tmp: CodexCarrierTmpPruneSummary[];
  removed_package_staging_dirs: string[];
  removed_marketplace_staging_dirs: string[];
  removed_skill_projection_staging_dirs: string[];
  package_downloads: PackageDownloadCachePruneSummary;
};

export function resolveOplPackageStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicitStateDir = env.OPL_STATE_DIR?.trim();
  if (explicitStateDir) return path.resolve(explicitStateDir);
  const dataDir = env.OPL_DATA_DIR?.trim();
  if (dataDir) return path.join(path.resolve(dataDir), 'opl', 'state');
  const home = env.HOME?.trim() || os.homedir();
  return path.join(path.resolve(home), 'Library', 'Application Support', 'OPL', 'state');
}

export function resolveConfiguredCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CODEX_HOME?.trim();
  if (configured) return path.resolve(configured);
  const home = env.HOME?.trim() || os.homedir();
  return path.join(path.resolve(home), '.codex');
}

export function resolveInternalPackageCarrierHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveOplPackageStateRoot(env), 'internal-package-carrier');
}

function positiveNumberEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isLockName(name: string): boolean {
  return /\.lock$/i.test(name);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function safeLstat(target: string): fs.Stats | null {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

function isPhysicalDirectory(target: string): boolean {
  const stat = safeLstat(target);
  return Boolean(stat && stat.isDirectory() && !stat.isSymbolicLink());
}

function safeRemoveWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    return false;
  }
  const stat = safeLstat(resolvedTarget);
  if (!stat || stat.isSymbolicLink()) return false;
  try {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function hasRecentLockFile(directory: string, nowMs: number, lockQuietMs: number): boolean {
  if (!isPhysicalDirectory(directory)) return false;
  try {
    const dir = fs.opendirSync(directory);
    try {
      let scanned = 0;
      let entry: fs.Dirent | null;
      while ((entry = dir.readSync()) !== null && scanned < 256) {
        scanned += 1;
        if (!isLockName(entry.name)) continue;
        const stat = safeLstat(path.join(directory, entry.name));
        if (stat && !stat.isSymbolicLink() && nowMs - stat.mtimeMs < lockQuietMs) {
          return true;
        }
      }
    } finally {
      dir.closeSync();
    }
  } catch {
    return true;
  }
  return false;
}

function listDirectNonLockNames(directory: string, limit = 512): Set<string> {
  const names = new Set<string>();
  if (!isPhysicalDirectory(directory)) return names;
  try {
    const dir = fs.opendirSync(directory);
    try {
      let entry: fs.Dirent | null;
      while ((entry = dir.readSync()) !== null && names.size < limit) {
        if (!isLockName(entry.name)) names.add(entry.name);
      }
    } finally {
      dir.closeSync();
    }
  } catch {
    // Best-effort snapshot.
  }
  return names;
}

export function captureCodexCarrierTmpSnapshot(
  codexHome: string,
  options: { nowMs?: number; maxTopLevelEntries?: number } = {},
): CodexCarrierTmpSnapshot {
  const startedAtMs = options.nowMs ?? Date.now();
  const maxTopLevelEntries = options.maxTopLevelEntries ?? 512;
  const tmpRoot = path.join(path.resolve(codexHome), '.tmp');
  const topLevelGitNames = new Set<string>();
  let topLevelCapped = false;
  if (isPhysicalDirectory(tmpRoot)) {
    try {
      const dir = fs.opendirSync(tmpRoot);
      try {
        let count = 0;
        let entry: fs.Dirent | null;
        while ((entry = dir.readSync()) !== null) {
          count += 1;
          if (count > maxTopLevelEntries) {
            topLevelCapped = true;
            break;
          }
          if (GIT_TMP_ENTRY_PATTERN.test(entry.name)) topLevelGitNames.add(entry.name);
        }
      } finally {
        dir.closeSync();
      }
    } catch {
      topLevelCapped = true;
    }
  }
  return {
    codexHome: path.resolve(codexHome),
    startedAtMs,
    topLevelGitNames,
    topLevelCapped,
    stagingNames: listDirectNonLockNames(path.join(tmpRoot, '.staging')),
    marketplaceStagingNames: listDirectNonLockNames(path.join(tmpRoot, 'marketplaces', '.staging')),
  };
}

export function cleanupCodexCarrierTmpAfterRun(
  codexHome: string,
  snapshot: CodexCarrierTmpSnapshot | null | undefined,
  options: {
    aggressiveStagingCleanup?: boolean;
    maxEntries?: number;
  } = {},
): number {
  if (!snapshot) return 0;
  const resolvedHome = path.resolve(codexHome);
  const tmpRoot = path.join(resolvedHome, '.tmp');
  if (!isPhysicalDirectory(tmpRoot)) return 0;
  const maxEntries = options.maxEntries ?? 256;
  let removed = 0;

  try {
    const dir = fs.opendirSync(tmpRoot);
    try {
      let scanned = 0;
      let entry: fs.Dirent | null;
      while ((entry = dir.readSync()) !== null && scanned < maxEntries) {
        scanned += 1;
        if (!GIT_TMP_ENTRY_PATTERN.test(entry.name) || isLockName(entry.name)) continue;
        const candidate = path.join(tmpRoot, entry.name);
        if (!snapshot.topLevelCapped) {
          if (snapshot.topLevelGitNames.has(entry.name)) continue;
        } else {
          const stat = safeLstat(candidate);
          if (!stat || stat.isSymbolicLink() || stat.mtimeMs < snapshot.startedAtMs - 1_000) continue;
        }
        if (safeRemoveWithinRoot(tmpRoot, candidate)) removed += 1;
      }
    } finally {
      dir.closeSync();
    }
  } catch {
    // Cleanup in finally must never break the primary operation.
  }

  if (options.aggressiveStagingCleanup) {
    const stagingTargets: Array<[string, Set<string>]> = [
      [path.join(tmpRoot, '.staging'), snapshot.stagingNames],
      [path.join(tmpRoot, 'marketplaces', '.staging'), snapshot.marketplaceStagingNames],
    ];
    for (const [stagingDir, priorNames] of stagingTargets) {
      if (!isPhysicalDirectory(stagingDir)) continue;
      try {
        const dir = fs.opendirSync(stagingDir);
        try {
          let scanned = 0;
          let entry: fs.Dirent | null;
          while ((entry = dir.readSync()) !== null && scanned < maxEntries) {
            scanned += 1;
            if (isLockName(entry.name) || priorNames.has(entry.name)) continue;
            if (safeRemoveWithinRoot(stagingDir, path.join(stagingDir, entry.name))) removed += 1;
          }
        } finally {
          dir.closeSync();
        }
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  return removed;
}

export function pruneCodexCarrierTmpArtifacts(
  codexHome: string,
  options: {
    nowMs?: number;
    maxAgeMs?: number;
    lockQuietMs?: number;
    maxEntriesPerPass?: number;
  } = {},
): CodexCarrierTmpPruneSummary {
  const resolvedHome = path.resolve(codexHome);
  const tmpRoot = path.join(resolvedHome, '.tmp');
  const summary: CodexCarrierTmpPruneSummary = {
    codex_home: resolvedHome,
    tmp_root: tmpRoot,
    existed: isPhysicalDirectory(tmpRoot),
    scanned_entries: 0,
    removed_entries: 0,
    skipped_locked: 0,
    skipped_recent: 0,
    truncated: false,
  };
  if (!summary.existed) return summary;

  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_CARRIER_TMP_MAX_AGE_MS;
  const lockQuietMs = options.lockQuietMs ?? DEFAULT_CARRIER_TMP_LOCK_QUIET_MS;
  const maxEntriesPerPass = options.maxEntriesPerPass ?? DEFAULT_CARRIER_TMP_MAX_ENTRIES_PER_PASS;

  const pruneStagingDirectory = (stagingDir: string, lockParentDir: string) => {
    if (!isPhysicalDirectory(stagingDir)) return;
    const locked = hasRecentLockFile(lockParentDir, nowMs, lockQuietMs)
      || hasRecentLockFile(stagingDir, nowMs, lockQuietMs);
    try {
      const dir = fs.opendirSync(stagingDir);
      try {
        let entry: fs.Dirent | null;
        while ((entry = dir.readSync()) !== null) {
          if (summary.scanned_entries >= maxEntriesPerPass) {
            summary.truncated = true;
            break;
          }
          summary.scanned_entries += 1;
          if (isLockName(entry.name)) {
            summary.skipped_locked += 1;
            continue;
          }
          if (locked) {
            summary.skipped_locked += 1;
            continue;
          }
          const candidate = path.join(stagingDir, entry.name);
          const stat = safeLstat(candidate);
          if (!stat || stat.isSymbolicLink()) continue;
          if (nowMs - stat.mtimeMs < maxAgeMs) {
            summary.skipped_recent += 1;
            continue;
          }
          if (safeRemoveWithinRoot(stagingDir, candidate)) summary.removed_entries += 1;
        }
      } finally {
        dir.closeSync();
      }
    } catch {
      // Best-effort staging cleanup.
    }
  };

  pruneStagingDirectory(path.join(tmpRoot, '.staging'), tmpRoot);
  pruneStagingDirectory(path.join(tmpRoot, 'marketplaces', '.staging'), path.join(tmpRoot, 'marketplaces'));

  try {
    const dir = fs.opendirSync(tmpRoot);
    try {
      let entry: fs.Dirent | null;
      while ((entry = dir.readSync()) !== null) {
        if (summary.scanned_entries >= maxEntriesPerPass) {
          summary.truncated = true;
          break;
        }
        if (!GIT_TMP_ENTRY_PATTERN.test(entry.name) || isLockName(entry.name)) continue;
        summary.scanned_entries += 1;
        const candidate = path.join(tmpRoot, entry.name);
        const stat = safeLstat(candidate);
        if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) continue;
        if (nowMs - stat.mtimeMs < maxAgeMs) {
          summary.skipped_recent += 1;
          continue;
        }
        if (safeRemoveWithinRoot(tmpRoot, candidate)) summary.removed_entries += 1;
      }
    } finally {
      dir.closeSync();
    }
  } catch {
    // Best-effort top-level .tmp/git-* cleanup.
  }

  return summary;
}

function measureDirectoryShallowBytes(directory: string): { bytes: number; newestMtimeMs: number } {
  const dirStat = safeLstat(directory);
  let bytes = 0;
  let newestMtimeMs = dirStat?.mtimeMs ?? 0;
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const stat = safeLstat(path.join(directory, entry.name));
      if (!stat || stat.isSymbolicLink()) continue;
      if (stat.mtimeMs > newestMtimeMs) newestMtimeMs = stat.mtimeMs;
      if (stat.isFile()) bytes += stat.size;
    }
  } catch {
    // Ignore unreadable cache directory entries.
  }
  return { bytes, newestMtimeMs };
}

function downloadLockIsActive(directory: string): boolean {
  const lockPath = path.join(directory, 'download.lock');
  const stat = safeLstat(lockPath);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return false;
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    return isPidAlive(pid);
  } catch {
    return true;
  }
}

export function prunePackageDownloadCache(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    nowMs?: number;
    maxAgeMs?: number;
    maxTotalBytes?: number;
    preserveDigests?: Iterable<string>;
  } = {},
): PackageDownloadCachePruneSummary {
  const cacheRoot = path.join(resolveOplPackageStateRoot(env), 'package-downloads');
  const summary: PackageDownloadCachePruneSummary = {
    cache_root: cacheRoot,
    existed: isPhysicalDirectory(cacheRoot),
    removed_digests: [],
    retained_digests: [],
    skipped_active_digests: [],
    reclaimed_bytes: 0,
    retained_bytes: 0,
  };
  if (!summary.existed) return summary;

  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs
    ?? positiveNumberEnv(env, 'OPL_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_DAYS', DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_MS / (24 * 60 * 60 * 1000))
      * 24 * 60 * 60 * 1000;
  const maxTotalBytes = options.maxTotalBytes
    ?? positiveNumberEnv(env, 'OPL_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES', DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES);
  const preserved = new Set(
    Array.from(options.preserveDigests ?? [], (value) => value.replace(/^sha256:/, '').toLowerCase()),
  );

  type Candidate = { digest: string; dir: string; bytes: number; mtimeMs: number; preserved: boolean };
  const candidates: Candidate[] = [];
  let activeBytes = 0;

  try {
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !SHA256_DIR_PATTERN.test(entry.name)) continue;
      const dir = path.join(cacheRoot, entry.name);
      const stat = safeLstat(dir);
      if (!stat || stat.isSymbolicLink()) continue;
      const { bytes, newestMtimeMs } = measureDirectoryShallowBytes(dir);
      if (downloadLockIsActive(dir)) {
        summary.skipped_active_digests.push(entry.name);
        summary.retained_digests.push(entry.name);
        activeBytes += bytes;
        continue;
      }
      candidates.push({
        digest: entry.name,
        dir,
        bytes,
        mtimeMs: newestMtimeMs,
        preserved: preserved.has(entry.name.toLowerCase()),
      });
    }
  } catch {
    return summary;
  }

  const remaining: Candidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.preserved && nowMs - candidate.mtimeMs > maxAgeMs) {
      if (safeRemoveWithinRoot(cacheRoot, candidate.dir)) {
        summary.removed_digests.push(candidate.digest);
        summary.reclaimed_bytes += candidate.bytes;
        continue;
      }
    }
    remaining.push(candidate);
  }

  // Sort oldest-first so quota trimming evicts the stalest caches first.
  remaining.sort((left, right) => left.mtimeMs - right.mtimeMs || left.digest.localeCompare(right.digest));
  let totalBytes = activeBytes + remaining.reduce((sum, item) => sum + item.bytes, 0);
  for (const candidate of remaining) {
    if (!candidate.preserved && totalBytes > maxTotalBytes) {
      if (safeRemoveWithinRoot(cacheRoot, candidate.dir)) {
        summary.removed_digests.push(candidate.digest);
        summary.reclaimed_bytes += candidate.bytes;
        totalBytes -= candidate.bytes;
        continue;
      }
    }
    summary.retained_digests.push(candidate.digest);
    summary.retained_bytes += candidate.bytes;
  }
  summary.retained_bytes += activeBytes;
  return summary;
}

export function pruneOplPackageStateArtifacts(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    nowMs?: number;
    maxAgeMs?: number;
    lockQuietMs?: number;
    maxEntriesPerPass?: number;
    deadPidGraceMs?: number;
    maxDownloadAgeMs?: number;
    maxDownloadTotalBytes?: number;
  } = {},
): OplPackageStateHygieneSummary {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_CARRIER_TMP_MAX_AGE_MS;
  const deadPidGraceMs = options.deadPidGraceMs ?? DEFAULT_DEAD_PID_STAGE_GRACE_MS;
  const stateRoot = resolveOplPackageStateRoot(env);
  const internalHome = resolveInternalPackageCarrierHome(env);
  const configuredHome = resolveConfiguredCodexHome(env);

  const codexHomes = configuredHome === internalHome ? [internalHome] : [internalHome, configuredHome];
  const carrierTmp = codexHomes.map((home) => pruneCodexCarrierTmpArtifacts(home, {
    nowMs,
    maxAgeMs,
    lockQuietMs: options.lockQuietMs,
    maxEntriesPerPass: options.maxEntriesPerPass,
  }));

  const removedPackageStagingDirs: string[] = [];
  if (isPhysicalDirectory(stateRoot)) {
    try {
      for (const entry of fs.readdirSync(stateRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith('package-staging-')) continue;
        const candidate = path.join(stateRoot, entry.name);
        const stat = safeLstat(candidate);
        if (!stat || stat.isSymbolicLink() || nowMs - stat.mtimeMs < maxAgeMs) continue;
        if (safeRemoveWithinRoot(stateRoot, candidate)) removedPackageStagingDirs.push(entry.name);
      }
    } catch {
      // Best-effort package-staging-* cleanup.
    }
  }

  const removedMarketplaceStagingDirs: string[] = [];
  const marketplacesRoot = path.join(stateRoot, 'codex-plugin-marketplaces');
  if (isPhysicalDirectory(marketplacesRoot)) {
    try {
      for (const entry of fs.readdirSync(marketplacesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const match = MARKETPLACE_STAGING_PATTERN.exec(entry.name) ?? MARKETPLACE_PREVIOUS_PATTERN.exec(entry.name);
        if (!match) continue;
        const pid = Number(match[1]);
        if (isPidAlive(pid)) continue;
        const candidate = path.join(marketplacesRoot, entry.name);
        const stat = safeLstat(candidate);
        if (!stat || stat.isSymbolicLink() || nowMs - stat.mtimeMs < Math.min(maxAgeMs, deadPidGraceMs)) continue;
        if (safeRemoveWithinRoot(marketplacesRoot, candidate)) removedMarketplaceStagingDirs.push(entry.name);
      }
    } catch {
      // Best-effort marketplace staging cleanup.
    }
  }

  const removedSkillProjectionStagingDirs: string[] = [];
  const projectionsRoot = path.join(stateRoot, 'agent-package-skill-projections');
  if (isPhysicalDirectory(projectionsRoot)) {
    try {
      for (const entry of fs.readdirSync(projectionsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith('.staging-')) continue;
        const candidate = path.join(projectionsRoot, entry.name);
        const stat = safeLstat(candidate);
        if (!stat || stat.isSymbolicLink() || nowMs - stat.mtimeMs < maxAgeMs) continue;
        if (safeRemoveWithinRoot(projectionsRoot, candidate)) removedSkillProjectionStagingDirs.push(entry.name);
      }
    } catch {
      // Best-effort skill projection staging cleanup.
    }
  }

  const packageDownloads = prunePackageDownloadCache(env, {
    nowMs,
    maxAgeMs: options.maxDownloadAgeMs,
    maxTotalBytes: options.maxDownloadTotalBytes,
  });

  return {
    surface_kind: 'opl_package_state_hygiene.v1',
    state_root: stateRoot,
    carrier_tmp: carrierTmp,
    removed_package_staging_dirs: removedPackageStagingDirs,
    removed_marketplace_staging_dirs: removedMarketplaceStagingDirs,
    removed_skill_projection_staging_dirs: removedSkillProjectionStagingDirs,
    package_downloads: packageDownloads,
  };
}
