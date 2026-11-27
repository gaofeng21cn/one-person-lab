import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CARRIER_TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CARRIER_TMP_LOCK_QUIET_MS = 5 * 60 * 1000;
export const DEFAULT_CARRIER_TMP_MAX_ENTRIES_PER_PASS = 2_000;
export const DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES = 1_536 * 1024 * 1024;

const GIT_TMP_ENTRY_PATTERN = /^git-[A-Za-z0-9._-]+$/;
const V2_CACHE_DIR_PATTERN = /^(?:sha256_)?[0-9a-f]{64}$/i;

export interface CodexCarrierTmpSnapshot {
  readonly codexHome: string;
  readonly startedAtMs: number;
  readonly topLevelGitNames: ReadonlySet<string>;
  readonly topLevelCapped: boolean;
  readonly stagingNames: ReadonlySet<string>;
  readonly marketplaceStagingNames: ReadonlySet<string>;
}

export interface CodexCarrierTmpPruneSummary {
  readonly codex_home: string;
  readonly tmp_root: string;
  readonly existed: boolean;
  readonly scanned_entries: number;
  readonly removed_entries: number;
  readonly skipped_locked: number;
  readonly skipped_recent: number;
  readonly truncated: boolean;
}

export interface PackageDownloadCachePruneSummary {
  readonly cache_root: string;
  readonly existed: boolean;
  readonly removed_digests: readonly string[];
  readonly retained_digests: readonly string[];
  readonly skipped_active_digests: readonly string[];
  readonly reclaimed_bytes: number;
  readonly retained_bytes: number;
}

export interface PackStateHygieneSummary {
  readonly surface_kind: 'opl_pack_state_hygiene.v2';
  readonly state_dir: string;
  readonly carrier_tmp: readonly CodexCarrierTmpPruneSummary[];
  readonly package_downloads: PackageDownloadCachePruneSummary;
  readonly removed_package_staging_dirs: readonly string[];
}

export function resolveConfiguredCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CODEX_HOME?.trim();
  if (configured) return path.resolve(configured);
  const home = env.HOME?.trim() || os.homedir();
  return path.join(path.resolve(home), '.codex');
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
  options: { readonly nowMs?: number; readonly maxTopLevelEntries?: number } = {},
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
    readonly aggressiveStagingCleanup?: boolean;
    readonly maxEntries?: number;
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
    const stagingTargets: ReadonlyArray<readonly [string, ReadonlySet<string>]> = [
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
    readonly nowMs?: number;
    readonly maxAgeMs?: number;
    readonly lockQuietMs?: number;
    readonly maxEntriesPerPass?: number;
  } = {},
): CodexCarrierTmpPruneSummary {
  const resolvedHome = path.resolve(codexHome);
  const tmpRoot = path.join(resolvedHome, '.tmp');
  const existed = isPhysicalDirectory(tmpRoot);
  let scannedEntries = 0;
  let removedEntries = 0;
  let skippedLocked = 0;
  let skippedRecent = 0;
  let truncated = false;

  if (!existed) {
    return {
      codex_home: resolvedHome,
      tmp_root: tmpRoot,
      existed: false,
      scanned_entries: 0,
      removed_entries: 0,
      skipped_locked: 0,
      skipped_recent: 0,
      truncated: false,
    };
  }

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
          if (scannedEntries >= maxEntriesPerPass) {
            truncated = true;
            break;
          }
          scannedEntries += 1;
          if (isLockName(entry.name)) {
            skippedLocked += 1;
            continue;
          }
          if (locked) {
            skippedLocked += 1;
            continue;
          }
          const candidate = path.join(stagingDir, entry.name);
          const stat = safeLstat(candidate);
          if (!stat || stat.isSymbolicLink()) continue;
          if (nowMs - stat.mtimeMs < maxAgeMs) {
            skippedRecent += 1;
            continue;
          }
          if (safeRemoveWithinRoot(stagingDir, candidate)) removedEntries += 1;
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
        if (scannedEntries >= maxEntriesPerPass) {
          truncated = true;
          break;
        }
        if (!GIT_TMP_ENTRY_PATTERN.test(entry.name) || isLockName(entry.name)) continue;
        scannedEntries += 1;
        const candidate = path.join(tmpRoot, entry.name);
        const stat = safeLstat(candidate);
        if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) continue;
        if (nowMs - stat.mtimeMs < maxAgeMs) {
          skippedRecent += 1;
          continue;
        }
        if (safeRemoveWithinRoot(tmpRoot, candidate)) removedEntries += 1;
      }
    } finally {
      dir.closeSync();
    }
  } catch {
    // Best-effort top-level .tmp/git-* cleanup.
  }

  return {
    codex_home: resolvedHome,
    tmp_root: tmpRoot,
    existed,
    scanned_entries: scannedEntries,
    removed_entries: removedEntries,
    skipped_locked: skippedLocked,
    skipped_recent: skippedRecent,
    truncated,
  };
}

