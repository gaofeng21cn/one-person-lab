import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deriveAgentPackageLaunchState } from '../../kernel/agent-package-launch-state.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue } from '../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { resolveStandardAgent } from '../../kernel/standard-agent-registry.ts';
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
  packageReceiptRef,
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
import { agentPackageTargetCurrentness } from './agent-package-registry-parts/currentness.ts';
import {
  materializeCapabilityScope,
  materializeCapabilityScopeFromLock,
  finalizeCapabilityScopeTransaction,
  packageScopeTarget,
  retireCapabilityScopeMaterialization,
  rollbackCapabilityScopeTransaction,
  scopeMaterializationReadiness,
} from './agent-package-registry-parts/scope-materialization.ts';
import { materializeAgentPackageSkillProjection } from './agent-package-registry-parts/skill-projection.ts';
import {
  cleanupUnreferencedPackagePayloadSources,
  materializePhysicalCodexSurface,
  removePhysicalCodexSurface,
  rematerializePhysicalCodexSurfaceFromLock,
  rollbackManagedPolicySurface,
  rollbackNewPackageProfileSurface,
  resolveBundledFullRuntimeManifestPhysicalSource,
  resolveManifestPhysicalSource,
} from './agent-package-registry-parts/physical-surface.ts';
import {
  assertBundledFullRuntimePackageRoots,
  readBundledFullRuntimePackageCatalog,
  type BundledFullRuntimeCatalogEntry,
} from './agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import {
  agentPackageCarrierReceiptAuthorityStatus,
  buildAgentPackageCarrierAuthority,
} from './agent-package-registry-parts/carrier-authority.ts';
import {
  applyPackageProfile,
  assertPackageProfileRollbackReady,
  finalizePackageProfileRollback,
  rollbackPackageProfileMigration,
} from './agent-package-registry-parts/profile-surface.ts';
import {
  assertManagedPolicyRollbackReady,
  finalizeManagedPolicyRollback,
  managedPolicyCurrentness,
  rollbackManagedPolicyMigration,
} from './agent-package-registry-parts/managed-policy-surface.ts';
import {
  applyManagedRuntimeSourceCarrier,
  finalizeManagedRuntimeSourceMutation,
  inspectManagedRuntimeSourceTransactions,
  managedRuntimeSourceLockReadiness,
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
  buildAgentPackageDirectory,
  enrichRegistryCacheManifestMetadata,
} from './agent-package-registry-parts/directory.ts';
import {
  readFirstPartyPackageCatalogSnapshot,
  refreshFirstPartyPackageCatalogSnapshot,
  resolveFirstPartyPackageCatalogSnapshot,
} from './agent-package-registry-parts/release-catalog-cache.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './agent-package-registry-parts/source-policy.ts';
import {
  loadDeveloperCheckoutPackageSource,
  mergeDeveloperCheckoutPackageManifest,
} from './agent-package-registry-parts/developer-checkout-package-source.ts';
import {
  agentPackageClosureTargetCurrentness,
  agentPackageUpdateReadback,
  assertFirstPartyPackageUpdateSelection,
  developerAgentRootsForPackageIds,
  firstPartyCatalogClosure,
  installedPackageClosure,
  packageBulkUpdateSafety,
} from './agent-package-registry-parts/update-reconciliation.ts';
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
  withAgentPackageLifecycleTransaction,
  writePackageTransaction,
  writeRegistryCache,
} from './agent-package-registry-parts/store.ts';
import {
  optimizeInstalledPackageSource,
  rollbackInstalledPackageOptimization,
} from './agent-package-registry-parts/installed-source-optimize.ts';
import type {
  AgentPackageHomeShortcutPreference,
  AgentPackageHomeShortcutPreferenceFile,
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageCarrierAuthority,
  AgentPackageInstallInput,
  AgentPackageLifecycleReceipt,
  AgentPackageLastKnownGood,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifestValidateInput,
  AgentPackageManifest,
  AgentPackageManagedVersionCatalogSource,
  AgentPackagePackageActionInput,
  AgentPackagePhysicalSurface,
  AgentPackageScopeMaterialization,
  AgentPackageProfileApplyInput,
  AgentPackageRepairInput,
  AgentPackageRegistryRefreshInput,
  AgentPackageUseBinding,
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
  developerCheckoutPath: string | null;
  developerCheckoutPayloadFiles: ReturnType<typeof loadDeveloperCheckoutPackageSource>['payloadFiles'] | null;
};

type TrustedBundledFullRuntimeInstall = {
  packageId: string;
  agentRoot: string;
  packageRoots: Record<string, string>;
};

type BundledFullRuntimeAgentPackageInput = {
  packageId: string;
  agentRoot: string;
  packageRoots?: Record<string, string>;
  dryRun?: boolean;
};

type ManagedBundledFullRuntimeAgentPackageInput = BundledFullRuntimeAgentPackageInput & {
  operationId: string;
  verifyAppliedPackageLocks: (
    locks: AgentPackageLock[],
  ) => void | Promise<void>;
};

type BundledFullRuntimePathSnapshot = {
  targetPath: string;
  snapshotPath: string;
  existed: boolean;
  missingAncestorPaths: string[];
};

type BundledFullRuntimePackageSnapshot = {
  root: string;
  paths: BundledFullRuntimePathSnapshot[];
};

function bundledFullRuntimePayloadContentDigest(entry: BundledFullRuntimeCatalogEntry) {
  const payload = parseJsonText(entry.payloadManifestJson);
  const contentLock = isRecord(payload) && isRecord(payload.content_lock)
    ? payload.content_lock
    : null;
  const digest = stringValue(contentLock?.digest);
  if (!digest || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Full runtime package payload has no canonical content lock digest.',
      {
        package_id: entry.packageId,
        payload_manifest_url: entry.payloadManifestUrl,
        failure_code: 'agent_package_bundled_payload_content_lock_missing',
      },
    );
  }
  return digest;
}

function preparedOwnerSourceCommit(prepared: PreparedPackage) {
  if (prepared.sourceKind === 'developer_checkout_override') {
    return prepared.manifest.developer_checkout_source?.source_git_head_sha ?? null;
  }
  const verifiedCommit = prepared.manifest.verified_payload_source_commit;
  const catalogCommit = prepared.catalogVersion?.owner_source_commit ?? null;
  if (catalogCommit !== null && verifiedCommit !== catalogCommit) {
    throw new FrameworkContractError('contract_shape_invalid', 'Verified package payload carrier commit does not match the current catalog selection.', {
      package_id: prepared.manifest.package_id,
      manifest_carrier_source_commit: prepared.manifest.carrier_source_commit,
      verified_payload_source_commit: verifiedCommit,
      catalog_owner_source_commit: catalogCommit,
      failure_code: 'agent_package_carrier_source_commit_mismatch',
    });
  }
  if ((prepared.sourceKind === 'first_party_managed_cohort'
    || prepared.sourceKind === 'bundled_full_runtime_modules')
    && (verifiedCommit === null || !/^[0-9a-f]{40}$/.test(verifiedCommit))) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party package installation requires a verified carrier source commit.', {
      package_id: prepared.manifest.package_id,
      manifest_carrier_source_commit: prepared.manifest.carrier_source_commit,
      verified_payload_source_commit: verifiedCommit,
      failure_code: 'agent_package_carrier_source_commit_missing',
    });
  }
  return verifiedCommit;
}

function preparedCarrierAuthority(
  prepared: PreparedPackage,
  channelRef: string | null,
  channelDigest: string | null,
): AgentPackageCarrierAuthority | null {
  if (prepared.sourceKind !== 'first_party_managed_cohort'
    && prepared.sourceKind !== 'bundled_full_runtime_modules') return null;
  return buildAgentPackageCarrierAuthority({
    packageId: prepared.manifest.package_id,
    catalogRef: channelRef,
    catalogSha256: channelDigest,
    catalogOwnerSourceCommit: prepared.catalogVersion?.owner_source_commit ?? null,
    manifestCarrierSourceCommit: prepared.manifest.carrier_source_commit,
    payloadSourceCommit: prepared.manifest.verified_payload_source_commit,
  });
}

function preparedCatalogArtifactRef(prepared: PreparedPackage) {
  if (prepared.sourceKind === 'developer_checkout_override') return null;
  return prepared.catalogVersion
    ? prepared.catalogVersion.source_artifact_ref
    : prepared.previousLock?.source_artifact_ref ?? null;
}

function preparedCatalogArtifactDigest(prepared: PreparedPackage) {
  if (prepared.sourceKind === 'developer_checkout_override') return null;
  return prepared.catalogVersion
    ? prepared.catalogVersion.artifact_digest
    : prepared.previousLock?.artifact_digest ?? null;
}

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

