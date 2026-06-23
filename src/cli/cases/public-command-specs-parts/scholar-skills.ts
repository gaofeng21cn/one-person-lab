import {
  buildScholarSkillModuleInspect,
  buildScholarSkillsCatalog,
  buildScholarSkillsDoctor,
  buildScholarSkillsInterfaces,
  buildScholarSkillsValidation,
} from '../../../scholar-skills.ts';
import type { FrameworkContracts } from '../../../types.ts';
import { assertNoArgs, buildUsageError } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function parseInspectArgs(args: string[], spec: CommandSpec) {
  let moduleId: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--module' || token === '--id') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('scholar-skills inspect requires a module id.', spec, {
          option: token,
          required: ['--module'],
        });
      }
      moduleId = value;
      continue;
    }
    throw buildUsageError(`Unknown scholar-skills inspect option: ${token}.`, spec, {
      option: token,
    });
  }
  if (!moduleId) {
    throw buildUsageError('scholar-skills inspect requires --module.', spec, {
      required: ['--module'],
    });
  }
  return { moduleId };
}

export function buildScholarSkillsCommandSpecs(
  getContracts: () => FrameworkContracts,
): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'scholar-skills list': {
      usage: 'opl scholar-skills list',
      summary: 'List OPL ScholarSkills capability modules and their refs-only authority boundary.',
      examples: ['opl scholar-skills list --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills list']);
        return buildScholarSkillsCatalog(getContracts());
      },
    },
    'scholar-skills inspect': {
      usage: 'opl scholar-skills inspect --module <module_id>',
      summary: 'Inspect one OPL ScholarSkills capability module descriptor.',
      examples: [
        'opl scholar-skills inspect --module opl.scholarskills.display --json',
        'opl scholar-skills inspect --id opl.scholarskills.display --json',
      ],
      group: 'scholar-skills',
      handler: (args) => {
        const parsed = parseInspectArgs(args, specs['scholar-skills inspect']);
        return buildScholarSkillModuleInspect(getContracts(), parsed.moduleId);
      },
    },
    'scholar-skills interfaces': {
      usage: 'opl scholar-skills interfaces',
      summary: 'Read the ScholarSkills CLI, contract, and runtime-environment bridge interfaces.',
      examples: ['opl scholar-skills interfaces --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills interfaces']);
        return buildScholarSkillsInterfaces(getContracts());
      },
    },
    'scholar-skills validate': {
      usage: 'opl scholar-skills validate',
      summary: 'Validate ScholarSkills module count, authority false flags, and write boundary.',
      examples: ['opl scholar-skills validate --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills validate']);
        return buildScholarSkillsValidation(getContracts());
      },
    },
    'scholar-skills doctor': {
      usage: 'opl scholar-skills doctor',
      summary: 'Doctor the ScholarSkills capability module substrate without claiming runtime or domain readiness.',
      examples: ['opl scholar-skills doctor --json'],
      group: 'scholar-skills',
      handler: (args) => {
        assertNoArgs(args.filter((entry) => entry !== '--json'), specs['scholar-skills doctor']);
        return buildScholarSkillsDoctor(getContracts());
      },
    },
  };

  return specs;
}
