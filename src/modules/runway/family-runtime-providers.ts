import { DEFAULT_TEMPORAL_TASK_QUEUE, resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import {
  buildTemporalVisibilityReadiness,
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
} from './family-runtime-temporal-readiness.ts';
import {
  buildTemporalStageAttemptVisibilityReadiness,
  inspectTemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';
import {
  inspectTemporalWorkerLifecycleWithDetail,
} from './family-runtime-temporal-worker-lifecycle.ts';
import type { ManagedProviderProjectionSummary } from './family-runtime-managed-provider-projection.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';
import {
  FAMILY_RUNTIME_PROVIDER_KINDS,
  type FamilyRuntimeProviderKind,
} from './family-runtime-types.ts';
import {
  repairTemporalWorkerForProviderRepair,
} from './family-runtime-provider-worker-repair.ts';
import {
  inspectTemporalSchedulerCadenceReadiness,
} from './family-runtime-temporal-provider-parts/scheduler-cadence.ts';
import {
  buildExternalSandboxProviderAdapterPlan,
  EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES,
  inspectExternalSandboxProviderAdapterEnv,
} from './external-sandbox-provider-adapter.ts';

export type FamilyRuntimeProviderInspection = {
  provider_kind: FamilyRuntimeProviderKind;
  status: 'ready' | 'attention_needed' | 'provider_code_landed_unconfigured';
  ready: boolean;
  degraded_reason: string | null;
  capabilities: string[];
  details: Record<string, unknown>;
};

type ManagedProviderProjection = Partial<Pick<
  ManagedProviderProjectionSummary,
  | 'managed_temporal_state_consistency'
  | 'managed_temporal_state_consistency_declared'
  | 'status'
  | 'domains'
  | 'conflicts'
  | 'summary'
>> | null;

type ProviderLifecycleOptions = {
  managedProviderProjection?: ManagedProviderProjection;
  detail?: 'fast' | 'full';
  includeScheduler?: boolean;
};

function providerMetadata(kind: FamilyRuntimeProviderKind) {
  if (kind === 'temporal') {
    return {
      provider_kind: kind,
      provider_role: 'production_required_substrate',
      deep_inspection: 'selected_provider_only',
      production_online_readiness_provider: true,
      fail_closed_when_unready: true,
    };
  }
  if (kind === 'external_sandbox') {
    return {
      provider_kind: kind,
      provider_role: 'agent_sandbox_execution_substrate',
      substrate_boundary: 'external_agent_sandbox_not_temporal_durable_workflow_substrate',
      implemented_external_substrates: [...EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES],
      deep_inspection: 'selected_provider_only',
      production_online_readiness_provider: false,
      fail_closed_when_unconfigured: true,
      credential_material_read: false,
    };
  }
  return {
    provider_kind: kind,
    provider_role: 'unsupported_provider',
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

function buildManagedTemporalWorkerReadiness(projection: Record<string, unknown>) {
  const address = stringValue(projection.address);
  const namespace = stringValue(projection.namespace) ?? resolveTemporalNamespace();
  const taskQueue = stringValue(projection.task_queue) ?? resolveTemporalTaskQueue();
  return {
    ...buildTemporalWorkerReadiness({
      address,
      addressSource: 'managed_domain_temporal_state_consistency_projection',
      namespace,
      taskQueue,
      workerEnabled: null,
      workerStatus: null,
      serverReachable: null,
    }),
    surface_kind: 'temporal_worker_lifecycle_status',
    lifecycle_status: 'domain_projection_only',
    projection_status: stringValue(projection.projection_status) ?? stringValue(projection.status) ?? 'ready',
    projection_declares_service_ready: projection.service_ready === true
      || stringValue(projection.service_status) === 'ready'
      || stringValue(projection.service_readiness) === 'ready',
    projection_declares_worker_ready: projection.worker_ready === true
      || projection.managed_worker_ready === true
      || stringValue(projection.worker_status) === 'ready'
      || stringValue(projection.worker_readiness) === 'ready',
    provider_ready_effect: 'none_projection_only_requires_opl_local_lifecycle_proof',
    authority_boundary: {
      opl: 'managed_temporal_state_projection_consumer_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_authorize_opl_provider_ready: false,
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
    return 'temporal';
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
        'stage_attempt_visibility_search_attributes',
      ],
      details: {
        address,
        namespace: resolveTemporalNamespace(),
        task_queue: resolveTemporalTaskQueue(),
        worker_ready: workerReady,
        worker_readiness: workerReadiness,
        temporal_visibility_readiness: buildTemporalStageAttemptVisibilityReadiness({
          address,
          namespace: resolveTemporalNamespace(),
          taskQueue: resolveTemporalTaskQueue(),
        }),
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

  if (kind === 'external_sandbox') {
    const config = inspectExternalSandboxProviderAdapterEnv();
    const adapter = buildExternalSandboxProviderAdapterPlan('family-runtime-provider');
    return {
      provider_kind: kind,
      status: 'attention_needed',
      ready: false,
      degraded_reason: config.configured
        ? 'external_sandbox_not_temporal_durable_workflow_substrate'
        : 'external_sandbox_adapter_unconfigured',
      capabilities: [
        'agent_sandbox_execution_substrate',
        'isolated_filesystem',
        'isolated_process',
        'git_checkout',
        'template_environment',
        'snapshot_restore',
        'sandbox_persistence',
      ],
      details: {
        substrate_boundary: 'external_agent_sandbox_not_temporal_durable_workflow_substrate',
        provider_role: 'agent_sandbox_execution_substrate',
        implemented_external_substrates: [...EXTERNAL_SANDBOX_IMPLEMENTED_SUBSTRATES],
        endpoint_configured: Boolean(config.endpoint),
        credential_ref_configured: Boolean(config.credentialRef),
        provider_receipt_ref_configured: Boolean(config.providerReceiptRef),
        adapter_configured: config.configured,
        selected_external_substrate: config.substrate,
        endpoint: config.endpoint,
        credential_ref: config.credentialRef,
        provider_receipt_ref: config.providerReceiptRef,
        missing_required_env: config.missingRequiredEnv,
        adapter_id: adapter.adapter_id,
        adapter_mode: adapter.adapter_status,
        adapter,
        readiness_dependency: 'explicit_endpoint_credential_ref_and_provider_receipt_ref_required',
        credential_material_read: false,
        external_api_called: false,
        temporal_durable_workflow_substrate_replacement: false,
        provider_ready_counts_as_online_runtime_ready: false,
        runtime_dependency: 'external_sandbox_adapter_for_agent_execution_environment_only',
        authority_boundary: {
          opl: 'external_sandbox_adapter_readback_only',
          can_call_external_provider_api: false,
          can_read_secret_material: false,
          can_replace_temporal_durable_workflow_substrate: false,
          can_claim_runtime_ready: false,
          can_claim_domain_ready: false,
        },
      },
    };
  }

  throw new FrameworkContractError('cli_usage_error', 'Unsupported family runtime provider kind.', {
    provider_kind: kind,
    allowed_provider_kinds: [...FAMILY_RUNTIME_PROVIDER_KINDS],
  });
}

export async function inspectFamilyRuntimeProviderWithLifecycle(
  kind: FamilyRuntimeProviderKind,
  paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>,
  options: ProviderLifecycleOptions = {},
): Promise<FamilyRuntimeProviderInspection> {
  if (kind !== 'temporal') {
    return inspectFamilyRuntimeProvider(kind);
  }
  const detail = options.detail ?? 'full';
  const workerReadiness = await inspectTemporalWorkerLifecycleWithDetail(paths, { detail });
  const managedProviderProjection = workerReadiness.worker_ready === true
    ? null
    : options.managedProviderProjection ?? null;
  const managedTemporalProjection = managedProviderProjection?.managed_temporal_state_consistency ?? null;
  const managedProjectionReadiness = managedTemporalProjection
    ? buildManagedTemporalWorkerReadiness(managedTemporalProjection)
    : null;
  const workerReady = workerReadiness.worker_ready === true;
  const scheduler = options.includeScheduler
    ? await inspectTemporalSchedulerCadenceReadiness(paths)
    : null;
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
      'stage_attempt_visibility_search_attributes',
      ...(managedTemporalProjection ? ['managed_domain_temporal_state_consistency_projection'] : []),
    ],
    details: {
      address: workerReadiness.address,
      address_source: workerReadiness.address_source,
      namespace: workerReadiness.namespace,
      task_queue: workerReadiness.task_queue,
      worker_ready: workerReady,
      worker_readiness: workerReadiness,
      inspection_detail: detail,
      temporal_visibility_readiness: detail === 'fast'
        ? workerReadiness.visibility_readiness ?? buildTemporalStageAttemptVisibilityReadiness({
            address: workerReadiness.address,
            addressSource: workerReadiness.address_source,
            namespace: workerReadiness.namespace,
            taskQueue: workerReadiness.task_queue,
          })
        : await inspectTemporalStageAttemptVisibilityReadiness(paths),
      managed_temporal_state_consistency: managedTemporalProjection,
      managed_temporal_projection_readiness: managedProjectionReadiness,
      managed_domain_projection_summary: managedProviderProjection
        ? {
            status: managedProviderProjection.status ?? 'available',
            domain_count: managedProviderProjection.summary?.domain_count ?? 0,
            conflict_count: managedProviderProjection.summary?.conflict_count ?? 0,
            managed_temporal_state_consistency_declared: Boolean(managedProviderProjection.managed_temporal_state_consistency_declared),
            managed_temporal_projection_authorizes_opl_provider_ready: false,
          }
        : null,
      managed_domain_provider_projection_summary: managedProviderProjection,
      ...(scheduler
        ? {
            scheduler,
            scheduler_status: scheduler.status,
          }
        : {}),
      worker_lifecycle: {
        worker_required: true,
        task_queue: workerReadiness.task_queue,
        default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
        lifecycle: buildTemporalWorkerLifecycleContract(),
        lifecycle_owner: 'configured_family_runtime_provider',
        domain_projection_role: managedTemporalProjection
          ? 'read_only_status_projection_not_provider_liveness_proof'
          : null,
        opl_helper: 'runTemporalStageAttemptWorkerUntil',
      },
      adapter_mode: workerReady
        ? 'managed_temporal_provider_ready'
        : 'provider_code_landed_unconfigured',
      required_env: ['OPL_TEMPORAL_ADDRESS or OPL-managed local service state', 'OPL-managed Temporal worker state or OPL_TEMPORAL_WORKER_STATUS=ready'],
      runtime_dependency: 'temporal_server_and_worker_required_for_live_workflows',
    },
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
      fallback: 'temporal',
      production_required_provider: 'temporal',
      local_sqlite_role: 'retired_runtime_provider',
      fail_closed_when_temporal_not_ready: true,
    },
    providers: {
      [selected]: await inspectFamilyRuntimeProviderWithLifecycle(selected, paths, options),
    } as Partial<Record<FamilyRuntimeProviderKind, FamilyRuntimeProviderInspection>>,
    provider_catalog: Object.fromEntries(
      FAMILY_RUNTIME_PROVIDER_KINDS.map((providerKind) => [providerKind, providerMetadata(providerKind)]),
    ),
  };
}

export async function inspectSelectedFamilyRuntimeProvidersWithLifecycle(
  input: {
    requestedProvider?: FamilyRuntimeProviderKind;
    paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;
    options?: ProviderLifecycleOptions;
  },
) {
  const selectedProvider = resolveFamilyRuntimeProviderKind(input.requestedProvider);
  const providerRuntime = await inspectFamilyRuntimeProvidersWithLifecycle(
    selectedProvider,
    input.paths,
    input.options,
  );
  const provider = providerRuntime.providers[selectedProvider];
  if (!provider) {
    throw new FrameworkContractError('contract_shape_invalid', 'Selected family runtime provider was not inspected.', {
      selected_provider: selectedProvider,
    });
  }
  return {
    selectedProvider,
    providerRuntime,
    provider,
  };
}

export function ensureFamilyRuntimeProvider(kind: FamilyRuntimeProviderKind, mode: 'install' | 'repair') {
  if (kind === 'temporal') {
    const inspection = inspectFamilyRuntimeProvider(kind);
    const visibilityReadiness = buildTemporalStageAttemptVisibilityReadiness();
    return {
      surface_id: 'opl_family_runtime_provider',
      provider_kind: kind,
      mode,
      status: inspection.ready && visibilityReadiness.readiness_status === 'ready' ? 'ready' : 'attention_needed',
      actions: visibilityReadiness.repair_action === null
        ? []
        : [visibilityReadiness.repair_action],
      provider: inspection,
      visibility_readiness: visibilityReadiness,
      repair_guidance: [
        ...inspection.ready
          ? []
          : [
              'Configure OPL_TEMPORAL_ADDRESS and run a Temporal worker that implements the OPL stage attempt contract.',
            ],
        ...visibilityReadiness.readiness_status === 'ready'
          ? []
          : [
              'Install OPL Temporal stage attempt Search Attributes before relying on searchable stage attempt visibility.',
            ],
      ],
    };
  }
  const inspection = inspectFamilyRuntimeProvider(kind);
  return {
    surface_id: 'opl_family_runtime_provider',
    provider_kind: kind,
    mode,
    status: inspection.ready ? 'ready' : 'attention_needed',
    actions: [],
    provider: inspection,
  };
}

export async function ensureFamilyRuntimeProviderWithLifecycle(
  kind: FamilyRuntimeProviderKind,
  mode: 'install' | 'repair',
  paths: ReturnType<typeof familyRuntimePaths>,
) {
  if (kind !== 'temporal') {
    return ensureFamilyRuntimeProvider(kind, mode);
  }
  const workerRepairReceipt = mode === 'repair'
    ? await repairTemporalWorkerForProviderRepair(paths)
    : null;
  const inspection = await inspectFamilyRuntimeProviderWithLifecycle(kind, paths);
  const visibilityReadiness = await inspectTemporalStageAttemptVisibilityReadiness(paths);
  return {
    surface_id: 'opl_family_runtime_provider',
    provider_kind: kind,
    mode,
    status: inspection.ready && visibilityReadiness.readiness_status === 'ready' ? 'ready' : 'attention_needed',
    actions: visibilityReadiness.repair_action === null
      ? []
      : [visibilityReadiness.repair_action],
    provider: inspection,
    visibility_readiness: visibilityReadiness,
    temporal_worker_repair: workerRepairReceipt,
    repair_guidance: [
      ...inspection.ready
        ? []
        : [
            'Start or repair the OPL-managed Temporal service and worker before relying on live provider execution.',
          ],
      ...visibilityReadiness.readiness_status === 'ready'
        ? []
        : [
            'Install OPL Temporal stage attempt Search Attributes before relying on searchable stage attempt visibility.',
          ],
    ],
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
      !provider.ready
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
