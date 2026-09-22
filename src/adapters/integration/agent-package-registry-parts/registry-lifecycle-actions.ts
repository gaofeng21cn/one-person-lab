import fs from 'node:fs';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { refsOnlyAuthorityBoundary } from '../../../kernel/refs-only-authority-boundary.ts';
import { isFirstPartyPackage } from '../agent-package-first-party.ts';
import { materializeStandardAgentFrameworkLink } from '../standard-agent-framework-link.ts';
import {
  runConfiguredCodexPluginCarrier,
  type ConfiguredCodexPluginCarrierAction,
} from './configured-codex-plugin-carrier.ts';
import {
  repairManagedPolicyDependenciesFromDescriptor,
} from './managed-policy-surface.ts';
import {
  updateHomeShortcutPreferences,
  withHomeShortcutPreferenceTransaction,
} from './home-shortcuts.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import {
  packageSnapshot,
  packageBackgroundUpdatePolicy,
  isManagedPayloadCarrier,
  requireDescriptor,
  requirePackageMutationDescriptor,
} from './registry-status-projection.ts';
import {
  projectLocalCapabilityDependencyReadiness,
} from './installed-codex-plugin-directory.ts';
import { sha256Text } from './shared.ts';
import type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
} from './types.ts';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function assertManualManifestUrl(value: string | null | undefined) {
  const source = stringValue(value);
  if (!source) {
    throw new FrameworkContractError('cli_usage_error', 'Manual Agent installation requires a manifest URL.', {
      action_id: 'install_from_manifest_url',
      required: ['manifest_url'],
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new FrameworkContractError('cli_usage_error', 'Agent manifest URL is invalid.', {
      action_id: 'install_from_manifest_url',
      manifest_url: source,
    });
  }
  const loopbackHttp = parsed.protocol === 'http:'
    && ['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'file:' && !loopbackHttp) {
    throw new FrameworkContractError('cli_usage_error', 'Agent manifest URL must use HTTPS, file, or loopback HTTP.', {
      action_id: 'install_from_manifest_url',
      manifest_url: source,
      allowed_protocols: ['https', 'file', 'loopback_http'],
    });
  }
  return parsed;
}

async function readManualAgentManifest(input: AgentPackageInstallInput) {
  const source = assertManualManifestUrl(input.manifestUrl);
  if (input.trustTier !== 'third_party_unverified' && input.trustTier !== 'third_party_verified') {
    throw new FrameworkContractError('cli_usage_error', 'Manual Agent installation requires an explicit third-party trust tier.', {
      action_id: 'install_from_manifest_url',
      required: ['trust_tier'],
      allowed_trust_tiers: ['third_party_unverified', 'third_party_verified'],
    });
  }
  let raw: string;
  if (source.protocol === 'file:') {
    raw = fs.readFileSync(source, 'utf8');
  } else {
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new FrameworkContractError('codex_command_failed', 'Agent manifest fetch failed.', {
        manifest_url: source.toString(),
        status: response.status,
      });
    }
    raw = await response.text();
  }
  let manifest;
  try {
    manifest = normalizePackageManifest(parseJsonText(raw), source.toString());
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    throw new FrameworkContractError('contract_json_invalid', 'Agent manifest must be valid JSON.', {
      manifest_url: source.toString(),
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (manifest.package_role !== 'standard_agent' && manifest.package_role !== 'workflow_profile') {
    throw new FrameworkContractError('contract_shape_invalid', 'The Add Agent flow accepts Agent or workflow Packages only.', {
      manifest_url: source.toString(),
      package_id: manifest.package_id,
      package_role: manifest.package_role,
      allowed_package_roles: ['standard_agent', 'workflow_profile'],
    });
  }
  if (isFirstPartyPackage(manifest.package_id)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Manual manifests cannot claim an OPL-managed Package identity.', {
      manifest_url: source.toString(),
      package_id: manifest.package_id,
      failure_code: 'manual_manifest_first_party_identity_forbidden',
    });
  }
  if (!manifest.configured_codex_plugin_carrier) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent manifest must declare a configured Codex Plugin carrier.', {
      manifest_url: source.toString(),
      package_id: manifest.package_id,
      failure_code: 'manual_manifest_native_carrier_missing',
    });
  }
  return { manifest, source: source.toString(), raw };
}

