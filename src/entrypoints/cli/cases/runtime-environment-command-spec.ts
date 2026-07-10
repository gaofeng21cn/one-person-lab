import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
  buildRuntimeEnvironmentVerifyReadback,
  type RuntimeEnvironmentCachePruneInput,
  type RuntimeEnvironmentMaterializeInput,
  type RuntimeEnvironmentPrepareInput,
  type RuntimeEnvironmentTargetInput,
  type RuntimeEnvironmentVerifyInput,
} from '../../../modules/runway/runtime-environment-substrate.ts';
import { buildOplModules } from '../../../modules/connect/index.ts';
import {
  assertNoArgs,
  buildUsageError,
  parseCommandOptions,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

const SANDBOX_PROVIDER_VALUES = [
  'fast_local_env',
  'local_devcontainer',
  'local_docker',
  'local_managed_root',
  'external_sandbox',
] as const;

function sandboxProviderUsage() {
  return SANDBOX_PROVIDER_VALUES.join('|');
}

function currentPlatformId() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-arm64';
  if (process.platform === 'darwin') return 'macos-x64';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'linux-arm64';
  if (process.platform === 'linux') return 'linux-x64';
  return `${process.platform}-${process.arch}`;
}

function externalRequirementProfilePath(domainId?: string, profileId?: string) {
  if (domainId !== 'mas' || profileId !== 'display') {
    return null;
  }
  const scholarSkills = buildOplModules({ profile: 'fast' }).modules.modules
    .find((module) => module.module_id === 'scholarskills');
  if (!scholarSkills) {
    return null;
  }
  const candidate = path.join(
    scholarSkills.checkout_path,
    'packs',
    'medical-display-core',
    'renderer_dependency_profile.json',
  );
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function assignRootArg(
  parsed: RuntimeEnvironmentTargetInput,
  token: '--artifact-root' | '--paper-root',
  value: string,
) {
  parsed.artifactRoot = value;
  parsed.rootOption = token;
  if (token === '--paper-root') {
    parsed.paperRoot = value;
  }
}

function visitRuntimeEnvOptions(
  args: string[],
  visit: (token: string, value: string | undefined) => boolean,
) {
  for (let index = 0; index < args.length; index += 1) {
    if (visit(args[index], args[index + 1])) {
      index += 1;
    }
  }
}

function requireOptionValue(
  token: string,
  value: string | undefined,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  message: string,
) {
  if (!value) {
    throw buildUsageError(message, spec, {
      option: token,
    });
  }
  return value;
}

function parseSandboxProviderOption(
  commandLabel: string,
  token: '--sandbox-provider' | '--environment-profile',
  value: string | undefined,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (!SANDBOX_PROVIDER_VALUES.includes(value as typeof SANDBOX_PROVIDER_VALUES[number])) {
    throw buildUsageError(
      `${commandLabel} ${token} must be ${sandboxProviderUsage()}.`,
      spec,
      { option: token },
    );
  }
  return value as RuntimeEnvironmentTargetInput['sandboxProvider'];
}

function parseTargetOption(
  parsed: RuntimeEnvironmentTargetInput,
  token: string,
  value: string | undefined,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  commandLabel: string,
  options: { allowRoot?: boolean } = {},
) {
  if (token === '--domain') {
    parsed.domainId = requireOptionValue(token, value, spec, `${commandLabel} requires --domain value.`);
    return true;
  }
  if (token === '--profile') {
    parsed.profileId = requireOptionValue(token, value, spec, `${commandLabel} requires --profile value.`);
    return true;
  }
  if (token === '--platform') {
    parsed.platformId = requireOptionValue(token, value, spec, `${commandLabel} requires --platform value.`);
    return true;
  }
  if (token === '--sandbox-provider' || token === '--environment-profile') {
    parsed.sandboxProvider = parseSandboxProviderOption(commandLabel, token, value, spec);
    return true;
  }
  if (options.allowRoot && (token === '--artifact-root' || token === '--paper-root')) {
    assignRootArg(
      parsed,
      token,
      requireOptionValue(token, value, spec, `${commandLabel} requires ${token} value.`),
    );
    return true;
  }
  return false;
}

function parseTargetArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  options: { requirePlatform?: boolean } = {},
): RuntimeEnvironmentTargetInput {
  const parsed: RuntimeEnvironmentTargetInput = {};
  visitRuntimeEnvOptions(args, (token, value) => {
    if (token === '--json') {
      return false;
    }
    if (parseTargetOption(parsed, token, value, spec, 'runtime env command', { allowRoot: true })) {
      return true;
    }
    throw buildUsageError(`Unknown option for runtime env command: ${token}.`, spec, {
      option: token,
    });
  });
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

function parseVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): RuntimeEnvironmentVerifyInput {
  const runtimeRoot = parseCommandOptions(args, spec, {
    'runtime-root': { type: 'string' },
  })['runtime-root'] as string | undefined;
  if (!runtimeRoot) {
    throw buildUsageError('runtime env verify requires --runtime-root.', spec, {
      required: ['--runtime-root'],
    });
  }
  return { runtimeRoot };
}

function parsePrepareArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  options: { allowOrdinaryDefaults?: boolean } = {},
): RuntimeEnvironmentPrepareInput {
  const parsed: Partial<RuntimeEnvironmentPrepareInput> = {};
  visitRuntimeEnvOptions(args, (token, value) => {
    if (token === '--json') {
      return false;
    }
    if (token === '--apply') {
      parsed.apply = true;
      return false;
    }
    if (parseTargetOption(parsed, token, value, spec, 'runtime env prepare', { allowRoot: true })) {
      return true;
    }
    if (token === '--requirement-profile') {
      parsed.requirementProfilePath = requireOptionValue(
        token,
        value,
        spec,
        'runtime env prepare requires --requirement-profile value.',
      );
      return true;
    }
    if (token === '--requirement-profile-id') {
      parsed.requirementProfileId = requireOptionValue(
        token,
        value,
        spec,
        'runtime env prepare requires --requirement-profile-id value.',
      );
      return true;
    }
    throw buildUsageError(`Unknown option for runtime env prepare: ${token}.`, spec, {
      option: token,
    });
  });
  if (options.allowOrdinaryDefaults) {
    parsed.platformId ??= currentPlatformId();
    parsed.artifactRoot ??= process.cwd();
    parsed.rootOption ??= '--artifact-root';
    parsed.requirementProfilePath ??= externalRequirementProfilePath(parsed.domainId, parsed.profileId) ?? undefined;
  }
  const required: Array<keyof RuntimeEnvironmentPrepareInput> = [
    'domainId',
    'profileId',
    'platformId',
    'requirementProfilePath',
    'artifactRoot',
  ];
  const missing = required.filter((field) => !parsed[field]);
  if (missing.length > 0) {
    throw buildUsageError('runtime env prepare requires domain, profile, platform, requirement profile, and artifact root.', spec, {
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
  visitRuntimeEnvOptions(args, (token, value) => {
    if (token === '--json' || token === '--dry-run') {
      return false;
    }
    if (parseTargetOption(parsed, token, value, spec, 'runtime env materialize')) {
      return true;
    }
    if (token === '--apply') {
      parsed.apply = true;
      return false;
    }
    if (token === '--target') {
      if (value !== 'current' && value !== 'rollback' && value !== 'staged') {
        throw buildUsageError('runtime env materialize --target must be current, rollback, or staged.', spec, {
          option: '--target',
        });
      }
      parsed.targetPointer = value;
      return true;
    }
    throw buildUsageError(`Unknown option for runtime env materialize: ${token}.`, spec, {
      option: token,
    });
  });
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
  const values = parseCommandOptions(args, spec, {
    apply: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
  });
  return { apply: values.apply === true };
}

function parseEnvRunArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const separatorIndex = args.indexOf('--');
  if (separatorIndex < 0) {
    throw buildUsageError('env run requires -- before the command to execute.', spec, {
      required: ['--'],
    });
  }
  const targetArgs = args.slice(0, separatorIndex).filter((arg) => arg !== '--json');
  const commandArgs = args.slice(separatorIndex + 1);
  if (commandArgs.length === 0) {
    throw buildUsageError('env run requires a command after --.', spec, {
      required: ['command'],
    });
  }
  return {
    target: parseTargetArgs(targetArgs, spec),
    commandArgs,
  };
}

function runCommandWithPreparedEnvironment(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = parseEnvRunArgs(args, spec);
  const readback = buildRuntimeEnvironmentRunContextReadback(parsed.target) as Record<string, any>;
  const runContext = readback.run_context as Record<string, any> | undefined;
  const preflight = runContext?.consumer_preflight as Record<string, any> | undefined;
  if (preflight?.can_consume_run_context !== true) {
    throw buildUsageError('env run requires a prepared run-context. Run opl env prepare --apply first.', spec, {
      status: runContext?.status ?? 'missing_run_context',
      route_hint: 'opl env prepare',
      host_environment_fallback_allowed: false,
    });
  }
  const envVars = runContext?.env_vars as Record<string, string> | undefined;
  const result = spawnSync(parsed.commandArgs[0], parsed.commandArgs.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(envVars ?? {}),
    },
  });
  process.exitCode = result.status ?? 1;
  return { __handled: true };
}

export function buildRuntimeEnvironmentCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    env: {
      usage: 'opl env <doctor|prepare|run>',
      summary:
        'Operate the default Fast Local Env surface for R/Python dependency execution.',
      examples: [
        'opl env doctor --json',
        'opl env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --artifact-root artifacts --apply --json',
        'opl env run --domain mas --profile display --artifact-root artifacts -- Rscript render.R',
      ],
      handler: (args) => {
        assertNoArgs(args, commandSpecs.env);
        return {
          runtime_environment: buildRuntimeEnvironmentDoctorReadback(),
        };
      },
      subcommands: [
        {
          command: 'env doctor',
          usage: 'opl env doctor',
          summary:
            'Read Fast Local Env doctor findings without claiming runtime/domain/App readiness.',
        },
        {
          command: 'env prepare',
          usage:
            'opl env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
          summary:
            'Prepare declared R/Python dependencies into OPL-managed local environments.',
        },
        {
          command: 'env run',
          usage: 'opl env run --domain <domain> --profile <profile> --artifact-root <path> -- <command...>',
          summary:
            'Run a command with the prepared Fast Local Env run-context; missing or mismatched run-context fails closed.',
        },
      ],
    },
    'env doctor': {
      usage: 'opl env doctor',
      summary:
        'Read Fast Local Env doctor findings without claiming runtime/domain/App readiness.',
      examples: ['opl env doctor --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['env doctor']);
        return {
          runtime_environment: buildRuntimeEnvironmentDoctorReadback(),
        };
      },
    },
    'env prepare': {
      usage:
        'opl env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
      summary:
        'Prepare declared R/Python dependencies into OPL-managed local environments.',
      examples: [
        'opl env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentPrepareReadback(
          parsePrepareArgs(args, commandSpecs['env prepare'], { allowOrdinaryDefaults: true }),
        ),
      }),
    },
    'env run': {
      usage: 'opl env run --domain <domain> --profile <profile> --artifact-root <path> -- <command...>',
      summary:
        'Run a command with the prepared Fast Local Env run-context; missing or mismatched run-context fails closed.',
      examples: [
        'opl env run --domain mas --profile display --artifact-root artifacts -- Rscript render.R',
      ],
      handler: (args) => runCommandWithPreparedEnvironment(args, commandSpecs['env run']),
    },
    'runtime env': {
      usage:
        'opl runtime env <inspect|lock|build|prepare|materialize|verify|cache|doctor|run-context|contract>',
      summary:
        'Inspect or operate the OPL-owned runtime environment substrate without granting domain/App readiness.',
      examples: [
        'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
        'opl runtime env build --domain mas --profile analysis --platform macos-arm64 --environment-profile external_sandbox --json',
        'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
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
            'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox]',
          summary:
            'Read the planned descriptor/materialization boundary for one domain runtime environment.',
        },
        {
          command: 'runtime env lock',
          usage:
            'opl runtime env lock --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox]',
          summary:
            'Read the planned lock/layer boundary for one domain runtime environment.',
        },
        {
          command: 'runtime env build',
          usage:
            'opl runtime env build --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox]',
          summary:
            'Project a deterministic dry-run runtime lock and bundle manifest without writing a runtime root.',
        },
        {
          command: 'runtime env prepare',
          usage:
            'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
          summary:
            'Check declared dependency requirements; --apply installs missing packages only into the OPL-managed library.',
        },
        {
          command: 'runtime env materialize',
          usage:
            'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox] [--target current|rollback|staged] [--dry-run|--apply]',
          summary:
            'Materialize an OPL runtime root envelope under OPL_STATE_DIR when --apply is supplied.',
        },
        {
          command: 'runtime env verify',
          usage: 'opl runtime env verify --runtime-root <path>',
          summary:
            'Verify a materialized OPL runtime root receipt without scheduling a domain stage.',
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
        'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox]',
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
        'opl runtime env lock --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox]',
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
        'opl runtime env build --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox]',
      summary:
        'Project a deterministic runtime lock and bundle manifest without building archives or writing runtime roots.',
      examples: [
        'opl runtime env build --domain mas --profile analysis --platform macos-arm64 --environment-profile external_sandbox --json',
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
        'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
      summary:
        'Check a dependency requirement profile and write dependency receipt/run-context; --apply installs missing packages only into the OPL-managed library.',
      examples: [
        'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentPrepareReadback(
          parsePrepareArgs(args, commandSpecs['runtime env prepare']),
        ),
      }),
    },
    'runtime env materialize': {
      usage:
        'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> [--environment-profile fast_local_env|local_docker|external_sandbox] [--target current|rollback|staged] [--dry-run|--apply]',
      summary:
        'Materialize an OPL runtime root envelope under OPL_STATE_DIR when --apply is supplied.',
      examples: [
        'opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --dry-run --json',
        'opl runtime env materialize --domain mas --profile analysis --platform macos-arm64 --environment-profile external_sandbox --apply --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentMaterializeReadback(
          parseMaterializeArgs(args, commandSpecs['runtime env materialize']),
        ),
      }),
    },
    'runtime env verify': {
      usage: 'opl runtime env verify --runtime-root <path>',
      summary:
        'Verify a materialized OPL runtime root receipt without authorizing domain or App readiness.',
      examples: [
        'opl runtime env verify --runtime-root /path/to/opl/runtime-root --json',
      ],
      handler: (args) => ({
        runtime_environment: buildRuntimeEnvironmentVerifyReadback(
          parseVerifyArgs(args, commandSpecs['runtime env verify']),
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
        'opl runtime env run-context --domain <domain> --profile <profile> [--artifact-root <path>]',
      summary:
        'Read planned runtime run-context bindings without scheduling a stage or writing domain truth.',
      examples: [
        'opl runtime env run-context --domain bookforge --profile publication_proof --json',
        'opl runtime env run-context --domain mas --profile display --artifact-root artifacts --json',
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
