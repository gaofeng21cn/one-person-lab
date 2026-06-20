import './family-runtime-current-control-provider-admission-cases/action-queue-intake.ts';
import './family-runtime-current-control-provider-admission-cases/transition-runtime-readback-intake.ts';
import './family-runtime-current-control-provider-admission-cases/existing-terminal-readback-replay.ts';
import './family-runtime-current-control-provider-admission-cases/stage-attempt-readback.ts';
import './family-runtime-current-control-provider-admission-cases/queue-refresh-and-guards.ts';
import './family-runtime-current-control-provider-admission-cases/stage-attempt-repair.ts';
import './family-runtime-current-control-provider-admission-cases/stop-loss-successor-policy.ts';
import './family-runtime-current-control-provider-admission-cases/current-control-command-readback.ts';
import './family-runtime-current-control-provider-admission-cases/current-control-command-readback-live-consumption.ts';
import {
  assert,
  currentControlActionQueueItem,
  currentControlCommandOutboxRecord,
  familyRuntimeEnv,
  fs,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeJsonEmitterScript,
} from './family-runtime-current-control-provider-admission-cases/shared.ts';

test('DomainProgressTransitionRuntime first slice stays inside existing brand-module partition', () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'stage-route-scheduler-contract.json'),
    'utf8',
  ));
  const slice = contract.stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice;

  assert.equal(slice.surface_kind, 'opl_domain_progress_transition_runtime_first_slice');
  assert.equal(slice.status, 'runtime_slice_landed_non_ready');
  assert.equal(slice.brand_module_partition.module_count_policy, 'no_new_brand_module');
  assert.match(slice.brand_module_partition.Runway, /current-control intake/);
  assert.match(slice.brand_module_partition.Pack, /command\/outbox\/event shape/);
  assert.match(slice.brand_module_partition.Stagecraft, /StageRun identity/);
  assert.match(slice.brand_module_partition.Console, /read-model metadata/);
  assert.match(slice.brand_module_partition.Vault, /outbox\/event\/replay refs/);
  assert.equal(
    slice.concepts.TransitionDecisionEngine.durable_substrate_first_slice.current_latest_policy,
    'exactly_one_latest_current_decision_per_obligation_identity',
  );
  assert.match(
    slice.concepts.TransitionDecisionEngine.landed_support,
    /NonAdvancingApply is projected as metadata/,
  );
  assert.match(
    slice.concepts.TransitionDecisionEngine.landed_support,
    /replay fixtures remain refs-only/,
  );
  assert.ok(slice.not_complete_claims.includes('read_model_projection_does_not_mean_domain_progress'));
});

