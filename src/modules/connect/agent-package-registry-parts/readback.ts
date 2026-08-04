import { agentPackageCarrierAuthorityStatus } from './carrier-authority.ts';
import { managedPolicyCurrentness } from './managed-policy-surface.ts';
import type {
  AgentPackageLifecycleAction,
  AgentPackageLifecycleCondition,
  AgentPackageLifecycleReceipt,
  AgentPackageLifecycleUxReadback,
  AgentPackageLock,
  AgentPackageManagedPolicyCurrentness,
} from './types.ts';

const PACKAGE_LIFECYCLE_ACTION_REFS: AgentPackageLifecycleAction[] = [
  'install',
  'activate',
  'update',
  'repair',
  'rollback',
  'uninstall',
  'hide',
  'unhide',
  'enable',
  'disable',
];

function lifecycleCondition(input: AgentPackageLifecycleCondition) {
  return input;
}

export function managedPolicyLifecycleConditions(input: {
  packageId: string | null;
  currentness: AgentPackageManagedPolicyCurrentness;
}): AgentPackageLifecycleCondition[] {
  const conditions: AgentPackageLifecycleCondition[] = [];
  const policyCurrentness = input.currentness;
  const requiredPolicyDependenciesOperational = policyCurrentness.required_dependencies_operational !== false;
  if (policyCurrentness.status === 'current') {
    conditions.push(lifecycleCondition({
      condition_id: 'managed_policy_current',
      package_id: input.packageId,
      status: 'ok',
      reason: policyCurrentness.reason,
      action_ref: null,
    }));
  } else if (policyCurrentness.status === 'drifted') {
    conditions.push(lifecycleCondition({
      condition_id: 'managed_policy_drift_detected',
      package_id: input.packageId,
      status: requiredPolicyDependenciesOperational ? 'ok' : 'attention_needed',
      reason: requiredPolicyDependenciesOperational
        ? `${policyCurrentness.reason} Currentness drift remains observable but does not block a functionally runnable package generation.`
        : `${policyCurrentness.reason} Required managed dependencies block operational readiness until repaired.`,
      action_ref: requiredPolicyDependenciesOperational ? null : 'repair',
    }));
  } else if (policyCurrentness.status === 'invalid') {
    conditions.push(lifecycleCondition({
      condition_id: 'managed_policy_drift_detected',
      package_id: input.packageId,
      status: 'attention_needed',
      reason: policyCurrentness.reason,
      action_ref: 'repair',
    }));
  }

  const experienceBaseline = policyCurrentness.experience_baseline;
  if (experienceBaseline?.status === 'current') {
    conditions.push(lifecycleCondition({
      condition_id: 'experience_baseline_current',
      package_id: input.packageId,
      status: 'ok',
      reason: 'The OPL Flow recommended Codex experience baseline is current.',
      action_ref: null,
    }));
  } else if (experienceBaseline?.status === 'degraded') {
    conditions.push(lifecycleCondition({
      condition_id: 'experience_baseline_degraded',
      package_id: input.packageId,
      status: 'attention_needed',
      reason: `The OPL Flow experience baseline is degraded: ${experienceBaseline.failure_ids.join(', ')}. Flow remains operational.`,
      action_ref: 'repair',
    }));
  }

  const specializedCapabilities = policyCurrentness.specialized_capabilities;
  if (specializedCapabilities && specializedCapabilities.status !== 'not_declared') {
    conditions.push(lifecycleCondition({
      condition_id: 'specialized_capabilities_observed',
      package_id: input.packageId,
      status: 'ok',
      reason: `Optional specialized capabilities are ${specializedCapabilities.status}; absence is normal and does not require repair.`,
      action_ref: null,
    }));
  }
  return conditions;
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
  const carrierAuthority = agentPackageCarrierAuthorityStatus(input.lock);
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
      action_ref: null,
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
  conditions.push(...managedPolicyLifecycleConditions({
    packageId: input.lock.package_id,
    currentness: policyCurrentness,
  }));

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
