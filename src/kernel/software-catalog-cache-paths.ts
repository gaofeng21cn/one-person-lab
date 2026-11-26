import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveOplStatePaths } from './runtime-state-paths.ts';

export const OFFICIAL_OPL_CATALOG_ID = 'public-registry:opl';
export const DEFAULT_OPL_CATALOG_INDEX_URL =
  'https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/main/catalog-index.json';

function resolveCatalogStateDir(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env === process.env) {
    try {
      return resolveOplStatePaths().state_dir;
    } catch (error) {
      if (error instanceof Error && error.name === 'OplStateAdmissionError') {
        return null;
      }
      throw error;
    }
  }
  const explicitStateDir = env.OPL_STATE_DIR?.trim();
  if (explicitStateDir) return path.resolve(explicitStateDir);
  const dockerDataDir = env.OPL_DATA_DIR?.trim();
  if (dockerDataDir) return path.join(path.resolve(dockerDataDir), 'opl', 'state');
  const homeDir = env.HOME?.trim() || os.homedir();
  return path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
}

export function sanitizeCatalogSourceId(sourceId: string): string {
  return sourceId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function softwareCatalogCacheRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const stateDir = resolveCatalogStateDir(env);
  return stateDir ? path.join(stateDir, 'sources', 'catalog-cache') : null;
}

export function softwareCatalogSourceRoot(
  sourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const cacheRoot = softwareCatalogCacheRoot(env);
  return cacheRoot ? path.join(cacheRoot, sanitizeCatalogSourceId(sourceId)) : null;
}

export function softwareCatalogSourceDir(sourceId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const root = softwareCatalogSourceRoot(sourceId, env);
  if (!root) return null;
  try {
    const generation = fs.readFileSync(path.join(root, 'current'), 'utf8').trim();
    if (/^generation-[0-9a-f-]{36}$/.test(generation)) return path.join(root, generation);
  } catch { /* Existing caches may still use the flat layout. */ }
  return root;
}

function readEnabledCatalogSources(env: NodeJS.ProcessEnv) {
  const stateDir = resolveCatalogStateDir(env);
  const defaultSource = { id: OFFICIAL_OPL_CATALOG_ID, ref: DEFAULT_OPL_CATALOG_INDEX_URL };
  const defaults = [defaultSource];
  if (!stateDir) return defaults;
  const sourcesFile = path.join(stateDir, 'software-sources.json');
  if (!fs.existsSync(sourcesFile)) return defaults;
  try {
    const parsed = JSON.parse(fs.readFileSync(sourcesFile, 'utf8')) as {
      surface_kind?: unknown;
      sources?: Array<Record<string, unknown>>;
    };
    if (parsed?.surface_kind !== 'opl_software_sources_store.v1' || !Array.isArray(parsed.sources)) {
      return defaults;
    }
    const enabledSources = new Map([[defaultSource.id, defaultSource]]);
    for (const entry of parsed.sources) {
      if (!entry || typeof entry !== 'object') continue;
      const sourceId = typeof entry.source_id === 'string' ? entry.source_id.trim() : '';
      if (!sourceId) continue;
      if (sourceId === OFFICIAL_OPL_CATALOG_ID && entry.enabled === false) {
        enabledSources.delete(sourceId);
        continue;
      }
      if (/^catalog:[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/.test(sourceId)
        && entry.enabled !== false && typeof entry.source_ref === 'string') {
        enabledSources.set(sourceId, { id: sourceId, ref: entry.source_ref });
      }
    }
    return [...enabledSources.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  } catch {
    return defaults;
  }
}

export function listActiveSyncedCatalogPackageRoots(
  env: NodeJS.ProcessEnv = process.env,
): { sourceId: string; packageDir: string }[] {
  return readEnabledCatalogSources(env).flatMap(({ id: sourceId, ref }) => {
    const dir = softwareCatalogSourceDir(sourceId, env);
    if (!dir) return [];
    const packagesDir = path.join(dir, 'packages');
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as {
        source_id?: unknown; source_ref?: unknown; schema_version?: unknown;
      };
      return meta?.schema_version === 'opl_software_catalog_cache_meta.v1'
        && meta.source_id === sourceId && meta.source_ref === ref
        && fs.statSync(packagesDir, { throwIfNoEntry: false })?.isDirectory()
        ? [{ sourceId, packageDir: packagesDir }]
        : [];
    } catch {
      return [];
    }
  });
}
