import { ensureHermesBridge, inspectHermesBridge } from './family-runtime-hermes-bridge.ts';

export const FAMILY_RUNTIME_PROVIDER_KINDS = ['local_sqlite', 'hermes_legacy', 'temporal'] as const;

export type FamilyRuntimeProviderKind = typeof FAMILY_RUNTIME_PROVIDER_KINDS[number];

export type FamilyRuntimeProviderInspection = {
  provider_kind: FamilyRuntimeProviderKind;
  status: 'ready' | 'attention_needed' | 'contract_ready';
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
      provider_role: 'production_substrate_candidate',
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
    return {
      provider_kind: kind,
      status: address ? 'ready' : 'contract_ready',
      ready: Boolean(address),
      degraded_reason: address ? null : 'temporal_runtime_not_configured',
      capabilities: [
        'stage_attempt_workflow_contract',
        'codex_activity_contract',
        'human_gate_signal_contract',
        'query_projection_contract',
        'workflow_history_contract',
      ],
      details: {
        address,
        adapter_mode: address ? 'configured_external_provider' : 'skeleton_contract_ready',
        required_env: ['OPL_TEMPORAL_ADDRESS'],
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
        ? 'skeleton_contract_ready'
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
