import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, shellSingleQuote, test, writeMasCleanRunnerFixture } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function writeJsonEmitterScript(scriptPath: string, payload: unknown, options: {
  cwdPath?: string;
  argvPath?: string;
} = {}) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      options.cwdPath ? `printf '%s\\n' "$PWD" > ${shellSingleQuote(options.cwdPath)}` : '',
      options.argvPath ? `: > ${shellSingleQuote(options.argvPath)}` : '',
      options.argvPath ? `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(options.argvPath)}; done` : '',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify(payload, null, 2)}\n`)});`)}`,
      '',
    ].filter(Boolean).join('\n'),
    { mode: 0o755 },
  );
}

function writeNodeScript(scriptPath: string, source: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(source)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

test('family-runtime intake derives MAS domain-handler export from active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-'));
  const masWorkspacePath = path.join(fixtureRoot, 'med-autoscience');
  const profilePath = path.join(fixtureRoot, 'nfpitnet.workspace.toml');
  const proofPath = path.join(stateRoot, 'family-runtime', 'proofs', 'latest-temporal-production-proof.json');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  fs.mkdirSync(masWorkspacePath, { recursive: true });
  writeMasCleanRunnerFixture(masWorkspacePath);
  fs.writeFileSync(profilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, '{"closeout_status":"production_residency_proven"}\n', 'utf8');
  writeJsonEmitterScript(uvPath, {
    surface_kind: 'mas_family_domain_handler_export',
    provider_guarded_soak: {
      status: 'available',
      provider_attempt_available: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        dispatch_owner: 'med-autoscience',
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM002',
          provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
    ],
  }, {
    cwdPath: uvCwdPath,
    argvPath: uvArgvPath,
  });
  const env = familyRuntimeEnv(stateRoot, {
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspacePath,
      '--profile',
      profilePath,
    ], env);
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'binding-derived-export',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');
    assert.equal(exportResult.command_source, 'workspace_binding');
    assert.equal(exportResult.command_cwd, path.resolve(masWorkspacePath));
    assert.deepEqual(exportResult.command_preview, [
      'uv',
      'run',
      'python',
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      path.resolve(profilePath),
      '--opl-production-proof',
      path.resolve(proofPath),
      '--format',
      'json',
    ]);
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(path.resolve(masWorkspacePath)),
    );
    assert.deepEqual(uvArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.provider_attempt_id, 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
          status: 'accepted_candidate',
          selected_outcome: 'accepted',
          handoff_status: 'ready_for_opl_route_command',
          next_owner: 'one-person-lab',
          paper_mission_transaction_ref: 'paper-mission-transaction:dm002:1',
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

test('family-runtime profile hydrate resolves MAS export through OPL module checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const runnerArgvPath = path.join(fixtureRoot, 'runner.argv');
  const runnerCwdPath = path.join(fixtureRoot, 'runner.cwd');
  const medautosciPath = path.join(fixtureRoot, 'medautosci');
  const uvPath = path.join(fixtureRoot, 'uv');
  const legacyPathHitPath = path.join(fixtureRoot, 'legacy-path-hit');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(runnerCwdPath)}`,
        `: > ${shellSingleQuote(runnerArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(runnerArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'med-autoscience',
              recommended_task_kind: 'domain_route/reconcile-apply',
              priority: 55,
              source: 'mas-runtime-owner-route',
              dedupe_key: 'mas:dm002:owner-route:quest_waiting_opl_runtime_owner_route',
              owner_route_ref: 'quest_waiting_opl_runtime_owner_route',
              runtime_state_path: 'studies/002-dm-china-us-mortality-attribution/runtime/state.json',
              reason: 'quest_waiting_opl_runtime_owner_route',
              payload: {
                profile: 'dm-cvd.workspace.toml',
                study_id: '002-dm-china-us-mortality-attribution',
                source_fingerprint: 'unit-harmonized-route',
              },
            },
          ],
        }, null, 2)}\n`)});`)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    medautosciPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-medautosci-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'dm002-profile-hydrate',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const exportResult = intake.family_runtime_intake.exports[0];
    const runnerArgv = fs.readFileSync(runnerArgvPath, 'utf8').trim().split('\n');
    const runnerPath = path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      runnerPath,
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      profilePath,
      '--format',
      'json',
    ]);
    assert.equal(fs.existsSync(legacyPathHitPath), false);
    assert.equal(
      fs.realpathSync(fs.readFileSync(runnerCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(runnerArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'domain_route/reconcile-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.reason, 'quest_waiting_opl_runtime_owner_route');
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake --profile overrides active MAS workspace binding', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cli-profile-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cli-profile-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const boundMasWorkspacePath = path.join(fixtureRoot, 'bound-med-autoscience');
  const boundProfilePath = path.join(fixtureRoot, 'nfpitnet.workspace.toml');
  const explicitProfilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const runnerArgvPath = path.join(fixtureRoot, 'runner.argv');
  const runnerCwdPath = path.join(fixtureRoot, 'runner.cwd');
  const uvPath = path.join(fixtureRoot, 'uv');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(runnerCwdPath)}`,
        `: > ${shellSingleQuote(runnerArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(runnerArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'medautoscience',
              task_kind: 'domain_route/reconcile-apply',
              priority: 55,
              source: 'dm002-explicit-profile-owner-route',
              dedupe_key: 'mas:dm-cvd:002-dm-china-us-mortality-attribution:owner-route',
              dispatch_owner: 'med-autoscience',
              payload: {
                profile: 'dm-cvd.workspace.toml',
                study_id: '002-dm-china-us-mortality-attribution',
                reason: 'runtime_controller_redrive_required',
              },
            },
          ],
        }, null, 2)}\n`)});`)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.mkdirSync(boundMasWorkspacePath, { recursive: true });
  writeMasCleanRunnerFixture(boundMasWorkspacePath);
  fs.writeFileSync(boundProfilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.writeFileSync(explicitProfilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' >&2
exit 44
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(stateRoot, {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      boundMasWorkspacePath,
      '--profile',
      boundProfilePath,
    ], env);
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--profile',
      explicitProfilePath,
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--source',
      'dm002-cli-profile-override',
    ], env);
    const exportResult = intake.family_runtime_intake.exports[0];
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const runnerArgv = fs.readFileSync(runnerArgvPath, 'utf8').trim().split('\n');
    const runnerPath = path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.deepEqual(exportResult.command_preview, [
      runnerPath,
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      explicitProfilePath,
      '--format',
      'json',
    ]);
    assert.match(exportResult.command_preview.join(' '), /dm-cvd\.workspace\.toml/);
    assert.doesNotMatch(exportResult.command_preview.join(' '), /nfpitnet\.workspace\.toml/);
    assert.equal(
      fs.realpathSync(fs.readFileSync(runnerCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.deepEqual(runnerArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(
      queue.family_runtime_queue.tasks[0].payload.opl_domain_export_context.command_source,
      'module_exec_profile',
    );
    assert.match(
      queue.family_runtime_queue.tasks[0].payload.opl_domain_export_context.owner_fingerprint,
      /dm-cvd\.workspace\.toml/,
    );
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime profile tick dispatches MAS tasks through OPL module checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-dispatch-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-dispatch-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const uvPath = path.join(fixtureRoot, 'uv');
  const medautosciPath = path.join(fixtureRoot, 'medautosci');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  const legacyPathHitPath = path.join(fixtureRoot, 'legacy-dispatch-hit');
  const moduleRunnerSource = `
