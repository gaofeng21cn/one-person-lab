import {
  readOplDeveloperSupervisorConfig,
  readOplUpdateChannel,
  readOplWorkspaceRoot,
  writeOplDeveloperSupervisorConfig,
  writeOplUpdateChannel,
} from '../../../kernel/system-preferences.ts';
import { buildOplEndpoints } from '../../runway/index.ts';
import { runNativeHelperRepairAction } from '../../runway/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

import { runOplEngineAction } from './engine-actions.ts';
import { buildOplDeveloperModeSurface } from './developer-mode.ts';
import { runOplSystemDependencyMaintenance } from './dependency-doctor.ts';
import { buildOplEnvironment } from './environment.ts';
import { resolveFrameworkUpdateTargetRoot, runOplFrameworkSelfUpdate } from './framework-self-update.ts';
import { buildOplModules, runOplModuleAction } from './modules.ts';
import { applyOplSeedManifest } from './seed-manifest.ts';
import { resolveProjectRoot } from './shared.ts';
import { runOplStartupMaintenance } from './startup-maintenance.ts';
import type {
  OplSystemAction,
  OplSystemActionInput,
} from './shared.ts';

type OplSystemEnvironment = Awaited<ReturnType<typeof buildOplEnvironment>>['system_environment'];
type OplModuleStatus = ReturnType<typeof buildOplModules>['modules']['modules'][number];
type OplFrameworkStatus = ReturnType<typeof runOplFrameworkSelfUpdate>;
type OplEngineOrModuleUpdateTargetResult = {
  target_type: 'engine' | 'module';
  target_id: string;
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  result: unknown | null;
};

type SystemUpdateTargetResult = OplEngineOrModuleUpdateTargetResult | OplFrameworkStatus;

function normalizeUpdateStatus(status: string): OplEngineOrModuleUpdateTargetResult['status'] {
  return status === 'manual_required' ? 'manual_required' : 'completed';
}

function buildSkippedUpdate(
  targetType: OplEngineOrModuleUpdateTargetResult['target_type'],
  targetId: string,
  reason: string,
): OplEngineOrModuleUpdateTargetResult {
  return {
    target_type: targetType,
    target_id: targetId,
    status: 'skipped',
    reason,
    result: null,
  };
}

async function maybeUpdateCodex(
  contracts: FrameworkContracts,
  environment: OplSystemEnvironment,
): Promise<SystemUpdateTargetResult> {
  const codex = environment.core_engines.codex;
  if (!codex.installed) {
    return buildSkippedUpdate('engine', 'codex', 'codex_cli_missing');
  }
  if (codex.version_status === 'compatible' && !codex.update_available) {
    return buildSkippedUpdate('engine', 'codex', 'selected_codex_ready');
  }

  const result = await runOplEngineAction(contracts, 'update', 'codex');
  return {
    target_type: 'engine',
    target_id: 'codex',
    status: normalizeUpdateStatus(result.engine_action.status),
    reason: codex.update_available
      ? `codex_cli_latest_${codex.latest_version_status}`
      : `codex_cli_${codex.version_status}`,
    result: result.engine_action,
  };
}

function resolveModuleUpdateSkipReason(module: OplModuleStatus) {
  if (!module.installed) {
    return 'module_missing';
  }
  if (module.health_status === 'dirty' || module.git?.dirty) {
    return 'dirty_checkout';
  }
  if (module.git?.sync_status === 'diverged') {
    return 'diverged_checkout';
  }
  if (module.git?.sync_status === 'ahead') {
    return 'ahead_checkout';
  }
  if (module.git?.sync_status === 'no_upstream') {
    return 'no_upstream';
  }
  return 'module_ready';
}

