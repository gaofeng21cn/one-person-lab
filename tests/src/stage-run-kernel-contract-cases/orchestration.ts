import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseJsonText } from '../../../src/kernel/json-file.ts';
import type { FamilyStageControlPlane } from '../../../src/modules/stagecraft/family-stage-control-plane-contract.ts';
import { buildStageRunCycleIdentity } from '../../../src/modules/stagecraft/stage-run-orchestration.ts';
import type {
  StageRunCycleManifest,
  StageRunEffectObservation,
  StageRunRouteDecision,
} from '../../../src/modules/stagecraft/stage-run-orchestration-types.ts';

const forgedDispatchType: StageRunRouteDecision = {
  decision: 'dispatch',
  stage_ref: 'proposal_authoring',
  decision_refs: ['mag://route'],
  // @ts-expect-error dispatch decisions cannot carry accepted checkpoint refs
  accepted_checkpoint_ref: 'mag://checkpoint/forged',
};

const forgedEffectType: StageRunEffectObservation = {
  effect_status: 'typed_blocker',
  stage_ref: 'proposal_authoring',
  typed_blocker_ref: 'mag://blocker',
  // @ts-expect-error typed blocker effects cannot carry output refs
  output_refs: ['mag://output/forged'],
};

void forgedDispatchType;
void forgedEffectType;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const contractPath = 'contracts/opl-framework/stage-run-kernel-contract.json';
const orchestrationModulePath = 'src/modules/stagecraft/stage-run-orchestration.ts';
const magStageIds = [
  'call_and_candidate_intake',
  'fundability_strategy',
  'specific_aims_and_structure',
  'proposal_authoring',
  'review_and_rebuttal',
  'package_and_submit_ready',
];

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

function magControlPlane(): FamilyStageControlPlane {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med-autogrant-family-stage-control-plane',
    target_domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: magStageIds.map((stageId) => ({
      stage_id: stageId,
      stage_kind: 'domain_specific',
      title: stageId,
      summary: null,
      goal: `Execute ${stageId} under MAG authority.`,
      owner: 'med-autogrant',
      domain_stage_refs: [stageId],
      inputs: [],
      knowledge_refs: [],
      skills: [],
      prompt_refs: [],
      allowed_action_refs: [],
      outputs: [],
      evaluation: [],
      handoff: null,
      source_refs: [],
      freshness: null,
      action_parity: null,
      stage_contract: null,
      trust_boundary: null,
      authority_boundary: { opl_role: 'projection_consumer_only' },
    })),
    notes: [],
  };
}

function controlPlaneManifestInput(runRef = 'mag://authoring-run/proposal-1') {
  return {
    stage_control_plane: magControlPlane(),
    target_agent_ref: 'mag',
    descriptor_ref: 'mag://agent/descriptor',
    run_ref: runRef,
    input_refs: ['mag://workspace/proposal-1'],
    max_cycles: 3,
    max_attempts_per_cycle: 2,
  };
}

function manifestInput(module: Record<string, any>, runRef = 'mag://authoring-run/proposal-1') {
  return module.buildStageRunCycleManifestFromControlPlane(controlPlaneManifestInput(runRef));
}

function eventIdentity(manifest: StageRunCycleManifest, cycleIndex = 1, attemptIndex = 1) {
  const identity = buildStageRunCycleIdentity({
    target_agent_ref: manifest.target_agent_ref,
    descriptor_ref: manifest.descriptor_ref,
    stage_ref: manifest.stage_bindings[0].stage_ref,
    run_ref: manifest.run_ref,
    cycle_index: cycleIndex,
    attempt_index: attemptIndex,
  });
  return {
    manifest_id: manifest.manifest_id,
    stage_run_id: identity.stage_run_id,
    cycle_index: cycleIndex,
    attempt_index: attemptIndex,
  };
}

function routeEvent(
  manifest: StageRunCycleManifest,
  routeDecision: Record<string, any>,
  cycleIndex = 1,
  attemptIndex = 1,
) {
  return {
    ...eventIdentity(manifest, cycleIndex, attemptIndex),
    surface_kind: 'opl_stage_run_route_decision_event',
    version: 'stage-run-cycle-event.v1',
    event_kind: 'route_decision',
    route_decision: routeDecision,
  };
}

function effectEvent(
  manifest: StageRunCycleManifest,
  effect: Record<string, any>,
  cycleIndex = 1,
  attemptIndex = 1,
) {
  return {
    ...eventIdentity(manifest, cycleIndex, attemptIndex),
    surface_kind: 'opl_stage_run_effect_observation_event',
    version: 'stage-run-cycle-event.v1',
    event_kind: 'effect_observation',
    effect,
  };
}

