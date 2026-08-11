import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compare, valid } from 'semver';

import { deriveAgentPackageLaunchState } from '../../kernel/agent-package-launch-state.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue } from '../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { resolveStandardAgent } from '../../kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import {
  assertFirstPartyPackageCatalogVersion,
  resolveFirstPartyPackageCatalog,
} from './agent-package-first-party.ts';
import { materializeStandardAgentFrameworkLink } from './standard-agent-framework-link.ts';
import {
  assertManifestMatchesRegistrySelection,
  assertTrustTierAssigned,
  resolveManifestSelection,
} from './agent-package-registry-parts/selection.ts';
import {
  mergedHomeShortcutPreferences,
  readHomeShortcutPreferenceFile,
  updateHomeShortcutPreferences,
  withHomeShortcutPreferenceTransaction,
  writeHomeShortcutPreferenceFile,
} from './agent-package-registry-parts/home-shortcuts.ts';
import { normalizePackageManifest } from './agent-package-registry-parts/manifest-normalizers.ts';
import {
  descriptorDependencyReadiness,
  validateCapabilityProvider,
} from './agent-package-registry-parts/dependency-closure.ts';
import {
  catalogManifestPayload,
  selectManagedCatalogPackageVersion,
  type ManagedCatalogVersion,
  type ManagedPackageCatalog,
} from './agent-package-registry-parts/capability-reconciliation.ts';
import {
  managedPolicyCurrentnessFromDescriptor,
  repairManagedPolicyDependenciesFromDescriptor,
} from './agent-package-registry-parts/managed-policy-surface.ts';
import { migrateLegacyOplDocInstall } from './agent-package-registry-parts/legacy-opl-doc-install-migration.ts';
import {
  buildAgentPackageDirectory,
  firstPartyConfiguredCarrierDescriptors,
} from './agent-package-registry-parts/directory.ts';
import { readBundledFullRuntimePackageCatalog } from './agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import {
  discoverInstalledCodexPluginDescriptors,
  discoverInstalledOwnerProfileDescriptors,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
import {
  createMemoizedCodexPluginListRunner,
  githubMarketplaceSourceIdentity,
  runConfiguredCodexPluginCarrier,
  type ConfiguredCodexPluginCarrierAction,
  type ConfiguredCodexPluginCarrierReadback,
} from './agent-package-registry-parts/configured-codex-plugin-carrier.ts';
import {
  refreshFirstPartyPackageCatalogSnapshot,
  resolveFirstPartyPackageCatalogSnapshot,
} from './agent-package-registry-parts/first-party-release-catalog.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './agent-package-registry-parts/source-policy.ts';
import { refreshInstalledAgentPackageWorkspaceSkills } from './agent-package-registry-parts/skill-projection.ts';
import {
  developerCheckoutConfiguredCarrierTarget,
  loadDeveloperCheckoutPackageSource,
} from './agent-package-registry-parts/developer-checkout-package-source.ts';
import {
  assertFirstPartyPackageUpdateSelection,
  ownerPackageCatalogVersion,
} from './agent-package-registry-parts/update-reconciliation.ts';
import {
  fetchJsonSource,
  nowIso,
  refsOnlyAuthorityBoundary,
  resolveCodexHome,
  sha256Text,
} from './agent-package-registry-parts/shared.ts';
import type {
  AgentPackageConfiguredCodexPluginCarrierDescriptor,
  AgentPackageHomeShortcutPreferenceFile,
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageStoredHomeShortcutPreference,
  AgentPackageInstallInput,
  AgentPackageLifecycleAction,
  AgentPackageDependencyReadiness,
  AgentPackageManifestValidateInput,
  AgentPackageManifest,
  AgentPackageManagedPolicyDependency,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
} from './agent-package-registry-parts/types.ts';

export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageManifestValidateInput,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
} from './agent-package-registry-parts/types.ts';

function packageActionStatus(action: AgentPackageLifecycleAction) {
  return {
    install: 'installed',
    update: 'updated',
    repair: 'repaired',
    activate: 'activated',
    uninstall: 'uninstalled',
    hide: 'hidden',
    unhide: 'visible',
    enable: 'enabled',
    disable: 'disabled',
  }[action];
}

function legacyOplDocMigrationForFlow(input: AgentPackageManifestValidateInput & { dryRun?: boolean }) {
  if (canonicalAgentPackageId(input.packageId) !== 'opl-flow') return null;
  const migration = migrateLegacyOplDocInstall({ dryRun: input.dryRun === true });
  return migration.status === 'absent' ? null : migration;
}

function requirePackageId(packageId: string | null | undefined, action: string) {
  const normalized = canonicalAgentPackageId(packageId);
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', `Agent package ${action} requires --package-id.`, {
      required: ['--package-id'],
      action,
    });
  }
  return normalized;
}

function configuredCarrierVersionMatchesPackage(
  installedVersion: string | null,
  packageVersion: string,
) {
  if (!installedVersion) return false;
  if (installedVersion === packageVersion) return true;
  const prefix = `${packageVersion}-`;
  return installedVersion.startsWith(prefix)
    && /^[a-f0-9]{64}$/.test(installedVersion.slice(prefix.length));
}

function configuredCarrierObservedSourceMatchesPackage(
  source: ConfiguredCodexPluginCarrierReadback['carrier']['observed_sources'][number],
  packageVersion: string,
) {
  if (source.installed_version === packageVersion) return true;
  if (!configuredCarrierVersionMatchesPackage(source.installed_version, packageVersion)) return false;
  const generation = source.installed_version?.slice(`${packageVersion}-`.length) ?? null;
  return generation !== null && generation === source.source_tree_sha256;
}

function configuredCarrierReadbackIncludesTarget(input: {
  readback: ConfiguredCodexPluginCarrierReadback;
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  packageVersion: string;
}) {
  return input.readback.carrier.observed_sources.some((source) =>
    source.plugin_id === input.descriptor.carrier.pluginId
    && sameConfiguredCarrierPath(
      source.marketplace_source,
      input.descriptor.carrier.marketplaceSource,
    )
    && configuredCarrierObservedSourceMatchesPackage(source, input.packageVersion));
}

function configuredCarrierObservedVersion(readback: ConfiguredCodexPluginCarrierReadback) {
  return readback.installed_version
    ?? (readback.carrier.observed_sources.length === 1
      ? readback.carrier.observed_sources[0]?.installed_version ?? null
      : null);
}

type ConfiguredCarrierSelectionInput =
  | AgentPackageInstallInput
  | AgentPackageRepairInput
  | AgentPackagePackageActionInput;

type FreshConfiguredCarrierTarget = {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  packageVersion: string;
  developerSource?: ReturnType<typeof loadDeveloperCheckoutPackageSource> | null;
};

type FreshConfiguredCarrierSelection = {
  rootPackageId: string;
  targets: FreshConfiguredCarrierTarget[];
};

const frameworkPackageManifestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../contracts/opl-framework/packages',
);

function configuredCarrierTargetDescriptor(
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor,
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>,
) {
  if (descriptor.packageId !== 'opl-flow'
    || (action !== 'install' && action !== 'update' && action !== 'repair')) {
    return descriptor;
  }
  const manifestPath = path.join(frameworkPackageManifestRoot, 'opl-flow.json');
  const target = normalizePackageManifest(
    parseJsonText(fs.readFileSync(manifestPath, 'utf8')),
    pathToFileURL(manifestPath).toString(),
  );
  return {
    ...descriptor,
    executor: {
      ...descriptor.executor,
      requiredSkillIds: [...target.required_skill_ids],
    },
  };
}

function configuredCarrierTargetsFromCatalog(input: {
  catalog: ManagedPackageCatalog;
  rootManifest: AgentPackageManifest;
  rootVersion: ManagedCatalogVersion;
}) {
  const targets: FreshConfiguredCarrierTarget[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (
    targetManifest: AgentPackageManifest,
    targetVersion: ManagedCatalogVersion,
  ) => {
    if (visited.has(targetManifest.package_id)) return;
    if (visiting.has(targetManifest.package_id)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Native carrier dependency closure contains a cycle.', {
        package_id: input.rootManifest.package_id,
        dependency_package_id: targetManifest.package_id,
        failure_code: 'agent_package_dependency_cycle',
      });
    }
    visiting.add(targetManifest.package_id);
    try {
      for (const dependency of targetManifest.capability_dependencies) {
        if (!dependency.required && dependency.dependency_kind === 'optional_enhancement') continue;
        const dependencyVersion = selectManagedCatalogPackageVersion(
          input.catalog,
          dependency.package_id,
        );
        const dependencyManifest = normalizePackageManifest(
          catalogManifestPayload(dependencyVersion),
          dependencyVersion.manifest_url,
        );
        validateCapabilityProvider(
          dependency,
          dependencyManifest,
          dependencyVersion.manifest_sha256,
          targetManifest.agent_id,
        );
        visit(dependencyManifest, dependencyVersion);
      }
      if (!targetManifest.configured_codex_plugin_carrier) {
        throw new FrameworkContractError('contract_shape_invalid', 'Native carrier owner Package manifest must declare its carrier.', {
          package_id: targetManifest.package_id,
          root_package_id: input.rootManifest.package_id,
          manifest_url: targetVersion.manifest_url,
          failure_code: 'configured_codex_plugin_carrier_owner_descriptor_missing',
        });
      }
      targets.push({
        descriptor: targetManifest.configured_codex_plugin_carrier,
        packageVersion: targetManifest.version,
      });
      visited.add(targetManifest.package_id);
    } finally {
      visiting.delete(targetManifest.package_id);
    }
  };
  visit(input.rootManifest, input.rootVersion);
  return targets;
}

function configuredCarrierTargetsFromDeveloperCheckout(input: {
  rootSource: ReturnType<typeof loadDeveloperCheckoutPackageSource>;
  selectionInput: ConfiguredCarrierSelectionInput;
}) {
  const targets: FreshConfiguredCarrierTarget[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const agentRoots = 'agentRoots' in input.selectionInput
    ? input.selectionInput.agentRoots ?? {}
    : {};
  const visit = (source: ReturnType<typeof loadDeveloperCheckoutPackageSource>) => {
    const packageId = source.ownerManifest.package_id;
    if (visited.has(packageId)) return;
    if (visiting.has(packageId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Native developer carrier dependency closure contains a cycle.', {
        package_id: input.rootSource.ownerManifest.package_id,
        dependency_package_id: packageId,
        failure_code: 'agent_package_dependency_cycle',
      });
    }
    visiting.add(packageId);
    try {
      for (const dependency of source.ownerManifest.capability_dependencies) {
        if (!dependency.required && dependency.dependency_kind === 'optional_enhancement') continue;
        const dependencyPolicy = resolveAgentPackageEffectiveSourcePolicy(dependency.package_id);
        const dependencyCheckout = stringValue(agentRoots[dependency.package_id])
          ?? dependencyPolicy.developer_checkout_path;
        if (!dependencyCheckout) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Native developer carrier requires an explicit checkout for every required Package dependency.',
            {
              package_id: input.rootSource.ownerManifest.package_id,
              dependency_package_id: dependency.package_id,
              failure_code: 'configured_codex_plugin_carrier_developer_dependency_checkout_missing',
            },
          );
        }
        const dependencySource = loadDeveloperCheckoutPackageSource(
          dependency.package_id,
          dependencyCheckout,
        );
        validateCapabilityProvider(
          dependency,
          dependencySource.ownerManifest,
          dependencySource.source.owner_manifest_sha256,
          source.ownerManifest.agent_id,
        );
        visit(dependencySource);
      }
      targets.push(developerCheckoutConfiguredCarrierTarget(source));
      visited.add(packageId);
    } finally {
      visiting.delete(packageId);
    }
  };
  visit(input.rootSource);
  return targets;
}

