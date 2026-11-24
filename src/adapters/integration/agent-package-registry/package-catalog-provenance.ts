import os from 'node:os';
import path from 'node:path';

export type PackageCatalogProvenance = {
  catalog_origin: 'opl' | 'external' | 'unknown';
  origin_basis: 'owner_projection' | 'owner_manifest' | 'native_carrier' | 'unknown';
  catalog_source: {
    manager: string;
    marketplace_id?: string;
    delivery: 'host_bundled' | 'marketplace' | 'local' | 'unknown';
  };
};

const OPL_OWNER_SOURCES = new Set(['first_party', 'first_party_owner_projection', 'first_party_repo_local']);

function hostBundledSource(sourcePath: string | undefined) {
  if (!sourcePath) return false;
  const home = process.env.HOME?.trim() || os.homedir();
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  const cacheHome = process.env.XDG_CACHE_HOME?.trim() || path.join(home, '.cache');
  return [path.join(codexHome, '.tmp', 'bundled-marketplaces'), path.join(cacheHome, 'codex-runtimes')]
    .some(root => path.resolve(sourcePath).startsWith(`${path.resolve(root)}${path.sep}`));
}

/** Distribution and maintainer metadata are presentation, never trust or action authority. */
export function codexPackageCatalogProvenance(input: {
  pluginId: string;
  marketplaceSource: string | null;
  sourcePath?: string;
  ownerSource?: string;
  ownerProjection?: boolean;
  ownerManifest?: boolean;
}): PackageCatalogProvenance {
  const marketplaceId = input.pluginId.slice(input.pluginId.indexOf('@') + 1).trim();
  const declaredOrigin = OPL_OWNER_SOURCES.has(input.ownerSource ?? '')
    ? 'opl' : input.ownerSource === 'third_party' ? 'external' : 'unknown';
  return {
    catalog_origin: input.ownerProjection ? 'opl' : input.ownerManifest ? declaredOrigin : 'external',
    origin_basis: input.ownerProjection ? 'owner_projection' : input.ownerManifest ? 'owner_manifest' : 'native_carrier',
    catalog_source: {
      manager: 'codex_plugin_manager',
      ...(input.pluginId.includes('@') && marketplaceId ? { marketplace_id: marketplaceId } : {}),
      delivery: hostBundledSource(input.sourcePath) ? 'host_bundled'
        : input.marketplaceSource ? (path.isAbsolute(input.marketplaceSource) ? 'local' : 'marketplace')
          : input.sourcePath ? 'local' : 'unknown',
    },
  };
}

export function packageCatalogProvenance(value: Partial<PackageCatalogProvenance> | null | undefined): PackageCatalogProvenance {
  return {
    catalog_origin: value?.catalog_origin ?? 'unknown',
    origin_basis: value?.origin_basis ?? 'unknown',
    catalog_source: value?.catalog_source ?? { manager: 'unknown', delivery: 'unknown' },
  };
}
