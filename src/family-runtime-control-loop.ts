import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  inspectSelectedFamilyRuntimeProvidersWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import {
  familyRuntimePaths,
  queueSummary,
} from './family-runtime-store.ts';
import { stageAttemptSummary } from './family-runtime-stage-attempts.ts';
import { runTemporalSchedulerCadenceCommand } from './family-runtime-scheduler.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;

const FALSE_AUTHORITY_BOUNDARY = {
  can_execute_domain_action: false,
  can_write_domain_truth: false,
  can_write_domain_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_authorize_export_verdict: false,
  provider_completion_is_domain_ready: false,
} as const;

function readinessStatus(input: {
  providerReady: boolean;
  schedulerStatus: string | null;
  queueTotal: number;
  attemptTotal: number;
}) {
  if (!input.providerReady) {
    return 'blocked_provider_not_ready';
  }
  if (input.schedulerStatus === 'attention_required' || input.schedulerStatus === 'blocked_provider_not_ready') {
    return 'attention_required';
  }
  if (input.queueTotal > 0 || input.attemptTotal > 0) {
    return 'active_or_queued';
  }
  return 'idle_ready';
}

export async function buildFamilyRuntimeControlLoopStatus(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  requestedProvider?: FamilyRuntimeProviderKind,
) {
  const providerKind = resolveFamilyRuntimeProviderKind(requestedProvider);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime control-loop status supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }

  const providerRuntime = await inspectSelectedFamilyRuntimeProvidersWithLifecycle({
    requestedProvider: providerKind,
    paths,
    options: {
      managedProviderProjection: readMasManagedProviderProjection(),
    },
  });
  const selected = providerRuntime.provider;
  const scheduler = await runTemporalSchedulerCadenceCommand(db, paths, {
    mode: 'scheduler_status',
    providerKind,
  });
  const schedulerRecord = scheduler as Record<string, unknown>;
  const schedulerAction = schedulerRecord.action && typeof schedulerRecord.action === 'object'
    ? schedulerRecord.action as Record<string, unknown>
    : null;
  const queue = queueSummary(db);
  const attempts = stageAttemptSummary(db);
  const status = readinessStatus({
    providerReady: selected.ready,
    schedulerStatus: typeof scheduler.status === 'string' ? scheduler.status : null,
    queueTotal: queue.total,
    attemptTotal: attempts.total,
  });

  return {
    surface_kind: 'opl_family_runtime_control_loop_status',
    module_id: 'runway',
    brand_name: 'OPL Runway',
    provider_kind: providerKind,
    control_loop_status: status,
    loop_model: {
      process_loop: {
        owner: 'opl_provider_runtime_manager',
        purpose: 'keep Temporal service, worker process, and scheduler cadence observable and repairable',
        provider_worker_supervisor_command: 'opl family-runtime provider-worker supervisor status --provider temporal',
        worker_status_command: 'opl family-runtime worker status --provider temporal',
        scheduler_status_command: 'opl family-runtime scheduler status --provider temporal',
      },
      execution_loop: {
        owner: 'opl_runway',
        purpose: 'admit, queue, dispatch, retry, dead-letter, resume, and reconcile provider-backed stage attempts',
        queue_command: 'opl family-runtime queue list --json',
        attempt_command: 'opl family-runtime attempt list --json',
        scheduler_tick_command: 'opl family-runtime scheduler tick --provider temporal',
      },
      semantic_loop: {
        owner: 'stage_transition_authority_and_domain_owner',
        purpose: 'derive next current_owner_delta from owner answer, typed blocker, human gate, route-back evidence, or provider hard gate',
        default_read_root: 'current_owner_delta',
        progress_reconciler_role: 'desired_current_reconciliation_only',
        can_generate_domain_owner_answer: false,
      },
    },
    desired_current_reconciliation: {
      reconciler_id: 'runway_progress_reconciler',
      desired_state_ref: 'current_owner_delta',
      current_state_refs: [
        'typed_family_queue',
        'temporal_workflow_visibility',
        'stage_attempt_ledger',
        'provider_worker_lifecycle',
        'scheduler_cadence',
      ],
      allowed_next_actions: [
        'admit',
        'resume',
        'retry',
        'hold',
        'repair_provider_liveness',
        'escalate_typed_blocker',
        'wait_for_owner_answer',
        'no_safe_action',
      ],
      forbidden_next_actions: [
        'write_domain_truth',
        'sign_owner_receipt',
        'create_domain_typed_blocker',
        'authorize_quality_verdict',
        'claim_domain_ready',
      ],
    },
    provider_runtime: {
      substrate: 'temporal',
      selected_provider: providerRuntime.selectedProvider,
      selected_ready: selected.ready,
      selected_status: selected.status,
      degraded_reason: selected.degraded_reason,
      runtime_dependency: selected.details.runtime_dependency ?? null,
    },
    worker_supervisor_liveness: {
      substrate: 'temporal_worker_supervisor',
      role: 'process_liveness_restart_and_host_health_only',
      status_command: 'opl family-runtime provider-worker supervisor status --provider temporal',
      worker_status_command: 'opl family-runtime worker status --provider temporal',
      provider_completion_is_semantic_progress: false,
    },
    scheduler_cadence: {
      substrate: 'temporal_scheduler',
      status: scheduler.status,
      schedule_id: schedulerAction && typeof schedulerAction.schedule_id === 'string'
        ? schedulerAction.schedule_id
        : null,
      health: schedulerRecord.health ?? null,
      repair_action: schedulerRecord.repair_action ?? null,
    },
    semantic_loop: {
      progress_reconciler_id: 'runway_progress_reconciler',
      role: 'semantic_execution_loop_desired_current_reconciliation_and_next_owner_projection',
      default_read_root: 'current_owner_delta',
      provider_completion_is_semantic_progress: false,
      can_generate_domain_owner_answer: false,
    },
    queue,
    stage_attempts: attempts,
    handoff_gate: {
      accepted_owner_answer_refs: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'route_back_evidence_ref',
      ],
      handoff_policy: 'refs_only_owner_answer_or_typed_blocker_required',
      provider_completion_is_owner_answer: false,
    },
    recovery_repair: {
      repair_policy: 'classify_before_repair',
      repair_classes: [
        'worker_not_ready',
        'worker_source_stale',
        'scheduler_not_installed',
        'workflow_stale',
        'queue_missing_current_owner_delta',
        'receipt_invalid',
        'domain_owner_blocked',
      ],
      default_repair_command: status === 'blocked_provider_not_ready'
        ? 'opl family-runtime repair --provider temporal'
        : null,
    },
    authority_boundary: FALSE_AUTHORITY_BOUNDARY,
  };
}