function readRecoveredLockIndex(dryRun = false) {
  const index = readLockIndex();
  return {
    index,
    runtimeSourceRecovery: dryRun
      ? inspectManagedRuntimeSourceTransactions()
      : recoverManagedRuntimeSourceTransactions(index),
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

function installedLockClosure(index: AgentPackageLockIndex, root: AgentPackageLock) {
  const byId = new Map(index.packages.map((entry) => [entry.package_id, entry]));
  const visited = new Set<string>();
  const ordered: AgentPackageLock[] = [];
  const visit = (lock: AgentPackageLock) => {
    if (visited.has(lock.package_id)) return;
    visited.add(lock.package_id);
    for (const dependency of lock.resolved_dependencies ?? []) {
      const provider = byId.get(dependency.package_id);
      if (provider) visit(provider);
    }
    ordered.push(structuredClone(lock));
  };
  visit(root);
  return ordered;
}

function installedClosurePrestate(
  index: AgentPackageLockIndex,
  preparedPackages: PreparedPackage[],
) {
  const seen = new Set<string>();
  const ordered: AgentPackageLock[] = [];
  for (const prepared of preparedPackages) {
    if (!prepared.previousLock) continue;
    for (const lock of installedLockClosure(index, prepared.previousLock)) {
      if (seen.has(lock.package_id)) continue;
      seen.add(lock.package_id);
      ordered.push(lock);
    }
  }
  return ordered;
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
    trustedBundledFullRuntimeInstall?: TrustedBundledFullRuntimeInstall | null;
    sourceReconcile?: boolean;
  } = {},
) {
  const packageId = canonicalAgentPackageId(stringValue(input.packageId));
  const trustedBundledInstall = options.trustedBundledFullRuntimeInstall ?? null;
  const bundledFullRuntimeCatalog = trustedBundledInstall
    ? readBundledFullRuntimePackageCatalog()
    : null;
  if (input.sourceKind === 'bundled_full_runtime_modules' && !trustedBundledInstall) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package sources are restricted to the internal managed Package reconciliation.', {
      package_id: packageId,
      source_kind: input.sourceKind,
      failure_code: 'agent_package_bundled_full_runtime_source_internal_only',
    });
  }
  if (trustedBundledInstall) {
    const catalogEntry = bundledFullRuntimeCatalog?.entries.get(trustedBundledInstall.packageId) ?? null;
    const expectedManifestUrl = catalogEntry?.manifestUrl ?? null;
    const selectedPackageRoot = stringValue(trustedBundledInstall.packageRoots[trustedBundledInstall.packageId]);
    const trustedManagedUpdate = action === 'update'
      && input.provenance?.trigger === 'managed_update_kernel_apply'
      && input.provenance.initiator === 'opl_managed_update_kernel'
      && input.provenance.source_policy === 'bundled_full_runtime_modules';
    if ((action !== 'install' && !trustedManagedUpdate)
      || packageId !== trustedBundledInstall.packageId
      || input.sourceKind !== 'bundled_full_runtime_modules'
      || stringValue(input.manifestUrl) !== expectedManifestUrl
      || !selectedPackageRoot
      || path.resolve(selectedPackageRoot) !== path.resolve(trustedBundledInstall.agentRoot)
      || path.resolve(stringValue(input.agentRoot) ?? '') !== path.resolve(trustedBundledInstall.agentRoot)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Internal bundled Full runtime package selection is inconsistent.', {
        package_id: packageId,
        expected_package_id: trustedBundledInstall.packageId,
        manifest_url: stringValue(input.manifestUrl),
        expected_manifest_url: expectedManifestUrl,
        selected_package_root: selectedPackageRoot,
        lifecycle_action: action,
        managed_update_provenance_valid: trustedManagedUpdate,
        failure_code: 'agent_package_bundled_full_runtime_selection_invalid',
      });
    }
    assertBundledFullRuntimePackageRoots({
      catalog: bundledFullRuntimeCatalog!,
      rootPackageId: trustedBundledInstall.packageId,
      packageRoots: trustedBundledInstall.packageRoots,
    });
  }
  const hasExplicitSource = Boolean(stringValue(input.manifestUrl) || stringValue(input.registryUrl));
  const hasResolvedCatalogSelection = Boolean(
    options.catalog
    && options.rootVersion
    && options.catalogSource,
  );
  const firstPartyOwner = resolveFirstPartyPackageCatalog(packageId);
  if (firstPartyOwner
    && hasExplicitSource
    && !hasResolvedCatalogSelection
    && !trustedBundledInstall
    && !options.sourceReconcile) {
    throw new FrameworkContractError('contract_shape_invalid', 'Canonical first-party packages must resolve through the Framework-owned Release Set catalog.', {
      package_id: firstPartyOwner.canonicalId,
      explicit_manifest_source: Boolean(stringValue(input.manifestUrl)),
      explicit_registry_source: Boolean(stringValue(input.registryUrl)),
      failure_code: 'first_party_package_explicit_source_forbidden',
    });
  }
  const { index } = readRecoveredLockIndex(input.dryRun === true);
  const existingLock = packageId
    ? index.packages.find((entry) => entry.package_id === packageId)
    : null;
  if (existingLock?.source_kind === 'bundled_full_runtime_modules' && !trustedBundledInstall) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Full runtime packages must be reconciled from the App-carried local source closure.',
      {
        package_id: existingLock.package_id,
        action,
        failure_code: 'agent_package_bundled_full_runtime_internal_reconcile_required',
        recovery_action: 'run opl update plan --json, then opl update apply --json with the complete catalog-owned Full runtime package roots and verify opl packages status --json',
      },
    );
  }
  if (action !== 'install'
    && existingLock?.source_kind === 'developer_checkout_override'
    && !options.sourceReconcile) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout package locks must be reconciled through the effective source policy without package-channel checkout overwrite.', {
      package_id: existingLock.package_id,
      action,
      source_kind: existingLock.source_kind,
      failure_code: 'agent_package_developer_checkout_auto_update_forbidden',
      manual_confirmation_path: 'review the checkout and run an explicit install/relock through the effective developer source policy',
    });
  }
  const shouldUseFirstPartyCatalog = (!hasExplicitSource || hasResolvedCatalogSelection || Boolean(trustedBundledInstall))
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
  const firstParty = shouldUseFirstPartyCatalog ? firstPartyOwner : null;
  let catalog = bundledFullRuntimeCatalog?.catalog ?? options.catalog ?? null;
  let rootVersion = bundledFullRuntimeCatalog
    ? selectManagedCatalogPackageVersion(bundledFullRuntimeCatalog.catalog, trustedBundledInstall!.packageId)
    : options.rootVersion ?? null;
  let catalogSource = options.catalogSource
    ?? (trustedBundledInstall ? null : firstParty?.catalogSource ?? null);
  let channelRef = bundledFullRuntimeCatalog?.catalogRef ?? options.channelRef ?? null;
  let channelDigest = bundledFullRuntimeCatalog?.catalogSha256 ?? options.channelDigest ?? null;
  const developerRootReconcile = Boolean(
    options.sourceReconcile
    && packageId
    && resolveAgentPackageEffectiveSourcePolicy(packageId).desired_source_kind
      === 'developer_checkout_override',
  );
  if (firstParty
    && !trustedBundledInstall
    && !developerRootReconcile
    && (!catalog || !rootVersion)) {
    const fetched = await fetchManagedPackageCatalog(firstParty.catalogSource);
    catalog = fetched.catalog;
    rootVersion = selectManagedCatalogPackageVersion(catalog, firstParty.canonicalId);
    catalogSource = firstParty.catalogSource;
    channelRef = fetched.channel_ref;
    channelDigest = fetched.channel_digest;
  }
  if (firstParty && rootVersion && !trustedBundledInstall) {
    assertFirstPartyPackageCatalogVersion(firstParty.canonicalId, rootVersion);
  }
  const selection = trustedBundledInstall
    ? {
        registryUrl: null,
        packageId: trustedBundledInstall.packageId,
        manifestUrl: bundledFullRuntimeCatalog!.entries.get(trustedBundledInstall.packageId)!.manifestUrl,
        trustTier: firstParty!.trustTier,
        registryEntry: null,
      }
    : firstParty && rootVersion
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
    if (firstParty && catalogVersion && !trustedBundledInstall) {
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
    const manifestFirstPartyOwner = resolveFirstPartyPackageCatalog(manifest.package_id);
    const trustedBundledManifestSelection = Boolean(
      trustedBundledInstall
      && bundledFullRuntimeCatalog?.entries.get(manifest.package_id)?.manifestUrl === nextSelection.manifestUrl,
    );
    const developerSourceReconcile = Boolean(
      options.sourceReconcile
      && resolveAgentPackageEffectiveSourcePolicy(manifest.package_id).desired_source_kind
        === 'developer_checkout_override',
    );
    if (manifestFirstPartyOwner
      && !(firstParty && catalogVersion && catalogSource)
      && !developerSourceReconcile
      && !trustedBundledManifestSelection) {
      throw new FrameworkContractError('contract_shape_invalid', 'Canonical first-party package manifests must come from the Framework-owned Release Set catalog.', {
        package_id: manifestFirstPartyOwner.canonicalId,
        failure_code: 'first_party_package_external_manifest_forbidden',
      });
    }
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
    if (catalogVersion && catalogSource && !trustedBundledInstall) {
      manifest = { ...manifest, managed_update_source: catalogSource };
    }
    const effectiveSourcePolicy = manifestFirstPartyOwner && !trustedBundledManifestSelection
      ? resolveAgentPackageEffectiveSourcePolicy(manifest.package_id)
      : null;
    const policySourceKind = effectiveSourcePolicy?.desired_source_kind ?? firstParty?.sourceKind ?? null;
    const requestedDeveloperCheckoutPath = input.agentRoots?.[manifest.package_id]
      ?? (manifest.package_id === packageId ? stringValue(input.agentRoot) : null);
    const developerCheckoutPath = policySourceKind === 'developer_checkout_override'
      ? requestedDeveloperCheckoutPath
        ?? effectiveSourcePolicy?.developer_checkout_path
        ?? null
      : null;
    if (policySourceKind === 'developer_checkout_override'
      && !effectiveSourcePolicy?.developer_checkout_available) {
      throw new FrameworkContractError('contract_shape_invalid', 'Developer Mode selected a package checkout that is not available.', {
        package_id: manifest.package_id,
        module_id: effectiveSourcePolicy?.module_id ?? null,
        checkout_path: effectiveSourcePolicy?.developer_checkout_path ?? null,
        source_policy_reason: effectiveSourcePolicy?.reason ?? null,
        failure_code: 'agent_package_developer_checkout_unavailable',
      });
    }
    if (policySourceKind === 'developer_checkout_override'
      && requestedDeveloperCheckoutPath
      && effectiveSourcePolicy?.developer_checkout_path
      && path.resolve(requestedDeveloperCheckoutPath) !== path.resolve(effectiveSourcePolicy.developer_checkout_path)) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package developer checkout must match the effective module source policy.', {
        package_id: manifest.package_id,
        requested_checkout_path: path.resolve(requestedDeveloperCheckoutPath),
        required_checkout_path: path.resolve(effectiveSourcePolicy.developer_checkout_path),
        source_policy_reason: effectiveSourcePolicy.reason,
        failure_code: 'first_party_package_developer_checkout_path_mismatch',
      });
    }
    let manifestSha256 = fetched.source_sha256;
    let developerCheckoutPayloadFiles: ReturnType<typeof loadDeveloperCheckoutPackageSource>['payloadFiles'] | null = null;
    if (policySourceKind === 'developer_checkout_override' && developerCheckoutPath) {
      const developerSource = loadDeveloperCheckoutPackageSource(
        manifest.package_id,
        developerCheckoutPath,
      );
      manifest = mergeDeveloperCheckoutPackageManifest({
        base: manifest,
        owner: developerSource.ownerManifest,
        source: developerSource.source,
        pluginId: developerSource.pluginId,
        managedUpdateSource: catalogSource
          ?? manifest.managed_update_source
          ?? index.packages.find((entry) => entry.package_id === manifest.package_id)?.managed_update_source
          ?? null,
      });
      manifestSha256 = developerSource.source.owner_manifest_sha256;
      developerCheckoutPayloadFiles = developerSource.payloadFiles;
    }
    let inlinePayloadRoot: string | null = null;
    if (catalogVersion?.payload_manifest_json
      && !trustedBundledInstall
      && policySourceKind !== 'developer_checkout_override') {
      inlinePayloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-inline-package-payload-'));
      const payloadPath = path.join(inlinePayloadRoot, 'payload.json');
      fs.writeFileSync(payloadPath, catalogVersion.payload_manifest_json, 'utf8');
      manifest = { ...manifest, plugin_source_path: null, plugin_payload_manifest_url: payloadPath };
    }
    const immutableSelection = trustedBundledInstall || policySourceKind === 'developer_checkout_override'
      ? null
      : packageChannelSelection(manifest.package_id, catalogVersion);
    try {
      if (trustedBundledInstall) {
        const catalogEntry = bundledFullRuntimeCatalog?.entries.get(manifest.package_id) ?? null;
        const packageRoot = stringValue(trustedBundledInstall.packageRoots[manifest.package_id]);
        if (!catalogEntry || !packageRoot) {
          throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package dependency is absent from the packaged source roots.', {
            root_package_id: trustedBundledInstall.packageId,
            package_id: manifest.package_id,
            catalog_entry_present: Boolean(catalogEntry),
            package_root_present: Boolean(packageRoot),
            expected_runtime_module_relative_path: catalogEntry?.runtimeModuleRelativePath ?? null,
            failure_code: 'agent_package_bundled_dependency_root_missing',
          });
        }
        manifest = resolveBundledFullRuntimeManifestPhysicalSource({
          manifest,
          catalogEntry,
          packageRoot,
        });
        manifest = {
          ...manifest,
          content_digest: bundledFullRuntimePayloadContentDigest(catalogEntry),
        };
      } else {
        manifest = await resolveManifestPhysicalSource(
          manifest,
          input.dryRun === true,
          immutableSelection,
        );
      }
    } finally {
      if (inlinePayloadRoot) fs.rmSync(inlinePayloadRoot, { recursive: true, force: true });
    }
    if (!(input.dryRun === true
      && manifest.plugin_payload_manifest_url
      && !immutableSelection
      && !trustedBundledInstall)) {
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
    const packagedFirstParty = Boolean(
      trustedBundledManifestSelection
      && input.sourceKind === 'bundled_full_runtime_modules'
      && stringValue(trustedBundledInstall?.packageRoots[manifest.package_id]),
    );
    if (firstParty
      && input.sourceKind
      && manifest.package_id === packageId
      && input.sourceKind !== policySourceKind
      && !trustedBundledManifestSelection) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package source kind must match the effective module source policy.', {
        package_id: manifest.package_id,
        requested_source_kind: input.sourceKind,
        required_source_kind: policySourceKind,
        source_policy_reason: effectiveSourcePolicy?.reason ?? null,
        failure_code: 'first_party_package_source_kind_policy_mismatch',
      });
    }
    const sourceKind = normalizeSourceKind(
      packagedFirstParty
        ? input.sourceKind
        : trustedBundledManifestSelection
          ? firstParty!.sourceKind
        : firstParty && (catalogVersion || developerSourceReconcile) ? policySourceKind : input.sourceKind,
      nextSelection.manifestUrl,
    );
    return {
      selection: nextSelection,
      manifest,
      manifestSha256,
      sourceKind,
      trustTier,
      previousLock: index.packages.find((entry) => entry.package_id === manifest.package_id) ?? null,
      catalogVersion: catalogVersion ?? null,
      packageChannelSelection: immutableSelection,
      developerCheckoutPath: sourceKind === 'developer_checkout_override' ? developerCheckoutPath : null,
      developerCheckoutPayloadFiles,
    };
  }

  const root = await preparePackage(selection, undefined, rootVersion);
  if (root.previousLock && action === 'install' && !options.sourceReconcile) {
    assertNoRequiredInstalledDependents(index, root.manifest.package_id, 'install');
  }
  if (root.sourceKind === 'developer_checkout_override'
    && action !== 'install'
    && !options.sourceReconcile) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout package locks must use source-policy reconciliation instead of a package-channel update action.', {
      package_id: root.manifest.package_id,
      action,
      source_kind: root.sourceKind,
      failure_code: 'agent_package_developer_checkout_auto_update_forbidden',
      manual_confirmation_path: 'review the checkout and run an explicit install/relock through the effective developer source policy',
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
      const dependencySourcePolicy = resolveAgentPackageEffectiveSourcePolicy(dependency.package_id);
      if (options.sourceReconcile
        && dependencySourcePolicy.desired_source_kind === 'developer_checkout_override'
        && dependencySourcePolicy.developer_checkout_available
        && dependencySourcePolicy.developer_checkout_path) {
        const developerDependency = loadDeveloperCheckoutPackageSource(
          dependency.package_id,
          dependencySourcePolicy.developer_checkout_path,
        );
        dependencySelection = {
          registryUrl: null,
          packageId: dependency.package_id,
          manifestUrl: developerDependency.source.owner_manifest_path,
          trustTier: prepared.trustTier,
          registryEntry: null,
        };
      } else if (catalog) {
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
      const resolved = validateCapabilityProvider(
        dependency,
        provider.manifest,
        provider.manifestSha256,
        prepared.manifest.agent_id,
      );
      resolved.manifest_url = dependencySelection.manifestUrl;
      await visit(provider);
    }
    visiting.delete(prepared.manifest.package_id);
    preparedById.set(prepared.manifest.package_id, prepared);
    ordered.push(prepared);
  }
  await visit(root);
  const previousClosureLocks = installedClosurePrestate(index, ordered);

  for (const prepared of ordered) {
    if (!resolveFirstPartyPackageCatalog(prepared.manifest.package_id)) {
      assertPermissionScopeUnchanged(
        prepared.previousLock,
        prepared.manifest,
        action === 'install' && !options.sourceReconcile ? 'install' : 'update',
      );
    }
    const physicalPreview = materializePhysicalCodexSurface(prepared.manifest, true, {
      keepMigrationIds: input.keepMigrationIds,
      developerCheckoutPayloadFiles: prepared.developerCheckoutPayloadFiles ?? undefined,
      companionNetworkAccess: trustedBundledInstall ? 'forbidden' : undefined,
    });
    if (trustedBundledInstall && action === 'update') {
      const serviceConflicts = physicalPreview.workflow_policy_migration.detected_conflicts
        .filter((entry) => entry.surface_kind === 'service');
      const profileRequiresOwnerMerge = physicalPreview.profile_migration.status === 'semantic_merge_required';
      if (profileRequiresOwnerMerge || serviceConflicts.length > 0) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Managed bundled package update requires an owner-visible profile or service migration.',
          {
            package_id: prepared.manifest.package_id,
            profile_migration_status: physicalPreview.profile_migration.status,
            service_conflicts: serviceConflicts,
            mutation_started: false,
            failure_code: 'agent_package_bundled_managed_surface_manual_required',
          },
        );
      }
    }
  }

  const frameworkLink = input.agentRoot && !trustedBundledInstall
    ? materializeStandardAgentFrameworkLink({ agentRoot: input.agentRoot, dryRun: input.dryRun })
    : null;

  const physicalSurfaces = new Map<string, ReturnType<typeof materializePhysicalCodexSurface>>();
  try {
    for (const prepared of ordered) {
      physicalSurfaces.set(
        prepared.manifest.package_id,
        materializePhysicalCodexSurface(prepared.manifest, input.dryRun === true, {
          keepMigrationIds: input.keepMigrationIds,
          developerCheckoutPayloadFiles: prepared.developerCheckoutPayloadFiles ?? undefined,
          companionNetworkAccess: trustedBundledInstall ? 'forbidden' : undefined,
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
          retainPluginCache: Boolean(
            surface.codex_plugin_cache_path
            && surface.codex_plugin_cache_path === prepared.previousLock?.physical_surface?.codex_plugin_cache_path,
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
        checkoutPath: trustedBundledInstall
          ? trustedBundledInstall.packageRoots[prepared.manifest.package_id] ?? null
          : prepared.developerCheckoutPath
            ?? (prepared.manifest.package_id === root.manifest.package_id ? input.agentRoot : null),
        packageChannelSelection: prepared.packageChannelSelection,
        expectedDeveloperSourceIdentity: prepared.manifest.developer_checkout_source ? {
          source_git_head_sha: prepared.manifest.developer_checkout_source.source_git_head_sha,
          tree_sha256: prepared.manifest.developer_checkout_source.tree_sha256,
        } : null,
        verifiedCarrierSourceCommit: prepared.manifest.verified_payload_source_commit,
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
        removePhysicalCodexSurface(surface, false, prepared.manifest.package_id, {
          retainPayloadSource: true,
          retainPluginCache: Boolean(
            surface.codex_plugin_cache_path
            && surface.codex_plugin_cache_path === prepared.previousLock?.physical_surface?.codex_plugin_cache_path,
          ),
        });
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
        dependency_kind: dependency.dependency_kind,
        version_requirement: dependency.version_requirement,
        capability_abi: dependency.capability_abi,
        consumer_profile_id: dependency.consumer_profile_id ?? null,
        required_export_ids: dependency.required_export_ids,
        required_module_ids: dependency.required_module_ids,
        installed_version: providerLock.package_version,
        manifest_url: providerLock.manifest_url,
        manifest_sha256: providerLock.manifest_sha256,
        source_artifact_ref: providerLock.source_artifact_ref ?? null,
        artifact_digest: providerLock.artifact_digest ?? null,
        owner_source_commit: providerLock.owner_source_commit ?? null,
        carrier_authority: providerLock.carrier_authority ?? null,
        content_digest: providerLock.content_digest,
        package_lock_ref: providerLock.lock_ref,
      };
    });
    const carrierAuthority = preparedCarrierAuthority(prepared, channelRef, channelDigest);
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
      sourceArtifactRef: preparedCatalogArtifactRef(prepared),
      artifactDigest: preparedCatalogArtifactDigest(prepared),
      ownerSourceCommit: preparedOwnerSourceCommit(prepared),
      carrierAuthority,
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
  const retiredScopeMaterializations: AgentPackageScopeMaterialization[] = [];
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
        const activeProviderIds = new Set(root.manifest.capability_dependencies.map((entry) => entry.package_id));
        const retiredRecords = (root.previousLock?.scope_materializations ?? []).filter((entry) =>
          entry.scope === target.scope
          && entry.target_root === target.targetRoot
          && !activeProviderIds.has(entry.provider_package_id));
        for (const retiredRecord of retiredRecords) {
          retiredScopeMaterializations.push(retireCapabilityScopeMaterialization({
            previousMaterialization: retiredRecord,
            transactionId: sha256Text(`${transactionId}\nretire\n${retiredRecord.provider_package_id}\n${target.scope}\n${target.targetRoot}`),
            dryRun: input.dryRun === true,
            retainTransactionBackup: input.dryRun !== true,
          }));
        }
        for (const dependency of root.manifest.capability_dependencies) {
          const provider = preparedById.get(dependency.package_id)?.manifest;
          const providerLock = builtLocks.get(dependency.package_id);
          if (!provider || !providerLock) continue;
          scopeMaterializations.push(materializeCapabilityScope({
            provider,
            providerLockRef: providerLock.lock_ref,
            consumerProfileId: dependency.consumer_profile_id ?? null,
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
      const activeProviderIds = new Set(root.manifest.capability_dependencies.map((entry) => entry.package_id));
      rootLock.scope_materializations = [
        ...scopeMaterializations,
        ...(rootLock.scope_materializations ?? []).filter((entry) =>
          activeProviderIds.has(entry.provider_package_id)
          && !scopeMaterializations.some((next) =>
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
        for (const materialization of [...retiredScopeMaterializations].reverse()) {
          rollbackCapabilityScopeTransaction(materialization);
        }
        for (const nextLock of [...locks].reverse()) {
          removePhysicalCodexSurface(nextLock.physical_surface, false, nextLock.package_id, {
            retainPayloadSource: Boolean(
              nextLock.physical_surface?.plugin_payload_cache_path
              && nextLock.physical_surface.plugin_payload_cache_path
                === preparedById.get(nextLock.package_id)?.previousLock?.physical_surface?.plugin_payload_cache_path,
            ),
            retainPluginCache: Boolean(
              nextLock.physical_surface?.codex_plugin_cache_path
              && nextLock.physical_surface.codex_plugin_cache_path
                === preparedById.get(nextLock.package_id)?.previousLock?.physical_surface?.codex_plugin_cache_path,
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
    carrier_authority: entry.carrier_authority ?? null,
    source_kind: entry.source_kind,
    developer_checkout_source: entry.developer_checkout_source ?? null,
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
      developerCheckoutSource: lock.developer_checkout_source ?? null,
      sourceArtifactRef: preparedCatalogArtifactRef(prepared),
      artifactDigest: preparedCatalogArtifactDigest(prepared),
      ownerSourceCommit: preparedOwnerSourceCommit(prepared),
      carrierAuthority: lock.carrier_authority ?? null,
      releaseChannelRef: prepared.catalogVersion ? channelRef : prepared.previousLock?.release_channel_ref ?? null,
      releaseChannelDigest: prepared.catalogVersion ? channelDigest : prepared.previousLock?.release_channel_digest ?? null,
      networkAccessed: trustedBundledInstall ? false : undefined,
      remoteDependencyPolicy: trustedBundledInstall ? 'forbidden' : undefined,
      provenance: input.provenance,
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
  let retiredLocks: AgentPackageLock[] = [];

  if (!input.dryRun) {
    const previousLocks = previousClosureLocks;
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
    const nextClosureIds = new Set(locks.map((entry) => entry.package_id));
    const retiredCandidates = previousClosureLocks.filter((entry) => !nextClosureIds.has(entry.package_id));
    const retiredCandidateIds = new Set(retiredCandidates.map((entry) => entry.package_id));
    retiredLocks = retiredCandidates.filter((entry) =>
      entry.dependency_transaction_id === root.previousLock?.dependency_transaction_id
      && !nextIndex.packages.some((candidate) =>
        !retiredCandidateIds.has(candidate.package_id)
        && (candidate.resolved_dependencies ?? []).some((dependency) =>
          dependency.package_id === entry.package_id)));
    const retiredLockIds = new Set(retiredLocks.map((entry) => entry.package_id));
    nextIndex.packages = nextIndex.packages.filter((entry) => !retiredLockIds.has(entry.package_id));
    try {
      writePackageTransaction(nextIndex, receipts);
    } catch (error) {
      for (const scopeMaterialization of scopeMaterializations) {
        rollbackCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const scopeMaterialization of retiredScopeMaterializations) {
        rollbackCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const nextLock of [...locks].reverse()) {
        removePhysicalCodexSurface(nextLock.physical_surface, false, nextLock.package_id, {
          retainPayloadSource: Boolean(
            nextLock.physical_surface?.plugin_payload_cache_path
              && nextLock.physical_surface.plugin_payload_cache_path
                === preparedById.get(nextLock.package_id)?.previousLock?.physical_surface?.plugin_payload_cache_path,
          ),
          retainPluginCache: Boolean(
            nextLock.physical_surface?.codex_plugin_cache_path
            && nextLock.physical_surface.codex_plugin_cache_path
              === preparedById.get(nextLock.package_id)?.previousLock?.physical_surface?.codex_plugin_cache_path,
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
    const retainedPhysicalPaths = new Set([
      ...nextIndex.packages,
      ...(nextIndex.last_known_good_transactions ?? []).flatMap((entry) => entry.package_locks),
    ].flatMap((entry) => [
      entry.physical_surface?.codex_plugin_cache_path,
      entry.physical_surface?.marketplace_plugin_path,
      entry.physical_surface?.plugin_payload_cache_path,
    ].flatMap((value) => value ? [value] : [])));
    for (const prepared of ordered) {
      const previousPluginCache = prepared.previousLock?.physical_surface?.codex_plugin_cache_path;
      cleanupPreviousPhysicalSurface(
        prepared.previousLock?.physical_surface,
        physicalSurfaces.get(prepared.manifest.package_id)!,
        {
          retainPayloadSource: true,
          retainedPaths: previousPluginCache
            ? new Set([...retainedPhysicalPaths, previousPluginCache])
            : retainedPhysicalPaths,
        },
      );
    }
    for (const retiredLock of retiredLocks) {
      removePhysicalCodexSurface(
        retiredLock.physical_surface,
        false,
        retiredLock.package_id,
        { retainPayloadSource: true, retainPluginCache: true },
      );
    }
    if (root.previousLock) {
      for (const scopeMaterialization of scopeMaterializations) {
        finalizeCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const scopeMaterialization of retiredScopeMaterializations) {
        finalizeCapabilityScopeTransaction(scopeMaterialization);
      }
    }
    cleanupUnreferencedPackagePayloadSources(index, nextIndex);
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

async function runOplAgentPackageRegistryRefreshUnlocked(input: AgentPackageRegistryRefreshInput) {
  const registryUrl = stringValue(input.registryUrl);
  if (!registryUrl) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package registry refresh requires --registry-url.', {
      required: ['--registry-url'],
    });
  }
  const { fetched, cache: fetchedCache } = await fetchAndValidateRegistry(registryUrl);
  const cache = await enrichRegistryCacheManifestMetadata(fetchedCache);
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

export async function runOplAgentPackageRegistryRefresh(input: AgentPackageRegistryRefreshInput) {
  return withAgentPackageLifecycleTransaction(
    false,
    () => runOplAgentPackageRegistryRefreshUnlocked(input),
  );
}

async function runOplAgentPackageManifestValidateUnlocked(input: AgentPackageManifestValidateInput) {
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

export async function runOplAgentPackageManifestValidate(input: AgentPackageManifestValidateInput) {
  return withAgentPackageLifecycleTransaction(
    false,
    () => runOplAgentPackageManifestValidateUnlocked(input),
  );
}

async function runOplAgentPackageInstallUnlocked(input: AgentPackageInstallInput) {
  const result = await applyManifestPackageLock(input, 'install');

  return agentPackageInstallReadback(input, result);
}

export async function runOplAgentPackageInstall(input: AgentPackageInstallInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    () => runOplAgentPackageInstallUnlocked(input),
  );
}

function agentPackageInstallReadback(
  input: AgentPackageInstallInput,
  result: Awaited<ReturnType<typeof applyManifestPackageLock>>,
) {

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

async function runOplBundledFullRuntimeAgentPackageLifecycleUnlocked(
  input: BundledFullRuntimeAgentPackageInput,
  action: 'install',
  provenance?: AgentPackageInstallInput['provenance'],
): Promise<ReturnType<typeof agentPackageInstallReadback>>;
async function runOplBundledFullRuntimeAgentPackageLifecycleUnlocked(
  input: BundledFullRuntimeAgentPackageInput,
  action: 'update',
  provenance?: AgentPackageInstallInput['provenance'],
): Promise<ReturnType<typeof agentPackageUpdateReadback>>;
async function runOplBundledFullRuntimeAgentPackageLifecycleUnlocked(
  input: BundledFullRuntimeAgentPackageInput,
  action: 'install' | 'update',
  provenance?: AgentPackageInstallInput['provenance'],
) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  const agentRoot = stringValue(input.agentRoot);
  if (!packageId || !firstParty || !agentRoot) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime reconciliation requires a canonical first-party package and an explicit runtime root.', {
      package_id: packageId,
      agent_root_present: Boolean(agentRoot),
      failure_code: 'agent_package_bundled_full_runtime_selection_invalid',
    });
  }
  const bundledCatalog = readBundledFullRuntimePackageCatalog();
  const catalogEntry = bundledCatalog.entries.get(packageId) ?? null;
  if (!catalogEntry) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime reconciliation requires a catalog-owned canonical package selection.', {
      package_id: packageId,
      failure_code: 'agent_package_bundled_full_runtime_selection_invalid',
    });
  }
  const packageRoots = Object.fromEntries(Object.entries(input.packageRoots ?? {})
    .flatMap(([candidateId, candidateRoot]) => {
      const canonicalId = canonicalAgentPackageId(candidateId);
      const root = stringValue(candidateRoot);
      return canonicalId && root ? [[canonicalId, path.resolve(root)]] : [];
    }));
  packageRoots[packageId] = path.resolve(agentRoot);
  const lifecycleInput: AgentPackageInstallInput = {
    packageId,
    manifestUrl: catalogEntry.manifestUrl,
    trustTier: firstParty.trustTier,
    sourceKind: 'bundled_full_runtime_modules',
    agentRoot,
    dryRun: input.dryRun === true,
    provenance,
  };
  const result = await applyManifestPackageLock(lifecycleInput, action, {
    trustedBundledFullRuntimeInstall: { packageId, agentRoot, packageRoots },
  });
  return action === 'update'
    ? agentPackageUpdateReadback(lifecycleInput, result)
    : agentPackageInstallReadback(lifecycleInput, result);
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function managedBundledDependencySnapshotPaths(surface: AgentPackagePhysicalSurface) {
  const dependencySync = surface.workflow_policy_migration.dependency_sync;
  return isRecord(dependencySync)
    ? records(dependencySync.items).flatMap((entry) => [
        stringValue(entry.target_path),
        stringValue(entry.agents_target_path),
      ].flatMap((candidate) => candidate ? [candidate] : []))
    : [];
}

function managedBundledLegacyPluginPaths(lock: AgentPackageLock) {
  const surface = lock.physical_surface;
  const agent = resolveStandardAgent(lock.package_id);
  if (!surface?.plugin_id || !agent) return [];
  const marketplaceIds = [...new Set([
    `${agent.agent_id}-local`,
    `opl-agent-${agent.agent_id}-local`,
  ])].filter((marketplaceId) => marketplaceId !== surface.marketplace_id);
  const stateDir = resolveOplStatePaths().state_dir;
  return marketplaceIds.flatMap((marketplaceId) => [
    path.join(stateDir, 'codex-plugin-marketplaces', marketplaceId),
    path.join(surface.codex_home, 'plugins', 'cache', marketplaceId),
  ]);
}

function managedBundledLockSnapshotPaths(lock: AgentPackageLock) {
  const surface = lock.physical_surface;
  const scopePaths = (lock.scope_materializations ?? []).flatMap((entry) => {
    const skillIds = [...new Set([
      ...entry.managed_skill_ids,
      ...entry.retired_skill_ids,
    ])];
    return [
      ...skillIds.map((skillId) => path.join(entry.target_root, '.codex', 'skills', skillId)),
      path.join(
        entry.target_root,
        '.codex',
        '.opl-package-transactions',
        entry.transaction_id,
      ),
    ];
  });
  if (!surface) return scopePaths;
  const profile = surface.profile_migration;
  const managedPolicy = surface.workflow_policy_migration;
  return [
    surface.codex_config_path,
    surface.codex_plugin_cache_path,
    surface.marketplace_root,
    surface.plugin_payload_cache_path,
    ...(surface.profile_config ? [path.join(surface.codex_home, 'state', lock.package_id)] : []),
    profile.target_path,
    profile.receipt_path,
    profile.merge_packet_path,
    ...profile.authoring_source_paths,
    ...profile.mutation_actions.flatMap((entry) => [entry.target_path, entry.backup_ref]),
    ...(surface.managed_policy_config
      ? [path.join(resolveOplStatePaths().state_dir, 'agent-package-transactions', lock.package_id)]
      : []),
    managedPolicy.backup_root,
    ...managedPolicy.detected_conflicts.map((entry) => entry.physical_ref),
    ...managedPolicy.actions.flatMap((entry) => [entry.source_ref, entry.backup_ref]),
    ...managedBundledDependencySnapshotPaths(surface),
    ...managedBundledLegacyPluginPaths(lock),
    ...scopePaths,
  ].flatMap((candidate) => candidate ? [candidate] : []);
}

function bundledFullRuntimeAffectedLocks(input: {
  index: AgentPackageLockIndex;
  rootPackageIds: string[];
  prospectiveLocks: AgentPackageLock[];
}) {
  const rootIds = new Set(input.rootPackageIds);
  const prospectiveIds = new Set(input.prospectiveLocks.map((lock) => lock.package_id));
  const previousTransactionIds = new Set(input.index.packages
    .filter((lock) => rootIds.has(lock.package_id))
    .map((lock) => lock.dependency_transaction_id));
  const previous = [
    ...input.index.packages.filter((lock) =>
      prospectiveIds.has(lock.package_id)
      || previousTransactionIds.has(lock.dependency_transaction_id)),
    ...(input.index.last_known_good_transactions ?? [])
      .filter((entry) => rootIds.has(entry.root_package_id))
      .flatMap((entry) => entry.package_locks),
  ];
  const byLockRef = new Map([...previous, ...input.prospectiveLocks]
    .map((lock) => [lock.lock_ref, lock]));
  return [...byLockRef.values()];
}

function canonicalBundledFullRuntimeSnapshotPath(
  candidate: string,
  allowManagedEntrypointSymlink: boolean,
) {
  const resolved = path.resolve(candidate);
  const targetStat = lstatOrNull(resolved);
  if (targetStat?.isSymbolicLink()) {
    if (!allowManagedEntrypointSymlink) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Managed bundled package transaction refuses a symbolic-link mutation target.',
        {
          target_path: resolved,
          failure_code: 'agent_package_bundled_transaction_target_symlink_unsafe',
        },
      );
    }
    return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved));
  }
  if (targetStat) return fs.realpathSync.native(resolved);

  const missingNames: string[] = [];
  let current = resolved;
  while (true) {
    const parent = path.dirname(current);
    missingNames.push(path.basename(current));
    const parentStat = lstatOrNull(parent);
    if (parentStat) {
      const followed = fs.statSync(parent);
      if (!followed.isDirectory()) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Managed bundled package transaction refuses a mutation target below a non-directory ancestor.',
          {
            target_path: resolved,
            unsafe_ancestor_path: parent,
            failure_code: 'agent_package_bundled_transaction_ancestor_unsafe',
          },
        );
      }
      return path.join(fs.realpathSync.native(parent), ...missingNames.reverse());
    }
    if (parent === current) return resolved;
    current = parent;
  }
}

function minimalBundledFullRuntimeSnapshotPaths(
  candidates: string[],
  managedEntrypointPaths: Set<string>,
) {
  const resolved = [...new Set(candidates.map((candidate) =>
    canonicalBundledFullRuntimeSnapshotPath(
      candidate,
      managedEntrypointPaths.has(path.resolve(candidate)),
    )))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
  return resolved.filter((candidate, index) => !resolved.slice(0, index).some((parent) => {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }));
}

function lstatOrNull(targetPath: string) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

function bundledFullRuntimeMissingAncestors(targetPath: string) {
  const missing: string[] = [];
  let current = path.dirname(targetPath);
  while (true) {
    const stat = lstatOrNull(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Managed bundled package transaction refuses a writable path below a symbolic-link or non-directory ancestor.',
          {
            target_path: targetPath,
            unsafe_ancestor_path: current,
            failure_code: 'agent_package_bundled_transaction_ancestor_unsafe',
          },
        );
      }
    } else {
      missing.push(current);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return missing;
}

function copyBundledFullRuntimeSnapshotPath(sourcePath: string, targetPath: string) {
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath, 'junction');
    return;
  }
  fs.cpSync(sourcePath, targetPath, {
    recursive: stat.isDirectory(),
    preserveTimestamps: true,
    dereference: false,
    verbatimSymlinks: true,
  });
}

function bundledFullRuntimeSnapshotPathMatches(snapshotPath: string, targetPath: string): boolean {
  const snapshotStat = lstatOrNull(snapshotPath);
  const targetStat = lstatOrNull(targetPath);
  if (!snapshotStat || !targetStat) return snapshotStat === targetStat;
  if ((snapshotStat.mode & 0o7777) !== (targetStat.mode & 0o7777)) return false;
  if (snapshotStat.isSymbolicLink() || targetStat.isSymbolicLink()) {
    return snapshotStat.isSymbolicLink()
      && targetStat.isSymbolicLink()
      && fs.readlinkSync(snapshotPath) === fs.readlinkSync(targetPath);
  }
  if (snapshotStat.isDirectory() || targetStat.isDirectory()) {
    if (!snapshotStat.isDirectory() || !targetStat.isDirectory()) return false;
    const snapshotEntries = fs.readdirSync(snapshotPath).sort();
    const targetEntries = fs.readdirSync(targetPath).sort();
    return snapshotEntries.length === targetEntries.length
      && snapshotEntries.every((entry, indexValue) => (
        entry === targetEntries[indexValue]
        && bundledFullRuntimeSnapshotPathMatches(
          path.join(snapshotPath, entry),
          path.join(targetPath, entry),
        )
      ));
  }
  if (!snapshotStat.isFile() || !targetStat.isFile()) return false;
  return snapshotStat.size === targetStat.size
    && fs.readFileSync(snapshotPath).equals(fs.readFileSync(targetPath));
}

function captureBundledFullRuntimePackageSnapshot(input: {
  index: AgentPackageLockIndex;
  rootPackageId: string;
  prospectiveLocks: AgentPackageLock[];
}) {
  const statePaths = resolveOplStatePaths();
  const affectedLocks = bundledFullRuntimeAffectedLocks({
    index: input.index,
    rootPackageIds: [input.rootPackageId],
    prospectiveLocks: input.prospectiveLocks,
  });
  const managedEntrypointPaths = new Set(affectedLocks.flatMap((lock) => {
    const surface = lock.physical_surface;
    return surface ? managedBundledDependencySnapshotPaths(surface).map((candidate) => path.resolve(candidate)) : [];
  }));
  const targetPaths = minimalBundledFullRuntimeSnapshotPaths([
    statePaths.agent_package_lock_file,
    statePaths.agent_package_lifecycle_ledger_file,
    ...affectedLocks.flatMap(managedBundledLockSnapshotPaths),
  ], managedEntrypointPaths);
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bundled-package-update-'));
  try {
    const paths = targetPaths.map((targetPath, indexValue): BundledFullRuntimePathSnapshot => {
      const snapshotPath = path.join(snapshotRoot, String(indexValue));
      const stat = lstatOrNull(targetPath);
      const existed = stat !== null;
      const missingAncestorPaths = bundledFullRuntimeMissingAncestors(targetPath);
      if (stat) copyBundledFullRuntimeSnapshotPath(targetPath, snapshotPath);
      return { targetPath, snapshotPath, existed, missingAncestorPaths };
    });
    return { root: snapshotRoot, paths } satisfies BundledFullRuntimePackageSnapshot;
  } catch (error) {
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

function makeBundledFullRuntimeSnapshotPathWritable(targetPath: string) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) {
    fs.chmodSync(targetPath, 0o600);
    return;
  }
  fs.chmodSync(targetPath, 0o700);
  for (const entry of fs.readdirSync(targetPath)) {
    makeBundledFullRuntimeSnapshotPathWritable(path.join(targetPath, entry));
  }
}

function restoreBundledFullRuntimePackageSnapshot(snapshot: BundledFullRuntimePackageSnapshot) {
  for (const entry of snapshot.paths) {
    makeBundledFullRuntimeSnapshotPathWritable(entry.targetPath);
    fs.rmSync(entry.targetPath, { recursive: true, force: true });
    if (!entry.existed) continue;
    fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
    copyBundledFullRuntimeSnapshotPath(entry.snapshotPath, entry.targetPath);
  }
  const missingAncestors = [...new Set(snapshot.paths.flatMap((entry) => entry.missingAncestorPaths))]
    .sort((left, right) => right.length - left.length || right.localeCompare(left));
  for (const ancestor of missingAncestors) {
    const stat = lstatOrNull(ancestor);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) continue;
    if (fs.readdirSync(ancestor).length === 0) fs.rmdirSync(ancestor);
  }
}

function cleanupBundledFullRuntimePackageSnapshot(snapshot: BundledFullRuntimePackageSnapshot) {
  try {
    makeBundledFullRuntimeSnapshotPathWritable(snapshot.root);
    fs.rmSync(snapshot.root, { recursive: true, force: true });
  } catch {
    // Temporary snapshot cleanup cannot change the committed transaction outcome.
  }
}

function rollbackBundledFullRuntimePackage(
  snapshot: BundledFullRuntimePackageSnapshot,
) {
  try {
    restoreBundledFullRuntimePackageSnapshot(snapshot);
    const mismatches = snapshot.paths.filter((entry) => (
      entry.existed
        ? !bundledFullRuntimeSnapshotPathMatches(entry.snapshotPath, entry.targetPath)
        : lstatOrNull(entry.targetPath) !== null
    )).map((entry) => entry.targetPath);
    if (mismatches.length > 0) {
      throw new Error(`Restored snapshot mismatch: ${mismatches.join(', ')}`);
    }
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Managed bundled Full runtime package mutation unit could not restore its local prestate.',
      {
        package_mutation_status: 'rollback_failed',
        local_prestate_restored: false,
        mutation_started: true,
        rollback_error: error instanceof Error ? error.message : String(error),
        failure_code: 'agent_package_bundled_full_runtime_package_rollback_failed',
      },
    );
  }
}

function managedBundledFullRuntimeProvenance(operationId: string) {
  return {
    trigger: 'managed_update_kernel_apply',
    initiator: 'opl_managed_update_kernel',
    source_policy: 'bundled_full_runtime_modules',
    source_policy_reason: 'full_runtime_override:managed_update_kernel_apply',
    operation_id: operationId,
    correlation_id: operationId,
  } satisfies AgentPackageInstallInput['provenance'];
}

export async function runOplBundledFullRuntimeAgentPackageInstall(
  input: BundledFullRuntimeAgentPackageInput,
) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    () => runOplBundledFullRuntimeAgentPackageLifecycleUnlocked(input, 'install'),
  );
}

export async function runOplBundledFullRuntimeAgentPackageUpdate(
  input: ManagedBundledFullRuntimeAgentPackageInput,
) {
  const packageId = canonicalAgentPackageId(input.packageId) ?? input.packageId;
  const operationId = stringValue(input.operationId) ?? '';
  if (!packageId || !operationId || typeof input.verifyAppliedPackageLocks !== 'function') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Managed bundled Full runtime update requires package, operation, and final-verifier identities.',
      {
        package_id: packageId,
        operation_id: operationId,
        final_verifier_present: typeof input.verifyAppliedPackageLocks === 'function',
        mutation_started: false,
        failure_code: 'agent_package_bundled_full_runtime_managed_input_incomplete',
      },
    );
  }
  const candidate: BundledFullRuntimeAgentPackageInput = {
    packageId,
    agentRoot: input.agentRoot,
    packageRoots: input.packageRoots,
    dryRun: input.dryRun,
  };
  return withAgentPackageLifecycleTransaction(
    false,
    async () => {
      const originalIndex = readLockIndex();
      const provenance = managedBundledFullRuntimeProvenance(operationId);
      const preview = await runOplBundledFullRuntimeAgentPackageLifecycleUnlocked(
        { ...candidate, dryRun: true },
        'update',
        provenance,
      );
      const prospectiveLocks = preview.opl_agent_package_update.dependency_package_locks;
      const snapshot = captureBundledFullRuntimePackageSnapshot({
        index: originalIndex,
        rootPackageId: packageId,
        prospectiveLocks,
      });
      try {
        const result = await runOplBundledFullRuntimeAgentPackageLifecycleUnlocked(
          candidate,
          'update',
          provenance,
        );
        await input.verifyAppliedPackageLocks(
          result.opl_agent_package_update.dependency_package_locks,
        );
        return result;
      } catch (error) {
        try {
          rollbackBundledFullRuntimePackage(snapshot);
        } catch (rollbackError) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Managed bundled Full runtime package mutation failed and its local prestate could not be proven restored.',
            {
              package_id: packageId,
              dependency_package_ids: prospectiveLocks.map((lock) => lock.package_id),
              package_mutation_status: 'rollback_failed',
              local_prestate_restored: false,
              mutation_started: true,
              original_error: error instanceof FrameworkContractError
                ? error.toJSON()
                : { message: error instanceof Error ? error.message : String(error) },
              rollback_error: rollbackError instanceof FrameworkContractError
                ? rollbackError.toJSON()
                : { message: rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError) },
              failure_code: 'agent_package_bundled_full_runtime_package_rollback_failed',
            },
          );
        }
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Managed bundled Full runtime package mutation failed and restored only its package-local prestate.',
          {
            package_id: packageId,
            dependency_package_ids: prospectiveLocks.map((lock) => lock.package_id),
            package_mutation_status: 'rolled_back',
            local_prestate_restored: true,
            mutation_started: true,
            original_error: error instanceof FrameworkContractError
              ? error.toJSON()
              : { message: error instanceof Error ? error.message : String(error) },
            failure_code: 'agent_package_bundled_full_runtime_package_rolled_back',
          },
        );
      } finally {
        cleanupBundledFullRuntimePackageSnapshot(snapshot);
      }
    },
  );
}

