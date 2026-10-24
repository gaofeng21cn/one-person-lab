import { compactStorageOwnerInventorySnapshot } from '../../adapters/integration/public/app-state.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';
import type { buildManagedUpdateKernelProjection } from '../../adapters/integration/public/app-state.ts';

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function pickRecordFields(value: unknown, fields: readonly string[]): JsonRecord {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(
    fields.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]]),
  ) as JsonRecord;
}

export function compactFastProviderState(value: unknown) {
  const provider = isRecord(value) ? value : {};
  const temporal = isRecord(provider.temporal) ? provider.temporal : {};
  const details = isRecord(temporal.details) ? temporal.details : {};
  const workerReadiness = isRecord(details.worker_readiness) ? details.worker_readiness : {};
  const serviceLifecycle = isRecord(workerReadiness.temporal_service_lifecycle)
    ? workerReadiness.temporal_service_lifecycle
    : {};
  const workerMutationGuard = isRecord(workerReadiness.worker_mutation_guard)
    ? workerReadiness.worker_mutation_guard
    : {};
  const serviceSupervisor = isRecord(serviceLifecycle.supervisor)
    ? serviceLifecycle.supervisor
    : {};
  const serviceRepairAction = isRecord(serviceLifecycle.repair_action)
    ? serviceLifecycle.repair_action
    : {};
  const scheduler = isRecord(details.scheduler) ? details.scheduler : {};
  const visibilityReadiness = isRecord(workerReadiness.visibility_readiness)
    ? workerReadiness.visibility_readiness
    : {};
  return {
    selected_provider: provider.selected_provider,
    temporal: {
      ...pickRecordFields(temporal, [
        'required_for',
        'health_status',
        'status',
        'ready',
        'degraded_reason',
        'capabilities',
        'management',
      ]),
      details: {
        ...pickRecordFields(details, [
          'inspection_detail',
          'address',
          'address_source',
          'namespace',
          'task_queue',
          'adapter_mode',
          'worker_ready',
          'scheduler_status',
          'runtime_dependency',
          'required_env',
        ]),
        worker_readiness: {
          ...pickRecordFields(workerReadiness, [
            'inspection_detail',
            'readiness_status',
            'service_ready',
            'worker_ready',
            'server_reachable',
            'blockers',
          ]),
          temporal_service_lifecycle: {
            ...pickRecordFields(serviceLifecycle, [
              'inspection_detail',
              'service_status',
              'address_source',
              'server_reachable',
              'managed_service_pid',
              'service_kind',
              'blockers',
            ]),
            supervisor: pickRecordFields(serviceSupervisor, [
              'surface_kind',
              'status',
              'installed',
              'loaded',
              'ready',
              'observed_at',
              'error',
              'supported',
              'applicable',
              'required',
              'configuration_current',
              'process_state',
              'pid',
              'last_exit_status',
              'last_exit_signal',
              'run_at_load',
              'keep_alive',
              'throttle_interval_seconds',
              'address',
              'database_path',
              'launcher_source',
              'schedule_independent',
            ]),
            repair_action: pickRecordFields(serviceRepairAction, [
              'surface_kind',
              'provider_kind',
              'supervisor_applicable',
              'supervisor_required',
              'action_id',
              'next_command',
            ]),
          },
          worker_mutation_guard: pickRecordFields(workerMutationGuard, [
            'mutation_guard_status',
            'allowed',
            'state_dir_explicit',
            'explicit_developer_override',
          ]),
          visibility_readiness: pickRecordFields(visibilityReadiness, [
            'readiness_status',
            'visibility_mode',
            'execution_ready',
            'indexing_ready',
            'degraded_reason',
            'governance',
            'status',
            'reason',
            'inspection_detail',
          ]),
        },
        scheduler: pickRecordFields(scheduler, [
          'status',
          'ready',
          'observed_at',
          'schedule_status',
          'health_status',
          'degraded_reason',
          'repair_action',
          'inspection_error',
        ]),
        detail_policy: {
          detail: 'startup',
          full_detail_surface: 'opl app state --profile full --json#provider.temporal.details',
        },
      },
    },
  };
}

export function compactFastActionCatalog(actions: ReadonlyArray<JsonRecord>) {
  return actions.map((action) => pickRecordFields(action, [
    'action_id',
    'label',
    'surface',
    'owner',
    'delegated_surface',
    'route',
    'payload_fields',
    'mutates',
    'submit_via',
    'execution_policy',
    'route_requires_domain_or_app_payload',
    'can_submit_to_safe_action_shell',
    'dry_run_supported',
    'confirmation_required',
    'danger_level',
  ]));
}

