import { inspectHermesRuntime } from './hermes.ts';
import {
  inspectFamilyRuntimeProvider,
  inspectFamilyRuntimeProviders,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { DEFAULT_NATIVE_HELPERS, buildNativeHelperProjection, runNativeHelperRepairAction } from './native-helper-runtime.ts';

const ADMITTED_DOMAIN_OWNERS = [
  {
    domain_id: 'medautoscience',
    domain_owner: 'med-autoscience',
    executor_owner: 'codex_cli_or_stage_selected_executor',
  },
  {
    domain_id: 'medautogrant',
    domain_owner: 'med-autogrant',
    executor_owner: 'codex_cli_or_stage_selected_executor',
  },
  {
    domain_id: 'redcube',
    domain_owner: 'redcube-ai',
    executor_owner: 'codex_cli_or_stage_selected_executor',
  },
] as const;

const DOMAIN_REGISTRATION_REGISTRY = [
  {
    domain_id: 'medautoscience',
    project: 'med-autoscience',
    registration_id: 'mas.opl_runtime_manager.registration.v1',
    expected_registration_surface: {
      surface_kind: 'opl_runtime_manager_domain_registration',
      ref: '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
      command: 'uv run python -m med_autoscience.cli skill-catalog --profile <profile> --format json',
    },
    consumable_projection_refs: [
      '/skill_catalog/skills/0/domain_projection/runtime_continuity',
      '/progress_projection/domain_projection/research_runtime_control_projection',
      '/artifact_inventory/artifact_surface',
      '/automation/automations/0',
    ],
    state_index_inputs: {
      workspace_registry_index: '/workspace_locator',
      managed_session_ledger_index: '/session_continuity',
      artifact_projection_index: '/artifact_inventory',
      attention_queue_index: '/automation/automations/0',
      runtime_health_snapshot_index: '/runtime_inventory',
    },
  },
  {
    domain_id: 'medautogrant',
    project: 'med-autogrant',
    registration_id: 'mag.opl_runtime_manager.registration.v1',
    expected_registration_surface: {
      surface_kind: 'opl_runtime_manager_domain_registration',
      ref: '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
      command: 'uv run python -m med_autogrant skill-catalog --input <workspace.json> --format json',
    },
    consumable_projection_refs: [
      '/skill_catalog/skills/0/domain_projection/runtime_continuity',
      '/runtime_control/semantic_closure',
      '/artifact_inventory',
      '/automation/automations/1',
    ],
    state_index_inputs: {
      workspace_registry_index: '/workspace_locator',
      managed_session_ledger_index: '/session_continuity',
      artifact_projection_index: '/artifact_inventory',
      attention_queue_index: '/automation/automations/1',
      runtime_health_snapshot_index: '/runtime_inventory',
    },
  },
  {
    domain_id: 'redcube',
    project: 'redcube-ai',
    registration_id: 'rca.opl_runtime_manager.registration.v1',
    expected_registration_surface: {
      surface_kind: 'opl_runtime_manager_domain_registration',
      ref: '/skill_catalog/skills/0/domain_projection/opl_stage_runtime_registration',
      command: 'redcube product manifest --workspace-root <workspace_root>',
    },
    consumable_projection_refs: [
      '/skill_catalog/skills/0/domain_projection/runtime_continuity',
      '/product_entry_shell/opl_bridge',
      '/artifact_inventory',
      '/review_state',
      '/publication_projection',
    ],
    state_index_inputs: {
      workspace_registry_index: '/workspace_locator',
      managed_session_ledger_index: '/session_continuity',
      artifact_projection_index: '/artifact_inventory',
      attention_queue_index: '/automation/automations/0',
      runtime_health_snapshot_index: '/runtime_inventory',
    },
  },
] as const;

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
  skipOnlineManagement?: boolean;
};

function isNativeHelperAction(actionId: string) {
  return actionId === 'repair_native_helpers' || actionId === 'refresh_native_indexes';
}