function nativeLifecycleResult(
  action: ConfiguredCodexPluginCarrierAction,
  input: AgentPackageInstallInput,
  descriptorOverride?: Awaited<ReturnType<typeof requireDescriptor>>,
) {
  const descriptor = descriptorOverride ?? requireDescriptor(input, action, { installed: action !== 'install' });
  const configuredCarrier = runConfiguredCodexPluginCarrier({
    descriptor: descriptor.carrier,
    action,
    dryRun: input.dryRun,
    installedPayloadCarrier: isManagedPayloadCarrier(descriptor),
  });
  if (!input.dryRun && ['install', 'update', 'repair'].includes(action)
    && (configuredCarrier.status !== 'installed' || configuredCarrier.executor.status !== 'callable')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package update did not produce a callable native installation.', {
      package_id: descriptor.manifest.package_id,
      action,
      failure_code: 'agent_package_native_post_update_readback_failed',
      carrier_status: configuredCarrier.status,
      executor_status: configuredCarrier.executor.status,
      reason: configuredCarrier.reason,
    });
  }
  const status = input.dryRun
    ? 'validated_no_write'
    : action === 'remove'
      ? 'uninstalled'
      : action === 'repair'
        ? 'repaired'
        : action === 'update'
          ? 'updated'
          : 'installed';
  return {
    status,
    dry_run: input.dryRun === true,
    package_id: descriptor.manifest.package_id,
    configured_carrier: configuredCarrier,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function requiredDependencyInstallResults(
  descriptor: Awaited<ReturnType<typeof requireDescriptor>>,
  input: AgentPackageInstallInput,
  completed = new Set<string>(),
  visiting = new Set<string>(),
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  for (const dependency of descriptor.manifest.capability_dependencies) {
    if (!dependency.required || completed.has(dependency.package_id)) continue;
    if (visiting.has(dependency.package_id)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Required Package dependency closure contains a cycle.',
        {
          package_id: descriptor.manifest.package_id,
          dependency_package_id: dependency.package_id,
          failure_code: 'agent_package_required_dependency_cycle',
        },
      );
    }
    const snapshot = packageSnapshot({ includeAvailable: true });
    const installed = snapshot.installed.get(dependency.package_id) ?? null;
    const ready = installed?.readiness.installed === true
      && installed.readiness.physical_status === 'available'
      && (installed.readiness.callability === 'callable'
        || installed.readiness.projection_callability === 'callable');
    if (ready) {
      completed.add(dependency.package_id);
      continue;
    }
    const dependencyDescriptor = snapshot.descriptors.get(dependency.package_id) ?? null;
    if (!dependencyDescriptor) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Required Package dependency is not installable from the current owner projections.',
        {
          package_id: descriptor.manifest.package_id,
          dependency_package_id: dependency.package_id,
          failure_code: 'agent_package_required_dependency_unavailable',
        },
      );
    }
    const projectLocalReadiness = projectLocalCapabilityDependencyReadiness(
      dependencyDescriptor,
      dependency,
    );
    if (projectLocalReadiness) {
      const compatibilityReasons = projectLocalReadiness.reasons.filter(
        (reason) => reason !== 'package_source_unavailable',
      );
      if (compatibilityReasons.length > 0) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Required project-local capability source is not ready.',
          {
            package_id: descriptor.manifest.package_id,
            dependency_package_id: dependency.package_id,
            dependency_module_id: dependency.module_id,
            source_root: projectLocalReadiness.sourceRoot,
            missing_required_export_ids: projectLocalReadiness.missingRequiredExportIds,
            missing_required_module_ids: projectLocalReadiness.missingRequiredModuleIds,
            reasons: projectLocalReadiness.reasons,
            failure_code: 'agent_package_required_project_local_capability_unavailable',
          },
        );
      }
      if (projectLocalReadiness.status === 'current') {
        results.push({
          status: input.dryRun ? 'validated_no_write' : 'project_local_ready',
          dry_run: input.dryRun === true,
          package_id: dependency.package_id,
          materialization_scope: ['workspace', 'quest'],
          source_root: projectLocalReadiness.sourceRoot,
          native_carrier_action: 'not_dispatched',
          authority_boundary: refsOnlyAuthorityBoundary(),
        });
        completed.add(dependency.package_id);
        visiting.delete(dependency.package_id);
        continue;
      }
    }
    visiting.add(dependency.package_id);
    results.push(...requiredDependencyInstallResults(
      dependencyDescriptor,
      { ...input, packageId: dependency.package_id, manifestUrl: null },
      completed,
      visiting,
    ));
    results.push(nativeLifecycleResult(
      'install',
      { ...input, packageId: dependency.package_id, manifestUrl: null },
      dependencyDescriptor,
    ));
    visiting.delete(dependency.package_id);
    completed.add(dependency.package_id);
  }
  return results;
}