function compactFastDockerWebuiReadModel(value: unknown) {
  const dockerWebui = isRecord(value) ? value : {};
  const runtimeProxy = isRecord(dockerWebui.runtime_proxy) ? dockerWebui.runtime_proxy : {};
  const failureRecovery = isRecord(dockerWebui.failure_recovery) ? dockerWebui.failure_recovery : {};
  return {
    ...pickRecordFields(dockerWebui, [
      'surface_kind',
      'ordinary_status',
      'doctor_surface',
      'doctor_read_model_ref',
      'action_ids',
      'issue_ids',
    ]),
    runtime_proxy: pickRecordFields(runtimeProxy, ['status', 'status_code', 'source_ref']),
    failure_recovery: pickRecordFields(failureRecovery, ['status', 'status_code', 'source_ref']),
    ordinary_next_actions: recordArray(dockerWebui.ordinary_next_actions).map((action) =>
      pickRecordFields(action, [
        'action_id',
        'label',
        'state',
        'route',
        'dry_run_route',
        'payload_required',
        'payload_fields',
        'confirmation_required',
        'danger_level',
      ])),
    detail_policy: {
      detail: 'startup',
      full_detail_surface:
        'opl app state --profile full --json#settings_control_center.app_settings_read_model.docker_webui',
    },
  };
}

export function compactFastSettingsControlCenter(value: unknown) {
  const settings = isRecord(value) ? value : {};
  const readModel = isRecord(settings.app_settings_read_model) ? settings.app_settings_read_model : {};
  return {
    ...pickRecordFields(settings, [
      'surface_kind',
      'schema_version',
      'compatibility_schema_versions',
      'profile',
      'owner',
      'contract_ref',
      'read_surface',
      'action_surface',
      'allowed_action_ids',
      'status_summary',
      'surface_policy',
      'configuration_catalog',
      'connection_registry',
      'issue_queue',
      'authority_boundary',
    ]),
    app_settings_read_model: {
      ...pickRecordFields(readModel, [
        'surface_kind',
        'schema_version',
        'owner',
        'source_surface',
        'opl_gateway_account',
        'resource_sources',
        'local_environment',
        'access_api_key',
        'codex_model_policy',
        'connections',
        'workspace_services',
        'action_policy',
        'shell_policy',
        'source_refs',
      ]),
      docker_webui: compactFastDockerWebuiReadModel(readModel.docker_webui),
      storage_lifecycle: compactStorageOwnerInventorySnapshot(readModel.storage_lifecycle),
    },
    task_entries: [],
    action_catalog: [],
    detail_policy: {
      task_entries: 'deferred',
      action_catalog: 'deferred',
      settings_ia: 'deferred',
      settings_projection: 'deferred',
      layout_source: 'one-person-lab-app/contracts/app-product-profile.json#settings_control_center',
      startup_layout_policy: 'read_persisted_app_narrow_snapshot_then_refresh_in_background',
      broad_app_state_layout_inference: 'forbidden',
      full_detail_surface: 'opl app state --profile full --json#settings_control_center',
    },
  };
}

export function compactFastLegacyAgentPackageDirectory(value: unknown) {
  return {
    ...pickRecordFields(value, [
      'surface_kind',
      'status',
      'installed_package_count',
      'home_shortcut_preferences',
      'recommended_action',
      'detail_policy',
    ]),
    source_ref: 'app_state.agent_packages.directory',
  };
}

export function compactFastLegacyAgentPackageStatus(value: unknown) {
  return {
    ...pickRecordFields(value, [
      'surface_kind',
      'status',
      'installed_package_count',
      'status_read_failure_count',
      'home_shortcut_preferences',
      'diagnostics',
    ]),
    source_ref: 'app_state.agent_packages.status_index',
    detail_policy: {
      package_statuses: 'canonical_source_ref',
      full_detail_surface: 'opl app state --profile full --json#agent_packages.status_index',
    },
  };
}

function compactFastDefaultReadSurfacePolicy(value: unknown) {
  return pickRecordFields(value, [
    'surface_kind',
    'schema_version',
    'profile',
    'default_operator_payload',
    'default_planning_root',
    'normal_state_surface',
    'full_state_surface',
    'full_runtime_drilldown_surface',
    'raw_runtime_projection_policy',
    'worklist_projection_policy',
    'first_screen_answers',
    'fast_profile_excludes',
    'forbidden_fast_profile_fields',
    'shell_contract',
    'authority_boundary',
  ]);
}

