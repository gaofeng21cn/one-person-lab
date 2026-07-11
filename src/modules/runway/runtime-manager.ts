import {
  inspectSelectedFamilyRuntimeProvidersWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './public/runtime-manager-support.ts';
import { OBSERVABILITY_ATTEMPT_LEDGER_LABEL } from '../../kernel/observability-projection-vocabulary.ts';
import {
  buildDomainRouteSupportProjection,
  readManagedProviderProjectionSummary,
  familyRuntimePaths,
  DEFAULT_NATIVE_HELPERS,
  buildNativeHelperProjection,
  runNativeHelperRepairAction,
} from './public/runtime-manager-support.ts';
import {
  runtimeDomainOwnerProfiles,
  runtimeManagerDomainProfiles,
} from './family-runtime-types.ts';

function buildFamilySchedulerReplacement() {
  return {
    surface_kind: 'opl_family_scheduler_replacement',
    version: 'v1',
    owner: 'one-person-lab',
    scheduler_owner: 'opl_provider_runtime_manager',
    cadence_owner: 'provider_backed_family_runtime',
    replacement_status: 'replacement_contract_available',
    contract_ref: 'contracts/opl-framework/runtime-manager-contract.json#/family_scheduler_replacement',
    allowed_opl_targets: [
      'provider_slo_tick',
      'scheduler_cadence',
      'runtime_manager_projection',
    ],
    command_set: {
      status: 'opl runtime manager',
      provider_slo_tick: 'opl family-runtime provider-slo tick --provider temporal',
      scheduler_status: 'opl family-runtime scheduler status --provider temporal',
      scheduler_trigger: 'opl family-runtime scheduler trigger --provider temporal',
    },
    state_refs: {
      provider_slo_receipts: '${OPL_STATE_DIR}/family-runtime/provider-slo',
      stage_attempt_index: '${OPL_STATE_DIR}/family-runtime/queue.sqlite',
      stage_attempt_ledger: '${OPL_STATE_DIR}/family-runtime/queue.sqlite#stage_attempts',
      events_ledger: '${OPL_STATE_DIR}/family-runtime/events.jsonl',
    },
    managed_domains: runtimeManagerDomainProfiles().map((profile) => {
      const { daemon_policy: _daemonPolicy, ...scheduler } = profile.scheduler;
      return {
        domain_id: profile.domain_id,
        domain_owner: profile.domain_owner,
        ...scheduler,
      };
    }),
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_domain_quality: false,
      can_authorize_domain_export: false,
      can_install_domain_daemon: false,
      can_execute_domain_repair_command_directly: false,
      can_enqueue_provider_stage_attempts: false,
      can_record_opl_provider_receipts: true,
      can_project_operator_workbench: true,
    },
    migration_gate: {
      active_domain_callers_must_use_replacement_owner: true,
      legacy_domain_scheduler_must_be_explicit_diagnostic_or_tombstone: true,
      no_active_launchagent_install_from_domain_default: true,
    },
  } as const;
}

function buildDaemonPolicy() {
  const domainLaunchagentPolicy = Object.fromEntries(
    runtimeManagerDomainProfiles().map((profile) => [
      profile.domain_id,
      profile.scheduler.daemon_policy,
    ]),
  );

  return {
    surface_kind: 'opl_runtime_manager_daemon_policy',
    local_daemon_added: false,
    opl_domain_daemon_installation_allowed: false,
    cadence_owner: 'provider_backed_family_runtime',
    runtime_kernel_owner: 'provider_backed_family_runtime',
    provider_backed_cadence_surface: 'opl family-runtime provider-slo tick --provider temporal',
    domain_launchagent_policy: domainLaunchagentPolicy,
    allowed_domain_daemon_role: 'legacy_diagnostic_cleanup_only',
    sidecar_promotion_gate:
      'Only promote beyond provider adapters if configured providers cannot express required task, wakeup, approval, audit, or product isolation contracts.',
    authority_boundary: {
      can_install_opl_daemon: false,
      can_install_domain_daemon: false,
      can_maintain_domain_daemon: false,
      can_start_legacy_domain_launchagent: false,
      can_record_provider_cadence_receipt: true,
    },
  } as const;
}

const NATIVE_HELPER_PROTOCOL = {
  version: 'opl_native_helper.v1',
  language: 'rust',
  transport: 'cli_stdio',
  input: 'json_object_on_stdin',
  output: 'json_object_on_stdout',
  error_shape: {
    ok: false,
    errors: ['{code,message}'],
  },
} as const;

