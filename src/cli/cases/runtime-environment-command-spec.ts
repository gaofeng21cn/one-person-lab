import {
  buildRuntimeEnvironmentBuildReadback,
  buildRuntimeEnvironmentCacheInventoryReadback,
  buildRuntimeEnvironmentCachePruneReadback,
  buildRuntimeEnvironmentCacheStatusReadback,
  buildRuntimeEnvironmentContractReadback,
  buildRuntimeEnvironmentDoctorReadback,
  buildRuntimeEnvironmentInspectReadback,
  buildRuntimeEnvironmentLockReadback,
  buildRuntimeEnvironmentMaterializeReadback,
  buildRuntimeEnvironmentPrepareReadback,
  buildRuntimeEnvironmentRunContextReadback,
  type RuntimeEnvironmentCachePruneInput,
  type RuntimeEnvironmentMaterializeInput,
  type RuntimeEnvironmentPrepareInput,
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
    if (token === '--paper-root') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env command requires --paper-root value.', spec, {
          option: '--paper-root',
        });
      }
      parsed.paperRoot = value;
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

function parsePrepareArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): RuntimeEnvironmentPrepareInput {
  const parsed: Partial<RuntimeEnvironmentPrepareInput> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      continue;
    }
    if (token === '--domain') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env prepare requires --domain value.', spec, {
          option: '--domain',
        });
      }
      parsed.domainId = value;
      continue;
    }
    if (token === '--profile') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env prepare requires --profile value.', spec, {
          option: '--profile',
        });
      }
      parsed.profileId = value;
      continue;
    }
    if (token === '--platform') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env prepare requires --platform value.', spec, {
          option: '--platform',
        });
      }
      parsed.platformId = value;
      continue;
    }
    if (token === '--requirement-profile') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env prepare requires --requirement-profile value.', spec, {
          option: '--requirement-profile',
        });
      }
      parsed.requirementProfilePath = value;
      continue;
    }
    if (token === '--paper-root') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env prepare requires --paper-root value.', spec, {
          option: '--paper-root',
        });
      }
      parsed.paperRoot = value;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime env prepare: ${token}.`, spec, {
      option: token,
    });
  }
  const required: Array<keyof RuntimeEnvironmentPrepareInput> = [
    'domainId',
    'profileId',
    'platformId',
    'requirementProfilePath',
    'paperRoot',
  ];
  const missing = required.filter((field) => !parsed[field]);
  if (missing.length > 0) {
    throw buildUsageError('runtime env prepare requires domain, profile, platform, requirement profile, and paper root.', spec, {
      required: missing,
    });
  }
  return parsed as RuntimeEnvironmentPrepareInput;
}

function parseMaterializeArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): RuntimeEnvironmentMaterializeInput {
  const parsed: RuntimeEnvironmentMaterializeInput = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json' || token === '--dry-run') {
      continue;
    }
    if (token === '--domain') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env materialize requires --domain value.', spec, {
          option: '--domain',
        });
      }
      parsed.domainId = value;
      continue;
    }
    if (token === '--profile') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env materialize requires --profile value.', spec, {
          option: '--profile',
        });
      }
      parsed.profileId = value;
      continue;
    }
    if (token === '--platform') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime env materialize requires --platform value.', spec, {
          option: '--platform',
        });
      }
      parsed.platformId = value;
      continue;
    }
    if (token === '--apply') {
      parsed.apply = true;
      continue;
    }
    if (token === '--target') {
      const value = args[++index];
      if (value !== 'current' && value !== 'rollback' && value !== 'staged') {
        throw buildUsageError('runtime env materialize --target must be current, rollback, or staged.', spec, {
          option: '--target',
        });
      }
      parsed.targetPointer = value;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime env materialize: ${token}.`, spec, {
      option: token,
    });
  }
  if (!parsed.domainId) {
    throw buildUsageError('runtime env materialize requires --domain.', spec, {
      required: ['--domain'],
    });
  }
  if (!parsed.profileId) {
    throw buildUsageError('runtime env materialize requires --profile.', spec, {
      required: ['--profile'],
    });
  }
  if (!parsed.platformId) {
    throw buildUsageError('runtime env materialize requires --platform.', spec, {
      required: ['--platform'],
    });
  }
  return parsed;
}

function parseCachePruneArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): RuntimeEnvironmentCachePruneInput {
  const parsed: RuntimeEnvironmentCachePruneInput = {};
  for (const token of args) {
    if (token === '--json' || token === '--dry-run') {
      continue;
    }
    if (token === '--apply') {
      parsed.apply = true;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime env cache prune: ${token}.`, spec, {
      option: token,
    });
  }
  return parsed;
}

export function buildRuntimeEnvironmentCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime env': {
      usage:
        'opl runtime env <inspect|lock|build|prepare|materialize|cache|doctor|run-context|contract>',
      summary:
        'Inspect the OPL-owned runtime environment substrate without materializing runtime roots or claiming readiness.',
      examples: [
        'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
        'opl runtime env build --domain mas --profile analysis --platform macos-arm64 --json',
        'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --paper-root paper --json',
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
          command: 'runtime env build',
          usage:
            'opl runtime env build --domain <domain> --profile <profile> --platform <platform>',
          summary:
            'Project a deterministic dry-run runtime lock and bundle manifest without writing a runtime root.',
        },
        {
          command: 'runtime env prepare',
          usage:
            'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path>',
          summary:
            'Check declared dependency requirements, write refs-only dependency receipt/run-context, and avoid package installation.',
        },
        {
          command: 'runtime env materialize',
          usage:
            'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> [--target current|rollback|staged] [--dry-run|--apply]',
          summary:
            'Project materialization steps and fail closed for apply until the materializer is landed.',
        },
        {
          command: 'runtime env cache status',
          usage: 'opl runtime env cache status',
          summary:
            'Read the planned cache boundary without treating cache hits as readiness evidence.',
        },
        {
          command: 'runtime env cache inventory',
          usage: 'opl runtime env cache inventory',
          summary:
            'Read the dry-run runtime environment cache inventory projection without scanning or pruning the filesystem.',
        },
        {
          command: 'runtime env cache prune',
          usage: 'opl runtime env cache prune [--dry-run|--apply]',
          summary:
            'Project cache prune candidates while protecting current and rollback pointers; apply remains blocked until receipts land.',
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
    'runtime env build': {
      usage:
        'opl runtime env build --domain <domain> --profile <profile> --platform <platform>',
      summary:
        'Project a deterministic runtime lock and bundle manifest without building archives or writing runtime roots.',
      examples: [
        'opl runtime env build --domain mas --profile analysis --platform macos-arm64 --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentBuildReadback(
          parseTargetArgs(args, commandSpecs['runtime env build'], {
            requirePlatform: true,
          }),
        ),
      }),
    },
    'runtime env prepare': {
      usage:
        'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path>',
      summary:
        'Check a dependency requirement profile and write refs-only dependency receipt/run-context without installing packages or claiming readiness.',
      examples: [
        'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --paper-root paper --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentPrepareReadback(
          parsePrepareArgs(args, commandSpecs['runtime env prepare']),
        ),
      }),
    },
    'runtime env materialize': {
      usage:
        'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> [--target current|rollback|staged] [--dry-run|--apply]',
      summary:
        'Project runtime root materialization steps without applying them; --apply returns a fail-closed blocker until receipts land.',
      examples: [
        'opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --dry-run --json',
        'opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --apply --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentMaterializeReadback(
          parseMaterializeArgs(args, commandSpecs['runtime env materialize']),
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
    'runtime env cache inventory': {
      usage: 'opl runtime env cache inventory',
      summary:
        'Read the dry-run OPL runtime environment cache inventory projection without filesystem mutation.',
      examples: ['opl runtime env cache inventory --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime env cache inventory']);
        return {
          runtime_environment: buildRuntimeEnvironmentCacheInventoryReadback(),
        };
      },
    },
    'runtime env cache prune': {
      usage: 'opl runtime env cache prune [--dry-run|--apply]',
      summary:
        'Project stale runtime cache cleanup while protecting current and rollback pointers; apply is fail-closed until receipts land.',
      examples: [
        'opl runtime env cache prune --dry-run --json',
        'opl runtime env cache prune --apply --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentCachePruneReadback(
          parseCachePruneArgs(args, commandSpecs['runtime env cache prune']),
        ),
      }),
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
      usage:
        'opl runtime env run-context --domain <domain> --profile <profile> [--paper-root <path>]',
      summary:
        'Read planned runtime run-context bindings without scheduling a stage or writing domain truth.',
      examples: [
        'opl runtime env run-context --domain bookforge --profile publication_proof --json',
        'opl runtime env run-context --domain mas --profile display --paper-root paper --json',
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
