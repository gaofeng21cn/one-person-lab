import { buildCurrentOwnerDeltaTopline } from './current-owner-delta-topline.ts';

type JsonRecord = Record<string, unknown>;

type OplAppOperatorViewModelInput = {
  profile: 'fast' | 'full';
  core: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  provider: JsonRecord;
  release: JsonRecord;
  paths: JsonRecord;
  actions: ReadonlyArray<JsonRecord>;
  uiDefaults: JsonRecord;
  runtimeActivityItems: ReadonlyArray<JsonRecord>;
  currentOwnerDeltaReadModel?: JsonRecord;
};

const FORBIDDEN_FAST_PROFILE_FIELDS = [
  'runtime_tray_snapshot',
  'raw_evidence_envelope',
  'raw_evidence_browser',
  'raw_ledger_browser',
  'ledger_browser',
  'stage_replay_packet_body',
  'private_residue_inventory_body',
  'provider_internal_ledger_body',
  'provider_internal_trace',
  'route_variant_menu',
] as const;

function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function statusTone(status: string | null) {
  if (!status) return 'neutral';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(status)
    ? 'ready'
    : 'attention';
}

function actionPayloadFields(action: JsonRecord) {
  return Array.isArray(action.payload_fields)
    ? action.payload_fields.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function actionIsPayloadFree(action: JsonRecord) {
  return actionPayloadFields(action).length === 0;
}

function buildSummaryCards(input: OplAppOperatorViewModelInput) {
  const codex = asRecord(asRecord(input.core.core).codex ?? asRecord(input.core).codex);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const releaseChannel = asString(input.release.channel) ?? 'unknown';
  const codexVersion = asString(codex.parsed_version) ?? asString(codex.version) ?? 'missing';
  const codexModel = [asString(codex.default_model), asString(codex.default_reasoning_effort)]
    .filter(Boolean)
    .join(' ');
  const temporalStatus = asString(temporal.status) ?? asString(temporal.health_status) ?? 'unknown';
  const defaultModuleCount = asNumber(moduleSummary.default_modules_count);
  const healthyModuleCount = asNumber(moduleSummary.healthy_default_modules_count);
  const moduleValue = defaultModuleCount === null || healthyModuleCount === null
    ? 'unknown'
    : `${healthyModuleCount}/${defaultModuleCount}`;

  return [
    {
      card_id: 'active_projects',
      label: 'Active projects',
      value: input.runtimeActivityItems.filter((item) => asString(item.lane) === 'running').length,
      tone: input.runtimeActivityItems.some((item) => asString(item.lane) === 'running') ? 'running' : 'idle',
      source_ref: 'app_state.operator.workbench.activity_center.active_projects',
    },
    {
      card_id: 'runtime_status',
      label: 'Runtime status',
      value: temporal.ready === true ? 'ready' : 'attention_needed',
      tone: temporal.ready === true ? 'ready' : 'attention',
      source_ref: 'app_state.provider.temporal',
    },
    {
      card_id: 'codex_cli',
      label: 'Codex CLI',
      value: [codexVersion, codexModel].filter(Boolean).join(' / '),
      tone: codexVersion === 'missing' ? 'attention' : 'ready',
      source_ref: 'app_state.core.codex',
    },
    {
      card_id: 'temporal_provider',
      label: 'Temporal provider',
      value: temporalStatus,
      tone: statusTone(temporalStatus),
      source_ref: 'app_state.provider.temporal',
    },
    {
      card_id: 'runtime_modules',
      label: 'Runtime modules',
      value: moduleValue,
      tone: defaultModuleCount !== null && healthyModuleCount === defaultModuleCount ? 'ready' : 'attention',
      source_ref: 'app_state.modules.summary',
    },
    {
      card_id: 'release_channel',
      label: 'Release channel',
      value: releaseChannel,
      tone: statusTone(releaseChannel),
      source_ref: 'app_state.release',
    },
  ];
}

function buildSections(input: OplAppOperatorViewModelInput) {
  const temporal = asRecord(asRecord(input.provider).temporal);
  const developerMode = asRecord(input.developerMode);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  return [
    {
      section_id: 'home',
      label: 'Home',
      state: 'ready',
      source_ref: 'app_state.ui_defaults',
      lazy: false,
    },
    {
      section_id: 'runtime',
      label: 'Runtime',
      state: temporal.ready === true ? 'ready' : 'attention_needed',
      source_ref: 'app_state.operator.workbench',
      lazy: false,
    },
    {
      section_id: 'settings_system',
      label: 'System settings',
      state: asString(developerMode.effective_state) ?? 'unknown',
      source_ref: 'app_state.developer_mode + app_state.paths',
      lazy: false,
    },
    {
      section_id: 'settings_runtime',
      label: 'Runtime settings',
      state: asNumber(moduleSummary.default_modules_count) === null ? 'unknown' : 'ready',
      source_ref: 'app_state.modules + app_state.provider',
      lazy: false,
    },
    {
      section_id: 'full_runtime_drilldown',
      label: 'Full runtime drilldown',
      state: 'lazy',
      source_ref: 'opl runtime app-operator-drilldown --detail full --json',
      lazy: true,
    },
  ];
}

function buildNavigation() {
  return {
    primary_items: [
      { item_id: 'home', label: 'Home', section_ref: 'home' },
      { item_id: 'runtime', label: 'Runtime', section_ref: 'runtime' },
      { item_id: 'settings', label: 'Settings', section_ref: 'settings_system' },
      { item_id: 'update', label: 'Update', section_ref: 'release_channel' },
    ],
    replacement_policy: 'app_repo_owns_navigation_truth_shell_renders_typed_items',
  };
}

function buildActionQueue(input: OplAppOperatorViewModelInput) {
  const limit = input.profile === 'fast' ? 16 : 48;
  return {
    items: input.actions.slice(0, limit).map((action, index) => {
      const actionId = asString(action.action_id) ?? `app-action-${index + 1}`;
      const payloadFree = actionIsPayloadFree(action);
      return {
        item_id: `action:${actionId}`,
        task_id: actionId,
        title: asString(action.label) ?? actionId,
        subtitle: asString(action.delegated_surface) ?? 'opl app action execute',
        domain_id: asString(action.module_id) ?? 'opl',
        domain_label: 'OPL',
        state: payloadFree ? 'ready' : 'payload_required',
        priority_bucket: payloadFree ? 'can_dry_run' : 'needs_payload',
        safe_action_ref_count: payloadFree ? 1 : 0,
        blocker_ref_count: payloadFree ? 0 : 1,
        paper_route_lens_ref_count: 0,
      };
    }),
    item_limit: limit,
    source_ref: 'app_state.actions',
  };
}

function sourceRefCount(item: JsonRecord) {
  return asRecordArray(item.source_refs).length;
}

function commandRoute(item: JsonRecord) {
  const command = asString(item.command);
  if (command) {
    return command;
  }
  const commands = asRecordArray(item.recommended_commands);
  return asString(commands[0]?.command);
}

function activityState(item: JsonRecord) {
  const lane = asString(item.lane);
  if (lane === 'running') {
    return 'running';
  }
  if (lane === 'attention') {
    return 'attention_needed';
  }
  return asString(item.status) ?? 'recent';
}

function activityPriorityBucket(item: JsonRecord) {
  const lane = asString(item.lane);
  if (lane === 'running') {
    return 'running';
  }
  if (lane === 'attention') {
    return 'needs_attention';
  }
  return 'recent';
}

function normalizeRuntimeActivityItem(item: JsonRecord, index: number) {
  const studyId = asString(item.study_id);
  const taskId = asString(item.item_id)
    ?? (studyId ? `medautoscience:study:${studyId}` : `runtime-activity-${index + 1}`);
  const title = asString(item.title) ?? studyId ?? taskId;
  const activeRunId = asString(item.active_run_id);
  const nextVisibleStep = asString(item.next_action_summary)
    ?? asString(item.action_summary)
    ?? asString(item.summary);
  const route = commandRoute(item);

  return {
    task_id: taskId,
    domain_id: asString(item.project_id) ?? 'opl',
    domain_label: asString(item.project_label) ?? asString(item.domain_owner) ?? 'OPL',
    title,
    state: activityState(item),
    status: asString(item.status),
    status_label: asString(item.status_label),
    priority_bucket: activityPriorityBucket(item),
    active_stage_id: asString(item.status) ?? asString(item.health_status) ?? asString(item.lane),
    active_stage_label: asString(item.status_label),
    active_run_id: activeRunId,
    next_visible_step: nextVisibleStep,
    last_progress_at: asString(item.updated_at),
    workspace_path: asString(item.workspace_path),
    study_id: studyId,
    source_ref_count: sourceRefCount(item),
    blocker_ref_count: asRecordArray(item.blockers).length,
    safe_action_ref_count: route ? 1 : 0,
    paper_route_lens_ref_count: 0,
    active_path: [
      {
        node_id: taskId,
        node_kind: studyId ? 'mas_study_runtime_projection' : 'runtime_activity_projection',
        label: title,
        state: activityState(item),
        owner: 'opl_framework',
        ref: route,
      },
    ],
  };
}

function runtimeActivityDrilldowns(input: OplAppOperatorViewModelInput) {
  return input.runtimeActivityItems.map(normalizeRuntimeActivityItem);
}

function moduleTaskDrilldowns(input: OplAppOperatorViewModelInput) {
  return asRecordArray(asRecord(input.modules).items).map((module, index) => {
    const moduleId = asString(module.module_id) ?? `module-${index + 1}`;
    const label = asString(module.label) ?? moduleId;
    const healthStatus = asString(module.health_status) ?? asString(module.status) ?? 'unknown';
    return {
      task_id: moduleId,
      domain_id: moduleId,
      title: label,
      state: healthStatus,
      active_stage_id: 'module_runtime',
      stage_attempt_ids: [],
      safe_action_ref_count: 0,
      blocker_ref_count: statusTone(healthStatus) === 'ready' ? 0 : 1,
      paper_route_lens_ref_count: 0,
      active_path: [
        {
          node_id: `module:${moduleId}`,
          node_kind: 'stage_attempt',
          label,
          state: healthStatus,
          owner: 'opl_framework',
          ref: asString(module.checkout_path) ?? asString(module.managed_checkout_path) ?? undefined,
        },
      ],
    };
  });
}

function buildActivityCenter(input: OplAppOperatorViewModelInput) {
  const activityDrilldowns = runtimeActivityDrilldowns(input);
  return {
    source_ref: 'runtime_tray_snapshot.running_items + attention_items + recent_items refs-only projection',
    needs_attention: activityDrilldowns.filter((item) => item.priority_bucket === 'needs_attention'),
    active_projects: activityDrilldowns.filter((item) => item.priority_bucket === 'running'),
    recent_projects: activityDrilldowns.filter((item) => item.priority_bucket === 'recent'),
  };
}

function buildDomainLaneMap(input: OplAppOperatorViewModelInput) {
  const runtimeTasksByDomain = new Map<string, ReturnType<typeof normalizeRuntimeActivityItem>[]>();
  for (const task of runtimeActivityDrilldowns(input)) {
    const domainId = asString(task.domain_id) ?? 'opl';
    runtimeTasksByDomain.set(domainId, [...(runtimeTasksByDomain.get(domainId) ?? []), task]);
  }

  return {
    lanes: asRecordArray(asRecord(input.modules).items).map((module, index) => {
      const moduleId = asString(module.module_id) ?? `module-${index + 1}`;
      const label = asString(module.label) ?? moduleId;
      const healthStatus = asString(module.health_status) ?? asString(module.status) ?? 'unknown';
      const runtimeTasks = runtimeTasksByDomain.get(moduleId) ?? [];
      const moduleTask = {
        task_id: moduleId,
        label,
        state: healthStatus,
        active_stage_id: 'module_runtime',
        active_path_node_ids: [`module:${moduleId}`],
        paper_route_lens_ref_count: 0,
      };
      const tasks = runtimeTasks.length > 0
        ? runtimeTasks.map((task) => ({
            task_id: task.task_id,
            label: task.title,
            state: task.state,
            active_stage_id: task.active_stage_id,
            active_path_node_ids: [task.task_id],
            study_id: task.study_id,
            active_run_id: task.active_run_id,
            paper_route_lens_ref_count: task.paper_route_lens_ref_count,
          }))
        : [moduleTask];
      return {
        domain_id: moduleId,
        lane_label: label,
        active_task_count: tasks.filter((task) => task.state === 'running').length,
        blocked_task_count: statusTone(healthStatus) === 'ready'
          ? tasks.filter((task) => task.state === 'attention_needed').length
          : 1,
        paper_route_lens_ref_count: 0,
        tasks,
      };
    }),
    source_ref: 'app_state.modules.items + app_state.operator.workbench.activity_center',
  };
}

function buildTaskDrilldowns(input: OplAppOperatorViewModelInput) {
  return [
    ...runtimeActivityDrilldowns(input),
    ...moduleTaskDrilldowns(input),
  ];
}

function buildSafeActionRoutes(input: OplAppOperatorViewModelInput) {
  return input.actions
    .filter(actionIsPayloadFree)
    .slice(0, input.profile === 'fast' ? 12 : 48)
    .map((action, index) => {
      const actionId = asString(action.action_id) ?? `app-action-${index + 1}`;
      return {
        action_id: actionId,
        label: asString(action.label) ?? actionId,
        owner: 'opl_framework',
        route: `opl app action execute --action ${actionId}`,
        dry_run_required: true,
        source_ref: 'app_state.actions',
      };
    });
}

function buildDynamicVerticalMap(input: OplAppOperatorViewModelInput) {
  const safeActions = buildSafeActionRoutes(input);
  const rootNode = {
    node_id: 'route_graph:opl_app_state',
    node_kind: 'route_graph',
    label: 'OPL App state',
    state: 'ready',
    owner: 'opl_framework',
    ref: 'opl app state --profile fast --json',
  };
  const actionNodes = safeActions.slice(0, 8).map((action) => ({
    node_id: `safe_action:${action.action_id}`,
    node_kind: 'safe_action',
    label: action.label,
    state: 'ready',
    owner: action.owner,
    ref: action.route,
  }));
  return {
    nodes: [rootNode, ...actionNodes],
    edges: actionNodes.map((node) => ({
      from_node_id: rootNode.node_id,
      to_node_id: node.node_id,
      edge_kind: 'attempt_has_safe_action_route',
      label: 'safe action',
    })),
    node_limit: input.profile === 'fast' ? 9 : 49,
    source_ref: 'app_state.operator.workbench.safe_action_routes',
  };
}

function buildDefaultReadSurfacePolicy(input: OplAppOperatorViewModelInput) {
  return {
    surface_kind: 'opl_app_default_read_surface_policy',
    schema_version: 'default-read-surface-policy.v1',
    profile: input.profile,
    default_operator_payload: 'current_owner_delta',
    normal_state_surface: 'opl app state --profile fast --json',
    full_state_surface: 'opl app state --profile full --json',
    full_runtime_drilldown_surface: 'opl runtime app-operator-drilldown --detail full --json',
    raw_runtime_projection_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    runtime_tray_projection_policy: 'current_owner_delta_first_runtime_tray_worklist_audit_tail_drilldown',
    worklist_projection_policy: 'secondary_drilldown_never_default_planning_root',
    first_screen_answers: [
      'current_owner_delta',
      'next_safe_action_or_none',
      'current_owner',
      'required_delta',
      'accepted_return_shapes',
      'readiness_false_flags',
      'hard_gate',
      'latest_owner_answer_ref',
    ],
    diagnostic_only_answers: [
      'count_summary',
      'audit_next_safe_action_or_none',
      'full_detail_refs',
    ],
    fast_profile_excludes: [
      ...FORBIDDEN_FAST_PROFILE_FIELDS,
    ],
    forbidden_fast_profile_fields: [...FORBIDDEN_FAST_PROFILE_FIELDS],
    shell_contract: {
      shell_must_not_use_full_drilldown_as_normal_state: true,
      shell_must_not_derive_layout_from_raw_runtime_projection: true,
      full_detail_auto_poll: false,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}

export function buildOplAppOperatorViewModel(input: OplAppOperatorViewModelInput) {
  const temporal = asRecord(asRecord(input.provider).temporal);
  const status = temporal.ready === true ? 'ready' : 'attention_needed';
  const safeActionRoutes = buildSafeActionRoutes(input);
  const currentOwnerDeltaReadModel = asRecord(input.currentOwnerDeltaReadModel);
  const currentOwnerDeltaTopline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel,
  });
  const defaultReadSurfacePolicy = buildDefaultReadSurfacePolicy(input);
  const lazyRefs = [
    {
      ref_id: 'full_app_state_refresh',
      surface: 'opl app state --profile full --json',
      policy: 'manual_refresh_or_section_level_refresh',
    },
    {
      ref_id: 'full_runtime_drilldown',
      surface: 'opl runtime app-operator-drilldown --detail full --json',
      policy: 'on_demand_diagnostic_only',
    },
  ];

  return {
    status,
    summary: {
      runtime_status: status,
      provider_status: asString(temporal.status) ?? asString(temporal.health_status) ?? 'unknown',
      visible_action_count: input.actions.length,
      profile: input.profile,
    },
    full_detail_surface: 'opl runtime app-operator-drilldown --detail full --json',
    default_read_surface_policy: defaultReadSurfacePolicy,
    ...currentOwnerDeltaTopline,
    workbench: {
      view_model_schema: 'opl_app_operator_workbench.v1',
      default_read_surface_policy: defaultReadSurfacePolicy,
      ...currentOwnerDeltaTopline,
      summary_cards: buildSummaryCards(input),
      sections: buildSections(input),
      navigation: buildNavigation(),
      action_queue: buildActionQueue(input),
      activity_center: buildActivityCenter(input),
      domain_lane_map: buildDomainLaneMap(input),
      task_drilldowns: buildTaskDrilldowns(input),
      safe_action_routes: safeActionRoutes,
      refresh_policy: {
        summary_poll_interval_seconds: 10,
        full_detail_auto_poll: false,
        per_token_streaming: false,
        failure_policy: 'section_level_status_with_last_good_display_cache_allowed',
      },
      performance_policy: {
        fast_json_target_bytes: 200000,
        fast_json_max_bytes: 500000,
        first_screen_action_limit: input.profile === 'fast' ? 16 : 48,
        global_map_renderer: 'bounded_typed_view_model',
        graph_layout_recompute: 'on_input_hash_change',
        shell_must_not_derive_layout_from_raw_runtime_projection: true,
        shell_must_not_use_full_drilldown_as_normal_state: true,
      },
      lazy_refs: lazyRefs,
    },
    dynamic_vertical_map: buildDynamicVerticalMap(input),
    visual_ref_groups: {
      needs_attention_refs: buildActivityCenter(input).needs_attention,
      active_project_refs: buildActivityCenter(input).active_projects,
      recent_project_refs: buildActivityCenter(input).recent_projects,
      safe_action_refs: safeActionRoutes.map((action) => ({
        ref: action.route,
        label: action.label,
        action_id: action.action_id,
      })),
      lazy_refs: lazyRefs,
    },
    owner_boundary: {
      app_repo: 'gui_product_truth_and_release_gate_owner',
      opl_framework: 'app_state_action_and_runtime_projection_owner',
      shell: 'thin_renderer_and_ipc_adapter',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_quality_verdict: false,
    },
    refs: lazyRefs.map((entry) => ({
      ref: entry.surface,
      label: entry.ref_id,
      node_kind: 'lazy_ref',
    })),
  };
}
