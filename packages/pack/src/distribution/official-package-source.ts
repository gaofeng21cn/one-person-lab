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

export function createOfficialPackageResolver(options: OfficialPackageCatalogOptions = {}) {
  const runtimeRoot = officialPackageRuntimeRoot(options);
  let catalog: ReturnType<typeof readOfficialPackageCatalog> | undefined;
  return async (packageId: string) => {
    if (!KebabIdSchema.safeParse(packageId).success) throw new PackError('INVALID_INPUT', 'Invalid Package identity.');
    catalog ??= readOfficialPackageCatalog({ ...options, runtimeRoot });
    const entry = (await catalog).get(packageId);
    if (!entry) throw new PackError('PACK_NOT_FOUND', `Official catalog has no Package '${packageId}'.`);
    const source = officialPackageInstallSource(entry, runtimeRoot);
    const release = runtimeRoot ? null : await readOfficialV2Source(entry, options.fetchImpl);
    return stageOfficialPackageSource(release ? { ...source, expected_digest: release.archiveDigest } : source, release);
  };
}
