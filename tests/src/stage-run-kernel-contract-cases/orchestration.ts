import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

test('StageRun orchestration is release-bound, target-scoped, and generated from a control plane', async () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const packageJson = readJson<Record<string, any>>('package.json');
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const common = {
    descriptor_ref: 'mag://agent/descriptor',
    stage_ref: 'review_and_rebuttal',
    run_ref: 'mag://authoring-run/proposal-1',
    cycle_index: 2,
    attempt_index: 1,
  };
  const mag = module.buildStageRunCycleIdentity({ ...common, target_agent_ref: 'mag' });
  const rca = module.buildStageRunCycleIdentity({ ...common, target_agent_ref: 'rca' });
  const manifest = module.buildStageRunCycleManifestFromControlPlane({
    stage_control_plane: magControlPlane(),
    target_agent_ref: 'mag',
    descriptor_ref: common.descriptor_ref,
    run_ref: common.run_ref,
    input_refs: ['mag://workspace/proposal-1'],
    handler_id: 'mag-single-pass',
    max_cycles: magStageIds.length,
    max_attempts_per_cycle: 2,
    no_progress_limit: 2,
  });

  assert.equal(
    packageJson.exports['./stage-run-orchestration'],
    './dist/modules/stagecraft/stage-run-orchestration.js',
  );
  assert.equal(contract.cycle_orchestration.module_ref, orchestrationModulePath);
  assert.equal(contract.cycle_orchestration.second_scheduler_created, false);
  assert.equal(contract.cycle_orchestration.second_schema_created, false);
  assert.equal(manifest.target_agent_ref, 'mag');
  assert.match(manifest.manifest_id, /^stage_run_manifest_/);
  assert.equal(magControlPlane().target_domain_id, 'med-autogrant');
  assert.deepEqual(manifest.stage_bindings.map((binding: Record<string, any>) => binding.stage_ref), magStageIds);
  assert.ok(manifest.stage_bindings.every((binding: Record<string, any>) => binding.handler_id === 'mag-single-pass'));
  assert.notEqual(mag.stage_run_id, rca.stage_run_id);
  assert.notEqual(mag.stage_step_id, rca.stage_step_id);
  assert.throws(() => module.buildStageRunCycleManifestFromControlPlane({
    ...manifest,
    stage_control_plane: {
      plane_id: 'shallow-copy',
      target_domain_id: 'med-autogrant',
      stages: [{ stage_id: 'proposal_authoring' }],
    },
    handler_id: 'mag-single-pass',
  }), /rejected an invalid generated control plane/);
});