const NATIVE_HELPERS = [
  {
    helper_id: 'opl-sysprobe',
    priority: 'p1_native_helper',
    binary: 'opl-sysprobe',
    crate: 'opl-native-helper',
    purpose: 'portable system, toolchain, and runtime dependency inspection',
    contract_ref: 'contracts/opl-framework/native-helper-contract.json#/helpers/opl-sysprobe',
  },
  {
    helper_id: 'opl-doctor-native',
    priority: 'p1_native_helper',
    binary: 'opl-doctor-native',
    crate: 'opl-native-helper',
    purpose: 'native doctor snapshot for local toolchain and runtime readiness inputs',
    contract_ref: 'contracts/opl-framework/native-helper-contract.json#/helpers/opl-doctor-native',
  },
  {
    helper_id: 'opl-runtime-watch',
    priority: 'p1_native_helper',
    binary: 'opl-runtime-watch',
    crate: 'opl-native-helper',
    purpose: 'snapshot watched runtime roots and emit deterministic change fingerprints',
    contract_ref: 'contracts/opl-framework/native-helper-contract.json#/helpers/opl-runtime-watch',
  },
  {
    helper_id: 'opl-artifact-indexer',
    priority: 'p2_high_frequency_index',
    binary: 'opl-artifact-indexer',
    crate: 'opl-native-helper',
    purpose: 'fast workspace artifact discovery without owning domain truth',
    contract_ref: 'contracts/opl-framework/native-helper-contract.json#/helpers/opl-artifact-indexer',
  },
  {
    helper_id: 'opl-state-indexer',
    priority: 'p2_high_frequency_index',
    binary: 'opl-state-indexer',
    crate: 'opl-native-helper',
    purpose: 'high-frequency session, progress, artifact projection, and JSON validity indexing',
    contract_ref: 'contracts/opl-framework/native-helper-contract.json#/helpers/opl-state-indexer',
  },
] as const;

const STATE_INDEX_CATALOG = {
  workspace_registry_index: {
    backing_helper_id: 'opl-state-indexer',
    input_contract: 'workspace_roots[]',
    output_surface: 'workspace_registry_index',
  },
  managed_session_ledger_index: {
    backing_helper_id: 'opl-state-indexer',
    input_contract: 'session_ledger_roots[]',
    output_surface: 'managed_session_ledger_index',
  },
  artifact_projection_index: {
    backing_helper_id: 'opl-artifact-indexer',
    input_contract: 'workspace_root + artifact_roots[]',
    output_surface: 'native_artifact_manifest',
  },
  attention_queue_index: {
    backing_helper_id: 'opl-state-indexer',
    input_contract: 'attention_queue_roots[]',
    output_surface: 'attention_queue_index',
  },
  runtime_health_snapshot_index: {
    backing_helper_id: 'opl-runtime-watch',
    input_contract: 'watch_roots[]',
    output_surface: 'runtime_health_snapshot_index',
  },
} as const;

type RuntimeManagerActionMode = 'dry_run' | 'apply';
type RuntimeManagerActionInput = {
  mode: RuntimeManagerActionMode;
  skipNativeHelpers?: boolean;
  skipFamilyRuntimeProvider?: boolean;
};

type RuntimeManagerDependencies = {
  buildStandardDomainAgentScaffold?: () => {
    standard_domain_agent_scaffold: Record<string, unknown>;
  };
};

function standardDomainAgentScaffoldProjection(dependencies: RuntimeManagerDependencies) {
  return dependencies.buildStandardDomainAgentScaffold?.().standard_domain_agent_scaffold ?? {
    status: 'standard_domain_agent_scaffold_builder_not_injected',
    owner_boundary: 'Foundry Lab owns scaffold generation; Runway projects it only when an entrypoint injects the public Foundry builder.',
  };
}

function isNativeHelperAction(actionId: string) {
  return actionId === 'repair_native_helpers' || actionId === 'refresh_native_indexes';
}

function isOnlineRuntimeAction(actionId: string) {
  return actionId === 'configure_temporal_provider' || actionId === 'configure_external_sandbox_provider';
}