function maybeUpdateModule(module: OplModuleStatus): SystemUpdateTargetResult {
  if (module.recommended_action !== 'update' || !module.available_actions.includes('update')) {
    return buildSkippedUpdate(
      'module',
      module.module_id,
      resolveModuleUpdateSkipReason(module),
    );
  }

  const result = runOplModuleAction('update', module.module_id);
  return {
    target_type: 'module',
    target_id: module.module_id,
    status: 'completed',
    reason: 'module_update_available',
    result: result.module_action,
  };
}

function maybeReconcileModule(module: OplModuleStatus): SystemUpdateTargetResult {
  if (!module.default_install) {
    return buildSkippedUpdate('module', module.module_id, 'optional_module_not_in_default_reconcile');
  }

  if (!module.installed || module.install_origin === 'missing') {
    const result = runOplModuleAction('install', module.module_id);
    return {
      target_type: 'module',
      target_id: module.module_id,
      status: 'completed',
      reason: 'module_missing',
      result: result.module_action,
    };
  }

  if (module.install_origin === 'invalid_checkout') {
    return buildSkippedUpdate('module', module.module_id, 'invalid_checkout');
  }

  if (module.health_status === 'dirty' || module.git?.dirty) {
    return {
      target_type: 'module',
      target_id: module.module_id,
      status: 'manual_required',
      reason: 'dirty_checkout',
      result: null,
    };
  }

  if (module.recommended_action === 'update' && module.available_actions.includes('update')) {
    const result = runOplModuleAction('update', module.module_id);
    return {
      target_type: 'module',
      target_id: module.module_id,
      status: 'completed',
      reason: 'module_update_available',
      result: result.module_action,
    };
  }

  if (module.git?.sync_status === 'diverged' || module.git?.sync_status === 'ahead' || module.git?.sync_status === 'no_upstream') {
    return {
      target_type: 'module',
      target_id: module.module_id,
      status: 'manual_required',
      reason: resolveModuleUpdateSkipReason(module),
      result: null,
    };
  }

  const result = runOplModuleAction('update', module.module_id);
  return {
    target_type: 'module',
    target_id: module.module_id,
    status: 'completed',
    reason: module.git?.sync_status === 'behind' ? 'module_update_available' : 'module_reconcile_refresh',
    result: result.module_action,
  };
}

function summarizeTargets(targets: SystemUpdateTargetResult[]) {
  const completedCount = targets.filter((entry) => entry.status === 'completed').length;
  const skippedCount = targets.filter((entry) => entry.status === 'skipped').length;
  const manualRequiredCount = targets.filter((entry) => entry.status === 'manual_required').length;

  return {
    total_targets_count: targets.length,
    completed_targets_count: completedCount,
    skipped_targets_count: skippedCount,
    manual_required_targets_count: manualRequiredCount,
  };
}

async function runOplSystemUpdate(contracts: FrameworkContracts) {
  const initialEnvironment = (await buildOplEnvironment(contracts)).system_environment;
  const initialModules = buildOplModules().modules.modules;
  const targets: SystemUpdateTargetResult[] = [
    runOplFrameworkSelfUpdate({ targetRoot: resolveFrameworkUpdateTargetRoot(resolveProjectRoot()) }),
    await maybeUpdateCodex(contracts, initialEnvironment),
    ...initialModules.map((module) => maybeUpdateModule(module)),
  ];
  const refreshedEnvironment = (await buildOplEnvironment(contracts)).system_environment;
  const summary = summarizeTargets(targets);

  return {
    version: 'g2',
    system_action: {
      action: 'update' as const,
      status: summary.manual_required_targets_count > 0 ? 'manual_required' : 'completed',
      update_channel: readOplUpdateChannel().channel,
      workspace_root: readOplWorkspaceRoot(),
      details: {
        summary,
        targets,
        system_environment: refreshedEnvironment,
      },
    },
  };
}

