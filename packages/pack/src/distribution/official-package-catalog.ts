import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { isRecord, txImmediate, type SqliteDb } from '@opl/core';
import { PackError } from '../errors.ts';
import { KebabIdSchema } from '../manifest/schema.ts';
import { packageRegistryNamespace, parseOciRef } from './registry-client.ts';
import { privateSourceOwner } from './private-package-source-store.ts';
import type { InstallSourceSpec } from '../types.ts';

const catalogRoot = 'https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/main/';
const sha256 = /^sha256:[0-9a-f]{64}$/;
const catalogVersion = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/;

function selectedV2Release(entry: OfficialPackageCatalogEntry) {
  const release = entry.manifest?.v2_release;
  if (release === undefined) return null;
  if (!isRecord(release) || typeof release.version !== 'string'
    || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(release.version)
    || typeof release.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(release.source_commit)
    || release.payload_manifest_ref !== `payloads/${entry.package_id}-${release.version}.json`
    || typeof release.payload_sha256 !== 'string' || !sha256.test(release.payload_sha256)) {
    throw new PackError('INVALID_MANIFEST', `Invalid Catalog v2 release for '${entry.package_id}'.`);
  }
  return { version: release.version, commit: release.source_commit, path: release.payload_manifest_ref, digest: release.payload_sha256 };
}

export function officialPackageSelectedVersion(entry: OfficialPackageCatalogEntry): string | null {
  const release = selectedV2Release(entry);
  const version = release?.version ?? entry.selected_version ?? entry.version;
  return typeof version === 'string' && semver.valid(version) ? version : null;
}

export interface OfficialPackageCatalogOptions {
  /** Full contributes a verified local byte source. Explicit null uses online sources only. */
  readonly runtimeRoot?: string | null;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly db?: SqliteDb;
  readonly nowIso?: () => string;
  readonly signal?: AbortSignal;
}
export interface OfficialPackageCatalogEntry {
  readonly package_id: string;
  readonly visibility: 'public' | 'authorized_only';
  readonly category?: string;
  readonly version?: string;
  readonly selected_version?: string;
  readonly software_type?: string;
  readonly manifest?: Record<string, unknown>;
  readonly payload?: Record<string, unknown>;
  readonly public_summary?: Record<string, unknown>;
}

export function officialPackageRuntimeRoot(options: OfficialPackageCatalogOptions): string | null {
  if (options.runtimeRoot !== undefined) return options.runtimeRoot;
  return (options.env ?? process.env).OPL_FULL_RUNTIME_HOME?.trim() || null;
}

function parseEntries(raw: unknown): Map<string, OfficialPackageCatalogEntry> {
  if (!isRecord(raw) || raw.schema_version !== 'opl_software_catalog_index.v1'
    || raw.catalog_id !== 'public-registry:opl' || !Array.isArray(raw.packages)) {
    throw new PackError('INVALID_MANIFEST', 'Invalid official Package catalog index.');
  }
  const entries = new Map<string, OfficialPackageCatalogEntry>();
  for (const item of raw.packages) {
    if (!isRecord(item) || typeof item.package_id !== 'string' || !KebabIdSchema.safeParse(item.package_id).success
      || (item.visibility !== 'public' && item.visibility !== 'authorized_only') || entries.has(item.package_id)) {
      throw new PackError('INVALID_MANIFEST', 'Invalid or duplicate official catalog Package identity.');
    }
    entries.set(item.package_id, {
      package_id: item.package_id,
      visibility: item.visibility,
      ...(typeof item.category === 'string' ? { category: item.category } : {}),
      ...(typeof item.selected_version === 'string' ? { selected_version: item.selected_version } : {}),
      ...(typeof item.version === 'string' ? { version: item.version } : {}),
      ...(typeof item.software_type === 'string' ? { software_type: item.software_type } : {}),
      ...(isRecord(item.manifest) ? { manifest: item.manifest } : {}),
      ...(isRecord(item.payload) ? { payload: item.payload } : {}),
      ...(isRecord(item.public_summary) ? { public_summary: item.public_summary } : {}),
    });
  }
  return entries;
}

