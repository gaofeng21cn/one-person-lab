import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  CAPABILITY_PACKAGE_APPLY_COMMAND,
  CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS,
  CAPABILITY_PACKAGE_READBACK_REF,
  CAPABILITY_PACKAGE_REPAIR_COMMAND,
  CAPABILITY_PACKAGE_STATUS_READBACK_REF,
  capabilityPackageOwnerRoute,
} from '../managed-update-owner-boundary.ts';
import { refsOnlyAuthorityBoundary, uniqueStrings } from './shared.ts';
import type {
  AgentPackageLifecycleReceipt,
  AgentPackageLock,
  AgentPackageOwnerRouteReadback,
  AgentPackageOwnerRouteReadbackItem,
  AgentPackageSourceKind,
} from './types.ts';

function ownerRouteReadbackCommands() {
  return {
    list: CAPABILITY_PACKAGE_READBACK_REF,
    status: CAPABILITY_PACKAGE_STATUS_READBACK_REF,
    apply: CAPABILITY_PACKAGE_APPLY_COMMAND,
    repair: CAPABILITY_PACKAGE_REPAIR_COMMAND,
  };
}

function ownerRouteReadbackItem(input: {
  packageId: string;
  lock?: AgentPackageLock | null;
  receipt?: AgentPackageLifecycleReceipt | null;
  manifestUrl?: string | null;
  manifestSha256?: string | null;
  registryUrl?: string | null;
  rollbackRef?: string | null;
  sourceKind?: AgentPackageLifecycleReceipt['source_kind'] | AgentPackageSourceKind | null;
  trustTier?: string | null;
}): AgentPackageOwnerRouteReadbackItem {
  const paths = resolveOplStatePaths();
  const surface = input.lock?.physical_surface ?? input.receipt?.physical_surface;
  const descriptor = {
    manifest_url: input.lock?.manifest_url ?? input.receipt?.manifest_url ?? input.manifestUrl ?? null,
    manifest_sha256: input.lock?.manifest_sha256 ?? input.receipt?.manifest_sha256 ?? input.manifestSha256 ?? null,
    registry_url: input.receipt?.registry_url ?? input.registryUrl ?? null,
    package_version: input.lock?.package_version ?? null,
    rollback_ref: input.lock?.rollback_ref ?? input.receipt?.rollback_ref ?? input.rollbackRef ?? null,
    source_kind: input.lock?.source_kind ?? input.receipt?.source_kind ?? input.sourceKind ?? null,
    trust_tier: input.lock?.trust_tier ?? input.receipt?.trust_tier ?? input.trustTier ?? null,
  };
  const digest = {
    manifest_sha256: input.lock?.manifest_sha256 ?? input.receipt?.manifest_sha256 ?? input.manifestSha256 ?? null,
    version_or_source_digest: input.lock?.version_or_source_digest ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    resolved_digest: input.lock?.resolved_digest ?? null,
    install_truth: input.lock?.install_truth ?? null,
    content_identity_fields: [
      'manifest_sha256',
      'version_or_source_digest',
      'plugin_payload_manifest_sha256',
      'resolved_digest',
      'package_lock_ref',
    ],
  };
  const lock = {
    package_lock_ref: input.lock?.lock_ref ?? input.receipt?.package_lock_ref ?? null,
    lifecycle_receipt_ref: input.receipt?.receipt_ref ?? input.lock?.action_receipt_id ?? null,
    lock_file: paths.agent_package_lock_file,
    lifecycle_ledger_file: paths.agent_package_lifecycle_ledger_file,
  };
  const materializer = {
    status: surface?.status ?? 'not_requested',
    plugin_id: surface?.plugin_id ?? null,
    plugin_source_path: surface?.plugin_source_path ?? null,
    plugin_manifest_path: surface?.plugin_manifest_path ?? null,
    codex_plugin_cache_path: surface?.codex_plugin_cache_path ?? null,
    plugin_payload_manifest_url: surface?.plugin_payload_manifest_url ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    plugin_payload_cache_path: surface?.plugin_payload_cache_path ?? null,
    materialized_required_skill_ids: surface?.materialized_required_skill_ids ?? [],
    materialized_required_skill_paths: surface?.materialized_required_skill_paths ?? [],
    writes_performed: surface?.writes_performed ?? false,
    reload_required: surface?.reload_required ?? false,
  };
  return {
    package_id: input.packageId,
    descriptor,
    digest,
    lock,
    materializer,
    package_core: {
      core_kind: 'opl_agent_package_core',
      package_id: input.packageId,
      descriptor,
      digest,
      dependencies: {
        required_skill_ids: input.lock?.bundled_required_skill_ids ?? surface?.materialized_required_skill_ids ?? [],
        optional_skill_refs: input.lock?.optional_skill_refs ?? [],
      },
      trust: {
        trust_tier: descriptor.trust_tier,
      },
      lock,
      lifecycle: {
        latest_receipt_ref: lock.lifecycle_receipt_ref,
        latest_action: input.receipt?.action ?? null,
      },
      exposure: {
        state: input.lock?.exposure_state ?? null,
      },
    },
    carrier_adapters: [{
      adapter_kind: 'codex_plugin_carrier',
      carrier: 'codex_plugin',
      source_surface: 'codex_surface',
      projection_role: 'package_carrier_adapter',
      owns_package_core: false,
      owns_domain_truth: false,
      ...materializer,
    }],
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function ownerRouteReadback(input: {
  selectedPackageId?: string | null;
  packages: Array<{
    packageId: string;
    lock?: AgentPackageLock | null;
    receipt?: AgentPackageLifecycleReceipt | null;
    manifestUrl?: string | null;
    manifestSha256?: string | null;
    registryUrl?: string | null;
    rollbackRef?: string | null;
    sourceKind?: AgentPackageLifecycleReceipt['source_kind'] | AgentPackageSourceKind | null;
    trustTier?: string | null;
  }>;
}): AgentPackageOwnerRouteReadback {
  return {
    surface_kind: 'opl_agent_package_owner_route_readback',
    owner_route: capabilityPackageOwnerRoute(),
    command_refs: ownerRouteReadbackCommands(),
    selected_package_id: input.selectedPackageId ?? null,
    package_count: input.packages.length,
    packages: input.packages.map((entry) => ownerRouteReadbackItem(entry)),
    no_package_manager_boundary: {
      package_manager_claim: false,
      clean_managed_scope: 'clean_opl_managed_module_roots_only',
      forbidden_claims: uniqueStrings([...CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS]),
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
