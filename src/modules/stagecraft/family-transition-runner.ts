import { optionalString } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyTransitionGuardDefinition = {
  description?: string;
  owner?: string;
  source_ref?: string;
  gate_kind?: 'hard' | 'quality_budget';
  quality_debt_code?: string;
  authority_boundary?: JsonRecord;
};

export type FamilyTransitionWorkUnit = {
  work_unit_ref: string;
  action_refs: string[];
  metadata?: JsonRecord;
};

export type FamilyTransitionOwnerRoute = {
  owner: string;
  route_ref: string;
  action_refs?: string[];
  metadata?: JsonRecord;
};

export type FamilyTransitionHumanGate = {
  gate_ref: string;
  owner: string;
  reason: string;
  resume_refs?: string[];
  metadata?: JsonRecord;
};

export type FamilyTransitionTypedBlocker = {
  blocker_code: string;
  owner: string;
  refs?: string[];
  metadata?: JsonRecord;
};

export type FamilyTransitionDeadLetterIntent = {
  reason: string;
  owner: string;
  retryable: boolean;
  refs?: string[];
  metadata?: JsonRecord;
};

export type FamilyTransitionRule = {
  transition_id: string;
  current_state: string;
  event: string;
  required_guards?: string[];
  forbidden_guards?: string[];
  next_state: string;
  next_work_unit?: FamilyTransitionWorkUnit | null;
  owner_route: FamilyTransitionOwnerRoute;
  human_gate?: FamilyTransitionHumanGate | null;
  typed_blocker?: FamilyTransitionTypedBlocker | null;
  dead_letter_intent?: FamilyTransitionDeadLetterIntent | null;
  receipt?: {
    receipt_refs?: string[];
    metadata?: JsonRecord;
  };
  projection?: JsonRecord;
  authority_boundary?: JsonRecord;
};

export type FamilyTransitionSpec = {
  surface_kind: 'family_transition_spec';
  version: 'family-transition-runner.v1';
  spec_id: string;
  target_domain_id: string;
  owner: string;
  authority_boundary: JsonRecord;
  guards: Record<string, FamilyTransitionGuardDefinition>;
  transitions: FamilyTransitionRule[];
};

export type FamilyTransitionInput = {
  spec: FamilyTransitionSpec;
  domain_id: string;
  current_state: string;
  event: string;
  guards?: Record<string, unknown>;
  context?: JsonRecord;
};

export type FamilyTransitionResultStatus =
  | 'transition_applied'
  | 'blocked'
  | 'dead_letter_intended';

export type FamilyTransitionOutcomePath =
  | 'success_refs_path'
  | 'typed_blocker_path'
  | 'human_gate_path'
  | 'dead_letter_path';

export type FamilyTransitionReceipt = {
  surface_kind: 'family_transition_receipt';
  receipt_id: string;
  receipt_status: 'transition_applied' | 'blocked_fail_closed' | 'dead_letter_intended';
  spec_id: string;
  domain_id: string;
  transition_id: string | null;
  current_state: string;
  event: string;
  guard_ids: string[];
  satisfied_guard_ids: string[];
  missing_guard_ids: string[];
  unknown_guard_ids: string[];
  forbidden_guard_ids: string[];
  receipt_refs: string[];
  context_refs: string[];
};

export type FamilyTransitionProjection = {
  surface_kind: 'family_transition_projection';
  spec_id: string;
  domain_id: string;
  current_state: string;
  event: string;
  next_state: string;
  status: FamilyTransitionResultStatus;
  transition_id: string | null;
  owner_route: FamilyTransitionOwnerRoute;
  route_node_refs: string[];
  action_refs: string[];
  receipt_refs: string[];
  outcome_path: FamilyTransitionOutcomePath;
  terminal_input_kind: FamilyTransitionOutcomePath;
  requires_owner_answer: boolean;
  success_claimed: boolean;
  completion_status: 'completed' | 'completed_with_quality_debt' | 'blocked' | 'dead_letter';
  domain_ready_claimed: false;
  production_ready_claimed: false;
  authority_boundary: JsonRecord;
} & JsonRecord;

