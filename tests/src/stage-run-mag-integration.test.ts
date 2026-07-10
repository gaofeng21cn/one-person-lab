import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { runFamilyRuntimeDomainHandlerCommand } from '../../src/modules/runway/family-runtime-domain-handler-process.ts';
import {
  buildStageRunCycleManifestFromControlPlane,
  initializeStageRunCycleState,
  reduceStageRunCycleState,
  type StageRunCycleManifest,
  type StageRunCycleState,
} from '../../src/modules/stagecraft/stage-run-orchestration.ts';
import { compileStandardAgentStageManifest } from '../../src/modules/pack/index.ts';

const expectedStageIds = [
  'call_and_candidate_intake',
  'fundability_strategy',
  'specific_aims_and_structure',
  'proposal_authoring',
  'review_and_rebuttal',
  'package_and_submit_ready',
];

function requiredMagRepo() {
  const requested = process.env.MAG_REPO_DIR?.trim();
  assert.ok(requested, 'MAG_REPO_DIR is required for the fail-closed StageRun MAG integration gate.');
  const repoDir = fs.realpathSync(requested);
  for (const relativePath of [
    'agent/stages/manifest.json',
    'contracts/domain_descriptor.json',
    'examples/nsfc_workspace_p2c_critique.json',
    'examples/nsfc_workspace_p3a_ready_for_submission.json',
    'scripts/run-python-clean.sh',
  ]) {
    assert.equal(fs.existsSync(path.join(repoDir, relativePath)), true, relativePath);
  }
  return repoDir;
}

function requiredMagHead() {
  const expected = process.env.EXPECTED_MAG_HEAD?.trim();
  assert.match(
    expected ?? '',
    /^[0-9a-f]{40}$/,
    'EXPECTED_MAG_HEAD is required for the fail-closed StageRun MAG integration gate.',
  );
  return expected!;
}

