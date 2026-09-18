import { deriveAgentPackageLaunchState } from '../../../kernel/agent-package-launch-state.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { refsOnlyAuthorityBoundary } from '../../../kernel/refs-only-authority-boundary.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { compare } from 'semver';
import path from 'node:path';
import fs from 'node:fs';
import { gitMarketplaceRuntimeRoot, runtimeRootContainsDescriptor } from '../../../kernel/git-marketplace-runtime-root.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { isFirstPartyPackage } from '../agent-package-first-party.ts';
import { githubMarketplaceSourceIdentity, sameMarketplaceSource } from './shared.ts';
import { listAgentPackageSettingsActions } from '../agent-package-actions.ts';
import {
  discoverAvailablePackageDescriptors,
  discoverCurrentOwnerPackageDescriptors,
  discoverInstalledPackageDescriptors,
  installedDescriptorHasExpectedCodexExposure,
  installedDescriptorMatchesConfiguredCarrier,
  installedDescriptorSupportsFrameworkCalls,
  isProjectLocalCapabilityPackage,
  projectLocalCapabilityDependencyReadiness,
  type InstalledPackageDescriptor,
} from './installed-codex-plugin-directory.ts';
import { mergedHomeShortcutPreferences } from './home-shortcuts.ts';
import {
  sourceTreeSha256,
  type ConfiguredCodexPluginCarrierAction,
  type ConfiguredCodexPluginCarrierReadback,
} from './configured-codex-plugin-carrier.ts';
import { managedPolicyCurrentnessFromDescriptor } from './managed-policy-surface.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './source-policy.ts';
import { inspectOplModule } from '../system-installation/modules.ts';
import type { AgentPackageInstallInput } from './types.ts';

export type OplAgentPackageStatusInput = {
  packageId?: string | null;
  detail?: 'fast' | 'full';
};

export type PackageSnapshot = {
  descriptors: Map<string, InstalledPackageDescriptor>;
  installed: Map<string, InstalledPackageDescriptor>;
};

export function packageSnapshot(input: { includeAvailable?: boolean } = {}): PackageSnapshot {
  const discoveredInstalled = discoverInstalledPackageDescriptors();
  const installed = new Map(
    [...discoveredInstalled].filter(([, descriptor]) => (
      installedDescriptorMatchesConfiguredCarrier(descriptor)
      && descriptor.carrier_readback.kind !== 'project_local_owner_projection'
    )),
  );
  const descriptors = input.includeAvailable
    ? discoverAvailablePackageDescriptors()
    : new Map<string, InstalledPackageDescriptor>();
  for (const [packageId, descriptor] of discoveredInstalled) descriptors.set(packageId, descriptor);
  return {
    descriptors,
    installed,
  };
}

export function packageBackgroundUpdatePolicy(descriptor: InstalledPackageDescriptor) {
  const declaredSource = descriptor.carrier.carrier.marketplaceSource;
  const marketplaceId = descriptor.pluginId.split('@')[1];
  const managedPayloadSource = marketplaceId && descriptor.marketplaceSource && declaredSource
    && githubMarketplaceSourceIdentity(declaredSource)
    && path.resolve(descriptor.marketplaceSource) === path.join(
      resolveOplStatePaths().state_dir, 'codex-plugin-marketplaces', marketplaceId,
    );
  const reason = !descriptor.readiness.installed
    ? 'package_not_installed'
    : !isFirstPartyPackage(descriptor.manifest.package_id)
      ? 'external_package_explicit_update_only'
      : !declaredSource || !githubMarketplaceSourceIdentity(declaredSource)
        || (!managedPayloadSource && !sameMarketplaceSource(descriptor.marketplaceSource, declaredSource))
        ? 'local_or_user_managed_source'
        : !descriptor.enabled && descriptor.manifest.codex_interaction_mode !== 'headless_internal'
          ? 'user_disabled_package'
          : descriptor.readiness.physical_status !== 'available'
            || (descriptor.readiness.projection_callability ?? descriptor.readiness.callability) !== 'callable'
            ? 'native_carrier_attention_required'
            : null;
  return { eligible: reason === null, reason };
}

