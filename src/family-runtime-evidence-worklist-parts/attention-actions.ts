type JsonRecord = Record<string, unknown>;
type JsonRef = string | JsonRecord;

function refList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRef =>
    typeof entry === 'string'
    || (Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
  ) : [];
}

export function attentionQueueItem(item: JsonRecord) {
  return {
    item_id: item.item_id,
    owner: item.owner,
    route_owner: item.route_owner,
    safe_action_owner: item.safe_action_owner,
    domain_id: item.domain_id,
    stage_id: item.stage_id,
    claim_scope: item.claim_scope,
    next_safe_action_ref: item.replay_ref,
    missing_or_expected_refs: refList(item.expected_refs),
    open_reason: item.open_reason,
    payload_requirement: item.payload_requirement,
    payload_owner: item.payload_owner,
    route_requires_domain_or_app_payload: item.route_requires_domain_or_app_payload,
    authority: 'operator_attention_only',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

export function nextSafeActions(openItems: JsonRecord[], limit = 5) {
  return openItems.slice(0, limit).map((item) => ({
    item_id: item.item_id,
    action_id: item.action_id,
    action_kind: item.action_kind,
    owner: item.owner,
    domain_id: item.domain_id ?? null,
    stage_id: item.stage_id ?? null,
    claim_scope: item.claim_scope,
    route_status: item.route_status,
    route_status_detail: item.route_status_detail,
    next_safe_action_ref: item.replay_ref,
    expected_ref_count: refList(item.expected_refs).length,
    typed_blocker_ref: item.typed_blocker_ref,
    open_reason: item.open_reason,
    payload_requirement: item.payload_requirement,
    payload_owner: item.payload_owner,
    payload_template: item.payload_template,
    payload_ref_hints: item.payload_ref_hints,
    payload_workorder: item.payload_workorder,
    accepted_payload_paths: item.accepted_payload_paths,
    required_operator_payload_refs: item.required_operator_payload_refs,
    supplemental_operator_payload_refs: item.supplemental_operator_payload_refs,
    payload_template_policy: item.payload_template_policy,
    payload_preflight_policy: item.payload_preflight_policy,
    payload_preflight_error_code: item.payload_preflight_error_code,
    payload_preflight_blocked_error_kind: item.payload_preflight_blocked_error_kind,
    empty_payload_template_is_success_evidence: item.empty_payload_template_is_success_evidence,
    copyable_runtime_action_execute_commands: item.copyable_runtime_action_execute_commands,
    target_identity: item.target_identity,
    dispatch_identity_key: item.dispatch_identity_key,
    dispatch_identity_fields: item.dispatch_identity_fields,
    identity_binding_policy: item.identity_binding_policy,
    identity_binding_guidance: item.identity_binding_guidance,
    route_requires_domain_or_app_payload: item.route_requires_domain_or_app_payload,
    authority: 'operator_attention_only',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    worklist_item_is_completion_claim: false,
  }));
}
