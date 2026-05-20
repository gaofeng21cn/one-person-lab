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
  runCliFailure,
  test,
} from '../helpers.ts';

function manifestWithStageEvidenceRequest() {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  manifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'review',
        stage_kind: 'review',
        title: 'Review',
        summary: 'Review from draft refs.',
        goal: 'Return review refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
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
          requires: ['draft_ready'],
          ensures: ['review_ready'],
          boundary_assumptions: ['reviewer_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' }],
          monitor_freshness_refs: [
            {
              ref_kind: 'metric_ref',
              ref: 'metric:review/declared-freshness',
              role: 'declared_monitor_freshness',
            },
          ],
          source_scope_refs: [],
          cohort_query_refs: [],
          trigger_refs: [],
          metric_refs: [],
          dashboard_metric_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: [],
          owner_receipt_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:review-receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
  return manifest;
}

function bindStageEvidenceManifest(stateRoot: string, fixtureContractsRoot: string) {
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(manifestWithStageEvidenceRequest()),
  ], {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
}

test('stage production evidence record routes expose fail-closed workorder and copyable runtime commands', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-closeout-route-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindStageEvidenceManifest(stateRoot, fixtureContractsRoot);
    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const route = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:record',
    );

    assert.deepEqual(route.required_operator_payload_refs, [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
    ]);
    assert.deepEqual(route.optional_operator_payload_refs, [
      'no_regression_refs',
      'owner_chain_refs',
    ]);
    assert.equal(route.empty_payload_template_is_success_evidence, false);
    assert.equal(route.payload_preflight_error_code, 'cli_usage_error');
    assert.equal(
      route.payload_preflight_blocked_error_kind,
      'stage_production_evidence_payload_preflight_blocked',
    );
    assert.deepEqual(route.payload_ref_hints.required_any_payload_refs, [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
    ]);
    assert.deepEqual(route.payload_ref_hints.evidence_refs_should_cover_monitor_freshness, [
      'metric:review/declared-freshness',
    ]);
    assert.deepEqual(route.payload_workorder.success_path_requires.evidence_refs_cover_monitor_freshness, [
      'metric:review/declared-freshness',
    ]);
    assert.equal(
      drilldown.stage_production_evidence.stages[0].monitor_ref_projection_source,
      'explicit_stage_contract_monitor_freshness_refs',
    );
    assert.deepEqual(route.payload_workorder.required_any_payload_refs, [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
    ]);
    assert.equal(route.payload_workorder.empty_payload_template_is_success_evidence, false);
    assert.match(
      route.copyable_runtime_action_execute_commands.dry_run_with_empty_template_blocks,
      /opl runtime action execute --action stage-production-evidence:medautoscience:review:record --dry-run --payload/,
    );
    assert.match(
      route.copyable_runtime_action_execute_commands.record_typed_blocker_path,
      /<domain-owned-typed-blocker-ref>/,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('stage production evidence preflight rejects empty templates and placeholder refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-closeout-preflight-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindStageEvidenceManifest(stateRoot, fixtureContractsRoot);
    const emptyTemplate = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({ domain_receipt_refs: [], evidence_refs: [], typed_blocker_refs: [] }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(emptyTemplate.payload.error.code, 'cli_usage_error');
    assert.equal(emptyTemplate.payload.error.details.error_kind, 'stage_production_evidence_payload_preflight_blocked');
    assert.deepEqual(emptyTemplate.payload.error.details.required_any_operator_payload_refs, [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
    ]);
    assert.equal(emptyTemplate.payload.error.details.empty_payload_template_is_success_evidence, false);
    assert.equal(emptyTemplate.payload.error.details.preflight.status, 'blocked');

    const placeholder = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['metric:review/declared-freshness'],
        domain_receipt_refs: ['mas:review-receipt', '<domain-owned-receipt-ref>'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.deepEqual(
      placeholder.payload.error.details.preflight.forbidden_placeholder_refs,
      ['<domain-owned-receipt-ref>'],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('stage production evidence verify route reuses recorded receipt ref', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-closeout-verify-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindStageEvidenceManifest(stateRoot, fixtureContractsRoot);
    runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        receipt_ref: 'mas-stage-review-current-receipt',
        evidence_refs: ['metric:review/declared-freshness'],
        domain_receipt_refs: ['mas:review-receipt', 'mas://receipts/review-owner-instance.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const recordedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const verifyRoute = recordedDrilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:verify',
    );

    assert.deepEqual(verifyRoute.opl_cli_args.slice(-2), ['--receipt-ref', 'mas-stage-review-current-receipt']);
    assert.match(
      verifyRoute.copyable_runtime_action_execute_commands.verify_recorded_receipt,
      /opl runtime action execute --action stage-production-evidence:medautoscience:review:verify/,
    );

    const verified = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verified.execution.result.external_evidence_apply.status, 'verified');
    assert.equal(verified.execution.result.external_evidence_apply.receipt.receipt_ref, 'mas-stage-review-current-receipt');
    assert.equal(verified.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('stage production evidence typed blocker receipt closes App production tail without readiness claim', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-closeout-blocker-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindStageEvidenceManifest(stateRoot, fixtureContractsRoot);
    runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['mas-typed-blocker:review-owner-receipt-pending'],
        owner_chain_refs: ['mas://contracts/stage-evidence-handoff'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const stage = drilldown.stage_production_evidence.stages[0];
    assert.deepEqual(stage.domain_owned_typed_blocker_refs, [
      'mas-typed-blocker:review-owner-receipt-pending',
    ]);
    assert.equal(stage.evidence_obligation_summary.blocked_by_domain_typed_blocker_count, 4);

    const tailItem = drilldown.production_evidence_tail_ledger.tail_items.find(
      (item: { tail_item: string; stage_id: string }) =>
        item.tail_item === 'stage_production_evidence' && item.stage_id === 'review',
    );
    assert.equal(tailItem.status, 'domain_owned_typed_blocker');
    assert.equal(tailItem.typed_blocker_ref, 'mas-typed-blocker:review-owner-receipt-pending');
    assert.deepEqual(tailItem.typed_blocker_refs, ['mas-typed-blocker:review-owner-receipt-pending']);
    assert.equal(tailItem.authority_boundary.can_claim_domain_ready, false);
    assert.equal(
      drilldown.production_evidence_tail_ledger.tail_items.some(
        (item: { tail_item: string; stage_id: string; status: string }) =>
          item.tail_item === 'stage_production_evidence'
          && item.stage_id === 'review'
          && item.status === 'open',
      ),
      false,
    );
    assert.equal(drilldown.production_evidence_tail_ledger.summary.typed_blocker_tail_item_count > 0, true);
    assert.equal(
      drilldown.summary.app_operator_production_evidence_tail_open_item_count,
      drilldown.production_evidence_tail_ledger.summary.open_tail_item_count,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
