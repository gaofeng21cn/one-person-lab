export const OMA_PRODUCTION_CONSUMPTION_ACTION_ID =
  'oma_production_consumption:opl-meta-agent:record';

export const OMA_PRODUCTION_CONSUMPTION_ACTION_KIND =
  'oma_production_consumption_receipt_record';

export function omaProductionConsumptionPayloadTemplate() {
  return {
    long_soak_refs: [],
    typed_blocker_refs: [],
    operator_evidence_refs: [],
  };
}

export function omaProductionConsumptionPayloadRefHints() {
  return {
    long_soak_refs_should_cover: [
      'long_soak_ref',
      'operator_long_soak_ref',
      'production_soak_ref',
      'agent_lab_rerun_long_soak_ref',
    ],
    typed_blocker_refs_should_cover: [
      'typed_blocker_ref',
    ],
    operator_evidence_refs_should_cover: [
      'operator_evidence_ref',
      'monitor_ref',
      'soak_observation_ref',
    ],
  };
}

export function omaProductionConsumptionRecordAction() {
  return {
    action_id: OMA_PRODUCTION_CONSUMPTION_ACTION_ID,
    action_kind: OMA_PRODUCTION_CONSUMPTION_ACTION_KIND,
    command: 'opl runtime oma-production-consumption record',
    submit_via: 'opl runtime action execute',
    submit_args: [
      'runtime',
      'action',
      'execute',
      '--action',
      OMA_PRODUCTION_CONSUMPTION_ACTION_ID,
    ],
    route_owner: 'one-person-lab',
    payload_owner: 'app_live_operator_or_oma_owner',
    route_requires_domain_or_app_payload: true,
    can_submit_to_safe_action_shell: true,
    can_close_without_domain_or_app_payload: false,
    required_operator_payload_refs: [
      'long_soak_refs',
      'typed_blocker_refs',
      'operator_evidence_refs',
    ],
    payload_template: omaProductionConsumptionPayloadTemplate(),
    payload_ref_hints: omaProductionConsumptionPayloadRefHints(),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_oma_long_soak_or_typed_blocker_refs_before_submit',
    empty_payload_template_is_success_evidence: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_promote_default_agent_without_gate: false,
  };
}
