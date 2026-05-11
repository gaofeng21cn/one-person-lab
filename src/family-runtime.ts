import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { GatewayContractError } from './contracts.ts';
import {
  DOMAIN_ADAPTERS,
  FAMILY_RUNTIME_DOMAIN_IDS,
  parseFamilyRuntimeCommand,
  type EnqueueInput,
  type FamilyRuntimeDomainId,
} from './family-runtime-command.ts';
import {
  ensureFamilyRuntimeProvider,
  inspectFamilyRuntimeProviders,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  ingestStageAttemptCloseout,
  listStageAttempts,
  queryStageAttempt,
  runStageAttemptFixtureActivity,
  signalStageAttempt,
  stageAttemptSummary,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import {
  DEFAULT_MAX_ATTEMPTS,
  QUEUE_SCHEMA_VERSION,
  familyRuntimePaths,
  inspectTask,
  insertEvent,
  insertNotification,
  listEvents,
  listNotifications,
  listTasks,
  nowIso,
  openQueueDb,
  queueSummary,
  stableId,
  taskToPayload,
  type FamilyRuntimeTaskRow,
  type FamilyRuntimeTaskStatus,
} from './family-runtime-store.ts';

function buildStatusPayload(
  db: DatabaseSync,
  paths = familyRuntimePaths(),
  requestedProvider = resolveFamilyRuntimeProviderKind(),
) {
  const selectedProvider = resolveFamilyRuntimeProviderKind(requestedProvider);
  const providerRuntime = inspectFamilyRuntimeProviders(selectedProvider);
  const provider = providerRuntime.providers[selectedProvider]
    ?? (() => {
      throw new GatewayContractError('contract_shape_invalid', 'Selected family runtime provider was not inspected.', {
        selected_provider: selectedProvider,
      });
    })();
  const fullOnlineReady = selectedProvider !== 'local_sqlite' && provider.ready;

  return {
    version: 'g2',
    family_runtime: {
      surface_id: 'opl_family_runtime',
      provider_model: 'provider_backed_stage_attempt_runtime',
      configured_provider: selectedProvider,
      state: {
        state_dir: paths.state_dir,
        runtime_dir: paths.root,
        queue_db: paths.queue_db,
        queue_schema_version: QUEUE_SCHEMA_VERSION,
      },
      readiness: {
        provider_ready: provider.ready,
        full_online_ready: fullOnlineReady,
        durable_online_ready: fullOnlineReady,
        degraded: !provider.ready,
        degraded_reason: provider.degraded_reason,
      },
      provider_runtime: {
        ...providerRuntime,
        selected: provider,
      },
      opl_owner: {
        queue: 'typed_family_queue',
        stage_attempt_ledger: 'provider_attempt_control_metadata_only',
        dispatch: 'domain_adapter_dispatch',
        notification_policy: 'all_delivery_events_are_written_to_local_inbox_first',
        forbidden_authority: [
          'domain_truth',
          'domain_quality_verdict',
          'domain_artifact_or_publication_gate',
        ],
      },
      domain_adapters: DOMAIN_ADAPTERS,
      queue: queueSummary(db),
      stage_attempts: stageAttemptSummary(db),
    },
  };
}

function enqueueTask(db: DatabaseSync, input: EnqueueInput) {
  const createdAt = nowIso();
  const dedupeKey = input.dedupeKey?.trim() || null;
  if (dedupeKey) {
    const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (existing) {
      insertEvent(db, {
        taskId: existing.task_id,
        domainId: existing.domain_id,
        eventType: 'dedupe_noop',
        source: input.source ?? 'opl-cli',
        payload: { dedupe_key: dedupeKey },
      });
      return {
        accepted: false,
        idempotent_noop: true,
        task: taskToPayload(existing),
      };
    }
  }

  const taskId = stableId('frt', [
    input.domainId,
    input.taskKind,
    dedupeKey,
    input.payload,
    createdAt,
  ]);
  const status: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
  const task = {
    task_id: taskId,
    domain_id: input.domainId,
    task_kind: input.taskKind,
    payload_json: JSON.stringify(input.payload),
    dedupe_key: dedupeKey,
    priority: input.priority ?? 0,
    status,
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    source: input.source ?? 'opl-cli',
    requires_approval: input.requiresApproval ? 1 : 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    dead_letter_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts, max_attempts,
      source, requires_approval, approved_at, lease_owner, lease_expires_at, last_error, dead_letter_reason,
      created_at, updated_at
    )
    VALUES (
      @task_id, @domain_id, @task_kind, @payload_json, @dedupe_key, @priority, @status, @attempts, @max_attempts,
      @source, @requires_approval, @approved_at, @lease_owner, @lease_expires_at, @last_error, @dead_letter_reason,
      @created_at, @updated_at
    )
  `).run(task);
  insertEvent(db, {
    taskId,
    domainId: input.domainId,
    eventType: status === 'waiting_approval' ? 'task_waiting_approval' : 'task_enqueued',
    source: input.source ?? 'opl-cli',
    payload: { task_kind: input.taskKind, dedupe_key: dedupeKey },
  });
  insertNotification(db, {
    taskId,
    severity: 'info',
    title: status === 'waiting_approval' ? 'Family runtime task waiting for approval' : 'Family runtime task queued',
    body: `${input.domainId}:${input.taskKind}`,
    payload: { status },
  });
  return {
    accepted: true,
    idempotent_noop: false,
    task: taskToPayload(task as FamilyRuntimeTaskRow),
  };
}

function writeDispatchTask(paths: ReturnType<typeof familyRuntimePaths>, row: FamilyRuntimeTaskRow) {
  const payload = JSON.parse(row.payload_json);
  const taskPayload = taskToPayload(row);
  const dispatchPath = path.join(paths.dispatch_dir, `${row.task_id}.json`);
  fs.writeFileSync(
    dispatchPath,
    JSON.stringify({
      task_id: row.task_id,
      domain_id: row.domain_id,
      task_kind: row.task_kind,
      payload,
      paper_autonomy: taskPayload.paper_autonomy,
      attempts: row.attempts,
      source: 'opl_family_runtime',
      authority_boundary: {
        provider: 'stage_attempt_transport_and_control_metadata_only',
        opl: 'typed_queue_and_dispatch_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    }, null, 2),
    'utf8',
  );
  return dispatchPath;
}

function commandForDomain(domainId: FamilyRuntimeDomainId, taskPath: string) {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_DISPATCH`]?.trim();
  if (override) {
    return [...override.split(/\s+/), taskPath];
  }

  return [...DOMAIN_ADAPTERS[domainId].dispatch_command, '--task', taskPath, '--format', 'json'];
}

