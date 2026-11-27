import fs from 'node:fs';
import { openSqliteStore, resolveStatePaths } from '@opl/core';
import { preparePrivatePackageSourceCredential, readConfiguredPrivatePackageHandle } from '@opl/pack';

const privatePublication = /^ghcr\.io\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/one-person-lab-private-packages\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:latest-stable$/;

/** Prepare only the configured GHCR source in the caller's short-lived registry directory. */
export function preparePrivatePackageRegistryAccess(publicationRef, registryConfigRoot) {
  const owner = typeof publicationRef === 'string' && privatePublication.exec(publicationRef)?.[1];
  if (!owner) return 'source_not_configured';
  const { db_file } = resolveStatePaths();
  if (!fs.existsSync(db_file)) return 'source_not_configured';
  const db = openSqliteStore(db_file, { readOnly: true });
  try {
    const handle = readConfiguredPrivatePackageHandle(db, `github-packages:${owner}`);
    return preparePrivatePackageSourceCredential(handle, registryConfigRoot);
  } finally {
    db.close();
  }
}
