import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { enqueueTask } from '../../../../src/family-runtime-enqueue.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
} from './family-runtime-provider-hosted-attempts-cases/mas-default-executor-helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function writeJsonEmitterScript(scriptPath: string, payload: unknown) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify(payload, null, 2)}\n`)});`)}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

function providerObservationBoundary() {
  return {
    producer_kind: 'runtime_provider',
    intent_kind: 'provider_observation',
    stage_transition_authority: 'one-person-lab',
    intent_can_write_stage_current_pointer: false,
    intent_can_write_stage_run_terminal_state: false,
    intent_can_publish_current_owner_delta: false,
    intent_can_write_domain_truth: false,
    intent_can_create_owner_receipt: false,
    intent_can_create_typed_blocker: false,
    provider_completion_counts_as_stage_transition: false,
    read_model_update_counts_as_stage_transition: false,
    worklist_update_counts_as_stage_transition: false,
    evidence_event_counts_as_stage_transition: false,
    agent_lab_output_counts_as_stage_transition: false,
  };
}

function currentControlActionQueueItem(input: {
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  sourceFingerprint: string;
  truthEpoch: string;
  runtimeHealthEpoch: string;
  nextOwner?: string;
  dispatchable?: boolean | null;
}) {
  const nextOwner = input.nextOwner ?? 'ai_reviewer';
  return {
    action_fingerprint: input.workUnitFingerprint,
    action_type: input.actionType,
    controller_work_unit_id: input.workUnitId,
    executable_work_unit: input.workUnitId,
    source_fingerprint: input.sourceFingerprint,
    study_id: input.studyId,
    work_unit_fingerprint: input.workUnitFingerprint,
    required_output_surface: 'artifacts/publication_eval/ai_reviewer_responses/*_publication_eval_record.json',
    owner: nextOwner,
    handoff_packet: {
      action_fingerprint: input.workUnitFingerprint,
      action_type: input.actionType,
      idempotency_key: [
        'owner-route',
        input.studyId,
        input.truthEpoch,
        nextOwner,
        input.workUnitId,
        input.workUnitFingerprint,
      ].join('::'),
      next_executable_owner: nextOwner,
      owner: nextOwner,
      quest_id: input.studyId,
      study_id: input.studyId,
      owner_route: {
        currentness_contract: {
          basis: {
            runtime_health_epoch: input.runtimeHealthEpoch,
            truth_epoch: input.truthEpoch,
            work_unit_fingerprint: input.workUnitFingerprint,
            work_unit_id: input.workUnitId,
          },
          fail_closed_when_missing: true,
          missing_required_fields: [],
          status: 'currentness_basis_required',
        },
        currentness_digest_basis: {
          runtime_digest: `runtime:${input.runtimeHealthEpoch}`,
          stable_truth_digest: `truth:${input.truthEpoch}`,
          work_unit_digest: `work-unit:${input.workUnitFingerprint}`,
        },
        idempotency_key: `owner-route::${input.studyId}::${input.truthEpoch}::${nextOwner}::${input.workUnitId}`,
        next_owner: nextOwner,
        owner_route_attempt_protocol: {
          authority_boundary: {
            mas_owns: [
              'domain_truth',
              'ai_reviewer',
              'publication_gate',
              'artifact_authority',
              'owner_receipt',
              'typed_blocker',
            ],
            opl_owns: [
              'queue',
              'attempt',
              'retry',
              'dead_letter',
              'provider_liveness',
            ],
          },
          completion_boundary: {
            domain_ready_verdict: 'read_from_mas_publication_or_gate_surface',
            provider_completion: 'typed_closeout_packet_observed',
            provider_completion_is_domain_ready: false,
          },
          ...(input.dispatchable === null ? {} : { dispatchable: input.dispatchable ?? true }),
          runtime_completion_guard: {
            domain_completion_owner: 'med-autoscience',
            domain_completion_requires: [
              'mas_owner_receipt_ref',
              'mas_typed_blocker_ref',
              'ai_reviewer_or_publication_gate_ref',
            ],
            provider_completion_is_domain_completion: false,
            provider_completion_is_stage_state: false,
            queue_succeeded_is_domain_completion: false,
            retry_budget_is_domain_completion: false,
            running_worker_is_stage_state: false,
            stage_state_owner: 'one-person-lab',
          },
        },
        quest_id: input.studyId,
        route_epoch: input.truthEpoch,
        runtime_health_epoch: input.runtimeHealthEpoch,
        source_fingerprint: input.sourceFingerprint,
        study_id: input.studyId,
        truth_epoch: input.truthEpoch,
        work_unit_fingerprint: input.workUnitFingerprint,
      },
    },
  };
}

function currentControlAdmissionPayload(
  sourceFingerprint: string,
  generation: string,
  workUnitFingerprint = `sha256:current-control-${generation}`,
) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'opl_current_control_state_handoff',
    next_executable_owner: 'ai_reviewer',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: workUnitFingerprint,
    provider_admission_schema_source: 'action_queue',
    provider_admission_identity: {
      status: 'provider_admission_pending',
      provider_admission_schema_source: 'action_queue',
      action_fingerprint: workUnitFingerprint,
    },
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: `2026-06-08T15:${generation}:00+00:00`,
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: workUnitFingerprint,
      truth_epoch: `truth-event-${generation}`,
      runtime_health_epoch: `runtime-health-event-${generation}`,
      currentness_digest_basis: {
        runtime_digest: `runtime-${generation}`,
        stable_truth_digest: `truth-${generation}`,
        work_unit_digest: `work-unit-${generation}`,
      },
    },
  };
}

