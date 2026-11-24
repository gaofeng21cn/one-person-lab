import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { runEnvironmentCommand } from './runtime-environment-run-command.ts';

import {
  buildRuntimeEnvironmentCacheInventoryReadback,
  buildRuntimeEnvironmentCacheStatusReadback,
  buildRuntimeEnvironmentContractReadback,
  buildRuntimeEnvironmentDoctorReadback,
  buildRuntimeEnvironmentInspectReadback,
  buildRuntimeEnvironmentPrepareReadback,
  buildRuntimeEnvironmentRunContextReadback,
  type RuntimeEnvironmentPrepareInput,
  type RuntimeEnvironmentTargetInput,
} from '../../../adapters/execution/runtime-environment-substrate.ts';
import { buildOplModules } from '../../../adapters/integration/index.ts';
import { readStandardAgentDescriptorForDomainFromPackagePort } from '../../../kernel/agent-package-readiness-port.ts';
import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import { record, stringValue } from '../../../kernel/json-record.ts';
import { resolveContainedRepoJsonFile } from '../../../kernel/repo-contained-json-file.ts';
import { resolveStandardAgent } from '../../../kernel/standard-agent-registry.ts';
import {
  assertNoArgs,
  buildUsageError,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function currentPlatformId() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-arm64';
  if (process.platform === 'darwin') return 'macos-x64';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'linux-arm64';
  if (process.platform === 'linux') return 'linux-x64';
  return `${process.platform}-${process.arch}`;
}

function externalRequirementProfilePath(
  domainId: string | undefined,
  profileId: string | undefined,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (!domainId || !profileId) return null;
  const descriptor = readStandardAgentDescriptorForDomainFromPackagePort(domainId);
  if (!descriptor) return null;
  const source = record(readJsonPayloadFile(path.join(descriptor.repo_dir, 'contracts/domain_descriptor.json')));
  const profileRef = stringValue(record(source.standard_contract_refs).runtime_environment_requirement_profile);
  if (!profileRef) return null;
  const ownerProfile = resolveContainedRepoJsonFile(descriptor.repo_dir, profileRef, 'Runtime environment requirement profile');
  const requirements = record(readJsonPayloadFile(ownerProfile.real_path));
  const sources = record(requirements.runtime_profile_sources);
  if (!Object.hasOwn(sources, profileId)) return ownerProfile.real_path;
  const selected = record(sources[profileId]);
  const packageId = stringValue(selected.package_id);
  const relativePath = stringValue(selected.relative_path);
  const dependency = packageId ? resolveStandardAgent(packageId) : null;
  const provider = dependency?.agent_id === packageId && buildOplModules({ profile: 'fast' }).modules.modules
    .find((module) => module.module_id === dependency.domain_id);
  if (!provider || !provider.installed || !relativePath) {
    throw buildUsageError('The domain-declared runtime profile provider is unavailable or invalid.', spec, {
      domain_id: domainId, profile_id: profileId, package_id: packageId,
    });
  }
  return resolveContainedRepoJsonFile(provider.checkout_path, relativePath, 'Runtime profile provider resource').real_path;
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

function parseEnvCliArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  options: ParseArgsOptionsConfig,
) {
  try {
    const { values } = parseArgs({
      args: args.filter((arg) => arg !== '--json'),
      options,
      strict: true,
      allowPositionals: false,
    });
    for (const [name, value] of Object.entries(values)) {
      if (value === '' || (Array.isArray(value) && value.includes(''))) {
        throw new TypeError(`Option '--${name}' requires a non-empty value.`);
      }
    }
    return values;
  } catch (error) {
    throw buildUsageError(
      error instanceof Error ? error.message : 'Invalid runtime env options.',
      spec,
      { parser_adapter: 'node_util_parse_args' },
    );
  }
}

function parseBaseTargetValues(
  values: Record<string, unknown>,
  rawArgs: string[],
): RuntimeEnvironmentTargetInput {
  const parsed: RuntimeEnvironmentTargetInput = {};
  if (typeof values.domain === 'string') parsed.domainId = values.domain;
  if (typeof values.profile === 'string') parsed.profileId = values.profile;
  if (typeof values.platform === 'string') parsed.platformId = values.platform;
  const lastRootFlag = [...rawArgs].reverse().find((token) => token === '--artifact-root' || token === '--paper-root');
  if (typeof values['paper-root'] === 'string' && lastRootFlag !== '--artifact-root') {
    assignRootArg(parsed, '--paper-root', values['paper-root']);
  } else if (typeof values['artifact-root'] === 'string') {
    assignRootArg(parsed, '--artifact-root', values['artifact-root']);
  }
  return parsed;
}

function parseTargetArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  options: { requirePlatform?: boolean } = {},
): RuntimeEnvironmentTargetInput {
  const values = parseEnvCliArgs(args, spec, {
    domain: { type: 'string' },
    profile: { type: 'string' },
    platform: { type: 'string' },
    'artifact-root': { type: 'string' },
    'paper-root': { type: 'string' },
  });
  const parsed = parseBaseTargetValues(values, args);
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
  options: { allowOrdinaryDefaults?: boolean } = {},
): RuntimeEnvironmentPrepareInput {
  const values = parseEnvCliArgs(args, spec, {
    domain: { type: 'string' },
    profile: { type: 'string' },
    platform: { type: 'string' },
    'artifact-root': { type: 'string' },
    'paper-root': { type: 'string' },
    'prepare-timeout-ms': { type: 'string' },
    refresh: { type: 'boolean' },
    apply: { type: 'boolean' },
    'requirement-profile': { type: 'string' },
    'requirement-profile-id': { type: 'string', multiple: true },
  });
  const parsed: Partial<RuntimeEnvironmentPrepareInput> = {
    ...parseBaseTargetValues(values, args),
    ...(values.refresh ? { refresh: true } : {}),
    ...(values.apply ? { apply: true } : {}),
    ...(typeof values['requirement-profile'] === 'string'
      ? { requirementProfilePath: values['requirement-profile'] }
      : {}),
    ...(Array.isArray(values['requirement-profile-id'])
      ? { requirementProfileIds: values['requirement-profile-id'] as string[] }
      : {}),
  };
  if (typeof values['prepare-timeout-ms'] === 'string') {
    parsed.prepareTimeoutMs = Number(values['prepare-timeout-ms']);
    if (!Number.isFinite(parsed.prepareTimeoutMs) || parsed.prepareTimeoutMs <= 0) {
      throw buildUsageError('prepare timeout must be positive', spec);
    }
  }
  if (options.allowOrdinaryDefaults) {
    parsed.platformId ??= currentPlatformId();
    parsed.artifactRoot ??= process.cwd();
    parsed.rootOption ??= '--artifact-root';
    parsed.requirementProfilePath ??= externalRequirementProfilePath(parsed.domainId, parsed.profileId, spec) ?? undefined;
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

export async function prepareEnvironmentForCommand(input: {
  domainId: string; profileId: string; platformId: string; artifactRoot: string;
  requirementProfilePath?: string; requirementProfileId?: string; requirementProfileIds?: string[]; prepareTimeoutMs?: number; refresh?: boolean;
}) {
  const contextPath = path.join(input.artifactRoot, 'build', 'dependency_run_context.json');
  const previous = fs.existsSync(contextPath) ? record(readJsonPayloadFile(contextPath)) : {};
  const requirementProfilePath = input.requirementProfilePath
    ?? stringValue(record(previous.requirement_profile_identity).requirement_profile_ref)
    ?? externalRequirementProfilePath(input.domainId, input.profileId, { usage: 'opl env run', examples: [] });
  if (!requirementProfilePath) throw new Error('No dependency profile is available; supply --requirement-profile.');
  const requirementProfileId = input.requirementProfileId
    ?? stringValue(previous.requested_requirement_profile_id) ?? undefined;
  const requirementProfileIds = input.requirementProfileIds ?? (Array.isArray(previous.requested_requirement_profile_ids) && previous.requested_requirement_profile_ids.length ? previous.requested_requirement_profile_ids as string[] : undefined);
  return buildRuntimeEnvironmentPrepareReadback({ ...input, requirementProfilePath, requirementProfileId, requirementProfileIds, apply: true });
}

export function buildRuntimeEnvironmentCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    env: {
      group: 'env',
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
            'opl env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>]... [--prepare-timeout-ms <ms>] --artifact-root <path> [--apply]',
          summary:
            'Prepare declared R/Python dependencies into OPL-managed local environments.',
        },
        {
          command: 'env run',
          usage: 'opl env run --domain <domain> --profile <profile> --artifact-root <path> [--requirement-profile-id <id>]... [--prepare-timeout-ms <ms>] [--timeout-ms <ms>] -- <command...>',
          summary:
            'Reuse or prepare language dependencies, run a command, and record the environment used.',
        },
      ],
    },
    'env doctor': {
      group: 'env',
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
      group: 'env',
      usage:
        'opl env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
      summary:
        'Prepare declared R/Python dependencies into OPL-managed local environments.',
      examples: [
        'opl env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --artifact-root artifacts --apply --json',
      ],
      handler: async (args) => ({
        runtime_environment: await buildRuntimeEnvironmentPrepareReadback(
          parsePrepareArgs(args, commandSpecs['env prepare'], { allowOrdinaryDefaults: true }),
        ),
      }),
    },
    'env run': {
      group: 'env',
      usage: 'opl env run --domain <domain> --profile <profile> --artifact-root <path> -- <command...>',
      summary:
        'Reuse or prepare language dependencies, run a command, and record the environment used.',
      examples: [
        'opl env run --domain mas --profile display --artifact-root artifacts -- Rscript render.R',
      ],
      handler: (args) => runEnvironmentCommand(args),
    },
    'runtime env': {
      group: 'runtime',
      usage: 'opl runtime env <inspect|prepare|cache|doctor|run-context|contract>',
      summary: 'Inspect and prepare reusable language environments.',
      examples: [
        'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
        'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
        'opl runtime env cache status --json',
      ],
      handler: () => ({ runtime_environment: buildRuntimeEnvironmentContractReadback() }),
    },
    'runtime env inspect': {
      group: 'runtime',
      usage: 'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform>',
      summary: 'Read the prepared execution environment.', examples: [
        'opl runtime env inspect --domain mas --profile analysis --platform macos-arm64 --json',
      ],
      handler: (args) => ({ runtime_environment: buildRuntimeEnvironmentInspectReadback(parseTargetArgs(args, commandSpecs['runtime env inspect'])) }),
    },
    'runtime env prepare': {
      group: 'runtime',
      usage: 'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --artifact-root <path> [--apply]',
      summary: 'Prepare reusable language dependencies.', examples: [
        'opl runtime env prepare --domain mas --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --requirement-profile-id r_ggplot2_ggconsort_reporting_flow_v1 --artifact-root artifacts --apply --json',
      ],
      handler: async (args) => ({ runtime_environment: await buildRuntimeEnvironmentPrepareReadback(parsePrepareArgs(args, commandSpecs['runtime env prepare'])) }),
    },
    'runtime env cache status': {
      group: 'runtime',
      usage: 'opl runtime env cache status', summary: 'Read prepared environment inventory.', examples: ['opl runtime env cache status --json'],
      handler: (args) => { assertNoArgs(args, commandSpecs['runtime env cache status']); return { runtime_environment: buildRuntimeEnvironmentCacheStatusReadback() }; },
    },
    'runtime env cache inventory': {
      group: 'runtime',
      usage: 'opl runtime env cache inventory', summary: 'Read resolved environment versions.', examples: ['opl runtime env cache inventory --json'],
      handler: (args) => { assertNoArgs(args, commandSpecs['runtime env cache inventory']); return { runtime_environment: buildRuntimeEnvironmentCacheInventoryReadback() }; },
    },
    'runtime env doctor': {
      group: 'runtime',
      usage: 'opl runtime env doctor', summary: 'Read the language execution strategy.', examples: ['opl runtime env doctor --json'],
      handler: (args) => { assertNoArgs(args, commandSpecs['runtime env doctor']); return { runtime_environment: buildRuntimeEnvironmentDoctorReadback() }; },
    },
    'runtime env run-context': {
      group: 'runtime',
      usage: 'opl runtime env run-context --domain <domain> --profile <profile> [--artifact-root <path>]',
      summary: 'Read an artifact-bound execution environment.', examples: [
        'opl runtime env run-context --domain bookforge --profile publication_proof --json',
        'opl runtime env run-context --domain mas --profile display --artifact-root artifacts --json',
      ],
      handler: (args) => ({ runtime_environment: buildRuntimeEnvironmentRunContextReadback(parseTargetArgs(args, commandSpecs['runtime env run-context'])) }),
    },
    'runtime env contract': {
      group: 'runtime',
      usage: 'opl runtime env contract', summary: 'Read the environment ownership contract.', examples: ['opl runtime env contract --json'],
      handler: (args) => { assertNoArgs(args, commandSpecs['runtime env contract']); return { runtime_environment: buildRuntimeEnvironmentContractReadback() }; },
    },
  };
  return commandSpecs;
}
