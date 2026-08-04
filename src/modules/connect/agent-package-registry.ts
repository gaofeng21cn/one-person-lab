import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  computePackageChannelTreeSha256,
  type ManagedModulePackageChannelSelection,
} from './system-installation/module-package-channel.ts';
import { readPackagedModuleMarker } from './system-installation/module-packaged.ts';
import { resolveOplDomainModuleSpec } from './system-installation/modules.ts';
import {
  assertManifestMatchesRegistrySelection,
  assertTrustTierAssigned,
  resolveManifestSelection,
} from './agent-package-registry-parts/selection.ts';
import {
  assertPermissionScopeUnchanged,
  buildLock,
  cleanupPreviousPhysicalSurface,
  lifecycleReceipt,
  packageActionSourceSha256,
  packageActionStatus,
  requireInstalledPackage,
  requirePackageId,
} from './agent-package-registry-parts/lifecycle-lock.ts';
import {
  mergedHomeShortcutPreferences,
  readHomeShortcutPreferenceFile,
  updateHomeShortcutPreferences,
  withHomeShortcutPreferenceTransaction,
  writeHomeShortcutPreferenceFile,
} from './agent-package-registry-parts/home-shortcuts.ts';
import { normalizeManifest, normalizePackageManifest } from './agent-package-registry-parts/manifest-normalizers.ts';
import {
  installedImmutableRepairCatalog,
  installedPackageLockClosure,
  installedPackagePluginSourcePath,
} from './agent-package-registry-parts/installed-plugin-source.ts';
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
  catalogPayloadManifestJson,
  selectCapabilityCatalogVersion,
  selectManagedCatalogPackageVersion,
  type ManagedCatalogVersion,
  type ManagedPackageCatalog,
} from './agent-package-registry-parts/capability-reconciliation.ts';
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
  finalizePhysicalCodexSurfaceMutation,
  managedCarrierProjectionDigest,
  materializePhysicalCodexSurface,
  removePhysicalCodexSurface,
  rematerializePhysicalCodexSurfaceFromLock,
  restorePhysicalCodexSurfaceMutation,
  rollbackManagedPolicySurface,
  resolveBundledFullRuntimeManifestPhysicalSource,
  resolveManifestPhysicalSource,
} from './agent-package-registry-parts/physical-surface.ts';
import { assertSafePersistedPackagePath } from './agent-package-registry-parts/persisted-path-safety.ts';
import {
  assertBundledFullRuntimePackageRoots,
  readBundledFullRuntimePackageCatalog,
  resolveBundledFullRuntimePackageClosureRoots,
  type BundledFullRuntimeCatalogEntry,
} from './agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import {
  agentPackageCarrierAuthorityStatus,
  buildAgentPackageCarrierAuthority,
} from './agent-package-registry-parts/carrier-authority.ts';
import {
  managedPolicyCurrentness,
  managedPolicyCurrentnessFromDescriptor,
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
  rollbackManagedRuntimeSourceMutation,
} from './agent-package-registry-parts/managed-runtime-source-carrier.ts';
import {
  buildAgentPackageDirectory,
  firstPartyConfiguredCarrierDescriptors,
} from './agent-package-registry-parts/directory.ts';
import {
  discoverInstalledCodexPluginDescriptors,
  discoverInstalledOwnerProfileDescriptors,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';
import {
  maybeRetireDescriptorOwnedLegacyState,
} from './agent-package-registry-parts/descriptor-owned-legacy-state-retirement.ts';
import {
  runConfiguredCodexPluginCarrier,
  type ConfiguredCodexPluginCarrierAction,
  type ConfiguredCodexPluginCarrierReadback,
} from './agent-package-registry-parts/configured-codex-plugin-carrier.ts';
import {
  assertOplFlowCoreSkillsCarrierReadback,
  isOplFlowCoreSkillsTarget,
  prepareLegacyOplSkillsMigration,
  runConfiguredCodexPluginCarrierWithLegacyOplSkillsMigration,
  type PreparedLegacyOplSkillsMigration,
} from './agent-package-registry-parts/legacy-opl-skills-migration.ts';
import {
  refreshFirstPartyPackageCatalogSnapshot,
  resolveFirstPartyPackageCatalogSnapshot,
} from './agent-package-registry-parts/first-party-release-catalog.ts';
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
  ownerPackageCatalogVersion,
} from './agent-package-registry-parts/update-reconciliation.ts';
import {
  fetchJsonSource,
  normalizeSourceKind,
  nowIso,
  refsOnlyAuthorityBoundary,
  resolveCodexHome,
  sha256Text,
} from './agent-package-registry-parts/shared.ts';
import {
  readLockIndex,
  withAgentPackageLifecycleTransaction,
  writePackageTransaction,
} from './agent-package-registry-parts/store.ts';
import type {
  AgentPackageConfiguredCodexPluginCarrierDescriptor,
  AgentPackageHomeShortcutPreferenceFile,
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageStoredHomeShortcutPreference,
  AgentPackageCarrierAuthority,
  AgentPackageInstallInput,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifestValidateInput,
  AgentPackageManifest,
  AgentPackageManagedPolicyDependency,
  AgentPackageManagedVersionCatalogSource,
  AgentPackagePackageActionInput,
  AgentPackagePhysicalSurface,
  AgentPackageScopeMaterialization,
  AgentPackageRepairInput,
  AgentPackageRegistryEntry,
} from './agent-package-registry-parts/types.ts';

export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageManifestValidateInput,
  AgentPackagePackageActionInput,
  AgentPackageRepairInput,
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

function previousPhysicalSurfaceCanBeRematerialized(lock: AgentPackageLock) {
  if (!lock.physical_surface?.plugin_id) return true;
  const sourcePath = installedPackagePluginSourcePath(lock);
  return sourcePath !== null && fs.existsSync(sourcePath);
}

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

type BundledFullRuntimeRepairSourceValidation = {
  packageId: string;
  sourceRoot: string;
  targetRoot: string;
  moduleId: string;
  expectedTreeSha256: string;
  sourceTreeSha256: string;
  targetTreeSha256: string;
  expectedOwnerSourceCommit: string;
  sourceOwnerSourceCommit: string;
  targetOwnerSourceCommit: string | null;
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
    catalogRef: preparedReleaseChannelRef(prepared, channelRef),
    catalogSha256: preparedReleaseChannelDigest(prepared, channelDigest),
    catalogOwnerSourceCommit: prepared.catalogVersion?.owner_source_commit ?? null,
    manifestCarrierSourceCommit: prepared.manifest.carrier_source_commit,
    payloadSourceCommit: prepared.manifest.verified_payload_source_commit,
  });
}

function packageOwnerChannelRef(version: ManagedCatalogVersion | null | undefined) {
  const artifactRef = version?.source_artifact_ref ?? null;
  const separator = artifactRef?.lastIndexOf(':') ?? -1;
  return artifactRef && separator > artifactRef.lastIndexOf('/')
    ? `${artifactRef.slice(0, separator)}:latest-stable`
    : null;
}

function preparedReleaseChannelRef(prepared: PreparedPackage, fallback: string | null) {
  return prepared.sourceKind === 'first_party_managed_cohort'
    ? packageOwnerChannelRef(prepared.catalogVersion) ?? fallback
    : fallback;
}