function configuredCarrierDeveloperRequest(
  input: ConfiguredCarrierSelectionInput,
  packageId: string,
) {
  const sourceKind = 'sourceKind' in input ? input.sourceKind : null;
  const sourcePolicy = resolveFirstPartyPackageCatalog(packageId)
    ? resolveAgentPackageEffectiveSourcePolicy(packageId)
    : null;
  const requestedCheckout = stringValue(input.agentRoot);
  const explicitDeveloperSource = sourceKind === 'developer_checkout_override';
  const configuredDeveloperSource = sourcePolicy?.desired_source_kind === 'developer_checkout_override';
  return {
    sourcePolicy,
    requestedCheckout,
    explicitDeveloperSource,
    configuredDeveloperSource,
  };
}

function assertConfiguredCarrierDeveloperRequest(input: {
  packageId: string;
  sourcePolicy: ReturnType<typeof resolveAgentPackageEffectiveSourcePolicy> | null;
  requestedCheckout: string | null;
  explicitDeveloperSource: boolean;
  configuredDeveloperSource: boolean;
}) {
  const { packageId, sourcePolicy, requestedCheckout } = input;
  if (requestedCheckout && !input.explicitDeveloperSource) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A developer checkout must be selected explicitly with --source-kind developer_checkout_override.',
      {
        package_id: packageId,
        requested_checkout_path: path.resolve(requestedCheckout),
        failure_code: 'agent_package_developer_checkout_source_kind_required',
      },
    );
  }
  if (input.explicitDeveloperSource && !requestedCheckout) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'An explicit developer checkout selection requires --agent-root.',
      {
        package_id: packageId,
        failure_code: 'agent_package_developer_checkout_path_required',
      },
    );
  }
  if (requestedCheckout
    && sourcePolicy?.developer_checkout_path
    && path.resolve(requestedCheckout) !== path.resolve(sourcePolicy.developer_checkout_path)) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party Package developer checkout must match the effective module source policy.', {
      package_id: packageId,
      requested_checkout_path: path.resolve(requestedCheckout),
      required_checkout_path: path.resolve(sourcePolicy.developer_checkout_path),
      source_policy_reason: sourcePolicy.reason,
      failure_code: 'first_party_package_developer_checkout_path_mismatch',
    });
  }
}

function configuredCarrierDeveloperCheckoutPath(input: {
  packageId: string;
  sourcePolicy: ReturnType<typeof resolveAgentPackageEffectiveSourcePolicy> | null;
  requestedCheckout: string | null;
}) {
  const checkoutPath = input.requestedCheckout ?? input.sourcePolicy?.developer_checkout_path ?? null;
  if (!checkoutPath) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured developer Package source has no usable checkout.',
      {
        package_id: input.packageId,
        source_policy_reason: input.sourcePolicy?.reason ?? null,
        failure_code: 'agent_package_developer_checkout_path_required',
      },
    );
  }
  return checkoutPath;
}

function configuredCarrierDeveloperSelection(
  input: ConfiguredCarrierSelectionInput,
  packageId: ReturnType<typeof canonicalAgentPackageId>,
): FreshConfiguredCarrierSelection | null {
  if (!packageId) return null;
  const request = configuredCarrierDeveloperRequest(input, packageId);
  assertConfiguredCarrierDeveloperRequest({ packageId, ...request });
  if (!request.explicitDeveloperSource && !request.configuredDeveloperSource) return null;
  const checkoutPath = configuredCarrierDeveloperCheckoutPath({ packageId, ...request });
  const rootSource = loadDeveloperCheckoutPackageSource(packageId, checkoutPath);
  return {
    rootPackageId: packageId,
    targets: configuredCarrierTargetsFromDeveloperCheckout({
      rootSource,
      selectionInput: input,
    }),
  };
}

