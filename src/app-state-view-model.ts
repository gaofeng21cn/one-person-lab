import { buildCurrentOwnerDeltaTopline } from './current-owner-delta-topline.ts';
import { buildTaskRunProjectionV2 } from './app-state-task-run-projection.ts';

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
  settingsControlCenter: JsonRecord;
  uiDefaults: JsonRecord;
  runtimeActivityItems: ReadonlyArray<JsonRecord>;
  brandSystemProfile: JsonRecord;
  targetOperatingArchitecture: JsonRecord;
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

const ORDINARY_COCKPIT_DISPLAY_FIELDS = [
  'purpose',
  'task',
  'current_owner',
  'next_action',
  'artifact_or_blocker',
] as const;

const ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY = [
  'provider',
  'ledger',
  'worklist',
  'mcp_tool_catalog',
  'raw_receipts',
  'release_evidence',
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
      section_id: 'settings_control_center',
      label: 'Settings Control Center',
      state: asString(asRecord(input.settingsControlCenter).surface_kind) ? 'available' : 'unknown',
      source_ref: 'app_state.settings_control_center',
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

function taskUserProjectionRefs(input: {
  taskId: string;
  domainId: string;
  state: string;
  stageId: string;
  stageLabel: string | null;
  blockerRefCount: number;
}) {
  const encodedTaskId = encodeURIComponent(input.taskId);
  const encodedDomainId = encodeURIComponent(input.domainId);
  const encodedStageId = encodeURIComponent(input.stageId);
  return {
    stage: {
      stage_id: input.stageId,
      label: input.stageLabel,
      current_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
      lineage_ref: `opl://domains/${encodedDomainId}/stages/${encodedStageId}/lineage`,
      conformance_ref: 'contracts/opl-framework/stage-run-kernel-contract.json#app_user_task_projection',
    },
    progress: {
      status: input.state,
      label: input.stageLabel ?? input.state,
      source_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
    },
    next_owner: {
      owner: input.domainId,
      source_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
    },
    artifact_or_blocker: {
      current_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}`,
      canonical_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/canonical`,
      export_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/exports`,
      export_bundle_refs: [
        `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/export-bundles/latest`,
      ],
      lineage_ref: `opl://domains/${encodedDomainId}/stages/${encodedStageId}/lineage`,
      receipt_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/artifact-receipt`,
      conformance_ref: 'contracts/opl-framework/stage-artifact-runtime-contract.json#refs_only_artifact_projection',
      blocker_ref_count: input.blockerRefCount,
      content_policy: 'refs_only_no_artifact_body',
      export_bundle_action_ref: 'app_state.actions#task_export_bundle_preview',
    },
    review_receipt: {
      reviewer_ref: `opl://domains/${encodedDomainId}/reviewers/default`,
      check_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/review-check`,
      status: input.blockerRefCount > 0 ? 'attention_needed' : 'refs_available',
      issue_ref_count: input.blockerRefCount,
      issues_ref: `app_state.operator.workbench.task_drilldowns.${encodedTaskId}.blocker_refs`,
      next_action: input.blockerRefCount > 0 ? 'route_to_domain_owner' : 'wait_for_domain_owner_receipt',
      receipt_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/reviewer-receipt`,
      authority_policy: 'receipt_summary_refs_only_no_quality_verdict_authority',
    },
    action_receipt: {
      action_id: 'task_action_receipt_preview',
      route: 'opl app action execute --action task_action_receipt_preview --dry-run',
      dry_run_required: true,
      preview_ref: `opl://app-action-previews/${encodedTaskId}/receipt`,
      content_policy: 'refs_only_no_action_receipt_body',
      export_bundle_action_id: 'task_export_bundle_preview',
      export_bundle_route: 'opl app action execute --action task_export_bundle_preview --dry-run',
    },
    workflow_refs: {
      current_workflow_ref: `opl://domains/${encodedDomainId}/tasks/${encodedTaskId}/workflows/current`,
      stage_workflow_ref: `opl://domains/${encodedDomainId}/stages/${encodedStageId}/workflow`,
      content_policy: 'refs_only_no_workflow_body',
    },
  };
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
  const state = activityState(item);
  const stageId = asString(item.status) ?? asString(item.health_status) ?? asString(item.lane) ?? 'runtime_activity';
  const blockerRefCount = asRecordArray(item.blockers).length;
  const refs = taskUserProjectionRefs({
    taskId,
    domainId: asString(item.project_id) ?? 'opl',
    state,
    stageId,
    stageLabel: asString(item.status_label),
    blockerRefCount,
  });

  return {
    task_id: taskId,
    domain_id: asString(item.project_id) ?? 'opl',
    domain_label: asString(item.project_label) ?? asString(item.domain_owner) ?? 'OPL',
    title,
    state,
    status: asString(item.status),
    status_label: asString(item.status_label),
    priority_bucket: activityPriorityBucket(item),
    active_stage_id: stageId,
    active_stage_label: asString(item.status_label),
    active_run_id: activeRunId,
    next_visible_step: nextVisibleStep,
    last_progress_at: asString(item.updated_at),
    workspace_path: asString(item.workspace_path),
    study_id: studyId,
    source_ref_count: sourceRefCount(item),
    blocker_ref_count: blockerRefCount,
    safe_action_ref_count: route ? 1 : 0,
    paper_route_lens_ref_count: 0,
    ...refs,
    active_path: [
      {
        node_id: taskId,
        node_kind: studyId ? 'mas_study_runtime_projection' : 'runtime_activity_projection',
        label: title,
        state,
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
    const blockerRefCount = statusTone(healthStatus) === 'ready' ? 0 : 1;
    const refs = taskUserProjectionRefs({
      taskId: moduleId,
      domainId: moduleId,
      state: healthStatus,
      stageId: 'module_runtime',
      stageLabel: null,
      blockerRefCount,
    });
    return {
      task_id: moduleId,
      domain_id: moduleId,
      title: label,
      state: healthStatus,
      active_stage_id: 'module_runtime',
      stage_attempt_ids: [],
      safe_action_ref_count: 0,
      blocker_ref_count: blockerRefCount,
      paper_route_lens_ref_count: 0,
      ...refs,
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

function ownerKey(value: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
}

function selectOrdinaryCockpitTaskFallback(
  currentOwner: string,
  runtimeActivityItems: ReadonlyArray<JsonRecord>,
) {
  const currentOwnerKey = ownerKey(currentOwner);
  const matching = runtimeActivityItems.filter((item) => {
    const itemOwnerKey = ownerKey(asString(item.domain_owner));
    const itemProjectKey = ownerKey(asString(item.project_id));
    return currentOwnerKey.length > 0
      && (itemOwnerKey === currentOwnerKey || itemProjectKey === currentOwnerKey);
  });
  return matching.find((item) => asString(item.lane) === 'attention')
    ?? matching.find((item) => asString(item.lane) === 'running')
    ?? matching[0]
    ?? null;
}

function buildOrdinaryCockpit(
  currentOwnerDeltaTopline: JsonRecord,
  input: OplAppOperatorViewModelInput,
) {
  const currentOwnerDelta = asRecord(currentOwnerDeltaTopline.current_owner_delta);
  const currentOwnerDeltaReadModel = asRecord(currentOwnerDeltaTopline.current_owner_delta_read_model);
  const nextAction = asRecord(currentOwnerDeltaTopline.operator_next_action);
  const hardGate = asRecord(currentOwnerDelta.hard_gate);
  const auditRefs = asRecord(currentOwnerDelta.audit_refs);
  const currentOwner = asString(currentOwnerDelta.current_owner)
    ?? asString(currentOwnerDelta.owner)
    ?? 'one-person-lab';
  const taskFallback = selectOrdinaryCockpitTaskFallback(currentOwner, input.runtimeActivityItems);
  const taskRef = asString(currentOwnerDelta.task_or_study_ref)
    ?? asString(currentOwnerDelta.stage_ref)
    ?? asString(currentOwnerDelta.stage_id)
    ?? asString(taskFallback?.item_id)
    ?? asString(taskFallback?.study_id)
    ?? 'opl-current-owner-delta';
  const latestOwnerAnswerRef = asString(currentOwnerDelta.latest_owner_answer_ref)
    ?? asString(hardGate.owner_answer_ref)
    ?? asString(currentOwnerDelta.latest_typed_blocker_ref);
  const artifactScopeRef = asString(auditRefs.artifact_scope_ref)
    ?? asString(currentOwnerDelta.artifact_scope_ref);
  const blockerRef = asString(currentOwnerDelta.latest_typed_blocker_ref)
    ?? asString(hardGate.typed_blocker_ref);
  const actionOwner = asString(currentOwnerDeltaTopline.operator_next_action_owner)
    ?? asString(nextAction.next_required_owner)
    ?? currentOwner;
  const actionKind = asString(currentOwnerDeltaTopline.operator_next_action_kind)
    ?? asString(nextAction.action_kind)
    ?? 'owner_delta_followthrough_required';
  const actionSummary = actionOwner === 'one-person-lab'
    ? 'Continue the current stage handoff.'
    : (asString(currentOwnerDelta.desired_delta_description)
        ?? 'Return an owner receipt, typed blocker, or current stage artifact.');

  return {
    surface_kind: 'opl_app_ordinary_cockpit',
    schema_version: 'ordinary-cockpit.v1',
    display_payload_policy: 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
    ordinary_progress_spine: asRecord(currentOwnerDelta.ordinary_progress_spine),
    progress_delta_receipt: asRecord(currentOwnerDelta.progress_delta_receipt),
    artifact_tier_policy: asRecord(currentOwnerDelta.artifact_tier_policy),
    audit_sidecar_policy: asRecord(currentOwnerDelta.audit_sidecar_policy),
    display_payload_fields: [...ORDINARY_COCKPIT_DISPLAY_FIELDS],
    developer_full_drilldown_only: [...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY],
    display_payload: {
      purpose: {
        purpose_id: 'continue_current_stage',
        label: 'Continue current stage',
        source_ref: 'app_state.operator.current_owner_delta',
      },
      task: {
        task_ref: taskRef,
        stage_ref: asString(currentOwnerDelta.stage_ref) ?? asString(currentOwnerDelta.stage_id),
        domain_id: asString(currentOwnerDelta.domain_id) ?? asString(currentOwnerDelta.domain),
        title: asString(taskFallback?.title),
        status_label: asString(taskFallback?.status_label),
      },
      current_owner: currentOwner,
      next_action: {
        owner: actionOwner,
        action_kind: actionKind,
        summary: actionSummary,
        source_ref: 'app_state.operator.current_owner_delta',
      },
      artifact_or_blocker: {
        status: blockerRef
          ? 'blocker_available'
          : latestOwnerAnswerRef || artifactScopeRef
            ? 'artifact_or_receipt_available'
            : 'awaiting_owner_answer',
        artifact_ref: artifactScopeRef,
        owner_answer_ref: latestOwnerAnswerRef,
        blocker_ref: blockerRef,
        expected_shape: 'owner_receipt_or_typed_blocker_or_stage_artifact_ref',
        content_policy: 'refs_only_no_artifact_or_receipt_body',
      },
    },
    authority_boundary: {
      default_next_action_derives_from: asString(
        currentOwnerDeltaReadModel.default_next_action_derivation_policy,
      ) ?? 'derive_default_next_action_only_from_current_owner_delta',
      default_planning_root: asString(currentOwnerDelta.default_planning_root)
        ?? 'current_owner_delta',
      can_write_domain_truth: false,
      can_read_artifact_body: false,
      can_read_memory_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}

function buildDefaultReadSurfacePolicy(input: OplAppOperatorViewModelInput) {
  const currentOwnerDeltaReadModel = asRecord(input.currentOwnerDeltaReadModel);
  return {
    surface_kind: 'opl_app_default_read_surface_policy',
    schema_version: 'default-read-surface-policy.v1',
    profile: input.profile,
    default_operator_payload: 'ordinary_cockpit',
    default_planning_root: 'current_owner_delta',
    ordinary_progress_spine: asRecord(currentOwnerDeltaReadModel.ordinary_progress_spine),
    progress_delta_receipt: asRecord(currentOwnerDeltaReadModel.progress_delta_receipt),
    artifact_tier_policy: asRecord(currentOwnerDeltaReadModel.artifact_tier_policy),
    audit_sidecar_policy: asRecord(currentOwnerDeltaReadModel.audit_sidecar_policy),
    normal_state_surface: 'opl app state --profile fast --json',
    full_state_surface: 'opl app state --profile full --json',
    full_runtime_drilldown_surface: 'opl runtime app-operator-drilldown --detail full --json',
    raw_runtime_projection_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
    runtime_tray_projection_policy: 'current_owner_delta_first_runtime_tray_worklist_audit_tail_drilldown',
    worklist_projection_policy: 'secondary_drilldown_never_default_planning_root',
    first_screen_answers: [
      ...ORDINARY_COCKPIT_DISPLAY_FIELDS,
    ],
    diagnostic_only_answers: [
      'current_owner_delta',
      'current_owner_delta_read_model',
      'count_summary',
      'audit_next_safe_action_or_none',
      'full_detail_refs',
      ...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY,
    ],
    ordinary_cockpit: {
      display_payload_policy: 'purpose_task_current_owner_next_action_artifact_or_blocker_only',
      ordinary_progress_spine_ref: 'app_state.operator.ordinary_cockpit.ordinary_progress_spine',
      progress_delta_receipt_ref: 'app_state.operator.ordinary_cockpit.progress_delta_receipt',
      artifact_tier_policy_ref: 'app_state.operator.ordinary_cockpit.artifact_tier_policy',
      audit_sidecar_policy_ref: 'app_state.operator.ordinary_cockpit.audit_sidecar_policy',
      brand_experience_profile_ref: 'app_state.operator.brand_experience_profile',
      display_payload_fields: [...ORDINARY_COCKPIT_DISPLAY_FIELDS],
      developer_full_drilldown_only: [...ORDINARY_COCKPIT_DEVELOPER_FULL_ONLY],
    },
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
      raw_worklist_can_generate_default_next_action: false,
      raw_evidence_can_generate_default_next_action: false,
      audit_sidecar_can_generate_default_next_action: false,
    },
  };
}

function buildBrandExperienceProfile(input: OplAppOperatorViewModelInput) {
  const ordinaryAppExperience = asRecord(input.brandSystemProfile.ordinary_app_experience);
  return {
    surface_kind: 'opl_app_brand_experience_profile',
    schema_version: 'app-brand-experience-profile.v1',
    source_profile_ref: 'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
    default_read_surface_ref: asString(ordinaryAppExperience.default_read_surface_ref)
      ?? 'app_state.operator.ordinary_cockpit',
    contract_refs: [
      'contracts/opl-framework/brand-system-profile.json#ordinary_app_experience',
      'contracts/opl-framework/brand-module-l5-operating-evidence.json#evidence_classes.ordinary_app_experience',
    ],
    experience_axes: asRecordArray(ordinaryAppExperience.experience_axes).map((axis) => ({
      axis_id: asString(axis.axis_id),
      user_visible_goal: asString(axis.user_visible_goal),
      app_projection_ref: asString(axis.app_projection_ref),
      l5_evidence_class_ref: asString(axis.l5_evidence_class_ref),
      must_not_claim: Array.isArray(axis.must_not_claim)
        ? axis.must_not_claim.filter((entry): entry is string => typeof entry === 'string')
        : [],
    })),
    display_language_refs: {
      status_terms_ref: 'contracts/opl-framework/brand-system-profile.json#app_status_language.default_terms',
      visual_patterns_ref: 'contracts/opl-framework/brand-system-profile.json#visual_system.pattern_groups',
      receipt_blocker_language_ref:
        'contracts/opl-framework/brand-system-profile.json#receipt_blocker_language',
    },
    l5_evidence_refs_only: ordinaryAppExperience.l5_evidence_refs_only === true,
    authority_boundary: {
      can_claim_l5: false,
      can_claim_app_release_ready: false,
      can_authorize_quality_verdict: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
    },
  };
}

function buildOneShotPlanLandingProfile(input: OplAppOperatorViewModelInput) {
  const model = asRecord(input.targetOperatingArchitecture.one_shot_plan_landing_model);
  const summary = asRecord(model.summary);
  const implementationSlices = asRecordArray(model.implementation_slices);
  return {
    surface_kind: 'opl_app_one_shot_plan_landing_profile',
    schema_version: 'one-shot-plan-landing-profile.v1',
    source_contract_ref:
      'contracts/opl-framework/target-operating-architecture-contract.json#one_shot_plan_landing_model',
    model_id: asString(model.model_id) ?? 'opl_family_one_shot_plan_landing.v1',
    status: summary.external_owner_evidence_still_required === true
      ? 'opl_surfaces_landed_external_owner_evidence_required'
      : 'opl_surfaces_landed_no_external_owner_gate_observed',
    summary: {
      total_plan_count: asNumber(summary.total_plan_count) ?? implementationSlices.length,
      opl_landed_count: asNumber(summary.opl_landed_count) ?? 0,
      opl_landed_owner_gated_count: asNumber(summary.opl_landed_owner_gated_count) ?? 0,
      external_owner_gated_count: asNumber(summary.external_owner_gated_count) ?? 0,
      all_opl_controlled_surfaces_landed: summary.all_opl_controlled_surfaces_landed === true,
      external_owner_evidence_still_required: summary.external_owner_evidence_still_required === true,
      ready_claim_authorized: false,
    },
    owner_gated_plan_ids: implementationSlices
      .filter((slice) => asString(slice.status) !== 'opl_landed')
      .map((slice) => asString(slice.plan_id))
      .filter((entry): entry is string => Boolean(entry)),
    visible_completion_message:
      'OPL-controlled contracts, read models, runtime routes, App projection, and evidence routers are landed; domain/App/L5/production readiness still requires owner evidence.',
    remaining_owner_gates: implementationSlices
      .filter((slice) => asString(slice.remaining_owner_gate) !== 'none')
      .map((slice) => ({
        plan_id: asString(slice.plan_id),
        title: asString(slice.title),
        status: asString(slice.status),
        remaining_owner_gate: asString(slice.remaining_owner_gate),
      })),
    validation_commands: [
      ...new Set(implementationSlices.flatMap((slice) =>
        Array.isArray(slice.validation_commands)
          ? slice.validation_commands.filter((entry): entry is string => typeof entry === 'string')
          : []
      )),
    ],
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_artifact_authority: false,
      can_claim_app_release_ready: false,
      can_claim_brand_l5_ready: false,
      can_claim_production_ready: false,
      can_claim_mas_paper_done: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
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
  const ordinaryCockpit = buildOrdinaryCockpit(currentOwnerDeltaTopline, input);
  const brandExperienceProfile = buildBrandExperienceProfile(input);
  const oneShotPlanLanding = buildOneShotPlanLandingProfile(input);
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
    ordinary_cockpit: ordinaryCockpit,
    brand_experience_profile: brandExperienceProfile,
    one_shot_plan_landing: oneShotPlanLanding,
    ...currentOwnerDeltaTopline,
    workbench: {
      view_model_schema: 'opl_app_operator_workbench.v1',
      default_read_surface_policy: defaultReadSurfacePolicy,
      ordinary_cockpit: ordinaryCockpit,
      brand_experience_profile: brandExperienceProfile,
      one_shot_plan_landing: oneShotPlanLanding,
      settings_control_center: input.settingsControlCenter,
      ...currentOwnerDeltaTopline,
      summary_cards: buildSummaryCards(input),
      sections: buildSections(input),
      navigation: buildNavigation(),
      action_queue: buildActionQueue(input),
      activity_center: buildActivityCenter(input),
      domain_lane_map: buildDomainLaneMap(input),
      task_drilldowns: buildTaskDrilldowns(input),
      task_run_projection_v2: buildTaskRunProjectionV2(runtimeActivityDrilldowns(input)),
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
