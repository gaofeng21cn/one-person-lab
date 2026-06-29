import {
  assert,
  familyRuntimeEnv,
  fs,
  openQueueDb,
  os,
  paperMissionRoutePayload,
  paperMissionRoutePayloadWithCarrierIdentityOnly,
  path,
  runCli,
  test,
} from './family-runtime-paper-mission-stage-route-helpers.ts';

test('family-runtime typed closeout reconciles terminal MAS PaperMission stage-route without self-admitting successor execution', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const userStageLog = {
      surface_kind: 'opl_user_stage_log',
      semantic_status: 'provided_by_domain',
      semantic_source: 'med_autoscience.paper_mission_stage_route',
      stage_name: 'PaperMission stage route for DM002',
      progress_delta_classification: 'deliverable_progress',
    };
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload()),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-reconcile',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:opl_runtime_live_readback_required'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'opl_runtime_live_readback_required',
          user_stage_log: userStageLog,
        },
      }),
    ], env);
    const immediateTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const reconcile = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-terminal'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const runningQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'paper_mission/stage-route',
      '--status',
      'running',
    ], env);

    assert.equal(immediateTask.family_runtime_task.task.status, 'blocked');
    assert.equal(immediateTask.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.deepEqual(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, []);
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(task.family_runtime_task.stage_attempts[0].status, 'completed');
    assert.equal(task.family_runtime_task.stage_attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(task.family_runtime_task.stage_attempts[0].closeout_refs, [
      'typed-blocker:opl_runtime_live_readback_required',
    ]);
    assert.equal(task.family_runtime_task.stage_attempts[0].route_impact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(
      task.family_runtime_task.events.some((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled',
      ),
      true,
    );
    const terminalReconcileEvents = task.family_runtime_task.events.filter((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );
    assert.equal(terminalReconcileEvents.length, 1);
    assert.equal(terminalReconcileEvents[0].source, 'typed-closeout-ingest:paper-mission-stage-route-terminal');
    assert.equal(
      terminalReconcileEvents[0].payload.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.authority_boundary.can_claim_paper_progress,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.route_identity_key,
      'paper-mission-transaction:dm002:1::route',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.surface_kind,
      'opl_transition_receipt',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.role,
      'transport_receipt_only',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.receipt_status,
      'terminal_closeout_observed',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.paper_mission_transaction_ref,
      'paper-mission-transaction:dm002:1',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.opl_route_command_ref,
      'paper-mission-transaction:dm002:1#opl_route_command',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.stage_attempt_ref,
      `opl://stage-attempts/${attemptId}`,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.typed_runtime_blocker_ref,
      'typed-blocker:opl_runtime_live_readback_required',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.route_impact.user_stage_log.semantic_status,
      'provided_by_domain',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.route_impact.user_stage_log.semantic_source,
      'med_autoscience.paper_mission_stage_route',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.route_impact.user_stage_log.progress_delta_classification,
      'deliverable_progress',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.can_change_stage_terminal_decision,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.can_select_next_owner,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.authority_boundary.can_claim_paper_progress,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.opl_transition_receipt.authority_boundary.writes_owner_receipt,
      false,
    );
    assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
    assert.equal(terminalReconcileEvents[0].payload.successor_task_id, null);
    assert.equal(terminalReconcileEvents[0].payload.successor_created, false);
    assert.equal(terminalReconcileEvents[0].payload.terminal_successor_identity_ready, true);
    assert.equal(terminalReconcileEvents[0].payload.terminal_successor_self_admission_suppressed, true);
    assert.equal(
      terminalReconcileEvents[0].payload.terminal_successor_policy,
      'terminal_provider_closeout_cannot_self_admit_successor_external_fresh_handoff_required',
    );
    const secondReconcile = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-terminal-repeat'], env);
    const repeatedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const repeatedRunningQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'paper_mission/stage-route',
      '--status',
      'running',
    ], env);
    assert.equal(secondReconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.deepEqual(secondReconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, []);
    assert.equal(
      repeatedTask.family_runtime_task.events.filter((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      ).length,
      1,
    );
    assert.equal(repeatedRunningQueue.family_runtime_queue.queue.total, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not backfill successor admission for historical blocked terminal PaperMission stage-route tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-backfill-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload({
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-backfill',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-backfill-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-backfill',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:historical-opl-runtime-live-readback-required'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'historical_opl_runtime_live_readback_required',
        },
      }),
    ], env);
    const afterCloseout = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(afterCloseout.family_runtime_task.task.status, 'blocked');
    assert.equal(afterCloseout.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-backfill-terminal'], env);
    const backfilledTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const runningQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'paper_mission/stage-route',
      '--status',
      'running',
    ], env);
    const terminalEvents = backfilledTask.family_runtime_task.events.filter((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );
    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.deepEqual(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, []);
    assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
    assert.equal(terminalEvents.length, 1);
    assert.equal(terminalEvents[0].payload.terminal_successor_self_admission_suppressed, true);
    assert.equal(terminalEvents[0].payload.successor_created, false);

    const repeatedBackfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-backfill-terminal-repeat'], env);
    const repeatedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(repeatedBackfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.equal(
      repeatedTask.family_runtime_task.events.filter((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      ).length,
      1,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime backfills OPL transition receipt for historical terminal reconcile events', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-receipt-backfill-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload()),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-receipt-backfill',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-receipt-backfill-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-receipt-backfill',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:receipt-backfill-required'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      }),
    ], env);

    const originalStateDir = process.env.OPL_STATE_DIR;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const { db } = openQueueDb();
      db.prepare(`
        UPDATE events
        SET payload_json = json_remove(payload_json, '$.opl_transition_receipt')
        WHERE task_id = ?
          AND event_type = 'paper_mission_stage_route_terminal_task_reconciled'
          AND json_extract(payload_json, '$.stage_attempt_id') = ?
      `).run(taskId, attemptId);
      db.close();
    } finally {
      process.env.OPL_STATE_DIR = originalStateDir;
    }

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-receipt-backfill-terminal'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const receiptEvents = task.family_runtime_task.events.filter((event: { event_type: string; payload: Record<string, any> }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      && event.payload.opl_transition_receipt
    );

    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.deepEqual(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, [taskId]);
    assert.equal(receiptEvents.length, 1);
    assert.equal(receiptEvents[0].payload.opl_transition_receipt.surface_kind, 'opl_transition_receipt');
    assert.equal(receiptEvents[0].payload.opl_transition_receipt.receipt_status, 'terminal_closeout_observed');
    assert.equal(receiptEvents[0].payload.opl_transition_receipt.authority_boundary.can_claim_paper_progress, false);

    const repeatedBackfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-receipt-backfill-repeat'], env);
    const repeatedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(repeatedBackfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.equal(
      repeatedTask.family_runtime_task.events.filter((event: { event_type: string; payload: Record<string, any> }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
        && event.payload.opl_transition_receipt
      ).length,
      1,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime backfills OPL transition receipt for stage-route user-stage-log closeout blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-user-log-receipt-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload({
        command_kind: 'route_back',
        route_target: 'submission_milestone_candidate::followthrough::followthrough-02',
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:user-stage-log-receipt',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-user-log-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;

    const originalStateDir = process.env.OPL_STATE_DIR;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const { db } = openQueueDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
          last_error = 'typed_closeout_paper_mission_stage_route_user_stage_log_missing',
          dead_letter_reason = 'typed_closeout_paper_mission_stage_route_user_stage_log_missing'
        WHERE task_id = ?
      `).run(taskId);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'blocked',
          blocked_reason = 'typed_closeout_paper_mission_stage_route_user_stage_log_missing',
          closeout_refs_json = ?
        WHERE stage_attempt_id = ?
      `).run(JSON.stringify([
        `opl://stage-attempts/${attemptId}/runtime-blockers/typed_closeout_paper_mission_stage_route_user_stage_log_missing`,
      ]), attemptId);
      db.prepare(`
        INSERT INTO events(task_id, domain_id, event_type, source, payload_json, created_at)
        VALUES(?, 'medautoscience', 'paper_mission_stage_route_terminal_task_reconciled', 'legacy-test', ?, datetime('now'))
      `).run(taskId, JSON.stringify({
        stage_attempt_id: attemptId,
        reason: 'typed_closeout_paper_mission_stage_route_user_stage_log_missing',
      }));
      db.close();
    } finally {
      process.env.OPL_STATE_DIR = originalStateDir;
    }

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-user-log-receipt'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const receiptEvents = task.family_runtime_task.events.filter((event: { event_type: string; payload: Record<string, any> }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      && event.payload.opl_transition_receipt
    );

    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.equal(receiptEvents.length, 1);
    assert.equal(
      receiptEvents[0].payload.opl_transition_receipt.blocked_reason,
      'typed_closeout_paper_mission_stage_route_user_stage_log_missing',
    );
    assert.equal(
      receiptEvents[0].payload.opl_transition_receipt.receipt_status,
      'typed_runtime_blocker_observed',
    );
    assert.equal(
      receiptEvents[0].payload.opl_transition_receipt.authority_boundary.writes_typed_blocker,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not self-admit terminal successor when route identity exists only in nested OPL carrier', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-nested-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayloadWithCarrierIdentityOnly({
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
        opl_route_handoff_record: {
          opl_runtime_carrier: {
            command_kind: 'resume_stage',
            route_target: 'continue paper-facing submission milestone work',
            route_identity_key: 'paper-mission-transaction:dm002:1::route',
            attempt_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-attempt',
            request_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-request',
          },
        },
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-nested-identity',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-terminal-nested-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-terminal-nested',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:nested-carrier-opl-runtime-live-readback-required'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'nested_carrier_opl_runtime_live_readback_required',
        },
      }),
    ], env);

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-terminal-nested-backfill'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const runningQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'paper_mission/stage-route',
      '--status',
      'running',
    ], env);
    const reconcileEvent = task.family_runtime_task.events.find((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );

    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
    assert.equal(reconcileEvent.payload.terminal_successor_identity_ready, true);
    assert.equal(reconcileEvent.payload.terminal_successor_self_admission_suppressed, true);
    assert.deepEqual(reconcileEvent.payload.missing_terminal_successor_identity_fields, []);
    assert.equal(
      reconcileEvent.payload.terminal_successor_policy,
      'terminal_provider_closeout_cannot_self_admit_successor_external_fresh_handoff_required',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not backfill terminal successors from legacy PaperMission routes without route identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-legacy-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload({
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:legacy-terminal-backfill',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-legacy-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-legacy',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:legacy-route-identity-missing'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'legacy_route_identity_missing',
        },
      }),
    ], env);
    const afterCloseout = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(afterCloseout.family_runtime_task.task.status, 'blocked');
    assert.equal(afterCloseout.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');

    const originalStateDir = process.env.OPL_STATE_DIR;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const { db } = openQueueDb();
      db.prepare('DELETE FROM tasks WHERE dedupe_key = ?').run(`paper-mission-route-terminal-successor:${taskId}:${attemptId}`);
      db.prepare(`
        UPDATE tasks
        SET payload_json = json_remove(
            payload_json,
            '$.route_identity_key',
            '$.attempt_idempotency_key',
            '$.request_idempotency_key',
            '$.stage_run_request.route_identity_key',
            '$.stage_run_request.attempt_idempotency_key',
            '$.stage_run_request.request_idempotency_key'
          )
        WHERE task_id = ?
      `).run(taskId);
      db.prepare(`
        DELETE FROM events
        WHERE event_type = 'task_enqueued'
          AND json_extract(payload_json, '$.dedupe_key') = ?
      `).run(`paper-mission-route-terminal-successor:${taskId}:${attemptId}`);
      db.prepare(`
        DELETE FROM events
        WHERE task_id = ?
          AND event_type = 'paper_mission_stage_route_terminal_task_reconciled'
          AND json_extract(payload_json, '$.stage_attempt_id') = ?
      `).run(taskId, attemptId);
      db.close();
    } finally {
      process.env.OPL_STATE_DIR = originalStateDir;
    }

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-legacy-terminal'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const runningQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'paper_mission/stage-route',
      '--status',
      'running',
    ], env);
    const identityNotReadyEvents = task.family_runtime_task.events.filter(
      (event: { event_type: string; payload: Record<string, unknown> }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
        && event.payload.terminal_successor_identity_ready === false,
    );
    const reconcileEvent = identityNotReadyEvents[0];

    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.deepEqual(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, [taskId]);
    assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.notEqual(reconcileEvent, undefined);
    assert.equal(identityNotReadyEvents.length, 1);
    assert.equal(reconcileEvent.payload.successor_task_id, null);
    assert.equal(reconcileEvent.payload.successor_created, false);
    assert.equal(reconcileEvent.payload.terminal_successor_identity_ready, false);
    assert.deepEqual(reconcileEvent.payload.missing_terminal_successor_identity_fields, [
      'route_identity_key',
      'attempt_idempotency_key',
    ]);
    assert.equal(reconcileEvent.payload.authority_boundary.can_claim_paper_progress, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime terminal closeout supersedes prior Temporal start failure for PaperMission route tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-start-failed-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload()),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-start-failed',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-start-failed-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-start-failed',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:domain-gate-after-temporal-start-failure'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'domain_gate_after_temporal_start_failure',
        },
      }),
    ], env);

    const originalStateDir = process.env.OPL_STATE_DIR;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const { db } = openQueueDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
          last_error = 'paper_mission_stage_route_temporal_start_failed',
          dead_letter_reason = 'paper_mission_stage_route_temporal_start_failed'
        WHERE task_id = ?
      `).run(taskId);
      db.prepare(`
        DELETE FROM events
        WHERE task_id = ?
          AND event_type = 'paper_mission_stage_route_terminal_task_reconciled'
          AND json_extract(payload_json, '$.stage_attempt_id') = ?
      `).run(taskId, attemptId);
      db.close();
    } finally {
      process.env.OPL_STATE_DIR = originalStateDir;
    }

    const reconcile = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-start-failed-terminal'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const terminalEvents = task.family_runtime_task.events.filter((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );

    assert.equal(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.deepEqual(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, [taskId]);
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(task.family_runtime_task.stage_attempts[0].status, 'completed');
    assert.equal(task.family_runtime_task.stage_attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(terminalEvents.length, 1);
    assert.equal(terminalEvents[0].payload.previous_status, 'blocked');
    assert.equal(terminalEvents[0].payload.next_status, 'blocked');
    assert.equal(terminalEvents[0].payload.reason, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(terminalEvents[0].payload.authority_boundary.can_claim_paper_progress, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const commandKind of ['route_back', 'resume_stage'] as const) {
  test(`family-runtime terminal closeout does not self-admit ${commandKind} PaperMission route commands`, () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-paper-mission-stage-route-${commandKind}-`));
    try {
      const env = familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
      });
      const transactionRef = `paper-mission-transaction:dm002:${commandKind}:terminal-successor`;
      const routeTarget = commandKind === 'route_back'
        ? 'gate_clearing_claim_evidence_repair'
        : 'continue paper-facing submission milestone work';
      const enqueue = runCli([
        'family-runtime',
        'enqueue',
        '--domain',
        'medautoscience',
        '--task-kind',
        'paper_mission/stage-route',
        '--payload',
        JSON.stringify(paperMissionRoutePayload({
          paper_mission_transaction_ref: transactionRef,
          opl_route_command_ref: `${transactionRef}#opl_route_command`,
          command_kind: commandKind,
          route_target: routeTarget,
        })),
        '--dedupe-key',
        `paper-mission-route:dm002:${commandKind}:terminal-successor`,
      ], env);
      const taskId = enqueue.family_runtime_enqueue.task.task_id;
      runCli(['family-runtime', 'tick', '--source', `test-paper-route-${commandKind}-start`], env);
      const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
      const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--stage-packet-ref',
        `packet:paper-mission-route-dm002-${commandKind}`,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`typed-blocker:${commandKind}:opl_runtime_live_readback_required`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            decision: 'bounded_repair',
            next_owner: 'med-autoscience',
            reason: `${commandKind}_opl_runtime_live_readback_required`,
          },
        }),
      ], env);
      runCli(['family-runtime', 'tick', '--source', `test-paper-route-${commandKind}-terminal`], env);
      const originalTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
      const runningQueue = runCli([
        'family-runtime',
        'queue',
        'list',
        '--domain',
        'medautoscience',
        '--study',
        '002-dm-china-us-mortality-attribution',
        '--task-kind',
        'paper_mission/stage-route',
        '--status',
        'running',
      ], env);

      assert.equal(originalTask.family_runtime_task.task.status, 'blocked');
      assert.equal(originalTask.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
      assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
      const reconcileEvent = originalTask.family_runtime_task.events.find((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      );
      assert.equal(reconcileEvent.payload.command_kind, commandKind);
      assert.equal(reconcileEvent.payload.route_target, routeTarget);
      assert.equal(reconcileEvent.payload.successor_task_id, null);
      assert.equal(reconcileEvent.payload.successor_created, false);
      assert.equal(reconcileEvent.payload.terminal_successor_self_admission_suppressed, true);
      assert.equal(
        reconcileEvent.payload.terminal_successor_policy,
        'terminal_provider_closeout_cannot_self_admit_successor_external_fresh_handoff_required',
      );
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
}
