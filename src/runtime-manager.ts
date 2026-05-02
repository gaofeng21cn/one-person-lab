import { inspectHermesRuntime } from './hermes.ts';
import { DEFAULT_NATIVE_HELPERS, buildNativeHelperProjection, runNativeHelperRepairAction } from './native-helper-runtime.ts';
import { runProductEntryRepairHermesGateway } from './product-entry-runtime.ts';

const ADMITTED_DOMAIN_OWNERS = [
  {
    domain_id: 'medautoscience',
    domain_owner: 'med-autoscience',
    executor_owner: 'med_deepscientist_or_route_selected_executor',
  },
  {
    domain_id: 'medautogrant',
    domain_owner: 'med-autogrant',
    executor_owner: 'med-autogrant_or_route_selected_executor',
  },
  {
    domain_id: 'redcube',
    domain_owner: 'redcube-ai',
    executor_owner: 'codex_cli_or_route_selected_executor',
  },
] as const;

const DOMAIN_REGISTRATION_REGISTRY = [
  {
    domain_id: 'medautoscience',
    project: 'med-autoscience',
    registration_id: 'mas.opl_runtime_manager.registration.v1',
    expected_registration_surface: {
      surface_kind: 'opl_runtime_manager_domain_registration',
      ref: '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration',
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
      ref: '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration',
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
      ref: '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration',
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
    contract_ref: 'contracts/opl-gateway/native-helper-contract.json#/helpers/opl-sysprobe',
  },
  {
    helper_id: 'opl-doctor-native',
    priority: 'p1_native_helper',
    binary: 'opl-doctor-native',
    crate: 'opl-native-helper',
    purpose: 'native doctor snapshot for local toolchain and runtime readiness inputs',
    contract_ref: 'contracts/opl-gateway/native-helper-contract.json#/helpers/opl-doctor-native',
  },
  {
    helper_id: 'opl-runtime-watch',
    priority: 'p1_native_helper',
    binary: 'opl-runtime-watch',
    crate: 'opl-native-helper',
    purpose: 'snapshot watched runtime roots and emit deterministic change fingerprints',
    contract_ref: 'contracts/opl-gateway/native-helper-contract.json#/helpers/opl-runtime-watch',
  },
  {
    helper_id: 'opl-artifact-indexer',
    priority: 'p2_high_frequency_index',
    binary: 'opl-artifact-indexer',
    crate: 'opl-native-helper',
    purpose: 'fast workspace artifact discovery without owning domain truth',
    contract_ref: 'contracts/opl-gateway/native-helper-contract.json#/helpers/opl-artifact-indexer',
  },
  {
    helper_id: 'opl-state-indexer',
    priority: 'p2_high_frequency_index',
    binary: 'opl-state-indexer',
    crate: 'opl-native-helper',
    purpose: 'high-frequency session, progress, artifact projection, and JSON validity indexing',
    contract_ref: 'contracts/opl-gateway/native-helper-contract.json#/helpers/opl-state-indexer',
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
};

function isNativeHelperAction(actionId: string) {
  return actionId === 'repair_native_helpers' || actionId === 'refresh_native_indexes';
}

function filterActionableRuntimeManagerActions(
  actions: ReturnType<typeof buildRuntimeManager>['runtime_manager']['reconcile']['recommended_actions'],
  input: RuntimeManagerActionInput,
) {
  if (!input.skipNativeHelpers) {
    return actions;
  }

  return actions.filter((action) => !isNativeHelperAction(action.action_id));
}

export function buildRuntimeManager(input: { persistNativeIndexes?: boolean } = {}) {
  const hermes = inspectHermesRuntime();
  const hermesReady = Boolean(hermes.binary && hermes.version && hermes.gateway_service.loaded);
  const nativeHelperProjection = buildNativeHelperProjection(DEFAULT_NATIVE_HELPERS, {
    persistIndexes: input.persistNativeIndexes,
  });
  const reconcile = buildRuntimeManagerReconcile(hermes, nativeHelperProjection);

  return {
    version: 'g2',
    runtime_manager: {
      surface_id: 'opl_runtime_manager',
      layer_role: 'product_managed_adapter_over_external_kernel',
      status: hermesReady ? 'ready' : 'needs_runtime_setup',
      owner_split: {
        product_manager_owner: 'one-person-lab',
        runtime_kernel_owner: 'upstream_hermes_agent',
        domain_truth_owners: ADMITTED_DOMAIN_OWNERS,
        concrete_executor_owner: 'route_selected_by_domain_contract',
      },
      responsibilities: [
        'provision_supported_hermes_runtime',
        'pin_runtime_version_and_profile',
        'hydrate_domain_task_registration_contracts',
        'project_runtime_status_into_opl_sessions_progress_artifacts',
        'provide_runtime_doctor_repair_resume_entrypoints',
        'catalog_optional_native_helpers',
        'catalog_high_frequency_state_indexes',
      ],
      non_goals: [
        'not_a_scheduler_kernel',
        'not_a_session_or_memory_store',
        'not_a_domain_truth_owner',
        'not_a_concrete_executor',
        'not_a_private_fork_of_hermes_agent',
      ],
      hermes_runtime: {
        binary: hermes.binary,
        version: hermes.version,
        gateway_service: hermes.gateway_service,
        issues: hermes.issues,
      },
      reconcile,
      registration_registry: {
        surface_kind: 'opl_runtime_manager_registration_registry',
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
          'Only promote beyond a thin manager if Hermes cannot express required task, wakeup, approval, audit, or product isolation contracts.',
      },
      notes: [
        'Hermes-Agent remains the external long-running runtime substrate owner.',
        'OPL Runtime Manager is a product-managed adapter and projection layer.',
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
      input.skipNativeHelpers
        ? 'Dry run did not run native helper repair, did not write refreshed native indexes, and did not reinstall the Hermes gateway service. Native-helper recommendations were omitted by request.'
        : 'Dry run did not run native helper repair, did not write refreshed native indexes, and did not reinstall the Hermes gateway service.',
  }));

  if (input.mode === 'dry_run') {
    return {
      version: 'g2',
      runtime_manager_action: {
        surface_kind: 'opl_runtime_manager_action',
        mode: input.mode,
        dry_run: true,
        status: 'planned',
        note:
          'Dry run did not run native helper repair, did not write refreshed native indexes, and did not reinstall the Hermes gateway service.',
        before: summarizeRuntimeManagerForAction(before),
        after: null,
        planned_actions: plannedActions,
        executed_actions: [],
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
    if (action.action_id === 'repair_hermes_gateway') {
      executedActions.push(runHermesGatewayAction());
      continue;
    }

    if (action.action_id === 'repair_native_helpers') {
      const repair = runNativeHelperRepairAction();
      executedActions.push({
        action_id: action.action_id,
        status: repair.status === 'completed' || repair.status === 'skipped_ready' ? 'completed' : repair.status,
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
      command_preview: action.command ? action.command.split(' ') : [],
      note: 'No Runtime Manager apply implementation exists for this recommendation.',
    });
  }

  after ??= buildRuntimeManager({ persistNativeIndexes: false });
  const afterSummary = summarizeRuntimeManagerForAction(after);
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
        'Apply executed only Runtime Manager adapter actions backed by existing OPL helper and external Hermes gateway surfaces.',
      before: summarizeRuntimeManagerForAction(before),
      after: afterSummary,
      planned_actions: plannedActions,
      executed_actions: executedActions,
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

function runHermesGatewayAction() {
  try {
    const repair = runProductEntryRepairHermesGateway();
    return {
      action_id: 'repair_hermes_gateway',
      status: repair.product_entry.gateway_service.loaded ? 'completed' : 'failed',
      command_preview: repair.product_entry.install_command_preview,
      details: repair.product_entry,
    };
  } catch (error) {
    return {
      action_id: 'repair_hermes_gateway',
      status: 'failed',
      command_preview: ['hermes', 'gateway', 'install'],
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function buildRuntimeManagerReconcile(
  hermes: ReturnType<typeof inspectHermesRuntime>,
  nativeHelperProjection: ReturnType<typeof buildNativeHelperProjection>,
) {
  const recommendedActions = [];
  const hermesInstalled = Boolean(hermes.binary && hermes.version);
  const hermesReady = Boolean(hermesInstalled && hermes.gateway_service.loaded);
  const nativeRuntimeStatus = nativeHelperProjection.runtime.status;
  const indexFreshnessStatus = nativeHelperProjection.persistence.freshness.status;

  if (!hermesInstalled) {
    recommendedActions.push({
      action_id: 'install_or_start_hermes',
      priority: 'p0_runtime_substrate',
      blocking: true,
      command: 'opl engine install --engine hermes',
      reason: 'Hermes-Agent is the external long-running runtime substrate and is not ready.',
    });
  } else if (!hermes.gateway_service.loaded) {
    recommendedActions.push({
      action_id: 'repair_hermes_gateway',
      priority: 'p0_runtime_substrate',
      blocking: true,
      command: 'opl runtime repair-gateway',
      reason: 'Hermes-Agent is installed, but the external gateway service is not loaded.',
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
    overall_status: hermesReady && recommendedActions.length === 0 ? 'ready' : 'attention_needed',
    checked_surfaces: {
      hermes_runtime: hermesReady ? 'ready' : 'needs_runtime_setup',
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
