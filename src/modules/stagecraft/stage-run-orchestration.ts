import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY,
  STAGE_RUN_CANONICAL_LAUNCH_OWNER,
  STAGE_RUN_CANONICAL_RUNNER_REFS,
  type StageRunCanonicalRunnerRef,
  type StageRunCycleEvent,
  type StageRunCycleIdentity,
  type StageRunCycleIdentityInput,
  type StageRunCycleManifest,
  type StageRunCycleState,
  type StageRunEffectObservation,
  type StageRunRouteDecision,
} from './stage-run-orchestration-types.ts';

const ALLOWED_MANIFEST_FIELDS = new Set([
  'surface_kind',
  'version',
  'manifest_id',
  'target_agent_ref',
  'descriptor_ref',
  'run_ref',
  'launch_owner',
  'input_refs',
  'stage_bindings',
  'max_cycles',
  'max_attempts_per_cycle',
]);

const ALLOWED_STAGE_BINDING_FIELDS = new Set(['stage_ref', 'runner_ref']);

const ALLOWED_ROUTE_DECISION_FIELDS = new Set([
  'decision',
  'stage_ref',
  'decision_refs',
  'accepted_checkpoint_ref',
  'rollback_to_checkpoint_ref',
  'typed_blocker_refs',
  'human_gate_refs',
  'runtime_blocker_refs',
]);

const ALLOWED_EFFECT_FIELDS = new Set([
  'effect_status',
  'stage_ref',
  'domain_result_ref',
  'typed_blocker_ref',
  'runtime_blocker_ref',
  'output_refs',
  'checkpoint_ref',
  'closeout_refs',
]);

const ALLOWED_REDUCER_INPUT_FIELDS = new Set(['manifest', 'events']);

function contractError(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredRef(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    contractError(`StageRun orchestration requires ${field}.`, { field });
  }
  return value.trim();
}

function optionalRef(value: unknown, field: string) {
  return value === undefined || value === null ? null : requiredRef(value, field);
}

function positiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    contractError(`StageRun orchestration requires positive integer ${field}.`, { field, value });
  }
  return Number(value);
}

function uniqueRefs(value: unknown, field: string, required = false) {
  if (!Array.isArray(value)) {
    if (required) contractError(`StageRun orchestration requires ${field}.`, { field });
    return [];
  }
  const refs = [...new Set(value.map((entry) => requiredRef(entry, field)))];
  if (required && refs.length === 0) {
    contractError(`StageRun orchestration requires non-empty ${field}.`, { field });
  }
  return refs;
}

function unexpectedFields(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).filter((field) => !allowed.has(field));
}

function canonicalRunnerRef(value: unknown, field: string): StageRunCanonicalRunnerRef {
  const runnerRef = requiredRef(value, field);
  if (!Object.values(STAGE_RUN_CANONICAL_RUNNER_REFS).includes(runnerRef as StageRunCanonicalRunnerRef)) {
    contractError('StageRun runner_ref must bind a canonical OPL runner owner.', {
      field,
      runner_ref: runnerRef,
    });
  }
  return runnerRef as StageRunCanonicalRunnerRef;
}

function normalizeManifest(value: StageRunCycleManifest): StageRunCycleManifest {
  if (
    !isRecord(value)
    || value.surface_kind !== 'opl_stage_run_cycle_manifest'
    || value.version !== 'stage-run-cycle.v1'
    || !Array.isArray(value.stage_bindings)
  ) {
    contractError('Invalid StageRun cycle manifest envelope.');
  }
  const unexpected = unexpectedFields(value, ALLOWED_MANIFEST_FIELDS);
  if (unexpected.length > 0) {
    contractError('StageRun cycle manifest must contain refs-only contract fields.', {
      unexpected_fields: unexpected,
    });
  }
  const stageBindings = value.stage_bindings.map((binding) => {
    if (!isRecord(binding)) {
      contractError('StageRun cycle manifest stage_bindings entries must be objects.');
    }
    const unexpectedBindingFields = unexpectedFields(binding, ALLOWED_STAGE_BINDING_FIELDS);
    if (unexpectedBindingFields.length > 0) {
      contractError('StageRun cycle manifest stage_bindings must contain identity fields only.', {
        unexpected_fields: unexpectedBindingFields,
      });
    }
    return {
      stage_ref: requiredRef(binding.stage_ref, 'stage_bindings.stage_ref'),
      runner_ref: canonicalRunnerRef(binding.runner_ref, 'stage_bindings.runner_ref'),
    };
  });
  if (stageBindings.length === 0) {
    contractError('StageRun cycle manifest requires stage_bindings.');
  }
  if (new Set(stageBindings.map((binding) => binding.stage_ref)).size !== stageBindings.length) {
    contractError('StageRun cycle manifest stage_ref values must be unique.');
  }
  if (value.launch_owner !== STAGE_RUN_CANONICAL_LAUNCH_OWNER) {
    contractError('StageRun launch_owner must bind the canonical OPL launch owner.', {
      launch_owner: value.launch_owner,
    });
  }
  return {
    surface_kind: 'opl_stage_run_cycle_manifest',
    version: 'stage-run-cycle.v1',
    manifest_id: requiredRef(value.manifest_id, 'manifest_id'),
    target_agent_ref: requiredRef(value.target_agent_ref, 'target_agent_ref'),
    descriptor_ref: requiredRef(value.descriptor_ref, 'descriptor_ref'),
    run_ref: requiredRef(value.run_ref, 'run_ref'),
    launch_owner: STAGE_RUN_CANONICAL_LAUNCH_OWNER,
    input_refs: uniqueRefs(value.input_refs, 'input_refs', true),
    stage_bindings: stageBindings,
    max_cycles: positiveInteger(value.max_cycles, 'max_cycles'),
    max_attempts_per_cycle: positiveInteger(value.max_attempts_per_cycle, 'max_attempts_per_cycle'),
  };
}