function runtimeManagerProviderStatus(
  provider: Awaited<ReturnType<typeof inspectSelectedFamilyRuntimeProvidersWithLifecycle>>['provider'],
) {
  if (provider.provider_kind === 'external_sandbox') {
    return externalSandboxAdapterConfigured(provider)
      ? 'external_sandbox_configured_not_temporal_durable_runtime_ready'
      : 'provider_attention_needed';
  }
  if (provider.ready) {
    return 'ready';
  }
  return provider.status === 'provider_code_landed_unconfigured'
    ? 'provider_code_landed_unconfigured'
    : 'provider_attention_needed';
}

function externalSandboxAdapterConfigured(
  provider: Awaited<ReturnType<typeof inspectSelectedFamilyRuntimeProvidersWithLifecycle>>['provider'],
) {
  return provider.provider_kind === 'external_sandbox'
    && provider.details.adapter_configured === true
    && Array.isArray(provider.details.missing_required_env)
    && provider.details.missing_required_env.length === 0;
}

function filterActionableRuntimeManagerActions(
  actions: Awaited<ReturnType<typeof buildRuntimeManager>>['runtime_manager']['reconcile']['recommended_actions'],
  input: RuntimeManagerActionInput,
) {
  return actions.filter((action) => {
    if (input.skipNativeHelpers && isNativeHelperAction(action.action_id)) {
      return false;
    }
    if (input.skipFamilyRuntimeProvider && isOnlineRuntimeAction(action.action_id)) {
      return false;
    }
    return true;
  });
}