function insertCompletedCurrentControlStageAttempt(
  db: DatabaseSync,
  input: {
    taskId: string;
    stageAttemptId: string;
    payload: Record<string, unknown>;
  },
) {
  const createdAt = new Date().toISOString();
  const sourceFingerprint = typeof input.payload.source_fingerprint === 'string'
    ? input.payload.source_fingerprint
    : null;
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
      workspace_locator_json, source_fingerprint, executor_kind, status, checkpoint_refs_json,
      closeout_refs_json, human_gate_refs_json, retry_budget_json, attempt_count, task_id,
      blocked_reason, provider_receipt_json, provider_run_json, activity_events_json,
      route_impact_json, closeout_receipt_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.stageAttemptId,
    `${input.stageAttemptId}:idempotency`,
    'temporal',
    `${input.stageAttemptId}:workflow`,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify({
      surface_kind: 'opl_provider_hosted_task_workspace_locator',
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      profile: input.payload.profile,
      study_id: input.payload.study_id,
      quest_id: input.payload.quest_id,
      action_type: input.payload.action_type,
      dispatch_authority: input.payload.dispatch_authority,
      dispatch_ref: input.payload.dispatch_ref,
      next_executable_owner: input.payload.next_executable_owner,
      workspace_root: input.payload.workspace_root,
      authority_boundary: input.payload.authority_boundary,
      owner_route_currentness_basis: input.payload.owner_route_currentness_basis,
      domain_source_fingerprint: input.payload.source_fingerprint,
      domain_truth_owner: 'med-autoscience',
      opl_writes_domain_truth: false,
      opl_writes_publication_quality: false,
      opl_writes_artifact_gate: false,
      opl_writes_current_package: false,
    }),
    sourceFingerprint,
    'codex_cli',
    'completed',
    '[]',
    '[]',
    '[]',
    '{"max_attempts":3}',
    1,
    input.taskId,
    null,
    '{}',
    '{"provider_status":"completed"}',
    '[]',
    '{}',
    'accepted_typed_closeout',
    createdAt,
    createdAt,
  );
}

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
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_transition_authority_boundary.intent_can_publish_current_owner_delta,
      false,
    );
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_identity.status, 'provider_admission_pending');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:current-dm003');
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
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.owner_route_currentness_basis.truth_epoch,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_transition_authority_boundary.intent_can_write_domain_truth,
      false,
    );
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:handoff-dm003');
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

test('family-runtime rehydrates terminal MAS current-control admission only when currentness identity is fresh', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-terminal-admission';
    const dedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::current-control-admission';
    const firstPayload = currentControlAdmissionPayload('truth-snapshot::dm002-generation-1', '01');
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: firstPayload,
      dedupeKey,
    });

    const identical = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: firstPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const freshPayload = currentControlAdmissionPayload('truth-snapshot::dm002-generation-2', '02');
    const fresh = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = JSON.parse(task.payload_json);

    assert.equal(identical.accepted, false);
    assert.equal(identical.idempotent_noop, true);
    assert.equal(identical.task?.status, 'succeeded');
    assert.equal(fresh.accepted, true);
    assert.equal(fresh.requeued_from_terminal, true);
    assert.equal(fresh.idempotent_noop, false);
    assert.equal(fresh.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm002-generation-2');
    assert.equal(payload.owner_route_currentness_basis.truth_epoch, 'truth-event-02');
    assert.ok(requeueEvent);
    assert.equal(
      JSON.parse(requeueEvent.payload_json).reason,
      'mas_current_control_provider_admission_fresh_after_succeeded',
    );
  } finally {
    db.close();
  }
});

test('family-runtime rehydrates terminal MAS current-control admission when stage attempt identity is stale', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-terminal-attempt-stale-admission';
    const stageAttemptId = 'sat_current_control_attempt_stale_identity';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission';
    const workUnitFingerprint = 'sha256:same-current-control-work-unit';
    const staleAttemptPayload = currentControlAdmissionPayload(
      'truth-snapshot::dm003-generation-1',
      '01',
      workUnitFingerprint,
    );
    const freshPayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-2',
        '02',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    };
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
    });
    insertCompletedCurrentControlStageAttempt(db, {
      taskId,
      stageAttemptId,
      payload: staleAttemptPayload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;
    const payload = JSON.parse(task.payload_json);

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm003-generation-2');
    assert.equal(payload.owner_route_currentness_basis.truth_epoch, 'truth-event-02');
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_terminal_attempt',
    );
    assert.equal(eventPayload.terminal_stage_attempt_id, stageAttemptId);
    assert.equal(
      eventPayload.terminal_currentness_identity.source_fingerprint,
      'truth-snapshot::dm003-generation-1',
    );
    assert.equal(
      eventPayload.next_currentness_identity.source_fingerprint,
      'truth-snapshot::dm003-generation-2',
    );
  } finally {
    db.close();
  }
});

test('family-runtime intake blocks current-control provider candidates that claim domain completion authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-authority-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-authority-'));
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
    surface: 'opl_current_control_state',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm002',
        action_fingerprint: 'sha256:current-dm002',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_completion_is_domain_completion: true,
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
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_completion_claims_domain_completion',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks current-control provider candidates without Stage Authority boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-boundary-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-boundary-'));
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
    surface: 'opl_current_control_state',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm002',
        action_fingerprint: 'sha256:current-dm002',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_completion_is_domain_completion: false,
      },
      {
        status: 'provider_admission_pending',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm003',
        action_fingerprint: 'sha256:current-dm003',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: {
          ...providerObservationBoundary(),
          intent_can_publish_current_owner_delta: true,
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
      intake.family_runtime_intake.exports[0].blocked.map((entry: { reason: string }) => entry.reason),
      [
        'current_control_provider_admission_missing_stage_authority_boundary',
        'current_control_provider_admission_missing_stage_authority_boundary',
      ],
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
