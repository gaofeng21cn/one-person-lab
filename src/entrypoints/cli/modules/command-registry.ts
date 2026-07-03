import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { FrameworkContractError } from '../../../modules/charter/index.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandRegistryMetadata, CommandSpec } from './types.ts';

type CommandRegistryCoverageOptions = {
  protectedCommandPrefixes?: string[];
  requiredCommandIds?: string[];
};
type CommandOptionValue = string | number | boolean;

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
  }
  if (!registry.json_output_schema_ref) {
    violations.push('registry.json_output_schema_ref_missing');
  }
  const boundary = registry.authority_boundary;
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
  const requiredCommandIds = new Set(options.requiredCommandIds ?? []);
  const commands = Object.keys(specs).filter((command) =>
    requiredCommandIds.has(command) || matchesProtectedPrefix(command, protectedCommandPrefixes)
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
    required_command_ids: [...requiredCommandIds],
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
  return value;
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

  let values: Record<string, unknown>;
  try {
    values = parseArgs({
      args: args.filter((arg) => arg !== '--json'),
      allowPositionals: false,
      options,
      strict: true,
    }).values;
  } catch (error) {
    throw buildUsageError(
      error instanceof Error ? error.message : `${command} options could not be parsed.`,
      spec,
      {
        parser_adapter: metadata.parser_adapter,
      },
    );
  }

  return Object.fromEntries(
    metadata.options.flatMap((option) => {
      const value = coerceOptionValue(command, spec, option, values[option.name]);
      return value === undefined ? [] : [[option.name, value]];
    }),
  ) as Record<string, string | number | boolean | Array<string | number | boolean>>;
}

export { parseRegisteredCommandOptions, validateCommandRegistryCoverage };
