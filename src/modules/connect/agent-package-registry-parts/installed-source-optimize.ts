import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { dependencyClosureDigest, dependencyReadiness } from './dependency-closure.ts';
import {
  lifecycleReceipt,
  packageActionSourceSha256,
} from './lifecycle-lock.ts';
import { assertInstalledPackagePluginSource } from './installed-plugin-source.ts';
import {
  cleanupUnreferencedPackagePayloadSources,
  removePhysicalCodexSurface,
  rematerializePhysicalCodexSurfaceFromLock,
  rollbackManagedPolicySurface,
  rollbackNewPackageProfileSurface,
} from './physical-surface.ts';
import {
  assertManagedPolicyRollbackReady,
  finalizeManagedPolicyRollback,
  rollbackManagedPolicyMigration,
} from './managed-policy-surface.ts';
import {
  assertPackageProfileRollbackReady,
  finalizePackageProfileRollback,
  rollbackPackageProfileMigration,
} from './profile-surface.ts';
import { removeSafePersistedPackagePath } from './persisted-path-safety.ts';
import {
  assertCapabilityScopeRollbackReady,
  materializeCapabilityScopeFromLock,
  packageScopeTarget,
  rollbackCapabilityScopeTransaction,
} from './scope-materialization.ts';
import { nowIso, resolveCodexHome, sha256Text } from './shared.ts';
import { writePackageTransaction } from './store.ts';
import type {
  AgentPackageLastKnownGood,
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackagePackageActionInput,
  AgentPackagePhysicalSurface,
  AgentPackageScopeMaterialization,
} from './types.ts';

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

function installedClosure(index: AgentPackageLockIndex, root: AgentPackageLock) {
  const locks = index.packages.filter((entry) =>
    entry.package_id === root.package_id
    || (root.dependency_transaction_id
      && entry.dependency_transaction_id === root.dependency_transaction_id)
  );
  return locks.length > 0 ? locks : [root];
}

function scopeTargets(lock: AgentPackageLock, input: AgentPackagePackageActionInput) {
  const explicitTarget = packageScopeTarget(input);
  if (input.scope && explicitTarget) {
    return [{ scope: input.scope, targetRoot: explicitTarget }];
  }
  return (lock.scope_materializations ?? [])
    .map((entry) => ({ scope: entry.scope, targetRoot: entry.target_root }))
    .filter((entry, index, entries) => entries.findIndex((candidate) =>
      candidate.scope === entry.scope && candidate.targetRoot === entry.targetRoot) === index);
}

function assertInstalledPhysicalSources(locks: AgentPackageLock[]) {
  const physicalLocks = locks.filter((lock) => Boolean(lock.physical_surface?.plugin_id));
  if (physicalLocks.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed package optimization requires a locked local package or capability source.',
      {
        package_ids: locks.map((entry) => entry.package_id),
        failure_code: 'agent_package_optimize_installed_source_missing',
      },
    );
  }
  for (const lock of physicalLocks) {
    const sourcePath = assertInstalledPackagePluginSource(lock);
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed package optimization requires its locked local source directory.',
        {
          package_id: lock.package_id,
          plugin_source_path: lock.physical_surface?.plugin_source_path ?? null,
          codex_plugin_cache_path: lock.physical_surface?.codex_plugin_cache_path ?? null,
          failure_code: 'agent_package_optimize_installed_source_missing',
          repair_command: `opl packages repair --package-id ${lock.package_id}`,
        },
      );
    }
  }
}

function restorePreviousPhysicalSurface(previous: AgentPackageLock) {
  return rematerializePhysicalCodexSurfaceFromLock(previous, false, {
    companionNetworkAccess: 'forbidden',
    skipManagedSurfaces: true,
  });
}

function validatePreviousPhysicalSurface(previous: AgentPackageLock) {
  return rematerializePhysicalCodexSurfaceFromLock(previous, true, {
    companionNetworkAccess: 'forbidden',
    skipManagedSurfaces: true,
  });
}

function rollbackOptimizedPhysicalSurface(
  next: AgentPackagePhysicalSurface,
  previous: AgentPackageLock,
) {
  removePhysicalCodexSurface(next, false, previous.package_id, {
    retainPayloadSource: true,
    retainPluginCache: true,
  });
  rollbackManagedPolicySurface(next);
  rollbackNewPackageProfileSurface(next);
  restorePreviousPhysicalSurface(previous);
}