function normalizeRouteDecision(value: StageRunRouteDecision): StageRunRouteDecision {
  if (!isRecord(value) || !['dispatch', 'accepted', 'rollback', 'blocked'].includes(String(value.decision))) {
    contractError('StageRun route oracle returned an invalid decision.');
  }
  const unexpected = unexpectedFields(value, ALLOWED_ROUTE_DECISION_FIELDS);
  if (unexpected.length > 0) {
    contractError('StageRun route oracle must return refs-only decision fields.', {
      unexpected_fields: unexpected,
    });
  }
  return {
    decision: value.decision,
    ...(value.stage_ref ? { stage_ref: requiredRef(value.stage_ref, 'route.stage_ref') } : {}),
    decision_refs: uniqueRefs(value.decision_refs, 'route.decision_refs', true),
    ...(value.accepted_checkpoint_ref
      ? { accepted_checkpoint_ref: requiredRef(value.accepted_checkpoint_ref, 'accepted_checkpoint_ref') }
      : {}),
    ...(value.rollback_to_checkpoint_ref
      ? { rollback_to_checkpoint_ref: requiredRef(value.rollback_to_checkpoint_ref, 'rollback_to_checkpoint_ref') }
      : {}),
    typed_blocker_refs: uniqueRefs(value.typed_blocker_refs ?? [], 'typed_blocker_refs'),
    human_gate_refs: uniqueRefs(value.human_gate_refs ?? [], 'human_gate_refs'),
    runtime_blocker_refs: uniqueRefs(value.runtime_blocker_refs ?? [], 'runtime_blocker_refs'),
  };
}

function normalizeEffect(value: StageRunEffectObservation): StageRunEffectObservation {
  if (
    !isRecord(value)
    || !['domain_result', 'typed_blocker', 'runtime_blocker']
      .includes(String(value.effect_status))
  ) {
    contractError('StageRun effect observation has an invalid status.');
  }
  const unexpected = unexpectedFields(value, ALLOWED_EFFECT_FIELDS);
  if (unexpected.length > 0) {
    contractError('StageRun effect observation must contain refs-only fields.', {
      unexpected_fields: unexpected,
    });
  }
  const normalized = {
    effect_status: value.effect_status,
    stage_ref: requiredRef(value.stage_ref, 'effect.stage_ref'),
    domain_result_ref: optionalRef(value.domain_result_ref, 'effect.domain_result_ref'),
    typed_blocker_ref: optionalRef(value.typed_blocker_ref, 'effect.typed_blocker_ref'),
    runtime_blocker_ref: optionalRef(value.runtime_blocker_ref, 'effect.runtime_blocker_ref'),
    output_refs: uniqueRefs(value.output_refs ?? [], 'effect.output_refs'),
    checkpoint_ref: optionalRef(value.checkpoint_ref, 'effect.checkpoint_ref'),
    closeout_refs: uniqueRefs(value.closeout_refs ?? [], 'effect.closeout_refs'),
  };
  const carrierRefs = [
    normalized.domain_result_ref,
    normalized.typed_blocker_ref,
    normalized.runtime_blocker_ref,
  ].filter(Boolean);
  if (carrierRefs.length !== 1) {
    contractError('StageRun effect status must bind exactly its declared result or blocker ref.', {
      effect_status: normalized.effect_status,
    });
  }
  if (
    (normalized.effect_status === 'domain_result' && !normalized.domain_result_ref)
    || (normalized.effect_status === 'typed_blocker' && !normalized.typed_blocker_ref)
    || (normalized.effect_status === 'runtime_blocker' && !normalized.runtime_blocker_ref)
  ) {
    contractError('StageRun effect status is missing its required carrier ref.', {
      effect_status: normalized.effect_status,
    });
  }
  return {
    effect_status: normalized.effect_status,
    stage_ref: normalized.stage_ref,
    ...(normalized.domain_result_ref ? { domain_result_ref: normalized.domain_result_ref } : {}),
    ...(normalized.typed_blocker_ref ? { typed_blocker_ref: normalized.typed_blocker_ref } : {}),
    ...(normalized.runtime_blocker_ref ? { runtime_blocker_ref: normalized.runtime_blocker_ref } : {}),
    output_refs: normalized.output_refs,
    ...(normalized.checkpoint_ref ? { checkpoint_ref: normalized.checkpoint_ref } : {}),
    closeout_refs: normalized.closeout_refs,
  };
}

