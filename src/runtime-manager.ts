import { inspectHermesRuntime } from './hermes.ts';

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

export function buildRuntimeManager() {
  const hermes = inspectHermesRuntime();
  const hermesReady = Boolean(hermes.binary && hermes.version && hermes.gateway_service.loaded);

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
        status: 'planned_optional_substrate',
        allowed_shape: 'small_json_stdio_or_cli_helpers_managed_by_opl',
        candidates: [
          {
            helper_id: 'opl-sysprobe',
            purpose: 'portable system, toolchain, and runtime dependency inspection',
          },
          {
            helper_id: 'opl-artifact-indexer',
            purpose: 'fast workspace artifact discovery without owning domain truth',
          },
          {
            helper_id: 'opl-state-indexer',
            purpose: 'high-frequency session, progress, and artifact projection indexing',
          },
        ],
      },
      state_index_target: {
        status: 'planned_contract_first',
        index_owner: 'one-person-lab',
        source_of_truth_rule: 'indexes project runtime surfaces but never replace domain-owned durable truth',
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
