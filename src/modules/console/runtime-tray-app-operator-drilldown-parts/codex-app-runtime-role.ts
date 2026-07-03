import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  listCodexAppRuntimeEvidenceReceipts,
} from '../../runway/index.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function codexAppRuntimeEvidencePayloadTemplate() {
  return {
    temporal_hosted_long_soak_refs: [],
    provider_state_linkage_refs: [],
    operator_evidence_refs: [],
    typed_blocker_refs: [],
  };
}

function refsFromRecords(values: JsonRecord[], keys: string[]) {
  return uniqueStrings(values.flatMap((value) => keys.flatMap((key) => {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return [entry.trim()];
    }
    return stringList(entry);
  })));
}

function codexAppRuntimeEvidenceReceiptSummary() {
  const receipts = listCodexAppRuntimeEvidenceReceipts();
  const recordedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'recorded');
  const verifiedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'verified');
  const temporalHostedLongSoakRefs = refsFromRecords(
    verifiedReceipts,
    ['temporal_hosted_long_soak_refs'],
  );
  const providerStateLinkageRefs = refsFromRecords(
    verifiedReceipts,
    ['provider_state_linkage_refs'],
  );
  const operatorEvidenceRefs = refsFromRecords(verifiedReceipts, ['operator_evidence_refs']);
  const typedBlockerRefs = refsFromRecords(receipts, ['typed_blocker_refs']);
  return {
    receipts,
    recordedReceipts,
    verifiedReceipts,
    temporalHostedLongSoakRefs,
    providerStateLinkageRefs,
    operatorEvidenceRefs,
    typedBlockerRefs,
  };
}

function codexAppRuntimeEvidencePayloadRefHints() {
  return {
    temporal_hosted_long_soak_refs_should_cover: [
      'temporal_hosted_long_soak_ref',
      'provider_worker_soak_ref',
      'codex_app_operator_soak_ref',
    ],
    provider_state_linkage_refs_should_cover: [
      'provider_state_linkage_ref',
      'provider_cadence_receipt_ref',
      'provider_slo_receipt_ref',
    ],
    operator_evidence_refs_should_cover: [
      'operator_window_manifest_ref',
      'app_operator_event_log_ref',
    ],
    typed_blocker_refs_should_cover: [
      'typed_blocker_ref',
    ],
  };
}

function codexAppRuntimeEvidenceObservationCommands() {
  return {
    start: [
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '<n>',
      '--evidence-dir',
      '<path>',
    ],
    event: [
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'event',
      '--workorder-file',
      '<path>',
      '--event-kind',
      '<kind>',
      '--evidence-ref',
      '<ref>',
    ],
    finish: [
      'runtime',
      'codex-app-runtime-evidence',
      'long-soak',
      'finish',
      '--workorder-file',
      '<path>',
    ],
  };
}

