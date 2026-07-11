import {
  record,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export type FamilyRuntimeControlledApplyContract = {
  surface_kind: 'family_runtime_controlled_apply_contract';
  contract_version: 'family-runtime-controlled-apply.v1';
  contract_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  contract_open: boolean;
  apply_status:
    | 'no_controlled_apply_request'
    | 'domain_receipt_observed'
    | 'no_regression_evidence_observed'
    | 'blocked_domain_receipt_required';
  requested_action: string | null;
  owner_receipt_refs: string[];
  no_regression_evidence_refs: string[];
  typed_blockers: JsonRecord[];
  no_forbidden_write_proof: {
    opl_writes_domain_truth: false;
    opl_writes_domain_artifact: false;
    opl_writes_domain_memory_body: false;
    domain_truth_owner: FamilyRuntimeDomainId;
  };
  authority_boundary: {
    opl: 'attempt_contract_receipt_projection_only';
    domain: 'stage_apply_truth_artifact_quality_owner';
    allowed_return_shapes: string[];
    forbidden_opl_actions: string[];
  };
};

const ALLOWED_RETURN_SHAPES = [
  'domain_owner_receipt_ref',
  'quality_gate_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'route_back_evidence_ref',
  'no_regression_evidence_ref',
];

function controlledApplyRequest(locator: JsonRecord) {
  const direct = locator.controlled_apply_request;
  const directRecord = record(direct);
  if (directRecord === direct) {
    return directRecord;
  }
  const stage = locator.controlled_stage_attempt;
  const stageRecord = record(stage);
  if (stageRecord === stage) {
    return stageRecord;
  }
  const soak = locator.controlled_soak_no_regression_attempt;
  const soakRecord = record(soak);
  if (soakRecord === soak) {
    return soakRecord;
  }
  return null;
}

export function buildFamilyRuntimeControlledApplyContract(input: {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  workspaceLocator: JsonRecord;
  routeImpact?: JsonRecord;
}): FamilyRuntimeControlledApplyContract {
  const request = controlledApplyRequest(input.workspaceLocator);
  const contractId = stringValue(request?.contract_id)
    ?? 'opl_temporal_controlled_domain_stage_attempt_apply_contract';
  const ownerReceiptRefs = [
    ...stringList(request?.owner_receipt_refs),
    ...stringList(request?.domain_receipt_refs),
    ...stringList(request?.receipt_refs),
    ...stringList(request?.quality_gate_receipt_refs),
    ...stringList(request?.human_gate_refs),
    ...stringList(request?.route_back_evidence_refs),
    ...(stringValue(request?.domain_owner_receipt_ref) ? [stringValue(request?.domain_owner_receipt_ref)!] : []),
    ...(stringValue(request?.quality_gate_receipt_ref) ? [stringValue(request?.quality_gate_receipt_ref)!] : []),
    ...(stringValue(request?.human_gate_ref) ? [stringValue(request?.human_gate_ref)!] : []),
    ...(stringValue(request?.route_back_evidence_ref) ? [stringValue(request?.route_back_evidence_ref)!] : []),
  ];
  const noRegressionEvidenceRefs = [
    ...stringList(request?.no_regression_evidence_refs),
    ...stringList(request?.evidence_refs),
    ...stringList(input.routeImpact?.no_regression_evidence_refs),
    ...stringList(input.routeImpact?.evidence_refs),
    ...(stringValue(input.routeImpact?.no_regression_evidence_ref)
      ? [stringValue(input.routeImpact?.no_regression_evidence_ref)!]
      : []),
  ];
  const typedBlockers = request === null
    ? []
    : ownerReceiptRefs.length > 0 || noRegressionEvidenceRefs.length > 0
      ? []
      : [
          {
            blocker_kind: 'domain_owner_gate',
            blocker_id: `${contractId}:domain_receipt_or_no_regression_evidence_required`,
            required_owner: input.domainId,
            required_return_shapes: ALLOWED_RETURN_SHAPES,
          },
        ];
  const applyStatus: FamilyRuntimeControlledApplyContract['apply_status'] =
    request === null
      ? 'no_controlled_apply_request'
      : ownerReceiptRefs.length > 0
        ? 'domain_receipt_observed'
        : noRegressionEvidenceRefs.length > 0
          ? 'no_regression_evidence_observed'
          : 'blocked_domain_receipt_required';
  return {
    surface_kind: 'family_runtime_controlled_apply_contract',
    contract_version: 'family-runtime-controlled-apply.v1',
    contract_id: contractId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    contract_open: true,
    apply_status: applyStatus,
    requested_action: stringValue(request?.action_kind)
      ?? stringValue(request?.task_kind)
      ?? stringValue(request?.surface_kind),
    owner_receipt_refs: ownerReceiptRefs,
    no_regression_evidence_refs: noRegressionEvidenceRefs,
    typed_blockers: typedBlockers,
    no_forbidden_write_proof: {
      opl_writes_domain_truth: false,
      opl_writes_domain_artifact: false,
      opl_writes_domain_memory_body: false,
      domain_truth_owner: input.domainId,
    },
    authority_boundary: {
      opl: 'attempt_contract_receipt_projection_only',
      domain: 'stage_apply_truth_artifact_quality_owner',
      allowed_return_shapes: ALLOWED_RETURN_SHAPES,
      forbidden_opl_actions: [
        'write_domain_truth',
        'write_domain_artifact',
        'write_domain_memory_body',
        'declare_domain_quality_verdict',
        'declare_production_soak_success_without_domain_receipt',
      ],
    },
  };
}
