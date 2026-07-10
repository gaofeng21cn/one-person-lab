import { buildUsageError, parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function parseAgentsScaffoldArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    'target-dir': { type: 'string' },
    'domain-id': { type: 'string' },
    'domain-label': { type: 'string' },
    force: { type: 'boolean' },
    validate: { type: 'string' },
    'consumption-evidence': { type: 'boolean' },
  });
  const parsed = {
    targetDir: values['target-dir'] as string | undefined,
    domainId: values['domain-id'] as string | undefined,
    domainLabel: values['domain-label'] as string | undefined,
    force: values.force === true,
    validateRepoDir: values.validate as string | undefined,
    consumptionEvidence: values['consumption-evidence'] === true,
  };

  if (parsed.validateRepoDir && (parsed.targetDir || parsed.domainId || parsed.domainLabel || parsed.force)) {
    throw buildUsageError('--validate cannot be combined with scaffold generation options.', spec, {
      mutually_exclusive: ['--validate', '--target-dir', '--domain-id', '--domain-label', '--force'],
    });
  }

  if (parsed.consumptionEvidence && (parsed.targetDir || parsed.validateRepoDir || parsed.force)) {
    throw buildUsageError('--consumption-evidence cannot be combined with generation or validation paths.', spec, {
      mutually_exclusive: ['--consumption-evidence', '--target-dir', '--validate', '--force'],
    });
  }

  if (parsed.force && !parsed.targetDir) {
    throw buildUsageError('--force requires --target-dir.', spec, {
      required: ['--target-dir'],
    });
  }

  return parsed;
}