async function runOplAgentPackageUpdateUnlocked(
  input: AgentPackageInstallInput,
  runtime: { catalogFetchTimeoutMs?: number } = {},
) {
  const packageId = canonicalAgentPackageId(stringValue(input.packageId));
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  if (packageId && firstParty) {
    const { index } = readRecoveredLockIndex(true);
    const { lock } = requireInstalledPackage(index, packageId, 'update');
    if (lock.source_kind === 'bundled_full_runtime_modules') {
      const result = await applyManifestPackageLock(input, 'update');
      return agentPackageUpdateReadback(input, result);
    }
    const sourcePolicy = resolveAgentPackageEffectiveSourcePolicy(packageId);
    assertFirstPartyPackageUpdateSelection(input, firstParty, sourcePolicy);
    const developerRoot = sourcePolicy.desired_source_kind === 'developer_checkout_override';
    const catalogSnapshot = await resolveFirstPartyPackageCatalogSnapshot({
      refresh: true,
      packageId,
      persist: false,
      timeoutMs: runtime.catalogFetchTimeoutMs,
    });
    if (!catalogSnapshot && !developerRoot) {
      throw new FrameworkContractError('codex_command_failed', 'Managed package catalog is unavailable at the update boundary.', {
        package_id: packageId,
        catalog_ref: firstParty.catalogSource.catalog_ref,
        failure_code: 'agent_package_capability_channel_unavailable',
      });
    }
    const targetVersion = developerRoot
      ? null
      : selectManagedCatalogPackageVersion(catalogSnapshot!.catalog, packageId);
    if (targetVersion) assertFirstPartyPackageCatalogVersion(packageId, targetVersion);
    const closureTargets = firstPartyCatalogClosure(
      catalogSnapshot?.catalog ?? null,
      packageId,
      targetVersion,
    );
    const hasManagedSource = closureTargets.some((entry) =>
      entry.sourcePolicy.desired_source_kind === 'first_party_managed_cohort');
    if (hasManagedSource && catalogSnapshot?.freshness !== 'live') {
      throw new FrameworkContractError('codex_command_failed', 'Managed package closure currentness requires a live package channel.', {
        package_id: packageId,
        catalog_ref: firstParty.catalogSource.catalog_ref,
        available_catalog_freshness: catalogSnapshot?.freshness ?? null,
        failure_code: 'agent_package_capability_channel_unavailable',
      });
    }
    const closureCurrentness = agentPackageClosureTargetCurrentness(index.packages, closureTargets);
    const rootClosureCurrentness = closureCurrentness.find((entry) => entry.package_id === packageId);
    if (!rootClosureCurrentness?.currentness) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package currentness plan omitted its installed root.', {
        package_id: packageId,
        failure_code: 'agent_package_closure_root_missing',
      });
    }
    const rootCurrentness = rootClosureCurrentness.currentness;
    const dependencyUpdateRequired = closureCurrentness.some((entry) =>
      entry.package_id !== packageId && entry.status !== 'current');
    const currentness = dependencyUpdateRequired && rootCurrentness.status === 'current'
      ? {
          ...rootCurrentness,
          status: 'update_available' as const,
          reasons: [...rootCurrentness.reasons, 'dependency_closure_changed'],
        }
      : rootCurrentness;
    const reconciliationBase = {
      currentness,
      closureCurrentness,
      sourcePolicy,
      targetIdentity: {
        packageVersion: rootClosureCurrentness.target_identity.package_version,
        manifestSha256: rootClosureCurrentness.target_identity.manifest_sha256,
        contentDigest: rootClosureCurrentness.target_identity.content_digest,
        artifactDigest: rootClosureCurrentness.target_identity.artifact_digest,
        sourceArtifactRef: rootClosureCurrentness.target_identity.source_artifact_ref,
      },
      catalogRef: catalogSnapshot?.catalog_ref ?? null,
      catalogDigest: catalogSnapshot?.catalog_digest ?? null,
      catalogFreshness: catalogSnapshot?.freshness ?? null,
      checkedAt: catalogSnapshot?.checked_at ?? nowIso(),
    };
    if (currentness.status === 'current') {
      const closureLocks = installedPackageClosure(index.packages, closureTargets);
      return agentPackageUpdateReadback(input, {
        status: 'current_noop',
        lock,
        physicalSurface: lock.physical_surface,
        frameworkLink: null,
        receipt: null,
        registryEntry: null,
        closureLocks,
        closureReceipts: [],
        dependencyTransactionId: lock.dependency_transaction_id,
        dependencyClosureDigest: lock.dependency_closure_digest,
      }, {
        ...reconciliationBase,
        action: null,
      });
    }

    const hasDeveloperSource = closureTargets.some((entry) => Boolean(entry.developerTarget));
    const installedById = new Map(index.packages.map((entry) => [entry.package_id, entry]));
    const sourceReconcileRequired = closureTargets.some((entry) => {
      const installed = installedById.get(entry.packageId);
      return Boolean(installed
        && entry.sourcePolicy.desired_source_kind
        && installed.source_kind !== entry.sourcePolicy.desired_source_kind);
    });
    const action = developerRoot ? 'install' : 'update';
    const developerRootTarget = closureTargets.find((entry) => entry.packageId === packageId)?.developerTarget ?? null;
    const packageInput: AgentPackageInstallInput = {
      ...input,
      packageId,
      trustTier: input.trustTier ?? firstParty.trustTier,
      sourceKind: sourcePolicy.desired_source_kind,
      manifestUrl: developerRootTarget?.source.owner_manifest_path ?? input.manifestUrl,
      agentRoot: developerRoot ? sourcePolicy.developer_checkout_path : input.agentRoot,
      agentRoots: developerAgentRootsForPackageIds(closureTargets.map((entry) => entry.packageId)),
    };
    const applied = await applyManifestPackageLock(packageInput, action, {
      catalog: catalogSnapshot?.catalog ?? null,
      rootVersion: targetVersion,
      catalogSource: firstParty.catalogSource,
      channelRef: catalogSnapshot?.catalog_ref ?? null,
      channelDigest: catalogSnapshot?.catalog_digest ?? null,
      sourceReconcile: hasDeveloperSource || sourceReconcileRequired,
    });
    return agentPackageUpdateReadback(input, {
      ...applied,
      status: (hasDeveloperSource || sourceReconcileRequired) && input.dryRun !== true
        ? 'updated'
        : applied.status,
    }, {
      ...reconciliationBase,
      action: hasDeveloperSource || sourceReconcileRequired ? 'source_reconcile' : 'update',
    });
  }

  const result = await applyManifestPackageLock(input, 'update');
  return agentPackageUpdateReadback(input, result);
}

