import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, loadFrameworkContracts } from './contracts.ts';
import {
  parseFamilyRuntimeCommand,
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
  listStageAttemptsForTask,
  listStageAttempts,
  listStageAttemptsWithCurrentProviderReadiness,
  queryStageAttempt,
  runStageAttemptFixtureActivity,
  signalStageAttempt,
  stageAttemptSummary,
  syncStageAttemptFromTemporalTerminalObservation,
} from './family-runtime-stage-attempts.ts';
import { residencyProofReceipt } from './family-runtime-residency-proof-events.ts';
import {
  persistTemporalProductionProof,
  temporalProviderSloExecutionReceipt,
} from './family-runtime-provider-proof-receipts.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import {
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
import { enqueueTask } from './family-runtime-enqueue.ts';
import { runSchedulerQueueTick } from './family-runtime-scheduler-tick-runner.ts';
import { hydrateDomainTasks, readMasManagedProviderProjection } from './family-runtime-task-dispatch.ts';
import { redriveFamilyRuntimeTask } from './family-runtime-redrive.ts';
import { queryTemporalStageAttemptReadModel } from './family-runtime-temporal-query.ts';
import { reconcileFamilyRuntimeLifecycleRefs, runFamilyRuntimeLifecycleApply } from './family-runtime-lifecycle-index.ts';
import { buildStageAdmissionLaunchGate } from './family-runtime-stage-admission-gate.ts';
import { buildFamilyStageLaunchAdmissionGate } from './family-stage-control-plane.ts';
import { runFamilyRuntimeEvidenceWorklistCommand } from './family-runtime-evidence-worklist-command.ts';

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

async function syncTemporalStageAttemptsForTask(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  taskId: string,
) {
  const attempts = listStageAttemptsForTask(db, taskId).filter((attempt) => attempt.provider_kind === 'temporal');
  for (const attempt of attempts) {
    const temporalQuery = await queryTemporalStageAttemptReadModel(attempt, { paths });
    syncStageAttemptFromTemporalTerminalObservation(db, temporalQuery);
  }
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
      const temporalVisibilityRepair = providerKind === 'temporal' && parsed.mode === 'repair'
        ? await (await temporalProviderModule()).ensureTemporalVisibilityReadiness({ paths })
        : null;
      insertEvent(db, {
        eventType: `provider_${parsed.mode}`,
        source: 'opl-cli',
        payload: {
          provider_kind: providerKind,
          status: temporalVisibilityRepair?.repair_status ?? provider.status,
          actions: provider.actions,
          temporal_visibility_repair: temporalVisibilityRepair,
        },
      });
      return {
        version: 'g2',
        family_runtime_provider: {
          ...provider,
          temporal_visibility_repair: temporalVisibilityRepair,
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
          (source, limit, hydrate, taskScope) => runSchedulerQueueTick(db, paths, source, limit, hydrate, taskScope, undefined, {
            temporalProviderModule,
          }),
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
          ...await runSchedulerQueueTick(
            db,
            paths,
            parsed.source ?? 'manual',
            parsed.limit ?? 10,
            parsed.hydrate ?? false,
            parsed.taskScope,
            parsed.domainProfiles,
            {
              temporalProviderModule,
            },
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
              domainProfiles: parsed.domainProfiles,
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
      await syncTemporalStageAttemptsForTask(db, paths, parsed.taskId);
      return {
        version: 'g2',
        family_runtime_task: {
          surface_id: 'opl_family_runtime_task',
          ...inspectTask(db, parsed.taskId),
        },
      };
    }
    if (parsed.mode === 'queue_redrive') {
      return {
        version: 'g2',
        family_runtime_redrive: {
          surface_id: 'opl_family_runtime_redrive',
          ...redriveFamilyRuntimeTask(db, {
            taskId: parsed.taskId,
            reason: parsed.reason,
            source: parsed.source,
          }),
          queue: queueSummary(db),
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
      const currentAttempt = inspectStageAttempt(db, parsed.stageAttemptId);
      const temporal_query = await queryTemporalStageAttemptReadModel(currentAttempt, { paths });
      syncStageAttemptFromTemporalTerminalObservation(db, temporal_query);
      return {
        version: 'g2',
        family_runtime_stage_attempt: {
          surface_id: 'opl_family_runtime_stage_attempt',
          attempt: await inspectStageAttemptWithCurrentProviderReadiness(db, parsed.stageAttemptId, paths, {
            managedProviderProjection: readMasManagedProviderProjection(),
          }),
          temporal_query,
        },
      };
    }
    if (parsed.mode === 'attempt_query') {
      const localQuery = queryStageAttempt(db, parsed.stageAttemptId);
      const attempt = localQuery.stage_attempt_query.attempt;
      const temporal_query = await queryTemporalStageAttemptReadModel(attempt, { paths });
      const syncedAttempt = syncStageAttemptFromTemporalTerminalObservation(db, temporal_query);
      const projectedQuery = syncedAttempt ? queryStageAttempt(db, parsed.stageAttemptId) : localQuery;
      return {
        version: 'g2',
        family_runtime_stage_attempt_query: {
          surface_id: 'opl_family_runtime_stage_attempt_query',
          ...projectedQuery,
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
