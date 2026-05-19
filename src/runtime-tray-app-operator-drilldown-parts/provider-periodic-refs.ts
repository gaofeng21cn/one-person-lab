import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'app_operator_drilldown_refs_only',
    domain: 'truth_memory_artifact_quality_export_owner',
    provider: 'runtime_slo_receipt_owner',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_submission_readiness: false,
    can_authorize_export_verdict: false,
    can_execute_domain_action: false,
    can_execute_provider_signal: false,
    provider_completion_is_domain_ready: false,
  };
}

export function providerSloRefs(providerContinuousProof: JsonRecord) {
  const loop = record(providerContinuousProof.operator_slo_repair_loop);
  const cadenceAction = record(loop.operator_cadence_action);
  const cadenceCommand = stringValue(cadenceAction.command);
  const cadenceRef = cadenceCommand
    ? {
        ref: cadenceCommand,
        role: stringValue(cadenceAction.action_kind) ?? 'provider_slo_cadence_action',
        provider_kind: stringValue(cadenceAction.provider_kind),
        execution_owner: stringValue(cadenceAction.execution_owner),
        execution_policy: stringValue(cadenceAction.execution_policy),
        dispatch_status: stringValue(cadenceAction.dispatch_status),
        can_execute: false,
      }
    : null;
  const commandRefs = cadenceRef ? [cadenceRef] : recordList(loop.operator_commands)
    .map((command) => ({
      ref: stringValue(command.command),
      role: stringValue(command.command_role) ?? 'provider_slo_operator_command',
      provider_kind: stringValue(providerContinuousProof.provider_kind),
      execution_owner: stringValue(command.execution_owner),
      execution_policy: stringValue(command.execution_policy),
      dispatch_status: null,
      can_execute: false,
    }))
    .filter((entry): entry is {
      ref: string;
      role: string;
      provider_kind: string | null;
      execution_owner: string | null;
      execution_policy: string | null;
      dispatch_status: null;
      can_execute: false;
    } => Boolean(entry.ref));

  return uniqueRefs(commandRefs);
}

export function periodicExecutionRefs(providerActionRefs: ReturnType<typeof providerSloRefs>) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  const schedulerRefs = [
    {
      ref: 'opl family-runtime scheduler status --provider temporal',
      role: 'scheduler_cadence_status',
      provider_kind: 'temporal',
      schedule_id: scheduleId,
      cadence_owner: 'provider_backed_family_runtime',
      scheduler_owner: 'opl_provider_runtime_manager',
      execution_policy: 'read_only_status_projection',
      expected_surface_kind: 'opl_family_runtime_scheduler_cadence',
      can_execute: false,
    },
    {
      ref: 'opl family-runtime scheduler install --provider temporal',
      role: 'scheduler_cadence_install_or_update',
      provider_kind: 'temporal',
      schedule_id: scheduleId,
      cadence_owner: 'provider_backed_family_runtime',
      scheduler_owner: 'opl_provider_runtime_manager',
      execution_policy: 'operator_or_infrastructure_supervised',
      expected_surface_kind: 'temporal_scheduler_cadence_install_receipt',
      can_execute: false,
    },
    {
      ref: 'opl family-runtime scheduler trigger --provider temporal',
      role: 'scheduler_cadence_manual_trigger',
      provider_kind: 'temporal',
      schedule_id: scheduleId,
      cadence_owner: 'provider_backed_family_runtime',
      scheduler_owner: 'opl_provider_runtime_manager',
      execution_policy: 'operator_or_infrastructure_supervised',
      expected_surface_kind: 'temporal_scheduler_cadence_trigger_receipt',
      can_execute: false,
    },
    {
      ref: 'opl family-runtime scheduler tick --provider temporal',
      role: 'scheduler_tick_provider_slo_and_queue_dispatch',
      provider_kind: 'temporal',
      schedule_id: scheduleId,
      cadence_owner: 'provider_backed_family_runtime',
      scheduler_owner: 'opl_provider_runtime_manager',
      execution_policy: 'provider_backed_no_domain_daemon',
      expected_surface_kind: 'opl_family_runtime_scheduler_tick',
      can_execute: false,
    },
  ];
  return {
    surface_kind: 'opl_app_drilldown_periodic_execution_refs',
    projection_policy: 'provider_scheduler_refs_only_no_domain_daemon_or_truth_write',
    schedule_id: scheduleId,
    refs: uniqueRefs([
      ...schedulerRefs,
      ...providerActionRefs.map((ref) => ({
        ...ref,
        role: `provider_slo:${ref.role}`,
        schedule_id: scheduleId,
        cadence_owner: 'provider_backed_family_runtime',
        scheduler_owner: 'opl_provider_runtime_manager',
        can_execute: false,
      })),
    ]),
    replaces_domain_daemon_surface: {
      medautoscience: 'MAS LaunchAgent / local supervision tick is cleanup-only legacy residue.',
      medautogrant: 'MAG repo-local runtime journal cadence is not a production scheduler.',
      redcube: 'RCA repo-local sidecar/session supervision is handler diagnostic only.',
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
