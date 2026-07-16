import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  assertFirstPartyPackageCatalogVersion,
  resolveFirstPartyPackageCatalog,
} from '../agent-package-first-party.ts';
import {
  catalogManifestPayload,
  selectCapabilityCatalogVersion,
  type ManagedCatalogVersion,
  type ManagedPackageCatalog,
} from './capability-reconciliation.ts';
import { agentPackageTargetCurrentness } from './currentness.ts';
import {
  developerCheckoutPackageCurrentness,
  loadDeveloperCheckoutPackageSource,
} from './developer-checkout-package-source.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import { ownerRouteReadback } from './readback.ts';
import { refsOnlyAuthorityBoundary } from './shared.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './source-policy.ts';
import type {
  AgentPackageInstallInput,
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackagePhysicalSurface,
} from './types.ts';

type AgentPackageUpdateApplicationResult = {
  status: string;
  lock: AgentPackageLock;
  physicalSurface: AgentPackagePhysicalSurface | undefined;
  frameworkLink: unknown;
  receipt: AgentPackageLifecycleReceipt | null;
  registryEntry: unknown;
  closureLocks: AgentPackageLock[];
  closureReceipts: AgentPackageLifecycleReceipt[];
  dependencyTransactionId: string;
  dependencyClosureDigest: string;
};

export type AgentPackageCatalogClosureTarget = {
  packageId: string;
  targetVersion: ManagedCatalogVersion | null;
  developerTarget: ReturnType<typeof loadDeveloperCheckoutPackageSource> | null;
  sourcePolicy: ReturnType<typeof resolveAgentPackageEffectiveSourcePolicy>;
};

type AgentPackageUpdateReconciliation = {
  action: 'update' | 'source_reconcile' | null;
  currentness: ReturnType<typeof agentPackageTargetCurrentness>;
  closureCurrentness: ReturnType<typeof agentPackageClosureTargetCurrentness>;
  sourcePolicy: ReturnType<typeof resolveAgentPackageEffectiveSourcePolicy>;
  targetIdentity: {
    packageVersion: string;
    manifestSha256: string;
    contentDigest: string | null;
    artifactDigest: string | null;
    sourceArtifactRef: string | null;
  };
  catalogRef: string | null;
  catalogDigest: string | null;
  catalogFreshness: 'live' | 'cached' | 'last_known_good' | null;
  checkedAt: string;
};

export function agentPackageUpdateReadback(
  input: AgentPackageInstallInput,
  result: AgentPackageUpdateApplicationResult,
  reconciliation: AgentPackageUpdateReconciliation | null = null,
) {
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
      ...(reconciliation ? {
        source_policy: reconciliation.sourcePolicy,
        currentness: reconciliation.currentness,
        closure_currentness: reconciliation.closureCurrentness,
        reconciliation_action: reconciliation.action,
        target_version: reconciliation.targetIdentity.packageVersion,
        target_manifest_sha256: reconciliation.targetIdentity.manifestSha256,
        target_content_digest: reconciliation.targetIdentity.contentDigest,
        target_artifact_digest: reconciliation.targetIdentity.artifactDigest,
        target_source_artifact_ref: reconciliation.targetIdentity.sourceArtifactRef,
        release_catalog_ref: reconciliation.catalogRef,
        release_catalog_digest: reconciliation.catalogDigest,
        release_catalog_freshness: reconciliation.catalogFreshness,
        release_catalog_checked_at: reconciliation.checkedAt,
      } : {}),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function assertFirstPartyPackageUpdateSelection(
  input: AgentPackageInstallInput,
  firstParty: NonNullable<ReturnType<typeof resolveFirstPartyPackageCatalog>>,
  sourcePolicy: ReturnType<typeof resolveAgentPackageEffectiveSourcePolicy>,
) {
  const manifestUrl = stringValue(input.manifestUrl);
  const registryUrl = stringValue(input.registryUrl);
  if (manifestUrl || registryUrl) {
    throw new FrameworkContractError('contract_shape_invalid', 'Canonical first-party packages must resolve through the Framework-owned Release Set catalog.', {
      package_id: firstParty.canonicalId,
      explicit_manifest_source: Boolean(manifestUrl),
      explicit_registry_source: Boolean(registryUrl),
      failure_code: 'first_party_package_explicit_source_forbidden',
    });
  }
  const requestedTrustTier = stringValue(input.trustTier);
  if (requestedTrustTier && requestedTrustTier !== firstParty.trustTier) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party catalog packages use the fixed first_party trust tier.', {
      package_id: firstParty.canonicalId,
      requested_trust_tier: requestedTrustTier,
      required_trust_tier: firstParty.trustTier,
      failure_code: 'first_party_package_trust_tier_override_forbidden',
    });
  }
  if (!sourcePolicy.desired_source_kind) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party Package update requires an effective managed or developer source policy.', {
      package_id: firstParty.canonicalId,
      source_policy_reason: sourcePolicy.reason,
      failure_code: 'first_party_package_source_policy_unresolved',
    });
  }
  if (input.sourceKind && input.sourceKind !== sourcePolicy.desired_source_kind) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party Package source kind must match the effective module source policy.', {
      package_id: firstParty.canonicalId,
      requested_source_kind: input.sourceKind,
      required_source_kind: sourcePolicy.desired_source_kind,
      source_policy_reason: sourcePolicy.reason,
      failure_code: 'first_party_package_source_kind_policy_mismatch',
    });
  }
  if (sourcePolicy.desired_source_kind !== 'developer_checkout_override') return;
  if (!sourcePolicy.developer_checkout_available || !sourcePolicy.developer_checkout_path) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer Mode selected a package checkout that is not available.', {
      package_id: firstParty.canonicalId,
      module_id: sourcePolicy.module_id,
      checkout_path: sourcePolicy.developer_checkout_path,
      source_policy_reason: sourcePolicy.reason,
      failure_code: 'agent_package_developer_checkout_unavailable',
    });
  }
  const requestedCheckoutPath = stringValue(input.agentRoot);
  if (requestedCheckoutPath
    && path.resolve(requestedCheckoutPath) !== path.resolve(sourcePolicy.developer_checkout_path)) {
    throw new FrameworkContractError('contract_shape_invalid', 'First-party Package developer checkout must match the effective module source policy.', {
      package_id: firstParty.canonicalId,
      requested_checkout_path: path.resolve(requestedCheckoutPath),
      required_checkout_path: path.resolve(sourcePolicy.developer_checkout_path),
      source_policy_reason: sourcePolicy.reason,
      failure_code: 'first_party_package_developer_checkout_path_mismatch',
    });
  }
}

