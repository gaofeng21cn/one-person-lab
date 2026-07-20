import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  CAPABILITY_PACKAGE_APPLY_COMMAND,
  CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS,
  CAPABILITY_PACKAGE_READBACK_REF,
  CAPABILITY_PACKAGE_REPAIR_COMMAND,
  CAPABILITY_PACKAGE_STATUS_READBACK_REF,
  capabilityPackageOwnerRoute,
} from '../managed-update-owner-boundary.ts';
import { dependencyReadiness } from './dependency-closure.ts';
import {
  agentPackageCarrierAuthorityStatus,
  agentPackageCarrierReceiptAuthorityStatus,
} from './carrier-authority.ts';
import { managedPolicyCurrentness, noManagedPolicyMigration } from './managed-policy-surface.ts';
import { scopeMaterializationReadiness } from './scope-materialization.ts';
import { managedRuntimeSourceReadiness } from './managed-runtime-source-carrier.ts';
import { refsOnlyAuthorityBoundary, uniqueStrings } from './shared.ts';
import type {
  AgentPackageLifecycleAction,
  AgentPackageLifecycleCondition,
  AgentPackageLifecycleReceipt,
  AgentPackageLifecycleUxReadback,
  AgentPackageLock,
  AgentPackageManagedPolicyCurrentness,
  AgentPackageOwnerRouteReadback,
  AgentPackageOwnerRouteReadbackItem,
  AgentPackageSourceKind,
} from './types.ts';

const PACKAGE_LIFECYCLE_ACTION_REFS: AgentPackageLifecycleAction[] = [
  'install',
  'activate',
  'update',
  'optimize',
  'repair',
  'rollback',
  'profile_apply',
  'uninstall',
  'hide',
  'unhide',
  'enable',
  'disable',
  'home_shortcut_preferences_set',
];

function ownerRouteReadbackCommands() {
  return {
    list: CAPABILITY_PACKAGE_READBACK_REF,
    status: CAPABILITY_PACKAGE_STATUS_READBACK_REF,
    apply: CAPABILITY_PACKAGE_APPLY_COMMAND,
    repair: CAPABILITY_PACKAGE_REPAIR_COMMAND,
  };
}

function lifecycleCondition(input: AgentPackageLifecycleCondition) {
  return input;
}

