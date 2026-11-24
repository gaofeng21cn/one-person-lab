import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { JsonRecord } from './descriptor.ts';

export function usage(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('cli_usage_error', message, details);
}

function parseStringOptionMap(
  args: string[],
  usageText: string,
  optionNames: readonly string[],
  required: readonly string[],
): Record<string, string | null> {
  const options: ParseArgsOptionsConfig = Object.fromEntries(
    optionNames.map((name) => [name, { type: 'string' }]),
  );
  let values: Record<string, unknown>;
  try {
    values = parseArgs({ args, options, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw usage(error instanceof Error ? error.message : `${usageText} has invalid options.`, {
      usage: usageText,
      required: required.map((name) => `--${name} <path>`),
    });
  }
  for (const name of optionNames) {
    if (values[name] === '') {
      throw usage(`${usageText} requires a value after --${name}.`, {
        required: [`--${name} <path>`],
      });
    }
  }
  const missing = required.filter((name) => typeof values[name] !== 'string' || !values[name]);
  if (missing.length > 0) {
    throw usage(`${usageText} requires ${missing.map((name) => `--${name} <path>`).join(' and ')}.`, {
      required: required.map((name) => `--${name} <path>`),
    });
  }
  return Object.fromEntries(
    optionNames.map((name) => [name, typeof values[name] === 'string' ? values[name] : null]),
  );
}

export function parseDescriptorArgs(args: string[], usageText: string) {
  const values = parseStringOptionMap(args, usageText, ['descriptor', 'output'], ['descriptor']);
  return { descriptor: values.descriptor!, output: values.output };
}

export function resolvePackDescriptor(packRef: string) {
  const resolved = path.resolve(packRef);
  if (!fs.existsSync(resolved)) {
    return resolved;
  }
  const stats = fs.statSync(resolved);
  if (!stats.isDirectory()) {
    return resolved;
  }
  for (const candidate of ['opl_pack.json', 'pack.json', 'display-pack.json']) {
    const candidatePath = path.join(resolved, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  throw usage('Pack directory must contain opl_pack.json, pack.json, or display-pack.json.', {
    pack: resolved,
    expected: ['opl_pack.json', 'pack.json', 'display-pack.json'],
  });
}

export function parseGenericPackArgs(args: string[], usageText: string) {
  const values = parseStringOptionMap(
    args,
    usageText,
    ['pack', 'action', 'template', 'mode', 'output'],
    ['pack'],
  );
  return {
    descriptor: resolvePackDescriptor(values.pack!),
    pack: values.pack!,
    action: values.action,
    template: values.template,
    mode: values.mode,
    output: values.output,
  };
}

export function parseInstallArgs(args: string[], usageText: string) {
  const values = parseStringOptionMap(
    args,
    usageText,
    ['descriptor', 'registry', 'cache-root'],
    ['descriptor', 'registry'],
  );
  return {
    descriptor: values.descriptor!,
    registry: values.registry!,
    cacheRoot: values['cache-root'],
  };
}

export function parseRegistryArgs(args: string[], usageText: string) {
  const values = parseStringOptionMap(args, usageText, ['registry'], ['registry']);
  return { registry: values.registry! };
}

export function parseCacheArgs(args: string[], usageText: string) {
  const values = parseStringOptionMap(
    args,
    usageText,
    ['descriptor', 'cache-root'],
    ['descriptor', 'cache-root'],
  );
  return { descriptor: values.descriptor!, cacheRoot: values['cache-root']! };
}

export function parseDistributionArgs(args: string[], usageText: string) {
  const values = parseStringOptionMap(
    args,
    usageText,
    ['descriptor', 'output', 'cache-root'],
    ['descriptor', 'output'],
  );
  return {
    descriptor: values.descriptor!,
    output: values.output!,
    cacheRoot: values['cache-root'],
  };
}
