import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  installRuntimePackageFixture,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';

test('runtime action execute blocks domain dispatch evidence payloads bound to a different attempt identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-dispatch-conflict-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'publication_aftercare/reviewer-refresh',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        surface_kind: 'opl_provider_hosted_task_workspace_locator',
        task_kind: 'publication_aftercare/reviewer-refresh',
        study_id: '002-dm-china-us-mortality-attribution',
        profile: '/tmp/dm-cvd/profile.toml',
        dispatch_ref: 'mas-domain-dispatch:dm-cvd:reviewer-refresh',
      }),
      '--task',
      'task-domain-dispatch-identity-conflict',
      '--source-fingerprint',
      '95d9b5310c9c7a8d',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:reviewer-refresh-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const recordActionId = `domain_dispatch:medautoscience:${attemptId}:record`;
    const blockedExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        study_id: '001-lineage-pfs',
        task_kind: 'publication_aftercare/reviewer-refresh',
        source_fingerprint: 'a6ff1097861ed2ae',
        typed_blocker_refs: ['mas://typed-blockers/nfpitnet-001/reviewer-refresh-pending'],
        owner_chain_refs: ['mas://owner-chain/nfpitnet-001/reviewer-refresh.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(blockedExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      blockedExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_receipt_conflict',
    );
    assert.equal(blockedExecution.payload.error.details.preflight.status, 'blocked');
    assert.deepEqual(
      blockedExecution.payload.error.details.preflight.identity_conflicts.map((
        conflict: { field: string },
      ) => conflict.field),
      ['study_id', 'source_fingerprint'],
    );

    const afterBlockedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const attempt = afterBlockedDrilldown.domain_dispatch_evidence.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attemptId,
    );
    const recordRoute = afterBlockedDrilldown.operator_action_routing_refs.refs.find(
      (entry: { action_id: string }) => entry.action_id === recordActionId,
    );
    assert.equal(attempt.dispatch_evidence_receipt_status, 'missing');
    assert.deepEqual(attempt.dispatch_evidence_receipt_refs, []);
    assert.equal(recordRoute.transport_identity_observation.missing_identity_fields_block_progress, false);

    const matchedExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        study_id: '002-dm-china-us-mortality-attribution',
        task_kind: 'publication_aftercare/reviewer-refresh',
        source_fingerprint: '95d9b5310c9c7a8d',
        typed_blocker_refs: ['mas://typed-blockers/dm-cvd/reviewer-refresh-pending'],
        owner_chain_refs: ['mas://owner-chain/dm-cvd/reviewer-refresh.json'],
        transport_identity: recordRoute.payload_template.transport_identity,
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(
      matchedExecution.execution.result.domain_dispatch_evidence_payload_preflight.status,
      'ready_to_record',
    );
    assert.equal(
      matchedExecution.execution.result.domain_dispatch_evidence_payload_preflight.identity_binding.status,
      'matched',
    );
    assert.equal(matchedExecution.execution.result.external_evidence_apply.status, 'recorded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute blocks stale local typed blocker refs bound to another StageRun identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-local-blocker-conflict-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-local-blocker-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const blockerRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json';
    const blockerPath = path.join(workspaceRoot, blockerRef);
    fs.mkdirSync(path.dirname(blockerPath), { recursive: true });
    fs.writeFileSync(
      blockerPath,
      `${JSON.stringify({
        surface_kind: 'mas_domain_owner_typed_blocker',
        study_id: '002-dm-china-us-mortality-attribution',
        stage_id: '08-publication_package_handoff',
        stage_run_id: 'stage-run::002-dm-china-us-mortality-attribution::08-publication_package_handoff',
        source_fingerprint: 'default_executor_source_stale_handoff',
        idempotency_key: 'idem_stale_publication_handoff',
        provider_attempt_ref: 'temporal://attempt/sat_stale_publication_handoff',
      }, null, 2)}\n`,
      'utf8',
    );

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        surface_kind: 'opl_provider_hosted_task_workspace_locator',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        workspace_root: workspaceRoot,
        profile: '/tmp/dm-cvd/profile.toml',
        dispatch_ref: 'mas-domain-dispatch:dm-cvd:complete-medical-paper-readiness',
      }),
      '--task',
      'task-domain-dispatch-local-typed-blocker-conflict',
      '--source-fingerprint',
      'default_executor_source_current_dispatch',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:default-executor-dispatch-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const blockedExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      `domain_dispatch:medautoscience:${attemptId}:record`,
      '--payload',
      JSON.stringify({
        typed_blocker_refs: [blockerRef],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(blockedExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      blockedExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_receipt_conflict',
    );
    const preflight = blockedExecution.payload.error.details.preflight;
    assert.equal(preflight.status, 'blocked');
    assert.equal(preflight.local_owner_answer_ref_identity.inspected_ref_count, 1);
    assert.equal(preflight.local_owner_answer_ref_identity.inspected_refs[0].ref, blockerRef);
    assert.equal(
      preflight.local_owner_answer_ref_identity.inspected_refs[0].identity.stage_id,
      '08-publication_package_handoff',
    );
    assert.equal(
      preflight.local_owner_answer_ref_identity.inspected_refs[0].identity.source_fingerprint,
      'default_executor_source_stale_handoff',
    );
    const conflictFields = preflight.identity_conflicts.map((conflict: { field: string }) => conflict.field);
    assert.equal(conflictFields.includes('stage_id'), true);
    assert.equal(conflictFields.includes('source_fingerprint'), true);
    assert.equal(preflight.can_record_refs_only_receipt, false);

    const afterBlockedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const attempt = afterBlockedDrilldown.domain_dispatch_evidence.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attemptId,
    );
    assert.equal(attempt.dispatch_evidence_receipt_status, 'missing');
    assert.deepEqual(attempt.dispatch_evidence_receipt_refs, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
