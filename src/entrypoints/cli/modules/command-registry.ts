import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { FrameworkContractError } from '../../../modules/charter/index.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandRegistryMetadata, CommandSpec } from './types.ts';

type CommandRegistryCoverageOptions = {
  protectedCommandPrefixes?: string[];
};
type CommandOptionValue = string | number | boolean;

function commandRegistryMetadataFromContract(
  registryKey: string,
  value: unknown,
): CommandRegistryMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw registryShapeError(registryKey, ['registry.contract_entry_invalid']);
  }
  const entry = value as Record<string, unknown>;
  const command = typeof entry.command_id === 'string' ? entry.command_id : registryKey;
  const metadata = {
    command_id: entry.command_id,
    parser_adapter: entry.parser_adapter,
    options: entry.options,
    authority_boundary: entry.authority_boundary,
    json_output_schema_ref:
      `contracts/opl-framework/cli-command-registry.json#/commands/${registryKey}/output_schema`,
  } as CommandRegistryMetadata;
  const violations = registryShapeViolations(command, metadata);
  if (!Object.hasOwn(entry, 'output_schema')) {
    violations.push('registry.output_schema_missing');
  }
  if (violations.length > 0) {
    throw registryShapeError(command, violations);
  }
  return metadata;
}

function bindCommandRegistryMetadata(
  specs: Record<string, CommandSpec>,
  commands: Record<string, unknown>,
) {
  const boundCommands = new Set<string>();
  for (const [registryKey, value] of Object.entries(commands)) {
    const metadata = commandRegistryMetadataFromContract(registryKey, value);
    if (boundCommands.has(metadata.command_id)) {
      throw registryShapeError(metadata.command_id, ['registry.command_id_duplicate']);
    }
    const spec = specs[metadata.command_id];
    if (!spec) {
      throw registryShapeError(metadata.command_id, ['command_spec_missing']);
    }
    spec.registry = metadata;
    boundCommands.add(metadata.command_id);
  }
  return specs;
}

function matchesProtectedPrefix(command: string, prefixes: string[]) {
  return prefixes.some((prefix) => command === prefix || command.startsWith(`${prefix} `));
}

function registryShapeViolations(command: string, registry: CommandRegistryMetadata | undefined) {
  const violations: string[] = [];
  if (!registry) {
    return ['registry_missing'];
  }
  if (registry.command_id !== command) {
    violations.push('registry.command_id_mismatch');
  }
  if (registry.parser_adapter !== 'node_util_parse_args') {
    violations.push('registry.parser_adapter_invalid');
  }
  if (!Array.isArray(registry.options)) {
    violations.push('registry.options_missing');
  } else {
    const names = new Set<string>();
    const flags = new Set<string>();
    for (const [index, option] of registry.options.entries()) {
      if (!option || typeof option !== 'object' || Array.isArray(option)) {
        violations.push(`registry.option[${index}]`);
        continue;
      }
      if (typeof option.name !== 'string' || option.name.length === 0) {
        violations.push('registry.option.name');
      } else if (names.has(option.name)) {
        violations.push('registry.option.name_duplicate');
      } else {
        names.add(option.name);
      }
      if (typeof option.flag !== 'string' || !option.flag.startsWith('--')) {
        violations.push('registry.option.flag');
      } else if (flags.has(option.flag)) {
        violations.push('registry.option.flag_duplicate');
      } else {
        flags.add(option.flag);
      }
      if (!['string', 'integer', 'boolean'].includes(option.value_kind)) {
        violations.push('registry.option.value_kind');
      }
      if (typeof option.summary !== 'string' || option.summary.length === 0) {
        violations.push('registry.option.summary');
      }
      if (
        option.allowed_values !== undefined
        && (
          !Array.isArray(option.allowed_values)
          || option.allowed_values.length === 0
          || option.allowed_values.some((entry) => typeof entry !== 'string' || entry.length === 0)
        )
      ) {
        violations.push('registry.option.allowed_values');
      }
    }
  }
  if (!registry.json_output_schema_ref) {
    violations.push('registry.json_output_schema_ref_missing');
  }
  const boundary = registry.authority_boundary;
  if (!boundary || typeof boundary.owner !== 'string' || boundary.owner.length === 0) {
    violations.push('registry.authority_boundary.owner');
  }
  if (!boundary || typeof boundary.surface !== 'string' || boundary.surface.length === 0) {
    violations.push('registry.authority_boundary.surface');
  }
  if (!boundary || boundary.can_write_domain_truth !== false) {
    violations.push('registry.authority_boundary.can_write_domain_truth');
  }
  if (!boundary || boundary.can_create_owner_receipt !== false) {
    violations.push('registry.authority_boundary.can_create_owner_receipt');
  }
  if (!boundary || boundary.can_claim_domain_ready !== false) {
    violations.push('registry.authority_boundary.can_claim_domain_ready');
  }
  if (!boundary || boundary.can_claim_production_ready !== false) {
    violations.push('registry.authority_boundary.can_claim_production_ready');
  }
  return violations;
}

