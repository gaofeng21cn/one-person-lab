import {
  buildStandardDomainAgentScaffold,
  buildStandardDomainAgentScaffoldValidation,
} from '../../../../modules/foundry-lab/standard-domain-agent-scaffold.ts';
import { buildStandardDomainAgentScaffoldConsumptionEvidence } from '../../../../modules/foundry-lab/standard-domain-agent-template-consumption.ts';
import { materializeAgentScaffold } from '../../../../modules/foundry-lab/agent-scaffold-materialization.ts';
import { runStandardAgentAction } from '../../../../modules/runway/standard-agent-action-runtime.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { parseAgentsRunArgs } from './agents-run.ts';
import { parseAgentsScaffoldArgs } from './agents-scaffold.ts';

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
      handler: (args) => runStandardAgentAction(parseAgentsRunArgs(args, getCommandSpecs()['agents run'])),
    },
    'agents scaffold': {
      usage: 'opl agents scaffold [--target-dir <path>] [--domain-id <id>] [--domain-label <label>] [--force] | --materialize-request <request.json> --target-dir <path> | [--validate <repo-dir>] | [--consumption-evidence]',
      summary:
        'Show, generate, or validate the OPL-owned standard domain-agent scaffold without owning domain truth.',
      examples: [
        'opl agents scaffold',
        'opl agents scaffold --target-dir /tmp/new-agent --domain-id award-foundry',
        'opl agents scaffold --validate /tmp/new-agent',
        'opl agents scaffold --consumption-evidence',
        'opl agents scaffold --materialize-request request.json --target-dir /tmp/new-agent --json',
      ],
      handler: (args) => {
        const parsed = parseAgentsScaffoldArgs(args, getCommandSpecs()['agents scaffold']);
        if (parsed.materializeRequestPath && parsed.targetDir) {
          return materializeAgentScaffold({ requestPath: parsed.materializeRequestPath, targetDir: parsed.targetDir });
        }
        if (parsed.consumptionEvidence) {
          return buildStandardDomainAgentScaffoldConsumptionEvidence(parsed);
        }
        if (parsed.validateRepoDir) {
          return buildStandardDomainAgentScaffoldValidation({ repoDir: parsed.validateRepoDir });
        }
        return buildStandardDomainAgentScaffold(parsed);
      },
    },
  };
}
