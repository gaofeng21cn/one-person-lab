import fs from 'node:fs';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from './types.ts';

type CachedManifestProjection = {
  project_id: string;
  project: string;
  binding_id: string | null;
  workspace_path: string | null;
  manifest_command: string | null;
  manifest: NormalizedDomainManifest;
  cached_at: string;
};

type ManifestProjectionCacheFile = {
  version: 'g2';
  projections: CachedManifestProjection[];
};

function readCacheFile(): ManifestProjectionCacheFile {
  const paths = resolveOplStatePaths();
  if (!fs.existsSync(paths.domain_manifest_projection_cache_file)) {
    return { version: 'g2', projections: [] };
  }

  try {
    const parsed = parseJsonText(fs.readFileSync(paths.domain_manifest_projection_cache_file, 'utf8'));
    if (!isRecord(parsed) || parsed.version !== 'g2' || !Array.isArray(parsed.projections)) {
      return { version: 'g2', projections: [] };
    }
    return {
      version: 'g2',
      projections: parsed.projections.filter(isRecord).map((projection) => ({
        project_id: String(projection.project_id),
        project: String(projection.project),
        binding_id: typeof projection.binding_id === 'string' ? projection.binding_id : null,
        workspace_path: typeof projection.workspace_path === 'string' ? projection.workspace_path : null,
        manifest_command: typeof projection.manifest_command === 'string' ? projection.manifest_command : null,
        manifest: projection.manifest as NormalizedDomainManifest,
        cached_at: typeof projection.cached_at === 'string' ? projection.cached_at : '',
      })).filter((projection) => isRecord(projection.manifest) && projection.cached_at),
    };
  } catch {
    return { version: 'g2', projections: [] };
  }
}

function writeCacheFile(cache: ManifestProjectionCacheFile) {
  const paths = ensureOplStateDir(resolveOplStatePaths());
  fs.writeFileSync(paths.domain_manifest_projection_cache_file, `${JSON.stringify(cache, null, 2)}\n`);
}

function cacheKey(entry: Pick<DomainManifestCatalogEntry, 'project_id' | 'binding_id' | 'workspace_path' | 'manifest_command'>) {
  return JSON.stringify([
    entry.project_id,
    entry.binding_id,
    entry.workspace_path,
    entry.manifest_command,
  ]);
}

export function writeResolvedDomainManifestProjectionCache(entries: DomainManifestCatalogEntry[]) {
  const cache = readCacheFile();
  const projections = new Map(cache.projections.map((projection) => [cacheKey(projection), projection]));
  const cachedAt = new Date().toISOString();
  let changed = false;

  for (const entry of entries) {
    if (entry.status !== 'resolved' || !entry.manifest) {
      continue;
    }
    projections.set(cacheKey(entry), {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      workspace_path: entry.workspace_path,
      manifest_command: entry.manifest_command,
      manifest: entry.manifest,
      cached_at: cachedAt,
    });
    changed = true;
  }

  if (changed) {
    writeCacheFile({ version: 'g2', projections: [...projections.values()] });
  }
}

function readDomainManifestProjectionCache(entry: DomainManifestCatalogEntry) {
  return readCacheFile().projections.find((projection) => cacheKey(projection) === cacheKey(entry)) ?? null;
}

export function hydrateDomainManifestCatalogFromProjectionCache(entries: DomainManifestCatalogEntry[]) {
  return entries.map((entry) => {
    if (entry.status === 'resolved' || entry.manifest) {
      return entry;
    }
    const cached = readDomainManifestProjectionCache(entry);
    if (!cached) {
      return entry;
    }
    return {
      ...entry,
      status: 'resolved' as const,
      manifest: cached.manifest,
      manifest_cache: {
        cache_status: 'stale_projection_cache_used',
        cached_at: cached.cached_at,
        source_status: entry.status,
        source_error: entry.error,
        authority_boundary: {
          cache_is_domain_truth: false,
          cache_can_authorize_domain_ready: false,
          cache_can_authorize_quality_or_export_verdict: false,
          live_manifest_refresh_required_for_operating_maturity: true,
        },
      },
    };
  });
}