test('StageRun orchestration is a pure reducer over canonical runner and domain refs', async () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const packageJson = readJson<Record<string, any>>('package.json');
  const source = fs.readFileSync(path.join(repoRoot, orchestrationModulePath), 'utf8');
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module);
  const common = {
    descriptor_ref: 'mag://agent/descriptor',
    stage_ref: 'proposal_authoring',
    run_ref: manifest.run_ref,
    cycle_index: 1,
    attempt_index: 1,
  };
  const mag = module.buildStageRunCycleIdentity({ ...common, target_agent_ref: 'mag' });
  const rca = module.buildStageRunCycleIdentity({ ...common, target_agent_ref: 'rca' });

  assert.equal(packageJson.exports['./stage-run-orchestration'], './dist/modules/stagecraft/stage-run-orchestration.js');
  assert.equal(contract.cycle_orchestration.execution_model, 'pure_refs_only_event_reducer');
  assert.equal(
    contract.cycle_orchestration.declarative_manifest.generated_control_plane_adapter
      .manifest_id_recomputed_on_read,
    true,
  );
  assert.equal(
    contract.cycle_orchestration.declarative_manifest.generated_control_plane_adapter
      .target_agent_ref_must_match_canonical_control_plane_owner,
    true,
  );
  assert.deepEqual(contract.cycle_orchestration.pure_state_reducer.event_identity_fields, [
    'manifest_id',
    'stage_run_id',
    'cycle_index',
    'attempt_index',
  ]);
  assert.equal(contract.cycle_orchestration.domain_route_oracle.irrelevant_decision_fields_policy, 'reject');
  assert.equal(contract.cycle_orchestration.pure_state_reducer.irrelevant_effect_fields_policy, 'reject');
  assert.equal(contract.cycle_orchestration.second_scheduler_created, false);
  assert.equal(contract.cycle_orchestration.second_receipt_store_created, false);
  assert.equal(contract.cycle_orchestration.authority_boundary.opl_can_spawn_process, false);
  assert.equal(source.includes('node:child_process'), false);
  assert.equal(source.includes('spawnSync'), false);
  assert.equal(source.includes('writeJsonPayloadFile'), false);
  assert.equal(source.includes('output_root'), false);
  assert.equal(manifest.target_agent_ref, 'mag');
  assert.equal(manifest.launch_owner, module.STAGE_RUN_CANONICAL_LAUNCH_OWNER);
  assert.equal(
    manifest.stage_bindings[0].runner_ref,
    module.STAGE_RUN_CANONICAL_RUNNER_REF,
  );
  assert.match(manifest.manifest_id, /^stage_run_manifest_/);
  assert.deepEqual(manifest.stage_bindings.map((binding: Record<string, any>) => binding.stage_ref), magStageIds);
  assert.notEqual(mag.stage_run_id, rca.stage_run_id);
  assert.notEqual(mag.stage_step_id, rca.stage_step_id);
});

test('StageRun reducer consumes declared route and canonical runner domain refs without executing effects', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module);
  const events: Array<Record<string, any>> = [];
  let state = module.initializeStageRunCycleState(manifest);
  events.push(routeEvent(manifest, {
    decision: 'dispatch',
    stage_ref: 'proposal_authoring',
    decision_refs: ['mag://route-decisions/proposal-authoring'],
  }));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  assert.equal(state.pending_stage_ref, 'proposal_authoring');
  assert.equal(state.completed_step_count, 0);

  events.push(effectEvent(manifest, {
    effect_status: 'domain_result',
    stage_ref: 'proposal_authoring',
    domain_result_ref: 'file:///tmp/mag/revised-workspace.json',
    output_refs: ['mag://workspace/revised'],
    checkpoint_ref: 'mag://checkpoints/revision-completed',
    closeout_refs: ['mag://stage-closeouts/revision-pass'],
  }));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  assert.equal(state.completed_step_count, 1);
  assert.deepEqual(state.domain_result_refs, ['file:///tmp/mag/revised-workspace.json']);
  assert.deepEqual(state.latest_output_refs, ['mag://workspace/revised']);

  events.push(routeEvent(manifest, {
    decision: 'dispatch',
    stage_ref: 'review_and_rebuttal',
    decision_refs: ['mag://route-decisions/review-and-rebuttal'],
  }, 2));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  events.push(effectEvent(manifest, {
    effect_status: 'domain_result',
    stage_ref: 'review_and_rebuttal',
    domain_result_ref: 'mag://route-reports/p3a',
    checkpoint_ref: 'mag://checkpoints/quality-aware-review',
    closeout_refs: ['mag://stage-closeouts/quality-aware-review'],
  }, 2));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  assert.deepEqual(state.latest_output_refs, [
    'mag://workspace/revised',
    'mag://checkpoints/quality-aware-review',
  ]);

  events.push(routeEvent(manifest, {
    decision: 'accepted',
    accepted_checkpoint_ref: 'mag://checkpoints/quality-aware-review',
    decision_refs: ['mag://route-decisions/accepted'],
  }, 3));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  assert.equal(state.status, 'checkpoint_accepted');
  assert.equal(state.authority_boundary.can_dispatch_runner, false);
  assert.equal(state.domain_typed_blocker_created, false);
});

