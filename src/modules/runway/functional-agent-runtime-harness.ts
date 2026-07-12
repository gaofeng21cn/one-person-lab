import { stableId } from '../../kernel/stable-id.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue,
  uniqueStringList as unique,
} from '../../kernel/json-record.ts';
import {
  runFamilyTransitionMatrix,
  type FamilyTransitionInput,
  type FamilyTransitionMatrixCase,
  type FamilyTransitionMatrixResult,
  type FamilyTransitionResult,
  type FamilyTransitionSpec,
} from '../stagecraft/index.ts';
import { taskRetryBudgetProjection } from './family-runtime-queue-projection-boundary.ts';

type JsonRecord = Record<string, unknown>;

export type FunctionalAgentRuntimeHarnessAttempt = {
  case_id: string;
  stage_attempt_id: string;
  task_id?: string;
  status: string;
  attempt_count: number;
  retry_budget?: JsonRecord;
  closeout_refs?: string[];
  consumed_refs?: string[];
  consumed_memory_refs?: string[];
  writeback_proposal_refs?: string[];
  writeback_receipt_refs?: string[];
  owner_receipt_refs?: string[];
  human_gate_refs?: string[];
  typed_blocker_refs?: string[];
  dead_letter_refs?: string[];
  repair_action_refs?: string[];
  route_impact?: JsonRecord;
  closeout_receipt_status?: string;
  authority_boundary?: JsonRecord;
};

export type FunctionalAgentRuntimeHarnessInput = {
  harness_id: string;
  spec: FamilyTransitionSpec;
  cases: FamilyTransitionMatrixCase[];
  attempts: FunctionalAgentRuntimeHarnessAttempt[];
  required_observations?: FunctionalAgentRuntimeObservationKey[];
  authority_boundary?: JsonRecord;
};

export type FunctionalAgentRuntimeObservationKey =
  | 'stage_attempt_projection_ledger_observed'
  | 'typed_closeout_observed'
  | 'memory_refs_only_writeback_chain_observed'
  | 'state_transition_matrix_smooth'
  | 'fail_closed_blocker_projected'
  | 'human_gate_projected'
  | 'retry_projected'
  | 'dead_letter_projected'
  | 'repair_route_projected'
  | 'forbidden_authority_flags_all_false';

export type FunctionalAgentRuntimeHarnessResult = ReturnType<typeof runFunctionalAgentRuntimeHarness>;

const REQUIRED_OBSERVATIONS: FunctionalAgentRuntimeObservationKey[] = [
  'stage_attempt_projection_ledger_observed',
  'typed_closeout_observed',
  'memory_refs_only_writeback_chain_observed',
  'state_transition_matrix_smooth',
  'fail_closed_blocker_projected',
  'human_gate_projected',
  'retry_projected',
  'dead_letter_projected',
  'repair_route_projected',
  'forbidden_authority_flags_all_false',
];

const FORBIDDEN_TRUE_AUTHORITY_FLAGS = [
  'can_write_domain_truth',
  'can_write_memory_body',
  'can_accept_or_reject_memory_writeback',
  'can_authorize_domain_ready',
  'can_authorize_quality_verdict',
  'can_authorize_export_verdict',
  'can_execute_domain_action',
  'claims_live_soak_complete',
  'provider_completion_is_domain_ready',
  'opl_can_write_domain_truth',
  'opl_can_write_memory_body',
  'opl_can_accept_or_reject_memory_writeback',
  'opl_can_authorize_domain_ready',
  'opl_can_authorize_quality_verdict',
  'opl_can_authorize_export_verdict',
  'opl_can_execute_domain_action',
];

const FORBIDDEN_MEMORY_BODY_KEYS = [
  'memory_body',
  'memory_content',
  'memory_payload',
  'accepted_memory_body',
  'rejected_memory_body',
];

const HARNESS_AUTHORITY_BOUNDARY = {
  opl: 'functional_harness_transport_projection_only',
  domain: 'truth_quality_artifact_memory_body_and_owner_receipt_authority',
  claims_live_soak_complete: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_accept_or_reject_memory_writeback: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_authorize_export_verdict: false,
  can_execute_domain_action: false,
  provider_completion_is_domain_ready: false,
};

