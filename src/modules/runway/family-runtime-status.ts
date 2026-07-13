import { DatabaseSync } from 'node:sqlite';

import { runtimeDomainDaemonReplacementSurfaces } from './family-runtime-types.ts';
import {
  inspectSelectedFamilyRuntimeProvidersWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { buildTemporalWorkerLifecycleContract } from './family-runtime-temporal-readiness.ts';
import { buildTemporalFirstRuntimeContract } from './family-runtime-temporal.ts';
import { buildTemporalProviderLivenessBlocker } from './family-runtime-provider-liveness-blocker.ts';
import { readManagedProviderProjectionSummary } from './family-runtime-managed-provider-projection.ts';
import {
  QUEUE_SCHEMA_VERSION,
  buildQueueTemporalLifecycleBoundary,
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
      managedProviderProjection: readManagedProviderProjectionSummary(),
    },
  });
  const fullOnlineReady = selectedProvider === 'temporal' && provider.ready;
  const temporalSelected = selectedProvider === 'temporal';
  const queueLifecycleBoundary = buildQueueTemporalLifecycleBoundary(db, selectedProvider);
  const providerCanReplaceDomainDaemons = temporalSelected && provider.ready;
  const providerReadyForOnlineRuntime = temporalSelected && provider.ready;
  const schedulerReplacementStatus = temporalSelected
    ? provider.ready
      ? 'provider_ready_scheduler_surface_available'
      : 'blocked_provider_not_ready'
    : 'external_sandbox_cannot_replace_temporal_runtime';
  const providerLivenessBlocker = temporalSelected && !provider.ready
    ? buildTemporalProviderLivenessBlocker(provider)
    : null;
  const degradedReason = provider.degraded_reason;
  const readinessReady = fullOnlineReady;

  return {
    version: 'g2',
    family_runtime: {
      surface_id: 'opl_family_runtime',
      provider_model: 'provider_backed_stage_attempt_runtime',
      configured_provider: selectedProvider,
      state: {
        state_dir: paths.state_dir,
        runtime_dir: paths.root,
        stage_attempt_index_db: paths.queue_db,
        stage_attempt_index_schema_version: QUEUE_SCHEMA_VERSION,
      },
      readiness: {
        provider_ready: providerReadyForOnlineRuntime,
        diagnostic_provider_ready: provider.ready,
        full_online_ready: readinessReady,
        durable_online_ready: readinessReady,
        default_standard_agent_runtime_path: 'opl_temporal_hosted_autonomous',
        temporal_hosted_autonomy_default_enabled: true,
        provider_managed_long_running_tasks: true,
        domain_agent_internal_daemon_allowed: false,
        domain_agent_internal_scheduler_allowed: false,
        domain_agent_internal_attempt_loop_allowed: false,
        codex_app_drives_long_running_tasks: false,
        production_provider_required: 'temporal',
        selected_provider_role: providerRuntime.provider_catalog[selectedProvider]?.provider_role ?? 'unknown',
        local_sqlite_provider_retired: true,
        local_sqlite_counts_as_provider_ready: false,
        selected_provider_can_replace_domain_daemons: providerCanReplaceDomainDaemons,
        queue_truth_competes_with_temporal: false,
        degraded: !providerReadyForOnlineRuntime,
        degraded_reason: degradedReason,
      },
      provider_runtime: {
        ...providerRuntime,
        selected: provider,
        temporal_worker_lifecycle: selectedProvider === 'temporal'
          ? buildTemporalWorkerLifecycleContract()
          : null,
        temporal_first_runtime_contract: selectedProvider === 'temporal'
          ? buildTemporalFirstRuntimeContract()
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
        selected_provider_can_replace_domain_daemons: providerCanReplaceDomainDaemons,
        schedule_id: temporalSelected ? 'opl-family-runtime-provider-scheduler' : null,
        workflow_type: temporalSelected ? 'SchedulerTickWorkflow' : null,
        interval_ms: temporalSelected ? 5 * 60 * 1000 : null,
        status_command: 'opl family-runtime scheduler status --provider temporal',
        install_command: 'opl family-runtime scheduler install --provider temporal',
        trigger_command: 'opl family-runtime scheduler trigger --provider temporal',
        provider_slo_tick_command: 'opl family-runtime provider-slo tick --provider temporal',
        local_sqlite_role: 'retired_runtime_provider',
        replaces_domain_daemon_surface: runtimeDomainDaemonReplacementSurfaces(),
        blocker: providerLivenessBlocker
          ? providerLivenessBlocker
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
        sqlite_sidecar: 'stage_attempt_projection_and_readback_index',
        stage_attempt_ledger: 'provider_attempt_control_metadata_only',
        action_execution: 'package_managed_hosted_action_runtime',
        notification_policy: 'all_delivery_events_are_written_to_local_inbox_first',
        forbidden_authority: [
          'domain_truth',
          'domain_quality_verdict',
          'domain_artifact_or_publication_gate',
        ],
      },
      queue_lifecycle_boundary: queueLifecycleBoundary,
      retired_task_projection: queueSummary(db),
      stage_attempts: stageAttemptSummary(db),
    },
  };
}
