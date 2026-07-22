import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicAppCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  return {
    'app state': {
      usage: 'opl app state [--profile runtime|fast|full]',
      summary: 'Read the canonical OPL App state projection for GUI pages without page-local probing.',
      examples: [
        'opl app state --profile fast',
        'opl app state --profile runtime --json',
        'opl app state --profile full --json',
      ],
      group: 'app',
      handler: async (args) => {
        const { parseAppStateArgs } = await import('../../../modules/console/app-state-profile.ts');
        const input = parseAppStateArgs(args);
        if (input.profile === 'runtime') {
          const { buildOplRuntimeAppState } = await import('../../../modules/console/app-runtime-state.ts');
          return buildOplRuntimeAppState();
        }
        const { buildOplAppState } = await import('../../../modules/console/app-state.ts');
        return buildOplAppState({ profile: input.profile });
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
    'app view read': {
      usage: 'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <n>]',
      summary: 'Read one descriptor-declared, item-scoped JSON detail view without accepting arbitrary paths.',
      examples: [
        'opl app view read --item-id <canonical-item-id> --view-id scientific-reasoning --json',
        'opl app view read --item-id <canonical-item-id> --view-id scientific-reasoning --if-revision 4 --json',
      ],
      group: 'app',
      handler: async (args) => {
        const { buildDomainDetailViewReadback, parseAppViewReadArgs } = await import(
          '../../../modules/console/domain-detail-view.ts'
        );
        return buildDomainDetailViewReadback(parseAppViewReadArgs(args));
      },
    },
  };
}
