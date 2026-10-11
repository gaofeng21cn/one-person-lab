import path from 'node:path';

import { listCurrentPackageProjections } from '../../../kernel/standard-agent-registry.ts';
import {
  discoverProjectLocalCapabilityPackageDescriptors as discoverProjectLocalCapabilityPackageDescriptorsFromOwners,
} from './installed-codex-plugin-directory-project-local.ts';
import {
  discoverCurrentOwnerPackageDescriptors,
  installedDescriptorHasExpectedCodexExposure,
  installedDescriptorMatchesConfiguredCarrier,
  installedDescriptorSupportsFrameworkCalls,
  readInstalledPackageDescriptor,
  withCurrentOwnerProjection,
} from './installed-codex-plugin-directory-descriptor.ts';
import {
  type CarrierDiscoveryInput,
  readInstalledCarrierEntries,
} from './installed-codex-plugin-directory-lifecycle.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';

export type {
  InstalledCarrierEntry,
  InstalledPackageCarrierReadback,
  InstalledPackageDescriptor,
  InstalledPackageManifest,
  InstalledPackageReadiness,
} from './installed-codex-plugin-directory-types.ts';

export {
  discoverCurrentOwnerPackageDescriptors,
  installedDescriptorHasExpectedCodexExposure,
  installedDescriptorMatchesConfiguredCarrier,
  installedDescriptorSupportsFrameworkCalls,
} from './installed-codex-plugin-directory-descriptor.ts';

export {
  isProjectLocalCapabilityPackage,
  projectLocalCapabilityDependencyReadiness,
  resolveProjectLocalCapabilitySourceRoot,
} from './installed-codex-plugin-directory-project-local.ts';

export {
  parseInstalledCarrierEntries,
  readInstalledCarrierEntries,
} from './installed-codex-plugin-directory-lifecycle.ts';

export function discoverProjectLocalCapabilityPackageDescriptors(input: { packageId?: string | null } = {}) {
  return discoverProjectLocalCapabilityPackageDescriptorsFromOwners(
    discoverCurrentOwnerPackageDescriptors(input).values(),
  );
}

export function discoverPackageDescriptors(input: CarrierDiscoveryInput = {}) {
  const entries = readInstalledCarrierEntries(input);
  const discovered = new Map<string, InstalledPackageDescriptor>();
  for (const entry of entries) {
    const descriptor = readInstalledPackageDescriptor(entry);
    if (!descriptor) continue;
    if (input.packageId && descriptor.manifest.package_id !== input.packageId) continue;
    const previous = discovered.get(descriptor.manifest.package_id);
    if (previous) {
      const previousExact = installedDescriptorMatchesConfiguredCarrier(previous);
      const descriptorExact = installedDescriptorMatchesConfiguredCarrier(descriptor);
      if (previousExact !== descriptorExact) {
        if (previousExact) continue;
      } else if (
        (previous.readiness.installed && !descriptor.readiness.installed)
        || (previous.readiness.installed === descriptor.readiness.installed
          && (previous.enabled || !descriptor.enabled))
      ) {
        continue;
      }
    }
    discovered.set(descriptor.manifest.package_id, descriptor);
  }
  return discovered;
}

export function discoverInstalledPackageDescriptors(input: {
  packageId?: string | null;
  includeInternal?: boolean;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CarrierDiscoveryInput['runner'];
  failClosedOnCarrierError?: boolean;
} = {}) {
  const installed = discoverPackageDescriptors(input);
  const projected = discoverCurrentOwnerPackageDescriptors(input);
  for (const [packageId, descriptor] of installed) {
    installed.set(packageId, withCurrentOwnerProjection(descriptor, projected.get(packageId)));
  }
  for (const [packageId, descriptor] of discoverProjectLocalCapabilityPackageDescriptors(input)) {
    if (!installed.has(packageId)) installed.set(packageId, descriptor);
  }
  return installed;
}

export function discoverAvailablePackageDescriptors(input: {
  packageId?: string | null;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CarrierDiscoveryInput['runner'];
} = {}) {
  const discovered = discoverCurrentOwnerPackageDescriptors(input);
  const developmentOnly = new Set(listCurrentPackageProjections().filter(({ payload }) => payload.publication_channel_admission === 'development_only').map(({ payload }) => payload.package_id));
  for (const packageId of developmentOnly) if (typeof packageId === 'string' && input.packageId !== packageId) discovered.delete(packageId);
  for (const [packageId, descriptor] of discoverPackageDescriptors({ ...input, includeAvailable: true })) {
    if (!descriptor.readiness.installed && developmentOnly.has(packageId) && input.packageId !== packageId) continue;
    discovered.set(packageId, descriptor.readiness.installed
      ? withCurrentOwnerProjection(descriptor, discovered.get(packageId))
      : descriptor);
  }
  return discovered;
}

/**
 * Profile defaults are owned by an installed first-party Package descriptor.
 * A carrier-native Agent Plugin manifest is not sufficient authority to
 * replace user instructions, even when it presents a similar plugin surface.
 */
export function discoverInstalledOwnerProfileDescriptors(input: {
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CarrierDiscoveryInput['runner'];
} = {}) {
  return [...discoverInstalledPackageDescriptors(input).values()]
    .filter((descriptor) => (
      descriptor.manifest.source === 'first_party'
      && descriptor.manifestPath === path.join(descriptor.sourcePath, 'opl-package.json')
      && descriptor.manifest.profile_surface?.runtime_profile.target_id === 'user_agents_profile'
    ))
    .sort((left, right) => left.manifest.package_id.localeCompare(right.manifest.package_id));
}