test('StageRun orchestration drives a MAG-shaped declarative fixture from refs only', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mag-shaped-stage-run-'));
  const routeStages = ['proposal_authoring', 'review_and_rebuttal', 'proposal_authoring', 'review_and_rebuttal'];
  const observedStages: string[] = [];
  try {
    const manifest = module.buildStageRunCycleManifestFromControlPlane({
      stage_control_plane: magControlPlane(),
      target_agent_ref: 'mag',
      descriptor_ref: 'mag://agent/descriptor',
      run_ref: 'mag://authoring-run/proposal-1',
      input_refs: ['mag://workspace/proposal-1'],
      handler_id: 'mag-single-pass',
      max_cycles: routeStages.length,
      max_attempts_per_cycle: 2,
      no_progress_limit: 2,
    });
    const result = await module.runStageRunCycle({
      manifest,
      output_root: outputRoot,
      handlers: [module.bindStageRunSinglePassHandler({
        handler_id: 'mag-single-pass',
        run: async (context: Record<string, any>) => {
          observedStages.push(context.identity.stage_ref);
          return {
            status: 'completed',
            output_refs: [`mag://workspace/${context.identity.stage_ref}/cycle-${context.identity.cycle_index}`],
            checkpoint_ref: `mag://checkpoints/${context.identity.stage_ref}/cycle-${context.identity.cycle_index}`,
            closeout_refs: [`mag://stage-closeouts/${context.identity.stage_step_id}`],
          };
        },
      })],
      route_oracle: async (context: Record<string, any>) => {
        const nextStage = routeStages[context.state.completed_step_count];
        return nextStage
          ? { decision: 'dispatch', stage_ref: nextStage, decision_refs: [`mag://routes/${nextStage}`] }
          : {
              decision: 'accepted',
              accepted_checkpoint_ref: context.state.checkpoint_refs.at(-1),
              decision_refs: ['mag://routes/ready-for-submission'],
            };
      },
    });

    assert.deepEqual(observedStages, routeStages);
    assert.equal(result.state.status, 'checkpoint_accepted');
    assert.equal(result.state.completed_step_count, routeStages.length);
    assert.equal(result.state.accepted_checkpoint_ref, result.state.checkpoint_refs.at(-1));
    assert.equal(result.state.closeout_refs.length, routeStages.length);
    assert.deepEqual(result.closeout.closeout_refs, result.state.closeout_refs);
    assert.equal(result.closeout.authority_boundary.can_write_domain_truth, false);
    assert.equal(result.closeout.process_or_handler_completion_is_domain_result, false);
    assert.equal('domain_result' in result.closeout, false);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('StageRun orchestration preserves checkpoint inputs and merges owner blocker refs', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-ref-continuity-'));
  const baseManifest = module.buildStageRunCycleManifestFromControlPlane({
    stage_control_plane: magControlPlane(),
    target_agent_ref: 'mag',
    descriptor_ref: 'mag://agent/descriptor',
    run_ref: 'mag://authoring-run/ref-continuity',
    input_refs: ['mag://workspace/input'],
    handler_id: 'mag-pass',
    max_cycles: 2,
    max_attempts_per_cycle: 2,
    no_progress_limit: 2,
  });
  try {
    const observedInputs: string[][] = [];
    const continuity = await module.runStageRunCycle({
      manifest: baseManifest,
      output_root: path.join(outputRoot, 'continuity'),
      handlers: [module.bindStageRunSinglePassHandler({
        handler_id: 'mag-pass',
        run: async (context: Record<string, any>) => {
          observedInputs.push(context.input_refs);
          const cycle = context.identity.cycle_index;
          return {
            status: 'completed',
            output_refs: cycle === 1 ? [] : ['mag://workspace/output'],
            checkpoint_ref: `mag://checkpoints/cycle-${cycle}`,
            closeout_refs: [`mag://closeouts/cycle-${cycle}`],
          };
        },
      })],
      route_oracle: async (context: Record<string, any>) => context.state.completed_step_count < 2
        ? {
            decision: 'dispatch',
            stage_ref: 'proposal_authoring',
            decision_refs: ['mag://routes/proposal-authoring'],
          }
        : {
            decision: 'accepted',
            accepted_checkpoint_ref: context.state.checkpoint_refs.at(-1),
            decision_refs: ['mag://routes/accepted'],
          },
    });
    assert.deepEqual(observedInputs[0], ['mag://workspace/input']);
    assert.deepEqual(observedInputs[1], ['mag://workspace/input', 'mag://checkpoints/cycle-1']);
    assert.deepEqual(continuity.state.latest_output_refs, ['mag://workspace/output']);

    let routeCount = 0;
    const blocked = await module.runStageRunCycle({
      manifest: module.buildStageRunCycleManifestFromControlPlane({
        stage_control_plane: magControlPlane(),
        target_agent_ref: 'mag',
        descriptor_ref: 'mag://agent/descriptor',
        run_ref: 'mag://authoring-run/blocked',
        input_refs: ['mag://workspace/input'],
        handler_id: 'mag-pass',
        max_cycles: 2,
        max_attempts_per_cycle: 2,
        no_progress_limit: 2,
      }),
      output_root: path.join(outputRoot, 'blocked'),
      handlers: [module.bindStageRunSinglePassHandler({
        handler_id: 'mag-pass',
        run: async () => ({
          status: 'failed',
          output_refs: [],
          closeout_refs: ['mag://closeouts/failed-pass'],
          runtime_blocker_refs: ['runtime://handler-failure'],
        }),
      })],
      route_oracle: async () => routeCount++ === 0
        ? {
            decision: 'dispatch',
            stage_ref: 'proposal_authoring',
            decision_refs: ['mag://routes/dispatch'],
          }
        : {
            decision: 'blocked',
            decision_refs: ['mag://routes/blocked'],
            typed_blocker_refs: ['mag://typed-blockers/owner'],
            human_gate_refs: ['mag://human-gates/review'],
            runtime_blocker_refs: ['runtime://route-blocked'],
          },
    });
    assert.deepEqual(blocked.state.runtime_blocker_refs, [
      'runtime://handler-failure',
      'runtime://route-blocked',
    ]);
    assert.deepEqual(blocked.state.closeout_refs, ['mag://closeouts/failed-pass']);
    assert.deepEqual(blocked.state.typed_blocker_refs, ['mag://typed-blockers/owner']);
    assert.deepEqual(blocked.state.human_gate_refs, ['mag://human-gates/review']);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('StageRun orchestration enforces rollback, exhaustion, and manifest shape', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-terminal-paths-'));
  const manifest = module.buildStageRunCycleManifestFromControlPlane({
    stage_control_plane: magControlPlane(),
    target_agent_ref: 'mag',
    descriptor_ref: 'mag://agent/descriptor',
    run_ref: 'mag://authoring-run/terminal-paths',
    input_refs: ['mag://workspace/input'],
    handler_id: 'mag-pass',
    max_cycles: 2,
    max_attempts_per_cycle: 2,
    no_progress_limit: 2,
  });
  try {
    const handler = module.bindStageRunSinglePassHandler({
      handler_id: 'mag-pass',
      run: async (context: Record<string, any>) => ({
        status: 'completed',
        output_refs: [`mag://workspace/cycle-${context.identity.cycle_index}`],
        checkpoint_ref: `mag://checkpoints/cycle-${context.identity.cycle_index}`,
        closeout_refs: [],
      }),
    });
    const rollback = await module.runStageRunCycle({
      manifest,
      output_root: path.join(outputRoot, 'rollback'),
      handlers: [handler],
      route_oracle: async (context: Record<string, any>) => context.state.completed_step_count === 0
        ? { decision: 'dispatch', stage_ref: 'proposal_authoring', decision_refs: ['mag://routes/rebuild'] }
        : {
            decision: 'rollback',
            rollback_to_checkpoint_ref: context.state.checkpoint_refs[0],
            decision_refs: ['mag://routes/rollback'],
          },
    });
    assert.equal(rollback.state.status, 'rollback_required');
    assert.equal(rollback.state.rollback_to_checkpoint_ref, rollback.state.checkpoint_refs[0]);

    const exhausted = await module.runStageRunCycle({
      manifest: module.buildStageRunCycleManifestFromControlPlane({
        stage_control_plane: magControlPlane(),
        target_agent_ref: 'mag',
        descriptor_ref: 'mag://agent/descriptor',
        run_ref: 'mag://authoring-run/no-progress',
        input_refs: ['mag://workspace/input'],
        handler_id: 'mag-pass',
        max_cycles: 2,
        max_attempts_per_cycle: 2,
        no_progress_limit: 2,
      }),
      output_root: path.join(outputRoot, 'no-progress'),
      handlers: [module.bindStageRunSinglePassHandler({
        handler_id: 'mag-pass',
        run: async () => ({ status: 'completed', output_refs: [], closeout_refs: [] }),
      })],
      route_oracle: async () => ({
        decision: 'dispatch',
        stage_ref: 'proposal_authoring',
        decision_refs: ['mag://routes/retry'],
      }),
    });
    assert.equal(exhausted.state.status, 'exhausted');
    assert.equal(exhausted.state.termination_reason, 'no_progress_budget_exhausted');
    assert.equal(exhausted.state.domain_typed_blocker_created, false);

    await assert.rejects(module.runStageRunCycle({
      manifest: { ...manifest, stage_bindings: null },
      output_root: path.join(outputRoot, 'invalid'),
      handlers: [],
      route_oracle: async () => ({ decision: 'blocked', decision_refs: ['mag://routes/invalid'] }),
    }), /Invalid StageRun cycle manifest envelope/);
    await assert.rejects(module.runStageRunCycle({
      manifest: { ...manifest, artifact_body: { forbidden: true } },
      output_root: path.join(outputRoot, 'body-invalid'),
      handlers: [],
      route_oracle: async () => ({ decision: 'blocked', decision_refs: ['mag://routes/invalid'] }),
    }), /refs-only contract fields/);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('StageRun runner replay binds env values without persisting env or domain stdout', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, orchestrationModulePath)).href);
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-dispatch-'));
  try {
    const identity = module.buildStageRunCycleIdentity({
      target_agent_ref: 'mag',
      descriptor_ref: 'mag://agent/descriptor',
      stage_ref: 'review_and_rebuttal',
      run_ref: 'mag://authoring-run/dispatch',
      cycle_index: 1,
      attempt_index: 1,
    });
    const layout = module.prepareStageRunOutputLayout({ output_root: outputRoot, identity });
    const input = {
      identity,
      output_layout: layout,
      executor: { kind: 'domain_cli', executor_ref: 'node://current-process' },
      argv: [process.execPath, '-e', 'process.stdout.write("secret-domain-body")'],
      env: { MAG_TEST_SENTINEL: 'secret-one' },
      input_refs: ['mag://workspace/input'],
      declared_output_refs: ['mag://workspace/output'],
    };
    const first = module.executeStageRunRunnerDispatch(input);
    const replay = module.executeStageRunRunnerDispatch(input);
    const persisted = [layout.output_manifest_path, layout.runner_receipt_path]
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');

    assert.equal(first.process_status, 'process_completed');
    assert.equal(first.exit_code, 0);
    assert.equal(first.idempotent_replay, false);
    assert.equal(replay.idempotent_replay, true);
    assert.equal(first.dispatch_id, replay.dispatch_id);
    assert.deepEqual(first.env_keys, ['MAG_TEST_SENTINEL']);
    assert.match(first.env_fingerprint, /^env_/);
    assert.equal(first.process_log_policy, 'metadata_only');
    assert.equal(first.timeout_ms, 10 * 60 * 1000);
    assert.equal(first.stdout_byte_count, Buffer.byteLength('secret-domain-body'));
    assert.equal(fs.existsSync(path.join(layout.attempt_directory, 'stdout.log')), false);
    assert.equal(fs.existsSync(path.join(layout.attempt_directory, 'stderr.log')), false);
    assert.equal(persisted.includes('secret-domain-body'), false);
    assert.equal(persisted.includes('secret-one'), false);
    assert.equal(first.owner_receipt_ref, null);
    assert.equal(first.typed_blocker_ref, null);
    assert.equal(first.domain_result_ref, null);

    assert.throws(() => module.executeStageRunRunnerDispatch({
      ...input,
      env: { MAG_TEST_SENTINEL: 'secret-two' },
    }), /already bound to another runner dispatch/);

    const storedReceipt = readJson<Record<string, any>>(
      path.relative(repoRoot, layout.runner_receipt_path),
    );
    fs.writeFileSync(layout.runner_receipt_path, `${JSON.stringify({
      ...storedReceipt,
      version: 'corrupt-version',
    })}\n`, 'utf8');
    assert.throws(
      () => module.executeStageRunRunnerDispatch(input),
      /stored StageRun runner receipt has an invalid envelope/i,
    );
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
