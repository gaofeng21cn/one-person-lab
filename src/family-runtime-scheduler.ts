import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  inspectFamilyRuntimeProvidersWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { runTemporalProviderSloTick } from './family-runtime-provider-slo-executor.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import {
  familyRuntimePaths,
  insertEvent,
} from './family-runtime-store.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;

type SchedulerQueueTickResult = {
  selected_count: number;
  dispatches: unknown[];
  [key: string]: unknown;
};

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

export async function runTemporalSchedulerCadenceCommand(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  input: {
    mode: 'scheduler_status' | 'scheduler_install' | 'scheduler_remove' | 'scheduler_trigger';
    providerKind?: FamilyRuntimeProviderKind;
  },
) {
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime scheduler cadence supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }
  const provider = await inspectFamilyRuntimeProvidersWithLifecycle(providerKind, paths, {
    managedProviderProjection: readMasManagedProviderProjection(),
  });
  const selected = provider.providers.temporal;
  if (!selected?.ready) {
    return {
      surface_kind: 'opl_family_runtime_scheduler_cadence',
      provider_kind: providerKind,
      cadence_owner: 'provider_backed_family_runtime',
      scheduler_owner: 'opl_provider_runtime_manager',
      command: input.mode,
      status: 'blocked_provider_not_ready',
      provider_runtime: provider,
      blocker: {
        blocker_kind: 'platform_dependency',
        blocker_id: selected?.degraded_reason ?? 'temporal_provider_not_ready',
        next_repair_command: 'opl family-runtime service start --provider temporal && opl family-runtime worker start --provider temporal',
      },
      authority_boundary: {
        can_install_domain_daemon: false,
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
      },
    };
  }
  const temporal = await temporalProviderModule();
  const action = input.mode === 'scheduler_install'
    ? await temporal.ensureTemporalSchedulerCadence(paths)
    : input.mode === 'scheduler_remove'
      ? await temporal.removeTemporalSchedulerCadence(paths)
      : input.mode === 'scheduler_trigger'
        ? await temporal.triggerTemporalSchedulerCadence(paths)
        : await temporal.inspectTemporalSchedulerCadence(paths);
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
    replaces_domain_daemon_surface: {
      medautoscience: 'local LaunchAgent / supervision tick is cleanup-only legacy residue',
      medautogrant: 'repo-local runtime journal cadence is not a production scheduler',
      redcube: 'repo-local sidecar/session supervision is handler diagnostic only',
    },
    authority_boundary: {
      can_install_domain_daemon: false,
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
    },
  };
}

export async function runSchedulerTick(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  input: {
    providerKind?: FamilyRuntimeProviderKind;
    force?: boolean;
    limit?: number;
    hydrate?: boolean;
    taskScope?: FamilyRuntimeTaskScope;
  },
  runQueueTick: (
    source: string,
    limit: number,
    hydrate: boolean,
    taskScope?: FamilyRuntimeTaskScope,
  ) => SchedulerQueueTickResult,
) {
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime scheduler tick currently supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }
  const source = 'opl-provider-scheduler';
  const providerSlo = await runTemporalProviderSloTick(db, paths, {
    force: input.force ?? false,
  });
  const queueTick = runQueueTick(source, input.limit ?? 10, input.hydrate ?? true, input.taskScope);
  insertEvent(db, {
    eventType: 'opl_scheduler_tick_completed',
    source,
    payload: {
      provider_kind: providerKind,
      force: input.force ?? false,
      hydrate: input.hydrate ?? true,
      limit: input.limit ?? 10,
      task_scope: input.taskScope ?? null,
      provider_slo_receipt_status: providerSlo.provider_slo_execution_receipt.receipt_status,
      queue_selected_count: queueTick.selected_count,
      queue_dispatches_count: queueTick.dispatches.length,
    },
  });
  return {
    surface_kind: 'opl_family_runtime_scheduler_tick',
    scheduler_owner: 'opl_provider_runtime_manager',
    cadence_owner: 'provider_backed_family_runtime',
    provider_kind: providerKind,
    tick_source: source,
    provider_slo: providerSlo,
    task_scope: input.taskScope ?? null,
    queue_tick: queueTick,
    authority_boundary: {
      opl: 'scheduler_cadence_queue_and_provider_slo_owner',
      domain: 'truth_quality_artifact_gate_owner',
      can_install_domain_daemon: false,
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}