export type FamilyTransitionResult = {
  surface_kind: 'family_transition_result';
  status: FamilyTransitionResultStatus;
  domain_id: string;
  current_state: string;
  event: string;
  next_state: string;
  transition_id: string | null;
  next_work_unit: FamilyTransitionWorkUnit | null;
  owner_route: FamilyTransitionOwnerRoute;
  human_gate: FamilyTransitionHumanGate | null;
  typed_blocker: FamilyTransitionTypedBlocker | null;
  dead_letter_intent: FamilyTransitionDeadLetterIntent | null;
  receipt: FamilyTransitionReceipt;
  projection: FamilyTransitionProjection;
  outcome_path: FamilyTransitionOutcomePath;
  terminal_input_kind: FamilyTransitionOutcomePath;
  requires_owner_answer: boolean;
  completion_status: FamilyTransitionProjection['completion_status'];
  authority_boundary: JsonRecord;
};

export type FamilyTransitionMatrixCase = Omit<FamilyTransitionInput, 'spec'> & {
  case_id: string;
};

export type FamilyTransitionMatrixResult = {
  surface_kind: 'family_transition_matrix_result';
  status: 'matrix_evaluated';
  spec_id: string;
  summary: {
    total: number;
    transition_applied: number;
    blocked: number;
    dead_letter_intended: number;
  };
  results: Array<{
    case_id: string;
    result: FamilyTransitionResult;
  }>;
  authority_boundary: JsonRecord;
};

