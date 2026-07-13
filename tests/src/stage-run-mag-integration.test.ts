import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  evaluateStageRunProgress,
  rebuildStageRunReadModel,
} from '../../src/modules/stagecraft/stage-run-kernel.ts';
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
  assert.ok(requested, 'MAG_REPO_DIR is required for the currentness-bound StageRun MAG integration gate.');
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
    'EXPECTED_MAG_HEAD is required for the currentness-bound StageRun MAG integration gate.',
  );
  return expected!;
}

function runCommand(command: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const diagnostic = [result.stderr, result.stdout]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
  assert.equal(result.error?.name === 'TimeoutError', false, diagnostic);
  assert.equal(result.status, 0, diagnostic);
  return String(result.stdout ?? '').trim();
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

test('StageRun transports real MAG artifacts without becoming a semantic route oracle', () => {
  const repoDir = requiredMagRepo();
  const expectedMagHead = requiredMagHead();
  const gitHead = runCommand(['git', 'rev-parse', 'HEAD'], repoDir, process.env);
  assert.equal(gitHead, expectedMagHead, 'MAG_REPO_DIR must point at the reviewed StageRun owner candidate.');
  const env = process.env;
  const manifestSource = parseJsonText(
    fs.readFileSync(path.join(repoDir, 'agent/stages/manifest.json'), 'utf8'),
  ) as Record<string, any>;
  assert.equal(manifestSource.surface_kind, 'opl_standard_agent_declarative_stage_manifest');
  assert.equal(manifestSource.version, 'opl-standard-agent-declarative-stage-manifest.v1');
  assert.equal(manifestSource.target_domain_id, 'med-autogrant');
  assert.deepEqual(
    manifestSource.stages.map((stage: Record<string, any>) => stage.stage_id),
    expectedStageIds,
  );
  assert.deepEqual(
    compileStandardAgentStageManifest(repoDir).stage_control_plane.stages.map((stage) => stage.stage_id),
    expectedStageIds,
  );

  const p3aPath = path.join(repoDir, 'examples/nsfc_workspace_p3a_ready_for_submission.json');
  const nextStep = runMagJson(repoDir, ['workspace', 'next-step', '--input', p3aPath], env);
  assert.equal(nextStep.surface_kind, 'mag_ai_route_context');
  assert.equal(nextStep.semantic_route_owner, 'codex_cli');
  assert.equal(nextStep.ai_route_policy.program_recommendation_can_block_or_select_route, false);
  assert.equal(nextStep.authority_boundary.framework_can_accept_reject_or_override_codex_route, false);

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
      'domain-owned-hard-stop-shape',
      '--runtime-root',
      path.join(tempRoot, 'runtime'),
    ], env);
    assert.equal(typedBlocker.owner_receipt_evidence.receipt_shape, 'typed_blocker');
    assert.equal(fs.existsSync(typedBlocker.owner_receipt_evidence.receipt_instance_ref), true);

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
    assert.equal(fs.existsSync(revisedPath), true);

    const routeContext = runMagJson(repoDir, ['workspace', 'next-step', '--input', revisedPath], env);
    assert.equal(routeContext.surface_kind, 'mag_ai_route_context');
    assert.equal(routeContext.semantic_route_owner, 'codex_cli');
    assert.equal(routeContext.ai_route_policy.program_recommendation_can_block_or_select_route, false);
    assert.equal(routeContext.authority_boundary.framework_can_accept_reject_or_override_codex_route, false);

    const stageRunId = `mag-stage-run-${gitHead}`;
    const artifactRef = pathToFileURL(revisedPath).href;
    const progress = evaluateStageRunProgress({
      phase: 'closeout',
      stage_run_id: stageRunId,
      domain_id: 'mag',
      stage_id: 'proposal_authoring',
      generation: 1,
      current_pointer: { stage_run_id: stageRunId, generation: 1, current: true },
      manifest_valid: false,
      required_role_artifacts: ['proposal_draft'],
      produced_role_artifacts: [],
      consumable_artifact_refs: [artifactRef],
      owner_receipt_refs: [],
      typed_blocker_refs: [],
      quality_gate_receipt_refs: [],
    });
    assert.equal(progress.status, 'progress_ready_with_quality_debt');
    assert.equal(progress.transition_outcome, 'completed_with_quality_debt');
    assert.deepEqual(progress.closeout_hard_stop_reasons, []);

    const readModel = rebuildStageRunReadModel([
      {
        surface_kind: 'opl_stage_run_event',
        event_id: `${stageRunId}:declared`,
        event_kind: 'stage_run_declared',
        stage_run_id: stageRunId,
        generation: 1,
        observed_at: '2026-07-12T00:00:00.000Z',
      },
      {
        surface_kind: 'opl_stage_run_event',
        event_id: `${stageRunId}:artifact`,
        event_kind: 'artifact_ref_observed',
        stage_run_id: stageRunId,
        generation: 1,
        observed_at: '2026-07-12T00:00:01.000Z',
        artifact_ref: artifactRef,
      },
    ]);
    assert.deepEqual(readModel.stage_runs[0].consumed_refs, [artifactRef]);
    assert.equal(readModel.authority_boundary.read_model_can_be_truth_source, false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
