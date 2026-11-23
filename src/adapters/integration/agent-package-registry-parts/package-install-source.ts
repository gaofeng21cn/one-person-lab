import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';
import { publicComponentPayloadAvailable } from './configured-codex-plugin-carrier-payload.ts';
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

export function packageInstallSource(descriptor: InstalledPackageDescriptor) {
  const manifest = descriptor.manifest;
  if (manifest.management_scope === 'deployment_target'
    || manifest.publication_channel_admission === 'development_only'
    || manifest.publication_channel_admission === 'retired') return null;
  if (descriptor.carrier.publicationRef) return 'published' as const;
  if (manifest.management_scope === 'local_component') {
    if (publicComponentPayloadAvailable(manifest.package_id, descriptor.pluginId)) return 'public_payload' as const;
    return componentSeedAvailable(descriptor) ? 'parent_seed' as const : null;
  }
  return descriptor.catalog_origin === 'external' || manifest.source === 'third_party' ? 'external' as const : null;
}

export function packageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  return packageInstallSource(descriptor) !== null;
}

export function assertPackageInstallSourceAvailable(descriptor: InstalledPackageDescriptor) {
  if (!packageInstallSourceAvailable(descriptor)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package has no verified installation source.', {
      package_id: descriptor.manifest.package_id,
      failure_code: 'package_install_source_unavailable',
    });
  }
}