export function optimizeInstalledPackageSource(input: {
  index: AgentPackageLockIndex;
  root: AgentPackageLock;
  action: AgentPackagePackageActionInput;
}) {
  const dryRun = input.action.dryRun === true;
  const previousLocks = structuredClone(installedClosure(input.index, input.root));
  assertInstalledPhysicalSources(previousLocks);
  const readiness = dependencyReadiness(input.root, input.index);
  if (!readiness.operational_ready) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed package dependency closure must be current before local optimization.',
      {
        package_id: input.root.package_id,
        dependency_status: readiness.status,
        repair_command: readiness.repair_command,
        failure_code: 'agent_package_optimize_dependency_closure_not_ready',
      },
    );
  }

  rematerializePhysicalCodexSurfaceFromLock(input.root, true, {
    companionNetworkAccess: 'forbidden',
  });
  let physicalSurface: AgentPackagePhysicalSurface;
  try {
    physicalSurface = rematerializePhysicalCodexSurfaceFromLock(input.root, dryRun, {
      companionNetworkAccess: 'forbidden',
    });
  } catch (error) {
    if (!dryRun) restorePreviousPhysicalSurface(input.root);
    throw error;
  }

  const scopeMaterializations: AgentPackageScopeMaterialization[] = [];
  try {
    for (const target of scopeTargets(input.root, input.action)) {
      for (const dependency of input.root.resolved_dependencies ?? []) {
        const provider = input.index.packages.find((entry) => entry.package_id === dependency.package_id);
        if (!provider) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Installed package optimization cannot resolve a locked capability provider.',
            {
              package_id: input.root.package_id,
              dependency_package_id: dependency.package_id,
              failure_code: 'agent_package_optimize_dependency_lock_missing',
            },
          );
        }
        scopeMaterializations.push(materializeCapabilityScopeFromLock({
          provider,
          scope: target.scope,
          targetRoot: target.targetRoot,
          transactionId: sha256Text([
            'optimize-scope',
            input.root.package_id,
            dependency.package_id,
            target.scope,
            target.targetRoot,
            input.root.lock_ref,
            input.root.action_receipt_id,
          ].join('\n')),
          dryRun,
          retainTransactionBackup: !dryRun,
          previousMaterialization: input.root.scope_materializations?.find((entry) =>
            entry.scope === target.scope
            && entry.target_root === target.targetRoot
            && entry.provider_package_id === dependency.package_id) ?? null,
        }));
      }
    }
  } catch (error) {
    if (!dryRun) {
      for (const materialization of [...scopeMaterializations].reverse()) {
        rollbackCapabilityScopeTransaction(materialization);
      }
      rollbackOptimizedPhysicalSurface(physicalSurface, input.root);
    }
    throw error;
  }

  const closureDigest = dependencyClosureDigest(previousLocks);
  const dependencyPackages = previousLocks.map((entry) => ({
    package_id: entry.package_id,
    package_version: entry.package_version,
    manifest_sha256: entry.manifest_sha256,
    content_digest: entry.content_digest,
    package_lock_ref: entry.lock_ref,
    source_artifact_ref: entry.source_artifact_ref ?? null,
    artifact_digest: entry.artifact_digest ?? null,
    owner_source_commit: entry.owner_source_commit ?? null,
    carrier_authority: entry.carrier_authority ?? null,
  }));
  const sourceSha256 = sha256Text([
    packageActionSourceSha256('optimize', input.root),
    closureDigest,
    physicalSurface.plugin_payload_manifest_sha256 ?? '',
    physicalSurface.workflow_policy_migration.policy_sha256 ?? '',
    physicalSurface.profile_migration.target_sha256 ?? '',
    ...scopeMaterializations.map((entry) => entry.transaction_id).sort(),
  ].join('\n'));
  const receipt = lifecycleReceipt({
    action: 'optimize',
    actionStatus: dryRun ? 'validated' : 'completed',
    packageId: input.root.package_id,
    manifestUrl: input.root.manifest_url,
    manifestSha256: input.root.manifest_sha256,
    packageLockRef: input.root.lock_ref,
    rollbackRef: input.root.rollback_ref,
    sourceKind: input.root.source_kind,
    trustTier: input.root.trust_tier,
    sourceSha256,
    writesPerformed: !dryRun,
    physicalSurface,
    dependencyTransactionId: input.root.dependency_transaction_id,
    dependencyClosureDigest: closureDigest,
    dependencyPackages,
    scopeMaterialization: scopeMaterializations[0],
    scopeMaterializations,
    managedRuntimeSource: input.root.managed_runtime_source,
    sourceArtifactRef: input.root.source_artifact_ref,
    artifactDigest: input.root.artifact_digest,
    ownerSourceCommit: input.root.owner_source_commit,
    carrierAuthority: input.root.carrier_authority,
    releaseChannelRef: input.root.release_channel_ref,
    releaseChannelDigest: input.root.release_channel_digest,
    sourceSelection: 'installed_package_lock',
    networkAccessed: false,
    remoteDependencyPolicy: 'forbidden',
  });
  for (const materialization of scopeMaterializations) {
    materialization.lifecycle_receipt_ref = receipt.receipt_ref;
  }
  const nextLock: AgentPackageLock = {
    ...input.root,
    updated_at: dryRun ? input.root.updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
    physical_surface: physicalSurface,
    scope_materializations: [
      ...scopeMaterializations,
      ...(input.root.scope_materializations ?? []).filter((entry) =>
        !scopeMaterializations.some((next) =>
          next.scope === entry.scope
          && next.target_root === entry.target_root
          && next.provider_package_id === entry.provider_package_id)),
    ],
  };
  const rollbackGeneration: AgentPackageLastKnownGood = {
    root_package_id: input.root.package_id,
    transaction_id: sha256Text([
      'lkg-snapshot',
      'optimize',
      input.root.package_id,
      closureDigest,
      ...previousLocks.map((entry) => entry.lock_ref).sort(),
      input.root.action_receipt_id,
    ].join('\n')),
    closure_digest: closureDigest,
    package_locks: previousLocks,
  };

  if (!dryRun) {
    const nextIndex = structuredClone(input.index);
    const lockIndex = nextIndex.packages.findIndex((entry) => entry.package_id === input.root.package_id);
    nextIndex.packages[lockIndex] = nextLock;
    nextIndex.last_known_good_transactions = retainLastKnownGoodPerRoot(
      nextIndex.last_known_good_transactions ?? [],
      rollbackGeneration,
    );
    try {
      writePackageTransaction(nextIndex, [receipt]);
    } catch (error) {
      for (const materialization of [...scopeMaterializations].reverse()) {
        rollbackCapabilityScopeTransaction(materialization);
      }
      rollbackOptimizedPhysicalSurface(physicalSurface, input.root);
      throw error;
    }
    cleanupUnreferencedPackagePayloadSources(input.index, nextIndex);
  }

  return {
    status: dryRun ? 'validated_no_write' : 'optimized',
    lock: nextLock,
    receipt,
    physicalSurface,
    closureLocks: previousLocks.map((entry) =>
      entry.package_id === nextLock.package_id ? nextLock : entry),
    closureDigest,
    scopeMaterializations,
    rollbackGeneration: dryRun ? null : rollbackGeneration,
    sourceSelection: 'installed_package_lock' as const,
    networkAccessed: false as const,
  };
}

