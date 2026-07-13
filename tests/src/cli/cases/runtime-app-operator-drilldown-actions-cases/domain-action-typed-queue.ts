import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  installRuntimePackageFixture,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';

test('runtime action execute blocks domain actions instead of creating a local runtime queue task', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts"}',
      '--task',
      'task-action-execute',
      '--source-fingerprint',
      'sha256:action-execute-domain',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"repair_command":"medautosci domain-handler dispatch --task <task.json> --format json"}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `action:${attemptId}:domain-repair-command:0`,
      '--payload',
      '{"reason":"operator_selected"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.surface_kind, 'opl_runtime_operator_action_execution');
    assert.equal(execution.execution.execution_kind, 'domain_owner_handoff_required');
    assert.equal(execution.execution.execution_status, 'blocked_owner_handoff_required');
    assert.equal(execution.execution.approval_policy, 'domain_owner_route_required_no_runtime_queue');
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
    assert.equal(execution.route.execution_policy, 'opl_safe_action_shell');
    assert.equal(execution.route.execution_surface, 'opl runtime action execute');
    assert.equal(execution.execution.result.runtime_queue_mutation_performed, false);
    assert.equal(execution.execution.result.authority_boundary.can_enqueue_family_runtime_task, false);
    assert.equal(
      execution.execution.result.handoff_payload.command_or_surface_ref,
      'medautosci domain-handler dispatch --task <task.json> --format json',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
