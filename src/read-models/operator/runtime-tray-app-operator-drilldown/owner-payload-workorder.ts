import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

const OWNER_PAYLOAD_PATH_POLICY =
  'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks';

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function payloadTemplate(requiredRefsAnyOf: string[]) {
  return Object.fromEntries(requiredRefsAnyOf.map((ref) => [ref, []]));
}

function returnShapeForRef(ref: string) {
  if (ref.endsWith('_refs')) {
    return `${ref.slice(0, -5)}_ref`;
  }
  return ref;
}

export function buildOwnerPayloadWorkorder(input: {
  owner: string;
  payloadKinds: string[];
  requiredRefsAnyOf: string[];
  requiredReturnShapes?: string[];
  fullDetailSections?: string[];
}): JsonRecord {
  const requiredRefsAnyOf = uniqueStrings(input.requiredRefsAnyOf);
  const successRefs = requiredRefsAnyOf.filter((ref) => ref !== 'typed_blocker_refs');
  const requiredReturnShapes = uniqueStrings(
    input.requiredReturnShapes && input.requiredReturnShapes.length > 0
      ? input.requiredReturnShapes
      : requiredRefsAnyOf.map(returnShapeForRef),
  );
  return {
    surface_kind: 'opl_owner_handoff_payload_workorder',
    workorder_policy: OWNER_PAYLOAD_PATH_POLICY,
    payload_path_policy: OWNER_PAYLOAD_PATH_POLICY,
    payload_owner: 'domain_repository_or_app_live_operator',
    owner: input.owner,
    payload_kinds: uniqueStrings(input.payloadKinds),
    full_detail_sections: uniqueStrings(input.fullDetailSections ?? []),
    required_operator_payload_refs: requiredRefsAnyOf,
    required_return_shapes: requiredReturnShapes,
    payload_template: payloadTemplate(requiredRefsAnyOf),
    accepted_payload_paths: {
      success_refs_path: {
        required_any_operator_payload_refs: successRefs,
        typed_blocker_refs_must_be_absent: true,
        closes_owner_chain: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
      typed_blocker_path: {
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        closes_owner_chain: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
    empty_payload_template_is_success_evidence: false,
    authority_boundary: {
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_write_owner_receipt: false,
      can_create_owner_receipt: false,
      can_generate_domain_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_generate_owner_chain_ref: false,
      can_generate_no_regression_ref: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_authorize_quality_or_export: false,
      refs_only: true,
    },
  };
}