function expectedStatus(entry: FamilyTransitionMatrixCase) {
  return isRecord(entry.context) ? stringValue(entry.context.expected_status) : null;
}

function expectedNextState(entry: FamilyTransitionMatrixCase) {
  return isRecord(entry.context) ? stringValue(entry.context.expected_next_state) : null;
}

function expectedTransitionId(entry: FamilyTransitionMatrixCase) {
  return isRecord(entry.context) ? stringValue(entry.context.expected_transition_id) : null;
}

function expectationMatches(entry: FamilyTransitionMatrixCase, result: FamilyTransitionResult) {
  const status = expectedStatus(entry);
  const nextState = expectedNextState(entry);
  const transitionId = expectedTransitionId(entry);
  return (!status || status === result.status)
    && (!nextState || nextState === result.next_state)
    && (!transitionId || transitionId === result.transition_id);
}

function hasExpectedFields(entry: FamilyTransitionMatrixCase) {
  return Boolean(expectedStatus(entry) || expectedNextState(entry) || expectedTransitionId(entry));
}

function hasForbiddenMemoryBody(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, entry]) =>
    FORBIDDEN_MEMORY_BODY_KEYS.includes(key)
    || (isRecord(entry) && hasForbiddenMemoryBody(entry))
    || (Array.isArray(entry) && entry.some(hasForbiddenMemoryBody)));
}

function collectForbiddenAuthorityFlags(records: Array<{ label: string; value: unknown }>) {
  const flags: string[] = [];
  for (const record of records) {
    if (!isRecord(record.value)) {
      continue;
    }
    for (const flag of FORBIDDEN_TRUE_AUTHORITY_FLAGS) {
      if (record.value[flag] === true) {
        flags.push(`${record.label}.${flag}`);
      }
    }
  }
  return unique(flags);
}

function resultAuthorityRecords(matrix: FamilyTransitionMatrixResult) {
  return matrix.results.flatMap((entry) => [
    {
      label: `result:${entry.case_id}:authority_boundary`,
      value: entry.result.authority_boundary,
    },
    {
      label: `result:${entry.case_id}:projection_authority_boundary`,
      value: entry.result.projection.authority_boundary,
    },
  ]);
}

function attemptAuthorityRecords(attempts: FunctionalAgentRuntimeHarnessAttempt[]) {
  return attempts.map((attempt) => ({
    label: `attempt:${attempt.stage_attempt_id}:authority_boundary`,
    value: attempt.authority_boundary,
  }));
}

function refsFromAttempts(
  attempts: FunctionalAgentRuntimeHarnessAttempt[],
  key: keyof FunctionalAgentRuntimeHarnessAttempt,
) {
  return unique(attempts.flatMap((attempt) => stringList(attempt[key])));
}

function refsFromResults(
  matrix: FamilyTransitionMatrixResult,
  field: (result: FamilyTransitionResult) => unknown,
) {
  return unique(matrix.results.flatMap((entry) => stringList(field(entry.result))));
}

function projectionRefs(matrix: FamilyTransitionMatrixResult, key: string) {
  return unique(matrix.results.flatMap((entry) => stringList(entry.result.projection[key])));
}