function preparedReleaseChannelDigest(prepared: PreparedPackage, fallback: string | null) {
  return prepared.sourceKind === 'first_party_managed_cohort'
    ? prepared.catalogVersion?.artifact_digest ?? fallback
    : fallback;
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

function installedClosurePrestate(
  index: AgentPackageLockIndex,
  preparedPackages: PreparedPackage[],
) {
  const seen = new Set<string>();
  const ordered: AgentPackageLock[] = [];
  for (const prepared of preparedPackages) {
    if (!prepared.previousLock) continue;
    for (const lock of installedPackageLockClosure(index, prepared.previousLock)) {
      if (seen.has(lock.package_id)) continue;
      seen.add(lock.package_id);
      ordered.push(lock);
    }
  }
  return ordered;
}

type ApplyManifestPackageLockOptions = {
  catalog?: ManagedPackageCatalog | null;
  rootVersion?: ManagedCatalogVersion | null;
  catalogSource?: AgentPackageManagedVersionCatalogSource | null;
  channelRef?: string | null;
  channelDigest?: string | null;
  trustedBundledFullRuntimeInstall?: TrustedBundledFullRuntimeInstall | null;
  sourceReconcile?: boolean;
  preserveInstalledImmutableIdentity?: boolean;
  descriptorOwnedFirstPartyAdoption?: boolean;
  configuredCarrierAction?: 'update' | 'repair';
};

type ApplyManifestPackageLockTransaction = {
  legacySkillMigration: PreparedLegacyOplSkillsMigration | null;
  physicalSurfaces: AgentPackagePhysicalSurface[];
};

async function applyManifestPackageLock(
  input: AgentPackageInstallInput,
  action: 'install' | 'update' | 'repair',
  options: ApplyManifestPackageLockOptions = {},
) {
  const transaction: ApplyManifestPackageLockTransaction = {
    legacySkillMigration: null,
    physicalSurfaces: [],
  };
  try {
    return await applyManifestPackageLockUnlocked(input, action, options, transaction);
  } catch (error) {
    for (const surface of [...transaction.physicalSurfaces].reverse()) {
      restorePhysicalCodexSurfaceMutation(surface);
    }
    transaction.legacySkillMigration?.rollback();
    throw error;
  }
}

async function applyManifestPackageLockUnlocked(
  input: AgentPackageInstallInput,
  action: 'install' | 'update' | 'repair',
  options: ApplyManifestPackageLockOptions,
  transaction: ApplyManifestPackageLockTransaction,
) {
  let legacySkillMigration: PreparedLegacyOplSkillsMigration | null = null;
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
    const trustedBundledUpdate = action === 'update'
      && input.provenance?.source_policy === 'bundled_full_runtime_modules'
      && input.provenance.trigger === 'managed_update_kernel_apply'
      && input.provenance.initiator === 'opl_managed_update_kernel';
    const trustedBundledRepair = action === 'repair'
      && input.provenance?.source_policy === 'bundled_full_runtime_modules'
      && input.provenance.trigger === 'agent_package_repair'
      && input.provenance.initiator === 'opl_packages';
    if ((action !== 'install' && !trustedBundledUpdate && !trustedBundledRepair)
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
        bundled_update_provenance_valid: trustedBundledUpdate,
        bundled_repair_provenance_valid: trustedBundledRepair,
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
  const bundledFullRuntimeSourceReconcile = existingLock?.source_kind === 'bundled_full_runtime_modules'
    && options.sourceReconcile === true
    && input.sourceKind === 'first_party_managed_cohort'
    && Boolean(firstPartyOwner)
    && hasResolvedCatalogSelection;
  if (existingLock?.source_kind === 'bundled_full_runtime_modules'
    && !trustedBundledInstall
    && !bundledFullRuntimeSourceReconcile) {
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
      || options.descriptorOwnedFirstPartyAdoption === true
    );
  const firstParty = shouldUseFirstPartyCatalog ? firstPartyOwner : null;
  const rootSourcePolicy = firstParty
    && packageId
    && !trustedBundledInstall
    && !options.preserveInstalledImmutableIdentity
    ? resolveAgentPackageEffectiveSourcePolicy(packageId)
    : null;
  const requestedRootDeveloperCheckoutPath = packageId
    ? input.agentRoots?.[packageId] ?? stringValue(input.agentRoot)
    : null;
  const developerRootSelection = Boolean(
    firstParty
    && rootSourcePolicy?.desired_source_kind === 'developer_checkout_override',
  );
  if (developerRootSelection && !rootSourcePolicy?.developer_checkout_available) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer Mode selected a package checkout that is not available.', {
      package_id: packageId,
      module_id: rootSourcePolicy?.module_id ?? null,
      checkout_path: rootSourcePolicy?.developer_checkout_path ?? null,
      source_policy_reason: rootSourcePolicy?.reason ?? null,
      failure_code: 'agent_package_developer_checkout_unavailable',
    });
  }
  if (developerRootSelection
    && requestedRootDeveloperCheckoutPath
    && rootSourcePolicy?.developer_checkout_path
    && path.resolve(requestedRootDeveloperCheckoutPath) !== path.resolve(rootSourcePolicy.developer_checkout_path)) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party Package developer checkout must match the effective module source policy.', {
      package_id: packageId,
      requested_checkout_path: path.resolve(requestedRootDeveloperCheckoutPath),
      required_checkout_path: path.resolve(rootSourcePolicy.developer_checkout_path),
      source_policy_reason: rootSourcePolicy.reason,
      failure_code: 'first_party_package_developer_checkout_path_mismatch',
    });
  }
  const developerRootSource = developerRootSelection
      ? loadDeveloperCheckoutPackageSource(
        packageId!,
        requestedRootDeveloperCheckoutPath ?? rootSourcePolicy!.developer_checkout_path!,
      )
    : null;
  let catalog = bundledFullRuntimeCatalog?.catalog ?? options.catalog ?? null;
  let rootVersion = bundledFullRuntimeCatalog
    ? selectManagedCatalogPackageVersion(bundledFullRuntimeCatalog.catalog, trustedBundledInstall!.packageId)
    : options.rootVersion ?? null;
  let catalogSource = options.catalogSource
    ?? (trustedBundledInstall ? null : firstParty?.catalogSource ?? null);
  let channelRef = bundledFullRuntimeCatalog?.catalogRef ?? options.channelRef ?? null;
  let channelDigest = bundledFullRuntimeCatalog?.catalogSha256 ?? options.channelDigest ?? null;
  if (firstParty
    && !trustedBundledInstall
    && !developerRootSelection
    && (!catalog || !rootVersion)) {
    const snapshot = await refreshFirstPartyPackageCatalogSnapshot(firstParty.canonicalId);
    catalog = snapshot.catalog;
    rootVersion = ownerPackageCatalogVersion(catalog, firstParty.canonicalId);
    catalogSource = { ...firstParty.catalogSource, catalog_ref: snapshot.catalog_ref };
    channelRef = snapshot.catalog_ref;
    channelDigest = snapshot.catalog_digest;
  }
  if (firstParty && rootVersion && !trustedBundledInstall && !developerRootSelection) {
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
    : developerRootSource
    ? {
        registryUrl: null,
        packageId,
        manifestUrl: developerRootSource.source.owner_manifest_path,
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
    const selectedFirstPartyOwner = nextSelection.packageId
      ? resolveFirstPartyPackageCatalog(nextSelection.packageId)
      : null;
    const selectedSourcePolicy = selectedFirstPartyOwner
      && !trustedBundledInstall
      && !options.preserveInstalledImmutableIdentity
      ? resolveAgentPackageEffectiveSourcePolicy(selectedFirstPartyOwner.canonicalId)
      : null;
    const selectedDeveloperCheckoutPath = selectedSourcePolicy?.desired_source_kind
      === 'developer_checkout_override'
      && selectedSourcePolicy.developer_checkout_available
      ? input.agentRoots?.[selectedFirstPartyOwner!.canonicalId]
        ?? (selectedFirstPartyOwner!.canonicalId === packageId ? stringValue(input.agentRoot) : null)
        ?? selectedSourcePolicy.developer_checkout_path
      : null;
    const selectedDeveloperSource = selectedDeveloperCheckoutPath
      ? developerRootSource?.ownerManifest.package_id === selectedFirstPartyOwner?.canonicalId
        ? developerRootSource
        : loadDeveloperCheckoutPackageSource(
            selectedFirstPartyOwner!.canonicalId,
            selectedDeveloperCheckoutPath,
          )
      : null;
    if (firstParty && catalogVersion && !trustedBundledInstall && !selectedDeveloperSource) {
      assertFirstPartyPackageCatalogVersion(nextSelection.packageId ?? firstParty.canonicalId, catalogVersion);
    }
    const inlinePayload = catalogVersion && !selectedDeveloperSource
      ? catalogManifestPayload(catalogVersion)
      : null;
    const fetched = selectedDeveloperSource
      ? {
          payload: null,
          source_sha256: selectedDeveloperSource.source.owner_manifest_sha256,
        }
      : inlinePayload
      ? {
          payload: inlinePayload,
          source_sha256: catalogVersion!.manifest_sha256.replace(/^sha256:/, ''),
        }
      : await fetchJsonSource(nextSelection.manifestUrl);
    if (catalogVersion
      && !selectedDeveloperSource
      && `sha256:${fetched.source_sha256.replace(/^sha256:/, '')}` !== catalogVersion.manifest_sha256) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog manifest bytes do not match the selected digest.', {
        package_id: nextSelection.packageId,
        package_version: catalogVersion.package_version,
        failure_code: 'agent_package_catalog_manifest_digest_mismatch',
      });
    }
    let manifest = selectedDeveloperSource?.ownerManifest
      ?? normalizePackageManifest(fetched.payload, nextSelection.manifestUrl);
    const manifestFirstPartyOwner = resolveFirstPartyPackageCatalog(manifest.package_id);
    const trustedBundledManifestSelection = Boolean(
      trustedBundledInstall
      && bundledFullRuntimeCatalog?.entries.get(manifest.package_id)?.manifestUrl === nextSelection.manifestUrl,
    );
    const developerSourceSelection = Boolean(
      !trustedBundledManifestSelection
      && resolveAgentPackageEffectiveSourcePolicy(manifest.package_id).desired_source_kind
        === 'developer_checkout_override',
    );
    if (manifestFirstPartyOwner
      && !(firstParty && catalogVersion && catalogSource)
      && !developerSourceSelection
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
    if (catalogVersion && !selectedDeveloperSource && manifest.version !== catalogVersion.package_version) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog selection and package manifest version must match.', {
        package_id: manifest.package_id,
        catalog_package_version: catalogVersion.package_version,
        manifest_package_version: manifest.version,
        failure_code: 'agent_package_catalog_version_mismatch',
      });
    }
    if (catalogVersion?.content_digest
      && !selectedDeveloperSource
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
      manifest = {
        ...manifest,
        managed_update_source: {
          ...catalogSource,
          catalog_ref: packageOwnerChannelRef(catalogVersion) ?? catalogSource.catalog_ref,
        },
      };
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
      const developerSource = selectedDeveloperSource
        ?? loadDeveloperCheckoutPackageSource(
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
      const payloadManifestJson = catalogPayloadManifestJson(catalogVersion)!;
      inlinePayloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-inline-package-payload-'));
      const payloadPath = path.join(inlinePayloadRoot, 'payload.json');
      fs.writeFileSync(payloadPath, payloadManifestJson, 'utf8');
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
        : firstParty && (catalogVersion || developerSourceSelection) ? policySourceKind : input.sourceKind,
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
  if (action !== 'install'
    && !root.previousLock
    && !options.descriptorOwnedFirstPartyAdoption) {
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
    try {
      for (const dependency of prepared.manifest.capability_dependencies) {
        try {
          let dependencySelection: Awaited<ReturnType<typeof resolveManifestSelection>>;
          let catalogVersion: ManagedCatalogVersion | null = null;
          const dependencySourcePolicy = trustedBundledInstall
            ? null
            : resolveAgentPackageEffectiveSourcePolicy(dependency.package_id);
          if (dependencySourcePolicy?.desired_source_kind === 'developer_checkout_override'
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
            catalogVersion = firstParty
              ? ownerPackageCatalogVersion(catalog, dependency.package_id)
              : selectCapabilityCatalogVersion(catalog, dependency);
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
        } catch (error) {
          if (!dependency.required && dependency.dependency_kind === 'optional_enhancement') continue;
          throw error;
        }
      }
      preparedById.set(prepared.manifest.package_id, prepared);
      ordered.push(prepared);
    } finally {
      visiting.delete(prepared.manifest.package_id);
    }
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
    legacySkillMigration = prepareLegacyOplSkillsMigration({
      packageId: root.manifest.package_id,
      requiredSkillIds: root.manifest.required_skill_ids,
      dryRun: input.dryRun === true,
      env: process.env,
    });
    transaction.legacySkillMigration = legacySkillMigration;
    for (const prepared of ordered) {
      const physicalSurface = materializePhysicalCodexSurface(
        prepared.manifest,
        input.dryRun === true,
        {
          keepMigrationIds: input.keepMigrationIds,
          developerCheckoutPayloadFiles: prepared.developerCheckoutPayloadFiles ?? undefined,
          companionNetworkAccess: trustedBundledInstall ? 'forbidden' : undefined,
          transactionId: sha256Text([
            'plugin-generation',
            action,
            prepared.manifest.package_id,
            prepared.manifestSha256,
            prepared.previousLock?.lock_ref ?? '',
          ].join('\n')).slice(0, 24),
        },
      );
      physicalSurfaces.set(
        prepared.manifest.package_id,
        physicalSurface,
      );
      transaction.physicalSurfaces.push(physicalSurface);
    }
    if (!input.dryRun && isOplFlowCoreSkillsTarget({
      packageId: root.manifest.package_id,
      requiredSkillIds: root.manifest.required_skill_ids,
    })) {
      const surface = physicalSurfaces.get(root.manifest.package_id)!;
      const pluginId = surface.plugin_id && surface.marketplace_id
        ? `${surface.plugin_id}@${surface.marketplace_id}`
        : null;
      if (!pluginId || !surface.marketplace_root) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'OPL Flow core Skill migration requires one materialized native carrier.',
          {
            package_id: root.manifest.package_id,
            plugin_id: surface.plugin_id,
            marketplace_id: surface.marketplace_id,
            failure_code: 'opl_flow_legacy_skill_native_readback_failed',
          },
        );
      }
      const carrierReadback = runConfiguredCodexPluginCarrier({
        descriptor: {
          packageId: root.manifest.package_id,
          carrier: {
            kind: 'codex_plugin_manager',
            pluginId,
            marketplaceSource: surface.marketplace_root,
          },
          executor: {
            route: 'codex_cli',
            requiredSkillIds: [...root.manifest.required_skill_ids],
          },
          publicationRef: null,
        },
        action: options.configuredCarrierAction ?? 'list',
      });
      assertOplFlowCoreSkillsCarrierReadback(carrierReadback);
      const expectedPluginSourcePath = surface.marketplace_plugin_path;
      const expectedMarketplaceRoot = surface.marketplace_root;
      if (carrierReadback.installed_version !== root.manifest.version
        || !carrierReadback.plugin_source_path
        || !expectedPluginSourcePath
        || path.resolve(carrierReadback.plugin_source_path) !== path.resolve(expectedPluginSourcePath)
        || !carrierReadback.carrier.marketplace_source
        || !expectedMarketplaceRoot
        || path.resolve(carrierReadback.carrier.marketplace_source) !== path.resolve(expectedMarketplaceRoot)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'OPL Flow native carrier did not reach the exact owner Package target.',
          {
            package_id: root.manifest.package_id,
            target_version: root.manifest.version,
            observed_version: carrierReadback.installed_version,
            target_marketplace_root: expectedMarketplaceRoot,
            observed_marketplace_root: carrierReadback.carrier.marketplace_source,
            target_plugin_source_path: expectedPluginSourcePath,
            observed_plugin_source_path: carrierReadback.plugin_source_path,
            failure_code: 'configured_codex_plugin_carrier_target_currentness_mismatch',
          },
        );
      }
    }
  } catch (error) {
    for (const prepared of [...ordered].reverse()) {
      const surface = physicalSurfaces.get(prepared.manifest.package_id);
      if (surface && !input.dryRun) {
        restorePhysicalCodexSurfaceMutation(surface);
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
      }
    }
    for (const prepared of ordered) {
      if (prepared.previousLock
        && !input.dryRun
        && previousPhysicalSurfaceCanBeRematerialized(prepared.previousLock)) {
        rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
      }
    }
    legacySkillMigration?.rollback();
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
        restorePhysicalCodexSurfaceMutation(surface);
        removePhysicalCodexSurface(surface, false, prepared.manifest.package_id, {
          retainPayloadSource: true,
          retainPluginCache: Boolean(
            surface.codex_plugin_cache_path
            && surface.codex_plugin_cache_path === prepared.previousLock?.physical_surface?.codex_plugin_cache_path,
          ),
        });
        rollbackManagedPolicySurface(surface);
      }
      for (const prepared of ordered) {
        if (prepared.previousLock
          && previousPhysicalSurfaceCanBeRematerialized(prepared.previousLock)) {
          rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
        }
      }
      legacySkillMigration?.rollback();
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
    const resolvedDependencies = prepared.manifest.capability_dependencies.flatMap((dependency) => {
      const providerLock = builtLocks.get(dependency.package_id);
      if (!providerLock) {
        if (!dependency.required && dependency.dependency_kind === 'optional_enhancement') return [];
        throw new FrameworkContractError('contract_shape_invalid', 'Resolved dependency lock is missing from the prepared closure.', {
          package_id: prepared.manifest.package_id,
          dependency_package_id: dependency.package_id,
          failure_code: 'agent_package_dependency_lock_missing',
        });
      }
      return [{
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
      }];
    });
    const carrierAuthority = preparedCarrierAuthority(prepared, channelRef, channelDigest);
    builtLocks.set(prepared.manifest.package_id, buildLock({
      manifest: prepared.manifest,
      manifestUrl: prepared.selection.manifestUrl,
      manifestSha256: prepared.manifestSha256,
      sourceKind: prepared.sourceKind,
      trustTier: prepared.trustTier,
      physicalSurface: physicalSurfaces.get(prepared.manifest.package_id)!,
      previousLock: prepared.previousLock,
      resolvedDependencies,
      managedRuntimeSource: runtimeSourceMutations.get(prepared.manifest.package_id)?.after ?? null,
      sourceArtifactRef: preparedCatalogArtifactRef(prepared),
      artifactDigest: preparedCatalogArtifactDigest(prepared),
      packageContentDigest: prepared.catalogVersion?.package_content_digest
        ?? prepared.previousLock?.package_content_digest
        ?? null,
      ownerSourceCommit: preparedOwnerSourceCommit(prepared),
      carrierAuthority,
      releaseChannelRef: prepared.catalogVersion
        ? preparedReleaseChannelRef(prepared, channelRef)
        : prepared.previousLock?.release_channel_ref ?? null,
      releaseChannelDigest: prepared.catalogVersion
        ? preparedReleaseChannelDigest(prepared, channelDigest)
        : prepared.previousLock?.release_channel_digest ?? null,
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
          restorePhysicalCodexSurfaceMutation(nextLock.physical_surface);
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
        }
        for (const prepared of ordered) {
          if (prepared.previousLock
            && previousPhysicalSurfaceCanBeRematerialized(prepared.previousLock)) {
            rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
          }
        }
        for (const mutation of [...runtimeSourceMutations.values()].reverse()) {
          rollbackManagedRuntimeSourceMutation(mutation);
        }
        legacySkillMigration?.rollback();
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
      releaseChannelRef: prepared.catalogVersion
        ? preparedReleaseChannelRef(prepared, channelRef)
        : prepared.previousLock?.release_channel_ref ?? null,
      releaseChannelDigest: prepared.catalogVersion
        ? preparedReleaseChannelDigest(prepared, channelDigest)
        : prepared.previousLock?.release_channel_digest ?? null,
      networkAccessed: trustedBundledInstall ? false : undefined,
      remoteDependencyPolicy: trustedBundledInstall ? 'forbidden' : undefined,
      provenance: input.provenance,
    });
    Object.assign(lock, {
      dependency_closure_digest: closureDigest,
      dependency_transaction_id: transactionId,
    });
    if (prepared.manifest.package_id === root.manifest.package_id && scopeMaterializations.length > 0) {
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
      writePackageTransaction(nextIndex);
    } catch (error) {
      for (const scopeMaterialization of scopeMaterializations) {
        rollbackCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const scopeMaterialization of retiredScopeMaterializations) {
        rollbackCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const nextLock of [...locks].reverse()) {
        restorePhysicalCodexSurfaceMutation(nextLock.physical_surface);
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
      }
      for (const previousLock of previousLocks) {
        if (previousPhysicalSurfaceCanBeRematerialized(previousLock)) {
          rematerializePhysicalCodexSurfaceFromLock(previousLock, false);
        }
      }
      for (const mutation of [...runtimeSourceMutations.values()].reverse()) {
        rollbackManagedRuntimeSourceMutation(mutation);
      }
      legacySkillMigration?.rollback();
      throw error;
    }
    for (const surface of physicalSurfaces.values()) {
      finalizePhysicalCodexSurfaceMutation(surface);
    }
    for (const mutation of runtimeSourceMutations.values()) {
      finalizeManagedRuntimeSourceMutation(mutation);
    }
    const retainedPhysicalPaths = new Set([
      ...nextIndex.packages,
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
    legacySkillMigration: legacySkillMigration?.commit() ?? null,
  };
}

