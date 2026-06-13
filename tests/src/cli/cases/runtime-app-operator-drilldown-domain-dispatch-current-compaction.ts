import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('domain dispatch evidence defaults to latest actionable attempt while preserving superseded provenance', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-compaction-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspaceLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    workspace_root: '/tmp/dm-cvd',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'quality_repair_batch_writer_handoff',
    dispatch_ref:
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    next_executable_owner: 'write',
    domain_truth_owner: 'med-autoscience',
    opl_writes_domain_truth: false,
    opl_writes_publication_quality: false,
    opl_writes_artifact_gate: false,
    opl_writes_current_package: false,
  };
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  const closeoutPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:writer-handoff'],
    next_owner: 'write',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'bounded_repair',
      next_owner: 'write',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };

  try {
    const first = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--task',
      'task-repeated-domain-dispatch',
      '--source-fingerprint',
      'truth-snapshot::first',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      first.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const second = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--task',
      'task-repeated-domain-dispatch',
      '--source-fingerprint',
      'truth-snapshot::second',
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      second.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const attempts = drilldown.domain_dispatch_evidence.attempts.filter(
      (attempt: { stage_id: string; workspace_locator: { dispatch_ref?: string } }) =>
        attempt.stage_id === 'domain_owner/default-executor-dispatch'
        && attempt.workspace_locator.dispatch_ref === workspaceLocator.dispatch_ref,
    );
    assert.equal(attempts.length, 2);
    const latest = [...attempts].sort((left: {
      updated_at?: string;
      created_at?: string;
      stage_attempt_id: string;
    }, right: {
      updated_at?: string;
      created_at?: string;
      stage_attempt_id: string;
    }) =>
      Date.parse(right.updated_at ?? '') - Date.parse(left.updated_at ?? '')
      || Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? '')
      || right.stage_attempt_id.localeCompare(left.stage_attempt_id)
    )[0];
    const superseded = attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id !== latest.stage_attempt_id,
    );
    assert.equal(latest.default_actionable, true);
    assert.equal(latest.default_actionability_status, 'current');
    assert.equal(superseded.default_actionable, false);
    assert.equal(superseded.default_actionability_status, 'superseded');
    assert.equal(superseded.superseded_by_stage_attempt_id, latest.stage_attempt_id);
    assert.equal(
      superseded.superseded_reason,
      'newer_stage_attempt_with_same_domain_dispatch_identity',
    );
    assert.equal(drilldown.domain_dispatch_evidence.summary.attempt_count, 2);
    assert.equal(drilldown.domain_dispatch_evidence.summary.dispatch_identity_group_count, 1);
    assert.equal(
      drilldown.domain_dispatch_evidence.summary.current_default_actionable_attempt_count,
      1,
    );
    assert.equal(drilldown.domain_dispatch_evidence.summary.superseded_attempt_count, 1);

    const recordRoutes = drilldown.operator_action_routing_refs.refs.filter(
      (route: { action_kind: string }) =>
        route.action_kind === 'domain_dispatch_evidence_receipt_record',
    );
    assert.equal(recordRoutes.length, 1);
    assert.equal(recordRoutes[0].stage_attempt_id, latest.stage_attempt_id);
    assert.equal(recordRoutes[0].default_actionability_status, 'current');
    assert.equal(recordRoutes[0].required_closeout_binding.closeout_binding_ready, true);
    assert.equal(
      recordRoutes.some((route: { stage_attempt_id: string }) =>
        route.stage_attempt_id === superseded.stage_attempt_id
      ),
      false,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(drilldown.summary.evidence_envelope_open_count, 1);
    assert.equal(drilldown.summary.evidence_envelope_superseded_count, 1);

    const latestEnvelope = drilldown.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${latest.stage_attempt_id}`,
    );
    const supersededEnvelope = drilldown.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${superseded.stage_attempt_id}`,
    );
    assert.equal(latestEnvelope.status, 'open');
    assert.equal(latestEnvelope.next_route, recordRoutes[0].ref);
    assert.equal(supersededEnvelope.status, 'superseded');
    assert.equal(supersededEnvelope.next_route, null);
    assert.equal(supersededEnvelope.claim_allowed.owner_receipt_observed, false);
    assert.equal(supersededEnvelope.claim_allowed.domain_ready, false);
    assert.equal(supersededEnvelope.superseded_by_stage_attempt_id, latest.stage_attempt_id);

    const staleRecordExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      `domain_dispatch:medautoscience:${superseded.stage_attempt_id}:record`,
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['mas://typed-blockers/dm002/superseded-attempt'],
      }),
    ], env);
    assert.equal(staleRecordExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      staleRecordExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_action_route_superseded',
    );
    assert.equal(
      staleRecordExecution.payload.error.details.stage_attempt_id,
      superseded.stage_attempt_id,
    );
    assert.equal(
      staleRecordExecution.payload.error.details.superseded_by_stage_attempt_id,
      latest.stage_attempt_id,
    );
    assert.equal(staleRecordExecution.payload.error.details.next_safe_action, null);
    assert.equal(staleRecordExecution.payload.error.details.can_claim_domain_ready, false);
    assert.equal(staleRecordExecution.payload.error.details.can_claim_production_ready, false);

    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], env).family_runtime_evidence_worklist;
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 1);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 1);
    assert.equal(
      worklist.domain_dispatch_evidence_workorder_packet.workorders[0].stage_attempt_id,
      latest.stage_attempt_id,
    );
    assert.equal(worklist.evidence_envelope.summary.open_envelope_count, 1);
    assert.equal(worklist.evidence_envelope.summary.superseded_envelope_count, 1);

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `domain_dispatch:medautoscience:${latest.stage_attempt_id}:record`,
      '--payload',
      JSON.stringify({
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'truth-snapshot::second',
        typed_blocker_refs: ['mas://typed-blockers/dm002/default-executor-owner-receipt-pending'],
        no_regression_refs: ['mas://no-regression/dm002/default-executor-owner-receipt-pending'],
        owner_delta_result: {
          closeout_binding: recordRoutes[0].required_closeout_binding.closeout_binding,
        },
      }),
    ], env).runtime_operator_action_execution;
    assert.equal(
      recordExecution.execution.result.domain_dispatch_evidence_payload_preflight.identity_binding.status,
      'matched',
    );
    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `domain_dispatch:medautoscience:${latest.stage_attempt_id}:verify`,
    ], env).runtime_operator_action_execution;
    assert.equal(verifyExecution.execution.execution_status, 'executed');

    const verifiedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const verifiedAttempts = verifiedDrilldown.domain_dispatch_evidence.attempts.filter(
      (attempt: { stage_id: string; workspace_locator: { dispatch_ref?: string } }) =>
        attempt.stage_id === 'domain_owner/default-executor-dispatch'
        && attempt.workspace_locator.dispatch_ref === workspaceLocator.dispatch_ref,
    );
    const verifiedLatest = verifiedAttempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === latest.stage_attempt_id,
    );
    const verifiedSuperseded = verifiedAttempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === superseded.stage_attempt_id,
    );
    assert.equal(verifiedLatest.dispatch_evidence_receipt_status, 'verified');
    assert.equal(verifiedLatest.evidence_status, 'typed_blocker_observed');
    assert.equal(verifiedLatest.default_actionable, false);
    assert.equal(
      verifiedLatest.default_actionability_status,
      'not_actionable_evidence_refs_observed',
    );
    assert.equal(verifiedSuperseded.default_actionable, false);
    assert.equal(verifiedSuperseded.default_actionability_status, 'superseded');
    assert.equal(verifiedSuperseded.superseded_by_stage_attempt_id, latest.stage_attempt_id);
    assert.equal(
      verifiedDrilldown.summary.domain_dispatch_evidence_receipt_action_route_count,
      0,
    );
    assert.equal(verifiedDrilldown.summary.evidence_envelope_open_count, 0);
    assert.equal(verifiedDrilldown.summary.evidence_envelope_superseded_count, 1);

    const verifiedWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], env).family_runtime_evidence_worklist;
    assert.equal(verifiedWorklist.summary.domain_dispatch_evidence_workorder_count, 0);
    assert.equal(verifiedWorklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 0);
    assert.equal(verifiedWorklist.evidence_envelope.summary.open_envelope_count, 0);
    assert.equal(verifiedWorklist.evidence_envelope.summary.superseded_envelope_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain dispatch evidence compacts superseded attempts across dispatch authority cutover', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-authority-cutover-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const dispatchRef =
    'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
  const oldLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    workspace_root: '/tmp/dm-cvd',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'consumer_default_executor_dispatch',
    dispatch_ref: dispatchRef,
    next_executable_owner: 'write',
    domain_truth_owner: 'med-autoscience',
    opl_writes_domain_truth: false,
    opl_writes_publication_quality: false,
    opl_writes_artifact_gate: false,
    opl_writes_current_package: false,
  };
  const newLocator = {
    ...oldLocator,
    dispatch_authority: 'quality_repair_batch_writer_handoff',
  };
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  const closeoutPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:writer-handoff'],
    next_owner: 'write',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'bounded_repair',
      next_owner: 'write',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };

  try {
    const stale = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(oldLocator),
      '--task',
      'task-authority-cutover-domain-dispatch',
      '--source-fingerprint',
      'truth-snapshot::old-authority',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      stale.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const current = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(newLocator),
      '--task',
      'task-authority-cutover-domain-dispatch',
      '--source-fingerprint',
      'truth-snapshot::new-authority',
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      current.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const attempts = drilldown.domain_dispatch_evidence.attempts.filter(
      (attempt: { stage_id: string; workspace_locator: { dispatch_ref?: string } }) =>
        attempt.stage_id === 'domain_owner/default-executor-dispatch'
        && attempt.workspace_locator.dispatch_ref === dispatchRef,
    );
    assert.equal(attempts.length, 2);
    const staleEvidence = attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === stale.stage_attempt_id,
    );
    const currentEvidence = attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === current.stage_attempt_id,
    );
    assert.equal(currentEvidence.default_actionable, true);
    assert.equal(currentEvidence.default_actionability_status, 'current');
    assert.equal(staleEvidence.default_actionable, false);
    assert.equal(staleEvidence.default_actionability_status, 'superseded');
    assert.equal(staleEvidence.superseded_by_stage_attempt_id, current.stage_attempt_id);
    assert.equal(
      staleEvidence.superseded_reason,
      'newer_stage_attempt_with_same_domain_dispatch_supersession_identity',
    );
    assert.equal(
      drilldown.domain_dispatch_evidence.summary.current_default_actionable_attempt_count,
      1,
    );
    assert.equal(drilldown.domain_dispatch_evidence.summary.dispatch_identity_group_count, 2);
    assert.equal(
      drilldown.domain_dispatch_evidence.summary.dispatch_supersession_identity_group_count,
      1,
    );
    assert.equal(drilldown.domain_dispatch_evidence.summary.superseded_attempt_count, 1);

    const recordRoutes = drilldown.operator_action_routing_refs.refs.filter(
      (route: { action_kind: string }) =>
        route.action_kind === 'domain_dispatch_evidence_receipt_record',
    );
    assert.equal(recordRoutes.length, 1);
    assert.equal(recordRoutes[0].stage_attempt_id, current.stage_attempt_id);
    assert.equal(
      recordRoutes[0].dispatch_supersession_identity_key,
      currentEvidence.dispatch_supersession_identity_key,
    );
    assert.equal(
      recordRoutes.some((route: { stage_attempt_id: string }) =>
        route.stage_attempt_id === stale.stage_attempt_id
      ),
      false,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(drilldown.summary.evidence_envelope_open_count, 1);
    assert.equal(drilldown.summary.evidence_envelope_superseded_count, 1);

    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], env).family_runtime_evidence_worklist;
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 1);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 1);
    assert.equal(
      worklist.domain_dispatch_evidence_workorder_packet.workorders[0].stage_attempt_id,
      current.stage_attempt_id,
    );
    assert.equal(worklist.evidence_envelope.summary.open_envelope_count, 1);
    assert.equal(worklist.evidence_envelope.summary.superseded_envelope_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain dispatch evidence compacts MAS default executor immutable dispatch refs to same-study current work unit', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-same-study-current-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  const baseLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    workspace_root: '/tmp/dm-cvd',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    dispatch_authority: 'consumer_default_executor_dispatch',
    next_executable_owner: 'publication_gate_owner',
    domain_truth_owner: 'med-autoscience',
    opl_writes_domain_truth: false,
    opl_writes_publication_quality: false,
    opl_writes_artifact_gate: false,
    opl_writes_current_package: false,
  };
  const closeoutPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:publication-handoff'],
    next_owner: 'publication_gate_owner',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'publication_handoff_owner_gate',
      next_owner: 'publication_gate_owner',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };

  try {
    const staleQualityRepair = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        ...baseLocator,
        action_type: 'run_quality_repair_batch',
        dispatch_ref:
          'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/old.json',
      }),
      '--task',
      'task-same-study-stale-quality-repair',
      '--source-fingerprint',
      'truth-snapshot::old-quality-repair',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      staleQualityRepair.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const stalePublicationHandoff = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        ...baseLocator,
        action_type: 'publication_handoff_owner_gate',
        dispatch_ref:
          'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/immutable/publication_handoff_owner_gate/old.json',
      }),
      '--task',
      'task-same-study-stale-publication-handoff',
      '--source-fingerprint',
      'truth-snapshot::old-publication-handoff',
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      stalePublicationHandoff.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const currentPublicationHandoff = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        ...baseLocator,
        action_type: 'publication_handoff_owner_gate',
        dispatch_ref:
          'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/immutable/publication_handoff_owner_gate/current.json',
      }),
      '--task',
      'task-same-study-current-publication-handoff',
      '--source-fingerprint',
      'truth-snapshot::current-publication-handoff',
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      currentPublicationHandoff.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const attempts = drilldown.domain_dispatch_evidence.attempts.filter(
      (attempt: { stage_id: string; workspace_locator: { study_id?: string } }) =>
        attempt.stage_id === 'domain_owner/default-executor-dispatch'
        && attempt.workspace_locator.study_id === baseLocator.study_id,
    );
    const staleQualityRepairEvidence = attempts.find(
      (attempt: { stage_attempt_id: string }) =>
        attempt.stage_attempt_id === staleQualityRepair.stage_attempt_id,
    );
    const stalePublicationHandoffEvidence = attempts.find(
      (attempt: { stage_attempt_id: string }) =>
        attempt.stage_attempt_id === stalePublicationHandoff.stage_attempt_id,
    );
    const currentPublicationHandoffEvidence = attempts.find(
      (attempt: { stage_attempt_id: string }) =>
        attempt.stage_attempt_id === currentPublicationHandoff.stage_attempt_id,
    );

    assert.equal(currentPublicationHandoffEvidence.default_actionable, true);
    assert.equal(currentPublicationHandoffEvidence.default_actionability_status, 'current');
    assert.equal(staleQualityRepairEvidence.default_actionable, false);
    assert.equal(staleQualityRepairEvidence.default_actionability_status, 'superseded');
    assert.equal(
      staleQualityRepairEvidence.superseded_by_stage_attempt_id,
      currentPublicationHandoff.stage_attempt_id,
    );
    assert.equal(
      staleQualityRepairEvidence.superseded_reason,
      'newer_stage_attempt_with_same_domain_dispatch_supersession_identity',
    );
    assert.equal(stalePublicationHandoffEvidence.default_actionable, false);
    assert.equal(stalePublicationHandoffEvidence.default_actionability_status, 'superseded');
    assert.equal(
      stalePublicationHandoffEvidence.superseded_by_stage_attempt_id,
      currentPublicationHandoff.stage_attempt_id,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_current_default_actionable_attempt_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);

    const recordRoutes = drilldown.operator_action_routing_refs.refs.filter(
      (route: { action_kind: string }) =>
        route.action_kind === 'domain_dispatch_evidence_receipt_record',
    );
    assert.equal(recordRoutes.length, 1);
    assert.equal(recordRoutes[0].stage_attempt_id, currentPublicationHandoff.stage_attempt_id);

    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], env).family_runtime_evidence_worklist;
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 1);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 1);
    assert.equal(
      worklist.domain_dispatch_evidence_workorder_packet.workorders[0].stage_attempt_id,
      currentPublicationHandoff.stage_attempt_id,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
