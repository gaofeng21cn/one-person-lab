import type { runFamilyRuntime } from '../../../adapters/execution/index.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import { dryRunFamilyRuntimeResult } from './action-execute-previews.ts';

export async function executeProviderAppAction(
  options: AppActionExecuteOptions,
  familyRuntime: typeof runFamilyRuntime,
) {
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
        : await familyRuntime(['scheduler', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_service_status') {
    return {
      delegatedSurface: 'opl family-runtime service status --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_service: {
              action: 'status',
              provider_kind: 'temporal',
              status: 'dry_run',
            },
          }
        : await familyRuntime(['service', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_service_start') {
    const args = ['service', 'start', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime service start --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_service: {
              action: 'start',
              provider_kind: 'temporal',
              status: 'dry_run',
              command_preview: ['opl', 'family-runtime', ...args],
            },
          }
        : await familyRuntime(args),
    };
  }

  if (options.actionId === 'provider_service_restart') {
    const args = ['service', 'restart', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime service restart --provider temporal',
      result: options.dryRun
        ? {
            family_runtime_service: {
              action: 'restart',
              provider_kind: 'temporal',
              status: 'dry_run',
              success_requires: [
                'fresh_service_readback_ready',
                'fresh_supervisor_readback_ready_or_not_applicable',
                'darwin_managed_supervisor_pid_changed',
              ],
              command_preview: ['opl', 'family-runtime', ...args],
            },
          }
        : await familyRuntime(args),
    };
  }

  if (options.actionId === 'provider_service_stop') {
    const args = ['service', 'stop', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime service stop --provider temporal',
      result: options.dryRun
        ? dryRunFamilyRuntimeResult('service', args)
        : await familyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_install') {
    const args = ['scheduler', 'install', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler install --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await familyRuntime(args),
    };
  }

  if (options.actionId === 'provider_scheduler_trigger') {
    const args = ['scheduler', 'trigger', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime scheduler trigger --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('scheduler_cadence', args) : await familyRuntime(args),
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
        : await familyRuntime(['worker', 'status', '--provider', 'temporal']),
    };
  }

  if (options.actionId === 'provider_worker_start') {
    const args = ['worker', 'start', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime worker start --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('worker', args) : await familyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_restart') {
    const args = ['repair', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime repair --provider temporal',
      result: options.dryRun
        ? dryRunFamilyRuntimeResult('provider_repair', args)
        : await familyRuntime(args),
    };
  }

  if (options.actionId === 'provider_worker_stop') {
    const args = ['worker', 'stop', '--provider', 'temporal'];
    return {
      delegatedSurface: 'opl family-runtime worker stop --provider temporal',
      result: options.dryRun ? dryRunFamilyRuntimeResult('worker', args) : await familyRuntime(args),
    };
  }

  return null;
}