function buildObservations(input: FunctionalAgentRuntimeHarnessInput, matrix: FamilyTransitionMatrixResult) {
  const expectedCases = input.cases.filter(hasExpectedFields);
  const matchedExpectedCases = matrix.results.filter((entry) => {
    const sourceCase = input.cases.find((candidate) => candidate.case_id === entry.case_id);
    return sourceCase ? hasExpectedFields(sourceCase) && expectationMatches(sourceCase, entry.result) : false;
  });
  const consumedMemoryRefs = refsFromAttempts(input.attempts, 'consumed_memory_refs');
  const writebackProposalRefs = refsFromAttempts(input.attempts, 'writeback_proposal_refs');
  const writebackReceiptRefs = refsFromAttempts(input.attempts, 'writeback_receipt_refs');
  const closeoutRefs = refsFromAttempts(input.attempts, 'closeout_refs');
  const resultHumanGateRefs = matrix.results.flatMap((entry) =>
    entry.result.human_gate?.gate_ref ? [entry.result.human_gate.gate_ref] : []);
  const attemptHumanGateRefs = refsFromAttempts(input.attempts, 'human_gate_refs');
  const retryStateObserved = matrix.results.some((entry) => entry.result.next_state === 'retry_queued')
    || input.attempts.some((attempt) => attempt.status === 'retry_queued');
  const deadLetterObserved = matrix.results.some((entry) =>
    entry.result.status === 'dead_letter_intended'
    || entry.result.next_state === 'dead_lettered'
    || Boolean(entry.result.dead_letter_intent))
    || input.attempts.some((attempt) => attempt.status === 'dead_lettered');
  const repairRefs = refsFromAttempts(input.attempts, 'repair_action_refs')
    .concat(projectionRefs(matrix, 'repair_action_refs'));
  const forbiddenAuthorityFlags = collectForbiddenAuthorityFlags([
    { label: 'input:authority_boundary', value: input.authority_boundary },
    { label: 'spec:authority_boundary', value: input.spec.authority_boundary },
    ...resultAuthorityRecords(matrix),
    ...attemptAuthorityRecords(input.attempts),
  ]);
  const memoryBodyObserved = [
    input.spec,
    ...input.cases,
    ...input.attempts,
    ...matrix.results.map((entry) => entry.result.projection),
  ].some(hasForbiddenMemoryBody);
  const expectationMismatchCount = Math.max(0, expectedCases.length - matchedExpectedCases.length);

  return {
    observations: {
      stage_attempt_projection_ledger_observed: input.attempts.some((attempt) =>
        Boolean(attempt.stage_attempt_id && attempt.task_id && attempt.retry_budget)),
      typed_closeout_observed: closeoutRefs.length > 0
        && input.attempts.some((attempt) => attempt.closeout_receipt_status === 'accepted'),
      memory_refs_only_writeback_chain_observed: consumedMemoryRefs.length > 0
        && writebackProposalRefs.length > 0
        && writebackReceiptRefs.length > 0
        && !memoryBodyObserved,
      state_transition_matrix_smooth: expectedCases.length > 0 && expectationMismatchCount === 0,
      fail_closed_blocker_projected: matrix.results.some((entry) =>
        entry.result.status === 'blocked' && Boolean(entry.result.typed_blocker)),
      human_gate_projected: resultHumanGateRefs.length + attemptHumanGateRefs.length > 0,
      retry_projected: retryStateObserved,
      dead_letter_projected: deadLetterObserved,
      repair_route_projected: repairRefs.length > 0,
      forbidden_authority_flags_all_false: forbiddenAuthorityFlags.length === 0,
    } satisfies Record<FunctionalAgentRuntimeObservationKey, boolean>,
    counters: {
      expected_case_count: expectedCases.length,
      expectation_match_count: matchedExpectedCases.length,
      expectation_mismatch_count: expectationMismatchCount,
      memory_body_observed: memoryBodyObserved,
      forbidden_authority_flag_count: forbiddenAuthorityFlags.length,
    },
    refs: {
      closeout_refs: closeoutRefs,
      consumed_memory_refs: consumedMemoryRefs,
      writeback_proposal_refs: writebackProposalRefs,
      writeback_receipt_refs: writebackReceiptRefs,
      owner_receipt_refs: refsFromAttempts(input.attempts, 'owner_receipt_refs'),
      human_gate_refs: unique([...resultHumanGateRefs, ...attemptHumanGateRefs]),
      typed_blocker_refs: refsFromAttempts(input.attempts, 'typed_blocker_refs')
        .concat(refsFromResults(matrix, (result) => result.typed_blocker?.refs)),
      dead_letter_refs: refsFromAttempts(input.attempts, 'dead_letter_refs')
        .concat(refsFromResults(matrix, (result) => result.dead_letter_intent?.refs)),
      repair_action_refs: unique(repairRefs),
      forbidden_authority_flags: forbiddenAuthorityFlags,
    },
  };
}

