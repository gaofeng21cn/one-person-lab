import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import { materializeStandardAgentFrameworkLink } from './standard-agent-framework-link.ts';
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
  materializeCapabilityScope,
  materializeCapabilityScopeFromLock,
  finalizeCapabilityScopeTransaction,
  packageScopeTarget,
  rollbackCapabilityScopeTransaction,
  scopeMaterializationReadiness,
} from './agent-package-registry-parts/scope-materialization.ts';
import {
  materializePhysicalCodexSurface,
  removePhysicalCodexSurface,
  rematerializePhysicalCodexSurfaceFromLock,
  resolveManifestPhysicalSource,
} from './agent-package-registry-parts/physical-surface.ts';
import { applyPackageProfile } from './agent-package-registry-parts/profile-surface.ts';
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
  AgentPackageLock,
  AgentPackageManifestValidateInput,
  AgentPackageManifest,
  AgentPackagePackageActionInput,
  AgentPackageScopeMaterialization,
  AgentPackageProfileApplyInput,
  AgentPackageRegistryRefreshInput,
} from './agent-package-registry-parts/types.ts';

export type {
  AgentPackageHomeShortcutPreferencesSetInput,
  AgentPackageInstallInput,
  AgentPackageManifestValidateInput,
  AgentPackagePackageActionInput,
  AgentPackageProfileApplyInput,
  AgentPackageRegistryRefreshInput,
} from './agent-package-registry-parts/types.ts';

type PreparedPackage = {
  selection: Awaited<ReturnType<typeof resolveManifestSelection>>;
  manifest: AgentPackageManifest;
  manifestSha256: string;
  sourceKind: ReturnType<typeof normalizeSourceKind>;
  trustTier: string;
  previousLock: AgentPackageLock | null;
};

