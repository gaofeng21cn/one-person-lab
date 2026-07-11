import { readOplUpdateChannel, readOplWorkspaceRoot } from '../../../kernel/system-preferences.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { runOplFlowIntelligenceEnhancementAction } from '../codexcont-intelligence-mode.ts';
import { recordManagedInstallUpdateReceipts } from '../managed-install-update-ledger.ts';

import { buildOplEnvironment } from './environment.ts';
import { buildDockerWebuiStartupReadback } from './docker-webui-doctor.ts';
import { runOplEngineAction } from './engine-actions.ts';
import { resolveFrameworkUpdateTargetRoot, runOplFrameworkSelfUpdate } from './framework-self-update.ts';
import { buildOplModules, runOplModuleAction } from './modules.ts';
import { applyOplSeedManifest } from './seed-manifest.ts';
import { resolveProjectRoot } from './shared.ts';

type ModuleStatus = ReturnType<typeof buildOplModules>['modules']['modules'][number];
type OplSystemEnvironment = Awaited<ReturnType<typeof buildOplEnvironment>>['system_environment'];

type StartupMaintenanceModuleTarget = {
  target_type: 'module';
  target_id: string;
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  action: 'install' | 'update' | 'sync' | null;
  install_origin_before: ModuleStatus['install_origin'];
  health_status_before: ModuleStatus['health_status'];
  git_before: ModuleStatus['git'];
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
};

type StartupMaintenanceEngineTarget = {
  target_type: 'engine';
  target_id: 'codex';
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  action: 'install' | 'update' | null;
  version_status_before: string;
  latest_version_status_before: string;
  update_available_before: boolean;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
};

type StartupMaintenanceTarget = StartupMaintenanceModuleTarget | StartupMaintenanceEngineTarget;
type StartupMaintenanceFrameworkTarget = ReturnType<typeof runOplFrameworkSelfUpdate>;
type StartupMaintenanceCapabilityTarget = StartupMaintenanceModuleTarget;
type StartupMaintenanceScope = 'all' | 'runtime_substrate';
type StartupMaintenanceIntelligenceEnhancementTarget = {
  target_type: 'opl_flow_intelligence_enhancement';
  target_id: 'codexcont';
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  action: 'repair' | null;
  status_before: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
};

function buildTarget(
  module: ModuleStatus,
  input: Pick<StartupMaintenanceModuleTarget, 'status' | 'reason' | 'action' | 'result' | 'error'>,
): StartupMaintenanceModuleTarget {
  return {
    target_type: 'module',
    target_id: module.module_id,
    install_origin_before: module.install_origin,
    health_status_before: module.health_status,
    git_before: module.git,
    ...input,
  };
}

function buildEngineTarget(
  environment: OplSystemEnvironment,
  input: Pick<StartupMaintenanceEngineTarget, 'status' | 'reason' | 'action' | 'result' | 'error'>,
): StartupMaintenanceEngineTarget {
  const codex = environment.core_engines.codex;
  return {
    target_type: 'engine',
    target_id: 'codex',
    version_status_before: codex.version_status,
    latest_version_status_before: codex.latest_version_status,
    update_available_before: Boolean(codex.update_available),
    ...input,
  };
}

function isManualSyncStatus(module: ModuleStatus) {
  if (
    module.install_origin === 'managed_root'
    && module.source_policy.effective_install_update_source === 'package_channel'
    && module.source_policy.package_channel_auto_update
  ) {
    return false;
  }
  const syncStatus = module.git?.sync_status;
  return syncStatus === 'ahead'
    || syncStatus === 'diverged'
    || syncStatus === 'no_upstream'
    || syncStatus === 'unknown';
}

function buildManualReason(module: ModuleStatus) {
  if (module.install_origin === 'sibling_workspace' || module.install_origin === 'env_override') {
    return 'developer_checkout_visible_not_app_managed';
  }
  if (module.install_origin === 'invalid_checkout' || module.health_status === 'invalid_checkout') {
    return 'invalid_checkout';
  }
  if (module.health_status === 'dirty' || module.git?.dirty) {
    return 'dirty_checkout';
  }
  if (isManualSyncStatus(module)) {
    return `${module.git?.sync_status ?? 'unknown'}_checkout`;
  }
  return 'manual_review_required';
}

