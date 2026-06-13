import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('domain dispatch evidence does not expose unbound attempts as default record workorders', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-unbound-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspaceLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    profile_name: 'dm-cvd',
    study_id: 'DM003',
    task_kind: 'paper_autonomy/guarded-apply',
    provider_attempt_id: 'opl-temporal:dm-cvd:DM003:provider-hosted-guarded-apply',
    authority_boundary: 'mas_owner_guarded_apply_only',
    target_studies: ['DM003'],
    source_refs: [{
      role: 'mas_owner_controller_decision',
      ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json',
      exists: true,
    }],
  };
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  const closeoutPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:guarded-apply'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_owner_receipt_observed',
    route_impact: {
      decision: 'applied',
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_owner_receipt_observed',
    },
  };

  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper_autonomy/guarded-apply',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--task',
      'task-unbound-guarded-apply',
      '--source-fingerprint',
      'legacy-short-id-source',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const evidence = drilldown.domain_dispatch_evidence.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attempt.stage_attempt_id,
    );
    assert.equal(evidence.dispatch_identity_key, null);
    assert.equal(evidence.dispatch_identity_key_status, 'unbound_no_dispatch_ref');
    assert.equal(evidence.default_actionable, false);
    assert.equal(evidence.default_actionability_status, 'not_actionable_unbound_dispatch_identity');

    const recordRoutes = drilldown.operator_action_routing_refs.refs.filter(
      (route: { action_kind: string }) =>
        route.action_kind === 'domain_dispatch_evidence_receipt_record',
    );
    assert.equal(recordRoutes.length, 0);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_current_default_actionable_attempt_count,
      0,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 0);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      0,
    );
    assert.equal(drilldown.summary.evidence_envelope_open_count, 0);
    assert.equal(drilldown.summary.evidence_envelope_blocked_count, 1);

    const envelope = drilldown.evidence_envelope.envelopes.find(
      (entry: { envelope_id: string }) =>
        entry.envelope_id === `domain_dispatch:med-autoscience:${attempt.stage_attempt_id}`,
    );
    assert.equal(envelope.status, 'blocked');
    assert.equal(envelope.next_route, null);
    assert.equal(envelope.claim_allowed.domain_ready, false);
    assert.equal(envelope.claim_allowed.production_ready, false);

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
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 0);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 0);
    assert.equal(worklist.evidence_envelope.summary.open_envelope_count, 0);
    assert.equal(worklist.evidence_envelope.summary.blocked_envelope_count, 1);
    assert.equal(
      worklist.worklist_items.some((item: { action_id: string }) =>
        item.action_id === `domain_dispatch:medautoscience:${attempt.stage_attempt_id}:record`
      ),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain dispatch evidence waits for accepted typed closeout before exposing record workorders', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-running-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspaceLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    workspace_root: '/tmp/dm-cvd',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'consumer_default_executor_dispatch',
    dispatch_ref:
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    next_executable_owner: 'ai_reviewer',
    domain_source_fingerprint: 'domain-source-stale',
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

  try {
    const attempt = runCli([
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
      'task-running-domain-dispatch',
      '--source-fingerprint',
      'opl-stage-source-derived',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.stage_attempt_id,
    ], env);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const evidence = drilldown.domain_dispatch_evidence.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attempt.stage_attempt_id,
    );

    assert.equal(evidence.local_status, 'running');
    assert.equal(evidence.closeout_receipt_status, null);
    assert.equal(evidence.dispatch_identity_key_status, 'bound');
    assert.equal(evidence.default_actionable, false);
    assert.equal(evidence.default_actionability_status, 'not_actionable_stage_attempt_not_closed');
    assert.equal(evidence.default_actionability_blocker, 'stage_attempt_closeout_required_before_domain_dispatch_evidence_record');
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_current_default_actionable_attempt_count,
      0,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 0);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      0,
    );

    const recordRoutes = drilldown.operator_action_routing_refs.refs.filter(
      (route: { action_kind: string }) =>
        route.action_kind === 'domain_dispatch_evidence_receipt_record',
    );
    assert.equal(recordRoutes.length, 0);

    const envelope = drilldown.evidence_envelope.envelopes.find(
      (entry: { envelope_id: string }) =>
        entry.envelope_id === `domain_dispatch:med-autoscience:${attempt.stage_attempt_id}`,
    );
    assert.equal(envelope.status, 'blocked');
    assert.equal(envelope.next_route, null);
    assert.equal(
      envelope.blocked_reasons.includes('stage_attempt_closeout_required_before_domain_dispatch_evidence_record'),
      true,
    );
    assert.equal(envelope.claim_allowed.domain_ready, false);
    assert.equal(envelope.claim_allowed.production_ready, false);

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
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 0);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 0);
    assert.equal(worklist.evidence_envelope.summary.open_envelope_count, 0);
    assert.equal(worklist.evidence_envelope.summary.blocked_envelope_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain dispatch evidence keeps older unclosed attempts as superseded provenance', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-running-superseded-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspaceLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    workspace_root: '/tmp/dm-cvd',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'consumer_default_executor_dispatch',
    dispatch_ref:
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    next_executable_owner: 'ai_reviewer',
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
    closeout_refs: ['receipt:ai-reviewer-handoff'],
    next_owner: 'ai_reviewer',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'return_to_ai_reviewer',
      next_owner: 'ai_reviewer',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };

  try {
    const older = runCli([
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
      'task-running-superseded-domain-dispatch',
      '--source-fingerprint',
      'opl-stage-source-old',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      older.stage_attempt_id,
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
      JSON.stringify(workspaceLocator),
      '--task',
      'task-running-superseded-domain-dispatch',
      '--source-fingerprint',
      'opl-stage-source-current',
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
      (entry: { stage_id: string; workspace_locator: { dispatch_ref?: string } }) =>
        entry.stage_id === 'domain_owner/default-executor-dispatch'
        && entry.workspace_locator.dispatch_ref === workspaceLocator.dispatch_ref,
    );
    const olderEvidence = attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === older.stage_attempt_id,
    );
    const currentEvidence = attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === current.stage_attempt_id,
    );

    assert.equal(olderEvidence.local_status, 'running');
    assert.equal(olderEvidence.default_actionable, false);
    assert.equal(olderEvidence.default_actionability_status, 'superseded');
    assert.equal(olderEvidence.default_actionability_blocker, null);
    assert.equal(olderEvidence.superseded_by_stage_attempt_id, current.stage_attempt_id);
    assert.equal(currentEvidence.local_status, 'completed');
    assert.equal(currentEvidence.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(currentEvidence.default_actionable, true);
    assert.equal(currentEvidence.default_actionability_status, 'current');
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_current_default_actionable_attempt_count,
      1,
    );
    assert.equal(drilldown.summary.evidence_envelope_superseded_count, 1);

    const olderEnvelope = drilldown.evidence_envelope.envelopes.find(
      (entry: { envelope_id: string }) =>
        entry.envelope_id === `domain_dispatch:med-autoscience:${older.stage_attempt_id}`,
    );
    assert.equal(olderEnvelope.status, 'superseded');
    assert.equal(olderEnvelope.next_route, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain dispatch evidence counts only explicit positive domain ready verdicts as ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-ready-verdict-guard-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  const negativeVerdicts = [
    'not_ready',
    'not_domain_ready',
    'domain_not_ready',
    'blocked_not_ready',
    'domain_gate_pending',
    'domain_owner_receipt_observed',
    'typed_blocker',
    'domain_typed_blocker',
    'blocked_by_domain_typed_blocker',
  ];
  const positiveVerdicts = [
    'ready',
    'domain_ready',
    'domain_ready_claimed',
  ];

  try {
    for (const [index, verdict] of [...negativeVerdicts, ...positiveVerdicts].entries()) {
      const attempt = runCli([
        'family-runtime',
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        'write',
        '--provider',
        'local_sqlite',
        '--workspace-locator',
        JSON.stringify({
          workspace_root: '/tmp/mas',
          artifact_root: '/tmp/mas/artifacts',
          dispatch_ref: `mas-domain-dispatch:dm-cvd:verdict-guard-${index}`,
        }),
        '--task',
        `task-domain-ready-verdict-guard-${index}`,
        '--source-fingerprint',
        `sha256:domain-ready-verdict-guard-${index}`,
      ], env).family_runtime_stage_attempt.attempt;
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attempt.stage_attempt_id,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`receipt:domain-ready-verdict-guard-${index}`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: verdict,
          route_impact: {
            decision: 'bounded_repair',
            domain_ready_verdict: verdict,
          },
        }),
      ], env);
    }

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const evidenceByVerdict = new Map<string, { domain_ready_claimed: boolean }>(
      drilldown.domain_dispatch_evidence.attempts.map(
        (entry: { domain_ready_verdict: string; domain_ready_claimed: boolean }) => [
          entry.domain_ready_verdict,
          entry,
        ],
      ),
    );

    for (const verdict of negativeVerdicts) {
      assert.equal(evidenceByVerdict.get(verdict)?.domain_ready_claimed, false, verdict);
    }
    for (const verdict of positiveVerdicts) {
      assert.equal(evidenceByVerdict.get(verdict)?.domain_ready_claimed, true, verdict);
    }
    assert.equal(
      drilldown.domain_dispatch_evidence.by_domain.medautoscience.domain_ready_claim_count,
      positiveVerdicts.length,
    );
    assert.equal(
      drilldown.domain_dispatch_evidence.summary.domain_ready_claim_count,
      positiveVerdicts.length,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
