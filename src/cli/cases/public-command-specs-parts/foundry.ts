import {
  FOUNDRY_AGENT_OPERATIONS,
  buildFoundryAgentCliSpine,
  buildFoundryAgentInspect,
  buildFoundryAgentsList,
} from '../../../foundry-agent-cli-spine.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildFoundryCommandSpecs(): Record<string, CommandSpec> {
  const foundrySpineSpecs: Record<string, CommandSpec> = Object.fromEntries(
    FOUNDRY_AGENT_OPERATIONS.map((operation) => {
      const command = `agents foundry ${operation}`;
      const spec: CommandSpec = {
        usage: `opl ${command}`,
        summary: `Read the Foundry Agent series ${operation} spine for OPL-generated agent CLIs, skills, MCP descriptors, and App action projections.`,
        examples: [`opl ${command} --json`],
        group: 'foundry',
        handler: (args) => buildFoundryAgentCliSpine(operation, args),
      };
      return [command, spec];
    }),
  );

  return {
    ...foundrySpineSpecs,
    'foundry agents list': {
      usage: 'opl foundry agents list',
      summary: 'List MAS, MAG, RCA, and OMA as one OPL Foundry Agent series with their direct CLI, Skill, MCP, and Connect command surfaces.',
      examples: ['opl foundry agents list --json'],
      group: 'foundry',
      handler: (args) => buildFoundryAgentsList(args),
    },
    'foundry agents inspect': {
      usage: 'opl foundry agents inspect <mas|mag|rca|oma>',
      summary: 'Inspect one Foundry Agent series member and its direct CLI foundry spine, ordinary work alias, Skill/MCP projection, and authority boundary.',
      examples: [
        'opl foundry agents inspect mas --json',
        'opl foundry agents inspect rca --json',
      ],
      group: 'foundry',
      handler: (args) => buildFoundryAgentInspect(args),
    },
  };
}
