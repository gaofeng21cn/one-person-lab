import { isRecord, type SqliteDb } from '@opl/core';
import { PackError } from '../errors.ts';
import { KebabIdSchema } from '../manifest/schema.ts';
import {
  officialPackageInstallSource,
  officialPackagePrivateSourceId,
  officialPackageRuntimeRoot,
  readOfficialCatalogSelection,
  officialPackageSelectedVersion,
  readOfficialV2Source,
  type OfficialPackageCatalogEntry,
  type OfficialPackageCatalogOptions,
} from './official-package-catalog.ts';
import { resolvePrivatePackageAuthHeader } from './private-package-source-provider.ts';
import { readConfiguredPrivatePackageHandle } from './private-package-source-store.ts';
import { stageOfficialPackageSource } from './stage-official-source.ts';

function resolveAuthorizedHeader(
  entry: OfficialPackageCatalogEntry,
  packageId: string,
  options: { readonly db?: SqliteDb; readonly resolveAuthHeader?: (sourceId: string) => string | null },
): string | undefined {
  if (entry.visibility !== 'authorized_only') return undefined;
  const sourceId = officialPackagePrivateSourceId(entry);
  if (!sourceId) {
    throw new PackError('PACK_NOT_FOUND', `Authorized software source unavailable for '${packageId}'.`);
  }
  const authHeader = options.resolveAuthHeader
    ? options.resolveAuthHeader(sourceId)
    : options.db ? resolvePrivatePackageAuthHeader(readConfiguredPrivatePackageHandle(options.db, sourceId)) : null;
  if (!authHeader) {
    throw new PackError(
      'PACK_DOWNLOAD_FAILED',
      `Private Package '${packageId}' requires an authorized '${sourceId}' software source credential.`,
      { reason: 'authorization_required', source_id: sourceId },
    );
  }
  return authHeader;
}

export function createOfficialPackageResolver(
  options: OfficialPackageCatalogOptions & {
    db?: SqliteDb;
    cacheRoot?: string;
    resolveAuthHeader?: (sourceId: string) => string | null;
  } = {},
) {
  const runtimeRoot = officialPackageRuntimeRoot(options);
  let catalog: ReturnType<typeof readOfficialCatalogSelection> | undefined;
  return async (packageId: string, operation?: Parameters<typeof stageOfficialPackageSource>[4]) => {
    if (!KebabIdSchema.safeParse(packageId).success) throw new PackError('INVALID_INPUT', 'Invalid Package identity.');
    const selected = await (catalog ??= readOfficialCatalogSelection({ ...options, runtimeRoot, signal: operation?.signal }));
    const entry = selected.entries.get(packageId);
    if (!entry) throw new PackError('PACK_NOT_FOUND', 'Official catalog has no Package ' + packageId + '.');
    const allowAuthorizedOnly = entry.visibility === 'authorized_only';
    const stageOptions = { cacheRoot: options.cacheRoot, ...operation };
    const seed = selected.seed.get(packageId);
    const facet = entry.manifest?.v2_release;
    const version = officialPackageSelectedVersion(entry);
    const commit = isRecord(facet) ? facet.source_commit : entry.payload?.source_commit;
    if (runtimeRoot && !allowAuthorizedOnly && seed && seed.payload?.source_commit === commit
      && officialPackageSelectedVersion(seed) === version) {
      try {
        const localSource = officialPackageInstallSource(seed, runtimeRoot);
        const content = seed.payload?.content_lock;
        const contentDigest = isRecord(content) && typeof content.digest === 'string' ? content.digest : undefined;
        return await stageOfficialPackageSource({ ...localSource, version: version ?? undefined }, null,
          options.fetchImpl, undefined, stageOptions, {
            commit: typeof commit === 'string' ? commit : undefined,
            contentDigest,
          });
      } catch (error) {
        operation?.signal?.throwIfAborted();
        if (!selected.online) throw error;
      }
    }
    if (!selected.online) {
      throw new PackError('PACK_DOWNLOAD_FAILED', 'The selected Package requires the online catalog.');
    }
    const authHeader = resolveAuthorizedHeader(entry, packageId, options);
    const source = officialPackageInstallSource(entry, null, { allowAuthorizedOnly });
    const release = await readOfficialV2Source(entry, options.fetchImpl, operation?.signal);
    return stageOfficialPackageSource(
      { ...source, expected_digest: release?.archiveDigest },
      release, options.fetchImpl, authHeader, stageOptions,
    );
  };
}
