import type { SqliteDb } from '@opl/core';
import { PackError } from '../errors.ts';
import { KebabIdSchema } from '../manifest/schema.ts';
import {
  officialPackageInstallSource,
  officialPackagePrivateSourceId,
  officialPackageRuntimeRoot,
  readOfficialPackageCatalog,
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
    resolveAuthHeader?: (sourceId: string) => string | null;
  } = {},
) {
  const runtimeRoot = officialPackageRuntimeRoot(options);
  let catalog: ReturnType<typeof readOfficialPackageCatalog> | undefined;
  return async (packageId: string) => {
    if (!KebabIdSchema.safeParse(packageId).success) throw new PackError('INVALID_INPUT', 'Invalid Package identity.');
    catalog ??= readOfficialPackageCatalog({ ...options, runtimeRoot });
    const entry = (await catalog).get(packageId);
    if (!entry) throw new PackError('PACK_NOT_FOUND', `Official catalog has no Package '${packageId}'.`);
    const allowAuthorizedOnly = entry.visibility === 'authorized_only';
    const source = officialPackageInstallSource(entry, runtimeRoot, { allowAuthorizedOnly });
    const authHeader = resolveAuthorizedHeader(entry, packageId, options);
    const release = runtimeRoot ? null : await readOfficialV2Source(entry, options.fetchImpl);
    if (!release) return stageOfficialPackageSource(source, null, options.fetchImpl, authHeader);
    return stageOfficialPackageSource(
      { ...source, expected_digest: release.archiveDigest },
      release,
      options.fetchImpl,
      authHeader,
    );
  };
}