export function requirePackageId(value: string | null | undefined, action: string) {
  const packageId = canonicalAgentPackageId(value);
  if (!packageId) {
    throw new FrameworkContractError('cli_usage_error', `${action} requires a Package id.`, {
      action,
      failure_code: 'agent_package_id_required',
    });
  }
  return packageId;
}

export function requireDescriptor(
  input: Pick<AgentPackageInstallInput, 'packageId'>,
  action: string,
  options: { installed?: boolean } = {},
) {
  const packageId = requirePackageId(input.packageId, action);
  const snapshot = packageSnapshot({ includeAvailable: options.installed !== true });
  const descriptor = (options.installed ? snapshot.installed : snapshot.descriptors).get(packageId) ?? null;
  if (!descriptor) {
    throw new FrameworkContractError('contract_shape_invalid', `Package ${packageId} is not exposed by a native carrier.`, {
      package_id: packageId,
      action,
      failure_code: options.installed
        ? 'agent_package_not_installed'
        : 'agent_package_native_descriptor_unavailable',
    });
  }
  return descriptor;
}

export function selectPackageMutationDescriptor(
  installed: InstalledPackageDescriptor,
  ownerProjection: InstalledPackageDescriptor | null,
) {
  if (!ownerProjection) return installed;
  return compare(ownerProjection.manifest.version, installed.manifest.version) >= 0
    ? ownerProjection
    : installed;
}

export function requirePackageMutationDescriptor(
  input: Pick<AgentPackageInstallInput, 'packageId'>,
  action: 'update' | 'repair',
) {
  const installed = requireDescriptor(input, action, { installed: true });
  const ownerProjection = discoverCurrentOwnerPackageDescriptors({
    packageId: installed.manifest.package_id,
  }).get(installed.manifest.package_id) ?? null;
  return selectPackageMutationDescriptor(installed, ownerProjection);
}

export function configuredCarrierFromDescriptor(
  descriptor: InstalledPackageDescriptor,
  operation: ConfiguredCodexPluginCarrierAction = 'list',
): ConfiguredCodexPluginCarrierReadback {
  const carrierRequiredSkillIds = descriptor.carrier.executor.requiredSkillIds;
  const expectedCarrier = descriptor.carrier.carrier;
  const exactCarrier = installedDescriptorMatchesConfiguredCarrier(descriptor);
  const installed = descriptor.readiness.installed && exactCarrier;
  const physical = descriptor.readiness.physical_status === 'available';
  const callable = installed
    && physical
    && installedDescriptorSupportsFrameworkCalls(descriptor)
    && installedDescriptorHasExpectedCodexExposure(descriptor);
  const observedBase = descriptor.pluginId.split('@', 1)[0];
  const expectedBase = expectedCarrier.pluginId.split('@', 1)[0];
  return {
    surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
    package_id: descriptor.manifest.package_id,
    carrier: {
      kind: 'codex_plugin_manager',
      plugin_id: expectedCarrier.pluginId,
      marketplace_source: expectedCarrier.marketplaceSource,
      observed_sources: [{
        plugin_id: descriptor.pluginId,
        marketplace_source: descriptor.marketplaceSource,
        installed_version: installed ? descriptor.carrier_readback.version : null,
        enabled: installed && descriptor.enabled,
        plugin_source_path: descriptor.sourcePath,
        source_tree_sha256: sourceTreeSha256(descriptor.sourcePath),
      }],
      precedence: installed
        ? 'exact_single_source'
        : descriptor.readiness.installed && observedBase === expectedBase
          ? 'unexpected_same_plugin_name'
          : 'not_present',
    },
    executor: {
      route: 'codex_cli',
      required_skill_ids: [...carrierRequiredSkillIds],
      status: callable ? 'callable' : 'attention_needed',
    },
    publication_ref: descriptor.carrier.publicationRef,
    status: installed ? (physical ? 'installed' : 'physical_unavailable') : 'not_installed',
    installed_version: installed ? descriptor.carrier_readback.version : null,
    enabled: installed ? descriptor.enabled : null,
    plugin_source_path: installed ? descriptor.sourcePath : null,
    operation,
    native_command: installed
      ? ['plugin', 'list', '--json']
      : ['plugin', 'list', '--available', '--json'],
    native_action_dispatched: operation === 'list',
    reason: callable
      ? null
      : !exactCarrier
        ? 'configured_native_carrier_unexpected_source_present'
        : !installed
          ? 'configured_native_carrier_not_installed'
        : !physical
          ? 'configured_native_carrier_physical_unavailable'
          : descriptor.manifest.codex_interaction_mode === 'headless_internal'
            ? 'configured_native_carrier_headless_exposure_enabled'
            : 'configured_native_carrier_disabled',
  };
}

