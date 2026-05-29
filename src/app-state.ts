import { FrameworkContractError, loadFrameworkContracts } from './contracts.ts';
import { readBundledCodexDefaultProfile, readLocalCodexDefaultsIfAvailable } from './local-codex-defaults.ts';
import { getOplReleaseRepo, getOplReleaseVersion, buildOplReleaseTag } from './opl-release.ts';
import { resolveOplStatePaths, ensureOplStateDir } from './runtime-state-paths.ts';
import { inspectFamilyRuntimeProviderWithLifecycle, resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import type { FrameworkContracts } from './types.ts';
import { buildDeveloperModeLiveCloseoutEvidenceSummary } from './app-state-developer-mode-closeout.ts';
import { runRuntimeOperatorActionExecute } from './runtime-operator-action-execution.ts';
import { buildOplDeveloperModeSurface } from './system-installation/developer-mode.ts';
import { resolveCodexVersion } from './system-installation/engine-helpers.ts';
import { buildOplModules, runOplModuleAction } from './system-installation/modules.ts';
import { runOplSystemAction } from './system-installation/system-actions.ts';
import { writeOplWorkspaceRootSurface } from './system-installation/workspace-root.ts';
import { buildOplEndpoints } from './opl-runtime-paths.ts';
import { readOplUpdateChannel, readOplWorkspaceRoot } from './system-preferences.ts';
import type { OplUpdateChannel } from './system-preferences.ts';
import path from 'node:path';
import { resolveDefaultFamilyWorkspaceRoot } from './opl-skills.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import { runOplEngineAction } from './system-installation/engine-actions.ts';
import { resolveProjectRoot, type OplEngineAction, type OplModuleAction, type OplModuleId } from './system-installation/shared.ts';
import { buildActionCatalog } from './app-state-action-catalog.ts';
import { parseAppStateProfile, type AppStateProfile } from './app-state-profile.ts';
import { buildOplAppOperatorViewModel } from './app-state-view-model.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

type JsonRecord = Record<string, unknown>;

type AppActionExecuteOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value: string, context: string): JsonRecord {
  const parsed = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${context} must be a JSON object.`, {
      context,
    });
  }
  return parsed;
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

export function parseAppActionExecuteArgs(args: string[]): AppActionExecuteOptions {
  let actionId = '';
  let payload: JsonRecord = {};
  let payloadSet = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];

    if (token === '--action' && value) {
      actionId = value;
      index += 1;
      continue;
    }

    if (token === '--payload' && value) {
      if (payloadSet) {
        throw new FrameworkContractError('cli_usage_error', 'Use --payload only once.', {
          option: '--payload',
        });
      }
      payload = parseJsonObject(value, '--payload');
      payloadSet = true;
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    throw new FrameworkContractError('cli_usage_error', `Unknown app action execute option: ${token}.`, {
      option: token,
      usage: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run]',
    });
  }

  if (!actionId) {
    throw new FrameworkContractError('cli_usage_error', 'app action execute requires --action.', {
      required: ['--action'],
    });
  }

  return { actionId, payload, dryRun };
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
        ? readMasManagedProviderProjection({ includeManifest: false })
        : readMasManagedProviderProjection(),
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
          'provider_scheduler_tick',
          'provider_worker_start',
          'provider_worker_restart',
        ],
      },
    },
  };
}

function buildReleaseState() {
  const updateChannel = readOplUpdateChannel();
  const oplFrameworkVersion = readOplFrameworkPackageVersion();
  const oplFrameworkRevision = readOplFrameworkRevision();
  return {
    version: getOplReleaseVersion(),
    tag: buildOplReleaseTag(),
    repo: getOplReleaseRepo(),
    opl_framework_version: oplFrameworkVersion,
    framework_version: oplFrameworkVersion,
    opl_framework_revision: oplFrameworkRevision.value,
    framework_revision: oplFrameworkRevision.value,
    framework_revision_source: oplFrameworkRevision.source,
    channel: updateChannel.channel,
    channel_source_updated_at: updateChannel.updated_at,
    prerelease_included: updateChannel.channel === 'preview',
    stable_release_api: `https://api.github.com/repos/${getOplReleaseRepo()}/releases/latest`,
    nightly_release_api: `https://api.github.com/repos/${getOplReleaseRepo()}/releases`,
    update_action: 'update_channel',
  };
}

function readOplFrameworkPackageVersion() {
  const override = process.env.OPL_FRAMEWORK_VERSION?.trim();
  if (override) {
    return override;
  }

  const packageJsonPath = path.join(resolveProjectRoot(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
  if (!version) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Framework package.json is missing version.', {
      package_json_path: packageJsonPath,
    });
  }
  return version;
}

