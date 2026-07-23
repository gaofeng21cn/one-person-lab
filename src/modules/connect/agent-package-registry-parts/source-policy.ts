import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { getOplPackageSpecs } from '../package-distribution.ts';
import { resolveOplInstallUpdateSourcePolicy } from '../system-installation/modules.ts';

export type AgentPackageEffectiveSourcePolicy = {
  package_id: string;
  module_id: string | null;
  desired_source_kind:
    | 'developer_checkout_override'
    | 'first_party_managed_cohort'
    | 'bundled_full_runtime_modules'
    | null;
  effective_install_update_source: string;
  configured_by: string;
  reason: string;
  developer_checkout_path: string | null;
  developer_checkout_available: boolean;
  package_channel_auto_update: boolean;
};

export function resolveAgentPackageEffectiveSourcePolicy(
  packageId: string,
  input: {
    profile?: 'fast' | 'full';
    installedSourceKind?: string | null;
  } = {},
): AgentPackageEffectiveSourcePolicy {
  const canonicalId = canonicalAgentPackageId(packageId) ?? packageId;
  const spec = getOplPackageSpecs().find((entry) => entry.package_id === canonicalId);
  if (!spec) {
    return {
      package_id: canonicalId,
      module_id: null,
      desired_source_kind: null,
      effective_install_update_source: 'external',
      configured_by: 'external_package_source',
      reason: 'package_has_no_framework_module_source_policy',
      developer_checkout_path: null,
      developer_checkout_available: false,
      package_channel_auto_update: false,
    };
  }

  const module = resolveOplInstallUpdateSourcePolicy(spec, { profile: input.profile ?? 'full' });
  const sourcePolicy = module.source_policy;
  const installedBundledSource = input.installedSourceKind === 'bundled_full_runtime_modules';
  const developerSelected = sourcePolicy.effective_install_update_source === 'git_checkout';
  const checkoutPath = developerSelected ? module.developer_checkout_path : null;
  const checkoutAvailable = developerSelected && module.developer_checkout_available;
  return {
    package_id: canonicalId,
    module_id: spec.module_id,
    desired_source_kind: installedBundledSource
      ? 'bundled_full_runtime_modules'
      : developerSelected
        ? 'developer_checkout_override'
        : sourcePolicy.effective_install_update_source === 'package_channel'
          ? 'first_party_managed_cohort'
          : sourcePolicy.effective_install_update_source === 'full_runtime'
            ? 'bundled_full_runtime_modules'
            : null,
    effective_install_update_source: installedBundledSource
      ? 'managed_bundled_catalog'
      : sourcePolicy.effective_install_update_source,
    configured_by: installedBundledSource
      ? 'installed_bundled_catalog_authority'
      : sourcePolicy.configured_by,
    reason: installedBundledSource
      ? 'installed_bundled_catalog_authority'
      : developerSelected && !checkoutAvailable
        ? `${sourcePolicy.configured_by}:developer_checkout_unavailable`
        : sourcePolicy.fallback_reason
          ? `${sourcePolicy.configured_by}:${sourcePolicy.fallback_reason}`
          : sourcePolicy.configured_by,
    developer_checkout_path: checkoutPath,
    developer_checkout_available: checkoutAvailable,
    package_channel_auto_update: installedBundledSource
      ? false
      : sourcePolicy.package_channel_auto_update,
  };
}