test('StageRun manifest binds the canonical agent and complete control-plane identity', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  assert.throws(
    () => module.buildStageRunCycleManifestFromControlPlane({
      ...controlPlaneManifestInput('mag://authoring-run/identity-mismatch'),
      target_agent_ref: 'mas',
    }),
    /target agent must match the control-plane domain owner/,
  );

  const original = manifestInput(module, 'mag://authoring-run/semantic-currentness');
  const changedInput = controlPlaneManifestInput('mag://authoring-run/semantic-currentness');
  changedInput.stage_control_plane.stages[0] = {
    ...changedInput.stage_control_plane.stages[0],
    goal: 'Changed canonical stage semantics.',
  };
  const changed = module.buildStageRunCycleManifestFromControlPlane(changedInput);

  assert.deepEqual(original.control_plane_binding, {
    plane_id: 'med-autogrant-family-stage-control-plane',
    target_domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    fingerprint: original.control_plane_binding.fingerprint,
  });
  assert.notEqual(changed.manifest_id, original.manifest_id);
  assert.notEqual(changed.control_plane_binding.fingerprint, original.control_plane_binding.fingerprint);
});

test('StageRun events are bound to one manifest, run, cycle, and attempt', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifestA = manifestInput(module, 'mag://authoring-run/event-a');
  const manifestB = manifestInput(module, 'mag://authoring-run/event-b');
  const initialA = module.initializeStageRunCycleState(manifestA);
  const event = {
    ...routeEvent(manifestA, {
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://routes/run-a-only'],
    }),
    manifest_id: manifestA.manifest_id,
    stage_run_id: initialA.stage_run_id,
    cycle_index: 1,
    attempt_index: 1,
  };

  assert.equal(
    module.reduceStageRunCycleState({ manifest: manifestA, events: [event] }).pending_stage_ref,
    'proposal_authoring',
  );
  assert.throws(
    () => module.reduceStageRunCycleState({ manifest: manifestB, events: [event] }),
    /event identity must match the canonical cycle state/,
  );
});

test('StageRun cycle identity rejects non-object input with a typed contract error', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  assert.throws(
    () => module.buildStageRunCycleIdentity(null),
    (error: any) => error?.code === 'contract_shape_invalid',
  );
});

test('StageRun reducer merges owner blockers and exhausts retry budgets without synthesizing authority', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module, 'mag://authoring-run/blockers');
  const events = [
    routeEvent(manifest, {
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://routes/dispatch'],
    }),
    effectEvent(manifest, {
      effect_status: 'runtime_blocker',
      stage_ref: 'proposal_authoring',
      runtime_blocker_ref: 'opl://runtime-blockers/provider-exit',
    }),
  ];
  let state = module.reduceStageRunCycleState({ manifest, events });
  assert.equal(state.attempt_index, 2);
  events.push(routeEvent(manifest, {
    decision: 'blocked',
    decision_refs: ['mag://routes/blocked'],
    typed_blocker_refs: ['mag://typed-blockers/quality'],
    human_gate_refs: ['mag://human-gates/review'],
    runtime_blocker_refs: ['opl://runtime-blockers/owner-route'],
  }, 1, 2));
  state = module.reduceStageRunCycleState({ manifest, events });
  assert.deepEqual(state.runtime_blocker_refs, [
    'opl://runtime-blockers/provider-exit',
    'opl://runtime-blockers/owner-route',
  ]);
  assert.deepEqual(state.typed_blocker_refs, ['mag://typed-blockers/quality']);
  assert.equal(state.domain_typed_blocker_created, false);

  const retryManifest = manifestInput(module, 'mag://authoring-run/runtime-retry');
  const retryEvents: Array<Record<string, any>> = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    retryEvents.push(routeEvent(retryManifest, {
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: [`mag://routes/runtime-retry-${attempt}`],
    }, 1, attempt + 1));
    retryEvents.push(effectEvent(retryManifest, {
      effect_status: 'runtime_blocker',
      stage_ref: 'proposal_authoring',
      runtime_blocker_ref: `opl://runtime-blockers/provider-exit-${attempt}`,
    }, 1, attempt + 1));
  }
  const exhausted = module.reduceStageRunCycleState({ manifest: retryManifest, events: retryEvents });
  assert.equal(exhausted.status, 'exhausted');
  assert.equal(exhausted.termination_reason, 'max_attempts_exhausted');
  assert.deepEqual(exhausted.typed_blocker_refs, []);
});

