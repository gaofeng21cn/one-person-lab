import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { loadFrameworkContracts } from '../charter/index.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';
import {
  readBundledCodexDefaultProfile,
  listOplAgentPackages,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
  runOplAgentPackageStatus,
} from '../connect/index.ts';
import {
  buildOplEndpoints,
  familyRuntimePaths,
  inspectFamilyRuntimeProviderWithLifecycle,
  readManagedProviderProjectionSummary,
  resolveFamilyRuntimeProviderKind,
} from '../runway/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { buildDeveloperModeLiveCloseoutEvidenceSummary } from './app-state-developer-mode-closeout.ts';
import { buildReleaseState } from './app-state-release.ts';
import { buildOplDeveloperModeSurface } from '../connect/index.ts';
import { resolveCodexVersion } from '../connect/index.ts';
import { buildOplModules } from '../connect/index.ts';
import { readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import path from 'node:path';
import { resolveDefaultFamilyWorkspaceRoot } from '../connect/index.ts';
import { buildActionCatalog } from './app-state-action-catalog.ts';
import { buildSettingsControlCenter } from './app-state-settings-control-center.ts';
import { parseAppStateProfile, type AppStateProfile } from './app-state-profile.ts';
import { buildAppStateRuntimeActivityItems } from './app-state-runtime-activity.ts';
import { buildOplAppOperatorViewModel } from './app-state-view-model.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import { selectAppStateCurrentOwnerDeltaReadModel } from './app-state-current-owner-delta.ts';
import { buildAgentLabDomainFeedbackSelfEvolutionReadModel } from '../foundry-lab/index.ts';
import { buildFeedbackOpsReadModel } from '../foundry-lab/index.ts';

export { parseAppActionExecuteArgs, runOplAppActionExecute } from './app-state-parts/action-execute.ts';

function nowIso() {
  return new Date().toISOString();
}

export function parseAppStateArgs(args: string[]): { profile: AppStateProfile } {
  let profile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--profile') {
      throw new FrameworkContractError('cli_usage_error', `Unknown app state option: ${token}.`, {
        option: token,
        usage: 'opl app state [--profile fast|full]',
      });
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', 'Missing value for --profile.', {
        option: '--profile',
      });
    }
    profile = value;
    index += 1;
  }

  return { profile: parseAppStateProfile(profile) };
}

function publicModuleItems(profile: AppStateProfile) {
  return buildOplModules({ profile })
    .modules
    .modules
    .filter((module) => module.default_install)
    .map((module) => ({
      module_id: module.module_id,
      label: module.label,
      scope: module.scope,
      description: module.description,
      default_install: module.default_install,
      installed: module.installed,
      install_origin: module.install_origin,
      checkout_path: module.checkout_path,
      managed_checkout_path: module.managed_checkout_path,
      repo_url: module.repo_url,
      health_status: module.health_status,
      git: module.git,
      source_policy: module.source_policy,
      capabilities: module.capabilities,
      available_actions: module.available_actions,
      recommended_action: module.recommended_action,
    }));
}

function resolveModuleSource(items: ReturnType<typeof publicModuleItems>) {
  const envOverride = items.find((entry) => entry.install_origin === 'env_override');
  if (envOverride) {
    return {
      mode: 'env_override',
      reason: 'module_path_env_override',
      repo_path: envOverride.checkout_path,
      modules_root: pathRootFromManagedCheckout(envOverride.managed_checkout_path),
    };
  }

  const sibling = items.find((entry) => entry.install_origin === 'sibling_workspace');
  if (sibling) {
    return {
      mode: 'developer_workspace',
      reason: 'developer_mode_prefers_local_sibling_checkouts',
      repo_path: sibling.checkout_path,
      modules_root: pathRootFromManagedCheckout(sibling.managed_checkout_path),
    };
  }

  const first = items[0];
  return {
    mode: 'managed_runtime',
    reason: 'opl_managed_modules_root',
    repo_path: null,
    modules_root: first ? pathRootFromManagedCheckout(first.managed_checkout_path) : null,
  };
}

function pathRootFromManagedCheckout(checkoutPath: string) {
  return path.dirname(checkoutPath);
}

function buildAssistants(items: ReturnType<typeof publicModuleItems>) {
  return items.map((module) => ({
    assistant_id: module.module_id,
    label: module.label,
    description: module.description,
    launch_hint: 'direct_click',
    prompt_prefix_required: false,
    backing_module_id: module.module_id,
  }));
}

