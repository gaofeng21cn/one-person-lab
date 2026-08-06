import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { requireAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
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
 * Resolve the source root for a launchable package without consulting retired
 * lifecycle state. A selected native carrier is authoritative; compatibility
 * runtime source is considered only when no native carrier is present.
 */
export function packageRuntimeSourceCheckoutPath(packageReadiness: any): string | null {
  const installedCarrier = isRecord(packageReadiness?.installed_carrier_readback)
    ? packageReadiness.installed_carrier_readback
    : null;
  const configuredCarrier = isRecord(packageReadiness?.configured_carrier)
    ? packageReadiness.configured_carrier
    : null;
  const nativeCarrierSelected = installedCarrier !== null || configuredCarrier !== null;
  if (nativeCarrierSelected) {
    const installedReady = packageReadiness?.installed_readiness;
    if (
      installedCarrier?.lifecycle_authority === 'carrier_owned'
      && installedReady?.installed === true
      && installedReady?.physical_status === 'available'
      && installedReady?.callability === 'callable'
    ) {
      const sourceRef = optionalString(installedCarrier.source_ref);
      if (sourceRef) return sourceRef;
    }
    if (
      configuredCarrier?.status === 'installed'
      && configuredCarrier?.executor?.status === 'callable'
    ) {
      const sourcePath = optionalString(configuredCarrier.plugin_source_path);
      if (sourcePath) return sourcePath;
    }
    return null;
  }
  const runtimeSource = isRecord(packageReadiness?.runtime_source_readiness)
    ? packageReadiness.runtime_source_readiness
    : null;
  return runtimeSource?.status === 'current'
    && runtimeSource?.operational_ready === true
    ? optionalString(runtimeSource.checkout_path)
    : null;
}

export function packageLaunchHardStopReason(packageStatus: any) {
  if ((packageStatus?.installed_package_count ?? 0) === 0) {
    return 'package_not_installed';
  }
  const runtimeSource = packageStatus?.runtime_source_readiness;
  if (runtimeSource && runtimeSource.operational_ready !== true) {
    return runtimeSource.reason ?? `runtime_source_${runtimeSource.status ?? 'unavailable'}`;
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
  const readbackUseBinding = isRecord(packageStatus.package_use_binding)
    ? packageStatus.package_use_binding
    : null;
  const effectiveUseBinding = pinnedUseBinding ?? readbackUseBinding;
  if (packageStatus.launch_allowed === true) {
    return {
      ...packageStatus,
      package_use_binding: effectiveUseBinding,
      package_quality_debt: null,
    };
  }

  const hardStopReason = packageLaunchHardStopReason(packageStatus);
  if (!hardStopReason) {
    return {
      ...packageStatus,
      package_use_binding: effectiveUseBinding,
      package_quality_debt: packageStatus.launch_blocked_reason,
      progression_effect: 'stage_launch_allowed_with_package_quality_debt',
      quality_claims_closed: true,
    };
  }

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