test('family-runtime intake admits MAS current-control provider candidates ahead of stale sidecar default executor tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-admission-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-admission-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm-cvd.local.toml');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_pending_count: 2,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm002',
        action_fingerprint: 'sha256:current-dm002',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        dispatch_path: path.join(
          workspaceRoot,
          'studies',
          '002-dm-china-us-mortality-attribution',
          'artifacts',
          'supervision',
          'consumer',
          'default_executor_dispatches',
          'return_to_ai_reviewer_workflow.json',
        ),
        route_identity_key: 'owner-route::dm002::ai-reviewer-current',
        attempt_idempotency_key: 'owner-route-attempt::dm002::ai-reviewer-current',
        execution_ref: path.join(
          workspaceRoot,
          'studies',
          '002-dm-china-us-mortality-attribution',
          'artifacts',
          'supervision',
          'consumer',
          'default_executor_execution',
          'latest.json',
        ),
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId: '002-dm-china-us-mortality-attribution',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:current-dm002',
          sourceGeneration: 'truth-event-current-dm002',
          idempotencyKey: 'owner-route-attempt::dm002::ai-reviewer-current',
        }),
        required_output_surface: 'artifacts/publication_eval/ai_reviewer_responses/*_publication_eval_record.json',
        source_refs: {
          work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          work_unit_fingerprint: 'sha256:current-dm002',
        },
      },
      {
        status: 'provider_admission_pending',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm003',
        action_fingerprint: 'sha256:current-dm003',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        dispatch_path: path.join(
          workspaceRoot,
          'studies',
          '003-dpcc-primary-care-phenotype-treatment-gap',
          'artifacts',
          'supervision',
          'consumer',
          'default_executor_dispatches',
          'return_to_ai_reviewer_workflow.json',
        ),
        stage_packet_ref: path.join(
          workspaceRoot,
          'studies',
          '003-dpcc-primary-care-phenotype-treatment-gap',
          'artifacts',
          'stage_packets',
          'return_to_ai_reviewer_workflow.stage-packet.json',
        ),
        route_identity_key: 'owner-route::dm003::ai-reviewer-current',
        attempt_idempotency_key: 'owner-route-attempt::dm003::ai-reviewer-current',
        checkpoint_refs: [
          path.join(
            workspaceRoot,
            'studies',
            '003-dpcc-primary-care-phenotype-treatment-gap',
            'artifacts',
            'stage_packets',
            'checkpoints',
            'ai-reviewer-current.json',
          ),
        ],
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:current-dm003',
          sourceGeneration: 'truth-event-current-dm003',
          idempotencyKey: 'owner-route-attempt::dm003::ai-reviewer-current',
        }),
        required_output_surface: 'artifacts/publication_eval/ai_reviewer_responses/*_publication_eval_record.json',
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    profile: {
      profile_name: 'dm-cvd',
      profile_ref: profilePath,
    },
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        priority: 65,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale',
        source_fingerprint: 'sha256:stale-dm002',
        payload: {
          profile: profilePath,
          study_id: '002-dm-china-us-mortality-attribution',
          quest_id: '002-dm-china-us-mortality-attribution',
          action_type: 'run_quality_repair_batch',
          work_unit_id: 'run_quality_repair_batch',
          source_fingerprint: 'sha256:stale-dm002',
          dispatch_authority: 'consumer_default_executor_dispatch',
          dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          authority_boundary: 'mas_default_executor_dispatch_request_only',
        },
      },
    ],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;
    const tasksByStudy = Object.fromEntries(tasks.map((task: { payload: { study_id: string } }) => [
      task.payload.study_id,
      task,
    ]));

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 2);
    assert.equal(intake.family_runtime_intake.exports[0].blocked[0].reason, 'current_control_provider_admission_stage_packet_ref_missing');
    assert.equal(tasks.length, 1);
    assert.deepEqual(Object.keys(tasksByStudy).sort(), [
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ]);
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:current-dm003');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.route_identity_key, 'owner-route::dm003::ai-reviewer-current');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.attempt_idempotency_key, 'owner-route-attempt::dm003::ai-reviewer-current');
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.current_control_command.aggregate_identity.study_id,
      '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.current_control_command.idempotency_key,
      'owner-route-attempt::dm003::ai-reviewer-current',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.current_control_command.runtime_kind,
      'DomainProgressTransitionRuntime',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.provider_admission_identity
        .current_control_command.postcondition.kind,
      'provider_admission_enqueued_or_blocked',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_event
        .exactly_one_transition,
      true,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_outbox_item
        .surface_kind,
      'opl_domain_progress_transition_outbox_item',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_outbox_item
        .dispatch_allowed,
      true,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.projection_metadata
        .observed_generation,
      'truth-event-current-dm003',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_runtime
        .replay_evidence.transition_count,
      1,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_runtime
        .read_model_readback.aggregate_version,
      1,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_log_ref,
      'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_log_append
        .append_status,
      'appended',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_log_append
        .appended_entry_count,
      3,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback.surface_kind,
      'opl_domain_progress_transition_runtime_live_readback',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback.transaction_complete,
      true,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback.latest_transaction_readback
        .same_transaction_event_and_outbox,
      true,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback.identity.latest_event_id,
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_event.event_id,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback.identity.latest_outbox_item_id,
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_outbox_item.outbox_item_id,
    );
    assert.deepEqual(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_live_readback,
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .opl_domain_progress_transition_runtime_live_readback,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload
        .provider_admission_identity.opl_domain_progress_transition_runtime_live_readback
        .identity.latest_event_id,
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_event.event_id,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_runtime
        .read_model_readback.latest_transition_identity.event_id,
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.opl_transition_event.event_id,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.domain_progress_transition_runtime
        .replay_evidence.non_advancing_apply,
      false,
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.owner_route_currentness_basis
        .observed_generation,
      'truth-event-current-dm003',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.owner_route_currentness_basis
        .derived_generation,
      'truth-event-current-dm003',
    );
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_ref,
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
    );
    assert.deepEqual(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_refs,
      [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/checkpoints/ai-reviewer-current.json',
      ],
    );
    assert.deepEqual(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.checkpoint_refs,
      [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/checkpoints/ai-reviewer-current.json',
      ],
    );
    assert.equal(
      tasks.some((task: { payload: { action_type?: string } }) => task.payload.action_type === 'run_quality_repair_batch'),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks MAS transition request carrier without selected stage packet identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-request-missing-packet-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-request-missing-packet-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm-cvd.local.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const routeIdentityKey = 'paper-policy-request:1a379264039c75d0e9cfd8f5';
  const attemptIdempotencyKey = 'paper-policy-request:1a379264039c75d0e9cfd8f5';
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: studyId,
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
    profile: {
      profile_name: 'dm-cvd',
      profile_ref: profilePath,
    },
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        priority: 75,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:current-control-transition-request:${actionType}:${workUnitFingerprint}`,
        source_fingerprint: workUnitFingerprint,
        reason: 'current_control_transition_request_pending',
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'domain_owner_transition_request',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          route_identity_key: routeIdentityKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route_currentness_basis: {
            source: 'paper_recovery_state.next_safe_action.successor_owner_action',
            truth_epoch: 'truth-event-000035-39f0b8e96689a623',
            runtime_health_epoch: 'runtime-health-event-006980-4ef4eaadc36c3844',
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
          },
          opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
            studyId,
            actionType,
            workUnitId,
            workUnitFingerprint,
            sourceGeneration: 'truth-event-000035-39f0b8e96689a623',
            idempotencyKey: attemptIdempotencyKey,
          }),
        },
      },
    ],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_admission_stage_packet_ref_missing',
    );
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].repair_action.action_id,
      'materialize_current_control_provider_admission_identity',
    );
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked[0].repair_action.missing_fields,
      ['stage_packet_ref', 'stage_packet_refs'],
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks current-control action_queue provider candidates without a stage packet ref', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-missing-packet-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-missing-packet-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-08T15:37:31+00:00',
    action_queue: [
      currentControlActionQueueItem({
        studyId: '002-dm-china-us-mortality-attribution',
        actionType: 'return_to_ai_reviewer_workflow',
        workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        workUnitFingerprint: 'sha256:handoff-dm002',
        sourceFingerprint: 'truth-snapshot::dm002-handoff',
        truthEpoch: 'truth-event-000040',
        runtimeHealthEpoch: 'runtime-health-event-006692',
      }),
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_admission_stage_packet_ref_missing',
    );
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked[0].repair_action,
      {
        surface_kind: 'opl_current_control_provider_admission_repair_action',
        action_id: 'materialize_current_control_provider_admission_identity',
        repair_owner: 'med-autoscience',
        substrate_owner: 'one-person-lab',
        reason: 'current_control_provider_admission_stage_packet_ref_missing',
        study_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:handoff-dm002',
        missing_fields: ['stage_packet_ref', 'stage_packet_refs'],
        required_fields: ['stage_packet_ref', 'stage_packet_refs', 'route_identity_key', 'attempt_idempotency_key'],
        preflight: {
          status: 'blocked',
          can_dispatch_provider_attempt: false,
          stale_sidecar_pending_task_must_remain_suppressed: true,
          materialization_owner: 'med-autoscience',
          substrate_owner: 'one-person-lab',
          missing_fields: ['stage_packet_ref', 'stage_packet_refs'],
          required_fields: ['stage_packet_ref', 'stage_packet_refs', 'route_identity_key', 'attempt_idempotency_key'],
          blocked_reason: 'current_control_provider_admission_stage_packet_ref_missing',
        },
        accepted_materialization: {
          owner_route_must_emit_selected_stage_packet: true,
          owner_route_must_emit_route_identity_key: true,
          owner_route_must_emit_attempt_idempotency_key: true,
        },
        forbidden_fallbacks: {
          dispatch_ref_as_stage_packet_ref: 'forbidden',
          generic_idempotency_key_as_route_identity_key: 'forbidden',
          generic_idempotency_key_as_attempt_idempotency_key: 'forbidden',
          opl_materializes_mas_truth: 'forbidden',
        },
        command_hints: [
          {
            purpose: 'generate_selected_stage_packet',
            owner: 'med-autoscience',
            substrate_owner: 'one-person-lab',
            command_ref: 'mas current-control stage-packet materialize --study 002-dm-china-us-mortality-attribution --action return_to_ai_reviewer_workflow --work-unit produce_ai_reviewer_publication_eval_record_against_current_inputs',
            writes_domain_truth: true,
            opl_must_not_execute_as_truth_writer: true,
          },
          {
            purpose: 'refresh_owner_route_identity',
            owner: 'med-autoscience',
            substrate_owner: 'one-person-lab',
            command_ref: 'mas current-control owner-route refresh --study 002-dm-china-us-mortality-attribution --action return_to_ai_reviewer_workflow --work-unit produce_ai_reviewer_publication_eval_record_against_current_inputs',
            required_output_fields: ['route_identity_key', 'attempt_idempotency_key'],
            writes_domain_truth: true,
            opl_must_not_execute_as_truth_writer: true,
          },
          {
            purpose: 'materialize_current_control_provider_admission_identity',
            owner: 'med-autoscience',
            substrate_owner: 'one-person-lab',
            command_ref: 'mas current-control provider-admission materialize-identity --study 002-dm-china-us-mortality-attribution --action return_to_ai_reviewer_workflow --work-unit produce_ai_reviewer_publication_eval_record_against_current_inputs',
            required_output_fields: ['stage_packet_ref', 'stage_packet_refs', 'route_identity_key', 'attempt_idempotency_key'],
            writes_domain_truth: true,
            opl_must_not_execute_as_truth_writer: true,
          },
        ],
        output_contract: {
          owner_repo: 'med-autoscience',
          output_surface: 'runtime/artifacts/supervision/opl_current_control_state/latest.json',
          provider_admission_candidate_must_include_required_fields: true,
        },
        authority_boundary: {
          opl_can_write_mas_truth: false,
          opl_can_create_domain_owner_receipt: false,
          opl_can_create_domain_typed_blocker: false,
          repair_action_counts_as_domain_ready: false,
        },
      },
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks current-control provider candidates without outbox record or postcondition', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-contract-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-contract-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const baseCandidate = {
    status: 'provider_admission_pending',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: 'sha256:command-contract',
    action_fingerprint: 'sha256:command-contract',
    dispatch_authority: 'ai_reviewer_record_production_handoff',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    stage_packet_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
    route_identity_key: 'owner-route::dm002::command-contract',
    attempt_idempotency_key: 'owner-route-attempt::dm002::command-contract',
    next_executable_owner: 'ai_reviewer',
    owner_route_current: true,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    stage_transition_authority_boundary: providerObservationBoundary(),
  };
  const incompleteCommand = {
    ...currentControlCommandOutboxRecord({
      studyId: '002-dm-china-us-mortality-attribution',
      actionType: 'return_to_ai_reviewer_workflow',
      workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      workUnitFingerprint: 'sha256:command-postcondition-missing',
      sourceGeneration: 'truth-event-command-contract',
      idempotencyKey: 'owner-route-attempt::dm002::command-contract',
    }),
    postcondition: undefined,
    outcome: undefined,
  };
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-16T00:00:00+00:00',
    provider_admission_candidates: [
      {
        ...baseCandidate,
        current_control_command: currentControlCommandOutboxRecord({
          studyId: '002-dm-china-us-mortality-attribution',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:command-contract',
          sourceGeneration: 'truth-event-old-command-alias',
          idempotencyKey: 'owner-route-attempt::dm002::command-contract',
        }),
      },
      {
        ...baseCandidate,
        work_unit_fingerprint: 'sha256:command-postcondition-missing',
        action_fingerprint: 'sha256:command-postcondition-missing',
        route_identity_key: 'owner-route::dm002::command-postcondition-missing',
        attempt_idempotency_key: 'owner-route-attempt::dm002::command-postcondition-missing',
        current_control_command_outbox_record: incompleteCommand,
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 2);
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked.map((item: { reason: string }) => item.reason),
      [
        'current_control_provider_admission_command_record_missing',
        'current_control_provider_admission_command_postcondition_missing',
      ],
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks current-control provider candidates with incomplete route attempt identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-incomplete-identity-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-incomplete-identity-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-08T15:37:31+00:00',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:missing-route-identity',
        action_fingerprint: 'sha256:missing-route-identity',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
        stage_packet_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        attempt_idempotency_key: 'owner-route-attempt::dm002::missing-route',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId: '002-dm-china-us-mortality-attribution',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:missing-route-identity',
          sourceGeneration: 'truth-event-missing-route',
          idempotencyKey: 'owner-route-attempt::dm002::missing-route',
        }),
      },
      {
        status: 'provider_admission_pending',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:missing-attempt-identity',
        action_fingerprint: 'sha256:missing-attempt-identity',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        dispatch_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
        stage_packet_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        route_identity_key: 'owner-route::dm003::missing-attempt',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:missing-attempt-identity',
          sourceGeneration: 'truth-event-missing-attempt',
          idempotencyKey: 'owner-route::dm003::missing-attempt',
        }),
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 2);
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked.map((item: { reason: string }) => item.reason),
      [
        'current_control_provider_admission_route_identity_key_missing',
        'current_control_provider_admission_attempt_idempotency_key_missing',
      ],
    );
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked.map((item: { repair_action: { missing_fields: string[] } }) =>
        item.repair_action.missing_fields
      ),
      [
        ['route_identity_key'],
        ['attempt_idempotency_key'],
      ],
    );
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].repair_action.forbidden_fallbacks
        .generic_idempotency_key_as_route_identity_key,
      'forbidden',
    );
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[1].repair_action.forbidden_fallbacks
        .generic_idempotency_key_as_attempt_idempotency_key,
      'forbidden',
    );
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked.map((
        item: { repair_action: { preflight: { status: string; can_dispatch_provider_attempt: boolean } } },
      ) => ({
        status: item.repair_action.preflight.status,
        can_dispatch_provider_attempt: item.repair_action.preflight.can_dispatch_provider_attempt,
      })),
      [
        { status: 'blocked', can_dispatch_provider_attempt: false },
        { status: 'blocked', can_dispatch_provider_attempt: false },
      ],
    );
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked[0].repair_action.command_hints.map((
        hint: { purpose: string },
      ) => hint.purpose),
      [
        'generate_selected_stage_packet',
        'refresh_owner_route_identity',
        'materialize_current_control_provider_admission_identity',
      ],
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake ignores MAS current-control action_queue items without explicit dispatchable protocol', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-closed-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-closed-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-08T15:37:31+00:00',
    action_queue: [
      currentControlActionQueueItem({
        studyId: '002-dm-china-us-mortality-attribution',
        actionType: 'return_to_ai_reviewer_workflow',
        workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        workUnitFingerprint: 'sha256:handoff-dm002',
        sourceFingerprint: 'truth-snapshot::dm002-handoff',
        truthEpoch: 'truth-event-000040',
        runtimeHealthEpoch: 'runtime-health-event-006692',
        dispatchable: null,
      }),
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 0);
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
