import { observePackageOperation, PACKAGE_BACKGROUND_ACTIONS } from '../../../adapters/integration/index.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { runRuntimeOperatorActionExecute } from '../../../adapters/execution/index.ts';
import { buildRuntimeTraySnapshot } from '../runtime-tray-snapshot.ts';
import { buildDryRunUnresolvedAction } from './action-execute-previews.ts';
import {
  executeDirectAppAction,
  type AppActionExecuteServices,
} from './action-execute-direct.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
export { parseAppActionExecuteArgs } from './action-execute-parser.ts';

export async function runOplAppActionExecute(contracts: FrameworkContracts, options: AppActionExecuteOptions, services: AppActionExecuteServices) {
  const execute = () => executeAppAction(contracts, options, services);
  return !options.dryRun && PACKAGE_BACKGROUND_ACTIONS.has(options.actionId) ? observePackageOperation(execute) : execute();
}

async function executeAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
  services: AppActionExecuteServices,
) {
  const direct = await executeDirectAppAction(
    contracts,
    options,
    services,
  );
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
    ], {
      runtimeSnapshotProvider: buildRuntimeTraySnapshot,
      familyRuntime: services.familyRuntime,
    });
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
