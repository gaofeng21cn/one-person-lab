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

function isContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
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
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`Whitepaper profile requires ${field} as a non-empty string array.`);
  }
  return value as string[];
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

function profilePath(repoRoot: string, profileArg: string) {
  const candidate = path.resolve(repoRoot, profileArg);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    fail('Whitepaper profile must be an existing file.');
  }
  const resolved = fs.realpathSync(candidate);
  if (!isContained(repoRoot, resolved)) {
    fail('Whitepaper profile must be inside repo root.');
  }
  return resolved;
}

function sourceMarkdownPath(repoRoot: string, sourceMarkdown: string) {
  if (path.isAbsolute(sourceMarkdown)) {
    fail('Whitepaper profile sourceMarkdown must stay inside repo root.');
  }
  const candidate = path.resolve(repoRoot, sourceMarkdown);
  if (!isContained(repoRoot, candidate) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    fail('Whitepaper profile sourceMarkdown must reference an existing file inside repo root.');
  }
  if (!isContained(repoRoot, fs.realpathSync(candidate))) {
    fail('Whitepaper profile sourceMarkdown must stay inside repo root.');
  }
  return sourceMarkdown;
}

function readProfile(repoRoot: string, profileArg: string): WhitepaperProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(profilePath(repoRoot, profileArg), 'utf8'));
  } catch (error) {
    fail(`Whitepaper profile must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(raw) || 'repoRoot' in raw) {
    fail('Whitepaper profile must be an object without repoRoot.');
  }
  const outputName = nonEmptyString(raw, 'outputName');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(outputName)) {
    fail('Whitepaper profile outputName must be a plain file name.');
  }
  return {
    sourceMarkdown: sourceMarkdownPath(repoRoot, nonEmptyString(raw, 'sourceMarkdown')),
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
  buildOplWhitepaper({ ...readProfile(repoRoot, input.profile), repoRoot });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