export function developerAgentRootsForPackageIds(packageIds: Iterable<string>) {
  return Object.fromEntries([...new Set(packageIds)].flatMap((packageId) => {
    const policy = resolveAgentPackageEffectiveSourcePolicy(packageId);
    return policy.desired_source_kind === 'developer_checkout_override'
      && policy.developer_checkout_available
      && policy.developer_checkout_path
      ? [[packageId, policy.developer_checkout_path]]
      : [];
  }));
}

export function firstPartyCatalogClosure(
  catalog: ManagedPackageCatalog | null,
  rootPackageId: string,
  rootVersion: ManagedCatalogVersion | null,
) {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: AgentPackageCatalogClosureTarget[] = [];
  const visit = (packageId: string, targetVersion: ManagedCatalogVersion | null) => {
    if (visited.has(packageId)) return;
    if (visiting.has(packageId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package closure contains a dependency cycle.', {
        package_id: packageId,
        failure_code: 'agent_package_dependency_cycle',
      });
    }
    visiting.add(packageId);
    const sourcePolicy = resolveAgentPackageEffectiveSourcePolicy(packageId);
    if (!sourcePolicy.desired_source_kind) {
      throw new FrameworkContractError('contract_shape_invalid', 'First-party Package closure requires an effective managed or developer source policy.', {
        package_id: packageId,
        source_policy_reason: sourcePolicy.reason,
        failure_code: 'first_party_package_source_policy_unresolved',
      });
    }
    const developerTarget = sourcePolicy.desired_source_kind === 'developer_checkout_override'
      && sourcePolicy.developer_checkout_available
      && sourcePolicy.developer_checkout_path
      ? loadDeveloperCheckoutPackageSource(packageId, sourcePolicy.developer_checkout_path)
      : null;
    if (sourcePolicy.desired_source_kind === 'developer_checkout_override' && !developerTarget) {
      throw new FrameworkContractError('contract_shape_invalid', 'Developer Mode selected a package checkout that is not available.', {
        package_id: packageId,
        module_id: sourcePolicy.module_id,
        checkout_path: sourcePolicy.developer_checkout_path,
        source_policy_reason: sourcePolicy.reason,
        failure_code: 'agent_package_developer_checkout_unavailable',
      });
    }
    if (!developerTarget && !targetVersion) {
      throw new FrameworkContractError('codex_command_failed', 'Package-channel source is unavailable for a managed closure member.', {
        package_id: packageId,
        failure_code: 'agent_package_capability_channel_unavailable',
      });
    }
    const manifest = developerTarget
      ? developerTarget.ownerManifest
      : (() => {
          assertFirstPartyPackageCatalogVersion(packageId, targetVersion!);
          const payload = catalogManifestPayload(targetVersion!);
          if (!payload) {
            throw new FrameworkContractError('contract_shape_invalid', 'First-party Release Set package currentness requires an inline manifest.', {
              package_id: packageId,
              package_version: targetVersion!.package_version,
              failure_code: 'agent_package_catalog_inline_manifest_missing',
            });
          }
          return normalizePackageManifest(payload, targetVersion!.manifest_url);
        })();
    if (manifest.package_id !== packageId
      || (!developerTarget && manifest.version !== targetVersion!.package_version)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Release Set closure manifest identity does not match its catalog selection.', {
        package_id: packageId,
        manifest_package_id: manifest.package_id,
        package_version: targetVersion?.package_version ?? null,
        manifest_version: manifest.version,
        failure_code: 'agent_package_catalog_package_id_mismatch',
      });
    }
    for (const dependency of manifest.capability_dependencies) {
      const dependencyPolicy = resolveAgentPackageEffectiveSourcePolicy(dependency.package_id);
      const dependencyVersion = dependencyPolicy.desired_source_kind === 'developer_checkout_override'
        ? null
        : catalog
          ? selectCapabilityCatalogVersion(catalog, dependency)
          : null;
      visit(dependency.package_id, dependencyVersion);
    }
    visiting.delete(packageId);
    visited.add(packageId);
    ordered.push({ packageId, targetVersion, developerTarget, sourcePolicy });
  };
  visit(rootPackageId, rootVersion);
  return ordered;
}