export function runFunctionalAgentRuntimeHarness(input: FunctionalAgentRuntimeHarnessInput) {
  const matrix = runFamilyTransitionMatrix({
    spec: input.spec,
    cases: input.cases,
  });
  const requiredObservations = input.required_observations ?? REQUIRED_OBSERVATIONS;
  const observationResult = buildObservations(input, matrix);
  const missingObservations = requiredObservations.filter(
    (observation) => !observationResult.observations[observation],
  );
  const harnessStatus = missingObservations.length === 0 ? 'passed' : 'blocked';

  return {
    surface_kind: 'opl_functional_agent_runtime_harness',
    version: 'opl-functional-agent-runtime-harness.v1',
    harness_id: input.harness_id,
    result_id: stableId('ofarh', [
      input.harness_id,
      matrix.summary,
      observationResult.observations,
      observationResult.refs,
    ]),
    harness_status: harnessStatus,
    required_observations: requiredObservations,
    missing_observations: missingObservations,
    summary: {
      total_transition_cases: matrix.summary.total,
      transition_applied_count: matrix.summary.transition_applied,
      blocked_count: matrix.summary.blocked,
      dead_letter_intended_count: matrix.summary.dead_letter_intended,
      stage_attempt_count: input.attempts.length,
      ...observationResult.counters,
    },
    observations: observationResult.observations,
    refs: observationResult.refs,
    matrix_result: matrix,
    attempts: input.attempts,
    authority_boundary: {
      ...HARNESS_AUTHORITY_BOUNDARY,
      ...(input.authority_boundary ?? {}),
    },
  };
}

export function buildConstructedFunctionalAgentRuntimeHarnessInput(): FunctionalAgentRuntimeHarnessInput {
  const spec = buildConstructedTransitionSpec();
  return {
    harness_id: 'constructed-opl-functional-agent-runtime-harness',
    spec,
    cases: constructedHarnessCases(),
    attempts: constructedHarnessAttempts(),
    authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
  };
}

function transitionCase(input: Omit<FamilyTransitionInput, 'spec'> & {
  case_id: string;
  expected_status: string;
  expected_next_state: string;
  expected_transition_id?: string | null;
}): FamilyTransitionMatrixCase {
  const {
    expected_status,
    expected_next_state,
    expected_transition_id,
    context,
    ...rest
  } = input;
  return {
    ...rest,
    context: {
      ...(context ?? {}),
      expected_status,
      expected_next_state,
      ...(expected_transition_id ? { expected_transition_id } : {}),
    },
  };
}

