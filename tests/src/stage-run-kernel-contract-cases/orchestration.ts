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

function manifestInput(module: Record<string, any>, runRef = 'mag://authoring-run/proposal-1') {
  return module.buildStageRunCycleManifestFromControlPlane({
    stage_control_plane: magControlPlane(),
    target_agent_ref: 'mag',
    descriptor_ref: 'mag://agent/descriptor',
    run_ref: runRef,
    input_refs: ['mag://workspace/proposal-1'],
    runner_ref: 'src/modules/runway/family-runtime-codex-stage-runner.ts#runAgentStageRunner',
    max_cycles: 3,
    max_attempts_per_cycle: 2,
    no_progress_limit: 2,
  });
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
  assert.equal(contract.cycle_orchestration.execution_model, 'pure_refs_only_state_reducer');
  assert.equal(contract.cycle_orchestration.second_scheduler_created, false);
  assert.equal(contract.cycle_orchestration.second_receipt_store_created, false);
  assert.equal(contract.cycle_orchestration.authority_boundary.opl_can_spawn_process, false);
  assert.equal(source.includes('node:child_process'), false);
  assert.equal(source.includes('spawnSync'), false);
  assert.equal(source.includes('writeJsonPayloadFile'), false);
  assert.equal(source.includes('output_root'), false);
  assert.equal(manifest.target_agent_ref, 'mag');
  assert.match(manifest.manifest_id, /^stage_run_manifest_/);
  assert.deepEqual(manifest.stage_bindings.map((binding: Record<string, any>) => binding.stage_ref), magStageIds);
  assert.notEqual(mag.stage_run_id, rca.stage_run_id);
  assert.notEqual(mag.stage_step_id, rca.stage_step_id);
});

test('StageRun reducer consumes declared route and canonical runner domain refs without executing effects', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module);
  let state = module.initializeStageRunCycleState(manifest);
  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://route-decisions/proposal-authoring'],
    }),
  });
  assert.equal(state.pending_stage_ref, 'proposal_authoring');
  assert.equal(state.completed_step_count, 0);

  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: effectEvent({
      effect_status: 'domain_result',
      stage_ref: 'proposal_authoring',
      domain_result_ref: 'file:///tmp/mag/revised-workspace.json',
      output_refs: ['mag://workspace/revised'],
      checkpoint_ref: 'mag://checkpoints/revision-completed',
      closeout_refs: ['mag://stage-closeouts/revision-pass'],
    }),
  });
  assert.equal(state.completed_step_count, 1);
  assert.deepEqual(state.domain_result_refs, ['file:///tmp/mag/revised-workspace.json']);
  assert.deepEqual(state.latest_output_refs, ['mag://workspace/revised']);

  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'dispatch',
      stage_ref: 'review_and_rebuttal',
      decision_refs: ['mag://route-decisions/review-and-rebuttal'],
    }),
  });
  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: effectEvent({
      effect_status: 'domain_result',
      stage_ref: 'review_and_rebuttal',
      domain_result_ref: 'mag://route-reports/p3a',
      checkpoint_ref: 'mag://checkpoints/quality-aware-review',
      closeout_refs: ['mag://stage-closeouts/quality-aware-review'],
    }),
  });
  assert.deepEqual(state.latest_output_refs, [
    'mag://workspace/revised',
    'mag://checkpoints/quality-aware-review',
  ]);

  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'accepted',
      accepted_checkpoint_ref: 'mag://checkpoints/quality-aware-review',
      decision_refs: ['mag://route-decisions/accepted'],
    }),
  });
  assert.equal(state.status, 'checkpoint_accepted');
  assert.equal(state.authority_boundary.can_dispatch_runner, false);
  assert.equal(state.domain_typed_blocker_created, false);
});

test('StageRun reducer merges owner blockers and exhausts retry budgets without synthesizing authority', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module, 'mag://authoring-run/blockers');
  let state = module.initializeStageRunCycleState(manifest);
  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://routes/dispatch'],
    }),
  });
  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: effectEvent({
      effect_status: 'runtime_blocker',
      stage_ref: 'proposal_authoring',
      runtime_blocker_ref: 'opl://runtime-blockers/provider-exit',
    }),
  });
  assert.equal(state.attempt_index, 2);
  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'blocked',
      decision_refs: ['mag://routes/blocked'],
      typed_blocker_refs: ['mag://typed-blockers/quality'],
      human_gate_refs: ['mag://human-gates/review'],
      runtime_blocker_refs: ['opl://runtime-blockers/owner-route'],
    }),
  });
  assert.deepEqual(state.runtime_blocker_refs, [
    'opl://runtime-blockers/provider-exit',
    'opl://runtime-blockers/owner-route',
  ]);
  assert.deepEqual(state.typed_blocker_refs, ['mag://typed-blockers/quality']);
  assert.equal(state.domain_typed_blocker_created, false);

  const noProgressManifest = manifestInput(module, 'mag://authoring-run/no-progress');
  let noProgress = module.initializeStageRunCycleState(noProgressManifest);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    noProgress = module.reduceStageRunCycleState({
      manifest: noProgressManifest,
      state: noProgress,
      event: routeEvent({
        decision: 'dispatch',
        stage_ref: 'proposal_authoring',
        decision_refs: [`mag://routes/no-progress-${attempt}`],
      }),
    });
    noProgress = module.reduceStageRunCycleState({
      manifest: noProgressManifest,
      state: noProgress,
      event: effectEvent({
        effect_status: 'no_progress',
        stage_ref: 'proposal_authoring',
      }),
    });
  }
  assert.equal(noProgress.status, 'exhausted');
  assert.equal(noProgress.termination_reason, 'no_progress_budget_exhausted');
  assert.deepEqual(noProgress.typed_blocker_refs, []);
});

test('StageRun reducer fails closed on invalid manifests, effect carriers, and pending-stage replacement', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const manifest = manifestInput(module, 'mag://authoring-run/fail-closed');
  assert.throws(
    () => module.initializeStageRunCycleState({ ...manifest, artifact_body: { forbidden: true } }),
    /refs-only contract fields/,
  );
  let state = module.initializeStageRunCycleState(manifest);
  state = module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'dispatch',
      stage_ref: 'proposal_authoring',
      decision_refs: ['mag://routes/dispatch'],
    }),
  });
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    state,
    event: routeEvent({
      decision: 'dispatch',
      stage_ref: 'review_and_rebuttal',
      decision_refs: ['mag://routes/replace-pending'],
    }),
  }), /cannot replace a pending canonical runner effect/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    state,
    event: effectEvent({
      effect_status: 'domain_result',
      stage_ref: 'proposal_authoring',
      typed_blocker_ref: 'mag://typed-blockers/wrong-carrier',
    }),
  }), /required carrier ref/);
  assert.throws(() => module.reduceStageRunCycleState({
    manifest,
    state,
    event: effectEvent({
      effect_status: 'domain_result',
      stage_ref: 'review_and_rebuttal',
      domain_result_ref: 'mag://results/wrong-stage',
    }),
  }), /must match the pending stage ref/);
});
