import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { loadFrameworkContracts } from '../charter/public/app-state.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';
import {
  readBundledCodexDefaultProfile,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
} from '../../kernel/local-codex-defaults.ts';
import {
  buildOplDeveloperModeSurface,
  buildOplModules,
  CANONICAL_OPL_PACKAGE_IDS,
  canonicalAgentPackageId,
  compactStorageOwnerInventorySnapshot,
  compactStorageOwnerProjection,
  listOplAgentPackages,
  readOplAgentPackageLockIndex,
  readOplFlowDefaultUserInstructions,
  readStorageOwnerInventorySnapshot,
  resolveFirstPartyPackageCatalogSnapshot,
  resolveCodexVersion,
  resolveDefaultFamilyWorkspaceRoot,
  runOplAgentPackageStatus,
} from '../connect/public/app-state.ts';
import { listWorkspaceBindings } from '../workspace/public/app-state.ts';
import { buildOplEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
import {
  familyRuntimePaths,
  inspectFamilyRuntimeProviderWithLifecycle,
  readManagedProviderProjectionSummary,
  resolveFamilyRuntimeProviderKind,
} from '../runway/public/app-state.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { buildDeveloperModeLiveCloseoutEvidenceSummary } from './app-state-developer-mode-closeout.ts';
import { buildReleaseState } from './app-state-release.ts';
import { readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import path from 'node:path';
import { buildActionCatalog } from './app-state-action-catalog.ts';
import { buildSettingsControlCenter } from './app-state-settings-control-center.ts';
import { parseAppStateProfile, type AppStateProfile } from './app-state-profile.ts';
import { buildOplAppOperatorViewModel } from './app-state-view-model.ts';
import { buildAppRuntimeWorkItemProjection } from './app-runtime-work-item-projection.ts';
import { projectWorkItemRuntimeActivityItems } from './work-item-projection/legacy-adapter.ts';
import { selectAppStateCurrentOwnerDeltaReadModel } from './app-state-current-owner-delta.ts';
import { buildFoundryOperatorProjection } from './foundry-operator-projection.ts';
import { readCodexUserInstructions } from './codex-personalization.ts';
import {
  projectAppAgentPackageStatus,
  unavailableAgentPackageCanonicalFields,
} from './app-state-agent-packages.ts';

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

function publicRuntimeSourceCarriers(profile: AppStateProfile) {
  return buildOplModules({ profile })
    .modules
    .modules
    .filter((module) => module.default_install)
    .map((module) => ({
      package_id: canonicalAgentPackageId(module.module_id),
      carrier_id: module.module_id,
      label: module.label,
      scope: module.scope,
      description: module.description,
      default_carrier: module.default_install,
      source_present: module.installed,
      source_origin: module.install_origin,
      source_path: module.checkout_path,
      managed_source_path: module.managed_checkout_path,
      repo_url: module.repo_url,
      source_health_status: module.health_status,
      git: module.git,
      source_policy: module.source_policy,
      capabilities: module.capabilities,
    }));
}

function resolveModuleSource(items: ReturnType<typeof publicRuntimeSourceCarriers>) {
  const envOverride = items.find((entry) => entry.source_origin === 'env_override');
  if (envOverride) {
    return {
      mode: 'env_override',
      reason: 'module_path_env_override',
      repo_path: envOverride.source_path,
      runtime_sources_root: pathRootFromManagedCheckout(envOverride.managed_source_path),
    };
  }

  const sibling = items.find((entry) => entry.source_origin === 'sibling_workspace');
  if (sibling) {
    return {
      mode: 'developer_workspace',
      reason: 'developer_mode_prefers_local_sibling_checkouts',
      repo_path: sibling.source_path,
      runtime_sources_root: pathRootFromManagedCheckout(sibling.managed_source_path),
    };
  }

  const first = items[0];
  return {
    mode: 'managed_runtime',
    reason: 'opl_managed_runtime_sources_root',
    repo_path: null,
    runtime_sources_root: first ? pathRootFromManagedCheckout(first.managed_source_path) : null,
  };
}

function pathRootFromManagedCheckout(checkoutPath: string) {
  return path.dirname(checkoutPath);
}

function buildAssistants(items: ReturnType<typeof publicRuntimeSourceCarriers>) {
  return items.map((carrier) => ({
    assistant_id: carrier.package_id,
    label: carrier.label,
    description: carrier.description,
    launch_hint: 'direct_click',
    prompt_prefix_required: false,
    package_id: carrier.package_id,
  }));
}

type AgentPackageStatusReader = typeof runOplAgentPackageStatus;

function requestCachedAgentPackageStatusReader(readStatus: AgentPackageStatusReader): AgentPackageStatusReader {
  const cache = new Map<string,
    | { ok: true; value: ReturnType<AgentPackageStatusReader> }
    | { ok: false; error: unknown }>();
  return (input = {}) => {
    const key = JSON.stringify([
      input.packageId ?? null,
      input.scope ?? null,
      input.targetWorkspace ?? null,
      input.targetQuest ?? null,
      input.detail ?? null,
      input.recoverRuntimeSource ?? null,
    ]);
    const cached = cache.get(key);
    if (cached) {
      if (cached.ok) return cached.value;
      throw cached.error;
    }
    try {
      const status = readStatus(input);
      cache.set(key, { ok: true, value: status });
      return status;
    } catch (error) {
      cache.set(key, { ok: false, error });
      throw error;
    }
  };
}

function unavailableAgentPackageStatus(
  packageId: string,
  error: unknown,
  lockIndex: ReturnType<typeof readOplAgentPackageLockIndex>,
): JsonRecord {
  const contractError = error instanceof FrameworkContractError ? error : null;
  return {
    ...unavailableAgentPackageCanonicalFields(packageId, lockIndex),
    surface_kind: 'opl_agent_package_status_unavailable',
    status: 'unavailable',
    installed_package_count: null,
    installed_packages: [],
    codex_visible: false,
    package_dependency_readiness: null,
    materialization_readiness: null,
    runtime_source_readiness: {
      status: 'unavailable',
      operational_ready: false,
      reason: 'package_status_read_failed',
    },
    operational_ready: false,
    operational_ready_scope: 'package_dependency_scope_and_runtime_source',
    launch_allowed: false,
    launch_blocked_reason: 'package_status_read_failed',
    allowed_when_blocked: ['status', 'doctor', 'repair'],
    status_read_error: {
      code: contractError?.code ?? 'unexpected_error',
      message: error instanceof Error ? error.message : 'Unknown package status read failure.',
      details: contractError?.details ?? null,
    },
    detail_surface: `opl packages status --package-id ${packageId} --json`,
  };
}

export function buildAppAgentPackageStatuses(input: {
  packageIds: readonly string[];
  profile: AppStateProfile;
  readStatus?: AgentPackageStatusReader;
  lockIndex?: ReturnType<typeof readOplAgentPackageLockIndex>;
}) {
  const readStatus = input.readStatus ?? runOplAgentPackageStatus;
  const lockIndex = input.lockIndex ?? readOplAgentPackageLockIndex();
  const statuses: Record<string, JsonRecord> = {};
  for (const packageId of input.packageIds) {
    try {
      const status = readStatus({
        packageId,
        recoverRuntimeSource: false,
        detail: input.profile,
      }).opl_agent_package_status;
      statuses[packageId] = projectAppAgentPackageStatus({
        status,
        profile: input.profile,
        lockIndex,
      }) as unknown as JsonRecord;
    } catch (error) {
      statuses[packageId] = unavailableAgentPackageStatus(packageId, error, lockIndex);
    }
  }
  return statuses;
}

async function buildProviderState(profile: AppStateProfile) {
  const providerKind = resolveFamilyRuntimeProviderKind();
  const provider = await inspectFamilyRuntimeProviderWithLifecycle(
    providerKind,
    familyRuntimePaths(),
    {
      detail: profile,
      includeScheduler: true,
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
          'provider_service_status',
          'provider_service_start',
          'provider_service_restart',
          'provider_service_stop',
          'provider_scheduler_status',
          'provider_scheduler_install',
          'provider_scheduler_trigger',
          'provider_worker_status',
          'provider_worker_start',
          'provider_worker_restart',
          'provider_worker_stop',
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

function compactFastActionCatalog(actions: ReadonlyArray<JsonRecord>) {
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

function compactFastSettingsControlCenter(value: unknown) {
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

function compactFastLegacyAgentPackageDirectory(value: unknown) {
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

function compactFastLegacyAgentPackageStatus(value: unknown) {
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
  const workItemsV2 = isRecord(workbench.work_item_projection_v2) ? workbench.work_item_projection_v2 : {};
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
        'runtime_scope',
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
        work_item_projection_v1: {
          source_ref: 'app_state.operator.workbench.work_item_projection_v1',
        },
      },
      work_item_projection_v1: { ...workItems, items: compactWorkItems },
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

export async function buildOplAppState(input: {
  profile?: AppStateProfile;
  readAgentPackageStatus?: AgentPackageStatusReader;
} = {}) {
  const startedAt = Date.now();
  const profile = input.profile ?? 'fast';
  const contracts = loadFrameworkContracts() as FrameworkContracts;
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const storageOwnerInventory = readStorageOwnerInventorySnapshot();
  const runtimeSourceCarriers = publicRuntimeSourceCarriers(profile);
  const moduleSource = resolveModuleSource(runtimeSourceCarriers);
  const developerMode = {
    ...buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: profile }),
    live_closeout_evidence: buildDeveloperModeLiveCloseoutEvidenceSummary(),
  };
  const developerProfile = {
    ...developerMode.developer_profile,
    capabilities: developerMode.capabilities,
  };
  const rawProvider = await buildProviderState(profile);
  const provider = profile === 'fast'
    ? compactFastProviderState(rawProvider as unknown as JsonRecord)
    : rawProvider;
  const release = buildReleaseState();
  const workspaceRoot = readOplWorkspaceRoot();
  const core = buildCoreState(profile);
  const rawActions = buildActionCatalog(contracts, { inspectExternalOwners: profile === 'full' });
  const actions = profile === 'fast'
    ? compactFastActionCatalog(rawActions as unknown as JsonRecord[])
    : rawActions;
  const readAgentPackageStatus = requestCachedAgentPackageStatusReader(
    input.readAgentPackageStatus ?? runOplAgentPackageStatus,
  );
  const firstPartyCatalog = profile === 'full'
    ? await resolveFirstPartyPackageCatalogSnapshot({ refresh: true })
    : undefined;
  const agentPackagesReadback = listOplAgentPackages({
    detail: profile,
    firstPartyCatalog,
    readStatus: readAgentPackageStatus,
  }).opl_agent_packages;
  const workspaceBindings = listWorkspaceBindings();
  const packageIds = [...new Set([
    ...CANONICAL_OPL_PACKAGE_IDS,
    ...agentPackagesReadback.directory.entries.map((entry) => entry.package_id),
  ])];
  const agentPackageStatuses = buildAppAgentPackageStatuses({
    packageIds,
    profile,
    readStatus: readAgentPackageStatus,
    lockIndex: readOplAgentPackageLockIndex(),
  });
  const packageStatusFailures = Object.entries(agentPackageStatuses)
    .filter(([, status]) => status.status === 'unavailable')
    .map(([packageId, status]) => ({
      package_id: packageId,
      reason: 'package_status_read_failed',
      error: status.status_read_error,
      detail_surface: status.detail_surface,
    }));
  const agentPackagesProjection = {
    surface_kind: 'opl_app_agent_packages_projection',
    source: {
      list_surface: 'opl packages list --json',
      status_surface: 'opl packages status --package-id <package_id> --json',
    },
    directory: agentPackagesReadback.directory,
    storage_inventory: compactStorageOwnerProjection(
      storageOwnerInventory.agent_package_store,
      'agent_package_store',
    ),
    status_index: {
      surface_kind: 'opl_agent_package_status_index',
      status: packageStatusFailures.length > 0 ? 'attention_required' : 'available',
      installed_package_count: agentPackagesReadback.installed_package_count,
      status_read_failure_count: packageStatusFailures.length,
      diagnostics: packageStatusFailures,
      packages: agentPackageStatuses,
      home_shortcut_preferences: agentPackagesReadback.home_shortcut_preferences,
      files: {
        home_shortcut_preferences_file: agentPackagesReadback.files.home_shortcut_preferences_file,
      },
      authority_boundary: agentPackagesReadback.authority_boundary,
    },
  };
  const uiDefaults = buildUiDefaults();
  const workItemProjectionV2 = buildAppRuntimeWorkItemProjection({
    profile,
    packageProjectionItems: runtimeSourceCarriers,
    packageStatusById: agentPackageStatuses,
    bindings: workspaceBindings,
  });
  const runtimeActivityItems = profile === 'full'
    ? projectWorkItemRuntimeActivityItems(workItemProjectionV2)
    : [];
  const fullRuntimeDrilldown = profile === 'full'
    ? (await (await import('./runtime-tray-snapshot.ts')).buildRuntimeTraySnapshot(contracts, {
        appOperatorDrilldownDetailLevel: 'full',
      })).runtime_tray_snapshot.app_operator_drilldown as JsonRecord
    : null;
  const currentOwnerDeltaReadModel = selectAppStateCurrentOwnerDeltaReadModel({
    fullRuntimeDrilldown,
    runtimeActivityItems,
    statePaths,
  });
  const foundry = await buildFoundryOperatorProjection({ profile });
  const paths = {
    home_dir: statePaths.home_dir,
    state_dir: statePaths.state_dir,
    runtime_sources_root: moduleSource.runtime_sources_root,
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
  const runtimeSourceCarriersState = {
    surface_kind: 'opl_runtime_source_carriers_projection',
    source: moduleSource,
    summary: {
      default_carriers_count: runtimeSourceCarriers.length,
      present_default_carriers_count: runtimeSourceCarriers.filter((entry) => entry.source_present).length,
      healthy_default_carriers_count: runtimeSourceCarriers.filter((entry) => entry.source_health_status === 'ready').length,
    },
    items: runtimeSourceCarriers,
    authority_boundary: {
      package_installation_truth: 'app_state.agent_packages.status_index',
      source_carrier_presence_is_package_installed: false,
      lifecycle_owner: 'opl_packages',
    },
  };
  const rawSettingsControlCenter = buildSettingsControlCenter({
    profile,
    core,
    developerMode,
    modules: runtimeSourceCarriersState,
    agentPackages: agentPackagesProjection,
    provider,
    release,
    paths,
    storageOwnerInventory: storageOwnerInventory as unknown as JsonRecord,
  });
  const settingsControlCenter = profile === 'fast'
    ? compactFastSettingsControlCenter(rawSettingsControlCenter)
    : rawSettingsControlCenter;
  const rawOperator = buildOplAppOperatorViewModel({
    profile,
    core,
    developerMode,
    modules: runtimeSourceCarriersState,
    provider,
    release,
    paths,
    actions,
    settingsControlCenter,
    uiDefaults,
    runtimeActivityItems,
    workItemProjectionV2,
    brandSystemProfile: contracts.brandSystemProfile as unknown as JsonRecord,
    targetOperatingArchitecture: contracts.targetOperatingArchitecture as unknown as JsonRecord,
    currentOwnerDeltaReadModel,
    foundry,
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
      codex_personalization: {
        surface_kind: 'opl_codex_personalization.v1',
        user_agents: readCodexUserInstructions(),
        opl_flow_default_user_agents: readOplFlowDefaultUserInstructions(),
        authority_boundary: {
          user_agents_owner: 'user_codex_home',
          app_edit_action: 'codex_user_instructions_set',
          app_restore_action: 'codex_user_instructions_restore_opl_flow_default',
          opl_flow_role: 'install_and_semantically_merge_user_profile_only',
          opl_app_session_context_owner: 'one-person-lab-app',
        },
      },
      developer_profile: developerProfile,
      developer_mode: developerMode,
      runtime_source_carriers: runtimeSourceCarriersState,
      agent_packages: agentPackagesProjection,
      opl_agent_packages: profile === 'fast'
        ? compactFastLegacyAgentPackageDirectory(agentPackagesReadback)
        : agentPackagesReadback,
      opl_agent_package_status: profile === 'fast'
        ? compactFastLegacyAgentPackageStatus(agentPackagesProjection.status_index)
        : agentPackagesProjection.status_index,
      provider,
      assistants: {
        default_launch: 'direct_click',
        prompt_prefix_required: false,
        items: buildAssistants(runtimeSourceCarriers),
      },
      release,
      settings_control_center: settingsControlCenter,
      operator,
      foundry,
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
