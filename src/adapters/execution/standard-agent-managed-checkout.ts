import fs from 'node:fs';
import path from 'node:path';

import { readStandardAgentRuntimeOwner, sameStandardAgentRuntimeOwner } from '../../kernel/standard-agent-runtime-owner.ts';
import { requireAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { sameMarketplaceSource } from '../../kernel/marketplace-source-identity.ts';
import { gitMarketplaceRuntimeRoot, runtimeRootContainsDescriptor } from '../../kernel/git-marketplace-runtime-root.ts';
import { acceptedConfiguredCodexPluginIds } from '../../kernel/codex-plugin-selector.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import { loadFrameworkContracts } from '../../authority/contracts/index.ts';
import {
  ensureWorkspace,
  type WorkspaceSkillProjectionRefresher,
} from '../../authority/workspace/index.ts';
import { packageLaunchHardStopReason } from './family-runtime-package-readiness.ts';

type AgentPackageReadinessPort = ReturnType<typeof requireAgentPackageReadinessPort>;

function blocked(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'standard_agent_managed_checkout_not_launchable',
  });
}

function record(value: unknown, field: string) {
  if (!isRecord(value)) blocked(`Standard Agent native runtime requires ${field}.`, { field });
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    blocked(`Standard Agent native runtime requires ${field}.`, { field });
  }
  return value.trim();
}

function sha256Digest(value: unknown, field: string) {
  const digest = text(value, field).replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    blocked(`Standard Agent native runtime requires a sha256 ${field}.`, { field });
  }
  return `sha256:${digest}`;
}