async function runOplSystemModuleReconcile(contracts: FrameworkContracts) {
  const initialModules = buildOplModules().modules.modules;
  const targets = initialModules.map((module) => maybeReconcileModule(module));
  const refreshedEnvironment = (await buildOplEnvironment(contracts)).system_environment;
  const summary = summarizeTargets(targets);

  return {
    version: 'g2',
    system_action: {
      action: 'reconcile_modules' as const,
      status: summary.manual_required_targets_count > 0 ? 'manual_required' : 'completed',
      update_channel: readOplUpdateChannel().channel,
      workspace_root: readOplWorkspaceRoot(),
      details: {
        latest_source: 'git_upstream',
        summary,
        targets,
        system_environment: refreshedEnvironment,
      },
    },
  };
}

export async function runOplSystemAction(
  contracts: FrameworkContracts,
  action: OplSystemAction,
  input: OplSystemActionInput = {},
) {
  if (action === 'repair') {
    return {
      version: 'g2',
      system_action: {
        action,
        status: 'manual_required',
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        details: {
          surface_kind: 'family_runtime_provider_repair',
          command_preview: ['opl', 'family-runtime', 'status', '--provider', 'temporal'],
          provider: null,
          note:
            'Generic system repair no longer manages a Hermes family-runtime bridge. Review or configure the Temporal provider explicitly.',
        },
      },
    };
  }

  if (action === 'repair_native_helpers') {
    const repairPayload = runNativeHelperRepairAction();
    return {
      version: 'g2',
      system_action: {
        action,
        status: repairPayload.status === 'completed' || repairPayload.status === 'skipped_ready'
          ? 'completed'
          : repairPayload.status,
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        details: repairPayload,
      },
    };
  }

  if (action === 'update') {
    return runOplSystemUpdate(contracts);
  }

  if (action === 'reconcile_modules') {
    return runOplSystemModuleReconcile(contracts);
  }

  if (action === 'startup_maintenance') {
    return runOplStartupMaintenance(contracts, {
      scope: input.startupMaintenanceScope,
    });
  }

  if (action === 'seed_apply') {
    const seedApply = await applyOplSeedManifest({
      seedDir: input.seedDir,
      dataDir: input.dataDir,
      projectsDir: input.projectsDir,
    });
    return {
      version: 'g2',
      system_action: {
        action,
        status: seedApply.seed_apply.status,
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        details: seedApply.seed_apply,
      },
    };
  }

  if (action === 'dependency_maintenance') {
    return runOplSystemDependencyMaintenance({
      profile: input.dependencyProfile,
      apply: input.apply,
    });
  }

  if (action === 'developer_supervisor') {
    const hasUpdate =
      input.developerSupervisorEnabled !== undefined
      || input.developerSupervisorMode !== undefined
      || input.developerSupervisorAutoEnableGithubLogin !== undefined
      || input.developerSupervisorModuleSource !== undefined;
    const payload = hasUpdate
      ? writeOplDeveloperSupervisorConfig({
        enabled: input.developerSupervisorEnabled,
        mode: input.developerSupervisorMode,
        auto_enable_github_login: input.developerSupervisorAutoEnableGithubLogin,
        module_source_preferences:
          input.developerSupervisorModuleId && input.developerSupervisorModuleSource
            ? { [input.developerSupervisorModuleId]: input.developerSupervisorModuleSource }
            : undefined,
      })
      : readOplDeveloperSupervisorConfig();
    return {
      version: 'g2',
      system_action: {
        action,
        status: hasUpdate ? 'completed' : 'ready',
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        developer_supervisor: payload,
        developer_mode: buildOplDeveloperModeSurface(buildOplEndpoints()),
        details: payload,
      },
    };
  }

  if (!input.channel) {
    const current = readOplUpdateChannel();
    return {
      version: 'g2',
      system_action: {
        action,
        status: 'ready',
        update_channel: current.channel,
        workspace_root: readOplWorkspaceRoot(),
        details: current,
      },
    };
  }

  const payload = writeOplUpdateChannel(input.channel);
  return {
    version: 'g2',
    system_action: {
      action,
      status: 'completed',
      update_channel: payload.channel,
      workspace_root: readOplWorkspaceRoot(),
      details: payload,
    },
  };
}