export function readCachedOfficialPackageCatalog(db: SqliteDb) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'opl_package_catalog_cache'").get()) return null;
  const row = db.prepare('SELECT catalog_json, fetched_at FROM opl_package_catalog_cache WHERE catalog_id = ?')
    .get('public-registry:opl') as { catalog_json: string; fetched_at: string } | undefined;
  if (!row) return null;
  try { return { entries: parseEntries(JSON.parse(row.catalog_json)), fetchedAt: row.fetched_at }; }
  catch { return null; }
}

export async function readOfficialCatalogSelection(options: OfficialPackageCatalogOptions = {}) {
  const root = officialPackageRuntimeRoot(options);
  const seed = new Map<string, OfficialPackageCatalogEntry>();
  if (root) {
    try {
      const entries = parseEntries(JSON.parse(await fs.promises.readFile(path.join(root, 'opl', 'catalog-seed', 'catalog-index.json'), 'utf8')));
      for (const [id, entry] of entries) if (entry.visibility === 'public') seed.set(id, entry);
    } catch { /* An absent or invalid seed cannot accelerate an online install. */ }
  }
  let index: unknown;
  let online: Map<string, OfficialPackageCatalogEntry>;
  try {
    const response = await (options.fetchImpl ?? fetch)(catalogRoot + 'catalog-index.json', { signal: catalogSignal(10_000, options.signal) });
    if (!response.ok) throw new PackError('PACK_DOWNLOAD_FAILED', 'Official Package catalog returned HTTP ' + response.status + '.');
    index = await response.json();
    online = parseEntries(index);
  } catch (error) {
    options.signal?.throwIfAborted();
    const cached = options.db && readCachedOfficialPackageCatalog(options.db);
    if (!seed.size && !cached) throw error;
    const entries = new Map(cached ? cached.entries : []);
    for (const [id, entry] of seed) if (entries.get(id)?.visibility !== 'authorized_only') entries.set(id, entry);
    return { entries, seed, online: false };
  }
  if (options.db) {
    const fetchedAt = (options.nowIso ?? (() => new Date().toISOString()))();
    initializeCatalogCache(options.db);
    txImmediate(options.db, db => {
      db.prepare('INSERT INTO opl_package_catalog_cache (catalog_id, catalog_json, fetched_at) '
        + 'VALUES (?, ?, ?) ON CONFLICT(catalog_id) DO UPDATE SET catalog_json = excluded.catalog_json, fetched_at = excluded.fetched_at')
        .run('public-registry:opl', JSON.stringify(index), fetchedAt);
    });
  }
  for (const [id, entry] of seed) {
    const current = online.get(id);
    if (!current) online.set(id, entry);
    else if (current.visibility === 'public' && officialPackageSelectedVersion(entry) === officialPackageSelectedVersion(current)) {
      online.set(id, { ...entry, ...current, manifest: current.manifest });
    }
  }
  return { entries: online, seed, online: true };
}

export async function readOfficialPackageCatalog(options: OfficialPackageCatalogOptions = {}) {
  return (await readOfficialCatalogSelection(options)).entries;
}

