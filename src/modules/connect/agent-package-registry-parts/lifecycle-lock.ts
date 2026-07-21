import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { unregisterLocalCodexPlugin } from '../system-installation/codex-plugin-registry.ts';
import { removeSafePersistedPackagePath } from './persisted-path-safety.ts';
import {
  nowIso,
  refsOnlyAuthorityBoundary,
  resolveCodexConfigPath,
  resolveCodexHome,
  sha256Text,
} from './shared.ts';
import type {
  AgentPackageInstallInput,
  AgentPackageCarrierAuthority,
  AgentPackageLifecycleAction,
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifest,
  AgentPackagePhysicalSurface,
  AgentPackageResolvedDependency,
  AgentPackageManagedRuntimeSourceState,
  AgentPackageScopeMaterialization,
  AgentPackageSourceKind,
} from './types.ts';

export function packageReceiptRef(input: {
  action: AgentPackageLifecycleAction;
  packageId?: string | null;
  sourceSha256: string;
}) {
  const subject = canonicalAgentPackageId(input.packageId) ?? 'registry';
  return `opl://agent-package/${input.action}/${encodeURIComponent(subject)}/${input.sourceSha256.slice(0, 16)}`;
}

export function packageLockRef(packageId: string, version: string, sourceSha256: string) {
  const canonicalPackageId = canonicalAgentPackageId(packageId) ?? packageId;
  return `opl://agent-package-lock/${encodeURIComponent(canonicalPackageId)}/${encodeURIComponent(version)}/${sourceSha256.slice(0, 16)}`;
}

export function packageActionSourceSha256(action: AgentPackageLifecycleAction, lock: AgentPackageLock) {
  return sha256Text([
    action,
    lock.package_id,
    lock.package_version,
    lock.manifest_sha256,
    lock.lock_ref,
  ].join('\n'));
}

export function packageActionStatus(action: AgentPackageLifecycleAction) {
  return {
    install: 'installed',
    update: 'updated',
    optimize: 'optimized',
    repair: 'repaired',
    activate: 'activated',
    use: 'used',
    rollback: 'rolled_back',
    profile_apply: 'profile_applied',
    uninstall: 'uninstalled',
    hide: 'hidden',
    unhide: 'visible',
    enable: 'enabled',
    disable: 'disabled',
    home_shortcut_preferences_set: 'preferences_updated',
    registry_refresh: 'refreshed',
    manifest_validate: 'valid',
  }[action];
}

export function requirePackageId(packageId: string | null | undefined, action: AgentPackageLifecycleAction) {
  const normalized = canonicalAgentPackageId(packageId);
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', `Agent package ${action} requires --package-id.`, {
      required: ['--package-id'],
      action,
    });
  }
  return normalized;
}

