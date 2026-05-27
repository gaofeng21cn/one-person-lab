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

function withMagOwnerPayloadResponse(manifest: Record<string, unknown>) {
  return {
    ...manifest,
    owner_payload_response: {
      surface_kind: 'mag_opl_owner_payload_response',
      version: 'v1',
      status: 'blocked_by_submission_ready_human_gate',
      owner: 'med-autogrant',
      target_domain_id: 'med-autogrant',
      record_payload: {
        domain_owner_receipt_refs: [
          'receipt:mag/grant-stage-controlled-attempt/package_and_submit_ready/owner-receipt-or-typed-blocker',
        ],
        no_regression_evidence_refs: [
          'mag-no-regression:direct-hosted-parity',
        ],
        owner_chain_refs: [
          'contracts/production_acceptance/mag-production-acceptance.json#/closure_evidence',
        ],
        typed_blocker_refs: [
          'typed-blocker:mag/package_and_submit_ready/submission_ready_export_gate/human-approval-required/2026-05-22',
        ],
      },
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'no_regression_evidence_ref',
        'owner_chain_ref',
        'typed_blocker_ref',
      ],
      payload_path_policy: 'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      stage_expected_receipt_payload_summary: {
        surface_kind: 'mag_stage_expected_receipt_payload_summary',
        owner: 'med-autogrant',
        consumer: 'one_person_lab',
        status: 'per_stage_expected_receipt_payload_refs_ready_with_live_evidence_typed_blockers',
        payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
        payload_path_policy: 'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
        payload_body_allowed: false,
        empty_payload_template_is_success_evidence: false,
        required_operator_payload_refs: [
          'domain_receipt_refs',
          'monitor_freshness_refs',
          'runtime_event_refs',
          'typed_blocker_refs',
        ],
        required_return_shapes: [
          'domain_receipt_ref',
          'monitor_freshness_ref',
          'runtime_event_ref',
          'typed_blocker_ref',
        ],
        stages: [
          {
            stage_id: 'package_and_submit_ready',
            sequence: 6,
            payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
            current_payload_template: {
              domain_receipt_refs: [],
              monitor_freshness_refs: [],
              runtime_event_refs: [],
              typed_blocker_refs: [],
            },
            success_refs_path_payload: {
              domain_receipt_refs: [
                'receipt:mag/grant-stage-controlled-attempt/package_and_submit_ready/owner-receipt-or-typed-blocker',
                'contracts/stage_control_plane.json#/stages/5/stage_contract/expected_receipt_refs/0',
              ],
              monitor_freshness_refs: [
                'contracts/stage_control_plane.json#/stages/5/stage_contract/monitor_freshness_refs/0',
              ],
              runtime_event_refs: [
                'runtime_event:package_and_submit_ready.owner_receipt_recorded',
              ],
            },
            typed_blocker_path_payload: {
              typed_blocker_refs: [
                'typed-blocker:mag/stage-source-runtime-live-evidence/package_and_submit_ready/pending',
              ],
            },
            operator_payload_submitted: false,
            recommended_current_payload_path: 'typed_blocker_path',
            success_refs_visible_is_completion: false,
            grant_ready_claimed: false,
            quality_ready_claimed: false,
            export_ready_claimed: false,
            submission_ready_claimed: false,
            production_soak_complete_claimed: false,
          },
        ],
      },
      body_included: false,
      grant_ready_claimed: false,
      quality_ready_claimed: false,
      export_ready_claimed: false,
      submission_ready_claimed: false,
    },
  };
}

function withMagCountOnlyScaleoutSnapshot(manifest: Record<string, unknown>) {
  return {
    ...manifest,
    workspace_receipt_scaleout_evidence: {
      surface_kind: 'mag_workspace_receipt_scaleout_evidence.v1',
      owner_payload_response: {
        surface_kind: 'mag_opl_owner_payload_response',
        status: 'blocked_by_submission_ready_human_gate',
        typed_blocker_refs: [
          'typed-blocker:mag/package_and_submit_ready/submission_ready_export_gate/human-approval-required/2026-05-22',
        ],
        stage_expected_receipt_payload_stage_count: 6,
        stage_payload_body_allowed: false,
        stage_success_refs_visible_is_completion: false,
      },
    },
  };
}

