import {
  readOplUpdateChannel,
  readOplWorkspaceRoot,
  writeOplUpdateChannel,
} from '../system-preferences.ts';
import { runProductEntryRepairHermesGateway } from '../product-entry-runtime.ts';
import { runNativeHelperRepairAction } from '../native-helper-runtime.ts';
import type { GatewayContracts } from '../types.ts';

import { runOplEngineAction } from './engine-actions.ts';
import { buildOplEnvironment } from './environment.ts';
import { buildOplModules, runOplModuleAction } from './modules.ts';
import type {
  OplSystemAction,
  OplSystemActionInput,
} from './shared.ts';

type OplSystemEnvironment = Awaited<ReturnType<typeof buildOplEnvironment>>['system_environment'];
type OplModuleStatus = ReturnType<typeof buildOplModules>['modules']['modules'][number];

type SystemUpdateTargetResult = {
  target_type: 'engine' | 'module';
  target_id: string;
  status: 'completed' | 'skipped' | 'manual_required';
  reason: string;
  result: unknown | null;
};

function normalizeUpdateStatus(status: string): SystemUpdateTargetResult['status'] {
  return status === 'manual_required' ? 'manual_required' : 'completed';
}

function buildSkippedUpdate(
  targetType: SystemUpdateTargetResult['target_type'],
  targetId: string,
  reason: string,
): SystemUpdateTargetResult {
  return {
    target_type: targetType,
    target_id: targetId,
    status: 'skipped',
    reason,
    result: null,
  };
}

async function maybeUpdateCodex(
  contracts: GatewayContracts,
  environment: OplSystemEnvironment,
): Promise<SystemUpdateTargetResult> {
  const codex = environment.core_engines.codex;
  if (!codex.installed) {
    return buildSkippedUpdate('engine', 'codex', 'codex_cli_missing');
  }
  if (codex.version_status === 'compatible') {
    return buildSkippedUpdate('engine', 'codex', 'selected_codex_ready');
  }

  const result = await runOplEngineAction(contracts, 'update', 'codex');
  return {
    target_type: 'engine',
    target_id: 'codex',
    status: normalizeUpdateStatus(result.engine_action.status),
    reason: `codex_cli_${codex.version_status}`,
    result: result.engine_action,
  };
}

async function maybeUpdateHermes(
  contracts: GatewayContracts,
  environment: OplSystemEnvironment,
): Promise<SystemUpdateTargetResult> {
  const hermes = environment.core_engines.hermes;
  if (!hermes.installed) {
    return buildSkippedUpdate('engine', 'hermes', 'hermes_missing');
  }
  if (!hermes.update_available) {
    return buildSkippedUpdate('engine', 'hermes', 'hermes_ready');
  }

  const result = await runOplEngineAction(contracts, 'update', 'hermes');
  return {
    target_type: 'engine',
    target_id: 'hermes',
    status: normalizeUpdateStatus(result.engine_action.status),
    reason: hermes.update_summary ?? 'hermes_update_available',
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

async function runOplSystemUpdate(contracts: GatewayContracts) {
  const initialEnvironment = (await buildOplEnvironment(contracts)).system_environment;
  const initialModules = buildOplModules().modules.modules;
  const targets: SystemUpdateTargetResult[] = [
    await maybeUpdateCodex(contracts, initialEnvironment),
    await maybeUpdateHermes(contracts, initialEnvironment),
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

async function runOplSystemModuleReconcile(contracts: GatewayContracts) {
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
  contracts: GatewayContracts,
  action: OplSystemAction,
  input: OplSystemActionInput = {},
) {
  if (action === 'repair') {
    const repairPayload = runProductEntryRepairHermesGateway();
    return {
      version: 'g2',
      system_action: {
        action,
        status: 'completed',
        update_channel: readOplUpdateChannel().channel,
        workspace_root: readOplWorkspaceRoot(),
        details: repairPayload.product_entry,
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