function normalizeEvent(value: StageRunCycleEvent): StageRunCycleEvent {
  if (!isRecord(value) || value.version !== 'stage-run-cycle-event.v1') {
    contractError('Invalid StageRun cycle event envelope.');
  }
  if (value.event_kind === 'route_decision') {
    if (
      value.surface_kind !== 'opl_stage_run_route_decision_event'
      || unexpectedFields(value, new Set(['surface_kind', 'version', 'event_kind', 'route_decision'])).length > 0
    ) {
      contractError('Invalid StageRun route decision event envelope.');
    }
    return {
      surface_kind: 'opl_stage_run_route_decision_event',
      version: 'stage-run-cycle-event.v1',
      event_kind: 'route_decision',
      route_decision: normalizeRouteDecision(value.route_decision as StageRunRouteDecision),
    };
  }
  if (value.event_kind === 'effect_observation') {
    if (
      value.surface_kind !== 'opl_stage_run_effect_observation_event'
      || unexpectedFields(value, new Set(['surface_kind', 'version', 'event_kind', 'effect'])).length > 0
    ) {
      contractError('Invalid StageRun effect observation event envelope.');
    }
    return {
      surface_kind: 'opl_stage_run_effect_observation_event',
      version: 'stage-run-cycle-event.v1',
      event_kind: 'effect_observation',
      effect: normalizeEffect(value.effect as StageRunEffectObservation),
    };
  }
  contractError('Unsupported StageRun cycle event kind.');
}

export function buildStageRunCycleIdentity(input: StageRunCycleIdentityInput): StageRunCycleIdentity {
  const normalized = {
    target_agent_ref: requiredRef(input.target_agent_ref, 'target_agent_ref'),
    descriptor_ref: requiredRef(input.descriptor_ref, 'descriptor_ref'),
    stage_ref: requiredRef(input.stage_ref, 'stage_ref'),
    run_ref: requiredRef(input.run_ref, 'run_ref'),
    cycle_index: positiveInteger(input.cycle_index, 'cycle_index'),
    attempt_index: positiveInteger(input.attempt_index, 'attempt_index'),
  };
  const stageRunId = stableId('stage_run', [
    normalized.target_agent_ref,
    normalized.descriptor_ref,
    normalized.run_ref,
  ]);
  const stageStepId = stableId('stage_step', [
    normalized.target_agent_ref,
    normalized.descriptor_ref,
    normalized.stage_ref,
    normalized.run_ref,
    normalized.cycle_index,
    normalized.attempt_index,
  ]);
  return {
    surface_kind: 'opl_stage_run_cycle_identity',
    version: 'stage-run-cycle-identity.v1',
    ...normalized,
    stage_run_id: stageRunId,
    stage_step_id: stageStepId,
    idempotency_key: stableId('stage_run_idempotency', [stageRunId, stageStepId]),
  };
}

function expectedStageRunId(manifest: StageRunCycleManifest) {
  return buildStageRunCycleIdentity({
    target_agent_ref: manifest.target_agent_ref,
    descriptor_ref: manifest.descriptor_ref,
    stage_ref: manifest.stage_bindings[0].stage_ref,
    run_ref: manifest.run_ref,
    cycle_index: 1,
    attempt_index: 1,
  }).stage_run_id;
}