function discardCompensationBackups(surface: AgentPackagePhysicalSurface) {
  const policy = surface.workflow_policy_migration;
  if (policy.backup_root) {
    removeSafePersistedPackagePath({
      candidatePath: policy.backup_root,
      allowedRoots: [path.join(resolveOplStatePaths().state_dir, 'agent-package-transactions')],
      pathKind: 'optimization_compensation.workflow_policy_migration.backup_root',
      recursive: true,
    });
  }
  const profile = surface.profile_migration;
  for (const action of profile.mutation_actions) {
    if (action.backup_ref) {
      removeSafePersistedPackagePath({
        candidatePath: action.backup_ref,
        allowedRoots: [path.join(resolveCodexHome(), 'state')],
        pathKind: 'optimization_compensation.profile_migration.backup_ref',
      });
    }
  }
  if (profile.merge_packet_path) {
    removeSafePersistedPackagePath({
      candidatePath: profile.merge_packet_path,
      allowedRoots: [path.join(resolveCodexHome(), 'state')],
      pathKind: 'optimization_compensation.profile_migration.merge_packet_path',
      recursive: true,
    });
  }
}

function compensateOptimizationRollback(input: {
  currentRoot: AgentPackageLock;
  currentLocks: AgentPackageLock[];
  restoredRoot: AgentPackageLock;
  restoredSurface: AgentPackagePhysicalSurface | null;
  rolledBackScopes: AgentPackageScopeMaterialization[];
  profileTargets: Map<string, Buffer | null>;
}) {
  if (input.restoredSurface) {
    removePhysicalCodexSurface(input.restoredSurface, false, input.currentRoot.package_id, {
      retainPayloadSource: true,
      retainPluginCache: true,
    });
  }
  const compensationSurface = rematerializePhysicalCodexSurfaceFromLock(input.currentRoot, false, {
    companionNetworkAccess: 'forbidden',
  });
  for (const scope of input.rolledBackScopes) {
    const provider = input.currentLocks.find((entry) => entry.package_id === scope.provider_package_id);
    if (!provider) continue;
    const restoredScope = input.restoredRoot.scope_materializations.find((entry) =>
      entry.scope === scope.scope
      && entry.target_root === scope.target_root
      && entry.provider_package_id === scope.provider_package_id) ?? null;
    const materialization = materializeCapabilityScopeFromLock({
      provider,
      scope: scope.scope,
      targetRoot: scope.target_root,
      transactionId: scope.transaction_id,
      dryRun: false,
      retainTransactionBackup: true,
      previousMaterialization: restoredScope,
    });
    materialization.lifecycle_receipt_ref = scope.lifecycle_receipt_ref;
  }
  discardCompensationBackups(compensationSurface);
  for (const [targetPath, content] of input.profileTargets) {
    if (content === null) {
      removeSafePersistedPackagePath({
        candidatePath: targetPath,
        allowedRoots: [resolveCodexHome()],
        pathKind: 'optimization_compensation.profile_target',
      });
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
  }
}

export function rollbackInstalledPackageOptimization(input: {
  index: AgentPackageLockIndex;
  root: AgentPackageLock;
  generation: AgentPackageLastKnownGood;
  optimizeReceipt: AgentPackageLifecycleReceipt;
  action: AgentPackagePackageActionInput;
}) {
  const dryRun = input.action.dryRun === true;
  const currentLocks = structuredClone(installedClosure(input.index, input.root));
  const restoredLocks = structuredClone(input.generation.package_locks);
  const restoredRoot = restoredLocks.find((entry) => entry.package_id === input.root.package_id);
  if (!restoredRoot) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed-source optimization rollback requires the previous root package lock.',
      {
        package_id: input.root.package_id,
        failure_code: 'agent_package_optimize_rollback_root_missing',
      },
    );
  }

  const optimizedScopes = input.optimizeReceipt.scope_materializations ?? [];
  assertManagedPolicyRollbackReady(input.root.physical_surface?.workflow_policy_migration);
  assertPackageProfileRollbackReady(input.root.physical_surface?.profile_migration);
  for (const scope of optimizedScopes) assertCapabilityScopeRollbackReady(scope);
  validatePreviousPhysicalSurface(restoredRoot);

  const closureDigest = dependencyClosureDigest(restoredLocks);
  const transactionId = sha256Text([
    'rollback-installed-source-optimize',
    input.root.package_id,
    input.optimizeReceipt.receipt_ref,
    input.generation.transaction_id,
  ].join('\n'));
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
  }));
  const receipt = lifecycleReceipt({
    action: 'rollback',
    actionStatus: dryRun ? 'validated' : 'completed',
    packageId: restoredRoot.package_id,
    manifestUrl: restoredRoot.manifest_url,
    manifestSha256: restoredRoot.manifest_sha256,
    packageLockRef: restoredRoot.lock_ref,
    rollbackRef: restoredRoot.rollback_ref,
    sourceKind: restoredRoot.source_kind,
    trustTier: restoredRoot.trust_tier,
    sourceSha256: transactionId,
    writesPerformed: !dryRun,
    dependencyTransactionId: restoredRoot.dependency_transaction_id,
    dependencyClosureDigest: closureDigest,
    dependencyPackages,
    scopeMaterializations: restoredRoot.scope_materializations,
    managedRuntimeSource: restoredRoot.managed_runtime_source,
    sourceArtifactRef: restoredRoot.source_artifact_ref,
    artifactDigest: restoredRoot.artifact_digest,
    ownerSourceCommit: restoredRoot.owner_source_commit,
    carrierAuthority: restoredRoot.carrier_authority,
    releaseChannelRef: restoredRoot.release_channel_ref,
    releaseChannelDigest: restoredRoot.release_channel_digest,
    sourceSelection: 'installed_package_lock',
    networkAccessed: false,
    remoteDependencyPolicy: 'forbidden',
  });
  restoredRoot.action_receipt_id = receipt.receipt_ref;
  if (!dryRun) restoredRoot.updated_at = nowIso();

  if (!dryRun) {
    let rolledBackPolicy: ReturnType<typeof rollbackManagedPolicyMigration> | null = null;
    let rolledBackProfile: ReturnType<typeof rollbackPackageProfileMigration> | null = null;
    const rolledBackScopes: AgentPackageScopeMaterialization[] = [];
    const profileTargets = new Map<string, Buffer | null>();
    for (const action of input.root.physical_surface?.profile_migration.mutation_actions ?? []) {
      if (profileTargets.has(action.target_path)) continue;
      profileTargets.set(
        action.target_path,
        fs.existsSync(action.target_path) ? fs.readFileSync(action.target_path) : null,
      );
    }
    let restoredSurface: AgentPackagePhysicalSurface | null = null;
    try {
      rolledBackPolicy = rollbackManagedPolicyMigration(
        input.root.physical_surface?.workflow_policy_migration,
        { retainBackups: true },
      );
      rolledBackProfile = rollbackPackageProfileMigration(
        input.root.physical_surface?.profile_migration,
        { retainBackups: true },
      );
      for (const scope of [...optimizedScopes].reverse()) {
        rollbackCapabilityScopeTransaction(scope);
        rolledBackScopes.push(scope);
      }
      removePhysicalCodexSurface(input.root.physical_surface, false, input.root.package_id, {
        retainPayloadSource: true,
        retainPluginCache: true,
      });
      restoredSurface = restorePreviousPhysicalSurface(restoredRoot);
      restoredRoot.physical_surface = restoredSurface;
      const currentIds = new Set(currentLocks.map((entry) => entry.package_id));
      const restoredIds = new Set(restoredLocks.map((entry) => entry.package_id));
      const nextIndex = structuredClone(input.index);
      nextIndex.packages = [
        ...restoredLocks,
        ...nextIndex.packages.filter((entry) =>
          !currentIds.has(entry.package_id) && !restoredIds.has(entry.package_id)),
      ];
      nextIndex.last_known_good_transactions = (nextIndex.last_known_good_transactions ?? [])
        .filter((entry) => entry.transaction_id !== input.generation.transaction_id);
      writePackageTransaction(nextIndex, [receipt]);
    } catch (error) {
      try {
        compensateOptimizationRollback({
          currentRoot: input.root,
          currentLocks,
          restoredRoot,
          restoredSurface,
          rolledBackScopes,
          profileTargets,
        });
      } catch (compensationError) {
        throw new AggregateError(
          [error, compensationError],
          'Installed-source optimization rollback failed and compensation did not restore the optimized state.',
        );
      }
      throw error;
    }
    if (rolledBackPolicy?.status === 'rolled_back') finalizeManagedPolicyRollback(rolledBackPolicy);
    if (rolledBackProfile?.status === 'rolled_back') finalizePackageProfileRollback(rolledBackProfile);
  }

  return {
    status: dryRun ? 'validated_no_write' : 'rolled_back',
    root: restoredRoot,
    locks: restoredLocks,
    receipt,
    closureDigest,
    scopeMaterializations: restoredRoot.scope_materializations,
    sourceSelection: 'installed_package_lock' as const,
    networkAccessed: false as const,
  };
}