function exportCommandForDomain(domainId: FamilyRuntimeDomainId) {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_EXPORT`]?.trim();
  if (override) {
    return override.split(/\s+/);
  }
  if (domainId === 'medautoscience') {
    const profile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE?.trim();
    if (!profile) {
      return null;
    }
    return ['medautosci', 'sidecar', 'export', '--profile', profile, '--format', 'json'];
  }
  return null;
}

function parseDispatchOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw_stdout: trimmed };
  }
}

function toPendingTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
) {
  const tasks = Array.isArray(output.pending_family_tasks) ? output.pending_family_tasks : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      blocked.push({ reason: 'invalid_pending_task', task });
      continue;
    }
    const item = task as Record<string, unknown>;
    const exportedDomain = typeof item.domain_id === 'string' ? item.domain_id : domainId;
    const taskKind = typeof item.task_kind === 'string' ? item.task_kind.trim() : '';
    const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? item.payload as Record<string, unknown>
      : {};
    if (!FAMILY_RUNTIME_DOMAIN_IDS.includes(exportedDomain as FamilyRuntimeDomainId) || !taskKind) {
      blocked.push({ reason: 'invalid_domain_or_task_kind', task });
      continue;
    }
    if (payload.domain_truth_write === true || payload.artifact_gate_override === true) {
      blocked.push({ reason: 'domain_forbidden_write', task });
      continue;
    }
    inputs.push({
      domainId: exportedDomain as FamilyRuntimeDomainId,
      taskKind,
      payload: {
        ...payload,
        ...(Array.isArray(item.source_refs) ? { source_refs: item.source_refs } : {}),
        ...(typeof item.dispatch_owner === 'string' ? { dispatch_owner: item.dispatch_owner } : {}),
        ...(typeof item.profile_name === 'string' ? { profile_name: item.profile_name } : {}),
      },
      dedupeKey: typeof item.dedupe_key === 'string' ? item.dedupe_key : undefined,
      priority: Number.isInteger(item.priority) ? item.priority as number : 0,
      source: typeof item.source === 'string' ? item.source : source,
      requiresApproval: item.requires_approval === true,
    });
  }
  return { inputs, blocked };
}

function hydrateDomainTasks(
  db: DatabaseSync,
  input: { domainId?: FamilyRuntimeDomainId; source: string },
) {
  const domains = input.domainId ? [input.domainId] : [...FAMILY_RUNTIME_DOMAIN_IDS];
  const exports = [];
  let enqueuedCount = 0;
  let idempotentNoopCount = 0;
  let blockedCount = 0;
  for (const domainId of domains) {
    const command = exportCommandForDomain(domainId);
    if (!command) {
      exports.push({ domain_id: domainId, status: 'skipped', reason: 'export_command_not_configured' });
      continue;
    }
    const result = spawnSync(command[0], command.slice(1), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.status ?? (result.error ? 127 : 1);
    if (exitCode !== 0) {
      blockedCount += 1;
      exports.push({
        domain_id: domainId,
        status: 'failed',
        command_preview: command,
        error: result.error?.message || stderr || stdout || `Domain export exited ${exitCode}.`,
      });
      continue;
    }
    const output = parseDispatchOutput(stdout);
    const { inputs, blocked } = toPendingTaskInputs(domainId, output, input.source);
    blockedCount += blocked.length;
    const acceptedTasks = [];
    for (const taskInput of inputs) {
      const resultPayload = enqueueTask(db, taskInput);
      acceptedTasks.push(resultPayload);
      if (resultPayload.accepted) {
        enqueuedCount += 1;
      } else if (resultPayload.idempotent_noop) {
        idempotentNoopCount += 1;
      }
    }
    exports.push({
      domain_id: domainId,
      status: 'completed',
      command_preview: command,
      exported_count: inputs.length + blocked.length,
      enqueued_count: acceptedTasks.filter((task) => task.accepted).length,
      idempotent_noop_count: acceptedTasks.filter((task) => task.idempotent_noop).length,
      blocked_count: blocked.length,
      blocked,
    });
  }
  insertEvent(db, {
    eventType: 'domain_intake_completed',
    source: input.source,
    payload: { enqueued_count: enqueuedCount, idempotent_noop_count: idempotentNoopCount, blocked_count: blockedCount },
  });
  return {
    source: input.source,
    enqueued_count: enqueuedCount,
    idempotent_noop_count: idempotentNoopCount,
    blocked_count: blockedCount,
    exports,
  };
}

function dispatchTask(db: DatabaseSync, paths: ReturnType<typeof familyRuntimePaths>, row: FamilyRuntimeTaskRow) {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  if (payload.domain_truth_write === true || payload.artifact_gate_override === true) {
    const updatedAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ?
    `).run(
      'Domain truth or artifact gate writes are forbidden through the OPL family runtime queue.',
      'domain_forbidden_write',
      updatedAt,
      row.task_id,
    );
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_blocked_domain_forbidden_write',
      source: 'opl-family-runtime',
      payload,
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'Family runtime task blocked',
      body: 'OPL queue cannot write domain truth, quality verdicts, or artifact gates.',
      payload: { reason: 'domain_forbidden_write' },
    });
    const stageAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      status: 'blocked',
      blockedReason: 'domain_forbidden_write',
    });
    return { task_id: row.task_id, status: 'blocked', reason: 'domain_forbidden_write', stage_attempts: stageAttempts };
  }

  const leaseOwner = `opl-family-runtime:${process.pid}`;
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const attempt = row.attempts + 1;
  const runningAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'running', attempts = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(attempt, leaseOwner, leaseExpiresAt, runningAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_started',
    source: 'opl-family-runtime',
    payload: { attempt, lease_owner: leaseOwner, lease_expires_at: leaseExpiresAt },
  });
  const runningStageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    status: 'running',
    incrementAttempt: true,
    activityEvent: {
      activity_kind: 'domain_sidecar_dispatch_activity',
      activity_status: 'running',
    },
  });

  const dispatchPath = writeDispatchTask(paths, { ...row, attempts: attempt });
  const command = commandForDomain(row.domain_id, dispatchPath);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.status ?? (result.error ? 127 : 1);
  const output = parseDispatchOutput(stdout);
  const succeeded = exitCode === 0 && output.forbidden_domain_truth_write !== true;

  if (succeeded) {
    const completedAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(completedAt, row.task_id);
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_dispatch_succeeded',
      source: 'opl-family-runtime',
      payload: { command_preview: command, output },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'info',
      title: 'Family runtime task dispatched',
      body: `${row.domain_id}:${row.task_kind}`,
      payload: { output },
    });
    const closeoutRefs = Array.isArray(output.closeout_refs)
      ? output.closeout_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : undefined;
    const stageAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      status: 'completed',
      closeoutRefs,
      activityEvent: {
        activity_kind: 'domain_sidecar_dispatch_activity',
        activity_status: 'completed',
        closeout_refs: closeoutRefs ?? [],
      },
    });
    return { task_id: row.task_id, status: 'succeeded', command_preview: command, output, stage_attempts: stageAttempts };
  }

  const errorMessage = result.error?.message || stderr || stdout || `Domain dispatch exited ${exitCode}.`;
  const nextStatus: FamilyRuntimeTaskStatus = attempt >= row.max_attempts ? 'dead_letter' : 'retry_waiting';
  const failedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL, last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    nextStatus,
    errorMessage,
    nextStatus === 'dead_letter' ? 'retry_budget_exhausted' : null,
    failedAt,
    row.task_id,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: nextStatus === 'dead_letter' ? 'task_dead_lettered' : 'task_dispatch_retry_queued',
    source: 'opl-family-runtime',
    payload: { command_preview: command, exit_code: exitCode, stderr, stdout },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: nextStatus === 'dead_letter' ? 'error' : 'warning',
    title: nextStatus === 'dead_letter' ? 'Family runtime task dead-lettered' : 'Family runtime task queued for retry',
    body: errorMessage,
    payload: { attempt, max_attempts: row.max_attempts },
  });
  const stageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    status: nextStatus === 'dead_letter' ? 'dead_lettered' : 'failed',
    blockedReason: nextStatus === 'dead_letter' ? 'retry_budget_exhausted' : errorMessage,
    activityEvent: {
      activity_kind: 'domain_sidecar_dispatch_activity',
      activity_status: nextStatus === 'dead_letter' ? 'dead_lettered' : 'failed',
      error: errorMessage,
    },
  });
  return {
    task_id: row.task_id,
    status: nextStatus,
    command_preview: command,
    exit_code: exitCode,
    error: errorMessage,
    stage_attempts: stageAttempts.length > 0 ? stageAttempts : runningStageAttempts,
  };
}