const DEFAULT_AUTHORITY_BOUNDARY = {
  opl: 'transition_runner_transport_projection_only',
  domain: 'truth_quality_artifact_gate_owner',
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function authorityBoundary(spec: FamilyTransitionSpec, transition?: FamilyTransitionRule | null) {
  return {
    ...DEFAULT_AUTHORITY_BOUNDARY,
    ...spec.authority_boundary,
    ...(transition?.authority_boundary ?? {}),
  };
}

function ownerRoute(owner: string, routeRef: string): FamilyTransitionOwnerRoute {
  return {
    owner,
    route_ref: routeRef,
  };
}

function knownGuardIds(spec: FamilyTransitionSpec) {
  return new Set(Object.keys(spec.guards));
}

function activeGuardIds(guards: Record<string, unknown>) {
  return Object.entries(guards)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function contextRefs(context: JsonRecord | undefined) {
  if (!context) {
    return [];
  }
  return [
    optionalString(context.attempt_id) ? `stage_attempt:${optionalString(context.attempt_id)}` : null,
    optionalString(context.task_id) ? `family_runtime_task:${optionalString(context.task_id)}` : null,
    optionalString(context.source_ref),
    optionalString(context.receipt_ref),
    ...stringList(context.consumable_artifact_refs),
    ...stringList(context.quality_debt_refs),
  ].filter((entry): entry is string => Boolean(entry));
}

function receiptId(parts: unknown[]) {
  return stableId('ftr', parts);
}

function buildReceipt(input: {
  spec: FamilyTransitionSpec;
  domainId: string;
  currentState: string;
  event: string;
  transitionId: string | null;
  receiptStatus: FamilyTransitionReceipt['receipt_status'];
  guardIds: string[];
  satisfiedGuardIds: string[];
  missingGuardIds: string[];
  unknownGuardIds: string[];
  forbiddenGuardIds: string[];
  receiptRefs?: string[];
  context?: JsonRecord;
}): FamilyTransitionReceipt {
  return {
    surface_kind: 'family_transition_receipt',
    receipt_id: receiptId([
      input.spec.spec_id,
      input.domainId,
      input.currentState,
      input.event,
      input.transitionId,
      input.receiptStatus,
      input.satisfiedGuardIds,
      input.missingGuardIds,
      input.unknownGuardIds,
      input.forbiddenGuardIds,
    ]),
    receipt_status: input.receiptStatus,
    spec_id: input.spec.spec_id,
    domain_id: input.domainId,
    transition_id: input.transitionId,
    current_state: input.currentState,
    event: input.event,
    guard_ids: input.guardIds,
    satisfied_guard_ids: input.satisfiedGuardIds,
    missing_guard_ids: input.missingGuardIds,
    unknown_guard_ids: input.unknownGuardIds,
    forbidden_guard_ids: input.forbiddenGuardIds,
    receipt_refs: input.receiptRefs ?? [],
    context_refs: contextRefs(input.context),
  };
}

function buildProjection(input: {
  spec: FamilyTransitionSpec;
  domainId: string;
  currentState: string;
  event: string;
  nextState: string;
  status: FamilyTransitionResultStatus;
  transition: FamilyTransitionRule | null;
  ownerRoute: FamilyTransitionOwnerRoute;
  outcomePath: FamilyTransitionOutcomePath;
  receipt: FamilyTransitionReceipt;
  authorityBoundary: JsonRecord;
  extra?: JsonRecord;
}): FamilyTransitionProjection {
  const actionRefs = [
    ...stringList(input.transition?.next_work_unit?.action_refs),
    ...stringList(input.ownerRoute.action_refs),
  ];
  return {
    surface_kind: 'family_transition_projection',
    spec_id: input.spec.spec_id,
    domain_id: input.domainId,
    current_state: input.currentState,
    event: input.event,
    next_state: input.nextState,
    status: input.status,
    transition_id: input.transition?.transition_id ?? null,
    owner_route: input.ownerRoute,
    route_node_refs: stringList(input.transition?.projection?.route_node_refs),
    action_refs: [...new Set(actionRefs)],
    receipt_refs: input.receipt.receipt_refs,
    ...(input.transition?.projection ?? {}),
    ...(input.extra ?? {}),
    outcome_path: input.outcomePath,
    terminal_input_kind: input.outcomePath,
    requires_owner_answer: input.outcomePath !== 'success_refs_path',
    success_claimed: input.outcomePath === 'success_refs_path',
    completion_status: input.status === 'transition_applied'
      ? input.extra?.completion_status === 'completed_with_quality_debt'
        ? 'completed_with_quality_debt'
        : 'completed'
      : input.status === 'dead_letter_intended'
        ? 'dead_letter'
        : 'blocked',
    domain_ready_claimed: false,
    production_ready_claimed: false,
    authority_boundary: input.authorityBoundary,
  };
}

function buildResult(input: {
  spec: FamilyTransitionSpec;
  domainId: string;
  currentState: string;
  event: string;
  nextState: string;
  status: FamilyTransitionResultStatus;
  transition: FamilyTransitionRule | null;
  nextWorkUnit: FamilyTransitionWorkUnit | null;
  ownerRoute: FamilyTransitionOwnerRoute;
  humanGate: FamilyTransitionHumanGate | null;
  typedBlocker: FamilyTransitionTypedBlocker | null;
  deadLetterIntent: FamilyTransitionDeadLetterIntent | null;
  receipt: FamilyTransitionReceipt;
  authorityBoundary: JsonRecord;
  projectionExtra?: JsonRecord;
}): FamilyTransitionResult {
  const outcomePath = transitionOutcomePath({
    status: input.status,
    humanGate: input.humanGate,
    typedBlocker: input.typedBlocker,
    deadLetterIntent: input.deadLetterIntent,
  });
  const completionStatus = input.status === 'transition_applied'
    ? input.projectionExtra?.completion_status === 'completed_with_quality_debt'
      ? 'completed_with_quality_debt'
      : 'completed'
    : input.status === 'dead_letter_intended'
      ? 'dead_letter'
      : 'blocked';
  return {
    surface_kind: 'family_transition_result',
    status: input.status,
    domain_id: input.domainId,
    current_state: input.currentState,
    event: input.event,
    next_state: input.nextState,
    transition_id: input.transition?.transition_id ?? null,
    next_work_unit: input.nextWorkUnit,
    owner_route: input.ownerRoute,
    human_gate: input.humanGate,
    typed_blocker: input.typedBlocker,
    dead_letter_intent: input.deadLetterIntent,
    receipt: input.receipt,
    projection: buildProjection({
      spec: input.spec,
      domainId: input.domainId,
      currentState: input.currentState,
      event: input.event,
      nextState: input.nextState,
      status: input.status,
      transition: input.transition,
      ownerRoute: input.ownerRoute,
      outcomePath,
      receipt: input.receipt,
      authorityBoundary: input.authorityBoundary,
      extra: input.projectionExtra,
    }),
    outcome_path: outcomePath,
    terminal_input_kind: outcomePath,
    requires_owner_answer: outcomePath !== 'success_refs_path',
    completion_status: completionStatus,
    authority_boundary: input.authorityBoundary,
  };
}

function transitionOutcomePath(input: {
  status: FamilyTransitionResultStatus;
  humanGate: FamilyTransitionHumanGate | null;
  typedBlocker: FamilyTransitionTypedBlocker | null;
  deadLetterIntent: FamilyTransitionDeadLetterIntent | null;
}): FamilyTransitionOutcomePath {
  if (input.deadLetterIntent || input.status === 'dead_letter_intended') {
    return 'dead_letter_path';
  }
  if (input.humanGate) {
    return 'human_gate_path';
  }
  if (input.typedBlocker || input.status === 'blocked') {
    return 'typed_blocker_path';
  }
  return 'success_refs_path';
}

function missingRequiredGuards(rule: FamilyTransitionRule, activeGuards: Set<string>) {
  return stringList(rule.required_guards).filter((guardId) => !activeGuards.has(guardId));
}

function presentForbiddenGuards(rule: FamilyTransitionRule, activeGuards: Set<string>) {
  return stringList(rule.forbidden_guards).filter((guardId) => activeGuards.has(guardId));
}

function transitionMatches(rule: FamilyTransitionRule, activeGuards: Set<string>) {
  return missingRequiredGuards(rule, activeGuards).length === 0
    && presentForbiddenGuards(rule, activeGuards).length === 0;
}

function qualityBudgetGuardIds(spec: FamilyTransitionSpec, guardIds: string[]) {
  return guardIds.filter((guardId) => spec.guards[guardId]?.gate_kind === 'quality_budget');
}

function consumableArtifactRefs(context: JsonRecord | undefined) {
  return stringList(context?.consumable_artifact_refs);
}

function qualityDebtTransitionResult(
  input: FamilyTransitionInput,
  transition: FamilyTransitionRule,
  guardIds: string[],
  activeGuards: Set<string>,
  missingQualityGuardIds: string[],
) {
  const boundary = authorityBoundary(input.spec, transition);
  const qualityDebtRefs = stringList(input.context?.quality_debt_refs);
  const artifactRefs = consumableArtifactRefs(input.context);
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: transition.transition_id,
    receiptStatus: 'transition_applied',
    guardIds,
    satisfiedGuardIds: [...activeGuards],
    missingGuardIds: missingQualityGuardIds,
    unknownGuardIds: [],
    forbiddenGuardIds: [],
    receiptRefs: [
      ...stringList(transition.receipt?.receipt_refs),
      ...artifactRefs,
      ...qualityDebtRefs,
    ],
    context: input.context,
  });
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: transition.next_state,
    status: 'transition_applied',
    transition,
    nextWorkUnit: transition.next_work_unit ?? null,
    ownerRoute: transition.owner_route,
    humanGate: null,
    typedBlocker: null,
    deadLetterIntent: null,
    receipt,
    authorityBoundary: boundary,
    projectionExtra: {
      completion_status: 'completed_with_quality_debt',
      quality_debt_blocks_stage_transition: false,
      quality_debt_blocks_quality_or_ready_claims: true,
      missing_quality_budget_guard_ids: missingQualityGuardIds,
      quality_debt_refs: qualityDebtRefs,
      consumable_artifact_refs: artifactRefs,
    },
  });
}

