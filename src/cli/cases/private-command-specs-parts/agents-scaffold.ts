import { buildUsageError } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function parseAgentsScaffoldArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed: {
    targetDir?: string;
    domainId?: string;
    domainLabel?: string;
    force?: boolean;
    validateRepoDir?: string;
    consumptionEvidence?: boolean;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case '--target-dir':
        parsed.targetDir = args[++index];
        break;
      case '--domain-id':
        parsed.domainId = args[++index];
        break;
      case '--domain-label':
        parsed.domainLabel = args[++index];
        break;
      case '--force':
        parsed.force = true;
        break;
      case '--validate':
        parsed.validateRepoDir = args[++index];
        break;
      case '--consumption-evidence':
        parsed.consumptionEvidence = true;
        break;
      default:
        throw buildUsageError(`Unknown option for agents scaffold command: ${token}.`, spec, {
          option: token,
        });
    }

    if (['--target-dir', '--domain-id', '--domain-label', '--validate'].includes(token) && !args[index]) {
      throw buildUsageError(`Missing value for ${token}.`, spec, { option: token });
    }
  }

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
