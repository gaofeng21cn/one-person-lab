import fs from 'node:fs';
import path from 'node:path';

import { sha256Text } from './shared.ts';
import {
  discoverInstalledOwnerProfileDescriptors,
  discoverInstalledPackageDescriptors,
} from './installed-codex-plugin-directory.ts';
import {
  managedPolicyDependenciesFromDescriptor,
} from './managed-policy-surface.ts';
import type { AgentPackageManagedPolicyDependency } from './types.ts';

export function readOplFlowDefaultUserInstructions() {
  const descriptors = discoverInstalledOwnerProfileDescriptors();
  if (descriptors.length !== 1) {
    return {
      surface_kind: 'opl_flow_default_user_instructions.v1' as const,
      source: 'installed_owner_descriptor' as const,
      source_path: null,
      source_root: null,
      package_version: null,
      status: descriptors.length === 0 ? 'unavailable' as const : 'invalid' as const,
      reason: descriptors.length === 0
        ? 'opl_flow_package_not_installed' as const
        : 'installed_owner_profile_descriptor_ambiguous' as const,
      content: null,
      sha256: null,
    };
  }
  const descriptor = descriptors[0]!;
  const declaredSourcePath = descriptor.manifest.profile_surface!.runtime_profile.source_path;
  try {
    const sourceRoot = fs.realpathSync(descriptor.sourcePath);
    const sourcePath = fs.realpathSync(path.resolve(sourceRoot, declaredSourcePath));
    if (!sourcePath.startsWith(`${sourceRoot}${path.sep}`) || !fs.statSync(sourcePath).isFile()) {
      throw new Error('profile source escaped its descriptor root');
    }
    const content = fs.readFileSync(sourcePath, 'utf8');
    return {
      surface_kind: 'opl_flow_default_user_instructions.v1' as const,
      source: 'installed_owner_descriptor' as const,
      source_path: sourcePath,
      source_root: sourceRoot,
      package_version: descriptor.manifest.version,
      status: 'available' as const,
      reason: null,
      content,
      sha256: sha256Text(content),
    };
  } catch {
    return {
      surface_kind: 'opl_flow_default_user_instructions.v1' as const,
      source: 'installed_owner_descriptor' as const,
      source_path: path.resolve(descriptor.sourcePath, declaredSourcePath),
      source_root: descriptor.sourcePath,
      package_version: descriptor.manifest.version,
      status: 'invalid' as const,
      reason: 'installed_owner_profile_source_missing_or_invalid' as const,
      content: null,
      sha256: null,
    };
  }
}

export function discoverInstalledManagedPolicyDescriptor(
  descriptors = discoverInstalledPackageDescriptors(),
) {
  const candidates = [...descriptors.values()]
    .filter((descriptor) => (
      descriptor.manifest.source === 'first_party'
      && Boolean(descriptor.manifest.managed_policy_surface)
    ))
    .sort((left, right) => {
      if (left.manifest.package_id === 'opl-flow') return -1;
      if (right.manifest.package_id === 'opl-flow') return 1;
      return left.manifest.package_id.localeCompare(right.manifest.package_id);
    });
  if (candidates.length > 0) {
    return candidates[0]!;
  }
  const fallback = descriptors.get('opl-flow');
  return fallback?.manifest.managed_policy_surface ? fallback : null;
}

export function readOplFlowManagedPolicyDependencies(): AgentPackageManagedPolicyDependency[] {
  const descriptor = discoverInstalledManagedPolicyDescriptor();
  if (!descriptor?.manifest.managed_policy_surface) return [];
  try {
    return managedPolicyDependenciesFromDescriptor({
      manifest: {
        package_id: descriptor.manifest.package_id,
        version: descriptor.manifest.version,
        plugin_id: descriptor.pluginId.split('@', 1)[0] ?? null,
        required_skill_ids: descriptor.manifest.required_skill_ids,
        managed_policy_surface: descriptor.manifest.managed_policy_surface,
      },
      sourceRoot: descriptor.sourcePath,
    });
  } catch {
    return [];
  }
}

export function readOplFlowManagedDependencyIds() {
  return [...new Set(readOplFlowManagedPolicyDependencies().map((dependency) => dependency.id))];
}

export function readOplFlowManagedDependencies() {
  return readOplFlowManagedPolicyDependencies().map((dependency) => ({
    dependency_id: dependency.id,
    dependency_kind: dependency.kind,
    activation: dependency.activation,
    offline_bundle: dependency.offline_bundle ?? 'none',
    online_install_default: dependency.online_install_default,
    source: dependency.source ?? null,
    source_path: dependency.source_path ?? null,
    owner: dependency.owner ?? null,
    bundle_id: dependency.bundle_id ?? null,
    version_requirement: dependency.version_requirement ?? null,
    install_source: dependency.install_source ?? null,
    relationship: dependency.relationship ?? 'required',
    lifecycle_owner: dependency.lifecycle_owner
      ?? (dependency.kind === 'codex_skill' ? 'opl_packages' : 'opl_base'),
    update_mode: dependency.online_install_default ? 'silent_managed' : 'detect_only_guidance',
    observed_status: null,
    installed: dependency.kind === 'base' ? true : null,
  }));
}