function buildCodexAppRuntimeEvidenceFollowthrough(authorityBoundary: JsonRecord) {
  const gateId = 'temporal_hosted_long_soak_refs';
  const receiptSummary = codexAppRuntimeEvidenceReceiptSummary();
  const observedSupportRefs = uniqueStrings([
    ...receiptSummary.providerStateLinkageRefs,
    ...receiptSummary.operatorEvidenceRefs,
  ]);
  const observedRefs = uniqueStrings([
    ...receiptSummary.temporalHostedLongSoakRefs,
    ...observedSupportRefs,
  ]);
  const refsObservedForAllGates = receiptSummary.temporalHostedLongSoakRefs.length > 0
    && receiptSummary.recordedReceipts.length === 0
    && receiptSummary.typedBlockerRefs.length === 0;
  const activeGateOpen = !refsObservedForAllGates;
  const hasPendingSuccessRefs = receiptSummary.recordedReceipts.some((receipt) =>
    receipt.temporal_hosted_long_soak_refs.length > 0
    || receipt.provider_state_linkage_refs.length > 0
    || receipt.operator_evidence_refs.length > 0
  );
  const status = refsObservedForAllGates
    ? 'long_soak_refs_observed'
    : hasPendingSuccessRefs
      ? 'long_soak_gate_verify_pending'
      : 'long_soak_gate_open';
  return {
    surface_kind: 'opl_app_drilldown_codex_app_production_evidence_followthrough',
    owner: 'one-person-lab',
    target_surface: 'codex_app_runtime_role',
    status,
    runtime_policy: 'opl_temporal_hosted_autonomous',
    long_running_task_driver_owner: 'one-person-lab',
    long_running_task_driver_substrate: 'temporal',
    production_long_soak_claimed: false,
    production_evidence_gate_remains_open: activeGateOpen,
    gate_count: 1,
    open_gate_count: activeGateOpen ? 1 : 0,
    open_gate_ids: activeGateOpen ? [gateId] : [],
    refs_observed_for_all_gates: refsObservedForAllGates,
    attention_required: activeGateOpen,
    evidence_ledger_status: receiptSummary.recordedReceipts.length > 0
      ? 'ledger_refs_recorded_verify_pending'
      : receiptSummary.verifiedReceipts.length > 0
        ? 'ledger_refs_verified'
        : 'ledger_refs_missing',
    ledger_receipt_ref_count: receiptSummary.receipts.length,
    ledger_receipt_refs: receiptSummary.receipts.map((receipt) => receipt.receipt_ref),
    recorded_ledger_receipt_ref_count: receiptSummary.recordedReceipts.length,
    recorded_ledger_receipt_refs:
      receiptSummary.recordedReceipts.map((receipt) => receipt.receipt_ref),
    verified_ledger_receipt_ref_count: receiptSummary.verifiedReceipts.length,
    verified_ledger_receipt_refs:
      receiptSummary.verifiedReceipts.map((receipt) => receipt.receipt_ref),
    pending_verify_receipt_ref_count: receiptSummary.recordedReceipts.length,
    pending_verify_receipt_refs:
      receiptSummary.recordedReceipts.map((receipt) => receipt.receipt_ref),
    temporal_hosted_long_soak_refs: receiptSummary.temporalHostedLongSoakRefs,
    provider_state_linkage_refs: receiptSummary.providerStateLinkageRefs,
    operator_evidence_refs: receiptSummary.operatorEvidenceRefs,
    typed_blocker_refs: receiptSummary.typedBlockerRefs,
    typed_blocker_ref_count: receiptSummary.typedBlockerRefs.length,
    blocked_by_typed_blocker_refs: receiptSummary.typedBlockerRefs.length > 0,
    gate_items: activeGateOpen ? [{
      gate_id: gateId,
      status: 'missing_temporal_hosted_long_soak_refs',
      required_refs_any_of: [
        'temporal_hosted_long_soak_ref',
        'provider_worker_soak_ref',
        'codex_app_operator_soak_ref',
        'typed_blocker_ref',
      ],
      observed_refs: observedRefs,
      observed_ref_count: observedRefs.length,
      observed_support_refs: observedSupportRefs,
      missing_required_refs: receiptSummary.temporalHostedLongSoakRefs.length > 0
        ? []
        : ['temporal_hosted_long_soak_refs'],
      current_contract_status: 'not_claimed_by_contract',
      full_detail_section: 'codex_app_runtime_role',
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_close_domain_ready: false,
        can_close_long_soak: false,
        can_claim_production_ready: false,
        can_drive_long_running_task_loop: false,
      },
    }] : [],
    required_return_shapes: [
      'temporal_hosted_long_soak_ref',
      'provider_state_linkage_ref',
      'operator_evidence_ref',
      'typed_blocker_ref',
    ],
    success_required_return_shapes: [
      'temporal_hosted_long_soak_ref',
    ],
    supplemental_return_shapes: [
      'provider_state_linkage_ref',
      'operator_evidence_ref',
    ],
    payload_owner: 'app_live_operator_or_opl_provider_owner',
    payload_template: activeGateOpen ? codexAppRuntimeEvidencePayloadTemplate() : null,
    payload_ref_hints: activeGateOpen ? codexAppRuntimeEvidencePayloadRefHints() : null,
    payload_template_policy: activeGateOpen
      ? 'template_is_empty_by_design_replace_with_real_temporal_hosted_long_soak_or_typed_blocker_refs_before_submit'
      : null,
    payload_workorder: activeGateOpen ? {
      surface_kind: 'opl_codex_app_runtime_evidence_payload_workorder',
      workorder_policy:
        'operator_must_choose_temporal_hosted_long_soak_refs_path_or_provider_owner_typed_blocker_path_empty_template_blocks',
      payload_owner: 'app_live_operator_or_opl_provider_owner',
      accepted_payload_path_policy:
        'real_temporal_hosted_long_soak_refs_or_typed_blocker_path_empty_template_blocks',
      accepted_payload_paths: {
        temporal_hosted_long_soak_refs_path: {
          required_operator_payload_refs: [
            'temporal_hosted_long_soak_refs',
          ],
          supplemental_operator_payload_refs: [
            'provider_state_linkage_refs',
            'operator_evidence_refs',
          ],
          typed_blocker_refs_must_be_absent: true,
          closes_long_soak: false,
          closes_production_ready: false,
        },
        typed_blocker_path: {
          required_operator_payload_refs: ['typed_blocker_refs'],
          success_claimed: false,
          closes_long_soak: false,
          closes_production_ready: false,
        },
      },
      required_operator_payload_refs: [
        'temporal_hosted_long_soak_refs',
        'typed_blocker_refs',
      ],
      supplemental_operator_payload_refs: [
        'provider_state_linkage_refs',
        'operator_evidence_refs',
      ],
      required_return_shapes: [
        'temporal_hosted_long_soak_ref',
        'typed_blocker_ref',
      ],
      supplemental_return_shapes: [
        'provider_state_linkage_ref',
        'operator_evidence_ref',
      ],
      payload_template: codexAppRuntimeEvidencePayloadTemplate(),
      payload_ref_hints: codexAppRuntimeEvidencePayloadRefHints(),
      observation_workorder_commands: codexAppRuntimeEvidenceObservationCommands(),
      observation_workorder_policy:
        'start_event_finish_materializes_local_operator_soak_manifest_only_dedicated_intake_or_provider_owner_followthrough_remains_required',
      empty_payload_template_is_success_evidence: false,
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_mutate_artifact_body: false,
        can_authorize_quality_or_export: false,
        can_create_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_close_domain_ready: false,
        can_close_long_soak: false,
        can_claim_production_ready: false,
        can_drive_long_running_task_loop: false,
      },
    } : null,
    observation_workorder_commands: codexAppRuntimeEvidenceObservationCommands(),
    observation_workorder_policy:
      'app_operator_observation_path_only_temporal_long_soak_refs_still_require_dedicated_refs_only_intake_provider_owner_followthrough_or_typed_blocker',
    empty_payload_template_is_success_evidence: false,
    authority_boundary: {
      ...authorityBoundary,
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_domain_ready: false,
      can_close_long_soak: false,
      can_claim_production_ready: false,
      can_drive_long_running_task_loop: false,
    },
  };
}