function isOnlineRuntimeAction(actionId: string) {
  return actionId === 'configure_temporal_provider';
}

function filterActionableRuntimeManagerActions(
  actions: ReturnType<typeof buildRuntimeManager>['runtime_manager']['reconcile']['recommended_actions'],
  input: RuntimeManagerActionInput,
) {
  return actions.filter((action) => {
    if (input.skipNativeHelpers && isNativeHelperAction(action.action_id)) {
      return false;
    }
    if (input.skipOnlineManagement && isOnlineRuntimeAction(action.action_id)) {
      return false;
    }
    return true;
  });
}

export function buildRuntimeManager(input: { persistNativeIndexes?: boolean } = {}) {
  const selectedProvider = resolveFamilyRuntimeProviderKind();
  const provider = inspectFamilyRuntimeProvider(selectedProvider);
  const providers = inspectFamilyRuntimeProviders(selectedProvider);
  const hermes = inspectHermesRuntimeForProvider();
  const nativeHelperProjection = buildNativeHelperProjection(DEFAULT_NATIVE_HELPERS, {
    persistIndexes: input.persistNativeIndexes,
  });
  const reconcile = buildRuntimeManagerReconcile(provider, hermes, nativeHelperProjection);

  return {
    version: 'g2',
    runtime_manager: {
      surface_id: 'opl_runtime_manager',
      layer_role: 'product_control_plane_over_provider_backed_family_runtime',
      status: provider.ready
        ? 'ready'
        : provider.status === 'provider_code_landed_unconfigured'
          ? 'provider_code_landed_unconfigured'
          : 'provider_attention_needed',
      owner_split: {
        product_control_plane_owner: 'one-person-lab',
        online_runtime_substrate_owner: 'provider_backed_family_runtime',
        domain_truth_owners: ADMITTED_DOMAIN_OWNERS,
        concrete_executor_owner: 'stage_selected_by_domain_contract',
      },
      responsibilities: [
        'select_supported_family_runtime_provider',
        'project_provider_readiness_and_stage_attempt_history',
        'own_typed_family_queue_and_domain_dispatch_contracts',
        'wire_provider_wakeup_signal_delivery_and_approval_transport',
        'hydrate_domain_task_registration_contracts',
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
        'not_a_private_fork_of_hermes_agent',
      ],
      family_runtime_queue: {
        surface_kind: 'opl_family_runtime_queue',
        command: 'opl family-runtime status',
        state_path: '${OPL_STATE_DIR}/family-runtime/queue.sqlite',
        provider_model: 'provider_backed_stage_attempt_runtime',
        configured_provider: selectedProvider,
        allowed_providers: providers.allowed_providers,
        stage_attempt_ledger: '${OPL_STATE_DIR}/family-runtime/queue.sqlite#stage_attempts',
        wakeup_bridge: 'provider wakeup -> opl family-runtime tick --source <provider> --hydrate',
        webhook_bridge: 'provider signal/webhook -> opl family-runtime enqueue',
        mas_paper_autonomy_projection: {
          supported_task_kinds: [
            'paper_autonomy/repair-recheck',
            'paper_autonomy/ai-reviewer-recheck',
            'paper_autonomy/gate-replay',
            'paper_autonomy/guarded-apply',
            'paper_autonomy/route-decision',
          ],
          state_projection: [
            'study_id',
            'next_owner',
            'callable_surface',
            'source_refs',
            'source_fingerprint',
            'idempotency_key',
          ],
          repair_command: 'medautosci sidecar dispatch --task <task.json> --format json',
          authority_boundary:
            'OPL projects and dispatches MAS paper autonomy tasks but never writes MAS truth, publication quality, artifact gates, or current_package.',
        },
      },
      hermes_runtime: {
        role: 'explicit_executor_or_proof_diagnostic_only',
        binary: hermes.binary,
        version: hermes.version,
        gateway_service: hermes.gateway_service,
        issues: hermes.issues,
      },
      provider_runtime: providers,
      reconcile,
      registration_registry: {
        surface_kind: 'opl_stage_runtime_registration_registry',
        version: 'v1',
        registration_status: 'declared_projection_contracts',
        source_of_truth_rule:
          'OPL indexes declared domain registration surfaces and must dereference domain-owned durable truth before acting.',
        domains: DOMAIN_REGISTRATION_REGISTRY,
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
        'Family runtime is Temporal-backed in production; local_sqlite is the dev/CI/offline local ledger provider, and temporal is the required production durable workflow provider.',
        'OPL Runtime Manager is the product control plane, typed queue, stage attempt ledger, domain dispatch, and projection layer.',
        'MAS, MAG, and RCA keep domain-owned truth and route-selected executor semantics.',
      ],
    },
  };
}

