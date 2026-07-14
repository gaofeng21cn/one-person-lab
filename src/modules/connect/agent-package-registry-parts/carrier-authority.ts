import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

import type {
  AgentPackageCarrierAuthority,
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackageUseBinding,
} from './types.ts';

const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

export function buildAgentPackageCarrierAuthority(input: {
  packageId: string;
  catalogRef: string | null;
  catalogSha256: string | null;
  catalogOwnerSourceCommit: string | null;
  manifestCarrierSourceCommit: string | null;
  payloadSourceCommit: string | null;
}): AgentPackageCarrierAuthority {
  const failures = [
    input.catalogRef ? null : 'catalog_ref_missing',
    SHA256.test(input.catalogSha256 ?? '') ? null : 'catalog_sha256_invalid',
    EXACT_COMMIT.test(input.catalogOwnerSourceCommit ?? '') ? null : 'catalog_owner_source_commit_invalid',
    EXACT_COMMIT.test(input.manifestCarrierSourceCommit ?? '') ? null : 'manifest_carrier_source_commit_invalid',
    EXACT_COMMIT.test(input.payloadSourceCommit ?? '') ? null : 'payload_source_commit_invalid',
    input.catalogOwnerSourceCommit === input.manifestCarrierSourceCommit ? null : 'catalog_manifest_commit_mismatch',
    input.manifestCarrierSourceCommit === input.payloadSourceCommit ? null : 'manifest_payload_commit_mismatch',
  ].filter((failure): failure is string => failure !== null);
  if (failures.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package carrier authority is incomplete or inconsistent.', {
      package_id: input.packageId,
      catalog_ref: input.catalogRef,
      catalog_sha256: input.catalogSha256,
      catalog_owner_source_commit: input.catalogOwnerSourceCommit,
      manifest_carrier_source_commit: input.manifestCarrierSourceCommit,
      payload_source_commit: input.payloadSourceCommit,
      failures,
      failure_code: 'agent_package_carrier_authority_invalid',
    });
  }
  return {
    surface_kind: 'opl_agent_package_carrier_authority.v1',
    status: 'verified',
    catalog_ref: input.catalogRef!,
    catalog_sha256: input.catalogSha256!,
    catalog_owner_source_commit: input.catalogOwnerSourceCommit!,
    manifest_carrier_source_commit: input.manifestCarrierSourceCommit!,
    payload_source_commit: input.payloadSourceCommit!,
    verified_source_commit: input.payloadSourceCommit!,
  };
}

export function agentPackageCarrierAuthorityStatus(lock: AgentPackageLock) {
  const required = lock.source_kind === 'first_party_managed_cohort'
    || lock.source_kind === 'bundled_full_runtime_modules';
  const authority = lock.carrier_authority ?? null;
  if (!required && !authority) {
    return { status: 'not_required' as const, reasons: [] as string[] };
  }
  const reasons = [
    authority ? null : 'carrier_authority_missing',
    authority?.surface_kind === 'opl_agent_package_carrier_authority.v1' ? null : 'carrier_authority_surface_invalid',
    authority?.status === 'verified' ? null : 'carrier_authority_status_invalid',
    authority?.catalog_ref ? null : 'catalog_ref_missing',
    SHA256.test(authority?.catalog_sha256 ?? '') ? null : 'catalog_sha256_invalid',
    EXACT_COMMIT.test(lock.owner_source_commit ?? '') ? null : 'owner_source_commit_invalid',
    authority?.catalog_owner_source_commit === lock.owner_source_commit ? null : 'catalog_owner_source_commit_mismatch',
    authority?.manifest_carrier_source_commit === lock.owner_source_commit ? null : 'manifest_carrier_source_commit_mismatch',
    authority?.payload_source_commit === lock.owner_source_commit ? null : 'payload_source_commit_mismatch',
    authority?.verified_source_commit === lock.owner_source_commit ? null : 'verified_source_commit_mismatch',
    authority?.catalog_ref === lock.release_channel_ref ? null : 'catalog_ref_lock_mismatch',
    authority?.catalog_sha256 === lock.release_channel_digest ? null : 'catalog_sha256_lock_mismatch',
    !lock.runtime_source_carrier
      || lock.managed_runtime_source?.source_git_head_sha === lock.owner_source_commit
      ? null
      : 'runtime_source_commit_mismatch',
    lock.source_kind !== 'bundled_full_runtime_modules'
      || !lock.runtime_source_carrier
      || lock.managed_runtime_source?.source_mode === 'bundled_full_runtime'
      ? null
      : 'bundled_runtime_source_mode_mismatch',
  ].filter((reason): reason is string => reason !== null);
  return {
    status: reasons.length === 0 ? 'current' as const : 'invalid' as const,
    reasons,
  };
}

export function assertAgentPackageCarrierAuthority(lock: AgentPackageLock) {
  const result = agentPackageCarrierAuthorityStatus(lock);
  if (result.status !== 'invalid') return;
  throw new FrameworkContractError('contract_shape_invalid', 'Installed package carrier authority is missing or inconsistent.', {
    package_id: lock.package_id,
    source_kind: lock.source_kind,
    owner_source_commit: lock.owner_source_commit ?? null,
    carrier_authority: lock.carrier_authority ?? null,
    failures: result.reasons,
    failure_code: 'agent_package_lock_carrier_authority_invalid',
  });
}