async function runOplAgentPackageInstallUnlocked(input: AgentPackageInstallInput) {
  const result = await applyManifestPackageLock(input, 'install');

  return agentPackageInstallReadback(input, result);
}

type ConfiguredCarrierSelectionInput =
  | AgentPackageInstallInput
  | AgentPackageRepairInput
  | AgentPackagePackageActionInput;

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

async function resolveFreshConfiguredCarrier(input: ConfiguredCarrierSelectionInput) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const explicitManifestUrl = 'manifestUrl' in input ? stringValue(input.manifestUrl) : null;
  const explicitRegistryUrl = 'registryUrl' in input ? stringValue(input.registryUrl) : null;
  if (
    resolveFirstPartyPackageCatalog(packageId)
    && (explicitManifestUrl || explicitRegistryUrl)
  ) {
    return null;
  }
  if (!explicitManifestUrl && !explicitRegistryUrl) {
    const discovered = discoverInstalledCodexPluginDescriptors({
      packageId,
      failClosedOnCarrierError: true,
    });
    const descriptor = packageId ? discovered.get(packageId) : null;
    if (descriptor) {
      return descriptor.carrier;
    }
    const declaredCarrier = packageId
      ? firstPartyConfiguredCarrierDescriptors().get(packageId) ?? null
      : null;
    if (declaredCarrier && packageId) {
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
      if (!manifest.configured_codex_plugin_carrier) {
        throw new FrameworkContractError('contract_shape_invalid', 'Native carrier owner Package manifest must declare its carrier.', {
          package_id: packageId,
          manifest_url: selected.manifest_url,
          failure_code: 'configured_codex_plugin_carrier_owner_descriptor_missing',
        });
      }
      return manifest.configured_codex_plugin_carrier;
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
  return manifest.configured_codex_plugin_carrier ?? null;
}

function configuredCarrierLifecycleReadback(input: {
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>;
  dryRun: boolean;
  carrier: ConfiguredCodexPluginCarrierReadback;
  target?: {
    currentness: {
      status: 'current' | 'update_available';
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
  return path.isAbsolute(left) && path.isAbsolute(right)
    ? path.resolve(left) === path.resolve(right)
    : left === right;
}

function descriptorOwnedCarrierCurrentness(input: {
  installedVersion: string;
  installedManifestVersion: string;
  installedSourcePath: string;
  readback: ConfiguredCodexPluginCarrierReadback;
  target: ManagedCatalogVersion;
}) {
  const reasons: string[] = [];
  if (input.installedManifestVersion !== input.target.package_version
    || input.readback.installed_version !== input.target.package_version) {
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
  return {
    status: reasons.length === 0 ? 'current' as const : 'update_available' as const,
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

function configuredCarrierDescriptorForManagedResult(
  result: Awaited<ReturnType<typeof applyManifestPackageLock>>,
  target: ManagedCatalogVersion,
): AgentPackageConfiguredCodexPluginCarrierDescriptor {
  const surface = result.physicalSurface;
  if (!surface.plugin_id || !surface.marketplace_id || !surface.marketplace_root) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Managed first-party carrier adoption did not materialize one native carrier route.',
      {
        package_id: result.lock.package_id,
        target_version: target.package_version,
        failure_code: 'configured_codex_plugin_carrier_target_route_missing',
      },
    );
  }
  return {
    packageId: result.lock.package_id,
    carrier: {
      kind: 'codex_plugin_manager',
      pluginId: `${surface.plugin_id}@${surface.marketplace_id}`,
      marketplaceSource: surface.marketplace_root,
    },
    executor: {
      route: 'codex_cli',
      requiredSkillIds: [...result.lock.bundled_required_skill_ids],
    },
    publicationRef: target.source_artifact_ref,
  };
}

function configuredCarrierDescriptorFromLock(lock: AgentPackageLock) {
  const surface = lock.physical_surface;
  if (!surface?.plugin_id || !surface.marketplace_id || !surface.marketplace_root) return null;
  return {
    packageId: lock.package_id,
    carrier: {
      kind: 'codex_plugin_manager' as const,
      pluginId: `${surface.plugin_id}@${surface.marketplace_id}`,
      marketplaceSource: surface.marketplace_root,
    },
    executor: {
      route: 'codex_cli' as const,
      requiredSkillIds: [...lock.bundled_required_skill_ids],
    },
    publicationRef: lock.source_artifact_ref ?? lock.release_channel_ref ?? null,
  } satisfies AgentPackageConfiguredCodexPluginCarrierDescriptor;
}

function requiresManagedFirstPartyCarrierCurrentness(packageId: string) {
  if (firstPartyConfiguredCarrierDescriptors().has(packageId)) return false;
  const installed = discoverInstalledCodexPluginDescriptors({
    packageId,
    failClosedOnCarrierError: true,
  }).get(packageId) ?? null;
  if (!installed) return false;
  const marketplaceSource = installed.carrier.carrier.marketplaceSource;
  if (!marketplaceSource || !path.isAbsolute(marketplaceSource)) return false;
  const selector = installed.carrier.carrier.pluginId;
  const separator = selector.lastIndexOf('@');
  if (separator <= 0) return false;
  const pluginId = selector.slice(0, separator);
  // A `<plugin>-local` selector is the repository's raw developer marketplace.
  // Any other first-party selector without a Framework-declared owner carrier
  // is a compiled projection and must follow the live Package owner channel.
  return selector !== `${pluginId}@${pluginId}-local`;
}

async function maybeRunDescriptorOwnedFirstPartyLifecycle(input: {
  selectionInput: AgentPackageInstallInput | AgentPackageRepairInput;
  action: 'update' | 'repair';
  index: AgentPackageLockIndex;
}) {
  const packageId = canonicalAgentPackageId(input.selectionInput.packageId);
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  if (!packageId || !firstParty || input.index.packages.some((entry) => entry.package_id === packageId)) {
    return null;
  }
  if (!requiresManagedFirstPartyCarrierCurrentness(packageId)) return null;
  const sourcePolicy = resolveAgentPackageEffectiveSourcePolicy(packageId);
  if (sourcePolicy.desired_source_kind !== 'first_party_managed_cohort') return null;
  assertFirstPartyPackageUpdateSelection(input.selectionInput, firstParty, sourcePolicy);
  const installed = discoverInstalledCodexPluginDescriptors({
    packageId,
    failClosedOnCarrierError: true,
  }).get(packageId) ?? null;
  if (!installed) return null;

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
  const targetDescriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor = {
    ...installed.carrier,
    executor: {
      ...installed.carrier.executor,
      requiredSkillIds: [...targetManifest.required_skill_ids],
    },
    publicationRef: targetVersion.source_artifact_ref,
  };
  const observed = runConfiguredCodexPluginCarrier({
    descriptor: targetDescriptor,
    action: 'list',
  });
  const currentness = descriptorOwnedCarrierCurrentness({
    installedVersion: installed.manifest.version,
    installedManifestVersion: installed.manifest.version,
    installedSourcePath: installed.sourcePath,
    readback: observed,
    target: targetVersion,
  });
  const targetReadback = {
    currentness,
    sourceArtifactRef: targetVersion.source_artifact_ref,
    catalogRef: snapshot.catalog_ref,
    catalogDigest: snapshot.catalog_digest,
    catalogFreshness: snapshot.freshness,
    checkedAt: snapshot.checked_at,
  };

  if (currentness.status === 'current') {
    if (input.action === 'update') {
      return {
        version: 'g2',
        opl_agent_package_update: {
          surface_kind: 'opl_agent_package_update',
          status: input.selectionInput.dryRun === true ? 'validated_no_write' : 'current_noop',
          dry_run: input.selectionInput.dryRun === true,
          package_id: packageId,
          configured_carrier: observed,
          currentness,
          reconciliation_action: null,
          target_version: targetVersion.package_version,
          observed_version: observed.installed_version,
          target_manifest_sha256: targetVersion.manifest_sha256,
          target_content_digest: targetVersion.content_digest,
          target_artifact_digest: targetVersion.artifact_digest,
          target_source_artifact_ref: targetVersion.source_artifact_ref,
          release_catalog_ref: snapshot.catalog_ref,
          release_catalog_digest: snapshot.catalog_digest,
          release_catalog_freshness: snapshot.freshness,
          release_catalog_checked_at: snapshot.checked_at,
          authority_boundary: refsOnlyAuthorityBoundary(),
        },
      };
    }
    const execution = runConfiguredCodexPluginCarrierWithLegacyOplSkillsMigration({
      descriptor: targetDescriptor,
      action: 'repair',
      dryRun: input.selectionInput.dryRun === true,
    });
    return {
      version: 'g2',
      opl_agent_package_repair: {
        surface_kind: 'opl_agent_package_repair',
        ...configuredCarrierLifecycleReadback({
          action: 'repair',
          dryRun: input.selectionInput.dryRun === true,
          carrier: execution.carrier,
          target: targetReadback,
        }),
      },
    };
  }

  const closureTargets = firstPartyCatalogClosure(snapshot.catalog, packageId, targetVersion);
  const closureCurrentness = agentPackageClosureTargetCurrentness(input.index.packages, closureTargets);
  const applied = await applyManifestPackageLock(
    { ...input.selectionInput, packageId },
    input.action,
    {
      catalog: snapshot.catalog,
      rootVersion: targetVersion,
      catalogSource: firstParty.catalogSource,
      channelRef: snapshot.catalog_ref,
      channelDigest: snapshot.catalog_digest,
      descriptorOwnedFirstPartyAdoption: true,
      configuredCarrierAction: input.action,
    },
  );
  const reconciliation = {
    action: input.action === 'update' ? 'update' as const : null,
    currentness,
    closureCurrentness,
    sourcePolicy,
    targetIdentity: {
      packageVersion: targetVersion.package_version,
      manifestSha256: targetVersion.manifest_sha256,
      contentDigest: targetVersion.content_digest,
      artifactDigest: targetVersion.artifact_digest,
      sourceArtifactRef: targetVersion.source_artifact_ref,
    },
    catalogRef: snapshot.catalog_ref,
    catalogDigest: snapshot.catalog_digest,
    catalogFreshness: snapshot.freshness,
    checkedAt: snapshot.checked_at,
  };
  const configuredCarrier = input.selectionInput.dryRun === true
    ? observed
    : runConfiguredCodexPluginCarrier({
        descriptor: configuredCarrierDescriptorForManagedResult(applied, targetVersion),
        action: 'list',
      });
  if (input.action === 'update') {
    const readback = agentPackageUpdateReadback(input.selectionInput, applied, reconciliation);
    return {
      ...readback,
      opl_agent_package_update: {
        ...readback.opl_agent_package_update,
        configured_carrier: configuredCarrier,
        observed_version: configuredCarrier.installed_version,
      },
    };
  }
  const readback = packageRepairResult(
    input.selectionInput as AgentPackageRepairInput,
    applied,
  );
  return {
    ...readback,
    opl_agent_package_repair: {
      ...readback.opl_agent_package_repair,
      configured_carrier: configuredCarrier,
      currentness,
      target_version: targetVersion.package_version,
      observed_version: configuredCarrier.installed_version,
      target_manifest_sha256: targetVersion.manifest_sha256,
      target_content_digest: targetVersion.content_digest,
      target_artifact_digest: targetVersion.artifact_digest,
      target_source_artifact_ref: targetVersion.source_artifact_ref,
      release_catalog_ref: snapshot.catalog_ref,
      release_catalog_digest: snapshot.catalog_digest,
      release_catalog_freshness: snapshot.freshness,
      release_catalog_checked_at: snapshot.checked_at,
    },
  };
}

async function maybeRunConfiguredCarrierLifecycle(input: {
  selectionInput: ConfiguredCarrierSelectionInput;
  action: Exclude<ConfiguredCodexPluginCarrierAction, 'list'>;
}) {
  const packageId = canonicalAgentPackageId(input.selectionInput.packageId);
  let managedFirstPartyLockPresent = false;
  if (packageId && resolveFirstPartyPackageCatalog(packageId)) {
    try {
      const currentCodexHome = path.resolve(resolveCodexHome());
      managedFirstPartyLockPresent = readLockIndex().packages.some(
        (entry) => {
          if (entry.package_id !== packageId) return false;
          const lockCodexHome = stringValue(entry.physical_surface?.codex_home);
          return lockCodexHome === null || path.resolve(lockCodexHome) === currentCodexHome;
        },
      );
    } catch (error) {
      if (!isCorruptLegacyLockAuthority(error) || !canProjectDescriptorsWithCorruptLock(error)) {
        throw error;
      }
    }
  }
  if (
    packageId
    && (input.action === 'update' || input.action === 'repair' || input.action === 'remove')
    && managedFirstPartyLockPresent
  ) {
    return null;
  }
  if (packageId
    && resolveFirstPartyPackageCatalog(packageId)
    && (input.action === 'update' || input.action === 'repair')
    && requiresManagedFirstPartyCarrierCurrentness(packageId)
    && resolveAgentPackageEffectiveSourcePolicy(packageId).desired_source_kind
      === 'first_party_managed_cohort') {
    return null;
  }
  const selected = await resolveFreshConfiguredCarrier(input.selectionInput);
  if (!selected) return null;
  const dryRun = input.selectionInput.dryRun === true;
  const execution = runConfiguredCodexPluginCarrierWithLegacyOplSkillsMigration({
    descriptor: configuredCarrierTargetDescriptor(selected, input.action),
    action: input.action,
    dryRun,
  });
  return {
    ...configuredCarrierLifecycleReadback({
      action: input.action,
      dryRun,
      carrier: execution.carrier,
    }),
  };
}

export async function runOplAgentPackageInstall(input: AgentPackageInstallInput) {
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'install',
  });
  if (configured) {
    return {
      version: 'g2',
      opl_agent_package_install: {
        surface_kind: 'opl_agent_package_install',
        ...configured,
      },
    };
  }
  if (
    !input.manifestUrl
    && !input.registryUrl
    && input.packageId
    && !input.agentRoot
    && process.env.OPL_FULL_RUNTIME_HOME
  ) {
    const packageId = canonicalAgentPackageId(input.packageId);
    const firstParty = resolveFirstPartyPackageCatalog(packageId);
    if (packageId && firstParty) {
      const catalog = readBundledFullRuntimePackageCatalog();
      const selection = resolveBundledFullRuntimePackageClosureRoots({
        catalog,
        rootPackageId: packageId,
      });
      return runOplBundledFullRuntimeAgentPackageInstall({
        packageId,
        agentRoot: selection.packageRoots[packageId],
        packageRoots: selection.packageRoots,
        dryRun: input.dryRun === true,
      });
    }
  }
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
      package_id: result.lock.package_id,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      framework_link: result.frameworkLink,
      lifecycle_receipt: result.receipt,
      dependency_transaction_id: result.dependencyTransactionId,
      dependency_closure_digest: result.dependencyClosureDigest,
      dependency_package_locks: result.closureLocks,
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
  extraTargetPaths?: string[];
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
    ...affectedLocks.flatMap(managedBundledLockSnapshotPaths),
    ...(input.extraTargetPaths ?? []),
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

function bundledFullRuntimeRepairFailure(
  message: string,
  details: Record<string, unknown>,
  failureCode: string,
) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    mutation_started: false,
    failure_code: failureCode,
  });
}

function pathContainsPath(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateBundledFullRuntimeRepairSource(
  input: AgentPackageRepairInput,
  lock: AgentPackageLock,
): BundledFullRuntimeRepairSourceValidation {
  const sourceRoot = stringValue(input.agentRoot);
  const managedSource = lock.managed_runtime_source;
  const carrier = lock.runtime_source_carrier;
  const expectedOwnerSourceCommit = lock.owner_source_commit ?? null;
  if (!sourceRoot || !managedSource || !carrier
    || managedSource.source_mode !== 'bundled_full_runtime'
    || !/^[0-9a-f]{40}$/.test(expectedOwnerSourceCommit ?? '')
    || managedSource.source_git_head_sha !== expectedOwnerSourceCommit
    || lock.carrier_authority?.verified_source_commit !== expectedOwnerSourceCommit) {
    throw bundledFullRuntimeRepairFailure(
      'Bundled Full runtime repair requires an installed immutable lock and an explicit source root.',
      {
        package_id: lock.package_id,
        source_root_present: Boolean(sourceRoot),
        managed_runtime_source_present: Boolean(managedSource),
        runtime_source_carrier_present: Boolean(carrier),
        source_mode: managedSource?.source_mode ?? null,
        lock_owner_source_commit: expectedOwnerSourceCommit,
        managed_source_commit: managedSource?.source_git_head_sha ?? null,
        carrier_source_commit: lock.carrier_authority?.verified_source_commit ?? null,
      },
      'agent_package_bundled_full_runtime_repair_lock_invalid',
    );
  }
  const sourcePath = path.resolve(sourceRoot);
  const targetPath = path.resolve(managedSource.checkout_path);
  const sourceStat = lstatOrNull(sourcePath);
  const targetStat = lstatOrNull(targetPath);
  if (!sourceStat?.isDirectory() || sourceStat.isSymbolicLink()
    || !targetStat?.isDirectory() || targetStat.isSymbolicLink()) {
    throw bundledFullRuntimeRepairFailure(
      'Bundled Full runtime repair requires physical non-symbolic-link source and target directories.',
      {
        package_id: lock.package_id,
        source_root: sourcePath,
        target_root: targetPath,
        source_directory: sourceStat?.isDirectory() ?? false,
        source_symbolic_link: sourceStat?.isSymbolicLink() ?? false,
        target_directory: targetStat?.isDirectory() ?? false,
        target_symbolic_link: targetStat?.isSymbolicLink() ?? false,
      },
      'agent_package_bundled_full_runtime_repair_source_unsafe',
    );
  }
  const realSourcePath = fs.realpathSync.native(sourcePath);
  const realTargetPath = fs.realpathSync.native(targetPath);
  if (pathContainsPath(realSourcePath, realTargetPath)
    || pathContainsPath(realTargetPath, realSourcePath)) {
    throw bundledFullRuntimeRepairFailure(
      'Bundled Full runtime repair source must be independent from the installed target.',
      {
        package_id: lock.package_id,
        source_root: sourcePath,
        target_root: targetPath,
      },
      'agent_package_bundled_full_runtime_repair_source_overlaps_target',
    );
  }
  const spec = resolveOplDomainModuleSpec(managedSource.module_id);
  const sourceMarker = readPackagedModuleMarker(sourcePath, spec);
  const targetMarker = readPackagedModuleMarker(targetPath, spec);
  const sourceTreeSha256 = computePackageChannelTreeSha256(sourcePath);
  const targetTreeSha256 = computePackageChannelTreeSha256(targetPath);
  const expectedTreeSha256 = managedSource.tree_sha256;
  if (sourceMarker?.source_kind !== 'full_runtime'
    || sourceMarker.source_git.head_sha !== expectedOwnerSourceCommit
    || sourceTreeSha256 !== expectedTreeSha256) {
    throw bundledFullRuntimeRepairFailure(
      'Bundled Full runtime repair source does not match the installed immutable lock identity.',
      {
        package_id: lock.package_id,
        module_id: managedSource.module_id,
        source_root: sourcePath,
        target_root: targetPath,
        expected_tree_sha256: expectedTreeSha256,
        actual_source_tree_sha256: sourceTreeSha256,
        expected_owner_source_commit: expectedOwnerSourceCommit,
        actual_source_owner_source_commit: sourceMarker?.source_git.head_sha ?? null,
        source_kind: sourceMarker?.source_kind ?? null,
      },
      'agent_package_bundled_full_runtime_repair_source_identity_mismatch',
    );
  }
  return {
    packageId: lock.package_id,
    sourceRoot: sourcePath,
    targetRoot: targetPath,
    moduleId: managedSource.module_id,
    expectedTreeSha256,
    sourceTreeSha256,
    targetTreeSha256,
    expectedOwnerSourceCommit,
    sourceOwnerSourceCommit: sourceMarker.source_git.head_sha!,
    targetOwnerSourceCommit: targetMarker?.source_git.head_sha ?? null,
  };
}

function bundledFullRuntimeRepairReadback(
  input: AgentPackageRepairInput,
  lock: AgentPackageLock,
  validation: BundledFullRuntimeRepairSourceValidation,
) {
  const receipt = lifecycleReceipt({
    action: 'repair',
    actionStatus: 'validated',
    packageId: lock.package_id,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: sha256Text([
      'bundled-full-runtime-repair-source',
      validation.sourceRoot,
      validation.sourceTreeSha256,
      validation.sourceOwnerSourceCommit,
    ].join('\n')),
    writesPerformed: false,
    physicalSurface: lock.physical_surface,
    managedRuntimeSource: lock.managed_runtime_source,
    sourceArtifactRef: lock.source_artifact_ref ?? null,
    artifactDigest: lock.artifact_digest ?? null,
    ownerSourceCommit: lock.owner_source_commit ?? null,
    carrierAuthority: lock.carrier_authority ?? null,
    releaseChannelRef: lock.release_channel_ref ?? null,
    releaseChannelDigest: lock.release_channel_digest ?? null,
  });
  return {
    version: 'g2',
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair',
      status: 'validated_no_write',
      dry_run: true,
      package_lock: lock,
      physical_surface: lock.physical_surface,
      framework_link: null,
      lifecycle_receipt: receipt,
      repair_source_validation: {
        status: 'validated_no_write',
        source_role: 'source_only',
        target_role: 'existing_lock_checkout',
        source_root: validation.sourceRoot,
        target_root: validation.targetRoot,
        expected_tree_sha256: validation.expectedTreeSha256,
        source_tree_sha256: validation.sourceTreeSha256,
        target_tree_sha256: validation.targetTreeSha256,
        expected_owner_source_commit: validation.expectedOwnerSourceCommit,
        source_owner_source_commit: validation.sourceOwnerSourceCommit,
        target_owner_source_commit: validation.targetOwnerSourceCommit,
        source_adopted_as_target: false,
        mutation_started: false,
        writes_performed: false,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

function verifyBundledFullRuntimeRepairTarget(
  lock: AgentPackageLock,
  validation: BundledFullRuntimeRepairSourceValidation,
) {
  const state = lock.managed_runtime_source;
  const spec = resolveOplDomainModuleSpec(validation.moduleId);
  const marker = readPackagedModuleMarker(validation.targetRoot, spec);
  const actualTreeSha256 = computePackageChannelTreeSha256(validation.targetRoot);
  const readiness = managedRuntimeSourceReadiness(state, lock.runtime_source_carrier);
  const mismatches = [
    state?.source_mode === 'bundled_full_runtime' ? null : 'source_mode',
    state && path.resolve(state.checkout_path) === validation.targetRoot ? null : 'checkout_path',
    state?.tree_sha256 === validation.expectedTreeSha256 ? null : 'lock_tree_sha256',
    actualTreeSha256 === validation.expectedTreeSha256 ? null : 'actual_tree_sha256',
    state?.source_git_head_sha === validation.expectedOwnerSourceCommit ? null : 'lock_source_commit',
    marker?.source_git.head_sha === validation.expectedOwnerSourceCommit ? null : 'marker_source_commit',
    lock.owner_source_commit === validation.expectedOwnerSourceCommit ? null : 'owner_source_commit',
    lock.carrier_authority?.verified_source_commit === validation.expectedOwnerSourceCommit
      ? null
      : 'carrier_source_commit',
    readiness.status === 'current' ? null : 'runtime_source_status',
    readiness.operational_ready ? null : 'runtime_source_operational_ready',
  ].filter((entry): entry is string => entry !== null);
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Full runtime repair final verification did not prove the installed target current.',
      {
        package_id: lock.package_id,
        source_root: validation.sourceRoot,
        target_root: validation.targetRoot,
        expected_tree_sha256: validation.expectedTreeSha256,
        actual_tree_sha256: actualTreeSha256,
        expected_owner_source_commit: validation.expectedOwnerSourceCommit,
        actual_marker_source_commit: marker?.source_git.head_sha ?? null,
        runtime_source_readiness: readiness,
        mismatches,
        mutation_started: true,
        failure_code: 'agent_package_bundled_full_runtime_repair_final_verification_failed',
      },
    );
  }
  return readiness;
}

async function runOplBundledFullRuntimeAgentPackageRepairUnlocked(
  input: AgentPackageRepairInput,
  originalIndex: AgentPackageLockIndex,
  lock: AgentPackageLock,
) {
  const validation = validateBundledFullRuntimeRepairSource(input, lock);
  const catalog = readBundledFullRuntimePackageCatalog();
  const packageRoots = { [lock.package_id]: validation.targetRoot };
  assertBundledFullRuntimePackageRoots({
    catalog,
    rootPackageId: lock.package_id,
    packageRoots,
  });
  if (input.dryRun) return bundledFullRuntimeRepairReadback(input, lock, validation);

  const catalogEntry = catalog.entries.get(lock.package_id)!;
  const firstParty = resolveFirstPartyPackageCatalog(lock.package_id)!;
  const transactionId = sha256Text([
    'bundled-full-runtime-owner-repair',
    lock.package_id,
    lock.lock_ref,
    validation.sourceTreeSha256,
    validation.expectedOwnerSourceCommit,
  ].join('\n')).slice(0, 24);
  const stageRoot = `${validation.targetRoot}.opl-package-repair-stage-${transactionId}`;
  const displacedRoot = `${validation.targetRoot}.opl-package-repair-displaced-${transactionId}`;
  if (fs.existsSync(stageRoot) || fs.existsSync(displacedRoot)) {
    throw bundledFullRuntimeRepairFailure(
      'Bundled Full runtime repair found unresolved package-local transaction residue.',
      {
        package_id: lock.package_id,
        stage_root: stageRoot,
        displaced_root: displacedRoot,
        stage_root_present: fs.existsSync(stageRoot),
        displaced_root_present: fs.existsSync(displacedRoot),
      },
      'agent_package_bundled_full_runtime_repair_residue_present',
    );
  }
  if (path.resolve(validation.sourceRoot) === path.resolve(stageRoot)
    || path.resolve(validation.sourceRoot) === path.resolve(displacedRoot)) {
    throw bundledFullRuntimeRepairFailure(
      'Bundled Full runtime repair source collides with a reserved transaction path.',
      {
        package_id: lock.package_id,
        source_root: validation.sourceRoot,
        stage_root: stageRoot,
        displaced_root: displacedRoot,
      },
      'agent_package_bundled_full_runtime_repair_source_unsafe',
    );
  }

  const snapshot = captureBundledFullRuntimePackageSnapshot({
    index: originalIndex,
    rootPackageId: lock.package_id,
    prospectiveLocks: [lock],
    extraTargetPaths: [validation.targetRoot],
  });
  let targetReplaced = false;
  try {
    copyBundledFullRuntimeSnapshotPath(validation.sourceRoot, stageRoot);
    const stagedMarker = readPackagedModuleMarker(
      stageRoot,
      resolveOplDomainModuleSpec(validation.moduleId),
    );
    const stagedTreeSha256 = computePackageChannelTreeSha256(stageRoot);
    if (stagedMarker?.source_kind !== 'full_runtime'
      || stagedMarker.source_git.head_sha !== validation.expectedOwnerSourceCommit
      || stagedTreeSha256 !== validation.expectedTreeSha256) {
      throw bundledFullRuntimeRepairFailure(
        'Bundled Full runtime repair staging changed the immutable source identity.',
        {
          package_id: lock.package_id,
          stage_root: stageRoot,
          expected_tree_sha256: validation.expectedTreeSha256,
          actual_tree_sha256: stagedTreeSha256,
          expected_owner_source_commit: validation.expectedOwnerSourceCommit,
          actual_owner_source_commit: stagedMarker?.source_git.head_sha ?? null,
        },
        'agent_package_bundled_full_runtime_repair_stage_identity_mismatch',
      );
    }
    fs.renameSync(validation.targetRoot, displacedRoot);
    fs.renameSync(stageRoot, validation.targetRoot);
    targetReplaced = true;

    const provenance = {
      trigger: 'agent_package_repair',
      initiator: 'opl_packages',
      source_policy: 'bundled_full_runtime_modules',
      source_policy_reason: 'explicit_source_matches_installed_bundled_identity',
      operation_id: transactionId,
      correlation_id: transactionId,
    } satisfies AgentPackageInstallInput['provenance'];
    const lifecycleInput: AgentPackageInstallInput = {
      packageId: lock.package_id,
      manifestUrl: catalogEntry.manifestUrl,
      trustTier: firstParty.trustTier,
      sourceKind: 'bundled_full_runtime_modules',
      agentRoot: validation.targetRoot,
      dryRun: false,
      provenance,
    };
    const result = await applyManifestPackageLock(lifecycleInput, 'repair', {
      trustedBundledFullRuntimeInstall: {
        packageId: lock.package_id,
        agentRoot: validation.targetRoot,
        packageRoots,
      },
    });
    const readiness = verifyBundledFullRuntimeRepairTarget(result.lock, validation);
    fs.rmSync(displacedRoot, { recursive: true, force: true });
    const readback = packageRepairResult(input, result);
    return {
      ...readback,
      opl_agent_package_repair: {
        ...readback.opl_agent_package_repair,
        repair_source_validation: {
          status: 'completed',
          source_role: 'source_only',
          target_role: 'existing_lock_checkout',
          source_root: validation.sourceRoot,
          target_root: validation.targetRoot,
          expected_tree_sha256: validation.expectedTreeSha256,
          source_tree_sha256: validation.sourceTreeSha256,
          actual_tree_sha256: readiness.actual_tree_sha256,
          expected_owner_source_commit: validation.expectedOwnerSourceCommit,
          source_owner_source_commit: validation.sourceOwnerSourceCommit,
          target_owner_source_commit: result.lock.managed_runtime_source?.source_git_head_sha ?? null,
          source_adopted_as_target: false,
          mutation_started: true,
          writes_performed: true,
          runtime_source_readiness: readiness,
        },
      },
    };
  } catch (error) {
    try {
      rollbackBundledFullRuntimePackage(snapshot);
    } catch (rollbackError) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Bundled Full runtime repair failed and its package-local prestate could not be proven restored.',
        {
          package_id: lock.package_id,
          source_root: validation.sourceRoot,
          target_root: validation.targetRoot,
          local_prestate_restored: false,
          mutation_started: targetReplaced,
          original_error: error instanceof FrameworkContractError
            ? error.toJSON()
            : { message: error instanceof Error ? error.message : String(error) },
          rollback_error: rollbackError instanceof FrameworkContractError
            ? rollbackError.toJSON()
            : { message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) },
          failure_code: 'agent_package_bundled_full_runtime_repair_rollback_failed',
        },
      );
    }
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Full runtime repair failed and restored its live target and package-local prestate.',
      {
        package_id: lock.package_id,
        source_root: validation.sourceRoot,
        target_root: validation.targetRoot,
        local_prestate_restored: true,
        mutation_started: targetReplaced,
        original_error: error instanceof FrameworkContractError
          ? error.toJSON()
          : { message: error instanceof Error ? error.message : String(error) },
        failure_code: 'agent_package_bundled_full_runtime_repair_rolled_back',
      },
    );
  } finally {
    makeBundledFullRuntimeSnapshotPathWritable(stageRoot);
    makeBundledFullRuntimeSnapshotPathWritable(displacedRoot);
    fs.rmSync(stageRoot, { recursive: true, force: true });
    fs.rmSync(displacedRoot, { recursive: true, force: true });
    cleanupBundledFullRuntimePackageSnapshot(snapshot);
  }
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