export function runRuntimeManagerAction(input: RuntimeManagerActionInput) {
  const before = buildRuntimeManager({ persistNativeIndexes: false });
  const recommendedActions = before.runtime_manager.reconcile.recommended_actions;
  const actionableActions = filterActionableRuntimeManagerActions(recommendedActions, input);
  const plannedActions = actionableActions.map((action) => ({
    ...action,
    execution_status: 'not_executed',
    dry_run_note:
      input.skipNativeHelpers || input.skipOnlineManagement
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
          'does_not_private_fork_hermes_agent',
        ],
      },
    };
  }

  const executedActions = [];
  let after: ReturnType<typeof buildRuntimeManager> | null = null;

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
      after = buildRuntimeManager({ persistNativeIndexes: true });
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

  after ??= buildRuntimeManager({ persistNativeIndexes: false });
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
        'does_not_private_fork_hermes_agent',
      ],
    },
  };
}

function summarizeRuntimeManagerForAction(payload: ReturnType<typeof buildRuntimeManager>) {
  const runtimeManager = payload.runtime_manager;

  return {
    status: runtimeManager.status,
    reconcile: runtimeManager.reconcile,
    hermes_runtime: {
      binary: runtimeManager.hermes_runtime.binary,
      version: runtimeManager.hermes_runtime.version,
      gateway_service: runtimeManager.hermes_runtime.gateway_service,
      issues: runtimeManager.hermes_runtime.issues,
    },
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
  provider: ReturnType<typeof inspectFamilyRuntimeProvider>,
  hermes: ReturnType<typeof inspectHermesRuntimeForProvider>,
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
    overall_status: recommendedActions.length === 0 ? 'ready' : 'attention_needed',
    checked_surfaces: {
      provider_runtime: provider.ready
        ? 'ready'
        : provider.status === 'provider_code_landed_unconfigured'
          ? 'provider_code_landed_unconfigured'
          : 'provider_attention_needed',
      hermes_diagnostics: hermes.binary ? 'available_non_provider_diagnostic' : 'not_inspected_non_provider_diagnostic',
      native_helper_runtime: nativeRuntimeStatus,
      native_index_freshness: indexFreshnessStatus,
      domain_registration_registry: 'declared_projection_contracts',
    },
    recommended_actions: recommendedActions,
    non_goals: [
      'does_not_schedule_tasks',
      'does_not_store_session_memory',
      'does_not_replace_domain_truth',
      'does_not_private_fork_hermes_agent',
    ],
  };
}

function inspectHermesRuntimeForProvider() {
  return {
    binary: null,
    version: null,
    version_raw_output: null,
    update_available: false,
    update_summary: null,
    gateway_service: {
      loaded: false,
      raw_output: '',
    },
    issues: [
      'Hermes runtime was not inspected because OPL family-runtime providers are local_sqlite or temporal only.',
    ],
    inspection_mode: 'shallow_non_provider_diagnostic' as const,
  };
}
