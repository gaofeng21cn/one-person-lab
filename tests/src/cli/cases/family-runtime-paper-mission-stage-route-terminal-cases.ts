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