function shortCommit(commit: string) {
  const trimmed = commit.trim();
  return /^[0-9a-f]{40}$/i.test(trimmed) ? trimmed.slice(0, 12) : trimmed;
}

function readPackagedFrameworkRevision(): string | null {
  const projectRoot = resolveProjectRoot();
  const manifestPaths = [
    path.join(projectRoot, '..', 'manifest', 'full-package-manifest.json'),
    path.join(projectRoot, '..', '..', 'manifest', 'full-package-manifest.json'),
  ];

  for (const manifestPath of manifestPaths) {
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as JsonRecord;
      const components = isRecord(manifest.components) ? manifest.components : {};
      const opl = isRecord(components.opl) ? components.opl : {};
      const commit = typeof opl.git_commit === 'string' ? opl.git_commit.trim() : '';
      if (commit) return shortCommit(commit);
    } catch {
      continue;
    }
  }

  return null;
}

function readGitFrameworkRevision(): string | null {
  const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: resolveProjectRoot(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function readOplFrameworkRevision() {
  const override = process.env.OPL_FRAMEWORK_REVISION?.trim();
  if (override) {
    return { value: shortCommit(override), source: 'OPL_FRAMEWORK_REVISION' };
  }

  const packagedRevision = readPackagedFrameworkRevision();
  if (packagedRevision) {
    return { value: packagedRevision, source: 'full_package_manifest' };
  }

  const gitRevision = readGitFrameworkRevision();
  if (gitRevision) {
    return { value: gitRevision, source: 'git_head' };
  }

  const dateOverride = process.env.OPL_FRAMEWORK_BUILD_DATE?.trim() || process.env.OPL_RELEASE_DATE?.trim();
  if (dateOverride) {
    return { value: dateOverride, source: 'build_date' };
  }

  const packageJsonPath = path.join(resolveProjectRoot(), 'package.json');
  const packageDate = fs.statSync(packageJsonPath).mtime.toISOString().slice(0, 10);
  return { value: packageDate, source: 'package_json_mtime' };
}

function buildCoreState(profile: AppStateProfile) {
  const defaultProfile = readBundledCodexDefaultProfile();
  const localDefaults = readLocalCodexDefaultsIfAvailable();
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

export async function buildOplAppState(input: { profile?: AppStateProfile } = {}) {
  const startedAt = Date.now();
  const profile = input.profile ?? 'fast';
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const modules = publicModuleItems(profile);
  const moduleSource = resolveModuleSource(modules);
  const developerMode = {
    ...buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: profile }),
    live_closeout_evidence: buildDeveloperModeLiveCloseoutEvidenceSummary(),
  };
  const provider = await buildProviderState(profile);
  const release = buildReleaseState();
  const workspaceRoot = readOplWorkspaceRoot();
  const core = buildCoreState(profile);
  const actions = buildActionCatalog();
  const uiDefaults = buildUiDefaults();
  const fullRuntimeDrilldown = profile === 'full'
    ? (await buildRuntimeTraySnapshot(loadFrameworkContracts() as FrameworkContracts, {
        appOperatorDrilldownDetailLevel: 'full',
      })).runtime_tray_snapshot.app_operator_drilldown as JsonRecord
    : null;
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
  const operator = buildOplAppOperatorViewModel({
    profile,
    core,
    developerMode,
    modules: modulesState,
    provider,
    release,
    paths,
    actions,
    uiDefaults,
  });

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
      developer_mode: developerMode,
      modules: modulesState,
      provider,
      assistants: {
        default_launch: 'direct_click',
        prompt_prefix_required: false,
        items: buildAssistants(modules),
      },
      release,
      operator,
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

function buildDryRunUnresolvedAction(options: AppActionExecuteOptions) {
  return {
    runtime_operator_action_execution: {
      surface_kind: 'opl_runtime_operator_action_execution',
      action_id: options.actionId,
      dry_run: true,
      route: null,
      execution: {
        execution_status: 'dry_run_unresolved',
        execution_kind: 'unresolved_action_route',
        route_ref: null,
        action_kind: null,
        executed_runtime_command: null,
        result: null,
      },
      authority_boundary: {
        opl: 'app_action_execute_preflight',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        provider_completion_is_domain_ready: false,
      },
      non_goals: [
        'does_not_write_domain_truth',
        'does_not_read_or_store_memory_body',
        'does_not_read_or_mutate_artifact_body',
        'does_not_authorize_quality_readiness_or_export_verdict',
      ],
    },
  };
}

function stringPayloadField(payload: JsonRecord, field: string) {
  const value = payload[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function releaseChannelPayload(payload: JsonRecord) {
  const channel = stringPayloadField(payload, 'channel');
  if (channel !== 'stable' && channel !== 'preview') {
    throw new FrameworkContractError('cli_usage_error', 'update_channel action requires payload.channel stable or preview.', {
      action_id: 'update_channel',
      allowed_channels: ['stable', 'preview'],
    });
  }
  return { channel: channel as OplUpdateChannel };
}

function workspaceRootPayload(payload: JsonRecord) {
  const workspaceRoot = stringPayloadField(payload, 'path')
    ?? stringPayloadField(payload, 'workspace_root')
    ?? stringPayloadField(payload, 'workspaceRoot');
  if (!workspaceRoot) {
    throw new FrameworkContractError('cli_usage_error', 'workspace_root_set action requires payload.path.', {
      action_id: 'workspace_root_set',
      required: ['path'],
    });
  }
  return workspaceRoot;
}

function booleanPayloadField(payload: JsonRecord, field: string, fallback = false) {
  const value = payload[field];
  return typeof value === 'boolean' ? value : fallback;
}

function positiveIntegerPayloadField(payload: JsonRecord, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new FrameworkContractError('cli_usage_error', `${field} must be a positive integer.`, {
      field,
      value,
    });
  }
  return value;
}

function parseCodexAction(actionId: string): OplEngineAction | null {
  const match = /^codex_(install|update|reinstall|remove)$/.exec(actionId);
  return match ? match[1] as OplEngineAction : null;
}

function parseModuleAction(actionId: string): OplModuleAction | null {
  const match = /^module_(install|update|reinstall|remove)$/.exec(actionId);
  return match ? match[1] as OplModuleAction : null;
}

function modulePayload(payload: JsonRecord): OplModuleId {
  const moduleId = stringPayloadField(payload, 'module_id')
    ?? stringPayloadField(payload, 'moduleId')
    ?? stringPayloadField(payload, 'module');
  if (
    moduleId !== 'medautoscience'
    && moduleId !== 'medautogrant'
    && moduleId !== 'redcube'
    && moduleId !== 'oplmetaagent'
    && moduleId !== 'meddeepscientist'
  ) {
    throw new FrameworkContractError('cli_usage_error', 'module action requires a known payload.module_id.', {
      required: ['module_id'],
      allowed_module_ids: ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'meddeepscientist'],
    });
  }
  return moduleId;
}

function dryRunEngineAction(action: OplEngineAction) {
  return {
    engine_action: {
      engine_id: 'codex',
      action,
      status: 'dry_run',
    },
  };
}

function dryRunModuleAction(action: OplModuleAction, moduleId: OplModuleId) {
  return {
    module_action: {
      module_id: moduleId,
      action,
      status: 'dry_run',
    },
  };
}

function schedulerTickArgs(payload: JsonRecord) {
  const args = ['scheduler', 'tick', '--provider', 'temporal'];
  if (booleanPayloadField(payload, 'force')) {
    args.push('--force');
  }
  const limit = positiveIntegerPayloadField(payload, 'limit');
  if (limit !== null) {
    args.push('--limit', String(limit));
  }
  if (payload.hydrate === false) {
    args.push('--no-hydrate');
  }
  return args;
}

function dryRunFamilyRuntimeResult(surface: string, args: string[]) {
  const commandPreview = ['opl', 'family-runtime', ...args];
  if (surface === 'scheduler_tick') {
    return {
      family_runtime_scheduler_tick: {
        action: 'tick',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'scheduler_cadence') {
    return {
      family_runtime_scheduler_cadence: {
        action: args[1],
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: commandPreview,
      },
    };
  }
  if (surface === 'worker_restart') {
    return {
      family_runtime_worker_restart: {
        action: 'restart',
        provider_kind: 'temporal',
        status: 'dry_run',
        command_preview: [
          ['opl', 'family-runtime', 'worker', 'stop', '--provider', 'temporal'],
          ['opl', 'family-runtime', 'worker', 'start', '--provider', 'temporal'],
        ],
      },
    };
  }
  return {
    family_runtime_worker: {
      action: args[1],
      provider_kind: 'temporal',
      status: 'dry_run',
      command_preview: commandPreview,
    },
  };
}

async function executeDirectAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const codexAction = parseCodexAction(options.actionId);
  if (codexAction) {
    return {
      delegatedSurface: `opl engine ${codexAction} --engine codex`,
      result: options.dryRun
        ? dryRunEngineAction(codexAction)
        : await runOplEngineAction(contracts, codexAction, 'codex'),
    };
  }

  const moduleAction = parseModuleAction(options.actionId);
  if (moduleAction) {
    const moduleId = modulePayload(options.payload);
    return {
      delegatedSurface: `opl module ${moduleAction} --module ${moduleId}`,
      result: options.dryRun
        ? dryRunModuleAction(moduleAction, moduleId)
        : runOplModuleAction(moduleAction, moduleId),
    };
  }

  if (options.actionId === 'developer_supervisor') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: options.payload,
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor', {
          developerSupervisorEnabled: stringPayloadField(options.payload, 'developerSupervisorEnabled') as 'auto' | 'on' | 'off' | undefined,
          developerSupervisorMode: stringPayloadField(options.payload, 'developerSupervisorMode') as 'external_observe' | 'developer_apply_safe' | undefined,
          developerSupervisorAutoEnableGithubLogin:
            stringPayloadField(options.payload, 'developerSupervisorAutoEnableGithubLogin') ?? undefined,
        }),
    };
  }

  if (options.actionId === 'developer_supervisor_refresh') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: {},
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor'),
    };
  }

  if (options.actionId === 'update_channel') {
    return {
      delegatedSurface: 'opl system update-channel',
      result: options.dryRun
        ? {
            system_action: {
              action: 'update_channel',
              status: 'dry_run',
              details: releaseChannelPayload(options.payload),
            },
          }
        : await runOplSystemAction(contracts, 'update_channel', releaseChannelPayload(options.payload)),
    };
  }

  if (options.actionId === 'workspace_root_set') {
    const workspaceRoot = workspaceRootPayload(options.payload);
    return {
      delegatedSurface: 'opl workspace root set',
      result: options.dryRun
        ? {
            workspace_root: {
              selected_path: workspaceRoot,
              status: 'dry_run',
            },
          }
        : writeOplWorkspaceRootSurface(workspaceRoot),
    };
  }

  if (options.actionId === 'provider_scheduler_status') {
    return {
      delegatedSurface: 'opl family-runtime scheduler status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_scheduler_cadence: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await runFamilyRuntime(['scheduler', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_scheduler_install') {
    const args = ['scheduler', 'install', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler install --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_trigger') {
    const args = ['scheduler', 'trigger', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler trigger --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_tick') {
    const args = schedulerTickArgs(options.payload);
    return {
      delegatedSurface: 'opl family-runtime scheduler tick --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_tick', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_status') {
    return {
      delegatedSurface: 'opl family-runtime worker status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_worker: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await runFamilyRuntime(['worker', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_worker_start') {
    const args = ['worker', 'start', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime worker start --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('worker', args) : await runFamilyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_restart') {
    return {
      delegatedSurface: 'opl family-runtime worker restart --provider temporal',
      result: options.dryRun
        ? dryRunFamilyRuntimeResult('worker_restart', ['worker', 'restart', '--provider', 'temporal'])
        : {
            family_runtime_worker_restart: {
              action: 'restart',
              provider_kind: 'temporal',
              stop: await runFamilyRuntime(['worker', 'stop', '--provider', 'temporal']),
              start: await runFamilyRuntime(['worker', 'start', '--provider', 'temporal']),
            },
          },
    };
  }

  return null;
}

export async function runOplAppActionExecute(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  const direct = await executeDirectAppAction(contracts, options);
  if (direct) {
    return {
      version: 'g2',
      app_action_execution: {
        surface_kind: 'opl_app_action_execution.v1',
        action_id: options.actionId,
        dry_run: options.dryRun,
        delegated_surface: direct.delegatedSurface,
        result: direct.result,
        authority_boundary: {
          opl: 'app_action_boundary_and_runtime_route_delegate',
          app_repo: 'gui_product_truth_and_release_gate_owner',
          shell: 'implementation_adapter_only',
          can_write_domain_truth: false,
          can_read_memory_body: false,
          can_read_artifact_body: false,
        },
      },
    };
  }

  let result: unknown;
  try {
    result = await runRuntimeOperatorActionExecute(contracts, [
      '--action',
      options.actionId,
      ...(Object.keys(options.payload).length > 0 ? ['--payload', JSON.stringify(options.payload)] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
    ]);
  } catch (error) {
    if (!options.dryRun) {
      throw error;
    }
    if (!(error instanceof FrameworkContractError) || error.code !== 'cli_usage_error') {
      throw error;
    }
    result = buildDryRunUnresolvedAction(options);
  }

  return {
    version: 'g2',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1',
      action_id: options.actionId,
      dry_run: options.dryRun,
      delegated_surface: 'opl runtime action execute',
      result,
      authority_boundary: {
        opl: 'app_action_boundary_and_runtime_route_delegate',
        app_repo: 'gui_product_truth_and_release_gate_owner',
        shell: 'implementation_adapter_only',
        can_write_domain_truth: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
      },
    },
  };
}
