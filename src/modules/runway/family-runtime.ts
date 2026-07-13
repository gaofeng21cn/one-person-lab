import { DatabaseSync } from 'node:sqlite';

import { loadFrameworkContracts } from '../charter/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { preflightDomainWorkspaceCheckoutCurrentness } from './family-runtime-checkout-currentness.ts';
import {
  parseFamilyRuntimeCommand,
} from './family-runtime-command.ts';
import {
  ensureFamilyRuntimeProvider,
  ensureFamilyRuntimeProviderWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { buildStageLaunchInvocationProjection } from './family-runtime-launch-invocation.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { runTemporalServiceCommand } from './family-runtime-temporal-service-command.ts';
import { runTemporalSchedulerCadenceCommand } from './family-runtime-scheduler.ts';
import { buildFamilyRuntimeStatusPayload } from './family-runtime-status.ts';
import {
  createStageAttempt,
  findIdempotentStageAttempt,
  inspectStageAttempt,
  inspectStageAttemptWithCurrentProviderReadiness,
  listStageAttemptsForTask,
  queryStageAttempt,
  runStageAttemptFixtureActivity,
  signalStageAttempt,
  stageAttemptSummary,
  syncStageAttemptFromTemporalTerminalObservation,
} from './family-runtime-stage-attempts.ts';
import { listStageAttemptsWithMonitoringProjection } from './family-runtime-stage-attempt-monitoring.ts';
import { markStageAttemptCancelRequested } from './family-runtime-stage-attempt-control.ts';
import { setStageAttemptArchived } from './family-runtime-stage-attempt-ledger.ts';
import { queryStageAttemptWithCurrentProviderReadiness } from './family-runtime-stage-attempt-current-query.ts';
import { residencyProofReceipt } from './family-runtime-residency-proof-events.ts';
import {
  persistTemporalProductionProof,
  temporalProviderSloExecutionReceipt,
} from './family-runtime-provider-proof-receipts.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import { runProviderWorkerSupervisorCommand } from './family-runtime-provider-worker-supervisor.ts';
import {
  familyRuntimePaths,
  insertEvent,
  listEvents,
  listNotifications,
  openQueueDb,
  stableId,
} from './family-runtime-store.ts';
import {
  readManagedProviderProjectionSummary,
} from './family-runtime-managed-provider-projection.ts';
import { queryTemporalStageAttemptReadModel } from './family-runtime-temporal-query.ts';
import { reconcileFamilyRuntimeLifecycleRefs, runFamilyRuntimeLifecycleApply } from './family-runtime-lifecycle-index.ts';
import { buildFamilyStageContextObservation } from '../stagecraft/index.ts';
import {
  buildDomainManifestCatalog,
} from '../atlas/index.ts';
import { runFamilyRuntimeEvidenceWorklistCommand } from './family-runtime-evidence-worklist-command.ts';
import { runFamilyRuntimeStageArtifactCommand } from './family-runtime-stage-artifact-command.ts';
import { buildFamilyRuntimeControlLoopStatus } from './family-runtime-control-loop.ts';
import type { RuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
import {
  blockAttemptForCheckoutCurrentness,
  attachCheckoutCurrentnessToStageContext,
  recordTemporalStartOnAttempt,
} from './family-runtime-parts/stage-attempt-launch.ts';
import { ensureFamilyRuntimePackageLaunchReady } from './family-runtime-package-readiness.ts';

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
    if (attempt.status === 'completed' && attempt.closeout_receipt_status) {
      continue;
    }
    const temporalQuery = await queryTemporalStageAttemptReadModel(attempt, { paths });
    syncStageAttemptFromTemporalTerminalObservation(db, temporalQuery);
  }
}

