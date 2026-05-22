import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { sourceRef } from '../runtime-tray-snapshot-utils.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    if (typeof entry === 'string') {
      return [entry];
    }
    return stringList(entry);
  }));
}

function refsFromRecords(values: JsonRecord[], keys: string[]) {
  return uniqueStrings(values.flatMap((value) => refsFromRecord(value, keys)));
}

function evidenceGate(input: {
  gateId: string;
  requiredRefsAnyOf: string[];
  observedRefs: string[];
}) {
  return {
    gate_id: input.gateId,
    status: input.observedRefs.length > 0 ? 'refs_observed' : `missing_${input.gateId}`,
    required_refs_any_of: input.requiredRefsAnyOf,
    observed_refs: input.observedRefs,
    observed_ref_count: input.observedRefs.length,
    current_contract_status: 'not_claimed_by_contract',
    full_detail_section: 'app_release_user_path_evidence',
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      can_mutate_artifact_body: false,
    },
  };
}

export function buildAppReleaseUserPathEvidence(drilldown: JsonRecord) {
  const gates = [
    evidenceGate({
      gateId: 'release_package_refs',
      requiredRefsAnyOf: [
        'release_package_receipt_ref',
        'release_bundle_ref',
        'app_release_artifact_ref',
        'release_sidecar_ref',
      ],
      observedRefs: refsFromRecords([
        record(drilldown.package_export_lifecycle_refs),
        record(drilldown.production_evidence_tail_ledger),
      ], [
        'release_package_refs',
        'release_bundle_refs',
        'app_release_artifact_refs',
        'dmg_refs',
        'sidecar_refs',
      ]),
    }),
    evidenceGate({
      gateId: 'screenshot_refs',
      requiredRefsAnyOf: [
        'screenshot_evidence_ref',
        'first_run_screenshot_ref',
        'operator_screenshot_ref',
      ],
      observedRefs: refsFromRecords([
        record(drilldown.production_evidence_tail_ledger),
        record(drilldown.codex_app_runtime_role),
      ], [
        'screenshot_refs',
        'app_screenshot_refs',
        'first_run_screenshot_refs',
        'operator_screenshot_refs',
      ]),
    }),
    evidenceGate({
      gateId: 'reload_prompt_user_path_refs',
      requiredRefsAnyOf: [
        'reload_prompt_user_path_receipt_ref',
        'startup_maintenance_reload_prompt_ref',
        'first_run_log_ref',
      ],
      observedRefs: refsFromRecords([
        record(drilldown.codex_app_runtime_role),
        record(drilldown.production_evidence_tail_ledger),
      ], [
        'reload_prompt_user_path_refs',
        'reload_prompt_receipt_refs',
        'first_run_log_refs',
        'startup_maintenance_reload_prompt_refs',
      ]),
    }),
    evidenceGate({
      gateId: 'provider_state_linkage_refs',
      requiredRefsAnyOf: [
        'provider_state_linkage_ref',
        'provider_cadence_receipt_ref',
        'provider_slo_receipt_ref',
      ],
      observedRefs: refsFromRecords([
        record(drilldown.provider_slo_operator_action_refs),
        record(drilldown.periodic_execution_refs),
        record(drilldown.codex_app_runtime_role),
      ], [
        'provider_state_linkage_refs',
        'provider_state_receipt_refs',
        'provider_cadence_receipt_refs',
        'provider_slo_receipt_refs',
      ]),
    }),
    evidenceGate({
      gateId: 'long_operator_evidence_refs',
      requiredRefsAnyOf: [
        'long_operator_evidence_ref',
        'operator_long_soak_ref',
        'app_user_path_long_soak_ref',
      ],
      observedRefs: refsFromRecords([
        record(drilldown.codex_app_runtime_role),
        record(drilldown.production_evidence_tail_ledger),
        record(drilldown.provider_slo_operator_action_refs),
      ], [
        'long_operator_evidence_refs',
        'operator_long_soak_refs',
        'app_user_path_long_soak_refs',
        'production_long_soak_refs',
      ]),
    }),
  ];
  const openGateItems = gates.filter((gate) => gate.status !== 'refs_observed');
  return {
    surface_kind: 'opl_app_drilldown_app_release_user_path_evidence_attention',
    owner: 'one-person-lab',
    target_surface: 'one_person_lab_app_release_user_path',
    status: openGateItems.length > 0
      ? 'app_release_user_path_evidence_open'
      : 'app_release_user_path_evidence_refs_observed',
    production_user_path_ready: false,
    refs_observed_for_all_gates: openGateItems.length === 0,
    release_ready_claimed: false,
    production_ready_claimed: false,
    gate_count: gates.length,
    open_gate_count: openGateItems.length,
    open_gate_ids: openGateItems.map((gate) => gate.gate_id),
    attention_required: openGateItems.length > 0,
    gate_items: openGateItems,
    required_return_shapes: [
      'release_package_receipt_ref',
      'screenshot_evidence_ref',
      'reload_prompt_user_path_receipt_ref',
      'provider_state_linkage_ref',
      'long_operator_evidence_ref',
      'typed_blocker_ref',
    ],
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
  return {
    step_kind: 'app_release_user_path_evidence',
    owner: stringValue(evidence.owner) ?? 'one-person-lab',
    target_surface: stringValue(evidence.target_surface)
      ?? 'one_person_lab_app_release_user_path',
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
    full_detail_section: 'app_release_user_path_evidence',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_close_app_release_user_path: false,
  };
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
    production_user_path_ready:
      appReleaseUserPathEvidence.production_user_path_ready === true,
    release_ready_claimed:
      appReleaseUserPathEvidence.release_ready_claimed === true,
    production_ready_claimed:
      appReleaseUserPathEvidence.production_ready_claimed === true,
  };
}