function measureDirectoryShallowBytes(directory: string): { bytes: number; newestMtimeMs: number; hasCacheFiles: boolean } {
  const dirStat = safeLstat(directory);
  let bytes = 0;
  let newestMtimeMs = dirStat?.mtimeMs ?? 0;
  let hasCacheFiles = false;
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const stat = safeLstat(path.join(directory, entry.name));
      if (!stat || stat.isSymbolicLink()) continue;
      if (stat.mtimeMs > newestMtimeMs) newestMtimeMs = stat.mtimeMs;
      if (stat.isFile()) {
        bytes += stat.size;
        if (
          entry.name === 'archive.tar.gz'
          || entry.name === 'archive.tar.gz.part'
          || entry.name === 'download.lock'
          || entry.name.startsWith('archive.tar.gz.part.chunk-')
        ) {
          hasCacheFiles = true;
        }
      }
    }
  } catch {
    // Ignore unreadable cache directory entries.
  }
  return { bytes, newestMtimeMs, hasCacheFiles };
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

function normalizePreserveDigestKeys(digests: Iterable<string> | undefined): Set<string> {
  const keys = new Set<string>();
  for (const raw of digests ?? []) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    keys.add(trimmed.toLowerCase());
    keys.add(trimmed.replace(/^sha256:/i, '').toLowerCase());
    keys.add(trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase());
  }
  return keys;
}

export function prunePackageDownloadCache(
  cacheRoot: string,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly nowMs?: number;
    readonly maxAgeMs?: number;
    readonly maxTotalBytes?: number;
    readonly preserveDigests?: Iterable<string>;
  } = {},
): PackageDownloadCachePruneSummary {
  const resolvedRoot = path.resolve(cacheRoot);
  const existed = isPhysicalDirectory(resolvedRoot);
  const removedDigests: string[] = [];
  const retainedDigests: string[] = [];
  const skippedActiveDigests: string[] = [];
  let reclaimedBytes = 0;
  let retainedBytes = 0;

  if (!existed) {
    return {
      cache_root: resolvedRoot,
      existed: false,
      removed_digests: [],
      retained_digests: [],
      skipped_active_digests: [],
      reclaimed_bytes: 0,
      retained_bytes: 0,
    };
  }

  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs =
    options.maxAgeMs
    ?? positiveNumberEnv(
      env,
      'OPL_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_DAYS',
      DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_MS / (24 * 60 * 60 * 1000),
    ) * 24 * 60 * 60 * 1000;
  const maxTotalBytes =
    options.maxTotalBytes
    ?? positiveNumberEnv(env, 'OPL_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES', DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES);
  const preserved = normalizePreserveDigestKeys(options.preserveDigests);

  type Candidate = { digest: string; dir: string; bytes: number; mtimeMs: number; preserved: boolean };
  const candidates: Candidate[] = [];
  let activeBytes = 0;

  try {
    for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(resolvedRoot, entry.name);
      const stat = safeLstat(dir);
      if (!stat || stat.isSymbolicLink()) continue;
      const { bytes, newestMtimeMs, hasCacheFiles } = measureDirectoryShallowBytes(dir);
      if (!V2_CACHE_DIR_PATTERN.test(entry.name) && !hasCacheFiles) continue;
      if (downloadLockIsActive(dir)) {
        skippedActiveDigests.push(entry.name);
        retainedDigests.push(entry.name);
        activeBytes += bytes;
        continue;
      }
      const normalizedEntry = entry.name.toLowerCase();
      const strippedEntry = normalizedEntry.replace(/^sha256_/, '');
      const isPreserved = preserved.has(normalizedEntry) || preserved.has(strippedEntry);
      candidates.push({
        digest: entry.name,
        dir,
        bytes,
        mtimeMs: newestMtimeMs,
        preserved: isPreserved,
      });
    }
  } catch {
    return {
      cache_root: resolvedRoot,
      existed,
      removed_digests: removedDigests,
      retained_digests: retainedDigests,
      skipped_active_digests: skippedActiveDigests,
      reclaimed_bytes: reclaimedBytes,
      retained_bytes: retainedBytes,
    };
  }

  const remaining: Candidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.preserved && nowMs - candidate.mtimeMs > maxAgeMs) {
      if (safeRemoveWithinRoot(resolvedRoot, candidate.dir)) {
        removedDigests.push(candidate.digest);
        reclaimedBytes += candidate.bytes;
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
      if (safeRemoveWithinRoot(resolvedRoot, candidate.dir)) {
        removedDigests.push(candidate.digest);
        reclaimedBytes += candidate.bytes;
        totalBytes -= candidate.bytes;
        continue;
      }
    }
    retainedDigests.push(candidate.digest);
    retainedBytes += candidate.bytes;
  }
  retainedBytes += activeBytes;

  return {
    cache_root: resolvedRoot,
    existed,
    removed_digests: removedDigests,
    retained_digests: retainedDigests,
    skipped_active_digests: skippedActiveDigests,
    reclaimed_bytes: reclaimedBytes,
    retained_bytes: retainedBytes,
  };
}