async function resolveFreshConfiguredCarrier(
  input: ConfiguredCarrierSelectionInput,
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>,
): Promise<FreshConfiguredCarrierSelection | null> {
  const packageId = canonicalAgentPackageId(input.packageId);
  const explicitManifestUrl = 'manifestUrl' in input ? stringValue(input.manifestUrl) : null;
  const explicitRegistryUrl = 'registryUrl' in input ? stringValue(input.registryUrl) : null;
  const installed = !explicitManifestUrl && !explicitRegistryUrl && packageId
    ? discoverInstalledCodexPluginDescriptors({
        packageId,
        failClosedOnCarrierError: true,
      }).get(packageId) ?? null
    : null;
  if (installed && (action === 'remove' || action === 'enable' || action === 'disable')) {
    return {
      rootPackageId: installed.manifest.package_id,
      targets: [{ descriptor: installed.carrier, packageVersion: installed.manifest.version }],
    };
  }
  const developerSelection = configuredCarrierDeveloperSelection(input, packageId);
  if (developerSelection) return developerSelection;
  if (!explicitManifestUrl && !explicitRegistryUrl) {
    if (packageId
      && resolveAgentPackageEffectiveSourcePolicy(packageId).desired_source_kind
        === 'bundled_full_runtime_modules') {
      // Full/offline Package roots are reconciled by the dedicated startup
      // owner; ordinary Package actions must not turn them into an OCI fetch.
      return null;
    }
    if (packageId && resolveFirstPartyPackageCatalog(packageId)) {
      let snapshot: Awaited<ReturnType<typeof refreshFirstPartyPackageCatalogSnapshot>>;
      try {
        snapshot = await refreshFirstPartyPackageCatalogSnapshot(packageId);
      } catch (error) {
        if (error instanceof FrameworkContractError) throw error;
        throw new FrameworkContractError('codex_command_failed', 'Declared native carrier owner Package source is unavailable.', {
          package_id: packageId,
          owner_source: 'per_package_live_owner',
          failure_code: 'agent_package_capability_channel_unavailable',
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      const selected = selectManagedCatalogPackageVersion(snapshot.catalog, packageId);
      const manifest = normalizePackageManifest(
        catalogManifestPayload(selected),
        selected.manifest_url,
      );
      const targets = configuredCarrierTargetsFromCatalog({
        catalog: snapshot.catalog,
        rootManifest: manifest,
        rootVersion: selected,
      });
      return { rootPackageId: packageId, targets };
    }
    if (installed) {
      return {
        rootPackageId: installed.manifest.package_id,
        targets: [{ descriptor: installed.carrier, packageVersion: installed.manifest.version }],
      };
    }
  }
  // Bare actions must use a fresh installed owner descriptor; an uninstalled
  // Package needs an explicit manifest or registry selection for this request.
  if (!explicitManifestUrl && !explicitRegistryUrl) {
    return null;
  }
  const selection = await resolveManifestSelection({
    packageId,
    manifestUrl: explicitManifestUrl,
    registryUrl: explicitRegistryUrl,
    trustTier: 'trustTier' in input ? input.trustTier : null,
  });
  assertTrustTierAssigned(selection.trustTier, selection.manifestUrl);
  const fetched = await fetchJsonSource(selection.manifestUrl);
  const manifest = normalizePackageManifest(fetched.payload, selection.manifestUrl);
  assertManifestMatchesRegistrySelection(manifest, selection);
  if (packageId && manifest.package_id !== packageId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured native carrier manifest identity must match the requested Package.',
      {
        package_id: packageId,
        manifest_package_id: manifest.package_id,
        manifest_url: selection.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_package_identity_mismatch',
      },
    );
  }
  const declaredCarrier = packageId
    ? firstPartyConfiguredCarrierDescriptors().get(packageId) ?? null
    : null;
  if (declaredCarrier && !manifest.configured_codex_plugin_carrier) {
    throw new FrameworkContractError('contract_shape_invalid', 'Native carrier owner Package manifest must declare its carrier.', {
      package_id: packageId,
      manifest_url: selection.manifestUrl,
      failure_code: 'configured_codex_plugin_carrier_owner_descriptor_missing',
    });
  }
  return manifest.configured_codex_plugin_carrier ? {
    rootPackageId: manifest.package_id,
    targets: [{
      descriptor: manifest.configured_codex_plugin_carrier,
      packageVersion: manifest.version,
    }],
  } : null;
}

function configuredCarrierLifecycleActionMatches(input: {
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>;
  readback: ConfiguredCodexPluginCarrierReadback;
}) {
  if (input.action === 'remove') {
    const absent = input.readback.status === 'not_installed'
      || input.readback.status === 'physical_unavailable';
    return absent && input.readback.carrier.precedence === 'not_present';
  }
  if (input.action !== 'enable' && input.action !== 'disable') return false;
  return input.readback.status === 'installed'
    && input.readback.carrier.precedence === 'exact_single_source'
    && input.readback.enabled === (input.action === 'enable');
}

function configuredCarrierDeveloperSourceMatches(input: {
  target: FreshConfiguredCarrierTarget;
  readback: ConfiguredCodexPluginCarrierReadback;
}) {
  const expected = input.target.developerSource;
  if (!expected) return true;
  const observed = input.readback.carrier.observed_sources.find(
    (source) => source.plugin_id === input.target.descriptor.carrier.pluginId,
  ) ?? null;
  if (!observed?.plugin_source_path || !observed.marketplace_source) return false;
  if (path.resolve(observed.plugin_source_path) !== path.resolve(expected.source.plugin_source_path)) {
    return false;
  }
  if (path.resolve(observed.marketplace_source) !== path.resolve(expected.source.checkout_path)) {
    return false;
  }
  const fresh = loadDeveloperCheckoutPackageSource(
    expected.ownerManifest.package_id,
    expected.source.checkout_path,
  );
  return fresh.source.owner_manifest_sha256 === expected.source.owner_manifest_sha256
    && fresh.source.source_git_head_sha === expected.source.source_git_head_sha
    && fresh.source.tree_sha256 === expected.source.tree_sha256
    && fresh.source.payload_digest === expected.source.payload_digest;
}

function configuredCarrierInstalledTargetMatches(input: {
  target: FreshConfiguredCarrierTarget;
  readback: ConfiguredCodexPluginCarrierReadback;
}) {
  if (input.readback.status !== 'installed') return false;
  if (input.readback.executor.status !== 'callable') return false;
  if (input.readback.carrier.precedence !== 'exact_single_source') return false;
  if (!configuredCarrierReadbackIncludesTarget({
    readback: input.readback,
    descriptor: input.target.descriptor,
    packageVersion: input.target.packageVersion,
  })) return false;
  return configuredCarrierDeveloperSourceMatches(input);
}

function assertConfiguredCarrierLifecycleTarget(input: {
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>;
  target: FreshConfiguredCarrierTarget;
  readback: ConfiguredCodexPluginCarrierReadback;
}) {
  if (input.action === 'remove' || input.action === 'enable' || input.action === 'disable') {
    if (configuredCarrierLifecycleActionMatches(input)) return;
  } else if (configuredCarrierInstalledTargetMatches(input)) {
    return;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Configured native carrier did not reach the Package owner target version and callability.',
    {
      package_id: input.target.descriptor.packageId,
      target_version: input.target.packageVersion,
      observed_version: configuredCarrierObservedVersion(input.readback),
      carrier_status: input.readback.status,
      executor_status: input.readback.executor.status,
      carrier_precedence: input.readback.carrier.precedence,
      carrier_reason: input.readback.reason,
      failure_code: 'configured_codex_plugin_carrier_target_currentness_mismatch',
    },
  );
}

function compensateFreshConfiguredCarrierInstall(input: {
  dispatched: FreshConfiguredCarrierTarget[];
  prestate: Map<string, ConfiguredCodexPluginCarrierReadback>;
}) {
  for (const target of [...input.dispatched].reverse()) {
    const before = input.prestate.get(target.descriptor.packageId);
    if (before && before.status !== 'not_installed' && before.status !== 'physical_unavailable') continue;
    runConfiguredCodexPluginCarrier({ descriptor: target.descriptor, action: 'remove' });
  }
}

function convergeRequiredConfiguredCarrierTargets(input: {
  rootPackageId: string;
  targets: FreshConfiguredCarrierTarget[];
  action: 'update' | 'repair';
  dryRun: boolean;
}) {
  const dependencyTargets = input.targets
    .filter((target) => target.descriptor.packageId !== input.rootPackageId)
    .map((target) => ({
      ...target,
      descriptor: configuredCarrierTargetDescriptor(target.descriptor, input.action),
    }));
  const prestate = new Map<string, ConfiguredCodexPluginCarrierReadback>();
  const dispatched: FreshConfiguredCarrierTarget[] = [];
  const readbacks: Array<{
    package_id: string;
    status: string;
    observed_version: string | null;
    configured_carrier: ConfiguredCodexPluginCarrierReadback;
  }> = [];
  try {
    for (const target of dependencyTargets) {
      const before = runConfiguredCodexPluginCarrier({ descriptor: target.descriptor, action: 'list' });
      prestate.set(target.descriptor.packageId, before);
      const current = before.status === 'installed'
        && before.executor.status === 'callable'
        && before.carrier.precedence === 'exact_single_source'
        && configuredCarrierReadbackIncludesTarget({
          readback: before,
          descriptor: target.descriptor,
          packageVersion: target.packageVersion,
        });
      if (current && input.action === 'update') {
        readbacks.push({
          package_id: target.descriptor.packageId,
          status: input.dryRun ? 'validated_no_write' : 'current_noop',
          observed_version: before.installed_version,
          configured_carrier: before,
        });
        continue;
      }
      const action = before.status === 'not_installed' || before.status === 'physical_unavailable'
        ? 'install' as const
        : input.action;
      dispatched.push(target);
      const carrier = runConfiguredCodexPluginCarrier({
        descriptor: target.descriptor,
        action,
        dryRun: input.dryRun,
      });
      if (!input.dryRun) {
        assertConfiguredCarrierLifecycleTarget({ action, target, readback: carrier });
      }
      readbacks.push({
        package_id: target.descriptor.packageId,
        status: configuredCarrierLifecycleReadback({
          action,
          dryRun: input.dryRun,
          carrier,
        }).status,
        observed_version: carrier.installed_version,
        configured_carrier: carrier,
      });
    }
  } catch (error) {
    if (!input.dryRun) compensateFreshConfiguredCarrierInstall({ dispatched, prestate });
    throw error;
  }
  return {
    readbacks,
    compensate: () => {
      if (!input.dryRun) compensateFreshConfiguredCarrierInstall({ dispatched, prestate });
    },
  };
}

function configuredCarrierLifecycleReadback(input: {
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>;
  dryRun: boolean;
  carrier: ConfiguredCodexPluginCarrierReadback;
  target?: {
    currentness: {
      status: 'current' | 'update_available' | 'newer_source_preserved';
      reasons: string[];
      installed_version: string;
      target_version: string;
      installed_content_digest: null;
      target_content_digest: string | null;
      installed_artifact_digest: null;
      target_artifact_digest: string | null;
      installed_manifest_sha256: null;
      target_manifest_sha256: string;
    };
    sourceArtifactRef: string | null;
    catalogRef: string;
    catalogDigest: string | null;
    catalogFreshness: 'live';
    checkedAt: string;
  };
}) {
  const nativeReady = input.carrier.status === 'installed'
    && input.carrier.executor.status === 'callable'
    && input.carrier.carrier.precedence === 'exact_single_source';
  const exactInstalledCarrier = input.carrier.status === 'installed'
    && input.carrier.carrier.precedence === 'exact_single_source';
  const status = input.action === 'remove'
    ? (input.carrier.status === 'not_installed'
        || input.carrier.status === 'physical_unavailable')
      && input.carrier.carrier.precedence === 'not_present'
      ? 'uninstalled'
      : 'attention_needed'
    : input.dryRun
      ? 'validated_no_write'
      : input.action === 'enable'
        ? exactInstalledCarrier && input.carrier.enabled === true
          ? 'enabled'
          : 'attention_needed'
        : input.action === 'disable'
          ? exactInstalledCarrier && input.carrier.enabled === false
            ? 'disabled'
            : 'attention_needed'
      : nativeReady
        ? input.action === 'install' ? 'installed'
          : input.action === 'update' ? 'updated'
            : 'repaired'
        : 'attention_needed';
  return {
    status,
    dry_run: input.dryRun,
    package_id: input.carrier.package_id,
    configured_carrier: input.carrier,
    ...(input.target ? {
      currentness: input.target.currentness,
      target_version: input.target.currentness.target_version,
      observed_version: input.carrier.installed_version,
      target_source_artifact_ref: input.target.sourceArtifactRef,
      release_catalog_ref: input.target.catalogRef,
      release_catalog_digest: input.target.catalogDigest,
      release_catalog_freshness: input.target.catalogFreshness,
      release_catalog_checked_at: input.target.checkedAt,
    } : {}),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function sameConfiguredCarrierPath(left: string | null, right: string | null) {
  if (!left || !right) return false;
  if (path.isAbsolute(left) || path.isAbsolute(right)) {
    return path.isAbsolute(left)
      && path.isAbsolute(right)
      && path.resolve(left) === path.resolve(right);
  }
  if (left === right) return true;
  const leftGithubSource = githubMarketplaceSourceIdentity(left);
  const rightGithubSource = githubMarketplaceSourceIdentity(right);
  return leftGithubSource !== null
    && rightGithubSource !== null
    && leftGithubSource === rightGithubSource;
}

function compareSemanticVersions(left: string, right: string) {
  const leftVersion = valid(left);
  const rightVersion = valid(right);
  return leftVersion && rightVersion ? compare(leftVersion, rightVersion) : null;
}

function descriptorOwnedCarrierCurrentness(input: {
  installedVersion: string;
  installedManifestVersion: string;
  installedSourcePath: string;
  readback: ConfiguredCodexPluginCarrierReadback;
  target: ManagedCatalogVersion;
  installedDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  targetDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
}) {
  const reasons: string[] = [];
  const installedVersionComparison = compareSemanticVersions(
    input.installedManifestVersion,
    input.target.package_version,
  );
  if (input.installedManifestVersion !== input.target.package_version
    || !configuredCarrierReadbackIncludesTarget({
      readback: input.readback,
      descriptor: input.targetDescriptor,
      packageVersion: input.target.package_version,
    })) {
    reasons.push('package_version_changed');
  }
  if (input.readback.status !== 'installed'
    || input.readback.executor.status !== 'callable'
    || input.readback.carrier.precedence !== 'exact_single_source') {
    reasons.push('configured_carrier_not_ready');
  }
  if (!sameConfiguredCarrierPath(input.readback.plugin_source_path, input.installedSourcePath)) {
    reasons.push('configured_carrier_source_changed');
  }
  if (input.installedDescriptor.carrier.pluginId !== input.targetDescriptor.carrier.pluginId
    || !sameConfiguredCarrierPath(
      input.installedDescriptor.carrier.marketplaceSource,
      input.targetDescriptor.carrier.marketplaceSource,
    )) {
    reasons.push('configured_carrier_route_changed');
  }
  if (installedVersionComparison !== null && installedVersionComparison > 0) {
    reasons.push('newer_installed_version_preserved');
  }
  return {
    status: installedVersionComparison !== null && installedVersionComparison > 0
      ? 'newer_source_preserved' as const
      : reasons.length === 0
        ? 'current' as const
        : 'update_available' as const,
    reasons: [...new Set(reasons)],
    installed_version: input.readback.installed_version ?? input.installedVersion,
    target_version: input.target.package_version,
    installed_content_digest: null,
    target_content_digest: input.target.content_digest,
    installed_artifact_digest: null,
    target_artifact_digest: input.target.artifact_digest,
    installed_manifest_sha256: null,
    target_manifest_sha256: input.target.manifest_sha256,
  };
}

function readPreservedRequiredConfiguredCarrierTargets(input: {
  rootPackageId: string;
  targets: FreshConfiguredCarrierTarget[];
}) {
  const installedDescriptors = discoverInstalledCodexPluginDescriptors({
    failClosedOnCarrierError: true,
  });
  return input.targets
    .filter((target) => target.descriptor.packageId !== input.rootPackageId)
    .map((target) => {
      const installed = installedDescriptors.get(target.descriptor.packageId) ?? null;
      const versionComparison = installed
        ? compareSemanticVersions(installed.manifest.version, target.packageVersion)
        : null;
      if (!installed || versionComparison === null || versionComparison < 0) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'A newer installed Package cannot be preserved with an older or missing dependency carrier.',
          {
            package_id: input.rootPackageId,
            dependency_package_id: target.descriptor.packageId,
            installed_dependency_version: installed?.manifest.version ?? null,
            target_dependency_version: target.packageVersion,
            failure_code: 'newer_installed_package_dependency_not_preservable',
          },
        );
      }
      const carrier = runConfiguredCodexPluginCarrier({
        descriptor: installed.carrier,
        action: 'list',
      });
      assertConfiguredCarrierReady(target.descriptor.packageId, carrier);
      return {
        package_id: target.descriptor.packageId,
        status: versionComparison > 0 ? 'newer_source_preserved' : 'current_noop',
        observed_version: carrier.installed_version,
        configured_carrier: carrier,
      };
    });
}

function assertConfiguredCarrierReachedOwnerTarget(input: {
  packageId: string;
  readback: ConfiguredCodexPluginCarrierReadback;
  targetDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  targetVersion: ManagedCatalogVersion;
}) {
  if (configuredCarrierReadbackIncludesTarget({
    readback: input.readback,
    descriptor: input.targetDescriptor,
    packageVersion: input.targetVersion.package_version,
  })) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Configured native carrier did not reach the Package owner target version.',
    {
      package_id: input.packageId,
      target_version: input.targetVersion.package_version,
      observed_version: configuredCarrierObservedVersion(input.readback),
      failure_code: 'configured_codex_plugin_carrier_target_currentness_mismatch',
    },
  );
}

function assertConfiguredCarrierReady(
  packageId: string,
  readback: ConfiguredCodexPluginCarrierReadback,
) {
  if (readback.status === 'installed'
    && readback.executor.status === 'callable'
    && readback.carrier.precedence === 'exact_single_source') return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Configured native carrier restore did not reach one callable source.',
    {
      package_id: packageId,
      carrier_status: readback.status,
      executor_status: readback.executor.status,
      carrier_precedence: readback.carrier.precedence,
      carrier_reason: readback.reason,
      failure_code: 'configured_codex_plugin_carrier_restore_readback_failed',
    },
  );
}

