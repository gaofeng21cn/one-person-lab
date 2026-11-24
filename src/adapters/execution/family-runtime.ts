import {
  runFamilyRuntimeProviderCommand,
  runFamilyRuntimeWorkerCommand,
} from './family-runtime-command/provider.ts';
import { runFamilyRuntimeStageRunCommand } from './family-runtime-command/stage-run.ts';
import { runFamilyRuntimeAttemptCommand } from './family-runtime-command/attempt.ts';
import { runFamilyRuntimeEvidenceWorklist } from './family-runtime-command/evidence-worklist.ts';
import { runFamilyRuntimeLifecycleCommand } from './family-runtime-command/lifecycle.ts';
import { runFamilyRuntimeSchedulerCommand } from './family-runtime-command/scheduler.ts';
import { DatabaseSync } from 'node:sqlite';

import { loadFrameworkContracts } from '../../authority/contracts/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  parseFamilyRuntimeCommand,
} from './family-runtime-command.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import { runTemporalServiceCommand } from './family-runtime-temporal-service-command.ts';
import { buildFamilyRuntimeStatusPayload } from './family-runtime-status.ts';
import { inspectStageAttempt } from './family-runtime-stage-attempts.ts';
import type { preflightDomainWorkspaceCheckoutCurrentness } from './family-runtime-checkout-currentness.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import { requireFamilyRuntimeExecutionScope } from './family-runtime-execution-scope.ts';
import {
  familyRuntimePaths,
  listEvents,
  listNotifications,
  nowIso,
  openQueueDb,
} from './family-runtime-store.ts';
import { readManagedProviderProjectionSummary } from './family-runtime-managed-provider-projection.ts';
import {
  emptyDomainManifestCatalog,
  type DomainManifestCatalog,
  type DomainManifestCatalogLoader,
  type DomainManifestCatalogOptions,
} from '../../kernel/domain-manifest-port.ts';
import { runFamilyRuntimeEvidenceWorklistCommand } from './family-runtime-evidence-worklist-command.ts';
import { runFamilyRuntimeStageArtifactCommand } from './family-runtime-stage-artifact-command.ts';
import type { RuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
import { ensureFamilyRuntimePackageLaunchReady } from './family-runtime-package-readiness.ts';
import type { FoundryEvaluationStageAdmission, FoundryEvaluationStageCandidate } from './foundry-evaluation-stage-candidate.ts';
import type {
  CordisPackStageBindingService,
  resolveStandardAgentStageQualityRuntimeBinding,
} from '../../authority/packages/index.ts';
import type { CordisStagecraftContextService } from '../../authority/stages/index.ts';
import { launchRegisteredStageRun } from './family-runtime-stage-run-launch.ts';
import { materializeReviewerInputSnapshot } from './family-runtime-reviewer-input-snapshot.ts';
import { persistReviewEvidenceArtifactCandidate } from './family-runtime-review-evidence-artifact.ts';
import type { StageRunObservation } from './family-runtime-stage-run-observation.ts';


export async function runFamilyRuntime(
  args: string[],
  options: {
    onStageRunObservation?: (observation: StageRunObservation) => void;
    runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
    ownerDeltaObserver?: import('../../authority/evidence/index.ts').CordisOwnerDeltaObserverService;
    loadDomainManifests?: DomainManifestCatalogLoader;
    stageReplayMissingReceiptExtraReceipts?: Parameters<
      typeof runFamilyRuntimeEvidenceWorklistCommand
    >[0]['stageReplayMissingReceiptExtraReceipts'];
    createStageRouteComposition?: (options: {
      loadDomainManifests?: DomainManifestCatalogLoader;
    }) => Promise<{
      stageBinding: CordisPackStageBindingService;
      stageContext: CordisStagecraftContextService;
      dispose(): Promise<void>;
    }>;
    stageRunRuntime?: {
      evaluationCandidate?: FoundryEvaluationStageCandidate;
      admitEvaluationStage?: FoundryEvaluationStageAdmission;
      ensurePackageLaunchReady?: typeof ensureFamilyRuntimePackageLaunchReady;
      resolveStageBinding?: typeof resolveStandardAgentStageQualityRuntimeBinding;
      stageBindingService?: CordisPackStageBindingService;
      stageContextService?: CordisStagecraftContextService;
      startWorkflow?: (
        input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
        context: { paths: ReturnType<typeof familyRuntimePaths> },
      ) => Promise<Record<string, unknown>>;
      startRecoveryWorkflow?: (
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
      cancelWorkflow?: (
        input: {
          attempt: ReturnType<typeof inspectStageAttempt>;
          reason: string;
          source?: string;
        },
        context: { paths: ReturnType<typeof familyRuntimePaths> },
      ) => Promise<Record<string, unknown>>;
    };
  } = {},
): Promise<Record<string, unknown>> {
  const parsed = parseFamilyRuntimeCommand(args);
  const paths = familyRuntimePaths();
  let loadedDomainManifests: DomainManifestCatalog | null = null;
  const domainManifests = (
    manifestOptions: DomainManifestCatalogOptions = {},
  ) => {
    loadedDomainManifests ??= options.loadDomainManifests?.(
      loadFrameworkContracts(),
      {
        manifestCommandTimeoutMs: 5_000,
        manifestCommandTimeoutPolicy: 'fixed',
        materializeFamilyTransitions: false,
        useProjectionCacheOnFailure: true,
        ...manifestOptions,
      },
    ) ?? emptyDomainManifestCatalog();
    return loadedDomainManifests;
  };
  const managedProviderProjection = (
    manifestOptions: DomainManifestCatalogOptions = {},
  ) => readManagedProviderProjectionSummary({
    domainManifests: domainManifests(manifestOptions),
  });

  // Worker lifecycle commands must remain operable while the runtime ledger is
  // busy or undergoing a long startup migration. Opening queue.sqlite first
  // would block the only command that can stop the writer holding that lock.
  if (parsed.mode === 'worker_status' || parsed.mode === 'worker_start' || parsed.mode === 'worker_stop') {
    return await runFamilyRuntimeWorkerCommand(parsed, paths);
  }

  const { db } = openQueueDb();
  let cordisPackStagecraft: Awaited<ReturnType<NonNullable<typeof options.createStageRouteComposition>>> | null = null;
  const getCordisPackStagecraft = async () => {
    const stageBinding = options.stageRunRuntime?.stageBindingService;
    const stageContext = options.stageRunRuntime?.stageContextService;
    if (stageBinding && stageContext) {
      return { stageBinding, stageContext };
    }
    if (!options.createStageRouteComposition) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Family runtime stage-run requires the Host-projected Cordis Stagecraft composition factory.',
        { required_factory: 'createStageRouteComposition' },
      );
    }
    cordisPackStagecraft ??= await options.createStageRouteComposition({
      loadDomainManifests: options.loadDomainManifests,
    });
    return cordisPackStagecraft;
  };
  try {
    if (
      parsed.mode === 'stage_run_query'
      || parsed.mode === 'stage_run_watch'
      || parsed.mode === 'stage_run_recover_closeout'
    ) {
      return await runFamilyRuntimeStageRunCommand({
        db,
        paths,
        parsed,
        stageRunRuntime: options.stageRunRuntime,
        onStageRunObservation: options.onStageRunObservation,
      });
    }
    if (parsed.mode === 'status') {
      return await buildFamilyRuntimeStatusPayload(
        db,
        paths,
        resolveFamilyRuntimeProviderKind(parsed.providerKind),
        { managedProviderProjection: managedProviderProjection({ writeProjectionCache: false }) },
      );
    }
    if (parsed.mode === 'doctor') {
      const status = (await buildFamilyRuntimeStatusPayload(
        db,
        paths,
        resolveFamilyRuntimeProviderKind(parsed.providerKind),
        { managedProviderProjection: managedProviderProjection({ writeProjectionCache: false }) },
      )).family_runtime;
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
    if (
      parsed.mode === 'install'
      || parsed.mode === 'repair'
      || parsed.mode === 'residency_proof'
      || parsed.mode === 'provider_slo_tick'
      || parsed.mode === 'control_loop_status'
      || parsed.mode === 'provider_worker_supervisor'
    ) {
      return await runFamilyRuntimeProviderCommand({ db, paths, parsed });
    }
    if (
      parsed.mode === 'service_status'
      || parsed.mode === 'service_start'
      || parsed.mode === 'service_restart'
      || parsed.mode === 'service_stop'
    ) {
      return await runTemporalServiceCommand(db, paths, parsed);
    }
    if (
      parsed.mode === 'scheduler_status'
      || parsed.mode === 'scheduler_install'
      || parsed.mode === 'scheduler_remove'
      || parsed.mode === 'scheduler_trigger'
    ) {
      return await runFamilyRuntimeSchedulerCommand({ db, paths, parsed });
    }
    if (parsed.mode === 'lifecycle_apply' || parsed.mode === 'lifecycle_reconcile') {
      return runFamilyRuntimeLifecycleCommand(parsed);
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
      return await runFamilyRuntimeEvidenceWorklist({
        parsed,
        stageReplayMissingReceiptExtraReceipts: options.stageReplayMissingReceiptExtraReceipts,
        runtimeSnapshotProvider: options.runtimeSnapshotProvider,
        ownerDeltaObserver: options.ownerDeltaObserver,
        domainManifests: options.loadDomainManifests ? domainManifests() : undefined,
      });
    }
    if (parsed.mode === 'stage_artifact') {
      return runFamilyRuntimeStageArtifactCommand(parsed.input);
    }
    if (
      parsed.mode === 'attempt_create'
      || parsed.mode === 'attempt_start'
      || parsed.mode === 'attempt_cancel'
      || parsed.mode === 'attempt_archive'
      || parsed.mode === 'attempt_restore'
      || parsed.mode === 'attempt_list'
      || parsed.mode === 'attempt_inspect'
      || parsed.mode === 'attempt_query'
      || parsed.mode === 'attempt_signal'
      || parsed.mode === 'attempt_fixture_run'
    ) {
      return await runFamilyRuntimeAttemptCommand({
        db,
        paths,
        parsed,
        stageRunRuntime: options.stageRunRuntime,
        getCordisPackStagecraft,
        managedProviderProjection,
      });
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
    const activeComposition = cordisPackStagecraft as Awaited<
      ReturnType<NonNullable<typeof options.createStageRouteComposition>>
    > | null;
    if (activeComposition) await activeComposition.dispose();
    db.close();
  }
}

function withStageAttemptMutationAdmission<T>(
  db: DatabaseSync,
  stageAttemptId: string,
  operation: string,
  mutation: (
    row: Record<string, unknown>,
    admission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>,
  ) => T,
) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
      stageAttemptId,
    ) as Record<string, unknown> | undefined;
    if (!row) {
      throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
        stage_attempt_id: stageAttemptId,
        operation,
      });
    }
    const admission = requireRuntimeExecutionScopeMutationAllowed(db, row, operation);
    const result = mutation(row, admission);
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function temporalStartProviderRun(
  attempt: { provider_run: Record<string, unknown> },
  temporalStart: unknown,
) {
  if (!temporalStart || typeof temporalStart !== 'object' || Array.isArray(temporalStart)) {
    return null;
  }
  const receipt = temporalStart as Record<string, unknown>;
  return {
    ...attempt.provider_run,
    provider_status: 'started',
    namespace: typeof receipt.namespace === 'string' ? receipt.namespace : attempt.provider_run.namespace ?? null,
    task_queue: typeof receipt.task_queue === 'string' ? receipt.task_queue : attempt.provider_run.task_queue ?? null,
    first_execution_run_id: typeof receipt.first_execution_run_id === 'string'
      ? receipt.first_execution_run_id
      : null,
    temporal_start_receipt: receipt,
    temporal_visibility_readiness: receipt.visibility_readiness ?? null,
    started_at: typeof attempt.provider_run.started_at === 'string' ? attempt.provider_run.started_at : nowIso(),
    last_heartbeat_at: nowIso(),
  };
}