function unknownGuardResult(input: FamilyTransitionInput, unknownGuardIds: string[], guardIds: string[]) {
  const boundary = authorityBoundary(input.spec);
  const activeGuards = activeGuardIds(input.guards ?? {});
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: null,
    receiptStatus: 'blocked_fail_closed',
    guardIds,
    satisfiedGuardIds: activeGuards,
    missingGuardIds: [],
    unknownGuardIds,
    forbiddenGuardIds: [],
    context: input.context,
  });
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: input.current_state,
    status: 'blocked',
    transition: null,
    nextWorkUnit: null,
    ownerRoute: ownerRoute(input.spec.owner, 'family-transition-runner:unknown-guard'),
    humanGate: null,
    typedBlocker: {
      blocker_code: 'unknown_guard_id',
      owner: input.spec.owner,
      refs: unknownGuardIds.map((guardId) => `guard:${guardId}`),
    },
    deadLetterIntent: null,
    receipt,
    authorityBoundary: boundary,
    projectionExtra: {
      blocker_reason: 'unknown_guard_id',
      unknown_guard_ids: unknownGuardIds,
    },
  });
}

function domainMismatchResult(input: FamilyTransitionInput, guardIds: string[]) {
  const boundary = authorityBoundary(input.spec);
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: null,
    receiptStatus: 'blocked_fail_closed',
    guardIds,
    satisfiedGuardIds: activeGuardIds(input.guards ?? {}),
    missingGuardIds: [],
    unknownGuardIds: [],
    forbiddenGuardIds: [],
    context: input.context,
  });
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: input.current_state,
    status: 'blocked',
    transition: null,
    nextWorkUnit: null,
    ownerRoute: ownerRoute(input.spec.owner, 'family-transition-runner:domain-mismatch'),
    humanGate: null,
    typedBlocker: {
      blocker_code: 'transition_domain_mismatch',
      owner: input.spec.owner,
      refs: [`expected:${input.spec.target_domain_id}`, `actual:${input.domain_id}`],
    },
    deadLetterIntent: null,
    receipt,
    authorityBoundary: boundary,
    projectionExtra: {
      blocker_reason: 'transition_domain_mismatch',
      expected_domain_id: input.spec.target_domain_id,
    },
  });
}

