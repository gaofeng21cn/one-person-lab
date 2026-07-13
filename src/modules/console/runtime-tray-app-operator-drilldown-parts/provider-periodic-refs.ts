import {
  record,
  recordList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import { runtimeDomainDaemonReplacementSurfaces } from '../../runway/index.ts';

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
  return buildAppDrilldownRefsOnlyAuthorityBoundary();
}

type ProviderSloRef = {
  ref: string;
  role: string;
  provider_kind: string | null;
  execution_owner: string | null;
  execution_policy: string | null;
  dispatch_status: string | null;
  required_next_action: string | null;
  repair_command: string | null;
  can_execute: false;
};

export function providerSloRefs(providerContinuousProof: JsonRecord) {
  const loop = record(providerContinuousProof.operator_slo_repair_loop);
  const cadenceAction = record(loop.operator_cadence_action);
  const cadenceCommand = stringValue(cadenceAction.command);
  const providerRequiredNextAction = stringValue(loop.required_next_action);
  const cadenceRef = cadenceCommand
    ? {
        ref: cadenceCommand,
        role: stringValue(cadenceAction.action_kind) ?? 'provider_slo_cadence_action',
        provider_kind: stringValue(cadenceAction.provider_kind),
        execution_owner: stringValue(cadenceAction.execution_owner),
        execution_policy: stringValue(cadenceAction.execution_policy),
        dispatch_status: stringValue(cadenceAction.dispatch_status),
        required_next_action: providerRequiredNextAction,
        repair_command: cadenceCommand,
        can_execute: false as const,
      }
    : null;
  const commandRefs: ProviderSloRef[] = cadenceRef ? [cadenceRef] : recordList(loop.operator_commands)
    .map((command) => ({
      ref: stringValue(command.command),
      role: stringValue(command.command_role) ?? 'provider_slo_operator_command',
      provider_kind: stringValue(providerContinuousProof.provider_kind),
      execution_owner: stringValue(command.execution_owner),
      execution_policy: stringValue(command.execution_policy),
      dispatch_status: null,
      required_next_action: providerRequiredNextAction,
      repair_command: stringValue(command.command),
      can_execute: false as const,
    }))
    .filter((entry): entry is {
      ref: string;
      role: string;
      provider_kind: string | null;
      execution_owner: string | null;
      execution_policy: string | null;
      dispatch_status: null;
      required_next_action: string | null;
      repair_command: string | null;
      can_execute: false;
    } => Boolean(entry.ref));

  return uniqueRefs(commandRefs);
}

export function providerCadenceWindowSummary(providerContinuousProof: JsonRecord) {
  const window = record(providerContinuousProof.cadence_window);
  return {
    window_status: stringValue(window.window_status),
    long_window_evidence_ready: window.long_window_evidence_ready === true,
    expected_slo_execution_receipt_count: typeof window.expected_slo_execution_receipt_count === 'number'
      ? window.expected_slo_execution_receipt_count
      : 0,
    observed_slo_execution_receipt_count: typeof window.observed_slo_execution_receipt_count === 'number'
      ? window.observed_slo_execution_receipt_count
      : 0,
    missing_slo_execution_receipt_count: typeof window.missing_slo_execution_receipt_count === 'number'
      ? window.missing_slo_execution_receipt_count
      : 0,
    blocked_repair_receipt_count: typeof window.blocked_repair_receipt_count === 'number'
      ? window.blocked_repair_receipt_count
      : 0,
  };
}

export function providerCapabilitySloSummary(providerContinuousProof: JsonRecord) {
  const capability = record(providerContinuousProof.provider_capability_slo);
  return {
    status: stringValue(capability.status),
    restart_requery_ready: capability.restart_requery_ready === true,
    signal_history_ready: capability.signal_history_ready === true,
    typed_closeout_required_ready: capability.typed_closeout_required_ready === true,
    missing_closeout_diagnostic_ready: capability.missing_closeout_diagnostic_ready === true,
    no_output_diagnostic_boundary_ready: capability.no_output_diagnostic_boundary_ready === true,
    domain_truth_boundary_preserved: capability.domain_truth_boundary_preserved === true,
  };
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
    replaces_domain_daemon_surface: runtimeDomainDaemonReplacementSurfaces(),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
