import type { ReloadMode } from '../types.ts';

export interface PackageUpdateRow {
  readonly package_id: string;
  readonly installed_version: string;
  readonly available_version: string | null;
  readonly status: 'available' | 'current' | 'unavailable' | 'unmanaged';
  readonly reason?: string;
  readonly background_eligible?: boolean;
}

export interface PackageUpdateFailure {
  readonly package_id: string;
  readonly code: string;
  readonly message: string;
}

const projectedState = {
  available: 'update_available',
  current: 'current',
  unavailable: 'failed_with_repair',
  unmanaged: 'skipped_manual_required',
} as const;

export function managedUpdateProjection(
  rows: readonly PackageUpdateRow[],
  failures: readonly PackageUpdateFailure[] = [],
  reloadMode?: ReloadMode,
) {
  const failed = new Map(failures.map(failure => [failure.package_id, failure]));
  const packageStates = rows.map(row => {
    const failure = failed.get(row.package_id);
    const eligible = row.status === 'available' && row.background_eligible !== false && !failure;
    return {
      package_id: row.package_id,
      state: failure ? 'failed_with_repair' : projectedState[row.status],
      installed_owner_descriptor: { package_version: row.installed_version },
      available_version: row.available_version,
      background_update: {
        mode: row.status === 'unmanaged' || row.background_eligible === false
          ? 'explicit_owner_delegated' : 'silent_managed',
        eligible,
        app_background_safe: eligible,
        reason: failure?.code ?? row.reason,
      },
    };
  });
  const eligible = packageStates.some(row => row.background_update.eligible);
  const summaryState = [
    'failed_with_repair', 'update_available', 'skipped_manual_required',
  ].find(state => packageStates.some(row => row.state === state)) ?? 'current';
  let state = summaryState;
  if (failed.size > 0) state = 'failed_with_repair';
  else if (reloadMode === 'restart_required') state = 'needs_restart';
  else if (reloadMode === 'renderer_reload') state = 'needs_reload';

  return {
    operation: reloadMode === undefined ? 'plan' : 'apply',
    components: [{
      component_id: 'opl_packages',
      lifecycle_owner: 'opl_packages',
      state,
      current: { package_states: packageStates },
      auto_apply: {
        mode: 'silent_managed',
        eligible,
        app_background_safe: eligible,
        command_ref: eligible ? 'opl pack update --all --json' : null,
      },
      ...(reloadMode === undefined ? {} : {
        receipt: {
          reload_guidance: {
            reload_mode: reloadMode,
            reload_recommended: reloadMode === 'renderer_reload',
            restart_required: reloadMode === 'restart_required',
          },
        },
      }),
    }],
    execution: { status: failures.length > 0 ? 'partial_failure' : 'completed', failures },
  };
}
