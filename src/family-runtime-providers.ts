import { DEFAULT_TEMPORAL_TASK_QUEUE, resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
} from './family-runtime-temporal-readiness.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import { FrameworkContractError } from './contracts.ts';
import {
  FAMILY_RUNTIME_PROVIDER_KINDS,
  type FamilyRuntimeProviderKind,
} from './family-runtime-types.ts';

export {
  FAMILY_RUNTIME_PROVIDER_KINDS,
  type FamilyRuntimeProviderKind,
} from './family-runtime-types.ts';

export type FamilyRuntimeProviderInspection = {
  provider_kind: FamilyRuntimeProviderKind;
  status: 'ready' | 'attention_needed' | 'provider_code_landed_unconfigured';
  ready: boolean;
  degraded_reason: string | null;
  capabilities: string[];
  details: Record<string, unknown>;
};

type ManagedProviderProjection = {
  managed_temporal_state_consistency?: Record<string, unknown> | null;
} | null;

type ProviderLifecycleOptions = {
  managedProviderProjection?: ManagedProviderProjection;
};

function providerMetadata(kind: FamilyRuntimeProviderKind) {
  if (kind === 'local_sqlite') {
    return {
      provider_kind: kind,
      provider_role: 'development_and_offline_provider',
      deep_inspection: 'selected_provider_only',
    };
  }
  if (kind === 'temporal') {
    return {
      provider_kind: kind,
      provider_role: 'production_required_substrate',
      deep_inspection: 'selected_provider_only',
    };
  }
  return {
    provider_kind: kind,
    provider_role: 'development_and_offline_provider',
    deep_inspection: 'selected_provider_only',
  };
}

function temporalAddress() {
  return process.env.OPL_TEMPORAL_ADDRESS?.trim() || process.env.TEMPORAL_ADDRESS?.trim() || null;
}