function unknownTransitionResult(input: FamilyTransitionInput, guardIds: string[]) {
  const boundary = authorityBoundary(input.spec);
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: null,
    receiptStatus: 'dead_letter_intended',
    guardIds,
    satisfiedGuardIds: activeGuardIds(input.guards ?? {}),
    missingGuardIds: [],
    unknownGuardIds: [],
    forbiddenGuardIds: [],
    context: input.context,
  });
  const deadLetterIntent = {
    reason: 'unknown_transition',
    owner: input.spec.owner,
    retryable: false,
    refs: [
      `state:${input.current_state}`,
      `event:${input.event}`,
    ],
  };
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: input.current_state,
    status: 'dead_letter_intended',
    transition: null,
    nextWorkUnit: null,
    ownerRoute: ownerRoute(input.spec.owner, 'family-transition-runner:dead-letter'),
    humanGate: null,
    typedBlocker: null,
    deadLetterIntent,
    receipt,
    authorityBoundary: boundary,
    projectionExtra: {
      dead_letter_reason: deadLetterIntent.reason,
    },
  });
}

function unsatisfiedGuardResult(
  input: FamilyTransitionInput,
  candidates: FamilyTransitionRule[],
  guardIds: string[],
  activeGuards: Set<string>,
) {
  const candidate = candidates[0] ?? null;
  const boundary = authorityBoundary(input.spec, candidate);
  const missingGuardIds = candidates.length === 0
    ? []
    : [...new Set(candidates.flatMap((rule) => missingRequiredGuards(rule, activeGuards)))];
  const forbiddenGuardIds = candidates.length === 0
    ? []
    : [...new Set(candidates.flatMap((rule) => presentForbiddenGuards(rule, activeGuards)))];
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: candidate?.transition_id ?? null,
    receiptStatus: 'blocked_fail_closed',
    guardIds,
    satisfiedGuardIds: [...activeGuards],
    missingGuardIds,
    unknownGuardIds: [],
    forbiddenGuardIds,
    context: input.context,
  });
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: input.current_state,
    status: 'blocked',
    transition: candidate,
    nextWorkUnit: null,
    ownerRoute: candidate?.owner_route ?? ownerRoute(input.spec.owner, 'family-transition-runner:guard-blocked'),
    humanGate: null,
    typedBlocker: {
      blocker_code: forbiddenGuardIds.length > 0 ? 'transition_guard_forbidden' : 'transition_guard_unsatisfied',
      owner: candidate?.owner_route.owner ?? input.spec.owner,
      refs: [...missingGuardIds, ...forbiddenGuardIds].map((guardId) => `guard:${guardId}`),
    },
    deadLetterIntent: null,
    receipt,
    authorityBoundary: boundary,
    projectionExtra: {
      blocker_reason: forbiddenGuardIds.length > 0 ? 'transition_guard_forbidden' : 'transition_guard_unsatisfied',
      missing_guard_ids: missingGuardIds,
      forbidden_guard_ids: forbiddenGuardIds,
    },
  });
}

function ambiguousTransitionResult(
  input: FamilyTransitionInput,
  matches: FamilyTransitionRule[],
  guardIds: string[],
  activeGuards: Set<string>,
) {
  const boundary = authorityBoundary(input.spec);
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: null,
    receiptStatus: 'blocked_fail_closed',
    guardIds,
    satisfiedGuardIds: [...activeGuards],
    missingGuardIds: [],
    unknownGuardIds: [],
    forbiddenGuardIds: [],
    context: input.context,
  });
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: input.current_state,
    status: 'blocked',
    transition: null,
    nextWorkUnit: null,
    ownerRoute: ownerRoute(input.spec.owner, 'family-transition-runner:ambiguous-transition'),
    humanGate: null,
    typedBlocker: {
      blocker_code: 'ambiguous_transition',
      owner: input.spec.owner,
      refs: matches.map((rule) => `transition:${rule.transition_id}`),
    },
    deadLetterIntent: null,
    receipt,
    authorityBoundary: boundary,
    projectionExtra: {
      blocker_reason: 'ambiguous_transition',
      matched_transition_ids: matches.map((rule) => rule.transition_id),
    },
  });
}