export function initializeStageRunCycleState(value: StageRunCycleManifest): StageRunCycleState {
  const manifest = normalizeManifest(value);
  return {
    surface_kind: 'opl_stage_run_cycle_state',
    version: 'stage-run-cycle.v1',
    manifest_id: manifest.manifest_id,
    stage_run_id: expectedStageRunId(manifest),
    target_agent_ref: manifest.target_agent_ref,
    descriptor_ref: manifest.descriptor_ref,
    run_ref: manifest.run_ref,
    status: 'running',
    cycle_index: 1,
    attempt_index: 1,
    completed_step_count: 0,
    pending_stage_ref: null,
    checkpoint_refs: [],
    accepted_checkpoint_ref: null,
    rollback_to_checkpoint_ref: null,
    latest_output_refs: manifest.input_refs,
    domain_result_refs: [],
    closeout_refs: [],
    route_decision_refs: [],
    typed_blocker_refs: [],
    human_gate_refs: [],
    runtime_blocker_refs: [],
    termination_reason: null,
    domain_typed_blocker_created: false,
    authority_boundary: { ...STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY },
  };
}

function reduceRouteDecision(
  manifest: StageRunCycleManifest,
  state: StageRunCycleState,
  route: StageRunRouteDecision,
): StageRunCycleState {
  if (state.pending_stage_ref) {
    contractError('StageRun route decision cannot replace a pending canonical runner effect.', {
      pending_stage_ref: state.pending_stage_ref,
    });
  }
  const routeDecisionRefs = [...new Set([...state.route_decision_refs, ...route.decision_refs])];
  if (route.decision === 'dispatch') {
    if (state.completed_step_count >= manifest.max_cycles) {
      return {
        ...state,
        route_decision_refs: routeDecisionRefs,
        status: 'exhausted',
        termination_reason: 'max_cycles_exhausted',
      };
    }
    const stageRef = requiredRef(route.stage_ref, 'route.stage_ref');
    if (!manifest.stage_bindings.some((binding) => binding.stage_ref === stageRef)) {
      contractError('StageRun route selected a stage absent from manifest.', { stage_ref: stageRef });
    }
    return { ...state, route_decision_refs: routeDecisionRefs, pending_stage_ref: stageRef };
  }
  if (route.decision === 'accepted') {
    const accepted = route.accepted_checkpoint_ref ?? null;
    if (!accepted || !state.checkpoint_refs.includes(accepted)) {
      contractError('StageRun accepted route must bind an observed checkpoint ref.', {
        accepted_checkpoint_ref: accepted,
      });
    }
    return {
      ...state,
      route_decision_refs: routeDecisionRefs,
      status: 'checkpoint_accepted',
      accepted_checkpoint_ref: accepted,
      termination_reason: 'accepted_checkpoint_observed',
    };
  }
  if (route.decision === 'rollback') {
    const rollbackRef = route.rollback_to_checkpoint_ref ?? null;
    if (!rollbackRef || !state.checkpoint_refs.includes(rollbackRef)) {
      contractError('StageRun rollback route must bind an observed checkpoint ref.', {
        rollback_to_checkpoint_ref: rollbackRef,
      });
    }
    return {
      ...state,
      route_decision_refs: routeDecisionRefs,
      status: 'rollback_required',
      rollback_to_checkpoint_ref: rollbackRef,
      termination_reason: 'rollback_checkpoint_observed',
    };
  }
  const typedBlockerRefs = uniqueRefs(route.typed_blocker_refs ?? [], 'typed_blocker_refs');
  const humanGateRefs = uniqueRefs(route.human_gate_refs ?? [], 'human_gate_refs');
  const runtimeBlockerRefs = uniqueRefs(route.runtime_blocker_refs ?? [], 'runtime_blocker_refs');
  if (typedBlockerRefs.length + humanGateRefs.length + runtimeBlockerRefs.length === 0) {
    contractError('StageRun blocked route requires an owner-supplied blocker or gate ref.');
  }
  return {
    ...state,
    route_decision_refs: routeDecisionRefs,
    status: 'blocked',
    typed_blocker_refs: [...new Set([...state.typed_blocker_refs, ...typedBlockerRefs])],
    human_gate_refs: [...new Set([...state.human_gate_refs, ...humanGateRefs])],
    runtime_blocker_refs: [...new Set([...state.runtime_blocker_refs, ...runtimeBlockerRefs])],
    termination_reason: 'owner_supplied_blocker_or_gate_observed',
  };
}

