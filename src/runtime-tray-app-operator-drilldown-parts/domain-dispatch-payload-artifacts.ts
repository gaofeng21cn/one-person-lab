import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

const DOMAIN_DISPATCH_SUCCESS_CLOSEOUT_PAYLOAD_REFS = [
  'domain_receipt_refs',
  'owner_chain_refs',
  'no_regression_refs',
];

const DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS = [
  'typed_blocker_refs',
];

export const DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS = [
  'evidence_refs',
];

export const DOMAIN_DISPATCH_RECORD_REQUIRED_PAYLOAD_REFS = [
  ...DOMAIN_DISPATCH_SUCCESS_CLOSEOUT_PAYLOAD_REFS,
  ...DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS,
];

export const DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES = [
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
  'domain_typed_blocker_ref',
  'owner_chain_ref',
  'no_regression_ref',
];

type CloseoutBindingRequirement = {
  closeout_binding_ready: boolean;
  closeout_binding: JsonRecord;
};

function withOwnerDeltaResult(closeoutBindingRequirement: CloseoutBindingRequirement) {
  return closeoutBindingRequirement.closeout_binding_ready
    ? {
        owner_delta_result: {
          closeout_binding: closeoutBindingRequirement.closeout_binding,
        },
      }
    : {};
}

function payloadTemplate(closeoutBindingRequirement: CloseoutBindingRequirement) {
  return {
    domain_receipt_refs: [],
    typed_blocker_refs: [],
    no_regression_refs: [],
    owner_chain_refs: [],
    evidence_refs: [],
    ...withOwnerDeltaResult(closeoutBindingRequirement),
  };
}

function successPayloadExample(
  domainId: string,
  closeoutBindingRequirement: CloseoutBindingRequirement,
) {
  return {
    domain_receipt_refs: [`<${domainId}-owner-receipt-ref>`],
    typed_blocker_refs: [],
    no_regression_refs: [`<${domainId}-no-regression-ref>`],
    owner_chain_refs: [`<${domainId}-owner-chain-ref>`],
    evidence_refs: [],
    ...withOwnerDeltaResult(closeoutBindingRequirement),
  };
}

function typedBlockerPayloadExample(
  domainId: string,
  closeoutBindingRequirement: CloseoutBindingRequirement,
) {
  return {
    domain_receipt_refs: [],
    typed_blocker_refs: [`<${domainId}-typed-blocker-ref>`],
    no_regression_refs: [],
    owner_chain_refs: [],
    evidence_refs: [],
    ...withOwnerDeltaResult(closeoutBindingRequirement),
  };
}

export function buildDomainDispatchRecordPayloadArtifacts(input: {
  domainId: string;
  stageAttemptId: string;
  closeoutBindingRequirement: CloseoutBindingRequirement;
}) {
  const template = payloadTemplate(input.closeoutBindingRequirement);
  const successExample = successPayloadExample(input.domainId, input.closeoutBindingRequirement);
  const typedBlockerExample = typedBlockerPayloadExample(
    input.domainId,
    input.closeoutBindingRequirement,
  );
  return {
    payloadTemplate: template,
    successPayloadExample: successExample,
    typedBlockerPayloadExample: typedBlockerExample,
    payloadWorkorder: {
      surface_kind: 'opl_domain_dispatch_evidence_payload_workorder',
      workorder_policy:
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      payload_owner: 'domain_repository_or_app_live_operator',
      accepted_payload_paths: {
        success_refs_path: {
          required_any_operator_payload_refs: DOMAIN_DISPATCH_SUCCESS_CLOSEOUT_PAYLOAD_REFS,
          supplemental_operator_payload_refs: DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS,
          typed_blocker_refs_must_be_absent: true,
          closes_domain_ready: false,
          closes_production_ready: false,
        },
        typed_blocker_path: {
          required_operator_payload_refs: DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS,
          success_claimed: false,
          closes_domain_ready: false,
          closes_production_ready: false,
        },
      },
      required_evidence_refs: [
        `domain_dispatch:${input.domainId}:${input.stageAttemptId}:owner_receipt_or_typed_blocker`,
      ],
      required_return_shapes: DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES,
      required_closeout_binding: input.closeoutBindingRequirement,
      success_refs_path_payload: successExample,
      typed_blocker_path_payload: typedBlockerExample,
      empty_payload_template_is_success_evidence: false,
      preflight_error_code: 'cli_usage_error',
      preflight_blocked_error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
      authority_boundary: {
        can_write_domain_truth: false,
        can_generate_domain_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_close_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}