const fs = require('node:fs');
const args = process.argv.slice(1);
fs.writeFileSync(${jsString(uvCwdPath)}, process.cwd() + '\\n');
fs.writeFileSync(${jsString(uvArgvPath)}, args.map(String).join('\\n') + '\\n');
const joined = \` \${args.join(' ')} \`;
if (joined.includes(' domain-handler export ')) {
  process.stdout.write(JSON.stringify({
    surface_kind: 'mas_family_domain_handler_export',
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/repair-recheck',
        priority: 60,
        source: 'mas-runtime-owner-route',
        dedupe_key: 'mas:dm003:repair-recheck:medical_prose_write_repair',
        dispatch_owner: 'med-autoscience',
        payload: {
          profile: 'dm-cvd.workspace.toml',
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          repair_work_unit: {
            work_unit_id: 'medical_prose_write_repair',
            source_fingerprint: 'medical-prose-write-repair-v1',
          },
        },
      },
    ],
  }, null, 2) + '\\n');
  process.exit(0);
}
if (joined.includes(' domain-handler dispatch ')) {
  const taskIndex = args.indexOf('--task');
  const taskPath = taskIndex >= 0 ? args[taskIndex + 1] : null;
  if (!taskPath) {
    process.stderr.write('missing --task\\n');
    process.exit(64);
  }
  fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
  process.stdout.write(JSON.stringify({
    accepted: true,
    surface_kind: 'mas_family_domain_handler_dispatch_receipt',
    receipt_ref: 'receipt:dm003/module-dispatch',
  }) + '\\n');
  process.exit(0);
}
process.stderr.write(\`unexpected MAS clean runner command: \${args.join(' ')}\\n\`);
process.exit(64);
`;
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(moduleRunnerSource)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    medautosciPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-medautosci-was-called\\n' > ${shellSingleQuote(legacyPathHitPath)}
exit 44
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
  });
  try {
    const tick = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm003-profile-module-dispatch',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ], env);
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.deepEqual(tick.family_runtime_tick.dispatches[0].command_preview, [
      path.join(masFixture.sourceRoot, 'scripts', 'run-python-clean.sh'),
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'dispatch',
      '--task',
      tick.family_runtime_tick.dispatches[0].command_preview[6],
      '--format',
      'json',
    ]);
    assert.equal(fs.existsSync(legacyPathHitPath), false);
    assert.equal(fs.existsSync(uvCwdPath), true);
    assert.deepEqual(uvArgv, tick.family_runtime_tick.dispatches[0].command_preview.slice(1));
    assert.equal(dispatchedTask.payload.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(dispatchedTask.payload.repair_work_unit.work_unit_id, 'medical_prose_write_repair');
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydrate consumes MAS scaleout guarded apply tasks as domain-owned exports', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-scaleout-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-scaleout-'));
  const exportPath = path.join(fixtureRoot, 'export');
  writeJsonEmitterScript(exportPath, {
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 30,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        source_fingerprint: 'fingerprint-dm002',
        dispatch_owner: 'med-autoscience',
        profile_name: 'nfpitnet',
        source_refs: [
          { role: 'mas_owner_controller_decision', ref: 'studies/DM002/artifacts/controller_decisions/latest.json', exists: false },
        ],
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM002',
          target_studies: ['DM002'],
          provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
          idempotency_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 30,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM003:provider-hosted-guarded-apply:opl-temporal',
        source_fingerprint: 'fingerprint-dm003',
        dispatch_owner: 'med-autoscience',
        profile_name: 'nfpitnet',
        source_refs: [
          { role: 'mas_owner_controller_decision', ref: 'studies/DM003/artifacts/controller_decisions/latest.json', exists: false },
        ],
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM003',
          target_studies: ['DM003'],
          provider_attempt_id: 'opl-temporal:nfpitnet:DM003:provider-hosted-guarded-apply',
          idempotency_key: 'mas:nfpitnet:DM003:provider-hosted-guarded-apply:opl-temporal',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 30,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:Obesity:provider-hosted-guarded-apply:opl-temporal',
        source_fingerprint: 'fingerprint-obesity',
        dispatch_owner: 'med-autoscience',
        profile_name: 'nfpitnet',
        source_refs: [
          { role: 'mas_owner_controller_decision', ref: 'studies/Obesity/artifacts/controller_decisions/latest.json', exists: false },
        ],
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'Obesity',
          target_studies: ['Obesity'],
          provider_attempt_id: 'opl-temporal:nfpitnet:Obesity:provider-hosted-guarded-apply',
          idempotency_key: 'mas:nfpitnet:Obesity:provider-hosted-guarded-apply:opl-temporal',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
    ],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;
    const tasksByStudy = Object.fromEntries(tasks.map((task: { payload: { study_id: string } }) => [
      task.payload.study_id,
      task,
    ]));

    assert.equal(intake.family_runtime_intake.enqueued_count, 3);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 3);
    assert.deepEqual(Object.keys(tasksByStudy).sort(), ['DM002', 'DM003', 'Obesity']);
    assert.equal(tasksByStudy.DM002.payload.source_fingerprint, 'fingerprint-dm002');
    assert.equal(tasksByStudy.DM003.payload.source_fingerprint, 'fingerprint-dm003');
    assert.equal(tasksByStudy.Obesity.payload.source_fingerprint, 'fingerprint-obesity');
    assert.equal(tasksByStudy.DM002.paper_autonomy.source_fingerprint, 'fingerprint-dm002');
    assert.equal(tasksByStudy.DM003.paper_autonomy.source_fingerprint, 'fingerprint-dm003');
    assert.equal(tasksByStudy.Obesity.paper_autonomy.source_fingerprint, 'fingerprint-obesity');
    assert.equal(tasksByStudy.DM003.payload.dispatch_owner, 'med-autoscience');
    assert.equal(tasksByStudy.Obesity.payload.source_refs[0].ref, 'studies/Obesity/artifacts/controller_decisions/latest.json');
    assert.deepEqual(
      tasks.map((task: { task_kind: string }) => task.task_kind),
      [
        'paper_autonomy/guarded-apply',
        'paper_autonomy/guarded-apply',
        'paper_autonomy/guarded-apply',
      ],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime requeues terminal MAS tasks when exported provider evidence changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-requeue-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-requeue-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  writeNodeScript(exportPath, `
const fs = require('node:fs');
const fingerprint = fs.readFileSync(${jsString(path.join(fixtureRoot, 'fingerprint'))}, 'utf8').trim();
const proofRef = fs.readFileSync(${jsString(path.join(fixtureRoot, 'proof-ref'))}, 'utf8').trim();
process.stdout.write(JSON.stringify({
  pending_family_tasks: [
    {
      domain_id: 'medautoscience',
      task_kind: 'paper_autonomy/guarded-apply',
      priority: 30,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
      source_fingerprint: fingerprint,
      dispatch_owner: 'med-autoscience',
      profile_name: 'nfpitnet',
      source_refs: [
        { role: 'opl_production_proof', ref: proofRef, exists: true },
      ],
      payload: {
        profile: '/tmp/nfpitnet.workspace.toml',
        study_id: 'DM002',
        target_studies: ['DM002'],
        provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
        idempotency_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        authority_boundary: 'mas_owner_guarded_apply_only',
      },
    },
  ],
}, null, 2) + '\\n');
`);
  writeNodeScript(dispatchPath, `
const fs = require('node:fs');
const taskPath = process.argv[1];
fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
let count = 0;
if (fs.existsSync(${jsString(dispatchCountPath)})) {
  count = Number(fs.readFileSync(${jsString(dispatchCountPath)}, 'utf8').trim() || '0');
}
count += 1;
fs.writeFileSync(${jsString(dispatchCountPath)}, String(count) + '\\n');
const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
process.stdout.write(JSON.stringify({
  accepted: true,
  surface_kind: 'mas_family_domain_handler_dispatch_receipt',
  task_id: task.task_id,
  task_kind: task.task_kind,
  receipt_ref: \`artifacts/runtime/opl_family_domain_handler/dispatch_receipts/receipt-\${count}.json\`,
  dispatch: {
    action_type: 'paper_autonomy_guarded_apply',
    study_id: task.payload.study_id,
    result: {
      surface: 'real_paper_autonomy_provider_hosted_guarded_apply_receipt',
      status: 'typed_blocker',
      guarded_apply_status: 'blocked_no_mas_owner_apply_receipt',
      provider_attempt: {
        attempt_state: 'mas_owner_receipt_missing',
        attempt_ready: true,
        provider_attempt_wrote_workspace: false,
      },
      typed_blockers: [{ blocker_id: 'mas_owner_apply_receipt_missing', write_permitted: false }],
      publication_route_memory_final_proof: { status: 'typed_blocker_missing_ref_chain' },
      forbidden_write_guard: { aggregate_result: 'fail_closed_no_forbidden_writes' },
      summary: { writes_performed: false },
      authority_boundary: { domain_truth_owner: 'med-autoscience', opl_can_write_mas_truth: false },
    },
  },
}, null, 2) + '\\n');
`);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
  });
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'proof-fingerprint-v1\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'proof-ref'), '/tmp/proof-v1.json\n', 'utf8');
    const first = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    assert.equal(first.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(first.family_runtime_tick.hydration.requeued_count, 0);
    assert.equal(first.family_runtime_tick.dispatches.length, 1);

    const repeated = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    assert.equal(repeated.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(repeated.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(repeated.family_runtime_tick.dispatches.length, 0);

    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'proof-fingerprint-v2\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'proof-ref'), '/tmp/proof-v2.json\n', 'utf8');
    const updated = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    const task = runCli([
      'family-runtime',
      'queue',
      'inspect',
      first.family_runtime_tick.dispatches[0].task_id,
    ], env);
    const attempts = task.family_runtime_task.stage_attempts;
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(updated.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updated.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updated.family_runtime_tick.dispatches.length, 1);
    assert.equal(dispatchedTask.payload.source_fingerprint, 'proof-fingerprint-v2');
    assert.equal(dispatchedTask.payload.source_refs[0].ref, '/tmp/proof-v2.json');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].provider_kind, 'local_sqlite');
    assert.equal(attempts[0].source_fingerprint, 'proof-fingerprint-v2');
    assert.equal(attempts[0].route_impact.receipt_ref, 'artifacts/runtime/opl_family_domain_handler/dispatch_receipts/receipt-2.json');
    assert.equal(attempts[1].source_fingerprint, 'proof-fingerprint-v1');
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '2');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime requeues dead-lettered MAS exports when domain owner fingerprint changes', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-owner-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-owner-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${shellSingleQuote(uvCwdPath)}`,
        `: > ${shellSingleQuote(uvArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellSingleQuote(uvArgvPath)}; done`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'medautoscience',
              recommended_task_kind: 'paper_autonomy/repair-recheck',
              priority: 60,
              source: 'mas-runtime-owner-route',
              dedupe_key: 'mas:dm002:repair-recheck:unit_harmonized_validation_uncertainty_and_grouped_calibration',
              dispatch_owner: 'med-autoscience',
              owner_route_ref: 'owner-route:mas/DM002/unit_harmonized_validation_uncertainty_and_grouped_calibration',
              source_fingerprint: 'unit-harmonized-route',
              payload: {
                profile: 'dm-cvd.workspace.toml',
                study_id: '002-dm-china-us-mortality-attribution',
                work_unit_id: 'unit_harmonized_validation_uncertainty_and_grouped_calibration',
              },
            },
          ],
        }, null, 2)}\n`)});`)} -- "$@"`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'legacy-path-uv-was-called\\n' >&2
exit 44
`,
    { mode: 0o755 },
  );
  writeNodeScript(dispatchPath, `
const fs = require('node:fs');
const taskPath = process.argv[1];
fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
let count = 0;
if (fs.existsSync(${jsString(dispatchCountPath)})) {
  count = Number(fs.readFileSync(${jsString(dispatchCountPath)}, 'utf8').trim() || '0');
}
count += 1;
fs.writeFileSync(${jsString(dispatchCountPath)}, String(count) + '\\n');
if (count <= 3) {
  process.stderr.write('owner callable surface missing\\n');
  process.exit(42);
}
process.stdout.write(JSON.stringify({
  accepted: true,
  surface_kind: 'mas_family_domain_handler_dispatch_receipt',
  receipt_ref: 'receipt:dm002/repaired-owner',
}) + '\\n');
`);
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      runCli([
        'family-runtime',
        'tick',
        '--source',
        `dm002-owner-v1-${index}`,
        '--hydrate',
        '--domain',
        'medautoscience',
        '--study',
        '002-dm-china-us-mortality-attribution',
      ], env);
    }
    const deadLetterQueue = runCli(['family-runtime', 'queue', 'list'], env);
    const deadLetterTask = deadLetterQueue.family_runtime_queue.tasks[0];
    assert.equal(deadLetterTask.status, 'dead_letter');
    assert.equal(deadLetterTask.attempts, 3);
    assert.match(deadLetterTask.last_error, /owner callable surface missing/);

    const sameOwner = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v1-repeat',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
    ], env);
    assert.equal(sameOwner.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(sameOwner.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(sameOwner.family_runtime_tick.selected_count, 0);

    const nextSha = masFixture.advance('owner-surface.txt', 'owner callable restored\n', 'Restore owner callable');
    const updatedOwner = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v2',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
    ], env);
    const refreshed = runCli(['family-runtime', 'queue', 'inspect', deadLetterTask.task_id], env);
    const task = refreshed.family_runtime_task.task;
    const events = refreshed.family_runtime_task.events;
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(updatedOwner.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.selected_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.attempts, 1);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.match(task.payload.opl_domain_export_context.owner_fingerprint, new RegExp(nextSha));
    assert.match(dispatchedTask.payload.opl_domain_export_context.owner_fingerprint, new RegExp(nextSha));
    assert.equal(
      events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_requeued_from_dead_letter_after_domain_owner_update'
        && event.payload.reason === 'domain_export_owner_changed_after_dead_letter'
      ),
      true,
    );
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '4');
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
    assert.equal(fs.readFileSync(uvArgvPath, 'utf8').includes('domain-handler\nexport'), true);
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
