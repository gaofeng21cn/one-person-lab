import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import { DOMAIN_ADAPTERS } from './family-runtime-command.ts';
import {
  inspectFamilyRuntimeProvidersWithLifecycle,
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
  const selectedProvider = resolveFamilyRuntimeProviderKind(requestedProvider);
  const providerRuntime = await inspectFamilyRuntimeProvidersWithLifecycle(selectedProvider, paths, {
    managedProviderProjection: readMasManagedProviderProjection(),
  });
  const provider = providerRuntime.providers[selectedProvider]
    ?? (() => {
      throw new FrameworkContractError('contract_shape_invalid', 'Selected family runtime provider was not inspected.', {
        selected_provider: selectedProvider,
      });
    })();
  const fullOnlineReady = selectedProvider !== 'local_sqlite' && provider.ready;

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
