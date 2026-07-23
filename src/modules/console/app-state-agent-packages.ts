import type { JsonRecord } from '../../kernel/json-record.ts';
import { deriveAgentPackageLaunchState } from '../../kernel/agent-package-launch-state.ts';
import {
  requiredDependents,
  type AgentPackageLockIndex,
  type runOplAgentPackageStatus,
} from '../connect/public/app-state.ts';
import type { AppStateProfile } from './app-state-profile.ts';

type RawAgentPackageStatus = ReturnType<typeof runOplAgentPackageStatus>['opl_agent_package_status'];
type RawDependencyReadiness = NonNullable<RawAgentPackageStatus['package_dependency_readiness']>;
type RawDependencyCheck = RawDependencyReadiness['dependencies'][number];

const REPAIR_COMMAND_REF =
  'opl app action execute --action agent_package_repair --payload <json> --json';

const HARD_DEPENDENCY_FAILURE_REASONS = new Set([
  'package_id_mismatch',
  'dependency_lock_missing',
  'dependency_disabled',
  'capability_abi_mismatch',
  'consumer_profile_missing',
  'consumer_profile_consumer_mismatch',
  'consumer_profile_requirements_mismatch',
  'required_exports_missing',
  'required_modules_missing',
]);

function selectedLock(index: AgentPackageLockIndex, packageId: string | null) {
  return packageId ? index.packages.find((entry) => entry.package_id === packageId) ?? null : null;
}

function canonicalDependencyStatus(
  installed: boolean,
  readiness: RawAgentPackageStatus['package_dependency_readiness'],
) {
  if (!installed || !readiness) return 'blocked' as const;
  const hardFailure = (readiness.dependencies ?? []).some((check) =>
    check.required !== false
    && (check.reasons ?? []).some((reason) => HARD_DEPENDENCY_FAILURE_REASONS.has(reason)));
  return hardFailure ? 'repair_required' as const : 'ready' as const;
}

function dependencyCheck(
  check: RawDependencyCheck,
  index: AgentPackageLockIndex,
) {
  const provider = index.packages.find((entry) => entry.package_id === check.package_id) ?? null;
  const failureReasons = [...(check.reasons ?? [])];
  const installed = Boolean(provider ?? check.installed_version);
  const enabled = installed && provider?.exposure_state !== 'disabled'
    && !failureReasons.includes('dependency_disabled');
  const versionSatisfied = installed && !failureReasons.includes('version_requirement_unsatisfied');
  const installedCapabilityAbi = provider?.capability_provider?.capability_abi
    ?? (check.status === 'current' ? check.capability_abi : null);
  const abiSatisfied = installed && !failureReasons.includes('capability_abi_mismatch');
  const requiredExportIds = check.required_export_ids ?? [];
  const availableExportIds = provider?.capability_provider?.exports.map((entry) => entry.export_id)
    ?? (check.status === 'current' ? requiredExportIds : []);
  const exportsSatisfied = installed && !failureReasons.includes('required_exports_missing');
  const requiredModuleIds = check.required_module_ids ?? [];
  const availableModuleIds = provider?.capability_provider?.module_export_ids
    ?? (check.status === 'current' ? requiredModuleIds : []);
  const modulesSatisfied = installed && !failureReasons.includes('required_modules_missing');
  const hardFailureReasons = failureReasons.filter((reason) =>
    HARD_DEPENDENCY_FAILURE_REASONS.has(reason));
  const physicalSurfaceStatus = provider?.physical_surface?.status ?? null;
  return {
    package_id: check.package_id,
    required: check.required,
    installed,
    enabled,
    version_requirement: check.version_requirement,
    installed_version: provider?.package_version ?? check.installed_version,
    version_satisfied: versionSatisfied,
    capability_abi: check.capability_abi,
    consumer_profile_id: check.consumer_profile_id ?? null,
    installed_capability_abi: installedCapabilityAbi,
    abi_satisfied: abiSatisfied,
    required_export_ids: requiredExportIds,
    available_export_ids: [...new Set(availableExportIds)].sort(),
    exports_satisfied: exportsSatisfied,
    required_module_ids: requiredModuleIds,
    available_module_ids: [...new Set(availableModuleIds)].sort(),
    modules_satisfied: modulesSatisfied,
    content_lock_digest: provider?.content_digest ?? check.content_digest,
    physical_surface_status: physicalSurfaceStatus,
    ready: installed && enabled && abiSatisfied && exportsSatisfied && modulesSatisfied
      && hardFailureReasons.length === 0,
    hard_failure_reasons: hardFailureReasons,
    currentness_observations: failureReasons.filter((reason) =>
      !HARD_DEPENDENCY_FAILURE_REASONS.has(reason)),
    failure_reasons: failureReasons,
  };
}

