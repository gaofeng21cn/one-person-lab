import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  buildTemporalProviderLivenessBlocker,
  isTemporalWorkerLivenessBlocker,
} from './family-runtime-provider-liveness-blocker.ts';
import {
  ensureTemporalSchedulerCadence,
  inspectTemporalSchedulerCadence,
  removeTemporalSchedulerCadence,
  triggerTemporalSchedulerCadence,
} from './family-runtime-temporal-provider-parts/scheduler-cadence.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import {
  FAMILY_RUNTIME_PROVIDER_KINDS,
  runtimeDomainDaemonReplacementSurfaces,
  type FamilyRuntimeProviderKind,
} from './family-runtime-types.ts';
import type { FamilyRuntimeDomainProfiles, FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { readManagedProviderProjectionSummary } from './family-runtime-managed-provider-projection.ts';
import {
  familyRuntimePaths,
  insertEvent,
} from './family-runtime-store.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;

type InspectFamilyRuntimeProvidersWithLifecycle =
  typeof import('./family-runtime-providers.ts').inspectFamilyRuntimeProvidersWithLifecycle;
type ProviderInspection = Awaited<ReturnType<InspectFamilyRuntimeProvidersWithLifecycle>>;
type ProviderSloTick = Awaited<ReturnType<typeof runTemporalProviderSloTick>>;
type ProviderCadenceReadbackDeps = {
  inspectProvidersWithLifecycle?: InspectFamilyRuntimeProvidersWithLifecycle;
  runProviderSloTick?: typeof runTemporalProviderSloTick;
};
type SchedulerCadenceCommandDeps = {
  inspectProvidersWithLifecycle?: InspectFamilyRuntimeProvidersWithLifecycle;
  inspectSchedulerCadence?: typeof inspectTemporalSchedulerCadence;
};

function resolveSchedulerFamilyRuntimeProviderKind(
  requested?: FamilyRuntimeProviderKind,
): FamilyRuntimeProviderKind {
  if (requested) {
    return requested;
  }
  const configured = process.env.OPL_FAMILY_RUNTIME_PROVIDER?.trim();
  if (!configured) {
    return 'temporal';
  }
  if (FAMILY_RUNTIME_PROVIDER_KINDS.includes(configured as FamilyRuntimeProviderKind)) {
    return configured as FamilyRuntimeProviderKind;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Unsupported family runtime provider kind.',
    {
      provider_kind: configured,
      allowed_provider_kinds: [...FAMILY_RUNTIME_PROVIDER_KINDS],
      env_var: 'OPL_FAMILY_RUNTIME_PROVIDER',
    },
  );
}

async function inspectProvidersWithLifecycleDefault(
  ...args: Parameters<InspectFamilyRuntimeProvidersWithLifecycle>
): ReturnType<InspectFamilyRuntimeProvidersWithLifecycle> {
  const { inspectFamilyRuntimeProvidersWithLifecycle } = await import('./family-runtime-providers.ts');
  return inspectFamilyRuntimeProvidersWithLifecycle(...args);
}

function buildProviderReadinessAfterSlo(providerKind: FamilyRuntimeProviderKind, selected: ProviderInspection['providers']['temporal']) {
  const workerReadiness = selected?.details && 'worker_readiness' in selected.details
    ? selected.details.worker_readiness as Record<string, unknown>
    : null;
  return {
    surface_kind: 'opl_provider_readiness_after_slo',
    provider_kind: providerKind,
    ready: selected?.ready ?? false,
    status: selected?.status ?? null,
    degraded_reason: selected?.degraded_reason ?? null,
    worker_lifecycle_status: workerReadiness?.lifecycle_status ?? null,
    worker_readiness_status: workerReadiness?.readiness_status ?? null,
    worker_ready: workerReadiness?.worker_ready ?? null,
    blockers: workerReadiness?.blockers ?? [],
    repair_action: workerReadiness?.repair_action ?? null,
    authority_boundary: {
      opl: 'provider_readiness_projection_after_slo_repair',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
    },
  };
}

function buildRetiredQueueProjectionBridge(input: {
  limit: number;
  providerReady: boolean;
  blockedReason?: string;
}) {
  return {
    surface_kind: 'opl_provider_cadence_projection_bridge',
    bridge_id: 'provider_cadence_projection_bridge.v1',
    provider_ready_after_slo: input.providerReady,
    bridge_status: input.blockedReason ? 'blocked_provider_not_ready' : 'retired_local_queue_runtime',
    blocked_reason: input.blockedReason ?? null,
    trigger: 'temporal_provider_cadence_readback',
    hydrated_pending_family_task_projection_count: 0,
    hydration_idempotent_noop_projection_count: 0,
    hydration_filtered_projection_count: 0,
    selected_task_projection_count: 0,
    dispatch_projection_count: 0,
    scheduler_limit: input.limit,
    operator_audit_counts_only: true,
    durable_lifecycle_truth: false,
    local_queue_runtime_retired: true,
    can_authorize_lifecycle_progress: false,
    authority_boundary: {
      opl: 'temporal_provider_cadence_readback_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_execute_domain_action_without_queue_claim: false,
      can_authorize_lifecycle_progress: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
    },
  };
}

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider-parts/attempt-control.ts');
}

