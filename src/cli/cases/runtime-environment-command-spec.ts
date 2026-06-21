import {
  buildRuntimeEnvironmentCacheStatusReadback,
  buildRuntimeEnvironmentContractReadback,
  buildRuntimeEnvironmentDoctorReadback,
  buildRuntimeEnvironmentInspectReadback,
  buildRuntimeEnvironmentLockReadback,
  buildRuntimeEnvironmentRunContextReadback,
  type RuntimeEnvironmentTargetInput,
} from '../../runtime-environment-substrate.ts';
import {
  assertNoArgs,
  buildUsageError,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseTargetArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  options: { requirePlatform?: boolean } = {},
): RuntimeEnvironmentTargetInput {
  const parsed: RuntimeEnvironmentTargetInput = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--domain') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env command requires --domain value.', spec, {
          option: '--domain',
        });
      }
      parsed.domainId = value;
      continue;
    }
    if (token === '--profile') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env command requires --profile value.', spec, {
          option: '--profile',
        });
      }
      parsed.profileId = value;
      continue;
    }
    if (token === '--platform') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env command requires --platform value.', spec, {
          option: '--platform',
        });
      }
      parsed.platformId = value;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime env command: ${token}.`, spec, {
      option: token,
    });
  }
  if (!parsed.domainId) {
    throw buildUsageError('runtime env command requires --domain.', spec, {
      required: ['--domain'],
    });
  }
  if (!parsed.profileId) {
    throw buildUsageError('runtime env command requires --profile.', spec, {
      required: ['--profile'],
    });
  }
  if (options.requirePlatform && !parsed.platformId) {
    throw buildUsageError('runtime env command requires --platform.', spec, {
      required: ['--platform'],
    });
  }
  return parsed;
}

export function buildRuntimeEnvironmentCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime env': {
      usage: 'opl runtime env <inspect|lock|cache|doctor|run-context|contract>',
      summary:
        'Inspect the OPL-owned runtime environment substrate without materializing runtime roots or claiming readiness.',
      examples: [
        'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
        'opl runtime env cache status --json',
      ],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime env']);
        return {
          runtime_environment: buildRuntimeEnvironmentContractReadback(),
        };
      },
      subcommands: [
        {
          command: 'runtime env inspect',
          usage:
            'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform>',
          summary:
            'Read the planned descriptor/materialization boundary for one domain runtime environment.',
        },
        {
          command: 'runtime env lock',
          usage:
            'opl runtime env lock --domain <domain> --profile <profile> --platform <platform>',
          summary:
            'Read the planned lock/layer boundary for one domain runtime environment.',
        },
        {
          command: 'runtime env cache status',
          usage: 'opl runtime env cache status',
          summary:
            'Read the planned cache boundary without treating cache hits as readiness evidence.',
        },
        {
          command: 'runtime env doctor',
          usage: 'opl runtime env doctor',
          summary:
            'Read the runtime environment substrate doctor boundary without blocking domain progress.',
        },
        {
          command: 'runtime env run-context',
          usage: 'opl runtime env run-context --domain <domain> --profile <profile>',
          summary:
            'Read the planned run-context bindings without scheduling a domain stage.',
        },
      ],
    },
    'runtime env inspect': {
      usage:
        'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform>',
      summary:
        'Read the OPL runtime environment descriptor/materialization boundary for one domain profile.',
      examples: [
        'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentInspectReadback(
          parseTargetArgs(args, commandSpecs['runtime env inspect'], {
            requirePlatform: true,
          }),
        ),
      }),
    },
    'runtime env lock': {
      usage:
        'opl runtime env lock --domain <domain> --profile <profile> --platform <platform>',
      summary:
        'Read the OPL runtime environment lock/layer boundary without generating a lock or writing a runtime root.',
      examples: [
        'opl runtime env lock --domain mas --profile analysis --platform macos-arm64 --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentLockReadback(
          parseTargetArgs(args, commandSpecs['runtime env lock'], {
            requirePlatform: true,
          }),
        ),
      }),
    },
    'runtime env cache status': {
      usage: 'opl runtime env cache status',
      summary:
        'Read the OPL runtime environment cache boundary without treating cache hits or misses as readiness evidence.',
      examples: ['opl runtime env cache status --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime env cache status']);
        return {
          runtime_environment: buildRuntimeEnvironmentCacheStatusReadback(),
        };
      },
    },
    'runtime env doctor': {
      usage: 'opl runtime env doctor',
      summary:
        'Read the OPL runtime environment doctor boundary without claiming runtime materialization or domain progress.',
      examples: ['opl runtime env doctor --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime env doctor']);
        return {
          runtime_environment: buildRuntimeEnvironmentDoctorReadback(),
        };
      },
    },
    'runtime env run-context': {
      usage: 'opl runtime env run-context --domain <domain> --profile <profile>',
      summary:
        'Read planned runtime run-context bindings without scheduling a stage or writing domain truth.',
      examples: [
        'opl runtime env run-context --domain bookforge --profile publication_proof --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentRunContextReadback(
          parseTargetArgs(args, commandSpecs['runtime env run-context']),
        ),
      }),
    },
    'runtime env contract': {
      usage: 'opl runtime env contract',
      summary:
        'Read the runtime environment substrate contract and authority boundary.',
      examples: ['opl runtime env contract --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime env contract']);
        return {
          runtime_environment: buildRuntimeEnvironmentContractReadback(),
        };
      },
    },
  };

  return commandSpecs;
}
