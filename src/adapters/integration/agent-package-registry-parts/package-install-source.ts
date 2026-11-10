import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { configuredPackagePayloadAvailable } from './configured-codex-plugin-carrier-payload.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';

export function packageReleaseChannel(descriptor: InstalledPackageDescriptor) {
  return descriptor.manifest.publication_channel_admission === 'development_only'
    ? 'preview' as const : 'stable' as const;
}

export function packageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  // Protected publication keeps its existing native-carrier contract. Preview
  // admission additionally requires the pinned payload used by that carrier.
  if (packageReleaseChannel(descriptor) !== 'preview') return true;
  if (descriptor.manifest.visibility === 'authorized_only' && !descriptor.carrier.publicationRef) return false;
  return configuredPackagePayloadAvailable({
    packageId: descriptor.manifest.package_id,
    pluginId: descriptor.carrier.carrier.pluginId,
  });
}

export function assertPackageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  if (!packageInstallSourceAvailable(descriptor)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Preview Package has no verified installation source.', {
      package_id: descriptor.manifest.package_id,
      failure_code: 'package_install_source_unavailable',
    });
  }
}
