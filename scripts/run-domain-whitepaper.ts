#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { buildOplWhitepaper } from './opl-whitepaper-builder.ts';

type WhitepaperProfile = Omit<Parameters<typeof buildOplWhitepaper>[0], 'repoRoot'>;

const usage = [
  'Usage: node scripts/run-domain-whitepaper.ts --repo-root <path> --profile <path>',
  '',
  'Build one domain-owned whitepaper with the shared OPL renderer.',
].join('\n');

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(profile: Record<string, unknown>, field: string) {
  const value = profile[field];
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Whitepaper profile requires non-empty ${field}.`);
  }
  return value;
}

function stringList(profile: Record<string, unknown>, field: string) {
  const value = profile[field];
  if (value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`Whitepaper profile requires ${field} as a non-empty string array.`);
  }
  return value;
}

function positiveInteger(profile: Record<string, unknown>, field: string, optional = false) {
  const value = profile[field];
  if (value === undefined && optional) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) {
    fail(`Whitepaper profile requires positive integer ${field}.`);
  }
  return value as number;
}

function parseArgs(argv: string[]) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    process.stdout.write(`${usage}\n`);
    return null;
  }
  if (argv.length !== 4) fail(usage);

  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== '--repo-root' && flag !== '--profile') || !value || values.has(flag)) {
      fail(usage);
    }
    values.set(flag, value);
  }
  const repoRoot = values.get('--repo-root');
  const profile = values.get('--profile');
  if (!repoRoot || !profile) fail(usage);
  return { repoRoot, profile };
}

function contains(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function repoRelativePath(repoRoot: string, value: string, field: string) {
  if (path.isAbsolute(value) || !contains(repoRoot, path.resolve(repoRoot, value))) {
    fail(`Whitepaper profile ${field} must stay inside repo root.`);
  }
  return value;
}

function readProfile(repoRoot: string, profileArg: string): WhitepaperProfile {
  const profilePath = path.resolve(repoRoot, profileArg);
  if (!fs.existsSync(profilePath) || !fs.statSync(profilePath).isFile()) {
    fail('Whitepaper profile must be an existing file.');
  }
  const resolvedRepoRoot = fs.realpathSync(repoRoot);
  const resolvedProfilePath = fs.realpathSync(profilePath);
  if (!contains(resolvedRepoRoot, resolvedProfilePath)) {
    fail('Whitepaper profile must be inside repo root.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(resolvedProfilePath, 'utf8'));
  } catch (error) {
    fail(`Whitepaper profile must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(raw) || 'repoRoot' in raw) {
    fail('Whitepaper profile must be an object without repoRoot.');
  }
  const sourceMarkdown = repoRelativePath(repoRoot, nonEmptyString(raw, 'sourceMarkdown'), 'sourceMarkdown');
  const outputName = nonEmptyString(raw, 'outputName');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(outputName)) {
    fail('Whitepaper profile outputName must be a plain file name.');
  }
  return {
    sourceMarkdown,
    outputName,
    status: nonEmptyString(raw, 'status'),
    owner: nonEmptyString(raw, 'owner'),
    coverLine: nonEmptyString(raw, 'coverLine'),
    headerTitle: nonEmptyString(raw, 'headerTitle'),
    requiredTerms: stringList(raw, 'requiredTerms'),
    requiredSections: stringList(raw, 'requiredSections'),
    minSections: positiveInteger(raw, 'minSections', true),
    minPdfPages: positiveInteger(raw, 'minPdfPages'),
  };
}

function main() {
  const input = parseArgs(process.argv.slice(2));
  if (!input) return;
  const requestedRepoRoot = path.resolve(input.repoRoot);
  if (!fs.existsSync(requestedRepoRoot) || !fs.statSync(requestedRepoRoot).isDirectory()) {
    fail('Whitepaper repo root must be an existing directory.');
  }
  const repoRoot = fs.realpathSync(requestedRepoRoot);
  const profile = readProfile(repoRoot, input.profile);
  buildOplWhitepaper({ ...profile, repoRoot });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