function dependencyClosure(index: AgentPackageLockIndex, packageId: string | null) {
  const lock = selectedLock(index, packageId);
  if (!lock?.dependency_transaction_id || !lock.dependency_closure_digest) return null;
  const lastKnownGood = index.last_known_good_transactions
    ?.find((entry) => entry.root_package_id === lock.package_id) ?? null;
  return {
    transaction_id: lock.dependency_transaction_id,
    closure_digest: lock.dependency_closure_digest,
    last_known_good_transaction_id: lastKnownGood?.transaction_id ?? null,
    last_known_good_closure_digest: lastKnownGood?.closure_digest ?? null,
  };
}

function canonicalDependencyReadiness(
  status: RawAgentPackageStatus,
  index: AgentPackageLockIndex,
) {
  const lock = selectedLock(index, status.package_id);
  const rawChecks = status.package_dependency_readiness?.dependencies;
  const checks = Array.isArray(rawChecks)
    ? rawChecks.map((entry) => dependencyCheck(entry, index))
    : [];
  const requiredChecks = checks.filter((entry) => entry.required);
  return {
    status: canonicalDependencyStatus(
      Boolean(lock ?? status.installed_packages[0]),
      status.package_dependency_readiness,
    ),
    required_count: requiredChecks.length,
    ready_count: requiredChecks.filter((entry) => entry.ready).length,
    checks,
    closure: dependencyClosure(index, status.package_id),
  };
}

function canonicalRepairAction(
  installed: boolean,
  dependencyStatus: 'ready' | 'repair_required' | 'blocked',
  hardRepairReason: string | null,
) {
  const enabled = installed && hardRepairReason !== null;
  return {
    action_id: 'agent_package_repair',
    command_ref: REPAIR_COMMAND_REF,
    enabled,
    reason_code: !installed
      ? 'package_not_installed'
      : dependencyStatus === 'repair_required'
        ? 'dependency_closure_repair_required'
        : enabled
          ? hardRepairReason
          : 'dependency_closure_ready',
  };
}

function packageHardRepairReason(status: RawAgentPackageStatus) {
  const hardDependencyReason = status.package_dependency_readiness?.dependencies
    ?.filter((check) => check.required !== false)
    .flatMap((check) => check.reasons ?? [])
    .find((reason) => HARD_DEPENDENCY_FAILURE_REASONS.has(reason));
  if (hardDependencyReason) return hardDependencyReason;
  const materialization = status.materialization_readiness;
  const requiredSkillIds = materialization?.core_readiness?.required_skill_ids
    ?? materialization?.required_skill_ids
    ?? [];
  const materializedSkillIds = new Set(
    materialization?.core_readiness?.materialized_skill_ids
      ?? materialization?.materialized_skill_ids
      ?? [],
  );
  const requiredSkillMissing = requiredSkillIds.some((skillId) => !materializedSkillIds.has(skillId));
  if (requiredSkillMissing) {
    return 'required_skill_repair_required';
  }
  if (materialization?.status === 'missing' && requiredSkillIds.length === 0) {
    return 'required_skill_repair_required';
  }
  if (status.runtime_source_readiness?.operational_ready === false) {
    return status.runtime_source_readiness.status
      ? `runtime_source_${status.runtime_source_readiness.status}`
      : 'runtime_source_repair_required';
  }
  if (status.managed_policy_currentness?.status === 'invalid') return 'managed_policy_invalid';
  return null;
}