async function buildProviderState(profile: AppStateProfile) {
  const providerKind = resolveFamilyRuntimeProviderKind();
  const provider = await inspectFamilyRuntimeProviderWithLifecycle(
    providerKind,
    familyRuntimePaths(),
    {
      detail: profile,
      managedProviderProjection: profile === 'fast'
        ? readManagedProviderProjectionSummary({ includeManifest: false })
        : readManagedProviderProjectionSummary(),
    },
  );
  return {
    selected_provider: providerKind,
    temporal: {
      required_for: 'full_opl_family_runtime_readiness',
      health_status: providerKind === 'temporal'
        ? provider.ready ? 'ready' : 'attention_needed'
        : 'not_selected',
      status: providerKind === 'temporal' ? provider.status : 'not_selected',
      ready: providerKind === 'temporal' ? provider.ready : false,
      degraded_reason: providerKind === 'temporal' ? provider.degraded_reason : 'temporal_not_selected',
      capabilities: providerKind === 'temporal' ? provider.capabilities : [],
      details: providerKind === 'temporal' ? provider.details : null,
      management: {
        owner_surface: 'opl app action execute',
        actions: [
          'provider_scheduler_status',
          'provider_scheduler_install',
          'provider_scheduler_trigger',
          'provider_worker_start',
          'provider_worker_restart',
        ],
      },
    },
  };
}

function buildCoreState(profile: AppStateProfile) {
  const defaultProfile = readBundledCodexDefaultProfile();
  const localDefaults = readLocalCodexDefaultsIfAvailable();
  const codexAccess = readLocalCodexAccessState();
  const codex = resolveCodexVersion({ skipLatestLookup: profile === 'fast' });
  return {
    executor: {
      default_executor_id: 'codex_cli',
      default_executor_label: 'Codex CLI',
      visible_executors: [
        {
          executor_id: 'codex_cli',
          label: 'Codex CLI',
          default: true,
          permissions: 'full_auto',
        },
      ],
      selector_visible: false,
      permission_mode: 'full_auto',
    },
    codex: {
      ...codex,
      default_model: localDefaults?.model ?? defaultProfile.model,
      default_reasoning_effort: localDefaults?.reasoning_effort ?? defaultProfile.model_reasoning_effort,
      default_profile: defaultProfile,
      provider_base_url: localDefaults?.provider_base_url ?? defaultProfile.base_url,
      config_path: localDefaults?.config_path ?? null,
      api_key_present: Boolean(localDefaults?.provider_api_key),
      opl_gateway_configured: codexAccess.opl_gateway_configured,
      model_access_ready: codexAccess.model_access_ready,
      model_access_status: codexAccess.model_access_ready ? 'ready' : 'missing',
      model_access_source: codexAccess.model_access_source,
      codex_login_present: codexAccess.codex_login_present,
      env_api_key_present: codexAccess.env_api_key_present,
    },
  };
}

function buildUiDefaults() {
  const defaultProfile = readBundledCodexDefaultProfile();
  return {
    home_prompt:
      '把研究、基金和汇报交给 One Person Lab 自动推进',
    codex_model_label:
      `${defaultProfile.model}${defaultProfile.model_reasoning_effort ? ` ${defaultProfile.model_reasoning_effort}` : ''}`,
    theme_id: 'opl_codex',
    visible_theme_choices: ['opl_codex', 'default'],
  };
}