function runCommand(command: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = runFamilyRuntimeDomainHandlerCommand(command, {
    cwd,
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const diagnostic = [result.stderr, result.stdout].filter((value) => value.trim()).join('\n');
  assert.equal(result.timed_out, false, diagnostic);
  assert.equal(result.exit_code, 0, diagnostic);
  return result.stdout.trim();
}

function runMagJson(repoDir: string, args: string[], env: NodeJS.ProcessEnv) {
  const stdout = runCommand([
    path.join(repoDir, 'scripts/run-python-clean.sh'),
    '-m',
    'med_autogrant.cli',
    ...args,
    '--format',
    'json',
  ], repoDir, env);
  const payload = parseJsonText(stdout);
  assert.equal(typeof payload, 'object');
  assert.notEqual(payload, null);
  assert.equal(Array.isArray(payload), false);
  return payload as Record<string, any>;
}

function eventIdentity(manifest: StageRunCycleManifest) {
  const state = initializeStageRunCycleState(manifest);
  return {
    manifest_id: manifest.manifest_id,
    stage_run_id: state.stage_run_id,
    cycle_index: state.cycle_index,
    attempt_index: state.attempt_index,
  };
}

function routeEvent(manifest: StageRunCycleManifest, stageRef: string, decisionRef: string) {
  return {
    ...eventIdentity(manifest),
    surface_kind: 'opl_stage_run_route_decision_event' as const,
    version: 'stage-run-cycle-event.v1' as const,
    event_kind: 'route_decision' as const,
    route_decision: {
      decision: 'dispatch' as const,
      stage_ref: stageRef,
      decision_refs: [decisionRef],
    },
  };
}

function realManifest(input: {
  repoDir: string;
  runRef: string;
  inputRef: string;
}): StageRunCycleManifest {
  return buildStageRunCycleManifestFromControlPlane({
    stage_control_plane: compileStandardAgentStageManifest(input.repoDir).stage_control_plane,
    target_agent_ref: 'mag',
    descriptor_ref: pathToFileURL(path.join(input.repoDir, 'contracts/domain_descriptor.json')).href,
    run_ref: input.runRef,
    input_refs: [input.inputRef],
    max_cycles: 2,
    max_attempts_per_cycle: 2,
  });
}

test('StageRun consumes real MAG quality route, single-pass result, and typed-blocker refs', () => {
  const diagnostic = JSON.stringify({
    reason: 'git_fetch_failed',
    detail: 'Operation not permitted',
  });
  assert.throws(
    () => runCommand([
      process.execPath,
      '-e',
      `process.stdout.write(${JSON.stringify(diagnostic)}); process.exit(1);`,
    ], process.cwd(), process.env),
    /git_fetch_failed.*Operation not permitted/,
  );
  const repoDir = requiredMagRepo();
  const expectedMagHead = requiredMagHead();
  const gitHead = runCommand(['git', 'rev-parse', 'HEAD'], repoDir, process.env);
  assert.equal(gitHead, expectedMagHead, 'MAG_REPO_DIR must point at the reviewed StageRun owner candidate.');
  const env = {
    ...process.env,
    OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_CURRENTNESS_TARGET_REF: gitHead,
  };
  const manifestSource = parseJsonText(
    fs.readFileSync(path.join(repoDir, 'agent/stages/manifest.json'), 'utf8'),
  ) as Record<string, any>;
  assert.equal(manifestSource.surface_kind, 'opl_standard_agent_declarative_stage_manifest');
  assert.equal(manifestSource.version, 'opl-standard-agent-declarative-stage-manifest.v1');
  assert.equal(manifestSource.target_domain_id, 'med-autogrant');
  const stageIds = manifestSource.stages.map((stage: Record<string, any>) => stage.stage_id);
  assert.deepEqual(stageIds, expectedStageIds);

  const p3aPath = path.join(repoDir, 'examples/nsfc_workspace_p3a_ready_for_submission.json');
  const nextStep = runMagJson(repoDir, [
    'workspace',
    'next-step',
    '--input',
    p3aPath,
  ], env);
  assert.equal(nextStep.surface_kind, 'mag_stage_transition_oracle_recommendation');
  assert.equal(nextStep.current_stage, 'critique');
  assert.equal(nextStep.recommended_stage, 'critique');
  assert.equal(nextStep.quality_gate.action, 'continue');
  assert.equal(nextStep.quality_gate.recommended_stage, 'critique');
  assert.equal(nextStep.transition_intent.target_stage, 'critique');
  assert.equal(nextStep.transition_intent.return_shape, 'typed_blocker');
  assert.equal(nextStep.requires_human_confirmation, true);

  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-mag-integration-')));
  try {
    const typedBlocker = runMagJson(repoDir, [
      'authority',
      'owner-receipt-evidence',
      '--input',
      p3aPath,
      '--receipt-shape',
      'typed_blocker',
      '--stage-id',
      'review_and_rebuttal',
      '--source-ref',
      pathToFileURL(p3aPath).href,
      '--closeout-summary',
      'quality-aware-oracle-requires-critique',
      '--runtime-root',
      path.join(tempRoot, 'runtime'),
    ], env);
    assert.equal(typedBlocker.owner_receipt_evidence.receipt_shape, 'typed_blocker');
    const typedBlockerRef = pathToFileURL(
      typedBlocker.owner_receipt_evidence.receipt_instance_ref,
    ).href;
    assert.equal(fs.existsSync(typedBlocker.owner_receipt_evidence.receipt_instance_ref), true);

    const blockerManifest = realManifest({
      repoDir,
      runRef: `mag://integration/${gitHead}/quality-route`,
      inputRef: pathToFileURL(p3aPath).href,
    });
    const blockerState = reduceStageRunCycleState({
      manifest: blockerManifest,
      events: [
        routeEvent(blockerManifest, 'review_and_rebuttal', typedBlockerRef),
        {
          ...eventIdentity(blockerManifest),
          surface_kind: 'opl_stage_run_effect_observation_event',
          version: 'stage-run-cycle-event.v1',
          event_kind: 'effect_observation',
          effect: {
            effect_status: 'typed_blocker',
            stage_ref: 'review_and_rebuttal',
            typed_blocker_ref: typedBlockerRef,
            closeout_refs: [typedBlockerRef],
          },
        },
      ],
    });
    assert.equal(blockerState.status, 'blocked');
    assert.deepEqual(blockerState.typed_blocker_refs, [typedBlockerRef]);

    const revisedPath = path.join(tempRoot, 'revised.json');
    const revision = runMagJson(repoDir, [
      'pass',
      'revision',
      '--input',
      path.join(repoDir, 'examples/nsfc_workspace_p2c_critique.json'),
      '--output',
      revisedPath,
    ], env);
    assert.equal(revision.ok, true);
    assert.equal(revision.command, 'execute-revision-pass');
    assert.equal(revision.output_path, revisedPath);
    assert.equal(fs.existsSync(revisedPath), true);
    const forwardRoute = runMagJson(repoDir, [
      'workspace',
      'next-step',
      '--input',
      revisedPath,
    ], env);
    assert.equal(forwardRoute.surface_kind, 'mag_stage_transition_oracle_recommendation');
    assert.equal(forwardRoute.current_stage, 'critique');
    assert.equal(forwardRoute.recommended_stage, 'argument_building');
    assert.equal(forwardRoute.quality_gate.action, 'rollback_required');
    assert.equal(forwardRoute.transition_intent.target_stage, 'argument_building');
    assert.equal(forwardRoute.transition_intent.return_shape, 'transition_intent_ref');
    assert.equal(forwardRoute.requires_human_confirmation, false);
    const domainResultRef = pathToFileURL(revision.output_path).href;
    const resultManifest = realManifest({
      repoDir,
      runRef: `mag://integration/${gitHead}/revision-pass`,
      inputRef: pathToFileURL(path.join(repoDir, 'examples/nsfc_workspace_p2c_critique.json')).href,
    });
    const resultState: StageRunCycleState = reduceStageRunCycleState({
      manifest: resultManifest,
      events: [
        routeEvent(resultManifest, 'proposal_authoring', domainResultRef),
        {
          ...eventIdentity(resultManifest),
          surface_kind: 'opl_stage_run_effect_observation_event',
          version: 'stage-run-cycle-event.v1',
          event_kind: 'effect_observation',
          effect: {
            effect_status: 'domain_result',
            stage_ref: 'proposal_authoring',
            domain_result_ref: domainResultRef,
            output_refs: [domainResultRef],
            checkpoint_ref: domainResultRef,
            closeout_refs: [domainResultRef],
          },
        },
      ],
    });
    assert.deepEqual(resultState.domain_result_refs, [domainResultRef]);
    assert.equal(resultState.completed_step_count, 1);
    assert.equal(resultState.authority_boundary.can_spawn_process, false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