export function agentPackageLifecycleUxReadback(input: {
  packageId: string | null;
  lock?: AgentPackageLock | null;
  receipt?: AgentPackageLifecycleReceipt | null;
  managedPolicyCurrentness?: AgentPackageManagedPolicyCurrentness;
}): AgentPackageLifecycleUxReadback {
  const surface = input.lock?.physical_surface ?? input.receipt?.physical_surface;
  if (!input.lock) {
    return {
      status: 'not_installed',
      conditions: [lifecycleCondition({
        condition_id: 'package_not_installed',
        package_id: input.packageId,
        status: 'attention_needed',
        reason: 'No package lock is installed for this package.',
        action_ref: 'install_from_manifest_url',
      })],
      recommended_action: 'install_from_manifest_url',
      lifecycle_action_refs: ['install'],
    };
  }

  const conditions = [
    lifecycleCondition({
      condition_id: 'package_lock_present',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: 'Package lock is present in the Framework package lock index.',
      action_ref: null,
    }),
  ];
  const carrierAuthority = Object.prototype.hasOwnProperty.call(input, 'receipt')
    ? agentPackageCarrierReceiptAuthorityStatus(input.lock, input.receipt)
    : agentPackageCarrierAuthorityStatus(input.lock);
  if (carrierAuthority.status === 'invalid') {
    conditions.push(lifecycleCondition({
      condition_id: 'carrier_authority_invalid',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: `Package carrier provenance observation: ${carrierAuthority.reasons.join(', ')}. Provenance drift does not block a functionally runnable package generation.`,
      action_ref: null,
    }));
  } else if (carrierAuthority.status === 'current') {
    conditions.push(lifecycleCondition({
      condition_id: 'carrier_authority_current',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: 'Package catalog, manifest, payload, lock, and runtime carrier authority are current.',
      action_ref: null,
    }));
  }

  if (!surface || surface.status === 'not_requested') {
    conditions.push(lifecycleCondition({
      condition_id: 'physical_surface_not_requested',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: surface?.note ?? 'This package does not request Codex plugin materialization.',
      action_ref: null,
    }));
  } else if (surface.status === 'removed') {
    conditions.push(lifecycleCondition({
      condition_id: 'physical_surface_removed',
      package_id: input.lock.package_id,
      status: 'attention_needed',
      reason: 'The package physical Codex surface was removed.',
      action_ref: 'install_from_manifest_url',
    }));
  } else {
    conditions.push(lifecycleCondition({
      condition_id: 'physical_surface_materialized',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: surface.status === 'validated_no_write'
        ? 'Physical Codex surface validation passed without writing files.'
        : 'Physical Codex surface is materialized.',
      action_ref: null,
    }));
  }

  if (surface?.profile_migration.status === 'semantic_merge_required') {
    conditions.push(lifecycleCondition({
      condition_id: 'profile_semantic_merge_required',
      package_id: input.lock.package_id,
      status: 'attention_needed',
      reason: surface.profile_migration.note,
      action_ref: 'profile_apply',
    }));
  } else if (surface?.profile_migration.status && surface.profile_migration.status !== 'not_requested') {
    conditions.push(lifecycleCondition({
      condition_id: 'profile_current',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: surface.profile_migration.note,
      action_ref: null,
    }));
  }

  const policyCurrentness = input.managedPolicyCurrentness ?? managedPolicyCurrentness(input.lock);
  if (policyCurrentness.status === 'current') {
    conditions.push(lifecycleCondition({
      condition_id: 'managed_policy_current',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: policyCurrentness.reason,
      action_ref: null,
    }));
  } else if (policyCurrentness.status === 'drifted') {
    conditions.push(lifecycleCondition({
      condition_id: 'managed_policy_drift_detected',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: `${policyCurrentness.reason} Currentness drift remains observable but does not block a functionally runnable package generation.`,
      action_ref: null,
    }));
  } else if (policyCurrentness.status === 'invalid') {
    conditions.push(lifecycleCondition({
      condition_id: 'managed_policy_drift_detected',
      package_id: input.lock.package_id,
      status: 'attention_needed',
      reason: policyCurrentness.reason,
      action_ref: 'repair',
    }));
  }

  if (surface?.reload_required) {
    conditions.push(lifecycleCondition({
      condition_id: 'codex_reload_observed',
      package_id: input.lock.package_id,
      status: 'ok',
      reason: 'The current interactive Codex process may still expose its startup plugin snapshot; hosted actions and future Codex processes use the newly activated package generation.',
      action_ref: null,
    }));
  }

  const recommendedAction = conditions.find((condition) => condition.status === 'attention_needed')?.action_ref ?? null;
  return {
    status: recommendedAction
      ? 'attention_needed'
      : surface?.status === 'validated_no_write'
        ? 'validated_no_write'
        : 'installed',
    conditions,
    recommended_action: recommendedAction,
    lifecycle_action_refs: [...PACKAGE_LIFECYCLE_ACTION_REFS],
  };
}

