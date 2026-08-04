import type { JsonRecord } from '../../kernel/json-record.ts';
import { deriveAgentPackageLaunchState } from '../../kernel/agent-package-launch-state.ts';
import type {
  listOplAgentPackages,
  runOplAgentPackageStatus,
} from '../connect/public/app-state.ts';
import type { AppStateProfile } from './app-state-profile.ts';

type RawAgentPackageStatus = ReturnType<typeof runOplAgentPackageStatus>['opl_agent_package_status'];
type RawDependencyReadiness = NonNullable<RawAgentPackageStatus['package_dependency_readiness']>;
type RawDependencyCheck = RawDependencyReadiness['dependencies'][number];
type RawAgentPackageDirectoryEntry = ReturnType<
  typeof listOplAgentPackages
>['opl_agent_packages']['directory']['entries'][number];

const REPAIR_COMMAND_REF =
  'opl app action execute --action agent_package_repair --payload <json> --json';

function compactDependencyReason(reason: string) {
  if (reason === 'dependency_lock_missing') return 'package_missing';
  if (reason === 'dependency_disabled') return 'package_disabled';
  if (reason === 'package_id_mismatch') return 'package_identity_mismatch';
  if (
    reason === 'consumer_profile_missing'
    || reason === 'consumer_profile_consumer_mismatch'
    || reason === 'consumer_profile_requirements_mismatch'
    || reason === 'required_exports_missing'
    || reason === 'required_modules_missing'
  ) {
    return 'package_not_callable';
  }
  if (
    reason.includes('version')
    || reason.includes('abi')
    || reason.includes('digest')
    || reason.includes('lock')
  ) {
    return null;
  }
  return reason;
}

function compactDependencyCheck(check: RawDependencyCheck) {
  const present = check.status !== 'missing';
  const reasons = [...new Set(
    (check.reasons ?? [])
      .map(compactDependencyReason)
      .filter((reason): reason is string => Boolean(reason)),
  )];
  const callable = present && reasons.length === 0;
  return {
    package_id: check.package_id,
    required: check.required !== false,
    present,
    callable,
    status: !present ? 'missing' : callable ? 'callable' : 'unavailable',
    reasons,
  };
}

function compactDependencyReadiness(
  installed: boolean,
  readiness: RawAgentPackageStatus['package_dependency_readiness'],
) {
  const checks = (readiness?.dependencies ?? []).map(compactDependencyCheck);
  const requiredChecks = checks.filter((check) => check.required);
  const operational = readiness?.operational_ready === true
    && requiredChecks.every((check) => check.present && check.callable);
  return {
    status: !installed ? 'blocked' : operational ? 'ready' : 'attention_needed',
    required_count: requiredChecks.length,
    present_count: requiredChecks.filter((check) => check.present).length,
    callable_count: requiredChecks.filter((check) => check.callable).length,
    checks,
  };
}

function installedPackage(status: RawAgentPackageStatus) {
  return status.installed_packages[0] ?? null;
}

function registeredPackageCount(status: RawAgentPackageStatus) {
  return typeof status.installed_package_count === 'number'
    ? status.installed_package_count
    : status.installed_packages.length;
}

function compactRuntimeSourceReadiness(status: RawAgentPackageStatus) {
  const readiness = status.runtime_source_readiness;
  return readiness
    ? {
        status: readiness.status,
        operational_ready: readiness.operational_ready,
        reason: readiness.reason ?? null,
      }
    : null;
}

function projectedPresence(status: RawAgentPackageStatus) {
  const registered = registeredPackageCount(status) > 0;
  const runtimeSource = status.runtime_source_readiness;
  const physicalPresent = registered && runtimeSource?.operational_ready !== false;
  const callable = physicalPresent && status.launch_allowed === true;
  return {
    registered,
    installed: physicalPresent,
    present: physicalPresent,
    callable,
    status: !registered
      ? 'not_installed'
      : physicalPresent
        ? 'present'
        : 'physical_unavailable',
    reason: callable ? null : status.launch_blocked_reason ?? null,
  };
}

function exposureProjection(status: RawAgentPackageStatus, physicallyPresent: boolean) {
  const exposureStatus = physicallyPresent
    ? installedPackage(status)?.exposure_state ?? 'visible'
    : registeredPackageCount(status) > 0
      ? 'physical_unavailable'
      : 'not_installed';
  return {
    status: exposureStatus,
    codex_visible: physicallyPresent && exposureStatus === 'visible',
  };
}

function repairAction(status: RawAgentPackageStatus, registered: boolean) {
  const repairAvailable = status.allowed_when_blocked?.includes('repair') === true;
  const enabled = registered && repairAvailable && status.operational_ready !== true;
  return {
    action_id: 'agent_package_repair',
    command_ref: REPAIR_COMMAND_REF,
    owner_command_ref: typeof status.repair_action === 'string' ? status.repair_action : null,
    enabled,
    reason_code: enabled
      ? status.launch_blocked_reason ?? 'package_attention_needed'
      : !registered
        ? 'package_not_installed'
        : status.operational_ready === true
          ? 'package_ready'
          : 'repair_action_unavailable',
  };
}

function ownerLaunchState(
  status: RawAgentPackageStatus,
  installed: boolean,
  exposureStatus: string,
) {
  if (
    status.launch_state_schema_version === 'opl-agent-package-launch-state.v1'
    && (
      status.launch_state === 'ready'
      || status.launch_state === 'degraded'
      || status.launch_state === 'package_unavailable'
    )
  ) {
    return {
      launch_state_schema_version: status.launch_state_schema_version,
      launch_state: status.launch_state,
      launch_state_reason: status.launch_state_reason ?? null,
    };
  }
  return deriveAgentPackageLaunchState({
    installed,
    exposure_state: exposureStatus,
    operational_ready: status.operational_ready === true,
    launch_blocked_reason: status.launch_blocked_reason,
  });
}