function runTick(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  source: string,
  limit: number,
  hydrate: boolean,
) {
  const hydration = hydrate
    ? hydrateDomainTasks(db, { source: `${source}:hydrate` })
    : { source, enqueued_count: 0, idempotent_noop_count: 0, blocked_count: 0, exports: [] };
  const rows = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'retry_waiting')
    ORDER BY priority DESC, created_at ASC
    LIMIT ?
  `).all(limit) as FamilyRuntimeTaskRow[];
  insertEvent(db, {
    eventType: 'tick_started',
    source,
    payload: { limit, selected_count: rows.length },
  });
  const dispatches = rows.map((row) => dispatchTask(db, paths, row));
  insertEvent(db, {
    eventType: 'tick_completed',
    source,
    payload: { dispatches_count: dispatches.length },
  });
  return {
    source,
    hydration,
    selected_count: rows.length,
    dispatches,
  };
}

function approveTask(
  db: DatabaseSync,
  input: { taskId: string; decision: 'approve' | 'deny'; reason?: string },
) {
  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!row) {
    throw new GatewayContractError('cli_usage_error', 'Family runtime task not found.', {
      task_id: input.taskId,
    });
  }
  const updatedAt = nowIso();
  const status: FamilyRuntimeTaskStatus = input.decision === 'approve' ? 'queued' : 'denied';
  db.prepare(`
    UPDATE tasks
    SET status = ?, approved_at = ?, last_error = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    status,
    input.decision === 'approve' ? updatedAt : null,
    input.decision === 'deny' ? input.reason ?? 'approval_denied' : null,
    updatedAt,
    input.taskId,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: input.decision === 'approve' ? 'task_approved' : 'task_denied',
    source: 'opl-cli',
    payload: { reason: input.reason ?? null },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: input.decision === 'approve' ? 'info' : 'warning',
    title: input.decision === 'approve' ? 'Family runtime task approved' : 'Family runtime task denied',
    body: row.task_id,
    payload: { decision: input.decision, reason: input.reason ?? null },
  });
  return taskToPayload(
    db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as FamilyRuntimeTaskRow,
  );
}

