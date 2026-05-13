import { ensureHermesBridge, inspectHermesBridge } from './family-runtime-hermes-bridge.ts';
import { DEFAULT_TEMPORAL_TASK_QUEUE, resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import { buildTemporalWorkerReadiness, inspectTemporalWorkerLifecycle } from './family-runtime-temporal-provider.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

export const FAMILY_RUNTIME_PROVIDER_KINDS = ['local_sqlite', 'hermes_legacy', 'temporal'] as const;

export type FamilyRuntimeProviderKind = typeof FAMILY_RUNTIME_PROVIDER_KINDS[number];

export type FamilyRuntimeProviderInspection = {
  provider_kind: FamilyRuntimeProviderKind;
  status: 'ready' | 'attention_needed' | 'provider_code_landed_unconfigured';
  ready: boolean;
  degraded_reason: string | null;
  capabilities: string[];
  details: Record<string, unknown>;
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
    provider_role: 'legacy_optional_provider',
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
  if (isFamilyRuntimeProviderKind(configured)) {
    return configured;
  }
  return 'local_sqlite';
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

  const bridge = inspectHermesBridge();
  const ready =
    bridge.disabled === false
    && bridge.gateway_ready
    && bridge.cron_registered
    && bridge.webhook_registered;
  return {
    provider_kind: kind,
    status: ready ? 'ready' : 'attention_needed',
    ready,
    degraded_reason: ready
      ? null
      : bridge.disabled
        ? 'hermes_legacy_disabled_for_development_or_offline_diagnostics'
        : 'hermes_legacy_gateway_cron_or_webhook_not_ready',
    capabilities: [
      'legacy_gateway_residency',
      'legacy_cron_wakeup',
      'legacy_webhook_intake',
      'delivery_transport',
      'approval_transport',
    ],
    details: {
      bridge,
    },
  };
}

export async function inspectFamilyRuntimeProviderWithLifecycle(
  kind: FamilyRuntimeProviderKind,
  paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>,
): Promise<FamilyRuntimeProviderInspection> {
  if (kind !== 'temporal') {
    return inspectFamilyRuntimeProvider(kind);
  }
  const workerReadiness = await inspectTemporalWorkerLifecycle(paths);
  const workerReady = workerReadiness.worker_ready === true;
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
    ],
    details: {
      address: workerReadiness.address,
      address_source: workerReadiness.address_source,
      namespace: workerReadiness.namespace,
      task_queue: workerReadiness.task_queue,
      worker_ready: workerReady,
      worker_readiness: workerReadiness,
      worker_lifecycle: {
        worker_required: true,
        task_queue: workerReadiness.task_queue,
        default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
        lifecycle_owner: 'configured_family_runtime_provider',
        opl_helper: 'runTemporalStageAttemptWorkerUntil',
      },
      adapter_mode: workerReady ? 'managed_temporal_provider_ready' : 'provider_code_landed_unconfigured',
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
      offline_env: 'OPL_DISABLE_HERMES_ONLINE=1 only affects explicitly selected hermes_legacy provider readiness',
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
) {
  return {
    selected_provider: selected,
    allowed_providers: [...FAMILY_RUNTIME_PROVIDER_KINDS],
    default_resolution: {
      env: 'OPL_FAMILY_RUNTIME_PROVIDER',
      offline_env: 'OPL_DISABLE_HERMES_ONLINE=1 only affects explicitly selected hermes_legacy provider readiness',
      fallback: 'local_sqlite',
    },
    providers: {
      [selected]: await inspectFamilyRuntimeProviderWithLifecycle(selected, paths),
    } as Partial<Record<FamilyRuntimeProviderKind, FamilyRuntimeProviderInspection>>,
    provider_catalog: Object.fromEntries(
      FAMILY_RUNTIME_PROVIDER_KINDS.map((providerKind) => [providerKind, providerMetadata(providerKind)]),
    ),
  };
}

export function ensureFamilyRuntimeProvider(kind: FamilyRuntimeProviderKind, mode: 'install' | 'repair') {
  if (kind === 'hermes_legacy') {
    return {
      surface_id: 'opl_family_runtime_provider',
      provider_kind: kind,
      ...ensureHermesBridge(mode),
    };
  }
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