function observationOnlyBlockedReason(
  status: RawAgentPackageStatus,
  dependencyStatus: 'ready' | 'repair_required' | 'blocked',
) {
  if (dependencyStatus !== 'ready') return false;
  const reason = status.launch_blocked_reason;
  return reason === 'package_dependency_incompatible'
    || reason === 'carrier_authority_invalid'
    || reason === 'managed_policy_drifted'
    || reason === 'codex_reload_required'
    || reason === 'codex_reload_observed'
    || reason?.startsWith('scope_materialization_') === true
    || reason?.includes('currentness') === true
    || reason?.includes('digest') === true
    || reason?.includes('reload') === true
    || reason?.includes('receipt') === true;
}

function dependentGuard(index: AgentPackageLockIndex, packageId: string | null) {
  const packageIds = packageId ? requiredDependents(index, packageId) : [];
  const allowed = packageIds.length === 0;
  const reasonCode = allowed ? null : 'agent_package_required_by_installed_dependents';
  return {
    required_by_package_ids: packageIds,
    disable: { allowed, reason_code: reasonCode },
    uninstall: { allowed, reason_code: reasonCode },
  };
}

export function projectAppAgentPackageStatus(input: {
  status: RawAgentPackageStatus;
  profile: AppStateProfile;
  lockIndex: AgentPackageLockIndex;
}) {
  const { status, profile, lockIndex } = input;
  const lock = selectedLock(lockIndex, status.package_id) ?? status.installed_packages[0] ?? null;
  const installed = Boolean(lock);
  const exposureStatus = lock?.exposure_state ?? (installed ? 'visible' : 'not_installed');
  const disabled = exposureStatus === 'disabled';
  const dependencyReadiness = canonicalDependencyReadiness(status, lockIndex);
  const rawRepairCommand = typeof status.repair_action === 'string' ? status.repair_action : null;
  const hardRepairReason = packageHardRepairReason(status);
  const functionallyRunnable = installed
    && !disabled
    && hardRepairReason === null
    && dependencyReadiness.status === 'ready'
    && (
      status.operational_ready === true
      || status.launch_allowed === true
      || observationOnlyBlockedReason(status, dependencyReadiness.status)
    );
  const operationalReady = functionallyRunnable;
  const launchAllowed = functionallyRunnable;
  const positiveReadinessDeferred = profile === 'fast' && functionallyRunnable;
  const ownerUnavailableReason = status.launch_state === 'package_unavailable'
    ? status.launch_state_reason
    : hardRepairReason;
  const ownerDegradedReason = status.launch_state === 'degraded'
    ? status.launch_state_reason
    : functionallyRunnable && status.launch_blocked_reason
      ? status.launch_blocked_reason
      : null;
  const launchState = deriveAgentPackageLaunchState({
    installed,
    exposure_state: exposureStatus,
    operational_ready: functionallyRunnable,
    launch_blocked_reason: disabled
      ? 'package_disabled'
      : functionallyRunnable
        ? null
        : status.launch_blocked_reason,
    degraded_reason: positiveReadinessDeferred
      ? 'live_verification_deferred'
      : ownerDegradedReason,
    unavailable_reason: ownerUnavailableReason,
  });
  const canonicalFields = {
    action_receipt_ref: lock?.action_receipt_id ?? null,
    rollback_ref: lock?.rollback_ref ?? null,
    capability_exposure: {
      status: exposureStatus,
      codex_visible: exposureStatus === 'visible',
    },
    dependency_readiness: dependencyReadiness,
    repair_action: canonicalRepairAction(installed, dependencyReadiness.status, hardRepairReason),
    repair_command: hardRepairReason ? rawRepairCommand : null,
    dependent_guard: dependentGuard(lockIndex, status.package_id),
  };

  if (profile === 'full') {
    const { repair_action: _rawRepairAction, ...fullStatus } = status;
    return {
      ...fullStatus,
      ...canonicalFields,
      status: disabled
        ? 'attention_needed'
        : functionallyRunnable && status.status === 'attention_needed'
          ? 'available'
          : status.status,
      operational_ready: operationalReady,
      launch_allowed: launchAllowed,
      launch_blocked_reason: disabled
        ? 'package_disabled'
        : functionallyRunnable
          ? null
          : status.launch_blocked_reason,
      ...launchState,
    };
  }

  return {
    surface_kind: 'opl_agent_package_status_fast_projection',
    package_id: status.package_id,
    status: disabled
      ? 'attention_needed'
      : positiveReadinessDeferred
        ? 'verification_deferred'
        : status.status,
    package_version: lock?.package_version ?? null,
    installed_version: lock?.package_version ?? null,
    version: lock?.package_version ?? null,
    source_kind: lock?.source_kind ?? null,
    package_lock_ref: lock?.lock_ref ?? null,
    lock_ref: lock?.lock_ref ?? null,
    physical_surface: lock?.physical_surface ?? null,
    codex_visible: exposureStatus === 'visible',
    ...canonicalFields,
    package_dependency_readiness: status.package_dependency_readiness,
    materialization_readiness: status.materialization_readiness,
    runtime_source_readiness: {
      ...status.runtime_source_readiness,
      ...(positiveReadinessDeferred ? { status: 'verification_deferred' } : {}),
      operational_ready: false,
      verification_mode: 'persisted_lock_and_path_fast_projection',
      live_verification_deferred: true,
      live_verification_surface: 'opl packages status --package-id <package_id> --json',
    },
    operational_ready: false,
    operational_ready_scope: status.operational_ready_scope,
    launch_allowed: false,
    launch_blocked_reason: disabled
      ? 'package_disabled'
      : positiveReadinessDeferred
        ? 'live_verification_deferred'
        : status.launch_blocked_reason,
    ...launchState,
    allowed_when_blocked: status.allowed_when_blocked,
    currentness_detail_deferred: true,
    detail_surface: 'opl packages status --package-id <package_id> --json',
  };
}

