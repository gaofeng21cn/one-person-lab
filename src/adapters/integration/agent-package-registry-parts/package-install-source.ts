import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';
import { acquirePackagedSource } from './configured-codex-plugin-carrier-source.ts';

export function componentSeedAvailable(descriptor: InstalledPackageDescriptor) {
  const manifest = descriptor.manifest;
  const surface = manifest.codex_surface;
  try {
    return acquirePackagedSource({
      packageId: manifest.package_id,
      ownerManifest: manifest as unknown as Record<string, unknown>,
      payload: { source_commit: manifest.carrier_source_commit ?? surface?.carrier_source_commit,
        source_root: surface?.plugin_source_path },
      env: process.env,
    }) !== null;
  } catch { return false; }
}

export function packageDistributionChannel(descriptor: InstalledPackageDescriptor) {
  if (descriptor.carrier.publicationRef) return 'release' as const;
  return descriptor.manifest.publication_channel_admission === 'development_only'
    ? 'development' as const : 'unknown' as const;
}

export function packageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  // The Software Center only installs a formally admitted Package artifact.
  // A developer checkout may remain active for an existing installation, but it
  // is never a user-facing install/update/repair source.
  if (descriptor.manifest.management_scope === 'deployment_target'
    || descriptor.manifest.publication_channel_admission === 'development_only') return false;
  if (descriptor.manifest.management_scope === 'local_component') {
    return Boolean(descriptor.carrier.publicationRef) || componentSeedAvailable(descriptor);
  }
  if (descriptor.catalog_origin === 'external' || descriptor.manifest.source === 'third_party') return true;
  return Boolean(descriptor.carrier.publicationRef);
}

export function assertPackageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  if (!packageInstallSourceAvailable(descriptor)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package has no verified installation source.', {
      package_id: descriptor.manifest.package_id,
      failure_code: 'package_install_source_unavailable',
    });
  }
}
