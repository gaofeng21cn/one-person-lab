import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { canonicalAgentPackageId, publicAgentPackageSelector } from './agent-package-identity.ts';
import {
  assertFirstPartyPackageCatalogVersion,
  resolveFirstPartyPackageCatalog,
} from './agent-package-first-party.ts';
import { materializeStandardAgentFrameworkLink } from './standard-agent-framework-link.ts';
import type { ManagedModulePackageChannelSelection } from './system-installation/module-package-channel.ts';
import { FORBIDDEN_AGENT_PACKAGE_FIELDS, MANIFEST_REQUIRED_FIELDS } from './agent-package-registry-parts/constants.ts';
import {
  assertManifestMatchesRegistrySelection,
  assertTrustTierAssigned,
  fetchAndValidateRegistry,
  resolveManifestSelection,
} from './agent-package-registry-parts/selection.ts';
import {
  assertPermissionScopeUnchanged,
  buildLock,
  cleanupPreviousPhysicalSurface,
  lifecycleReceipt,
  packageActionSourceSha256,
  packageActionStatus,
  packageLockRef,
  requireInstalledPackage,
  requirePackageId,
} from './agent-package-registry-parts/lifecycle-lock.ts';
import {
  homeShortcutPreferenceSourceSha256,
  mergedHomeShortcutPreferences,
  readHomeShortcutPreferenceFile,
  writeHomeShortcutPreferenceFile,
} from './agent-package-registry-parts/home-shortcuts.ts';
import { normalizeManifest, normalizePackageManifest } from './agent-package-registry-parts/manifest-normalizers.ts';
import {
  assertNoRequiredInstalledDependents,
  dependencyClosureDigest,
  dependencyReadiness,
  manifestContentDigest,
  validateCapabilityProvider,
  verifyManifestContentLock,
} from './agent-package-registry-parts/dependency-closure.ts';
import {
  catalogManifestPayload,
  fetchManagedPackageCatalog,
  selectCapabilityCatalogVersion,
  selectManagedCatalogPackageVersion,
  selectRootCatalogVersion,
  type ManagedCatalogVersion,
  type ManagedPackageCatalog,
} from './agent-package-registry-parts/capability-reconciliation.ts';
import {
  materializeCapabilityScope,
  materializeCapabilityScopeFromLock,
  finalizeCapabilityScopeTransaction,
  packageScopeTarget,
  rollbackCapabilityScopeTransaction,
  scopeMaterializationReadiness,
} from './agent-package-registry-parts/scope-materialization.ts';
import {
  cleanupUnreferencedPackagePayloadSources,
  materializePhysicalCodexSurface,
  removePhysicalCodexSurface,
  rematerializePhysicalCodexSurfaceFromLock,
  rollbackManagedPolicySurface,
  rollbackNewPackageProfileSurface,
  resolveManifestPhysicalSource,
} from './agent-package-registry-parts/physical-surface.ts';
import {
  applyPackageProfile,
  assertPackageProfileRollbackReady,
  finalizePackageProfileRollback,
  rollbackPackageProfileMigration,
} from './agent-package-registry-parts/profile-surface.ts';
import {
  assertManagedPolicyRollbackReady,
  finalizeManagedPolicyRollback,
  rollbackManagedPolicyMigration,
} from './agent-package-registry-parts/managed-policy-surface.ts';
import {
  applyManagedRuntimeSourceCarrier,
  finalizeManagedRuntimeSourceMutation,
  managedRuntimeSourceReadiness,
  recoverManagedRuntimeSourceTransactions,
  removeManagedRuntimeSourceCarrier,
  restoreManagedRuntimeSourceCarrier,
  rollbackManagedRuntimeSourceMutation,
} from './agent-package-registry-parts/managed-runtime-source-carrier.ts';
import {
  agentPackageLifecycleSummaryReadback,
  ownerRouteReadback,
} from './agent-package-registry-parts/readback.ts';
import {
  fetchJsonSource,
  normalizeSourceKind,
  nowIso,
  refsOnlyAuthorityBoundary,
  sha256Text,
} from './agent-package-registry-parts/shared.ts';
import {
  appendReceipt,
  readLifecycleLedger,
  readLockIndex,
  readRegistryCache,
  writeLockIndex,
  writePackageTransaction,
  writeRegistryCache,
} from './agent-package-registry-parts/store.ts';
import type {
  AgentPackageHomeShortcutPreference,
  AgentPackageHomeShortcutPreferenceFile,
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageLifecycleReceipt,
  AgentPackageLastKnownGood,
  AgentPackageLock,
  AgentPackageManifestValidateInput,
  AgentPackageManifest,
  AgentPackageManagedVersionCatalogSource,
  AgentPackagePackageActionInput,
  AgentPackagePhysicalSurface,
  AgentPackageScopeMaterialization,
  AgentPackageProfileApplyInput,
  AgentPackageRepairInput,
  AgentPackageRegistryRefreshInput,
} from './agent-package-registry-parts/types.ts';

export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageManifestValidateInput,
  AgentPackagePackageActionInput,
  AgentPackageProfileApplyInput,
  AgentPackageRepairInput,
  AgentPackageRegistryRefreshInput,
} from './agent-package-registry-parts/types.ts';

type PreparedPackage = {
  selection: Awaited<ReturnType<typeof resolveManifestSelection>>;
  manifest: AgentPackageManifest;
  manifestSha256: string;
  sourceKind: ReturnType<typeof normalizeSourceKind>;
  trustTier: string;
  previousLock: AgentPackageLock | null;
  catalogVersion: ManagedCatalogVersion | null;
  packageChannelSelection: ManagedModulePackageChannelSelection | null;
};

function packageChannelSelection(
  packageId: string,
  version: ManagedCatalogVersion | null | undefined,
): ManagedModulePackageChannelSelection | null {
  if (!version) return null;
  if (!version.source_artifact_ref
    || !version.artifact_digest
    || version.artifact_status !== 'published_immutable'
    || !version.package_content_digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package catalog immutable selection is incomplete.', {
      package_id: packageId,
      package_version: version.package_version,
      source_artifact_ref: version.source_artifact_ref,
      artifact_digest: version.artifact_digest,
      artifact_status: version.artifact_status,
      package_content_digest: version.package_content_digest,
      failure_code: 'agent_package_catalog_immutable_selection_incomplete',
    });
  }
  return {
    package_id: packageId,
    package_version: version.package_version,
    source_artifact_ref: version.source_artifact_ref,
    artifact_digest: version.artifact_digest,
    artifact_status: 'published_immutable',
    package_content_digest: version.package_content_digest,
    owner_source_commit: version.owner_source_commit,
  };
}

function readRecoveredLockIndex() {
  const index = readLockIndex();
  return {
    index,
    runtimeSourceRecovery: recoverManagedRuntimeSourceTransactions(index),
  };
}

function retainLastKnownGoodPerRoot(
  entries: AgentPackageLastKnownGood[],
  next: AgentPackageLastKnownGood,
) {
  const counts = new Map<string, number>();
  return [next, ...entries].filter((entry) => {
    const count = counts.get(entry.root_package_id) ?? 0;
    counts.set(entry.root_package_id, count + 1);
    return count < 4;
  });
}

