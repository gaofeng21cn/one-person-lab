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
import { buildStageLaunchInvocationProjection } from '../../../../src/modules/runway/family-runtime-launch-invocation.ts';
import { openQueueDb, stableId } from '../../../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/detail-view.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';

function buildReviewStageEvidenceManifest() {
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.family_stage_control_plane = {
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
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          boundary_assumptions: ['reviewer_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:review', role: 'source_scope' }],
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
  return masManifest;
}

function buildReviewStageEvidenceManifestWithPayloadSummary() {
  const masManifest = buildReviewStageEvidenceManifest();
  masManifest.operator_evidence_readiness_projection = {
    surface_kind: 'mas_operator_evidence_readiness_projection',
    production_evidence_scaleout_refs: {},
    opl_expected_receipt_monitor_freshness_handoff: {
      stage_expected_receipt_payload_summary: {
        surface_kind: 'mas_stage_expected_receipt_payload_summary',
        owner: 'med-autoscience',
        consumer: 'one_person_lab',
        status: 'review_stage_refs_ready_with_source_scope_still_operator_owned',
        payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
        payload_path_policy:
          'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
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
            stage_id: 'review',
            sequence: 1,
            payload_kind: 'stage_expected_receipt_or_monitor_freshness_refs',
            current_payload_template: {
              domain_receipt_refs: [],
              monitor_freshness_refs: [],
              runtime_event_refs: [],
              typed_blocker_refs: [],
            },
            success_refs_path_payload: {
              domain_receipt_refs: [
                'mas:review-receipt',
                'mas://receipts/review-owner-instance.json',
              ],
              monitor_freshness_refs: ['metric:review/currentness'],
              runtime_event_refs: ['runtime_event:review.receipt_recorded'],
            },
            typed_blocker_path_payload: {
              typed_blocker_refs: [
                'typed-blocker:mas/review/stage-evidence/source-scope-pending',
              ],
            },
            operator_payload_submitted: false,
            recommended_current_payload_path: 'success_refs_path',
          },
        ],
      },
    },
  };
  return masManifest;
}

function bindReviewStageEvidenceManifest(stateRoot: string, fixtureContractsRoot: string) {
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    repoRoot,
    '--manifest-command',
    buildManifestCommand(buildReviewStageEvidenceManifest()),
  ], {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
}

function readFullAppOperatorProjection(stateRoot: string, fixtureContractsRoot: string) {
  return runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], { // reuse-first: allow existing public CLI projection command in tests.
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  }).app_operator_drilldown;
}

function seedStageAttempt(input: Parameters<typeof createStageAttempt>[1]) {
  const { db } = openQueueDb();
  try {
    const providerKind = input.providerKind ?? 'local_sqlite';
    const sourceFingerprint = input.sourceFingerprint?.trim() || null;
    const taskId = input.taskId?.trim() || null;
    const launchInvocation = input.executorBindingRef
      ? buildStageLaunchInvocationProjection({
          domainId: input.domainId,
          stageId: input.stageId,
          providerKind,
          workspaceLocator: input.workspaceLocator,
          sourceFingerprint,
          executorKind: input.executorKind,
          executorBindingRef: input.executorBindingRef,
          invocationMode: input.invocationMode,
          boundedEditRef: input.boundedEditRef,
          taskId,
          idempotencyKey: stableId('idem', [
            input.domainId,
            input.stageId,
            providerKind,
            input.workspaceLocator,
            sourceFingerprint,
            taskId,
          ]),
          requireStageAdmission: false,
        })
      : undefined;
    return createStageAttempt(db, { ...input, launchInvocation }).attempt;
  } finally {
    db.close();
  }
}

