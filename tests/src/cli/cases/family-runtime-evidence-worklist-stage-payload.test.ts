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
} from '../helpers.ts';

function familyRuntimeEnv(
  stateRoot: string,
  fixtureContractsRoot: string,
  extra: Record<string, string> = {},
) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    ...extra,
  };
}

function reviewStageManifest() {
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
          monitor_refs: [
            { ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' },
          ],
          source_scope_refs: [
            { ref_kind: 'source_ref', ref: 'source:review', role: 'source_scope' },
          ],
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

function bindReviewStageManifest(stateRoot: string, fixtureContractsRoot: string) {
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(reviewStageManifest()),
  ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
}

test('family-runtime evidence-worklist keeps stage record workorder open when verified receipt still needs domain App payload', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-stage-payload-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    bindReviewStageManifest(stateRoot, fixtureContractsRoot);
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'stage_production_evidence:medautoscience:review',
      '--request-pack-id',
      'medautoscience.stage_production_evidence',
      '--source-ref',
      '/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence/med-autoscience/review',
      '--receipt-ref',
      'mas-stage-review-partial-receipt',
      '--evidence-ref',
      'metric:review/currentness',
      '--domain-receipt-ref',
      'mas:review-receipt',
      '--domain-receipt-ref',
      'mas://receipts/review-owner-instance.json',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'stage_production_evidence:medautoscience:review',
      '--mode',
      'verify',
      '--receipt-ref',
      'mas-stage-review-partial-receipt',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));

    const drilldown = runCli(
      ['runtime', 'app-operator-drilldown', '--detail', 'full'],
      familyRuntimeEnv(stateRoot, fixtureContractsRoot),
    ).app_operator_drilldown;
    const route = drilldown.operator_action_routing_refs.refs.find((ref: { action_id: string }) =>
      ref.action_id === 'stage-production-evidence:medautoscience:review:record'
    );
    assert.equal(route.action_kind, 'stage_production_evidence_receipt_record');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.can_close_without_domain_or_app_payload, false);
    assert.deepEqual(route.required_evidence_refs, [
      'source:review',
      'runtime_event:review.receipt_recorded',
    ]);

    const output = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    const worklist = output.family_runtime_evidence_worklist;

    assert.equal(worklist.summary.open_worklist_item_count > 0, true);
    assert.equal(worklist.summary.stage_receipt_freshness_open_workorder_count > 0, true);
    assert.equal(worklist.summary.stage_production_evidence_receipt_item_count > 0, true);
    assert.equal(
      worklist.summary.stage_production_evidence_receipt_requires_domain_or_app_payload_count > 0,
      true,
    );
    assert.equal(worklist.summary.stage_source_scope_missing_workorder_count > 0, true);
    assert.equal(worklist.summary.stage_runtime_event_missing_workorder_count > 0, true);
    assert.equal(worklist.summary.stage_source_scope_missing_ref_count > 0, true);
    assert.equal(worklist.summary.stage_runtime_event_missing_ref_count > 0, true);
    assert.equal(
      worklist.stage_evidence_workorder_packet_summary.source_scope_missing_workorder_count,
      worklist.summary.stage_source_scope_missing_workorder_count,
    );
    assert.equal(worklist.stage_evidence_workorder_attention_items.length > 0, true);
    assert.equal(
      worklist.stage_evidence_workorder_attention_items[0].action_kind,
      'stage_production_evidence_receipt_record',
    );
    assert.equal(worklist.stage_evidence_workorder_attention_items[0].domain_id, 'medautoscience');
    assert.equal(worklist.stage_evidence_workorder_attention_items[0].stage_id, 'review');
    assert.equal(worklist.stage_evidence_workorder_attention_items[0].required_evidence_ref_count, 2);
    assert.equal(worklist.stage_evidence_workorder_attention_items[0].unobserved_source_scope_ref_count, 1);
    assert.equal(worklist.stage_evidence_workorder_attention_items[0].unobserved_runtime_event_ref_count, 1);
    assert.equal(worklist.stage_evidence_workorder_attention_items[0].worklist_item_is_completion_claim, false);
    assert.equal(worklist.stage_evidence_workorder_packet.summary.workorder_count > 0, true);
    assert.equal(
      worklist.stage_evidence_workorder_packet.summary.source_scope_missing_workorder_count > 0,
      true,
    );
    assert.equal(
      worklist.stage_evidence_workorder_packet.summary.runtime_event_missing_workorder_count > 0,
      true,
    );
    assert.equal(
      worklist.stage_evidence_workorder_packet.summary.source_scope_missing_ref_count > 0,
      true,
    );
    assert.equal(
      worklist.stage_evidence_workorder_packet.summary.runtime_event_missing_ref_count > 0,
      true,
    );
    const item = worklist.worklist_items.find((entry: { action_id: string }) =>
      entry.action_id === 'stage-production-evidence:medautoscience:review:record'
    );
    const workorder = worklist.stage_evidence_workorder_packet.workorders.find(
      (entry: { action_id: string }) => entry.action_id === item.action_id,
    );
    assert.equal(item.status, 'open_safe_action_request_route_available');
    assert.equal(item.receipt_ref, null);
    assert.equal(item.route_requires_domain_or_app_payload, true);
    assert.equal(item.can_close_without_domain_or_app_payload, false);
    assert.equal(workorder.action_id, item.action_id);
    assert.deepEqual(workorder.unobserved_source_scope_refs, ['source:review']);
    assert.deepEqual(workorder.unobserved_runtime_event_refs, [
      'runtime_event:review.receipt_recorded',
    ]);
    assert.equal(item.expected_refs.includes('source:review'), true);
    assert.equal(item.expected_refs.includes('runtime_event:review.receipt_recorded'), true);
    assert.equal(item.expected_refs.includes('metric:review/currentness'), true);
    const attentionItem = worklist.attention_queue.find(
      (entry: { item_id: string }) => entry.item_id === item.item_id,
    );
    assert.ok(attentionItem);
    assert.equal(attentionItem.missing_or_expected_refs.includes('source:review'), true);
    assert.equal(
      attentionItem.missing_or_expected_refs.includes('runtime_event:review.receipt_recorded'),
      true,
    );
    assert.equal(attentionItem.missing_or_expected_refs.includes('metric:review/currentness'), true);
    assert.equal(worklist.next_action_ledger.summary.next_action_item_count > 0, true);
    const nextAction = worklist.next_action_ledger.next_action_items.find(
      (entry: { source_tail_item_id: string }) => entry.source_tail_item_id === item.item_id,
    );
    assert.equal(
      nextAction.next_safe_action_route,
      item.replay_ref,
    );
    assert.equal(worklist.evidence_requirement_ledger.summary.open_requirement_count > 0, true);
    assert.equal(worklist.authority_boundary.can_write_domain_truth, false);
    assert.equal(worklist.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