function transferDescriptorOwnedCarrierRoute(input: {
  packageId: string;
  action: 'update' | 'repair';
  installedDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  targetDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  targetVersion: ManagedCatalogVersion;
  selectorChanged: boolean;
  sourceChanged: boolean;
}) {
  let previousRemoved = false;
  let targetDispatched = false;
  try {
    targetDispatched = true;
    const provisional = runConfiguredCodexPluginCarrier({
      descriptor: input.targetDescriptor,
      action: input.action,
    });
    assertConfiguredCarrierReachedOwnerTarget({ ...input, readback: provisional });
    if (input.selectorChanged) {
      const removed = runConfiguredCodexPluginCarrier({
        descriptor: input.installedDescriptor,
        action: 'remove',
      });
      previousRemoved = removed.status === 'not_installed'
        || removed.status === 'physical_unavailable';
      if (!previousRemoved) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Previous configured native carrier could not be retired after owner transfer.',
          {
            package_id: input.packageId,
            previous_plugin_selector: input.installedDescriptor.carrier.pluginId,
            failure_code: 'configured_codex_plugin_carrier_previous_source_retirement_failed',
          },
        );
      }
    }
    const carrier = runConfiguredCodexPluginCarrier({
      descriptor: input.targetDescriptor,
      action: 'list',
    });
    assertConfiguredCarrierLifecycleTarget({
      action: input.action,
      target: {
        descriptor: input.targetDescriptor,
        packageVersion: input.targetVersion.package_version,
      },
      readback: carrier,
    });
    assertConfiguredCarrierReachedOwnerTarget({ ...input, readback: carrier });
    return carrier;
  } catch (error) {
    if (targetDispatched && input.selectorChanged) {
      runConfiguredCodexPluginCarrier({ descriptor: input.targetDescriptor, action: 'remove' });
    }
    if (previousRemoved || input.sourceChanged) {
      const restored = runConfiguredCodexPluginCarrier({
        descriptor: input.installedDescriptor,
        action: 'install',
      });
      assertConfiguredCarrierReady(input.packageId, restored);
    }
    throw error;
  }
}

function adoptDescriptorOwnedCarrierTarget(input: {
  packageId: string;
  action: 'update' | 'repair';
  dryRun: boolean;
  installedDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  targetDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  targetVersion: ManagedCatalogVersion;
}) {
  const selectorChanged = input.installedDescriptor.carrier.pluginId
    !== input.targetDescriptor.carrier.pluginId;
  const sourceChanged = !sameConfiguredCarrierPath(
    input.installedDescriptor.carrier.marketplaceSource,
    input.targetDescriptor.carrier.marketplaceSource,
  );
  if ((selectorChanged || sourceChanged) && !input.dryRun) {
    return transferDescriptorOwnedCarrierRoute({
      ...input,
      selectorChanged,
      sourceChanged,
    });
  }
  const carrier = runConfiguredCodexPluginCarrier({
    descriptor: input.targetDescriptor,
    action: input.action,
    dryRun: input.dryRun,
  });
  if (!input.dryRun) {
    assertConfiguredCarrierLifecycleTarget({
      action: input.action,
      target: {
        descriptor: input.targetDescriptor,
        packageVersion: input.targetVersion.package_version,
      },
      readback: carrier,
    });
    assertConfiguredCarrierReachedOwnerTarget({ ...input, readback: carrier });
  }
  return carrier;
}

type DescriptorOwnedFirstPartyLifecycleInput = {
  selectionInput: AgentPackageInstallInput | AgentPackageRepairInput;
  action: 'update' | 'repair';
};

function descriptorOwnedFirstPartyContext(input: DescriptorOwnedFirstPartyLifecycleInput) {
  const packageId = canonicalAgentPackageId(input.selectionInput.packageId);
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  if (!packageId || !firstParty) {
    return null;
  }
  if (input.selectionInput.sourceKind === 'developer_checkout_override'
    || stringValue(input.selectionInput.agentRoot)) return null;
  const sourcePolicy = resolveAgentPackageEffectiveSourcePolicy(packageId);
  if (sourcePolicy.desired_source_kind !== 'first_party_managed_cohort') return null;
  assertFirstPartyPackageUpdateSelection(input.selectionInput, firstParty, sourcePolicy);
  const installed = discoverInstalledCodexPluginDescriptors({
    packageId,
    failClosedOnCarrierError: true,
  }).get(packageId) ?? null;
  if (!installed) return null;
  return {
    packageId,
    firstParty,
    sourcePolicy,
    installed,
  };
}

function descriptorOwnedTargetDescriptor(input: {
  packageId: string;
  targetVersion: ManagedCatalogVersion;
  targetCarrier: AgentPackageConfiguredCodexPluginCarrierDescriptor | null;
}) {
  if (!input.targetCarrier) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'The live Package owner manifest is missing its configured native carrier authority.',
      {
        package_id: input.packageId,
        target_version: input.targetVersion.package_version,
        failure_code: 'configured_codex_plugin_carrier_owner_authority_missing',
      },
    );
  }
  return input.targetCarrier;
}

