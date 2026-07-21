import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import { loadFrameworkContracts } from '../charter/index.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
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
  attachCheckoutCurrentnessToStageContext,
  persistStageAttemptLaunchBinding,
  recordTemporalStartOnAttempt,
} from './family-runtime-parts/stage-attempt-launch.ts';
import { ensureFamilyRuntimePackageLaunchReady } from './family-runtime-package-readiness.ts';
import { resolveStandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import { buildPackBoundTemporalStageRunInput } from './family-runtime-pack-bound-stage-run.ts';
import {
  buildCliStageRunInvocationId,
  deriveStageRunId,
  explicitStageRunInvocationId,
  stageRunWorkspaceIdentity,
} from './family-runtime-stage-run-identity.ts';
import { canonicalStageRunSha256 } from './family-runtime-stage-run-identity-parts/content-bindings.ts';
import { launchRegisteredStageRun } from './family-runtime-stage-run-launch.ts';
import { findStageRunLaunch } from './family-runtime-stage-run-launch-registry.ts';
import { materializeReviewerInputSnapshot } from './family-runtime-reviewer-input-snapshot.ts';
import { persistReviewEvidenceArtifactCandidate } from './family-runtime-review-evidence-artifact.ts';
import { preflightFamilyRuntimeDomainLifecycleAdmission } from './family-runtime-domain-lifecycle-admission.ts';

function stageRunReplayBusinessIdentity(
  input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
) {
  const spec = input.stage_run_spec;
  return {
    domain_id: spec.domain_id,
    stage_id: spec.stage_id,
    action_id: spec.action_id,
    task_id: spec.task_id,
    workspace_identity: spec.workspace_identity,
    source_fingerprint: spec.source_fingerprint,
    input_artifacts: spec.input_artifacts,
    executor_kind: spec.executor_kind,
    stage_attempt_executor_policy: spec.stage_attempt_executor_policy,
    parent_route_decision_ref: spec.parent_route_decision_ref,
    checkpoint_refs: spec.checkpoint_refs.filter((ref) => ref !== spec.stage_packet_ref),
  };
}

function normalizedReplayStringList(values: unknown) {
  return Array.isArray(values)
    ? [...new Set(values
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim()))]
    : [];
}

