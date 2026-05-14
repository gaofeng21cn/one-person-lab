import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime stage attempt create is idempotent by semantic attempt key unless explicitly bypassed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-idem-'));
  const createArgs = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'scout',
    '--provider',
    'local_sqlite',
    '--workspace-locator',
    '{"workspace_root":"/tmp/mas"}',
    '--source-fingerprint',
    'sha256:scout',
    '--task',
    'task-1',
  ];
  try {
    const first = runCli(createArgs, familyRuntimeEnv(stateRoot));
    const second = runCli(createArgs, familyRuntimeEnv(stateRoot));
    const third = runCli([...createArgs, '--new-attempt'], familyRuntimeEnv(stateRoot));
    const attempts = runCli(['family-runtime', 'attempt', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_stage_attempt.created, true);
    assert.equal(first.family_runtime_stage_attempt.idempotent_noop, false);
    assert.equal(second.family_runtime_stage_attempt.created, false);
    assert.equal(second.family_runtime_stage_attempt.idempotent_noop, true);
    assert.equal(
      second.family_runtime_stage_attempt.attempt.stage_attempt_id,
      first.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.equal(third.family_runtime_stage_attempt.created, true);
    assert.equal(third.family_runtime_stage_attempt.idempotent_noop, false);
    assert.notEqual(
      third.family_runtime_stage_attempt.attempt.stage_attempt_id,
      first.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 2);
    assert.equal(
      first.family_runtime_stage_attempt.attempt.idempotency_key,
      second.family_runtime_stage_attempt.attempt.idempotency_key,
    );
    assert.notEqual(
      first.family_runtime_stage_attempt.attempt.idempotency_key,
      third.family_runtime_stage_attempt.attempt.idempotency_key,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query, signal, and fixture-run expose provider lifecycle without domain verdict ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-query-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","runtime_root":"/tmp/mas/runtime","artifact_root":"/tmp/mas/artifacts","restore_refs":["restore:mas-runtime-loop"]}',
      '--source-fingerprint',
      'sha256:analysis',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queryBefore = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const humanGate = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'human_gate',
      '--payload',
      '{"human_gate_ref":"gate:analysis-review","reason":"needs_human_review"}',
    ], familyRuntimeEnv(stateRoot));
    const humanGateQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const resumed = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"reason":"operator_resume"}',
    ], familyRuntimeEnv(stateRoot));
    const userInstruction = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:revision-10","instruction_count":10}',
    ], familyRuntimeEnv(stateRoot));
    const fixtureRun = runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:analysis-campaign',
      '--checkpoint-ref',
      'checkpoint:analysis-slice-1',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_refs":["evidence:table1"],"writeback_receipt_refs":["memory-writeback:receipt-analysis"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","reason":"weak_primary_endpoint","next_owner":"med-autoscience"}}',
    ], familyRuntimeEnv(stateRoot));
    const queryAfter = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));

    assert.equal(queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.workflow_contract, null);
    assert.equal(queryBefore.family_runtime_stage_attempt_query.temporal_query, null);
    assert.equal(
      queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(humanGate.family_runtime_stage_attempt_signal.attempt.status, 'human_gate');
    assert.deepEqual(humanGate.family_runtime_stage_attempt_signal.attempt.human_gate_refs, ['gate:analysis-review']);
    assert.equal(
      humanGateQuery.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.human_gate_ledger[0].payload.reason,
      'needs_human_review',
    );
    assert.equal(resumed.family_runtime_stage_attempt_signal.attempt.status, 'queued');
    assert.equal(userInstruction.family_runtime_stage_attempt_signal.signal.signal_kind, 'user_instruction');
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.provider_fixture_run.provider_completion, 'completed');
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.provider_fixture_run.domain_ready_verdict,
      'domain_gate_pending',
    );
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.closeout_receipt_status,
      'accepted_typed_closeout',
    );
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.route_impact.decision, 'bounded_repair');
    assert.ok(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.activity_events.length >= 2);
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.activity_events.at(-1).activity_status,
      'completed',
    );
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.next_owner, 'med-autoscience');
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.route_impact.decision,
      'bounded_repair',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.closeout_receipt_status,
      'accepted_typed_closeout',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.provider_run.provider_kind,
      'local_sqlite',
    );
    assert.ok(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.activity_events.length >= 2);
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.signals.length, 3);
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.human_gate_ledger.length,
      1,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.user_instruction_ledger[0].payload.instruction_ref,
      'user:revision-10',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.resume_ledger[0].payload.reason,
      'operator_resume',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.rejected_writes[0].reason,
      'domain_truth_write_forbidden',
    );
    assert.deepEqual(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.artifact_locator_index, {
      locator_kind: 'workspace_runtime_artifact_locator',
      workspace_root: '/tmp/mas',
      runtime_root: '/tmp/mas/runtime',
      artifact_root: '/tmp/mas/artifacts',
      indexed_refs: [
        'receipt:analysis-closeout',
        'evidence:table1',
        'memory-writeback:receipt-analysis',
      ],
      indexed_ref_count: 3,
      content_policy: 'locator_only_no_artifact_content',
    });
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.retention_policy.opl_can_apply_retention,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.restore_proof.restore_gate_status,
      'restore_refs_declared',
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.restore_proof.required_refs,
      [
        'restore:mas-runtime-loop',
        'receipt:analysis-closeout',
        'evidence:table1',
        'memory-writeback:receipt-analysis',
      ],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.restore_proof.opl_cleanup_allowed,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.authority_boundary.domain,
      'artifact_content_retention_restore_authority',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion,
      'completed',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.domain_ready_verdict,
      'domain_gate_pending',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime lifecycle guarded apply separates OPL ledger apply from domain-owned cleanup blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-lifecycle-guarded-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'deliverable-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/redcube',
        runtime_root: '/tmp/redcube/runtime',
        artifact_root: '/tmp/redcube/artifacts',
        restore_refs: ['restore:redcube-run-1'],
        lifecycle_apply_requests: [
          {
            action_id: 'opl-ledger-retention-index',
            action_kind: 'retention',
            target_ref: 'opl-ledger:redcube-run-1',
            authority_owner: 'opl_framework',
            owner_scope: 'opl_owned_ledger',
          },
          {
            action_id: 'redcube-artifact-cleanup',
            action_kind: 'cleanup',
            target_ref: 'artifact:redcube-final-deck',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
            restore_ref: 'restore:redcube-run-1',
          },
          {
            action_id: 'redcube-retention-restore-missing',
            action_kind: 'retention',
            target_ref: 'artifact:redcube-draft-cache',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
          },
          {
            action_id: 'redcube-domain-receipt-observed',
            action_kind: 'restore',
            target_ref: 'artifact:redcube-review-pdf',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
            domain_receipt_ref: 'redcube-receipt:restore-accepted',
            restore_ref: 'restore:redcube-run-1',
          },
        ],
      }),
      '--source-fingerprint',
      'sha256:lifecycle',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const proof = query.family_runtime_stage_attempt_query.stage_attempt_query
      .lifecycle_primitives.guarded_apply_proof;

    assert.equal(proof.surface_kind, 'family_runtime_lifecycle_guarded_apply_proof');
    assert.equal(proof.apply_status, 'blocked_domain_receipt_required');
    assert.deepEqual(proof.summary, {
      requested_actions_count: 4,
      opl_apply_permitted_count: 1,
      domain_receipt_observed_count: 1,
      typed_blocker_count: 2,
      domain_writes_performed: false,
    });
    assert.equal(proof.actions[0].apply_decision, 'opl_apply_permitted');
    assert.equal(proof.actions[0].receipt_kind, 'opl_lifecycle_ledger_apply_receipt');
    assert.equal(proof.actions[1].apply_decision, 'typed_blocker');
    assert.equal(proof.actions[1].blocker.blocker_id, 'domain_owned_lifecycle_receipt_required');
    assert.equal(proof.actions[2].blocker.blocker_id, 'restore_ref_required_before_lifecycle_apply');
    assert.equal(proof.actions[3].apply_decision, 'domain_receipt_observed');
    assert.equal(proof.actions[3].opl_writes_domain_truth, false);
    assert.deepEqual(proof.authority_boundary.forbidden_opl_actions, [
      'delete_domain_artifact',
      'restore_domain_workspace_content',
      'apply_domain_retention_policy',
      'write_domain_truth',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime controlled apply contract returns MAG/RCA domain receipt requirements without domain writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-controlled-apply-'));
  try {
    const mag = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'specific-aims',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mag',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
        },
      }),
      '--source-fingerprint',
      'sha256:mag-controlled-apply',
    ], familyRuntimeEnv(stateRoot));
    const rca = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'visual-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/rca',
        controlled_soak_no_regression_attempt: {
          surface_kind: 'controlled_soak_no_regression_attempt',
          no_regression_evidence_refs: ['rca:no-regression:visual-stage-1'],
        },
      }),
      '--source-fingerprint',
      'sha256:rca-controlled-apply',
    ], familyRuntimeEnv(stateRoot));

    const magQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      mag.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const rcaQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      rca.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const magContract = magQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;
    const rcaContract = rcaQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;

    assert.equal(magContract.surface_kind, 'family_runtime_controlled_apply_contract');
    assert.equal(magContract.contract_id, 'opl_temporal_controlled_stage_attempt_apply_contract');
    assert.equal(magContract.contract_open, true);
    assert.equal(magContract.apply_status, 'blocked_domain_receipt_required');
    assert.equal(
      magContract.typed_blockers[0].blocker_id,
      'opl_temporal_controlled_stage_attempt_apply_contract:domain_receipt_or_no_regression_evidence_required',
    );
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_truth, false);
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_artifact, false);
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_memory_body, false);
    assert.equal(rcaContract.contract_id, 'opl_temporal_controlled_visual_stage_attempt_apply_contract');
    assert.equal(rcaContract.apply_status, 'no_regression_evidence_observed');
    assert.deepEqual(rcaContract.no_regression_evidence_refs, ['rca:no-regression:visual-stage-1']);
    assert.deepEqual(rcaContract.typed_blockers, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query exposes task dead-letter ledger on linked attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-dead-letter-'));
  try {
    const task = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'redcube',
      '--task-kind',
      'render/recover',
      '--payload',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const taskId = task.family_runtime_enqueue.task.task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
      '--task',
      taskId,
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE tasks SET status = 'dead_letter', attempts = 3, dead_letter_reason = 'retry_budget_exhausted', last_error = 'planned failure' WHERE task_id = ?").run(${JSON.stringify(taskId)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(attemptId)});
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const visibility = query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.equal(visibility.dead_letter.reason, 'retry_budget_exhausted');
    assert.equal(visibility.dead_letter.task.status, 'dead_letter');
    assert.equal(visibility.dead_letter.task.last_error, 'planned failure');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt fixture-run rejects missing typed closeout refs without completing attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-closeout-reject-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","summary":"free text without refs"}',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);
    const inspected = runCli(['family-runtime', 'attempt', 'inspect', attemptId], familyRuntimeEnv(stateRoot));

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.status, 'running');
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_receipt_status, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start fails closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-start-missing-'));
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--start',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);
    const attempts = runCli(['family-runtime', 'attempt', 'list'], familyRuntimeEnv(stateRoot));

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 1);
    assert.equal(attempts.family_runtime_stage_attempts.attempts[0].provider_kind, 'temporal');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt inspect projects current provider readiness separately from creation receipt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-current-provider-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const service = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  service.unref();
  worker.unref();

  try {
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: service.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      started_at: new Date().toISOString(),
      status: 'ready',
    }, null, 2)}\n`);

    const env = familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
    });
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'ai_reviewer_re_eval',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], env);
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const inspected = runCli(['family-runtime', 'attempt', 'inspect', attemptId], env);
    const listed = runCli(['family-runtime', 'attempt', 'list'], env);

    assert.equal(
      created.family_runtime_stage_attempt.attempt.provider_receipt.receipt_status,
      'provider_code_landed_unconfigured',
    );
    assert.equal(created.family_runtime_stage_attempt.attempt.provider_receipt.provider_ready, false);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.provider_ready, true);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.status, 'ready');
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.provider_receipt_is_creation_time_snapshot,
      true,
    );
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.details.address_source,
      'managed_local_service_state',
    );
    assert.equal(listed.family_runtime_stage_attempts.attempts[0].current_provider_readiness.provider_ready, true);
  } finally {
    process.kill(service.pid!, 'SIGTERM');
    process.kill(worker.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query and signal fail closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-missing-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    for (const args of [
      ['family-runtime', 'attempt', 'query', attemptId],
      [
        'family-runtime',
        'attempt',
        'signal',
        attemptId,
        '--kind',
        'resume',
        '--payload',
        '{"reason":"operator_resume"}',
      ],
    ]) {
      const result = spawnSync(process.execPath, [
        '--experimental-strip-types',
        path.join(repoRoot, 'src', 'cli.ts'),
        ...args,
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_STATE_DIR: stateRoot,
          OPL_TEMPORAL_ADDRESS: '',
          TEMPORAL_ADDRESS: '',
        },
      });
      const output = JSON.parse(result.stdout || result.stderr);

      assert.notEqual(result.status, 0);
      assert.equal(output.error.code, 'contract_shape_invalid');
      assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start refuses non-temporal attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-start-provider-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'cli_usage_error');
    assert.match(output.error.message, /temporal stage attempt/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt fixture-run ingests typed memory closeout refs and signal history', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-memory-closeout-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts"}',
      '--source-fingerprint',
      'sha256:review-memory',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;

    runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:revision-10","instruction_count":10}',
      '--source',
      'operator',
    ], familyRuntimeEnv(stateRoot));
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"resume_token":"resume:review-memory","reason":"operator_resume"}',
      '--source',
      'operator',
    ], familyRuntimeEnv(stateRoot));

    const fixtureRun = runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--checkpoint-ref',
      'checkpoint:review-midpoint',
      '--closeout-packet',
      '{"surface_kind":"stage_memory_closeout_packet","closeout_refs":["receipt:review-closeout"],"consumed_refs":["evidence:review-ledger"],"consumed_memory_refs":["memory:route-policy","memory:reviewer-style"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"target":"memory","reason":"domain_router_rejected"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"route":"review","impact":"needs_revision"}}',
    ], familyRuntimeEnv(stateRoot));
    const queryAfter = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const visibility = queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(visibility.consumed_memory_refs, ['memory:route-policy', 'memory:reviewer-style']);
    assert.deepEqual(visibility.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(visibility.rejected_writes[0].reason, 'domain_router_rejected');
    assert.equal(visibility.route_impact.impact, 'needs_revision');
    assert.equal(visibility.user_instructions.length, 1);
    assert.equal(visibility.resume_signals.length, 1);
    assert.equal(visibility.resume_signals[0].payload.resume_token, 'resume:review-memory');
    assert.equal(
      visibility.authority_boundary.domain,
      'truth_quality_artifact_gate_owner',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime residency proof aggregates Temporal attempt, signal, blocked, and closeout evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-residency-proof-ledger-'));
  try {
    const completed = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:temporal-proof-completed',
    ], familyRuntimeEnv(stateRoot));
    const completedId = completed.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      completedId,
      '--checkpoint-ref',
      'checkpoint:temporal-proof',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:temporal-proof"],"domain_ready_verdict":"domain_gate_pending"}',
    ], familyRuntimeEnv(stateRoot));

    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const signalResult = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at) VALUES (?, ?, 'human_gate', ?, 'test-fixture', ?)").run('sig_temporal_proof', ${JSON.stringify(completedId)}, '{"human_gate_ref":"gate:temporal-proof","reason":"operator_review"}', new Date().toISOString());
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(signalResult.status, 0, signalResult.stderr);

    runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'blocked-closeout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:temporal-proof-blocked',
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot));

    const task = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const taskId = task.family_runtime_enqueue.task.task_id;
    const deadLettered = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'retry-budget',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--task',
      taskId,
      '--source-fingerprint',
      'sha256:temporal-proof-dead-letter',
    ], familyRuntimeEnv(stateRoot));
    const deadLetteredId = deadLettered.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE tasks SET status = 'dead_letter', attempts = 3, dead_letter_reason = 'retry_budget_exhausted', last_error = 'planned failure' WHERE task_id = ?").run(${JSON.stringify(taskId)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetteredId)});
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const proof = runCli(
      ['family-runtime', 'residency', 'proof', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot),
    ).family_runtime_residency_proof;

    assert.equal(proof.proofs.attempt_start_query_signal.temporal_attempts_total, 3);
    assert.equal(proof.proofs.attempt_start_query_signal.temporal_signal_counts.human_gate, 1);
    assert.equal(proof.proofs.attempt_start_query_signal.retry_dead_letter_blocked.dead_lettered_attempts, 1);
    assert.equal(proof.proofs.attempt_start_query_signal.retry_dead_letter_blocked.blocked_attempts, 1);
    assert.equal(proof.proofs.attempt_start_query_signal.retry_dead_letter_blocked.proof_status, 'proven');
    assert.equal(proof.proofs.typed_closeout_required.temporal_completed_attempts, 1);
    assert.equal(proof.proofs.typed_closeout_required.temporal_typed_closeout_accepted_attempts, 1);
    assert.equal(proof.proofs.typed_closeout_required.temporal_blocked_attempts, 1);
    assert.equal(proof.proofs.typed_closeout_required.proof_status, 'proven');
    assert.equal(proof.closeout_status, 'production_residency_needs_live_evidence');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
