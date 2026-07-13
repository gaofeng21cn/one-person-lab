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

test('runtime action records readable domain progress without a launch authorization control plane', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-domain-progress-'));
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
      'write',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","dispatch_ref":"mas-domain-dispatch:dm-cvd:domain-progress"}',
      '--task',
      'task-domain-progress',
      '--source-fingerprint',
      'sha256:domain-progress',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attempt = created.family_runtime_stage_attempt.attempt;
    const attemptId = attempt.stage_attempt_id;
    assert.equal(attempt.status, 'queued');
    assert.equal(attempt.blocked_reason, null);

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['artifact:write-partial-draft'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'quality_debt_open',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const recordActionId = `domain_dispatch:medautoscience:${attemptId}:record`;
    const recordRoute = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === recordActionId,
    );

    assert.ok(recordRoute);
    assert.equal(recordRoute.action_kind, 'domain_dispatch_evidence_receipt_record');
    assert.equal(recordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(recordRoute.can_close_without_domain_or_app_payload, false);
    assert.equal(recordRoute.creates_domain_action, false);
    assert.equal(recordRoute.creates_owner_receipt, false);
    assert.equal(recordRoute.transport_identity_observation.missing_identity_fields_block_progress, false);
    assert.equal(recordRoute.payload_workorder.surface_kind, 'opl_domain_dispatch_progress_evidence_payload_workorder');
    assert.equal(
      recordRoute.payload_workorder.accepted_payload_paths.progress_refs_path.next_declared_stage_may_start,
      true,
    );
    assert.equal(
      recordRoute.payload_workorder.authority_boundary.can_block_next_stage_for_missing_receipt_format,
      false,
    );
    assert.equal(Object.hasOwn(recordRoute, 'required_closeout_binding'), false);
    assert.equal(Object.hasOwn(recordRoute.payload_template, 'owner_delta_result'), false);
    assert.equal(recordRoute.payload_template.transport_identity.surface_kind, 'opl_stage_run_transport_identity');

    const emptyPayload = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify(recordRoute.payload_template),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(emptyPayload.payload.error.code, 'cli_usage_error');
    assert.equal(
      emptyPayload.payload.error.details.error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );

    const progressPayload = {
      ...recordRoute.payload_template,
      artifact_refs: ['mas://artifacts/manuscript/partial-draft.md'],
    };
    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--dry-run',
      '--payload',
      JSON.stringify(progressPayload),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(
      dryRun.execution.result.domain_dispatch_evidence_payload_preflight.selected_payload_path,
      'progress_refs_path',
    );
    assert.equal(
      dryRun.execution.result.domain_dispatch_evidence_payload_preflight
        .accepted_payload_paths.progress_refs_path.next_declared_stage_may_start,
      true,
    );
    assert.equal(
      dryRun.execution.result.domain_dispatch_evidence_payload_preflight
        .accepted_payload_paths.progress_refs_path.records_quality_debt,
      true,
    );

    const recorded = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify(progressPayload),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;
    assert.equal(recorded.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recorded.authority_boundary.can_write_domain_truth, false);

    const recordedProjection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const verifyRoute = recordedProjection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === `domain_dispatch:medautoscience:${attemptId}:verify`,
    );
    assert.ok(verifyRoute);
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.transport_identity_observation, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