export function runFamilyTransition(input: FamilyTransitionInput): FamilyTransitionResult {
  const guards = input.guards ?? {};
  const guardIds = Object.keys(guards);
  const knownGuards = knownGuardIds(input.spec);
  const unknownGuardIds = guardIds.filter((guardId) => !knownGuards.has(guardId));
  if (unknownGuardIds.length > 0) {
    return unknownGuardResult(input, unknownGuardIds, guardIds);
  }
  if (input.domain_id !== input.spec.target_domain_id) {
    return domainMismatchResult(input, guardIds);
  }

  const candidates = input.spec.transitions.filter(
    (rule) => rule.current_state === input.current_state && rule.event === input.event,
  );
  if (candidates.length === 0) {
    return unknownTransitionResult(input, guardIds);
  }

  const activeGuards = new Set(activeGuardIds(guards));
  const matches = candidates.filter((rule) => transitionMatches(rule, activeGuards));
  if (matches.length === 0) {
    const debtCandidates = candidates.filter((rule) => {
      const missing = missingRequiredGuards(rule, activeGuards);
      return presentForbiddenGuards(rule, activeGuards).length === 0
        && missing.length > 0
        && qualityBudgetGuardIds(input.spec, missing).length === missing.length;
    });
    const artifactRefs = consumableArtifactRefs(input.context);
    if (debtCandidates.length === 1 && artifactRefs.length > 0) {
      const transition = debtCandidates[0];
      return qualityDebtTransitionResult(
        input,
        transition,
        guardIds,
        activeGuards,
        missingRequiredGuards(transition, activeGuards),
      );
    }
    return unsatisfiedGuardResult(input, candidates, guardIds, activeGuards);
  }
  if (matches.length > 1) {
    return ambiguousTransitionResult(input, matches, guardIds, activeGuards);
  }

  const transition = matches[0];
  const boundary = authorityBoundary(input.spec, transition);
  const receiptRefs = stringList(transition.receipt?.receipt_refs);
  const receipt = buildReceipt({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    transitionId: transition.transition_id,
    receiptStatus: 'transition_applied',
    guardIds,
    satisfiedGuardIds: [...activeGuards],
    missingGuardIds: [],
    unknownGuardIds: [],
    forbiddenGuardIds: [],
    receiptRefs,
    context: input.context,
  });
  return buildResult({
    spec: input.spec,
    domainId: input.domain_id,
    currentState: input.current_state,
    event: input.event,
    nextState: transition.next_state,
    status: 'transition_applied',
    transition,
    nextWorkUnit: transition.next_work_unit ?? null,
    ownerRoute: transition.owner_route,
    humanGate: transition.human_gate ?? null,
    typedBlocker: transition.typed_blocker ?? null,
    deadLetterIntent: transition.dead_letter_intent ?? null,
    receipt,
    authorityBoundary: boundary,
  });
}

export function runFamilyTransitionMatrix(input: {
  spec: FamilyTransitionSpec;
  cases: FamilyTransitionMatrixCase[];
}): FamilyTransitionMatrixResult {
  const results = input.cases.map((entry) => ({
    case_id: entry.case_id,
    result: runFamilyTransition({
      spec: input.spec,
      domain_id: entry.domain_id,
      current_state: entry.current_state,
      event: entry.event,
      guards: entry.guards,
      context: entry.context,
    }),
  }));
  return {
    surface_kind: 'family_transition_matrix_result',
    status: 'matrix_evaluated',
    spec_id: input.spec.spec_id,
    summary: {
      total: results.length,
      transition_applied: results.filter((entry) => entry.result.status === 'transition_applied').length,
      blocked: results.filter((entry) => entry.result.status === 'blocked').length,
      dead_letter_intended: results.filter((entry) => entry.result.status === 'dead_letter_intended').length,
    },
    results,
    authority_boundary: authorityBoundary(input.spec),
  };
}
