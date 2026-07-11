import {
  appReleaseUserPathPayloadRefHints,
  appReleaseUserPathPayloadTemplate,
  appReleaseUserPathPayloadWorkorder,
} from '../ledger/index.ts';
import {
  countValue as numberValue,
  type JsonRecord,
  record,
  recordList,
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';

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

function appReleaseUserPathEvidenceNextStep(evidence: JsonRecord) {
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

function frameworkAppReleaseUserPathNextSafeAction(evidence: JsonRecord) {
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

function developerModeLiveCloseoutEvidenceNextStep(evidence: JsonRecord) {
  return {
    step_kind: 'developer_mode_live_closeout_evidence',
    owner: stringValue(evidence.owner) ?? 'one-person-lab',
    target_surface:
      stringValue(evidence.target_surface) ?? 'opl_developer_mode_agent_lab_live_closeout',
    status: stringValue(evidence.status),
    ledger_evidence_status: stringValue(evidence.ledger_evidence_status),
    developer_mode_live_route_closeout_refs_ready:
      evidence.developer_mode_live_route_closeout_refs_ready === true,
    attention_count: numberValue(evidence.attention_count),
    missing_live_ledger_route_count:
      numberValue(evidence.missing_live_ledger_route_count),
    missing_live_ledger_route_kinds: stringList(evidence.missing_live_ledger_route_kinds),
    scaleout_payload_required: evidence.scaleout_payload_required === true,
    pending_verify_receipt_ref_count:
      numberValue(evidence.pending_verify_receipt_ref_count),
    pending_verify_receipt_refs: stringList(evidence.pending_verify_receipt_refs),
    verified_direct_fix_ledger_receipt_ref_count:
      numberValue(evidence.verified_direct_fix_ledger_receipt_ref_count),
    verified_fork_pr_ledger_receipt_ref_count:
      numberValue(evidence.verified_fork_pr_ledger_receipt_ref_count),
    route_repetition_ref_count:
      numberValue(evidence.route_repetition_ref_count),
    risk_tier_auto_promotion_ref_count:
      numberValue(evidence.risk_tier_auto_promotion_ref_count),
    app_patrol_mount_ref_count:
      numberValue(evidence.app_patrol_mount_ref_count),
    scaleout_followthrough_open_gate_count:
      numberValue(evidence.scaleout_followthrough_open_gate_count),
    scaleout_followthrough: record(evidence.scaleout_followthrough),
    required_closeout_ref_groups: stringList(evidence.required_closeout_ref_groups),
    required_return_shapes: stringList(evidence.required_return_shapes),
    payload_owner:
      stringValue(evidence.payload_owner) ?? 'developer_mode_operator_or_external_repo_owner',
    receipt_verification_required: evidence.receipt_verification_required === true,
    verification_command_ref: stringValue(evidence.verification_command_ref),
    record_command_ref: stringValue(evidence.record_command_ref),
    route_requires_domain_or_app_payload:
      evidence.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload:
      evidence.can_close_without_domain_or_app_payload === true,
    payload_template: record(evidence.payload_template),
    payload_ref_hints: record(evidence.payload_ref_hints),
    payload_workorder: record(evidence.payload_workorder),
    payload_template_policy: stringValue(evidence.payload_template_policy),
    scaleout_payload_policy: stringValue(evidence.scaleout_payload_policy),
    empty_payload_template_is_success_evidence: false,
    full_detail_section: 'developer_mode_live_closeout_evidence',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_write_owner_receipt: false,
    can_modify_managed_runtime: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_developer_mode_live_route: false,
  };
}

function frameworkDeveloperModeLiveCloseoutNextSafeAction(evidence: JsonRecord) {
  return {
    ...developerModeLiveCloseoutEvidenceNextStep(evidence),
    action_id: 'review_developer_mode_live_closeout_evidence',
    action_kind: 'developer_mode_live_closeout_evidence_review',
    evidence_closure_gate:
      'developer_mode_direct_fix_and_fork_pr_external_owner_acceptance_gate',
    full_detail_section:
      'attention_first_payload.evidence_after_contract.developer_mode_live_closeout_evidence',
    authority: 'operator_attention_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function hasWarning(input: { warnings: JsonRecord[] }, warningId: string) {
  return input.warnings.some((warning) => stringValue(warning.warning_id) === warningId);
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

function ownerPayloadGroupCommand(owner: string | null, payloadKind: string | null) {
  const ownerArg = owner ?? '<owner>';
  const payloadKindArg = payloadKind ?? '<payload-kind>';
  return [
    'opl',
    'runtime',
    'action',
    'execute',
    '--action',
    `owner_payload:${ownerArg}:${payloadKindArg}:record`,
    '--payload-file',
    '<payload.json>',
  ].join(' ');
}

function domainDispatchRecordWithPayloadFileCommand(actionId: string | null) {
  return [
    'opl',
    'runtime',
    'action',
    'execute',
    '--action',
    actionId ?? '<domain-dispatch-record-action-id>',
    '--payload-file',
    '<payload.json>',
  ].join(' ');
}

function frameworkOwnerPayloadGroupNextSafeAction(group: JsonRecord) {
  const payloadKind = stringValue(group.payload_kind);
  const owner = stringValue(group.owner) ?? 'domain_repository_or_app_live_operator';
  return {
    action_id: 'review_owner_payload_group_scaleout',
    action_kind: 'owner_payload_group_scaleout',
    step_kind: 'owner_payload_group_scaleout',
    evidence_closure_gate: ownerPayloadEvidenceClosureGate(payloadKind),
    owner,
    payload_kind: payloadKind,
    status: stringValue(group.status) ?? 'needs_owner_payload_refs',
    attention_count: numberValue(group.attention_count),
    open_envelope_count: numberValue(group.open_envelope_count),
    blocked_envelope_count: numberValue(group.blocked_envelope_count),
    receipt_ref_count: numberValue(group.receipt_ref_count),
    typed_blocker_ref_count: numberValue(group.typed_blocker_ref_count),
    blocked_reason_count: numberValue(group.blocked_reason_count),
    evidence_ref_count: numberValue(group.evidence_ref_count),
    required_refs_any_of: stringList(group.required_refs_any_of),
    required_return_shapes: stringList(group.required_return_shapes),
    payload_path_policy: stringValue(group.payload_path_policy),
    accepted_payload_paths: record(group.accepted_payload_paths),
    owner_payload_workorder: record(group.owner_payload_workorder),
    copyable_runtime_action_execute_commands: {
      record_with_payload_file: ownerPayloadGroupCommand(owner, payloadKind),
    },
    empty_payload_template_is_success_evidence:
      group.empty_payload_template_is_success_evidence === true,
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
  const firstRecordActionId = stringList(group.sample_record_action_ids)[0] ?? null;
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
    sample_record_action_ids: stringList(group.sample_record_action_ids),
    record_action_id_omitted_count: numberValue(group.record_action_id_omitted_count),
    sample_record_command_refs: stringList(group.sample_record_command_refs),
    record_command_ref_omitted_count: numberValue(group.record_command_ref_omitted_count),
    copyable_runtime_action_execute_commands: {
      record_with_payload_file: domainDispatchRecordWithPayloadFileCommand(firstRecordActionId),
    },
    can_submit_record_to_safe_action_shell:
      group.can_submit_record_to_safe_action_shell === true,
    required_operator_payload_ref_count: numberValue(group.required_operator_payload_ref_count),
    required_operator_payload_refs: stringList(group.required_operator_payload_refs),
    payload_template: record(group.payload_template),
    payload_ref_hints: record(group.payload_ref_hints),
    payload_template_policy: stringValue(group.payload_template_policy),
    empty_payload_template_is_success_evidence:
      group.empty_payload_template_is_success_evidence === true,
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
    owner_payload_workorder: record(firstOwner.owner_payload_workorder),
    empty_payload_template_is_success_evidence:
      firstOwner.empty_payload_template_is_success_evidence === true,
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

function frameworkStageReplayMissingReceiptNextSafeAction(item: JsonRecord) {
  const guidance = record(item.default_next_action_guidance);
  return {
    action_id: 'review_stage_replay_missing_receipt_workorder',
    action_kind: 'stage_replay_missing_receipt_guidance',
    step_kind: stringValue(guidance.step_kind) ?? 'record_stage_replay_missing_receipt_payload',
    evidence_closure_gate: 'stage_replay_missing_receipt_refs_gate',
    item_id: stringValue(item.item_id),
    domain_id: stringValue(item.domain_id),
    stage_id: stringValue(item.stage_id),
    missing_ref: stringValue(item.missing_ref),
    missing_ref_kind: stringValue(item.missing_ref_kind),
    default_guidance_kind: stringValue(guidance.action_kind) ?? 'record_payload',
    owner: stringValue(guidance.owner) ?? 'domain_or_human_gate_owner',
    payload_path: stringValue(guidance.payload_path),
    record_command: stringValue(guidance.record_command),
    verify_command: stringValue(guidance.verify_command),
    alternative_action_kinds: stringList(guidance.alternative_action_kinds),
    target_identity: record(item.target_identity),
    direct_ledger_handoff: record(item.direct_ledger_handoff),
    full_detail_section:
      'attention_first_payload.stage_replay_missing_receipt_workorder_attention_items',
    authority: 'operator_attention_only',
    can_submit_record_to_safe_action_shell: false,
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
  };
}

function blockedOwnerPayloadGroupSummary(group: JsonRecord) {
  return {
    owner: stringValue(group.owner) ?? 'domain_repository_or_app_live_operator',
    payload_kind: stringValue(group.payload_kind),
    status: stringValue(group.status) ?? 'blocked_by_domain_typed_blocker_refs',
    attention_count: numberValue(group.attention_count),
    open_envelope_count: numberValue(group.open_envelope_count),
    blocked_envelope_count: numberValue(group.blocked_envelope_count),
    receipt_ref_count: numberValue(group.receipt_ref_count),
    typed_blocker_ref_count: numberValue(group.typed_blocker_ref_count),
  };
}

function blockedRefsOnlyAttentionReviewAction(input: {
  domainBlockedAttentionCount?: number;
  ownerPayloadGroups: JsonRecord[];
  familyStallLineage?: JsonRecord;
  itemLimit: number;
}) {
  const topOwnerPayloadGroups = input.ownerPayloadGroups
    .slice(0, Math.max(1, input.itemLimit))
    .map(blockedOwnerPayloadGroupSummary);
  const topOwnerPayloadGroup = topOwnerPayloadGroups[0] ?? {};
  const topLineage = recordList(record(input.familyStallLineage).lineages)[0] ?? {};
  return {
    action_id: 'review_blocked_refs_only_attention',
    action_kind: 'blocked_refs_only_attention_review',
    step_kind: 'blocked_refs_only_attention_review',
    evidence_closure_gate: 'domain_blocked_refs_only_review_gate',
    command: 'opl framework readiness --family-defaults --json',
    drilldown_commands: {
      framework_readiness_full: 'opl framework readiness --family-defaults --json',
      app_operator_drilldown_full: 'opl runtime app-operator-drilldown --detail full --json',
      evidence_worklist_full:
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
    },
    blocked_attention_summary: {
      domain_blocked_attention_count: numberValue(input.domainBlockedAttentionCount),
      top_owner_payload_group_count: topOwnerPayloadGroups.length,
      top_owner: stringValue(topOwnerPayloadGroup.owner),
      top_payload_kind: stringValue(topOwnerPayloadGroup.payload_kind),
      top_status: stringValue(topOwnerPayloadGroup.status),
      top_attention_count: numberValue(topOwnerPayloadGroup.attention_count),
      top_blocked_envelope_count: numberValue(topOwnerPayloadGroup.blocked_envelope_count),
      top_typed_blocker_ref_count: numberValue(topOwnerPayloadGroup.typed_blocker_ref_count),
      top_receipt_ref_count: numberValue(topOwnerPayloadGroup.receipt_ref_count),
      top_next_forced_delta: stringValue(topLineage.next_forced_delta),
      top_escalation_owner: stringValue(topLineage.escalation_owner),
      top_terminal: topLineage.terminal === true,
      full_detail_sections: [
        'attention_first_payload.owner_payload_groups',
        'attention_first_payload.evidence_after_contract.owner_handoff_packet',
        'evidence_envelope',
        'domain_dispatch_attention',
        'app_operator_drilldown.family_stall_lineage',
      ],
    },
    top_owner_payload_groups: topOwnerPayloadGroups,
    authority: 'refs_only_review',
    can_submit_record_to_safe_action_shell: false,
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
  };
}

export function frameworkAttentionNextSafeActions(input: {
  blockers: JsonRecord[];
  warnings: JsonRecord[];
  operatorActionableAttentionCount?: number;
  domainBlockedAttentionCount?: number;
  ownerPayloadGroups: JsonRecord[];
  ownerHandoffPacket: JsonRecord;
  appReleaseUserPathEvidence: JsonRecord;
  developerModeLiveCloseoutEvidence?: JsonRecord;
  familyStallLineage?: JsonRecord;
  domainDispatchEvidenceWorkorderGroupAttentionItems: JsonRecord[];
  stageReplayMissingReceiptWorkorderAttentionItems?: JsonRecord[];
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
  if (
    numberValue(input.operatorActionableAttentionCount) === 0
    && numberValue(input.domainBlockedAttentionCount) > 0
  ) {
    return [blockedRefsOnlyAttentionReviewAction(input)];
  }
  const shouldExposeStageReplayMissingReceiptGuidance =
    hasWarning(input, 'stage_replay_missing_receipt_attention');
  const hasHigherPriorityOwnerAttention = input.ownerPayloadGroups.length > 0
    || recordList(input.ownerHandoffPacket.owners).length > 0
    || input.domainDispatchEvidenceWorkorderGroupAttentionItems.length > 0;
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
    ...(!shouldExposeStageReplayMissingReceiptGuidance || hasHigherPriorityOwnerAttention
      ? []
      : (input.stageReplayMissingReceiptWorkorderAttentionItems ?? [])
        .map(frameworkStageReplayMissingReceiptNextSafeAction)
    ),
    ...(
      numberValue(input.appReleaseUserPathEvidence.open_gate_count) > 0
        || numberValue(input.appReleaseUserPathEvidence.pending_verify_receipt_ref_count) > 0
        ? [
            frameworkAppReleaseUserPathNextSafeAction(input.appReleaseUserPathEvidence),
          ]
        : []
    ),
    ...(
      numberValue(record(input.developerModeLiveCloseoutEvidence).attention_count) > 0
        ? [
            frameworkDeveloperModeLiveCloseoutNextSafeAction(
              record(input.developerModeLiveCloseoutEvidence),
            ),
          ]
        : []
    ),
  ].slice(0, input.itemLimit);
}
