import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { JsonRecord } from './descriptor.ts';

export function usage(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('cli_usage_error', message, details);
}

function requireCliValue(option: string, remaining: string[], usageText: string) {
  const value = remaining.shift() ?? null;
  if (!value) {
    throw usage(`${usageText} requires a value after ${option}.`, { required: [`${option} <path>`] });
  }
  return value;
}

export function parseDescriptorArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let output: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = remaining.shift() ?? null;
      if (!descriptor) {
        throw usage(`${usageText} requires a value after --descriptor.`, { required: ['--descriptor <path>'] });
      }
      continue;
    }
    if (token === '--output') {
      output = remaining.shift() ?? null;
      if (!output) {
        throw usage(`${usageText} requires a value after --output.`, { required: ['--output <path>'] });
      }
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }

  if (!descriptor) {
    throw usage(`${usageText} requires --descriptor <path>.`, { required: ['--descriptor <path>'] });
  }

  return { descriptor, output };
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
  let pack: string | null = null;
  let action: string | null = null;
  let template: string | null = null;
  let mode: string | null = null;
  let output: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--pack') {
      pack = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--action') {
      action = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--template') {
      template = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--mode') {
      mode = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--output') {
      output = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack option: ${token}.`, { token, usage: usageText });
  }
  if (!pack) {
    throw usage(`${usageText} requires --pack <path>.`, { required: ['--pack <path>'] });
  }
  return {
    descriptor: resolvePackDescriptor(pack),
    pack,
    action,
    template,
    mode,
    output,
  };
}

export function parseInstallArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let registry: string | null = null;
  let cacheRoot: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--registry') {
      registry = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--cache-root') {
      cacheRoot = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!descriptor || !registry) {
    throw usage(`${usageText} requires --descriptor <path> and --registry <path>.`, {
      required: ['--descriptor <path>', '--registry <path>'],
    });
  }
  return { descriptor, registry, cacheRoot };
}

export function parseRegistryArgs(args: string[], usageText: string) {
  let registry: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--registry') {
      registry = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!registry) {
    throw usage(`${usageText} requires --registry <path>.`, { required: ['--registry <path>'] });
  }
  return { registry };
}

export function parseCacheArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let cacheRoot: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--cache-root') {
      cacheRoot = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!descriptor || !cacheRoot) {
    throw usage(`${usageText} requires --descriptor <path> and --cache-root <dir>.`, {
      required: ['--descriptor <path>', '--cache-root <dir>'],
    });
  }
  return { descriptor, cacheRoot };
}

export function parseDistributionArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let output: string | null = null;
  let cacheRoot: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--output') {
      output = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--cache-root') {
      cacheRoot = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!descriptor || !output) {
    throw usage(`${usageText} requires --descriptor <path> and --output <path>.`, {
      required: ['--descriptor <path>', '--output <path>'],
    });
  }
  return { descriptor, output, cacheRoot };
}
