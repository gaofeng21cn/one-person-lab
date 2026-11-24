import { buildManagedUpdateKernelProjection } from '../../../../adapters/integration/managed-update-kernel.ts';
import { runManagedUpdateKernelOperation } from '../../../../adapters/integration/index.ts';
import type { ManagedUpdateOperation } from '../../../../adapters/integration/managed-update-owner-boundary.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { parseRegisteredCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { activatePendingRuntimeGenerations } from '../../../../adapters/integration/system-installation/runtime-activation.ts';

function buildUpdateSpec(
  operation: ManagedUpdateOperation,
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
      if (operation === 'apply' || operation === 'repair' || operation === 'rollback') {
        return runManagedUpdateKernelOperation(getContracts(), input);
      }
      return buildManagedUpdateKernelProjection(getContracts(), input);
    },
  };
  return spec;
}

export function buildUpdateActivateCommandSpec(): CommandSpec {
  const activateSpec: CommandSpec = {
    usage: 'opl update activate',
    summary: 'Activate verified pending Codex and Framework generations offline before starting the App runtime.',
    examples: ['opl update activate --json'],
    group: 'update',
    handler: async (args) => {
      parseRegisteredCommandOptions('update activate', args, activateSpec);
      return activatePendingRuntimeGenerations();
    },
  };
  return activateSpec;
}

export function buildUpdateCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  return {
    'update activate': buildUpdateActivateCommandSpec(),
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
    'update rollback': buildUpdateSpec(
      'rollback',
      'opl update rollback',
      'Roll back the OPL Base runtime through its owner-controlled rollback pointer.',
      ['opl update rollback --json'],
      getContracts,
    ),
  };
}