export async function buildRuntimeManager(
  input: { persistNativeIndexes?: boolean } = {},
  dependencies: RuntimeManagerDependencies = {},
) {
  const { selectedProvider, providerRuntime: providers, provider } =
    await inspectSelectedFamilyRuntimeProvidersWithLifecycle({
      requestedProvider: resolveFamilyRuntimeProviderKind(),
      paths: familyRuntimePaths(),
      options: {
        managedProviderProjection: readManagedProviderProjectionSummary(),
      },
    });
  const nativeHelperProjection = buildNativeHelperProjection(DEFAULT_NATIVE_HELPERS, {
    persistIndexes: input.persistNativeIndexes,
  });
  const reconcile = buildRuntimeManagerReconcile(provider, nativeHelperProjection);

  return {
    version: 'g2',
    runtime_manager: {
      surface_id: 'opl_runtime_manager',
      layer_role: 'product_control_plane_over_provider_backed_family_runtime',
      status: runtimeManagerProviderStatus(provider),
      owner_split: {
        product_control_plane_owner: 'one-person-lab',
        online_runtime_substrate_owner: 'provider_backed_family_runtime',
        domain_truth_owners: runtimeDomainOwnerProfiles(),
        concrete_executor_owner: 'stage_selected_by_domain_contract',
      },
      responsibilities: [
        'select_supported_family_runtime_provider',
        'project_provider_readiness_and_stage_attempt_history',
        'own_stage_attempt_index_and_provider_projection_contracts',
        'wire_provider_signal_delivery_transport',
        'project_runtime_status_into_opl_sessions_progress_artifacts',
        'provide_runtime_doctor_repair_resume_entrypoints',
        'catalog_optional_native_helpers',
        'catalog_high_frequency_state_indexes',
      ],
      non_goals: [
        'not_a_domain_runtime_truth_owner',
        'not_a_domain_quality_verdict_owner',
        'not_a_domain_artifact_gate_owner',
        'not_a_domain_truth_owner',
        'not_a_concrete_executor',
        'not_a_private_fork_of_external_executor_runtime',
        'external_agent_sandbox_is_not_temporal_durable_workflow_substrate',
      ],
      family_runtime_stage_attempt_index: {
        surface_kind: 'opl_family_runtime_stage_attempt_index',
        command: 'opl family-runtime status',
        state_path: '${OPL_STATE_DIR}/family-runtime/queue.sqlite',
        provider_model: 'provider_backed_stage_attempt_runtime',
        configured_provider: selectedProvider,
        allowed_providers: providers.allowed_providers,
        stage_attempt_ledger: '${OPL_STATE_DIR}/family-runtime/queue.sqlite#stage_attempts',
        wakeup_bridge: 'Temporal schedule/workflow history -> provider SLO and stage-attempt projection readback',
        webhook_bridge: 'provider signal/webhook -> Temporal signal/update',
        domain_route_projection: buildDomainRouteSupportProjection(),
      },
      family_scheduler_replacement: {
        ...buildFamilySchedulerReplacement(),
        configured_provider: selectedProvider,
        allowed_providers: providers.allowed_providers,
      },
      daemon_policy: buildDaemonPolicy(),
      provider_runtime: providers,
      reconcile,
      registration_registry: {
        surface_kind: 'opl_stage_runtime_registration_registry',
        version: 'v1',
        registration_status: 'declared_projection_contracts',
        source_of_truth_rule:
          'OPL indexes declared domain registration surfaces and must dereference domain-owned durable truth before acting.',
        domains: runtimeManagerDomainProfiles().map((profile) => {
          const { scheduler: _scheduler, ...registration } = profile;
          return registration;
        }),
        required_domain_registration_fields: [
          'surface_kind',
          'registration_id',
          'domain_id',
          'domain_owner',
          'runtime_owner',
          'domain_entry_surface',
          'consumable_projection_refs',
          'state_index_inputs',
          'non_goals',
        ],
      },
      standard_domain_agent_scaffold: standardDomainAgentScaffoldProjection(dependencies),
      native_helper_target: {
        status: 'contracted_optional_rust_helpers',
        language: 'rust',
        protocol: NATIVE_HELPER_PROTOCOL,
        allowed_shape: 'small_json_stdio_or_cli_helpers_managed_by_opl',
        helpers: NATIVE_HELPERS,
        lifecycle: nativeHelperProjection.lifecycle,
        runtime: nativeHelperProjection.runtime,
        non_goals: [
          'not_a_domain_truth_owner',
          'not_a_runtime_kernel',
          'not_a_concrete_executor',
          'not_a_python_domain_logic_replacement',
        ],
      },
      state_index_target: {
        status: 'rust_helper_backed_contract_first',
        index_owner: 'one-person-lab',
        source_of_truth_rule: 'indexes project runtime surfaces but never replace domain-owned durable truth',
        index_catalog: STATE_INDEX_CATALOG,
        persistence: nativeHelperProjection.persistence,
        candidate_indexes: [
          'workspace_registry_index',
          'managed_session_ledger_index',
          'artifact_projection_index',
          'attention_queue_index',
          'runtime_health_snapshot_index',
        ],
      },
      future_sidecar_migration: {
        enabled_now: false,
        readiness_value:
          'Freezing this adapter boundary lowers future migration risk if OPL later needs its own full runtime sidecar.',
        promotion_gate:
          'Only promote beyond provider adapters if supported providers cannot express required task, wakeup, approval, audit, or product isolation contracts.',
      },
      notes: [
        'Family runtime provider is Temporal-only; local_sqlite is retired as a provider and SQLite sidecars are projection/readback indexes only.',
        'external_sandbox is an agent_sandbox_execution_substrate readback for E2B/Daytona/Modal-style adapters; it is not a Temporal durable workflow substrate replacement.',
        `OPL Runtime Manager is the product control plane, stage ${OBSERVABILITY_ATTEMPT_LEDGER_LABEL}, and projection layer.`,
        'Registered domain agents keep domain-owned truth and route-selected executor semantics.',
      ],
    },
  };
}

