import { isRecord } from '../../../kernel/contract-validation.ts';
import { packageDownloadPlan } from '../../../adapters/integration/index.ts';
import { cancelPackageOperation, packageOperationStatus, startPackageOperation, validatePackageOperationRequest } from '../../../adapters/integration/index.ts';
import { executeAgentPackageAppAction } from './action-execute-packages.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

export async function executePackageOperationAppAction(options: AppActionExecuteOptions) {
  const delegatedSurface = 'opl packages native lifecycle with observable transfer';
  if (options.actionId === 'package_operation_status') {
    const id = options.payload.operation_id;
    if (id !== undefined && typeof id !== 'string') throw new Error('invalid_package_operation_id');
    return { delegatedSurface, result: { operations: packageOperationStatus(id) } };
  }
  if (options.actionId === 'package_operation_cancel') {
    if (typeof options.payload.operation_id !== 'string') throw new Error('invalid_package_operation_id');
    return { delegatedSurface, result: options.dryRun ? { operations: packageOperationStatus(options.payload.operation_id) } : cancelPackageOperation(options.payload.operation_id) };
  }
  if (options.actionId !== 'package_operation_start') return null;
  const { actionId, packageId } = validatePackageOperationRequest(options.payload.action_id, options.payload.package_id);
  if (options.dryRun) {
    const preview = await executeAgentPackageAppAction({ actionId, payload: { package_id: packageId }, dryRun: true });
    const result = isRecord(preview?.result) ? preview.result : {};
    const lifecycle = Object.values(result).find(value => isRecord(value) && Array.isArray(value.required_dependency_install_results));
    const dependencies = isRecord(lifecycle) && Array.isArray(lifecycle.required_dependency_install_results) ? lifecycle.required_dependency_install_results : [];
    const ids = new Set([packageId, ...dependencies.filter(isRecord).filter(item => item.native_carrier_action !== 'not_dispatched').map(item => String(item.package_id))]);
    return { delegatedSurface, result: { download_plan: [...ids].map(id => packageDownloadPlan(id)), native_preview: preview?.result } };
  }
  return { delegatedSurface, result: { operation: await startPackageOperation(actionId, packageId) } };
}
