import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { configuredPackagePayloadAvailable } from './configured-codex-plugin-carrier-payload.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';
import { githubPreviewSourceIdentity } from './package-github-preview-contract.ts';

export function packageDistributionChannel(descriptor: InstalledPackageDescriptor) {
  if (descriptor.carrier.publicationRef) return 'release' as const;
  return descriptor.manifest.publication_channel_admission === 'development_only'
    ? 'source' as const : 'unknown' as const;
}

export function packageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  // Publication admission is a distribution constraint, never a maturity label.
  // Source distribution requires the pinned payload used by its native carrier.
  if (descriptor.manifest.publication_channel_admission !== 'development_only') return true;
  if (descriptor.manifest.visibility === 'authorized_only' && !descriptor.carrier.publicationRef
    && !githubPreviewSourceIdentity(descriptor.manifest)) return false;
  return configuredPackagePayloadAvailable({
    packageId: descriptor.manifest.package_id,
    pluginId: descriptor.carrier.carrier.pluginId,
  });
}

export function assertPackageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  if (!packageInstallSourceAvailable(descriptor)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package has no verified installation source.', {
      package_id: descriptor.manifest.package_id,
      failure_code: 'package_install_source_unavailable',
    });
  }
}
