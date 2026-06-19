import './family-runtime-current-control-provider-admission-cases/queue-refresh-and-guards.ts';
import './family-runtime-current-control-provider-admission-cases/stage-attempt-repair.ts';
import './family-runtime-current-control-provider-admission-cases/stop-loss-successor-policy.ts';
import {
  assert,
  DatabaseSync,
  currentControlActionQueueItem,
  currentControlCommandOutboxRecord,
  createQueueTables,
  familyRuntimeEnv,
  fs,
  insertQueuedTask,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  record,
  ensureProviderHostedStageAttempt,
  runCli,
  test,
  writeDefaultExecutorDispatchPacket,
  writeJsonEmitterScript,
} from './family-runtime-current-control-provider-admission-cases/shared.ts';
import { deriveCurrentControlStateForTask } from '../../../../src/family-runtime-current-control-state.ts';
import { publishCurrentControlProviderAdmissionReadback } from '../../../../src/family-runtime-domain-intake-parts/current-control-provider-admission.ts';
import {
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildDomainProgressTransitionRuntimeResult,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from '../../../../src/family-runtime-domain-progress-transition-runtime.ts';

function completeRuntimeReadbackForCommand(input: {
  workspaceRoot: string;
  command: Record<string, unknown>;
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  nextOwner: string;
  idempotencyKey: string;
}) {
  const normalized = normalizeDomainProgressTransitionCommand(input.command, {
    studyId: input.studyId,
    actionType: input.actionType,
    workUnitId: input.workUnitId,
    workUnitFingerprint: input.workUnitFingerprint,
    nextOwner: input.nextOwner,
  }).command;
  assert.ok(normalized);
  const logPath = path.join(
    input.workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'domain_progress_transition_runtime',
    'command_event_log.jsonl',
  );
  const append = appendDomainProgressTransitionRuntimeResultJsonl({
    logPath,
    result: buildDomainProgressTransitionRuntimeResult(normalized),
  });
  assert.equal(append.append_status, 'appended');
  const readback = readDomainProgressTransitionRuntimeReadbackJsonl({
    logPath,
    aggregateIdentity: normalized.aggregate_identity as Record<string, unknown>,
    idempotencyKey: input.idempotencyKey,
  });
  assert.equal(readback.runtime_readback_status, 'complete_transaction');
  return {
    command: normalized,
    runtimeResult: append.result,
    liveReadback: readback,
  };
}

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
  const dm002StagePacketRef = [
    'studies',
    '002-dm-china-us-mortality-attribution',
    'artifacts',
    'stage_packets',
    'return_to_ai_reviewer_workflow.stage-packet.json',
  ].join('/');
  const dm003StagePacketRef = [
    'studies',
    '003-dpcc-primary-care-phenotype-treatment-gap',
    'artifacts',
    'stage_packets',
    'return_to_ai_reviewer_workflow.stage-packet.json',
  ].join('/');
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
        recoveryObligationId: 'paper-recovery-obligation:dm002:revise-ai-reviewer',
        dispatchRef: dm002DispatchRef,
        stagePacketRef: dm002StagePacketRef,
        stagePacketRefs: [dm002StagePacketRef],
        routeIdentityKey: 'owner-route::dm002::handoff',
        attemptIdempotencyKey: 'owner-route-attempt::dm002::handoff',
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
            dispatchRef: dm003DispatchRef,
            stagePacketRef: dm003StagePacketRef,
            stagePacketRefs: [dm003StagePacketRef],
            routeIdentityKey: 'owner-route::dm003::handoff',
            attemptIdempotencyKey: 'owner-route-attempt::dm003::handoff',
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
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.recovery_obligation_id,
      'paper-recovery-obligation:dm002:revise-ai-reviewer',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_identity.recovery_obligation_id,
      'paper-recovery-obligation:dm002:revise-ai-reviewer',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply.transition_kind,
      'execute_current_owner_delta',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply.runtime_apply_target.kind,
      'provider_attempt_or_owner_callable',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .transition_runtime_kind,
      'DomainProgressTransitionRuntime',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .exactly_one_apply.selected,
      true,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .exactly_one_apply.non_advancing_apply,
      false,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .read_model_metadata.observed_generation,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .read_model_metadata.source_generation,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .replay_fixture.replay_reads_body,
      false,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_identity
        .domain_progress_transition_apply.transition_decision_ref,
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .transition_decision_ref,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .authority_boundary.opl_can_create_domain_typed_blocker,
      false,
    );
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.source_fingerprint, 'truth-snapshot::dm002-handoff');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.dispatch_ref, dm002DispatchRef);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_ref, dm002StagePacketRef);
    assert.deepEqual(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.checkpoint_refs, [dm002StagePacketRef]);
    assert.deepEqual(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_refs, [dm002StagePacketRef]);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.route_identity_key, 'owner-route::dm002::handoff');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.attempt_idempotency_key, 'owner-route-attempt::dm002::handoff');
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.owner_route_currentness_basis.truth_epoch,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_transition_authority_boundary.intent_can_write_domain_truth,
      false,
    );
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:handoff-dm003');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.recovery_obligation_id, undefined);
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.provider_admission_identity.recovery_obligation_id,
      undefined,
    );
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.dispatch_ref, dm003DispatchRef);
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_ref, dm003StagePacketRef);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake promotes MAS transition request-only task into OPL runtime-backed provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-request-pending-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-request-pending-'));
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
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
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
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:transition-request:${actionType}`,
        source_fingerprint: 'truth-snapshot::dm003-transition-request',
        reason: 'current_control_transition_request_pending',
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: 'truth-snapshot::dm003-transition-request',
          dispatch_authority: 'domain_owner_transition_request',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          owner_route_current: true,
          provider_attempt_or_lease_required: true,
          provider_completion_is_domain_completion: false,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route_currentness_basis: {
            observed_generation: 'truth-event-dm003-transition-request',
            derived_generation: 'truth-event-dm003-transition-request',
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
          },
          opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
            studyId,
            actionType,
            workUnitId,
            workUnitFingerprint,
            sourceGeneration: 'truth-event-dm003-transition-request',
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
    const tasks = queue.family_runtime_queue.tasks;

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(intake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].source, 'opl-current-control-transition-request');
    assert.equal(tasks[0].payload.provider_admission_schema_source, 'transition_request_pending_task');
    assert.equal(tasks[0].payload.study_id, studyId);
    assert.equal(tasks[0].payload.action_type, actionType);
    assert.equal(tasks[0].payload.work_unit_id, workUnitId);
    assert.equal(tasks[0].payload.route_identity_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.attempt_idempotency_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.domain_progress_transition_runtime.transition_event.transition_kind, 'StartProviderAttempt');
    assert.equal(tasks[0].payload.domain_progress_transition_runtime.transition_event.exactly_one_transition, true);
    assert.equal(tasks[0].payload.domain_progress_transition_log_ref, 'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl');
    assert.equal(tasks[0].payload.domain_progress_transition_log_append.append_status, 'appended');
    assert.equal(tasks[0].payload.domain_progress_transition_log_append.appended_entry_count, 3);
    assert.equal(tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.surface_kind, 'opl_domain_progress_transition_runtime_live_readback');
    assert.equal(tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status, 'complete_transaction');
    assert.equal(tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.transaction_complete, true);
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.latest_transaction_readback
        .same_transaction_event_and_outbox,
      true,
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.identity.latest_event_id,
      tasks[0].payload.opl_transition_event.event_id,
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.identity.latest_outbox_item_id,
      tasks[0].payload.opl_transition_outbox_item.outbox_item_id,
    );
    assert.deepEqual(
      tasks[0].payload.opl_domain_progress_transition_live_readback,
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback,
    );
    assert.equal(tasks[0].payload.opl_transition_outbox_item.dispatch_allowed, true);
    assert.equal(tasks[0].payload.provider_admission_identity.domain_progress_transition_log_ref, 'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl');
    assert.equal(
      tasks[0].payload.provider_admission_identity.opl_domain_progress_transition_runtime_live_readback
        .identity.latest_event_id,
      tasks[0].payload.opl_transition_event.event_id,
    );
    assert.equal(tasks[0].payload.current_control_command_outbox_record.idempotency_key, attemptIdempotencyKey);
    assert.deepEqual(
      tasks[0].payload.current_control_command_outbox_record,
      tasks[0].payload.current_control_command,
    );
    assert.deepEqual(
      tasks[0].payload.provider_admission_identity.current_control_command_outbox_record,
      tasks[0].payload.current_control_command,
    );
    assert.equal(tasks[0].payload.current_control_command.idempotency_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.current_control_command.runtime_kind, 'DomainProgressTransitionRuntime');
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_provider_admission',
    );
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 1);
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].status, 'provider_admission_pending');
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].study_id, studyId);
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].route_identity_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].provider_admission_identity
        .opl_domain_progress_transition_runtime_live_readback.identity.latest_event_id,
      tasks[0].payload.opl_transition_event.event_id,
    );
    assert.deepEqual(
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command_outbox_record,
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command,
    );
    assert.deepEqual(
      refreshedCurrentControl.provider_admission_candidates[0]
        .provider_admission_identity.current_control_command_outbox_record,
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0]
        .opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'provider_admission_pending',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.reason,
      'opl_transition_runtime_readback_published',
    );
    assert.equal(
      refreshedCurrentControl.latest_provider_admission_identity.attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_projection_metadata.projection_role,
      'console_read_model_from_runway_transition_runtime',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime records NonAdvancingApply when authorized stage packet lacks OPL transition request', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-advancing-current-transition-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-advancing-current-transition-'));
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
  const runtimeLogPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'domain_progress_transition_runtime',
    'command_event_log.jsonl',
  );
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm-cvd.local.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'supervision',
    'consumer',
    'default_executor_dispatches',
    'immutable',
    'run_quality_repair_batch',
    '33abc53e0c18295f5fa03738.json',
  ].join('/');
  const ownerRouteIdempotencyKey = [
    'paper-recovery',
    studyId,
    actionType,
    workUnitFingerprint,
  ].join('::');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    current_executable_owner_action: {
      action_type: actionType,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
    },
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
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:authorized-stage-packet:${actionType}`,
        source_fingerprint: workUnitFingerprint,
        reason: 'current_control_transition_request_pending',
        blocked_reason: 'opl_execution_authorization_required',
        execution_requires_opl_authorization: true,
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'consumer_default_executor_dispatch',
          dispatch_status: 'transition_request_pending',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route: {
            idempotency_key: ownerRouteIdempotencyKey,
            trace_id: `owner-route-trace::${studyId}::8069bb095591944f`,
            next_owner: 'write',
            currentness_contract: {
              basis: {
                truth_epoch: workUnitFingerprint,
                runtime_health_epoch: workUnitFingerprint,
                work_unit_id: workUnitId,
                work_unit_fingerprint: workUnitFingerprint,
              },
              fail_closed_when_missing: true,
              missing_required_fields: [],
              status: 'currentness_basis_required',
            },
            source_refs: {
              source_surface: 'paper_recovery_state',
              supervisor_authority: 'paper_autonomy_supervisor_decision',
            },
          },
          owner_route_currentness_basis: {
            source: 'paper_recovery_state.next_safe_action.successor_owner_action',
            truth_epoch: workUnitFingerprint,
            runtime_health_epoch: workUnitFingerprint,
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
          },
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
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    const logEntries = fs.readFileSync(runtimeLogPath, 'utf8').trim().split(/\r?\n/u).map((line) => JSON.parse(line));

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].current_control_readback_publications[0].status,
      'transition_non_advancing_apply_recorded',
    );
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_transition_non_advancing_apply_recorded',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
    assert.equal(logEntries.length, 3);
    assert.equal(logEntries[1].payload.transition_kind, 'NonAdvancingApply');
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 0);
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(refreshedCurrentControl.current_executable_owner_action, null);
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_non_advancing_apply',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'transition_non_advancing_apply_recorded',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.transaction_complete,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_result.exactly_one_outcome.non_advancing_apply,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.replay_audit.replay_status,
      'replay_ready',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.replay_audit.read_model_projection_consumable,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.replay_audit_status,
      'replay_ready',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.replay_audit_consumable,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.provider_admission_allowed,
      false,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.current_executable_owner_action_allowed,
      false,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.paper_progress_delta,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime promotes current-control command alias only with complete same-transition readback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-'));
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
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const attemptIdempotencyKey = 'paper-policy-request:current-control-command-alias';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
  const runtimeCommand = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-current-control-command-alias',
    idempotencyKey: attemptIdempotencyKey,
  });
  const { command, runtimeResult, liveReadback } = completeRuntimeReadbackForCommand({
    workspaceRoot,
    command: runtimeCommand,
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner: 'write',
    idempotencyKey: attemptIdempotencyKey,
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_pending_count: 1,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        source_fingerprint: 'truth-snapshot::current-control-command-alias',
        dispatch_authority: 'consumer_default_executor_dispatch',
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        next_executable_owner: 'write',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command: command,
        domain_progress_transition_runtime: runtimeResult,
        opl_domain_progress_transition_runtime_live_readback: liveReadback,
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
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(queue.family_runtime_queue.tasks.length, 1);
    assert.deepEqual(task.payload.current_control_command_outbox_record, task.payload.current_control_command);
    assert.equal(task.payload.current_control_command_outbox_record.idempotency_key, attemptIdempotencyKey);
    assert.equal(
      task.payload.provider_admission_identity.current_control_command_outbox_record.idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      task.payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime rejects current-control command alias when runtime readback identity mismatches', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-mismatch-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-mismatch-'));
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
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const commandIdempotencyKey = 'paper-policy-request:current-control-command-alias';
  const readbackIdempotencyKey = 'paper-policy-request:current-control-command-alias-other';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
  const command = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-current-control-command-alias',
    idempotencyKey: commandIdempotencyKey,
  });
  const mismatchedCommand = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-current-control-command-alias-other',
    idempotencyKey: readbackIdempotencyKey,
  });
  const {
    runtimeResult,
    liveReadback,
  } = completeRuntimeReadbackForCommand({
    workspaceRoot,
    command: mismatchedCommand,
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner: 'write',
    idempotencyKey: readbackIdempotencyKey,
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_pending_count: 1,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        source_fingerprint: 'truth-snapshot::current-control-command-alias-mismatch',
        dispatch_authority: 'consumer_default_executor_dispatch',
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        route_identity_key: commandIdempotencyKey,
        attempt_idempotency_key: commandIdempotencyKey,
        next_executable_owner: 'write',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command: command,
        domain_progress_transition_runtime: runtimeResult,
        opl_domain_progress_transition_runtime_live_readback: liveReadback,
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
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_admission_command_record_missing',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime refuses to publish provider admission readback from incomplete transition runtime transaction', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-incomplete-transition-readback-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const incompleteReadback = {
    surface_kind: 'opl_domain_progress_transition_runtime_live_readback',
    runtime_id: 'opl_domain_progress_transition_runtime',
    runtime_readback_status: 'incomplete_transaction',
    transaction_complete: false,
    causality: {
      same_transaction_event_and_outbox: false,
      runtime_readback_status: 'incomplete_transaction',
      transaction_complete: false,
      fail_closed_reason: 'domain_progress_transition_readback_incomplete_transaction',
    },
    exactly_one_outcome: {
      selected: false,
      exactly_one_transition: false,
      stable_outcome: false,
      fail_closed: true,
      outcome_kind: 'blocked_incomplete_transaction',
    },
    latest_transaction_readback: {
      transaction_id: 'dptx:incomplete',
      command_present: true,
      event_present: true,
      outbox_item_present: false,
      same_transaction_event_and_outbox: false,
      same_stage_run_identity: false,
    },
  };
  const payload = {
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    action_type: 'run_quality_repair_batch',
    work_unit_id: 'medical_prose_write_repair',
    work_unit_fingerprint: 'publication-blockers::incomplete-readback',
    action_fingerprint: 'publication-blockers::incomplete-readback',
    source_fingerprint: 'truth-snapshot::incomplete-readback',
    route_identity_key: 'paper-policy-request:incomplete-readback',
    attempt_idempotency_key: 'paper-policy-request:incomplete-readback',
    next_executable_owner: 'write',
    owner_route_current: true,
    provider_completion_is_domain_completion: false,
    opl_domain_progress_transition_runtime_live_readback: incompleteReadback,
    provider_admission_identity: {
      status: 'provider_admission_pending',
      route_identity_key: 'paper-policy-request:incomplete-readback',
      attempt_idempotency_key: 'paper-policy-request:incomplete-readback',
      provider_completion_is_domain_completion: false,
      opl_domain_progress_transition_runtime_live_readback: incompleteReadback,
    },
  };
  try {
    fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
    fs.writeFileSync(currentControlPath, JSON.stringify({
      surface: 'opl_current_control_state',
      transition_request_pending_count: 1,
      provider_admission_pending_count: 0,
      provider_admission_candidates: [],
    }, null, 2), 'utf8');

    const published = publishCurrentControlProviderAdmissionReadback({
      output: {
        workspace: {
          workspace_root: workspaceRoot,
          workspace_exists: true,
        },
      },
      taskInput: {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        source: 'opl-current-control-transition-request',
        priority: 95,
        dedupeKey: 'mas:dm-cvd:003:transition-request:incomplete-readback',
        requiresApproval: false,
        payload,
      },
      taskResult: {
        accepted: true,
        task: { payload },
      },
    });
    const currentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));

    assert.equal(published.published, false);
    assert.equal(published.reason, 'transition_runtime_live_readback_incomplete');
    assert.equal(currentControl.provider_admission_pending_count, 0);
    assert.equal(currentControl.transition_request_pending_count, 1);
    assert.deepEqual(currentControl.provider_admission_candidates, []);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake consumes terminal OPL provider admission instead of republishing pending on volatile refresh', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-terminal-consumed-readback-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-terminal-consumed-readback-'));
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
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
  const routeIdentityKey = 'owner-route::dm003::quality-repair-current';
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
  const writeExport = (runtimeHealthEpoch: string, generatedAt: string) => writeJsonEmitterScript(exportPath, {
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
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:transition-request:${actionType}`,
        source_fingerprint: 'truth-snapshot::dm003-transition-request',
        reason: 'current_control_transition_request_pending',
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: 'truth-snapshot::dm003-transition-request',
          dispatch_authority: 'domain_owner_transition_request',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          owner_route_current: true,
          provider_attempt_or_lease_required: true,
          provider_completion_is_domain_completion: false,
          route_identity_key: routeIdentityKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route_currentness_basis: {
            generated_at: generatedAt,
            observed_generation: 'truth-event-dm003-transition-request',
            derived_generation: 'truth-event-dm003-transition-request',
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
            truth_epoch: 'truth-event-dm003-transition-request',
            runtime_health_epoch: runtimeHealthEpoch,
            currentness_digest_basis: {
              runtime_digest: runtimeHealthEpoch,
              stable_truth_digest: 'truth-event-dm003-transition-request',
              volatile_projection_digest: `projection:${runtimeHealthEpoch}`,
              work_unit_digest: workUnitFingerprint,
            },
          },
          opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
            studyId,
            actionType,
            workUnitId,
            workUnitFingerprint,
            sourceGeneration: 'truth-event-dm003-transition-request',
            idempotencyKey: attemptIdempotencyKey,
          }),
        },
      },
    ],
  });
  writeExport('runtime-health-event-01', '2026-06-17T14:55:58Z');
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const firstIntake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    assert.equal(firstIntake.family_runtime_intake.enqueued_count, 1);
    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const task = db.prepare(`
        SELECT *
        FROM tasks
        WHERE dedupe_key = ?
      `).get(attemptIdempotencyKey) as any;
      assert.ok(task);
      const taskPayload = JSON.parse(task.payload_json);
      const attempt = ensureProviderHostedStageAttempt(db, task, taskPayload, {
        eventSource: 'test-terminal-consumed-readback',
      });
      assert.ok(attempt);
      const closeoutRefs = [
        `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/${attempt.stage_attempt_id}.closeout.json`,
      ];
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'completed',
          closeout_refs_json = ?,
          provider_receipt_json = ?,
          provider_run_json = ?,
          closeout_receipt_status = 'accepted_typed_closeout'
        WHERE stage_attempt_id = ?
      `).run(
        JSON.stringify(closeoutRefs),
        JSON.stringify({ closeout_refs: closeoutRefs }),
        JSON.stringify({ provider_status: 'completed' }),
        attempt.stage_attempt_id,
      );
      db.prepare(`
        UPDATE tasks
        SET status = 'succeeded'
        WHERE task_id = ?
      `).run(task.task_id);
    } finally {
      db.close();
    }
    writeExport('runtime-health-event-02', '2026-06-17T15:00:00Z');

    const secondIntake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);

    assert.equal(secondIntake.family_runtime_intake.enqueued_count, 0);
    assert.equal(secondIntake.family_runtime_intake.requeued_count, 0);
    assert.equal(secondIntake.family_runtime_intake.idempotent_noop_count, 1);
    assert.equal(secondIntake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(
      secondIntake.family_runtime_intake.exports[0].current_control_readback_publications[0].status,
      'provider_admission_terminal_consumed',
    );
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'succeeded');
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_provider_admission_terminal_consumed',
    );
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 0);
    assert.equal(refreshedCurrentControl.provider_admission_candidates.length, 0);
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'provider_admission_terminal_consumed',
    );
    assert.equal(
      refreshedCurrentControl.latest_provider_admission_terminal_consumed_readback.status,
      'provider_admission_terminal_consumed',
    );
    assert.equal(
      refreshedCurrentControl.latest_provider_admission_terminal_consumed_readback.currentness_identity
        .attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_projection_metadata.terminal_consumed,
      true,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_projection_metadata.provider_completion_is_domain_completion,
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

test('family-runtime current-control recovery obligation id flows into stage attempt and read model without authority escalation', () => {
  const db = new DatabaseSync(':memory:');
  const obligationId = 'paper-recovery-obligation:dm002:stage-run-closeout';
  const payload = {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: 'sha256:recovery-obligation-current',
    action_fingerprint: 'sha256:recovery-obligation-current',
    source_fingerprint: 'truth-snapshot::recovery-obligation-current',
    dispatch_authority: 'opl_current_control_state_handoff',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    executor_kind: 'codex_cli_default',
    next_executable_owner: 'ai_reviewer',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    owner_route_current: true,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    recovery_obligation_id: obligationId,
    stage_transition_authority_boundary: providerObservationBoundary(),
    provider_admission_schema_source: 'action_queue',
    provider_admission_identity: {
      status: 'provider_admission_pending',
      recovery_obligation_id: obligationId,
      provider_completion_is_domain_completion: false,
      stage_transition_authority_boundary: providerObservationBoundary(),
    },
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: '2026-06-08T15:41:00+00:00',
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: 'sha256:recovery-obligation-current',
      truth_epoch: 'truth-event-000041',
      runtime_health_epoch: 'runtime-health-event-006693',
      source_eval_id: 'source-eval:dm002:recovery-obligation',
    },
  };
  try {
    createQueueTables(db);
    insertQueuedTask(db, {
      taskId: 'task-recovery-obligation',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:recovery-obligation',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get('task-recovery-obligation') as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];

    const attempt = ensureProviderHostedStageAttempt(db, row, payload);
    const readModel = deriveCurrentControlStateForTask(db, 'task-recovery-obligation');

    assert.ok(attempt);
    assert.equal(attempt.workspace_locator.recovery_obligation_id, obligationId);
    assert.equal(record(attempt.workspace_locator.provider_admission_identity).recovery_obligation_id, obligationId);
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_artifact_gate, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.equal(readModel.stage_run_currentness_identity.recovery_obligation_id, obligationId);
    assert.equal(
      record(readModel.stage_run_currentness_identity.provider_admission_identity).recovery_obligation_id,
      obligationId,
    );
    assert.equal(readModel.authority_boundary.can_write_domain_truth, false);
    assert.equal(readModel.authority_boundary.opl_can_authorize_publication_ready, false);
    assert.equal(readModel.authority_boundary.opl_can_sign_domain_owner_receipt, false);
    assert.equal(readModel.authority_boundary.opl_can_authorize_domain_ready, false);
    assert.equal(
      readModel.missing_stage_run_currentness_identity_fields.includes('recovery_obligation_id'),
      false,
    );
  } finally {
    db.close();
  }
});

test('family-runtime current-control DomainProgressTransitionRuntime apply proof flows into provider admission attempt', () => {
  const db = new DatabaseSync(':memory:');
  const obligationId = 'paper-recovery-obligation:dm002:execute-current-owner-delta';
  const decisionId = [
    obligationId,
    'execute_current_owner_delta',
    'stage-run:dm002:current',
    'owner-route::dm002::pas-current',
    'owner-route-attempt::dm002::pas-current',
  ].join('|');
  const transitionApply = {
    surface_kind: 'opl_domain_progress_transition_packet',
    obligation_id: obligationId,
    transition_runtime_kind: 'DomainProgressTransitionRuntime',
    transition_decision_ref: decisionId,
    transition_kind: 'execute_current_owner_delta',
    transition_ref: 'mas://DM002/current-owner-delta/latest.json',
    provider_admission_identity_ref: 'opl://provider-admission/dm002/current',
    current_identity: {
      stage_run_id: 'stage-run:dm002:current',
      route_identity_key: 'owner-route::dm002::pas-current',
      attempt_idempotency_key: 'owner-route-attempt::dm002::pas-current',
      selected_dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      stage_packet_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
      stage_packet_refs: [
        'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
      ],
      provider_attempt_ref: 'opl://stage-attempts/stage-run:dm002:current',
      attempt_lease_ref: 'opl://leases/stage-run:dm002:current',
      workflow_ref: 'temporal://workflow/stage-run:dm002:current',
      source_fingerprint: 'truth-snapshot::pas-current',
      truth_epoch: 'truth-event-pas-current',
      runtime_health_epoch: 'runtime-health-event-pas-current',
      work_unit_fingerprint: 'sha256:pas-current',
    },
    runtime_apply_target: {
      kind: 'provider_attempt_or_owner_callable',
      provider_admission_required: true,
      owner_callable_required: true,
      domain_truth_owner: 'med-autoscience',
    },
    exactly_one_apply: {
      scope: 'stage_run_identity',
      selected: true,
      non_advancing_apply: false,
    },
    read_model_metadata: {
      observed_generation: 'truth-event-pas-current',
      derived_generation: 'truth-event-pas-current',
      source_generation: 'truth-event-pas-current',
      expected_version: 'truth-event-pas-current',
    },
    replay_fixture: {
      command_outbox_ref: 'opl://domain-progress-transition/outbox/owner-route-attempt%3A%3Adm002%3A%3Apas-current',
      stage_run_identity_ref: 'opl://domain-progress-transition/stage-run/owner-route%3A%3Adm002%3A%3Apas-current',
      replay_reads_body: false,
    },
    authority_boundary: {
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  };
  const payload = {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: 'sha256:pas-current',
    action_fingerprint: 'sha256:pas-current',
    source_fingerprint: 'truth-snapshot::pas-current',
    dispatch_authority: 'opl_current_control_state_handoff',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    executor_kind: 'codex_cli_default',
    next_executable_owner: 'ai_reviewer',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    owner_route_current: true,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    recovery_obligation_id: obligationId,
    route_identity_key: 'owner-route::dm002::pas-current',
    attempt_idempotency_key: 'owner-route-attempt::dm002::pas-current',
    stage_packet_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
    stage_packet_refs: [
      'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
    ],
    stage_transition_authority_boundary: providerObservationBoundary(),
    provider_admission_schema_source: 'action_queue',
    domain_progress_transition_apply: transitionApply,
    provider_admission_identity: {
      status: 'provider_admission_pending',
      recovery_obligation_id: obligationId,
      route_identity_key: 'owner-route::dm002::pas-current',
      attempt_idempotency_key: 'owner-route-attempt::dm002::pas-current',
      provider_completion_is_domain_completion: false,
      stage_transition_authority_boundary: providerObservationBoundary(),
      domain_progress_transition_apply: transitionApply,
    },
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: '2026-06-15T08:00:00+00:00',
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: 'sha256:pas-current',
      truth_epoch: 'truth-event-pas-current',
      runtime_health_epoch: 'runtime-health-event-pas-current',
      source_eval_id: 'source-eval:dm002:pas-current',
    },
  };
  try {
    createQueueTables(db);
    insertQueuedTask(db, {
      taskId: 'task-pas-current-control',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:pas-current',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get('task-pas-current-control') as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];

    const attempt = ensureProviderHostedStageAttempt(db, row, payload);
    const locatorTransitionApply = record(attempt?.workspace_locator.domain_progress_transition_apply);
    const locatorRuntimeApplyTarget = record(locatorTransitionApply.runtime_apply_target);
    const providerAdmissionApply = record(
      record(attempt?.workspace_locator.provider_admission_identity).domain_progress_transition_apply,
    );

    assert.ok(attempt);
    assert.equal(locatorTransitionApply.transition_kind, 'execute_current_owner_delta');
    assert.equal(locatorTransitionApply.transition_runtime_kind, 'DomainProgressTransitionRuntime');
    assert.equal(
      locatorRuntimeApplyTarget.kind,
      'provider_attempt_or_owner_callable',
    );
    assert.equal(record(locatorTransitionApply.exactly_one_apply).selected, true);
    assert.equal(record(locatorTransitionApply.exactly_one_apply).non_advancing_apply, false);
    assert.equal(record(locatorTransitionApply.read_model_metadata).observed_generation, 'truth-event-pas-current');
    assert.equal(record(locatorTransitionApply.replay_fixture).replay_reads_body, false);
    assert.equal(
      providerAdmissionApply.transition_ref,
      'mas://DM002/current-owner-delta/latest.json',
    );
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_artifact_gate, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
  } finally {
    db.close();
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
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    'run_gate_clearing_batch.stage-packet.json',
  ].join('/');
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
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        route_identity_key: 'owner-route::dm003::gate-clearing-current',
        attempt_idempotency_key: 'owner-route-attempt::dm003::gate-clearing-current',
        next_executable_owner: 'finalize',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId,
          actionType,
          workUnitId,
          workUnitFingerprint,
          sourceGeneration: 'truth-event-gate-clearing-current',
          idempotencyKey: 'owner-route-attempt::dm003::gate-clearing-current',
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
