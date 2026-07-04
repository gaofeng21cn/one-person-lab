import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../../helpers.ts';
import { STANDARD_PROGRESS_DELTA_POLICY, STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from '../../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';
import { createDispatchFixture, familyRuntimeEnv } from './helpers.ts';

test('family-runtime stage attempt ledger keeps provider dispatch separate until typed closeout', () => { // reuse-first: allow existing stage attempt ledger behavior test name.
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const stageId = 'direction_and_route_selection';
  const masManifest = {
    ...fixtures.medautoscience,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'med_autoscience_stage_control_plane',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: [{
        stage_id: stageId,
        stage_kind: 'planning',
        title: 'Direction and route selection',
        summary: 'Select the MAS route under domain authority.',
        goal: 'Prepare an admitted MAS direction and route selection attempt.',
        owner: 'med-autoscience',
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
        stage_contract: {
          requires: ['study_task_ready'],
          ensures: ['route_selected'],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: [],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope/direction_and_route_selection', role: 'launch_source_scope' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      }],
      notes: [],
    },
  };
  const dispatch = createDispatchFixture(`
cat <<'JSON'
{"accepted":true,"closeout_refs":["studies/DM002/stage_closeout/latest.json"]}
JSON
`);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], env);

    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      `stage/${stageId}`,
      '--payload',
      '{"study_id":"DM002"}',
      '--dedupe-key',
      `mas:DM002:stage:${stageId}`,
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      stageId,
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:direction-and-route-selection',
      '--task',
      taskId,
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const inspected = runCli([
      'family-runtime',
      'attempt',
      'inspect',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(tick.family_runtime_tick.dispatches[0].stage_attempts[0].status, 'checkpointed');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.status, 'checkpointed');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.attempt_count, 1);
    assert.deepEqual(inspected.family_runtime_stage_attempt.attempt.closeout_refs, [
      'studies/DM002/stage_closeout/latest.json',
    ]);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_receipt_status, 'domain_handler_receipt_ref_only');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.provider_run.provider_status, 'checkpointed');
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.activity_events.at(-1).activity_status,
      'checkpointed',
    );
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(task.family_runtime_task.stage_attempts[0].stage_id, stageId);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