export async function runOplAgentPackageUpdate(input: AgentPackageInstallInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    () => runOplAgentPackageUpdateUnlocked(input),
  );
}

async function runOplAgentPackageBulkUpdateUnlocked(input: { dryRun?: boolean } = {}) {
  const { index } = readRecoveredLockIndex(input.dryRun === true);
  const dependencyIds = new Set(index.packages.flatMap((lock) =>
    (lock.resolved_dependencies ?? []).map((dependency) => dependency.package_id)));
  const recordedRootIds = new Set((index.last_known_good_transactions ?? [])
    .map((entry) => entry.root_package_id));
  const roots = index.packages.filter((lock) =>
    recordedRootIds.has(lock.package_id) || !dependencyIds.has(lock.package_id));
  const targets: Array<Record<string, unknown>> = [];
  const operationId = sha256Text([
    'agent-package-bulk-update',
    String(process.pid),
    nowIso(),
    ...roots.map((lock) => lock.lock_ref).sort(),
  ].join('\n'));
  const policies = new Map(roots.map((lock) => [
    lock.package_id,
    resolveAgentPackageEffectiveSourcePolicy(lock.package_id),
  ]));
  const requiresLiveCatalog = roots.some((lock) =>
    Boolean(resolveFirstPartyPackageCatalog(lock.package_id)));
  let liveCatalog: Awaited<ReturnType<typeof refreshFirstPartyPackageCatalogSnapshot>> | null = null;
  let liveCatalogError: unknown = null;
  if (requiresLiveCatalog) {
    try {
      liveCatalog = await refreshFirstPartyPackageCatalogSnapshot(
        roots.find((lock) => resolveFirstPartyPackageCatalog(lock.package_id))?.package_id ?? 'mas',
        { persist: input.dryRun !== true },
      );
    } catch (error) {
      liveCatalogError = error;
    }
  }
  const agentRoots = developerAgentRootsForPackageIds(index.packages.map((lock) => lock.package_id));

  for (const lock of roots) {
    const firstParty = resolveFirstPartyPackageCatalog(lock.package_id);
    const policy = policies.get(lock.package_id)!;
    const baseTarget = {
      target_type: 'package_lock',
      target_id: lock.package_id,
      installed_lock_ref: lock.lock_ref,
      installed_version: lock.package_version,
      installed_content_digest: lock.content_digest,
      installed_artifact_digest: lock.artifact_digest ?? null,
      source_policy: policy,
      operation_id: operationId,
    };
    if (!firstParty) {
      const safety = packageBulkUpdateSafety(lock);
      if (!safety.eligible) {
        targets.push({
          ...baseTarget,
          status: 'manual_required',
          reason: safety.reason,
          action: null,
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
          ...baseTarget,
          status: input.dryRun ? 'validated' : 'completed',
          reason: safety.reason,
          action: 'update',
          result: result.opl_agent_package_update,
        });
      } catch (error) {
        targets.push({
          ...baseTarget,
          status: 'manual_required',
          reason: 'package_update_failed_without_overwrite',
          action: 'update',
          result: null,
          error: error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function'
            ? error.toJSON()
            : { message: error instanceof Error ? error.message : String(error) },
        });
      }
      continue;
    }
    if (!policy.desired_source_kind) {
      targets.push({
        ...baseTarget,
        status: 'manual_required',
        reason: 'package_source_policy_requires_manual_reconciliation',
        action: null,
        result: null,
      });
      continue;
    }
    if (policy.desired_source_kind === 'developer_checkout_override'
      && !policy.developer_checkout_available) {
      targets.push({
        ...baseTarget,
        status: 'manual_required',
        reason: 'developer_checkout_unavailable',
        action: 'source_reconcile',
        result: null,
      });
      continue;
    }
    if (!liveCatalog) {
      targets.push({
        ...baseTarget,
        status: 'manual_required',
        reason: 'live_release_set_unavailable',
        action: policy.desired_source_kind === 'developer_checkout_override' ? 'source_reconcile' : 'update',
        result: null,
        error: liveCatalogError && typeof liveCatalogError === 'object'
          && 'toJSON' in liveCatalogError && typeof liveCatalogError.toJSON === 'function'
          ? liveCatalogError.toJSON()
          : { message: liveCatalogError instanceof Error ? liveCatalogError.message : String(liveCatalogError) },
      });
      continue;
    }
    const targetVersion = selectManagedCatalogPackageVersion(liveCatalog.catalog, lock.package_id);
    const currentness = agentPackageTargetCurrentness({
      lock,
      target: targetVersion,
      desiredSourceKind: policy.desired_source_kind,
    });
    const targetIdentity = {
      target_version: targetVersion.package_version,
      target_manifest_sha256: targetVersion.manifest_sha256,
      target_content_digest: targetVersion.content_digest,
      target_artifact_digest: targetVersion.artifact_digest,
      target_source_artifact_ref: targetVersion.source_artifact_ref,
      release_catalog_ref: liveCatalog.catalog_ref,
      release_catalog_digest: liveCatalog.catalog_digest,
    };
    if (currentness.status === 'current') {
      targets.push({
        ...baseTarget,
        ...targetIdentity,
        status: 'current',
        reason: 'installed_identity_matches_release_set_target',
        currentness,
        action: null,
        result: null,
      });
      continue;
    }
    if (!lock.content_digest || !lock.manifest_sha256 || !lock.lock_ref) {
      targets.push({
        ...baseTarget,
        ...targetIdentity,
        status: 'manual_required',
        reason: 'package_content_identity_incomplete',
        currentness,
        action: null,
        result: null,
      });
      continue;
    }
    if (lock.physical_surface?.failure_reason) {
      targets.push({
        ...baseTarget,
        ...targetIdentity,
        status: 'manual_required',
        reason: 'package_physical_surface_requires_repair',
        currentness,
        action: 'repair',
        result: null,
      });
      continue;
    }
    try {
      const action = policy.desired_source_kind === 'developer_checkout_override' ? 'install' : 'update';
      const packageInput: AgentPackageInstallInput = {
        packageId: lock.package_id,
        sourceKind: policy.desired_source_kind,
        agentRoot: policy.developer_checkout_path,
        agentRoots,
        dryRun: input.dryRun === true,
        provenance: {
          trigger: 'managed_update_kernel_apply',
          initiator: 'opl_managed_update_kernel',
          source_policy: policy.desired_source_kind,
          source_policy_reason: policy.reason,
          operation_id: operationId,
          correlation_id: operationId,
        },
      };
      const applied = await applyManifestPackageLock(packageInput, action, {
        catalog: liveCatalog.catalog,
        rootVersion: targetVersion,
        catalogSource: firstParty.catalogSource,
        channelRef: liveCatalog.catalog_ref,
        channelDigest: liveCatalog.catalog_digest,
        sourceReconcile: lock.source_kind !== policy.desired_source_kind,
      });
      const result = action === 'install'
        ? agentPackageInstallReadback(packageInput, applied).opl_agent_package_install
        : {
            surface_kind: 'opl_agent_package_update',
            status: applied.status,
            dry_run: input.dryRun === true,
            package_lock: applied.lock,
            physical_surface: applied.physicalSurface,
            lifecycle_receipt: applied.receipt,
            dependency_package_locks: applied.closureLocks,
            dependency_transaction_id: applied.dependencyTransactionId,
            dependency_closure_digest: applied.dependencyClosureDigest,
          };
      targets.push({
        ...baseTarget,
        ...targetIdentity,
        status: input.dryRun ? 'validated' : 'completed',
        reason: action === 'install'
          ? currentness.reasons.includes('source_policy_mismatch')
            ? 'source_policy_reconciled_to_developer_checkout'
            : 'developer_checkout_lock_reprojected_to_release_set_target'
          : 'release_set_target_applied',
        currentness,
        action: action === 'install' ? 'source_reconcile' : 'update',
        result,
      });
    } catch (error) {
      targets.push({
        ...baseTarget,
        ...targetIdentity,
        status: 'failed',
        reason: 'package_update_failed_without_overwrite',
        currentness,
        action: policy.desired_source_kind === 'developer_checkout_override' ? 'source_reconcile' : 'update',
        result: null,
        error: error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function'
          ? error.toJSON()
          : { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  const completedCount = targets.filter((entry) =>
    entry.status === 'completed' || entry.status === 'validated').length;
  const currentCount = targets.filter((entry) => entry.status === 'current').length;
  const manualRequiredCount = targets.filter((entry) => entry.status === 'manual_required').length;
  const failedCount = targets.filter((entry) => entry.status === 'failed').length;
  const status = failedCount > 0
    ? completedCount > 0 ? 'partial_failure' : 'failed'
    : manualRequiredCount > 0
      ? completedCount > 0 ? 'partial_success' : 'attention_needed'
      : completedCount > 0
        ? input.dryRun ? 'validated_no_write' : 'completed'
        : 'current_noop';
  return {
    version: 'g2',
    opl_agent_package_bulk_update: {
      surface_kind: 'opl_agent_package_bulk_update',
      status,
      dry_run: input.dryRun === true,
      lifecycle_owner: 'opl_packages',
      selection: 'installed_root_package_locks',
      targets,
      summary: {
        installed_package_count: index.packages.length,
        root_package_count: roots.length,
        current_targets_count: currentCount,
        completed_targets_count: completedCount,
        manual_required_targets_count: manualRequiredCount,
        failed_targets_count: failedCount,
        changed_targets_count: completedCount,
      },
      provenance: {
        trigger: 'managed_update_kernel_apply',
        initiator: 'opl_managed_update_kernel',
        operation_id: operationId,
        correlation_id: operationId,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageBulkUpdate(input: { dryRun?: boolean } = {}) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    () => runOplAgentPackageBulkUpdateUnlocked(input),
  );
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

function runOplAgentPackageRepairUnlocked(input: AgentPackageRepairInput) {
  const packageId = requirePackageId(input.packageId, 'repair');
  const { index } = readRecoveredLockIndex(input.dryRun === true);
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'repair');
  if (
    (lock.capability_dependencies ?? []).length > 0
    || lock.runtime_source_carrier
    || lock.source_kind === 'first_party_managed_cohort'
    || lock.source_kind === 'bundled_full_runtime_modules'
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
    sourceArtifactRef: lock.source_artifact_ref ?? null,
    artifactDigest: lock.artifact_digest ?? null,
    ownerSourceCommit: lock.owner_source_commit ?? null,
    carrierAuthority: lock.carrier_authority ?? null,
    releaseChannelRef: lock.release_channel_ref ?? null,
    releaseChannelDigest: lock.release_channel_digest ?? null,
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

export async function runOplAgentPackageRepair(input: AgentPackageRepairInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => await runOplAgentPackageRepairUnlocked(input),
  );
}

function runOplAgentPackageOptimizeUnlocked(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'optimize');
  const { index } = readRecoveredLockIndex(input.dryRun === true);
  const { lock } = requireInstalledPackage(index, packageId, 'optimize');
  const result = optimizeInstalledPackageSource({
    index,
    root: lock,
    action: { ...input, packageId },
  });
  return {
    version: 'g2',
    opl_agent_package_optimize: {
      surface_kind: 'opl_agent_package_optimize',
      status: result.status,
      dry_run: input.dryRun === true,
      source_selection: result.sourceSelection,
      network_accessed: result.networkAccessed,
      remote_dependency_policy: 'forbidden',
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      dependency_package_locks: result.closureLocks,
      dependency_closure_digest: result.closureDigest,
      scope_materializations: result.scopeMaterializations,
      rollback_generation: result.rollbackGeneration,
      lifecycle_receipt: result.receipt,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: packageId,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
        packages: result.closureLocks.map((entry) => ({
          packageId: entry.package_id,
          lock: entry,
          receipt: entry.package_id === packageId ? result.receipt : null,
        })),
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageOptimize(input: AgentPackagePackageActionInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageOptimizeUnlocked(input),
  );
}

function runOplAgentPackageRollbackUnlocked(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'rollback');
  const { index } = readRecoveredLockIndex(input.dryRun === true);
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
  const latestReceipt = readLifecycleLedger().receipts.find((entry) =>
    entry.receipt_ref === lock.action_receipt_id);
  if (latestReceipt?.action === 'optimize') {
    const result = rollbackInstalledPackageOptimization({
      index,
      root: lock,
      generation: lastKnownGood,
      optimizeReceipt: latestReceipt,
      action: input,
    });
    return {
      version: 'g2',
      opl_agent_package_rollback: {
        surface_kind: 'opl_agent_package_rollback',
        status: result.status,
        dry_run: input.dryRun === true,
        source_selection: result.sourceSelection,
        network_accessed: result.networkAccessed,
        remote_dependency_policy: 'forbidden',
        package_lock: result.root,
        dependency_package_locks: result.locks,
        dependency_transaction_id: result.root.dependency_transaction_id,
        dependency_closure_digest: result.closureDigest,
        scope_materializations: result.scopeMaterializations,
        lifecycle_receipt: result.receipt,
        runtime_source_cleanup: { status: 'not_required', cleanup_paths: [] },
        owner_route_readback: ownerRouteReadback({
          selectedPackageId: packageId,
          packages: result.locks.map((entry) => ({
            packageId: entry.package_id,
            lock: entry,
            receipt: entry.package_id === packageId ? result.receipt : null,
          })),
        }),
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  }
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
      source_artifact_ref: entry.source_artifact_ref ?? null,
      artifact_digest: entry.artifact_digest ?? null,
      owner_source_commit: entry.owner_source_commit ?? null,
      carrier_authority: entry.carrier_authority ?? null,
      source_kind: entry.source_kind,
      developer_checkout_source: entry.developer_checkout_source ?? null,
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
      sourceArtifactRef: lock.source_artifact_ref ?? null,
      artifactDigest: lock.artifact_digest ?? null,
      ownerSourceCommit: lock.owner_source_commit ?? null,
      developerCheckoutSource: lock.developer_checkout_source ?? null,
      carrierAuthority: lock.carrier_authority ?? null,
      releaseChannelRef: lock.release_channel_ref ?? null,
      releaseChannelDigest: lock.release_channel_digest ?? null,
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
            { retainPayloadSource: true, retainPluginCache: true },
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
          removePhysicalCodexSurface(surface, false, restoredPackageId, {
            retainPayloadSource: true,
            retainPluginCache: true,
          });
          rollbackManagedPolicyMigration(surface.workflow_policy_migration);
          rollbackPackageProfileMigration(surface.profile_migration);
        }
        for (const currentLock of currentLocks) rematerializePhysicalCodexSurfaceFromLock(currentLock, false);
        for (const scopeRecord of [...rolledBackScopes].reverse()) {
          const provider = currentLocks.find((entry) => entry.package_id === scopeRecord.provider_package_id);
          if (!provider) continue;
          const materialization = materializeCapabilityScopeFromLock({
            provider,
            consumerProfileId: scopeRecord.consumer_profile_id ?? null,
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
    source_artifact_ref: entry.source_artifact_ref ?? null,
    artifact_digest: entry.artifact_digest ?? null,
    owner_source_commit: entry.owner_source_commit ?? null,
    carrier_authority: entry.carrier_authority ?? null,
    source_kind: entry.source_kind,
    developer_checkout_source: entry.developer_checkout_source ?? null,
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
    sourceArtifactRef: restoredLock.source_artifact_ref ?? null,
    artifactDigest: restoredLock.artifact_digest ?? null,
    ownerSourceCommit: restoredLock.owner_source_commit ?? null,
    developerCheckoutSource: restoredLock.developer_checkout_source ?? null,
    carrierAuthority: restoredLock.carrier_authority ?? null,
    releaseChannelRef: restoredLock.release_channel_ref ?? null,
    releaseChannelDigest: restoredLock.release_channel_digest ?? null,
  }));
  restoredLocks.forEach((restoredLock) => {
    restoredLock.dependency_transaction_id = transactionId;
    restoredLock.dependency_closure_digest = closureDigest;
    restoredLock.action_receipt_id = receipts.find((receipt) => receipt.package_id === restoredLock.package_id)!.receipt_ref;
  });
  const rootReceipt = receipts.find((entry) => entry.package_id === packageId)!;
  const explicitScopeTarget = packageScopeTarget(input);
  const restoredScopeRecords = restoredRoot.scope_materializations ?? [];
  const scopeRecords = explicitScopeTarget && input.scope
    ? restoredScopeRecords.filter((entry) =>
        entry.scope === input.scope && entry.target_root === explicitScopeTarget)
    : restoredScopeRecords;
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
        consumerProfileId: record.consumer_profile_id ?? null,
        scope: record.scope,
        targetRoot: record.target_root,
        transactionId: sha256Text(`${transactionId}\n${provider.package_id}\n${record.scope}\n${record.target_root}`),
        dryRun: input.dryRun === true,
        retainTransactionBackup: input.dryRun !== true,
        previousMaterialization: (lock.scope_materializations ?? []).find((entry) =>
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
          { retainPayloadSource: true, retainPluginCache: true },
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
        removePhysicalCodexSurface(surface, false, restoredPackageId, {
          retainPayloadSource: true,
          retainPluginCache: true,
        });
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

export async function runOplAgentPackageRollback(input: AgentPackagePackageActionInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageRollbackUnlocked(input),
  );
}

type PackageUseReconciliation = {
  freshnessMode: AgentPackageUseBinding['freshness_mode'];
  latestVerified: boolean;
  updated: boolean;
  refreshOutcome: AgentPackageUseBinding['refresh_outcome'];
  channelRef: string | null;
  channelDigest: string | null;
  checkedAt: string;
  reconciliationIssue: AgentPackageUseBinding['reconciliation_issue'];
};

const PACKAGE_USE_REFRESH_TIMEOUT_MS = 3_000;

function packageUseRefreshTimeoutMs() {
  const injected = Number(process.env.OPL_TEST_AGENT_PACKAGE_USE_REFRESH_TIMEOUT_MS);
  return Number.isFinite(injected) && injected > 0
    ? Math.floor(injected)
    : PACKAGE_USE_REFRESH_TIMEOUT_MS;
}

function packageUseReconciliationSource(lock: AgentPackageLock) {
  const index = readLockIndex();
  const closure = [
    lock,
    ...index.packages.filter((entry) =>
      lock.resolved_dependencies.some((dependency) => dependency.package_id === entry.package_id)),
  ];
  const sourceKinds = new Set(closure.map((entry) => entry.source_kind));
  if ([...sourceKinds].every((kind) => kind === 'developer_checkout_override')) {
    return 'developer_checkout' as const;
  }
  if (sourceKinds.has('developer_checkout_override')) return 'mixed' as const;
  return 'package_channel' as const;
}

function packageUseLastKnownGood(
  lock: AgentPackageLock,
  error: unknown,
  refreshTimeoutMs: number,
): PackageUseReconciliation {
  const failureCode = error instanceof FrameworkContractError
    && typeof error.details?.failure_code === 'string'
    ? error.details.failure_code
    : null;
  const message = error instanceof Error ? error.message : String(error);
  return {
    freshnessMode: 'offline_lkg',
    latestVerified: false,
    updated: false,
    refreshOutcome: 'recovered_last_known_good',
    channelRef: lock.managed_update_source?.catalog_ref ?? null,
    channelDigest: null,
    checkedAt: nowIso(),
    reconciliationIssue: {
      status: 'update_failed_using_last_known_good',
      source: packageUseReconciliationSource(lock),
      failure_code: failureCode,
      refresh_timeout_ms: refreshTimeoutMs,
      message,
    },
  };
}

function isPackageLifecycleLockTimeout(error: unknown): error is FrameworkContractError {
  return error instanceof FrameworkContractError
    && error.details?.failure_code === 'agent_package_lifecycle_lock_timeout';
}

async function reconcilePackageClosureForUse(
  input: AgentPackagePackageActionInput,
  lock: AgentPackageLock,
): Promise<PackageUseReconciliation> {
  const refreshTimeoutMs = packageUseRefreshTimeoutMs();
  const firstParty = resolveFirstPartyPackageCatalog(lock.package_id);
  if (firstParty && lock.source_kind !== 'bundled_full_runtime_modules') {
    try {
      const update = await runOplAgentPackageUpdateUnlocked({
        packageId: lock.package_id,
        dryRun: input.dryRun === true,
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
      }, {
        catalogFetchTimeoutMs: refreshTimeoutMs,
      });
      const readback = update.opl_agent_package_update;
      const closureCurrentness = Array.isArray(readback.closure_currentness)
        ? readback.closure_currentness
        : [];
      const hasDeveloperSource = closureCurrentness.some((entry: any) =>
        entry?.source_policy?.desired_source_kind === 'developer_checkout_override');
      const hasManagedSource = closureCurrentness.some((entry: any) =>
        entry?.source_policy?.desired_source_kind === 'first_party_managed_cohort');
      const updateRequired = readback.currentness?.status !== 'current';
      return {
        freshnessMode: hasDeveloperSource ? 'source_reconciled' : 'channel_verified',
        latestVerified: !hasManagedSource || readback.release_catalog_freshness === 'live',
        updated: updateRequired && input.dryRun !== true,
        refreshOutcome: updateRequired && input.dryRun !== true ? 'updated' : 'current',
        channelRef: readback.release_catalog_ref ?? null,
        channelDigest: readback.release_catalog_digest ?? null,
        checkedAt: readback.release_catalog_checked_at ?? nowIso(),
        reconciliationIssue: null,
      };
    } catch (error) {
      return packageUseLastKnownGood(lock, error, refreshTimeoutMs);
    }
  }

  const source = lock.managed_update_source;
  if (!source) {
    return packageUseLastKnownGood(
      lock,
      new FrameworkContractError('codex_command_failed', 'No managed package channel is available for this installed package.', {
        package_id: lock.package_id,
        failure_code: 'agent_package_capability_channel_unavailable',
      }),
      refreshTimeoutMs,
    );
  }
  try {
    const fetched = await fetchManagedPackageCatalog(source, {
      timeoutMs: refreshTimeoutMs,
    });
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
      updated: updateRequired && input.dryRun !== true,
      refreshOutcome: updateRequired && input.dryRun !== true ? 'updated' : 'current',
      channelRef: fetched.channel_ref,
      channelDigest: fetched.channel_digest,
      checkedAt: fetched.checked_at,
      reconciliationIssue: null,
    };
  } catch (error) {
    return packageUseLastKnownGood(lock, error, refreshTimeoutMs);
  }
}

function missingDependencyProviderIsOptional(
  lock: AgentPackageLock,
  packageId: string,
) {
  const declared = lock.capability_dependencies.find((entry) => entry.package_id === packageId);
  const resolved = lock.resolved_dependencies.find((entry) => entry.package_id === packageId);
  return declared?.required === false && resolved?.required === false;
}

function resolvedProviderLocksForUse(
  lock: AgentPackageLock,
  index: AgentPackageLockIndex,
  failureMessage: string,
) {
  return lock.resolved_dependencies.flatMap((dependency) => {
    const provider = index.packages.find((entry) => entry.package_id === dependency.package_id);
    if (provider) return [provider];
    if (missingDependencyProviderIsOptional(lock, dependency.package_id)) return [];
    throw new FrameworkContractError('contract_shape_invalid', failureMessage, {
      package_id: lock.package_id,
      dependency_package_id: dependency.package_id,
      failure_code: 'agent_package_dependency_lock_missing',
    });
  });
}

async function ensureOplAgentPackageScopeActivationUnlocked(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const recovered = readRecoveredLockIndex(input.dryRun === true);
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
        if (missingDependencyProviderIsOptional(lock, dependency.package_id)) continue;
        throw new FrameworkContractError('contract_shape_invalid', 'Package scope activation requires every dependency provider lock.', {
          package_id: packageId,
          dependency_package_id: dependency.package_id,
          failure_code: 'agent_package_dependency_lock_missing',
        });
      }
      materializations.push(materializeCapabilityScopeFromLock({
        provider,
        consumerProfileId: dependency.consumer_profile_id ?? null,
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
    source_artifact_ref: entry.source_artifact_ref ?? null,
    artifact_digest: entry.artifact_digest ?? null,
    owner_source_commit: entry.owner_source_commit ?? null,
    carrier_authority: entry.carrier_authority ?? null,
    source_kind: entry.source_kind,
    developer_checkout_source: entry.developer_checkout_source ?? null,
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
        sourceArtifactRef: lock.source_artifact_ref ?? null,
        artifactDigest: lock.artifact_digest ?? null,
        ownerSourceCommit: lock.owner_source_commit ?? null,
        developerCheckoutSource: lock.developer_checkout_source ?? null,
        carrierAuthority: lock.carrier_authority ?? null,
        releaseChannelRef: lock.release_channel_ref ?? null,
        releaseChannelDigest: lock.release_channel_digest ?? null,
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
  const resolvedProviderLocks = resolvedProviderLocksForUse(
    activatedLock,
    nextIndex,
    'Package scope activation requires every required dependency provider lock.',
  );
  const providerPackages = resolvedProviderLocks.map((provider) => {
    return {
      package_id: provider.package_id,
      package_version: provider.package_version,
      owner_language_version: provider.owner_language_version,
      package_lock_ref: provider.lock_ref,
      manifest_sha256: provider.manifest_sha256,
      content_digest: provider.content_digest,
      source_artifact_ref: provider.source_artifact_ref ?? null,
      artifact_digest: provider.artifact_digest ?? null,
      owner_source_commit: provider.owner_source_commit ?? null,
      carrier_authority: provider.carrier_authority ?? null,
      source_kind: provider.source_kind,
      developer_checkout_source: provider.developer_checkout_source ?? null,
    };
  });
  const skillProjection = materializeAgentPackageSkillProjection({
    root: activatedLock,
    providers: resolvedProviderLocks,
    dryRun: input.dryRun === true,
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
      owner_source_commit: activatedLock.owner_source_commit ?? null,
      carrier_authority: activatedLock.carrier_authority ?? null,
      source_kind: activatedLock.source_kind,
      developer_checkout_source: activatedLock.developer_checkout_source ?? null,
    },
    provider_packages: providerPackages,
    dependency_closure_digest: activatedLock.dependency_closure_digest,
    freshness_mode: reconciliation.freshnessMode,
    latest_verified: reconciliation.latestVerified,
    checked_at: reconciliation.checkedAt,
    refresh_outcome: reconciliation.refreshOutcome,
    channel_ref: reconciliation.channelRef,
    channel_digest: reconciliation.channelDigest,
    reconciliation_issue: reconciliation.reconciliationIssue,
    scope: input.scope,
    target_root: targetRoot,
    skill_projection: skillProjection,
    core_skill_tree_digest: skillProjection?.core_digest ?? materializationReadiness.actual_digest,
    skill_tree_digest: skillProjection?.full_export_digest
      ?? activatedLock.scope_materializations.find((entry) =>
        entry.scope === input.scope && entry.target_root === targetRoot)?.full_export_digest
      ?? null,
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
    sourceArtifactRef: activatedLock.source_artifact_ref ?? null,
    artifactDigest: activatedLock.artifact_digest ?? null,
    ownerSourceCommit: activatedLock.owner_source_commit ?? null,
    developerCheckoutSource: activatedLock.developer_checkout_source ?? null,
    carrierAuthority: activatedLock.carrier_authority ?? null,
    releaseChannelRef: activatedLock.release_channel_ref ?? null,
    releaseChannelDigest: activatedLock.release_channel_digest ?? null,
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

function packageUseLastKnownGoodFallback(
  input: AgentPackagePackageActionInput,
  error: FrameworkContractError,
) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const index = readLockIndex();
  const { lock } = requireInstalledPackage(index, packageId, 'activate');
  const targetRoot = packageScopeTarget(input);
  if (!input.scope || !targetRoot) throw error;

  const materializationReadiness = scopeMaterializationReadiness(lock, index, input);
  const reconciliation = packageUseLastKnownGood(lock, error, packageUseRefreshTimeoutMs());
  const resolvedProviderLocks = resolvedProviderLocksForUse(
    lock,
    index,
    'Package LKG use requires every required dependency provider lock.',
  );
  const providerPackages = resolvedProviderLocks.map((provider) => {
    return {
      package_id: provider.package_id,
      package_version: provider.package_version,
      owner_language_version: provider.owner_language_version,
      package_lock_ref: provider.lock_ref,
      manifest_sha256: provider.manifest_sha256,
      content_digest: provider.content_digest,
      source_artifact_ref: provider.source_artifact_ref ?? null,
      artifact_digest: provider.artifact_digest ?? null,
      owner_source_commit: provider.owner_source_commit ?? null,
      carrier_authority: provider.carrier_authority ?? null,
      source_kind: provider.source_kind,
      developer_checkout_source: provider.developer_checkout_source ?? null,
    };
  });
  const skillProjection = materializeAgentPackageSkillProjection({
    root: lock,
    providers: resolvedProviderLocks,
    dryRun: false,
  });
  const useBinding: AgentPackageUseBinding = {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: input.useBoundaryId
      ?? sha256Text(`${packageId}\n${input.scope}\n${targetRoot}\n${Date.now()}`),
    use_receipt_ref: '',
    root_package: {
      package_id: lock.package_id,
      package_version: lock.package_version,
      owner_language_version: lock.owner_language_version,
      package_lock_ref: lock.lock_ref,
      manifest_sha256: lock.manifest_sha256,
      content_digest: lock.content_digest,
      source_artifact_ref: lock.source_artifact_ref ?? null,
      artifact_digest: lock.artifact_digest ?? null,
      owner_source_commit: lock.owner_source_commit ?? null,
      carrier_authority: lock.carrier_authority ?? null,
      source_kind: lock.source_kind,
      developer_checkout_source: lock.developer_checkout_source ?? null,
    },
    provider_packages: providerPackages,
    dependency_closure_digest: lock.dependency_closure_digest,
    freshness_mode: reconciliation.freshnessMode,
    latest_verified: reconciliation.latestVerified,
    checked_at: reconciliation.checkedAt,
    refresh_outcome: reconciliation.refreshOutcome,
    channel_ref: reconciliation.channelRef,
    channel_digest: reconciliation.channelDigest,
    reconciliation_issue: reconciliation.reconciliationIssue,
    scope: input.scope,
    target_root: targetRoot,
    skill_projection: skillProjection,
    core_skill_tree_digest: skillProjection?.core_digest ?? materializationReadiness.actual_digest,
    skill_tree_digest: skillProjection?.full_export_digest
      ?? lock.scope_materializations.find((entry) =>
        entry.scope === input.scope && entry.target_root === targetRoot)?.full_export_digest
      ?? null,
    core_readiness: materializationReadiness.core_readiness,
    specialty_exposure: materializationReadiness.specialty_exposure,
  };
  useBinding.use_receipt_ref = packageReceiptRef({
    action: 'use',
    packageId,
    sourceSha256: sha256Text(JSON.stringify(useBinding)),
  });
  const packageStatus = runOplAgentPackageStatus({
    packageId,
    scope: input.scope,
    targetWorkspace: input.targetWorkspace,
    targetQuest: input.targetQuest,
  }).opl_agent_package_status;
  return {
    status: 'using_last_known_good' as const,
    package_id: packageId,
    writes_performed: false,
    scope_materializations: [],
    lifecycle_receipt: null,
    package_lock: lock,
    materialization_readiness: materializationReadiness,
    package_use_binding: useBinding,
    use_receipt: null,
    closure_reconciliation: reconciliation,
    package_status: packageStatus,
  };
}

export async function ensureOplAgentPackageScopeActivation(input: AgentPackagePackageActionInput) {
  try {
    return await withAgentPackageLifecycleTransaction(
      input.dryRun === true,
      async () => {
        const beforeStatus = runOplAgentPackageStatus({
          packageId: input.packageId,
          scope: input.scope,
          targetWorkspace: input.targetWorkspace,
          targetQuest: input.targetQuest,
        }).opl_agent_package_status;
        const preflightHardStopReason = packageActivationPreflightHardStopReason(beforeStatus);
        if (preflightHardStopReason) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Package activation is blocked by the current package lifecycle state.',
            {
              package_id: input.packageId,
              launch_blocked_reason: preflightHardStopReason,
              allowed_when_blocked: beforeStatus.allowed_when_blocked,
              package_dependency_readiness: beforeStatus.package_dependency_readiness,
              materialization_readiness: beforeStatus.materialization_readiness,
              repair_action: beforeStatus.repair_action,
              failure_code: 'agent_package_scope_activation_blocked',
            },
          );
        }
        const activation = await ensureOplAgentPackageScopeActivationUnlocked(input);
        const packageStatus = runOplAgentPackageStatus({
          packageId: input.packageId,
          scope: input.scope,
          targetWorkspace: input.targetWorkspace,
          targetQuest: input.targetQuest,
        }).opl_agent_package_status;
        return {
          ...activation,
          package_status: packageStatus,
        };
      },
    );
  } catch (error) {
    if (input.dryRun === true || !isPackageLifecycleLockTimeout(error)) throw error;
    return packageUseLastKnownGoodFallback(input, error);
  }
}

async function runOplAgentPackageActivateUnlocked(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const beforeStatus = runOplAgentPackageStatus({
    packageId,
    scope: input.scope,
    targetWorkspace: input.targetWorkspace,
    targetQuest: input.targetQuest,
  }).opl_agent_package_status;
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
        materialization_readiness: null,
        operational_ready: false,
        launch_allowed: false,
        launch_blocked_reason: 'package_not_installed',
        ...launchState,
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
  const packageStatus = activation.package_status;
  if (!input.dryRun && packageStatus.launch_state === 'package_unavailable') {
    const launchStateReason = stringValue(packageStatus.launch_state_reason);
    if (!launchStateReason) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Package activation received an invalid canonical launch-state projection.',
        {
          package_id: packageId,
          launch_state: packageStatus.launch_state,
          launch_state_reason: packageStatus.launch_state_reason,
          failure_code: 'agent_package_launch_state_reason_missing',
        },
      );
    }
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Package activation is blocked until dependency and scope readiness are repaired.',
      {
        package_id: packageId,
        launch_blocked_reason: launchStateReason,
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
      launch_allowed: input.dryRun ? false : packageStatus.launch_state !== 'package_unavailable',
      launch_blocked_reason: packageStatus.launch_state === 'package_unavailable'
        ? packageStatus.launch_blocked_reason ?? packageStatus.launch_state_reason
        : null,
      launch_state_schema_version: packageStatus.launch_state_schema_version,
      launch_state: packageStatus.launch_state,
      launch_state_reason: packageStatus.launch_state_reason,
      use_boundary_id: activation.package_use_binding?.use_boundary_id ?? null,
      use_receipt_ref: activation.package_use_binding?.use_receipt_ref ?? null,
      lifecycle_receipt_ref: packageStatus.materialization_readiness?.lifecycle_receipt_ref ?? null,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

function packageActivationPreflightHardStopReason(packageStatus: any) {
  const selectedLock = packageStatus?.installed_packages?.find(
    (entry: any) => entry?.package_id === packageStatus?.package_id,
  ) ?? null;
  if (selectedLock?.exposure_state === 'disabled') return 'package_disabled';
  return null;
}

export async function runOplAgentPackageActivate(input: AgentPackagePackageActionInput) {
  return runOplAgentPackageActivateUnlocked(input);
}

function runOplAgentPackageProfileApplyUnlocked(input: AgentPackageProfileApplyInput) {
  const packageId = requirePackageId(input.packageId, 'profile_apply');
  const { index } = readRecoveredLockIndex(input.dryRun === true);
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
    sourceArtifactRef: lock.source_artifact_ref ?? null,
    artifactDigest: lock.artifact_digest ?? null,
    ownerSourceCommit: lock.owner_source_commit ?? null,
    carrierAuthority: lock.carrier_authority ?? null,
    releaseChannelRef: lock.release_channel_ref ?? null,
    releaseChannelDigest: lock.release_channel_digest ?? null,
  });
  const updatedLock = {
    ...lock,
    updated_at: input.dryRun ? lock.updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
    physical_surface: physicalSurface,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = updatedLock;
    writePackageTransaction(index, [receipt]);
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

export async function runOplAgentPackageProfileApply(input: AgentPackageProfileApplyInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageProfileApplyUnlocked(input),
  );
}

function runOplAgentPackageFrameworkLinkUnlocked(input: { agentRoot: string; dryRun?: boolean; checkOnly?: boolean }) {
  return {
    version: 'g2',
    opl_agent_package_framework_link: materializeStandardAgentFrameworkLink(input),
  };
}

export async function runOplAgentPackageFrameworkLink(input: { agentRoot: string; dryRun?: boolean; checkOnly?: boolean }) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true || input.checkOnly === true,
    async () => runOplAgentPackageFrameworkLinkUnlocked(input),
  );
}

function runOplAgentPackageUninstallUnlocked(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'uninstall');
  const { index } = readRecoveredLockIndex(input.dryRun === true);
  assertNoRequiredInstalledDependents(index, packageId, 'uninstall');
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'uninstall');
  const physicalSurface = removePhysicalCodexSurface(
    lock.physical_surface,
    input.dryRun === true,
    packageId,
    { retainPayloadSource: true, retainPluginCache: true },
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
    sourceArtifactRef: lock.source_artifact_ref ?? null,
    artifactDigest: lock.artifact_digest ?? null,
    ownerSourceCommit: lock.owner_source_commit ?? null,
    carrierAuthority: lock.carrier_authority ?? null,
    releaseChannelRef: lock.release_channel_ref ?? null,
    releaseChannelDigest: lock.release_channel_digest ?? null,
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
    const committedCleanupPaths = [
      lock.physical_surface?.plugin_payload_cache_path,
      lock.physical_surface?.codex_plugin_cache_path,
    ].filter((candidate): candidate is string => Boolean(candidate && !fs.existsSync(candidate)));
    physicalSurface.removed_paths = [
      ...new Set([...physicalSurface.removed_paths, ...committedCleanupPaths]),
    ];
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

export async function runOplAgentPackageUninstall(input: AgentPackagePackageActionInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageUninstallUnlocked(input),
  );
}

function runOplAgentPackageExposureActionUnlocked(
  action: 'hide' | 'unhide' | 'enable' | 'disable',
  input: AgentPackagePackageActionInput,
) {
  const packageId = requirePackageId(input.packageId, action);
  const { index } = readRecoveredLockIndex(input.dryRun === true);
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
    sourceArtifactRef: lock.source_artifact_ref ?? null,
    artifactDigest: lock.artifact_digest ?? null,
    ownerSourceCommit: lock.owner_source_commit ?? null,
    carrierAuthority: lock.carrier_authority ?? null,
    releaseChannelRef: lock.release_channel_ref ?? null,
    releaseChannelDigest: lock.release_channel_digest ?? null,
  });
  const updatedLock: AgentPackageLock = {
    ...lock,
    exposure_state: nextState,
    exposure_updated_at: input.dryRun ? lock.exposure_updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = updatedLock;
    writePackageTransaction(index, [receipt]);
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

export async function runOplAgentPackageExposureAction(
  action: 'hide' | 'unhide' | 'enable' | 'disable',
  input: AgentPackagePackageActionInput,
) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageExposureActionUnlocked(action, input),
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
  const { index: lockIndex } = readRecoveredLockIndex(input.dryRun === true);
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

export async function runOplAgentPackageHomeShortcutPreferencesSet(input: AgentPackageHomeShortcutPreferencesSetInput) {
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageHomeShortcutPreferencesSetUnlocked(input),
  );
}

export type OplAgentPackageStatusInput = {
  packageId?: string | null;
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
  recoverRuntimeSource?: boolean;
  detail?: 'fast' | 'full';
};

function readAgentPackageStatusSnapshot() {
  const lockIndex = readLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const registryCache = readRegistryCache();
  return {
    lockIndex,
    lifecycleLedger,
    registryCache,
    paths: resolveOplStatePaths(),
    runtimeSourceRecovery: inspectManagedRuntimeSourceTransactions(),
    homeShortcutPreferences: mergedHomeShortcutPreferences(registryCache, lockIndex),
    receiptsByRef: new Map(
      lifecycleLedger.receipts.map((receipt) => [receipt.receipt_ref, receipt]),
    ),
  };
}

function buildOplAgentPackageStatus(
  input: OplAgentPackageStatusInput,
  snapshot: ReturnType<typeof readAgentPackageStatusSnapshot>,
) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const {
    lockIndex,
    runtimeSourceRecovery,
    lifecycleLedger,
    paths,
    homeShortcutPreferences: allHomeShortcutPreferences,
    receiptsByRef,
  } = snapshot;
  const installedPackages = packageId
    ? lockIndex.packages.filter((entry) => entry.package_id === packageId)
    : lockIndex.packages;
  const homeShortcutPreferences = allHomeShortcutPreferences
    .filter((entry) => !packageId || entry.package_id === packageId);
  const lifecycleUx = agentPackageLifecycleSummaryReadback({
    selectedPackageId: packageId ?? null,
    packages: installedPackages,
    receipts: lifecycleLedger.receipts,
  });
  const selectedLock = packageId ? installedPackages[0] ?? null : null;
  const selectedReceipt = selectedLock
    ? receiptsByRef.get(selectedLock.action_receipt_id) ?? null
    : null;
  const carrierAuthorityReadiness = selectedLock
    ? agentPackageCarrierReceiptAuthorityStatus(selectedLock, selectedReceipt)
    : null;
  const policyCurrentness = managedPolicyCurrentness(selectedLock);
  const packageDependencyReadiness = selectedLock ? dependencyReadiness(selectedLock, lockIndex) : null;
  const materializationReadiness = selectedLock
    ? scopeMaterializationReadiness(selectedLock, lockIndex, input)
    : null;
  const runtimeSourceReadiness = input.detail === 'fast'
    ? managedRuntimeSourceLockReadiness(
        selectedLock?.managed_runtime_source,
        selectedLock?.runtime_source_carrier,
      )
    : managedRuntimeSourceReadiness(
        selectedLock?.managed_runtime_source,
        selectedLock?.runtime_source_carrier,
      );
  const materializationOperational = !materializationReadiness
    || materializationReadiness.status === 'current'
    || materializationReadiness.status === 'not_required'
    || materializationReadiness.status === 'scope_required';
  const managedPolicyOperational = policyCurrentness.status === 'current'
    || policyCurrentness.status === 'not_requested'
    || policyCurrentness.status === 'drifted';
  const exposureOperational = selectedLock?.exposure_state !== 'disabled';
  const operationalReady = Boolean(
    selectedLock
    && exposureOperational
    && packageDependencyReadiness?.operational_ready
    && materializationOperational
    && runtimeSourceReadiness.operational_ready
    && managedPolicyOperational,
  );
  const launchBlockedReason = !selectedLock
    ? 'package_not_installed'
    : !exposureOperational
      ? 'package_disabled'
      : packageDependencyReadiness && !packageDependencyReadiness.operational_ready
        ? `package_dependency_${packageDependencyReadiness.status}`
        : !materializationOperational
          ? `scope_materialization_${materializationReadiness?.status ?? 'unavailable'}`
          : !runtimeSourceReadiness.operational_ready
            ? `runtime_source_${runtimeSourceReadiness.status}`
            : !managedPolicyOperational
              ? `managed_policy_${policyCurrentness.status}`
              : null;
  const repairAction = selectedLock && launchBlockedReason
    ? !materializationOperational
      ? materializationReadiness?.repair_command ?? null
      : packageDependencyReadiness && !packageDependencyReadiness.operational_ready
        ? packageDependencyReadiness.repair_command
        : !managedPolicyOperational
          ? policyCurrentness.repair_command
          : null
    : null;
  const requiredSkillIds = materializationReadiness?.core_readiness?.required_skill_ids
    ?? materializationReadiness?.required_skill_ids
    ?? [];
  const materializedSkillIds = new Set(
    materializationReadiness?.core_readiness?.materialized_skill_ids
      ?? materializationReadiness?.materialized_skill_ids
      ?? [],
  );
  const requiredCoreSkillMissing = requiredSkillIds.some((skillId) => !materializedSkillIds.has(skillId))
    || (materializationReadiness?.status === 'missing' && requiredSkillIds.length === 0);
  const requiredDependencyUnavailable = packageDependencyReadiness?.operational_ready === false;
  const optionalDependencyMissing = packageDependencyReadiness?.dependencies.some(
    (dependency) => dependency.required === false && dependency.status === 'missing',
  ) ?? false;
  const dependencyObservationReason = packageDependencyReadiness?.dependencies
    .flatMap((dependency) => dependency.reasons ?? [])[0] ?? null;
  const materializationObservationReason = materializationReadiness
    && !requiredCoreSkillMissing
    && !['current', 'not_required'].includes(materializationReadiness.status)
    ? `scope_materialization_${materializationReadiness.status}`
    : null;
  const unavailableReason = requiredDependencyUnavailable
    ? `package_dependency_${packageDependencyReadiness?.status ?? 'incompatible'}`
    : requiredCoreSkillMissing
      ? 'required_core_skill_missing'
      : !runtimeSourceReadiness.operational_ready
        ? `runtime_source_${runtimeSourceReadiness.status}`
        : policyCurrentness.status === 'invalid'
          ? 'managed_policy_invalid'
          : null;
  const degradedReason = unavailableReason
    ? null
    : optionalDependencyMissing
      ? 'optional_dependency_missing'
      : materializationObservationReason
      ?? (carrierAuthorityReadiness?.status === 'invalid' ? 'carrier_authority_invalid' : null)
      ?? (policyCurrentness.status === 'drifted' ? 'managed_policy_drifted' : null)
      ?? (dependencyObservationReason ? `package_dependency_${dependencyObservationReason}` : null);
  const launchState = deriveAgentPackageLaunchState({
    installed: Boolean(selectedLock),
    exposure_state: selectedLock?.exposure_state ?? 'not_installed',
    operational_ready: operationalReady,
    launch_blocked_reason: operationalReady ? null : launchBlockedReason,
    degraded_reason: degradedReason,
    unavailable_reason: unavailableReason,
  });
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
      carrier_authority_readiness: carrierAuthorityReadiness,
      managed_policy_currentness: policyCurrentness,
      runtime_source_recovery: runtimeSourceRecovery,
      operational_ready: operationalReady,
      operational_ready_scope: 'package_dependency_scope_runtime_source_and_managed_policy',
      launch_allowed: operationalReady,
      launch_blocked_reason: operationalReady ? null : launchBlockedReason,
      ...launchState,
      allowed_when_blocked: ['status', 'doctor', 'repair'],
      repair_action: repairAction,
      home_shortcut_preferences: homeShortcutPreferences,
      lifecycle_receipts: lifecycleLedger.receipts.filter((receipt) => !packageId || receipt.package_id === packageId),
      owner_route_readback: input.detail === 'fast'
        ? {
            surface_kind: 'opl_agent_package_owner_route_readback',
            status: 'deferred_fast_profile',
            selected_package_id: packageId ?? null,
            package_count: installedPackages.length,
            packages: [],
            detail_surface: 'opl packages status --package-id <package_id> --json',
            authority_boundary: refsOnlyAuthorityBoundary(),
          }
        : ownerRouteReadback({
            selectedPackageId: packageId ?? null,
            scope: input.scope,
            targetWorkspace: input.targetWorkspace,
            targetQuest: input.targetQuest,
            allLocks: lockIndex.packages,
            packages: installedPackages.map((lock) => ({
              packageId: lock.package_id,
              lock,
              receipt: receiptsByRef.get(lock.action_receipt_id) ?? null,
            })),
          }),
      files: {
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function createOplAgentPackageStatusReader() {
  const snapshot = readAgentPackageStatusSnapshot();
  return (input: OplAgentPackageStatusInput = {}) => buildOplAgentPackageStatus(input, snapshot);
}

export function runOplAgentPackageStatus(input: OplAgentPackageStatusInput = {}) {
  return buildOplAgentPackageStatus(input, readAgentPackageStatusSnapshot());
}

export function listOplAgentPackages(input: {
  detail?: 'fast' | 'full';
  firstPartyCatalog?: import('./agent-package-registry-parts/directory.ts').FirstPartyDirectoryCatalogSnapshot | null;
  statusContext?: (packageId: string) => Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'> | null;
  readStatus?: typeof runOplAgentPackageStatus;
} = {}) {
  const detail = input.detail ?? 'fast';
  const paths = resolveOplStatePaths();
  const registryCache = readRegistryCache();
  const lockIndex = readLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const homeShortcutPreferences = mergedHomeShortcutPreferences(registryCache, lockIndex);
  const receiptsByRef = new Map<string, AgentPackageLifecycleReceipt>();
  for (const receipt of lifecycleLedger.receipts) {
    receiptsByRef.set(receipt.receipt_ref, receipt);
  }
  const lifecycleUx = agentPackageLifecycleSummaryReadback({
    packages: lockIndex.packages,
    receipts: lifecycleLedger.receipts,
  });
  const directory = buildAgentPackageDirectory({
    registryCache,
    locks: lockIndex.packages,
    detail,
    firstPartyCatalog: input.firstPartyCatalog ?? readFirstPartyPackageCatalogSnapshot(),
    actionContext: input.statusContext,
    readStatus: (packageId) => {
      const context = input.statusContext?.(packageId) ?? {};
      return (input.readStatus ?? runOplAgentPackageStatus)({
        packageId,
        detail,
        recoverRuntimeSource: false,
        ...context,
      }).opl_agent_package_status;
    },
  });
  return {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      status: 'available',
      registry_cache: registryCache,
      directory,
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
              receipt: receiptsByRef.get(lock.action_receipt_id) ?? null,
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

export async function refreshAndListOplAgentPackages(input: {
  detail?: 'fast' | 'full';
  refresh?: boolean;
} = {}) {
  const firstPartyCatalog = await resolveFirstPartyPackageCatalogSnapshot({
    refresh: input.refresh !== false,
  });
  return listOplAgentPackages({
    detail: input.detail,
    firstPartyCatalog,
  });
}

export function readInstalledOplAgentPackageLocks() {
  return readLockIndex().packages;
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
