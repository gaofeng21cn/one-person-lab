import {
  ConnectError,
  readGatewayAccountUserId,
  readOplGatewayAccount,
  withGatewayStateDirectory,
  withOplGatewayAccessToken,
} from '@opl/connect';
import type { SqliteDb } from '@opl/core';
import {
  OPL_CLOUD_SOFTWARE_SOURCE_ID,
  PackError,
  clearCachedCloudSoftwareEntitlements,
  createOfficialPackageResolver,
  downloadCloudEntitledPackageArchive,
  fetchCloudSoftwareEntitlements,
  readCachedCloudSoftwareEntitlements,
  writeCachedCloudSoftwareEntitlements,
  type CloudEntitledPackage,
  type CloudSoftwareEntitlementsResult,
  type CloudSoftwareEntitlementsStatus,
  type OfficialPackageCatalogOptions,
} from '@opl/pack';

export interface CloudSourceSnapshot {
  readonly connected: boolean;
  readonly status: CloudSoftwareEntitlementsStatus;
  readonly accountLogin: string | null;
  readonly checkedAt: string | null;
  readonly verificationReason: string | null;
  readonly entitledCount: number | null;
}

export interface CloudPackageOverlayInput {
  readonly status: CloudSoftwareEntitlementsStatus;
  readonly packages: ReadonlyMap<string, CloudEntitledPackage>;
}

export function readCloudSoftwareSourceSnapshot(db: SqliteDb, stateDir: string): CloudSourceSnapshot {
  try {
    return withGatewayStateDirectory(stateDir, () => {
      const account = readOplGatewayAccount();
      const userId = readGatewayAccountUserId();
      const accountLogin = account.account?.email ?? account.account?.display_name ?? null;
      if (account.connection_mode !== 'account' || !userId) {
        return {
          connected: false,
          status: 'signed_out',
          accountLogin: null,
          checkedAt: null,
          verificationReason: account.status === 'reauth_required' ? 'gateway_session_expired' : 'gateway_account_not_connected',
          entitledCount: null,
        };
      }
      if (account.status === 'reauth_required' || account.status === 'disconnect_pending') {
        return {
          connected: true,
          status: 'expired',
          accountLogin,
          checkedAt: null,
          verificationReason: 'gateway_session_expired',
          entitledCount: null,
        };
      }
      const cached = readCachedCloudSoftwareEntitlements(db, userId);
      if (!cached) {
        return {
          connected: true,
          status: 'unknown',
          accountLogin,
          checkedAt: null,
          verificationReason: 'cloud_entitlements_not_checked',
          entitledCount: null,
        };
      }
      return {
        connected: true,
        status: cached.status,
        accountLogin,
        checkedAt: cached.checked_at,
        verificationReason: cached.verification_reason,
        entitledCount: cached.status === 'authorized' ? cached.entitlements.length : null,
      };
    });
  } catch {
    return {
      connected: false,
      status: 'signed_out',
      accountLogin: null,
      checkedAt: null,
      verificationReason: 'gateway_account_not_connected',
      entitledCount: null,
    };
  }
}

export function readCachedCloudPackageOverlay(db: SqliteDb, stateDir: string): CloudPackageOverlayInput | undefined {
  try {
    return withGatewayStateDirectory(stateDir, () => {
      const account = readOplGatewayAccount();
      const userId = readGatewayAccountUserId();
      if (account.connection_mode !== 'account' || !userId) return undefined;
      if (account.status === 'reauth_required' || account.status === 'disconnect_pending') {
        return { status: 'expired', packages: new Map() };
      }
      const cached = readCachedCloudSoftwareEntitlements(db, userId);
      if (!cached) return undefined;
      return {
        status: cached.status,
        packages: new Map(cached.entitlements.map(pkg => [pkg.package_id, pkg])),
      };
    });
  } catch {
    return undefined;
  }
}

export async function refreshCloudSoftwareEntitlements(
  db: SqliteDb,
  stateDir: string,
): Promise<CloudSourceSnapshot> {
  const { account, userId } = withGatewayStateDirectory(stateDir, () => ({
    account: readOplGatewayAccount(),
    userId: readGatewayAccountUserId(),
  }));
  if (account.connection_mode !== 'account' || !userId
    || account.status === 'reauth_required' || account.status === 'disconnect_pending') {
    clearCachedCloudSoftwareEntitlements(db);
    return readCloudSoftwareSourceSnapshot(db, stateDir);
  }
  let result: CloudSoftwareEntitlementsResult;
  try {
    result = await withGatewayStateDirectory(stateDir, () =>
      withOplGatewayAccessToken((accessToken) => fetchCloudSoftwareEntitlements({ accessToken })),
    );
  } catch (error) {
    if (error instanceof ConnectError && error.reason_code === 'reauth_required') {
      result = {
        status: 'expired',
        verification_reason: 'gateway_session_expired',
        checked_at: new Date().toISOString(),
        entitlements: [],
      };
    } else {
      result = {
        status: 'unknown',
        verification_reason: 'cloud_entitlements_unavailable',
        checked_at: new Date().toISOString(),
        entitlements: [],
      };
    }
  }
  writeCachedCloudSoftwareEntitlements(db, userId, result);
  return readCloudSoftwareSourceSnapshot(db, stateDir);
}

export function createDaemonOfficialPackageResolver(
  options: OfficialPackageCatalogOptions & {
    readonly db: SqliteDb;
    readonly cacheRoot: string;
    readonly stateDir: string;
  },
) {
  const hasCloudSession = () => withGatewayStateDirectory(options.stateDir, () => {
    const account = readOplGatewayAccount();
    const userId = readGatewayAccountUserId();
    return account.connection_mode === 'account' && Boolean(userId);
  });
  return createOfficialPackageResolver({
    ...options,
    hasCloudSession,
    downloadEntitledArchive: async ({ packageId, expectedDigest, cacheRoot, operation }) => {
      if (!hasCloudSession()) return null;
      try {
        return await withGatewayStateDirectory(options.stateDir, () =>
          withOplGatewayAccessToken((accessToken) =>
            downloadCloudEntitledPackageArchive({
              packageId,
              accessToken,
              expectedDigest,
              cacheRoot,
              opId: operation?.opId,
              signal: operation?.signal,
              onProgress: operation?.onProgress,
            }),
          ),
        );
      } catch (error) {
        if (error instanceof ConnectError && error.reason_code === 'reauth_required') {
          throw new PackError('PACK_DOWNLOAD_FAILED', 'Sign in to your OPL account again to download this Package.', {
            reason: 'reauth_required',
            source_id: OPL_CLOUD_SOFTWARE_SOURCE_ID,
          });
        }
        throw error;
      }
    },
  });
}