export function buildCodexAppRuntimeRole() {
  const authorityBoundary = {
    ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
    can_claim_production_ready: false,
    can_claim_domain_ready: false,
    can_close_long_soak: false,
    can_create_owner_receipt: false,
    can_drive_long_running_task_loop: false,
  };
  const followthrough = buildCodexAppRuntimeEvidenceFollowthrough(authorityBoundary);
  return {
    surface_kind: 'opl_app_drilldown_codex_app_runtime_role',
    runtime_policy: 'opl_temporal_hosted_autonomous',
    projection_policy:
      'app_start_observe_intervene_display_only_provider_runs_long_tasks',
    codex_app_roles: [
      'start',
      'observe',
      'intervene',
      'display',
    ],
    codex_app_drives_long_running_tasks: false,
    long_running_task_driver_owner: 'one-person-lab',
    long_running_task_driver_substrate: 'temporal',
    default_stage_executor: 'codex_cli',
    domain_agent_internal_daemon_allowed: false,
    domain_agent_internal_scheduler_allowed: false,
    domain_agent_internal_attempt_loop_allowed: false,
    production_long_soak_claimed: false,
    production_evidence_gate_remains_open:
      followthrough.production_evidence_gate_remains_open,
    production_evidence_followthrough: followthrough,
    authority_boundary: authorityBoundary,
  };
}

