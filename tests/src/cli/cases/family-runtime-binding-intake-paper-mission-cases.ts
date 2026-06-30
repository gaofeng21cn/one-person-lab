import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { familyRuntimeEnv, writeJsonEmitterScript } from './family-runtime-binding-intake-helpers.ts';

test('family-runtime intake enqueues ready MAS PaperMission route handoff as OPL runtime request', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-route-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-route-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    paper_mission_default_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        opl_route_handoff: {
          surface_kind: 'mas_paper_mission_opl_route_handoff_record',
          schema_version: 1,
          source: 'paper-mission-consumption-ledger',
          study_id: '002-dm-china-us-mortality-attribution',
          mission_id: 'paper-mission::002-dm-china-us-mortality-attribution::gate-clearing::manual',
          candidate_ref: 'ops/medautoscience/paper_mission_consumption_ledger/dm002/candidate.json',
          workspace_root: repoRoot,
          domain_workspace_root: repoRoot,
          status: 'accepted_candidate',
          selected_outcome: 'accepted',
          handoff_status: 'ready_for_opl_route_command',
          next_owner: 'one-person-lab',
          paper_mission_transaction_ref: 'paper-mission-transaction:dm002:1',
          route_identity_key: 'paper-mission-transaction:dm002:1::route',
          attempt_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-attempt',
          request_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-request',
          transaction_state: 'materialized',
          opl_route_command_ref: 'ops/medautoscience/paper_mission_consumption_ledger/dm002/opl_route_command.json',
          opl_route_command: {
            command_kind: 'start_next_stage',
            target: 'publication_gate_replay',
            runtime_owner: 'one-person-lab',
          },
          route_command_kind: 'start_next_stage',
          route_target: 'publication_gate_replay',
          transaction_materialized: true,
          can_submit_to_opl_runtime: true,
          can_claim_opl_runtime_enqueued: false,
          can_claim_opl_stage_run_created: false,
          can_claim_provider_running: false,
          can_claim_paper_progress: false,
          can_claim_runtime_ready: false,
          authority_boundary: {
            can_write_owner_receipt: false,
            can_write_typed_blocker: false,
            can_write_human_gate: false,
            can_write_current_package: false,
            can_write_paper_body: false,
            can_write_runtime_queue: false,
            can_write_opl_outbox: false,
            can_write_opl_event: false,
            can_write_opl_stage_run: false,
            can_write_provider_attempt: false,
          },
        },
      },
    ],
    pending_family_tasks_policy: {
      default_paper_mission_queue_source: '/paper_mission_default_tasks',
      legacy_mixed_queue_source: '/pending_family_tasks',
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        default_paper_mission_entry: false,
        paper_mission_default_role: 'diagnostic_or_explicit_owner_handoff',
        payload: {
          study_id: 'stale-legacy',
        },
      },
    ],
  });

  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'paper-mission-route-handoff',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    })).family_runtime_intake;
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot)).family_runtime_queue;
    const exportResult = intake.exports[0];
    const routeIntake = exportResult.paper_mission_route_handoff_intake;

    assert.equal(intake.enqueued_count, 1);
    assert.equal(intake.blocked_count, 0);
    assert.equal(exportResult.exported_count, 1);
    assert.equal(exportResult.enqueued_count, 1);
    assert.equal(exportResult.paper_mission_route_handoff_intake_count, 1);
    assert.equal(exportResult.paper_mission_route_handoff_runtime_intake_ready_count, 1);
    assert.equal(routeIntake.source_path, '/paper_mission_default_tasks');
    assert.equal(routeIntake.legacy_pending_family_tasks_considered, false);
    assert.equal(routeIntake.readbacks[0].status, 'accepted_for_runtime_intake');
    assert.equal(routeIntake.readbacks[0].runtime_start_requested, false);
    assert.equal(routeIntake.readbacks[0].writes_opl_outbox, false);
    assert.equal(routeIntake.readbacks[0].writes_opl_stage_run, false);
    assert.equal(routeIntake.readbacks[0].can_claim_runtime_enqueued, false);
    assert.equal(routeIntake.readbacks[0].can_claim_stage_run_created, false);
    assert.equal(routeIntake.readbacks[0].can_claim_paper_progress, false);
    assert.equal(queue.tasks.length, 1);
    assert.equal(queue.tasks[0].domain_id, 'medautoscience');
    assert.equal(queue.tasks[0].task_kind, 'paper_mission/stage-route');
    assert.equal(queue.tasks[0].source, 'paper-mission-route-handoff');
    assert.equal(
      queue.tasks[0].dedupe_key,
      'paper-mission-route:002-dm-china-us-mortality-attribution:paper-mission-transaction:dm002:1:start_next_stage',
    );
    assert.equal(queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(queue.tasks[0].payload.command_kind, 'start_next_stage');
    assert.equal(queue.tasks[0].payload.route_target, 'publication_gate_replay');
    assert.equal(queue.tasks[0].payload.paper_mission_transaction_ref, 'paper-mission-transaction:dm002:1');
    assert.equal(queue.tasks[0].payload.route_identity_key, 'paper-mission-transaction:dm002:1::route');
    assert.equal(queue.tasks[0].payload.attempt_idempotency_key, 'dm002:gate-clearing:accepted-candidate::opl-attempt');
    assert.equal(queue.tasks[0].payload.stage_run_request.route_identity_key, 'paper-mission-transaction:dm002:1::route');
    assert.equal(queue.tasks[0].payload.stage_run_request.attempt_idempotency_key, 'dm002:gate-clearing:accepted-candidate::opl-attempt');
    assert.equal(queue.tasks[0].payload.workspace_root, repoRoot);
    assert.equal(queue.tasks[0].payload.command_cwd, repoRoot);
    assert.deepEqual(queue.tasks[0].payload.opl_domain_export_context, {
      command_source: 'env_override',
      command_cwd: repoRoot,
    });
    assert.equal(queue.tasks[0].payload.opl_route_handoff_record.handoff_status, 'ready_for_opl_route_command');
    assert.equal(queue.tasks[0].payload.authority_boundary.domain_truth_owner, 'med-autoscience');
    assert.equal(queue.tasks[0].payload.authority_boundary.runtime_owner, 'one-person-lab');
    assert.equal(queue.tasks[0].payload.authority_boundary.writes_owner_receipt, false);
    assert.equal(queue.tasks[0].payload.authority_boundary.writes_typed_blocker, false);
    assert.equal(queue.tasks[0].payload.authority_boundary.can_claim_provider_running, false);
    assert.equal(queue.tasks[0].payload.authority_boundary.can_claim_paper_progress, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake keeps MAS PaperMission typed blocker handoff out of runtime queue', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-typed-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-typed-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    paper_mission_default_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        opl_route_handoff: {
          surface_kind: 'mas_paper_mission_opl_route_handoff_record',
          schema_version: 1,
          source: 'paper-mission-consumption-ledger',
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          mission_id: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::gate-clearing::manual',
          candidate_ref: 'ops/medautoscience/paper_mission_consumption_ledger/dm003/candidate.json',
          status: 'typed_blocker_required',
          selected_outcome: 'typed_blocker',
          handoff_status: 'waiting_for_typed_blocker_authority',
          next_owner: 'one-person-lab',
          paper_mission_transaction_ref: 'paper-mission-transaction:dm003:1',
          transaction_state: 'materialized',
          opl_route_command_ref: 'ops/medautoscience/paper_mission_consumption_ledger/dm003/opl_route_command.json',
          opl_route_command: {
            command_kind: 'stop_with_typed_blocker',
            target: 'paper_mission/typed_blocker_authority',
            runtime_owner: 'one-person-lab',
          },
          route_command_kind: 'stop_with_typed_blocker',
          route_target: 'paper_mission/typed_blocker_authority',
          transaction_materialized: true,
          can_submit_to_opl_runtime: false,
          can_claim_opl_runtime_enqueued: false,
          can_claim_opl_stage_run_created: false,
          can_claim_provider_running: false,
          can_claim_paper_progress: false,
          can_claim_runtime_ready: false,
          authority_boundary: {
            can_write_owner_receipt: false,
            can_write_typed_blocker: false,
            can_write_human_gate: false,
            can_write_current_package: false,
            can_write_paper_body: false,
            can_write_runtime_queue: false,
            can_write_opl_outbox: false,
            can_write_opl_event: false,
            can_write_opl_stage_run: false,
            can_write_provider_attempt: false,
          },
        },
      },
    ],
  });

  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'paper-mission-route-handoff',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    })).family_runtime_intake;
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot)).family_runtime_queue;
    const routeIntake = intake.exports[0].paper_mission_route_handoff_intake;

    assert.equal(intake.enqueued_count, 0);
    assert.equal(intake.blocked_count, 0);
    assert.equal(intake.exports[0].exported_count, 0);
    assert.equal(routeIntake.readbacks[0].status, 'typed_wait');
    assert.equal(routeIntake.readbacks[0].wait_kind, 'typed_blocker_authority');
    assert.equal(routeIntake.readbacks[0].owner_route.route_status, 'owner_wait');
    assert.equal(routeIntake.readbacks[0].owner_route.resolution_owner, 'med-autoscience');
    assert.equal(routeIntake.readbacks[0].owner_route.can_create_typed_blocker, false);
    assert.equal(
      routeIntake.readbacks[0].next_action.action_kind,
      'domain_typed_blocker_resolution_required',
    );
    assert.equal(
      routeIntake.readbacks[0].next_action.payload_requirement,
      'record_domain_typed_blocker_ref_for_mas_paper_mission',
    );
    assert.deepEqual(routeIntake.readbacks[0].next_action.required_return_shapes, [
      'domain_typed_blocker_ref',
      'typed_blocker_ref',
      'owner_chain_ref',
      'no_regression_ref',
    ]);
    assert.equal(
      routeIntake.readbacks[0].handoff_projection.handoff_kind,
      'typed_blocker_authority_handoff',
    );
    assert.equal(
      routeIntake.readbacks[0].handoff_projection.handoff_status,
      'ready_for_owner_consumption',
    );
    assert.equal(
      routeIntake.readbacks[0].handoff_projection.opl_authority_boundary.can_submit_to_runtime_queue,
      false,
    );
    assert.equal(routeIntake.readbacks[0].runtime_start_requested, false);
    assert.equal(routeIntake.readbacks[0].writes_opl_outbox, false);
    assert.equal(routeIntake.readbacks[0].can_claim_runtime_enqueued, false);
    assert.equal(queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake consumes MAS default PaperMission materialized readbacks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-materialized-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-materialized-export-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const exportPath = path.join(fixtureRoot, 'export');
  const dm002TransactionRef = [
    'paper-mission-transaction',
    '002-dm-china-us-mortality-attribution',
    'gate_clearing_claim_evidence_repair',
    'paper-mission::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::one-shot-migration',
  ].join('::');
  const dm003TransactionRef = [
    'paper-mission-transaction',
    '003-dpcc-primary-care-phenotype-treatment-gap',
    'medical_prose_write_repair_publication_gate_replay',
    'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::medical_prose_write_repair_publication_gate_replay::one-shot-migration',
  ].join('::');
  const authorityBoundary = {
    mas_authority_owner: 'MedAutoScience',
    runtime_owner: 'one-person-lab',
    writes_authority_surface: false,
    writes_publication_eval: false,
    writes_controller_decision: false,
    writes_owner_receipt: false,
    writes_typed_blocker: false,
    writes_human_gate: false,
    writes_current_package: false,
    writes_runtime_queue: false,
    writes_provider_attempt: false,
    writes_yang_authority: false,
  };
  const carrierBoundary = {
    mas_can_create_opl_outbox_record: false,
    mas_can_create_opl_event: false,
    mas_can_create_opl_stage_run: false,
    mas_can_authorize_provider_admission: false,
    mas_can_mark_provider_attempt_running: false,
    provider_completion_is_domain_completion: false,
  };
  const materializedPaperMission = (input: {
    studyId: string;
    missionId: string;
    transactionRef: string;
    stageId: string;
    decisionKind: 'advance' | 'typed_blocker';
    status: string;
    routeCommandKind: 'start_next_stage' | 'stop_with_typed_blocker';
    routeTarget: string;
  }) => ({
    surface_kind: 'paper_mission_materialized_readback',
    schema_version: 1,
    source: 'paper-mission start_or_resume default export',
    study_id: input.studyId,
    mission_id: input.missionId,
    materialized_mission_ref: `ops/medautoscience/paper_mission_one_shot_migration/${input.studyId}/paper_mission_run.json`,
    candidate_manifest_ref: `ops/medautoscience/paper_mission_one_shot_migration/${input.studyId}/candidate_manifest.json`,
    workspace_root: workspaceRoot,
    domain_workspace_root: workspaceRoot,
    transaction_state: input.status,
    stage_terminal_decision: input.decisionKind === 'advance'
      ? {
          decision_kind: 'advance',
          status: input.status,
          reason: input.status,
          next_owner: 'analysis-campaign',
          next_stage_id: input.routeTarget,
          accepted_result: 'accepted_candidate',
        }
      : {
          decision_kind: 'typed_blocker',
          status: input.status,
          reason: input.status,
          next_owner: 'one-person-lab',
          blocker_id: input.routeTarget,
          unblock_condition: 'MAS authority kernel consumes or routes back this paper mission candidate',
        },
    opl_route_command: {
      command_kind: input.routeCommandKind,
      target: input.routeTarget,
      reason: input.status,
      source_terminal_decision_ref: `${input.transactionRef}#stage_terminal_decision`,
      stage_run_ref: `opl-stage-run://paper-mission-materialized/${input.studyId}/${input.stageId}`,
      runtime_owner: 'one-person-lab',
    },
    opl_runtime_carrier: {
      surface_kind: 'mas_domain_progress_transition_request',
      paper_mission_transaction_ref: input.transactionRef,
      stage_terminal_decision_ref: `${input.transactionRef}#stage_terminal_decision`,
      opl_route_command_ref: `${input.transactionRef}#opl_route_command`,
      study_id: input.studyId,
      work_unit_id: input.stageId,
      work_unit_fingerprint: `${input.missionId}::${input.stageId}::${input.decisionKind}::${input.status}`,
      route_identity_key: `${input.transactionRef}::route`,
      attempt_idempotency_key: `${input.studyId}::${input.stageId}::${input.status}::opl-attempt`,
      opl_route_command: {
        command_kind: input.routeCommandKind,
        target: input.routeTarget,
        reason: input.status,
        source_terminal_decision_ref: `${input.transactionRef}#stage_terminal_decision`,
        runtime_owner: 'one-person-lab',
      },
      authority_boundary: carrierBoundary,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
      can_write_opl_outbox: false,
      can_write_opl_event: false,
      can_write_opl_stage_run: false,
      can_write_provider_attempt: false,
    },
    paper_mission_transaction: {
      transaction_id: input.transactionRef,
      authority_boundary: authorityBoundary,
    },
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'await_opl_transition_readback',
          provider_admission_requires_opl_runtime_result: true,
        },
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    paper_mission_default_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        study_id: '002-dm-china-us-mortality-attribution',
        payload: {
          study_id: '002-dm-china-us-mortality-attribution',
          paper_mission: materializedPaperMission({
            studyId: '002-dm-china-us-mortality-attribution',
            missionId: 'paper-mission::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::one-shot-migration',
            transactionRef: dm002TransactionRef,
            stageId: 'gate_clearing_claim_evidence_repair',
            decisionKind: 'advance',
            status: 'accepted',
            routeCommandKind: 'start_next_stage',
            routeTarget: 'publication_gate_replay',
          }),
        },
      },
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        payload: {
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          paper_mission: materializedPaperMission({
            studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
            missionId: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::medical_prose_write_repair_publication_gate_replay::one-shot-migration',
            transactionRef: dm003TransactionRef,
            stageId: 'medical_prose_write_repair_publication_gate_replay',
            decisionKind: 'typed_blocker',
            status: 'typed_blocker',
            routeCommandKind: 'stop_with_typed_blocker',
            routeTarget: 'current_owner_route_superseded_by_existing_typed_blocker',
          }),
          opl_domain_progress_transition_request: {
            surface_kind: 'mas_domain_progress_transition_request',
            source_kind: 'paper_mission_transaction_opl_route_command',
            target_runtime_owner: 'one-person-lab',
            target_runtime_kind: 'DomainProgressTransitionRuntime',
            paper_mission_transaction_ref: dm003TransactionRef,
            stage_terminal_decision_ref: `${dm003TransactionRef}#stage_terminal_decision`,
            opl_route_command_ref: `${dm003TransactionRef}#opl_route_command`,
            study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            action_type: 'typed_blocker',
            work_unit_id: 'medical_prose_write_repair_publication_gate_replay',
            work_unit_fingerprint: 'dm003-typed-blocker',
            route_identity_key: `${dm003TransactionRef}::route`,
            attempt_idempotency_key: 'dm003-typed-blocker::opl-attempt',
            request_idempotency_key: 'dm003-typed-blocker::opl-request',
            opl_route_command: {
              command_kind: 'stop_with_typed_blocker',
              target: 'current_owner_route_superseded_by_existing_typed_blocker',
              reason: 'typed_blocker',
              source_terminal_decision_ref: `${dm003TransactionRef}#stage_terminal_decision`,
              runtime_owner: 'one-person-lab',
            },
            authority_boundary: carrierBoundary,
            can_claim_provider_running: false,
            can_claim_paper_progress: false,
            can_claim_runtime_ready: false,
            can_write_opl_outbox: false,
            can_write_opl_event: false,
            can_write_opl_stage_run: false,
            can_write_provider_attempt: false,
          },
        },
      },
    ],
    pending_family_tasks: [
      {
        task_kind: 'domain_owner/default-executor-dispatch',
        default_paper_mission_entry: false,
        paper_mission_default_role: 'diagnostic_or_explicit_owner_handoff',
        payload: {
          study_id: 'stale-legacy',
        },
      },
    ],
  });

  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'paper-mission-materialized-export',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    })).family_runtime_intake;
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot)).family_runtime_queue;
    const exportResult = intake.exports[0];
    const routeIntake = exportResult.paper_mission_route_handoff_intake;

    assert.equal(intake.enqueued_count, 1);
    assert.equal(intake.blocked_count, 0);
    assert.equal(intake.suppressed_count, 2);
    assert.equal(exportResult.exported_count, 1);
    assert.equal(exportResult.paper_mission_legacy_pending_suppressed_count, 1);
    assert.equal(exportResult.paper_mission_current_control_suppressed_count, 1);
    assert.equal(exportResult.paper_mission_route_handoff_intake_count, 2);
    assert.equal(exportResult.paper_mission_route_handoff_runtime_intake_ready_count, 1);
    assert.equal(routeIntake.source_path, '/paper_mission_default_tasks');
    assert.equal(routeIntake.readbacks[0].source_surface_kind, 'paper_mission_materialized_readback');
    assert.equal(routeIntake.readbacks[0].status, 'accepted_for_runtime_intake');
    assert.equal(routeIntake.readbacks[0].study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(routeIntake.readbacks[0].route_target, 'publication_gate_replay');
    assert.equal(routeIntake.readbacks[1].source_surface_kind, 'paper_mission_materialized_readback');
    assert.equal(routeIntake.readbacks[1].status, 'typed_wait');
    assert.equal(routeIntake.readbacks[1].wait_kind, 'typed_blocker_authority');
    assert.equal(queue.tasks.length, 1);
    assert.equal(queue.tasks[0].task_kind, 'paper_mission/stage-route');
    assert.notEqual(queue.tasks[0].task_kind, 'domain_owner/default-executor-dispatch');
    assert.equal(queue.tasks[0].source, 'paper-mission-materialized-export');
    assert.equal(queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(queue.tasks[0].payload.route_target, 'publication_gate_replay');
    assert.equal(
      queue.tasks[0].payload.route_identity_key,
      'paper-mission-transaction::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::paper-mission::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::one-shot-migration::route',
    );
    assert.equal(
      queue.tasks[0].payload.attempt_idempotency_key,
      '002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::accepted::opl-attempt',
    );
    assert.equal(queue.tasks[0].payload.opl_route_handoff_record.source_surface_kind, 'paper_mission_materialized_readback');
    assert.equal(queue.tasks[0].payload.stage_run_request.stage_run_created, false);
    assert.equal(queue.tasks[0].payload.stage_run_request.provider_attempt_requested, false);
    assert.equal(queue.tasks[0].payload.authority_boundary.can_claim_provider_running, false);
    assert.equal(queue.tasks[0].payload.authority_boundary.can_claim_paper_progress, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
