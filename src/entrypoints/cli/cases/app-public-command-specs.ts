import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicAppCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  return {
    'app state': {
      usage: 'opl app state [--profile fast|full]',
      summary: 'Read the canonical OPL App state projection for GUI pages without page-local probing.',
      examples: ['opl app state --profile fast', 'opl app state --profile full --json'],
      group: 'app',
      handler: async (args) => {
        const { buildOplAppState, parseAppStateArgs } = await import('../../../modules/console/app-state.ts');
        return buildOplAppState(parseAppStateArgs(args));
      },
    },
    'app action execute': {
      usage: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run]',
      summary: 'Execute App mutations through the OPL-owned action boundary instead of page-local commands.',
      examples: [
        'opl app action execute --action developer_supervisor --payload \'{"developerSupervisorEnabled":"on"}\' --dry-run',
        'opl app action execute --action provider_scheduler_status --dry-run',
      ],
      group: 'app',
      handler: async (args) => {
        const { parseAppActionExecuteArgs } = await import(
          '../../../modules/console/app-state-parts/action-execute-parser.ts'
        );
        const options = parseAppActionExecuteArgs(args);
        const { runOplAppActionExecute } = await import(
          '../../../modules/console/app-state-parts/action-execute.ts'
        );
        return runOplAppActionExecute(getContracts(), options);
      },
    },
  };
}