export async function runOplAgentPackageInstall(input: AgentPackageInstallInput) {
  if (input.manifestUrl) {
    const selected = await readManualAgentManifest(input);
    const result = nativeLifecycleResult('install', input, {
      manifest: selected.manifest,
      manifestPath: selected.source,
      manifest_sha256: sha256Text(selected.raw),
      sourcePath: selected.source,
      pluginId: selected.manifest.configured_codex_plugin_carrier!.carrier.pluginId,
      marketplaceSource: selected.manifest.configured_codex_plugin_carrier!.carrier.marketplaceSource,
      enabled: false,
      carrier: selected.manifest.configured_codex_plugin_carrier!,
      carrier_readback: {
        kind: 'codex_plugin_manager',
        identity: selected.manifest.configured_codex_plugin_carrier!.carrier.pluginId,
        source_ref: selected.source,
        version: selected.manifest.version,
        enabled: false,
        lifecycle_authority: 'carrier_owned',
      },
      readiness: {
        installed: false,
        physical_status: 'unavailable',
        callability: 'disabled',
      },
    });
    return {
      version: 'g2' as const,
      opl_agent_package_install: {
        surface_kind: 'opl_agent_package_install' as const,
        ...result,
        manifest_url: selected.source,
        trust_tier: input.trustTier,
      },
    };
  }
  const descriptor = requireDescriptor(input, 'install');
  const dependencyResults = requiredDependencyInstallResults(descriptor, input);
  return {
    version: 'g2' as const,
    opl_agent_package_install: {
      surface_kind: 'opl_agent_package_install' as const,
      ...nativeLifecycleResult('install', input, descriptor),
      required_dependency_install_results: dependencyResults,
    },
  };
}

export async function runOplAgentPackageUpdate(input: AgentPackageInstallInput) {
  const descriptor = requirePackageMutationDescriptor(input, 'update');
  return {
    version: 'g2' as const,
    opl_agent_package_update: {
      surface_kind: 'opl_agent_package_update' as const,
      ...nativeLifecycleResult('update', input, descriptor),
    },
  };
}

type OplAgentPackageBulkUpdateInput = {
  action?: 'update' | 'repair';
  dryRun?: boolean;
  background?: boolean;
};