function dependencyReadiness(
  descriptor: InstalledPackageDescriptor | null,
  installed: ReadonlyMap<string, InstalledPackageDescriptor>,
  ownerDescriptors: ReadonlyMap<string, InstalledPackageDescriptor>,
) {
  if (!descriptor) return null;
  const dependencies = descriptor.manifest.capability_dependencies.map((dependency) => {
    const candidate = installed.get(dependency.package_id) ?? null;
    const owner = ownerDescriptors.get(dependency.package_id) ?? null;
    const projectLocal = owner
      ? projectLocalCapabilityDependencyReadiness(owner, dependency)
      : null;
    const projectLocalCompatibilityReasons = projectLocal?.reasons.filter(
      (reason) => reason !== 'package_source_unavailable',
    ) ?? [];
    const nativePresent = candidate?.readiness.installed === true;
    const present = nativePresent || Boolean(projectLocal && projectLocal.status !== 'missing');
    const nativeCallable = nativePresent
      && candidate?.readiness.physical_status === 'available'
      && (candidate.readiness.callability === 'callable'
        || candidate.readiness.projection_callability === 'callable');
    const nativeProjectLocalFallback = Boolean(
      projectLocal
      && projectLocalCompatibilityReasons.length === 0
      && projectLocal.reasons.includes('package_source_unavailable')
      && nativeCallable,
    );
    const callable = projectLocal
      ? projectLocal.status === 'current' || nativeProjectLocalFallback
      : nativeCallable;
    const reasons = projectLocal
      ? callable ? [] : projectLocal.reasons
      : !present
        ? ['package_missing']
        : callable
          ? []
          : [candidate?.readiness.physical_status !== 'available'
              ? 'package_source_unavailable'
              : 'package_disabled'];
    return {
      package_id: dependency.package_id,
      required: dependency.required,
      consumer_profile_id: dependency.consumer_profile_id ?? null,
      required_export_ids: [...dependency.required_export_ids],
      required_module_ids: [...dependency.required_module_ids],
      installed_version: candidate?.manifest.version ?? owner?.manifest.version ?? null,
      manifest_sha256: candidate?.manifest_sha256 ?? owner?.manifest_sha256 ?? null,
      content_digest: candidate?.manifest.content_digest ?? owner?.manifest.content_digest ?? null,
      status: !present ? 'missing' as const : callable ? 'current' as const : 'incompatible' as const,
      reasons,
      missing_required_export_ids: projectLocal?.missingRequiredExportIds ?? [],
      missing_required_module_ids: projectLocal?.missingRequiredModuleIds ?? [],
    };
  });
  const required = dependencies.filter((dependency) => dependency.required);
  const operational = required.every((dependency) => dependency.status === 'current');
  return {
    status: operational ? 'current' as const : required.some((dependency) => dependency.status === 'missing')
      ? 'missing' as const
      : 'incompatible' as const,
    operational_ready: operational,
    dependencies,
  };
}

function presentationText(value: Record<string, string> | null | undefined, fallback: string) {
  return value?.['en-US'] ?? value?.zh ?? Object.values(value ?? {})[0] ?? fallback;
}

type AgentPackageSettingsAction = ReturnType<typeof listAgentPackageSettingsActions>[number];

function projectDirectoryAction(action: AgentPackageSettingsAction, packageId: string) {
  // Update and preferences are configure/install catalog entries whose directory semantics are more specific.
  const semantic = action.action_id === 'agent_package_update'
    ? 'update' as const
    : action.action_id === 'agent_package_preferences_set'
      ? 'preferences' as const
      : action.task_kind;
  return {
    action_id: action.action_id,
    action_ref: `app_state.actions#${action.action_id}`,
    payload: { package_id: packageId },
    required_payload_fields: action.action_id === 'agent_package_preferences_set'
      ? ['package_id', 'exposure_action or shortcut_id']
      : ['package_id'],
    confirmation_required: action.confirmation_required,
    semantic,
    surface: 'settings' as const,
  };
}

