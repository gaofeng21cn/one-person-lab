import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseJsonText } from '../../../src/kernel/json-file.ts';
import type { FamilyStageControlPlane } from '../../../src/modules/stagecraft/family-stage-control-plane-contract.ts';

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

function routeEvent(routeDecision: Record<string, any>) {
  return {
    surface_kind: 'opl_stage_run_route_decision_event',
    version: 'stage-run-cycle-event.v1',
    event_kind: 'route_decision',
    route_decision: routeDecision,
  };
}

function effectEvent(effect: Record<string, any>) {
  return {
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
    module.STAGE_RUN_CANONICAL_RUNNER_REFS.agent_stage_runner,
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
  events.push(routeEvent({
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

  events.push(effectEvent({
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

  events.push(routeEvent({
    decision: 'dispatch',
    stage_ref: 'review_and_rebuttal',
    decision_refs: ['mag://route-decisions/review-and-rebuttal'],
  }));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  events.push(effectEvent({
    effect_status: 'domain_result',
    stage_ref: 'review_and_rebuttal',
    domain_result_ref: 'mag://route-reports/p3a',
    checkpoint_ref: 'mag://checkpoints/quality-aware-review',
    closeout_refs: ['mag://stage-closeouts/quality-aware-review'],
  }));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  assert.deepEqual(state.latest_output_refs, [
    'mag://workspace/revised',
    'mag://checkpoints/quality-aware-review',
  ]);

  events.push(routeEvent({
    decision: 'accepted',
    accepted_checkpoint_ref: 'mag://checkpoints/quality-aware-review',
    decision_refs: ['mag://route-decisions/accepted'],
  }));
  state = module.reduceStageRunCycleState({
    manifest,
    events,
  });
  assert.equal(state.status, 'checkpoint_accepted');
  assert.equal(state.authority_boundary.can_dispatch_runner, false);
  assert.equal(state.domain_typed_blocker_created, false);
});

test('StageRun reducer merges owner blockers and exhausts retry budgets without synthesizing authority', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module, 'mag://authoring-run/blockers');
  const events = [
    routeEvent({
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://routes/dispatch'],
    }),
    effectEvent({
      effect_status: 'runtime_blocker',
      stage_ref: 'proposal_authoring',
      runtime_blocker_ref: 'opl://runtime-blockers/provider-exit',
    }),
  ];
  let state = module.reduceStageRunCycleState({ manifest, events });
  assert.equal(state.attempt_index, 2);
  events.push(routeEvent({
    decision: 'blocked',
    decision_refs: ['mag://routes/blocked'],
    typed_blocker_refs: ['mag://typed-blockers/quality'],
    human_gate_refs: ['mag://human-gates/review'],
    runtime_blocker_refs: ['opl://runtime-blockers/owner-route'],
  }));
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
    retryEvents.push(routeEvent({
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: [`mag://routes/runtime-retry-${attempt}`],
    }));
    retryEvents.push(effectEvent({
      effect_status: 'runtime_blocker',
      stage_ref: 'proposal_authoring',
      runtime_blocker_ref: `opl://runtime-blockers/provider-exit-${attempt}`,
    }));
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
  const dispatch = routeEvent({
    decision: 'dispatch',
    stage_ref: 'proposal_authoring',
    decision_refs: ['mag://routes/dispatch'],
  });
  const state = module.reduceStageRunCycleState({ manifest, events: [dispatch] });
  for (const tamperedState of [
    { ...state, completed_step_count: 99 },
    { ...state, checkpoint_refs: 'mag://forged-checkpoint' },
    { ...state, accepted_checkpoint_ref: 'mag://forged-checkpoint', status: 'running' },
    { ...state, rollback_to_checkpoint_ref: 'mag://forged-checkpoint', status: 'running' },
    { ...state, status: 'checkpoint_accepted' },
  ]) {
    assert.throws(
      () => module.reduceStageRunCycleState({ manifest, events: [dispatch], state: tamperedState }),
      /does not accept caller mutable state/,
    );
  }
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, routeEvent({
      decision: 'dispatch',
      stage_ref: 'review_and_rebuttal',
      decision_refs: ['mag://routes/replace-pending'],
    })],
  }), /cannot replace a pending canonical runner effect/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, effectEvent({
      effect_status: 'domain_result',
      stage_ref: 'proposal_authoring',
      typed_blocker_ref: 'mag://typed-blockers/wrong-carrier',
    })],
  }), /required carrier ref/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, effectEvent({
      effect_status: 'domain_result',
      stage_ref: 'review_and_rebuttal',
      domain_result_ref: 'mag://results/wrong-stage',
    })],
  }), /must match the pending stage ref/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    events: [dispatch, effectEvent({
      effect_status: 'no_progress',
      stage_ref: 'proposal_authoring',
    })],
  }), /invalid status/);
});