function realDirectory(value: unknown, field: string) {
  const input = text(value, field);
  if (!path.isAbsolute(input)) {
    blocked('Standard Agent native carrier source path must be absolute.', { field, source_path: input });
  }
  try {
    const resolved = fs.realpathSync.native(input);
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
    return resolved;
  } catch (error) {
    blocked('Standard Agent native carrier source path cannot be resolved.', {
      field,
      source_path: input,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function pathsMatch(left: string, right: string) {
  try {
    return fs.realpathSync.native(left) === fs.realpathSync.native(right);
  } catch {
    return false;
  }
}

function pathWithin(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function marketplaceMatches(
  observed: string,
  declared: string,
  sourcePolicy?: Record<string, unknown> | null,
  installedCarrierKind?: string,
) {
  if (observed === declared) return true;
  if (path.isAbsolute(observed) && path.isAbsolute(declared)) return pathsMatch(observed, declared);
  if (sameMarketplaceSource(observed, declared)) return true;
  const policyMatches = sourcePolicy?.desired_source_kind === 'developer_checkout_override'
    && sourcePolicy.developer_checkout_available === true
    && typeof sourcePolicy.developer_checkout_path === 'string'
    && path.isAbsolute(observed)
    && pathsMatch(observed, sourcePolicy.developer_checkout_path);
  return policyMatches || (installedCarrierKind === 'local' && path.isAbsolute(observed));
}

function installedVersionMatchesPackage(installedVersion: string, packageVersion: string) {
  if (installedVersion === packageVersion) return true;
  const prefix = `${packageVersion}-`;
  return installedVersion.startsWith(prefix)
    && /^[a-f0-9]{64}$/.test(installedVersion.slice(prefix.length));
}

function nativeRuntimeFromStatus(
  packageStatus: any,
  packageId: string,
  sourcePolicy?: Record<string, unknown> | null,
) {
  const launchBlockedReason = packageLaunchHardStopReason(packageStatus);
  if (launchBlockedReason) {
    blocked('Standard Agent action launch requires an installed and callable native carrier.', {
      package_id: packageId,
      launch_allowed: packageStatus?.launch_allowed ?? false,
      launch_blocked_reason: launchBlockedReason,
      configured_carrier: packageStatus?.configured_carrier ?? null,
      installed_readiness: packageStatus?.installed_readiness ?? null,
      repair_action: packageStatus?.repair_action ?? null,
    });
  }
  const configured = record(packageStatus?.configured_carrier, 'configured_carrier');
  const carrier = record(configured.carrier, 'configured_carrier.carrier');
  const executor = record(configured.executor, 'configured_carrier.executor');
  const installedCarrier = record(packageStatus?.installed_carrier_readback, 'installed_carrier_readback');
  const installedReadiness = record(packageStatus?.installed_readiness, 'installed_readiness');
  const installedCarrierKind = text(installedCarrier.kind, 'installed_carrier_readback.kind');
  const pluginSourcePath = realDirectory(configured.plugin_source_path, 'configured_carrier.plugin_source_path');
  const descriptor = readStandardAgentRuntimeOwner(pluginSourcePath, packageId);
  const pluginSelector = text(carrier.plugin_id, 'configured_carrier.carrier.plugin_id');
  const marketplaceSource = text(
    carrier.marketplace_source,
    'configured_carrier.carrier.marketplace_source',
  );
  const installedVersion = text(configured.installed_version, 'configured_carrier.installed_version');
  const observedSources = Array.isArray(carrier.observed_sources) ? carrier.observed_sources : [];
  const enabledSources = observedSources.filter((source) => isRecord(source) && source.enabled === true);
  const observed = enabledSources.length === 1
    ? record(enabledSources[0], 'configured_carrier.carrier.observed_sources[selected]')
    : blocked('Standard Agent native carrier requires one exact observed source.', {
        package_id: packageId,
        observed_source_count: observedSources.length,
      });
  const observedPluginId = text(observed.plugin_id, 'configured_carrier.carrier.observed_sources[selected].plugin_id');
  const acceptedPluginIds = acceptedConfiguredCodexPluginIds(packageId, descriptor.plugin_selector);
  const sourceTreeSha256 = sha256Digest(
    observed.source_tree_sha256,
    'configured_carrier.carrier.observed_sources[0].source_tree_sha256',
  );
  const observedSourcePath = realDirectory(
    observed.plugin_source_path,
    'configured_carrier.carrier.observed_sources[0].plugin_source_path',
  );
  const observedMarketplaceSource = text(
    observed.marketplace_source,
    'configured_carrier.carrier.observed_sources[0].marketplace_source',
  );
  if (
    configured.surface_kind !== 'opl_configured_codex_plugin_carrier_readback.v1'
    || configured.package_id !== packageId
    || configured.status !== 'installed'
    || configured.enabled !== true
    || executor.route !== 'codex_cli'
    || executor.status !== 'callable'
    || carrier.kind !== 'codex_plugin_manager'
    || carrier.precedence !== 'exact_single_source'
    || pluginSelector !== descriptor.plugin_selector
    || !marketplaceMatches(
      marketplaceSource,
      descriptor.marketplace_source,
      sourcePolicy,
      installedCarrierKind,
    )
    || !installedVersionMatchesPackage(installedVersion, descriptor.package_version)
    || !pathsMatch(observedSourcePath, pluginSourcePath)
    || !acceptedPluginIds.has(observedPluginId)
    || observed.installed_version !== installedVersion
    || observed.enabled !== true
    || !marketplaceMatches(
      observedMarketplaceSource,
      marketplaceSource,
      sourcePolicy,
      installedCarrierKind,
    )
    || configured.publication_ref !== descriptor.publication_ref
    || installedCarrier.lifecycle_authority !== 'carrier_owned'
    || installedCarrier.identity !== observedPluginId
    || installedCarrier.version !== installedVersion
    || installedCarrier.enabled !== true
    || !pathsMatch(text(installedCarrier.source_ref, 'installed_carrier_readback.source_ref'), pluginSourcePath)
    || installedReadiness.installed !== true
    || installedReadiness.physical_status !== 'available'
    || installedReadiness.callability !== 'callable'
    || (packageStatus?.installed_package_count ?? 0) < 1
    || packageStatus?.launch_allowed !== true
  ) {
    blocked('Standard Agent installed descriptor and configured native carrier identities disagree.', {
      package_id: packageId,
      descriptor,
      configured_carrier: configured,
      installed_carrier_readback: installedCarrier,
      installed_readiness: installedReadiness,
    });
  }
  const policyRuntimeCheckout = sourcePolicy?.desired_source_kind === 'developer_checkout_override'
    && sourcePolicy.developer_checkout_available === true
    && typeof sourcePolicy.developer_checkout_path === 'string'
    ? realDirectory(sourcePolicy.developer_checkout_path, 'source_policy.developer_checkout_path')
    : null;
  const localCarrierMarketplace = installedCarrierKind === 'local'
    && path.isAbsolute(observedMarketplaceSource)
    ? realDirectory(observedMarketplaceSource, 'configured_carrier.carrier.observed_sources[0].marketplace_source')
    : null;
  const gitCarrierMarketplace = gitMarketplaceRuntimeRoot(
    pluginSourcePath,
    observedMarketplaceSource,
    descriptor.domain_descriptor_ref,
  );
  const runtimeCheckoutRoot = [
    policyRuntimeCheckout,
    localCarrierMarketplace,
    gitCarrierMarketplace,
    pluginSourcePath,
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) => runtimeRootContainsDescriptor(candidate, descriptor.domain_descriptor_ref));
  if (!runtimeCheckoutRoot) {
    blocked('Standard Agent native carrier does not expose a complete runtime checkout.', {
      package_id: packageId,
      domain_descriptor_ref: descriptor.domain_descriptor_ref,
      runtime_checkout_candidates: [
        policyRuntimeCheckout,
        localCarrierMarketplace,
        gitCarrierMarketplace,
        pluginSourcePath,
      ]
        .filter((candidate): candidate is string => Boolean(candidate)),
    });
  }
  const policyProvidesSeparateRuntime = policyRuntimeCheckout !== null
    && pathsMatch(runtimeCheckoutRoot, policyRuntimeCheckout);
  if (policyProvidesSeparateRuntime && !pathWithin(runtimeCheckoutRoot, pluginSourcePath)) {
    const runtimeDescriptor = readStandardAgentRuntimeOwner(runtimeCheckoutRoot, packageId);
    if (
      !sameStandardAgentRuntimeOwner(runtimeDescriptor, descriptor)
    ) {
      blocked('Standard Agent runtime checkout and installed carrier owner identities disagree.', {
        package_id: packageId,
        runtime_descriptor: runtimeDescriptor,
        carrier_descriptor: descriptor,
      });
    }
  } else if (!pathWithin(runtimeCheckoutRoot, pluginSourcePath)) {
    blocked('Standard Agent native carrier plugin root is outside its runtime checkout.', {
      package_id: packageId,
      runtime_checkout_root: runtimeCheckoutRoot,
      carrier_plugin_source_path: pluginSourcePath,
    });
  }
  return {
    ...descriptor,
    plugin_selector: observedPluginId,
    carrier_installed_version: installedVersion,
    carrier_plugin_source_path: pluginSourcePath,
    plugin_source_path: runtimeCheckoutRoot,
    source_tree_sha256: sourceTreeSha256,
  };
}

export async function resolveStandardAgentManagedCheckout(input: {
  domainId: string;
  workspaceRoot: string;
  preserveWorkspaceForAuthorityEvaluation?: boolean;
  useBoundaryId?: string;
  packageReadiness?: AgentPackageReadinessPort;
  refreshWorkspaceSkills?: WorkspaceSkillProjectionRefresher;
  workspaceEnsurer?: (input: {
    agentId: string;
    workspacePath: string;
  }) => ReturnType<typeof ensureWorkspace>;
}) {
  const agent = resolveStandardAgent(input.domainId);
  if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    throw new FrameworkContractError('domain_not_found', 'agents run requires one registered Standard OPL Agent.', {
      domain_id: input.domainId,
    });
  }
  if (!path.isAbsolute(input.workspaceRoot)) {
    throw new FrameworkContractError('cli_usage_error', 'agents run requires an absolute workspace root.', {
      workspace_root: input.workspaceRoot,
    });
  }
  const requestedWorkspaceRoot = path.resolve(input.workspaceRoot);
  const packageReadiness = input.packageReadiness ?? requireAgentPackageReadinessPort();
  const packageId = agent.agent_id;
  const scope = { scope: 'workspace' as const, targetWorkspace: requestedWorkspaceRoot };
  const packageStatus = packageReadiness.readStatus({ packageId, ...scope }).opl_agent_package_status;
  const sourcePolicy = packageReadiness.readSourcePolicy?.(packageId) ?? null;
  const nativeRuntime = nativeRuntimeFromStatus(packageStatus, packageId, sourcePolicy);

  const workspaceEnsure = input.preserveWorkspaceForAuthorityEvaluation
    ? ensureWorkspace(loadFrameworkContracts(), {
        agentId: agent.agent_id,
        workspacePath: requestedWorkspaceRoot,
        dryRun: true,
        packageReadiness,
        refreshWorkspaceSkills: input.refreshWorkspaceSkills ?? (() => ({
          status: 'not_applicable',
          dry_run: true,
          writes_performed: false,
        })),
      })
    : input.workspaceEnsurer
      ? input.workspaceEnsurer({ agentId: agent.agent_id, workspacePath: requestedWorkspaceRoot })
      : ensureWorkspace(loadFrameworkContracts(), {
          agentId: agent.agent_id,
          workspacePath: requestedWorkspaceRoot,
          packageReadiness,
          refreshWorkspaceSkills: input.refreshWorkspaceSkills ?? (() => {
            throw new FrameworkContractError(
              'contract_shape_invalid',
              'Managed Standard Agent workspace requires the composed Connect Skill refresher.',
              { failure_code: 'cordis_connect_workspace_skill_refresher_required' },
            );
          }),
        });
  const workspaceRoot = fs.realpathSync.native(workspaceEnsure.workspace_initialization.workspace_path);

  const result = {
    agent,
    package_id: packageId,
    workspace_root: workspaceRoot,
    workspace_initialization: workspaceEnsure.workspace_initialization,
    checkout_root: nativeRuntime.plugin_source_path,
    package_status: packageStatus,
    package_use_binding: null,
    use_boundary_id: null,
    runtime_source_kind: 'installed_native_carrier' as const,
    native_runtime: nativeRuntime,
  };
  return result;
}