test('StageRun reducer rejects caller state, untrusted runners, invalid effects, and pending-stage replacement', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module, 'mag://authoring-run/fail-closed');
  assert.throws(
    () => module.initializeStageRunCycleState({ ...manifest, artifact_body: { forbidden: true } }),
    /refs-only contract fields/,
  );
  assert.throws(
    () => module.initializeStageRunCycleState({ ...manifest, launch_owner: 'target-domain' }),
    /canonical OPL launch owner/,
  );
  assert.throws(
    () => module.initializeStageRunCycleState({ ...manifest, manifest_id: 'stage_run_manifest_forged' }),
    /must match the canonical manifest identity/,
  );
  assert.throws(
    () => module.initializeStageRunCycleState({
      ...manifest,
      stage_bindings: [{ stage_ref: 'proposal_authoring', runner_ref: 'mag://private-scheduler' }],
    }),
    /canonical OPL runner owner/,
  );
  assert.throws(
    () => module.buildStageRunCycleManifestFromControlPlane({
      ...controlPlaneManifestInput('mag://authoring-run/untrusted-runner'),
      runner_ref: 'mag://private-scheduler',
    }),
    /owns runner and launch identity/,
  );
  const dispatch = routeEvent(manifest, {
    decision: 'dispatch',
    stage_ref: 'proposal_authoring',
    decision_refs: ['mag://routes/dispatch'],
  });
  const state = module.reduceStageRunCycleState({ manifest, events: [dispatch] });
  assert.deepEqual(module.validateStageRunPersistedState({
    manifest,
    events: [dispatch],
    state,
  }), state);
  for (const tamperedState of [
    { ...state, completed_step_count: 99 },
    { ...state, checkpoint_refs: 'mag://forged-checkpoint' },
    { ...state, accepted_checkpoint_ref: 'mag://forged-checkpoint', status: 'running' },
    { ...state, rollback_to_checkpoint_ref: 'mag://forged-checkpoint', status: 'running' },
    { ...state, status: 'checkpoint_accepted' },
  ]) {
    assert.throws(
      () => module.validateStageRunPersistedState({ manifest, events: [dispatch], state: tamperedState }),
      /does not match canonical event replay/,
    );
  }
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, routeEvent(manifest, {
      decision: 'dispatch',
      stage_ref: 'review_and_rebuttal',
      decision_refs: ['mag://routes/replace-pending'],
    })],
  }), /cannot replace a pending canonical runner effect/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, effectEvent(manifest, {
      effect_status: 'domain_result',
      stage_ref: 'proposal_authoring',
      typed_blocker_ref: 'mag://typed-blockers/wrong-carrier',
    })],
  }), /fields do not match its effect status/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [routeEvent(manifest, {
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://routes/forged-dispatch'],
      accepted_checkpoint_ref: 'mag://checkpoints/forged',
      rollback_to_checkpoint_ref: 'mag://checkpoints/forged',
      typed_blocker_refs: ['mag://typed-blockers/forged'],
    })],
  }), /fields do not match its decision/);
  for (const effect of [
    {
      effect_status: 'typed_blocker',
      stage_ref: 'proposal_authoring',
      typed_blocker_ref: 'mag://typed-blockers/quality',
      checkpoint_ref: 'mag://checkpoints/forged',
    },
    {
      effect_status: 'runtime_blocker',
      stage_ref: 'proposal_authoring',
      runtime_blocker_ref: 'opl://runtime-blockers/provider-exit',
      output_refs: ['mag://outputs/forged'],
    },
  ]) {
    assert.throws(() => module.reduceStageRunCycleState({
      manifest,
      events: [dispatch, effectEvent(manifest, effect)],
    }), /fields do not match its effect status/);
  }
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, effectEvent(manifest, {
      effect_status: 'domain_result',
      stage_ref: 'review_and_rebuttal',
      domain_result_ref: 'mag://results/wrong-stage',
    })],
  }), /must match the pending stage ref/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, effectEvent(manifest, {
      effect_status: 'no_progress',
      stage_ref: 'proposal_authoring',
    })],
  }), /invalid status/);
});
