import type { PackService, PackageOperationRecord } from '@opl/pack';

function appOperation(operation: PackageOperationRecord) {
  const { action, status, progress } = operation;
  if (action !== 'install' && action !== 'update' && action !== 'repair') return [];
  const terminal = status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'interrupted';
  const stage = status === 'queued' ? 'preparing' : status;
  return [{
    operation_id: operation.op_id,
    package_id: operation.package_id,
    action_id: `agent_package_${action}`,
    status: status === 'succeeded' ? 'completed' : terminal ? status : 'running',
    stage,
    can_cancel: false,
    // Only a download has a byte count. Local commits use progress units.
    ...(status === 'downloading' && {
      downloaded_bytes: progress.bytes_done,
      total_bytes: progress.bytes_total,
      cached_bytes: progress.cached_bytes,
      bytes_per_second: progress.speed_bps,
      eta_seconds: progress.eta_sec,
    }),
    ...(operation.error && { error_code: operation.error.code }),
  }];
}

/** Source every row from the Pack operation journal, including recovery after restart. */
export function readAppPackageOperations(pack: PackService) {
  return {
    supports_background: false,
    operations: pack.store.listOperations().flatMap(appOperation),
  };
}