function deferredProviderSloTick(input: {
  reason: string;
  force: boolean;
}) {
  const repairReceipt = {
    surface_kind: 'opl_temporal_provider_slo_repair_receipt',
    provider_kind: 'temporal',
    trigger: input.force ? 'forced' : input.reason,
    repair_status: 'skipped',
    cadence_owner: 'provider_backed_family_runtime',
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    command: 'opl family-runtime residency proof --provider temporal --production',
    blocker_ids: [],
    next_repair_command: null,
    can_execute_domain_repair: false,
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
      can_execute_domain_repair: false,
    },
  };
  const receipt = {
    surface_kind: 'opl_temporal_provider_slo_execution_receipt',
    provider_kind: 'temporal',
    command: 'opl family-runtime residency proof --provider temporal --production',
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    supervised_cadence_receipt: true,
    execution_status: 'skipped',
    receipt_status: 'skipped',
    receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
    skip_reason: input.reason,
    repair_receipt: repairReceipt,
    proves_only: 'temporal_service_worker_residency_cadence_execution',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
  return {
    surface_id: 'opl_family_runtime_provider_slo_tick',
    provider_kind: 'temporal',
    execution_status: 'skipped',
    skipped: true,
    force: input.force,
    provider_worker_repair_receipt: {
      repair_status: 'skipped',
      repair_action_id: 'none',
    },
    before: null,
    after: null,
    provider_slo_execution_receipt: receipt,
    event_id: null,
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  } as unknown as ProviderSloTick;
}

function providerSloSkipReason(providerSlo: ProviderSloTick) {
  const receipt = providerSlo.provider_slo_execution_receipt as Record<string, unknown>;
  return typeof receipt.skip_reason === 'string' ? receipt.skip_reason : null;
}

export async function runTemporalSchedulerCadenceCommand(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  input: {
    mode: 'scheduler_status' | 'scheduler_install' | 'scheduler_remove' | 'scheduler_trigger';
    providerKind?: FamilyRuntimeProviderKind;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  },
  deps: SchedulerCadenceCommandDeps = {},
) {
  const providerKind = resolveSchedulerFamilyRuntimeProviderKind(input.providerKind);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime scheduler cadence supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }
  const inspectProvidersWithLifecycle = deps.inspectProvidersWithLifecycle ?? inspectProvidersWithLifecycleDefault;
  const provider = await inspectProvidersWithLifecycle(providerKind, paths, {
    managedProviderProjection: readManagedProviderProjectionSummary(),
  });
  const selected = provider.providers.temporal;
  if (!selected?.ready) {
    const blocker = selected
      ? buildTemporalProviderLivenessBlocker(selected)
      : {
          blocker_kind: 'platform_dependency',
          blocker_id: 'temporal_provider_not_ready',
          next_repair_command:
            'opl family-runtime service start --provider temporal && opl family-runtime worker start --provider temporal',
          liveness_blocker_first: false,
        };
    return {
      surface_kind: 'opl_family_runtime_scheduler_cadence',
      provider_kind: providerKind,
      cadence_owner: 'provider_backed_family_runtime',
      scheduler_owner: 'opl_provider_runtime_manager',
      command: input.mode,
      status: 'blocked_provider_not_ready',
      provider_runtime: provider,
      blocker,
      authority_boundary: {
        can_install_domain_daemon: false,
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
      },
    };
  }
  const action = input.mode === 'scheduler_install'
    ? await ensureTemporalSchedulerCadence(paths, { domainProfiles: input.domainProfiles })
    : input.mode === 'scheduler_remove'
      ? await removeTemporalSchedulerCadence(paths)
      : input.mode === 'scheduler_trigger'
        ? await triggerTemporalSchedulerCadence(paths)
        : await (deps.inspectSchedulerCadence ?? inspectTemporalSchedulerCadence)(paths);
  const health = input.mode === 'scheduler_status' && 'health' in action
    ? action.health as Record<string, unknown>
    : null;
  const status = health?.health_status === 'attention_required'
    ? 'attention_required'
    : 'ok';
  insertEvent(db, {
    eventType: `temporal_scheduler_${input.mode.replace('scheduler_', '')}`,
    source: 'opl-cli',
    payload: action,
  });
  return {
    surface_kind: 'opl_family_runtime_scheduler_cadence',
    provider_kind: providerKind,
    cadence_owner: 'provider_backed_family_runtime',
    scheduler_owner: 'opl_provider_runtime_manager',
    command: input.mode,
    status,
    action,
    ...(health ? {
      health,
      repair_action: health.repair_action ?? null,
    } : {}),
    provider_runtime: provider,
    replaces_domain_daemon_surface: runtimeDomainDaemonReplacementSurfaces(),
    authority_boundary: {
      can_install_domain_daemon: false,
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
    },
  };
}