export function unavailableAgentPackageCanonicalFields(
  packageId: string,
  lockIndex: AgentPackageLockIndex,
) {
  const guard = dependentGuard(lockIndex, packageId);
  const lock = selectedLock(lockIndex, packageId);
  const installed = Boolean(lock);
  const exposureStatus = lock?.exposure_state ?? (installed ? 'visible' : 'unavailable');
  const reasonCode = guard.required_by_package_ids.length > 0
    ? 'agent_package_required_by_installed_dependents'
    : 'package_status_unavailable';
  return {
    ...deriveAgentPackageLaunchState({
      installed,
      exposure_state: exposureStatus,
      operational_ready: false,
      launch_blocked_reason: 'package_status_read_failed',
      degraded_reason: installed ? 'package_status_read_failed' : null,
    }),
    action_receipt_ref: lock?.action_receipt_id ?? null,
    rollback_ref: lock?.rollback_ref ?? null,
    capability_exposure: {
      status: exposureStatus,
      codex_visible: exposureStatus === 'visible',
    },
    dependency_readiness: {
      status: 'blocked',
      required_count: 0,
      ready_count: 0,
      checks: [],
      closure: null,
    },
    repair_action: {
      action_id: 'agent_package_repair',
      command_ref: REPAIR_COMMAND_REF,
      enabled: false,
      reason_code: 'status_unavailable',
    },
    repair_command: null,
    dependent_guard: {
      required_by_package_ids: guard.required_by_package_ids,
      disable: { allowed: false, reason_code: reasonCode },
      uninstall: { allowed: false, reason_code: reasonCode },
    },
    package_id: packageId,
  } satisfies JsonRecord;
}