export function agentPackageLifecycleSummaryReadback(input: {
  selectedPackageId?: string | null;
  packages: AgentPackageLock[];
  receipts?: AgentPackageLifecycleReceipt[];
}): AgentPackageLifecycleUxReadback {
  if (input.selectedPackageId && input.packages.length === 0) {
    return agentPackageLifecycleUxReadback({ packageId: input.selectedPackageId });
  }
  if (input.packages.length === 0) {
    return {
      status: 'available',
      conditions: [lifecycleCondition({
        condition_id: 'package_not_installed',
        package_id: null,
        status: 'attention_needed',
        reason: 'No agent packages are installed yet.',
        action_ref: 'install_from_manifest_url',
      })],
      recommended_action: 'install_from_manifest_url',
      lifecycle_action_refs: ['install'],
    };
  }
  const receiptsByRef = new Map(
    (input.receipts ?? []).map((receipt) => [receipt.receipt_ref, receipt]),
  );
  const packageReadbacks = input.packages.map((lock) => agentPackageLifecycleUxReadback({
    packageId: lock.package_id,
    lock,
    receipt: receiptsByRef.get(lock.action_receipt_id) ?? null,
  }));
  const recommendedAction = packageReadbacks.find((entry) => entry.recommended_action)?.recommended_action ?? null;
  return {
    status: recommendedAction ? 'attention_needed' : 'available',
    conditions: packageReadbacks.flatMap((entry) => entry.conditions),
    recommended_action: recommendedAction,
    lifecycle_action_refs: [...PACKAGE_LIFECYCLE_ACTION_REFS],
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
  allLocks?: AgentPackageLock[];
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
}): AgentPackageOwnerRouteReadbackItem {
  const paths = resolveOplStatePaths();
  const surface = input.lock?.physical_surface ?? input.receipt?.physical_surface;
  const descriptor = {
    manifest_url: input.lock?.manifest_url ?? input.receipt?.manifest_url ?? input.manifestUrl ?? null,
    manifest_sha256: input.lock?.manifest_sha256 ?? input.receipt?.manifest_sha256 ?? input.manifestSha256 ?? null,
    registry_url: input.receipt?.registry_url ?? input.registryUrl ?? null,
    package_version: input.lock?.package_version ?? null,
    owner_language_version: input.lock?.owner_language_version ?? null,
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
  const policyCurrentness = managedPolicyCurrentness(input.lock);
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
    failure_reason: surface?.failure_reason ?? null,
    profile_migration: surface?.profile_migration ?? {
      surface_kind: 'opl_package_profile_migration',
      status: 'not_requested',
      source_path: null,
      target_path: null,
      source_sha256: null,
      target_sha256: null,
      receipt_path: null,
      merge_packet_path: null,
      apply_command: null,
      authoring_source_paths: [],
      mutation_actions: [],
      rollback_backups_retained: false,
      writes_performed: false,
      note: 'Package does not request a profile surface.',
    },
    managed_policy_migration: surface?.workflow_policy_migration
      ?? noManagedPolicyMigration('Package does not request a managed policy surface.'),
    managed_policy_currentness: policyCurrentness,
  };
  const lifecycleUx = agentPackageLifecycleUxReadback({
    packageId: input.packageId,
    lock: input.lock,
    receipt: input.receipt,
    managedPolicyCurrentness: policyCurrentness,
  });
  const readiness = input.lock
    ? dependencyReadiness(input.lock, {
        surface_kind: 'opl_agent_package_lock_index',
        version: 'opl-agent-package-lock-index.v1',
        packages: input.allLocks ?? [input.lock],
      })
    : {
        status: 'missing' as const,
        operational_ready: false,
        repair_command: `opl packages repair --package-id ${input.packageId}`,
        dependencies: [],
      };
  const materializationReadiness = input.lock
    ? scopeMaterializationReadiness(input.lock, {
        surface_kind: 'opl_agent_package_lock_index',
        version: 'opl-agent-package-lock-index.v1',
        packages: input.allLocks ?? [input.lock],
      }, {
        scope: input.scope,
        targetWorkspace: input.targetWorkspace,
        targetQuest: input.targetQuest,
      })
    : {
        status: 'missing' as const,
        scope: input.scope ?? null,
        target_root: null,
        required_skill_ids: [],
        materialized_skill_ids: [],
        expected_digest: null,
        actual_digest: null,
        repair_command: `opl packages repair --package-id ${input.packageId}`,
        lifecycle_receipt_ref: null,
        core_readiness: { status: 'missing' as const, required_skill_ids: [], materialized_skill_ids: [] },
        specialty_exposure: {
          status: 'not_required' as const,
          declared_skill_ids: [],
          materialized_skill_ids: [],
          missing_skill_ids: [],
        },
      };
  const runtimeSourceReadiness = managedRuntimeSourceReadiness(
    input.lock?.managed_runtime_source,
    input.lock?.runtime_source_carrier,
  );
  const carrierAuthorityReadiness = input.lock
    ? Object.prototype.hasOwnProperty.call(input, 'receipt')
      ? agentPackageCarrierReceiptAuthorityStatus(input.lock, input.receipt)
      : agentPackageCarrierAuthorityStatus(input.lock)
    : { status: 'not_required' as const, reasons: [] as string[] };
  const managedPolicyReady = policyCurrentness.status === 'current'
    || policyCurrentness.status === 'not_requested'
    || policyCurrentness.status === 'drifted';
  const operationalReady = readiness.operational_ready
    && (materializationReadiness.status === 'current' || materializationReadiness.status === 'not_required')
    && runtimeSourceReadiness.operational_ready
    && managedPolicyReady;
  const runtimeSource = input.lock?.managed_runtime_source ?? input.receipt?.managed_runtime_source ?? null;
  return {
    package_id: input.packageId,
    package_dependency_readiness: readiness,
    materialization_readiness: materializationReadiness,
    runtime_source_readiness: runtimeSourceReadiness,
    carrier_authority_readiness: carrierAuthorityReadiness,
    operational_ready: operationalReady,
    operational_ready_scope: 'package_dependency_scope_runtime_source_and_managed_policy',
    launch_allowed: operationalReady,
    launch_blocked_reason: !readiness.operational_ready
      ? `package_dependency_${readiness.status}`
      : materializationReadiness.status !== 'current' && materializationReadiness.status !== 'not_required'
        ? `scope_materialization_${materializationReadiness.status}`
        : !runtimeSourceReadiness.operational_ready
          ? `runtime_source_${runtimeSourceReadiness.status}`
          : !managedPolicyReady
            ? `managed_policy_${policyCurrentness.status}`
            : null,
    allowed_when_blocked: ['status', 'doctor', 'repair'],
    descriptor,
    digest,
    lock,
    materializer,
    lifecycle_ux: lifecycleUx,
    package_core: {
      core_kind: 'opl_agent_package_core',
      package_id: input.packageId,
      descriptor,
      digest,
      dependencies: {
        required_skill_ids: input.lock?.bundled_required_skill_ids ?? surface?.materialized_required_skill_ids ?? [],
        optional_skill_refs: input.lock?.optional_skill_refs ?? [],
        capability_dependencies: input.lock?.capability_dependencies ?? [],
        resolved_dependencies: input.lock?.resolved_dependencies ?? [],
        dependency_readiness: readiness,
      },
      trust: {
        trust_tier: descriptor.trust_tier,
      },
      carrier_authority: input.lock?.carrier_authority ?? null,
      lock,
      lifecycle: {
        latest_receipt_ref: lock.lifecycle_receipt_ref,
        latest_action: input.receipt?.action ?? null,
        status: lifecycleUx.status,
        conditions: lifecycleUx.conditions,
        recommended_action: lifecycleUx.recommended_action,
        action_refs: lifecycleUx.lifecycle_action_refs,
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
    }, ...(runtimeSource ? [{
      adapter_kind: 'managed_runtime_source_carrier' as const,
      carrier: 'opl_managed_module_source' as const,
      source_surface: 'runtime_source_carrier' as const,
      projection_role: 'package_carrier_adapter' as const,
      owns_package_core: false as const,
      owns_domain_truth: false as const,
      status: runtimeSource.status === 'removed' ? 'removed' as const : 'materialized' as const,
      plugin_id: null,
      plugin_source_path: null,
      plugin_manifest_path: null,
      codex_plugin_cache_path: null,
      plugin_payload_manifest_url: null,
      plugin_payload_manifest_sha256: null,
      plugin_payload_cache_path: null,
      materialized_required_skill_ids: [],
      materialized_required_skill_paths: [],
      writes_performed: runtimeSource.status !== 'validated_no_write',
      reload_required: false,
      failure_reason: runtimeSourceReadiness.reason,
      module_id: runtimeSource.module_id,
      checkout_path: runtimeSource.checkout_path,
      ownership: runtimeSource.ownership,
      tree_sha256: runtimeSource.tree_sha256,
    }] : [])],
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function ownerRouteReadback(input: {
  selectedPackageId?: string | null;
  scope?: 'workspace' | 'quest' | null;
  targetWorkspace?: string | null;
  targetQuest?: string | null;
  allLocks?: AgentPackageLock[];
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
    packages: input.packages.map((entry) => ownerRouteReadbackItem({
      ...entry,
      allLocks: input.allLocks
        ?? input.packages.flatMap((candidate) => candidate.lock ? [candidate.lock] : []),
      scope: input.scope,
      targetWorkspace: input.targetWorkspace,
      targetQuest: input.targetQuest,
    })),
    no_package_manager_boundary: {
      package_manager_claim: false,
      clean_managed_scope: 'clean_opl_managed_module_roots_only',
      forbidden_claims: uniqueStrings([...CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS]),
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