export function runFamilyRuntime(args: string[]) {
  const parsed = parseFamilyRuntimeCommand(args);
  const { db, paths } = openQueueDb();
  try {
    if (parsed.mode === 'status') {
      return buildStatusPayload(db, paths, resolveFamilyRuntimeProviderKind(parsed.providerKind));
    }
    if (parsed.mode === 'doctor') {
      const status = buildStatusPayload(db, paths, resolveFamilyRuntimeProviderKind(parsed.providerKind)).family_runtime;
      return {
        version: 'g2',
        family_runtime_doctor: {
          surface_id: 'opl_family_runtime_doctor',
          doctor_status: status.readiness.provider_ready ? 'ready' : 'degraded',
          blockers: status.readiness.degraded_reason ? [status.readiness.degraded_reason] : [],
          repair_command: `opl family-runtime repair --provider ${status.configured_provider}`,
          status,
        },
      };
    }
    if (parsed.mode === 'install' || parsed.mode === 'repair') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      const provider = ensureFamilyRuntimeProvider(providerKind, parsed.mode);
      insertEvent(db, {
        eventType: `provider_${parsed.mode}`,
        source: 'opl-cli',
        payload: { provider_kind: providerKind, status: provider.status, actions: provider.actions },
      });
      return {
        version: 'g2',
        family_runtime_provider: {
          ...provider,
        },
      };
    }
    if (parsed.mode === 'enqueue') {
      return {
        version: 'g2',
        family_runtime_enqueue: {
          surface_id: 'opl_family_runtime_enqueue',
          ...enqueueTask(db, parsed.input),
        },
      };
    }
    if (parsed.mode === 'tick') {
      return {
        version: 'g2',
        family_runtime_tick: {
          surface_id: 'opl_family_runtime_tick',
          ...runTick(db, paths, parsed.source ?? 'manual', parsed.limit ?? 10, parsed.hydrate ?? false),
          queue: queueSummary(db),
        },
      };
    }
    if (parsed.mode === 'intake') {
      return {
        version: 'g2',
        family_runtime_intake: {
          surface_id: 'opl_family_runtime_intake',
          ...hydrateDomainTasks(db, { domainId: parsed.domainId, source: parsed.source ?? 'manual' }),
          queue: queueSummary(db),
        },
      };
    }
    if (parsed.mode === 'queue_list') {
      return {
        version: 'g2',
        family_runtime_queue: {
          surface_id: 'opl_family_runtime_queue',
          queue: queueSummary(db),
          tasks: listTasks(db),
        },
      };
    }
    if (parsed.mode === 'queue_inspect') {
      return {
        version: 'g2',
        family_runtime_task: {
          surface_id: 'opl_family_runtime_task',
          ...inspectTask(db, parsed.taskId),
        },
      };
    }
    if (parsed.mode === 'attempt_create') {
      if (parsed.input.start) {
        throw new GatewayContractError(
          'contract_shape_invalid',
          'family-runtime attempt create --start requires the Temporal provider start path; this interface is registered but not executed by local ledger.',
          {
            provider_kind: parsed.input.providerKind ?? resolveFamilyRuntimeProviderKind(),
          },
        );
      }
      const result = createStageAttempt(db, parsed.input);
      const { attempt } = result;
      insertEvent(db, {
        taskId: attempt.task_id,
        domainId: parsed.input.domainId,
        eventType: result.idempotent_noop ? 'stage_attempt_idempotent_noop' : 'stage_attempt_created',
        source: 'opl-cli',
        payload: {
          stage_attempt_id: attempt.stage_attempt_id,
          idempotency_key: attempt.idempotency_key,
          provider_kind: attempt.provider_kind,
          stage_id: attempt.stage_id,
          task_id: attempt.task_id,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt: {
          surface_id: 'opl_family_runtime_stage_attempt',
          created: result.created,
          idempotent_noop: result.idempotent_noop,
          attempt,
        },
      };
    }
    if (parsed.mode === 'attempt_list') {
      return {
        version: 'g2',
        family_runtime_stage_attempts: {
          surface_id: 'opl_family_runtime_stage_attempts',
          summary: stageAttemptSummary(db),
          attempts: listStageAttempts(db),
        },
      };
    }
    if (parsed.mode === 'attempt_inspect') {
      return {
        version: 'g2',
        family_runtime_stage_attempt: {
          surface_id: 'opl_family_runtime_stage_attempt',
          attempt: inspectStageAttempt(db, parsed.stageAttemptId),
        },
      };
    }
    if (parsed.mode === 'attempt_query') {
      return {
        version: 'g2',
        family_runtime_stage_attempt_query: {
          surface_id: 'opl_family_runtime_stage_attempt_query',
          ...queryStageAttempt(db, parsed.stageAttemptId),
        },
      };
    }
    if (parsed.mode === 'attempt_signal') {
      const result = signalStageAttempt(db, parsed);
      insertEvent(db, {
        taskId: result.attempt.task_id,
        domainId: result.attempt.domain_id,
        eventType: 'stage_attempt_signal_received',
        source: parsed.source ?? 'opl-cli',
        payload: {
          stage_attempt_id: parsed.stageAttemptId,
          signal_kind: parsed.signalKind,
          signal_id: result.signal.signal_id,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_signal: {
          surface_id: 'opl_family_runtime_stage_attempt_signal',
          ...result,
        },
      };
    }
    if (parsed.mode === 'attempt_fixture_run') {
      const result = runStageAttemptFixtureActivity(db, parsed);
      insertEvent(db, {
        taskId: result.attempt.task_id,
        domainId: result.attempt.domain_id,
        eventType: 'stage_attempt_fixture_activity_ran',
        source: 'opl-cli',
        payload: {
          stage_attempt_id: parsed.stageAttemptId,
          provider_completion: result.provider_fixture_run.provider_completion,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_fixture_run: {
          surface_id: 'opl_family_runtime_stage_attempt_fixture_run',
          ...result,
        },
      };
    }
    if (parsed.mode === 'approve') {
      return {
        version: 'g2',
        family_runtime_approval: {
          surface_id: 'opl_family_runtime_approval',
          decision: parsed.decision,
          task: approveTask(db, parsed),
        },
      };
    }
    if (parsed.mode === 'notify_list') {
      return {
        version: 'g2',
        family_runtime_notifications: {
          surface_id: 'opl_family_runtime_notifications',
          notifications: listNotifications(db),
        },
      };
    }
    if (parsed.mode === 'events_export') {
      return {
        version: 'g2',
        family_runtime_events: {
          surface_id: 'opl_family_runtime_events',
          events: listEvents(db),
        },
      };
    }
    throw new Error(`Unhandled family runtime mode: ${(parsed as { mode: string }).mode}`);
  } finally {
    db.close();
  }
}
