#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';

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
  if (!/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(base)) {
    throw new Error(`Release Set base must use YY.M.D: ${base}`);
  }
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const revisionPattern = new RegExp(`^${escapedBase}-r([1-9]\\d*)$`);
  let highestRevision = 0;
  for (const rawTag of existingTags) {
    const tag = rawTag.trim().replace(/^v/, '');
    if (tag === base) {
      highestRevision = Math.max(highestRevision, 1);
      continue;
    }
    const match = tag.match(revisionPattern);
    if (match) highestRevision = Math.max(highestRevision, Number(match[1]));
  }
  return highestRevision === 0 ? base : `${base}-r${highestRevision + 1}`;
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