function buildConstructedTransitionSpec(): FamilyTransitionSpec {
  return {
    surface_kind: 'family_transition_spec',
    version: 'family-transition-runner.v1',
    spec_id: 'constructed-functional-agent-runtime-state-machine',
    target_domain_id: 'constructed-domain-agent',
    owner: 'constructed-domain-agent',
    authority_boundary: {
      domain_truth_owner: 'constructed-domain-agent',
      owner_receipt_owner: 'constructed-domain-agent',
      opl_role: 'generic_runtime_harness_transition_transport_only',
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
    guards: {
      queue_item_claimed: { owner: 'one-person-lab' },
      typed_closeout_observed: { owner: 'one-person-lab' },
      memory_refs_observed: { owner: 'one-person-lab' },
      owner_writeback_receipt_observed: { owner: 'constructed-domain-agent' },
      domain_blocker_observed: { owner: 'constructed-domain-agent' },
      human_gate_required: { owner: 'constructed-domain-agent' },
      retryable_failure_observed: { owner: 'one-person-lab' },
      retry_budget_available: { owner: 'one-person-lab' },
      retry_budget_exhausted: { owner: 'one-person-lab' },
      consumable_artifact_progress_observed: { owner: 'constructed-domain-agent' },
      repair_requested: { owner: 'human_operator' },
    },
    transitions: [
      {
        transition_id: 'queued-to-running',
        current_state: 'queued',
        event: 'runtime_tick',
        required_guards: ['queue_item_claimed'],
        next_state: 'running',
        next_work_unit: {
          work_unit_ref: 'opl-work-unit:dispatch-domain-stage',
          action_refs: ['opl-action:claim-queue-item'],
        },
        owner_route: {
          owner: 'one-person-lab',
          route_ref: 'opl-route:provider-dispatch',
        },
        receipt: {
          receipt_refs: ['opl-receipt:queue-claim'],
        },
      },
      {
        transition_id: 'running-to-memory-writeback-proposed',
        current_state: 'running',
        event: 'domain_closeout',
        required_guards: ['typed_closeout_observed', 'memory_refs_observed'],
        next_state: 'memory_writeback_proposed',
        next_work_unit: {
          work_unit_ref: 'opl-work-unit:project-writeback-proposal',
          action_refs: ['opl-action:project-memory-writeback-ref'],
        },
        owner_route: {
          owner: 'constructed-domain-agent',
          route_ref: 'domain-route:memory-writeback-owner-review',
        },
        receipt: {
          receipt_refs: ['domain-receipt:typed-closeout'],
        },
        projection: {
          route_node_refs: ['route-node:typed-closeout'],
          consumed_memory_refs: ['memory:constructed-domain/prior-plan'],
          writeback_proposal_refs: ['memory-writeback-proposal:constructed-domain/next-plan'],
          closeout_refs: ['closeout:constructed-domain/typed-closeout'],
          owner_receipt_refs: ['owner-receipt:constructed-domain/closeout'],
        },
      },
      {
        transition_id: 'memory-writeback-proposed-to-completed',
        current_state: 'memory_writeback_proposed',
        event: 'domain_owner_receipt',
        required_guards: ['owner_writeback_receipt_observed'],
        next_state: 'completed',
        owner_route: {
          owner: 'constructed-domain-agent',
          route_ref: 'domain-route:owner-receipt-accepted',
        },
        receipt: {
          receipt_refs: ['domain-receipt:writeback-owner-receipt'],
        },
        projection: {
          writeback_receipt_refs: ['memory-writeback-receipt:constructed-domain/accepted-by-owner'],
          domain_ready_verdict_ref: 'domain-verdict:constructed-domain/owner-only',
        },
      },
      {
        transition_id: 'running-to-human-gate',
        current_state: 'running',
        event: 'domain_blocked',
        required_guards: ['domain_blocker_observed', 'human_gate_required'],
        next_state: 'human_gate',
        owner_route: {
          owner: 'human_operator',
          route_ref: 'human-gate:constructed-domain-decision',
        },
        human_gate: {
          gate_ref: 'human-gate:constructed-domain-decision',
          owner: 'human_operator',
          reason: 'domain_owner_requires_operator_decision',
        },
        typed_blocker: {
          blocker_code: 'domain_owner_requires_human_gate',
          owner: 'constructed-domain-agent',
          refs: ['domain-blocker:human-decision-required'],
        },
      },
      {
        transition_id: 'running-to-retry-queued',
        current_state: 'running',
        event: 'provider_failure',
        required_guards: ['retryable_failure_observed', 'retry_budget_available'],
        forbidden_guards: ['retry_budget_exhausted'],
        next_state: 'retry_queued',
        owner_route: {
          owner: 'one-person-lab',
          route_ref: 'opl-route:retry-budget',
        },
        typed_blocker: {
          blocker_code: 'retryable_provider_failure',
          owner: 'one-person-lab',
          refs: ['provider-failure:retryable'],
        },
        receipt: {
          receipt_refs: ['opl-receipt:retry-queued'],
        },
      },
      {
        transition_id: 'retry-queued-to-completed-with-quality-debt',
        current_state: 'retry_queued',
        event: 'provider_failure',
        required_guards: ['retry_budget_exhausted', 'consumable_artifact_progress_observed'],
        next_state: 'completed',
        owner_route: {
          owner: 'constructed-domain-agent',
          route_ref: 'domain-route:advance-consumable-artifact-with-quality-debt',
        },
        receipt: {
          receipt_refs: ['progress-delta-receipt:constructed-domain/quality-budget-exhausted'],
        },
        projection: {
          transition_outcome: 'completed_with_quality_debt',
          consumable_artifact_refs: ['artifact:constructed-domain/best-available'],
          quality_debt_refs: ['quality-debt:constructed-domain/retry-budget-exhausted'],
          quality_or_ready_claim_authorized: false,
        },
      },
      {
        transition_id: 'retry-queued-to-dead-lettered',
        current_state: 'retry_queued',
        event: 'provider_failure',
        required_guards: ['retry_budget_exhausted'],
        forbidden_guards: ['consumable_artifact_progress_observed'],
        next_state: 'dead_lettered',
        owner_route: {
          owner: 'one-person-lab',
          route_ref: 'opl-route:dead-letter',
        },
        dead_letter_intent: {
          reason: 'retry_budget_exhausted',
          owner: 'one-person-lab',
          retryable: false,
          refs: ['provider-failure:retry-budget-exhausted'],
        },
      },
      {
        transition_id: 'blocked-to-repair-queued',
        current_state: 'blocked',
        event: 'operator_repair',
        required_guards: ['repair_requested'],
        next_state: 'repair_queued',
        next_work_unit: {
          work_unit_ref: 'opl-work-unit:repair-transport',
          action_refs: ['opl-action:route-repair-request'],
        },
        owner_route: {
          owner: 'constructed-domain-agent',
          route_ref: 'domain-route:repair-owner',
        },
        projection: {
          repair_action_refs: ['repair-action:constructed-domain/rerun-owner-stage'],
        },
      },
    ],
  };
}

function constructedHarnessCases(): FamilyTransitionMatrixCase[] {
  return [
    transitionCase({
      case_id: 'queue-claim-starts-running-attempt',
      domain_id: 'constructed-domain-agent',
      current_state: 'queued',
      event: 'runtime_tick',
      guards: { queue_item_claimed: true },
      expected_status: 'transition_applied',
      expected_next_state: 'running',
      expected_transition_id: 'queued-to-running',
      context: { attempt_id: 'sat_constructed_queue' },
    }),
    transitionCase({
      case_id: 'typed-closeout-projects-memory-writeback',
      domain_id: 'constructed-domain-agent',
      current_state: 'running',
      event: 'domain_closeout',
      guards: { typed_closeout_observed: true, memory_refs_observed: true },
      expected_status: 'transition_applied',
      expected_next_state: 'memory_writeback_proposed',
      expected_transition_id: 'running-to-memory-writeback-proposed',
      context: { attempt_id: 'sat_constructed_closeout' },
    }),
    transitionCase({
      case_id: 'owner-receipt-completes-memory-writeback-chain',
      domain_id: 'constructed-domain-agent',
      current_state: 'memory_writeback_proposed',
      event: 'domain_owner_receipt',
      guards: { owner_writeback_receipt_observed: true },
      expected_status: 'transition_applied',
      expected_next_state: 'completed',
      expected_transition_id: 'memory-writeback-proposed-to-completed',
      context: { receipt_ref: 'memory-writeback-receipt:constructed-domain/accepted-by-owner' },
    }),
    transitionCase({
      case_id: 'domain-blocker-projects-human-gate',
      domain_id: 'constructed-domain-agent',
      current_state: 'running',
      event: 'domain_blocked',
      guards: { domain_blocker_observed: true, human_gate_required: true },
      expected_status: 'transition_applied',
      expected_next_state: 'human_gate',
      expected_transition_id: 'running-to-human-gate',
    }),
    transitionCase({
      case_id: 'retryable-failure-projects-retry-queued',
      domain_id: 'constructed-domain-agent',
      current_state: 'running',
      event: 'provider_failure',
      guards: { retryable_failure_observed: true, retry_budget_available: true },
      expected_status: 'transition_applied',
      expected_next_state: 'retry_queued',
      expected_transition_id: 'running-to-retry-queued',
    }),
    transitionCase({
      case_id: 'retry-exhaustion-advances-consumable-artifact-with-quality-debt',
      domain_id: 'constructed-domain-agent',
      current_state: 'retry_queued',
      event: 'provider_failure',
      guards: {
        retry_budget_exhausted: true,
        consumable_artifact_progress_observed: true,
      },
      expected_status: 'transition_applied',
      expected_next_state: 'completed',
      expected_transition_id: 'retry-queued-to-completed-with-quality-debt',
    }),
    transitionCase({
      case_id: 'retry-exhaustion-projects-dead-letter',
      domain_id: 'constructed-domain-agent',
      current_state: 'retry_queued',
      event: 'provider_failure',
      guards: { retry_budget_exhausted: true },
      expected_status: 'transition_applied',
      expected_next_state: 'dead_lettered',
      expected_transition_id: 'retry-queued-to-dead-lettered',
    }),
    transitionCase({
      case_id: 'operator-repair-projects-domain-owner-route',
      domain_id: 'constructed-domain-agent',
      current_state: 'blocked',
      event: 'operator_repair',
      guards: { repair_requested: true },
      expected_status: 'transition_applied',
      expected_next_state: 'repair_queued',
      expected_transition_id: 'blocked-to-repair-queued',
    }),
    transitionCase({
      case_id: 'unknown-guard-fails-closed-before-dispatch',
      domain_id: 'constructed-domain-agent',
      current_state: 'queued',
      event: 'runtime_tick',
      guards: { queue_item_claimed: true, unregistered_domain_guard: true },
      expected_status: 'blocked',
      expected_next_state: 'queued',
    }),
    transitionCase({
      case_id: 'unknown-transition-dead-letters-without-domain-action',
      domain_id: 'constructed-domain-agent',
      current_state: 'orphan_state',
      event: 'runtime_tick',
      guards: {},
      expected_status: 'dead_letter_intended',
      expected_next_state: 'orphan_state',
    }),
  ];
}

function constructedHarnessAttempts(): FunctionalAgentRuntimeHarnessAttempt[] {
  return [
    {
      case_id: 'queue-claim-starts-running-attempt',
      stage_attempt_id: 'sat_constructed_queue',
      task_id: 'task_constructed_queue',
      status: 'running',
      attempt_count: 1,
      retry_budget: {
        ...taskRetryBudgetProjection(3),
        cadence_ref: 'cadence:constructed-domain',
      },
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
    {
      case_id: 'typed-closeout-projects-memory-writeback',
      stage_attempt_id: 'sat_constructed_closeout',
      task_id: 'task_constructed_closeout',
      status: 'completed',
      attempt_count: 1,
      retry_budget: taskRetryBudgetProjection(3),
      closeout_refs: ['closeout:constructed-domain/typed-closeout'],
      consumed_refs: ['source:constructed-domain/input'],
      consumed_memory_refs: ['memory:constructed-domain/prior-plan'],
      writeback_proposal_refs: ['memory-writeback-proposal:constructed-domain/next-plan'],
      owner_receipt_refs: ['owner-receipt:constructed-domain/closeout'],
      closeout_receipt_status: 'accepted',
      route_impact: {
        domain_route_ref: 'domain-route:memory-writeback-owner-review',
      },
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
    {
      case_id: 'owner-receipt-completes-memory-writeback-chain',
      stage_attempt_id: 'sat_constructed_memory_receipt',
      task_id: 'task_constructed_memory_receipt',
      status: 'completed',
      attempt_count: 1,
      retry_budget: taskRetryBudgetProjection(3),
      writeback_receipt_refs: ['memory-writeback-receipt:constructed-domain/accepted-by-owner'],
      owner_receipt_refs: ['owner-receipt:constructed-domain/memory-apply'],
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
    {
      case_id: 'domain-blocker-projects-human-gate',
      stage_attempt_id: 'sat_constructed_human_gate',
      task_id: 'task_constructed_human_gate',
      status: 'human_gate',
      attempt_count: 1,
      retry_budget: taskRetryBudgetProjection(3),
      human_gate_refs: ['human-gate:constructed-domain-decision'],
      typed_blocker_refs: ['domain-blocker:human-decision-required'],
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
    {
      case_id: 'retryable-failure-projects-retry-queued',
      stage_attempt_id: 'sat_constructed_retry',
      task_id: 'task_constructed_retry',
      status: 'retry_queued',
      attempt_count: 1,
      retry_budget: taskRetryBudgetProjection(3),
      typed_blocker_refs: ['provider-failure:retryable'],
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
    {
      case_id: 'retry-exhaustion-projects-dead-letter',
      stage_attempt_id: 'sat_constructed_dead_letter',
      task_id: 'task_constructed_dead_letter',
      status: 'dead_lettered',
      attempt_count: 3,
      retry_budget: taskRetryBudgetProjection(3),
      dead_letter_refs: ['provider-failure:retry-budget-exhausted'],
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
    {
      case_id: 'operator-repair-projects-domain-owner-route',
      stage_attempt_id: 'sat_constructed_repair',
      task_id: 'task_constructed_repair',
      status: 'repair_queued',
      attempt_count: 1,
      retry_budget: taskRetryBudgetProjection(3),
      repair_action_refs: ['repair-action:constructed-domain/rerun-owner-stage'],
      owner_receipt_refs: ['owner-receipt:constructed-domain/repair-requested'],
      authority_boundary: HARNESS_AUTHORITY_BOUNDARY,
    },
  ];
}
