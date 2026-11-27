import semver from 'semver';
import { isRecord } from '@opl/core';
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
import { privatePackageSourceStorePath } from './private-package-sources.ts';
import { stageOfficialPackageSource } from './stage-official-source.ts';

function resolveAuthorizedHeader(
  entry: OfficialPackageCatalogEntry,
  packageId: string,
  options: { readonly stateDir?: string; readonly resolveAuthHeader?: (sourceId: string) => string | null },
): string | undefined {
  if (entry.visibility !== 'authorized_only') return undefined;
  const sourceId = officialPackagePrivateSourceId(entry);
  if (!sourceId) {
    throw new PackError('PACK_NOT_FOUND', `Authorized software source unavailable for '${packageId}'.`);
  }
  const authHeader = options.resolveAuthHeader
    ? options.resolveAuthHeader(sourceId)
    : resolvePrivatePackageAuthHeader(readConfiguredPrivatePackageHandle(privatePackageSourceStorePath(options.stateDir), sourceId));
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
    exactPackageId?: string;
    stateDir?: string;
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
    const source = officialPackageInstallSource(entry, runtimeRoot, 'preferred', { allowAuthorizedOnly });
    const authHeader = resolveAuthorizedHeader(entry, packageId, options);
    const release = runtimeRoot ? null : await readOfficialV2Source(entry, options.fetchImpl);
    if (!release) return stageOfficialPackageSource(source, null, options.fetchImpl, authHeader);
    try {
      return await stageOfficialPackageSource(
        { ...source, expected_digest: release.archiveDigest },
        release,
        options.fetchImpl,
        authHeader,
      );
    } catch (error) {
      if (packageId === options.exactPackageId || !(error instanceof PackError) || error.code !== 'PACK_DOWNLOAD_FAILED'
        || error.details.status !== 404 || error.details.manifest_unknown !== release.version) throw error;
      const legacy = officialPackageInstallSource(entry, runtimeRoot, 'legacy', { allowAuthorizedOnly });
      const legacySurface = entry.manifest?.codex_surface;
      if (!legacy.version || !semver.valid(legacy.version) || !semver.lt(legacy.version, release.version)
        || entry.manifest?.version !== legacy.version
        || entry.payload?.package_version !== legacy.version || entry.payload?.package_id !== packageId
        || entry.payload?.source_repo !== entry.manifest?.source_repo
        || typeof entry.payload?.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(entry.payload.source_commit)
        || !isRecord(legacySurface) || legacySurface.carrier_source_commit !== entry.payload.source_commit) throw error;
      return stageOfficialPackageSource(legacy, null, options.fetchImpl, authHeader);
    }
  };
}
