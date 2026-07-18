#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';

const RELEASE_SET_GENERATION_PATTERN = /^v?(\d{2})\.(\d{1,2})\.(\d{1,2})(?:-r([1-9]\d*))?$/;

export function parseReleaseSetGeneration(value) {
  if (typeof value !== 'string') {
    throw new Error(`Release Set generation must be a string: ${String(value)}`);
  }
  const normalized = value.trim();
  const match = normalized.match(RELEASE_SET_GENERATION_PATTERN);
  if (!match) {
    throw new Error(`Release Set generation must use YY.M.D[-rN]: ${value}`);
  }
  return {
    normalized: normalized.replace(/^v/, ''),
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    revision: match[4] ? BigInt(match[4]) : 0n,
  };
}

export function compareReleaseSetGenerations(left, right) {
  const leftGeneration = parseReleaseSetGeneration(left);
  const rightGeneration = parseReleaseSetGeneration(right);
  for (const field of ['year', 'month', 'day']) {
    const delta = leftGeneration[field] - rightGeneration[field];
    if (delta !== 0) return Math.sign(delta);
  }
  if (leftGeneration.revision === rightGeneration.revision) return 0;
  return leftGeneration.revision > rightGeneration.revision ? 1 : -1;
}

function parseCliOptions(argv) {
  const parsed = { base: null, existingTagsFile: null };
  parseRequiredValueOptions(argv, {
    '--base': (value) => {
      parsed.base = value.trim().replace(/^v/, '');
    },
    '--existing-tags-file': (value) => {
      parsed.existingTagsFile = path.resolve(value);
    },
  });
  if (!parsed.base || !parsed.existingTagsFile) {
    throw new Error('Usage: release-set-generation.mjs --base <yy.m.d> --existing-tags-file <path>');
  }
  return parsed;
}

export function nextReleaseSetGeneration(base, existingTags) {
  const baseGeneration = parseReleaseSetGeneration(base);
  if (baseGeneration.normalized !== base || baseGeneration.revision !== 0n) {
    throw new Error(`Release Set base must use YY.M.D: ${base}`);
  }
  let highestRevision = 0n;
  for (const rawTag of existingTags) {
    let candidate;
    try {
      candidate = parseReleaseSetGeneration(rawTag);
    } catch {
      continue;
    }
    if (candidate.year !== baseGeneration.year
      || candidate.month !== baseGeneration.month
      || candidate.day !== baseGeneration.day) continue;
    const candidateRevision = candidate.revision === 0n ? 1n : candidate.revision;
    if (candidateRevision > highestRevision) highestRevision = candidateRevision;
  }
  return highestRevision === 0n ? base : `${base}-r${highestRevision + 1n}`;
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const tags = fs.existsSync(options.existingTagsFile)
    ? fs.readFileSync(options.existingTagsFile, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  process.stdout.write(`${nextReleaseSetGeneration(options.base, tags)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
