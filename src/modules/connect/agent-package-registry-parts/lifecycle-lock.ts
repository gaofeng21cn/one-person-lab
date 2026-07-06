import fs from 'node:fs';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { unregisterLocalCodexPlugin } from '../system-installation/codex-plugin-registry.ts';
import { nowIso, refsOnlyAuthorityBoundary, sha256Text } from './shared.ts';
import type {
  AgentPackageInstallInput,
  AgentPackageLifecycleAction,
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifest,
  AgentPackagePhysicalSurface,
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
    repair: 'repaired',
    rollback: 'rolled_back',
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
}): AgentPackageLifecycleReceipt {
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
    package_lock_ref: input.packageLockRef ?? null,
    rollback_ref: input.rollbackRef ?? null,
    source_kind: input.sourceKind,
    trust_tier: input.trustTier ?? null,
    writes_performed: input.writesPerformed,
    source_surface: 'opl_connect_agent_package_registry',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
  if (input.physicalSurface) {
    receipt.physical_surface = input.physicalSurface;
  }
  return receipt;
}

export function permissionScopeSha256(manifest: AgentPackageManifest) {
  return sha256Text(JSON.stringify({
    codex_visible_entry: manifest.codex_visible_entry,
    bundled_required_skill_ids: manifest.required_skill_ids,
    optional_skill_refs: manifest.optional_skill_refs,
    entrypoints: manifest.entrypoints,
    permissions: manifest.permissions,
  }));
}

export function assertPermissionScopeUnchanged(previousLock: AgentPackageLock | null, manifest: AgentPackageManifest, action: 'install' | 'update' | 'rollback') {
  if (!previousLock || action === 'install') {
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
}): AgentPackageLock {
  const timestamp = nowIso();
  const distributionPayload = input.manifest.distribution_payload;
  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: input.manifest.package_id,
    agent_id: input.manifest.agent_id,
    display_name: input.manifest.display_name,
    publisher: input.manifest.publisher,
    version_or_source_digest: distributionPayload
      ? `${distributionPayload.immutable_tag}@${distributionPayload.payload_digest_ref}`
      : `${input.manifest.version}+sha256:${input.manifestSha256}`,
    package_version: input.manifest.version,
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
    ...(distributionPayload
      ? {
          oci_ref: distributionPayload.oci_ref,
          resolved_digest: distributionPayload.payload_digest_ref,
          immutable_tag: distributionPayload.immutable_tag,
          rolling_tag: distributionPayload.rolling_tag,
          install_truth: distributionPayload.install_truth,
        }
      : {}),
    permission_scope_sha256: permissionScopeSha256(input.manifest),
    lock_ref: packageLockRef(input.manifest.package_id, input.manifest.version, input.manifestSha256),
    physical_surface: input.physicalSurface,
    exposure_state: input.previousLock?.exposure_state ?? 'visible',
    exposure_updated_at: input.previousLock?.exposure_updated_at ?? timestamp,
  };
}

export function cleanupPreviousPhysicalSurface(
  previous: AgentPackagePhysicalSurface | undefined,
  current: AgentPackagePhysicalSurface,
) {
  if (!previous || previous.status === 'not_requested') {
    return;
  }

  if (
    previous.plugin_id
    && previous.marketplace_id
    && (previous.plugin_id !== current.plugin_id || previous.marketplace_id !== current.marketplace_id)
  ) {
    unregisterLocalCodexPlugin(previous.codex_config_path, previous.marketplace_id, previous.plugin_id);
  }

  for (const oldPath of [previous.codex_plugin_cache_path, previous.marketplace_plugin_path, previous.plugin_payload_cache_path]) {
    if (
      oldPath
      && oldPath !== current.codex_plugin_cache_path
      && oldPath !== current.marketplace_plugin_path
      && oldPath !== current.plugin_payload_cache_path
    ) {
      fs.rmSync(oldPath, { recursive: true, force: true });
    }
  }
}