function compactFastRuntimeTask(value: unknown) {
  const task = isRecord(value) ? value : {};
  return {
    task_id: task.task_id,
    domain_id: task.domain_id,
    domain_label: task.domain_label,
    title: task.title,
    state: task.state,
    status: task.status,
    status_label: task.status_label,
    priority_bucket: task.priority_bucket,
    active_stage_id: task.active_stage_id,
    active_stage_label: task.active_stage_label,
    active_run_id: task.active_run_id,
    next_visible_step: task.next_visible_step,
    last_progress_at: task.last_progress_at,
    study_id: task.study_id,
    runtime_readback_source: task.runtime_readback_source,
    runtime_attempt_status: task.runtime_attempt_status,
    runtime_closeout_observed: task.runtime_closeout_observed,
    primary_state: task.primary_state,
    primary_state_label: task.primary_state_label,
    automation_state: task.automation_state,
    automation_state_label: task.automation_state_label,
    running_proof_status: task.running_proof_status,
    typed_blocker_summary: task.typed_blocker_summary,
    typed_blocker_owner: task.typed_blocker_owner,
    runtime_blocker_summary: task.runtime_blocker_summary,
  };
}

function compactFastTaskRun(value: unknown) {
  const task = isRecord(value) ? value : {};
  return {
    ...compactFastRuntimeTask(task),
    conditions: recordArray(task.conditions).map((condition) => ({
      type: condition.type,
      status: condition.status,
      reason: condition.reason,
      severity: condition.severity,
      owner: condition.owner,
      ref: condition.ref,
    })),
  };
}

export function compactFastOperatorRuntimeProjection(operator: JsonRecord) {
  const workbench = isRecord(operator.workbench) ? operator.workbench : {};
  const taskRun = isRecord(workbench.task_run_projection_v2) ? workbench.task_run_projection_v2 : {};
  const workItemsV2 = isRecord(workbench.work_item_projection_v2) ? workbench.work_item_projection_v2 : {};
  const activityCenter = isRecord(workbench.activity_center) ? workbench.activity_center : {};
  const compactActivityCenter = {
    ...activityCenter,
    needs_attention: recordArray(activityCenter.needs_attention).map(compactFastRuntimeTask),
    active_projects: recordArray(activityCenter.active_projects).map(compactFastRuntimeTask),
    recent_projects: recordArray(activityCenter.recent_projects).map(compactFastRuntimeTask),
  };
  const compactVisualRefGroups = isRecord(operator.visual_ref_groups)
    ? Object.fromEntries(Object.entries(operator.visual_ref_groups).map(([key, value]) => [
        key,
        ['needs_attention_refs', 'active_project_refs', 'recent_project_refs'].includes(key)
          && Array.isArray(value)
          ? recordArray(value).map(compactFastRuntimeTask)
          : value,
      ]))
    : operator.visual_ref_groups;

  const currentOwnerDelta = isRecord(operator.current_owner_delta) ? operator.current_owner_delta : {};
  const currentOwnerDeltaReadModel = isRecord(operator.current_owner_delta_read_model)
    ? operator.current_owner_delta_read_model
    : {};
  const ordinaryCockpit = isRecord(operator.ordinary_cockpit) ? operator.ordinary_cockpit : {};
  const stageRunCockpit = isRecord(operator.stage_run_cockpit) ? operator.stage_run_cockpit : {};

  return {
    ...pickRecordFields(operator, [
      'status',
      'summary',
      'full_detail_surface',
      'stage_run_cockpit_summary',
      'operator_required_delta',
      'operator_current_owner_delta_owner',
      'operator_next_owner',
      'operator_next_action',
      'operator_next_action_kind',
      'operator_next_action_source',
      'operator_next_action_owner',
      'operator_next_required_action',
      'operator_next_missing_input_refs',
      'operator_next_required_ref_shape',
      'operator_payload_requirement',
      'operator_accepted_answer_shape',
      'operator_next_action_authority_boundary',
      'owner_boundary',
      'refs',
    ]),
    default_read_surface_policy: compactFastDefaultReadSurfacePolicy(operator.default_read_surface_policy),
    ordinary_cockpit: pickRecordFields(ordinaryCockpit, [
      'surface_kind',
      'schema_version',
      'display_payload_policy',
      'display_payload_fields',
      'display_payload',
      'developer_full_drilldown_only',
      'authority_boundary',
    ]),
    current_owner_delta: currentOwnerDelta,
    current_owner_delta_read_model: {
      ...pickRecordFields(currentOwnerDeltaReadModel, [
        'surface_kind',
        'schema_version',
        'current_owner',
        'required_delta',
        'default_summary',
        'next_safe_action_or_none',
        'accepted_return_shapes',
        'default_next_action_derivation_policy',
      ]),
      current_owner_delta: currentOwnerDelta,
    },
    stage_run_cockpit: {
      source_ref: 'opl runtime app-operator-drilldown --detail full --json#stage_run_cockpit',
      ...pickRecordFields(stageRunCockpit, [
        'projection_role',
        'next_required_owner_action',
        'authority_boundary',
      ]),
    },
    dynamic_vertical_map: {
      source_ref: 'opl runtime app-operator-drilldown --detail full --json#dynamic_vertical_map',
    },
    workbench: {
      ...pickRecordFields(workbench, [
        'view_model_schema',
        'user_task_status_summary',
        'summary_cards',
        'sections',
        'navigation',
        'action_queue',
        'domain_lane_map',
        'agent_availability',
        'safe_action_routes',
        'refresh_policy',
        'performance_policy',
        'lazy_refs',
        'settings_control_center',
        'managed_companions',
      ]),
      activity_center: compactActivityCenter,
      default_read_surface_policy: {
        source_ref: 'app_state.operator.default_read_surface_policy',
      },
      ordinary_cockpit: {
        source_ref: 'app_state.operator.ordinary_cockpit',
      },
      current_owner_delta: {
        source_ref: 'app_state.operator.current_owner_delta',
      },
      current_owner_delta_read_model: {
        source_ref: 'app_state.operator.current_owner_delta_read_model',
      },
      current_owner_delta_next_action: {
        source_ref: 'app_state.operator.current_owner_delta_next_action',
      },
      stage_run_cockpit: {
        source_ref: 'app_state.operator.stage_run_cockpit',
      },
      stage_run_cockpit_summary: {
        source_ref: 'app_state.operator.stage_run_cockpit_summary',
      },
      task_drilldowns: recordArray(workbench.task_drilldowns).map(compactFastRuntimeTask),
      task_run_projection_v2: {
        ...taskRun,
        tasks: recordArray(taskRun.tasks).map(compactFastTaskRun),
      },
      work_item_projection_v2: {
        ...workItemsV2,
        items: recordArray(workItemsV2.items),
      },
    },
    visual_ref_groups: compactVisualRefGroups,
    detail_policy: {
      detail: 'startup',
      full_detail_surface: 'opl runtime app-operator-drilldown --detail full --json',
    },
  };
}