async function applyManifestPackageLock(
  input: AgentPackageInstallInput,
  action: 'install' | 'update' | 'repair',
  options: {
    catalog?: ManagedPackageCatalog | null;
    rootVersion?: ManagedCatalogVersion | null;
    catalogSource?: AgentPackageManagedVersionCatalogSource | null;
    channelRef?: string | null;
    channelDigest?: string | null;
  } = {},
) {
  const packageId = canonicalAgentPackageId(stringValue(input.packageId));
  const { index } = readRecoveredLockIndex();
  const existingLock = packageId
    ? index.packages.find((entry) => entry.package_id === packageId)
    : null;
  if (action !== 'install' && existingLock?.source_kind === 'developer_checkout_override') {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout agent package sources require an explicit install after checkout review.', {
      package_id: existingLock.package_id,
      action,
      source_kind: existingLock.source_kind,
      failure_code: 'agent_package_developer_checkout_auto_update_forbidden',
      manual_confirmation_path: 'review the checkout and run an explicit install with --source-kind developer_checkout_override and --agent-root',
    });
  }
  const hasExplicitSource = Boolean(stringValue(input.manifestUrl) || stringValue(input.registryUrl));
  const hasResolvedCatalogSelection = Boolean(
    options.catalog
    && options.rootVersion
    && options.catalogSource,
  );
  const shouldUseFirstPartyCatalog = (!hasExplicitSource || hasResolvedCatalogSelection)
    && Boolean(packageId)
    && (
      action === 'install'
      || existingLock?.source_kind === 'first_party_managed_cohort'
      || existingLock?.source_kind === 'bundled_full_runtime_modules'
      || (
        existingLock?.source_kind === 'local_manifest_file'
        && existingLock.manifest_url.replaceAll('\\', '/').endsWith(
          `/contracts/opl-framework/packages/${packageId}.json`,
        )
      )
    );
  const firstParty = shouldUseFirstPartyCatalog
    ? resolveFirstPartyPackageCatalog(packageId)
    : null;
  let catalog = options.catalog ?? null;
  let rootVersion = options.rootVersion ?? null;
  let catalogSource = options.catalogSource ?? firstParty?.catalogSource ?? null;
  let channelRef = options.channelRef ?? null;
  let channelDigest = options.channelDigest ?? null;
  if (firstParty && (!catalog || !rootVersion)) {
    const fetched = await fetchManagedPackageCatalog(firstParty.catalogSource);
    catalog = fetched.catalog;
    rootVersion = selectManagedCatalogPackageVersion(catalog, firstParty.canonicalId);
    catalogSource = firstParty.catalogSource;
    channelRef = fetched.channel_ref;
    channelDigest = fetched.channel_digest;
  }
  if (firstParty && rootVersion) {
    assertFirstPartyPackageCatalogVersion(firstParty.canonicalId, rootVersion);
  }
  const selection = firstParty && rootVersion
    ? {
        registryUrl: null,
        packageId: firstParty.canonicalId,
        manifestUrl: rootVersion.manifest_url,
        trustTier: firstParty.trustTier,
        registryEntry: null,
      }
    : action !== 'install'
    && !stringValue(input.manifestUrl)
    && !stringValue(input.registryUrl)
    && existingLock
    ? {
        registryUrl: null,
        packageId,
        manifestUrl: existingLock.manifest_url,
        trustTier: existingLock.trust_tier,
        registryEntry: null,
      }
    : await resolveManifestSelection(input);
  if (packageId && action !== 'install') {
    assertNoRequiredInstalledDependents(index, packageId, action);
  }

  async function preparePackage(
    nextSelection: Awaited<ReturnType<typeof resolveManifestSelection>>,
    inheritedTrustTier?: string,
    catalogVersion?: ManagedCatalogVersion | null,
  ): Promise<PreparedPackage> {
    if (firstParty && catalogVersion) {
      assertFirstPartyPackageCatalogVersion(nextSelection.packageId ?? firstParty.canonicalId, catalogVersion);
    }
    const inlinePayload = catalogVersion ? catalogManifestPayload(catalogVersion) : null;
    const fetched = inlinePayload
      ? {
          payload: inlinePayload,
          source_sha256: catalogVersion!.manifest_sha256.replace(/^sha256:/, ''),
        }
      : await fetchJsonSource(nextSelection.manifestUrl);
    if (catalogVersion
      && `sha256:${fetched.source_sha256.replace(/^sha256:/, '')}` !== catalogVersion.manifest_sha256) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog manifest bytes do not match the selected digest.', {
        package_id: nextSelection.packageId,
        package_version: catalogVersion.package_version,
        failure_code: 'agent_package_catalog_manifest_digest_mismatch',
      });
    }
    let manifest = normalizePackageManifest(fetched.payload, nextSelection.manifestUrl);
    if (!nextSelection.registryEntry
      && nextSelection.packageId
      && manifest.package_id !== nextSelection.packageId) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog selection and package manifest identity must match.', {
        selected_package_id: nextSelection.packageId,
        manifest_package_id: manifest.package_id,
        failure_code: 'agent_package_catalog_package_id_mismatch',
      });
    }
    if (catalogVersion && manifest.version !== catalogVersion.package_version) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog selection and package manifest version must match.', {
        package_id: manifest.package_id,
        catalog_package_version: catalogVersion.package_version,
        manifest_package_version: manifest.version,
        failure_code: 'agent_package_catalog_version_mismatch',
      });
    }
    if (catalogVersion?.content_digest
      && manifestContentDigest(manifest, fetched.source_sha256) !== catalogVersion.content_digest) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog content digest does not match the selected package manifest.', {
        package_id: manifest.package_id,
        package_version: manifest.version,
        catalog_content_digest: catalogVersion.content_digest,
        manifest_content_digest: manifestContentDigest(manifest, fetched.source_sha256),
        failure_code: 'agent_package_catalog_content_digest_mismatch',
      });
    }
    if (catalogVersion && catalogSource) {
      manifest = { ...manifest, managed_update_source: catalogSource };
    }
    let inlinePayloadRoot: string | null = null;
    if (catalogVersion?.payload_manifest_json) {
      inlinePayloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-inline-package-payload-'));
      const payloadPath = path.join(inlinePayloadRoot, 'payload.json');
      fs.writeFileSync(payloadPath, catalogVersion.payload_manifest_json, 'utf8');
      manifest = { ...manifest, plugin_source_path: null, plugin_payload_manifest_url: payloadPath };
    }
    const immutableSelection = packageChannelSelection(manifest.package_id, catalogVersion);
    try {
      manifest = await resolveManifestPhysicalSource(
        manifest,
        input.dryRun === true,
        immutableSelection,
      );
    } finally {
      if (inlinePayloadRoot) fs.rmSync(inlinePayloadRoot, { recursive: true, force: true });
    }
    if (!(input.dryRun === true && manifest.plugin_payload_manifest_url && !immutableSelection)) {
      verifyManifestContentLock(manifest);
    }
    assertManifestMatchesRegistrySelection(manifest, nextSelection);
    const requestedTrustTier = stringValue(input.trustTier);
    if (firstParty && requestedTrustTier && requestedTrustTier !== firstParty.trustTier) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party catalog packages use the fixed first_party trust tier.', {
        package_id: manifest.package_id,
        requested_trust_tier: requestedTrustTier,
        required_trust_tier: firstParty.trustTier,
        failure_code: 'first_party_package_trust_tier_override_forbidden',
      });
    }
    const trustTier = firstParty
      ? firstParty.trustTier
      : requestedTrustTier ?? nextSelection.trustTier ?? inheritedTrustTier ?? null;
    assertTrustTierAssigned(trustTier, nextSelection.manifestUrl);
    if (firstParty && input.sourceKind && input.sourceKind !== firstParty.sourceKind) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party catalog packages use the managed cohort source kind.', {
        package_id: manifest.package_id,
        requested_source_kind: input.sourceKind,
        required_source_kind: firstParty.sourceKind,
        failure_code: 'first_party_package_source_kind_override_forbidden',
      });
    }
    const sourceKind = normalizeSourceKind(
      firstParty && catalogVersion ? firstParty.sourceKind : input.sourceKind,
      nextSelection.manifestUrl,
    );
    return {
      selection: nextSelection,
      manifest,
      manifestSha256: fetched.source_sha256,
      sourceKind,
      trustTier,
      previousLock: index.packages.find((entry) => entry.package_id === manifest.package_id) ?? null,
      catalogVersion: catalogVersion ?? null,
      packageChannelSelection: immutableSelection,
    };
  }

  const root = await preparePackage(selection, undefined, rootVersion);
  if (root.previousLock && action === 'install') {
    assertNoRequiredInstalledDependents(index, root.manifest.package_id, 'install');
  }
  if (root.sourceKind === 'developer_checkout_override' && action !== 'install') {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout agent package sources are Developer Profile inputs and must not auto-update.', {
      package_id: root.manifest.package_id,
      action,
      source_kind: root.sourceKind,
      failure_code: 'agent_package_developer_checkout_auto_update_forbidden',
      manual_confirmation_path: 'review the checkout and run an explicit install from the selected manifest when intended',
    });
  }
  if (action !== 'install' && !root.previousLock) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent package ${action} requires an installed package lock.`, {
      package_id: root.manifest.package_id,
      action,
      failure_code: 'agent_package_lock_missing',
    });
  }

  const preparedById = new Map<string, PreparedPackage>();
  const visiting = new Set<string>();
  const ordered: PreparedPackage[] = [];
  async function visit(prepared: PreparedPackage) {
    if (preparedById.has(prepared.manifest.package_id)) return;
    if (visiting.has(prepared.manifest.package_id)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package capability dependency graph contains a cycle.', {
        package_id: prepared.manifest.package_id,
        failure_code: 'agent_package_dependency_cycle',
      });
    }
    visiting.add(prepared.manifest.package_id);
    for (const dependency of prepared.manifest.capability_dependencies) {
      let dependencySelection: Awaited<ReturnType<typeof resolveManifestSelection>>;
      let catalogVersion: ManagedCatalogVersion | null = null;
      if (catalog) {
        catalogVersion = selectCapabilityCatalogVersion(catalog, dependency);
        dependencySelection = {
          registryUrl: prepared.selection.registryUrl,
          packageId: dependency.package_id,
          manifestUrl: catalogVersion.manifest_url,
          trustTier: prepared.trustTier,
          registryEntry: null,
        };
      } else if (dependency.bootstrap_manifest_url) {
        dependencySelection = {
          registryUrl: prepared.selection.registryUrl,
          packageId: dependency.package_id,
          manifestUrl: dependency.bootstrap_manifest_url,
          trustTier: prepared.trustTier,
          registryEntry: null,
        };
      } else if (prepared.selection.registryUrl) {
        dependencySelection = await resolveManifestSelection({
          registryUrl: prepared.selection.registryUrl,
          packageId: dependency.package_id,
        });
      } else {
        const installedDependency = index.packages.find((entry) => entry.package_id === dependency.package_id);
        if (!installedDependency) {
          throw new FrameworkContractError('contract_shape_invalid', 'Required capability dependency has no resolvable provider manifest.', {
            package_id: prepared.manifest.package_id,
            dependency_package_id: dependency.package_id,
            failure_code: 'agent_package_dependency_manifest_unresolved',
          });
        }
        dependencySelection = {
          registryUrl: null,
          packageId: dependency.package_id,
          manifestUrl: installedDependency.manifest_url,
          trustTier: installedDependency.trust_tier,
          registryEntry: null,
        };
      }
      const provider = await preparePackage(dependencySelection, prepared.trustTier, catalogVersion);
      const resolved = validateCapabilityProvider(dependency, provider.manifest, provider.manifestSha256);
      resolved.manifest_url = dependencySelection.manifestUrl;
      await visit(provider);
    }
    visiting.delete(prepared.manifest.package_id);
    preparedById.set(prepared.manifest.package_id, prepared);
    ordered.push(prepared);
  }
  await visit(root);

  for (const prepared of ordered) {
    assertPermissionScopeUnchanged(prepared.previousLock, prepared.manifest, action === 'install' ? 'install' : 'update');
    materializePhysicalCodexSurface(prepared.manifest, true, {
      keepMigrationIds: input.keepMigrationIds,
    });
  }

  const frameworkLink = input.agentRoot
    ? materializeStandardAgentFrameworkLink({ agentRoot: input.agentRoot, dryRun: input.dryRun })
    : null;

  const physicalSurfaces = new Map<string, ReturnType<typeof materializePhysicalCodexSurface>>();
  try {
    for (const prepared of ordered) {
      physicalSurfaces.set(
        prepared.manifest.package_id,
        materializePhysicalCodexSurface(prepared.manifest, input.dryRun === true, {
          keepMigrationIds: input.keepMigrationIds,
        }),
      );
    }
  } catch (error) {
    for (const prepared of [...ordered].reverse()) {
      const surface = physicalSurfaces.get(prepared.manifest.package_id);
      if (surface && !input.dryRun) {
        removePhysicalCodexSurface(surface, false, prepared.manifest.package_id, {
          retainPayloadSource: Boolean(
            surface.plugin_payload_cache_path
            && surface.plugin_payload_cache_path === prepared.previousLock?.physical_surface?.plugin_payload_cache_path,
          ),
        });
        rollbackManagedPolicySurface(surface);
        rollbackNewPackageProfileSurface(surface);
      }
    }
    for (const prepared of ordered) {
      if (prepared.previousLock && !input.dryRun) rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
    }
    throw error;
  }

  const runtimeSourceMutations = new Map<string, ReturnType<typeof applyManagedRuntimeSourceCarrier>>();
  try {
    for (const prepared of ordered) {
      runtimeSourceMutations.set(prepared.manifest.package_id, applyManagedRuntimeSourceCarrier({
        config: prepared.manifest.runtime_source_carrier,
        previous: prepared.previousLock?.managed_runtime_source,
        action,
        dryRun: input.dryRun === true,
        packageId: prepared.manifest.package_id,
        sourceKind: prepared.sourceKind,
        checkoutPath: prepared.manifest.package_id === root.manifest.package_id
          ? input.agentRoot
          : null,
        packageChannelSelection: prepared.packageChannelSelection,
        transactionId: sha256Text([
          'runtime-source',
          action,
          prepared.manifest.package_id,
          prepared.manifestSha256,
          prepared.previousLock?.lock_ref ?? '',
        ].join('\n')).slice(0, 24),
      }));
    }
  } catch (error) {
    if (!input.dryRun) {
      for (const mutation of [...runtimeSourceMutations.values()].reverse()) {
        rollbackManagedRuntimeSourceMutation(mutation);
      }
      for (const prepared of [...ordered].reverse()) {
        const surface = physicalSurfaces.get(prepared.manifest.package_id);
        if (!surface) continue;
        removePhysicalCodexSurface(surface, false, prepared.manifest.package_id, { retainPayloadSource: true });
        rollbackManagedPolicySurface(surface);
        rollbackNewPackageProfileSurface(surface);
      }
      for (const prepared of ordered) {
        if (prepared.previousLock) rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
      }
    }
    throw error;
  }
  if (!input.dryRun
    && process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED === '1'
    && process.env.OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_APPLY === '1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Injected interruption after runtime source activation.', {
      failure_code: 'test_runtime_source_interrupted_after_apply',
    });
  }

  const builtLocks = new Map<string, AgentPackageLock>();
  for (const prepared of ordered) {
    const resolvedDependencies = prepared.manifest.capability_dependencies.map((dependency) => {
      const providerLock = builtLocks.get(dependency.package_id);
      if (!providerLock) {
        throw new FrameworkContractError('contract_shape_invalid', 'Resolved dependency lock is missing from the prepared closure.', {
          package_id: prepared.manifest.package_id,
          dependency_package_id: dependency.package_id,
          failure_code: 'agent_package_dependency_lock_missing',
        });
      }
      return {
        package_id: dependency.package_id,
        required: dependency.required,
        version_requirement: dependency.version_requirement,
        capability_abi: dependency.capability_abi,
        required_export_ids: dependency.required_export_ids,
        required_module_ids: dependency.required_module_ids,
        installed_version: providerLock.package_version,
        manifest_url: providerLock.manifest_url,
        manifest_sha256: providerLock.manifest_sha256,
        source_artifact_ref: providerLock.source_artifact_ref ?? null,
        artifact_digest: providerLock.artifact_digest ?? null,
        owner_source_commit: providerLock.owner_source_commit ?? null,
        content_digest: providerLock.content_digest,
        package_lock_ref: providerLock.lock_ref,
      };
    });
    builtLocks.set(prepared.manifest.package_id, buildLock({
      manifest: prepared.manifest,
      manifestUrl: prepared.selection.manifestUrl,
      manifestSha256: prepared.manifestSha256,
      sourceKind: prepared.sourceKind,
      trustTier: prepared.trustTier,
      receiptRef: 'pending_dependency_transaction',
      physicalSurface: physicalSurfaces.get(prepared.manifest.package_id)!,
      previousLock: prepared.previousLock,
      resolvedDependencies,
      managedRuntimeSource: runtimeSourceMutations.get(prepared.manifest.package_id)?.after ?? null,
      sourceArtifactRef: prepared.catalogVersion?.source_artifact_ref ?? prepared.previousLock?.source_artifact_ref ?? null,
      artifactDigest: prepared.catalogVersion?.artifact_digest ?? prepared.previousLock?.artifact_digest ?? null,
      ownerSourceCommit: prepared.catalogVersion?.owner_source_commit ?? prepared.previousLock?.owner_source_commit ?? null,
      releaseChannelRef: prepared.catalogVersion ? channelRef : prepared.previousLock?.release_channel_ref ?? null,
      releaseChannelDigest: prepared.catalogVersion ? channelDigest : prepared.previousLock?.release_channel_digest ?? null,
    }));
  }
  const locks = [...builtLocks.values()];
  const closureDigest = dependencyClosureDigest(locks);
  const transactionId = sha256Text([
    action,
    root.manifest.package_id,
    closureDigest,
    ...ordered.map((entry) => entry.previousLock?.dependency_closure_digest ?? ''),
  ].join('\n'));
  const scopeMaterializations: AgentPackageScopeMaterialization[] = [];
  const explicitScopeTarget = packageScopeTarget(input);
  const scopeTargets = input.scope && explicitScopeTarget
    ? [{ scope: input.scope, targetRoot: explicitScopeTarget }]
    : action === 'install'
      ? []
      : (root.previousLock?.scope_materializations ?? []).map((entry) => ({
          scope: entry.scope,
          targetRoot: entry.target_root,
        })).filter((entry, index, entries) => entries.findIndex((candidate) =>
          candidate.scope === entry.scope && candidate.targetRoot === entry.targetRoot) === index);
  if (scopeTargets.length > 0) {
    try {
      for (const target of scopeTargets) {
        for (const dependency of root.manifest.capability_dependencies) {
          const provider = preparedById.get(dependency.package_id)?.manifest;
          const providerLock = builtLocks.get(dependency.package_id);
          if (!provider || !providerLock) continue;
          scopeMaterializations.push(materializeCapabilityScope({
            provider,
            providerLockRef: providerLock.lock_ref,
            scope: target.scope,
            targetRoot: target.targetRoot,
            transactionId: sha256Text(`${transactionId}\n${dependency.package_id}\n${target.scope}\n${target.targetRoot}`),
            dryRun: input.dryRun === true,
            retainTransactionBackup: input.dryRun !== true,
            previousMaterialization: root.previousLock?.scope_materializations.find((entry) =>
              entry.scope === target.scope
              && entry.target_root === target.targetRoot
              && entry.provider_package_id === dependency.package_id) ?? null,
          }));
        }
      }
      const rootLock = builtLocks.get(root.manifest.package_id)!;
      rootLock.scope_materializations = [
        ...scopeMaterializations,
        ...(rootLock.scope_materializations ?? []).filter((entry) =>
          !scopeMaterializations.some((next) =>
            next.scope === entry.scope
            && next.target_root === entry.target_root
            && next.provider_package_id === entry.provider_package_id)),
      ];
      if (!input.dryRun && process.env.OPL_TEST_CAPABILITY_RECONCILIATION_FAIL_AFTER_SCOPE === '1') {
        throw new FrameworkContractError('contract_shape_invalid', 'Injected interruption after capability scope activation.', {
          package_id: root.manifest.package_id,
          failure_code: 'test_capability_reconciliation_interrupted',
        });
      }
    } catch (error) {
      if (!input.dryRun) {
        for (const materialization of [...scopeMaterializations].reverse()) {
          rollbackCapabilityScopeTransaction(materialization);
        }
        for (const nextLock of [...locks].reverse()) {
          removePhysicalCodexSurface(nextLock.physical_surface, false, nextLock.package_id, {
            retainPayloadSource: Boolean(
              nextLock.physical_surface?.plugin_payload_cache_path
              && nextLock.physical_surface.plugin_payload_cache_path
                === preparedById.get(nextLock.package_id)?.previousLock?.physical_surface?.plugin_payload_cache_path,
            ),
          });
          rollbackManagedPolicySurface(nextLock.physical_surface);
          rollbackNewPackageProfileSurface(nextLock.physical_surface);
        }
        for (const prepared of ordered) {
          if (prepared.previousLock) rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
        }
        for (const mutation of [...runtimeSourceMutations.values()].reverse()) {
          rollbackManagedRuntimeSourceMutation(mutation);
        }
      }
      throw error;
    }
  }
  const dependencyPackages = locks.map((entry) => ({
    package_id: entry.package_id,
    package_version: entry.package_version,
    manifest_sha256: entry.manifest_sha256,
    content_digest: entry.content_digest,
    package_lock_ref: entry.lock_ref,
    source_artifact_ref: entry.source_artifact_ref ?? null,
    artifact_digest: entry.artifact_digest ?? null,
    owner_source_commit: entry.owner_source_commit ?? null,
  }));
  const receipts = ordered.map((prepared) => {
    const lock = builtLocks.get(prepared.manifest.package_id)!;
    const receipt = lifecycleReceipt({
      action,
      actionStatus: input.dryRun ? 'validated' : 'completed',
      packageId: prepared.manifest.package_id,
      registryUrl: prepared.selection.registryUrl,
      manifestUrl: prepared.selection.manifestUrl,
      manifestSha256: prepared.manifestSha256,
      packageLockRef: lock.lock_ref,
      rollbackRef: prepared.manifest.rollback_ref,
      sourceKind: prepared.sourceKind,
      trustTier: prepared.trustTier,
      sourceSha256: sha256Text(`${transactionId}\n${prepared.manifest.package_id}\n${prepared.manifestSha256}`),
      writesPerformed: !input.dryRun,
      physicalSurface: physicalSurfaces.get(prepared.manifest.package_id),
      dependencyTransactionId: transactionId,
      dependencyClosureDigest: closureDigest,
      dependencyPackages,
      scopeMaterialization: prepared.manifest.package_id === root.manifest.package_id
        ? scopeMaterializations[0]
        : undefined,
      scopeMaterializations: prepared.manifest.package_id === root.manifest.package_id
        ? scopeMaterializations
        : undefined,
      managedRuntimeSource: lock.managed_runtime_source,
      sourceArtifactRef: prepared.catalogVersion?.source_artifact_ref ?? prepared.previousLock?.source_artifact_ref ?? null,
      artifactDigest: prepared.catalogVersion?.artifact_digest ?? prepared.previousLock?.artifact_digest ?? null,
      ownerSourceCommit: prepared.catalogVersion?.owner_source_commit ?? prepared.previousLock?.owner_source_commit ?? null,
      releaseChannelRef: prepared.catalogVersion ? channelRef : prepared.previousLock?.release_channel_ref ?? null,
      releaseChannelDigest: prepared.catalogVersion ? channelDigest : prepared.previousLock?.release_channel_digest ?? null,
    });
    Object.assign(lock, {
      action_receipt_id: receipt.receipt_ref,
      dependency_closure_digest: closureDigest,
      dependency_transaction_id: transactionId,
    });
    if (prepared.manifest.package_id === root.manifest.package_id && scopeMaterializations.length > 0) {
      for (const scopeMaterialization of scopeMaterializations) {
        scopeMaterialization.lifecycle_receipt_ref = receipt.receipt_ref;
      }
      receipt.scope_materialization = scopeMaterializations[0];
    }
    return receipt;
  });
  const lock = builtLocks.get(root.manifest.package_id)!;
  const receipt = receipts.find((entry) => entry.package_id === root.manifest.package_id)!;

  if (!input.dryRun) {
    const previousLocks = ordered.flatMap((entry) => entry.previousLock ? [structuredClone(entry.previousLock)] : []);
    const nextIndex = structuredClone(index);
    const previousClosureDigest = dependencyClosureDigest(previousLocks);
    if (action !== 'repair' && previousLocks.length > 0) {
      nextIndex.last_known_good_transactions = retainLastKnownGoodPerRoot(
        nextIndex.last_known_good_transactions ?? [],
        {
          root_package_id: root.manifest.package_id,
          transaction_id: sha256Text([
            'lkg-snapshot',
            root.manifest.package_id,
            previousClosureDigest,
            ...previousLocks.map((entry) => entry.lock_ref).sort(),
          ].join('\n')),
          closure_digest: previousClosureDigest,
          package_locks: previousLocks,
        },
      );
    }
    for (const nextLock of locks) {
      const currentIndex = nextIndex.packages.findIndex((entry) => entry.package_id === nextLock.package_id);
      if (currentIndex >= 0) nextIndex.packages[currentIndex] = nextLock;
      else nextIndex.packages.unshift(nextLock);
    }
    try {
      writePackageTransaction(nextIndex, receipts);
    } catch (error) {
      for (const scopeMaterialization of scopeMaterializations) {
        rollbackCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const nextLock of [...locks].reverse()) {
        removePhysicalCodexSurface(nextLock.physical_surface, false, nextLock.package_id, {
          retainPayloadSource: Boolean(
            nextLock.physical_surface?.plugin_payload_cache_path
            && nextLock.physical_surface.plugin_payload_cache_path
              === preparedById.get(nextLock.package_id)?.previousLock?.physical_surface?.plugin_payload_cache_path,
          ),
        });
        rollbackManagedPolicySurface(nextLock.physical_surface);
        rollbackNewPackageProfileSurface(nextLock.physical_surface);
      }
      for (const previousLock of previousLocks) rematerializePhysicalCodexSurfaceFromLock(previousLock, false);
      for (const mutation of [...runtimeSourceMutations.values()].reverse()) {
        rollbackManagedRuntimeSourceMutation(mutation);
      }
      throw error;
    }
    for (const mutation of runtimeSourceMutations.values()) {
      finalizeManagedRuntimeSourceMutation(mutation);
    }
    for (const prepared of ordered) {
      cleanupPreviousPhysicalSurface(
        prepared.previousLock?.physical_surface,
        physicalSurfaces.get(prepared.manifest.package_id)!,
        { retainPayloadSource: true },
      );
    }
    cleanupUnreferencedPackagePayloadSources(index, nextIndex);
    if (root.previousLock) {
      for (const scopeMaterialization of scopeMaterializations) {
        finalizeCapabilityScopeTransaction(scopeMaterialization);
      }
    }
  }

  return {
    status: input.dryRun ? 'validated_no_write' : packageActionStatus(action),
    lock,
    receipt,
    registryEntry: selection.registryEntry,
    physicalSurface: physicalSurfaces.get(root.manifest.package_id)!,
    frameworkLink,
    closureLocks: locks,
    closureReceipts: receipts,
    dependencyTransactionId: transactionId,
    dependencyClosureDigest: closureDigest,
    scopeMaterializations,
  };
}

export async function runOplAgentPackageRegistryRefresh(input: AgentPackageRegistryRefreshInput) {
  const registryUrl = stringValue(input.registryUrl);
  if (!registryUrl) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package registry refresh requires --registry-url.', {
      required: ['--registry-url'],
    });
  }
  const { fetched, cache } = await fetchAndValidateRegistry(registryUrl);
  writeRegistryCache(cache);
  const lifecycleUx = agentPackageLifecycleSummaryReadback({ packages: [] });
  const receipt = lifecycleReceipt({
    action: 'registry_refresh',
    actionStatus: 'completed',
    registryUrl,
    sourceKind: 'registry_url',
    sourceSha256: fetched.source_sha256,
    writesPerformed: true,
  });
  appendReceipt(receipt);
  return {
    version: 'g2',
    opl_agent_package_registry: {
      surface_kind: 'opl_agent_package_registry_refresh',
      status: 'refreshed',
      registry_url: registryUrl,
      registry_sha256: fetched.source_sha256,
      registry_source_kind: fetched.source_kind,
      entry_count: cache.entry_count,
      entries: cache.entries,
      conditions: lifecycleUx.conditions,
      recommended_action: lifecycleUx.recommended_action,
      lifecycle_action_refs: lifecycleUx.lifecycle_action_refs,
      lifecycle_ux: lifecycleUx,
      cache_file: resolveOplStatePaths().agent_package_registry_cache_file,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageManifestValidate(input: AgentPackageManifestValidateInput) {
  const selection = await resolveManifestSelection(input);
  const fetched = await fetchJsonSource(selection.manifestUrl);
  const manifest = normalizeManifest(fetched.payload, selection.manifestUrl);
  assertManifestMatchesRegistrySelection(manifest, selection);
  const effectiveTrustTier = stringValue(input.trustTier) ?? selection.trustTier;
  const sourceKind = normalizeSourceKind(input.sourceKind, selection.manifestUrl);
  const receipt = lifecycleReceipt({
    action: 'manifest_validate',
    actionStatus: 'validated',
    packageId: manifest.package_id,
    registryUrl: selection.registryUrl,
    manifestUrl: selection.manifestUrl,
    manifestSha256: fetched.source_sha256,
    rollbackRef: manifest.rollback_ref,
    sourceKind,
    trustTier: effectiveTrustTier,
    sourceSha256: fetched.source_sha256,
    writesPerformed: true,
  });
  appendReceipt(receipt);
  return {
    version: 'g2',
    opl_agent_package_manifest: {
      surface_kind: 'opl_agent_package_manifest_validation',
      status: 'valid',
      package_id: manifest.package_id,
      agent_id: manifest.agent_id,
      display_name: manifest.display_name,
      publisher: manifest.publisher,
      package_version: manifest.version,
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      manifest_sha256: fetched.source_sha256,
      source_kind: sourceKind,
      trust_tier: effectiveTrustTier,
      codex_visible_entry: manifest.codex_visible_entry,
      bundled_required_skill_ids: manifest.required_skill_ids,
      optional_skill_refs: manifest.optional_skill_refs,
      distribution_payload: manifest.distribution_payload,
      rollback_ref: manifest.rollback_ref,
      registry_entry: selection.registryEntry,
      lifecycle_receipt: receipt,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: manifest.package_id,
        packages: [{
          packageId: manifest.package_id,
          receipt,
          manifestUrl: selection.manifestUrl,
          manifestSha256: fetched.source_sha256,
          registryUrl: selection.registryUrl,
          rollbackRef: manifest.rollback_ref,
          sourceKind,
          trustTier: effectiveTrustTier,
        }],
      }),
      validation_policy: {
        manifest_required_fields: [...MANIFEST_REQUIRED_FIELDS],
        forbidden_fields: [...FORBIDDEN_AGENT_PACKAGE_FIELDS],
        session_contract_allowed: false,
        domain_authority_allowed: false,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageInstall(input: AgentPackageInstallInput) {
  const result = await applyManifestPackageLock(input, 'install');

  return {
    version: 'g2',
    opl_agent_package_install: {
      surface_kind: 'opl_agent_package_install',
      status: result.status,
      dry_run: input.dryRun === true,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      framework_link: result.frameworkLink,
      lifecycle_receipt: result.receipt,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: result.lock.package_id,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
        packages: result.closureLocks.map((lock) => ({
          packageId: lock.package_id,
          lock,
          receipt: result.closureReceipts.find((receipt) => receipt.package_id === lock.package_id) ?? null,
        })),
      }),
      dependency_transaction_id: result.dependencyTransactionId,
      dependency_closure_digest: result.dependencyClosureDigest,
      dependency_package_locks: result.closureLocks,
      lock_file: resolveOplStatePaths().agent_package_lock_file,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      registry_entry: result.registryEntry,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageUpdate(input: AgentPackageInstallInput) {
  const result = await applyManifestPackageLock(input, 'update');
  return {
    version: 'g2',
    opl_agent_package_update: {
      surface_kind: 'opl_agent_package_update',
      status: result.status,
      dry_run: input.dryRun === true,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      framework_link: result.frameworkLink,
      lifecycle_receipt: result.receipt,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: result.lock.package_id,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
        packages: result.closureLocks.map((lock) => ({
          packageId: lock.package_id,
          lock,
          receipt: result.closureReceipts.find((receipt) => receipt.package_id === lock.package_id) ?? null,
        })),
      }),
      dependency_transaction_id: result.dependencyTransactionId,
      dependency_closure_digest: result.dependencyClosureDigest,
      dependency_package_locks: result.closureLocks,
      lock_file: resolveOplStatePaths().agent_package_lock_file,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      registry_entry: result.registryEntry,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

function packageBulkUpdateSafety(lock: AgentPackageLock) {
  if (lock.source_kind === 'developer_checkout_override') {
    return {
      eligible: false,
      reason: 'developer_checkout_is_user_managed',
    } as const;
  }
  if (!lock.content_digest || !lock.manifest_sha256 || !lock.lock_ref) {
    return {
      eligible: false,
      reason: 'package_content_identity_incomplete',
    } as const;
  }
  if (lock.physical_surface?.failure_reason) {
    return {
      eligible: false,
      reason: 'package_physical_surface_requires_repair',
    } as const;
  }
  return {
    eligible: true,
    reason: 'installed_digest_locked_package',
  } as const;
}

export async function runOplAgentPackageBulkUpdate(input: { dryRun?: boolean } = {}) {
  const { index } = readRecoveredLockIndex();
  const dependencyIds = new Set(index.packages.flatMap((lock) =>
    (lock.resolved_dependencies ?? []).map((dependency) => dependency.package_id)));
  const recordedRootIds = new Set((index.last_known_good_transactions ?? [])
    .map((entry) => entry.root_package_id));
  const roots = index.packages.filter((lock) =>
    recordedRootIds.has(lock.package_id) || !dependencyIds.has(lock.package_id));
  const targets: Array<Record<string, unknown>> = [];

  for (const lock of roots) {
    const safety = packageBulkUpdateSafety(lock);
    if (!safety.eligible) {
      targets.push({
        target_type: 'package_lock',
        target_id: lock.package_id,
        status: 'manual_required',
        reason: safety.reason,
        action: null,
        installed_lock_ref: lock.lock_ref,
        installed_content_digest: lock.content_digest,
        result: null,
      });
      continue;
    }
    try {
      const result = await runOplAgentPackageUpdate({
        packageId: lock.package_id,
        dryRun: input.dryRun === true,
      });
      targets.push({
        target_type: 'package_lock',
        target_id: lock.package_id,
        status: input.dryRun ? 'validated' : 'completed',
        reason: safety.reason,
        action: 'update',
        installed_lock_ref: lock.lock_ref,
        installed_content_digest: lock.content_digest,
        result: result.opl_agent_package_update,
      });
    } catch (error) {
      targets.push({
        target_type: 'package_lock',
        target_id: lock.package_id,
        status: 'manual_required',
        reason: 'package_update_failed_without_overwrite',
        action: 'update',
        installed_lock_ref: lock.lock_ref,
        installed_content_digest: lock.content_digest,
        result: null,
        error: error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function'
          ? error.toJSON()
          : { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  const completedCount = targets.filter((entry) =>
    entry.status === 'completed' || entry.status === 'validated').length;
  const manualRequiredCount = targets.filter((entry) => entry.status === 'manual_required').length;
  return {
    version: 'g2',
    opl_agent_package_bulk_update: {
      surface_kind: 'opl_agent_package_bulk_update',
      status: manualRequiredCount > 0 ? 'attention_needed' : input.dryRun ? 'validated_no_write' : 'completed',
      dry_run: input.dryRun === true,
      lifecycle_owner: 'opl_packages',
      selection: 'installed_root_package_locks',
      targets,
      summary: {
        installed_package_count: index.packages.length,
        root_package_count: roots.length,
        completed_targets_count: completedCount,
        manual_required_targets_count: manualRequiredCount,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

function packageRepairResult(
  input: AgentPackageRepairInput,
  result: Awaited<ReturnType<typeof applyManifestPackageLock>>,
) {
  return {
    version: 'g2',
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair',
      status: result.status,
      dry_run: input.dryRun === true,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      framework_link: result.frameworkLink,
      lifecycle_receipt: result.receipt,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: result.lock.package_id,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
        packages: result.closureLocks.map((lock) => ({
          packageId: lock.package_id,
          lock,
          receipt: result.closureReceipts.find((receipt) => receipt.package_id === lock.package_id) ?? null,
        })),
      }),
      dependency_transaction_id: result.dependencyTransactionId,
      dependency_closure_digest: result.dependencyClosureDigest,
      dependency_package_locks: result.closureLocks,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageRepair(input: AgentPackageRepairInput) {
  const packageId = requirePackageId(input.packageId, 'repair');
  const { index } = readRecoveredLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'repair');
  if (
    (lock.capability_dependencies ?? []).length > 0
    || lock.runtime_source_carrier
    || stringValue(input.manifestUrl)
    || stringValue(input.registryUrl)
  ) {
    return applyManifestPackageLock({ ...input, packageId }, 'repair')
      .then((result) => packageRepairResult(input, result));
  }
  const physicalSurface = rematerializePhysicalCodexSurfaceFromLock(lock, input.dryRun === true);
  const frameworkLink = input.agentRoot
    ? materializeStandardAgentFrameworkLink({ agentRoot: input.agentRoot, dryRun: input.dryRun })
    : null;
  const receipt = lifecycleReceipt({
    action: 'repair',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: packageActionSourceSha256('repair', lock),
    writesPerformed: !input.dryRun,
    physicalSurface,
  });
  const repairedLock = {
    ...lock,
    updated_at: input.dryRun ? lock.updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
    physical_surface: physicalSurface.status === 'not_requested' ? lock.physical_surface : physicalSurface,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = repairedLock;
    writePackageTransaction(index, [receipt]);
  }
  return {
    version: 'g2',
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair',
      status: input.dryRun ? 'validated_no_write' : 'repaired',
      dry_run: input.dryRun === true,
      package_lock: repairedLock,
      physical_surface: physicalSurface,
      framework_link: frameworkLink,
      lifecycle_receipt: receipt,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: repairedLock.package_id,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
        packages: [{ packageId: repairedLock.package_id, lock: repairedLock, receipt }],
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageRollback(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'rollback');
  const { index } = readRecoveredLockIndex();
  const { lock } = requireInstalledPackage(index, packageId, 'rollback');
  assertNoRequiredInstalledDependents(index, packageId, 'rollback');
  const lastKnownGood = (index.last_known_good_transactions ?? [])
    .find((entry) => entry.root_package_id === packageId);
  let runtimeSourceCleanup: {
    status: 'not_required' | 'cleanup_completed' | 'cleanup_pending';
    cleanup_paths: string[];
  } = { status: 'not_required', cleanup_paths: [] };
  if (!lastKnownGood) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package rollback requires a recorded dependency-closure last-known-good generation.', {
      package_id: packageId,
      failure_code: 'agent_package_last_known_good_missing',
    });
  }
  const restoredLocks = structuredClone(lastKnownGood.package_locks);
  const currentLocks = index.packages.filter((entry) =>
    entry.package_id === packageId || entry.dependency_transaction_id === lock.dependency_transaction_id);
  const currentIds = new Set(currentLocks.map((entry) => entry.package_id));
  const restoredRoot = restoredLocks.find((entry) => entry.package_id === packageId);
  if (!restoredRoot) {
    restoreManagedRuntimeSourceCarrier({
      current: lock.managed_runtime_source,
      restored: null,
      transactionId: `rollback-preinstall-${lock.dependency_transaction_id.slice(0, 16)}`,
      dryRun: true,
      packageId,
    });
    for (const restoredLock of restoredLocks) rematerializePhysicalCodexSurfaceFromLock(restoredLock, true);
    const restoredIds = new Set(restoredLocks.map((entry) => entry.package_id));
    const closureDigest = dependencyClosureDigest(restoredLocks);
    const transactionId = sha256Text(`rollback\n${packageId}\npreinstall\n${lock.dependency_transaction_id}`);
    const dependencyPackages = restoredLocks.map((entry) => ({
      package_id: entry.package_id,
      package_version: entry.package_version,
      manifest_sha256: entry.manifest_sha256,
      content_digest: entry.content_digest,
      package_lock_ref: entry.lock_ref,
    }));
    const receipt = lifecycleReceipt({
      action: 'rollback',
      actionStatus: input.dryRun ? 'validated' : 'completed',
      packageId,
      manifestUrl: lock.manifest_url,
      manifestSha256: lock.manifest_sha256,
      packageLockRef: null,
      rollbackRef: lock.rollback_ref,
      sourceKind: lock.source_kind,
      trustTier: lock.trust_tier,
      sourceSha256: transactionId,
      writesPerformed: !input.dryRun,
      dependencyTransactionId: transactionId,
      dependencyClosureDigest: closureDigest,
      dependencyPackages,
      managedRuntimeSource: null,
    });
    if (!input.dryRun) {
      const newlyInstalledLocks = currentLocks.filter((entry) => !restoredIds.has(entry.package_id));
      for (const currentLock of newlyInstalledLocks) {
        assertManagedPolicyRollbackReady(currentLock.physical_surface?.workflow_policy_migration);
        assertPackageProfileRollbackReady(currentLock.physical_surface?.profile_migration);
      }
      const rolledBackScopes: AgentPackageScopeMaterialization[] = [];
      const retainedPolicyRollbacks: ReturnType<typeof rollbackManagedPolicyMigration>[] = [];
      const retainedProfileRollbacks: ReturnType<typeof rollbackPackageProfileMigration>[] = [];
      const restoredPhysicalSurfaces = new Map<string, AgentPackagePhysicalSurface>();
      let runtimeSourceMutation: ReturnType<typeof restoreManagedRuntimeSourceCarrier> | null = null;
      try {
        for (const scopeMaterialization of [...(lock.scope_materializations ?? [])].reverse()) {
          rollbackCapabilityScopeTransaction(scopeMaterialization);
          rolledBackScopes.push(scopeMaterialization);
        }
        for (const currentLock of [...currentLocks].reverse()) {
          removePhysicalCodexSurface(
            currentLock.physical_surface,
            false,
            currentLock.package_id,
            { retainPayloadSource: true },
          );
          if (!restoredIds.has(currentLock.package_id)) {
            retainedPolicyRollbacks.push(rollbackManagedPolicyMigration(
              currentLock.physical_surface?.workflow_policy_migration,
              { retainBackups: true },
            ));
            retainedProfileRollbacks.push(rollbackPackageProfileMigration(
              currentLock.physical_surface?.profile_migration,
              { retainBackups: true },
            ));
          }
        }
        for (const previousLock of restoredLocks) {
          restoredPhysicalSurfaces.set(
            previousLock.package_id,
            rematerializePhysicalCodexSurfaceFromLock(previousLock, false),
          );
        }
        runtimeSourceMutation = restoreManagedRuntimeSourceCarrier({
          current: lock.managed_runtime_source,
          restored: null,
          transactionId: `rollback-preinstall-${lock.dependency_transaction_id.slice(0, 16)}`,
          dryRun: false,
          packageId,
        });
        const nextIndex = structuredClone(index);
        nextIndex.packages = [
          ...restoredLocks,
          ...nextIndex.packages.filter((entry) => !currentIds.has(entry.package_id) && !restoredIds.has(entry.package_id)),
        ];
        nextIndex.last_known_good_transactions = retainLastKnownGoodPerRoot(
          (nextIndex.last_known_good_transactions ?? []).filter((entry) => entry !== lastKnownGood),
          {
          root_package_id: packageId,
          transaction_id: lock.dependency_transaction_id,
          closure_digest: lock.dependency_closure_digest,
          package_locks: structuredClone(currentLocks),
          },
        );
        writePackageTransaction(nextIndex, [receipt]);
      } catch (error) {
        if (runtimeSourceMutation) rollbackManagedRuntimeSourceMutation(runtimeSourceMutation);
        for (const surface of restoredPhysicalSurfaces.values()) {
          assertManagedPolicyRollbackReady(surface.workflow_policy_migration);
          assertPackageProfileRollbackReady(surface.profile_migration);
        }
        for (const [restoredPackageId, surface] of [...restoredPhysicalSurfaces.entries()].reverse()) {
          removePhysicalCodexSurface(surface, false, restoredPackageId, { retainPayloadSource: true });
          rollbackManagedPolicyMigration(surface.workflow_policy_migration);
          rollbackPackageProfileMigration(surface.profile_migration);
        }
        for (const currentLock of currentLocks) rematerializePhysicalCodexSurfaceFromLock(currentLock, false);
        for (const scopeRecord of [...rolledBackScopes].reverse()) {
          const provider = currentLocks.find((entry) => entry.package_id === scopeRecord.provider_package_id);
          if (!provider) continue;
          const materialization = materializeCapabilityScopeFromLock({
            provider,
            scope: scopeRecord.scope,
            targetRoot: scopeRecord.target_root,
            transactionId: scopeRecord.transaction_id,
            dryRun: false,
            retainTransactionBackup: true,
          });
          materialization.lifecycle_receipt_ref = scopeRecord.lifecycle_receipt_ref;
        }
        throw error;
      }
      if (runtimeSourceMutation) {
        runtimeSourceCleanup = finalizeManagedRuntimeSourceMutation(runtimeSourceMutation);
      }
      for (const migration of retainedPolicyRollbacks) {
        if (migration.status === 'rolled_back') finalizeManagedPolicyRollback(migration);
      }
      for (const migration of retainedProfileRollbacks) {
        if (migration.status === 'rolled_back') finalizePackageProfileRollback(migration);
      }
    }
    return {
      version: 'g2',
      opl_agent_package_rollback: {
        surface_kind: 'opl_agent_package_rollback',
        status: input.dryRun ? 'validated_no_write' : 'rolled_back',
        dry_run: input.dryRun === true,
        package_lock: null,
        dependency_package_locks: restoredLocks,
        dependency_transaction_id: transactionId,
        dependency_closure_digest: closureDigest,
        lifecycle_receipt: receipt,
        runtime_source_cleanup: runtimeSourceCleanup,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  restoreManagedRuntimeSourceCarrier({
    current: lock.managed_runtime_source,
    restored: restoredRoot.managed_runtime_source,
    transactionId: `rollback-${lock.dependency_transaction_id.slice(0, 16)}`,
    dryRun: true,
    packageId,
  });
  for (const restoredLock of restoredLocks) rematerializePhysicalCodexSurfaceFromLock(restoredLock, true);
  const closureDigest = dependencyClosureDigest(restoredLocks);
  const transactionId = sha256Text(`rollback\n${packageId}\n${closureDigest}\n${lock.dependency_transaction_id}`);
  const dependencyPackages = restoredLocks.map((entry) => ({
    package_id: entry.package_id,
    package_version: entry.package_version,
    manifest_sha256: entry.manifest_sha256,
    content_digest: entry.content_digest,
    package_lock_ref: entry.lock_ref,
  }));
  const receipts = restoredLocks.map((restoredLock) => lifecycleReceipt({
    action: 'rollback',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId: restoredLock.package_id,
    manifestUrl: restoredLock.manifest_url,
    manifestSha256: restoredLock.manifest_sha256,
    packageLockRef: restoredLock.lock_ref,
    rollbackRef: restoredLock.rollback_ref,
    sourceKind: restoredLock.source_kind,
    trustTier: restoredLock.trust_tier,
    sourceSha256: sha256Text(`${transactionId}\n${restoredLock.package_id}`),
    writesPerformed: !input.dryRun,
    dependencyTransactionId: transactionId,
    dependencyClosureDigest: closureDigest,
    dependencyPackages,
    managedRuntimeSource: restoredLock.managed_runtime_source,
  }));
  restoredLocks.forEach((restoredLock) => {
    restoredLock.dependency_transaction_id = transactionId;
    restoredLock.dependency_closure_digest = closureDigest;
    restoredLock.action_receipt_id = receipts.find((receipt) => receipt.package_id === restoredLock.package_id)!.receipt_ref;
  });
  const rootReceipt = receipts.find((entry) => entry.package_id === packageId)!;
  const explicitScopeTarget = packageScopeTarget(input);
  const scopeRecords = explicitScopeTarget && input.scope
    ? (lock.scope_materializations ?? []).filter((entry) =>
        entry.scope === input.scope && entry.target_root === explicitScopeTarget)
    : lock.scope_materializations ?? [];
  const scopeMaterializations: AgentPackageScopeMaterialization[] = [];
  try {
    for (const record of scopeRecords) {
      const provider = restoredLocks.find((entry) => entry.package_id === record.provider_package_id);
      if (!provider) {
        throw new FrameworkContractError('contract_shape_invalid', 'Agent package rollback cannot restore a scope without its provider lock.', {
          package_id: packageId,
          provider_package_id: record.provider_package_id,
          scope: record.scope,
          target_root: record.target_root,
          failure_code: 'agent_package_rollback_scope_provider_missing',
        });
      }
      const materialization = materializeCapabilityScopeFromLock({
        provider,
        scope: record.scope,
        targetRoot: record.target_root,
        transactionId: sha256Text(`${transactionId}\n${provider.package_id}\n${record.scope}\n${record.target_root}`),
        dryRun: input.dryRun === true,
        retainTransactionBackup: input.dryRun !== true,
        previousMaterialization: lock.scope_materializations.find((entry) =>
          entry.scope === record.scope
          && entry.target_root === record.target_root
          && entry.provider_package_id === record.provider_package_id) ?? null,
      });
      materialization.lifecycle_receipt_ref = rootReceipt.receipt_ref;
      scopeMaterializations.push(materialization);
    }
  } catch (error) {
    if (!input.dryRun) {
      for (const materialization of [...scopeMaterializations].reverse()) {
        rollbackCapabilityScopeTransaction(materialization);
      }
    }
    throw error;
  }
  restoredRoot.scope_materializations = scopeMaterializations;
  if (scopeMaterializations.length > 0) {
    rootReceipt.scope_materialization = scopeMaterializations[0];
    rootReceipt.scope_materializations = scopeMaterializations;
  }
  if (!input.dryRun) {
    const restoredIds = new Set(restoredLocks.map((entry) => entry.package_id));
    const restoredPhysicalSurfaces = new Map<string, AgentPackagePhysicalSurface>();
    let runtimeSourceMutation: ReturnType<typeof restoreManagedRuntimeSourceCarrier> | null = null;
    try {
      for (const currentLock of currentLocks) {
        removePhysicalCodexSurface(
          currentLock.physical_surface,
          false,
          currentLock.package_id,
          { retainPayloadSource: true },
        );
      }
      for (const restoredLock of restoredLocks) {
        const surface = rematerializePhysicalCodexSurfaceFromLock(restoredLock, false);
        restoredLock.physical_surface = surface;
        restoredPhysicalSurfaces.set(restoredLock.package_id, surface);
      }
      runtimeSourceMutation = restoreManagedRuntimeSourceCarrier({
        current: lock.managed_runtime_source,
        restored: restoredRoot.managed_runtime_source,
        transactionId: `rollback-${lock.dependency_transaction_id.slice(0, 16)}`,
        dryRun: false,
        packageId,
      });
      restoredRoot.managed_runtime_source = runtimeSourceMutation.after;
      rootReceipt.managed_runtime_source = runtimeSourceMutation.after;
      const nextIndex = structuredClone(index);
      nextIndex.packages = [
        ...restoredLocks,
        ...nextIndex.packages.filter((entry) => !currentIds.has(entry.package_id) && !restoredIds.has(entry.package_id)),
      ];
      nextIndex.last_known_good_transactions = retainLastKnownGoodPerRoot(
        (nextIndex.last_known_good_transactions ?? []).filter((entry) => entry !== lastKnownGood),
        {
        root_package_id: packageId,
        transaction_id: lock.dependency_transaction_id,
        closure_digest: lock.dependency_closure_digest,
        package_locks: structuredClone(currentLocks),
        },
      );
      writePackageTransaction(nextIndex, receipts);
    } catch (error) {
      if (runtimeSourceMutation) rollbackManagedRuntimeSourceMutation(runtimeSourceMutation);
      for (const surface of restoredPhysicalSurfaces.values()) {
        assertManagedPolicyRollbackReady(surface.workflow_policy_migration);
        assertPackageProfileRollbackReady(surface.profile_migration);
      }
      for (const materialization of scopeMaterializations) rollbackCapabilityScopeTransaction(materialization);
      for (const [restoredPackageId, surface] of [...restoredPhysicalSurfaces.entries()].reverse()) {
        removePhysicalCodexSurface(surface, false, restoredPackageId, { retainPayloadSource: true });
        rollbackManagedPolicyMigration(surface.workflow_policy_migration);
        rollbackPackageProfileMigration(surface.profile_migration);
      }
      for (const currentLock of currentLocks) rematerializePhysicalCodexSurfaceFromLock(currentLock, false);
      throw error;
    }
    if (runtimeSourceMutation) {
      runtimeSourceCleanup = finalizeManagedRuntimeSourceMutation(runtimeSourceMutation);
    }
    for (const materialization of scopeMaterializations) finalizeCapabilityScopeTransaction(materialization);
  }
  return {
    version: 'g2',
    opl_agent_package_rollback: {
      surface_kind: 'opl_agent_package_rollback',
      status: input.dryRun ? 'validated_no_write' : 'rolled_back',
      dry_run: input.dryRun === true,
      package_lock: restoredRoot,
      dependency_package_locks: restoredLocks,
      dependency_transaction_id: transactionId,
      dependency_closure_digest: closureDigest,
      scope_materializations: scopeMaterializations,
      lifecycle_receipt: rootReceipt,
      runtime_source_cleanup: runtimeSourceCleanup,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: packageId,
        packages: restoredLocks.map((entry) => ({
          packageId: entry.package_id,
          lock: entry,
          receipt: receipts.find((receipt) => receipt.package_id === entry.package_id) ?? null,
        })),
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

async function reconcilePackageClosureForUse(
  input: AgentPackagePackageActionInput,
  lock: AgentPackageLock,
) {
  if (input.pinnedUseBinding) {
    const pinned = input.pinnedUseBinding;
    const pinnedReceipt = readLifecycleLedger().receipts.find((entry) =>
      entry.action === 'use'
      && entry.package_id === lock.package_id
      && entry.receipt_ref === pinned.use_receipt_ref);
    if (!pinnedReceipt?.use_binding
      || JSON.stringify(pinnedReceipt.use_binding) !== JSON.stringify(pinned)) {
      throw new FrameworkContractError('contract_shape_invalid', 'The attempt package use binding is not backed by its immutable lifecycle receipt.', {
        package_id: lock.package_id,
        pinned_use_receipt_ref: pinned.use_receipt_ref ?? null,
        receipt_found: Boolean(pinnedReceipt),
        failure_code: 'agent_package_use_receipt_invalid',
        repair_action: `opl packages repair --package-id ${publicAgentPackageSelector(lock.package_id)}`,
      });
    }
    if (pinned.root_package.package_lock_ref !== lock.lock_ref
      || pinned.dependency_closure_digest !== lock.dependency_closure_digest) {
      throw new FrameworkContractError('contract_shape_invalid', 'The attempt package closure no longer matches its pinned use receipt.', {
        package_id: lock.package_id,
        pinned_use_receipt_ref: pinned.use_receipt_ref,
        pinned_dependency_closure_digest: pinned.dependency_closure_digest,
        installed_dependency_closure_digest: lock.dependency_closure_digest,
        failure_code: 'agent_package_pinned_closure_changed',
        resume_policy: 'fail_closed_shared_scope_cannot_restore_pinned_bytes_without_mutating_current_scope',
        shared_scope: {
          scope: pinned.scope,
          target_root: pinned.target_root,
          discovery_surface: `${pinned.target_root}/.codex/skills`,
        },
        allowed_recovery_actions: [
          `opl packages rollback ${publicAgentPackageSelector(lock.package_id)}`,
          'create a new attempt pinned to the current package closure',
        ],
      });
    }
    return {
      freshnessMode: pinned.freshness_mode,
      latestVerified: pinned.latest_verified,
      updated: false,
      refreshOutcome: pinned.refresh_outcome,
      channelRef: pinned.channel_ref,
      channelDigest: pinned.channel_digest,
      checkedAt: pinned.checked_at,
    } as const;
  }
  const source = lock.managed_update_source;
  if (!source) {
    if (process.env.OPL_PACKAGE_USE_STRICT_CURRENTNESS === '1') {
      throw new FrameworkContractError('codex_command_failed', 'Package use requires a current managed catalog in strict mode.', {
        package_id: lock.package_id,
        failure_code: 'agent_package_capability_channel_unavailable',
        update_action: `opl packages update ${publicAgentPackageSelector(lock.package_id)}`,
      });
    }
    return {
      freshnessMode: 'offline_lkg',
      latestVerified: false,
      updated: false,
      refreshOutcome: 'recovered_last_known_good',
      channelRef: null,
      channelDigest: null,
      checkedAt: nowIso(),
    } as const;
  }
  let fetched: Awaited<ReturnType<typeof fetchManagedPackageCatalog>>;
  try {
    fetched = await fetchManagedPackageCatalog(source);
  } catch (error) {
    const transportFailure = !(error instanceof FrameworkContractError)
      || error.code === 'codex_command_failed'
      || error.code === 'build_command_failed';
    if (!transportFailure || process.env.OPL_PACKAGE_USE_STRICT_CURRENTNESS === '1') {
      if (transportFailure) {
        throw new FrameworkContractError('codex_command_failed', 'Managed package catalog is unavailable at the use boundary.', {
          package_id: lock.package_id,
          catalog_ref: source.catalog_ref,
          failure_code: 'agent_package_capability_channel_unavailable',
          update_action: `opl packages update ${publicAgentPackageSelector(lock.package_id)}`,
        });
      }
      throw error;
    }
    return {
      freshnessMode: 'offline_lkg',
      latestVerified: false,
      updated: false,
      refreshOutcome: 'recovered_last_known_good',
      channelRef: source.catalog_ref,
      channelDigest: null,
      checkedAt: nowIso(),
    } as const;
  }
  const rootVersion = selectRootCatalogVersion(fetched.catalog, lock);
  const providerVersions = lock.capability_dependencies.map((dependency) =>
    selectCapabilityCatalogVersion(fetched.catalog, dependency));
  const installedById = new Map(readLockIndex().packages.map((entry) => [entry.package_id, entry]));
  const updateRequired = rootVersion.manifest_sha256.replace(/^sha256:/, '') !== lock.manifest_sha256
    || lock.capability_dependencies.some((dependency, index) => (
      providerVersions[index].manifest_sha256.replace(/^sha256:/, '')
        !== installedById.get(dependency.package_id)?.manifest_sha256
    ));
  if (updateRequired && !input.dryRun) {
    await applyManifestPackageLock({
      packageId: lock.package_id,
      manifestUrl: rootVersion.manifest_url,
      trustTier: lock.trust_tier,
      sourceKind: lock.source_kind,
      scope: input.scope,
      targetWorkspace: input.targetWorkspace,
      targetQuest: input.targetQuest,
    }, 'update', {
      catalog: fetched.catalog,
      rootVersion,
      catalogSource: source,
      channelRef: fetched.channel_ref,
      channelDigest: fetched.channel_digest,
    });
  }
  return {
    freshnessMode: 'channel_verified',
    latestVerified: true,
    updated: updateRequired,
    refreshOutcome: updateRequired ? 'updated' : 'current',
    channelRef: fetched.channel_ref,
    channelDigest: fetched.channel_digest,
    checkedAt: fetched.checked_at,
  } as const;
}

export async function ensureOplAgentPackageScopeActivation(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const recovered = readRecoveredLockIndex();
  const initial = requireInstalledPackage(recovered.index, packageId, 'activate');
  const reconciliation = await reconcilePackageClosureForUse(input, initial.lock);
  const index = readLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'activate');
  const targetRoot = packageScopeTarget(input);
  if (!input.scope || !targetRoot) {
    throw new FrameworkContractError('cli_usage_error', 'Package scope activation requires workspace or quest target.', {
      package_id: packageId,
      failure_code: 'agent_package_scope_target_required',
    });
  }
  const readiness = dependencyReadiness(lock, index);
  if (!readiness.operational_ready) {
    return {
      status: 'blocked',
      package_id: packageId,
      writes_performed: false,
      package_dependency_readiness: readiness,
    };
  }
  const existing = (lock.scope_materializations ?? []).filter((entry) =>
    entry.scope === input.scope && entry.target_root === targetRoot);
  const beforeReadiness = scopeMaterializationReadiness(lock, index, input);
  const needsMaterialization = existing.length === 0
    || beforeReadiness.core_readiness.status !== 'current'
    || beforeReadiness.specialty_exposure.status === 'degraded';
  const transactionId = sha256Text(`activate\n${packageId}\n${input.scope}\n${targetRoot}\n${lock.dependency_closure_digest}`);
  const materializations: AgentPackageScopeMaterialization[] = [];
  try {
    if (!needsMaterialization) {
      materializations.length = 0;
    }
    if (needsMaterialization) {
    for (const dependency of lock.capability_dependencies) {
      const provider = index.packages.find((entry) => entry.package_id === dependency.package_id);
      if (!provider) {
        throw new FrameworkContractError('contract_shape_invalid', 'Package scope activation requires every dependency provider lock.', {
          package_id: packageId,
          dependency_package_id: dependency.package_id,
          failure_code: 'agent_package_dependency_lock_missing',
        });
      }
      materializations.push(materializeCapabilityScopeFromLock({
        provider,
        scope: input.scope!,
        targetRoot,
        transactionId: sha256Text(`${transactionId}\n${dependency.package_id}`),
        dryRun: input.dryRun === true,
        retainTransactionBackup: input.dryRun !== true,
        previousMaterialization: existing.find((entry) => entry.provider_package_id === dependency.package_id) ?? null,
      }));
    }
    }
  } catch (error) {
    if (!input.dryRun) {
      for (const materialization of [...materializations].reverse()) {
        rollbackCapabilityScopeTransaction(materialization);
      }
    }
    throw error;
  }
  const dependencyPackages = [
    lock,
    ...index.packages.filter((entry) => lock.resolved_dependencies.some((dependency) => dependency.package_id === entry.package_id)),
  ].map((entry) => ({
    package_id: entry.package_id,
    package_version: entry.package_version,
    manifest_sha256: entry.manifest_sha256,
    content_digest: entry.content_digest,
    package_lock_ref: entry.lock_ref,
  }));
  const activationReceipt = materializations.length > 0
    ? lifecycleReceipt({
        action: 'activate',
        actionStatus: input.dryRun ? 'validated' : 'completed',
        packageId,
        manifestUrl: lock.manifest_url,
        manifestSha256: lock.manifest_sha256,
        packageLockRef: lock.lock_ref,
        rollbackRef: lock.rollback_ref,
        sourceKind: lock.source_kind,
        trustTier: lock.trust_tier,
        sourceSha256: transactionId,
        writesPerformed: !input.dryRun,
        dependencyTransactionId: lock.dependency_transaction_id,
        dependencyClosureDigest: lock.dependency_closure_digest,
        dependencyPackages,
        scopeMaterialization: materializations[0],
        scopeMaterializations: materializations,
      })
    : null;
  if (activationReceipt) {
    for (const materialization of materializations) {
      materialization.lifecycle_receipt_ref = activationReceipt.receipt_ref;
    }
    activationReceipt.scope_materialization = materializations[0];
    activationReceipt.scope_materializations = materializations;
  }
  const activatedLock: AgentPackageLock = activationReceipt
    ? {
        ...lock,
        updated_at: input.dryRun ? lock.updated_at : nowIso(),
        action_receipt_id: activationReceipt.receipt_ref,
        scope_materializations: [
          ...materializations,
          ...(lock.scope_materializations ?? []).filter((entry) => !materializations.some((next) =>
            next.scope === entry.scope
            && next.target_root === entry.target_root
            && next.provider_package_id === entry.provider_package_id)),
        ],
      }
    : lock;
  const nextIndex = structuredClone(index);
  nextIndex.packages[lockIndex] = activatedLock;
  const materializationReadiness = scopeMaterializationReadiness(activatedLock, nextIndex, input);
  const providerPackages = activatedLock.resolved_dependencies.map((dependency) => {
    const provider = nextIndex.packages.find((entry) => entry.package_id === dependency.package_id)!;
    return {
      package_id: provider.package_id,
      package_version: provider.package_version,
      owner_language_version: provider.owner_language_version,
      package_lock_ref: provider.lock_ref,
      manifest_sha256: provider.manifest_sha256,
      content_digest: provider.content_digest,
      source_artifact_ref: provider.source_artifact_ref ?? null,
      artifact_digest: provider.artifact_digest ?? null,
    };
  });
  const useBinding = {
    surface_kind: 'opl_agent_package_use_binding.v1' as const,
    use_boundary_id: input.useBoundaryId
      ?? sha256Text(`${packageId}\n${input.scope}\n${targetRoot}\n${Date.now()}`),
    use_receipt_ref: '',
    root_package: {
      package_id: activatedLock.package_id,
      package_version: activatedLock.package_version,
      owner_language_version: activatedLock.owner_language_version,
      package_lock_ref: activatedLock.lock_ref,
      manifest_sha256: activatedLock.manifest_sha256,
      content_digest: activatedLock.content_digest,
      source_artifact_ref: activatedLock.source_artifact_ref ?? null,
      artifact_digest: activatedLock.artifact_digest ?? null,
    },
    provider_packages: providerPackages,
    dependency_closure_digest: activatedLock.dependency_closure_digest,
    freshness_mode: reconciliation.freshnessMode,
    latest_verified: reconciliation.latestVerified,
    checked_at: reconciliation.checkedAt,
    refresh_outcome: reconciliation.refreshOutcome,
    channel_ref: reconciliation.channelRef,
    channel_digest: reconciliation.channelDigest,
    scope: input.scope,
    target_root: targetRoot,
    core_skill_tree_digest: materializationReadiness.actual_digest,
    skill_tree_digest: activatedLock.scope_materializations.find((entry) =>
      entry.scope === input.scope && entry.target_root === targetRoot)?.full_export_digest ?? null,
    core_readiness: materializationReadiness.core_readiness,
    specialty_exposure: materializationReadiness.specialty_exposure,
  };
  const useReceipt = lifecycleReceipt({
    action: 'use',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: activatedLock.manifest_url,
    manifestSha256: activatedLock.manifest_sha256,
    packageLockRef: activatedLock.lock_ref,
    rollbackRef: activatedLock.rollback_ref,
    sourceKind: activatedLock.source_kind,
    trustTier: activatedLock.trust_tier,
    sourceSha256: sha256Text(JSON.stringify(useBinding)),
    writesPerformed: !input.dryRun,
    dependencyTransactionId: activatedLock.dependency_transaction_id,
    dependencyClosureDigest: activatedLock.dependency_closure_digest,
    dependencyPackages,
    useBinding,
  });
  useBinding.use_receipt_ref = useReceipt.receipt_ref;
  useReceipt.use_binding = useBinding;
  if (!input.dryRun) {
    try {
      writePackageTransaction(nextIndex, activationReceipt ? [activationReceipt, useReceipt] : [useReceipt]);
    } catch (error) {
      for (const materialization of materializations) {
        rollbackCapabilityScopeTransaction(materialization);
      }
      throw error;
    }
    for (const materialization of materializations) {
      finalizeCapabilityScopeTransaction(materialization);
    }
  }
  return {
    status: input.dryRun ? 'validated_no_write' : materializations.length > 0 ? 'activated' : 'already_activated',
    package_id: packageId,
    writes_performed: !input.dryRun,
    scope_materializations: materializations,
    lifecycle_receipt: activationReceipt,
    package_lock: activatedLock,
    materialization_readiness: materializationReadiness,
    package_use_binding: useBinding,
    use_receipt: useReceipt,
    closure_reconciliation: reconciliation,
  };
}

export async function runOplAgentPackageActivate(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const beforeStatus = runOplAgentPackageStatus({
    packageId,
    scope: input.scope,
    targetWorkspace: input.targetWorkspace,
    targetQuest: input.targetQuest,
  }).opl_agent_package_status;
  if (input.dryRun && beforeStatus.installed_package_count === 0) {
    return {
      version: 'g2',
      opl_agent_package_activation: {
        surface_kind: 'opl_agent_package_activation',
        status: 'validated_no_write',
        package_id: packageId,
        writes_performed: false,
        package_dependency_readiness: null,
        materialization_readiness: null,
        operational_ready: false,
        launch_allowed: false,
        launch_blocked_reason: 'package_not_installed',
        package_use_binding: null,
        use_boundary_id: input.useBoundaryId ?? null,
        use_receipt_ref: null,
        lifecycle_receipt_ref: null,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
  const activation = await ensureOplAgentPackageScopeActivation({
    ...input,
    packageId,
  });
  const packageStatus = runOplAgentPackageStatus({
    packageId,
    scope: input.scope,
    targetWorkspace: input.targetWorkspace,
    targetQuest: input.targetQuest,
  }).opl_agent_package_status;
  if (!input.dryRun && packageStatus.launch_allowed !== true) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Package activation is blocked until dependency and scope readiness are repaired.',
      {
        package_id: packageId,
        launch_blocked_reason: packageStatus.launch_blocked_reason,
        allowed_when_blocked: packageStatus.allowed_when_blocked,
        package_dependency_readiness: packageStatus.package_dependency_readiness,
        materialization_readiness: packageStatus.materialization_readiness,
        repair_action: packageStatus.repair_action,
        failure_code: 'agent_package_scope_activation_blocked',
      },
    );
  }
  return {
    version: 'g2',
    opl_agent_package_activation: {
      surface_kind: 'opl_agent_package_activation',
      ...activation,
      package_dependency_readiness: packageStatus.package_dependency_readiness,
      materialization_readiness: packageStatus.materialization_readiness,
      operational_ready: input.dryRun ? false : packageStatus.operational_ready,
      launch_allowed: input.dryRun ? false : packageStatus.launch_allowed,
      use_boundary_id: activation.package_use_binding?.use_boundary_id ?? null,
      use_receipt_ref: activation.package_use_binding?.use_receipt_ref ?? null,
      lifecycle_receipt_ref: packageStatus.materialization_readiness?.lifecycle_receipt_ref ?? null,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageProfileApply(input: AgentPackageProfileApplyInput) {
  const packageId = requirePackageId(input.packageId, 'profile_apply');
  const { index } = readRecoveredLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'profile_apply');
  const profileMigration = applyPackageProfile({
    lock,
    mergedFile: input.mergedFile,
    dryRun: input.dryRun === true,
  });
  const physicalSurface = {
    ...lock.physical_surface!,
    profile_migration: profileMigration,
    writes_performed: !input.dryRun,
    reload_required: !input.dryRun,
  };
  const receipt = lifecycleReceipt({
    action: 'profile_apply',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: sha256Text([
      packageActionSourceSha256('profile_apply', lock),
      profileMigration.target_sha256 ?? '',
    ].join('\n')),
    writesPerformed: !input.dryRun,
    physicalSurface,
  });
  const updatedLock = {
    ...lock,
    updated_at: input.dryRun ? lock.updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
    physical_surface: physicalSurface,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = updatedLock;
    writeLockIndex(index);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_profile_apply: {
      surface_kind: 'opl_agent_package_profile_apply',
      status: input.dryRun ? 'validated_no_write' : 'profile_applied',
      dry_run: input.dryRun === true,
      package_lock: updatedLock,
      profile_migration: profileMigration,
      lifecycle_receipt: receipt,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: updatedLock.package_id,
        packages: [{ packageId: updatedLock.package_id, lock: updatedLock, receipt }],
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageFrameworkLink(input: { agentRoot: string; dryRun?: boolean; checkOnly?: boolean }) {
  return {
    version: 'g2',
    opl_agent_package_framework_link: materializeStandardAgentFrameworkLink(input),
  };
}

export function runOplAgentPackageUninstall(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'uninstall');
  const { index } = readRecoveredLockIndex();
  assertNoRequiredInstalledDependents(index, packageId, 'uninstall');
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'uninstall');
  const physicalSurface = removePhysicalCodexSurface(
    lock.physical_surface,
    input.dryRun === true,
    packageId,
    { retainPayloadSource: true },
  );
  let runtimeSourceMutation: ReturnType<typeof removeManagedRuntimeSourceCarrier>;
  try {
    runtimeSourceMutation = removeManagedRuntimeSourceCarrier({
      state: lock.managed_runtime_source,
      transactionId: packageActionSourceSha256('uninstall', lock).slice(0, 16),
      dryRun: input.dryRun === true,
      packageId,
    });
  } catch (error) {
    if (!input.dryRun) rematerializePhysicalCodexSurfaceFromLock(lock, false);
    throw error;
  }
  if (!input.dryRun
    && process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED === '1'
    && process.env.OPL_TEST_RUNTIME_SOURCE_INTERRUPT_AFTER_STAGE_UNINSTALL === '1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Injected interruption after runtime source uninstall staging.', {
      failure_code: 'test_runtime_source_interrupted_after_stage_uninstall',
    });
  }
  const receipt = lifecycleReceipt({
    action: 'uninstall',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: packageActionSourceSha256('uninstall', lock),
    writesPerformed: !input.dryRun,
    physicalSurface,
    managedRuntimeSource: runtimeSourceMutation.after,
  });
  let runtimeSourceCleanup: {
    status: 'not_required' | 'cleanup_completed' | 'cleanup_pending';
    cleanup_paths: string[];
  } = { status: 'not_required', cleanup_paths: [] };
  if (!input.dryRun) {
    const nextIndex = structuredClone(index);
    nextIndex.packages.splice(lockIndex, 1);
    nextIndex.last_known_good_transactions = (nextIndex.last_known_good_transactions ?? [])
      .filter((entry) => entry.root_package_id !== packageId);
    try {
      writePackageTransaction(nextIndex, [receipt]);
    } catch (error) {
      rollbackManagedRuntimeSourceMutation(runtimeSourceMutation);
      rematerializePhysicalCodexSurfaceFromLock(lock, false);
      throw error;
    }
    runtimeSourceCleanup = finalizeManagedRuntimeSourceMutation(runtimeSourceMutation);
    cleanupUnreferencedPackagePayloadSources(index, nextIndex);
    const payloadSource = lock.physical_surface?.plugin_payload_cache_path;
    if (payloadSource && !fs.existsSync(payloadSource)) {
      physicalSurface.removed_paths = [...new Set([...physicalSurface.removed_paths, payloadSource])];
    }
  }
  return {
    version: 'g2',
    opl_agent_package_uninstall: {
      surface_kind: 'opl_agent_package_uninstall',
      status: input.dryRun ? 'validated_no_write' : 'uninstalled',
      dry_run: input.dryRun === true,
      removed_package_lock: lock,
      physical_surface: physicalSurface,
      lifecycle_receipt: receipt,
      runtime_source_cleanup: runtimeSourceCleanup,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: lock.package_id,
        packages: [{ packageId: lock.package_id, lock, receipt }],
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageExposureAction(
  action: 'hide' | 'unhide' | 'enable' | 'disable',
  input: AgentPackagePackageActionInput,
) {
  const packageId = requirePackageId(input.packageId, action);
  const { index } = readRecoveredLockIndex();
  if (action === 'disable') assertNoRequiredInstalledDependents(index, packageId, 'disable');
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, action);
  const nextState = action === 'hide'
    ? 'hidden'
    : action === 'disable'
      ? 'disabled'
      : action === 'enable'
        ? 'enabled'
        : 'visible';
  const receipt = lifecycleReceipt({
    action,
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: packageActionSourceSha256(action, lock),
    writesPerformed: !input.dryRun,
  });
  const updatedLock: AgentPackageLock = {
    ...lock,
    exposure_state: nextState,
    exposure_updated_at: input.dryRun ? lock.exposure_updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = updatedLock;
    writeLockIndex(index);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_exposure: {
      surface_kind: 'opl_agent_package_exposure',
      status: input.dryRun ? 'validated_no_write' : packageActionStatus(action),
      action,
      dry_run: input.dryRun === true,
      package_lock: updatedLock,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageHomeShortcutPreferencesSet(input: AgentPackageHomeShortcutPreferencesSetInput) {
  const packageId = requirePackageId(input.packageId, 'home_shortcut_preferences_set');
  const shortcutId = stringValue(input.shortcutId);
  if (!shortcutId) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package Home shortcut preference requires shortcut_id.', {
      package_id: packageId,
      required: ['shortcut_id'],
    });
  }
  const { index: lockIndex } = readRecoveredLockIndex();
  const stored = readHomeShortcutPreferenceFile();
  const updatedAt = nowIso();
  const nextEntry: AgentPackageHomeShortcutPreference = {
    shortcut_id: shortcutId,
    package_id: packageId,
    visible: input.visible !== false,
    sort_order: typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder) ? input.sortOrder : null,
    source: 'user_preference',
    updated_at: updatedAt,
    installed: lockIndex.packages.some((entry) => entry.package_id === packageId),
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
  const receipt = lifecycleReceipt({
    action: 'home_shortcut_preferences_set',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    sourceKind: 'manifest_import',
    trustTier: null,
    sourceSha256: homeShortcutPreferenceSourceSha256(input),
    writesPerformed: !input.dryRun,
  });
  if (!input.dryRun) {
    writeHomeShortcutPreferenceFile(nextFile);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_home_shortcut_preferences: {
      surface_kind: 'opl_agent_package_home_shortcut_preferences_set',
      status: input.dryRun ? 'validated_no_write' : 'preferences_updated',
      dry_run: input.dryRun === true,
      preference: nextEntry,
      preferences_file: resolveOplStatePaths().agent_package_home_shortcut_preferences_file,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageStatus(input: {
  packageId?: string | null;
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
  recoverRuntimeSource?: boolean;
} = {}) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const { index: lockIndex, runtimeSourceRecovery } = input.recoverRuntimeSource === false
    ? {
        index: readLockIndex(),
        runtimeSourceRecovery: {
          status: 'deferred_read_only' as const,
          recovered_transaction_count: 0,
          cleanup_completed_count: 0,
          cleared_prepared_transaction_count: 0,
          recovered_transaction_ids: [] as string[],
        },
      }
    : readRecoveredLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const paths = resolveOplStatePaths();
  const registryCache = readRegistryCache();
  const installedPackages = packageId
    ? lockIndex.packages.filter((entry) => entry.package_id === packageId)
    : lockIndex.packages;
  const homeShortcutPreferences = mergedHomeShortcutPreferences(registryCache, lockIndex)
    .filter((entry) => !packageId || entry.package_id === packageId);
  const latestReceipts = new Map<string, AgentPackageLifecycleReceipt>();
  for (const receipt of lifecycleLedger.receipts) {
    if (receipt.package_id && !latestReceipts.has(receipt.package_id)) {
      latestReceipts.set(receipt.package_id, receipt);
    }
  }
  const lifecycleUx = agentPackageLifecycleSummaryReadback({
    selectedPackageId: packageId ?? null,
    packages: installedPackages,
  });
  const selectedLock = packageId ? installedPackages[0] ?? null : null;
  const packageDependencyReadiness = selectedLock ? dependencyReadiness(selectedLock, lockIndex) : null;
  let materializationReadiness = selectedLock
    ? scopeMaterializationReadiness(selectedLock, lockIndex, input)
    : null;
  if (selectedLock && materializationReadiness?.status === 'current') {
    const scopeRecords = (selectedLock.scope_materializations ?? []).filter((entry) =>
      entry.scope === materializationReadiness?.scope
      && entry.target_root === materializationReadiness?.target_root);
    const receipt = lifecycleLedger.receipts.find((entry) =>
      entry.receipt_ref === materializationReadiness?.lifecycle_receipt_ref
      && entry.package_id === selectedLock.package_id
      && scopeRecords.every((record) => (entry.scope_materializations ?? [entry.scope_materialization].filter(Boolean))
        .some((receiptRecord) => receiptRecord?.scope === record.scope
          && receiptRecord.target_root === record.target_root
          && receiptRecord.provider_package_id === record.provider_package_id
          && receiptRecord.content_digest === record.content_digest)));
    if (!receipt) {
      materializationReadiness = {
        ...materializationReadiness,
        status: 'incompatible',
        lifecycle_receipt_ref: null,
      };
    }
  }
  const runtimeSourceReadiness = managedRuntimeSourceReadiness(
    selectedLock?.managed_runtime_source,
    selectedLock?.runtime_source_carrier,
  );
  const operationalReady = Boolean(
    packageDependencyReadiness?.operational_ready
    && (materializationReadiness?.status === 'current' || materializationReadiness?.status === 'not_required')
    && runtimeSourceReadiness.operational_ready,
  );
  return {
    version: 'g2',
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status',
      status: packageId && installedPackages.length === 0
        ? 'not_installed'
        : packageId && !operationalReady
          ? 'attention_needed'
          : 'available',
      package_id: packageId ?? null,
      installed_package_count: installedPackages.length,
      installed_packages: installedPackages,
      conditions: lifecycleUx.conditions,
      recommended_action: lifecycleUx.recommended_action,
      lifecycle_action_refs: lifecycleUx.lifecycle_action_refs,
      lifecycle_ux: lifecycleUx,
      package_dependency_readiness: packageDependencyReadiness,
      materialization_readiness: materializationReadiness,
      runtime_source_readiness: runtimeSourceReadiness,
      runtime_source_recovery: runtimeSourceRecovery,
      operational_ready: operationalReady,
      operational_ready_scope: 'package_dependency_scope_and_runtime_source',
      launch_allowed: operationalReady,
      launch_blocked_reason: operationalReady
        ? null
        : packageDependencyReadiness && !packageDependencyReadiness.operational_ready
          ? `package_dependency_${packageDependencyReadiness.status}`
          : materializationReadiness
            && materializationReadiness.status !== 'current'
            && materializationReadiness.status !== 'not_required'
            ? `scope_materialization_${materializationReadiness.status}`
            : !runtimeSourceReadiness.operational_ready
              ? `runtime_source_${runtimeSourceReadiness.status}`
              : 'package_not_installed',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
      repair_action: selectedLock && !operationalReady
        ? materializationReadiness?.repair_command ?? packageDependencyReadiness?.repair_command ?? null
        : null,
      home_shortcut_preferences: homeShortcutPreferences,
      lifecycle_receipts: lifecycleLedger.receipts.filter((receipt) => !packageId || receipt.package_id === packageId),
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: packageId ?? null,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
        packages: installedPackages.map((lock) => ({
          packageId: lock.package_id,
          lock,
          receipt: latestReceipts.get(lock.package_id) ?? null,
        })),
      }),
      files: {
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function listOplAgentPackages(input: { detail?: 'fast' | 'full' } = {}) {
  const paths = resolveOplStatePaths();
  const registryCache = readRegistryCache();
  const { index: lockIndex } = readRecoveredLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const homeShortcutPreferences = mergedHomeShortcutPreferences(registryCache, lockIndex);
  const latestReceipts = new Map<string, AgentPackageLifecycleReceipt>();
  for (const receipt of lifecycleLedger.receipts) {
    if (receipt.package_id && !latestReceipts.has(receipt.package_id)) {
      latestReceipts.set(receipt.package_id, receipt);
    }
  }
  const lifecycleUx = agentPackageLifecycleSummaryReadback({ packages: lockIndex.packages });
  return {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      status: 'available',
      registry_cache: registryCache,
      installed_package_count: lockIndex.packages.length,
      installed_packages: lockIndex.packages,
      conditions: lifecycleUx.conditions,
      recommended_action: lifecycleUx.recommended_action,
      lifecycle_action_refs: lifecycleUx.lifecycle_action_refs,
      lifecycle_ux: lifecycleUx,
      home_shortcut_preferences: homeShortcutPreferences,
      lifecycle_receipt_count: lifecycleLedger.receipts.length,
      lifecycle_receipts: lifecycleLedger.receipts,
      owner_route_readback: input.detail === 'fast'
        ? {
            surface_kind: 'opl_agent_package_owner_route_readback',
            status: 'deferred_fast_profile',
            selected_package_id: null,
            package_count: lockIndex.packages.length,
            packages: [],
            detail_surface: 'opl packages status --package-id <package_id> --json',
            authority_boundary: refsOnlyAuthorityBoundary(),
          }
        : ownerRouteReadback({
            packages: lockIndex.packages.map((lock) => ({
              packageId: lock.package_id,
              lock,
              receipt: latestReceipts.get(lock.package_id) ?? null,
            })),
          }),
      files: {
        registry_cache_file: paths.agent_package_registry_cache_file,
        package_lock_file: paths.agent_package_lock_file,
        lifecycle_ledger_file: paths.agent_package_lifecycle_ledger_file,
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function readInstalledOplAgentPackageLocks() {
  return readRecoveredLockIndex().index.packages;
}

export function readOplFlowDefaultUserInstructions() {
  const lock = readLockIndex().packages.find((entry) => entry.package_id === 'opl-flow') ?? null;
  const sourceRoot = lock?.physical_surface?.plugin_payload_cache_path ?? null;
  const sourcePath = sourceRoot ? path.join(sourceRoot, 'templates', 'AGENTS.md') : null;
  const base = {
    surface_kind: 'opl_flow_default_user_instructions.v1' as const,
    source: 'installed_opl_package_lock' as const,
    source_path: sourcePath,
    source_root: sourceRoot,
    package_version: lock?.package_version ?? null,
    package_lock_ref: lock?.lock_ref ?? null,
    manifest_sha256: lock?.manifest_sha256 ?? null,
    content_digest: lock?.content_digest ?? null,
    plugin_payload_manifest_sha256: lock?.physical_surface?.plugin_payload_manifest_sha256 ?? null,
  };
  if (!lock) {
    return {
      ...base,
      status: 'unavailable' as const,
      reason: 'opl_flow_package_not_installed' as const,
      content: null,
      sha256: null,
    };
  }
  if (!sourceRoot || !sourcePath) {
    return {
      ...base,
      status: 'unavailable' as const,
      reason: 'managed_package_payload_not_materialized' as const,
      content: null,
      sha256: null,
    };
  }
  try {
    const sourceRootRealPath = fs.realpathSync(sourceRoot);
    const sourcePathRealPath = fs.realpathSync(sourcePath);
    if (!sourcePathRealPath.startsWith(`${sourceRootRealPath}${path.sep}`)
      || !fs.statSync(sourcePathRealPath).isFile()) {
      throw new Error('OPL Flow default instructions escaped the locked package payload.');
    }
    const content = fs.readFileSync(sourcePathRealPath, 'utf8');
    return {
      ...base,
      status: 'available' as const,
      reason: null,
      content,
      sha256: sha256Text(content),
    };
  } catch {
    return {
      ...base,
      status: 'invalid' as const,
      reason: 'locked_default_instructions_missing_or_invalid' as const,
      content: null,
      sha256: null,
    };
  }
}

export function readOplFlowManagedDependencyIds() {
  const lock = readLockIndex().packages.find((entry) => entry.package_id === 'opl-flow') ?? null;
  return [...new Set(lock?.physical_surface?.workflow_policy_migration?.dependency_ids ?? [])];
}

export function readOplFlowManagedDependencies() {
  const lock = readLockIndex().packages.find((entry) => entry.package_id === 'opl-flow') ?? null;
  const migration = lock?.physical_surface?.workflow_policy_migration;
  const sync = migration?.dependency_sync && typeof migration.dependency_sync === 'object'
    ? migration.dependency_sync as Record<string, unknown>
    : null;
  const items = Array.isArray(sync?.items) ? sync.items.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === 'object'
  )) : [];
  const tools = Array.isArray(sync?.tools) ? sync.tools.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === 'object'
  )) : [];
  const recordedDependencies = migration?.dependencies ?? [];
  const dependencies = recordedDependencies.length > 0
    ? recordedDependencies
    : [
        ...((migration?.dependency_ids ?? []).includes('opl-base')
          ? [{
              id: 'opl-base',
              kind: 'base' as const,
              activation: 'always',
              offline_bundle: 'full',
              online_install_default: true,
              source: 'installed_opl_flow_package_lock',
            }]
          : []),
        ...items.flatMap((entry) => {
          const id = typeof entry.skill_id === 'string' ? entry.skill_id : null;
          return id
            ? [{
                id,
                kind: 'codex_skill' as const,
                activation: 'task_routed',
                offline_bundle: 'full',
                online_install_default: true,
                source: typeof entry.source_path === 'string'
                  ? entry.source_path
                  : 'installed_opl_flow_dependency_sync',
              }]
            : [];
        }),
        ...tools.flatMap((entry) => {
          const id = typeof entry.tool_id === 'string' ? entry.tool_id : null;
          return id
            ? [{
                id,
                kind: 'cli' as const,
                activation: 'task_routed',
                offline_bundle: 'full',
                online_install_default: true,
                source: typeof entry.binary_path === 'string'
                  ? entry.binary_path
                  : 'installed_opl_flow_dependency_sync',
              }]
            : [];
        }),
      ];
  return dependencies.map((dependency) => {
    const observed = dependency.kind === 'codex_skill'
      ? items.find((entry) => entry.skill_id === dependency.id)
      : dependency.kind === 'cli'
        ? tools.find((entry) => entry.tool_id === dependency.id)
        : null;
    const observedStatus = typeof observed?.status === 'string' ? observed.status : null;
    return {
      dependency_id: dependency.id,
      dependency_kind: dependency.kind,
      activation: dependency.activation,
      offline_bundle: dependency.offline_bundle,
      online_install_default: dependency.online_install_default,
      source: dependency.source,
      lifecycle_owner: dependency.kind === 'codex_skill' ? 'opl_packages' : 'opl_base',
      update_mode: dependency.online_install_default ? 'silent_managed' : 'detect_only_guidance',
      observed_status: observedStatus,
      installed: dependency.kind === 'base'
        ? true
        : observedStatus ? !['missing', 'missing_source', 'failed'].includes(observedStatus) : null,
    };
  });
}
