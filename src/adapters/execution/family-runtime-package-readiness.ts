import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { requireAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
import { gitMarketplaceRuntimeRoot } from '../../kernel/git-marketplace-runtime-root.ts';
import { sameMarketplaceSource } from '../../kernel/marketplace-source-identity.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';

type PackageScope = {
  scope: 'workspace' | 'quest';
  targetWorkspace?: string;
  targetQuest?: string;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sha256Digest(value: unknown) {
  const text = optionalString(value);
  if (!text) return null;
  if (/^sha256:[a-f0-9]{64}$/.test(text)) return text;
  return /^[a-f0-9]{64}$/.test(text) ? `sha256:${text}` : null;
}

function localCarrierRuntimeCheckout(packageStatus: any) {
  const configured = isRecord(packageStatus?.configured_carrier)
    ? packageStatus.configured_carrier
    : null;
  const carrier = isRecord(configured?.carrier) ? configured.carrier : null;
  const installedCarrier = isRecord(packageStatus?.installed_carrier_readback)
    ? packageStatus.installed_carrier_readback
    : null;
  const installedReady = packageStatus?.installed_readiness;
  const observedSources = Array.isArray(carrier?.observed_sources)
    ? carrier.observed_sources.filter(isRecord)
    : [];
  const marketplaceRoot = optionalString(carrier?.marketplace_source);
  const pluginRoot = optionalString(configured?.plugin_source_path);
  if (
    configured?.status !== 'installed'
    || carrier?.precedence !== 'exact_single_source'
    || observedSources.length !== 1
    || installedCarrier?.kind !== 'local'
    || installedCarrier.lifecycle_authority !== 'carrier_owned'
    || installedReady?.installed !== true
    || installedReady?.physical_status !== 'available'
    || installedReady?.callability !== 'callable'
    || !marketplaceRoot
    || !pluginRoot
    || !path.isAbsolute(pluginRoot)
  ) return null;

  const observed = observedSources[0];
  if (!path.isAbsolute(marketplaceRoot)) {
    const observedSource = optionalString(observed.marketplace_source);
    if (
      !observedSource
      || optionalString(observed.plugin_source_path) !== pluginRoot
      || optionalString(installedCarrier.source_ref) !== pluginRoot
    ) return null;
    try {
      const root = gitMarketplaceRuntimeRoot(
        fs.realpathSync.native(pluginRoot), marketplaceRoot, 'contracts/domain_descriptor.json',
      );
      return sameMarketplaceSource(observedSource, marketplaceRoot)
        || (root && path.isAbsolute(observedSource) && fs.realpathSync.native(observedSource) === root)
        ? root : null;
    } catch {
      return null;
    }
  }

  let normalizedMarketplace: string;
  let normalizedPlugin: string;
  try {
    normalizedMarketplace = fs.realpathSync.native(marketplaceRoot);
    normalizedPlugin = fs.realpathSync.native(pluginRoot);
  } catch {
    return null;
  }
  if (
    (normalizedPlugin !== normalizedMarketplace
      && !normalizedPlugin.startsWith(`${normalizedMarketplace}${path.sep}`))
    || optionalString(observed.marketplace_source) !== marketplaceRoot
    || optionalString(observed.plugin_source_path) !== pluginRoot
    || optionalString(installedCarrier.source_ref) !== pluginRoot
  ) return null;
  const descriptorPath = path.join(normalizedMarketplace, 'contracts', 'domain_descriptor.json');
  try {
    const descriptorStat = fs.lstatSync(descriptorPath);
    const descriptorRealPath = fs.realpathSync.native(descriptorPath);
    if (
      !descriptorStat.isFile()
      || descriptorStat.isSymbolicLink()
      || (descriptorRealPath !== normalizedMarketplace
        && !descriptorRealPath.startsWith(`${normalizedMarketplace}${path.sep}`))
    ) return null;
  } catch {
    return null;
  }
  return normalizedMarketplace;
}

function nativePackageClosure(packageId: string, packageStatus: any) {
  const configured = isRecord(packageStatus?.configured_carrier)
    ? packageStatus.configured_carrier
    : null;
  const carrier = isRecord(configured?.carrier) ? configured.carrier : null;
  const observedSources = Array.isArray(carrier?.observed_sources)
    ? carrier.observed_sources.filter(isRecord)
    : [];
  const installedCarrier = isRecord(packageStatus?.installed_carrier_readback)
    ? packageStatus.installed_carrier_readback
    : null;
  const rootDigest = sha256Digest(packageStatus?.installed_content_digest)
    ?? sha256Digest(packageStatus?.installed_manifest_sha256)
    ?? (observedSources.length === 1
      ? sha256Digest(observedSources[0]?.source_tree_sha256)
      : null);
  const packageVersion = optionalString(configured?.installed_version)
    ?? optionalString(installedCarrier?.version);
  if (!rootDigest || !packageVersion) return null;

  const providerPackages = [];
  for (const dependency of packageStatus?.package_dependency_readiness?.dependencies ?? []) {
    if (!isRecord(dependency)) continue;
    const dependencyId = optionalString(dependency.package_id);
    const dependencyVersion = optionalString(dependency.installed_version);
    const contentDigest = sha256Digest(dependency.content_digest);
    if (!dependencyId || !dependencyVersion || !contentDigest) {
      if (dependency.required === false) continue;
      return null;
    }
    providerPackages.push({
      package_id: dependencyId,
      package_version: dependencyVersion,
      owner_language_version: null,
      package_lock_ref: null,
      manifest_sha256: sha256Digest(dependency.manifest_sha256),
      content_digest: contentDigest,
      source_artifact_ref: null,
      artifact_digest: contentDigest,
    });
  }
  providerPackages.sort((left, right) => left.package_id.localeCompare(right.package_id));
  const rootPackage = {
    package_id: packageId,
    package_version: packageVersion,
    owner_language_version: null,
    package_lock_ref: null,
    manifest_sha256: sha256Digest(packageStatus?.installed_manifest_sha256),
    content_digest: rootDigest,
    source_artifact_ref: optionalString(installedCarrier?.source_ref),
    artifact_digest: rootDigest,
  };
  const closureIdentity = { root_package: rootPackage, provider_packages: providerPackages };
  return {
    surface_kind: 'opl_native_agent_package_closure.v1',
    version: 'opl-native-agent-package-closure.v1',
    ...closureIdentity,
    dependency_closure_digest: `sha256:${crypto.createHash('sha256')
      .update(canonicalJsonText(closureIdentity))
      .digest('hex')}`,
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  };
}

function nativePackageUseBinding(input: {
  closure: ReturnType<typeof nativePackageClosure>;
  scope: PackageScope | null;
  useBoundaryId?: string;
}) {
  if (!input.closure || !input.scope || !input.useBoundaryId) return null;
  const targetRoot = input.scope.scope === 'workspace'
    ? input.scope.targetWorkspace
    : input.scope.targetQuest;
  if (!targetRoot) return null;
  return {
    surface_kind: 'opl_agent_package_use_binding.v1' as const,
    binding_origin: 'installed_native_carrier' as const,
    scope: input.scope.scope,
    target_root: targetRoot,
    root_package: input.closure.root_package,
    provider_packages: input.closure.provider_packages,
    dependency_closure_digest: input.closure.dependency_closure_digest,
    core_skill_tree_digest: input.closure.core_skill_tree_digest,
    skill_tree_digest: input.closure.skill_tree_digest,
    use_boundary_id: input.useBoundaryId,
  };
}

function locatorString(locator: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = optionalString(locator[key]);
    if (value) return value;
  }
  const nested = locator.workspace_locator;
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? locatorString(nested as Record<string, unknown>, keys)
    : null;
}

function packageScope(locator: Record<string, unknown>): PackageScope | null {
  const explicitScope = optionalString(locator.scope);
  const questRoot = locatorString(locator, ['quest_root', 'quest_path', 'target_quest']);
  if (explicitScope === 'quest' || questRoot) {
    return questRoot ? { scope: 'quest', targetQuest: questRoot } : null;
  }
  const workspaceRoot = locatorString(locator, [
    'workspace_root',
    'repo_root',
    'workspace_path',
    'target_workspace',
  ]);
  return workspaceRoot ? { scope: 'workspace', targetWorkspace: workspaceRoot } : null;
}

/**
 * Resolve the source root for a launchable package from the installed native
 * carrier. Retired runtime-source state is never a launch fallback.
 */
export function packageRuntimeSourceCheckoutPath(packageReadiness: any): string | null {
  const installedCarrier = isRecord(packageReadiness?.installed_carrier_readback)
    ? packageReadiness.installed_carrier_readback
    : null;
  const configuredCarrier = isRecord(packageReadiness?.configured_carrier)
    ? packageReadiness.configured_carrier
    : null;
  const installedReady = packageReadiness?.installed_readiness;
  if (
    installedCarrier?.lifecycle_authority === 'carrier_owned'
    && installedReady?.installed === true
    && installedReady?.physical_status === 'available'
    && installedReady?.callability === 'callable'
  ) {
    const effectiveRuntimeCheckout = optionalString(
      packageReadiness?.effective_runtime_checkout_path,
    );
    if (effectiveRuntimeCheckout) return effectiveRuntimeCheckout;
    const localRuntimeCheckout = localCarrierRuntimeCheckout(packageReadiness);
    if (localRuntimeCheckout) return localRuntimeCheckout;
    const sourceRef = optionalString(installedCarrier.source_ref);
    if (sourceRef) return sourceRef;
  }
  if (
    configuredCarrier?.status === 'installed'
    && configuredCarrier?.executor?.status === 'callable'
  ) {
    return optionalString(configuredCarrier.plugin_source_path);
  }
  return null;
}

export function packageLaunchHardStopReason(packageStatus: any) {
  if ((packageStatus?.installed_package_count ?? 0) === 0) {
    return 'package_not_installed';
  }
  if (packageStatus?.launch_allowed === false) {
    return packageStatus?.launch_blocked_reason ?? 'package_not_operational';
  }
  const hardDependencyReasons = new Set([
    'dependency_lock_missing',
    'dependency_disabled',
    'package_id_mismatch',
    'required_exports_missing',
    'required_modules_missing',
  ]);
  for (const dependency of packageStatus?.package_dependency_readiness?.dependencies ?? []) {
    if (dependency?.required === false) continue;
    const reason = Array.isArray(dependency?.reasons)
      ? dependency.reasons.find((entry: unknown) => typeof entry === 'string' && hardDependencyReasons.has(entry))
      : null;
    if (reason) return reason;
  }
  return null;
}

export async function ensureFamilyRuntimePackageLaunchReady(input: {
  domainId: string;
  workspaceLocator: Record<string, unknown>;
  useBoundaryId?: string;
  pinnedUseBinding?: any;
}) {
  const pinnedUseBinding = input.pinnedUseBinding === null || input.pinnedUseBinding === undefined
    ? null
    : isRecord(input.pinnedUseBinding)
      ? input.pinnedUseBinding
      : (() => {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Pinned family runtime package-use binding must be an object.',
          );
        })();
  const agent = resolveStandardAgent(input.domainId);
  if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    return null;
  }

  const packageId = agent.agent_id;
  const scope = packageScope(input.workspaceLocator);
  const packageReadiness = requireAgentPackageReadinessPort();
  const packageStatus = packageReadiness.readStatus({
    packageId,
    ...scope,
  }).opl_agent_package_status;
  const hardStopReason = packageLaunchHardStopReason(packageStatus);
  if (hardStopReason) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Family runtime launch is blocked until the canonical agent package dependency closure and native carrier are ready.',
      {
        domain_id: input.domainId,
        package_id: packageId,
        launch_allowed: false,
        launch_blocked_reason: hardStopReason,
        allowed_when_blocked: packageStatus.allowed_when_blocked,
        package_dependency_readiness: packageStatus.package_dependency_readiness,
        repair_action: packageStatus.repair_action,
        failure_code: 'agent_package_operational_readiness_blocked',
      },
    );
  }
  const sourcePolicy = packageReadiness.readSourcePolicy?.(packageId) ?? null;
  const policyRuntimeCheckout = sourcePolicy?.desired_source_kind === 'developer_checkout_override'
    && sourcePolicy.developer_checkout_available === true
    ? optionalString(sourcePolicy.developer_checkout_path)
    : null;
  const fullRuntimeCheckoutResolution = sourcePolicy?.effective_install_update_source === 'full_runtime'
    ? packageReadiness.resolveStandardAgentContractCheckout?.(input.domainId) ?? null
    : null;
  if (
    sourcePolicy?.effective_install_update_source === 'full_runtime'
    && (
      fullRuntimeCheckoutResolution?.status !== 'resolved'
      || !optionalString(fullRuntimeCheckoutResolution.checkout?.checkout_path)
    )
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Full runtime launch requires the packaged Standard Agent module checkout.',
      {
        domain_id: input.domainId,
        package_id: packageId,
        source_policy: sourcePolicy,
        checkout_resolution: fullRuntimeCheckoutResolution,
        failure_code: 'full_runtime_module_checkout_unavailable',
      },
    );
  }
  const fullRuntimeCheckout = optionalString(fullRuntimeCheckoutResolution?.checkout?.checkout_path);
  const effectiveRuntimeCheckout = policyRuntimeCheckout
    ?? fullRuntimeCheckout
    ?? localCarrierRuntimeCheckout(packageStatus);
  const skillRefresh = await packageReadiness.refreshWorkspaceSkills?.({
    packageId,
    packageStatus: packageStatus.launch_allowed === false
      ? { ...packageStatus, launch_allowed: true, launch_blocked_reason: null }
      : packageStatus,
    targetWorkspace: scope?.scope === 'workspace' ? scope.targetWorkspace : null,
  }) ?? null;
  if (skillRefresh && !skillRefresh.projection) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Family runtime launch requires the installed Agent professional Skill closure.',
      {
        domain_id: input.domainId,
        package_id: packageId,
        workspace_skill_refresh: skillRefresh,
        failure_code: 'agent_package_workspace_skill_projection_unavailable',
      },
    );
  }
  const nativeClosure = nativePackageClosure(packageId, packageStatus);
  const effectiveNativePackageClosure = nativeClosure && skillRefresh?.projection
    ? {
        ...nativeClosure,
        core_skill_tree_digest: skillRefresh.projection.core_digest,
        skill_tree_digest: skillRefresh.projection.full_export_digest,
        skill_projection: skillRefresh.projection,
      }
    : nativeClosure;
  const nativeUseBinding = nativePackageUseBinding({
    closure: effectiveNativePackageClosure,
    scope,
    useBoundaryId: input.useBoundaryId,
  });
  const readbackUseBinding = isRecord(packageStatus.package_use_binding)
    ? packageStatus.package_use_binding
    : null;
  const effectiveUseBinding = pinnedUseBinding ?? readbackUseBinding ?? nativeUseBinding;
  if (packageStatus.launch_allowed === true) {
    return {
      ...packageStatus,
      effective_runtime_checkout_path: effectiveRuntimeCheckout,
      native_package_closure: effectiveNativePackageClosure,
      package_use_binding: effectiveUseBinding,
      package_quality_debt: null,
    };
  }

  return {
    ...packageStatus,
    effective_runtime_checkout_path: effectiveRuntimeCheckout,
    native_package_closure: effectiveNativePackageClosure,
    package_use_binding: effectiveUseBinding,
    package_quality_debt: packageStatus.launch_blocked_reason,
    progression_effect: 'stage_launch_allowed_with_package_quality_debt',
    quality_claims_closed: true,
  };
}