function initializeCatalogCache(db: SqliteDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS opl_package_catalog_cache (
    catalog_id TEXT PRIMARY KEY, catalog_json TEXT NOT NULL, fetched_at TEXT NOT NULL
  )`);
}

export function officialPackagePrivateSourceId(entry: OfficialPackageCatalogEntry): string | null {
  if (entry.visibility !== 'authorized_only') return null;
  const repo = typeof entry.manifest?.source_repo === 'string'
    ? entry.manifest.source_repo
    : typeof entry.public_summary?.owner_source_repo === 'string'
      ? entry.public_summary.owner_source_repo
      : null;
  const ownerMatch = repo ? /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/[\w.-]+?(?:\.git)?$/.exec(repo) : null;
  if (!ownerMatch) return null;
  const sourceId = `github-packages:${ownerMatch[1]!.toLowerCase()}`;
  try {
    privateSourceOwner(sourceId);
    return sourceId;
  } catch {
    return null;
  }
}

export function officialPackageInstallSource(
  entry: OfficialPackageCatalogEntry,
  runtimeRoot: string | null,
  options?: { readonly allowAuthorizedOnly?: boolean },
): InstallSourceSpec {
  const { manifest, package_id: packageId } = entry;
  const authorizedOnly = entry.visibility === 'authorized_only';
  if ((!options?.allowAuthorizedOnly && authorizedOnly) || !manifest || manifest.package_id !== packageId) {
    throw new PackError('PACK_NOT_FOUND', `Official public Package source unavailable for '${packageId}'.`);
  }
  if (!runtimeRoot || authorizedOnly) {
    const surface = manifest.codex_surface;
    const carrier = isRecord(surface) ? surface.configured_codex_plugin_carrier : undefined;
    const ref = isRecord(carrier) ? carrier.publication_ref : undefined;
    if (typeof ref !== 'string') throw new PackError('PACK_NOT_FOUND', `Official publication source unavailable for '${packageId}'.`);
    const expectedOwner = authorizedOnly
      ? officialPackagePrivateSourceId(entry)?.slice('github-packages:'.length) ?? null
      : 'gaofeng21cn';
    const expectedNamespace = packageRegistryNamespace(entry.visibility);
    const { registry, repository } = parseOciRef(ref);
    if (registry !== 'ghcr.io' || !expectedOwner || repository !== `${expectedOwner}/${expectedNamespace}/${packageId}`) {
      throw new PackError('INVALID_MANIFEST', `Official publication for '${packageId}' points outside its registered Package repository.`);
    }
    const version = officialPackageSelectedVersion(entry);
    if (!version || !catalogVersion.test(version)) {
      throw new PackError('INVALID_MANIFEST', `Official publication for '${packageId}' has no selected Catalog version.`);
    }
    return { kind: 'oci', package_id: packageId, ref, version };
  }

  const payload = entry.payload;
  const owner = typeof manifest.source_repo === 'string'
    ? /^https:\/\/github\.com\/gaofeng21cn\/([\w.-]+?)(?:\.git)?$/.exec(manifest.source_repo)?.[1]
    : undefined;
  if (!owner || !payload || payload.package_id !== packageId || payload.source_repo !== manifest.source_repo
    || typeof payload.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(payload.source_commit)) {
    throw new PackError('INVALID_MANIFEST', `Full Package seed has invalid provenance for '${packageId}'.`);
  }
  const manifestPath = path.join(runtimeRoot, 'manifest', 'full-package-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const full: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const assertions = isRecord(full) && isRecord(full.runtime_assertions) ? full.runtime_assertions : {};
    const selected = assertions.selected_package_set;
    const refs = isRecord(full) && isRecord(full.resolved_refs) ? Object.values(full.resolved_refs).filter(isRecord) : [];
    let relative: unknown;
    if (isRecord(selected) && Array.isArray(selected.packages)) {
      const candidates = selected.packages.filter((row: unknown) => isRecord(row) && row.package_id === packageId);
      if (candidates.length) {
        if (candidates.length !== 1 || candidates[0].source_commit !== payload.source_commit) {
          throw new PackError('PACK_LOCK_MISMATCH', `Selected Full Package '${packageId}' differs from its frozen catalog source.`);
        }
        relative = candidates[0].runtime_module_relative_path;
      }
    } else {
      // Older capability seeds have a resolved source ref instead of a module marker.
      const expectedRepo = `gaofeng21cn/${owner}`;
      const reference = refs.find(row => row.resolved_commit === payload.source_commit
        && (row.repository === expectedRepo || row.repository === manifest.source_repo
          || row.repository === `git@github.com:${expectedRepo}.git`)
        && typeof row.runtime_module_relative_path === 'string');
      relative = reference?.runtime_module_relative_path;
    }
    if (relative !== undefined) {
      if (typeof relative !== 'string' || !/^modules\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(relative)) {
        throw new PackError('INVALID_MANIFEST', `Invalid Full Package path for '${packageId}'.`);
      }
      const packagePath = path.join(runtimeRoot, relative);
      if (!fs.lstatSync(packagePath, { throwIfNoEntry: false })?.isDirectory()
        || !fs.realpathSync(packagePath).startsWith(fs.realpathSync(runtimeRoot) + path.sep + 'modules' + path.sep)) {
        throw new PackError('PACK_NOT_FOUND', `Missing selected Full Package directory for '${packageId}'.`);
      }
      return { kind: 'local_dir', package_id: packageId, path: packagePath };
    }
  }
  const modulesRoot = path.join(runtimeRoot, 'modules');
  if (fs.realpathSync(modulesRoot) !== path.join(fs.realpathSync(runtimeRoot), 'modules')) throw new PackError('INVALID_MANIFEST', 'Invalid Full modules directory.');
  const matches: string[] = [];
  for (const dir of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const moduleDir = path.join(modulesRoot, dir.name);
    const markerPath = path.join(moduleDir, 'opl-runtime-module.json');
    if (!fs.lstatSync(markerPath, { throwIfNoEntry: false })?.isFile()) continue;
    let marker: unknown;
    try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); }
    catch { continue; } // A broken marker in an unrelated module does not block this Package.
    if (isRecord(marker) && marker.packaged_runtime === true && marker.repo_name === owner
      && isRecord(marker.source_git) && marker.source_git.head_sha === payload.source_commit) {
      matches.push(moduleDir);
    }
  }
  if (matches.length !== 1) {
    throw new PackError('PACK_NOT_FOUND', `Full Package seed has ${matches.length} matching modules for '${packageId}' at ${payload.source_commit}.`);
  }
  return { kind: 'local_dir', package_id: packageId, path: matches[0] };
}

// The index retains the legacy payload for older clients. The v2 release
// refers to immutable payload JSON whose archive_sha256 pins the OCI source.
export async function readOfficialV2Source(
  entry: OfficialPackageCatalogEntry, fetchImpl: typeof fetch = fetch, signal?: AbortSignal,
) {
  const release = selectedV2Release(entry);
  if (!release) return null;
  const response = await fetchImpl(catalogRoot + 'packages/' + release.path, { signal: catalogSignal(30_000, signal) });
  if (!response.ok) throw new PackError('PACK_DOWNLOAD_FAILED', `Catalog v2 payload for '${entry.package_id}' returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if ('sha256:' + createHash('sha256').update(bytes).digest('hex') !== release.digest) {
    throw new PackError('PACK_LOCK_MISMATCH', `Catalog v2 payload bytes differ for '${entry.package_id}'.`);
  }
  const payload: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isRecord(payload) || payload.package_format !== 'v2' || payload.package_id !== entry.package_id
    || payload.package_version !== release.version || payload.source_commit !== release.commit
    || typeof payload.source_repo !== 'string' || payload.source_repo !== entry.manifest?.source_repo
    || typeof payload.archive_sha256 !== 'string' || !sha256.test(payload.archive_sha256)
    || !isRecord(payload.content_lock) || typeof payload.content_lock.digest !== 'string' || !sha256.test(payload.content_lock.digest)) {
    throw new PackError('INVALID_MANIFEST', `Catalog v2 payload does not match the selected release for '${entry.package_id}'.`);
  }
  return { version: release.version, commit: release.commit, contentDigest: payload.content_lock.digest, archiveDigest: payload.archive_sha256 };
}

function catalogSignal(timeout: number, signal?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([deadline, signal]) : deadline;
}
