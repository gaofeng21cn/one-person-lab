import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, loadFrameworkContracts } from './contracts.ts';
import {
  parseFamilyRuntimeCommand,
  type EnqueueInput,
  type FamilyRuntimeTaskScope,
} from './family-runtime-command.ts';
import {
  ensureFamilyRuntimeProvider,
  inspectFamilyRuntimeProviders,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { buildStageLaunchInvocationProjection } from './family-runtime-launch-invocation.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { runTemporalServiceCommand } from './family-runtime-temporal-service-command.ts';
import {
  runSchedulerTick,
  runTemporalSchedulerCadenceCommand,
} from './family-runtime-scheduler.ts';
import { buildFamilyRuntimeStatusPayload } from './family-runtime-status.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  inspectStageAttemptWithCurrentProviderReadiness,
  ingestStageAttemptCloseout,
  listStageAttemptsForTask,
  listStageAttempts,
  listStageAttemptsWithCurrentProviderReadiness,
  queryStageAttempt,
  runStageAttemptFixtureActivity,
  signalStageAttempt,
  stageAttemptSummary,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import { ensureProviderHostedStageAttempt } from './family-runtime-provider-hosted-attempts.ts';
import { closeoutPacketFromSidecarOutput } from './family-runtime-sidecar-closeout.ts';
import { residencyProofReceipt } from './family-runtime-residency-proof-events.ts';
import {
  persistTemporalProductionProof,
  temporalProviderSloExecutionReceipt,
} from './family-runtime-provider-proof-receipts.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import {
  DEFAULT_MAX_ATTEMPTS,
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
import { writeFamilyRuntimeDispatchTask } from './family-runtime-dispatch-task.ts';
import { blockTaskForStageAdmissionGate, buildStageAdmissionLaunchGate } from './family-runtime-stage-admission-gate.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import { hydrateDomainTasks } from './family-runtime-domain-intake.ts';
import { canonicalFamilyRuntimeTaskKind } from './family-runtime-mas-domain-route.ts';
import { commandForDomain, parseDispatchOutput } from './family-runtime-dispatch-command.ts';
import {
  runFamilyRuntimeSidecarCommand,
  sidecarResultErrorMessage,
} from './family-runtime-sidecar-process.ts';
import { queryTemporalStageAttemptReadModel } from './family-runtime-temporal-query.ts';
import { reconcileFamilyRuntimeLifecycleRefs, runFamilyRuntimeLifecycleApply } from './family-runtime-lifecycle-index.ts';
import { buildFamilyStageLaunchAdmissionGate } from './family-stage-control-plane.ts';
import { runFamilyRuntimeEvidenceWorklistCommand } from './family-runtime-evidence-worklist-command.ts';
import { runFamilyRuntimeQueueTick } from './family-runtime-tick.ts';

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

function enqueueTask(db: DatabaseSync, input: EnqueueInput) {
  const createdAt = nowIso();
  const dedupeKey = input.dedupeKey?.trim() || null;
  const taskKind = canonicalFamilyRuntimeTaskKind(input.domainId, input.taskKind);
  const payload = input.requireStageAdmission
    ? {
        ...input.payload,
        opl_stage_launch_admission_required: true,
      }
    : input.payload;
  if (dedupeKey) {
    const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (existing) {
      const exportedPayloadJson = JSON.stringify(payload);
      const exportedTaskChanged = existing.payload_json !== exportedPayloadJson
        || existing.task_kind !== taskKind
        || existing.domain_id !== input.domainId;
      if (existing.status === 'succeeded' && exportedTaskChanged) {
        const nextStatus: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
        db.prepare(`
          UPDATE tasks
          SET domain_id = ?, task_kind = ?, payload_json = ?, priority = ?, status = ?,
            source = ?, requires_approval = ?, approved_at = NULL, lease_owner = NULL,
            lease_expires_at = NULL, last_error = NULL, dead_letter_reason = NULL, updated_at = ?
          WHERE task_id = ?
        `).run(
          input.domainId,
          taskKind,
          exportedPayloadJson,
          input.priority ?? 0,
          nextStatus,
          input.source ?? 'opl-cli',
          input.requiresApproval ? 1 : 0,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_domain_export_update',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            reason: 'domain_export_changed_after_terminal_attempt',
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
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
    taskKind,
    dedupeKey,
    payload,
    createdAt,
  ]);
  const status: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
  const task = {
    task_id: taskId,
    domain_id: input.domainId,
    task_kind: taskKind,
    payload_json: JSON.stringify(payload),
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
    payload: { task_kind: taskKind, dedupe_key: dedupeKey },
  });
  insertNotification(db, {
    taskId,
    severity: 'info',
    title: status === 'waiting_approval' ? 'Family runtime task waiting for approval' : 'Family runtime task queued',
    body: `${input.domainId}:${taskKind}`,
    payload: { status },
  });
  return {
    accepted: true,
    idempotent_noop: false,
    task: taskToPayload(task as FamilyRuntimeTaskRow),
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
  const providerHostedAttempt = ensureProviderHostedStageAttempt(db, row, payload);
  if (providerHostedAttempt?.status === 'blocked' && providerHostedAttempt.blocked_reason?.startsWith('stage_admission_')) {
    return blockTaskForStageAdmissionGate(db, row, providerHostedAttempt);
  }
  const activeStageAttempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
    attempt.status === 'queued'
    || attempt.status === 'running'
    || attempt.status === 'checkpointed'
    || attempt.status === 'blocked'
    || attempt.status === 'human_gate'
    || attempt.status === 'failed'
  ));
  const activeStageAttemptIds = activeStageAttempts.map((attempt) => attempt.stage_attempt_id);

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
    stageAttemptIds: activeStageAttemptIds,
    status: 'running',
    incrementAttempt: true,
    activityEvent: {
      activity_kind: 'domain_sidecar_dispatch_activity',
      activity_status: 'running',
    },
  });

  const dispatchPath = writeFamilyRuntimeDispatchTask(paths, { ...row, attempts: attempt });
  const command = commandForDomain(row.domain_id, dispatchPath);
  const result = runFamilyRuntimeSidecarCommand(command, {
    cwd: process.cwd(),
    env: process.env,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.exit_code;
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
    const typedCloseoutPacket = closeoutPacketFromSidecarOutput(output);
    const checkpointedStageAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: activeStageAttemptIds,
      status: 'completed',
      closeoutRefs,
      activityEvent: {
        activity_kind: 'domain_sidecar_dispatch_activity',
        activity_status: typedCloseoutPacket ? 'typed_closeout_received' : 'checkpointed',
        closeout_refs: closeoutRefs ?? [],
      },
    });
    const stageAttempts = typedCloseoutPacket
      ? listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
          activeStageAttemptIds.length === 0 || activeStageAttemptIds.includes(attempt.stage_attempt_id)
        )).map((attempt) => ingestStageAttemptCloseout(db, {
          stageAttemptId: attempt.stage_attempt_id,
          packet: typedCloseoutPacket,
        }).attempt)
      : checkpointedStageAttempts;
    return { task_id: row.task_id, status: 'succeeded', command_preview: command, output, stage_attempts: stageAttempts };
  }

  const errorMessage = sidecarResultErrorMessage(result, 'Domain dispatch');
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
    stageAttemptIds: activeStageAttemptIds,
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
  taskScope?: FamilyRuntimeTaskScope,
) {
  return runFamilyRuntimeQueueTick(db, paths, {
    source,
    limit,
    hydrate,
    taskScope,
  }, { enqueueTask, dispatchTask });
}