export function recordTemporalStartOnAttempt(
  db: DatabaseSync,
  attempt: { stage_attempt_id: string; provider_run: Record<string, unknown> },
  temporalStart: unknown,
) {
  if (!temporalStart || typeof temporalStart !== 'object' || Array.isArray(temporalStart)) {
    return;
  }
  withStageAttemptMutationAdmission(
    db,
    attempt.stage_attempt_id,
    'record_stage_attempt_temporal_start',
    () => {
      const current = inspectStageAttempt(db, attempt.stage_attempt_id);
      const providerRun = temporalStartProviderRun(current, temporalStart)!;
      const updatedAt = nowIso();
      return db.prepare(`
        UPDATE stage_attempts
        SET provider_run_json = ?, updated_at = ?
        WHERE stage_attempt_id = ?
      `).run(JSON.stringify(providerRun), updatedAt, attempt.stage_attempt_id);
    },
  );
}

export function persistStageAttemptLaunchBinding<T extends {
  stage_attempt_id: string;
  workspace_locator: Record<string, unknown>;
  provider_run: Record<string, unknown>;
}>(
  db: DatabaseSync,
  attempt: T,
  input: {
    workspaceLocator: Record<string, unknown>;
    packageUseBinding: Record<string, unknown> | null;
    domainPackRoot: string | null;
  },
) {
  return withStageAttemptMutationAdmission(
    db,
    attempt.stage_attempt_id,
    'persist_stage_attempt_launch_binding',
    (row, admission) => {
      requireFamilyRuntimeExecutionScope({
        scopeKind: admission.columns.scope_kind,
        executionScope: admission.executionScope,
        workspaceLocator: input.workspaceLocator,
        domainId: typeof row.domain_id === 'string' ? row.domain_id : null,
        operation: 'persist_stage_attempt_launch_binding:workspace_locator',
      });
      const current = inspectStageAttempt(db, attempt.stage_attempt_id);
      const updatedAt = nowIso();
      const providerRun = {
        ...current.provider_run,
        execution_package_use_context: {
          status: 'attempt_launch_binding_persisted',
          recorded_at: updatedAt,
          package_use_binding: input.packageUseBinding,
          domain_pack_root: input.domainPackRoot,
        },
      };
      const reservation = db.prepare(`
        UPDATE stage_attempts
        SET workspace_locator_json = ?, provider_run_json = ?, updated_at = ?
        WHERE stage_attempt_id = ?
          AND COALESCE(json_extract(
            provider_run_json,
            '$.execution_package_use_context.status'
          ), '') = ''
          AND COALESCE(json_extract(provider_run_json, '$.first_execution_run_id'), '') = ''
      `).run(
        JSON.stringify(input.workspaceLocator),
        JSON.stringify(providerRun),
        updatedAt,
        attempt.stage_attempt_id,
      );
      if (reservation.changes === 0) {
        return inspectStageAttempt(db, attempt.stage_attempt_id);
      }
      return {
        ...current,
        workspace_locator: input.workspaceLocator,
        provider_run: providerRun,
      };
    },
  );
}

type CheckoutCurrentnessPreflight = ReturnType<typeof preflightDomainWorkspaceCheckoutCurrentness>;

export function attachCheckoutCurrentnessToStageContext<T extends object>(
  observation: T,
  checkoutCurrentnessPreflight: CheckoutCurrentnessPreflight,
) {
  if (!checkoutCurrentnessPreflight) {
    return observation;
  }
  return {
    ...observation,
    checkout_currentness_preflight: checkoutCurrentnessPreflight,
  } as T & { checkout_currentness_preflight: typeof checkoutCurrentnessPreflight };
}