export function codexAppRuntimeEvidenceNextStep(runtimeRole: JsonRecord) {
  const followthrough = record(runtimeRole.production_evidence_followthrough);
  const openGateCount = numberValue(followthrough.open_gate_count);
  const pendingVerifyReceiptRefs = stringList(followthrough.pending_verify_receipt_refs);
  const firstPendingVerifyReceiptRef = pendingVerifyReceiptRefs[0] ?? null;
  const targetSurface = stringValue(followthrough.target_surface) ?? 'codex_app_runtime_role';
  return {
    step_kind: 'codex_app_runtime_evidence_followthrough',
    owner: stringValue(followthrough.owner) ?? 'one-person-lab',
    target_surface: targetSurface,
    status: stringValue(followthrough.status),
    runtime_policy: stringValue(followthrough.runtime_policy),
    long_running_task_driver_owner: stringValue(followthrough.long_running_task_driver_owner),
    long_running_task_driver_substrate:
      stringValue(followthrough.long_running_task_driver_substrate),
    production_long_soak_claimed: followthrough.production_long_soak_claimed === true,
    production_evidence_gate_remains_open:
      followthrough.production_evidence_gate_remains_open === true,
    open_gate_count: openGateCount,
    open_gate_ids: stringList(followthrough.open_gate_ids),
    required_refs_by_gate: Array.isArray(followthrough.gate_items)
      ? followthrough.gate_items.filter(isRecord).map((gate) => ({
          gate_id: stringValue(gate.gate_id),
          status: stringValue(gate.status),
          required_refs_any_of: stringList(gate.required_refs_any_of),
          observed_ref_count: numberValue(gate.observed_ref_count),
          observed_support_refs: stringList(gate.observed_support_refs),
          missing_required_refs: stringList(gate.missing_required_refs),
          current_contract_status: stringValue(gate.current_contract_status),
        }))
      : [],
    required_return_shapes: stringList(followthrough.required_return_shapes),
    evidence_ledger_status: stringValue(followthrough.evidence_ledger_status),
    ledger_receipt_ref_count: numberValue(followthrough.ledger_receipt_ref_count),
    recorded_ledger_receipt_ref_count:
      numberValue(followthrough.recorded_ledger_receipt_ref_count),
    verified_ledger_receipt_ref_count:
      numberValue(followthrough.verified_ledger_receipt_ref_count),
    pending_verify_receipt_ref_count:
      numberValue(followthrough.pending_verify_receipt_ref_count),
    pending_verify_receipt_refs: pendingVerifyReceiptRefs,
    receipt_verification_required: pendingVerifyReceiptRefs.length > 0,
    verification_action_id: pendingVerifyReceiptRefs.length > 0
      ? `codex_app_runtime_evidence:${targetSurface}:verify`
      : null,
    verification_command_ref: firstPendingVerifyReceiptRef
      ? commandRef([
          'runtime',
          'codex-app-runtime-evidence',
          'verify',
          '--receipt-ref',
          firstPendingVerifyReceiptRef,
        ])
      : null,
    can_submit_verify_to_safe_action_shell: pendingVerifyReceiptRefs.length > 0,
    can_close_without_domain_or_app_payload: pendingVerifyReceiptRefs.length > 0,
    record_action_id: openGateCount > 0
      ? `codex_app_runtime_evidence:${targetSurface}:record`
      : null,
    record_command_ref: openGateCount > 0
      ? commandRef(['runtime', 'codex-app-runtime-evidence', 'record'])
      : null,
    copyable_runtime_action_execute_commands: openGateCount > 0
      ? {
          record_with_payload: runtimeActionExecuteCommand(
            `codex_app_runtime_evidence:${targetSurface}:record`,
          ),
        }
      : null,
    can_submit_record_to_safe_action_shell: openGateCount > 0,
    route_requires_domain_or_app_payload: openGateCount > 0,
    payload_owner: stringValue(followthrough.payload_owner)
      ?? 'app_live_operator_or_opl_provider_owner',
    payload_template: openGateCount > 0 ? record(followthrough.payload_template) : null,
    payload_ref_hints: openGateCount > 0 ? record(followthrough.payload_ref_hints) : null,
    payload_workorder: openGateCount > 0 ? record(followthrough.payload_workorder) : null,
    payload_template_policy: openGateCount > 0
      ? stringValue(followthrough.payload_template_policy)
      : null,
    observation_workorder_commands: record(followthrough.observation_workorder_commands),
    observation_workorder_policy: stringValue(followthrough.observation_workorder_policy),
    empty_payload_template_is_success_evidence:
      followthrough.empty_payload_template_is_success_evidence === true,
    typed_blocker_ref_count: numberValue(followthrough.typed_blocker_ref_count),
    blocked_by_typed_blocker_refs: followthrough.blocked_by_typed_blocker_refs === true,
    full_detail_section: 'codex_app_runtime_role',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_close_long_soak: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
  };
}