function actionEntries(
  installed: boolean,
  packageId: string,
  interactionMode: InstalledPackageDescriptor['manifest']['codex_interaction_mode'],
) {
  return listAgentPackageSettingsActions()
    .filter((action) => action.action_id !== 'install_from_manifest_url')
    .filter((action) => (
      interactionMode !== 'headless_internal'
      || action.action_id !== 'agent_package_preferences_set'
    ))
    .filter((action) => installed
      ? action.action_id !== 'agent_package_install'
      : action.action_id === 'agent_package_install')
    .map((action) => projectDirectoryAction(action, packageId));
}

export function hostedRuntimeReadiness(descriptor: InstalledPackageDescriptor | null) {
  const catalogRefs = descriptor?.manifest.package_role === 'standard_agent'
    ? descriptor.manifest.entrypoints.filter((entry) => entry.entrypoint_kind === 'opl_hosted_action_catalog')
      .map((entry) => typeof entry.source_ref === 'string' ? entry.source_ref : '')
    : [];
  if (!descriptor || catalogRefs.length === 0) {
    return { status: 'not_declared' as const, ready: true, source_root: null, reason: null };
  }
  const policy = resolveAgentPackageEffectiveSourcePolicy(descriptor.manifest.package_id);
  const explicitDeveloper = policy.desired_source_kind === 'developer_checkout_override'
    && policy.configured_by !== 'native_git_checkout';
  let candidates: Array<string | null>;
  if (explicitDeveloper) {
    candidates = [policy.developer_checkout_available ? policy.developer_checkout_path : null];
  } else if (policy.effective_install_update_source === 'full_runtime' && policy.module_id) {
    const selected = inspectOplModule(policy.module_id, { profile: 'fast' });
    candidates = [selected.installed && selected.health_status !== 'invalid_checkout' ? selected.checkout_path : null];
  } else {
    let sourcePath = descriptor.sourcePath;
    try { sourcePath = fs.realpathSync(sourcePath); } catch { /* Missing files remain unavailable below. */ }
    const declaredMarketplace = descriptor.carrier.carrier.marketplaceSource ?? '';
    const localMarketplace = path.isAbsolute(declaredMarketplace)
      && descriptor.marketplaceSource === declaredMarketplace
      && sourcePath.startsWith(`${declaredMarketplace}${path.sep}`) ? declaredMarketplace : null;
    candidates = [localMarketplace, gitMarketplaceRuntimeRoot(sourcePath,
      declaredMarketplace, 'contracts/domain_descriptor.json'), sourcePath];
  }
  const root = candidates.map((candidate) => {
    try { return candidate ? fs.realpathSync(candidate) : null; } catch { return null; }
  }).find((candidate) => candidate && ['contracts/domain_descriptor.json', ...catalogRefs]
    .every((ref) => ref.length > 0 && runtimeRootContainsDescriptor(candidate, ref))) ?? null;
  const ready = root !== null;
  return { status: ready ? 'available' as const : 'unavailable' as const,
    ready, source_root: ready ? root : null,
    reason: ready ? null : 'hosted_agent_source_unavailable' };
}