function reduceEffectObservation(
  manifest: StageRunCycleManifest,
  state: StageRunCycleState,
  effect: StageRunEffectObservation,
): StageRunCycleState {
  if (!state.pending_stage_ref || state.pending_stage_ref !== effect.stage_ref) {
    contractError('StageRun effect observation must match the pending stage ref.', {
      pending_stage_ref: state.pending_stage_ref,
      effect_stage_ref: effect.stage_ref,
    });
  }
  const closeoutRefs = [...new Set([...state.closeout_refs, ...(effect.closeout_refs ?? [])])];
  if (effect.effect_status === 'domain_result') {
    const checkpointRefs = effect.checkpoint_ref
      ? [...new Set([...state.checkpoint_refs, effect.checkpoint_ref])]
      : state.checkpoint_refs;
    const outputRefs = effect.output_refs ?? [];
    return {
      ...state,
      cycle_index: state.cycle_index + 1,
      attempt_index: 1,
      completed_step_count: state.completed_step_count + 1,
      pending_stage_ref: null,
      checkpoint_refs: checkpointRefs,
      latest_output_refs: outputRefs.length > 0
        ? outputRefs
        : effect.checkpoint_ref
          ? [...new Set([...state.latest_output_refs, effect.checkpoint_ref])]
          : state.latest_output_refs,
      domain_result_refs: [...new Set([...state.domain_result_refs, effect.domain_result_ref!])],
      closeout_refs: closeoutRefs,
    };
  }
  if (effect.effect_status === 'typed_blocker') {
    return {
      ...state,
      status: 'blocked',
      pending_stage_ref: null,
      typed_blocker_refs: [...new Set([...state.typed_blocker_refs, effect.typed_blocker_ref!])],
      closeout_refs: closeoutRefs,
      termination_reason: 'domain_typed_blocker_ref_observed',
    };
  }
  const nextAttempt = state.attempt_index + 1;
  const runtimeBlockerRefs = effect.runtime_blocker_ref
    ? [...new Set([...state.runtime_blocker_refs, effect.runtime_blocker_ref])]
    : state.runtime_blocker_refs;
  if (nextAttempt > manifest.max_attempts_per_cycle) {
    return {
      ...state,
      status: 'exhausted',
      pending_stage_ref: null,
      runtime_blocker_refs: runtimeBlockerRefs,
      closeout_refs: closeoutRefs,
      termination_reason: 'max_attempts_exhausted',
    };
  }
  return {
    ...state,
    attempt_index: nextAttempt,
    pending_stage_ref: null,
    runtime_blocker_refs: runtimeBlockerRefs,
    closeout_refs: closeoutRefs,
  };
}

export function reduceStageRunCycleState(input: {
  manifest: StageRunCycleManifest;
  events: StageRunCycleEvent[];
}): StageRunCycleState {
  if (!isRecord(input)) {
    contractError('StageRun reducer requires an input object.');
  }
  const unexpected = unexpectedFields(input, ALLOWED_REDUCER_INPUT_FIELDS);
  if (unexpected.length > 0) {
    contractError('StageRun reducer rebuilds state and does not accept caller mutable state.', {
      unexpected_fields: unexpected,
    });
  }
  if (!Array.isArray(input.events)) {
    contractError('StageRun reducer requires an ordered events array.');
  }
  const manifest = normalizeManifest(input.manifest);
  let state = initializeStageRunCycleState(manifest);
  for (const value of input.events) {
    if (state.status !== 'running') {
      contractError('StageRun terminal cycle state cannot consume another event.', {
        status: state.status,
      });
    }
    const event = normalizeEvent(value);
    state = event.event_kind === 'route_decision'
      ? reduceRouteDecision(manifest, state, event.route_decision)
      : reduceEffectObservation(manifest, state, event.effect);
  }
  return state;
}

export { buildStageRunCycleManifestFromControlPlane } from './stage-run-orchestration-adapter.ts';
export type { StageRunControlPlaneManifestInput } from './stage-run-orchestration-adapter.ts';
export { STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY } from './stage-run-orchestration-types.ts';
export { STAGE_RUN_CANONICAL_LAUNCH_OWNER, STAGE_RUN_CANONICAL_RUNNER_REFS } from './stage-run-orchestration-types.ts';
export type {
  StageRunCanonicalRunnerRef,
  StageRunCycleEvent,
  StageRunCycleIdentity,
  StageRunCycleIdentityInput,
  StageRunCycleManifest,
  StageRunCycleState,
  StageRunEffectObservation,
  StageRunRouteDecision,
} from './stage-run-orchestration-types.ts';
