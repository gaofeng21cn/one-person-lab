import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildOperatorActionRoute,
} from './value-utils.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'functional_privatization_semantic_equivalence_ledger_refs_only',
    provider: 'runtime_slo_receipt_owner',
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
    can_claim_private_residue_deleted: false,
    can_replace_domain_owner: false,
  };
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

function routePayloadRefHints(module: JsonRecord) {
  return {
    semantic_equivalence_proof_refs_should_cover: [
      'semantic_equivalence_proof_ref',
      'direct_hosted_parity_ref',
    ],
    opl_generated_or_hosted_surface_consumption_refs_should_cover: [
      ...stringList(module.expected_opl_primitives),
      'opl_generated_or_hosted_surface_consumption_ref',
    ],
    domain_owner_receipt_refs_should_cover: [
      'domain_owner_receipt_ref',
    ],
    typed_blocker_refs_may_close_instead_of_success: true,
    no_regression_evidence_refs_recommended: true,
  };
}

function actionRoute(domain: JsonRecord, module: JsonRecord) {
  const domainId = stringValue(domain.domain_id);
  const moduleId = stringValue(module.module_id);
  if (!domainId || !moduleId || stringValue(module.semantic_equivalence_status) !== 'review_required') {
    return null;
  }
  const requestId = `functional_privatization_semantic_equivalence:${domainId}:${moduleId}`;
  const args = [
    'agents',
    'evidence',
    'apply',
    '--domain',
    domainId,
    '--request-id',
    requestId,
    '--request-pack-id',
    `${domainId}.functional_privatization_semantic_equivalence`,
    '--source-ref',
    `/functional_privatization_audit/private_platform_residue_inventory/${moduleId}`,
  ];
  return buildOperatorActionRoute(args, {
    action_id: `${requestId}:record`,
    action_kind: 'functional_privatization_semantic_equivalence_receipt_record',
    domain_id: domainId,
    target_domain_id: stringValue(domain.target_domain_id),
    request_id: requestId,
    request_pack_id: `${domainId}.functional_privatization_semantic_equivalence`,
    module_id: moduleId,
    evidence_route_kind: 'functional_privatization_semantic_equivalence',
    evidence_source_ref: `/functional_privatization_audit/private_platform_residue_inventory/${moduleId}`,
    payload_owner: 'domain_repository_or_app_live_operator',
    payload_requirement:
      'domain_app_or_live_refs_payload_required_to_record_functional_semantic_equivalence_or_typed_blocker',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    required_operator_payload_refs: [
      'semantic_equivalence_proof_refs',
      'opl_generated_or_hosted_surface_consumption_refs',
      'domain_owner_receipt_refs',
      'typed_blocker_refs',
      'no_regression_evidence_refs',
    ],
    required_evidence_refs: [
      'semantic_equivalence_proof_ref',
      'opl_generated_or_hosted_surface_consumption_ref',
      'domain_owner_receipt_ref',
      'domain_owned_typed_blocker_ref',
      'no_regression_evidence_ref',
    ],
    payload_template: payloadTemplate(),
    payload_ref_hints: routePayloadRefHints(module),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit',
    empty_payload_template_is_success_evidence: false,
    creates_domain_action: false as const,
    creates_owner_receipt: false as const,
    closes_private_residue: false as const,
    authority_boundary: refsOnlyAuthorityBoundary(),
  });
}

export function buildFunctionalPrivatizationSemanticEquivalenceActionRoutes(auditRefs: JsonRecord) {
  return recordList(auditRefs.domains)
    .flatMap((domain) => recordList(domain.private_platform_residue_inventory)
      .map((module) => actionRoute(domain, module)))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}