function directoryEntry(descriptor: InstalledPackageDescriptor) {
  const manifest = descriptor.manifest;
  const installed = descriptor.readiness.installed
    && installedDescriptorMatchesConfiguredCarrier(descriptor);
  const hosted = hostedRuntimeReadiness(descriptor);
  const ready = installed && hosted.ready
    && installedDescriptorSupportsFrameworkCalls(descriptor)
    && installedDescriptorHasExpectedCodexExposure(descriptor);
  const codexVisible = installed
    && descriptor.enabled
    && manifest.codex_interaction_mode !== 'headless_internal';
  const actions = actionEntries(installed, manifest.package_id, manifest.codex_interaction_mode);
  const recommendedAction = installed ? (ready ? null : 'agent_package_repair') : 'agent_package_install';
  return {
    package_id: manifest.package_id,
    display_name: manifest.display_name,
    publisher: manifest.publisher,
    description: presentationText(manifest.presentation?.description_i18n, manifest.display_name),
    tags: [],
    package_role: manifest.package_role,
    capability_metadata: installed
      ? {
          source: manifest.source,
          required_skill_ids: [...descriptor.carrier.executor.requiredSkillIds],
          optional_skill_refs: [...manifest.optional_skill_refs],
        }
      : null,
    display_name_i18n: manifest.presentation?.display_name_i18n ?? null,
    description_i18n: manifest.presentation?.description_i18n ?? null,
    session_routing_summary_i18n: manifest.presentation?.session_routing_summary_i18n ?? null,
    home_shortcuts: manifest.presentation?.home_shortcuts ?? [],
    home_shortcut_ids: manifest.presentation?.home_shortcuts.map((shortcut) => shortcut.shortcut_id) ?? [],
    app_contributions: manifest.app_contributions ?? null,
    capability_dependency_summary: {
      total_count: manifest.capability_dependencies.length,
      required_count: manifest.capability_dependencies.filter((dependency) => dependency.required).length,
    },
    configured_carrier: configuredCarrierFromDescriptor(descriptor),
    installed_carrier_readback: installed ? descriptor.carrier_readback : null,
    installed_readiness: installed ? descriptor.readiness : null,
    role_state: {
      status: 'current' as const,
      source: 'native_carrier_descriptor' as const,
      discovered_role: manifest.package_role,
      installed_role: installed ? manifest.package_role : null,
      diagnostic: null,
    },
    installed,
    activated: ready,
    codex_visible: codexVisible,
    installability: {
      status: installed ? 'installed' as const : 'installable' as const,
      installable: !installed,
    },
    hosted_runtime_readiness: hosted,
    readiness: {
      status: !installed ? 'not_installed' as const : ready ? 'ready' as const : 'attention_needed' as const,
      operational_ready: ready,
      launch_allowed: ready,
      verification_deferred: false,
      reason: ready ? null : !installed ? 'package_not_installed' : hosted.reason ?? 'native_carrier_not_callable',
      detail_surface: `opl packages status --package-id ${manifest.package_id} --json`,
      status_read_error: null,
    },
    recommended_action: recommendedAction,
    recommended_action_ref: recommendedAction
      ? actions.find((action) => action.action_id === recommendedAction) ?? null
      : null,
    available_actions: actions,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function directoryFrom(snapshot: PackageSnapshot, detail: 'fast' | 'full') {
  const entries = [...snapshot.descriptors.values()]
    .filter((descriptor) => !isProjectLocalCapabilityPackage(descriptor.manifest))
    .map(directoryEntry)
    .sort((left, right) => left.display_name.localeCompare(right.display_name, 'en'));
  return {
    surface_kind: 'opl_agent_package_directory.v1' as const,
    status: 'available' as const,
    source_catalog_kind: 'native_carrier_descriptors' as const,
    detail,
    entry_count: entries.length,
    installed_package_count: entries.filter((entry) => entry.installed).length,
    installable_package_count: entries.filter((entry) => entry.installability.installable).length,
    entries,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function buildPackageStatus(input: OplAgentPackageStatusInput, snapshot: PackageSnapshot) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const descriptor = packageId ? snapshot.descriptors.get(packageId) ?? null : null;
  const installedDescriptor = packageId ? snapshot.installed.get(packageId) ?? null : null;
  const configuredCarrier = descriptor ? configuredCarrierFromDescriptor(descriptor) : null;
  const installedEntries = [...snapshot.installed.values()];
  const installed = packageId
    ? installedDescriptor?.readiness.installed === true
    : installedEntries.length > 0;
  const physical = packageId
    ? installedDescriptor?.readiness.physical_status === 'available'
    : installedEntries.length > 0 && installedEntries.every(
      (entry) => entry.readiness.physical_status === 'available',
    );
  const callable = packageId
    ? physical && Boolean(
        installedDescriptor
        && installedDescriptorSupportsFrameworkCalls(installedDescriptor)
        && installedDescriptorHasExpectedCodexExposure(installedDescriptor)
      )
    : physical && installedEntries.every((entry) => (
        installedDescriptorSupportsFrameworkCalls(entry)
        && installedDescriptorHasExpectedCodexExposure(entry)
      ));
  const dependencies = dependencyReadiness(
    installedDescriptor,
    snapshot.installed,
    discoverCurrentOwnerPackageDescriptors(),
  );
  const dependenciesReady = packageId ? dependencies?.operational_ready !== false : true;
  const managedPolicyCurrentness = installedDescriptor
    ? managedPolicyCurrentnessFromDescriptor({
        manifest: {
          package_id: installedDescriptor.manifest.package_id,
          version: installedDescriptor.manifest.version,
          plugin_id: installedDescriptor.pluginId.split('@', 1)[0] ?? null,
          required_skill_ids: installedDescriptor.manifest.required_skill_ids,
          managed_policy_surface: installedDescriptor.manifest.managed_policy_surface,
        },
        sourceRoot: installedDescriptor.sourcePath,
        activeCarrierIdentity: installedDescriptor.carrier_readback.identity,
        detail: input.detail === 'fast' ? 'fast' : 'full',
      })
    : {
        surface_kind: 'opl_package_managed_policy_currentness' as const,
        status: 'not_requested' as const,
        policy_kind: null,
        policy_path: null,
        schema_path: null,
        expected_policy_sha256: null,
        actual_policy_sha256: null,
        inventory_digest: null,
        enabled_migration_ids: [],
        detected_conflicts: [],
        dependency_sync: null,
        required_dependencies_operational: true,
        required_dependency_failure_ids: [],
        model_projection: null,
        capability_strategy: null,
        repair_command: null,
        reason: 'Package does not expose an installed managed policy descriptor.',
      };
  const requiredPolicyDependenciesOperational = managedPolicyCurrentness.required_dependencies_operational !== false;
  const managedPolicyOperational = (
    managedPolicyCurrentness.status === 'current'
      || managedPolicyCurrentness.status === 'not_requested'
      || managedPolicyCurrentness.status === 'drifted'
  ) && requiredPolicyDependenciesOperational;
  const hosted = hostedRuntimeReadiness(installedDescriptor);
  const hostedReady = packageId ? hosted.ready : installedEntries.every((entry) => hostedRuntimeReadiness(entry).ready);
  const operationalReady = Boolean(
    installed && callable && dependenciesReady && managedPolicyOperational && hostedReady,
  );
  const launchBlockedReason = operationalReady
    ? null
    : packageId
        ? !descriptor
          ? 'native_carrier_descriptor_unavailable'
        : !installed
          ? configuredCarrier?.reason ?? 'package_not_installed'
          : !physical
            ? 'carrier_source_unavailable'
            : !callable
              ? 'carrier_disabled'
              : !hostedReady
                ? 'hosted_agent_source_unavailable'
              : !requiredPolicyDependenciesOperational
                ? 'managed_policy_required_dependency_unavailable'
              : !managedPolicyOperational
                ? `managed_policy_${managedPolicyCurrentness.status}`
              : `package_dependency_${dependencies?.status ?? 'unavailable'}`
      : 'package_not_installed';
  const unavailableReason = !requiredPolicyDependenciesOperational
    ? 'managed_policy_required_dependency_unavailable'
    : managedPolicyCurrentness.status === 'invalid'
      ? 'managed_policy_invalid'
      : null;
  const degradedReason = unavailableReason
    ? null
    : managedPolicyCurrentness.experience_baseline?.status === 'degraded'
      ? 'experience_baseline_degraded'
      : managedPolicyCurrentness.status === 'drifted'
        ? 'managed_policy_drifted'
        : null;
  const launchState = deriveAgentPackageLaunchState({
    installed,
    exposure_state: installed
      ? installedDescriptor?.enabled && installedDescriptor.manifest.codex_interaction_mode !== 'headless_internal'
        ? 'visible'
        : 'hidden'
      : 'not_installed',
    operational_ready: operationalReady,
    launch_blocked_reason: launchBlockedReason,
    degraded_reason: degradedReason,
    unavailable_reason: unavailableReason,
  });
  const homeShortcutPreferences = mergedHomeShortcutPreferences({
    entries: descriptor
      ? [directoryEntry(descriptor)]
      : [...snapshot.descriptors.values()].map(directoryEntry),
  }).filter((entry) => !packageId || entry.package_id === packageId);
  return {
    version: 'g2' as const,
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status' as const,
      status: operationalReady ? 'available' : installed ? 'attention_needed' : 'not_installed',
      package_id: packageId ?? null,
      agent_id: installedDescriptor?.manifest.agent_id ?? descriptor?.manifest.agent_id ?? null,
      app_contributions: installedDescriptor?.manifest.app_contributions ?? null,
      installed_package_count: packageId ? (installed ? 1 : 0) : snapshot.installed.size,
      configured_carrier: configuredCarrier,
      installed_carrier_readback: installedDescriptor?.carrier_readback ?? null,
      installed_readiness: installedDescriptor?.readiness ?? descriptor?.readiness ?? null,
      installed_manifest_sha256: installedDescriptor?.manifest_sha256 ?? null,
      installed_content_digest: installedDescriptor?.manifest.content_digest ?? null,
      hosted_runtime_readiness: hosted,
      managed_policy_currentness: managedPolicyCurrentness,
      codex_visible: packageId
        ? Boolean(
            installed
            && installedDescriptor?.enabled
            && installedDescriptor.manifest.codex_interaction_mode !== 'headless_internal',
          )
        : installedEntries.some((entry) => (
            entry.enabled && entry.manifest.codex_interaction_mode !== 'headless_internal'
          )),
      package_dependency_readiness: dependencies,
      package_operational: {
        status: operationalReady ? 'operational' as const : 'unavailable' as const,
        operational_ready: operationalReady,
        failure_reason: launchBlockedReason,
        repair_command: operationalReady
          ? null
          : !managedPolicyOperational
            ? managedPolicyCurrentness.repair_command
            : !hostedReady && packageId ? `opl packages install ${packageId} --json`
            : descriptor ? `codex plugin add ${descriptor.carrier.carrier.pluginId}` : null,
      },
      experience_baseline: managedPolicyCurrentness.experience_baseline ?? {
        status: 'not_declared' as const,
        failure_ids: [],
        repair_command: null,
        capabilities: [],
      },
      specialized_capabilities: managedPolicyCurrentness.specialized_capabilities ?? {
        status: 'not_declared' as const,
        repair_command: null,
        capabilities: [],
      },
      model_projection: managedPolicyCurrentness.model_projection,
      capability_strategy: managedPolicyCurrentness.capability_strategy,
      operational_ready: operationalReady,
      operational_ready_scope: installedDescriptor?.manifest.managed_policy_surface
        ? 'installed_carrier_presence_callability_dependency_closure_and_managed_policy' as const
        : 'installed_carrier_presence_callability_dependency_closure' as const,
      launch_allowed: operationalReady,
      launch_blocked_reason: launchBlockedReason,
      ...launchState,
      allowed_when_blocked: ['status', 'repair'],
      repair_action: !managedPolicyOperational
        ? managedPolicyCurrentness.repair_command
        : !hostedReady && packageId ? `opl packages install ${packageId} --json`
            : descriptor ? `codex plugin add ${descriptor.carrier.carrier.pluginId}` : null,
      home_shortcut_preferences: homeShortcutPreferences,
      files: {
        home_shortcut_preferences_file: resolveOplStatePaths().agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function createOplAgentPackageStatusReader() {
  const snapshot = packageSnapshot();
  return (input: OplAgentPackageStatusInput = {}) => buildPackageStatus(input, snapshot);
}

export function runOplAgentPackageStatus(input: OplAgentPackageStatusInput = {}) {
  return buildPackageStatus(input, packageSnapshot());
}

export function listOplAgentPackages(input: { detail?: 'fast' | 'full' } = {}) {
  const snapshot = packageSnapshot({ includeAvailable: true });
  const directory = directoryFrom(snapshot, input.detail ?? 'fast');
  const homeShortcutPreferences = mergedHomeShortcutPreferences(directory);
  return {
    version: 'g2' as const,
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback' as const,
      status: 'available' as const,
      directory,
      installed_package_count: directory.installed_package_count,
      home_shortcut_preferences: homeShortcutPreferences,
      files: {
        home_shortcut_preferences_file: resolveOplStatePaths().agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}
