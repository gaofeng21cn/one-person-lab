import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';

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
