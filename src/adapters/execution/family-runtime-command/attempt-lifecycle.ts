import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import {
  ensureFamilyRuntimePackageLaunchReady,
  packageRuntimeSourceCheckoutPath,
} from '../family-runtime-package-readiness.ts';
import { preflightFamilyRuntimeDomainLifecycleAdmission } from '../family-runtime-domain-lifecycle-admission.ts';
import {
  inspectStageAttempt,
  inspectStageAttemptWithCurrentProviderReadiness,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../family-runtime-stage-attempts.ts';
import { markStageAttemptCancelRequested } from '../family-runtime-stage-attempt-control.ts';
import { setStageAttemptArchived } from '../family-runtime-stage-attempt-ledger.ts';
import { queryTemporalStageAttemptReadModel } from '../family-runtime-temporal-query.ts';
import { insertEvent, stableId } from '../family-runtime-store.ts';
import { persistStageAttemptLaunchBinding, recordTemporalStartOnAttempt } from '../family-runtime-parts/stage-attempt-launch.ts';
import type { FamilyRuntimeAttemptCommandContext } from './attempt-shared.ts';
import {
  rawStageAttemptMutationAuthority,
  temporalProviderModule,
} from './attempt-shared.ts';

export type AttemptStartCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_start' }>;
};

export async function runAttemptStartCommand(
  context: AttemptStartCommandContext,
): Promise<Record<string, unknown>> {
  const {
    db,
    paths,
    parsed,
    stageRunRuntime,
  } = context;
  rawStageAttemptMutationAuthority(db, parsed.stageAttemptId, 'family_runtime_attempt_start_preflight');
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
        stageRunRuntime?.ensurePackageLaunchReady
        ?? ensureFamilyRuntimePackageLaunchReady
      )({
        domainId: attempt.domain_id,
        workspaceLocator: attempt.workspace_locator,
        useBoundaryId: stableId('package-use', [
          'stage_attempt_start',
          attempt.stage_attempt_id,
        ]),
      });
  const refreshedDomainPackRoot = packageRuntimeSourceCheckoutPath(packageReadiness) ?? '';
  const refreshedNativePackageClosure = isRecord(packageReadiness?.native_package_closure)
    ? packageReadiness.native_package_closure
    : null;
  const refreshedWorkspaceLocator = packageReadiness?.package_use_binding || refreshedNativePackageClosure
    ? {
        ...attempt.workspace_locator,
        ...(refreshedDomainPackRoot ? { domain_pack_root: refreshedDomainPackRoot } : {}),
        ...(packageReadiness?.package_use_binding
          ? { package_use_binding: packageReadiness.package_use_binding }
          : {}),
        ...(refreshedNativePackageClosure
          ? { native_package_closure: refreshedNativePackageClosure }
          : {}),
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
  rawStageAttemptMutationAuthority(db, parsed.stageAttemptId, 'family_runtime_attempt_start_provider_preflight');
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

export type AttemptCancelCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_cancel' }>;
};

export async function runAttemptCancelCommand(
  context: AttemptCancelCommandContext,
): Promise<Record<string, unknown>> {
  const {
    db,
    paths,
    parsed,
    stageRunRuntime,
    managedProviderProjection,
  } = context;
  rawStageAttemptMutationAuthority(db, parsed.stageAttemptId, 'family_runtime_attempt_cancel_preflight');
  const attempt = inspectStageAttempt(db, parsed.stageAttemptId);
  const temporal_cancel = stageRunRuntime?.cancelWorkflow
    ? await stageRunRuntime.cancelWorkflow({
        attempt,
        reason: parsed.reason,
        source: parsed.source,
      }, { paths })
    : await (await temporalProviderModule()).cancelTemporalStageAttemptWorkflow({
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
    managedProviderProjection: managedProviderProjection(),
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

export type AttemptArchiveCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_archive' | 'attempt_restore' }>;
};

export function runAttemptArchiveCommand(
  context: AttemptArchiveCommandContext,
): Record<string, unknown> {
  const { db, parsed } = context;
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