test('stage production evidence consumes older ledger attempts beyond default workbench list', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-production-full-ledger-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const magManifest = structuredClone(loadFamilyManifestFixtures().medautogrant);
  const magManifestPayload = magManifest.product_entry_manifest as Record<string, unknown>;
  magManifestPayload.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autogrant_stage_control_plane',
    target_domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'fundability_strategy',
        stage_kind: 'planning',
        title: 'Fundability strategy',
        summary: 'Review grant fit from explicit refs.',
        goal: 'Return fundability strategy refs under MAG authority.',
        owner: 'med-autogrant',
        domain_stage_refs: ['fundability_strategy'],
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
          requires: ['grant_profile_ready'],
          ensures: ['fundability_strategy_ready'],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          boundary_assumptions: ['fundability_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:fundability_strategy.ai_decision_gate_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:fundability/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:fundability', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:fundability/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:fundability/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:fundability/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'ai_decision',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:fundability_strategy.ai_decision_gate_recorded'],
          owner_receipt_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['receipt:mag/fundability/owner-receipt-or-typed-blocker'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(magManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    process.env.OPL_STATE_DIR = stateRoot;
    seedStageAttempt({
      domainId: 'medautogrant',
      stageId: 'fundability_strategy',
      providerKind: 'temporal',
      workspaceLocator: {
        surface_kind: 'opl_stage_production_attempt_request_workspace_locator',
        domain_id: 'med-autogrant',
        command_domain_id: 'medautogrant',
        stage_id: 'fundability_strategy',
        workspace_binding_required: true,
        source: 'test_stage_production_request',
      },
      executorKind: 'codex_cli',
      executorBindingRef: 'opl://executors/codex-cli/default',
    });

    for (let index = 0; index < 26; index += 1) {
      seedStageAttempt({
        domainId: 'medautoscience',
        stageId: `overflow_${index}`,
        providerKind: 'local_sqlite',
        workspaceLocator: { workspace_root: `/tmp/overflow-${index}` },
        newAttempt: true,
      });
    }

    const projection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_tray_snapshot;
    const stageProductionEvidence = projection.stage_production_evidence.stages.find(
      (stage: { target_domain_id: string; stage_id: string }) =>
        stage.target_domain_id === 'med-autogrant'
        && stage.stage_id === 'fundability_strategy',
    );
    assert.equal(stageProductionEvidence.stage_attempt_refs.length, 1);
    assert.equal(snapshot.stage_attempt_workbench.attempts.length, 25);
    assert.equal(snapshot.stage_attempt_workbench.evidence_attempt_count, 27);
    assert.equal(snapshot.stage_attempt_workbench.attempt_list_limit, 25);
    assert.equal(
      stageProductionEvidence.missing_production_evidence.includes('production_caller_attempt_not_observed'),
      false,
    );
    assert.equal(
      stageProductionEvidence.missing_production_evidence.includes('selected_executor_binding_not_observed'),
      false,
    );
    assert.deepEqual(stageProductionEvidence.selected_executor_kinds, ['codex_cli']);
    assert.deepEqual(stageProductionEvidence.executor_binding_refs, ['opl://executors/codex-cli/default']);
    assert.equal(stageProductionEvidence.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute records and verifies stage production evidence receipts through OPL ledger only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-stage-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindReviewStageEvidenceManifest(stateRoot, fixtureContractsRoot);

    const projection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    assert.equal(projection.summary.stage_production_evidence_receipt_action_route_count, 1);
    assert.equal(
      projection.summary.stage_production_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(
      projection.summary.stage_production_evidence_receipt_record_payload_template_count,
      1,
    );
    assert.equal(
      projection.summary.stage_production_evidence_payload_workorder_count,
      1,
    );
    const route = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:record',
    );
    assert.equal(route.action_kind, 'stage_production_evidence_receipt_record');
    assert.equal(route.request_id, 'stage_production_evidence:medautoscience:review');
    assert.equal(route.request_pack_id, 'medautoscience.stage_production_evidence');
    assert.deepEqual(route.required_evidence_refs, [
      'mas:review-receipt',
      'owner_receipt:review',
      'source:review',
      'runtime_event:review.receipt_recorded',
      'metric:review/currentness',
    ]);
    assert.equal(route.creates_domain_action, false);
    assert.equal(route.creates_owner_receipt, false);
    assert.equal(route.closes_expected_receipt_refs, false);
    assert.equal(route.closes_monitor_freshness, false);
    assert.equal(
      route.route_status_detail,
      'record_route_available_waiting_for_domain_app_or_live_refs_payload',
    );
    assert.equal(
      route.open_reason,
      'unobserved_stage_evidence_refs_require_domain_app_or_live_payload_before_closure',
    );
    assert.equal(
      route.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness',
    );
    assert.equal(route.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.can_close_without_domain_or_app_payload, false);
    assert.deepEqual(route.payload_template, {
      domain_receipt_refs: [],
      evidence_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
      source_scope_refs: [],
      runtime_event_refs: [],
    });
    assert.deepEqual(route.payload_ref_hints.domain_receipt_refs_should_cover, [
      'mas:review-receipt',
      'owner_receipt:review',
    ]);
    assert.deepEqual(route.payload_ref_hints.evidence_refs_should_cover_monitor_freshness, [
      'metric:review/currentness',
    ]);
    assert.deepEqual(route.payload_ref_hints.required_any_payload_refs, [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
      'source_scope_refs',
      'runtime_event_refs',
    ]);
    assert.deepEqual(route.payload_ref_hints.source_scope_refs_should_cover, ['source:review']);
    assert.deepEqual(route.payload_ref_hints.runtime_event_refs_should_cover, [
      'runtime_event:review.receipt_recorded',
    ]);
    assert.equal(route.payload_ref_hints.typed_blocker_refs_may_close_instead_of_success, true);
    assert.equal(
      route.payload_template_policy,
      'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit',
    );
    assert.equal(
      route.payload_preflight_policy,
      'opl_preflights_stage_evidence_payload_before_recording_refs_only_receipt',
    );
    assert.equal(route.payload_workorder.surface_kind, 'opl_stage_production_evidence_payload_workorder');
    assert.deepEqual(route.payload_workorder.success_path_requires.domain_receipt_refs_cover, [
      'mas:review-receipt',
    ]);
    assert.deepEqual(route.payload_workorder.success_path_requires.source_scope_refs_cover, [
      'source:review',
    ]);
    assert.deepEqual(route.payload_workorder.success_path_requires.runtime_event_refs_cover, [
      'runtime_event:review.receipt_recorded',
    ]);
    assert.deepEqual(
      route.payload_workorder.success_path_requires.domain_receipt_instance_required_for_declared_refs,
      ['owner_receipt:review'],
    );
    assert.equal(
      route.opl_generated_receipt_policy,
      'OPL_must_not_generate_domain_owner_receipts_monitor_freshness_or_no_regression_refs',
    );
    assert.equal(route.authority_boundary.can_write_domain_truth, false);

    const blockedTemplateExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify(route.payload_template),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(blockedTemplateExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      blockedTemplateExecution.payload.error.details.preflight.status,
      'blocked',
    );
    assert.deepEqual(
      blockedTemplateExecution.payload.error.details.preflight.uncovered_expected_receipt_refs,
      ['mas:review-receipt', 'owner_receipt:review'],
    );
    assert.deepEqual(
      blockedTemplateExecution.payload.error.details.preflight.uncovered_source_scope_refs,
      ['source:review'],
    );
    assert.deepEqual(
      blockedTemplateExecution.payload.error.details.preflight.uncovered_runtime_event_refs,
      ['runtime_event:review.receipt_recorded'],
    );

    const halfCoveredExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['metric:review/currentness'],
        domain_receipt_refs: ['mas:review-receipt', 'mas://receipts/review-owner-instance.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.deepEqual(
      halfCoveredExecution.payload.error.details.preflight.uncovered_source_scope_refs,
      ['source:review'],
    );
    assert.deepEqual(
      halfCoveredExecution.payload.error.details.preflight.uncovered_runtime_event_refs,
      ['runtime_event:review.receipt_recorded'],
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['metric:review/currentness'],
        domain_receipt_refs: ['mas:review-receipt', 'mas://receipts/review-owner-instance.json'],
        source_scope_refs: ['source:review'],
        runtime_event_refs: ['runtime_event:review.receipt_recorded'],
        no_regression_refs: ['mas:no-regression:review-currentness'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(
      recordExecution.execution.result.stage_production_evidence_payload_preflight.status,
      'ready_to_record',
    );
    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recordExecution.execution.result.external_evidence_apply.authority_boundary.opl_records_refs_only, true);
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);

    const recordedProjection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    const verifyRoute = recordedProjection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:verify',
    );
    assert.equal(verifyRoute.action_kind, 'stage_production_evidence_receipt_verify');
    assert.equal(verifyRoute.closes_expected_receipt_refs, true);
    assert.equal(verifyRoute.closes_monitor_freshness, true);
    assert.equal(
      verifyRoute.route_status_detail,
      'verify_route_available_for_recorded_refs_only_stage_evidence_receipt',
    );
    assert.equal(
      verifyRoute.payload_requirement,
      'previously_recorded_opl_refs_only_receipt_required_to_verify_stage_evidence',
    );
    assert.equal(verifyRoute.payload_owner, 'opl_external_evidence_ledger');
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.can_close_without_domain_or_app_payload, true);
    assert.equal(verifyRoute.payload_template, null);
    assert.equal(verifyRoute.payload_ref_hints, null);
    assert.equal(
      verifyRoute.payload_template_policy,
      'verify_route_uses_previously_recorded_opl_refs_only_receipt_no_payload_required',
    );
    assert.equal(
      recordedProjection.summary.stage_production_evidence_receipt_record_requires_domain_or_app_payload_count,
      0,
    );
    assert.equal(
      recordedProjection.summary.stage_production_evidence_receipt_record_payload_template_count,
      0,
    );
    assert.equal(
      recordedProjection.summary.stage_production_evidence_payload_workorder_count,
      0,
    );

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.status, 'verified');
    assert.equal(
      verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs.includes('mas:review-receipt'),
      true,
    );

    const verifiedProjection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    const stage = verifiedProjection.stage_production_evidence.stages.find(
      (entry: { stage_id: string }) => entry.stage_id === 'review',
    );
    assert.equal(stage.stage_evidence_receipt_status, 'verified');
    assert.deepEqual(stage.observed_expected_receipt_refs, [
      'mas:review-receipt',
      'mas://receipts/review-owner-instance.json',
    ]);
    assert.deepEqual(stage.monitor_freshness_refs, ['metric:review/currentness']);
    assert.deepEqual(stage.observed_source_scope_refs, ['source:review']);
    assert.deepEqual(stage.unobserved_source_scope_refs, []);
    assert.deepEqual(stage.observed_runtime_event_refs, ['runtime_event:review.receipt_recorded']);
    assert.deepEqual(stage.unobserved_runtime_event_refs, []);
    assert.equal(
      stage.missing_production_evidence.includes('expected_receipt_ref_not_observed'),
      false,
    );
    assert.equal(
      stage.missing_production_evidence.includes('source_scope_ref_not_observed'),
      false,
    );
    assert.equal(
      stage.missing_production_evidence.includes('runtime_event_ref_not_observed'),
      false,
    );
    assert.equal(
      stage.missing_production_evidence.includes('monitor_freshness_ref_not_observed'),
      false,
    );
    assert.equal(stage.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(verifiedProjection.summary.stage_production_evidence_receipt_action_route_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('stage evidence record route projects domain stage payload candidates without closing the route', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-payload-candidates-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(buildReviewStageEvidenceManifestWithPayloadSummary()),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    const route = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:record',
    );
    assert.equal(route.action_kind, 'stage_production_evidence_receipt_record');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.can_close_without_domain_or_app_payload, false);
    assert.equal(route.payload_workorder.authority_boundary.opl_can_generate_domain_owner_receipt, false);
    assert.equal(route.payload_workorder.authority_boundary.opl_can_generate_monitor_freshness, false);

    const candidates = route.payload_ref_hints.domain_owner_payload_candidate_refs;
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].candidate_kind, 'domain_owner_payload_summary_stage_expected_receipt');
    assert.equal(candidates[0].stage_id, 'review');
    assert.equal(candidates[0].recommended_current_payload_path, 'success_refs_path');
    assert.deepEqual(candidates[0].stage_evidence_record_success_payload, {
      domain_receipt_refs: [
        'mas:review-receipt',
        'mas://receipts/review-owner-instance.json',
      ],
      evidence_refs: ['metric:review/currentness'],
      source_scope_refs: [],
      runtime_event_refs: ['runtime_event:review.receipt_recorded'],
      typed_blocker_refs: [],
    });
    assert.deepEqual(candidates[0].stage_evidence_record_typed_blocker_payload, {
      domain_receipt_refs: [],
      evidence_refs: [],
      typed_blocker_refs: [
        'typed-blocker:mas/review/stage-evidence/source-scope-pending',
      ],
    });
    assert.deepEqual(candidates[0].covered_required_refs.domain_receipt_refs, [
      'mas:review-receipt',
    ]);
    assert.deepEqual(candidates[0].missing_required_refs_after_candidate.source_scope_refs, [
      'source:review',
    ]);
    assert.equal(candidates[0].candidate_is_completion_evidence, false);
    assert.equal(candidates[0].route_can_auto_close_from_candidate, false);
    assert.deepEqual(route.payload_workorder.domain_owner_payload_candidate_refs, candidates);

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
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    const workorder = worklist.stage_evidence_workorder_packet.workorders.find(
      (entry: { action_id: string }) =>
        entry.action_id === 'stage-production-evidence:medautoscience:review:record',
    );
    assert.deepEqual(workorder.payload_workorder.domain_owner_payload_candidate_refs, candidates);
    assert.equal(workorder.route_requires_domain_or_app_payload, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('verified stage evidence receipt can reopen record route when source scope or runtime events remain uncovered', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-closeout-scope-reopen-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindReviewStageEvidenceManifest(stateRoot, fixtureContractsRoot);
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
      'mas-stage-review-legacy-receipt',
      '--evidence-ref',
      'metric:review/currentness',
      '--domain-receipt-ref',
      'mas:review-receipt',
      '--domain-receipt-ref',
      'mas://receipts/review-owner-instance.json',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
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
      'mas-stage-review-legacy-receipt',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    const route = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:record',
    );
    assert.equal(route.action_kind, 'stage_production_evidence_receipt_record');
    assert.deepEqual(route.required_evidence_refs, [
      'source:review',
      'runtime_event:review.receipt_recorded',
    ]);
    assert.deepEqual(route.payload_ref_hints.source_scope_refs_should_cover, ['source:review']);
    assert.deepEqual(route.payload_ref_hints.runtime_event_refs_should_cover, [
      'runtime_event:review.receipt_recorded',
    ]);
    const stage = projection.stage_production_evidence.stages.find(
      (entry: { stage_id: string }) => entry.stage_id === 'review',
    );
    assert.deepEqual(stage.observed_expected_receipt_refs, [
      'mas:review-receipt',
      'mas://receipts/review-owner-instance.json',
    ]);
    assert.deepEqual(stage.unobserved_source_scope_refs, ['source:review']);
    assert.deepEqual(stage.unobserved_runtime_event_refs, ['runtime_event:review.receipt_recorded']);
    assert.equal(
      stage.missing_production_evidence.includes('runtime_event_ref_not_observed'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('verified typed-blocker stage evidence receipt keeps record route open for later owner refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-evidence-typed-blocker-supersede-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    bindReviewStageEvidenceManifest(stateRoot, fixtureContractsRoot);
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
      'mas-stage-review-typed-blocker-receipt',
      '--typed-blocker-ref',
      'mas-stage-typed-blocker:review:owner-receipt-or-monitor-freshness-pending',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
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
      'mas-stage-review-typed-blocker-receipt',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = readFullAppOperatorProjection(stateRoot, fixtureContractsRoot);
    const stage = projection.stage_production_evidence.stages.find(
      (entry: { stage_id: string }) => entry.stage_id === 'review',
    );
    assert.equal(stage.stage_evidence_receipt_status, 'verified');
    assert.deepEqual(stage.observed_expected_receipt_refs, []);
    assert.deepEqual(stage.domain_owned_typed_blocker_refs, [
      'mas-stage-typed-blocker:review:owner-receipt-or-monitor-freshness-pending',
    ]);
    assert.equal(
      stage.evidence_obligations.some(
        (obligation: { obligation_id: string; status: string }) =>
          obligation.obligation_id === 'expected_receipt'
          && obligation.status === 'blocked_by_domain_owned_typed_blocker',
      ),
      true,
    );

    const route = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:record',
    );
    assert.equal(route.action_kind, 'stage_production_evidence_receipt_record');
    assert.equal(route.stage_evidence_receipt_status, 'verified');
    assert.deepEqual(route.stage_evidence_receipt_refs, ['mas-stage-review-typed-blocker-receipt']);
    assert.deepEqual(route.verified_stage_evidence_receipt_refs, ['mas-stage-review-typed-blocker-receipt']);
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.deepEqual(route.payload_ref_hints.domain_receipt_refs_should_cover, [
      'mas:review-receipt',
      'owner_receipt:review',
    ]);
    assert.deepEqual(route.payload_ref_hints.evidence_refs_should_cover_monitor_freshness, [
      'metric:review/currentness',
    ]);
    assert.equal(
      projection.summary.stage_production_evidence_payload_workorder_count,
      0,
    );
    assert.notEqual(
      projection.attention_first_payload.next_safe_action?.action_id,
      'stage-production-evidence:medautoscience:review:record',
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['metric:review/currentness'],
        domain_receipt_refs: ['mas:review-receipt', 'mas://receipts/review-owner-instance.json'],
        source_scope_refs: ['source:review'],
        runtime_event_refs: ['runtime_event:review.receipt_recorded'],
        owner_chain_refs: ['mas://owner-chain/review/live-success'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;
    assert.equal(
      recordExecution.execution.result.stage_production_evidence_payload_preflight.status,
      'ready_to_record',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('App projection does not select typed-blocker-closed stage evidence record route as default next action', () => {
  const actionId = 'stage-production-evidence:medautogrant:package_and_submit_ready:record';
  const route = {
    ref: 'opl agents evidence apply --domain medautogrant --request-id stage_production_evidence:medautogrant:package_and_submit_ready',
    action_id: actionId,
    action_kind: 'stage_production_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    route_status: 'record_route_available',
    route_status_detail: 'record_route_available_waiting_for_domain_app_or_live_refs_payload',
    stage_evidence_receipt_status: 'verified',
    verified_stage_evidence_receipt_refs: [
      'opl://external-evidence/medautogrant/stage_production_evidence:medautogrant:package_and_submit_ready',
    ],
    evidence_obligation_summary: {
      obligation_count: 6,
      closed_count: 4,
      open_count: 0,
      blocked_by_domain_typed_blocker_count: 2,
    },
    route_requires_domain_or_app_payload: true,
    payload_requirement:
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness',
    payload_owner: 'domain_repository_or_app_live_operator',
    domain_id: 'medautogrant',
    target_domain_id: 'med-autogrant',
    project_id: 'medautogrant',
    stage_id: 'package_and_submit_ready',
    missing_production_evidence: [
      'expected_receipt_ref_not_observed',
      'monitor_freshness_ref_not_observed',
    ],
  };
  const projection = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [route],
    },
    app_execution_bridge: {
      safe_action_routes: [{
        ...route,
        action_ref: route.ref,
        submit_via: 'opl runtime action execute',
        can_submit_to_safe_action_shell: true,
        dry_run_supported: true,
      }],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'summary');

  assert.equal(projection.attention_first_payload.next_safe_action, null);
});
