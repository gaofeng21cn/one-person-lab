type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
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

function ownerPayloadEvidenceClosureGate(payloadKind: string | null) {
  if (payloadKind === 'domain_owner_receipt_or_typed_blocker_refs') {
    return 'domain_owner_chain_receipt_or_typed_blocker_gate';
  }
  if (payloadKind === 'stage_expected_receipt_or_monitor_freshness_refs') {
    return 'stage_expected_receipt_monitor_freshness_gate';
  }
  if (payloadKind === 'domain_owned_typed_blocker_refs') {
    return 'domain_typed_blocker_followthrough_gate';
  }
  if (payloadKind === 'domain_owned_receipt_refs') {
    return 'domain_owner_receipt_evidence_gate';
  }
  if (payloadKind === 'opl_cleanup_ledger_refs') {
    return 'opl_cleanup_ledger_domain_physical_delete_owner_receipt_gate';
  }
  return 'domain_app_live_evidence_payload_gate';
}

function frameworkOwnerPayloadGroupNextSafeAction(group: JsonRecord) {
  const payloadKind = stringValue(group.payload_kind);
  return {
    action_id: 'review_owner_payload_group_scaleout',
    action_kind: 'owner_payload_group_scaleout',
    step_kind: 'owner_payload_group_scaleout',
    evidence_closure_gate: ownerPayloadEvidenceClosureGate(payloadKind),
    owner: stringValue(group.owner) ?? 'domain_repository_or_app_live_operator',
    payload_kind: payloadKind,
    status: stringValue(group.status) ?? 'needs_owner_payload_refs',
    attention_count: numberValue(group.attention_count),
    open_envelope_count: numberValue(group.open_envelope_count),
    blocked_envelope_count: numberValue(group.blocked_envelope_count),
    receipt_ref_count: numberValue(group.receipt_ref_count),
    typed_blocker_ref_count: numberValue(group.typed_blocker_ref_count),
    evidence_ref_count: numberValue(group.evidence_ref_count),
    required_refs_any_of: stringList(group.required_refs_any_of),
    full_detail_section: 'evidence_envelope',
    authority: 'operator_attention_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function frameworkDomainDispatchGroupNextSafeAction(group: JsonRecord) {
  return {
    action_id: 'review_domain_dispatch_group_workorder',
    action_kind: 'domain_dispatch_evidence_group_workorder',
    step_kind: 'domain_dispatch_evidence_group_workorder',
    evidence_closure_gate: 'domain_dispatch_owner_chain_payload_gate',
    payload_requirement:
      'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
    owner: stringValue(group.owner)
      ?? stringValue(group.canonical_domain_id)
      ?? 'domain_repository_or_app_live_operator',
    payload_owner: stringValue(group.payload_owner) ?? 'domain_repository_or_app_live_operator',
    canonical_domain_id: stringValue(group.canonical_domain_id),
    stage_id: stringValue(group.stage_id),
    route_domain_ids: stringList(group.route_domain_ids),
    route_domain_id_policy: stringValue(group.route_domain_id_policy),
    workorder_count: numberValue(group.workorder_count),
    stage_attempt_count: numberValue(group.stage_attempt_count),
    sample_stage_attempt_ids: stringList(group.sample_stage_attempt_ids),
    stage_attempt_id_omitted_count: numberValue(group.stage_attempt_id_omitted_count),
    sample_action_refs: stringList(group.sample_action_refs),
    action_ref_omitted_count: numberValue(group.action_ref_omitted_count),
    required_operator_payload_ref_count: numberValue(group.required_operator_payload_ref_count),
    required_operator_payload_refs: stringList(group.required_operator_payload_refs),
    payload_path_policy: stringValue(group.payload_path_policy),
    accepted_payload_paths: record(group.accepted_payload_paths),
    payload_preflight_policy: stringValue(group.payload_preflight_policy),
    payload_preflight_policy_count: numberValue(group.payload_preflight_policy_count),
    payload_preflight_error_code: stringValue(group.payload_preflight_error_code),
    payload_preflight_blocked_error_kind: stringValue(group.payload_preflight_blocked_error_kind),
    required_evidence_ref_count: numberValue(group.required_evidence_ref_count),
    sample_required_evidence_refs: stringList(group.sample_required_evidence_refs),
    required_evidence_ref_omitted_count: numberValue(group.required_evidence_ref_omitted_count),
    required_return_shapes: stringList(group.required_return_shapes),
    full_detail_section: 'domain_dispatch_evidence',
    authority: 'operator_attention_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function frameworkOwnerHandoffNextSafeAction(packet: JsonRecord) {
  const owners = recordList(packet.owners);
  const firstOwner = owners[0] ?? {};
  return {
    action_id: 'review_owner_handoff_packet',
    action_kind: 'owner_handoff_packet_review',
    step_kind: 'owner_handoff_packet_review',
    evidence_closure_gate: 'domain_or_app_live_owner_handoff_gate',
    owner: stringValue(firstOwner.owner) ?? 'domain_repository_or_app_live_operator',
    owner_count: numberValue(packet.owner_count),
    owner_omitted_count: numberValue(packet.owner_omitted_count),
    top_owner_attention_count: numberValue(firstOwner.attention_count),
    top_owner_open_envelope_count: numberValue(firstOwner.open_envelope_count),
    top_owner_blocked_envelope_count: numberValue(firstOwner.blocked_envelope_count),
    top_owner_payload_group_count: numberValue(firstOwner.owner_payload_group_count),
    top_owner_domain_dispatch_group_count: numberValue(firstOwner.domain_dispatch_group_count),
    top_payload_kind: stringValue(firstOwner.top_payload_kind),
    top_stage_id: stringValue(firstOwner.top_stage_id),
    required_refs_any_of: stringList(firstOwner.required_refs_any_of),
    required_return_shapes: stringList(firstOwner.required_return_shapes),
    payload_path_policy: stringValue(firstOwner.payload_path_policy),
    accepted_payload_paths: record(firstOwner.accepted_payload_paths),
    payload_preflight_policy: stringValue(firstOwner.payload_preflight_policy),
    payload_preflight_policy_count: numberValue(firstOwner.payload_preflight_policy_count),
    payload_preflight_blocked_error_kind:
      stringValue(firstOwner.payload_preflight_blocked_error_kind),
    full_detail_sections: stringList(firstOwner.full_detail_sections),
    payload_requirement:
      'domain_or_app_live_owner_payload_refs_required_to_close_owner_handoff_attention',
    full_detail_section: 'attention_first_payload.evidence_after_contract.owner_handoff_packet',
    authority: 'operator_attention_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
  };
}

function frameworkOmaProductionConsumptionNextSafeAction(followthrough: JsonRecord) {
  return {
    action_id: 'review_oma_production_consumption_followthrough',
    action_kind: 'oma_production_consumption_followthrough_review',
    step_kind: 'oma_production_consumption_followthrough',
    evidence_closure_gate: 'oma_managed_install_app_live_owner_receipt_long_soak_gate',
    owner: stringValue(followthrough.owner) ?? 'one-person-lab',
    target_agent: stringValue(followthrough.target_agent) ?? 'opl-meta-agent',
    target_repo: stringValue(followthrough.target_repo) ?? 'opl-meta-agent',
    status: stringValue(followthrough.status),
    structural_consumption_ready: followthrough.structural_consumption_ready === true,
    production_consumption_ready: followthrough.production_consumption_ready === true,
    open_gate_count: numberValue(followthrough.open_gate_count),
    open_gate_ids: stringList(followthrough.open_gate_ids),
    required_return_shapes: stringList(followthrough.required_return_shapes),
    full_detail_section: 'attention_first_payload.evidence_after_contract.oma_production_consumption_followthrough',
    authority: 'operator_attention_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_promote_default_agent_without_gate: false,
  };
}

export function frameworkAttentionNextSafeActions(input: {
  blockers: JsonRecord[];
  warnings: JsonRecord[];
  ownerPayloadGroups: JsonRecord[];
  ownerHandoffPacket: JsonRecord;
  omaProductionConsumptionFollowthrough: JsonRecord;
  domainDispatchEvidenceWorkorderGroupAttentionItems: JsonRecord[];
  itemLimit: number;
}) {
  if (input.blockers.length > 0) {
    return [{
      action_id: 'inspect_framework_kernel_blockers',
      step_kind: 'framework_kernel_blocker_inspection',
      evidence_closure_gate: 'framework_kernel_hard_blocker_gate',
      command: 'opl framework readiness --family-defaults --json',
      authority: 'diagnostic_only',
    }];
  }
  if (input.warnings.length === 0) {
    return [{
      action_id: 'no_framework_readiness_action_required',
      step_kind: 'no_framework_readiness_action_required',
      evidence_closure_gate: 'none',
      authority: 'no_op',
    }];
  }
  return [
    {
      action_id: 'review_framework_attention_items',
      step_kind: 'framework_attention_review',
      evidence_closure_gate: 'operator_attention_triage_gate',
      command: 'opl framework readiness --family-defaults --json',
      authority: 'operator_attention_only',
    },
    ...input.ownerPayloadGroups.slice(0, 1).map(frameworkOwnerPayloadGroupNextSafeAction),
    ...(
      recordList(input.ownerHandoffPacket.owners).length > 0
        ? [frameworkOwnerHandoffNextSafeAction(input.ownerHandoffPacket)]
        : []
    ),
    ...(
      numberValue(input.omaProductionConsumptionFollowthrough.open_gate_count) > 0
        ? [
            frameworkOmaProductionConsumptionNextSafeAction(
              input.omaProductionConsumptionFollowthrough,
            ),
          ]
        : []
    ),
    ...input.domainDispatchEvidenceWorkorderGroupAttentionItems
      .slice(0, 1)
      .map(frameworkDomainDispatchGroupNextSafeAction),
  ].slice(0, input.itemLimit);
}