export async function runRuntimeManagerAction(
  input: RuntimeManagerActionInput,
  dependencies: RuntimeManagerDependencies = {},
) {
  const before = await buildRuntimeManager({ persistNativeIndexes: false }, dependencies);
  const recommendedActions = before.runtime_manager.reconcile.recommended_actions;
  const actionableActions = filterActionableRuntimeManagerActions(recommendedActions, input);
  const plannedActions = actionableActions.map((action) => ({
    ...action,
    execution_status: 'not_executed',
    dry_run_note:
      input.skipNativeHelpers || input.skipFamilyRuntimeProvider
        ? 'Dry run did not run native helper repair, did not write refreshed native indexes, and did not repair or configure the selected family runtime provider. Requested recommendation classes were omitted.'
        : 'Dry run did not run native helper repair, did not write refreshed native indexes, and did not repair or configure the selected family runtime provider.',
  }));
  const plannedNonBlockingActions = plannedActions.filter((action) => action.blocking === false);

  if (input.mode === 'dry_run') {
    return {
      version: 'g2',
      runtime_manager_action: {
        surface_kind: 'opl_runtime_manager_action',
        mode: input.mode,
        dry_run: true,
        status: 'planned',
        note:
          'Dry run did not run native helper repair, did not write refreshed native indexes, and did not repair or configure the selected family runtime provider.',
        before: summarizeRuntimeManagerForAction(before),
        after: null,
        planned_actions: plannedActions,
        executed_actions: [],
        non_blocking_actions: plannedNonBlockingActions,
        background_actions: plannedNonBlockingActions,
        non_goals: [
          'does_not_schedule_tasks',
          'does_not_store_session_memory',
          'does_not_replace_domain_truth',
          'does_not_private_fork_external_executor_runtime',
        ],
      },
    };
  }

  const executedActions = [];
  let after: Awaited<ReturnType<typeof buildRuntimeManager>> | null = null;

  for (const action of actionableActions) {
    if (action.action_id === 'configure_temporal_provider') {
      executedActions.push({
        action_id: action.action_id,
        status: 'blocked_manual_configuration_required',
        blocking: action.blocking,
        action_lane: 'online_runtime',
        capability: 'temporal_stage_attempt_provider',
        command_preview: ['env', 'OPL_TEMPORAL_ADDRESS=<host:port>', 'opl', 'family-runtime', 'status', '--provider', 'temporal'],
        note:
          'Temporal provider needs an external Temporal server and worker implementing the OPL stage attempt contract.',
      });
      continue;
    }

    if (action.action_id === 'configure_external_sandbox_provider') {
      executedActions.push({
        action_id: action.action_id,
        status: 'blocked_manual_configuration_required',
        blocking: action.blocking,
        action_lane: 'external_agent_sandbox',
        capability: 'agent_sandbox_execution_substrate',
        command_preview: [
          'env',
          'OPL_EXTERNAL_SANDBOX_ENDPOINT=<endpoint>',
          'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF=<secret-ref>',
          'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF=<receipt-ref>',
          'opl',
          'runtime',
          'manager',
        ],
        note:
          'External sandbox provider needs an explicit adapter endpoint, credential reference, and provider receipt reference. Runtime Manager does not call E2B, Daytona, Modal, or read credential material.',
      });
      continue;
    }

    if (action.action_id === 'repair_native_helpers') {
      const repair = runNativeHelperRepairAction();
      executedActions.push({
        action_id: action.action_id,
        status: repair.status === 'completed' || repair.status === 'skipped_ready' ? 'completed' : repair.status,
        blocking: action.blocking,
        action_lane: 'native_helpers',
        capability: 'native_helper_runtime',
        command_preview: repair.command_preview,
        details: repair,
      });
      continue;
    }

    if (action.action_id === 'refresh_native_indexes') {
      after = await buildRuntimeManager({ persistNativeIndexes: true }, dependencies);
      const persistence = after.runtime_manager.state_index_target.persistence;
      executedActions.push({
        action_id: action.action_id,
        status: persistence.status === 'written' ? 'completed' : 'failed',
        blocking: action.blocking,
        action_lane: 'native_indexes',
        capability: 'state_index_projection',
        command_preview: ['opl', 'runtime', 'manager'],
        details: {
          persistence_status: persistence.status,
          freshness: persistence.freshness,
          index_file: persistence.index_file,
          errors: persistence.errors,
        },
      });
      continue;
    }

    executedActions.push({
      action_id: action.action_id,
      status: 'skipped_unavailable',
      blocking: action.blocking,
      action_lane: 'runtime_manager',
      capability: 'runtime_manager_reconcile',
      command_preview: action.command ? action.command.split(' ') : [],
      note: 'No Runtime Manager apply implementation exists for this recommendation.',
    });
  }

  after ??= await buildRuntimeManager({ persistNativeIndexes: false }, dependencies);
  const afterSummary = summarizeRuntimeManagerForAction(after);
  const executedNonBlockingActions = executedActions.filter((action) => action.blocking === false);
  const hasFailure = executedActions.some((action) => action.status === 'failed');
  const hasSkipped = executedActions.some((action) => action.status === 'skipped_unavailable');
  const remainingActionableRecommendations = filterActionableRuntimeManagerActions(
    afterSummary.reconcile.recommended_actions,
    input,
  );
  const status = hasFailure
    ? 'failed'
    : hasSkipped || remainingActionableRecommendations.length > 0
      ? 'completed_with_attention'
      : 'completed';

  return {
    version: 'g2',
    runtime_manager_action: {
      surface_kind: 'opl_runtime_manager_action',
      mode: input.mode,
      dry_run: false,
      status,
        note:
          'Apply executed only Runtime Manager adapter actions backed by existing OPL helper and already-configured provider surfaces.',
      before: summarizeRuntimeManagerForAction(before),
      after: afterSummary,
      planned_actions: plannedActions,
      executed_actions: executedActions,
      non_blocking_actions: executedNonBlockingActions,
      background_actions: executedNonBlockingActions,
      non_goals: [
        'does_not_schedule_tasks',
        'does_not_store_session_memory',
        'does_not_replace_domain_truth',
        'does_not_private_fork_external_executor_runtime',
      ],
    },
  };
}