async function applyManifestPackageLock(
  input: AgentPackageInstallInput,
  action: 'install' | 'update' | 'repair',
) {
  const packageId = stringValue(input.packageId);
  const index = readLockIndex();
  const existingLock = packageId
    ? index.packages.find((entry) => entry.package_id === packageId)
    : null;
  const selection = action !== 'install'
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
  ): Promise<PreparedPackage> {
    const fetched = await fetchJsonSource(nextSelection.manifestUrl);
    const manifest = await resolveManifestPhysicalSource(
      normalizePackageManifest(fetched.payload, nextSelection.manifestUrl),
      input.dryRun === true,
    );
    verifyManifestContentLock(manifest);
    assertManifestMatchesRegistrySelection(manifest, nextSelection);
    const trustTier = stringValue(input.trustTier) ?? nextSelection.trustTier ?? inheritedTrustTier ?? null;
    assertTrustTierAssigned(trustTier, nextSelection.manifestUrl);
    const sourceKind = normalizeSourceKind(input.sourceKind, nextSelection.manifestUrl);
    return {
      selection: nextSelection,
      manifest,
      manifestSha256: fetched.source_sha256,
      sourceKind,
      trustTier,
      previousLock: index.packages.find((entry) => entry.package_id === manifest.package_id) ?? null,
    };
  }

  const root = await preparePackage(selection);
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
      if (dependency.manifest_url) {
        dependencySelection = {
          registryUrl: prepared.selection.registryUrl,
          packageId: dependency.package_id,
          manifestUrl: dependency.manifest_url,
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
      const provider = await preparePackage(dependencySelection, prepared.trustTier);
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
    materializePhysicalCodexSurface(prepared.manifest, true);
  }

  const frameworkLink = input.agentRoot
    ? materializeStandardAgentFrameworkLink({ agentRoot: input.agentRoot, dryRun: input.dryRun })
    : null;

  const physicalSurfaces = new Map<string, ReturnType<typeof materializePhysicalCodexSurface>>();
  try {
    for (const prepared of ordered) {
      physicalSurfaces.set(
        prepared.manifest.package_id,
        materializePhysicalCodexSurface(prepared.manifest, input.dryRun === true),
      );
    }
  } catch (error) {
    for (const prepared of [...ordered].reverse()) {
      const surface = physicalSurfaces.get(prepared.manifest.package_id);
      if (surface && !input.dryRun) removePhysicalCodexSurface(surface, false, prepared.manifest.package_id);
    }
    for (const prepared of ordered) {
      if (prepared.previousLock && !input.dryRun) rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
    }
    throw error;
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
    } catch (error) {
      if (!input.dryRun) {
        for (const materialization of [...scopeMaterializations].reverse()) {
          rollbackCapabilityScopeTransaction(materialization);
        }
        for (const nextLock of [...locks].reverse()) removePhysicalCodexSurface(nextLock.physical_surface, false, nextLock.package_id);
        for (const prepared of ordered) {
          if (prepared.previousLock) rematerializePhysicalCodexSurfaceFromLock(prepared.previousLock, false);
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
    if (previousLocks.length > 0) {
      nextIndex.last_known_good_transactions = [{
        transaction_id: previousLocks[0].dependency_transaction_id || sha256Text(previousLocks.map((entry) => entry.lock_ref).join('\n')),
        closure_digest: previousLocks[0].dependency_closure_digest || dependencyClosureDigest(previousLocks),
        package_locks: previousLocks,
      }, ...(nextIndex.last_known_good_transactions ?? [])].slice(0, 4);
    }
    for (const nextLock of locks) {
      const currentIndex = nextIndex.packages.findIndex((entry) => entry.package_id === nextLock.package_id);
      if (currentIndex >= 0) nextIndex.packages[currentIndex] = nextLock;
      else nextIndex.packages.unshift(nextLock);
    }
    try {
      for (const prepared of ordered) {
        cleanupPreviousPhysicalSurface(
          prepared.previousLock?.physical_surface,
          physicalSurfaces.get(prepared.manifest.package_id)!,
        );
      }
      writePackageTransaction(nextIndex, receipts);
    } catch (error) {
      for (const scopeMaterialization of scopeMaterializations) {
        rollbackCapabilityScopeTransaction(scopeMaterialization);
      }
      for (const nextLock of [...locks].reverse()) removePhysicalCodexSurface(nextLock.physical_surface, false, nextLock.package_id);
      for (const previousLock of previousLocks) rematerializePhysicalCodexSurfaceFromLock(previousLock, false);
      throw error;
    }
    for (const scopeMaterialization of scopeMaterializations) {
      finalizeCapabilityScopeTransaction(scopeMaterialization);
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

function packageRepairResult(
  input: AgentPackagePackageActionInput,
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

export function runOplAgentPackageRepair(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'repair');
  const index = readLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'repair');
  if ((lock.capability_dependencies ?? []).length > 0) {
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
  const index = readLockIndex();
  const { lock } = requireInstalledPackage(index, packageId, 'rollback');
  assertNoRequiredInstalledDependents(index, packageId, 'rollback');
  const lastKnownGood = (index.last_known_good_transactions ?? [])
    .find((entry) => entry.package_locks.some((candidate) => candidate.package_id === packageId));
  if (!lastKnownGood) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package rollback requires a recorded dependency-closure last-known-good generation.', {
      package_id: packageId,
      failure_code: 'agent_package_last_known_good_missing',
    });
  }
  const restoredLocks = structuredClone(lastKnownGood.package_locks);
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
  }));
  restoredLocks.forEach((restoredLock) => {
    restoredLock.dependency_transaction_id = transactionId;
    restoredLock.dependency_closure_digest = closureDigest;
    restoredLock.action_receipt_id = receipts.find((receipt) => receipt.package_id === restoredLock.package_id)!.receipt_ref;
  });
  const restoredRoot = restoredLocks.find((entry) => entry.package_id === packageId)!;
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
  if (scopeMaterializations.length > 0) rootReceipt.scope_materialization = scopeMaterializations[0];
  if (!input.dryRun) {
    const currentIds = new Set([packageId, ...(lock.resolved_dependencies ?? []).map((entry) => entry.package_id)]);
    const currentLocks = index.packages.filter((entry) => currentIds.has(entry.package_id));
    const restoredIds = new Set(restoredLocks.map((entry) => entry.package_id));
    try {
      for (const currentLock of currentLocks) removePhysicalCodexSurface(currentLock.physical_surface, false, currentLock.package_id);
      for (const restoredLock of restoredLocks) {
        restoredLock.physical_surface = rematerializePhysicalCodexSurfaceFromLock(restoredLock, false);
      }
      const nextIndex = structuredClone(index);
      nextIndex.packages = [
        ...restoredLocks,
        ...nextIndex.packages.filter((entry) => !currentIds.has(entry.package_id) && !restoredIds.has(entry.package_id)),
      ];
      nextIndex.last_known_good_transactions = [{
        transaction_id: lock.dependency_transaction_id,
        closure_digest: lock.dependency_closure_digest,
        package_locks: structuredClone(currentLocks),
      }, ...(nextIndex.last_known_good_transactions ?? []).filter((entry) => entry !== lastKnownGood)].slice(0, 4);
      writePackageTransaction(nextIndex, receipts);
    } catch (error) {
      for (const materialization of scopeMaterializations) rollbackCapabilityScopeTransaction(materialization);
      for (const restoredLock of restoredLocks) removePhysicalCodexSurface(restoredLock.physical_surface, false, restoredLock.package_id);
      for (const currentLock of currentLocks) rematerializePhysicalCodexSurfaceFromLock(currentLock, false);
      throw error;
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

export function ensureOplAgentPackageScopeActivation(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const index = readLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'activate');
  if ((lock.capability_dependencies ?? []).length === 0) {
    return {
      status: 'not_required',
      package_id: packageId,
      writes_performed: false,
      materialization_readiness: scopeMaterializationReadiness(lock, index, input),
    };
  }
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
  if (existing.length > 0) {
    return {
      status: 'already_activated',
      package_id: packageId,
      writes_performed: false,
      materialization_readiness: scopeMaterializationReadiness(lock, index, input),
    };
  }
  const transactionId = sha256Text(`activate\n${packageId}\n${input.scope}\n${targetRoot}\n${lock.dependency_closure_digest}`);
  const materializations = lock.capability_dependencies.map((dependency) => {
    const provider = index.packages.find((entry) => entry.package_id === dependency.package_id);
    if (!provider) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package scope activation requires every dependency provider lock.', {
        package_id: packageId,
        dependency_package_id: dependency.package_id,
        failure_code: 'agent_package_dependency_lock_missing',
      });
    }
    return materializeCapabilityScopeFromLock({
      provider,
      scope: input.scope!,
      targetRoot,
      transactionId: sha256Text(`${transactionId}\n${dependency.package_id}`),
      dryRun: input.dryRun === true,
      retainTransactionBackup: input.dryRun !== true,
    });
  });
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
  const receipt = lifecycleReceipt({
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
  });
  for (const materialization of materializations) {
    materialization.lifecycle_receipt_ref = receipt.receipt_ref;
  }
  receipt.scope_materialization = materializations[0];
  const activatedLock: AgentPackageLock = {
    ...lock,
    updated_at: input.dryRun ? lock.updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
    scope_materializations: [...materializations, ...(lock.scope_materializations ?? [])],
  };
  if (!input.dryRun) {
    const nextIndex = structuredClone(index);
    nextIndex.packages[lockIndex] = activatedLock;
    try {
      writePackageTransaction(nextIndex, [receipt]);
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
    status: input.dryRun ? 'validated_no_write' : 'activated',
    package_id: packageId,
    writes_performed: !input.dryRun,
    scope_materializations: materializations,
    lifecycle_receipt: receipt,
    package_lock: activatedLock,
  };
}

