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
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

const appOperatorCommand = ['runtime', 'app-operator-drilldown'];
const appOperatorFullCommand = [...appOperatorCommand, '--detail', 'full'];

function withMagOwnerPayloadResponse(manifest: Record<string, unknown>) {
  const sustainedConsumptionFollowthroughWorkorder = {
    surface_kind: 'mag_manifest_sustained_consumption_followthrough_workorder',
    version: 'v1',
    status: 'requires_real_app_operator_or_default_caller_payload',
    authority_command: 'authority manifest-consumption-payload',
    authority_command_internal: 'manifest-sustained-consumption-payload',
    payload_owner: 'app_operator_or_release_default_caller',
    accepted_payload_path_policy:
      'real_app_operator_or_default_caller_consumption_refs_or_domain_owned_typed_blocker',
    required_operator_payload_refs: [
      'app_operator_consumption_ref',
      'default_caller_consumption_ref',
      'owner_payload_response_ref',
      'workspace_receipt_scaleout_evidence_ref',
      'no_forbidden_write_ref',
      'long_soak_or_typed_blocker_ref',
    ],
    allowed_operator_payload_fields: [
      'app_operator_consumption_ref',
      'default_caller_consumption_ref',
      'owner_payload_response_ref',
      'workspace_receipt_scaleout_evidence_ref',
      'no_forbidden_write_ref',
      'long_soak_or_typed_blocker_ref',
      'typed_blocker_refs',
    ],
    payload_template: {
      app_operator_consumption_ref: [],
      default_caller_consumption_ref: [],
      owner_payload_response_ref: [],
      workspace_receipt_scaleout_evidence_ref: [],
      no_forbidden_write_ref: [],
      long_soak_or_typed_blocker_ref: [],
    },
    accepted_payload_paths: {
      sustained_consumption_refs_path: {
        required_operator_payload_refs: [
          'app_operator_consumption_ref',
          'default_caller_consumption_ref',
          'owner_payload_response_ref',
          'workspace_receipt_scaleout_evidence_ref',
          'no_forbidden_write_ref',
          'long_soak_or_typed_blocker_ref',
        ],
        requires_long_soak_or_typed_blocker_ref: true,
        typed_blocker_refs_must_be_absent: true,
        closes_app_sustained_consumption: false,
        closes_grant_ready: false,
        closes_submission_ready: false,
        closes_provider_long_soak: false,
      },
      typed_blocker_path: {
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        closes_app_sustained_consumption: false,
        closes_grant_ready: false,
        closes_submission_ready: false,
        closes_provider_long_soak: false,
      },
    },
    empty_payload_template_is_success_evidence: false,
    rejects_unknown_operator_payload_fields: true,
    operator_payload_submitted: false,
    claims_sustained_app_consumption_complete: false,
    claims_grant_ready: false,
    claims_submission_ready: false,
    claims_provider_long_soak_complete: false,
    authority_boundary: {
      owner: 'med-autogrant',
      refs_only: true,
      payload_owner: 'app_operator_or_release_default_caller',
      can_write_grant_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_create_owner_receipt: false,
      can_submit_operator_payload: false,
      can_declare_app_sustained_consumption_complete: false,
      can_declare_submission_ready: false,
      can_declare_provider_long_soak_complete: false,
    },
  };
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
      manifest_consumer_evidence: {
        surface_kind: 'mag_manifest_owner_payload_consumer_evidence',
        state: 'manifest_owner_payload_response_consumed_refs_only',
        consumer: 'one_person_lab_app_operator_manifest',
        owner: 'med-autogrant',
        target_domain_id: 'med-autogrant',
        consumed_surface_refs: {
          owner_payload_response_ref: '/product_entry_manifest/owner_payload_response',
          workspace_receipt_scaleout_evidence_ref:
            '/product_entry_manifest/workspace_receipt_scaleout_evidence',
        },
        sustained_consumption_followthrough_workorder:
          sustainedConsumptionFollowthroughWorkorder,
        operator_payload_submitted: false,
        claims_sustained_app_consumption_complete: false,
        claims_grant_ready: false,
        claims_submission_ready: false,
        claims_provider_long_soak_complete: false,
      },
    },
    workspace_receipt_scaleout_evidence: {
      surface_kind: 'mag_workspace_receipt_scaleout_evidence.v1',
      workspace_receipt_scaleout: {
        workspace_count: 4,
        total_receipt_ref_count: 36,
      },
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

test('runtime App operator consumes MAG owner payload response as refs-only owner and stage guidance', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mag-payload-summary-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(fixtureRoot);
  const magManifest = withMagOwnerPayloadResponse(loadFamilyManifestFixtures().medautogrant);
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    OPL_META_AGENT_REPO_DIR: omaRepoDir,
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

  const summary = runCli(appOperatorCommand, env).app_operator_drilldown;
  assert.equal(summary.summary.domain_owner_payload_summary_domain_count, 1);
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

  const full = runCli(appOperatorFullCommand, env)
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

test('runtime App operator does not expand MAG count-only scaleout snapshot into stage payload routes', () => {
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

  const full = runCli(appOperatorFullCommand, env)
    .app_operator_drilldown;
  assert.equal(full.summary.domain_owner_payload_summary_domain_count, 1);
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

test('runtime App operator exposes MAG sustained consumption followthrough as refs-only route', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mag-sustained-followthrough-'));
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

  const full = runCli(appOperatorFullCommand, env)
    .app_operator_drilldown;
  const followthrough = full.mag_manifest_sustained_consumption_followthrough_refs;
  assert.equal(followthrough.summary.followthrough_domain_count, 1);
  assert.equal(followthrough.summary.workorder_count, 1);
  assert.equal(followthrough.summary.ledger_receipt_ref_count, 0);
  assert.equal(followthrough.summary.can_claim_sustained_app_consumption_complete_count, 0);
  assert.equal(followthrough.domains[0].domain_id, 'medautogrant');
  assert.equal(
    followthrough.domains[0].workorder.authority_command,
    'authority manifest-consumption-payload',
  );
  assert.deepEqual(
    followthrough.domains[0].workorder.required_operator_payload_refs,
    [
      'app_operator_consumption_ref',
      'default_caller_consumption_ref',
      'owner_payload_response_ref',
      'workspace_receipt_scaleout_evidence_ref',
      'no_forbidden_write_ref',
      'long_soak_or_typed_blocker_ref',
    ],
  );
  assert.equal(
    followthrough.authority_boundary.can_claim_sustained_app_consumption_complete,
    false,
  );

  const recordRoute = full.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; domain_id?: string }) =>
      route.action_kind === 'mag_manifest_sustained_consumption_followthrough_receipt_record'
      && route.domain_id === 'medautogrant',
  );
  assert.ok(recordRoute);
  assert.equal(recordRoute.route_requires_domain_or_app_payload, true);
  assert.equal(recordRoute.payload_owner, 'app_operator_or_release_default_caller');
  assert.deepEqual(recordRoute.required_operator_payload_refs, [
    'app_operator_consumption_ref',
    'default_caller_consumption_ref',
    'owner_payload_response_ref',
    'workspace_receipt_scaleout_evidence_ref',
    'no_forbidden_write_ref',
    'long_soak_or_typed_blocker_ref',
    'typed_blocker_refs',
  ]);
  assert.equal(
    recordRoute.payload_workorder.authority_boundary
      .can_declare_app_sustained_consumption_complete,
    false,
  );

  const emptyPayloadExecution = runCliFailure([
    'runtime',
    'action',
    'execute',
    '--action',
    recordRoute.action_id,
    '--payload',
    JSON.stringify({}),
  ], env);
  assert.equal(emptyPayloadExecution.payload.error.code, 'cli_usage_error');
  assert.equal(
    emptyPayloadExecution.payload.error.details.error_kind,
    'owner_evidence_sustained_consumption_payload_preflight_blocked',
  );
  const unknownPayloadExecution = runCliFailure([
    'runtime',
    'action',
    'execute',
    '--action',
    recordRoute.action_id,
    '--payload',
    JSON.stringify({
      typed_blocker_refs: [
        'typed-blocker:app/operator/mag/sustained-consumption-missing/2026-05-28',
      ],
      narrative_summary: 'not a refs-only operator payload field',
    }),
  ], env);
  assert.equal(unknownPayloadExecution.payload.error.code, 'cli_usage_error');
  assert.equal(
    unknownPayloadExecution.payload.error.details.error_kind,
    'owner_evidence_sustained_consumption_payload_unknown_fields',
  );
  assert.deepEqual(
    unknownPayloadExecution.payload.error.details.preflight.unknown_payload_fields,
    ['narrative_summary'],
  );

  const recordExecution = runCli([
    'runtime',
    'action',
    'execute',
    '--action',
    recordRoute.action_id,
    '--payload',
    JSON.stringify({
      typed_blocker_refs: [
        'typed-blocker:app/operator/mag/sustained-consumption-missing/2026-05-28',
      ],
    }),
  ], env).runtime_operator_action_execution;
  assert.equal(
    recordExecution.execution.result
      .owner_evidence_sustained_consumption_ledger_record.status,
    'recorded',
  );

  const verifyDrilldown = runCli(appOperatorFullCommand, env)
    .app_operator_drilldown;
  const verifyRoute = verifyDrilldown.operator_action_routing_refs.refs.find(
    (route: { action_kind: string; domain_id?: string }) =>
      route.action_kind === 'mag_manifest_sustained_consumption_followthrough_receipt_verify'
      && route.domain_id === 'medautogrant',
  );
  assert.ok(verifyRoute);
  assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);

  const verifyExecution = runCli([
    'runtime',
    'action',
    'execute',
    '--action',
    verifyRoute.action_id,
  ], env).runtime_operator_action_execution;
  assert.equal(
    verifyExecution.execution.result
      .owner_evidence_sustained_consumption_ledger_verify.status,
    'verified',
  );
  const ledger = runCli([
    'runtime',
    'mag-manifest-sustained-consumption',
    'list',
  ], env).owner_evidence_sustained_consumption_ledger;
  assert.equal(ledger.surface_kind, 'opl_owner_evidence_sustained_consumption_ledger_projection');
  assert.equal(ledger.receipt_count, 1);
  assert.equal(ledger.verified_receipt_count, 1);
  assert.equal(ledger.authority_boundary.can_create_owner_receipt, false);
  assert.equal(
    ledger.authority_boundary.can_claim_sustained_app_consumption_complete,
    false,
  );
  const finalDrilldown = runCli(appOperatorFullCommand, env)
    .app_operator_drilldown;
  assert.equal(
    finalDrilldown.summary.mag_manifest_sustained_consumption_followthrough_verified_ledger_receipt_ref_count,
    1,
  );
  assert.equal(
    finalDrilldown.mag_manifest_sustained_consumption_followthrough_refs
      .authority_boundary.can_claim_sustained_app_consumption_complete,
    false,
  );
});