function fullRuntimeWorkbenchSummary(fullDrilldown: JsonRecord | null) {
  if (!fullDrilldown) {
    return {
      surface_kind: 'opl_app_state_runtime_workbench_summary',
      availability: 'lazy',
      source_surface: 'opl runtime app-operator-drilldown --detail full --json',
      authority_boundary: {
        opl: 'app_state_summary_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }
  const runtimeWorkbench = isRecord(fullDrilldown.runtime_workbench)
    ? fullDrilldown.runtime_workbench
    : null;
  const visualization = isRecord(fullDrilldown.runtime_visualization_projection)
    ? fullDrilldown.runtime_visualization_projection
    : {};
  const nestedRuntimeWorkbench = isRecord(visualization.runtime_workbench)
    ? visualization.runtime_workbench
    : null;
  const effectiveRuntimeWorkbench = runtimeWorkbench ?? nestedRuntimeWorkbench;
  const visualRefGroups = isRecord(fullDrilldown.visual_ref_groups)
    ? fullDrilldown.visual_ref_groups
    : isRecord(visualization.visual_ref_groups)
      ? visualization.visual_ref_groups
      : {};
  const visualizationSummary = isRecord(visualization.summary) ? visualization.summary : {};
  const stageProgressRefs = Array.isArray(visualRefGroups.stage_progress_log_refs)
    ? visualRefGroups.stage_progress_log_refs
    : [];
  const stageProgressSummary = isRecord(fullDrilldown.stage_progress_log)
    ? fullDrilldown.stage_progress_log
    : null;
  const effectiveCurrentContext = isRecord(fullDrilldown.effective_current_context)
    ? fullDrilldown.effective_current_context
    : {};
  const effectiveCurrentContextSummary = isRecord(effectiveCurrentContext.summary)
    ? effectiveCurrentContext.summary
    : {};
  const familyStallLineage = isRecord(fullDrilldown.family_stall_lineage)
    ? fullDrilldown.family_stall_lineage
    : {};
  const familyStallLineageSummary = isRecord(familyStallLineage.summary)
    ? familyStallLineage.summary
    : {};
  return {
    surface_kind: 'opl_app_state_runtime_workbench_summary',
    availability: effectiveRuntimeWorkbench ? 'available' : 'unavailable',
    source_surface: 'opl runtime app-operator-drilldown --detail full --json',
    runtime_workbench: effectiveRuntimeWorkbench
      ? {
          surface_kind: effectiveRuntimeWorkbench.surface_kind,
          summary_cards: Array.isArray(effectiveRuntimeWorkbench.summary_cards)
            ? effectiveRuntimeWorkbench.summary_cards
            : [],
          action_queue_item_count:
            Array.isArray(isRecord(effectiveRuntimeWorkbench.action_queue)
              ? effectiveRuntimeWorkbench.action_queue.items
              : null)
            ? ((effectiveRuntimeWorkbench.action_queue as JsonRecord).items as unknown[]).length
            : 0,
          domain_lane_count:
            Array.isArray(isRecord(effectiveRuntimeWorkbench.domain_lane_map)
              ? effectiveRuntimeWorkbench.domain_lane_map.lanes
              : null)
            ? ((effectiveRuntimeWorkbench.domain_lane_map as JsonRecord).lanes as unknown[]).length
            : 0,
        }
      : null,
    stage_progress_log: {
      summary: stageProgressSummary,
      attempt_count: Number(stageProgressSummary?.attempt_count ?? 0),
      temporal_webui_ref_count: Number(stageProgressSummary?.temporal_webui_ref_count ?? 0),
      temporal_webui_refs: Array.isArray(stageProgressSummary?.temporal_webui_refs)
        ? stageProgressSummary.temporal_webui_refs
        : [],
      visual_ref_count: stageProgressRefs.length,
      temporal_stage_progress_ref_count: Number(visualizationSummary.temporal_stage_progress_ref_count ?? 0),
      stage_progress_event_count: Number(visualizationSummary.stage_progress_event_count ?? 0),
    },
    effective_current_context: {
      surface_kind: effectiveCurrentContext.surface_kind ?? 'opl_effective_current_context_packet',
      packet_version: effectiveCurrentContext.packet_version ?? 'effective_current_context.v1',
      context_count: Number(effectiveCurrentContextSummary.context_count ?? 0),
      running_attempt_count: Number(effectiveCurrentContextSummary.running_attempt_count ?? 0),
      latest_closeout_count: Number(effectiveCurrentContextSummary.latest_closeout_count ?? 0),
    },
    family_stall_lineage: {
      surface_kind: familyStallLineage.surface_kind ?? 'opl_family_stall_lineage',
      packet_version: familyStallLineage.packet_version ?? 'family-stall-lineage.v1',
      lineage_count: Number(familyStallLineageSummary.lineage_count ?? 0),
      repeated_lineage_count: Number(familyStallLineageSummary.repeated_lineage_count ?? 0),
      terminal_lineage_count: Number(familyStallLineageSummary.terminal_lineage_count ?? 0),
    },
    authority_boundary: {
      opl: 'app_state_summary_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
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

function compactFastWorkItem(value: unknown) {
  const item = isRecord(value) ? value : {};
  const stage = isRecord(item.stage) ? item.stage : {};
  const attempt = isRecord(item.attempt) ? item.attempt : {};
  const action = isRecord(item.action) ? item.action : {};
  const status = isRecord(item.status) ? item.status : {};
  return {
    item_id: item.item_id,
    title: item.title,
    stage: { stage_id: stage.stage_id, label: stage.label },
    attempt: { run_id: attempt.run_id, status: attempt.status },
    action: {
      action_kind: action.action_kind,
      title: action.title,
      summary: action.summary,
      ref: action.ref,
      action_ref: action.action_ref,
    },
    status: {
      primary_state: status.primary_state,
      automation_state: status.automation_state,
    },
  };
}

function compactFastOperatorRuntimeProjection(operator: JsonRecord) {
  const workbench = isRecord(operator.workbench) ? operator.workbench : {};
  const taskRun = isRecord(workbench.task_run_projection_v2) ? workbench.task_run_projection_v2 : {};
  const workItems = isRecord(workbench.work_item_projection_v1) ? workbench.work_item_projection_v1 : {};
  const activityCenter = isRecord(workbench.activity_center) ? workbench.activity_center : {};
  const compactWorkItems = recordArray(workItems.items).map(compactFastWorkItem);
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

  return {
    ...operator,
    workbench: {
      ...workbench,
      activity_center: compactActivityCenter,
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
      task_drilldowns: recordArray(workbench.task_drilldowns),
      task_run_projection_v2: {
        ...taskRun,
        tasks: recordArray(taskRun.tasks).map(compactFastTaskRun),
        work_item_projection_v1: {
          source_ref: 'app_state.operator.workbench.work_item_projection_v1',
        },
      },
      work_item_projection_v1: { ...workItems, items: compactWorkItems },
    },
    visual_ref_groups: compactVisualRefGroups,
  };
}

export async function buildOplAppState(input: { profile?: AppStateProfile } = {}) {
  const startedAt = Date.now();
  const profile = input.profile ?? 'fast';
  const contracts = loadFrameworkContracts() as FrameworkContracts;
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const modules = publicModuleItems(profile);
  const moduleSource = resolveModuleSource(modules);
  const developerMode = {
    ...buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: profile }),
    live_closeout_evidence: buildDeveloperModeLiveCloseoutEvidenceSummary(),
  };
  const developerProfile = {
    ...developerMode.developer_profile,
    capabilities: developerMode.capabilities,
  };
  const provider = await buildProviderState(profile);
  const release = buildReleaseState();
  const workspaceRoot = readOplWorkspaceRoot();
  const core = buildCoreState(profile);
  const actions = buildActionCatalog(contracts);
  const agentPackagesReadback = listOplAgentPackages().opl_agent_packages;
  const agentPackageStatuses = Object.fromEntries(
    agentPackagesReadback.installed_packages.map((lock) => [
      lock.package_id,
      runOplAgentPackageStatus({ packageId: lock.package_id }).opl_agent_package_status,
    ]),
  );
  const agentPackagesProjection = {
    surface_kind: 'opl_app_agent_packages_projection',
    source: {
      list_surface: 'opl packages list --json',
      status_surface: 'opl packages status --package-id <package_id> --json',
    },
    directory: agentPackagesReadback,
    status_index: {
      surface_kind: 'opl_agent_package_status_index',
      status: 'available',
      installed_package_count: agentPackagesReadback.installed_package_count,
      packages: agentPackageStatuses,
      home_shortcut_preferences: agentPackagesReadback.home_shortcut_preferences,
      files: {
        home_shortcut_preferences_file: agentPackagesReadback.files.home_shortcut_preferences_file,
      },
      authority_boundary: agentPackagesReadback.authority_boundary,
    },
  };
  const uiDefaults = buildUiDefaults();
  const runtimeActivityItems = buildAppStateRuntimeActivityItems(profile);
  const fullRuntimeDrilldown = profile === 'full'
    ? (await buildRuntimeTraySnapshot(contracts, {
        appOperatorDrilldownDetailLevel: 'full',
      })).runtime_tray_snapshot.app_operator_drilldown as JsonRecord
    : null;
  const currentOwnerDeltaReadModel = selectAppStateCurrentOwnerDeltaReadModel({
    fullRuntimeDrilldown,
    runtimeActivityItems,
    statePaths,
  });
  const agentLabFeedbackSelfEvolution = buildAgentLabDomainFeedbackSelfEvolutionReadModel({
    sourceRefs: ['app-state:operator-workbench'],
  });
  const feedbackOps = buildFeedbackOpsReadModel({ developerMode });
  const paths = {
    home_dir: statePaths.home_dir,
    state_dir: statePaths.state_dir,
    modules_root: moduleSource.modules_root,
    family_workspace_root: {
      selected_path: resolveDefaultFamilyWorkspaceRoot(),
      source: process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim()
        ? 'env'
        : profile === 'fast'
          ? 'repo_sibling_discovery_fast'
          : 'repo_sibling_discovery',
      role: 'developer_mode_module_checkout_discovery_root',
    },
    workspace_root: workspaceRoot,
    workspace_root_path: workspaceRoot.selected_path,
    update_channel_file: statePaths.update_channel_file,
    developer_supervisor_config_file: statePaths.developer_supervisor_config_file,
    logs_dir: `${statePaths.state_dir}/logs`,
  };
  const modulesState = {
    source: moduleSource,
    summary: {
      default_modules_count: modules.length,
      installed_default_modules_count: modules.filter((entry) => entry.installed).length,
      healthy_default_modules_count: modules.filter((entry) => entry.health_status === 'ready').length,
    },
    items: modules,
  };
  const settingsControlCenter = buildSettingsControlCenter({
    profile,
    core,
    developerMode,
    modules: modulesState,
    provider,
    release,
    paths,
  });
  const rawOperator = buildOplAppOperatorViewModel({
    profile,
    core,
    developerMode,
    modules: modulesState,
    provider,
    release,
    paths,
    actions,
    settingsControlCenter,
    uiDefaults,
    runtimeActivityItems,
    brandSystemProfile: contracts.brandSystemProfile as unknown as JsonRecord,
    targetOperatingArchitecture: contracts.targetOperatingArchitecture as unknown as JsonRecord,
    currentOwnerDeltaReadModel,
    agentLabFeedbackSelfEvolution,
    feedbackOps,
  });
  const operator = profile === 'fast'
    ? compactFastOperatorRuntimeProjection(rawOperator)
    : rawOperator;

  return {
    version: 'g2',
    app_state: {
      schema_version: 'opl_app_state.v1',
      surface_kind: 'opl_app_state.v1',
      meta: {
        profile,
        generated_at: nowIso(),
        elapsed_ms: Date.now() - startedAt,
        read_policy: profile === 'fast'
          ? 'bounded_local_read_no_network_no_repair'
          : 'bounded_local_read_full_detail_no_mutation',
      },
      runtime_source: {
        owner: 'one-person-lab',
        cli_surface: 'opl app state',
        action_surface: 'opl app action execute',
        app_repo_truth_owner: 'one-person-lab-app',
        producer_role: 'gui_ready_state_action_producer_only',
        normal_gui_state_surface: 'opl app state --profile fast --json',
        full_gui_state_surface: 'opl app state --profile full --json',
        action_boundary_surface: 'opl app action execute --json',
        full_drilldown_exception_surface: 'opl runtime app-operator-drilldown --detail full --json',
        shell_must_not_use_full_drilldown_as_normal_state: true,
      },
      core,
      developer_profile: developerProfile,
      developer_mode: developerMode,
      modules: modulesState,
      agent_packages: agentPackagesProjection,
      opl_agent_packages: agentPackagesReadback,
      opl_agent_package_status: agentPackagesProjection.status_index,
      provider,
      assistants: {
        default_launch: 'direct_click',
        prompt_prefix_required: false,
        items: buildAssistants(modules),
      },
      release,
      settings_control_center: settingsControlCenter,
      operator,
      agent_lab_feedback_self_evolution: agentLabFeedbackSelfEvolution,
      feedbackops: feedbackOps,
      runtime_workbench: fullRuntimeWorkbenchSummary(fullRuntimeDrilldown),
      paths,
      actions,
      ui_defaults: uiDefaults,
      opl_agent_codex_context: {
        source: 'one-person-lab-app/product_profile',
        contract_ref: 'one-person-lab-app/contracts/app-gui-product-contract.json#pages.settings_system',
        policy: 'app_repo_owns_gui_context_text',
      },
    },
  };
}
