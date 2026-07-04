import {
  buildStandardDomainAgentScaffold,
  buildStandardDomainAgentScaffoldValidation,
} from '../../../../modules/foundry-lab/standard-domain-agent-scaffold.ts';
import { buildStandardDomainAgentScaffoldConsumptionEvidence } from '../../../../modules/foundry-lab/standard-domain-agent-template-consumption.ts';
import type { CommandSpec } from '../../modules/support.ts';
import { parseAgentsScaffoldArgs } from './agents-scaffold.ts';

type PrivateAgentCommandSpecsOptions = {
  getCommandSpecs: () => Record<string, CommandSpec>;
};

export function buildPrivateAgentCommandSpecs({
  getCommandSpecs,
}: PrivateAgentCommandSpecsOptions): Record<string, CommandSpec> {
  return {
    'agents scaffold': {
      usage: 'opl agents scaffold [--target-dir <path>] [--domain-id <id>] [--domain-label <label>] [--force] | [--validate <repo-dir>] | [--consumption-evidence]',
      summary:
        'Show, generate, or validate the OPL-owned standard domain-agent scaffold without owning domain truth.',
      examples: [
        'opl agents scaffold',
        'opl agents scaffold --target-dir /tmp/new-agent --domain-id award-foundry',
        'opl agents scaffold --validate /tmp/new-agent',
        'opl agents scaffold --consumption-evidence',
      ],
      handler: (args) => {
        const parsed = parseAgentsScaffoldArgs(args, getCommandSpecs()['agents scaffold']);
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