function descriptorOwnedCurrentLifecycleResult(input: {
  action: 'update' | 'repair';
  dryRun: boolean;
  packageId: string;
  observed: ConfiguredCodexPluginCarrierReadback;
  currentness: ReturnType<typeof descriptorOwnedCarrierCurrentness>;
  targetVersion: ManagedCatalogVersion;
  targetDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  catalogRef: string;
  catalogDigest: string | null;
  catalogFreshness: 'live';
  checkedAt: string;
  requiredDependencyPackages: ReturnType<typeof convergeRequiredConfiguredCarrierTargets>['readbacks'];
}) {
  if (input.currentness.status === 'update_available') return null;
  const newerSourcePreserved = input.currentness.status === 'newer_source_preserved';
  if (input.action === 'update') {
    return {
      version: 'g2' as const,
      opl_agent_package_update: {
        surface_kind: 'opl_agent_package_update' as const,
        status: input.dryRun ? 'validated_no_write' as const : 'current_noop' as const,
        dry_run: input.dryRun,
        package_id: input.packageId,
        configured_carrier: input.observed,
        currentness: input.currentness,
        reconciliation_action: newerSourcePreserved ? 'preserve_newer_installed_source' : null,
        target_version: input.targetVersion.package_version,
        observed_version: input.observed.installed_version,
        target_manifest_sha256: input.targetVersion.manifest_sha256,
        target_content_digest: input.targetVersion.content_digest,
        target_artifact_digest: input.targetVersion.artifact_digest,
        target_source_artifact_ref: input.targetVersion.source_artifact_ref,
        release_catalog_ref: input.catalogRef,
        release_catalog_digest: input.catalogDigest,
        release_catalog_freshness: input.catalogFreshness,
        release_catalog_checked_at: input.checkedAt,
        required_dependency_packages: input.requiredDependencyPackages,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  if (newerSourcePreserved) {
    return {
      version: 'g2' as const,
      opl_agent_package_repair: {
        surface_kind: 'opl_agent_package_repair' as const,
        status: input.dryRun ? 'validated_no_write' as const : 'current_noop' as const,
        dry_run: input.dryRun,
        package_id: input.packageId,
        configured_carrier: input.observed,
        currentness: input.currentness,
        reconciliation_action: 'preserve_newer_installed_source' as const,
        target_version: input.targetVersion.package_version,
        observed_version: input.observed.installed_version,
        target_source_artifact_ref: input.targetVersion.source_artifact_ref,
        release_catalog_ref: input.catalogRef,
        release_catalog_digest: input.catalogDigest,
        release_catalog_freshness: input.catalogFreshness,
        release_catalog_checked_at: input.checkedAt,
        required_dependency_packages: input.requiredDependencyPackages,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  const carrier = runConfiguredCodexPluginCarrier({
    descriptor: input.targetDescriptor,
    action: 'repair',
    dryRun: input.dryRun,
  });
  if (!input.dryRun) {
    assertConfiguredCarrierLifecycleTarget({
      action: 'repair',
      target: {
        descriptor: input.targetDescriptor,
        packageVersion: input.targetVersion.package_version,
      },
      readback: carrier,
    });
  }
  return {
    version: 'g2' as const,
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair' as const,
      ...configuredCarrierLifecycleReadback({
        action: 'repair',
        dryRun: input.dryRun,
        carrier,
        target: {
          currentness: input.currentness,
          sourceArtifactRef: input.targetVersion.source_artifact_ref,
          catalogRef: input.catalogRef,
          catalogDigest: input.catalogDigest,
          catalogFreshness: input.catalogFreshness,
          checkedAt: input.checkedAt,
        },
      }),
      required_dependency_packages: input.requiredDependencyPackages,
    },
  };
}

async function maybeRunDescriptorOwnedFirstPartyLifecycle(input: DescriptorOwnedFirstPartyLifecycleInput) {
  const context = descriptorOwnedFirstPartyContext(input);
  if (!context) return null;
  const {
    packageId,
    firstParty,
    sourcePolicy,
    installed,
  } = context;

  const snapshot = await resolveFirstPartyPackageCatalogSnapshot({
    refresh: true,
    packageId,
  });
  if (!snapshot || snapshot.freshness !== 'live') {
    throw new FrameworkContractError('codex_command_failed', 'Descriptor-owned Package currentness requires a live owner package channel.', {
      package_id: packageId,
      catalog_ref: firstParty.catalogSource.catalog_ref,
      available_catalog_freshness: snapshot?.freshness ?? null,
      failure_code: 'agent_package_capability_channel_unavailable',
    });
  }
  const targetVersion = ownerPackageCatalogVersion(snapshot.catalog, packageId);
  assertFirstPartyPackageCatalogVersion(packageId, targetVersion);
  const targetManifest = normalizePackageManifest(
    catalogManifestPayload(targetVersion),
    targetVersion.manifest_url,
  );
  const targetDescriptor = descriptorOwnedTargetDescriptor({
    packageId,
    targetVersion,
    targetCarrier: targetManifest.configured_codex_plugin_carrier ?? null,
  });
  const closureTargets = configuredCarrierTargetsFromCatalog({
    catalog: snapshot.catalog,
    rootManifest: targetManifest,
    rootVersion: targetVersion,
  });
  const dryRun = input.selectionInput.dryRun === true;
  const observed = runConfiguredCodexPluginCarrier({
    descriptor: installed.carrier,
    action: 'list',
  });
  const currentness = descriptorOwnedCarrierCurrentness({
    installedVersion: installed.manifest.version,
    installedManifestVersion: installed.manifest.version,
    installedSourcePath: installed.sourcePath,
    readback: observed,
    target: targetVersion,
    installedDescriptor: installed.carrier,
    targetDescriptor,
  });
  if (currentness.status === 'newer_source_preserved') {
    assertConfiguredCarrierReady(packageId, observed);
    return descriptorOwnedCurrentLifecycleResult({
      action: input.action,
      dryRun,
      packageId,
      observed,
      currentness,
      targetVersion,
      targetDescriptor,
      catalogRef: snapshot.catalog_ref,
      catalogDigest: snapshot.catalog_digest,
      catalogFreshness: snapshot.freshness,
      checkedAt: snapshot.checked_at,
      requiredDependencyPackages: readPreservedRequiredConfiguredCarrierTargets({
        rootPackageId: packageId,
        targets: closureTargets,
      }),
    });
  }
  const requiredDependencies = convergeRequiredConfiguredCarrierTargets({
    rootPackageId: packageId,
    targets: closureTargets,
    action: input.action,
    dryRun,
  });
  const targetReadback = {
    currentness,
    sourceArtifactRef: targetVersion.source_artifact_ref,
    catalogRef: snapshot.catalog_ref,
    catalogDigest: snapshot.catalog_digest,
    catalogFreshness: snapshot.freshness,
    checkedAt: snapshot.checked_at,
  };

  try {
    const currentResult = descriptorOwnedCurrentLifecycleResult({
      action: input.action,
      dryRun,
      packageId,
      observed,
      currentness,
      targetVersion,
      targetDescriptor,
      catalogRef: snapshot.catalog_ref,
      catalogDigest: snapshot.catalog_digest,
      catalogFreshness: snapshot.freshness,
      checkedAt: snapshot.checked_at,
      requiredDependencyPackages: requiredDependencies.readbacks,
    });
    if (currentResult) return currentResult;

    const carrier = adoptDescriptorOwnedCarrierTarget({
      packageId,
      action: input.action,
      dryRun,
      installedDescriptor: installed.carrier,
      targetDescriptor,
      targetVersion,
    });
    const readback = configuredCarrierLifecycleReadback({
      action: input.action,
      dryRun,
      carrier,
      target: targetReadback,
    });
    const surface = {
      ...readback,
      required_dependency_packages: requiredDependencies.readbacks,
    };
    return input.action === 'update'
      ? {
          version: 'g2',
          opl_agent_package_update: {
            surface_kind: 'opl_agent_package_update',
            ...surface,
          },
        }
      : {
          version: 'g2',
          opl_agent_package_repair: {
            surface_kind: 'opl_agent_package_repair',
            ...surface,
          },
        };
  } catch (error) {
    requiredDependencies.compensate();
    throw error;
  }
}

function maybeRunInstalledManagedPolicyRepair(input: AgentPackageRepairInput) {
  const context = descriptorOwnedFirstPartyContext({
    selectionInput: input,
    action: 'repair',
  });
  if (!context) return null;
  const config = context.installed.manifest.managed_policy_surface;
  if (!config) return null;
  const policyPath = path.resolve(context.installed.sourcePath, config.source_path);
  const schemaPath = path.resolve(context.installed.sourcePath, config.schema_path);
  if (!fs.existsSync(policyPath) || !fs.existsSync(schemaPath)) return null;

  const carrier = runConfiguredCodexPluginCarrier({
    descriptor: context.installed.carrier,
    action: 'list',
  });
  const carrierReady = carrier.status === 'installed'
    && carrier.executor.status === 'callable'
    && carrier.carrier.precedence === 'exact_single_source';
  if (!carrierReady) return null;

  const managedPolicyRepair = repairManagedPolicyDependenciesFromDescriptor({
    manifest: {
      package_id: context.installed.manifest.package_id,
      version: context.installed.manifest.version,
      plugin_id: stringValue(context.installed.manifest.codex_surface.plugin_id),
      required_skill_ids: context.installed.manifest.required_skill_ids,
      managed_policy_surface: context.installed.manifest.managed_policy_surface,
    },
    sourceRoot: context.installed.sourcePath,
    activeCarrierIdentity: context.installed.carrier_readback.identity,
    dryRun: input.dryRun === true,
  });
  if (!managedPolicyRepair) return null;
  if (!managedPolicyRepair.writes_performed) return null;
  const migration = legacyOplDocMigrationForFlow(input);
  return {
    version: 'g2' as const,
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair' as const,
      ...configuredCarrierLifecycleReadback({
        action: 'repair',
        dryRun: input.dryRun === true,
        carrier,
      }),
      repair_scope: 'installed_managed_policy_dependencies' as const,
      managed_policy_repair: managedPolicyRepair,
      ...(migration ? { legacy_opl_doc_install_migration: migration } : {}),
    },
  };
}

function explicitLocalSourceRef(value: string | null) {
  if (!value) return false;
  if (value.startsWith('file:')) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function assertNoExplicitRemoteFirstPartySource(input: ConfiguredCarrierSelectionInput) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  const explicitManifestUrl = 'manifestUrl' in input ? stringValue(input.manifestUrl) : null;
  const explicitRegistryUrl = 'registryUrl' in input ? stringValue(input.registryUrl) : null;
  if (!firstParty || (!explicitRegistryUrl
    && (!explicitManifestUrl || explicitLocalSourceRef(explicitManifestUrl)))) return;
  throw new FrameworkContractError('contract_shape_invalid', 'Canonical first-party packages resolve through their per-Package owner OCI latest-stable channel; explicit remote manifest or registry selection is not allowed.', {
    package_id: firstParty.canonicalId,
    explicit_manifest_source: Boolean(explicitManifestUrl),
    explicit_registry_source: Boolean(explicitRegistryUrl),
    failure_code: 'first_party_package_explicit_source_forbidden',
  });
}

function throwPackageNativeOwnerRequired(
  input: ConfiguredCarrierSelectionInput,
  action: AgentPackageLifecycleAction,
): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Package lifecycle action requires a configured native carrier or an explicitly selected developer/local source.',
    {
      package_id: canonicalAgentPackageId(input.packageId),
      action,
      failure_code: 'agent_package_lifecycle_native_owner_required',
    },
  );
}

function assertNoNativeRequiredInstalledDependents(packageId: string) {
  const dependentPackageIds = [...discoverInstalledCodexPluginDescriptors({
    failClosedOnCarrierError: true,
  }).values()]
    .flatMap((descriptor) => {
      if (descriptor.manifestPath !== path.join(descriptor.sourcePath, 'opl-package.json')) return [];
      const manifest = normalizePackageManifest(
        parseJsonText(fs.readFileSync(descriptor.manifestPath, 'utf8')),
        pathToFileURL(descriptor.manifestPath).toString(),
      );
      return manifest.capability_dependencies.some((dependency) =>
        dependency.required && dependency.package_id === packageId)
        ? [manifest.package_id]
        : [];
    })
    .sort();
  if (dependentPackageIds.length === 0) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Package uninstall is blocked by installed required dependents.',
    {
      package_id: packageId,
      action: 'uninstall',
      dependent_package_ids: dependentPackageIds,
      failure_code: 'agent_package_required_by_installed_dependents',
      uninstall_policy: 'uninstall_dependents_first',
    },
  );
}

async function maybeRunConfiguredCarrierLifecycle(input: {
  selectionInput: ConfiguredCarrierSelectionInput;
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>;
}) {
  const selected = await resolveFreshConfiguredCarrier(input.selectionInput, input.action);
  if (!selected) return null;
  const dryRun = input.selectionInput.dryRun === true;
  const targets = selected.targets.map((target) => ({
    ...target,
    descriptor: configuredCarrierTargetDescriptor(target.descriptor, input.action),
  }));
  const prestate = new Map(targets.map((target) => [
    target.descriptor.packageId,
    runConfiguredCodexPluginCarrier({ descriptor: target.descriptor, action: 'list' }),
  ]));
  const dispatched: FreshConfiguredCarrierTarget[] = [];
  const executions = new Map<string, ConfiguredCodexPluginCarrierReadback>();
  try {
    for (const target of targets) {
      dispatched.push(target);
      const carrier = runConfiguredCodexPluginCarrier({
        descriptor: target.descriptor,
        action: input.action,
        dryRun,
      });
      if (!dryRun) {
        assertConfiguredCarrierLifecycleTarget({
          action: input.action,
          target,
          readback: carrier,
        });
      }
      executions.set(target.descriptor.packageId, carrier);
    }
  } catch (error) {
    if (!dryRun && input.action === 'install') {
      compensateFreshConfiguredCarrierInstall({ dispatched, prestate });
    }
    throw error;
  }
  const rootCarrier = executions.get(selected.rootPackageId);
  if (!rootCarrier) {
    throw new FrameworkContractError('contract_shape_invalid', 'Native carrier closure omitted its root Package.', {
      package_id: selected.rootPackageId,
      failure_code: 'configured_codex_plugin_carrier_root_readback_missing',
    });
  }
  return {
    ...configuredCarrierLifecycleReadback({
      action: input.action,
      dryRun,
      carrier: rootCarrier,
    }),
    required_dependency_packages: targets
      .filter((target) => target.descriptor.packageId !== selected.rootPackageId)
      .map((target) => {
        const carrier = executions.get(target.descriptor.packageId)!;
        const readback = configuredCarrierLifecycleReadback({
          action: input.action,
          dryRun,
          carrier,
        });
        return {
          package_id: target.descriptor.packageId,
          status: readback.status,
          observed_version: carrier.installed_version,
          configured_carrier: carrier,
        };
      }),
  };
}

export async function runOplAgentPackageInstall(input: AgentPackageInstallInput) {
  assertNoExplicitRemoteFirstPartySource(input);
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'install',
  });
  if (configured) {
    const migration = legacyOplDocMigrationForFlow(input);
    return {
      version: 'g2',
      opl_agent_package_install: {
        surface_kind: 'opl_agent_package_install',
        ...configured,
        ...(migration ? { legacy_opl_doc_install_migration: migration } : {}),
      },
    };
  }
  throwPackageNativeOwnerRequired(input, 'install');
}