export function prunePackStateArtifacts(options: {
  readonly stateDir: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly nowMs?: number;
  readonly maxAgeMs?: number;
  readonly lockQuietMs?: number;
  readonly maxEntriesPerPass?: number;
  readonly maxDownloadAgeMs?: number;
  readonly maxDownloadTotalBytes?: number;
  readonly skipCodexHomeTmp?: boolean;
}): PackStateHygieneSummary {
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_CARRIER_TMP_MAX_AGE_MS;
  const stateDir = path.resolve(options.stateDir);

  const carrierHomes: string[] = [];
  if (!options.skipCodexHomeTmp) {
    carrierHomes.push(resolveConfiguredCodexHome(env));
  }
  const legacyInternalCarrier = path.join(stateDir, 'internal-package-carrier');
  if (isPhysicalDirectory(legacyInternalCarrier)) {
    carrierHomes.push(legacyInternalCarrier);
  }

  const seenHomes = new Set<string>();
  const carrierTmp: CodexCarrierTmpPruneSummary[] = [];
  for (const home of carrierHomes) {
    const resolved = path.resolve(home);
    if (seenHomes.has(resolved)) continue;
    seenHomes.add(resolved);
    carrierTmp.push(
      pruneCodexCarrierTmpArtifacts(resolved, {
        nowMs,
        maxAgeMs,
        lockQuietMs: options.lockQuietMs,
        maxEntriesPerPass: options.maxEntriesPerPass,
      }),
    );
  }

  const packageDownloads = prunePackageDownloadCache(path.join(stateDir, 'cache', 'downloads'), {
    env,
    nowMs,
    maxAgeMs: options.maxDownloadAgeMs,
    maxTotalBytes: options.maxDownloadTotalBytes,
  });

  const removedPackageStagingDirs: string[] = [];
  const packagesRoot = path.join(stateDir, 'packages');
  if (isPhysicalDirectory(packagesRoot)) {
    try {
      for (const pkgEntry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
        if (!pkgEntry.isDirectory()) continue;
        const pkgDir = path.join(packagesRoot, pkgEntry.name);
        if (!isPhysicalDirectory(pkgDir)) continue;
        for (const entry of fs.readdirSync(pkgDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (!/\.(?:tmp|bak)-/.test(entry.name)) continue;
          const candidate = path.join(pkgDir, entry.name);
          const stat = safeLstat(candidate);
          if (!stat || stat.isSymbolicLink() || nowMs - stat.mtimeMs < maxAgeMs) continue;
          if (safeRemoveWithinRoot(pkgDir, candidate)) {
            removedPackageStagingDirs.push(`${pkgEntry.name}/${entry.name}`);
          }
        }
      }
    } catch {
      // Best-effort packages staging cleanup.
    }
  }

  return {
    surface_kind: 'opl_pack_state_hygiene.v2',
    state_dir: stateDir,
    carrier_tmp: carrierTmp,
    package_downloads: packageDownloads,
    removed_package_staging_dirs: removedPackageStagingDirs,
  };
}