export function projectRuntimeAgentPackageDirectoryEntry(
  entry: RawAgentPackageDirectoryEntry,
) {
  const statusReadError = entry.readiness.status_read_error;
  const launchAllowed = entry.readiness.launch_allowed;
  const codexVisible = entry.installed
    && statusReadError === null
    && (launchAllowed === true || entry.readiness.verification_deferred === true);
  const callable = entry.installed && launchAllowed === true && statusReadError === null;
  const sourceRef = entry.manifest_url || entry.version_currentness.source_ref;
  return {
    packageProjectionItem: {
      package_id: entry.package_id,
      source_present: entry.installed,
      source_origin: entry.source_explanation.kind,
      source_path: null,
      managed_source_path: null,
      source_health_status: statusReadError ? 'status_unavailable' : entry.readiness.status,
      source_ref: sourceRef,
      status_read_error: statusReadError,
    } satisfies JsonRecord,
    packageStatus: {
      surface_kind: 'opl_runtime_agent_package_status_projection',
      package_id: entry.package_id,
      package_role: entry.package_role,
      app_contributions: entry.app_contributions,
      status: statusReadError ? 'unavailable' : entry.installed ? 'available' : 'not_installed',
      installed_package_count: entry.installed ? 1 : 0,
      presence: {
        registered: entry.installed,
        installed: entry.installed,
        present: entry.installed,
        callable,
        status: entry.installed ? 'present' : 'not_installed',
        reason: callable ? null : entry.readiness.reason,
      },
      capability_exposure: {
        status: !entry.installed
          ? 'not_installed'
          : codexVisible
            ? 'visible'
            : 'attention_needed',
        codex_visible: codexVisible,
      },
      codex_visible: codexVisible,
      operational_ready: entry.readiness.operational_ready,
      launch_allowed: launchAllowed,
      launch_blocked_reason: launchAllowed === true ? null : entry.readiness.reason,
      runtime_source_readiness: {
        status: entry.readiness.status,
        operational_ready: entry.readiness.operational_ready,
        reason: entry.readiness.reason,
      },
      status_read_error: statusReadError,
      source_ref: sourceRef,
    } satisfies JsonRecord,
  };
}

export function projectAppAgentPackageStatus(input: {
  status: RawAgentPackageStatus;
  profile: AppStateProfile;
}) {
  const { status, profile } = input;
  const presence = projectedPresence(status);
  const capabilityExposure = exposureProjection(status, presence.present);
  const nativeCarrierReadiness =
    status.operational_ready_scope === 'configured_native_carrier_presence_callability_identity_and_precedence'
    || status.operational_ready_scope === 'installed_carrier_presence_callability_and_managed_policy';
  const readinessDeferred = profile === 'fast'
    && !nativeCarrierReadiness
    && presence.callable
    && status.operational_ready === true;
  const launchState = readinessDeferred
    ? deriveAgentPackageLaunchState({
        installed: presence.installed,
        exposure_state: capabilityExposure.status,
        operational_ready: false,
        degraded_reason: 'live_verification_deferred',
      })
    : ownerLaunchState(status, presence.installed, capabilityExposure.status);

  return {
    surface_kind: 'opl_agent_package_status_projection',
    profile,
    package_id: status.package_id,
    app_contributions: 'app_contributions' in status ? status.app_contributions ?? null : null,
    status: readinessDeferred ? 'verification_deferred' : status.status,
    installed_package_count: presence.installed ? 1 : 0,
    registered_package_count: registeredPackageCount(status),
    presence,
    capability_exposure: capabilityExposure,
    codex_visible: capabilityExposure.codex_visible,
    dependency_readiness: compactDependencyReadiness(
      presence.installed,
      status.package_dependency_readiness,
    ),
    runtime_source_readiness: compactRuntimeSourceReadiness(status),
    package_operational: status.package_operational,
    experience_baseline: status.experience_baseline,
    specialized_capabilities: status.specialized_capabilities,
    model_projection: status.model_projection,
    operational_ready: readinessDeferred ? false : presence.installed && status.operational_ready === true,
    operational_ready_scope: status.operational_ready_scope,
    launch_allowed: readinessDeferred ? false : presence.callable,
    launch_blocked_reason: readinessDeferred
      ? 'live_verification_deferred'
      : presence.callable ? null : status.launch_blocked_reason,
    ...launchState,
    allowed_when_blocked: status.allowed_when_blocked,
    repair_action: repairAction(status, presence.registered),
    home_shortcut_preferences: status.home_shortcut_preferences,
    ...(readinessDeferred ? { currentness_detail_deferred: true } : {}),
    detail_surface: `opl packages status --package-id ${status.package_id ?? '<package_id>'} --json`,
  };
}

export function unavailableAgentPackageCanonicalFields(packageId: string) {
  return {
    ...deriveAgentPackageLaunchState({
      installed: false,
      exposure_state: 'unavailable',
      operational_ready: false,
      launch_blocked_reason: 'package_status_read_failed',
    }),
    presence: {
      registered: null,
      installed: null,
      present: null,
      callable: false,
      status: 'unknown',
      reason: 'package_status_read_failed',
    },
    capability_exposure: {
      status: 'unknown',
      codex_visible: false,
    },
    dependency_readiness: {
      status: 'unavailable',
      required_count: null,
      present_count: null,
      callable_count: null,
      checks: [],
    },
    repair_action: {
      action_id: 'agent_package_repair',
      command_ref: REPAIR_COMMAND_REF,
      owner_command_ref: null,
      enabled: false,
      reason_code: 'status_unavailable',
    },
    package_id: packageId,
  } satisfies JsonRecord;
}
