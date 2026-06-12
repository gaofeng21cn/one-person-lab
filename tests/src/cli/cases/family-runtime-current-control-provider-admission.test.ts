import './family-runtime-current-control-provider-admission-cases/queue-refresh-and-guards.ts';
import './family-runtime-current-control-provider-admission-cases/stop-loss-successor-policy.ts';
import {
  assert,
  currentControlActionQueueItem,
  familyRuntimeEnv,
  fs,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeDefaultExecutorDispatchPacket,
  writeJsonEmitterScript,
} from './family-runtime-current-control-provider-admission-cases/shared.ts';

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

    assert.equal(intake.family_runtime_intake.enqueued_count, 2);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 2);
    assert.equal(tasks.length, 2);
    assert.deepEqual(Object.keys(tasksByStudy).sort(), [
      '002-dm-china-us-mortality-attribution',
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ]);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].task_kind, 'domain_owner/default-executor-dispatch');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].priority, 95);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].source, 'opl-current-control-provider-admission');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.action_type, 'return_to_ai_reviewer_workflow');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.work_unit_fingerprint, 'sha256:current-dm002');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.source_fingerprint, 'sha256:current-dm002');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.next_executable_owner, 'ai_reviewer');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_completion_is_domain_completion, false);
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.dispatch_ref,
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_ref,
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    );
    assert.deepEqual(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.checkpoint_refs,
      [
        'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      ],
    );
    assert.deepEqual(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_refs,
      [
        'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      ],
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_transition_authority_boundary.intent_can_publish_current_owner_delta,
      false,
    );
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_identity.status, 'provider_admission_pending');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:current-dm003');
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_ref,
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
    );
    assert.deepEqual(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_refs,
      [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/checkpoints/ai-reviewer-current.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      ],
    );
    assert.deepEqual(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.checkpoint_refs,
      [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/checkpoints/ai-reviewer-current.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
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

test('family-runtime intake admits MAS current-control handoff action_queue provider candidates', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-'));
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
  const dm002DispatchRef = writeDefaultExecutorDispatchPacket(
    workspaceRoot,
    '002-dm-china-us-mortality-attribution',
    'return_to_ai_reviewer_workflow',
  );
  const dm003DispatchRef = writeDefaultExecutorDispatchPacket(
    workspaceRoot,
    '003-dpcc-primary-care-phenotype-treatment-gap',
    'return_to_ai_reviewer_workflow',
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
    studies: [
      {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_queue: [
          currentControlActionQueueItem({
            studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
            actionType: 'return_to_ai_reviewer_workflow',
            workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            workUnitFingerprint: 'sha256:handoff-dm003',
            sourceFingerprint: 'truth-snapshot::dm003-handoff',
            truthEpoch: 'truth-event-000030',
            runtimeHealthEpoch: 'runtime-health-event-006486',
          }),
        ],
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
    const tasks = queue.family_runtime_queue.tasks;
    const tasksByStudy = Object.fromEntries(tasks.map((task: { payload: { study_id: string } }) => [
      task.payload.study_id,
      task,
    ]));

    assert.equal(intake.family_runtime_intake.enqueued_count, 2);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 2);
    assert.deepEqual(Object.keys(tasksByStudy).sort(), [
      '002-dm-china-us-mortality-attribution',
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ]);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].source, 'opl-current-control-provider-admission');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_schema_source, 'action_queue');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.source_fingerprint, 'truth-snapshot::dm002-handoff');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.dispatch_ref, dm002DispatchRef);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_ref, dm002DispatchRef);
    assert.deepEqual(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.checkpoint_refs, [dm002DispatchRef]);
    assert.deepEqual(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_refs, [dm002DispatchRef]);
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.owner_route_currentness_basis.truth_epoch,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_transition_authority_boundary.intent_can_write_domain_truth,
      false,
    );
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:handoff-dm003');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.dispatch_ref, dm003DispatchRef);
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_ref, dm003DispatchRef);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake reconciles current-control display owner to executable domain owner', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-owner-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-owner-'));
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
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'run_gate_clearing_batch';
  const workUnitId = 'dpcc_publication_gate_replay_after_current_ai_reviewer_record';
  const workUnitFingerprint = [
    'study-progress-current-owner-ticket',
    studyId,
    workUnitId,
    actionType,
  ].join('::');
  const dispatchRef = writeDefaultExecutorDispatchPacket(workspaceRoot, studyId, actionType);
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-10T07:30:00+00:00',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        source_fingerprint: workUnitFingerprint,
        dispatch_authority: 'consumer_default_executor_dispatch',
        dispatch_path: path.join(workspaceRoot, dispatchRef),
        next_executable_owner: 'finalize',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        domain_owner: 'gate_clearing_batch',
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        source_fingerprint: workUnitFingerprint,
        priority: 65,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:default-executor:${actionType}:current`,
        payload: {
          profile: 'dm-cvd',
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'consumer_default_executor_dispatch',
          dispatch_ref: dispatchRef,
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'gate_clearing_batch',
          domain_owner: 'gate_clearing_batch',
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
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].suppressed_count, 1);
    assert.equal(task.payload.next_executable_owner, 'gate_clearing_batch');
    assert.equal(task.payload.domain_owner, 'gate_clearing_batch');
    assert.equal(task.payload.executable_owner_source, 'domain_handler_current_owner_action');
    assert.equal(task.payload.provider_admission_identity.next_executable_owner, 'gate_clearing_batch');
    assert.equal(task.payload.provider_admission_identity.executable_owner_source, 'domain_handler_current_owner_action');
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
