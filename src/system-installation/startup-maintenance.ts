import { readOplUpdateChannel, readOplWorkspaceRoot } from '../system-preferences.ts';
import type { FrameworkContracts } from '../types.ts';

import { buildOplEnvironment } from './environment.ts';
import { buildOplModules, runOplModuleAction } from './modules.ts';

type ModuleStatus = ReturnType<typeof buildOplModules>['modules']['modules'][number];

type StartupMaintenanceTarget = {
  target_type: 'module';
  target_id: string;
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  action: 'install' | 'update' | null;
  install_origin_before: ModuleStatus['install_origin'];
  health_status_before: ModuleStatus['health_status'];
  git_before: ModuleStatus['git'];
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
};

function buildTarget(
  module: ModuleStatus,
  input: Pick<StartupMaintenanceTarget, 'status' | 'reason' | 'action' | 'result' | 'error'>,
): StartupMaintenanceTarget {
  return {
    target_type: 'module',
    target_id: module.module_id,
    install_origin_before: module.install_origin,
    health_status_before: module.health_status,
    git_before: module.git,
    ...input,
  };
}

function isManualSyncStatus(module: ModuleStatus) {
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

function shouldAutoMaintain(module: ModuleStatus) {
  if (!module.default_install) {
    return { action: null, reason: 'optional_module_not_in_startup_maintenance' } as const;
  }
  if (!module.installed || module.install_origin === 'missing') {
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
    reason: module.git?.sync_status === 'behind'
      ? 'module_update_available'
      : 'startup_health_and_skill_refresh',
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

function runModuleStartupMaintenance(module: ModuleStatus): StartupMaintenanceTarget {
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
    return buildTarget(module, {
      status: 'completed',
      reason: plan.reason,
      action: plan.action,
      result: result.module_action as Record<string, unknown>,
      error: null,
    });
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

function readSkillSyncStatus(target: StartupMaintenanceTarget) {
  const turnkey = readNestedRecord(target.result, 'turnkey');
  const skillSync = readNestedRecord(turnkey, 'skill_sync');
  const status = readNestedRecord(skillSync, 'status');
  return typeof status === 'string' ? status : null;
}

function readSkillSyncDomain(target: StartupMaintenanceTarget) {
  const turnkey = readNestedRecord(target.result, 'turnkey');
  const skillSync = readNestedRecord(turnkey, 'skill_sync');
  const domainId = readNestedRecord(skillSync, 'domain_id');
  return typeof domainId === 'string' ? domainId : null;
}

function summarizeTargets(targets: StartupMaintenanceTarget[]) {
  return {
    total_targets_count: targets.length,
    completed_targets_count: targets.filter((entry) => entry.status === 'completed').length,
    skipped_targets_count: targets.filter((entry) => entry.status === 'skipped').length,
    manual_required_targets_count: targets.filter((entry) => entry.status === 'manual_required').length,
  };
}

export async function runOplStartupMaintenance(contracts: FrameworkContracts) {
  const initialModules = buildOplModules().modules.modules.filter((module) => module.default_install);
  const moduleTargets = initialModules.map((module) => runModuleStartupMaintenance(module));
  const summary = summarizeTargets(moduleTargets);
  const syncedDomains = moduleTargets
    .filter((target) => readSkillSyncStatus(target) === 'completed')
    .map((target) => readSkillSyncDomain(target))
    .filter((domainId): domainId is string => Boolean(domainId));
  const refreshedEnvironment = (await buildOplEnvironment(contracts)).system_environment;

  return {
    version: 'g2',
    system_action: {
      action: 'startup_maintenance' as const,
      status: summary.manual_required_targets_count > 0 ? 'manual_required' : 'completed',
      update_channel: readOplUpdateChannel().channel,
      workspace_root: readOplWorkspaceRoot(),
      details: {
        surface_kind: 'opl_app_startup_maintenance',
        mode: 'clean_managed_environment_startup',
        summary,
        module_targets: moduleTargets,
        plugin_cache_freshness: {
          status: syncedDomains.length > 0
            ? 'freshened'
            : summary.manual_required_targets_count > 0
              ? 'manual_required'
              : 'already_current',
          source: 'module_turnkey_skill_sync',
          synced_domain_packs_count: syncedDomains.length,
          synced_domain_packs: syncedDomains,
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
          'Startup maintenance only updates clean OPL-managed module checkouts and syncs generated plugin/skill surfaces.',
          'Dirty, ahead, diverged, no-upstream, env override, sibling workspace, and invalid checkouts are reported for manual review.',
          'This action never writes domain truth, domain memory body, artifact body, quality verdict, export verdict, or domain daemons.',
        ],
      },
    },
  };
}
