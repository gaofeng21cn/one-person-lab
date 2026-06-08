import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

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
