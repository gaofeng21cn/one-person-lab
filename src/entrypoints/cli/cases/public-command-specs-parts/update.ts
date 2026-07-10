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
        componentId: parsed.component as string | undefined,
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
      'opl update status [--component <component_id>]',
      'Read the unified managed update status projection for installation carrier, runtime substrate, capability packages, companion tools, Codex Surface, workflow profile, and user data.',
      ['opl update status --json', 'opl update status --component capability_packages --json'],
      getContracts,
    ),
    'update check': buildUpdateSpec(
      'check',
      'opl update check [--component <component_id>]',
      'Check managed update state without applying mutations.',
      ['opl update check --json', 'opl update check --component runtime_substrate --json'],
      getContracts,
    ),
    'update plan': buildUpdateSpec(
      'plan',
      'opl update plan [--component <component_id>]',
      'Build a safe managed update plan with provider-specific command refs.',
      ['opl update plan --json', 'opl update plan --component codex_surface --json'],
      getContracts,
    ),
    'update apply': buildUpdateSpec(
      'apply',
      'opl update apply [--component <component_id>]',
      'Project the controlled apply actions for one managed update component.',
      ['opl update apply --component capability_packages --json'],
      getContracts,
    ),
    'update repair': buildUpdateSpec(
      'repair',
      'opl update repair [--component <component_id>] [--receipt <receipt_id>]',
      'Project repair actions for a failed managed update receipt or component.',
      ['opl update repair --receipt receipt-001 --json'],
      getContracts,
    ),
    'update rollback': buildUpdateSpec( // reuse-first: allow owner-routed update command registry metadata.
      'rollback', // reuse-first: allow owner-routed update command registry metadata.
      'opl update rollback [--component <component_id>]', // reuse-first: allow owner-routed update command registry metadata.
      'Project rollback actions and authority boundaries for a managed update component.', // reuse-first: allow owner-routed update command registry metadata.
      ['opl update rollback --component runtime_substrate --json'], // reuse-first: allow owner-routed update command registry metadata.
      getContracts,
    ),
  };
}
