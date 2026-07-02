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

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function payloadTemplate() {
  return {
    semantic_equivalence_proof_refs: [],
    opl_generated_or_hosted_surface_consumption_refs: [],
    domain_owner_receipt_refs: [],
    typed_blocker_refs: [],
    no_regression_evidence_refs: [],
  };
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

function recordActionId(domainId: string | null, moduleId: string | null) {
  if (!domainId || !moduleId) {
    return null;
  }
  return `functional_privatization_semantic_equivalence:${domainId}:${moduleId}:record`;
}

function requiresFunctionalPrivatizationFollowthrough(domain: JsonRecord, module: JsonRecord) {
  if (stringValue(module.semantic_equivalence_status) === 'review_required') {
    return true;
  }
  const domainSummary = record(domain.summary);
  return numberValue(domainSummary.active_private_generic_residue_count) > 0
    && stringValue(module.active_caller_status)?.includes('active_private') === true;
}

function requiredRefs() {
  return [
    'semantic_equivalence_proof_ref',
    'opl_generated_or_hosted_surface_consumption_ref',
    'domain_owner_receipt_ref',
    'domain_owned_typed_blocker_ref',
    'no_regression_evidence_ref',
  ];
}

export function functionalPrivatizationNextSteps(drilldown: JsonRecord) {
  const auditRefs = record(drilldown.functional_privatization_audit_refs);
  const summary = record(auditRefs.summary);
  const reviewCount = numberValue(summary.semantic_equivalence_review_count);
  const activeResidueCount = numberValue(summary.active_private_generic_residue_count);
  if (reviewCount <= 0 && activeResidueCount <= 0) {
    return [];
  }
  const items = recordList(auditRefs.domains)
    .flatMap((domain) => {
      const domainEnvelope = record(record(domain.envelope).semantic_equivalence_evidence_gate);
      const domainSummary = record(domain.summary);
      return recordList(domain.private_platform_residue_inventory)
        .filter((module) => requiresFunctionalPrivatizationFollowthrough(domain, module))
        .map((module) => {
          const owner = firstString(domain.target_domain_id, domain.domain_id)
            ?? 'domain_repository_or_app_live_operator';
          const actionId = recordActionId(stringValue(domain.domain_id), stringValue(module.module_id));
          return {
            step_kind: 'functional_privatization_semantic_equivalence_followthrough',
            owner,
            domain_id: stringValue(domain.domain_id),
            target_domain_id: stringValue(domain.target_domain_id),
            payload_owner: 'domain_repository_or_app_live_operator',
            status: 'needs_semantic_equivalence_evidence_or_typed_blocker',
            module_id: stringValue(module.module_id),
            semantic_equivalence_status: stringValue(module.semantic_equivalence_status),
            semantic_equivalence_reason: stringValue(module.semantic_equivalence_reason),
            semantic_equivalence_evidence_refs: stringList(module.semantic_equivalence_evidence_refs),
            semantic_equivalence_typed_blocker_refs:
              stringList(module.semantic_equivalence_typed_blocker_refs),
            semantic_equivalence_no_regression_refs:
              stringList(module.semantic_equivalence_no_regression_refs),
            active_caller_status: stringValue(module.active_caller_status),
            active_callers: stringList(module.active_callers),
            current_surface_refs: stringList(module.current_surface_refs),
            expected_opl_primitives: stringList(module.expected_opl_primitives),
            required_refs_any_of: requiredRefs(),
            required_operator_payload_refs: [
              'semantic_equivalence_proof_refs',
              'opl_generated_or_hosted_surface_consumption_refs',
              'domain_owner_receipt_refs',
              'typed_blocker_refs',
              'no_regression_evidence_refs',
            ],
            payload_template: payloadTemplate(),
            payload_ref_hints: {
              semantic_equivalence_proof_refs_should_cover: [
                'semantic_equivalence_proof_ref',
                'direct_hosted_parity_ref',
              ],
              opl_generated_or_hosted_surface_consumption_refs_should_cover: [
                'opl_generated_or_hosted_surface_consumption_ref',
                'agent_executor_adapter_consumption_ref',
              ],
              typed_blocker_refs_may_close_instead_of_success: true,
            },
            payload_template_policy:
              'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit',
            empty_payload_template_is_success_evidence: false,
            record_action_id: actionId,
            copyable_runtime_action_execute_commands: actionId
              ? {
                  record_with_payload: runtimeActionExecuteCommand(actionId),
                }
              : null,
            can_submit_record_to_safe_action_shell: Boolean(actionId),
            route_requires_domain_or_app_payload: Boolean(actionId),
            can_close_without_domain_or_app_payload: false,
            required_evidence_policy: stringValue(domainEnvelope.required_evidence_policy)
              ?? 'active private residue or semantic equivalence review requires domain or App live evidence refs, typed blocker, or owner receipt before private residue closure',
            review_required_count: numberValue(domainEnvelope.review_required_count),
            active_private_generic_residue_count:
              numberValue(domainEnvelope.active_private_generic_residue_count),
            domain_semantic_equivalence_review_count:
              numberValue(domainSummary.semantic_equivalence_review_count),
            bridge_exit_gate: record(module.bridge_exit_gate),
            full_detail_section: 'functional_privatization_audit_refs',
            can_execute_domain_action: false,
            can_write_domain_truth: false,
            can_create_owner_receipt: false,
            can_close_domain_ready: false,
            can_claim_private_residue_deleted: false,
            can_claim_production_ready: false,
            can_authorize_quality_or_export: false,
          };
        });
    });
  if (items.length > 0) {
    return items;
  }
  return [{
    step_kind: 'functional_privatization_semantic_equivalence_followthrough',
    owner: 'domain_repository_or_app_live_operator',
    payload_owner: 'domain_repository_or_app_live_operator',
    status: 'needs_semantic_equivalence_evidence_or_typed_blocker',
    module_id: null,
    required_refs_any_of: requiredRefs(),
    review_required_count: reviewCount,
    active_private_generic_residue_count: activeResidueCount,
    full_detail_section: 'functional_privatization_audit_refs',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_private_residue_deleted: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
  }];
}