function tryBundledFullRuntimePackagePresenceReadback(
  input: AgentPackageInstallInput,
) {
  const packageId = canonicalAgentPackageId(stringValue(input.packageId));
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  if (packageId && firstParty) {
    const { index } = readRecoveredLockIndex(true);
    const lock = index.packages.find((entry) => entry.package_id === packageId) ?? null;
    if (!lock) return null;
    if (lock.source_kind === 'bundled_full_runtime_modules') {
      const runtimeSourceReadiness = managedRuntimeSourceReadiness(
        lock.managed_runtime_source,
        lock.runtime_source_carrier,
      );
      if (!runtimeSourceReadiness.operational_ready) return null;
      const catalog = readBundledFullRuntimePackageCatalog();
      const selection = resolveBundledFullRuntimePackageClosureRoots({
        catalog,
        rootPackageId: packageId,
      });
      const installedById = new Map(index.packages.map((entry) => [entry.package_id, entry]));
      const closureLocks = selection.closure.flatMap((selectedPackageId) => {
        const installed = installedById.get(selectedPackageId);
        return installed ? [installed] : [];
      });
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
        carrierEnsure: {
          surface_kind: 'opl_package_carrier_ensure.v1',
          status: 'present',
          mode: 'package_local_required_presence',
          root_package_id: packageId,
          selected_package_ids: selection.closure,
          items: selection.closure.map((selectedPackageId) => ({
            package_id: selectedPackageId,
            status: 'present',
            carrier: 'app_managed_runtime',
            package_root: selection.packageRoots[selectedPackageId],
          })),
          version_gate_applied: false,
          content_digest_gate_applied: false,
          writes_performed: false,
        },
      });
    }
  }
  return null;
}

