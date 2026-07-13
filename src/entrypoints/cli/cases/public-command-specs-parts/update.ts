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
        componentId: operation === 'repair' || operation === 'rollback' ? 'opl_base' : undefined,
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
      'Read coordinated OPL Base and installed OPL Packages update status.',
      ['opl update status --json'],
      getContracts,
    ),
    'update check': buildUpdateSpec(
      'check',
      'opl update check',
      'Check OPL Base and installed OPL Packages without applying mutations.',
      ['opl update check --json'],
      getContracts,
    ),
    'update plan': buildUpdateSpec(
      'plan',
      'opl update plan',
      'Build the safe coordinated plan for OPL Base and installed OPL Packages.',
      ['opl update plan --json'],
      getContracts,
    ),
    'update apply': buildUpdateSpec(
      'apply',
      'opl update apply',
      'Apply eligible OPL Base and clean digest-locked OPL Packages through their existing lifecycle owners.',
      ['opl update apply --json'],
      getContracts,
    ),
    'update repair': buildUpdateSpec(
      'repair',
      'opl update repair [--receipt <receipt_id>]',
      'Repair a failed OPL Base update transaction; Package repair remains under opl packages repair.',
      ['opl update repair --receipt receipt-001 --json'],
      getContracts,
    ),
    'update rollback': buildUpdateSpec( // reuse-first: allow owner-routed update command registry metadata.
      'rollback', // reuse-first: allow owner-routed update command registry metadata.
      'opl update rollback', // reuse-first: allow owner-routed update command registry metadata.
      'Roll back the OPL Base runtime; Package rollback remains under opl packages rollback.', // reuse-first: allow owner-routed update command registry metadata.
      ['opl update rollback --json'], // reuse-first: allow owner-routed update command registry metadata.
      getContracts,
    ),
  };
}