function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

function runtimeActionExecuteCommand(actionId: string) {
  return [
    'runtime',
    'action',
    'execute',
    '--action',
    actionId,
    '--payload-file',
    '<payload.json>',
  ];
}

function routeAuthorityBoundary() {
  return {
    opl: 'codex_app_runtime_evidence_ledger_refs_only',
    payload_owner: 'app_live_operator_or_opl_provider_owner',
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_domain_ready: false,
    can_close_long_soak: false,
    can_claim_production_ready: false,
    can_drive_long_running_task_loop: false,
  };
}

export function buildCodexAppRuntimeEvidenceActionRoutes(runtimeRole: JsonRecord) {
  const followthrough = record(runtimeRole.production_evidence_followthrough);
  const receipts = listCodexAppRuntimeEvidenceReceipts();
  const recordedReceipt = receipts.find((receipt) => receipt.receipt_status === 'recorded');
  const targetSurface = stringValue(followthrough.target_surface) ?? 'codex_app_runtime_role';
  const baseRoute = {
    role: 'operator_action_route',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    stage_attempt_id: null,
    domain_id: null,
    stage_id: null,
    request_id: 'codex_app_runtime_role',
    request_pack_id: 'one_person_lab.codex_app_runtime_evidence',
    evidence_route_kind: 'codex_app_runtime_evidence',
    evidence_source_ref: '/runtime_tray_snapshot/app_operator_drilldown/codex_app_runtime_role',
    target_surface: targetSurface,
    payload_owner: 'app_live_operator_or_opl_provider_owner',
    creates_domain_action: false,
    creates_owner_receipt: false,
    owner_receipt_refs: [],
    can_execute: false as const,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_domain_ready: false,
    can_close_long_soak: false,
    can_claim_production_ready: false,
    can_drive_long_running_task_loop: false,
    authority_boundary: routeAuthorityBoundary(),
  };

  if (recordedReceipt) {
    const args = [
      'runtime',
      'codex-app-runtime-evidence',
      'verify',
      '--receipt-ref',
      recordedReceipt.receipt_ref,
    ];
    return [{
      ...baseRoute,
      ref: commandRef(args),
      opl_cli_args: args,
      action_id: `codex_app_runtime_evidence:${targetSurface}:verify`,
      action_kind: 'codex_app_runtime_evidence_receipt_verify',
      route_status: 'verify_route_available',
      route_status_detail: 'recorded_codex_app_runtime_evidence_receipt_waiting_for_verify',
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: true,
      required_operator_payload_refs: [],
      required_evidence_refs: [],
      required_return_shapes: [],
      required_receipt_shapes: ['codex_app_runtime_evidence_verified_receipt_ref'],
      receipt_ref: recordedReceipt.receipt_ref,
      typed_blocker_refs: stringList(recordedReceipt.typed_blocker_refs),
      open_reason: 'recorded_codex_app_runtime_evidence_receipt_requires_verify',
      payload_requirement: null,
      payload_template: null,
      payload_ref_hints: null,
      payload_template_policy: null,
    }];
  }

  if (numberValue(followthrough.open_gate_count) <= 0) {
    return [];
  }

  const args = ['runtime', 'codex-app-runtime-evidence', 'record'];
  return [{
    ...baseRoute,
    ref: commandRef(args),
    opl_cli_args: args,
    action_id: `codex_app_runtime_evidence:${targetSurface}:record`,
    action_kind: 'codex_app_runtime_evidence_receipt_record',
    route_status: 'record_route_available',
    route_status_detail: 'codex_app_runtime_evidence_waiting_for_temporal_long_soak_or_typed_blocker_payload',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    required_operator_payload_refs: [
      'temporal_hosted_long_soak_refs',
      'typed_blocker_refs',
    ],
    supplemental_operator_payload_refs: [
      'provider_state_linkage_refs',
      'operator_evidence_refs',
    ],
    required_evidence_refs: stringList(followthrough.open_gate_ids),
    required_return_shapes: stringList(followthrough.required_return_shapes),
    required_receipt_shapes: ['codex_app_runtime_evidence_receipt_ref'],
    typed_blocker_refs: stringList(followthrough.typed_blocker_refs),
    open_reason: 'codex_app_runtime_temporal_long_soak_refs_or_typed_blocker_refs_required',
    payload_requirement:
      'app_live_operator_or_opl_provider_owner_refs_payload_required_to_record_codex_app_runtime_evidence_or_typed_blocker',
    payload_template: codexAppRuntimeEvidencePayloadTemplate(),
    payload_ref_hints: codexAppRuntimeEvidencePayloadRefHints(),
    payload_workorder: record(followthrough.payload_workorder),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_temporal_hosted_long_soak_or_typed_blocker_refs_before_submit',
    empty_payload_template_is_success_evidence: false,
    copyable_runtime_action_execute_commands: {
      record_with_payload: runtimeActionExecuteCommand(
        `codex_app_runtime_evidence:${targetSurface}:record`,
      ),
    },
  }];
}

export function codexAppRuntimeEvidenceSummary(runtimeRole: JsonRecord) {
  const followthrough = record(runtimeRole.production_evidence_followthrough);
  return {
    gate_count: numberValue(followthrough.gate_count),
    open_gate_count: numberValue(followthrough.open_gate_count),
    ledger_receipt_ref_count: numberValue(followthrough.ledger_receipt_ref_count),
    typed_blocker_ref_count: numberValue(followthrough.typed_blocker_ref_count),
    recorded_ledger_receipt_ref_count:
      numberValue(followthrough.recorded_ledger_receipt_ref_count),
    verified_ledger_receipt_ref_count:
      numberValue(followthrough.verified_ledger_receipt_ref_count),
    pending_verify_receipt_ref_count:
      numberValue(followthrough.pending_verify_receipt_ref_count),
  };
}