function registryShapeError(command: string, violations: string[]) {
  return new FrameworkContractError('contract_shape_invalid', 'Command registry metadata is required for protected command surfaces.', {
    command,
    violations,
  });
}

function validateCommandRegistryCoverage(
  specs: Record<string, CommandSpec>,
  options: CommandRegistryCoverageOptions = {},
) {
  const protectedCommandPrefixes = options.protectedCommandPrefixes ?? [];
  const commands = Object.keys(specs).filter((command) =>
    matchesProtectedPrefix(command, protectedCommandPrefixes)
  );

  for (const command of commands) {
    const violations = registryShapeViolations(command, specs[command]?.registry);
    if (violations.length > 0) {
      throw registryShapeError(command, violations);
    }
  }

  return {
    surface_kind: 'opl_cli_command_registry_coverage',
    status: 'valid',
    protected_command_count: commands.length,
    protected_command_prefixes: protectedCommandPrefixes,
  };
}

function coerceOptionValue(
  command: string,
  spec: CommandSpec,
  option: CommandRegistryMetadata['options'][number],
  value: unknown,
): CommandOptionValue | CommandOptionValue[] | undefined {
  if (value === undefined) {
    if (option.default !== undefined) return option.default;
    if (option.required) {
      throw buildUsageError(`${command} requires ${option.flag}.`, spec, {
        required: [option.flag],
      });
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => coerceOptionValue(command, spec, { ...option, multiple: false }, entry))
      .filter((entry): entry is CommandOptionValue => entry !== undefined && !Array.isArray(entry));
  }

  if (option.value_kind === 'integer') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw buildUsageError(`${command} ${option.flag} must be an integer.`, spec, {
        option: option.flag,
        value,
      });
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw buildUsageError(`${command} ${option.flag} must be an integer.`, spec, {
        option: option.flag,
        value,
      });
    }
    if (option.allowed_range && (parsed < option.allowed_range.min || parsed > option.allowed_range.max)) {
      throw buildUsageError(
        `${command} ${option.flag} must be an integer from ${option.allowed_range.min} to ${option.allowed_range.max}.`,
        spec,
        {
          option: option.flag,
          value,
          allowed_range: `${option.allowed_range.min}..${option.allowed_range.max}`,
        },
      );
    }
    return parsed;
  }

  if (option.value_kind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw buildUsageError(`${command} ${option.flag} must be a boolean.`, spec, {
        option: option.flag,
        value,
      });
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw buildUsageError(`${command} ${option.flag} must be a string.`, spec, {
      option: option.flag,
      value,
    });
  }
  if (option.allowed_values && !option.allowed_values.includes(value)) {
    throw buildUsageError(`${command} ${option.flag} must be one of ${option.allowed_values.join(', ')}.`, spec, {
      option: option.flag,
      value,
      allowed_values: option.allowed_values,
    });
  }
  return value;
}

function parseCommandOptions(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
  options: ParseArgsOptionsConfig,
) {
  try {
    const values = parseArgs({
      args: args.filter((arg) => arg !== '--json'),
      allowPositionals: false,
      options,
      strict: true,
    }).values;
    for (const [name, value] of Object.entries(values)) {
      if (value === '' || (Array.isArray(value) && value.includes(''))) {
        throw new TypeError(`Option '--${name}' requires a non-empty value.`);
      }
    }
    return values;
  } catch (error) {
    throw buildUsageError(
      error instanceof Error ? error.message : 'Command options could not be parsed.',
      spec,
      { parser_adapter: 'node_util_parse_args' },
    );
  }
}

function parseRegisteredCommandOptions(command: string, args: string[], spec: CommandSpec) {
  const registry = spec.registry;
  const violations = registryShapeViolations(command, registry);
  if (violations.length > 0) {
    throw registryShapeError(command, violations);
  }
  const metadata = registry as CommandRegistryMetadata;
  const options: ParseArgsOptionsConfig = Object.fromEntries(
    metadata.options.map((option) => [
      option.name,
      {
        type: option.value_kind === 'boolean' ? 'boolean' : 'string',
        multiple: option.multiple === true,
      },
    ]),
  );

  const values = parseCommandOptions(args, spec, options);

  return Object.fromEntries(
    metadata.options.flatMap((option) => {
      const value = coerceOptionValue(command, spec, option, values[option.name]);
      return value === undefined ? [] : [[option.name, value]];
    }),
  ) as Record<string, string | number | boolean | Array<string | number | boolean>>;
}

export {
  bindCommandRegistryMetadata,
  parseCommandOptions,
  parseRegisteredCommandOptions,
  validateCommandRegistryCoverage,
};
