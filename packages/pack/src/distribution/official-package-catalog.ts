import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { PackError } from '../errors.ts';
import { KebabIdSchema } from '../manifest/schema.ts';
import { parseOciRef } from './registry-client.ts';
import type { InstallSourceSpec } from '../types.ts';

const indexUrl = 'https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/main/catalog-index.json';

export interface OfficialPackageCatalogOptions {
  /** Full uses its frozen seed. Explicit null selects the current online catalog for updates. */
  readonly runtimeRoot?: string | null;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
}
export interface OfficialPackageCatalogEntry {
  readonly package_id: string;
  readonly visibility: 'public' | 'authorized_only';
  readonly category?: string;
  readonly version?: string;
  readonly software_type?: string;
  readonly manifest?: Record<string, unknown>;
  readonly payload?: Record<string, unknown>;
  readonly public_summary?: Record<string, unknown>;
}

export function officialPackageRuntimeRoot(options: OfficialPackageCatalogOptions): string | null {
  if (options.runtimeRoot !== undefined) return options.runtimeRoot;
  return (options.env ?? process.env).OPL_FULL_RUNTIME_HOME?.trim() || null;
}

export async function readOfficialPackageCatalog(
  options: OfficialPackageCatalogOptions = {},
): Promise<ReadonlyMap<string, OfficialPackageCatalogEntry>> {
  const root = officialPackageRuntimeRoot(options);
  let index: unknown;
  if (root) {
    const bytes = await fs.promises.readFile(path.join(root, 'opl', 'catalog-seed', 'catalog-index.json'), 'utf8');
    index = JSON.parse(bytes);
  } else {
    const response = await (options.fetchImpl ?? fetch)(indexUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new PackError('PACK_DOWNLOAD_FAILED', `Official Package catalog returned HTTP ${response.status}.`);
    index = await response.json();
  }
  if (!isRecord(index) || index.schema_version !== 'opl_software_catalog_index.v1'
      || index.catalog_id !== 'public-registry:opl' || !Array.isArray(index.packages)) {
    throw new PackError('INVALID_MANIFEST', 'Invalid official Package catalog index.');
  }
  const entries = new Map<string, OfficialPackageCatalogEntry>();
  for (const item of index.packages) {
    if (!isRecord(item) || typeof item.package_id !== 'string' || !KebabIdSchema.safeParse(item.package_id).success
      || (item.visibility !== 'public' && item.visibility !== 'authorized_only') || entries.has(item.package_id)) {
      throw new PackError('INVALID_MANIFEST', 'Invalid or duplicate official catalog Package identity.');
    }
    entries.set(item.package_id, {
      package_id: item.package_id,
      visibility: item.visibility,
      ...(typeof item.category === 'string' ? { category: item.category } : {}),
      ...(typeof item.version === 'string' ? { version: item.version } : {}),
      ...(typeof item.software_type === 'string' ? { software_type: item.software_type } : {}),
      ...(isRecord(item.manifest) ? { manifest: item.manifest } : {}),
      ...(isRecord(item.payload) ? { payload: item.payload } : {}),
      ...(isRecord(item.public_summary) ? { public_summary: item.public_summary } : {}),
    });
  }
  return entries;
}

export function officialPackageInstallSource(entry: OfficialPackageCatalogEntry, runtimeRoot: string | null): InstallSourceSpec {
  const { manifest, package_id: packageId } = entry;
  if (entry.visibility !== 'public' || !manifest || manifest.package_id !== packageId) {
    throw new PackError('PACK_NOT_FOUND', `Official public Package source unavailable for '${packageId}'.`);
  }
  if (!runtimeRoot) {
    const surface = manifest.codex_surface;
    const carrier = isRecord(surface) ? surface.configured_codex_plugin_carrier : undefined;
    const ref = isRecord(carrier) ? carrier.publication_ref : undefined;
    if (typeof ref !== 'string') throw new PackError('PACK_NOT_FOUND', `Official publication source unavailable for '${packageId}'.`);
    const { registry, repository } = parseOciRef(ref);
    if (registry !== 'ghcr.io' || repository !== `gaofeng21cn/one-person-lab-packages/${packageId}`) {
      throw new PackError('INVALID_MANIFEST', `Official publication for '${packageId}' points outside its registered Package repository.`);
    }
    return { kind: 'oci', package_id: packageId, ref };
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
      if (!fs.lstatSync(packagePath, { throwIfNoEntry: false })?.isDirectory()) {
        throw new PackError('PACK_NOT_FOUND', `Missing selected Full Package directory for '${packageId}'.`);
      }
      return { kind: 'local_dir', package_id: packageId, path: packagePath };
    }
  }
  const modulesRoot = path.join(runtimeRoot, 'modules');
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