async function runOplAgentPackageUpdateUnlocked(
  input: AgentPackageInstallInput,
  runtime: { catalogFetchTimeoutMs?: number } = {},
) {
  const bundledPresence = tryBundledFullRuntimePackagePresenceReadback(input);
  if (bundledPresence) return bundledPresence;

  const packageId = canonicalAgentPackageId(stringValue(input.packageId));
  const firstParty = resolveFirstPartyPackageCatalog(packageId);
  if (packageId && firstParty) {
    const { index } = readRecoveredLockIndex(true);
    const installed = index.packages.find((entry) => entry.package_id === packageId) ?? null;
    if (!installed) {
      const descriptorOwned = await maybeRunDescriptorOwnedFirstPartyLifecycle({
        selectionInput: input,
        action: 'update',
        index,
      });
      if (descriptorOwned) return descriptorOwned;
    }
    const { lock } = requireInstalledPackage(index, packageId, 'update');
    const sourcePolicy = resolveAgentPackageEffectiveSourcePolicy(packageId);
    assertFirstPartyPackageUpdateSelection(input, firstParty, sourcePolicy);
    const developerRoot = sourcePolicy.desired_source_kind === 'developer_checkout_override';
    const catalogSnapshot = developerRoot
      ? null
      : await resolveFirstPartyPackageCatalogSnapshot({
          refresh: true,
          packageId,
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
      : ownerPackageCatalogVersion(catalogSnapshot!.catalog, packageId);
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
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'update',
  });
  if (configured) {
    return {
      version: 'g2',
      opl_agent_package_update: {
        surface_kind: 'opl_agent_package_update',
        ...configured,
      },
    };
  }
  const bundledPresence = tryBundledFullRuntimePackagePresenceReadback(input);
  if (bundledPresence) return bundledPresence;
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    () => runOplAgentPackageUpdateUnlocked(input),
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
      dependency_transaction_id: result.dependencyTransactionId,
      dependency_closure_digest: result.dependencyClosureDigest,
      dependency_package_locks: result.closureLocks,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

async function runOplAgentPackageRepairUnlocked(input: AgentPackageRepairInput) {
  const packageId = requirePackageId(input.packageId, 'repair');
  const { index } = readRecoveredLockIndex(input.dryRun === true);
  if (!index.packages.some((entry) => entry.package_id === packageId)) {
    const descriptorOwned = await maybeRunDescriptorOwnedFirstPartyLifecycle({
      selectionInput: input,
      action: 'repair',
      index,
    });
    if (descriptorOwned) return descriptorOwned;
  }
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'repair');
  if (lock.source_kind === 'bundled_full_runtime_modules' && stringValue(input.agentRoot)) {
    return runOplBundledFullRuntimeAgentPackageRepairUnlocked(input, index, lock);
  }
  if (
    (lock.capability_dependencies ?? []).length > 0
    || lock.runtime_source_carrier
    || lock.source_kind === 'first_party_managed_cohort'
    || lock.source_kind === 'bundled_full_runtime_modules'
    || stringValue(input.manifestUrl)
    || stringValue(input.registryUrl)
  ) {
    const repairCatalog = lock.source_kind === 'first_party_managed_cohort'
      ? installedImmutableRepairCatalog(index, lock)
      : null;
    const result = await applyManifestPackageLock(
      { ...input, packageId },
      'repair',
      repairCatalog
        ? { ...repairCatalog, preserveInstalledImmutableIdentity: true }
        : {},
    );
    return packageRepairResult(input, result);
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
    physical_surface: physicalSurface.status === 'not_requested' ? lock.physical_surface : physicalSurface,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = repairedLock;
    writePackageTransaction(index);
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
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageRepair(input: AgentPackageRepairInput) {
  const configured = await maybeRunConfiguredCarrierLifecycle({
    selectionInput: input,
    action: 'repair',
  });
  if (configured) {
    await maybeRetireDescriptorOwnedLegacyState({
      configured,
      dryRun: input.dryRun === true,
    });
    return {
      version: 'g2',
      opl_agent_package_repair: {
        surface_kind: 'opl_agent_package_repair',
        ...configured,
      },
    };
  }
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => await runOplAgentPackageRepairUnlocked(input),
  );
}

function missingDependencyProviderIsOptional(
  lock: AgentPackageLock,
  packageId: string,
) {
  const declared = lock.capability_dependencies.find((entry) => entry.package_id === packageId);
  const resolved = lock.resolved_dependencies.find((entry) => entry.package_id === packageId);
  return declared?.required === false
    && (declared.dependency_kind === undefined || declared.dependency_kind === 'optional_enhancement')
    && (!resolved || (
      resolved.required === false
      && (resolved.dependency_kind === undefined || resolved.dependency_kind === 'optional_enhancement')
    ));
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
    activationReceipt.scope_materialization = materializations[0];
    activationReceipt.scope_materializations = materializations;
  }
  const activatedLock: AgentPackageLock = activationReceipt
    ? {
        ...lock,
        updated_at: input.dryRun ? lock.updated_at : nowIso(),
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
    source_selection: 'installed_package_lock' as const,
    network_accessed: false as const,
    remote_dependency_policy: 'forbidden' as const,
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
  if (!input.dryRun) {
    try {
      writePackageTransaction(nextIndex);
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
  };
}

export async function ensureOplAgentPackageScopeActivation(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const targetRoot = packageScopeTarget(input);
  if (!input.scope || !targetRoot) {
    throw new FrameworkContractError('cli_usage_error', 'Package scope activation requires workspace or quest target.', {
      package_id: packageId,
      failure_code: 'agent_package_scope_target_required',
    });
  }
  const nativeActivationReadback = packageStatusForActivation({
    packageId,
    scope: input.scope,
    targetWorkspace: input.targetWorkspace,
    targetQuest: input.targetQuest,
  });
  const nativeStatus = nativeActivationReadback.packageStatus;
  const nativeCarrierState = packageNativeCarrierActivationState(
    nativeStatus,
    nativeActivationReadback.managedLock,
  );
  if (nativeCarrierState === 'ready') {
    return {
      status: input.dryRun ? 'validated_no_write' : 'already_activated',
      package_id: packageId,
      writes_performed: false,
      package_status: nativeStatus,
    };
  }
  if (nativeCarrierState === 'blocked') {
    throwNativeCarrierActivationBlocked(packageId, nativeStatus);
  }
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => {
      const beforeStatus = runOplAgentPackageStatus({
        packageId,
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
            package_id: packageId,
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
  const nativeCarrierState = packageNativeCarrierActivationState(
    beforeStatus,
    nativeActivationReadback.managedLock,
  );
  if (nativeCarrierState === 'ready') {
    return {
      version: 'g2',
      opl_agent_package_activation: {
        surface_kind: 'opl_agent_package_activation',
        status: input.dryRun ? 'validated_no_write' : 'already_activated',
        package_id: packageId,
        writes_performed: false,
        operational_ready: true,
        launch_allowed: true,
        launch_blocked_reason: null,
        launch_state_schema_version: beforeStatus.launch_state_schema_version,
        launch_state: beforeStatus.launch_state,
        launch_state_reason: beforeStatus.launch_state_reason,
        use_boundary_id: input.useBoundaryId ?? null,
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
        materialization_readiness: null,
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
  const packageUseBinding = 'package_use_binding' in activation
    ? activation.package_use_binding
    : null;
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
      use_boundary_id: packageUseBinding?.use_boundary_id ?? null,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

function packageStatusForActivation(input: OplAgentPackageStatusInput) {
  const snapshot = readAgentPackageStatusSnapshot(input.packageId);
  const packageStatus = buildOplAgentPackageStatus(input, snapshot).opl_agent_package_status;
  const packageId = canonicalAgentPackageId(input.packageId);
  return {
    packageStatus,
    managedLock: packageId
      ? snapshot.lockIndex.packages.find((entry) => entry.package_id === packageId) ?? null
      : null,
  };
}

function managedCacheGenerationIdentity(lock: AgentPackageLock) {
  const packageVersion = stringValue(lock.package_version);
  if (!packageVersion) return null;
  const developerCheckout = lock.source_kind === 'developer_checkout_override';
  if (developerCheckout && !lock.developer_checkout_source) return null;
  const contentDigest = stringValue(lock.content_digest);
  const manifestDigest = stringValue(lock.manifest_sha256);
  const contentDigestIsManifestFallback = Boolean(
    contentDigest
    && manifestDigest
    && contentDigest.replace(/^sha256:/, '') === manifestDigest.replace(/^sha256:/, ''),
  );
  const payloadDigest = stringValue(lock.physical_surface?.plugin_payload_manifest_sha256);
  const cacheIdentity = developerCheckout
    ? stringValue(lock.developer_checkout_source?.payload_digest)
    : contentDigest && !contentDigestIsManifestFallback
      ? contentDigest
      : payloadDigest;
  if (!cacheIdentity) return packageVersion;
  const digest = cacheIdentity.replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(digest)) return null;
  return `${packageVersion}-${developerCheckout ? 'dev-' : ''}${digest}`;
}

function isManagedCacheGeneration(lock: AgentPackageLock, cacheGeneration: string | null) {
  return Boolean(cacheGeneration && managedCacheGenerationIdentity(lock) === cacheGeneration);
}

function managedCacheSurfaceCurrent(lock: AgentPackageLock) {
  const recordedCachePath = stringValue(lock.physical_surface?.codex_plugin_cache_path);
  if (!recordedCachePath) return false;
  try {
    const rematerialized = rematerializePhysicalCodexSurfaceFromLock(
      lock,
      true,
      { skipManagedSurfaces: true },
    );
    return rematerialized.status === 'validated_no_write'
      && sameConfiguredCarrierPath(rematerialized.codex_plugin_cache_path, recordedCachePath);
  } catch {
    // Carrier status is a read-model path. Cache validation failures must only
    // make activation blocked; they must not make status itself unreadable.
    return false;
  }
}

function managedCarrierProjectionCurrent(
  packageStatus: any,
  lock: AgentPackageLock,
  cachePath: string,
) {
  const observedPath = stringValue(packageStatus.configured_carrier?.plugin_source_path);
  const expectedPath = stringValue(lock.physical_surface?.marketplace_plugin_path);
  const expectedDigest = stringValue(lock.physical_surface?.immutable_cache_digest);
  if (!observedPath || !expectedPath || !sameConfiguredCarrierPath(observedPath, expectedPath)) {
    return false;
  }
  if (!expectedDigest || !/^sha256:[0-9a-f]{64}$/.test(expectedDigest)) return false;
  try {
    const marketplaceRoot = path.join(resolveOplStatePaths().state_dir, 'codex-plugin-marketplaces');
    assertSafePersistedPackagePath({
      candidatePath: expectedPath,
      allowedRoots: [marketplaceRoot],
      pathKind: 'agent_package_marketplace_plugin_projection',
    });
    const observedStat = fs.lstatSync(observedPath);
    const cacheStat = fs.lstatSync(cachePath);
    if (!observedStat.isDirectory()
      || observedStat.isSymbolicLink()
      || !cacheStat.isDirectory()
      || cacheStat.isSymbolicLink()
      || fs.realpathSync(observedPath) === fs.realpathSync(cachePath)) {
      return false;
    }
    const cacheDigest = managedCarrierProjectionDigest(cachePath);
    const observedDigest = managedCarrierProjectionDigest(observedPath);
    assertSafePersistedPackagePath({
      candidatePath: expectedPath,
      allowedRoots: [marketplaceRoot],
      pathKind: 'agent_package_marketplace_plugin_projection',
    });
    return cacheDigest === expectedDigest && observedDigest === expectedDigest;
  } catch {
    return false;
  }
}

function packageNativeCarrierActivationState(
  packageStatus: any,
  managedLock: AgentPackageLock | null,
): 'ready' | 'blocked' | 'legacy' {
  const nativeCarrierPresent = packageStatus.configured_carrier?.carrier?.kind === 'codex_plugin_manager'
    && packageStatus.configured_carrier.status === 'installed'
    && packageStatus.configured_carrier.carrier.precedence === 'exact_single_source';
  if (!nativeCarrierPresent) return 'legacy';
  const observedCarrierVersion = stringValue(packageStatus.configured_carrier.installed_version);
  const observedCarrierPath = stringValue(packageStatus.configured_carrier.plugin_source_path);
  const managedPackageVersion = stringValue(managedLock?.package_version);
  const managedCachePath = stringValue(managedLock?.physical_surface?.codex_plugin_cache_path);
  const managedSourcePath = stringValue(managedLock?.physical_surface?.plugin_source_path);
  const managedMarketplacePath = stringValue(managedLock?.physical_surface?.marketplace_plugin_path);
  const managedDescriptorSourceCurrent = Boolean(
    managedLock
    && observedCarrierPath
    && managedSourcePath
    && sameConfiguredCarrierPath(observedCarrierPath, managedSourcePath),
  );
  const managedLockOwnsNativeCarrier = Boolean(
    managedLock
    && observedCarrierPath
    && managedMarketplacePath
    && sameConfiguredCarrierPath(observedCarrierPath, managedMarketplacePath),
  );
  const managedCacheGeneration = managedCachePath ? path.basename(managedCachePath) : null;
  const managedCacheGenerationCurrent = Boolean(
    managedLock
    && isManagedCacheGeneration(managedLock, managedCacheGeneration),
  );
  // Codex may report either the plugin manifest version or the immutable
  // plugin-cache generation. Cache mode and digest identity are verified
  // independently against the lock before either readback is accepted.
  const managedCarrierVersionCurrent = Boolean(
    observedCarrierVersion
    && managedPackageVersion
    && (
      observedCarrierVersion === managedCacheGeneration
      || observedCarrierVersion === managedPackageVersion
    ),
  );
  const managedCarrierCurrent = Boolean(
    managedLock
    && managedCacheGenerationCurrent
    && managedCarrierVersionCurrent
    && managedCacheSurfaceCurrent(managedLock)
    && managedCachePath
    && managedCarrierProjectionCurrent(packageStatus, managedLock, managedCachePath),
  );
  const descriptorReadiness = packageStatus.installed_readiness;
  if (descriptorReadiness) {
    return descriptorReadiness.installed === true
      && descriptorReadiness.callability === 'callable'
      && packageStatus.operational_ready === true
      && packageStatus.launch_allowed === true
      && (
        !managedLock
        || managedDescriptorSourceCurrent
        || (managedLockOwnsNativeCarrier && managedCarrierCurrent)
      )
      ? 'ready'
      : 'blocked';
  }
  return managedCarrierCurrent
    && packageStatus.configured_carrier.executor.status === 'callable'
    ? 'legacy'
    : 'blocked';
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

export async function runOplAgentPackageFrameworkLink(input: { agentRoot: string; dryRun?: boolean; checkOnly?: boolean }) {
  return {
    version: 'g2',
    opl_agent_package_framework_link: materializeStandardAgentFrameworkLink(input),
  };
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
    try {
      writePackageTransaction(nextIndex);
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
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageUninstall(input: AgentPackagePackageActionInput) {
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
  return withAgentPackageLifecycleTransaction(
    input.dryRun === true,
    async () => runOplAgentPackageUninstallUnlocked(input),
  );
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
  recoverRuntimeSource?: boolean;
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
  for (const discovered of installedCodexPluginDescriptors.values()) {
    if (packageId && discovered.manifest.package_id !== packageId) continue;
    readbacks.set(discovered.manifest.package_id, runConfiguredCodexPluginCarrier({
      descriptor: discovered.carrier,
      action: 'list',
    }));
  }
  for (const [projectedPackageId, descriptor] of firstPartyConfiguredCarrierDescriptors()) {
    if (packageId && projectedPackageId !== packageId) continue;
    if (readbacks.has(projectedPackageId)) continue;
    readbacks.set(projectedPackageId, runConfiguredCodexPluginCarrier({
      descriptor,
      action: 'list',
    }));
  }
  return readbacks;
}

function emptyStatusLockIndex(): AgentPackageLockIndex {
  return {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [],
  };
}

type LegacyLockProjectionState = 'present' | 'missing' | 'stale' | 'corrupt';

function isCorruptLegacyLockAuthority(error: unknown): error is FrameworkContractError {
  return error instanceof FrameworkContractError
    && error.details?.failure_code === 'agent_package_lock_authority_corrupt';
}

function canProjectDescriptorsWithCorruptLock(error: FrameworkContractError) {
  // A syntactically unreadable legacy file cannot be allowed to block a
  // carrier-owned projection. Structural identity violations remain strict:
  // they may describe a legacy Package that must fail closed rather than be
  // silently treated as an empty index.
  return error.details?.reason === 'invalid_json';
}

function retainedDescriptorLockCount(
  lockIndex: AgentPackageLockIndex,
  installedCodexPluginDescriptors: ReturnType<typeof discoverInstalledCodexPluginDescriptors>,
) {
  const descriptorIds = new Set([
    ...installedCodexPluginDescriptors.keys(),
    ...firstPartyConfiguredCarrierDescriptors().keys(),
  ]);
  return new Set([
    ...lockIndex.packages,
  ].filter((lock) => descriptorIds.has(lock.package_id)).map((lock) => lock.package_id)).size;
}

function legacyLockProjectionState(
  lockIndex: AgentPackageLockIndex,
  installedCodexPluginDescriptors: ReturnType<typeof discoverInstalledCodexPluginDescriptors>,
): LegacyLockProjectionState {
  if (!fs.existsSync(resolveOplStatePaths().agent_package_lock_file)) return 'missing';
  return retainedDescriptorLockCount(lockIndex, installedCodexPluginDescriptors) > 0
    ? 'stale'
    : 'present';
}

function legacyLockProjectionNeedsAttention(state: LegacyLockProjectionState) {
  return state === 'stale' || state === 'corrupt';
}

function readStatusLockIndex(
  installedCodexPluginDescriptors: ReturnType<typeof discoverInstalledCodexPluginDescriptors>,
  allowDegraded: boolean,
) {
  try {
    const lockIndex = readLockIndex();
    return {
      lockIndex,
      legacyLockState: legacyLockProjectionState(lockIndex, installedCodexPluginDescriptors),
    };
  } catch (error) {
    if (
      !allowDegraded
      || !isCorruptLegacyLockAuthority(error)
      || !canProjectDescriptorsWithCorruptLock(error)
    ) throw error;
    return {
      lockIndex: emptyStatusLockIndex(),
      legacyLockState: 'corrupt' as const,
    };
  }
}

function buildAgentPackageStatusSnapshot(
  lockIndex: AgentPackageLockIndex,
  installedCodexPluginDescriptors: ReturnType<typeof discoverInstalledCodexPluginDescriptors>,
  legacyLockState: LegacyLockProjectionState,
) {
  const configuredCarriers = configuredCarrierReadbacks(installedCodexPluginDescriptors);
  const directory = buildAgentPackageDirectory({
    locks: lockIndex.packages,
    detail: 'fast',
    firstPartyCatalog: null,
    configuredCarrierReadbacks: configuredCarriers,
    installedCodexPluginDescriptors,
  });
  return {
    lockIndex,
    installedCodexPluginDescriptors,
    configuredCarriers,
    legacyLockState,
    paths: resolveOplStatePaths(),
    homeShortcutPreferences: mergedHomeShortcutPreferences(directory, lockIndex),
  };
}

function readAgentPackageStatusSnapshot(packageId?: string | null) {
  const installedCodexPluginDescriptors = discoverInstalledCodexPluginDescriptors();
  const canonicalPackageId = canonicalAgentPackageId(packageId);
  let lockSnapshot: ReturnType<typeof readStatusLockIndex> | null = null;
  try {
    lockSnapshot = readStatusLockIndex(
      installedCodexPluginDescriptors,
      !canonicalPackageId && installedCodexPluginDescriptors.size > 0,
    );
  } catch {
    // A carrier-native descriptor remains the bounded status fallback when
    // the legacy lock authority cannot be read.
  }
  const descriptorOnlyReadback = Boolean(
    canonicalPackageId
    && installedCodexPluginDescriptors.has(canonicalPackageId)
    && !lockSnapshot?.lockIndex.packages.some((entry) => entry.package_id === canonicalPackageId),
  );
  // A native installed descriptor is already the status authority. Do not
  // consult the legacy lock for a descriptor-selected readback. Global
  // projections may degrade on invalid JSON; legacy-only lookups fail closed.
  const snapshot = descriptorOnlyReadback
    ? {
        lockIndex: emptyStatusLockIndex(),
        legacyLockState: 'missing' as const,
      }
    : lockSnapshot ?? readStatusLockIndex(
        installedCodexPluginDescriptors,
        !canonicalPackageId && installedCodexPluginDescriptors.size > 0,
      );
  return buildAgentPackageStatusSnapshot(
    snapshot.lockIndex,
    installedCodexPluginDescriptors,
    snapshot.legacyLockState,
  );
}

function publicLegacyPackages(
  packages: AgentPackageLock[],
  installedCodexPluginDescriptors: ReadonlyMap<string, import('./agent-package-registry-parts/installed-codex-plugin-directory.ts').InstalledCodexPluginDescriptor>,
  configuredCarrierIds: ReadonlySet<string> = new Set(),
) {
  return packages.filter((entry) => (
    !installedCodexPluginDescriptors.has(entry.package_id)
    && !configuredCarrierIds.has(entry.package_id)
  ));
}

function agentPackageStatusReadbackStatus(input: {
  packageId: string | null;
  installedPackageCount: number;
  configuredCarrierStatus: ConfiguredCodexPluginCarrierReadback['status'] | null;
  configuredCarrierPrecedence: ConfiguredCodexPluginCarrierReadback['carrier']['precedence'] | null;
  installedCarrierReady: boolean;
  operationalReady: boolean;
  legacyLockState: LegacyLockProjectionState;
}) {
  if (
    input.packageId
    && input.installedPackageCount === 0
    && input.configuredCarrierStatus !== 'installed'
    && !input.installedCarrierReady
  ) {
    return input.configuredCarrierStatus === 'physical_unavailable'
      && input.configuredCarrierPrecedence === 'unavailable'
      ? 'attention_needed'
      : 'not_installed';
  }
  if (input.packageId && !input.operationalReady) return 'attention_needed';
  if (!input.packageId && legacyLockProjectionNeedsAttention(input.legacyLockState)) return 'attention_needed';
  return 'available';
}

function buildOplAgentPackageStatus(
  input: OplAgentPackageStatusInput,
  snapshot: ReturnType<typeof readAgentPackageStatusSnapshot>,
) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const {
    lockIndex,
    paths,
    homeShortcutPreferences: allHomeShortcutPreferences,
    installedCodexPluginDescriptors,
    configuredCarriers,
    legacyLockState,
  } = snapshot;
  const installedPackages = publicLegacyPackages(
    packageId
      ? lockIndex.packages.filter((entry) => entry.package_id === packageId)
      : lockIndex.packages,
    installedCodexPluginDescriptors,
    new Set(configuredCarriers.keys()),
  );
  const homeShortcutPreferences = allHomeShortcutPreferences
    .filter((entry) => !packageId || entry.package_id === packageId);
  const selectedLock = packageId ? installedPackages[0] ?? null : null;
  const installedDescriptor = packageId
    ? installedCodexPluginDescriptors.get(packageId) ?? null
    : null;
  const managedLock = packageId
    ? lockIndex.packages.find((entry) => entry.package_id === packageId) ?? null
    : null;
  const managedCarrierDescriptor = managedLock ? configuredCarrierDescriptorFromLock(managedLock) : null;
  const configuredCarrier = packageId
    ? configuredCarriers.get(packageId)
      ?? (managedCarrierDescriptor
        ? runConfiguredCodexPluginCarrier({ descriptor: managedCarrierDescriptor, action: 'list' })
        : null)
    : null;
  const carrierReadiness = installedDescriptor?.readiness ?? null;
  const installedReadiness = carrierReadiness;
  const installedCarrierReadback = installedDescriptor?.carrier_readback ?? null;
  const legacySelectedLock = installedDescriptor ? null : selectedLock;
  const carrierAuthorityReadiness = legacySelectedLock
    ? agentPackageCarrierAuthorityStatus(legacySelectedLock)
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
      })
    : managedPolicyCurrentness(legacySelectedLock);
  const packageDependencyReadiness = legacySelectedLock ? dependencyReadiness(legacySelectedLock, lockIndex) : null;
  const materializationReadiness = legacySelectedLock
    ? scopeMaterializationReadiness(legacySelectedLock, lockIndex, input)
    : null;
  const runtimeSourceReadiness = input.detail === 'fast'
    ? managedRuntimeSourceLockReadiness(
        legacySelectedLock?.managed_runtime_source,
        legacySelectedLock?.runtime_source_carrier,
      )
    : managedRuntimeSourceReadiness(
        legacySelectedLock?.managed_runtime_source,
        legacySelectedLock?.runtime_source_carrier,
      );
  const materializationOperational = !materializationReadiness
    || materializationReadiness.status === 'current'
    || materializationReadiness.status === 'not_required'
    || materializationReadiness.status === 'scope_required';
  const requiredPolicyDependenciesOperational = policyCurrentness.required_dependencies_operational !== false;
  const managedPolicyOperational = policyCurrentness.status === 'current'
    || policyCurrentness.status === 'not_requested'
    || policyCurrentness.status === 'drifted'
      ? requiredPolicyDependenciesOperational
      : false;
  const exposureOperational = legacySelectedLock?.exposure_state !== 'disabled';
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
    && carrierReadiness.callability === 'callable'
    && !carrierReadiness.legacy_lifecycle_state_present,
  );
  const lockOperational = Boolean(
    legacySelectedLock
    && exposureOperational
    && packageDependencyReadiness?.operational_ready
    && materializationOperational
    && runtimeSourceReadiness.operational_ready
    && managedPolicyOperational,
  );
  const operationalReady = carrierReadiness
    ? neutralCarrierReady && managedPolicyOperational
    : managedCarrierDescriptor
    ? configuredCarrierReady && lockOperational
    : configuredCarrier
    ? configuredCarrierReady
    : lockOperational;
  const lockBlockedReason = !legacySelectedLock
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
              ? requiredPolicyDependenciesOperational
                ? `managed_policy_${policyCurrentness.status}`
                : 'managed_policy_required_dependency_unavailable'
              : null;
  const launchBlockedReason = carrierReadiness
    ? neutralCarrierReady
      ? managedPolicyOperational
        ? null
        : requiredPolicyDependenciesOperational
          ? `managed_policy_${policyCurrentness.status}`
          : 'managed_policy_required_dependency_unavailable'
      : carrierReadiness.physical_status !== 'available'
        ? 'carrier_source_unavailable'
        : carrierReadiness.callability !== 'callable'
          ? 'carrier_disabled'
          : 'carrier_not_installed'
    : managedCarrierDescriptor
    ? configuredCarrierReady
      ? lockBlockedReason
      : configuredCarrier?.reason ?? 'configured_native_carrier_attention_needed'
    : configuredCarrier
    ? legacySelectedLock
      ? 'configured_native_carrier_legacy_state_present'
      : configuredCarrierReady
        ? null
        : configuredCarrier.reason ?? 'configured_native_carrier_attention_needed'
    : lockBlockedReason;
  const repairAction = launchBlockedReason
    ? !managedPolicyOperational
      ? policyCurrentness.repair_command
      : legacySelectedLock && !materializationOperational
      ? materializationReadiness?.repair_command ?? null
      : legacySelectedLock && packageDependencyReadiness && !packageDependencyReadiness.operational_ready
        ? null
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
        : !requiredPolicyDependenciesOperational
          ? 'managed_policy_required_dependency_unavailable'
          : policyCurrentness.status === 'invalid'
          ? 'managed_policy_invalid'
          : null;
  const degradedReason = unavailableReason
    ? null
    : policyCurrentness.experience_baseline?.status === 'degraded'
      ? 'experience_baseline_degraded'
    : optionalDependencyMissing
      ? 'optional_dependency_missing'
      : materializationObservationReason
      ?? (carrierAuthorityReadiness?.status === 'invalid' ? 'carrier_authority_invalid' : null)
      ?? (policyCurrentness.status === 'drifted' ? 'managed_policy_drifted' : null)
      ?? (dependencyObservationReason ? `package_dependency_${dependencyObservationReason}` : null);
  const launchState = deriveAgentPackageLaunchState({
    installed: Boolean(
      legacySelectedLock
      || configuredCarrier?.status === 'installed'
      || carrierReadiness?.installed,
    ),
    exposure_state: legacySelectedLock?.exposure_state
      ?? (
        configuredCarrier?.status === 'installed' || carrierReadiness?.installed
          ? 'visible'
          : 'not_installed'
      ),
    operational_ready: operationalReady,
    launch_blocked_reason: operationalReady ? null : launchBlockedReason,
    degraded_reason: degradedReason,
    unavailable_reason: unavailableReason,
  });
  const globallyInstalledPackageIds = new Set([
    ...installedPackages.map((entry) => entry.package_id),
    ...[...installedCodexPluginDescriptors.values()]
      .filter((descriptor) => descriptor.readiness.installed)
      .map((descriptor) => descriptor.manifest.package_id),
  ]);
  return {
    version: 'g2',
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status',
      status: agentPackageStatusReadbackStatus({
        packageId,
        installedPackageCount: installedPackages.length,
        configuredCarrierStatus: configuredCarrier?.status ?? null,
        configuredCarrierPrecedence: configuredCarrier?.carrier.precedence ?? null,
        installedCarrierReady: carrierReadiness?.installed ?? false,
        operationalReady,
        legacyLockState,
      }),
      package_id: packageId ?? null,
      installed_package_count: packageId
        ? configuredCarrier?.status === 'installed'
          || carrierReadiness?.installed
          ? Math.max(1, installedPackages.length)
          : installedPackages.length
        : globallyInstalledPackageIds.size,
      installed_packages: installedPackages,
      configured_carrier: configuredCarrier,
      installed_carrier_readback: installedCarrierReadback,
      installed_readiness: installedReadiness,
      package_dependency_readiness: packageDependencyReadiness,
      materialization_readiness: materializationReadiness,
      runtime_source_readiness: runtimeSourceReadiness,
      carrier_authority_readiness: carrierAuthorityReadiness,
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
        ? 'installed_carrier_presence_callability_and_managed_policy'
        : configuredCarrier
        ? 'configured_native_carrier_presence_callability_identity_and_precedence'
        : 'package_dependency_scope_runtime_source_and_managed_policy',
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
  let descriptorSnapshot: ReturnType<typeof buildAgentPackageStatusSnapshot> | null = null;
  let globalSnapshot: ReturnType<typeof buildAgentPackageStatusSnapshot> | null = null;
  let legacySnapshot: ReturnType<typeof buildAgentPackageStatusSnapshot> | null = null;
  return (input: OplAgentPackageStatusInput = {}) => {
    const packageId = canonicalAgentPackageId(input.packageId);
    const descriptorOwned = Boolean(
      packageId && installedCodexPluginDescriptors.has(packageId),
    );
    const snapshot = descriptorOwned
      ? descriptorSnapshot ??= buildAgentPackageStatusSnapshot(
          emptyStatusLockIndex(),
          installedCodexPluginDescriptors,
          'missing',
        )
      : packageId
      ? legacySnapshot ??= (() => {
          const projection = readStatusLockIndex(installedCodexPluginDescriptors, false);
          return buildAgentPackageStatusSnapshot(
            projection.lockIndex,
            installedCodexPluginDescriptors,
            projection.legacyLockState,
          );
        })()
      : globalSnapshot ??= (() => {
          const projection = readStatusLockIndex(
            installedCodexPluginDescriptors,
            installedCodexPluginDescriptors.size > 0,
          );
          return buildAgentPackageStatusSnapshot(
            projection.lockIndex,
            installedCodexPluginDescriptors,
            projection.legacyLockState,
          );
        })();
    return buildOplAgentPackageStatus(input, snapshot);
  };
}

export function runOplAgentPackageStatus(input: OplAgentPackageStatusInput = {}) {
  return buildOplAgentPackageStatus(input, readAgentPackageStatusSnapshot(input.packageId));
}

export function listOplAgentPackages(input: {
  detail?: 'fast' | 'full';
  firstPartyCatalog?: import('./agent-package-registry-parts/directory.ts').FirstPartyDirectoryCatalogSnapshot | null;
  statusContext?: (packageId: string) => Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'> | null;
  readStatus?: typeof runOplAgentPackageStatus;
} = {}) {
  const detail = input.detail ?? 'fast';
  const paths = resolveOplStatePaths();
  const installedCodexPluginDescriptors = discoverInstalledCodexPluginDescriptors();
  const projection = readStatusLockIndex(
    installedCodexPluginDescriptors,
    installedCodexPluginDescriptors.size > 0,
  );
  const { lockIndex, legacyLockState } = projection;
  const configuredCarriers = configuredCarrierReadbacks(installedCodexPluginDescriptors);
  const installedPackages = publicLegacyPackages(
    lockIndex.packages,
    installedCodexPluginDescriptors,
    new Set(configuredCarriers.keys()),
  );
  const directoryReadback = buildAgentPackageDirectory({
    locks: lockIndex.packages,
    detail,
    firstPartyCatalog: input.firstPartyCatalog ?? null,
    configuredCarrierReadbacks: configuredCarriers,
    installedCodexPluginDescriptors,
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
  const directory = {
    ...directoryReadback,
    ...(legacyLockProjectionNeedsAttention(legacyLockState)
      ? { status: 'attention_required' as const }
      : {}),
  };
  const homeShortcutPreferences = mergedHomeShortcutPreferences(directory, lockIndex);
  return {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      status: legacyLockProjectionNeedsAttention(legacyLockState) ? 'attention_needed' : 'available',
      directory,
      installed_package_count: new Set([
        ...installedPackages.map((entry) => entry.package_id),
        ...[...configuredCarriers.entries()]
          .filter(([, readback]) => readback.status === 'installed')
          .map(([packageId]) => packageId),
      ]).size,
      installed_packages: installedPackages,
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
