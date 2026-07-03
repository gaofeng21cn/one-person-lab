import type { FamilyActionCatalog } from '../console/index.ts';
import type { FamilyStageControlPlane, FamilyStageDescriptor } from './family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyHumanReviewGateType =
  | 'intent_review'
  | 'scope_review'
  | 'boundary_exception_review'
  | 'quality_owner_review'
  | 'artifact_mutation_review';

export type FamilyHumanReviewGateStatus = 'ready' | 'blocked';

export interface FamilyHumanReviewBudgetGate {
  gate_id: string;
  gate_type: FamilyHumanReviewGateType;
  owner: string;
  stage_id: string | null;
  required_refs: string[];
  missing_refs: string[];
  reason: string;
  status: FamilyHumanReviewGateStatus;
  source: 'stage_authority_boundary' | 'trust_boundary' | 'action_catalog' | 'signal_payload' | 'gate_ref';
}

export interface FamilyHumanReviewBurdenBudget {
  surface_kind: 'family_human_review_burden_budget';
  version: 'family-human-review-burden-budget.v1';
  projection_scope: 'stage_pack' | 'stage_attempt' | 'stage_attempt_workbench';
  target_domain_id: string | null;
  status: 'ready' | 'blocked' | 'no_human_review_required';
  gates: FamilyHumanReviewBudgetGate[];
  summary: {
    gate_count: number;
    ready_gate_count: number;
    blocked_gate_count: number;
    required_ref_count: number;
    missing_ref_count: number;
    by_type: Record<string, number>;
    by_owner: Record<string, number>;
  };
  authority_boundary: {
    opl_role: 'human_review_budget_projection_only';
    domain_role: 'truth_quality_receipt_and_artifact_authority';
    can_ask_untyped_human_question: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

const HUMAN_REVIEW_GATE_TYPES = new Set<FamilyHumanReviewGateType>([
  'intent_review',
  'scope_review',
  'boundary_exception_review',
  'quality_owner_review',
  'artifact_mutation_review',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function reviewGateType(value: unknown): FamilyHumanReviewGateType | null {
  const text = optionalString(value);
  return text && HUMAN_REVIEW_GATE_TYPES.has(text as FamilyHumanReviewGateType)
    ? text as FamilyHumanReviewGateType
    : null;
}

function inferGateTypeFromRef(ref: string): FamilyHumanReviewGateType {
  const normalized = ref.toLowerCase();
  if (normalized.includes('intent')) {
    return 'intent_review';
  }
  if (normalized.includes('scope')) {
    return 'scope_review';
  }
  if (normalized.includes('artifact') || normalized.includes('mutation')) {
    return 'artifact_mutation_review';
  }
  if (normalized.includes('quality') || normalized.includes('publication') || normalized.includes('review')) {
    return 'quality_owner_review';
  }
  return 'boundary_exception_review';
}

function requiredRefsForStage(stage: FamilyStageDescriptor, gateType: FamilyHumanReviewGateType) {
  const boundary = stage.authority_boundary;
  const explicit = uniqueStrings([
    ...stringList(boundary.human_review_required_refs),
    ...stringList(boundary.required_review_refs),
    ...stringList(boundary.required_refs),
    ...stringList(boundary.expected_receipt_refs),
  ]);
  if (explicit.length > 0) {
    return explicit;
  }
  if (gateType === 'scope_review') {
    return uniqueStrings([
      ...(stage.stage_contract?.source_scope_refs ?? []).flatMap((ref) => Array.isArray(ref.ref) ? ref.ref : [ref.ref]),
      ...(stage.stage_contract?.artifact_scope_refs ?? []).flatMap((ref) => Array.isArray(ref.ref) ? ref.ref : [ref.ref]),
      ...(stage.stage_contract?.workspace_scope_refs ?? []).flatMap((ref) => Array.isArray(ref.ref) ? ref.ref : [ref.ref]),
    ]);
  }
  if (gateType === 'artifact_mutation_review') {
    return [
      ...stringList(boundary.artifact_mutation_receipt_refs),
      ...stringList(boundary.artifact_authority_refs),
    ];
  }
  if (gateType === 'quality_owner_review') {
    return [
      ...stringList(boundary.owner_receipt_refs),
      ...stringList(boundary.receipt_refs),
      ...stringList(boundary.expected_receipt_refs),
    ];
  }
  return explicit;
}

function declaredHumanReviewGates(stage: FamilyStageDescriptor): JsonRecord[] {
  return [
    ...(
      Array.isArray(stage.authority_boundary.human_review_gates)
        ? stage.authority_boundary.human_review_gates.filter(isRecord)
        : []
    ),
    ...(
      Array.isArray(stage.authority_boundary.human_gate_budget)
        ? stage.authority_boundary.human_gate_budget.filter(isRecord)
        : []
    ),
  ];
}

function gateFromStageDeclaration(stage: FamilyStageDescriptor, gate: JsonRecord): FamilyHumanReviewBudgetGate {
  const gateType = reviewGateType(gate.gate_type) ?? reviewGateType(gate.review_type) ?? inferGateTypeFromRef(
    optionalString(gate.gate_id) ?? stage.stage_id,
  );
  const requiredRefs = uniqueStrings([
    ...stringList(gate.required_refs),
    ...stringList(gate.required_review_refs),
    ...stringList(gate.required_receipt_refs),
    ...requiredRefsForStage(stage, gateType),
  ]);
  const missingRefs = uniqueStrings([
    ...stringList(gate.missing_refs),
    ...requiredRefs.filter((ref) => ref.startsWith('missing:')),
  ]);
  return {
    gate_id: optionalString(gate.gate_id) ?? `${stage.stage_id}:${gateType}`,
    gate_type: gateType,
    owner: optionalString(gate.owner) ?? stage.owner,
    stage_id: stage.stage_id,
    required_refs: requiredRefs,
    missing_refs: missingRefs,
    reason: optionalString(gate.reason) ?? `${gateType}_required`,
    status: missingRefs.length > 0 || requiredRefs.length === 0 ? 'blocked' : 'ready',
    source: 'stage_authority_boundary',
  };
}

function actionCatalogReviewRefsForStage(stage: FamilyStageDescriptor, actionCatalog: FamilyActionCatalog | null) {
  const actionsById = new Map(actionCatalog?.actions.map((action) => [action.action_id, action]) ?? []);
  return uniqueStrings(stage.allowed_action_refs.flatMap((actionRef) => {
    const action = actionsById.get(actionRef);
    return action?.human_gate_ids.map((gateId) => `action_catalog:${actionRef}:${gateId}`) ?? [];
  }));
}

function implicitGateFromStage(
  stage: FamilyStageDescriptor,
  actionCatalog: FamilyActionCatalog | null,
): FamilyHumanReviewBudgetGate | null {
  if (stage.trust_boundary?.human_gate_required !== true && stage.trust_boundary?.lane !== 'human_gate') {
    return null;
  }
  const gateType = reviewGateType(stage.authority_boundary.human_review_type)
    ?? reviewGateType(stage.authority_boundary.gate_type)
    ?? (
      stage.authority_boundary.independent_gate_receipt_required === true
        ? 'quality_owner_review'
        : inferGateTypeFromRef(stage.stage_id)
    );
  const requiredRefs = uniqueStrings([
    ...requiredRefsForStage(stage, gateType),
    ...actionCatalogReviewRefsForStage(stage, actionCatalog),
  ]);
  return {
    gate_id: optionalString(stage.authority_boundary.human_gate_id) ?? `${stage.stage_id}:${gateType}`,
    gate_type: gateType,
    owner: optionalString(stage.authority_boundary.human_review_owner) ?? stage.owner,
    stage_id: stage.stage_id,
    required_refs: requiredRefs,
    missing_refs: requiredRefs.length > 0 ? [] : [`human_review_required_refs:${stage.stage_id}`],
    reason: optionalString(stage.authority_boundary.human_review_reason) ?? 'trust_boundary_human_gate_required',
    status: requiredRefs.length > 0 ? 'ready' : 'blocked',
    source: 'trust_boundary',
  };
}

function gatesFromActionCatalog(
  plane: FamilyStageControlPlane,
  actionCatalog: FamilyActionCatalog | null,
): FamilyHumanReviewBudgetGate[] {
  const actionsById = new Map(actionCatalog?.actions.map((action) => [action.action_id, action]) ?? []);
  return plane.stages.flatMap((stage) => stage.allowed_action_refs.flatMap((actionRef) => {
    const action = actionsById.get(actionRef);
    return action?.human_gate_ids.map((gateId) => ({
      gate_id: gateId,
      gate_type: inferGateTypeFromRef(gateId),
      owner: action.owner || stage.owner,
      stage_id: stage.stage_id,
      required_refs: [`action_catalog:${actionRef}`],
      missing_refs: [],
      reason: `action_catalog_gate:${actionRef}`,
      status: 'ready' as const,
      source: 'action_catalog' as const,
    })) ?? [];
  }));
}

function mergeGates(gates: FamilyHumanReviewBudgetGate[]) {
  const byKey = new Map<string, FamilyHumanReviewBudgetGate>();
  for (const gate of gates) {
    const key = `${gate.stage_id ?? 'attempt'}:${gate.gate_id}:${gate.gate_type}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, gate);
      continue;
    }
    const requiredRefs = uniqueStrings([...existing.required_refs, ...gate.required_refs]);
    const missingRefs = uniqueStrings([...existing.missing_refs, ...gate.missing_refs]);
    byKey.set(key, {
      ...existing,
      required_refs: requiredRefs,
      missing_refs: missingRefs,
      status: missingRefs.length > 0 || requiredRefs.length === 0 ? 'blocked' : 'ready',
      reason: uniqueStrings([existing.reason, gate.reason]).join(';'),
    });
  }
  return [...byKey.values()];
}

function countBy(gates: FamilyHumanReviewBudgetGate[], keyFor: (gate: FamilyHumanReviewBudgetGate) => string) {
  return gates.reduce<Record<string, number>>((counts, gate) => {
    const key = keyFor(gate);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildFamilyHumanReviewBurdenBudget(input: {
  projectionScope: FamilyHumanReviewBurdenBudget['projection_scope'];
  targetDomainId: string | null;
  gates: FamilyHumanReviewBudgetGate[];
}): FamilyHumanReviewBurdenBudget {
  const gates = mergeGates(input.gates);
  const readyGateCount = gates.filter((gate) => gate.status === 'ready').length;
  const blockedGateCount = gates.filter((gate) => gate.status === 'blocked').length;
  return {
    surface_kind: 'family_human_review_burden_budget',
    version: 'family-human-review-burden-budget.v1',
    projection_scope: input.projectionScope,
    target_domain_id: input.targetDomainId,
    status: gates.length === 0
      ? 'no_human_review_required'
      : blockedGateCount > 0
        ? 'blocked'
        : 'ready',
    gates,
    summary: {
      gate_count: gates.length,
      ready_gate_count: readyGateCount,
      blocked_gate_count: blockedGateCount,
      required_ref_count: uniqueStrings(gates.flatMap((gate) => gate.required_refs)).length,
      missing_ref_count: uniqueStrings(gates.flatMap((gate) => gate.missing_refs)).length,
      by_type: countBy(gates, (gate) => gate.gate_type),
      by_owner: countBy(gates, (gate) => gate.owner),
    },
    authority_boundary: {
      opl_role: 'human_review_budget_projection_only',
      domain_role: 'truth_quality_receipt_and_artifact_authority',
      can_ask_untyped_human_question: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}

export function buildStagePackHumanReviewBurdenBudget(
  plane: FamilyStageControlPlane,
  actionCatalog: FamilyActionCatalog | null = null,
) {
  const actionCatalogGates = gatesFromActionCatalog(plane, actionCatalog);
  const stageGates = plane.stages.flatMap((stage) => [
    ...declaredHumanReviewGates(stage).map((gate) => gateFromStageDeclaration(stage, gate)),
    ...(
      implicitGateFromStage(stage, actionCatalog) ? [implicitGateFromStage(stage, actionCatalog)!] : []
    ),
  ]);
  return buildFamilyHumanReviewBurdenBudget({
    projectionScope: 'stage_pack',
    targetDomainId: plane.target_domain_id,
    gates: [
      ...stageGates,
      ...actionCatalogGates,
    ],
  });
}

export function buildAttemptHumanReviewBurdenBudget(input: {
  targetDomainId: string | null;
  stageId: string | null;
  humanGateRefs: string[];
  humanGateLedger: JsonRecord[];
  routeImpact?: JsonRecord | null;
  projectionScope?: 'stage_attempt' | 'stage_attempt_workbench';
}) {
  const routeImpact = isRecord(input.routeImpact) ? input.routeImpact : {};
  const gates = [
    ...input.humanGateRefs.map((ref) => ({
      gate_id: ref,
      gate_type: inferGateTypeFromRef(ref),
      owner: optionalString(routeImpact.next_owner) ?? input.targetDomainId ?? 'unknown_owner',
      stage_id: input.stageId,
      required_refs: [ref],
      missing_refs: [],
      reason: 'stage_attempt_human_gate_ref',
      status: 'ready' as const,
      source: 'gate_ref' as const,
    })),
    ...input.humanGateLedger.map((signal) => {
      const payload = isRecord(signal.payload) ? signal.payload : {};
      const ref = optionalString(payload.human_gate_ref) ?? optionalString(signal.signal_id) ?? 'human_gate_signal';
      const requiredRefs = uniqueStrings([
        ref,
        ...stringList(payload.required_refs),
        ...stringList(payload.required_review_refs),
      ]);
      const missingRefs = uniqueStrings(stringList(payload.missing_refs));
      return {
        gate_id: ref,
        gate_type: reviewGateType(payload.gate_type) ?? reviewGateType(payload.review_type) ?? inferGateTypeFromRef(ref),
        owner: optionalString(payload.owner) ?? optionalString(routeImpact.next_owner) ?? input.targetDomainId ?? 'unknown_owner',
        stage_id: input.stageId,
        required_refs: requiredRefs,
        missing_refs: missingRefs,
        reason: optionalString(payload.reason) ?? 'human_gate_signal_received',
        status: missingRefs.length > 0 || requiredRefs.length === 0 ? 'blocked' as const : 'ready' as const,
        source: 'signal_payload' as const,
      };
    }),
  ];
  return buildFamilyHumanReviewBurdenBudget({
    projectionScope: input.projectionScope ?? 'stage_attempt',
    targetDomainId: input.targetDomainId,
    gates,
  });
}