function approveTask(
  db: DatabaseSync,
  input: { taskId: string; decision: 'approve' | 'deny'; reason?: string },
) {
  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime task not found.', {
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

export async function runFamilyRuntime(args: string[]) {
  const parsed = parseFamilyRuntimeCommand(args);
  const { db, paths } = openQueueDb();
  try {
    if (parsed.mode === 'status') {
      return await buildFamilyRuntimeStatusPayload(db, paths, resolveFamilyRuntimeProviderKind(parsed.providerKind));
    }
    if (parsed.mode === 'doctor') {
      const status = (await buildFamilyRuntimeStatusPayload(db, paths, resolveFamilyRuntimeProviderKind(parsed.providerKind))).family_runtime;
      return {
        version: 'g2',
        family_runtime_doctor: {
          surface_id: 'opl_family_runtime_doctor',
          doctor_status: status.readiness.full_online_ready ? 'ready' : 'degraded',
          blockers: [
            ...(status.readiness.degraded_reason ? [status.readiness.degraded_reason] : []),
            ...(status.readiness.local_sqlite_is_dev_ci_offline_only
              ? ['local_sqlite_is_dev_ci_offline_only']
              : []),
          ],
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
    if (parsed.mode === 'worker_status') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      if (providerKind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime worker status currently supports only --provider temporal.', {
          provider_kind: providerKind,
          allowed_provider_kinds: ['temporal'],
        });
      }
      return {
        version: 'g2',
        family_runtime_worker: {
          surface_id: 'opl_family_runtime_worker',
          action: 'status',
          ...(await (await temporalProviderModule()).inspectTemporalWorkerLifecycle(paths)),
        },
      };
    }
    if (parsed.mode === 'service_status' || parsed.mode === 'service_start' || parsed.mode === 'service_stop') {
      return await runTemporalServiceCommand(db, paths, parsed);
    }
    if (parsed.mode === 'worker_start') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      if (providerKind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime worker start currently supports only --provider temporal.', {
          provider_kind: providerKind,
          allowed_provider_kinds: ['temporal'],
        });
      }
      const { startTemporalWorkerLifecycle } = await temporalProviderModule();
      const result = await startTemporalWorkerLifecycle(paths, { detach: parsed.detach });
      insertEvent(db, {
        eventType: 'temporal_worker_start',
        source: 'opl-cli',
        payload: {
          lifecycle_status: result.status.lifecycle_status,
          start_status: result.start_status,
          pid: result.status.managed_worker_pid,
        },
      });
      return {
        version: 'g2',
        family_runtime_worker: {
          surface_id: 'opl_family_runtime_worker',
          action: 'start',
          ...result,
        },
      };
    }
    if (parsed.mode === 'worker_stop') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      if (providerKind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime worker stop currently supports only --provider temporal.', {
          provider_kind: providerKind,
          allowed_provider_kinds: ['temporal'],
        });
      }
      const { stopTemporalWorkerLifecycle } = await temporalProviderModule();
      const result = await stopTemporalWorkerLifecycle(paths);
      insertEvent(db, {
        eventType: 'temporal_worker_stop',
        source: 'opl-cli',
        payload: {
          stop_status: result.stop_status,
          stopped_pid: result.stopped_pid,
          lifecycle_status: result.status.lifecycle_status,
        },
      });
      return {
        version: 'g2',
        family_runtime_worker: {
          surface_id: 'opl_family_runtime_worker',
          action: 'stop',
          ...result,
        },
      };
    }
    if (parsed.mode === 'residency_proof') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      if (providerKind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime residency proof currently supports only --provider temporal.', {
          provider_kind: providerKind,
          allowed_provider_kinds: ['temporal'],
        });
      }
      const { buildTemporalResidencyProof } = await import('./family-runtime-residency-proof.ts');
      const proof = await buildTemporalResidencyProof(db, paths, {
        live: parsed.live,
        production: parsed.production,
      });
      const persistedProofRef = persistTemporalProductionProof(paths, proof);
      const sloExecutionReceipt = temporalProviderSloExecutionReceipt({
        proof,
        persistedProofRef,
        trigger: 'manual_residency_proof',
      });
      insertEvent(db, {
        eventType: 'temporal_residency_proof',
        source: 'opl-cli',
        payload: {
          provider_kind: 'temporal',
          proof_mode: proof.proof_mode,
          closeout_status: proof.closeout_status,
          proof_receipt: residencyProofReceipt(proof),
          persisted_proof_ref: persistedProofRef,
          provider_slo_execution_receipt: sloExecutionReceipt,
        },
      });
      insertEvent(db, {
        eventType: 'temporal_provider_slo_execution_receipt',
        source: 'opl-cli',
        payload: sloExecutionReceipt,
      });
      return {
        version: 'g2',
        family_runtime_residency_proof: {
          surface_id: 'opl_family_runtime_residency_proof',
          persisted_proof_ref: persistedProofRef,
          provider_slo_execution_receipt: sloExecutionReceipt,
          ...proof,
        },
      };
    }
    if (parsed.mode === 'provider_slo_tick') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      if (providerKind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime provider-slo tick currently supports only --provider temporal.', {
          provider_kind: providerKind,
          allowed_provider_kinds: ['temporal'],
        });
      }
      return {
        version: 'g2',
        family_runtime_provider_slo_tick: await runTemporalProviderSloTick(db, paths, {
          force: parsed.force,
        }),
      };
    }
    if (parsed.mode === 'scheduler_tick') {
      return {
        version: 'g2',
        family_runtime_scheduler_tick: await runSchedulerTick(
          db,
          paths,
          parsed,
          (source, limit, hydrate, taskScope) => runTick(db, paths, source, limit, hydrate, taskScope),
        ),
      };
    }
    if (
      parsed.mode === 'scheduler_status'
      || parsed.mode === 'scheduler_install'
      || parsed.mode === 'scheduler_remove'
      || parsed.mode === 'scheduler_trigger'
    ) {
      return {
        version: 'g2',
        family_runtime_scheduler_cadence: await runTemporalSchedulerCadenceCommand(db, paths, parsed),
      };
    }
    if (parsed.mode === 'lifecycle_apply') {
      return {
        version: 'g2',
        family_runtime_lifecycle_apply: runFamilyRuntimeLifecycleApply(parsed.input),
      };
    }
    if (parsed.mode === 'lifecycle_reconcile') {
      return {
        version: 'g2',
        family_runtime_lifecycle_reconcile: reconcileFamilyRuntimeLifecycleRefs(parsed.input),
      };
    }
    if (parsed.mode === 'evidence_worklist') {
      return runFamilyRuntimeEvidenceWorklistCommand(parsed.input);
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
          ...runTick(
            db,
            paths,
            parsed.source ?? 'manual',
            parsed.limit ?? 10,
            parsed.hydrate ?? false,
            parsed.taskScope,
          ),
          queue: queueSummary(db),
        },
      };
    }
    if (parsed.mode === 'intake') {
      return {
        version: 'g2',
        family_runtime_intake: {
          surface_id: 'opl_family_runtime_intake',
          ...hydrateDomainTasks(
            db,
            paths,
            {
              domainId: parsed.domainId,
              source: parsed.source ?? 'manual',
              taskScope: parsed.taskScope,
            },
            enqueueTask,
          ),
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
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.input.providerKind);
      const sourceFingerprint = parsed.input.sourceFingerprint?.trim() || null;
      const taskId = parsed.input.taskId?.trim() || null;
      const baseIdempotencyKey = stableId('idem', [
        parsed.input.domainId,
        parsed.input.stageId,
        providerKind,
        parsed.input.workspaceLocator,
        sourceFingerprint,
        taskId,
      ]);
      const projectedIdempotencyKey = parsed.input.newAttempt
        ? stableId('idem', [baseIdempotencyKey, 'new_attempt_requested'])
        : baseIdempotencyKey;
      const defaultStageLaunchAdmissionGate = buildFamilyStageLaunchAdmissionGate(loadFrameworkContracts(), {
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
      });
      const requiredStageAdmissionGate = parsed.input.requireStageAdmission
        ? buildStageAdmissionLaunchGate({
            domainId: parsed.input.domainId,
            stageId: parsed.input.stageId,
            taskKind: parsed.input.stageId,
            taskId: parsed.input.taskId,
            sourceFingerprint: parsed.input.sourceFingerprint,
            requireAdmission: true,
          })
        : null;
      const stageLaunchAdmissionGate = requiredStageAdmissionGate ?? defaultStageLaunchAdmissionGate;
      const launchInvocation = buildStageLaunchInvocationProjection({
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
        providerKind,
        workspaceLocator: parsed.input.workspaceLocator,
        sourceFingerprint,
        executorKind: parsed.input.executorKind,
        executorBindingRef: parsed.input.executorBindingRef,
        invocationMode: parsed.input.invocationMode,
        boundedEditRef: parsed.input.boundedEditRef,
        taskId,
        idempotencyKey: projectedIdempotencyKey,
        requireStageAdmission: parsed.input.requireStageAdmission,
        planeId: stageLaunchAdmissionGate.plane_id,
        admissionPlaneId: stageLaunchAdmissionGate.plane_id,
      });
      const blockedReason =
        launchInvocation.blocker_reason
        ?? requiredStageAdmissionGate?.blocked_reason
        ?? parsed.input.blockedReason
        ?? defaultStageLaunchAdmissionGate.block_reason
        ?? undefined;
      const result = createStageAttempt(db, {
        ...parsed.input,
        blockedReason,
        launchAdmissionGate: stageLaunchAdmissionGate,
        launchInvocation,
      });
      const { attempt } = result;
      const stageLaunchBlockedByAdmission =
        Boolean(launchInvocation.blocker_reason)
        ||
        requiredStageAdmissionGate?.status === 'blocked'
        || defaultStageLaunchAdmissionGate.gate_action === 'block_stage_launch';
      const temporal_start = parsed.input.start
        && attempt.status !== 'blocked'
          ? await (await temporalProviderModule()).startTemporalStageAttemptWorkflow(attempt, { paths })
        : null;
      insertEvent(db, {
        taskId: attempt.task_id,
        domainId: parsed.input.domainId,
        eventType: stageLaunchBlockedByAdmission
          ? 'stage_attempt_launch_admission_blocked'
          : parsed.input.start
          ? 'stage_attempt_temporal_started'
          : result.idempotent_noop
            ? 'stage_attempt_idempotent_noop'
            : 'stage_attempt_created',
        source: 'opl-cli',
        payload: {
          stage_attempt_id: attempt.stage_attempt_id,
          idempotency_key: attempt.idempotency_key,
          provider_kind: attempt.provider_kind,
          stage_id: attempt.stage_id,
          task_id: attempt.task_id,
          stage_launch_admission_gate: stageLaunchAdmissionGate,
          launch_invocation: launchInvocation,
          temporal_start,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt: {
          surface_id: 'opl_family_runtime_stage_attempt',
          created: result.created,
          idempotent_noop: result.idempotent_noop,
          attempt,
          stage_launch_admission_gate: stageLaunchAdmissionGate,
          launch_invocation: launchInvocation,
          conflict_or_blocker_envelopes: 'conflict_or_blocker_envelopes' in result
            ? result.conflict_or_blocker_envelopes
            : [
                ...launchInvocation.conflict_or_blocker_envelopes,
                ...(requiredStageAdmissionGate?.conflict_or_blocker_envelopes ?? []),
              ],
          temporal_start,
        },
      };
    }
    if (parsed.mode === 'attempt_start') {
      const attempt = inspectStageAttempt(db, parsed.stageAttemptId);
      const { startTemporalStageAttemptWorkflow } = await temporalProviderModule();
      const temporal_start = await startTemporalStageAttemptWorkflow(attempt, { paths });
      insertEvent(db, {
        taskId: attempt.task_id,
        domainId: attempt.domain_id,
        eventType: 'stage_attempt_temporal_started',
        source: 'opl-cli',
        payload: {
          stage_attempt_id: attempt.stage_attempt_id,
          provider_kind: attempt.provider_kind,
          temporal_start,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_start: {
          surface_id: 'opl_family_runtime_stage_attempt_start',
          attempt,
          temporal_start,
        },
      };
    }
    if (parsed.mode === 'attempt_list') {
      return {
        version: 'g2',
        family_runtime_stage_attempts: {
          surface_id: 'opl_family_runtime_stage_attempts',
          summary: stageAttemptSummary(db),
          attempts: await listStageAttemptsWithCurrentProviderReadiness(db, paths, {
            managedProviderProjection: readMasManagedProviderProjection(),
          }),
        },
      };
    }
    if (parsed.mode === 'attempt_inspect') {
      return {
        version: 'g2',
        family_runtime_stage_attempt: {
          surface_id: 'opl_family_runtime_stage_attempt',
          attempt: await inspectStageAttemptWithCurrentProviderReadiness(db, parsed.stageAttemptId, paths, {
            managedProviderProjection: readMasManagedProviderProjection(),
          }),
        },
      };
    }
    if (parsed.mode === 'attempt_query') {
      const localQuery = queryStageAttempt(db, parsed.stageAttemptId);
      const attempt = localQuery.stage_attempt_query.attempt;
      const temporal_query = await queryTemporalStageAttemptReadModel(attempt, { paths });
      return {
        version: 'g2',
        family_runtime_stage_attempt_query: {
          surface_id: 'opl_family_runtime_stage_attempt_query',
          ...localQuery,
          temporal_query,
        },
      };
    }
    if (parsed.mode === 'attempt_signal') {
      const result = signalStageAttempt(db, parsed);
      const temporal_signal = result.attempt.provider_kind === 'temporal'
        ? await (await temporalProviderModule()).signalTemporalStageAttemptWorkflow({
            attempt: result.attempt,
            signalKind: parsed.signalKind,
            payload: parsed.payload,
            source: parsed.source,
            paths,
          })
        : null;
      insertEvent(db, {
        taskId: result.attempt.task_id,
        domainId: result.attempt.domain_id,
        eventType: 'stage_attempt_signal_received',
        source: parsed.source ?? 'opl-cli',
        payload: {
          stage_attempt_id: parsed.stageAttemptId,
          signal_kind: parsed.signalKind,
          signal_id: result.signal.signal_id,
          temporal_signal,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_signal: {
          surface_id: 'opl_family_runtime_stage_attempt_signal',
          ...result,
          temporal_signal,
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
