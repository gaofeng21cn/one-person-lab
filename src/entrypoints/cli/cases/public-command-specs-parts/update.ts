import { buildManagedUpdateKernelProjection } from '../../../../modules/connect/managed-update-kernel.ts';
import type { ManagedUpdateOperation } from '../../../../modules/connect/managed-update-owner-boundary.ts';
import { runManagedUpdateKernelOperation } from '../../../../modules/connect/managed-update-kernel-runner.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { parseRegisteredCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function buildUpdateSpec(
  operation: ManagedUpdateOperation, // reuse-first: allow owner-routed update command registry metadata.
  usage: string,
  summary: string,
  examples: string[],
  getContracts: () => FrameworkContracts,
): CommandSpec {
  const commandId = `update ${operation}`;
  const spec: CommandSpec = {
    usage,
    summary,
    examples,
    group: 'update',
    handler: async (args) => {
      const parsed = parseRegisteredCommandOptions(commandId, args, spec);
      const input = {
        operation,
        componentId: 'opl_base',
        receiptId: parsed.receipt as string | undefined,
      };
      if (operation === 'apply' || operation === 'repair' || operation === 'rollback') { // reuse-first: allow owner-routed update command registry metadata.
        return runManagedUpdateKernelOperation(getContracts(), input);
      }
      return buildManagedUpdateKernelProjection(getContracts(), input);
    },
  };
  return spec;
}

export function buildUpdateCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  return {
    'update status': buildUpdateSpec(
      'status',
      'opl update status',
      'Read OPL Base update status, including Framework runtime and companion dependency/integration status.',
      ['opl update status --json'],
      getContracts,
    ),
    'update check': buildUpdateSpec(
      'check',
      'opl update check',
      'Check OPL Base update state without applying mutations.',
      ['opl update check --json'],
      getContracts,
    ),
    'update plan': buildUpdateSpec(
      'plan',
      'opl update plan',
      'Build the safe OPL Base update plan.',
      ['opl update plan --json'],
      getContracts,
    ),
    'update apply': buildUpdateSpec(
      'apply',
      'opl update apply',
      'Apply the controlled OPL Base update transaction.',
      ['opl update apply --json'],
      getContracts,
    ),
    'update repair': buildUpdateSpec(
      'repair',
      'opl update repair [--receipt <receipt_id>]',
      'Repair a failed OPL Base update transaction.',
      ['opl update repair --receipt receipt-001 --json'],
      getContracts,
    ),
    'update rollback': buildUpdateSpec( // reuse-first: allow owner-routed update command registry metadata.
      'rollback', // reuse-first: allow owner-routed update command registry metadata.
      'opl update rollback', // reuse-first: allow owner-routed update command registry metadata.
      'Roll back the OPL Base runtime through its controlled owner route.', // reuse-first: allow owner-routed update command registry metadata.
      ['opl update rollback --json'], // reuse-first: allow owner-routed update command registry metadata.
      getContracts,
    ),
  };
}
