import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { requireAgentPackageReadinessPort } from '../../kernel/agent-package-readiness-port.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { sameMarketplaceSource } from '../../kernel/marketplace-source-identity.ts';
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

const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PLUGIN_SELECTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/;

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

function runtimeRootContainsDescriptor(root: string, descriptorRef: string) {
  const descriptorPath = path.resolve(root, descriptorRef);
  if (!pathWithin(root, descriptorPath)) return false;
  try {
    const stat = fs.lstatSync(descriptorPath);
    return stat.isFile()
      && !stat.isSymbolicLink()
      && pathWithin(root, fs.realpathSync.native(descriptorPath));
  } catch {
    return false;
  }
}

function gitMarketplaceRuntimeRoot(
  pluginSourcePath: string,
  marketplaceSource: string,
  descriptorRef: string,
) {
  let candidate = path.dirname(pluginSourcePath);
  while (candidate !== path.dirname(candidate)) {
    const markerPath = path.join(candidate, '.codex-marketplace-install.json');
    try {
      const stat = fs.lstatSync(markerPath);
      const marker = parseJsonText(fs.readFileSync(markerPath, 'utf8'));
      if (!stat.isFile() || stat.isSymbolicLink() || !isRecord(marker)) return null;
      const source = typeof marker.source === 'string' ? marker.source.trim() : '';
      return source
        && sameMarketplaceSource(source, marketplaceSource)
        && runtimeRootContainsDescriptor(candidate, descriptorRef)
        ? candidate
        : null;
    } catch {
      candidate = path.dirname(candidate);
    }
  }
  return null;
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

function ownerDescriptor(sourceRoot: string, packageId: string) {
  const manifestPath = path.join(sourceRoot, 'opl-package.json');
  let bytes: Buffer;
  let manifest: Record<string, unknown>;
  try {
    const stat = fs.lstatSync(manifestPath);
    const realPath = fs.realpathSync.native(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || !realPath.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new Error('descriptor is not one physical file inside the native carrier source root');
    }
    bytes = fs.readFileSync(realPath);
    const parsed = parseJsonText(bytes.toString('utf8'));
    if (!isRecord(parsed)) throw new Error('descriptor root is not an object');
    manifest = parsed;
  } catch (error) {
    blocked('Standard Agent native carrier owner descriptor is missing, unsafe, or invalid.', {
      package_id: packageId,
      owner_manifest_path: manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const version = text(manifest!.version, 'opl-package.json#/version');
  const agentId = text(manifest!.agent_id, 'opl-package.json#/agent_id');
  if (
    manifest!.surface_kind !== 'opl_agent_package_manifest.v1'
    || text(manifest!.package_id, 'opl-package.json#/package_id') !== packageId
    || agentId !== packageId
    || !SEMVER_PATTERN.test(version)
  ) {
    blocked('Standard Agent native carrier owner descriptor identity is invalid.', {
      package_id: packageId,
      owner_manifest_path: manifestPath,
      descriptor_package_id: manifest!.package_id ?? null,
      descriptor_agent_id: manifest!.agent_id ?? null,
      descriptor_version: manifest!.version ?? null,
    });
  }
  const codexSurface = record(manifest!.codex_surface, 'opl-package.json#/codex_surface');
  const carrier = record(
    codexSurface.configured_codex_plugin_carrier,
    'opl-package.json#/codex_surface/configured_codex_plugin_carrier',
  );
  const pluginSelector = text(carrier.plugin_selector, 'configured_codex_plugin_carrier.plugin_selector');
  const marketplaceSource = text(
    carrier.marketplace_source,
    'configured_codex_plugin_carrier.marketplace_source',
  );
  const pluginName = pluginSelector.split('@', 1)[0];
  const declaredPluginName = text(codexSurface.plugin_id, 'codex_surface.plugin_id');
  const declaredSourcePath = codexSurface.plugin_source_path === undefined
    ? sourceRoot
    : path.resolve(sourceRoot, text(codexSurface.plugin_source_path, 'codex_surface.plugin_source_path'));
  if (
    carrier.kind !== 'codex_plugin_manager'
    || carrier.executor_route !== 'codex_cli'
    || !PLUGIN_SELECTOR_PATTERN.test(pluginSelector)
    || pluginName !== declaredPluginName
    || !pathsMatch(declaredSourcePath, sourceRoot)
  ) {
    blocked('Standard Agent owner descriptor does not declare one repo-root configured native carrier.', {
      package_id: packageId,
      plugin_selector: pluginSelector,
      plugin_id: declaredPluginName,
      declared_source_path: declaredSourcePath,
      native_source_path: sourceRoot,
    });
  }
  return {
    manifest_path: fs.realpathSync.native(manifestPath),
    manifest_sha256: `sha256:${crypto.createHash('sha256').update(bytes!).digest('hex')}`,
    package_version: version,
    plugin_selector: pluginSelector,
    marketplace_source: marketplaceSource,
    publication_ref: carrier.publication_ref === null || carrier.publication_ref === undefined
      ? null
      : text(carrier.publication_ref, 'configured_codex_plugin_carrier.publication_ref'),
    domain_descriptor_ref: text(
      manifest!.domain_descriptor_ref,
      'opl-package.json#/domain_descriptor_ref',
    ),
  };
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
  const descriptor = ownerDescriptor(pluginSourcePath, packageId);
  const pluginSelector = text(carrier.plugin_id, 'configured_carrier.carrier.plugin_id');
  const marketplaceSource = text(
    carrier.marketplace_source,
    'configured_carrier.carrier.marketplace_source',
  );
  const installedVersion = text(configured.installed_version, 'configured_carrier.installed_version');
  const observedSources = Array.isArray(carrier.observed_sources) ? carrier.observed_sources : [];
  const observed = observedSources.length === 1
    ? record(observedSources[0], 'configured_carrier.carrier.observed_sources[0]')
    : blocked('Standard Agent native carrier requires one exact observed source.', {
        package_id: packageId,
        observed_source_count: observedSources.length,
      });
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
    || observed.plugin_id !== pluginSelector
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
    || installedCarrier.identity !== pluginSelector
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
    const runtimeDescriptor = ownerDescriptor(runtimeCheckoutRoot, packageId);
    if (
      runtimeDescriptor.package_version !== descriptor.package_version
      || runtimeDescriptor.plugin_selector !== descriptor.plugin_selector
      || runtimeDescriptor.marketplace_source !== descriptor.marketplace_source
      || runtimeDescriptor.publication_ref !== descriptor.publication_ref
      || runtimeDescriptor.domain_descriptor_ref !== descriptor.domain_descriptor_ref
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
    carrier_installed_version: installedVersion,
    carrier_plugin_source_path: pluginSourcePath,
    plugin_source_path: runtimeCheckoutRoot,
    source_tree_sha256: sourceTreeSha256,
  };
}

export async function resolveStandardAgentManagedCheckout(input: {
  domainId: string;
  workspaceRoot: string;
  preserveWorkspaceForQualificationProvisioning?: boolean;
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

  const workspaceEnsure = input.preserveWorkspaceForQualificationProvisioning
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