export async function runFamilyRuntime(
  args: string[],
  options: {
    runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
    stageReplayMissingReceiptExtraReceipts?: Parameters<
      typeof runFamilyRuntimeEvidenceWorklistCommand
    >[0]['stageReplayMissingReceiptExtraReceipts'];
  } = {},
): Promise<Record<string, unknown>> {
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
          blockers: [...new Set([
            ...(status.readiness.degraded_reason ? [status.readiness.degraded_reason] : []),
          ])],
          repair_command: `opl family-runtime repair --provider ${status.configured_provider}`,
          status,
        },
      };
    }
    if (parsed.mode === 'install' || parsed.mode === 'repair') {
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
      const temporalVisibilityRepair = providerKind === 'temporal' && parsed.mode === 'repair'
        ? await (await temporalProviderModule()).ensureTemporalVisibilityReadiness({ paths })
        : null;
      const provider = parsed.mode === 'repair'
        ? await ensureFamilyRuntimeProviderWithLifecycle(providerKind, parsed.mode, paths)
        : ensureFamilyRuntimeProvider(providerKind, parsed.mode);
      insertEvent(db, {
        eventType: `provider_${parsed.mode}`,
        source: 'opl-cli',
        payload: {
          provider_kind: providerKind,
          status: temporalVisibilityRepair?.repair_status ?? provider.status,
          actions: provider.actions,
          temporal_worker_repair: 'temporal_worker_repair' in provider ? provider.temporal_worker_repair : null,
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
    if (parsed.mode === 'control_loop_status') {
      return {
        version: 'g2',
        family_runtime_control_loop: await buildFamilyRuntimeControlLoopStatus(db, paths, parsed.providerKind),
      };
    }
    if (parsed.mode === 'provider_worker_supervisor') {
      return {
        version: 'g2',
        family_runtime_provider_worker_supervisor: await runProviderWorkerSupervisorCommand(db, paths, parsed),
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
      const evidenceWorklistInput =
        options.stageReplayMissingReceiptExtraReceipts
          ? {
              ...parsed.input,
              stageReplayMissingReceiptExtraReceipts: options.stageReplayMissingReceiptExtraReceipts,
            }
          : parsed.input;
      return runFamilyRuntimeEvidenceWorklistCommand(evidenceWorklistInput, {
        runtimeSnapshotProvider: options.runtimeSnapshotProvider,
      });
    }
    if (parsed.mode === 'stage_artifact') {
      return runFamilyRuntimeStageArtifactCommand(parsed.input);
    }
    if (parsed.mode === 'attempt_create') {
      const existingAttempt = findIdempotentStageAttempt(db, parsed.input);
      if (existingAttempt) {
        return {
          version: 'g2',
          family_runtime_stage_attempt: {
            surface_id: 'opl_family_runtime_stage_attempt',
            created: false,
            idempotent_noop: true,
            attempt: existingAttempt,
            stage_context_observation: null,
            launch_invocation: null,
          },
        };
      }
      const useBoundaryId = stableId('package-use', [
        parsed.input.domainId,
        parsed.input.stageId,
        parsed.input.actionId ?? null,
        parsed.input.workspaceLocator,
        parsed.input.sourceFingerprint ?? null,
        parsed.input.newAttempt ? Date.now() : null,
      ]);
      const packageReadiness = await ensureFamilyRuntimePackageLaunchReady({
        domainId: parsed.input.domainId,
        workspaceLocator: parsed.input.workspaceLocator,
        useBoundaryId,
      });
      const useBoundWorkspaceLocator = packageReadiness?.package_use_binding
        ? {
            ...parsed.input.workspaceLocator,
            package_use_binding: packageReadiness.package_use_binding,
          }
        : parsed.input.workspaceLocator;
      const providerKind = resolveFamilyRuntimeProviderKind(parsed.input.providerKind);
      const sourceFingerprint = parsed.input.sourceFingerprint?.trim() || null;
      const taskId = parsed.input.taskId?.trim() || null;
      const baseIdempotencyKey = stableId('idem', [
        parsed.input.domainId,
        parsed.input.stageId,
        parsed.input.actionId?.trim() || null,
        providerKind,
        parsed.input.workspaceLocator,
        sourceFingerprint,
        taskId,
      ]);
      const projectedIdempotencyKey = parsed.input.newAttempt
        ? stableId('idem', [baseIdempotencyKey, 'new_attempt_requested'])
        : baseIdempotencyKey;
      const defaultStageContextObservation = buildFamilyStageContextObservation(loadFrameworkContracts(), {
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
        actionId: parsed.input.actionId,
      }, {
        loadDomainManifests: (contracts, options) =>
          buildDomainManifestCatalog(contracts, options).domain_manifests,
      });
      const checkoutCurrentnessPreflight = preflightDomainWorkspaceCheckoutCurrentness({
        domainId: parsed.input.domainId,
        workspaceLocator: parsed.input.workspaceLocator,
      });
      const stageLaunchContextObservation = attachCheckoutCurrentnessToStageContext(
        defaultStageContextObservation,
        checkoutCurrentnessPreflight,
      );
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
        planeId: stageLaunchContextObservation.plane_id,
        contextPlaneId: stageLaunchContextObservation.plane_id,
      });
      const blockedReason =
        checkoutCurrentnessPreflight?.status === 'blocked'
          ? checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked'
          :
        launchInvocation.blocker_reason
        ?? parsed.input.blockedReason
        ?? undefined;
      const result = createStageAttempt(db, {
        ...parsed.input,
        workspaceLocator: useBoundWorkspaceLocator,
        idempotencyWorkspaceLocator: parsed.input.workspaceLocator,
        blockedReason,
        routeImpact: defaultStageContextObservation.selected_action_id
          ? {
              selected_action_id: defaultStageContextObservation.selected_action_id,
              selected_stage_route: defaultStageContextObservation.selected_stage_route,
            }
          : undefined,
        launchContextObservation: stageLaunchContextObservation,
        launchInvocation,
      });
      const { attempt } = result;
      const stageLaunchHardStopped = checkoutCurrentnessPreflight?.status === 'blocked'
        || Boolean(launchInvocation.blocker_reason);
      const temporal_start = parsed.input.start
        && attempt.status !== 'blocked'
          ? await (await temporalProviderModule()).startTemporalStageAttemptWorkflow(attempt, { paths })
        : null;
      recordTemporalStartOnAttempt(db, attempt, temporal_start);
      const projectedAttempt = inspectStageAttempt(db, attempt.stage_attempt_id);
      insertEvent(db, {
        taskId: projectedAttempt.task_id,
        domainId: parsed.input.domainId,
        eventType: stageLaunchHardStopped
          ? 'stage_attempt_launch_hard_stopped'
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
          stage_context_observation: stageLaunchContextObservation,
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
          attempt: projectedAttempt,
          stage_context_observation: stageLaunchContextObservation,
          launch_invocation: launchInvocation,
          conflict_or_blocker_envelopes: 'conflict_or_blocker_envelopes' in result
            ? result.conflict_or_blocker_envelopes
            : [
                ...launchInvocation.conflict_or_blocker_envelopes,
              ],
          temporal_start,
        },
      };
    }
    if (parsed.mode === 'attempt_start') {
      const attempt = inspectStageAttempt(db, parsed.stageAttemptId);
      const pinnedUseBinding = attempt.workspace_locator.package_use_binding;
      await ensureFamilyRuntimePackageLaunchReady({
        domainId: attempt.domain_id,
        workspaceLocator: attempt.workspace_locator,
        useBoundaryId: typeof pinnedUseBinding === 'object' && pinnedUseBinding
          ? String((pinnedUseBinding as Record<string, unknown>).use_boundary_id ?? '')
          : undefined,
        pinnedUseBinding: typeof pinnedUseBinding === 'object' && pinnedUseBinding
          ? pinnedUseBinding
          : undefined,
      });
      const checkoutCurrentnessPreflight = preflightDomainWorkspaceCheckoutCurrentness({
        domainId: attempt.domain_id,
        workspaceLocator: attempt.workspace_locator,
      });
      if (checkoutCurrentnessPreflight?.status === 'blocked') {
        const projectedAttempt = blockAttemptForCheckoutCurrentness(db, {
          attempt,
          checkoutCurrentnessPreflight,
        });
        insertEvent(db, {
          taskId: projectedAttempt.task_id,
          domainId: projectedAttempt.domain_id,
          eventType: 'stage_attempt_checkout_currentness_blocked',
          source: 'opl-cli',
          payload: {
            stage_attempt_id: attempt.stage_attempt_id,
            reason: checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked',
            checkout_currentness_preflight: checkoutCurrentnessPreflight,
          },
        });
        return {
          version: 'g2',
          family_runtime_stage_attempt_start: {
            surface_id: 'opl_family_runtime_stage_attempt_start',
            attempt: projectedAttempt,
            temporal_start: null,
            checkout_currentness_preflight: checkoutCurrentnessPreflight,
          },
        };
      }
      const { startTemporalStageAttemptWorkflow } = await temporalProviderModule();
      const temporal_start = await startTemporalStageAttemptWorkflow(attempt, { paths });
      recordTemporalStartOnAttempt(db, attempt, temporal_start);
      const projectedAttempt = inspectStageAttempt(db, parsed.stageAttemptId);
      insertEvent(db, {
        taskId: projectedAttempt.task_id,
        domainId: projectedAttempt.domain_id,
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
          attempt: projectedAttempt,
          temporal_start,
        },
      };
    }
    if (parsed.mode === 'attempt_cancel') {
      const attempt = inspectStageAttempt(db, parsed.stageAttemptId);
      const { cancelTemporalStageAttemptWorkflow } = await temporalProviderModule();
      const temporal_cancel = await cancelTemporalStageAttemptWorkflow({
        attempt,
        reason: parsed.reason,
        source: parsed.source,
        paths,
      });
      markStageAttemptCancelRequested(db, {
        stageAttemptId: parsed.stageAttemptId,
        reason: parsed.reason,
        source: parsed.source,
        temporalCancel: temporal_cancel,
      });
      const temporal_query = await queryTemporalStageAttemptReadModel(attempt, { paths });
      syncStageAttemptFromTemporalTerminalObservation(db, temporal_query);
      const projectedAttempt = await inspectStageAttemptWithCurrentProviderReadiness(db, parsed.stageAttemptId, paths, {
        managedProviderProjection: readManagedProviderProjectionSummary(),
      });
      insertEvent(db, {
        taskId: projectedAttempt.task_id,
        domainId: projectedAttempt.domain_id,
        eventType: 'stage_attempt_operator_cancel_requested',
        source: parsed.source ?? 'opl-cli',
        payload: {
          stage_attempt_id: attempt.stage_attempt_id,
          provider_kind: attempt.provider_kind,
          reason: parsed.reason,
          temporal_cancel,
          temporal_query,
          authority_boundary: {
            opl: 'provider_attempt_cancellation_transport_only',
            domain: 'truth_quality_artifact_gate_owner',
            provider_completion_is_domain_ready: false,
          },
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_cancel: {
          surface_id: 'opl_family_runtime_stage_attempt_cancel',
          attempt: projectedAttempt,
          temporal_cancel,
          temporal_query,
        },
      };
    }
    if (parsed.mode === 'attempt_archive' || parsed.mode === 'attempt_restore') {
      const archived = parsed.mode === 'attempt_archive';
      const attempt = setStageAttemptArchived(db, {
        stageAttemptId: parsed.stageAttemptId,
        archived,
        reason: parsed.reason,
        source: parsed.source ?? 'opl-cli',
      });
      insertEvent(db, {
        taskId: attempt.task_id,
        domainId: attempt.domain_id,
        eventType: archived ? 'stage_attempt_archived' : 'stage_attempt_restored',
        source: parsed.source ?? 'opl-cli',
        payload: {
          stage_attempt_id: parsed.stageAttemptId,
          reason: parsed.reason,
          archived,
        },
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_archive: {
          surface_id: 'opl_family_runtime_stage_attempt_archive',
          action: archived ? 'archive' : 'restore',
          attempt,
        },
      };
    }
    if (parsed.mode === 'attempt_list') {
      const projection = await listStageAttemptsWithMonitoringProjection(db, paths, {
        managedProviderProjection: readManagedProviderProjectionSummary(),
      }, parsed.filters);
      return {
        version: 'g2',
        family_runtime_stage_attempts: {
          surface_id: 'opl_family_runtime_stage_attempts',
          provider_runtime_metadata: projection.provider_runtime_metadata,
          summary: projection.summary,
          filters: projection.filters,
          view_mode: projection.compact_timeline ? 'compact_timeline' : 'full',
          items: projection.compact_timeline ?? projection.attempts,
          attempts: projection.compact_timeline ?? projection.attempts,
          ...(projection.compact_timeline ? { compact_timeline: projection.compact_timeline } : {}),
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
            managedProviderProjection: readManagedProviderProjectionSummary(),
          }),
          temporal_query,
        },
      };
    }
    if (parsed.mode === 'attempt_query') {
      const localQuery = queryStageAttempt(db, parsed.stageAttemptId);
      const attempt = localQuery.stage_attempt_query.attempt;
      const temporal_query = await queryTemporalStageAttemptReadModel(attempt, { paths });
      syncStageAttemptFromTemporalTerminalObservation(db, temporal_query);
      const projectedQuery = await queryStageAttemptWithCurrentProviderReadiness(db, parsed.stageAttemptId, paths, {
        managedProviderProjection: readManagedProviderProjectionSummary(),
      }, {
        temporalQuery: temporal_query && typeof temporal_query === 'object' && !Array.isArray(temporal_query)
          ? temporal_query
          : null,
      });
      return {
        version: 'g2',
        family_runtime_stage_attempt_query: {
          surface_id: 'opl_family_runtime_stage_attempt_query',
          attempt: projectedQuery.stage_attempt_query.attempt,
          attempt_ref: `opl://stage_attempts/${projectedQuery.stage_attempt_query.attempt.stage_attempt_id}`,
          attempt_status: projectedQuery.stage_attempt_query.attempt.status,
          current_provider_readiness: projectedQuery.stage_attempt_query.current_provider_readiness,
          temporal_durable_lifecycle_readback:
            projectedQuery.stage_attempt_query.temporal_durable_lifecycle_readback,
          ...projectedQuery,
          temporal_query,
        },
      };
    }
    if (parsed.mode === 'attempt_signal') {
      const currentAttempt = inspectStageAttempt(db, parsed.stageAttemptId);
      if (currentAttempt.provider_kind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', 'Temporal signal requires a temporal stage attempt.', {
          stage_attempt_id: currentAttempt.stage_attempt_id,
          provider_kind: currentAttempt.provider_kind,
        });
      }
      const temporal_signal = await (await temporalProviderModule()).signalTemporalStageAttemptWorkflow({
        attempt: currentAttempt,
        signalKind: parsed.signalKind,
        payload: parsed.payload,
        source: parsed.source,
        paths,
      });
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