export async function runTemporalProviderCadenceReadback(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  input: {
    providerKind?: FamilyRuntimeProviderKind;
    force?: boolean;
    limit?: number;
    hydrate?: boolean;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: import('./family-runtime-command.ts').FamilyRuntimeDomainProfiles;
  },
  deps: ProviderCadenceReadbackDeps = {},
) {
  const providerKind = resolveSchedulerFamilyRuntimeProviderKind(input.providerKind);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'temporal provider cadence readback supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }
  const source = 'opl-temporal-provider-cadence';
  const inspectProvidersWithLifecycle = deps.inspectProvidersWithLifecycle ?? inspectProvidersWithLifecycleDefault;
  const runProviderSloTick = deps.runProviderSloTick ?? runTemporalProviderSloTick;
  const providerBeforeSlo = await inspectProvidersWithLifecycle(providerKind, paths, {
    managedProviderProjection: readManagedProviderProjectionSummary(),
  });
  const selectedBeforeSlo = providerBeforeSlo.providers.temporal;
  const blockerBeforeSlo = selectedBeforeSlo ? buildTemporalProviderLivenessBlocker(selectedBeforeSlo) : null;
  let providerSlo: ProviderSloTick | null = null;
  let provider: ProviderInspection = providerBeforeSlo;
  let selected = selectedBeforeSlo;
  let blocker = blockerBeforeSlo;
  if (selectedBeforeSlo?.ready) {
    providerSlo = deferredProviderSloTick({
      reason: 'deferred_owner_delta_first',
      force: input.force ?? false,
    });
  } else {
    providerSlo = await runProviderSloTick(db, paths, {
      force: input.force ?? false,
    });
    provider = await inspectProvidersWithLifecycle(providerKind, paths, {
      managedProviderProjection: readManagedProviderProjectionSummary(),
      detail: 'fast',
    });
    selected = provider.providers.temporal;
    blocker = selected ? buildTemporalProviderLivenessBlocker(selected) : null;
  }
  if (!selected?.ready && blocker) {
    const queueProjectionBridge = buildRetiredQueueProjectionBridge({
      limit: input.limit ?? 10,
      providerReady: false,
      blockedReason: blocker.blocker_id,
    });
    return {
      surface_kind: 'opl_temporal_provider_cadence_readback',
      scheduler_owner: 'opl_provider_runtime_manager',
      cadence_owner: 'provider_backed_family_runtime',
      provider_kind: providerKind,
      cadence_source: source,
      status: 'blocked_provider_not_ready',
      provider_liveness_blocker: isTemporalWorkerLivenessBlocker(blocker) ? blocker : null,
      provider_blocker: blocker,
      provider_runtime: provider,
      provider_runtime_after_slo: provider,
      provider_readiness_after_slo: buildProviderReadinessAfterSlo(providerKind, selected),
      provider_slo: providerSlo,
      task_scope: input.taskScope ?? null,
      queue_projection_bridge: queueProjectionBridge,
      retired_queue_tick: null,
      authority_boundary: {
        opl: 'temporal_provider_cadence_readback_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_install_domain_daemon: false,
        can_write_domain_truth: false,
        can_write_domain_memory_body: false,
        can_authorize_lifecycle_progress: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        provider_completion_is_domain_ready: false,
      },
    };
  }
  const queueProjectionBridge = buildRetiredQueueProjectionBridge({
    limit: input.limit ?? 10,
    providerReady: selected?.ready ?? false,
  });
  insertEvent(db, {
    eventType: 'opl_temporal_provider_cadence_readback_completed',
    source,
    payload: {
      provider_kind: providerKind,
      force: input.force ?? false,
      hydrate: input.hydrate ?? true,
      limit: input.limit ?? 10,
      task_scope: input.taskScope ?? null,
      domain_profiles: input.domainProfiles ?? null,
      provider_slo_receipt_status: providerSlo.provider_slo_execution_receipt.receipt_status,
      provider_slo_skip_reason: providerSloSkipReason(providerSlo),
      queue_projection_bridge: queueProjectionBridge,
    },
  });
  return {
    surface_kind: 'opl_temporal_provider_cadence_readback',
    scheduler_owner: 'opl_provider_runtime_manager',
    cadence_owner: 'provider_backed_family_runtime',
    provider_kind: providerKind,
    cadence_source: source,
    provider_runtime_after_slo: provider,
    provider_readiness_after_slo: buildProviderReadinessAfterSlo(providerKind, selected),
    provider_slo: providerSlo,
    queue_projection_bridge: queueProjectionBridge,
    task_scope: input.taskScope ?? null,
    retired_queue_tick: null,
    authority_boundary: {
      opl: 'temporal_provider_cadence_readback_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_install_domain_daemon: false,
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_lifecycle_progress: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}