function buildAutoUpdateReason(module: ModuleStatus) {
  if (module.source_policy.effective_install_update_source === 'package_channel') {
    return 'capability_packages_refresh';
  }
  return module.git?.sync_status === 'behind'
    ? 'module_update_available'
    : 'startup_health_and_skill_refresh';
}

function shouldAutoMaintain(module: ModuleStatus) {
  if (!module.default_install) {
    return { action: null, reason: 'optional_module_not_in_startup_maintenance' } as const;
  }
  if (!module.installed || module.install_origin === 'missing') {
    return { action: 'install', reason: 'module_missing' } as const;
  }
  if (
    (module.install_origin === 'env_override')
    || (
      module.install_origin === 'sibling_workspace'
      && (
        module.source_policy.configured_by === 'developer_mode'
        || module.source_policy.configured_by === 'env_source_mode'
      )
    )
  ) {
    return { action: 'sync', reason: buildManualReason(module) } as const;
  }
  if (
    module.install_origin === 'sibling_workspace'
    && module.checkout_path !== module.managed_checkout_path
  ) {
    return { action: 'install', reason: 'module_missing' } as const;
  }
  if (module.install_origin !== 'managed_root') {
    return { action: null, reason: buildManualReason(module) } as const;
  }
  if (module.health_status === 'invalid_checkout' || module.health_status === 'dirty' || module.git?.dirty) {
    return { action: null, reason: buildManualReason(module) } as const;
  }
  if (isManualSyncStatus(module)) {
    return { action: null, reason: buildManualReason(module) } as const;
  }
  return {
    action: 'update',
    reason: buildAutoUpdateReason(module),
  } as const;
}