function summarizeRuntimeManagerForAction(payload: Awaited<ReturnType<typeof buildRuntimeManager>>) {
  const runtimeManager = payload.runtime_manager;

  return {
    status: runtimeManager.status,
    reconcile: runtimeManager.reconcile,
    native_helper_runtime: {
      status: runtimeManager.native_helper_target.runtime.status,
      invocations: runtimeManager.native_helper_target.runtime.invocations.map((invocation) => ({
        helper_id: invocation.helper_id,
        status: invocation.status,
      })),
    },
    native_index_persistence: runtimeManager.state_index_target.persistence,
  };
}

function buildRuntimeManagerReconcile(
  provider: Awaited<ReturnType<typeof inspectSelectedFamilyRuntimeProvidersWithLifecycle>>['provider'],
  nativeHelperProjection: ReturnType<typeof buildNativeHelperProjection>,
) {
  const recommendedActions = [];
  const nativeRuntimeStatus = nativeHelperProjection.runtime.status;
  const indexFreshnessStatus = nativeHelperProjection.persistence.freshness.status;

  if (provider.provider_kind === 'temporal' && !provider.ready) {
    recommendedActions.push({
      action_id: 'configure_temporal_provider',
      priority: 'p0_online_runtime',
      blocking: true,
      action_lane: 'online_runtime',
      capability: 'temporal_stage_attempt_provider',
      command: 'OPL_TEMPORAL_ADDRESS=<host:port> opl family-runtime status --provider temporal',
      reason:
        'Temporal provider is selected but no Temporal address is configured. Live workflows require an external Temporal server and worker.',
    });
  }

  if (provider.provider_kind === 'external_sandbox' && !externalSandboxAdapterConfigured(provider)) {
    recommendedActions.push({
      action_id: 'configure_external_sandbox_provider',
      priority: 'p0_external_agent_sandbox',
      blocking: true,
      action_lane: 'external_agent_sandbox',
      capability: 'agent_sandbox_execution_substrate',
      command:
        'OPL_EXTERNAL_SANDBOX_ENDPOINT=<endpoint> OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF=<secret-ref> OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF=<receipt-ref> opl runtime manager',
      reason:
        'External sandbox provider is selected but its adapter endpoint, credential reference, or provider receipt reference is not configured. This is an agent sandbox execution substrate, not a Temporal durable workflow substrate replacement.',
    });
  }

  if (nativeRuntimeStatus !== 'available') {
    recommendedActions.push({
      action_id: 'repair_native_helpers',
      priority: 'p1_native_helper',
      blocking: false,
      command: 'npm run native:repair',
      reason: `Native helper runtime is ${nativeRuntimeStatus}.`,
    });
  }

  if (indexFreshnessStatus !== 'fresh') {
    recommendedActions.push({
      action_id: 'refresh_native_indexes',
      priority: 'p2_high_frequency_index',
      blocking: false,
      command: 'opl runtime manager',
      reason: `Native state index freshness is ${indexFreshnessStatus}.`,
    });
  }

  return {
    surface_kind: 'opl_runtime_manager_reconcile',
    version: 'v1',
    overall_status: recommendedActions.length === 0 && runtimeManagerProviderStatus(provider) === 'ready'
      ? 'ready'
      : 'attention_needed',
    checked_surfaces: {
      provider_runtime: runtimeManagerProviderStatus(provider),
      native_helper_runtime: nativeRuntimeStatus,
      native_index_freshness: indexFreshnessStatus,
      domain_registration_registry: 'declared_projection_contracts',
    },
    recommended_actions: recommendedActions,
    non_goals: [
      'does_not_schedule_tasks',
      'does_not_store_session_memory',
      'does_not_replace_domain_truth',
      'does_not_private_fork_external_executor_runtime',
    ],
  };
}