function temporalWorkerConfigured() {
  return process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildManagedTemporalWorkerReadiness(projection: Record<string, unknown>) {
  const address = optionalString(projection.address);
  const namespace = optionalString(projection.namespace) ?? resolveTemporalNamespace();
  const taskQueue = optionalString(projection.task_queue) ?? resolveTemporalTaskQueue();
  return {
    ...buildTemporalWorkerReadiness({
      address,
      addressSource: 'mas_managed_temporal_state_consistency_projection',
      namespace,
      taskQueue,
      workerEnabled: '1',
      workerStatus: 'ready',
      serverReachable: true,
    }),
    surface_kind: 'temporal_worker_lifecycle_status',
    lifecycle_status: 'ready',
    authority_boundary: {
      opl: 'managed_temporal_state_projection_consumer_only',
      domain: 'truth_quality_artifact_gate_owner',
      paper_closure_authority: 'mas_only',
    },
  };
}

export function isFamilyRuntimeProviderKind(value: string | undefined): value is FamilyRuntimeProviderKind {
  return FAMILY_RUNTIME_PROVIDER_KINDS.includes(value as FamilyRuntimeProviderKind);
}

export function resolveFamilyRuntimeProviderKind(
  requested?: FamilyRuntimeProviderKind,
): FamilyRuntimeProviderKind {
  if (requested) {
    return requested;
  }
  const configured = process.env.OPL_FAMILY_RUNTIME_PROVIDER?.trim();
  if (!configured) {
    return 'local_sqlite';
  }
  if (isFamilyRuntimeProviderKind(configured)) {
    return configured;
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

export function inspectFamilyRuntimeProvider(kind: FamilyRuntimeProviderKind): FamilyRuntimeProviderInspection {
  if (kind === 'local_sqlite') {
    return {
      provider_kind: kind,
      status: 'ready',
      ready: true,
      degraded_reason: null,
      capabilities: [
        'typed_family_queue',
        'local_stage_attempt_ledger',
        'local_inbox_notification_copy',
        'events_export',
      ],
      details: {
        durable_online_wakeup: false,
        external_runtime_required: false,
      },
    };
  }

  if (kind === 'temporal') {
    const address = temporalAddress();
    const workerReady = Boolean(address) && temporalWorkerConfigured();
    const workerReadiness = buildTemporalWorkerReadiness();
    const degradedReason = workerReadiness.blockers[0] ?? null;
    return {
      provider_kind: kind,
      status: workerReady ? 'ready' : 'provider_code_landed_unconfigured',
      ready: workerReady,
      degraded_reason: degradedReason,
      capabilities: [
        'stage_attempt_workflow_provider_code',
        'codex_activity_provider_code',
        'human_gate_signal_provider_code',
        'query_projection_provider_code',
        'workflow_history_provider_code',
        'worker_lifecycle_contract',
      ],
      details: {
        address,
        namespace: resolveTemporalNamespace(),
        task_queue: resolveTemporalTaskQueue(),
        worker_ready: workerReady,
        worker_readiness: workerReadiness,
        worker_lifecycle: {
          worker_required: true,
          task_queue: resolveTemporalTaskQueue(),
          default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
          lifecycle_owner: 'configured_family_runtime_provider',
          opl_helper: 'runTemporalStageAttemptWorkerUntil',
        },
        adapter_mode: workerReady ? 'configured_external_provider' : 'provider_code_landed_unconfigured',
        required_env: ['OPL_TEMPORAL_ADDRESS', 'OPL_TEMPORAL_WORKER_ENABLED=1|OPL_TEMPORAL_WORKER_STATUS=ready'],
        runtime_dependency: 'temporal_server_and_worker_required_for_live_workflows',
      },
    };
  }

  return {
    provider_kind: kind,
    status: 'ready',
    ready: true,
    degraded_reason: null,
    capabilities: [
      'typed_family_queue',
      'local_stage_attempt_ledger',
      'local_inbox_notification_copy',
      'events_export',
    ],
    details: {
      durable_online_wakeup: false,
      external_runtime_required: false,
    },
  };
}

export async function inspectFamilyRuntimeProviderWithLifecycle(
  kind: FamilyRuntimeProviderKind,
  paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>,
  options: ProviderLifecycleOptions = {},
): Promise<FamilyRuntimeProviderInspection> {
  if (kind !== 'temporal') {
    return inspectFamilyRuntimeProvider(kind);
  }
  const { inspectTemporalWorkerLifecycle } = await import('./family-runtime-temporal-provider.ts');
  const workerReadiness = await inspectTemporalWorkerLifecycle(paths);
  const managedProviderProjection = workerReadiness.worker_ready === true
    ? null
    : options.managedProviderProjection ?? null;
  const managedTemporalProjection = managedProviderProjection?.managed_temporal_state_consistency ?? null;
  const effectiveWorkerReadiness = managedTemporalProjection
    ? buildManagedTemporalWorkerReadiness(managedTemporalProjection)
    : workerReadiness;
  const workerReady = effectiveWorkerReadiness.worker_ready === true;
  const degradedReason = workerReadiness.blockers[0] ?? null;
  return {
    provider_kind: kind,
    status: workerReady ? 'ready' : 'provider_code_landed_unconfigured',
    ready: workerReady,
    degraded_reason: workerReady ? null : degradedReason,
    capabilities: [
      'stage_attempt_workflow_provider_code',
      'codex_activity_provider_code',
      'human_gate_signal_provider_code',
      'query_projection_provider_code',
      'workflow_history_provider_code',
      'worker_lifecycle_contract',
      ...(managedTemporalProjection ? ['mas_managed_temporal_state_consistency_projection'] : []),
    ],
    details: {
      address: effectiveWorkerReadiness.address,
      address_source: effectiveWorkerReadiness.address_source,
      namespace: effectiveWorkerReadiness.namespace,
      task_queue: effectiveWorkerReadiness.task_queue,
      worker_ready: workerReady,
      worker_readiness: effectiveWorkerReadiness,
      managed_temporal_state_consistency: managedTemporalProjection,
      mas_managed_provider_projection: managedProviderProjection,
      worker_lifecycle: {
        worker_required: true,
        task_queue: effectiveWorkerReadiness.task_queue,
        default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
        lifecycle: buildTemporalWorkerLifecycleContract(),
        lifecycle_owner: managedTemporalProjection
          ? 'domain_owned_managed_temporal_projection'
          : 'configured_family_runtime_provider',
        opl_helper: 'runTemporalStageAttemptWorkerUntil',
      },
      adapter_mode: workerReady
        ? managedTemporalProjection
          ? 'mas_managed_temporal_projection_ready'
          : 'managed_temporal_provider_ready'
        : 'provider_code_landed_unconfigured',
      required_env: ['OPL_TEMPORAL_ADDRESS or managed local service state', 'managed Temporal worker state or OPL_TEMPORAL_WORKER_STATUS=ready'],
      runtime_dependency: 'temporal_server_and_worker_required_for_live_workflows',
    },
  };
}

export function inspectFamilyRuntimeProviders(selected: FamilyRuntimeProviderKind) {
  return {
    selected_provider: selected,
    allowed_providers: [...FAMILY_RUNTIME_PROVIDER_KINDS],
    default_resolution: {
      env: 'OPL_FAMILY_RUNTIME_PROVIDER',
      fallback: 'local_sqlite',
    },
    providers: {
      [selected]: inspectFamilyRuntimeProvider(selected),
    } as Partial<Record<FamilyRuntimeProviderKind, FamilyRuntimeProviderInspection>>,
    provider_catalog: Object.fromEntries(
      FAMILY_RUNTIME_PROVIDER_KINDS.map((providerKind) => [providerKind, providerMetadata(providerKind)]),
    ),
  };
}

export async function inspectFamilyRuntimeProvidersWithLifecycle(
  selected: FamilyRuntimeProviderKind,
  paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>,
  options: ProviderLifecycleOptions = {},
) {
  return {
    selected_provider: selected,
    allowed_providers: [...FAMILY_RUNTIME_PROVIDER_KINDS],
    default_resolution: {
      env: 'OPL_FAMILY_RUNTIME_PROVIDER',
      fallback: 'local_sqlite',
    },
    providers: {
      [selected]: await inspectFamilyRuntimeProviderWithLifecycle(selected, paths, options),
    } as Partial<Record<FamilyRuntimeProviderKind, FamilyRuntimeProviderInspection>>,
    provider_catalog: Object.fromEntries(
      FAMILY_RUNTIME_PROVIDER_KINDS.map((providerKind) => [providerKind, providerMetadata(providerKind)]),
    ),
  };
}

export function ensureFamilyRuntimeProvider(kind: FamilyRuntimeProviderKind, mode: 'install' | 'repair') {
  if (kind === 'temporal') {
    const inspection = inspectFamilyRuntimeProvider(kind);
    return {
      surface_id: 'opl_family_runtime_provider',
      provider_kind: kind,
      mode,
      status: inspection.ready ? 'ready' : 'attention_needed',
      actions: [],
      provider: inspection,
      repair_guidance: inspection.ready
        ? []
        : [
            'Configure OPL_TEMPORAL_ADDRESS and run a Temporal worker that implements the OPL stage attempt contract.',
          ],
    };
  }
  return {
    surface_id: 'opl_family_runtime_provider',
    provider_kind: kind,
    mode,
    status: 'ready',
    actions: [],
    provider: inspectFamilyRuntimeProvider(kind),
  };
}

export function buildStageAttemptProviderReceipt(input: {
  providerKind: FamilyRuntimeProviderKind;
  stageAttemptId: string;
  workflowId: string;
}) {
  const provider = inspectFamilyRuntimeProvider(input.providerKind);
  return {
    provider_kind: input.providerKind,
    workflow_id: input.workflowId,
    stage_attempt_id: input.stageAttemptId,
    receipt_status:
      input.providerKind === 'temporal' && !provider.ready
        ? 'provider_code_landed_unconfigured'
        : 'materialized',
    provider_ready: provider.ready,
    provider_status: provider.status,
    degraded_reason: provider.degraded_reason,
    authority_boundary: {
      opl: 'attempt_control_metadata_and_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      executor: 'codex_cli_or_domain_selected_executor',
    },
  };
}