function normalizeError(error: unknown) {
  if (error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function') {
    return error.toJSON() as Record<string, unknown>;
  }
  return {
    code: 'startup_maintenance_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

function isOplFlowScriptMissing(error: unknown) {
  return error instanceof FrameworkContractError
    && error.code === 'codex_command_failed'
    && error.message === 'OPL Flow intelligence enhancement script is not installed.';
}

function readBlockedWorkflowStep(target: StartupMaintenanceModuleTarget) {
  const turnkey = readNestedRecord(target.result, 'turnkey');
  for (const stepId of ['bootstrap', 'framework_link', 'skill_sync', 'health_check'] as const) {
    const step = readNestedRecord(turnkey, stepId);
    if (readNestedRecord(step, 'status') === 'blocked') {
      return { stepId, step };
    }
  }
  return null;
}

function runModuleStartupMaintenance(module: ModuleStatus): StartupMaintenanceModuleTarget {
  const plan = shouldAutoMaintain(module);
  if (!plan.action) {
    return buildTarget(module, {
      status: module.default_install ? 'manual_required' : 'skipped',
      reason: plan.reason,
      action: null,
      result: null,
      error: null,
    });
  }

  try {
    const result = runOplModuleAction(plan.action, module.module_id);
    const target = buildTarget(module, {
      status: 'completed',
      reason: plan.reason,
      action: plan.action,
      result: result.module_action as Record<string, unknown>,
      error: null,
    });
    const blockedStep = readBlockedWorkflowStep(target);
    if (blockedStep) {
      return {
        ...target,
        status: 'manual_required',
        reason: `module_${blockedStep.stepId}_blocked`,
      };
    }
    return target;
  } catch (error) {
    return buildTarget(module, {
      status: 'manual_required',
      reason: `${plan.reason}_failed`,
      action: plan.action,
      result: null,
      error: normalizeError(error),
    });
  }
}

function readNestedRecord(value: unknown, key: string) {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : null;
}

function readSkillSyncStatus(target: StartupMaintenanceModuleTarget) {
  const turnkey = readNestedRecord(target.result, 'turnkey');
  const skillSync = readNestedRecord(turnkey, 'skill_sync');
  const status = readNestedRecord(skillSync, 'status');
  return typeof status === 'string' ? status : null;
}

function readSkillSyncDomain(target: StartupMaintenanceModuleTarget) {
  const turnkey = readNestedRecord(target.result, 'turnkey');
  const skillSync = readNestedRecord(turnkey, 'skill_sync');
  const domainId = readNestedRecord(skillSync, 'domain_id');
  return typeof domainId === 'string' ? domainId : null;
}

function readHealthCheckStatus(target: StartupMaintenanceModuleTarget) {
  const turnkey = readNestedRecord(target.result, 'turnkey');
  const healthCheck = readNestedRecord(turnkey, 'health_check');
  const status = readNestedRecord(healthCheck, 'status');
  return typeof status === 'string' ? status : null;
}

function readString(value: unknown, key: string) {
  const nested = readNestedRecord(value, key);
  return typeof nested === 'string' && nested.trim().length > 0 ? nested.trim() : null;
}

function readBoolean(value: unknown, key: string) {
  const nested = readNestedRecord(value, key);
  return typeof nested === 'boolean' ? nested : null;
}

function repoNameForModuleId(moduleId: string) {
  const repoNames: Record<string, string> = {
    medautoscience: 'med-autoscience',
    medautogrant: 'med-autogrant',
    redcube: 'redcube-ai',
    oplmetaagent: 'opl-meta-agent',
    oplbookforge: 'opl-bookforge',
  };
  return repoNames[moduleId] ?? null;
}

function buildManagedReceiptInput(target: StartupMaintenanceModuleTarget) {
  if (
    target.status !== 'completed'
    || (target.action !== 'install' && target.action !== 'update')
    || readString(target.result, 'status') !== 'completed'
    || readSkillSyncStatus(target) !== 'completed'
    || readHealthCheckStatus(target) !== 'completed'
  ) {
    return null;
  }

  const module = readNestedRecord(target.result, 'module');
  if (readString(module, 'install_origin') !== 'managed_root') {
    return null;
  }

  const git = readNestedRecord(module, 'git');
  const moduleId = readString(module, 'module_id');
  const repoName = moduleId ? repoNameForModuleId(moduleId) : null;
  const checkoutPath = readString(module, 'checkout_path');
  const managedCheckoutPath = readString(module, 'managed_checkout_path');
  if (!moduleId || !repoName || !checkoutPath || !managedCheckoutPath) {
    return null;
  }

  return {
    module_id: moduleId,
    repo_name: repoName,
    action: target.action,
    reason: target.reason,
    install_origin_before: target.install_origin_before,
    install_origin_after: 'managed_root' as const,
    checkout_path: checkoutPath,
    managed_checkout_path: managedCheckoutPath,
    git_head_sha: readString(git, 'head_sha'),
    git_sync_status: readString(git, 'sync_status'),
    git_dirty: readBoolean(git, 'dirty'),
    skill_sync_domain: readSkillSyncDomain(target),
  };
}

function summarizeTargets(targets: StartupMaintenanceTarget[]) {
  return {
    total_targets_count: targets.length,
    completed_targets_count: targets.filter((entry) => entry.status === 'completed').length,
    skipped_targets_count: targets.filter((entry) => entry.status === 'skipped').length,
    manual_required_targets_count: targets.filter((entry) => entry.status === 'manual_required').length,
  };
}

function summarizeFrameworkTargets(targets: StartupMaintenanceFrameworkTarget[]) {
  return {
    total_targets_count: targets.length,
    completed_targets_count: targets.filter((entry) => entry.status === 'completed').length,
    skipped_targets_count: targets.filter((entry) => entry.status === 'skipped').length,
    manual_required_targets_count: targets.filter((entry) => entry.status === 'manual_required').length,
  };
}

function summarizeCapabilityTargets(targets: StartupMaintenanceCapabilityTarget[]) {
  return {
    total_targets_count: targets.length,
    completed_targets_count: targets.filter((entry) => entry.status === 'completed').length,
    skipped_targets_count: targets.filter((entry) => entry.status === 'skipped').length,
    manual_required_targets_count: targets.filter((entry) => entry.status === 'manual_required').length,
  };
}

function summarizeIntelligenceEnhancementTargets(targets: StartupMaintenanceIntelligenceEnhancementTarget[]) {
  return {
    total_targets_count: targets.length,
    completed_targets_count: targets.filter((entry) => entry.status === 'completed').length,
    skipped_targets_count: targets.filter((entry) => entry.status === 'skipped').length,
    manual_required_targets_count: targets.filter((entry) => entry.status === 'manual_required').length,
  };
}

async function maybeRunIntelligenceEnhancementStartupMaintenance(): Promise<StartupMaintenanceIntelligenceEnhancementTarget> {
  try {
    const statusReadback = await runOplFlowIntelligenceEnhancementAction('status', {}, false);
    const statusBefore = readNestedRecord(statusReadback, 'opl_flow_intelligence_enhancement');
    if (!statusBefore || typeof statusBefore !== 'object') {
      return {
        target_type: 'opl_flow_intelligence_enhancement',
        target_id: 'codexcont',
        status: 'manual_required',
        reason: 'intelligence_enhancement_status_unavailable',
        action: null,
        status_before: null,
        result: null,
        error: {
          code: 'intelligence_enhancement_status_unavailable',
          message: 'OPL Flow intelligence enhancement status readback is unavailable.',
        },
      };
    }

    const service = readNestedRecord(statusBefore, 'service');
    const serviceMode = readString(service, 'mode');
    const enabled = readBoolean(statusBefore, 'enabled') === true;
    const proxyRunning = readBoolean(statusBefore, 'proxy_running') === true;
    const definitionInstalled = readBoolean(service, 'definition_installed') === true;
    const scriptInstalled = readBoolean(service, 'script_installed') === true;

    if (!enabled) {
      return {
        target_type: 'opl_flow_intelligence_enhancement',
        target_id: 'codexcont',
        status: 'skipped',
        reason: 'intelligence_enhancement_disabled',
        action: null,
        status_before: statusBefore as Record<string, unknown>,
        result: null,
        error: null,
      };
    }

    const reason = serviceMode === 'container'
      ? 'container_startup_repair_required'
      : !definitionInstalled || !scriptInstalled
        ? 'persistent_service_definition_repair_required'
        : !proxyRunning
          ? 'persistent_service_proxy_repair_required'
          : null;
    if (!reason) {
      return {
        target_type: 'opl_flow_intelligence_enhancement',
        target_id: 'codexcont',
        status: 'skipped',
        reason: 'intelligence_enhancement_service_healthy',
        action: null,
        status_before: statusBefore as Record<string, unknown>,
        result: null,
        error: null,
      };
    }

    const repairResult = await runOplFlowIntelligenceEnhancementAction('repair', {}, false);
    return {
      target_type: 'opl_flow_intelligence_enhancement',
      target_id: 'codexcont',
      status: 'completed',
      reason,
      action: 'repair',
      status_before: statusBefore as Record<string, unknown>,
      result: readNestedRecord(repairResult, 'opl_flow_intelligence_enhancement_action') as Record<string, unknown> | null,
      error: null,
    };
  } catch (error) {
    if (isOplFlowScriptMissing(error)) {
      return {
        target_type: 'opl_flow_intelligence_enhancement',
        target_id: 'codexcont',
        status: 'skipped',
        reason: 'intelligence_enhancement_script_not_installed',
        action: null,
        status_before: null,
        result: null,
        error: null,
      };
    }
    return {
      target_type: 'opl_flow_intelligence_enhancement',
      target_id: 'codexcont',
      status: 'manual_required',
      reason: 'intelligence_enhancement_startup_repair_failed',
      action: 'repair',
      status_before: null,
      result: null,
      error: normalizeError(error),
    };
  }
}

async function maybeRunEngineStartupMaintenance(
  contracts: FrameworkContracts,
  environment: OplSystemEnvironment,
): Promise<StartupMaintenanceEngineTarget> {
  const codex = environment.core_engines.codex;
  if (!codex.installed) {
    try {
      const result = await runOplEngineAction(contracts, 'install', 'codex');
      return buildEngineTarget(environment, {
        status: result.engine_action.status === 'manual_required' ? 'manual_required' : 'completed',
        reason: 'codex_cli_missing',
        action: 'install',
        result: result.engine_action as Record<string, unknown>,
        error: null,
      });
    } catch (error) {
      return buildEngineTarget(environment, {
        status: 'manual_required',
        reason: 'codex_cli_missing_failed',
        action: 'install',
        result: null,
        error: normalizeError(error),
      });
    }
  }
  if (!codex.update_available) {
    return buildEngineTarget(environment, {
      status: 'skipped',
      reason: 'selected_codex_ready',
      action: null,
      result: null,
      error: null,
    });
  }
  const runtimeToolchain = codex.runtime_substrate_updater;
  const selectedRuntimeCodex =
    typeof runtimeToolchain.current_binary_path === 'string'
    && codex.binary_path === runtimeToolchain.current_binary_path;
  if (
    !selectedRuntimeCodex
    && codex.version_status === 'compatible'
    && runtimeToolchain.latest_version_status === 'current'
  ) {
    return buildEngineTarget(environment, {
      status: 'skipped',
      reason: 'compatible_system_codex_selected_runtime_substrate_current',
      action: null,
      result: null,
      error: null,
    });
  }

  try {
    const result = await runOplEngineAction(contracts, 'update', 'codex');
    return buildEngineTarget(environment, {
      status: result.engine_action.status === 'manual_required' ? 'manual_required' : 'completed',
      reason: `codex_cli_latest_${codex.latest_version_status}`,
      action: 'update',
      result: result.engine_action as Record<string, unknown>,
      error: null,
    });
  } catch (error) {
    return buildEngineTarget(environment, {
      status: 'manual_required',
      reason: `codex_cli_latest_${codex.latest_version_status}_failed`,
      action: 'update',
      result: null,
      error: normalizeError(error),
    });
  }
}

export async function runOplStartupMaintenance(
  contracts: FrameworkContracts,
  options: { scope?: StartupMaintenanceScope } = {},
) {
  const scope = options.scope ?? 'all';
  const initialEnvironment = (await buildOplEnvironment(contracts)).system_environment;
  const frameworkTargets: StartupMaintenanceFrameworkTarget[] = [
    runOplFrameworkSelfUpdate({
      targetRoot: resolveFrameworkUpdateTargetRoot(resolveProjectRoot()),
      allowChannelArtifact: scope === 'runtime_substrate',
    }),
  ];
  const engineTargets = [await maybeRunEngineStartupMaintenance(contracts, initialEnvironment)];
  const initialModules = scope === 'runtime_substrate'
    ? []
    : buildOplModules().modules.modules.filter((module) => module.default_install);
  const moduleTargets = initialModules
    .filter((module) => module.scope !== 'framework_capability_package')
    .map((module) => runModuleStartupMaintenance(module));
  const capabilityTargets: StartupMaintenanceCapabilityTarget[] = initialModules
    .filter((module) => module.scope === 'framework_capability_package')
    .map((module) => runModuleStartupMaintenance(module));
  const intelligenceEnhancementTargets = [await maybeRunIntelligenceEnhancementStartupMaintenance()];
  const frameworkSummary = summarizeFrameworkTargets(frameworkTargets);
  const engineSummary = summarizeTargets(engineTargets);
  const summary = summarizeTargets(moduleTargets);
  const capabilitySummary = summarizeCapabilityTargets(capabilityTargets);
  const intelligenceEnhancementSummary = summarizeIntelligenceEnhancementTargets(intelligenceEnhancementTargets);
  const managedReceiptRecord = recordManagedInstallUpdateReceipts(
    moduleTargets
      .map(buildManagedReceiptInput)
      .filter((receipt): receipt is NonNullable<typeof receipt> => Boolean(receipt)),
  );
  const syncedDomains = moduleTargets
    .filter((target) => readSkillSyncStatus(target) === 'completed')
    .map((target) => readSkillSyncDomain(target))
    .filter((domainId): domainId is string => Boolean(domainId));
  const seedApply = await applyOplSeedManifest();
  const refreshedEnvironment = (await buildOplEnvironment(contracts)).system_environment;
  const dockerWebuiStartup = buildDockerWebuiStartupReadback();

  return {
    version: 'g2',
    system_action: {
      action: 'startup_maintenance' as const,
      status: summary.manual_required_targets_count > 0
        || engineSummary.manual_required_targets_count > 0
        || frameworkSummary.manual_required_targets_count > 0
        || capabilitySummary.manual_required_targets_count > 0
        || intelligenceEnhancementSummary.manual_required_targets_count > 0
        ? 'manual_required'
        : 'completed',
      update_channel: readOplUpdateChannel().channel,
      workspace_root: readOplWorkspaceRoot(),
      details: {
        surface_kind: 'opl_app_startup_maintenance',
        mode: scope === 'runtime_substrate'
          ? 'runtime_substrate_adapter_startup'
          : 'clean_managed_environment_startup',
        scope,
        framework_summary: frameworkSummary,
        engine_summary: engineSummary,
        capability_summary: capabilitySummary,
        intelligence_enhancement_summary: intelligenceEnhancementSummary,
        summary,
        framework_targets: frameworkTargets,
        engine_targets: engineTargets,
        capability_targets: capabilityTargets,
        intelligence_enhancement_targets: intelligenceEnhancementTargets,
        module_targets: moduleTargets,
        seed_boundary: seedApply.seed_apply,
        docker_webui_startup: {
          startup_state: dockerWebuiStartup.startup_state,
          diagnostic_summary: dockerWebuiStartup.diagnostic_summary,
          startup_maintenance: {
            ...dockerWebuiStartup.startup_maintenance,
            execution_policy: 'executed_by_startup_maintenance',
          },
          api_key: dockerWebuiStartup.api_key,
          image: dockerWebuiStartup.image,
          next_actions: dockerWebuiStartup.nextActions,
        },
        managed_install_update_receipts: managedReceiptRecord,
        plugin_cache_freshness: {
          status: syncedDomains.length > 0
            ? 'freshened'
            : summary.manual_required_targets_count > 0 || capabilitySummary.manual_required_targets_count > 0
              ? 'manual_required'
              : capabilitySummary.completed_targets_count > 0
                ? 'package_refreshed'
                : 'already_current',
          source: capabilitySummary.total_targets_count > 0
            ? 'module_turnkey_skill_sync_and_framework_capability_package'
            : 'module_turnkey_skill_sync',
          synced_domain_packs_count: syncedDomains.length,
          synced_domain_packs: syncedDomains,
          managed_capability_packages_count: capabilityTargets.filter((target) => target.status === 'completed').length,
          managed_capability_packages: capabilityTargets
            .filter((target) => target.status === 'completed')
            .map((target) => target.target_id),
        },
        restart_reload_prompt: {
          required: syncedDomains.length > 0,
          action: syncedDomains.length > 0 ? 'reload_app_and_codex_plugin_cache' : 'none',
          affected_domains: syncedDomains,
        },
        authority_boundary: {
          can_write_domain_truth: false,
          can_write_domain_memory_body: false,
          can_mutate_domain_artifact_body: false,
          can_install_domain_daemon: false,
        },
        refreshed_system_environment: refreshedEnvironment,
        notes: [
          'Startup maintenance refreshes the managed OPL Framework runtime only when an explicit framework update source is configured.',
          'Startup maintenance updates clean OPL-managed module checkouts and syncs repo-local plugin carriers.',
          'Startup maintenance installs or updates MAS Scholar Skills from the managed GHCR capability packages channel so App workspace/quest sync can materialize it into the active paper directory.',
          'Startup maintenance repairs the OPL Flow intelligence enhancement CodexCont service only when the local Codex config already has that mode enabled and the service needs startup recovery.',
          'Dirty, ahead, diverged, no-upstream, env override, sibling workspace, and invalid checkouts are reported for manual review.',
          'MAS Scholar Skills is a framework capability plugin pack, not a domain module; workspace/quest-local sync is still explicit and target-bound.',
          'Docker/WebUI startup records image seed, /data, and /projects boundaries in the OPL state install manifest without claiming runtime or domain readiness.',
          'This action never writes domain truth, domain memory body, artifact body, quality verdict, export verdict, or domain daemons.',
        ],
      },
    },
  };
}
