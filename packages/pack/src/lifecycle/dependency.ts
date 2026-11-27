import semver from 'semver';
import { PackError } from '../errors.ts';
import type { OplPackageManifestV2 } from '../manifest/schema.ts';

type PackageDependency = NonNullable<NonNullable<OplPackageManifestV2['dependencies']>['packages']>[number];

/** Check one dependency against the enabled or proposed provider selected by Pack. */
export function assertRequiredPackageDependency(
  consumerId: string,
  requirement: PackageDependency,
  provider: OplPackageManifestV2 | null,
): void {
  if (requirement.optional === true || requirement.presence === 'optional') return;

  const id = requirement.id;
  if (!provider || provider.identity.id !== id) {
    throw new PackError(
      'PACK_DEPENDENCY_MISSING',
      `Required dependency package '${id}' for '${consumerId}' is not installed or disabled.`,
      { package_id: consumerId, missing_dependency: id },
    );
  }
  if (requirement.version && !semver.satisfies(provider.identity.version, requirement.version)) {
    throw new PackError(
      'PACK_DEPENDENCY_MISSING',
      `Dependency '${id}@${provider.identity.version}' does not satisfy required version '${requirement.version}' for '${consumerId}'.`,
      { package_id: consumerId, dependency: id, installed_version: provider.identity.version, required_version: requirement.version },
    );
  }
  if (!requirement.required_capabilities?.length) return;

  // Legacy required export IDs include skill IDs. Connection providers also
  // export named capabilities. Permissions and host hints describe other roles.
  const exported = new Set(provider.provides?.skills?.map(skill => skill.id));
  for (const connection of provider.provides?.connection_providers ?? []) {
    for (const capability of connection.capabilities) exported.add(capability.id);
  }
  const missing = requirement.required_capabilities.filter(id => !exported.has(id));
  if (missing.length > 0) {
    throw new PackError(
      'PACK_DEPENDENCY_MISSING',
      `Dependency '${id}' does not export required capabilities for '${consumerId}': ${missing.join(', ')}.`,
      { package_id: consumerId, dependency: id, missing_capabilities: missing },
    );
  }
}