export function requireInstalledPackage(index: AgentPackageLockIndex, packageId: string, action: AgentPackageLifecycleAction) {
  const lockIndex = index.packages.findIndex((entry) => entry.package_id === packageId);
  if (lockIndex < 0) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent package ${action} requires an installed package lock.`, {
      package_id: packageId,
      action,
      failure_code: 'agent_package_lock_missing',
      installed_package_ids: index.packages.map((entry) => entry.package_id),
    });
  }
  return { lockIndex, lock: index.packages[lockIndex] };
}

export function lifecycleReceipt(input: {
  action: AgentPackageLifecycleAction;
  actionStatus: 'completed' | 'validated';
  packageId?: string | null;
  registryUrl?: string | null;
  manifestUrl?: string | null;
  manifestSha256?: string | null;
  packageLockRef?: string | null;
  rollbackRef?: string | null;
  sourceKind: AgentPackageLifecycleReceipt['source_kind'];
  trustTier?: string | null;
  sourceSha256: string;
  writesPerformed: boolean;
  physicalSurface?: AgentPackagePhysicalSurface;
  dependencyTransactionId?: string;
  dependencyClosureDigest?: string;
  dependencyPackages?: AgentPackageLifecycleReceipt['dependency_packages'];
  scopeMaterialization?: AgentPackageScopeMaterialization;
  scopeMaterializations?: AgentPackageScopeMaterialization[];
  managedRuntimeSource?: AgentPackageManagedRuntimeSourceState | null;
  developerCheckoutSource?: AgentPackageLifecycleReceipt['developer_checkout_source'];
  sourceArtifactRef?: string | null;
  artifactDigest?: string | null;
  ownerSourceCommit?: string | null;
  carrierAuthority?: AgentPackageCarrierAuthority | null;
  releaseChannelRef?: string | null;
  releaseChannelDigest?: string | null;
  useBinding?: AgentPackageLifecycleReceipt['use_binding'];
  sourceSelection?: AgentPackageLifecycleReceipt['source_selection'];
  networkAccessed?: AgentPackageLifecycleReceipt['network_accessed'];
  remoteDependencyPolicy?: AgentPackageLifecycleReceipt['remote_dependency_policy'];
  provenance?: AgentPackageInstallInput['provenance'];
}): AgentPackageLifecycleReceipt {
  const operationId = input.provenance?.operation_id ?? packageReceiptRef({
    action: input.action,
    packageId: input.packageId,
    sourceSha256: input.sourceSha256,
  });
  const receipt: AgentPackageLifecycleReceipt = {
    surface_kind: 'opl_agent_package_lifecycle_receipt',
    receipt_ref: packageReceiptRef({
      action: input.action,
      packageId: input.packageId,
      sourceSha256: input.sourceSha256,
    }),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    action: input.action,
    action_status: input.actionStatus,
    package_id: input.packageId ?? null,
    registry_url: input.registryUrl ?? null,
    manifest_url: input.manifestUrl ?? null,
    manifest_sha256: input.manifestSha256 ?? null,
    source_artifact_ref: input.sourceArtifactRef ?? null,
    artifact_digest: input.artifactDigest ?? null,
    owner_source_commit: input.ownerSourceCommit ?? null,
    carrier_authority: input.carrierAuthority ?? null,
    release_channel_ref: input.releaseChannelRef ?? null,
    release_channel_digest: input.releaseChannelDigest ?? null,
    package_lock_ref: input.packageLockRef ?? null,
    rollback_ref: input.rollbackRef ?? null,
    source_kind: input.sourceKind,
    trust_tier: input.trustTier ?? null,
    writes_performed: input.writesPerformed,
    source_surface: 'opl_connect_agent_package_registry',
    trigger: input.provenance?.trigger ?? 'explicit_package_action',
    initiator: input.provenance?.initiator ?? 'opl_cli_or_app_action',
    source_policy: input.provenance?.source_policy ?? input.sourceKind,
    source_policy_reason: input.provenance?.source_policy_reason ?? 'explicit_package_action_selection',
    operation_id: operationId,
    correlation_id: input.provenance?.correlation_id ?? operationId,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
  if (input.physicalSurface) {
    receipt.physical_surface = input.physicalSurface;
  }
  if (input.dependencyTransactionId) receipt.dependency_transaction_id = input.dependencyTransactionId;
  if (input.dependencyClosureDigest) receipt.dependency_closure_digest = input.dependencyClosureDigest;
  if (input.dependencyPackages) receipt.dependency_packages = input.dependencyPackages;
  if (input.scopeMaterialization) receipt.scope_materialization = input.scopeMaterialization;
  if (input.scopeMaterializations) receipt.scope_materializations = input.scopeMaterializations;
  if (input.managedRuntimeSource !== undefined) receipt.managed_runtime_source = input.managedRuntimeSource;
  if (input.developerCheckoutSource !== undefined) {
    receipt.developer_checkout_source = input.developerCheckoutSource;
  }
  if (input.useBinding) receipt.use_binding = input.useBinding;
  if (input.sourceSelection) receipt.source_selection = input.sourceSelection;
  if (input.networkAccessed !== undefined) receipt.network_accessed = input.networkAccessed;
  if (input.remoteDependencyPolicy) receipt.remote_dependency_policy = input.remoteDependencyPolicy;
  return receipt;
}

export function permissionScopeSha256(manifest: AgentPackageManifest) {
  return sha256Text(JSON.stringify({
    codex_default_exposure: manifest.codex_default_exposure === false ? false : undefined,
    codex_visible_entry: manifest.codex_visible_entry,
    entrypoints: manifest.entrypoints,
    permissions: manifest.permissions,
    runtime_source_carrier: manifest.runtime_source_carrier,
  }));
}

export function assertPermissionScopeUnchanged(previousLock: AgentPackageLock | null, manifest: AgentPackageManifest, action: 'install' | 'update') {
  if (!previousLock || action === 'install') {
    return;
  }
  if (previousLock.capability_provider && manifest.capability_provider) {
    return;
  }
  const nextSha256 = permissionScopeSha256(manifest);
  if (previousLock.permission_scope_sha256 && previousLock.permission_scope_sha256 !== nextSha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package permission or scope changes require manual confirmation before update.', {
      package_id: manifest.package_id,
      action,
      failure_code: 'agent_package_permission_scope_change_requires_manual_confirmation',
      previous_permission_scope_sha256: previousLock.permission_scope_sha256,
      next_permission_scope_sha256: nextSha256,
      manual_confirmation_path: 'uninstall the existing lock, review the manifest, then run install explicitly',
    });
  }
}

export function buildLock(input: {
  manifest: AgentPackageManifest;
  manifestUrl: string;
  manifestSha256: string;
  sourceKind: AgentPackageSourceKind;
  trustTier: string;
  receiptRef: string;
  physicalSurface: AgentPackagePhysicalSurface;
  previousLock?: AgentPackageLock | null;
  resolvedDependencies?: AgentPackageResolvedDependency[];
  dependencyClosureDigest?: string;
  dependencyTransactionId?: string;
  scopeMaterialization?: AgentPackageScopeMaterialization | null;
  managedRuntimeSource?: AgentPackageManagedRuntimeSourceState | null;
  sourceArtifactRef?: string | null;
  artifactDigest?: string | null;
  ownerSourceCommit?: string | null;
  carrierAuthority?: AgentPackageCarrierAuthority | null;
  releaseChannelRef?: string | null;
  releaseChannelDigest?: string | null;
}): AgentPackageLock {
  const timestamp = nowIso();
  const distributionPayload = input.manifest.distribution_payload;
  const exposureState = input.manifest.codex_default_exposure === false
    ? 'hidden' as const
    : input.previousLock?.exposure_state ?? 'visible';
  const exposureUpdatedAt = input.previousLock?.exposure_state === exposureState
    ? input.previousLock.exposure_updated_at ?? timestamp
    : timestamp;
  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: input.manifest.package_id,
    agent_id: input.manifest.agent_id,
    package_role: input.manifest.package_role,
    display_name: input.manifest.display_name,
    publisher: input.manifest.publisher,
    version_or_source_digest: distributionPayload
      ? `${distributionPayload.immutable_tag}@${distributionPayload.payload_digest_ref}`
      : `${input.manifest.version}+sha256:${input.manifestSha256}`,
    package_version: input.manifest.version,
    owner_language_version: input.manifest.owner_language_version,
    installed_at: input.previousLock?.installed_at ?? timestamp,
    updated_at: timestamp,
    codex_visible_entry: input.manifest.codex_visible_entry,
    bundled_required_skill_ids: input.manifest.required_skill_ids,
    optional_skill_refs: input.manifest.optional_skill_refs,
    source_kind: input.sourceKind,
    trust_tier: input.trustTier,
    action_receipt_id: input.receiptRef,
    rollback_ref: input.manifest.rollback_ref,
    manifest_url: input.manifestUrl,
    manifest_sha256: input.manifestSha256,
    source_artifact_ref: input.sourceArtifactRef ?? null,
    artifact_digest: input.artifactDigest ?? null,
    owner_source_commit: input.ownerSourceCommit ?? null,
    carrier_authority: input.carrierAuthority ?? null,
    release_channel_ref: input.releaseChannelRef ?? null,
    release_channel_digest: input.releaseChannelDigest ?? null,
    ...(distributionPayload
      ? {
          oci_ref: distributionPayload.oci_ref,
          resolved_digest: distributionPayload.payload_digest_ref,
          immutable_tag: distributionPayload.immutable_tag,
          moving_tag: distributionPayload.moving_tag,
          install_truth: distributionPayload.install_truth,
        }
      : {}),
    permission_scope_sha256: permissionScopeSha256(input.manifest),
    lock_ref: packageLockRef(input.manifest.package_id, input.manifest.version, input.manifestSha256),
    physical_surface: input.physicalSurface,
    exposure_state: exposureState,
    exposure_updated_at: exposureUpdatedAt,
    capability_provider: input.manifest.capability_provider,
    capability_dependencies: input.manifest.capability_dependencies,
    resolved_dependencies: input.resolvedDependencies ?? [],
    dependency_closure_digest: input.dependencyClosureDigest ?? '',
    dependency_transaction_id: input.dependencyTransactionId ?? '',
    content_digest: input.manifest.content_digest
      ?? input.manifest.distribution_payload?.payload_digest_ref
      ?? `sha256:${input.manifestSha256}`,
    content_lock_paths: input.manifest.content_lock_paths,
    scope_materializations: input.scopeMaterialization
      ? [
          input.scopeMaterialization,
          ...(input.previousLock?.scope_materializations ?? []).filter((entry) =>
            entry.scope !== input.scopeMaterialization!.scope
            || entry.target_root !== input.scopeMaterialization!.target_root),
        ]
      : input.previousLock?.scope_materializations ?? [],
    runtime_source_carrier: input.manifest.runtime_source_carrier,
    managed_runtime_source: input.managedRuntimeSource ?? null,
    managed_update_source: input.manifest.managed_update_source,
    developer_checkout_source: input.manifest.developer_checkout_source ?? null,
  };
}

export function cleanupPreviousPhysicalSurface(
  previous: AgentPackagePhysicalSurface | undefined,
  current: AgentPackagePhysicalSurface,
  options: { retainPayloadSource?: boolean; retainedPaths?: ReadonlySet<string> } = {},
) {
  if (!previous || previous.status === 'not_requested') {
    return;
  }

  if (
    previous.plugin_id
    && previous.marketplace_id
    && (previous.plugin_id !== current.plugin_id || previous.marketplace_id !== current.marketplace_id)
  ) {
    const expectedConfigPath = resolveCodexConfigPath(resolveCodexHome());
    if (path.resolve(previous.codex_config_path) !== path.resolve(expectedConfigPath)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Persisted package Codex config path does not match the active Codex home.', {
        codex_config_path: previous.codex_config_path,
        expected_codex_config_path: expectedConfigPath,
        failure_code: 'agent_package_persisted_path_unsafe',
      });
    }
    unregisterLocalCodexPlugin(previous.codex_config_path, previous.marketplace_id, previous.plugin_id);
  }

  const removals = [
    previous.codex_plugin_cache_path ? {
      path: previous.codex_plugin_cache_path,
      root: path.join(resolveCodexHome(), 'plugins', 'cache'),
      kind: 'previous_physical_surface.codex_plugin_cache_path',
    } : null,
    previous.marketplace_plugin_path ? {
      path: previous.marketplace_plugin_path,
      root: path.join(resolveOplStatePaths().state_dir, 'codex-plugin-marketplaces'),
      kind: 'previous_physical_surface.marketplace_plugin_path',
    } : null,
    !options.retainPayloadSource && previous.plugin_payload_cache_path ? {
      path: previous.plugin_payload_cache_path,
      root: path.join(resolveOplStatePaths().state_dir, 'agent-package-payloads'),
      kind: 'previous_physical_surface.plugin_payload_cache_path',
    } : null,
  ].flatMap((entry) => entry ? [entry] : []);
  for (const removal of removals) {
    const oldPath = removal.path;
    if (
      !options.retainedPaths?.has(oldPath)
      && oldPath !== current.codex_plugin_cache_path
      && oldPath !== current.marketplace_plugin_path
      && oldPath !== current.plugin_payload_cache_path
    ) {
      removeSafePersistedPackagePath({
        candidatePath: oldPath,
        allowedRoots: [removal.root],
        pathKind: removal.kind,
        recursive: true,
      });
    }
  }
}