export function compactFastManagedUpdateProjection(
  projection: Awaited<ReturnType<typeof buildManagedUpdateKernelProjection>>,
) {
  const managedUpdate = projection.managed_update;
  return {
    operation: managedUpdate.operation,
    update_channel: managedUpdate.update_channel,
    components: managedUpdate.components.map((component) => {
      const current = component.current;
      const dependencyCatalog = isRecord(current.dependency_catalog)
        ? current.dependency_catalog
        : null;
      const flowDependencies = dependencyCatalog && Array.isArray(dependencyCatalog.flow_dependencies)
        ? dependencyCatalog.flow_dependencies
        : null;
      const installedVersion = typeof current.installed_version === 'string'
        ? current.installed_version
        : typeof current.parsed_version === 'string'
          ? current.parsed_version
          : typeof current.codex_version === 'string'
            ? current.codex_version
            : null;

      return {
        component_id: component.component_id,
        lifecycle_owner: component.lifecycle_owner,
        label: component.label,
        state: component.state,
        channel: component.channel,
        current: {
          installed_version: installedVersion,
          latest_version: typeof current.latest_version === 'string'
            ? current.latest_version
            : null,
          ...(typeof current.currentness === 'string'
            ? { currentness: current.currentness }
            : {}),
          manual_guidance: typeof current.manual_guidance === 'string'
            ? current.manual_guidance
            : null,
          ...(flowDependencies
            ? { dependency_catalog: { flow_dependencies: flowDependencies } }
            : {}),
        },
        auto_apply: {
          mode: component.auto_apply.mode,
          eligible: component.auto_apply.eligible,
          app_background_safe: component.auto_apply.app_background_safe,
        },
        plan: {
          summary: component.plan.summary,
        },
      };
    }),
  };
}