export async function runOplAgentPackageUpdate(input: AgentPackageInstallInput) {
  assertNoExplicitRemoteFirstPartySource(input);
  const descriptorOwned = await maybeRunDescriptorOwnedFirstPartyLifecycle({
    selectionInput: input,
    action: 'update',
  });
  if (descriptorOwned) {
    const migration = legacyOplDocMigrationForFlow(input);
    return migration
      ? {
          ...descriptorOwned,
          opl_agent_package_update: {
            ...descriptorOwned.opl_agent_package_update,
            legacy_opl_doc_install_migration: migration,
          },
        }
      : descriptorOwned;
  }
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'update',
  });
  if (configured) {
    const migration = legacyOplDocMigrationForFlow(input);
    return {
      version: 'g2',
      opl_agent_package_update: {
        surface_kind: 'opl_agent_package_update',
        ...configured,
        ...(migration ? { legacy_opl_doc_install_migration: migration } : {}),
      },
    };
  }
  throwPackageNativeOwnerRequired(input, 'update');
}

export async function runOplAgentPackageRepair(input: AgentPackageRepairInput) {
  assertNoExplicitRemoteFirstPartySource(input);
  const installedManagedPolicy = maybeRunInstalledManagedPolicyRepair(input);
  if (installedManagedPolicy) return installedManagedPolicy;
  const descriptorOwned = await maybeRunDescriptorOwnedFirstPartyLifecycle({
    selectionInput: input,
    action: 'repair',
  });
  if (descriptorOwned) {
    const migration = legacyOplDocMigrationForFlow(input);
    return migration
      ? {
          ...descriptorOwned,
          opl_agent_package_repair: {
            ...descriptorOwned.opl_agent_package_repair,
            legacy_opl_doc_install_migration: migration,
          },
        }
      : descriptorOwned;
  }
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'repair',
  });
  if (configured) {
    const migration = legacyOplDocMigrationForFlow(input);
    return {
      version: 'g2',
      opl_agent_package_repair: {
        surface_kind: 'opl_agent_package_repair',
        ...configured,
        ...(migration ? { legacy_opl_doc_install_migration: migration } : {}),
      },
    };
  }
  throwPackageNativeOwnerRequired(input, 'repair');
}

async function runOplAgentPackageActivateUnlocked(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const nativeActivationReadback = packageStatusForActivation({
    packageId,
    scope: input.scope,
    targetWorkspace: input.targetWorkspace,
    targetQuest: input.targetQuest,
  });
  const beforeStatus = nativeActivationReadback.packageStatus;
  const nativeCarrierState = packageNativeCarrierActivationState(beforeStatus);
  if (nativeCarrierState === 'ready') {
    const workspaceSkillProjection = resolveStandardAgent(packageId)
      && input.scope === 'workspace'
      && input.targetWorkspace
      ? refreshInstalledAgentPackageWorkspaceSkills({
          packageId,
          packageStatus: beforeStatus,
          targetWorkspace: input.targetWorkspace,
          dryRun: input.dryRun,
        })
      : null;
    if (workspaceSkillProjection
      && workspaceSkillProjection.status !== 'planned_no_write'
      && !workspaceSkillProjection.projection) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Package activation could not materialize its Workspace professional Skill closure.',
        {
          package_id: packageId,
          workspace_skill_projection: workspaceSkillProjection,
          failure_code: 'agent_package_workspace_skill_projection_unavailable',
        },
      );
    }
    return {
      version: 'g2',
      opl_agent_package_activation: {
        surface_kind: 'opl_agent_package_activation',
        status: input.dryRun ? 'validated_no_write' : 'already_activated',
        package_id: packageId,
        writes_performed: workspaceSkillProjection?.writes_performed === true,
        operational_ready: true,
        launch_allowed: true,
        launch_blocked_reason: null,
        launch_state_schema_version: beforeStatus.launch_state_schema_version,
        launch_state: beforeStatus.launch_state,
        launch_state_reason: beforeStatus.launch_state_reason,
        use_boundary_id: input.useBoundaryId ?? null,
        workspace_skill_projection: workspaceSkillProjection,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  if (nativeCarrierState === 'blocked') {
    throwNativeCarrierActivationBlocked(packageId, beforeStatus);
  }
  if (input.dryRun && beforeStatus.installed_package_count === 0) {
    const launchState = deriveAgentPackageLaunchState({
      installed: false,
      exposure_state: 'not_installed',
      operational_ready: false,
      launch_blocked_reason: 'package_not_installed',
    });
    return {
      version: 'g2',
      opl_agent_package_activation: {
        surface_kind: 'opl_agent_package_activation',
        status: 'validated_no_write',
        package_id: packageId,
        writes_performed: false,
        package_dependency_readiness: null,
        operational_ready: false,
        launch_allowed: false,
        launch_blocked_reason: 'package_not_installed',
        ...launchState,
        package_use_binding: null,
        use_boundary_id: input.useBoundaryId ?? null,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  throwPackageNativeOwnerRequired(input, 'activate');
}

function packageStatusForActivation(input: OplAgentPackageStatusInput) {
  const snapshot = readAgentPackageStatusSnapshot(input.packageId);
  const packageStatus = buildOplAgentPackageStatus(input, snapshot).opl_agent_package_status;
  return { packageStatus };
}

function packageNativeCarrierActivationState(
  packageStatus: any,
): 'ready' | 'blocked' | 'missing' {
  const nativeCarrierPresent = packageStatus.configured_carrier?.carrier?.kind === 'codex_plugin_manager'
    && packageStatus.configured_carrier.status === 'installed'
    && packageStatus.configured_carrier.carrier.precedence === 'exact_single_source';
  if (!nativeCarrierPresent) return 'missing';
  const descriptorReadiness = packageStatus.installed_readiness;
  if (descriptorReadiness) {
    return descriptorReadiness.installed === true
      && descriptorReadiness.callability === 'callable'
      && packageStatus.operational_ready === true
      && packageStatus.launch_allowed === true
      ? 'ready'
      : 'blocked';
  }
  return 'blocked';
}

function throwNativeCarrierActivationBlocked(packageId: string, packageStatus: any): never {
  const launchBlockedReason = stringValue(packageStatus.launch_blocked_reason)
    ?? stringValue(packageStatus.launch_state_reason)
    ?? 'native_carrier_not_ready';
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Package activation is blocked until the native carrier is callable and ready.',
    {
      package_id: packageId,
      launch_blocked_reason: launchBlockedReason,
      configured_carrier: packageStatus.configured_carrier,
      installed_readiness: packageStatus.installed_readiness,
      failure_code: 'agent_package_scope_activation_blocked',
    },
  );
}

export async function runOplAgentPackageActivate(input: AgentPackagePackageActionInput) {
  return runOplAgentPackageActivateUnlocked(input);
}

export async function runOplAgentPackageFrameworkLink(input: { agentRoot: string; dryRun?: boolean; checkOnly?: boolean }) {
  return {
    version: 'g2',
    opl_agent_package_framework_link: materializeStandardAgentFrameworkLink(input),
  };
}

export async function runOplAgentPackageUninstall(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'uninstall');
  assertNoNativeRequiredInstalledDependents(packageId);
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'remove',
  });
  if (configured) {
    return {
      version: 'g2',
      opl_agent_package_uninstall: {
        surface_kind: 'opl_agent_package_uninstall',
        ...configured,
      },
    };
  }
  throwPackageNativeOwnerRequired(input, 'uninstall');
}

export async function runOplAgentPackageExposureAction(
  action: 'hide' | 'unhide' | 'enable' | 'disable',
  input: AgentPackagePackageActionInput,
) {
  const packageId = requirePackageId(input.packageId, action);
  if (action === 'hide' || action === 'unhide') {
    const descriptor = discoverInstalledCodexPluginDescriptors({ packageId }).get(packageId) ?? null;
    if (descriptor) {
      const shortcutIds = descriptor.manifest.presentation?.home_shortcuts
        .filter((shortcut) => shortcut.user_configurable)
        .map((shortcut) => shortcut.shortcut_id) ?? [];
      if (shortcutIds.length === 0) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Native descriptor hide and unhide require at least one user-configurable Home shortcut.',
          {
            package_id: packageId,
            action,
            failure_code: 'agent_package_home_shortcut_not_configurable',
          },
        );
      }
      return withHomeShortcutPreferenceTransaction(
        input.dryRun === true,
        () => ({
          version: 'g2' as const,
          opl_agent_package_exposure: {
            surface_kind: 'opl_agent_package_exposure' as const,
            status: input.dryRun ? 'validated_no_write' : packageActionStatus(action),
            action,
            dry_run: input.dryRun === true,
            package_id: packageId,
            home_shortcut_preferences: updateHomeShortcutPreferences({
              packageId,
              shortcutIds,
              visible: action === 'unhide',
              dryRun: input.dryRun === true,
            }),
            authority_boundary: refsOnlyAuthorityBoundary(),
          },
        }),
      );
    }
  }
  if (action === 'enable' || action === 'disable') {
    const configured = await maybeRunConfiguredCarrierLifecycle({
      selectionInput: input,
      action,
    });
    if (configured) {
      return {
        version: 'g2',
        opl_agent_package_exposure: {
          surface_kind: 'opl_agent_package_exposure',
          action,
          ...configured,
        },
      };
    }
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Agent package exposure actions require a fresh installed native owner descriptor.',
    {
      package_id: packageId,
      action,
      failure_code: 'agent_package_exposure_native_owner_required',
    },
  );
}