export function runOplAgentPackageActivate(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'activate');
  const activation = ensureOplAgentPackageScopeActivation({
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
      lifecycle_receipt_ref: packageStatus.materialization_readiness?.lifecycle_receipt_ref ?? null,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageProfileApply(input: AgentPackageProfileApplyInput) {
  const packageId = requirePackageId(input.packageId, 'profile_apply');
  const index = readLockIndex();
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
  const index = readLockIndex();
  assertNoRequiredInstalledDependents(index, packageId, 'uninstall');
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'uninstall');
  const physicalSurface = removePhysicalCodexSurface(lock.physical_surface, input.dryRun === true, packageId);
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
  });
  if (!input.dryRun) {
    index.packages.splice(lockIndex, 1);
    writeLockIndex(index);
    appendReceipt(receipt);
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
  const index = readLockIndex();
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
  const lockIndex = readLockIndex();
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
} = {}) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const lockIndex = readLockIndex();
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
    const receipt = lifecycleLedger.receipts.find((entry) =>
      entry.receipt_ref === materializationReadiness?.lifecycle_receipt_ref
      && entry.package_id === selectedLock.package_id
      && entry.scope_materialization?.scope === materializationReadiness?.scope
      && entry.scope_materialization?.target_root === materializationReadiness?.target_root
      && entry.scope_materialization?.content_digest === materializationReadiness?.expected_digest);
    if (!receipt) {
      materializationReadiness = {
        ...materializationReadiness,
        status: 'incompatible',
        lifecycle_receipt_ref: null,
      };
    }
  }
  const operationalReady = Boolean(
    packageDependencyReadiness?.operational_ready
    && (materializationReadiness?.status === 'current' || materializationReadiness?.status === 'not_required'),
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
      operational_ready: operationalReady,
      operational_ready_scope: 'package_dependency_and_scope_materialization_only',
      launch_allowed: operationalReady,
      launch_blocked_reason: operationalReady
        ? null
        : packageDependencyReadiness && !packageDependencyReadiness.operational_ready
          ? `package_dependency_${packageDependencyReadiness.status}`
          : materializationReadiness
            ? `scope_materialization_${materializationReadiness.status}`
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

export function listOplAgentPackages() {
  const paths = resolveOplStatePaths();
  const registryCache = readRegistryCache();
  const lockIndex = readLockIndex();
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
      owner_route_readback: ownerRouteReadback({
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
