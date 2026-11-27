import semver from 'semver';
import { isRecord } from '@opl/core';
import { PackError } from '../errors.ts';
import { KebabIdSchema } from '../manifest/schema.ts';
import {
  officialPackageInstallSource,
  officialPackageRuntimeRoot,
  readOfficialPackageCatalog,
  readOfficialV2Source,
  type OfficialPackageCatalogOptions,
} from './official-package-catalog.ts';
import { stageOfficialPackageSource } from './stage-official-source.ts';

export function createOfficialPackageResolver(
  options: OfficialPackageCatalogOptions & { exactPackageId?: string } = {},
) {
  const runtimeRoot = officialPackageRuntimeRoot(options);
  let catalog: ReturnType<typeof readOfficialPackageCatalog> | undefined;
  return async (packageId: string) => {
    if (!KebabIdSchema.safeParse(packageId).success) throw new PackError('INVALID_INPUT', 'Invalid Package identity.');
    catalog ??= readOfficialPackageCatalog({ ...options, runtimeRoot });
    const entry = (await catalog).get(packageId);
    if (!entry) throw new PackError('PACK_NOT_FOUND', `Official catalog has no Package '${packageId}'.`);
    const source = officialPackageInstallSource(entry, runtimeRoot);
    const release = runtimeRoot ? null : await readOfficialV2Source(entry, options.fetchImpl);
    if (!release) return stageOfficialPackageSource(source, null, options.fetchImpl);
    try {
      return await stageOfficialPackageSource({ ...source, expected_digest: release.archiveDigest }, release, options.fetchImpl);
    } catch (error) {
      if (packageId === options.exactPackageId || !(error instanceof PackError) || error.code !== 'PACK_DOWNLOAD_FAILED'
        || error.details.status !== 404 || error.details.manifest_unknown !== release.version) throw error;
      const legacy = officialPackageInstallSource(entry, runtimeRoot, 'legacy');
      const legacySurface = entry.manifest?.codex_surface;
      if (!legacy.version || !semver.valid(legacy.version) || !semver.lt(legacy.version, release.version)
        || entry.manifest?.version !== legacy.version
        || entry.payload?.package_version !== legacy.version || entry.payload?.package_id !== packageId
        || entry.payload?.source_repo !== entry.manifest?.source_repo
        || typeof entry.payload?.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(entry.payload.source_commit)
        || !isRecord(legacySurface) || legacySurface.carrier_source_commit !== entry.payload.source_commit) throw error;
      return stageOfficialPackageSource(legacy, null, options.fetchImpl);
    }
  };
}
