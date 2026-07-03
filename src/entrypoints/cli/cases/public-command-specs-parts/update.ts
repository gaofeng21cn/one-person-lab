import { buildManagedUpdateKernelProjection, type ManagedUpdateOperation } from '../../../../modules/connect/managed-update-kernel.ts';
import { runManagedUpdateKernelOperation } from '../../../../modules/connect/managed-update-kernel-runner.ts';
import type { FrameworkContracts } from '../../../../kernel/types.ts';
import { parseRegisteredCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

const UPDATE_COMMAND_AUTHORITY_BOUNDARY = {
  owner: 'OPL Managed Update / Pack owners',
  surface: 'managed_update_command_projection',
  can_write_domain_truth: false,
  can_create_owner_receipt: false,
  can_claim_domain_ready: false,
  can_claim_production_ready: false,
} as const;

function buildUpdateRegistry(
  commandId: string,
  operation: ManagedUpdateOperation, // reuse-first: allow owner-routed update command registry metadata.
): NonNullable<CommandSpec['registry']> {
  const options: NonNullable<CommandSpec['registry']>['options'] = [
    {
      name: 'component',
      flag: '--component',
      value_kind: 'string',
      summary: 'Managed update component id to project.',
    },
  ];
  if (operation === 'repair') {
    options.push({
      name: 'receipt',
      flag: '--receipt',
      value_kind: 'string',
      summary: 'Managed update receipt id to repair.',
    });
  }

  return {
    command_id: commandId,
    parser_adapter: 'node_util_parse_args',
    options,
    json_output_schema_ref:
      `contracts/opl-framework/cli-command-registry.json#/commands/update_${operation}/output_schema`,
    authority_boundary: UPDATE_COMMAND_AUTHORITY_BOUNDARY,
  };
}

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
    registry: buildUpdateRegistry(commandId, operation),
    handler: async (args) => {
      const parsed = parseRegisteredCommandOptions(commandId, args, spec);
      const input = {
        operation,
        componentId: parsed.component as string | undefined,
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
    'update rollback': buildUpdateSpec(
      'rollback',
      'opl update rollback [--component <component_id>]',
      'Project rollback actions and authority boundaries for a managed update component.',
      ['opl update rollback --component runtime_substrate --json'],
      getContracts,
    ),
  };
}