export async function runOplAgentPackageBulkUpdate(
  input: OplAgentPackageBulkUpdateInput = {},
) {
  const action = input.action ?? 'update';
  const installed = packageSnapshot().installed;
  const descriptors = [...installed.values()]
    .sort((left, right) => left.manifest.package_id.localeCompare(right.manifest.package_id));
  const targets: Record<string, unknown>[] = [];
  for (const descriptor of descriptors) {
    const packageId = descriptor.manifest.package_id;
    const policy = packageBackgroundUpdatePolicy(descriptor);
    if (input.background && !policy.eligible) {
      targets.push({ target_type: 'package', target_id: packageId, status: 'skipped', reason: policy.reason, action });
      continue;
    }
    try {
      const result = input.background
        ? nativeLifecycleResult(action, { packageId, dryRun: input.dryRun }, descriptor)
        : action === 'repair'
        ? await runOplAgentPackageRepair({ packageId, dryRun: input.dryRun })
        : await runOplAgentPackageUpdate({ packageId, dryRun: input.dryRun });
      targets.push({
        target_type: 'package',
        target_id: packageId,
        status: input.dryRun ? 'validated' : 'completed',
        reason: input.dryRun
          ? `native_carrier_owner_${action}_validated`
          : `native_carrier_owner_${action === 'repair' ? 'repaired' : 'updated'}`,
        action,
        result,
      });
    } catch (error) {
      targets.push({
        target_type: 'package',
        target_id: packageId,
        status: 'failed',
        reason: `native_carrier_owner_${action}_failed`,
        action,
        result: null,
        error: error instanceof FrameworkContractError
          ? error.toJSON()
          : { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return {
    surface_kind: 'opl_agent_package_bulk_update' as const,
    action,
    source: 'installed_owner_descriptor_and_native_carrier' as const,
    targets,
  };
}

export async function runOplAgentPackageRepair(input: AgentPackageRepairInput) {
  const mutationDescriptor = requirePackageMutationDescriptor(input, 'repair');
  const nativeRepair = nativeLifecycleResult('repair', input, mutationDescriptor);
  const descriptor = requireDescriptor(input, 'repair', { installed: true });
  const managedPolicyRepair = descriptor.manifest.managed_policy_surface
    ? repairManagedPolicyDependenciesFromDescriptor({
        manifest: {
          package_id: descriptor.manifest.package_id,
          version: descriptor.manifest.version,
          plugin_id: descriptor.pluginId.split('@', 1)[0] ?? null,
          required_skill_ids: descriptor.manifest.required_skill_ids,
          managed_policy_surface: descriptor.manifest.managed_policy_surface,
        },
        sourceRoot: descriptor.sourcePath,
        activeCarrierIdentity: descriptor.carrier_readback.identity,
        dryRun: input.dryRun,
      })
    : null;
  return {
    version: 'g2' as const,
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair' as const,
      ...nativeRepair,
      managed_policy_repair: managedPolicyRepair,
    },
  };
}

export async function runOplAgentPackageUninstall(input: AgentPackagePackageActionInput) {
  return {
    version: 'g2' as const,
    opl_agent_package_uninstall: {
      surface_kind: 'opl_agent_package_uninstall' as const,
      ...nativeLifecycleResult('remove', input),
    },
  };
}

export async function runOplAgentPackageExposureAction(
  action: 'hide' | 'unhide' | 'enable' | 'disable',
  input: AgentPackagePackageActionInput,
) {
  const descriptor = requireDescriptor(input, action, { installed: true });
  if (action === 'enable' || action === 'disable') {
    const configuredCarrier = runConfiguredCodexPluginCarrier({
      descriptor: descriptor.carrier,
      action,
      dryRun: input.dryRun,
    });
    return {
      version: 'g2' as const,
      opl_agent_package_exposure: {
        surface_kind: 'opl_agent_package_exposure' as const,
        status: input.dryRun ? 'validated_no_write' : action === 'enable' ? 'enabled' : 'disabled',
        action,
        dry_run: input.dryRun === true,
        package_id: descriptor.manifest.package_id,
        configured_carrier: configuredCarrier,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  const shortcutIds = descriptor.manifest.presentation?.home_shortcuts
    .filter((shortcut) => shortcut.user_configurable)
    .map((shortcut) => shortcut.shortcut_id) ?? [];
  if (shortcutIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package has no configurable Home shortcuts.', {
      package_id: descriptor.manifest.package_id,
      action,
      failure_code: 'agent_package_home_shortcut_not_configurable',
    });
  }
  return withHomeShortcutPreferenceTransaction(input.dryRun === true, () => ({
    version: 'g2' as const,
    opl_agent_package_exposure: {
      surface_kind: 'opl_agent_package_exposure' as const,
      status: input.dryRun ? 'validated_no_write' : action === 'hide' ? 'hidden' : 'visible',
      action,
      dry_run: input.dryRun === true,
      package_id: descriptor.manifest.package_id,
      home_shortcut_preferences: updateHomeShortcutPreferences({
        packageId: descriptor.manifest.package_id,
        shortcutIds,
        visible: action === 'unhide',
        dryRun: input.dryRun === true,
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  }));
}

export async function runOplAgentPackageHomeShortcutPreferencesSet(
  input: AgentPackageHomeShortcutPreferencesSetInput,
) {
  const descriptor = requireDescriptor(input, 'preferences', { installed: true });
  const shortcut = descriptor.manifest.presentation?.home_shortcuts
    .find((entry) => entry.shortcut_id === input.shortcutId && entry.user_configurable) ?? null;
  if (!shortcut) {
    throw new FrameworkContractError('contract_shape_invalid', 'Home shortcut preference is not owner-configurable.', {
      package_id: descriptor.manifest.package_id,
      shortcut_id: input.shortcutId,
      failure_code: 'agent_package_home_shortcut_not_configurable',
    });
  }
  return withHomeShortcutPreferenceTransaction(input.dryRun === true, () => ({
    version: 'g2' as const,
    opl_agent_package_home_shortcut_preferences: {
      surface_kind: 'opl_agent_package_home_shortcut_preferences_set' as const,
      status: input.dryRun ? 'validated_no_write' : 'updated',
      dry_run: input.dryRun === true,
      package_id: descriptor.manifest.package_id,
      shortcut_id: input.shortcutId,
      visible: input.visible,
      sort_order: input.sortOrder,
      home_shortcut_preferences: typeof input.visible !== 'boolean'
        ? []
        : updateHomeShortcutPreferences({
            packageId: descriptor.manifest.package_id,
            shortcutIds: [input.shortcutId],
            visible: input.visible,
            dryRun: input.dryRun === true,
          }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  }));
}

export async function runOplAgentPackageFrameworkLink(input: {
  agentRoot: string;
  dryRun?: boolean;
  checkOnly?: boolean;
}) {
  return {
    version: 'g2' as const,
    opl_agent_package_framework_link: materializeStandardAgentFrameworkLink(input),
  };
}