test('runtime App drilldown consumes MAG owner payload response as refs-only owner and stage guidance', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mag-payload-summary-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const magManifest = withMagOwnerPayloadResponse(loadFamilyManifestFixtures().medautogrant);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautogrant',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(magManifest),
  ], env);

  const summary = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
  assert.equal(summary.summary.domain_owner_payload_summary_domain_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_owner_payload_item_summary_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_work_item_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_stage_expected_receipt_summary_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_stage_count, 1);
  assert.equal(summary.summary.domain_owner_payload_summary_payload_body_allowed_count, 0);
  assert.equal(summary.summary.domain_owner_payload_summary_domain_ready_claim_count, 0);
  assert.equal(summary.summary.domain_owner_payload_summary_production_ready_claim_count, 0);

  const attention = summary.attention_first_payload.evidence_after_contract
    .domain_owner_payload_summary_attention;
  assert.equal(attention.status, 'owner_payload_summary_available');
  assert.equal(attention.owner_payload_domains[0].domain_id, 'medautogrant');
  assert.equal(attention.owner_payload_domains[0].owner, 'med-autogrant');
  assert.equal(attention.owner_payload_domains[0].source_surface, 'mag_opl_owner_payload_response');
  assert.equal(attention.owner_payload_domains[0].owner_payload_work_item_count, 1);
  assert.equal(attention.owner_payload_domains[0].stage_expected_receipt_payload_stage_count, 1);
  assert.equal(attention.authority_boundary.can_create_owner_receipt, false);
  assert.equal(attention.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(attention.authority_boundary.can_claim_production_ready, false);

  const full = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
    .app_operator_drilldown;
  const projection = full.domain_owner_payload_summary_refs;
  assert.equal(projection.summary.domain_count, 1);
  const mag = projection.domains[0];
  assert.equal(mag.domain_id, 'medautogrant');
  assert.equal(mag.source_surface, 'mag_opl_owner_payload_response');
  assert.equal(mag.owner_payload_item_summary.work_item_count, 1);
  assert.equal(mag.owner_payload_item_summary.work_items[0].item_id, 'mag_owner_payload_response');
  assert.deepEqual(
    mag.owner_payload_item_summary.work_items[0].typed_blocker_path_payload,
    {
      typed_blocker_refs: [
        'typed-blocker:mag/package_and_submit_ready/submission_ready_export_gate/human-approval-required/2026-05-22',
      ],
    },
  );
  assert.equal(
    mag.owner_payload_item_summary.work_items[0].success_refs_visible_is_completion,
    false,
  );
  assert.equal(mag.stage_expected_receipt_payload_summary.stage_count, 1);
  assert.equal(
    mag.stage_expected_receipt_payload_summary.stages[0].stage_id,
    'package_and_submit_ready',
  );
  assert.deepEqual(
    mag.stage_expected_receipt_payload_summary.stages[0].success_refs_path_payload
      .runtime_event_refs,
    ['runtime_event:package_and_submit_ready.owner_receipt_recorded'],
  );
  assert.equal(
    mag.stage_expected_receipt_payload_summary.stages[0].success_refs_visible_is_completion,
    false,
  );
  assert.equal(
    mag.stage_expected_receipt_payload_summary.stages[0].authority_boundary
      .can_claim_domain_ready,
    false,
  );

  const ownerRecordRoute = full.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; target_identity?: { item_id?: string } }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record'
      && route.target_identity?.item_id === 'mag_owner_payload_response',
  );
  assert.ok(ownerRecordRoute);
  assert.equal(ownerRecordRoute.route_requires_domain_or_app_payload, true);
  assert.equal(ownerRecordRoute.payload_body_allowed, false);
  assert.equal(ownerRecordRoute.payload_workorder.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerRecordRoute.payload_workorder.authority_boundary.can_close_domain_ready, false);
  const stageRecordRoute = full.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; target_identity?: { stage_id?: string } }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record'
      && route.target_identity?.stage_id === 'package_and_submit_ready',
  );
  assert.ok(stageRecordRoute);
  assert.deepEqual(stageRecordRoute.required_operator_payload_refs, [
    'domain_receipt_refs',
    'monitor_freshness_refs',
    'runtime_event_refs',
    'typed_blocker_refs',
  ]);

  const pollutedPayloadExecution = runCliFailure([
    'runtime',
    'action',
    'execute',
    '--action',
    ownerRecordRoute.action_id,
    '--payload',
    JSON.stringify({
      domain_owner_receipt_refs: [
        'receipt:mag/grant-stage-controlled-attempt/package_and_submit_ready/owner-receipt-or-typed-blocker',
      ],
      grant_ready_claimed: true,
    }),
  ], env);
  assert.equal(pollutedPayloadExecution.payload.error.code, 'cli_usage_error');
  assert.equal(
    pollutedPayloadExecution.payload.error.details.error_kind,
    'domain_owner_payload_summary_payload_authority_claims_or_body_forbidden',
  );

  const readiness = runCli(['framework', 'readiness', '--family-defaults'], env)
    .framework_readiness;
  const readinessAttention = readiness.attention_first_payload.domain_owner_payload_summary_attention;
  assert.equal(readinessAttention.domain_count, 1);
  assert.equal(readinessAttention.owner_payload_domains[0].domain_id, 'medautogrant');
  assert.equal(readinessAttention.owner_payload_work_item_count, 1);
  assert.equal(readinessAttention.stage_expected_receipt_payload_stage_count, 1);
  assert.equal(readinessAttention.authority_boundary.can_create_owner_receipt, false);
  assert.equal(readinessAttention.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readinessAttention.authority_boundary.can_claim_production_ready, false);
});

test('runtime App drilldown does not expand MAG count-only scaleout snapshot into stage payload routes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mag-count-only-payload-summary-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const magManifest = withMagCountOnlyScaleoutSnapshot(loadFamilyManifestFixtures().medautogrant);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautogrant',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(magManifest),
  ], env);

  const full = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
    .app_operator_drilldown;
  assert.equal(full.summary.domain_owner_payload_summary_domain_count, 1);
  assert.equal(full.summary.domain_owner_payload_summary_owner_payload_item_summary_count, 1);
  assert.equal(full.summary.domain_owner_payload_summary_stage_expected_receipt_summary_count, 0);
  assert.equal(full.summary.domain_owner_payload_summary_stage_count, 0);
  const mag = full.domain_owner_payload_summary_refs.domains[0];
  assert.equal(mag.source_ref, '/workspace_receipt_scaleout_evidence/owner_payload_response');
  assert.equal(mag.stage_expected_receipt_payload_summary, null);
  const stageRecordRoute = full.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; target_identity?: { stage_id?: string } }) =>
      route.action_kind === 'domain_owner_payload_summary_receipt_record'
      && route.target_identity?.stage_id === 'package_and_submit_ready',
  );
  assert.equal(stageRecordRoute, undefined);
});
