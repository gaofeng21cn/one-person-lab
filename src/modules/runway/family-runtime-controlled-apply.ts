import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

type JsonRecord = Record<string, unknown>;

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

const CONTRACT_IDS: Partial<Record<FamilyRuntimeDomainId, string>> = {
  medautoscience: 'opl_temporal_controlled_mas_owner_answer_apply_contract',
  medautogrant: 'opl_temporal_controlled_stage_attempt_apply_contract',
  redcube: 'opl_temporal_controlled_visual_stage_attempt_apply_contract',
};

const DEFAULT_ALLOWED_RETURN_SHAPES = [
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
  'no_regression_evidence_ref',
];

const MAS_ALLOWED_RETURN_SHAPES = [
  'domain_owner_receipt_ref',
  'quality_gate_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'route_back_evidence_ref',
  'no_regression_evidence_ref',
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringListFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function controlledApplyRequest(locator: JsonRecord) {
  const direct = locator.controlled_apply_request;
  if (isRecord(direct)) {
    return direct;
  }
  const stage = locator.controlled_stage_attempt;
  if (isRecord(stage)) {
    return stage;
  }
  const soak = locator.controlled_soak_no_regression_attempt;
  if (isRecord(soak)) {
    return soak;
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
  const contractId = optionalString(request?.contract_id)
    ?? CONTRACT_IDS[input.domainId]
    ?? 'opl_temporal_controlled_domain_stage_attempt_apply_contract';
  const allowedReturnShapes = input.domainId === 'medautoscience'
    ? MAS_ALLOWED_RETURN_SHAPES
    : DEFAULT_ALLOWED_RETURN_SHAPES;
  const ownerReceiptRefs = [
    ...stringListFrom(request?.owner_receipt_refs),
    ...stringListFrom(request?.domain_receipt_refs),
    ...stringListFrom(request?.receipt_refs),
    ...stringListFrom(request?.quality_gate_receipt_refs),
    ...stringListFrom(request?.human_gate_refs),
    ...stringListFrom(request?.route_back_evidence_refs),
    ...(optionalString(request?.domain_owner_receipt_ref) ? [optionalString(request?.domain_owner_receipt_ref)!] : []),
    ...(optionalString(request?.quality_gate_receipt_ref) ? [optionalString(request?.quality_gate_receipt_ref)!] : []),
    ...(optionalString(request?.human_gate_ref) ? [optionalString(request?.human_gate_ref)!] : []),
    ...(optionalString(request?.route_back_evidence_ref) ? [optionalString(request?.route_back_evidence_ref)!] : []),
  ];
  const noRegressionEvidenceRefs = [
    ...stringListFrom(request?.no_regression_evidence_refs),
    ...stringListFrom(request?.evidence_refs),
    ...stringListFrom(input.routeImpact?.no_regression_evidence_refs),
    ...stringListFrom(input.routeImpact?.evidence_refs),
    ...(optionalString(input.routeImpact?.no_regression_evidence_ref)
      ? [optionalString(input.routeImpact?.no_regression_evidence_ref)!]
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
            required_return_shapes: allowedReturnShapes,
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
    requested_action: optionalString(request?.action_kind)
      ?? optionalString(request?.task_kind)
      ?? optionalString(request?.surface_kind),
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
      allowed_return_shapes: allowedReturnShapes,
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
