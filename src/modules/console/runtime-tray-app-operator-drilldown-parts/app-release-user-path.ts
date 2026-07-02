import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { sourceRef } from '../runtime-tray-snapshot-utils.ts';
import {
  listAppReleaseUserPathEvidenceReceipts,
} from '../app-release-user-path-evidence-ledger.ts';
import {
  buildAppReleaseUserPathCohortGuard,
  buildAppReleaseUserPathEvidenceGates,
  currentAppReleaseUserPathTypedBlockerRefs,
  recordsForAppReleaseUserPathCohortGuard,
  refsFromRecords,
} from './app-release-user-path-evidence-gates.ts';
import {
  appReleaseUserPathPayloadRefHints,
  appReleaseUserPathPayloadTemplate,
  appReleaseUserPathPayloadWorkorder,
} from './app-release-user-path-payload.ts';
import {
  numberValue,
  record,
  recordList,
  stringList,
  stringValue,
} from './value-utils.ts';

function routeAuthorityBoundary() {
  return {
    opl: 'app_release_user_path_evidence_ledger_refs_only',
    payload_owner: 'app_live_operator_or_release_owner',
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_app_release_user_path: false,
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

export function buildAppReleaseUserPathEvidence(drilldown: JsonRecord) {
  const ledgerReceipts = listAppReleaseUserPathEvidenceReceipts();
  const recordedLedgerReceipts = ledgerReceipts.filter((receipt) =>
    receipt.receipt_status === 'recorded'
  );
  const verifiedLedgerReceipts = ledgerReceipts.filter((receipt) =>
    receipt.receipt_status === 'verified'
  );
  const rawTypedBlockerRefs = refsFromRecords(ledgerReceipts, ['typed_blocker_refs']);
  const releaseOwnerReceiptRefs = refsFromRecords(verifiedLedgerReceipts, [
    'release_owner_receipt_refs',
  ]);
  const installEvidenceRefs = refsFromRecords(verifiedLedgerReceipts, ['install_evidence_refs']);
  const ownerAcceptanceRefs = refsFromRecords(verifiedLedgerReceipts, [
    'owner_acceptance_refs',
  ]);
  const candidateEvidenceRecords = [
    record(drilldown.package_export_lifecycle_refs),
    record(drilldown.production_evidence_tail_ledger),
    record(drilldown.codex_app_runtime_role),
    record(drilldown.provider_slo_operator_action_refs),
    record(drilldown.periodic_execution_refs),
    ...verifiedLedgerReceipts,
  ];
  const cohortGuard = buildAppReleaseUserPathCohortGuard(candidateEvidenceRecords);
  const scopedEvidenceRecords = recordsForAppReleaseUserPathCohortGuard(
    candidateEvidenceRecords,
    cohortGuard,
  );
  const gates = buildAppReleaseUserPathEvidenceGates({ cohortGuard, scopedEvidenceRecords });
  const openGateItems = gates.filter((gate) => gate.status !== 'refs_observed');
  const activeTypedBlockerRefs = currentAppReleaseUserPathTypedBlockerRefs({
    typedBlockerRefs: rawTypedBlockerRefs,
    openGateIds: new Set(openGateItems.map((gate) => gate.gate_id)),
    selectedCohortId: cohortGuard.selected_cohort_id,
    releaseOwnerReceiptRefs,
  });
  const productionUserPathReady =
    openGateItems.length === 0
    && recordedLedgerReceipts.length === 0
    && activeTypedBlockerRefs.length === 0;
  return {
    surface_kind: 'opl_app_drilldown_app_release_user_path_evidence_attention',
    owner: 'one-person-lab',
    target_surface: 'one_person_lab_app_release_user_path',
    status: openGateItems.length > 0 || activeTypedBlockerRefs.length > 0
      ? 'app_release_user_path_evidence_open'
      : recordedLedgerReceipts.length > 0
        ? 'app_release_user_path_evidence_verify_pending'
      : 'app_release_user_path_evidence_refs_observed',
    production_user_path_ready: productionUserPathReady,
    refs_observed_for_all_gates: openGateItems.length === 0,
    release_ready_claimed: false,
    production_ready_claimed: false,
    gate_count: gates.length,
    open_gate_count: openGateItems.length,
    open_gate_ids: openGateItems.map((gate) => gate.gate_id),
    attention_required: openGateItems.length > 0 || activeTypedBlockerRefs.length > 0,
    evidence_ledger_status: recordedLedgerReceipts.length > 0
      ? 'ledger_refs_recorded_verify_pending'
      : verifiedLedgerReceipts.length > 0
        ? 'ledger_refs_verified'
        : 'ledger_refs_missing',
    typed_blocker_refs: activeTypedBlockerRefs,
    typed_blocker_ref_count: activeTypedBlockerRefs.length,
    blocked_by_typed_blocker_refs: activeTypedBlockerRefs.length > 0,
    historical_typed_blocker_refs: rawTypedBlockerRefs,
    historical_typed_blocker_ref_count: rawTypedBlockerRefs.length,
    cohort_guard: cohortGuard,
    ledger_receipt_ref_count: ledgerReceipts.length,
    ledger_receipt_refs: ledgerReceipts.map((receipt) => receipt.receipt_ref),
    recorded_ledger_receipt_ref_count: recordedLedgerReceipts.length,
    recorded_ledger_receipt_refs: recordedLedgerReceipts.map((receipt) => receipt.receipt_ref),
    verified_ledger_receipt_ref_count: verifiedLedgerReceipts.length,
    verified_ledger_receipt_refs: verifiedLedgerReceipts.map((receipt) => receipt.receipt_ref),
    release_owner_verdict_handoff: {
      surface_kind: 'opl_app_release_owner_verdict_handoff',
      status: productionUserPathReady
        ? 'release_owner_verdict_required'
        : 'waiting_for_same_cohort_user_path_evidence_or_typed_blocker',
      owner: 'one-person-lab-app release owner',
      owner_repo: '/Users/gaofeng/workspace/one-person-lab-app',
      required_delta: productionUserPathReady
        ? 'release_owner_receipt_install_evidence_owner_acceptance_or_typed_blocker_ref'
        : 'same_cohort_release_user_path_refs_release_owner_acceptance_or_release_owner_typed_blocker_ref',
      accepted_ref_shapes: [
        'release_owner_receipt_ref',
        'install_evidence_ref',
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ],
      observed_release_owner_receipt_refs: releaseOwnerReceiptRefs,
      observed_install_evidence_refs: installEvidenceRefs,
      observed_typed_blocker_refs: activeTypedBlockerRefs,
      observed_owner_acceptance_refs: ownerAcceptanceRefs,
      release_ready_authorized: false,
      production_ready_authorized: false,
      record_command:
        'opl runtime app-release-evidence record --payload \'{"release_owner_receipt_refs":["release-owner:<ref>"]}\'',
      typed_blocker_record_command:
        'opl runtime app-release-evidence record --payload \'{"typed_blocker_refs":["typed-blocker:app-release/<reason>"]}\'',
      owner_acceptance_record_command:
        'opl runtime app-release-evidence record --payload \'{"owner_acceptance_refs":["owner-acceptance:app-release/<cohort>"]}\'',
      verify_command: 'opl runtime app-release-evidence verify --receipt-ref <receipt_ref>',
      readback_commands: [
        'opl runtime app-release-evidence list --json',
        'opl runtime app-operator-drilldown --json',
        'opl framework operating-maturity --family-defaults --json',
      ],
      stop_loss: [
        'when open_gate_count is zero and release_ready_authorized is false, request release owner verdict or typed blocker instead of recording more OPL user-path evidence',
        'do not mix release_owner_receipt_refs with typed_blocker_refs or same-cohort user-path refs in one payload',
      ],
      authority_boundary: {
        refs_only: true,
        can_write_app_repo_truth: false,
        can_create_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_claim_release_ready: false,
        can_claim_production_ready: false,
        can_close_app_release_user_path: false,
      },
    },
    pending_verify_receipt_ref_count: recordedLedgerReceipts.length,
    pending_verify_receipt_refs: recordedLedgerReceipts.map((receipt) => receipt.receipt_ref),
    gate_items: openGateItems,
    required_return_shapes: [
      'release_package_receipt_ref',
      'screenshot_evidence_ref',
      'reload_prompt_user_path_receipt_ref',
      'provider_state_linkage_ref',
      'long_operator_evidence_ref',
      'release_owner_receipt_ref',
      'install_evidence_ref',
      'typed_blocker_ref',
      'owner_acceptance_ref',
    ],
    owner_acceptance_refs: ownerAcceptanceRefs,
    owner_acceptance_ref_count: ownerAcceptanceRefs.length,
    payload_owner: 'app_live_operator_or_release_owner',
    full_detail_section: 'app_release_user_path_evidence',
    authority_boundary: {
      ...record(drilldown.authority_boundary),
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      can_mutate_artifact_body: false,
      can_close_app_release_user_path: false,
    },
  };
}

export function buildAppReleaseUserPathEvidenceFromRuntime(input: {
  authorityBoundary: JsonRecord;
  appRuntimeRole: JsonRecord;
  packageLifecycle: JsonRecord;
  productionEvidenceTailLedger: JsonRecord;
  providerActionRefs: unknown[];
  periodicRefs: JsonRecord;
}) {
  return buildAppReleaseUserPathEvidence({
    authority_boundary: input.authorityBoundary,
    codex_app_runtime_role: input.appRuntimeRole,
    package_export_lifecycle_refs: input.packageLifecycle,
    production_evidence_tail_ledger: input.productionEvidenceTailLedger,
    provider_slo_operator_action_refs: {
      refs: input.providerActionRefs,
    },
    periodic_execution_refs: input.periodicRefs,
  });
}

export function appReleaseUserPathEvidenceSourceRef() {
  return sourceRef(
    '/runtime_tray_snapshot/app_operator_drilldown/app_release_user_path_evidence',
    'app_release_user_path_evidence',
  );
}

export function appReleaseUserPathEvidenceNextStep(evidence: JsonRecord) {
  const targetSurface = stringValue(evidence.target_surface)
    ?? 'one_person_lab_app_release_user_path';
  const pendingVerifyReceiptRefs = stringList(evidence.pending_verify_receipt_refs);
  const recordArgs = ['runtime', 'app-release-evidence', 'record'];
  const firstPendingVerifyReceiptRef = pendingVerifyReceiptRefs[0] ?? null;
  const verifyArgs = firstPendingVerifyReceiptRef
    ? ['runtime', 'app-release-evidence', 'verify', '--receipt-ref', firstPendingVerifyReceiptRef]
    : null;
  const recordRequired = numberValue(evidence.open_gate_count) > 0;
  const canRecord = recordRequired || evidence.blocked_by_typed_blocker_refs === true;
  const recordActionId = canRecord
    ? `app_release_user_path_evidence:${targetSurface}:record`
    : null;
  return {
    step_kind: 'app_release_user_path_evidence',
    owner: stringValue(evidence.owner) ?? 'one-person-lab',
    target_surface: targetSurface,
    status: stringValue(evidence.status),
    production_user_path_ready: evidence.production_user_path_ready === true,
    refs_observed_for_all_gates: evidence.refs_observed_for_all_gates === true,
    release_ready_claimed: evidence.release_ready_claimed === true,
    production_ready_claimed: evidence.production_ready_claimed === true,
    open_gate_count: numberValue(evidence.open_gate_count),
    open_gate_ids: stringList(evidence.open_gate_ids),
    required_refs_by_gate: recordList(evidence.gate_items).map((gate) => ({
      gate_id: stringValue(gate.gate_id),
      status: stringValue(gate.status),
      required_refs_any_of: stringList(gate.required_refs_any_of),
      observed_ref_count: numberValue(gate.observed_ref_count),
      current_contract_status: stringValue(gate.current_contract_status),
    })),
    required_return_shapes: stringList(evidence.required_return_shapes),
    payload_owner: stringValue(evidence.payload_owner)
      ?? 'app_live_operator_or_release_owner',
    evidence_ledger_status: stringValue(evidence.evidence_ledger_status),
    ledger_receipt_ref_count: numberValue(evidence.ledger_receipt_ref_count),
    recorded_ledger_receipt_ref_count:
      numberValue(evidence.recorded_ledger_receipt_ref_count),
    verified_ledger_receipt_ref_count:
      numberValue(evidence.verified_ledger_receipt_ref_count),
    pending_verify_receipt_ref_count:
      numberValue(evidence.pending_verify_receipt_ref_count),
    pending_verify_receipt_refs: pendingVerifyReceiptRefs,
    cohort_guard_status: stringValue(record(evidence.cohort_guard).status),
    selected_cohort_id: stringValue(record(evidence.cohort_guard).selected_cohort_id),
    candidate_cohort_ids: stringList(record(evidence.cohort_guard).candidate_cohort_ids),
    receipt_verification_required: pendingVerifyReceiptRefs.length > 0,
    verification_action_id: pendingVerifyReceiptRefs.length > 0
      ? `app_release_user_path_evidence:${targetSurface}:verify`
      : null,
    verification_command_ref: verifyArgs ? commandRef(verifyArgs) : null,
    can_submit_verify_to_safe_action_shell: verifyArgs !== null,
    can_close_without_domain_or_app_payload: pendingVerifyReceiptRefs.length > 0,
    record_action_id: recordActionId,
    record_command_ref: canRecord ? commandRef(recordArgs) : null,
    copyable_runtime_action_execute_commands: recordActionId
      ? {
          record_with_payload: runtimeActionExecuteCommand(recordActionId),
        }
      : null,
    can_submit_record_to_safe_action_shell: canRecord,
    route_requires_domain_or_app_payload: canRecord,
    payload_template: canRecord
      ? appReleaseUserPathPayloadTemplate()
      : null,
    payload_ref_hints: canRecord
      ? appReleaseUserPathPayloadRefHints()
      : null,
    payload_workorder: canRecord
      ? appReleaseUserPathPayloadWorkorder(
          stringList(evidence.required_return_shapes),
          stringList(evidence.open_gate_ids),
        )
      : null,
    payload_template_policy: canRecord
      ? 'template_is_empty_by_design_replace_with_real_app_live_release_or_typed_blocker_refs_before_submit'
      : null,
    empty_payload_template_is_success_evidence: false,
    typed_blocker_ref_count: numberValue(evidence.typed_blocker_ref_count),
    blocked_by_typed_blocker_refs: evidence.blocked_by_typed_blocker_refs === true,
    owner_acceptance_ref_count: numberValue(evidence.owner_acceptance_ref_count),
    owner_acceptance_refs: stringList(evidence.owner_acceptance_refs),
    release_owner_verdict_handoff: record(evidence.release_owner_verdict_handoff),
    full_detail_section: 'app_release_user_path_evidence',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_close_app_release_user_path: false,
  };
}

export function buildAppReleaseUserPathEvidenceActionRoutes(evidence: JsonRecord) {
  const receipts = listAppReleaseUserPathEvidenceReceipts();
  const recordedReceipt = receipts.find((receipt) => receipt.receipt_status === 'recorded');
  const targetSurface = stringValue(evidence.target_surface)
    ?? 'one_person_lab_app_release_user_path';
  const baseRoute = {
    role: 'operator_action_route',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    stage_attempt_id: null,
    domain_id: null,
    stage_id: null,
    request_id: 'one_person_lab_app_release_user_path',
    request_pack_id: 'one_person_lab_app.app_release_user_path_evidence',
    evidence_route_kind: 'app_release_user_path_evidence',
    evidence_source_ref: '/runtime_tray_snapshot/app_operator_drilldown/app_release_user_path_evidence',
    target_surface: targetSurface,
    payload_owner: 'app_live_operator_or_release_owner',
    creates_domain_action: false,
    creates_owner_receipt: false,
    owner_receipt_refs: [],
    can_execute: false as const,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_app_release_user_path: false,
    authority_boundary: routeAuthorityBoundary(),
  };

  if (recordedReceipt) {
    const args = [
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      recordedReceipt.receipt_ref,
    ];
    return [{
      ...baseRoute,
      ref: commandRef(args),
      opl_cli_args: args,
      action_id: `app_release_user_path_evidence:${targetSurface}:verify`,
      action_kind: 'app_release_user_path_evidence_receipt_verify',
      route_status: 'verify_route_available',
      route_status_detail: 'recorded_app_release_user_path_evidence_receipt_waiting_for_verify',
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: true,
      required_operator_payload_refs: [],
      required_evidence_refs: [],
      required_return_shapes: [],
      required_receipt_shapes: ['app_release_user_path_evidence_verified_receipt_ref'],
      receipt_ref: recordedReceipt.receipt_ref,
      typed_blocker_refs: stringList(recordedReceipt.typed_blocker_refs),
      open_reason: 'recorded_app_release_user_path_evidence_receipt_requires_verify',
      payload_requirement: null,
      payload_template: null,
      payload_ref_hints: null,
      payload_template_policy: null,
    }];
  }

  if (numberValue(evidence.open_gate_count) <= 0) {
    return [];
  }

  const args = ['runtime', 'app-release-evidence', 'record'];
  return [{
    ...baseRoute,
    ref: commandRef(args),
    opl_cli_args: args,
    action_id: `app_release_user_path_evidence:${targetSurface}:record`,
    action_kind: 'app_release_user_path_evidence_receipt_record',
    route_status: 'record_route_available',
    route_status_detail: 'app_release_user_path_evidence_waiting_for_app_live_or_release_refs_payload',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    required_operator_payload_refs: [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
      'release_owner_receipt_refs',
      'install_evidence_refs',
      'typed_blocker_refs',
      'owner_acceptance_refs',
    ],
    required_evidence_refs: stringList(evidence.open_gate_ids),
    required_return_shapes: stringList(evidence.required_return_shapes),
    required_receipt_shapes: ['app_release_user_path_evidence_receipt_ref'],
    typed_blocker_refs: stringList(evidence.typed_blocker_refs),
    owner_acceptance_refs: stringList(evidence.owner_acceptance_refs),
    open_reason: 'app_release_user_path_evidence_refs_or_typed_blocker_refs_required',
    payload_requirement:
      'app_live_operator_or_release_owner_refs_payload_required_to_record_app_release_user_path_evidence_or_typed_blocker',
    payload_template: appReleaseUserPathPayloadTemplate(),
    payload_ref_hints: appReleaseUserPathPayloadRefHints(),
    payload_workorder: appReleaseUserPathPayloadWorkorder(
      stringList(evidence.required_return_shapes),
      stringList(evidence.open_gate_ids),
    ),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_app_live_release_or_typed_blocker_refs_before_submit',
    empty_payload_template_is_success_evidence: false,
    copyable_runtime_action_execute_commands: {
      record_with_payload: runtimeActionExecuteCommand(
        `app_release_user_path_evidence:${targetSurface}:record`,
      ),
    },
  }];
}

export function frameworkAppReleaseUserPathNextSafeAction(evidence: JsonRecord) {
  return {
    ...appReleaseUserPathEvidenceNextStep(evidence),
    action_id: 'review_app_release_user_path_evidence',
    action_kind: 'app_release_user_path_evidence_review',
    evidence_closure_gate:
      'app_release_package_screenshot_reload_provider_state_long_operator_gate',
    full_detail_section:
      'attention_first_payload.evidence_after_contract.app_release_user_path_evidence',
    authority: 'operator_attention_only',
    can_write_domain_truth: false,
    can_create_typed_blocker: false,
  };
}

export function appReleaseUserPathEvidenceSummary(appReleaseUserPathEvidence: JsonRecord) {
  const gateItems = recordList(appReleaseUserPathEvidence.gate_items);
  return {
    gate_count: typeof appReleaseUserPathEvidence.gate_count === 'number'
      ? appReleaseUserPathEvidence.gate_count
      : gateItems.length,
    open_gate_count: typeof appReleaseUserPathEvidence.open_gate_count === 'number'
      ? appReleaseUserPathEvidence.open_gate_count
      : gateItems.length,
    ledger_receipt_ref_count:
      numberValue(appReleaseUserPathEvidence.ledger_receipt_ref_count),
    typed_blocker_ref_count:
      numberValue(appReleaseUserPathEvidence.typed_blocker_ref_count),
    owner_acceptance_ref_count:
      numberValue(appReleaseUserPathEvidence.owner_acceptance_ref_count),
    recorded_ledger_receipt_ref_count:
      numberValue(appReleaseUserPathEvidence.recorded_ledger_receipt_ref_count),
    verified_ledger_receipt_ref_count:
      numberValue(appReleaseUserPathEvidence.verified_ledger_receipt_ref_count),
    pending_verify_receipt_ref_count:
      numberValue(appReleaseUserPathEvidence.pending_verify_receipt_ref_count),
    production_user_path_ready:
      appReleaseUserPathEvidence.production_user_path_ready === true,
    release_ready_claimed:
      appReleaseUserPathEvidence.release_ready_claimed === true,
    production_ready_claimed:
      appReleaseUserPathEvidence.production_ready_claimed === true,
  };
}
