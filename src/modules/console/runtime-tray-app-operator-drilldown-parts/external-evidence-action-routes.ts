import {
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import { buildOperatorActionRoute, uniqueRefs } from './value-utils.ts';

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'external_evidence_ledger_refs_only',
    provider: 'runtime_slo_receipt_owner',
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
  };
}

const EXTERNAL_EVIDENCE_RECORD_PAYLOAD_REFS = [
  'evidence_refs',
  'domain_receipt_refs',
  'typed_blocker_refs',
  'no_regression_refs',
  'release_dist_refs',
  'direct_hosted_parity_refs',
  'owner_chain_refs',
  'memory_writeback_receipt_refs',
  'artifact_mutation_receipt_refs',
  'package_lifecycle_receipt_refs',
  'lifecycle_receipt_refs',
  'restore_proof_refs',
];

function baseApplyArgs(input: {
  domainId: string;
  requestId: string;
  requestPackId?: string | null;
  sourceRef?: string | null;
  mode?: 'record' | 'verify';
}) {
  return [
    'agents',
    'evidence',
    'apply',
    '--domain',
    input.domainId,
    '--request-id',
    input.requestId,
    ...(input.mode === 'verify' ? ['--mode', 'verify'] : []),
    ...(input.requestPackId ? ['--request-pack-id', input.requestPackId] : []),
    ...(input.sourceRef ? ['--source-ref', input.sourceRef] : []),
  ];
}

function actionRoute(input: {
  domainId: string;
  requestId: string;
  requestPackId?: string | null;
  sourceRef?: string | null;
  routeKind: 'external_evidence_request' | 'remaining_evidence_gate';
  routeRef: string;
  mode: 'record' | 'verify';
  requiredEvidenceRefs?: string[];
  requiredReturnShapes?: string[];
  requiredReceiptShapes?: string[];
}) {
  const recordMode = input.mode === 'record';
  const actionKind = input.routeKind === 'remaining_evidence_gate'
    ? `evidence_gate_receipt_${input.mode}`
    : `external_evidence_receipt_${input.mode}`;
  const args = baseApplyArgs({
    domainId: input.domainId,
    requestId: input.requestId,
    requestPackId: input.requestPackId,
    sourceRef: input.sourceRef ?? input.routeRef,
    mode: recordMode ? undefined : 'verify',
  });
  return buildOperatorActionRoute(args, {
    action_id: `${input.routeKind}:${input.domainId}:${input.requestId}:${input.mode}`,
    action_kind: actionKind,
    domain_id: input.domainId,
    request_id: input.requestId,
    request_pack_id: input.requestPackId ?? null,
    evidence_route_kind: input.routeKind,
    evidence_source_ref: input.sourceRef ?? input.routeRef,
    required_operator_payload_refs: recordMode ? EXTERNAL_EVIDENCE_RECORD_PAYLOAD_REFS : [],
    ...(recordMode ? {
      required_evidence_refs: input.requiredEvidenceRefs ?? [],
      required_return_shapes: input.requiredReturnShapes ?? [],
      required_receipt_shapes: input.requiredReceiptShapes ?? [],
    } : {}),
    authority_boundary: refsOnlyAuthorityBoundary(),
  });
}

function routeForStatus(input: {
  domainId: string | null;
  requestId: string | null;
  requestPackId?: string | null;
  sourceRef?: string | null;
  routeKind: 'external_evidence_request' | 'remaining_evidence_gate';
  routeRef: string | null;
  receiptStatus: string | null;
  requiredEvidenceRefs?: string[];
  requiredReturnShapes?: string[];
  requiredReceiptShapes?: string[];
}) {
  if (!input.domainId || !input.requestId || input.receiptStatus === 'verified') {
    return null;
  }
  const routeInput = {
    domainId: input.domainId,
    requestId: input.requestId,
    requestPackId: input.requestPackId,
    sourceRef: input.sourceRef,
    routeKind: input.routeKind,
    routeRef: input.routeRef ?? `${input.domainId}:${input.requestId}`,
  };
  if (input.receiptStatus === 'recorded') {
    return actionRoute({ ...routeInput, mode: 'verify' });
  }
  return actionRoute({
    ...routeInput,
    mode: 'record',
    requiredEvidenceRefs: input.requiredEvidenceRefs,
    requiredReturnShapes: input.requiredReturnShapes,
    requiredReceiptShapes: input.requiredReceiptShapes,
  });
}

export function buildExternalEvidenceActionRoutes(domainEvidenceRequestRefs: JsonRecord) {
  const externalRequestRoutes = recordList(domainEvidenceRequestRefs.external_requests)
    .map((request) => routeForStatus({
      domainId: stringValue(request.domain_id),
      requestId: stringValue(request.request_id),
      requestPackId: stringValue(request.request_pack_id),
      sourceRef: stringValue(request.ref),
      routeKind: 'external_evidence_request',
      routeRef: stringValue(request.ref),
      receiptStatus: stringValue(request.external_receipt_status),
      requiredEvidenceRefs: stringList(request.required_evidence_refs),
      requiredReturnShapes: stringList(request.required_return_shapes),
      requiredReceiptShapes: stringList(request.required_receipt_shapes),
    }))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const evidenceGateRoutes = recordList(domainEvidenceRequestRefs.evidence_gates)
    .map((gate) => routeForStatus({
      domainId: stringValue(gate.domain_id),
      requestId: stringValue(gate.request_id) ?? stringValue(gate.gate_id),
      requestPackId: stringValue(gate.request_pack_id),
      sourceRef: stringValue(gate.ref),
      routeKind: 'remaining_evidence_gate',
      routeRef: stringValue(gate.ref),
      receiptStatus: stringValue(gate.external_receipt_status),
    }))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return uniqueRefs([...externalRequestRoutes, ...evidenceGateRoutes]);
}
