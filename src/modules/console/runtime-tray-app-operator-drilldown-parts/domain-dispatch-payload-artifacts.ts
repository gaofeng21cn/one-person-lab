import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

const DOMAIN_DISPATCH_QUALITY_PAYLOAD_REFS = [
  'domain_receipt_refs',
  'owner_chain_refs',
  'no_regression_refs',
];

const DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS = ['typed_blocker_refs'];

export const DOMAIN_DISPATCH_PROGRESS_PAYLOAD_REFS = [
  'artifact_refs',
  'output_refs',
  'progress_delta_refs',
  'diagnostic_refs',
  'negative_result_refs',
];

export const DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS = ['evidence_refs'];

export const DOMAIN_DISPATCH_RECORD_REQUIRED_PAYLOAD_REFS = [
  ...DOMAIN_DISPATCH_PROGRESS_PAYLOAD_REFS,
  ...DOMAIN_DISPATCH_QUALITY_PAYLOAD_REFS,
  ...DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS,
];

export const DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES = [
  'readable_artifact_ref',
  'progress_delta_ref',
  'diagnostic_ref',
  'negative_result_ref',
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
];

type TransportIdentityObservation = {
  transport_identity: JsonRecord;
  missing_identity_fields: string[];
};

function payloadTemplate(observation: TransportIdentityObservation) {
  return {
    artifact_refs: [],
    output_refs: [],
    progress_delta_refs: [],
    diagnostic_refs: [],
    negative_result_refs: [],
    domain_receipt_refs: [],
    typed_blocker_refs: [],
    no_regression_refs: [],
    owner_chain_refs: [],
    evidence_refs: [],
    transport_identity: observation.transport_identity,
  };
}

export function buildDomainDispatchRecordPayloadArtifacts(input: {
  domainId: string;
  stageAttemptId: string;
  transportIdentityObservation: TransportIdentityObservation;
}) {
  const template = payloadTemplate(input.transportIdentityObservation);
  const progressExample = {
    ...template,
    artifact_refs: [`<${input.domainId}-readable-artifact-ref>`],
  };
  const qualityExample = {
    ...template,
    domain_receipt_refs: [`<${input.domainId}-owner-receipt-ref>`],
    no_regression_refs: [`<${input.domainId}-no-regression-ref>`],
  };
  const typedBlockerExample = {
    ...template,
    typed_blocker_refs: [`<${input.domainId}-typed-blocker-ref>`],
  };
  return {
    payloadTemplate: template,
    progressPayloadExample: progressExample,
    successPayloadExample: qualityExample,
    typedBlockerPayloadExample: typedBlockerExample,
    payloadWorkorder: {
      surface_kind: 'opl_domain_dispatch_progress_evidence_payload_workorder',
      workorder_policy:
        'readable_artifact_records_progress_quality_receipts_only_authorize_quality_claims',
      payload_owner: 'domain_repository_or_app_live_operator',
      accepted_payload_paths: {
        progress_refs_path: {
          required_any_operator_payload_refs: DOMAIN_DISPATCH_PROGRESS_PAYLOAD_REFS,
          next_declared_stage_may_start: true,
          records_quality_debt: true,
        },
        quality_refs_path: {
          required_any_operator_payload_refs: DOMAIN_DISPATCH_QUALITY_PAYLOAD_REFS,
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
      required_evidence_refs: [],
      required_return_shapes: DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES,
      transport_identity_observation: input.transportIdentityObservation,
      progress_refs_path_payload: progressExample,
      quality_refs_path_payload: qualityExample,
      typed_blocker_path_payload: typedBlockerExample,
      empty_payload_template_is_success_evidence: false,
      preflight_error_code: 'cli_usage_error',
      preflight_blocked_error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
      authority_boundary: {
        can_write_domain_truth: false,
        can_generate_domain_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_block_next_stage_for_missing_receipt_format: false,
        can_close_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}
