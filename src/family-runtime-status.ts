import { DatabaseSync } from 'node:sqlite';

import { DOMAIN_ADAPTERS } from './family-runtime-command.ts';
import {
  inspectSelectedFamilyRuntimeProvidersWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { buildTemporalWorkerLifecycleContract } from './family-runtime-temporal-readiness.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import {
  QUEUE_SCHEMA_VERSION,
  familyRuntimePaths,
  queueSummary,
} from './family-runtime-store.ts';
import { stageAttemptSummary } from './family-runtime-stage-attempts.ts';

export async function buildFamilyRuntimeStatusPayload(
  db: DatabaseSync,
  paths = familyRuntimePaths(),
  requestedProvider = resolveFamilyRuntimeProviderKind(),
) {
  const { selectedProvider, providerRuntime, provider } = await inspectSelectedFamilyRuntimeProvidersWithLifecycle({
    requestedProvider,
    paths,
    options: {
      managedProviderProjection: readMasManagedProviderProjection(),
    },
  });
  const fullOnlineReady = selectedProvider !== 'local_sqlite' && provider.ready;
  const temporalSelected = selectedProvider === 'temporal';
  const schedulerReplacementStatus = temporalSelected
    ? provider.ready
      ? 'provider_ready_scheduler_surface_available'
      : 'blocked_provider_not_ready'
    : 'dev_offline_provider_cannot_replace_domain_daemons';

  return {
    version: 'g2',
    family_runtime: {
      surface_id: 'opl_family_runtime',
      provider_model: 'provider_backed_stage_attempt_runtime',
      configured_provider: selectedProvider,
      state: {
        state_dir: paths.state_dir,
        runtime_dir: paths.root,
        queue_db: paths.queue_db,
        queue_schema_version: QUEUE_SCHEMA_VERSION,
      },
      readiness: {
        provider_ready: provider.ready,
        full_online_ready: fullOnlineReady,
        durable_online_ready: fullOnlineReady,
        default_standard_agent_runtime_path: 'opl_temporal_hosted_autonomous',
        temporal_hosted_autonomy_default_enabled: true,
        provider_managed_long_running_tasks: true,
        domain_agent_internal_daemon_allowed: false,
        domain_agent_internal_scheduler_allowed: false,
        domain_agent_internal_attempt_loop_allowed: false,
        codex_app_drives_long_running_tasks: false,
        production_provider_required: 'temporal',
        selected_provider_role: providerRuntime.provider_catalog[selectedProvider]?.provider_role ?? 'unknown',
        local_sqlite_is_dev_ci_offline_only: selectedProvider === 'local_sqlite',
        selected_provider_can_replace_domain_daemons: selectedProvider === 'temporal' && provider.ready,
        degraded: !provider.ready,
        degraded_reason: provider.degraded_reason,
      },
      provider_runtime: {
        ...providerRuntime,
        selected: provider,
        temporal_worker_lifecycle: selectedProvider === 'temporal'
          ? buildTemporalWorkerLifecycleContract()
          : null,
      },
      periodic_execution: {
        surface_kind: 'opl_family_runtime_periodic_execution_summary',
        default_for_standard_agents: true,
        runtime_mode: 'provider_managed_autonomous_execution',
        provider_kind: selectedProvider,
        status: schedulerReplacementStatus,
        scheduler_owner: 'opl_provider_runtime_manager',
        cadence_owner: 'provider_backed_family_runtime',
        production_provider_required: 'temporal',
        standard_agent_default_provider: 'temporal',
        domain_agent_internal_loop_allowed: false,
        codex_app_role: 'start_observe_intervene_project_only',
        selected_provider_can_replace_domain_daemons: temporalSelected && provider.ready,
        schedule_id: temporalSelected ? 'opl-family-runtime-provider-scheduler' : null,
        workflow_type: temporalSelected ? 'SchedulerTickWorkflow' : null,
        interval_ms: temporalSelected ? 5 * 60 * 1000 : null,
        status_command: 'opl family-runtime scheduler status --provider temporal',
        install_command: 'opl family-runtime scheduler install --provider temporal',
        trigger_command: 'opl family-runtime scheduler trigger --provider temporal',
        tick_command: 'opl family-runtime scheduler tick --provider temporal',
        provider_slo_tick_command: 'opl family-runtime provider-slo tick --provider temporal',
        local_sqlite_role: 'dev_ci_offline_diagnostic_baseline_only',
        replaces_domain_daemon_surface: {
          medautoscience: 'MAS LaunchAgent / local supervision tick must remain absent, tombstone, or explicit cleanup diagnostic only.',
          medautogrant: 'MAG repo-local runtime journal cadence is not a production scheduler.',
          redcube: 'RCA repo-local session supervision is handler diagnostic only.',
        },
        blocker: temporalSelected && !provider.ready
          ? {
              blocker_kind: 'platform_dependency',
              blocker_id: provider.degraded_reason ?? 'temporal_provider_not_ready',
              next_repair_command: 'opl family-runtime service start --provider temporal && opl family-runtime worker start --provider temporal',
            }
          : selectedProvider === 'local_sqlite'
            ? {
                blocker_kind: 'provider_role',
                blocker_id: 'local_sqlite_is_dev_ci_offline_only',
                next_repair_command: 'opl family-runtime status --provider temporal',
              }
            : null,
        authority_boundary: {
          can_install_domain_daemon: false,
          can_write_domain_truth: false,
          can_write_domain_memory_body: false,
          can_authorize_quality_verdict: false,
          can_authorize_export_verdict: false,
          provider_completion_is_domain_ready: false,
        },
      },
      opl_owner: {
        queue: 'typed_family_queue',
        stage_attempt_ledger: 'provider_attempt_control_metadata_only',
        dispatch: 'domain_adapter_dispatch',
        notification_policy: 'all_delivery_events_are_written_to_local_inbox_first',
        forbidden_authority: [
          'domain_truth',
          'domain_quality_verdict',
          'domain_artifact_or_publication_gate',
        ],
      },
      domain_adapters: DOMAIN_ADAPTERS,
      queue: queueSummary(db),
      stage_attempts: stageAttemptSummary(db),
    },
  };
}
