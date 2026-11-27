import { resolveStatePaths } from '../packages/core/src/paths.ts';
import { preparePrivatePackageSourceCredential } from '../packages/pack/src/distribution/private-package-source-provider.ts';
import { privatePackageSourceStoreFile, readConfiguredPrivatePackageHandle } from '../packages/pack/src/distribution/private-package-source-store.ts';

const privatePublication = /^ghcr\.io\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/one-person-lab-private-packages\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:latest-stable$/;

/** Prepare only the configured GHCR source in the caller's short-lived registry directory. */
export function preparePrivatePackageRegistryAccess(publicationRef, registryConfigRoot) {
  const owner = typeof publicationRef === 'string' && privatePublication.exec(publicationRef)?.[1];
  if (!owner) return 'source_not_configured';
  const allowLegacyDefault = !process.env.OPL_STATE_DIR?.trim() && !process.env.OPL_DATA_DIR?.trim();
  const file = privatePackageSourceStoreFile(resolveStatePaths(), allowLegacyDefault);
  const handle = readConfiguredPrivatePackageHandle(file, `github-packages:${owner}`);
  return preparePrivatePackageSourceCredential(handle, registryConfigRoot);
}
