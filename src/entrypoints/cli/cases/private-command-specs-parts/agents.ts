import {
  QUALIFICATION_PROVISIONING_ACTION_ID,
  runStandardAgentAction,
  runStandardAgentQualificationProvisioning,
} from '../../../../modules/runway/standard-agent-action-runtime.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { parseAgentsRunArgs } from './agents-run.ts';

type PrivateAgentCommandSpecsOptions = {
  getCommandSpecs: () => Record<string, CommandSpec>;
};

export function buildPrivateAgentCommandSpecs({
  getCommandSpecs,
}: PrivateAgentCommandSpecsOptions): Record<string, CommandSpec> {
  return {
    'agents run': {
      usage: 'opl agents run --domain <agent> --action <action_id> --workspace <absolute_path> [--payload <json> | --payload-file <path>] [--run-id <id>] [--timeout-ms <ms>]',
      summary: 'Run one managed Standard Agent action through the OPL-hosted Handler or Temporal StageRun boundary.',
      examples: [
        'opl agents run --domain obf --action shape-storyline --workspace /path/to/book --payload \'{"workspace_root":"/path/to/book"}\'',
        'opl agents run --domain mas --action study-progress --workspace /path/to/workspace --payload-file request.json --json',
      ],
      handler: (args) => {
        const input = parseAgentsRunArgs(args, getCommandSpecs()['agents run']);
        return input.actionId === QUALIFICATION_PROVISIONING_ACTION_ID
          ? runStandardAgentQualificationProvisioning(input)
          : runStandardAgentAction(input);
      },
    },
  };
}