export function agentPackageCarrierReceiptAuthorityStatus(
  lock: AgentPackageLock,
  receipt: AgentPackageLifecycleReceipt | null | undefined,
) {
  const lockStatus = agentPackageCarrierAuthorityStatus(lock);
  if (lockStatus.status !== 'current') return lockStatus;
  const reasons = [
    receipt ? null : 'lifecycle_receipt_missing',
    receipt?.receipt_ref === lock.action_receipt_id ? null : 'lifecycle_receipt_ref_mismatch',
    receipt?.package_id === lock.package_id ? null : 'lifecycle_receipt_package_id_mismatch',
    receipt?.package_lock_ref === lock.lock_ref ? null : 'lifecycle_receipt_package_lock_ref_mismatch',
    receipt?.owner_source_commit === lock.owner_source_commit ? null : 'lifecycle_receipt_owner_source_commit_mismatch',
    sameAgentPackageCarrierAuthority(receipt?.carrier_authority, lock.carrier_authority)
      ? null
      : 'lifecycle_receipt_carrier_authority_mismatch',
    receipt?.release_channel_ref === lock.release_channel_ref ? null : 'lifecycle_receipt_catalog_ref_mismatch',
    receipt?.release_channel_digest === lock.release_channel_digest ? null : 'lifecycle_receipt_catalog_sha256_mismatch',
  ].filter((reason): reason is string => reason !== null);
  return {
    status: reasons.length === 0 ? 'current' as const : 'invalid' as const,
    reasons,
  };
}

export function assertAgentPackageCarrierReceiptAuthority(
  lock: AgentPackageLock,
  receipt: AgentPackageLifecycleReceipt | null | undefined,
) {
  const result = agentPackageCarrierReceiptAuthorityStatus(lock, receipt);
  if (result.status !== 'invalid') return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Installed package lifecycle receipt does not preserve its carrier authority.',
    {
      package_id: lock.package_id,
      package_lock_ref: lock.lock_ref,
      action_receipt_id: lock.action_receipt_id,
      receipt_ref: receipt?.receipt_ref ?? null,
      failures: result.reasons,
      failure_code: 'agent_package_lifecycle_receipt_carrier_authority_invalid',
    },
  );
}

export function sameAgentPackageCarrierAuthority(
  left: AgentPackageCarrierAuthority | null | undefined,
  right: AgentPackageCarrierAuthority | null | undefined,
) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function boundPackageMatchesLock(
  bound: AgentPackageUseBinding['root_package'] | AgentPackageUseBinding['provider_packages'][number],
  lock: AgentPackageLock,
) {
  return bound.package_id === lock.package_id
    && bound.package_version === lock.package_version
    && bound.package_lock_ref === lock.lock_ref
    && bound.manifest_sha256 === lock.manifest_sha256
    && bound.content_digest === lock.content_digest
    && bound.source_artifact_ref === (lock.source_artifact_ref ?? null)
    && bound.artifact_digest === (lock.artifact_digest ?? null)
    && bound.owner_source_commit === (lock.owner_source_commit ?? null)
    && sameAgentPackageCarrierAuthority(bound.carrier_authority, lock.carrier_authority);
}

export function assertAgentPackageUseBindingCarrierAuthority(input: {
  binding: AgentPackageUseBinding;
  root: AgentPackageLock;
  installedLocks: AgentPackageLock[];
}) {
  const expectedProviderIds = [...new Set(
    (input.root.resolved_dependencies ?? []).map((entry) => entry.package_id),
  )].sort();
  const boundProviderIds = input.binding.provider_packages.map((entry) => entry.package_id).sort();
  const reasons = [
    input.binding.surface_kind === 'opl_agent_package_use_binding.v1' ? null : 'use_binding_surface_invalid',
    boundPackageMatchesLock(input.binding.root_package, input.root) ? null : 'root_package_authority_mismatch',
    input.binding.dependency_closure_digest === input.root.dependency_closure_digest
      ? null
      : 'dependency_closure_digest_mismatch',
    JSON.stringify(boundProviderIds) === JSON.stringify(expectedProviderIds)
      ? null
      : 'provider_package_set_mismatch',
    ...expectedProviderIds.flatMap((packageId) => {
      const lock = input.installedLocks.find((entry) => entry.package_id === packageId);
      const bound = input.binding.provider_packages.find((entry) => entry.package_id === packageId);
      if (!lock) return [`provider_lock_missing:${packageId}`];
      const authority = agentPackageCarrierAuthorityStatus(lock);
      if (authority.status === 'invalid') {
        return authority.reasons.map((reason) => `provider_carrier_authority_${packageId}:${reason}`);
      }
      return bound && boundPackageMatchesLock(bound, lock)
        ? []
        : [`provider_package_authority_mismatch:${packageId}`];
    }),
  ].filter((reason): reason is string => reason !== null);
  if (reasons.length === 0) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Package use binding does not preserve the installed carrier authority.',
    {
      package_id: input.root.package_id,
      use_boundary_id: input.binding.use_boundary_id,
      use_receipt_ref: input.binding.use_receipt_ref,
      failures: reasons,
      failure_code: 'agent_package_use_binding_carrier_authority_invalid',
    },
  );
}
