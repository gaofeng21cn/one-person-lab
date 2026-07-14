import type { JsonRecord } from '../../kernel/json-record.ts';
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
const ACTIVATE_COMMAND_REF =
  'opl app action execute --action agent_package_activate --payload <json> --json';

function selectedLock(index: AgentPackageLockIndex, packageId: string | null) {
  return packageId ? index.packages.find((entry) => entry.package_id === packageId) ?? null : null;
}

function canonicalDependencyStatus(
  installed: boolean,
  readiness: RawAgentPackageStatus['package_dependency_readiness'],
) {
  if (!installed || !readiness) return 'blocked' as const;
  return readiness.status === 'current' ? 'ready' as const : 'repair_required' as const;
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
    installed_capability_abi: installedCapabilityAbi,
    abi_satisfied: abiSatisfied,
    required_export_ids: requiredExportIds,
    available_export_ids: [...new Set(availableExportIds)].sort(),
    exports_satisfied: exportsSatisfied,
    content_lock_digest: provider?.content_digest ?? check.content_digest,
    physical_surface_status: physicalSurfaceStatus,
    ready: check.status === 'current' && enabled && versionSatisfied && abiSatisfied && exportsSatisfied,
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
  rawRepairCommand: string | null,
) {
  const enabled = installed && (dependencyStatus === 'repair_required' || Boolean(rawRepairCommand));
  return {
    action_id: 'agent_package_repair',
    command_ref: REPAIR_COMMAND_REF,
    enabled,
    reason_code: !installed
      ? 'package_not_installed'
      : dependencyStatus === 'repair_required'
        ? 'dependency_closure_repair_required'
        : enabled
          ? 'package_repair_required'
          : 'dependency_closure_ready',
  };
}

function canonicalActivationAction(
  installed: boolean,
  materializationStatus: string | null,
  disabled: boolean,
) {
  const ready = materializationStatus === 'current' || materializationStatus === 'not_required';
  return {
    action_id: 'agent_package_activate',
    command_ref: ACTIVATE_COMMAND_REF,
    enabled: installed && !disabled,
    preparation_status: !installed ? 'not_installed' : ready ? 'ready' : 'prepare_required',
    reason_code: !installed
      ? 'package_not_installed'
      : disabled
        ? 'package_disabled'
      : ready
        ? 'use_boundary_reconciliation_ready'
        : 'scope_reconciliation_required',
  };
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
  const operationalReady = !disabled && status.operational_ready === true;
  const launchAllowed = !disabled && status.launch_allowed === true;
  const positiveReadinessDeferred = profile === 'fast' && (operationalReady || launchAllowed);
  const dependencyReadiness = canonicalDependencyReadiness(status, lockIndex);
  const rawRepairCommand = typeof status.repair_action === 'string' ? status.repair_action : null;
  const canonicalFields = {
    action_receipt_ref: lock?.action_receipt_id ?? null,
    rollback_ref: lock?.rollback_ref ?? null,
    capability_exposure: {
      status: exposureStatus,
      codex_visible: exposureStatus === 'visible',
    },
    dependency_readiness: dependencyReadiness,
    repair_action: canonicalRepairAction(installed, dependencyReadiness.status, rawRepairCommand),
    repair_command: rawRepairCommand,
    activation_action: canonicalActivationAction(
      installed,
      status.materialization_readiness?.status ?? null,
      disabled,
    ),
    dependent_guard: dependentGuard(lockIndex, status.package_id),
  };

  if (profile === 'full') {
    const { repair_action: _rawRepairAction, ...fullStatus } = status;
    return {
      ...fullStatus,
      ...canonicalFields,
      status: disabled ? 'attention_needed' : status.status,
      operational_ready: operationalReady,
      launch_allowed: launchAllowed,
      launch_blocked_reason: disabled ? 'package_disabled' : status.launch_blocked_reason,
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
    activation_action: {
      action_id: 'agent_package_activate',
      command_ref: ACTIVATE_COMMAND_REF,
      enabled: false,
      preparation_status: installed ? 'prepare_required' : 'not_installed',
      reason_code: 'status_unavailable',
    },
    dependent_guard: {
      required_by_package_ids: guard.required_by_package_ids,
      disable: { allowed: false, reason_code: reasonCode },
      uninstall: { allowed: false, reason_code: reasonCode },
    },
    package_id: packageId,
  } satisfies JsonRecord;
}
