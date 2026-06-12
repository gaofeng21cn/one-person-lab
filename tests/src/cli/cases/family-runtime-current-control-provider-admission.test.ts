import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { enqueueTask } from '../../../../src/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../src/family-runtime-provider-hosted-attempts.ts';
import type { FamilyRuntimeTaskRow } from '../../../../src/family-runtime-store.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertQueuedTask,
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

function writeDefaultExecutorDispatchPacket(workspaceRoot: string, studyId: string, actionType: string) {
  const ref = [
    'studies',
    studyId,
    'artifacts',
    'supervision',
    'consumer',
    'default_executor_dispatches',
    `${actionType}.json`,
  ].join('/');
  const packetPath = path.join(workspaceRoot, ref);
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, JSON.stringify({
    surface_kind: 'mas_default_executor_dispatch_request',
    study_id: studyId,
    quest_id: studyId,
    action_type: actionType,
    profile: 'dm-cvd',
  }), 'utf8');
  return ref;
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
    const payload = JSON.parse(task.payload_json);
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

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

test('family-runtime enqueue replaces stale queued MAS current-control admission for newer work-unit fingerprint', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-queued-stale-admission';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission';
    const stalePayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-1',
        '01',
        'current-ai-reviewer-gate-replay::003::old-record',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    stalePayload.owner_route_currentness_basis = {
      ...stalePayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    const freshPayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-2',
        '02',
        'current-ai-reviewer-gate-replay::003::20260611T122549Z::sat_64c5fb484e8ee7b3971786ee',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    freshPayload.owner_route_currentness_basis = {
      ...freshPayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: stalePayload,
      dedupeKey,
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
    const payload = JSON.parse(task.payload_json);
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, false);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm003-generation-2');
    assert.equal(
      payload.owner_route_currentness_basis.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::20260611T122549Z::sat_64c5fb484e8ee7b3971786ee',
    );
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_queued',
    );
    assert.equal(
      eventPayload.previous_currentness_identity.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::old-record',
    );
    assert.equal(eventPayload.next_status, 'queued');
    assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime stage attempt locator keeps fresh MAS payload fingerprint ahead of stale nested owner-route basis', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const payload = {
      ...currentControlAdmissionPayload(
        'sha256:fresh-source',
        '03',
        'sha256:fresh-top-level-work-unit',
      ),
      owner_route: {
        currentness_contract: {
          basis: {
            work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            work_unit_fingerprint: 'sha256:stale-nested-owner-route-basis',
            truth_epoch: 'truth-event-stale',
            runtime_health_epoch: 'runtime-health-event-stale',
          },
        },
        source_refs: {
          owner_route_currentness_basis: {
            work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            work_unit_fingerprint: 'sha256:fresh-top-level-work-unit',
            truth_epoch: 'truth-event-03',
            runtime_health_epoch: 'runtime-health-event-03',
          },
        },
        work_unit_fingerprint: 'sha256:fresh-top-level-work-unit',
        source_fingerprint: 'sha256:fresh-source',
      },
      owner_route_currentness_basis: undefined,
    };
    const taskId = 'task-mas-current-control-fresh-payload-over-stale-nested-basis';
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey: 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::fresh-payload-over-stale-nested',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
    const attempt = ensureProviderHostedStageAttempt(db, row, payload);

    assert.ok(attempt);
    assert.equal(
      attempt.workspace_locator.work_unit_fingerprint,
      'sha256:fresh-top-level-work-unit',
    );
    assert.equal(attempt.workspace_locator.domain_source_fingerprint, 'sha256:fresh-source');
    assert.equal(
      attempt.workspace_locator.owner_route.currentness_contract.basis.work_unit_fingerprint,
      'sha256:stale-nested-owner-route-basis',
    );
  } finally {
    db.close();
  }
});

test('family-runtime enqueue keeps stale queued MAS current-control admission behind approval gate when refreshed', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-waiting-stale-admission';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission-held';
    const stalePayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-1',
        '01',
        'current-ai-reviewer-gate-replay::003::old-held-record',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    stalePayload.owner_route_currentness_basis = {
      ...stalePayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    const freshPayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-2',
        '02',
        'current-ai-reviewer-gate-replay::003::held-fresh-record',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    freshPayload.owner_route_currentness_basis = {
      ...freshPayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: stalePayload,
      dedupeKey,
      status: 'waiting_approval',
      requiresApproval: true,
      lastError: 'operator_hold:publication_gate_review',
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, requires_approval, last_error, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      requires_approval: number;
      last_error: string | null;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = JSON.parse(task.payload_json);
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, false);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'waiting_approval');
    assert.equal(task.status, 'waiting_approval');
    assert.equal(task.requires_approval, 1);
    assert.equal(task.last_error, 'operator_hold:publication_gate_review');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm003-generation-2');
    assert.equal(
      payload.owner_route_currentness_basis.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::held-fresh-record',
    );
    assert.ok(requeueEvent);
    assert.equal(eventPayload.previous_status, 'waiting_approval');
    assert.equal(eventPayload.next_status, 'waiting_approval');
    assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime enqueue treats concurrent dedupe-key insert as idempotent noop', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission-race';
    const payload = currentControlAdmissionPayload(
      'truth-snapshot::dm003-generation-race',
      'race',
      'sha256:concurrent-current-control-work-unit',
    );
    const concurrentTaskId = 'task-concurrent-current-control-admission';
    let selectCount = 0;
    let insertedConcurrentTask = false;
    const raceDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'prepare') {
          return Reflect.get(target, prop, receiver);
        }
        return (sql: string) => {
          const statement = target.prepare(sql);
          const normalizedSql = sql.replace(/\s+/g, ' ').trim();
          if (normalizedSql === 'SELECT * FROM tasks WHERE dedupe_key = ?') {
            return {
              get(...args: Parameters<typeof statement.get>) {
                selectCount += 1;
                if (selectCount === 1) {
                  return undefined;
                }
                return statement.get(...args);
              },
            };
          }
          if (normalizedSql.startsWith('INSERT INTO tasks(')) {
            return {
              run(...args: Parameters<typeof statement.run>) {
                if (!insertedConcurrentTask) {
                  insertedConcurrentTask = true;
                  insertSucceededTask(db, {
                    taskId: concurrentTaskId,
                    domainId: 'medautoscience',
                    taskKind: 'domain_owner/default-executor-dispatch',
                    payload,
                    dedupeKey,
                  });
                }
                return statement.run(...args);
              },
            };
          }
          return statement;
        };
      },
    }) as DatabaseSync;

    const result = enqueueTask(raceDb, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-current-control-concurrent-intake',
    });
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_enqueue_dedupe_race_noop'
      LIMIT 1
    `).get(concurrentTaskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.task_id, concurrentTaskId);
    assert.equal(result.task?.status, 'succeeded');
    assert.ok(event);
    assert.equal(
      JSON.parse(event.payload_json).reason,
      'concurrent_enqueue_dedupe_key_won_by_existing_task',
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