export function agentPackageClosureTargetCurrentness(
  packages: AgentPackageLock[],
  targets: AgentPackageCatalogClosureTarget[],
) {
  const byId = new Map(packages.map((lock) => [lock.package_id, lock]));
  return targets.map(({ packageId, targetVersion, developerTarget, sourcePolicy }) => {
    const lock = byId.get(packageId) ?? null;
    const currentness = lock
      ? developerTarget
        ? developerCheckoutPackageCurrentness({
            lock,
            ownerManifest: developerTarget.ownerManifest,
            source: developerTarget.source,
          })
        : agentPackageTargetCurrentness({
            lock,
            target: targetVersion!,
            desiredSourceKind: sourcePolicy.desired_source_kind!,
          })
      : null;
    return {
      package_id: packageId,
      status: currentness?.status ?? 'update_available',
      reasons: currentness?.reasons ?? ['package_lock_missing'],
      target_version: developerTarget?.ownerManifest.version ?? targetVersion?.package_version ?? null,
      developer_target: developerTarget ? {
        package_version: developerTarget.ownerManifest.version,
        manifest_sha256: developerTarget.source.owner_manifest_sha256,
        content_digest: developerTarget.source.payload_digest,
        owner_source_commit: developerTarget.source.source_git_head_sha,
        tree_sha256: developerTarget.source.tree_sha256,
        checkout_path: developerTarget.source.checkout_path,
      } : null,
      source_policy: sourcePolicy,
      target_identity: developerTarget ? {
        package_version: developerTarget.ownerManifest.version,
        manifest_sha256: developerTarget.source.owner_manifest_sha256,
        content_digest: developerTarget.source.payload_digest,
        artifact_digest: null,
        source_artifact_ref: null,
      } : {
        package_version: targetVersion!.package_version,
        manifest_sha256: targetVersion!.manifest_sha256,
        content_digest: targetVersion!.content_digest,
        artifact_digest: targetVersion!.artifact_digest,
        source_artifact_ref: targetVersion!.source_artifact_ref,
      },
      currentness,
    };
  });
}

export function installedPackageClosure(
  packages: AgentPackageLock[],
  targets: AgentPackageCatalogClosureTarget[],
) {
  const byId = new Map(packages.map((lock) => [lock.package_id, lock]));
  return targets.map(({ packageId }) => byId.get(packageId)).filter((lock): lock is AgentPackageLock => Boolean(lock));
}

export function packageBulkUpdateSafety(lock: AgentPackageLock) {
  if (lock.source_kind === 'developer_checkout_override') {
    return { eligible: false, reason: 'developer_checkout_is_user_managed' } as const;
  }
  if (!lock.content_digest || !lock.manifest_sha256 || !lock.lock_ref) {
    return { eligible: false, reason: 'package_content_identity_incomplete' } as const;
  }
  if (lock.physical_surface?.failure_reason) {
    return { eligible: false, reason: 'package_physical_surface_requires_repair' } as const;
  }
  return { eligible: true, reason: 'installed_digest_locked_package' } as const;
}