function stageRunReplayRequestBusinessIdentity(input: {
  domainId: Parameters<typeof buildCliStageRunInvocationId>[0]['domainId'];
  stageId: string;
  actionId?: string;
  taskId?: string;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint?: string;
  executorKind?: string;
  executorBindingRef?: string;
  invocationMode?: string;
  boundedEditRef?: string;
  parentRouteDecisionRef?: string;
  checkpointRefs?: string[];
  inputArtifactRefs?: string[];
  inputArtifactHashes?: string[];
}) {
  const artifactRefs = Array.isArray(input.inputArtifactRefs)
    ? input.inputArtifactRefs
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim())
    : [];
  const artifactHashes = input.inputArtifactHashes ?? [];
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable input artifact refs and hashes must have equal cardinality.',
      { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    );
  }
  const artifactIndex = new Map<string, { sha256: string; identity_receipt_ref: null }>();
  artifactRefs.forEach((ref, index) => {
    const artifact = {
      sha256: canonicalStageRunSha256(artifactHashes[index], `input_artifact_hashes[${index}]`),
      identity_receipt_ref: null,
    };
    const existing = artifactIndex.get(ref);
    if (existing && existing.sha256 !== artifact.sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun input artifact ref cannot be bound to conflicting hashes or receipts.',
        {
          artifact_ref: ref,
          existing_sha256: existing.sha256,
          received_sha256: artifact.sha256,
        },
      );
    }
    artifactIndex.set(ref, artifact);
  });
  const inputArtifacts = [...artifactIndex.entries()]
    .map(([ref, artifact]) => ({ ref, ...artifact }))
    .sort((left, right) => left.ref.localeCompare(right.ref) || left.sha256.localeCompare(right.sha256));
  const checkpointRefs = normalizedReplayStringList(input.checkpointRefs);
  const stagePacketRef = checkpointRefs[0] ?? null;
  const stageAttemptExecutorPolicy = {
    ...(input.executorBindingRef ? { executor_binding_ref: input.executorBindingRef } : {}),
    ...(input.invocationMode ? { invocation_mode: input.invocationMode } : {}),
    ...(input.boundedEditRef ? { bounded_edit_ref: input.boundedEditRef } : {}),
  };
  return {
    domain_id: input.domainId,
    stage_id: input.stageId.trim(),
    action_id: input.actionId?.trim() || null,
    task_id: input.taskId?.trim() || null,
    workspace_identity: stageRunWorkspaceIdentity(input.workspaceLocator),
    source_fingerprint: input.sourceFingerprint?.trim()
      ? canonicalStageRunSha256(input.sourceFingerprint, 'source_fingerprint')
      : null,
    input_artifacts: inputArtifacts,
    executor_kind: input.executorKind?.trim() || 'codex_cli',
    stage_attempt_executor_policy: stageAttemptExecutorPolicy,
    parent_route_decision_ref: input.parentRouteDecisionRef?.trim() || null,
    checkpoint_refs: stagePacketRef
      ? checkpointRefs.filter((ref) => ref !== stagePacketRef)
      : checkpointRefs,
  };
}

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
    stageRunRuntime?: {
      ensurePackageLaunchReady?: typeof ensureFamilyRuntimePackageLaunchReady;
      resolveStageBinding?: typeof resolveStandardAgentStageQualityRuntimeBinding;
      startWorkflow?: (
        input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
        context: { paths: ReturnType<typeof familyRuntimePaths> },
      ) => Promise<Record<string, unknown>>;
      describeWorkflow?: (
        input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
        context: { paths: ReturnType<typeof familyRuntimePaths> },
      ) => Promise<Record<string, unknown>>;
      queryWorkflow?: (
        input: { workflowId: string },
        context: { paths: ReturnType<typeof familyRuntimePaths> },
      ) => Promise<Record<string, unknown>>;
    };
  } = {},
): Promise<Record<string, unknown>> {
  const parsed = parseFamilyRuntimeCommand(args);
  const { db, paths } = openQueueDb();
  try {
    if (parsed.mode === 'stage_run_query') {
      const stage_run_query = options.stageRunRuntime?.queryWorkflow
        ? await options.stageRunRuntime.queryWorkflow({ workflowId: parsed.workflowId }, { paths })
        : await (await temporalProviderModule()).queryTemporalStageRunWorkflow({
            workflowId: parsed.workflowId,
            paths,
          });
      return { version: 'g2', family_runtime_stage_run_query: stage_run_query };
    }
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
    if (
      parsed.mode === 'service_status'
      || parsed.mode === 'service_start'
      || parsed.mode === 'service_restart'
      || parsed.mode === 'service_stop'
    ) {
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
    if (parsed.mode === 'review_snapshot_materialize') {
      return {
        version: 'g2',
        family_runtime_review_snapshot: materializeReviewerInputSnapshot(parsed.input),
      };
    }
    if (parsed.mode === 'review_evidence_artifact_persist') {
      return {
        version: 'g2',
        family_runtime_review_evidence_artifact: persistReviewEvidenceArtifactCandidate(
          parsed.input.candidate,
          parsed.input.context_binding,
        ),
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
      const usesExplicitStageRunIdentity = Boolean(
        parsed.input.newStageRun
        || parsed.input.stageRunInvocationId
        || parsed.input.parentRouteDecisionRef
        || (parsed.input.inputArtifactRefs?.length ?? 0) > 0
        || (parsed.input.inputArtifactHashes?.length ?? 0) > 0,
      );
      const existingAttempt = usesExplicitStageRunIdentity
        ? null
        : findIdempotentStageAttempt(db, parsed.input);
      if (existingAttempt && !parsed.input.start) {
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
      const baseStageRunInvocationId = buildCliStageRunInvocationId({
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
        actionId: parsed.input.actionId,
        workspaceLocator: parsed.input.workspaceLocator,
        taskId: parsed.input.taskId,
      });
      const stageRunInvocationId = parsed.input.stageRunInvocationId
        ? explicitStageRunInvocationId(parsed.input.stageRunInvocationId)
        : parsed.input.newStageRun || parsed.input.newAttempt
          ? stableId('sri', [baseStageRunInvocationId, 'explicit_new_stage_run', randomUUID()])
          : baseStageRunInvocationId;
      const stageRunId = deriveStageRunId({
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
        stageRunInvocationId,
      });
      const existingStageRunLaunch = findStageRunLaunch(db, stageRunId);
      if (existingStageRunLaunch && canonicalJsonText(
        stageRunReplayBusinessIdentity(existingStageRunLaunch.stage_run_input),
      ) !== canonicalJsonText(stageRunReplayRequestBusinessIdentity(parsed.input))) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'StageRun invocation is already bound to a different immutable spec.',
          {
            failure_code: 'stage_run_invocation_spec_conflict',
            domain_id: parsed.input.domainId,
            stage_id: parsed.input.stageId,
            stage_run_invocation_id: stageRunInvocationId,
            existing_stage_run_id: existingStageRunLaunch.stage_run_id,
            existing_stage_run_spec_sha256: existingStageRunLaunch.stage_run_spec_sha256,
          },
        );
      }
      const useBoundaryId = stableId('package-use', [stageRunInvocationId]);
      const pinnedUseBinding = isRecord(parsed.input.workspaceLocator.package_use_binding)
        ? parsed.input.workspaceLocator.package_use_binding
        : null;
      const packageReadiness = existingStageRunLaunch
        ? null
        : await (
            options.stageRunRuntime?.ensurePackageLaunchReady
            ?? ensureFamilyRuntimePackageLaunchReady
          )({
            domainId: parsed.input.domainId,
            workspaceLocator: parsed.input.workspaceLocator,
            activateMissingScope: Boolean(parsed.input.start),
            ...(parsed.input.start ? { useBoundaryId } : {}),
            ...(pinnedUseBinding ? { pinnedUseBinding } : {}),
          });
      const explicitDomainPackRoot = typeof parsed.input.workspaceLocator.domain_pack_root === 'string'
        ? parsed.input.workspaceLocator.domain_pack_root.trim()
        : '';
      const managedDomainPackRoot = typeof packageReadiness?.runtime_source_readiness?.checkout_path === 'string'
        ? packageReadiness.runtime_source_readiness.checkout_path.trim()
        : '';
      const persistedDomainPackRoot = existingStageRunLaunch?.stage_run_input.domain_pack_root?.trim() ?? '';
      const domainPackRoot = persistedDomainPackRoot
        || (pinnedUseBinding
          ? explicitDomainPackRoot || managedDomainPackRoot
          : managedDomainPackRoot || explicitDomainPackRoot)
        || null;
      const stageQualityBinding = !existingStageRunLaunch && domainPackRoot
        ? (options.stageRunRuntime?.resolveStageBinding
          ?? resolveStandardAgentStageQualityRuntimeBinding)(domainPackRoot, parsed.input.stageId)
        : null;
      const selectedPackageUseBinding = parsed.input.start
        ? pinnedUseBinding ?? packageReadiness?.package_use_binding
        : null;
      const useBoundWorkspaceLocator = selectedPackageUseBinding
        ? {
            ...parsed.input.workspaceLocator,
            ...(domainPackRoot ? { domain_pack_root: domainPackRoot } : {}),
            package_use_binding: selectedPackageUseBinding,
          }
        : {
            ...parsed.input.workspaceLocator,
            ...(domainPackRoot ? { domain_pack_root: domainPackRoot } : {}),
          };
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
      const checkoutBoundStageContextObservation = attachCheckoutCurrentnessToStageContext(
        defaultStageContextObservation,
        checkoutCurrentnessPreflight,
      );
      const lifecycleWorkspaceLocator = existingStageRunLaunch?.stage_run_input.workspace_locator
        ?? useBoundWorkspaceLocator;
      const domainLifecycleAdmission = parsed.input.start
        ? preflightFamilyRuntimeDomainLifecycleAdmission({
            domainId: parsed.input.domainId,
            stageId: parsed.input.stageId,
            actionId: existingStageRunLaunch?.stage_run_input.action_id ?? parsed.input.actionId,
            domainPackRoot: existingStageRunLaunch?.stage_run_input.domain_pack_root ?? domainPackRoot,
            workspaceLocator: lifecycleWorkspaceLocator,
          })
        : null;
      const stageLaunchContextObservation = domainLifecycleAdmission
        ? {
            ...checkoutBoundStageContextObservation,
            domain_lifecycle_admission: domainLifecycleAdmission,
          }
        : checkoutBoundStageContextObservation;
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
      const blockedReason = launchInvocation.blocker_reason
        ?? parsed.input.blockedReason
        ?? undefined;
      if (!existingAttempt && (existingStageRunLaunch || stageQualityBinding?.enabled)) {
        if (parsed.input.newStageRun && parsed.input.newAttempt) {
          throw new FrameworkContractError(
            'cli_usage_error',
            '--new-stage-run cannot be combined with its quality-path --new-attempt compatibility alias.',
            { mutually_exclusive: ['--new-stage-run', '--new-attempt'] },
          );
        }
        if (
          parsed.input.stageRunInvocationId
          && (parsed.input.newStageRun || parsed.input.newAttempt)
        ) {
          throw new FrameworkContractError(
            'cli_usage_error',
            '--stage-run-invocation-id cannot be combined with --new-stage-run or the quality-path --new-attempt alias.',
            {
              mutually_exclusive: [
                '--stage-run-invocation-id',
                '--new-stage-run',
                '--new-attempt',
              ],
            },
          );
        }
        const stageRunInput = existingStageRunLaunch?.stage_run_input
          ?? buildPackBoundTemporalStageRunInput({
            binding: stageQualityBinding!,
            domainPackRoot: domainPackRoot!,
            domainId: parsed.input.domainId,
            stageId: parsed.input.stageId,
            stageRunInvocationId,
            parentRouteDecisionRef: parsed.input.parentRouteDecisionRef,
            workspaceLocator: useBoundWorkspaceLocator,
            sourceFingerprint,
            executorKind: parsed.input.executorKind,
            stageAttemptExecutorPolicy: {
              ...(parsed.input.executorBindingRef ? { executor_binding_ref: parsed.input.executorBindingRef } : {}),
              ...(parsed.input.invocationMode ? { invocation_mode: parsed.input.invocationMode } : {}),
              ...(parsed.input.boundedEditRef ? { bounded_edit_ref: parsed.input.boundedEditRef } : {}),
            },
            checkpointRefs: parsed.input.checkpointRefs,
            artifactRefs: parsed.input.inputArtifactRefs,
            artifactHashes: parsed.input.inputArtifactHashes,
            actionId: parsed.input.actionId,
            taskId,
            checkoutCurrentnessAdmission: checkoutCurrentnessPreflight,
          });
        const durableLaunch = await launchRegisteredStageRun({
          db,
          stageRunInput,
          start: Boolean(parsed.input.start && !blockedReason),
          startWorkflow: async (workflowInput) =>
            options.stageRunRuntime?.startWorkflow
              ? await options.stageRunRuntime.startWorkflow(workflowInput, { paths })
              : await (await temporalProviderModule()).startTemporalStageRunWorkflow(workflowInput, { paths }),
          describeWorkflow: async (workflowInput) =>
            options.stageRunRuntime?.describeWorkflow
              ? await options.stageRunRuntime.describeWorkflow(workflowInput, { paths })
              : await (await temporalProviderModule()).describeTemporalStageRunWorkflow(workflowInput, { paths }),
        });
        const temporal_start = parsed.input.start && !blockedReason
          ? durableLaunch.temporal_start
          : null;
        insertEvent(db, {
          taskId,
          domainId: parsed.input.domainId,
          eventType: blockedReason
            ? 'stage_run_launch_hard_stopped'
            : temporal_start
              ? 'stage_run_temporal_started'
              : 'stage_run_launch_planned',
          source: 'opl-cli',
          payload: {
            stage_run_id: stageRunInput.stage_run_id,
            stage_run_invocation_id: stageRunInput.stage_run_invocation_id,
            stage_run_spec_sha256: stageRunInput.stage_run_spec_sha256,
            workflow_id: stageRunInput.workflow_id,
            stage_id: stageRunInput.stage_id,
            quality_policy_ref: stageRunInput.quality_policy_ref,
            blocked_reason: blockedReason ?? null,
            temporal_start,
            durable_launch: durableLaunch,
          },
        });
        return {
          version: 'g2',
          family_runtime_stage_run: {
            surface_id: 'opl_family_runtime_stage_run',
            stage_run_input: stageRunInput,
            stage_context_observation: stageLaunchContextObservation,
            launch_invocation: launchInvocation,
            durable_launch: durableLaunch,
            blocked_reason: blockedReason ?? null,
            temporal_start,
          },
        };
      }
      if (
        parsed.input.newStageRun
        || parsed.input.stageRunInvocationId
        || parsed.input.parentRouteDecisionRef
        || (parsed.input.inputArtifactRefs?.length ?? 0) > 0
        || (parsed.input.inputArtifactHashes?.length ?? 0) > 0
      ) {
        throw new FrameworkContractError(
          'cli_usage_error',
          'StageRun identity and input artifact options require an enabled pack-bound Stage quality runtime.',
          {
            stage_id: parsed.input.stageId,
            stage_quality_runtime_enabled: false,
          },
        );
      }
      const result = existingAttempt
        ? {
            created: false,
            idempotent_noop: true,
            attempt: existingAttempt,
          }
        : createStageAttempt(db, {
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
      const stageLaunchHardStopped = Boolean(launchInvocation.blocker_reason);
      const launchAttempt = parsed.input.start && attempt.status !== 'blocked'
        ? persistStageAttemptLaunchBinding(db, attempt, {
            workspaceLocator: useBoundWorkspaceLocator,
            packageUseBinding: isRecord(selectedPackageUseBinding)
              ? selectedPackageUseBinding
              : null,
            domainPackRoot,
          })
        : attempt;
      const temporal_start = parsed.input.start
        && launchAttempt.status !== 'blocked'
          ? await (await temporalProviderModule()).startTemporalStageAttemptWorkflow(launchAttempt, { paths })
        : null;
      recordTemporalStartOnAttempt(db, launchAttempt, temporal_start);
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
      if (attempt.attempt_role) {
        throw new FrameworkContractError(
          'cli_usage_error',
          'Quality-cycle StageAttempts can be started only by their StageRunController.',
          {
            stage_attempt_id: attempt.stage_attempt_id,
            stage_run_id: attempt.stage_run_id,
            attempt_role: attempt.attempt_role,
          },
        );
      }
      const workflowAlreadyStarted = typeof attempt.provider_run.first_execution_run_id === 'string'
        && attempt.provider_run.first_execution_run_id.length > 0;
      const persistedLaunchContext = isRecord(attempt.provider_run.execution_package_use_context)
        ? attempt.provider_run.execution_package_use_context
        : null;
      const launchBindingAlreadySelected = workflowAlreadyStarted
        || persistedLaunchContext?.status === 'attempt_launch_binding_persisted';
      const packageReadiness = launchBindingAlreadySelected
        ? null
        : await (
            options.stageRunRuntime?.ensurePackageLaunchReady
            ?? ensureFamilyRuntimePackageLaunchReady
          )({
            domainId: attempt.domain_id,
            workspaceLocator: attempt.workspace_locator,
            useBoundaryId: stableId('package-use', [
              'stage_attempt_start',
              attempt.stage_attempt_id,
            ]),
          });
      const refreshedDomainPackRoot = typeof packageReadiness?.runtime_source_readiness?.checkout_path === 'string'
        ? packageReadiness.runtime_source_readiness.checkout_path.trim()
        : '';
      const refreshedWorkspaceLocator = packageReadiness?.package_use_binding
        ? {
            ...attempt.workspace_locator,
            ...(refreshedDomainPackRoot ? { domain_pack_root: refreshedDomainPackRoot } : {}),
            package_use_binding: packageReadiness.package_use_binding,
          }
        : attempt.workspace_locator;
      const reboundAttempt = launchBindingAlreadySelected
        ? attempt
        : persistStageAttemptLaunchBinding(db, attempt, {
            workspaceLocator: refreshedWorkspaceLocator,
            packageUseBinding: isRecord(packageReadiness?.package_use_binding)
              ? packageReadiness.package_use_binding
              : null,
            domainPackRoot: refreshedDomainPackRoot || null,
          });
      const reboundPackRoot = typeof reboundAttempt.workspace_locator.domain_pack_root === 'string'
        ? reboundAttempt.workspace_locator.domain_pack_root.trim()
        : '';
      const selectedActionId = isRecord(reboundAttempt.route_impact)
        && typeof reboundAttempt.route_impact.selected_action_id === 'string'
        ? reboundAttempt.route_impact.selected_action_id.trim()
        : typeof reboundAttempt.workspace_locator.action_ref === 'string'
          ? reboundAttempt.workspace_locator.action_ref.trim()
          : '';
      preflightFamilyRuntimeDomainLifecycleAdmission({
        domainId: reboundAttempt.domain_id,
        stageId: reboundAttempt.stage_id,
        actionId: selectedActionId || null,
        domainPackRoot: reboundPackRoot || null,
        workspaceLocator: reboundAttempt.workspace_locator,
      });
      const { startTemporalStageAttemptWorkflow } = await temporalProviderModule();
      const temporal_start = await startTemporalStageAttemptWorkflow(reboundAttempt, { paths });
      recordTemporalStartOnAttempt(db, reboundAttempt, temporal_start);
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