function runOplAgentPackageHomeShortcutPreferencesSetUnlocked(input: AgentPackageHomeShortcutPreferencesSetInput) {
  const packageId = requirePackageId(input.packageId, 'home_shortcut_preferences_set');
  const shortcutId = stringValue(input.shortcutId);
  if (!shortcutId) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package Home shortcut preference requires shortcut_id.', {
      package_id: packageId,
      required: ['shortcut_id'],
    });
  }
  const stored = readHomeShortcutPreferenceFile();
  const updatedAt = nowIso();
  const nextEntry: AgentPackageStoredHomeShortcutPreference = {
    shortcut_id: shortcutId,
    package_id: packageId,
    visible: input.visible !== false,
    sort_order: typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder) ? input.sortOrder : null,
    source: 'user_preference',
    updated_at: updatedAt,
  };
  const nextPreferences = [
    nextEntry,
    ...stored.preferences.filter((entry) => !(entry.package_id === packageId && entry.shortcut_id === shortcutId)),
  ];
  const nextFile: AgentPackageHomeShortcutPreferenceFile = {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: updatedAt,
    preferences: nextPreferences,
  };
  if (!input.dryRun) {
    writeHomeShortcutPreferenceFile(nextFile);
  }
  return {
    version: 'g2',
    opl_agent_package_home_shortcut_preferences: {
      surface_kind: 'opl_agent_package_home_shortcut_preferences_set',
      status: input.dryRun ? 'validated_no_write' : 'preferences_updated',
      dry_run: input.dryRun === true,
      preference: nextEntry,
      preferences_file: resolveOplStatePaths().agent_package_home_shortcut_preferences_file,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageHomeShortcutPreferencesSet(input: AgentPackageHomeShortcutPreferencesSetInput) {
  return withHomeShortcutPreferenceTransaction(
    input.dryRun === true,
    () => runOplAgentPackageHomeShortcutPreferencesSetUnlocked(input),
  );
}

export type OplAgentPackageStatusInput = {
  packageId?: string | null;
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
  detail?: 'fast' | 'full';
};

function configuredCarrierReadbacks(
  installedCodexPluginDescriptors: ReadonlyMap<string, import('./agent-package-registry-parts/installed-codex-plugin-directory.ts').InstalledCodexPluginDescriptor>,
  packageId: string | null = null,
) {
  // Installed descriptor readback is the only ordinary status/list authority.
  // Registry cache remains a compatibility directory source and an explicit
  // lifecycle-selection fallback, but must not synthesize installed state.
  const readbacks = new Map<string, ConfiguredCodexPluginCarrierReadback>();
  const runner = createMemoizedCodexPluginListRunner();
  for (const discovered of installedCodexPluginDescriptors.values()) {
    if (packageId && discovered.manifest.package_id !== packageId) continue;
    readbacks.set(discovered.manifest.package_id, runConfiguredCodexPluginCarrier({
      descriptor: discovered.carrier,
      action: 'list',
      runner,
    }));
  }
  for (const [projectedPackageId, descriptor] of firstPartyConfiguredCarrierDescriptors()) {
    if (packageId && projectedPackageId !== packageId) continue;
    if (readbacks.has(projectedPackageId)) continue;
    readbacks.set(projectedPackageId, runConfiguredCodexPluginCarrier({
      descriptor,
      action: 'list',
      runner,
    }));
  }
  return readbacks;
}

function buildAgentPackageStatusSnapshot(
  installedCodexPluginDescriptors: ReturnType<typeof discoverInstalledCodexPluginDescriptors>,
  packageId: string | null = null,
) {
  const configuredCarriers = configuredCarrierReadbacks(installedCodexPluginDescriptors, packageId);
  const directory = buildAgentPackageDirectory({
    detail: 'fast',
    configuredCarrierReadbacks: configuredCarriers,
    installedCodexPluginDescriptors,
  });
  return {
    installedCodexPluginDescriptors,
    configuredCarriers,
    paths: resolveOplStatePaths(),
    homeShortcutPreferences: mergedHomeShortcutPreferences(directory),
  };
}

type DependencyProviderReadback = {
  manifest: Pick<AgentPackageManifest, 'package_id' | 'version' | 'capability_provider'>;
  manifest_sha256: string | null;
  content_digest: string | null;
  readiness: {
    installed: boolean;
    physical_status: 'available' | 'unavailable';
    callability: 'callable' | 'disabled';
    projection_callability?: 'callable' | 'disabled';
  };
};

function bundledFullRuntimeDependencyProviders() {
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const providers = new Map<string, DependencyProviderReadback>();
  if (!runtimeHome) return providers;
  const catalog = readBundledFullRuntimePackageCatalog();
  for (const entry of catalog.entries.values()) {
    const packageRoot = path.resolve(runtimeHome, entry.runtimeModuleRelativePath);
    if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) continue;
    const ownerManifestPath = path.join(packageRoot, 'opl-package.json');
    if (!fs.existsSync(ownerManifestPath) || !fs.statSync(ownerManifestPath).isFile()) continue;
    const manifestText = fs.readFileSync(ownerManifestPath, 'utf8');
    const manifest = normalizePackageManifest(
      parseJsonText(manifestText),
      pathToFileURL(ownerManifestPath).toString(),
    );
    if (manifest.codex_default_exposure !== false) continue;
    const requiredSkillIds = manifest.required_skill_ids;
    const skillsReady = requiredSkillIds.every((skillId) => (
      fs.existsSync(path.join(packageRoot, 'skills', skillId, 'SKILL.md'))
    ));
    providers.set(manifest.package_id, {
      manifest,
      manifest_sha256: sha256Text(manifestText),
      content_digest: manifest.content_digest ?? null,
      readiness: {
        installed: true,
        physical_status: skillsReady ? 'available' : 'unavailable',
        callability: skillsReady ? 'callable' : 'disabled',
      },
    });
  }
  return providers;
}

function descriptorDependencyReadinessFor(
  root: ReturnType<typeof discoverInstalledCodexPluginDescriptors> extends ReadonlyMap<string, infer V> ? V : never,
  installedCodexPluginDescriptors: ReturnType<typeof discoverInstalledCodexPluginDescriptors>,
) {
  const providers = bundledFullRuntimeDependencyProviders();
  for (const [packageId, descriptor] of installedCodexPluginDescriptors.entries()) {
    providers.set(packageId, {
      manifest: descriptor.manifest,
      manifest_sha256: descriptor.manifest_sha256,
      content_digest: descriptor.manifest.content_digest ?? null,
      readiness: descriptor.readiness,
    });
  }
  return descriptorDependencyReadiness({
    root: root.manifest,
    providers,
  });
}

function readAgentPackageStatusSnapshot(packageId?: string | null) {
  const installedCodexPluginDescriptors = discoverInstalledCodexPluginDescriptors();
  return buildAgentPackageStatusSnapshot(
    installedCodexPluginDescriptors,
    canonicalAgentPackageId(packageId),
  );
}

function agentPackageStatusReadbackStatus(input: {
  packageId: string | null;
  installedDescriptorPresent: boolean;
  configuredCarrierStatus: ConfiguredCodexPluginCarrierReadback['status'] | null;
  configuredCarrierPrecedence: ConfiguredCodexPluginCarrierReadback['carrier']['precedence'] | null;
  configuredCarrierLaunchGateRequired: boolean;
  operationalReady: boolean;
}) {
  if (
    input.packageId
    && !input.installedDescriptorPresent
    && input.configuredCarrierStatus === null
  ) return 'not_installed';
  if (
    input.packageId
    && input.configuredCarrierLaunchGateRequired
    && input.configuredCarrierStatus !== 'installed'
  ) {
    return input.configuredCarrierStatus === 'physical_unavailable'
      && input.configuredCarrierPrecedence === 'unavailable'
      ? 'attention_needed'
      : 'not_installed';
  }
  if (input.packageId && !input.operationalReady) return 'attention_needed';
  return 'available';
}

function buildOplAgentPackageStatus(
  input: OplAgentPackageStatusInput,
  snapshot: ReturnType<typeof readAgentPackageStatusSnapshot>,
) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const {
    paths,
    homeShortcutPreferences: allHomeShortcutPreferences,
    installedCodexPluginDescriptors,
    configuredCarriers,
  } = snapshot;
  const homeShortcutPreferences = allHomeShortcutPreferences
    .filter((entry) => !packageId || entry.package_id === packageId);
  const installedDescriptor = packageId
    ? installedCodexPluginDescriptors.get(packageId) ?? null
    : null;
  const configuredCarrier = packageId
    ? configuredCarriers.get(packageId) ?? null
    : null;
  const carrierReadiness = installedDescriptor?.readiness ?? null;
  const installedReadiness = carrierReadiness;
  const installedCarrierReadback = installedDescriptor?.carrier_readback ?? null;
  const packageDependencyReadiness = installedDescriptor
    ? descriptorDependencyReadinessFor(installedDescriptor, installedCodexPluginDescriptors)
    : null;
  const policyCurrentness = installedDescriptor
    ? managedPolicyCurrentnessFromDescriptor({
        manifest: {
          package_id: installedDescriptor.manifest.package_id,
          version: installedDescriptor.manifest.version,
          plugin_id: stringValue(installedDescriptor.manifest.codex_surface.plugin_id),
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
  const requiredPolicyDependenciesOperational = policyCurrentness.required_dependencies_operational !== false;
  const managedPolicyOperational = policyCurrentness.status === 'current'
    || policyCurrentness.status === 'not_requested'
    || policyCurrentness.status === 'drifted'
      ? requiredPolicyDependenciesOperational
      : false;
  const configuredCarrierReady = Boolean(
    configuredCarrier
    && configuredCarrier.status === 'installed'
    && configuredCarrier.executor.status === 'callable'
    && configuredCarrier.carrier.precedence === 'exact_single_source',
  );
  const neutralCarrierReady = Boolean(
    carrierReadiness
    && carrierReadiness.installed
    && carrierReadiness.physical_status === 'available'
    && carrierReadiness.callability === 'callable',
  );
  const configuredCarrierLaunchGateRequired = installedDescriptor
    ? installedDescriptor.manifest.package_role === 'standard_agent'
    : configuredCarrier !== null;
  const dependencyOperational = packageDependencyReadiness?.operational_ready !== false;
  const operationalReady = Boolean(
    neutralCarrierReady
    && (!configuredCarrierLaunchGateRequired || configuredCarrierReady)
    && dependencyOperational
    && managedPolicyOperational,
  );
  const dependencyBlockedReason = packageDependencyReadiness && !dependencyOperational
    ? `package_dependency_${packageDependencyReadiness.status}`
    : null;
  const launchBlockedReason = configuredCarrierLaunchGateRequired && !configuredCarrierReady
    ? configuredCarrier
      ? configuredCarrier.reason ?? 'configured_native_carrier_attention_needed'
      : 'package_not_installed'
    : carrierReadiness
      ? neutralCarrierReady
      ? dependencyBlockedReason
        ?? (managedPolicyOperational
          ? null
        : requiredPolicyDependenciesOperational
          ? `managed_policy_${policyCurrentness.status}`
          : 'managed_policy_required_dependency_unavailable')
      : carrierReadiness.physical_status !== 'available'
        ? 'carrier_source_unavailable'
        : carrierReadiness.callability !== 'callable'
          ? 'carrier_disabled'
          : 'carrier_not_installed'
      : 'installed_owner_descriptor_unavailable';
  const repairAction = launchBlockedReason
    ? !managedPolicyOperational
      ? policyCurrentness.repair_command
      : null
    : null;
  const unavailableReason = dependencyBlockedReason
    ?? (!requiredPolicyDependenciesOperational
          ? 'managed_policy_required_dependency_unavailable'
          : policyCurrentness.status === 'invalid'
          ? 'managed_policy_invalid'
          : null);
  const degradedReason = unavailableReason
    ? null
    : policyCurrentness.experience_baseline?.status === 'degraded'
      ? 'experience_baseline_degraded'
    : packageDependencyReadiness?.dependencies.some((dependency) => (
      !dependency.required && dependency.status !== 'current'
    ))
      ? 'optional_dependency_missing'
    : policyCurrentness.status === 'drifted' ? 'managed_policy_drifted' : null;
  const installed = configuredCarrierLaunchGateRequired
    ? configuredCarrier?.status === 'installed' && carrierReadiness?.installed === true
    : configuredCarrier?.status === 'installed' || carrierReadiness?.installed === true;
  const launchState = deriveAgentPackageLaunchState({
    installed,
    exposure_state: installed ? 'visible' : 'not_installed',
    operational_ready: operationalReady,
    launch_blocked_reason: operationalReady ? null : launchBlockedReason,
    degraded_reason: degradedReason,
    unavailable_reason: unavailableReason,
  });
  const globallyInstalledPackageIds = new Set([
    ...[...installedCodexPluginDescriptors.entries()]
      .filter(([installedPackageId, descriptor]) => (
        descriptor.readiness.installed
        && (
          descriptor.manifest.package_role !== 'standard_agent'
          || configuredCarriers.get(installedPackageId)?.status === 'installed'
        )
      ))
      .map(([installedPackageId]) => installedPackageId),
    ...[...configuredCarriers.entries()]
      .filter(([configuredPackageId, readback]) => (
        readback.status === 'installed'
        && installedCodexPluginDescriptors.get(configuredPackageId)?.manifest.package_role !== 'standard_agent'
      ))
      .map(([installedPackageId]) => installedPackageId),
  ]);
  return {
    version: 'g2',
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status',
      status: agentPackageStatusReadbackStatus({
        packageId,
        installedDescriptorPresent: installedDescriptor !== null,
        configuredCarrierStatus: configuredCarrier?.status ?? null,
        configuredCarrierPrecedence: configuredCarrier?.carrier.precedence ?? null,
        configuredCarrierLaunchGateRequired,
        operationalReady,
      }),
      package_id: packageId ?? null,
      agent_id: installedDescriptor?.manifest.agent_id ?? null,
      installed_package_count: packageId ? (installed ? 1 : 0) : globallyInstalledPackageIds.size,
      configured_carrier: configuredCarrier,
      installed_carrier_readback: installedCarrierReadback,
      installed_readiness: installedReadiness,
      codex_visible: installedDescriptor
        ? installedDescriptor.manifest.codex_default_exposure !== false
        : installed,
      package_dependency_readiness: packageDependencyReadiness as AgentPackageDependencyReadiness | null,
      carrier_authority_readiness: null as {
        status: 'not_required' | 'current' | 'invalid';
        reasons: string[];
      } | null,
      managed_policy_currentness: policyCurrentness,
      package_operational: {
        status: operationalReady ? 'operational' : 'unavailable',
        operational_ready: operationalReady,
        failure_reason: operationalReady ? null : launchBlockedReason,
        repair_command: operationalReady ? null : repairAction,
      },
      experience_baseline: policyCurrentness.experience_baseline ?? {
        status: 'not_declared',
        failure_ids: [],
        repair_command: null,
        capabilities: [],
      },
      specialized_capabilities: policyCurrentness.specialized_capabilities ?? {
        status: 'not_declared',
        repair_command: null,
        capabilities: [],
      },
      model_projection: policyCurrentness.model_projection,
      capability_strategy: policyCurrentness.capability_strategy,
      operational_ready: operationalReady,
      operational_ready_scope: installedDescriptor
        ? 'installed_carrier_presence_callability_dependency_closure_and_managed_policy'
        : 'configured_native_carrier_presence_callability_identity_and_precedence',
      launch_allowed: operationalReady,
      launch_blocked_reason: operationalReady ? null : launchBlockedReason,
      ...launchState,
      allowed_when_blocked: ['status', 'doctor', 'repair'],
      repair_action: repairAction,
      home_shortcut_preferences: homeShortcutPreferences,
      files: {
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function createOplAgentPackageStatusReader() {
  const installedCodexPluginDescriptors = discoverInstalledCodexPluginDescriptors();
  let snapshot: ReturnType<typeof buildAgentPackageStatusSnapshot> | null = null;
  return (input: OplAgentPackageStatusInput = {}) => {
    snapshot ??= buildAgentPackageStatusSnapshot(installedCodexPluginDescriptors);
    return buildOplAgentPackageStatus(input, snapshot);
  };
}

export function runOplAgentPackageStatus(input: OplAgentPackageStatusInput = {}) {
  return buildOplAgentPackageStatus(input, readAgentPackageStatusSnapshot(input.packageId));
}

export function listOplAgentPackages(input: {
  detail?: 'fast' | 'full';
  statusContext?: (packageId: string) => Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'> | null;
} = {}) {
  const detail = input.detail ?? 'fast';
  const paths = resolveOplStatePaths();
  const installedCodexPluginDescriptors = discoverInstalledCodexPluginDescriptors();
  const configuredCarriers = configuredCarrierReadbacks(installedCodexPluginDescriptors);
  const directoryReadback = buildAgentPackageDirectory({
    detail,
    configuredCarrierReadbacks: configuredCarriers,
    installedCodexPluginDescriptors,
    actionContext: input.statusContext,
  });
  const directory = directoryReadback;
  const homeShortcutPreferences = mergedHomeShortcutPreferences(directory);
  return {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      status: 'available',
      directory,
      installed_package_count: new Set([
        ...[...configuredCarriers.entries()]
          .filter(([, readback]) => readback.status === 'installed')
          .map(([packageId]) => packageId),
      ]).size,
      configured_carriers: [...configuredCarriers.values()],
      home_shortcut_preferences: homeShortcutPreferences,
      files: {
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

function readInstalledOwnerProfileDefault() {
  const descriptors = discoverInstalledOwnerProfileDescriptors();
  if (descriptors.length === 0) {
    return {
      surface_kind: 'opl_flow_default_user_instructions.v1' as const,
      source: 'installed_owner_descriptor' as const,
      source_path: null,
      source_root: null,
      package_version: null,
      status: 'unavailable' as const,
      reason: 'opl_flow_package_not_installed' as const,
      content: null,
      sha256: null,
    };
  }
  if (descriptors.length !== 1) {
    return {
      surface_kind: 'opl_flow_default_user_instructions.v1' as const,
      source: 'installed_owner_descriptor' as const,
      source_path: null,
      source_root: null,
      package_version: null,
      status: 'invalid' as const,
      reason: 'installed_owner_profile_descriptor_ambiguous' as const,
      content: null,
      sha256: null,
    };
  }

  const descriptor = descriptors[0]!;
  const sourceRoot = descriptor.sourcePath;
  const declaredSourcePath = descriptor.manifest.profile_surface!.runtime_profile.source_path;
  const base = {
    surface_kind: 'opl_flow_default_user_instructions.v1' as const,
    source: 'installed_owner_descriptor' as const,
    source_path: path.resolve(sourceRoot, declaredSourcePath),
    source_root: sourceRoot,
    package_version: descriptor.manifest.version,
  };
  try {
    const sourceRootRealPath = fs.realpathSync(sourceRoot);
    if (!fs.statSync(sourceRootRealPath).isDirectory()) {
      throw new Error('Installed owner descriptor source root is not a directory.');
    }
    const sourcePath = path.resolve(sourceRootRealPath, declaredSourcePath);
    const sourcePathRealPath = fs.realpathSync(sourcePath);
    if (!sourcePathRealPath.startsWith(`${sourceRootRealPath}${path.sep}`)
      || !fs.statSync(sourcePathRealPath).isFile()) {
      throw new Error('Installed owner profile source escaped its descriptor root.');
    }
    const content = fs.readFileSync(sourcePathRealPath, 'utf8');
    return {
      ...base,
      source_path: sourcePathRealPath,
      status: 'available' as const,
      reason: null,
      content,
      sha256: sha256Text(content),
    };
  } catch {
    return {
      ...base,
      status: 'invalid' as const,
      reason: 'installed_owner_profile_source_missing_or_invalid' as const,
      content: null,
      sha256: null,
    };
  }
}

export function readOplFlowDefaultUserInstructions() {
  return readInstalledOwnerProfileDefault();
}

function readInstalledOplFlowManagedPolicyDependencies(): AgentPackageManagedPolicyDependency[] {
  const descriptor = discoverInstalledCodexPluginDescriptors().get('opl-flow');
  const policySurface = descriptor?.manifest.managed_policy_surface;
  if (!descriptor || !policySurface) return [];
  try {
    const sourceRoot = fs.realpathSync(descriptor.sourcePath);
    const policyPath = path.resolve(sourceRoot, policySurface.source_path);
    const policyRealPath = fs.realpathSync(policyPath);
    if (!policyRealPath.startsWith(`${sourceRoot}${path.sep}`)
      || !fs.statSync(policyRealPath).isFile()) {
      return [];
    }
    const policy = JSON.parse(fs.readFileSync(policyRealPath, 'utf8')) as unknown;
    if (!isRecord(policy) || !isRecord(policy.package) || policy.package.id !== 'opl-flow') {
      return [];
    }
    if (!Array.isArray(policy.requires)) return [];
    return policy.requires.flatMap((value) => {
      if (!isRecord(value) || typeof value.id !== 'string' || typeof value.kind !== 'string') {
        return [];
      }
      if (!['base', 'codex_skill', 'codex_plugin', 'mcp_server', 'cli', 'runtime_capability'].includes(value.kind)) {
        return [];
      }
      if (typeof value.online_install_default !== 'boolean'
        || typeof value.activation !== 'string'
        || !['always', 'task_routed', 'explicit'].includes(value.activation)) {
        return [];
      }
      return [{
        id: value.id,
        kind: value.kind as AgentPackageManagedPolicyDependency['kind'],
        offline_bundle: value.offline_bundle === 'full' ? 'full' : 'none',
        online_install_default: value.online_install_default,
        activation: value.activation as AgentPackageManagedPolicyDependency['activation'],
        source: typeof value.source === 'string' ? value.source : undefined,
        source_path: typeof value.source_path === 'string' ? value.source_path : undefined,
        owner: typeof value.owner === 'string' ? value.owner : undefined,
        version_requirement: typeof value.version_requirement === 'string'
          ? value.version_requirement
          : undefined,
        install_source: typeof value.install_source === 'string' ? value.install_source : undefined,
        lifecycle_owner: typeof value.lifecycle_owner === 'string' ? value.lifecycle_owner : undefined,
        conflict_policy: typeof value.conflict_policy === 'string'
          ? value.conflict_policy as AgentPackageManagedPolicyDependency['conflict_policy']
          : undefined,
        credential_policy: typeof value.credential_policy === 'string'
          ? value.credential_policy as AgentPackageManagedPolicyDependency['credential_policy']
          : undefined,
        relationship: 'required' as const,
      }];
    });
  } catch {
    return [];
  }
}

export function readOplFlowManagedDependencyIds() {
  return [...new Set(
    readInstalledOplFlowManagedPolicyDependencies().map((dependency) => dependency.id),
  )];
}

export function readOplFlowManagedDependencies() {
  return readInstalledOplFlowManagedPolicyDependencies().map((dependency) => ({
    dependency_id: dependency.id,
    dependency_kind: dependency.kind,
    activation: dependency.activation,
    offline_bundle: dependency.offline_bundle ?? 'none',
    online_install_default: dependency.online_install_default,
    source: dependency.source ?? null,
    lifecycle_owner: dependency.lifecycle_owner
      ?? (dependency.kind === 'codex_skill' ? 'opl_packages' : 'opl_base'),
    update_mode: dependency.online_install_default ? 'silent_managed' : 'detect_only_guidance',
    observed_status: null,
    installed: dependency.kind === 'base' ? true : null,
  }));
}
