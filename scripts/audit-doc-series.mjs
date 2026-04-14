#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditDocSeries,
  formatAuditReport,
  parseRepoArgument,
  resolveDefaultRepoPathsFromOplRepo,
} from './doc-series-audit-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function printHelp() {
  console.log(`Usage: npm run audit:doc-series -- [--repo <slug>=<path>]...

Without --repo arguments, the command infers the four-repo series from the current OPL checkout.
Supported slugs: opl, med-autoscience, med-autogrant, redcube-ai`);
}

const repoPathsBySlug = {};
const args = process.argv.slice(2);

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];

  if (argument === '--help' || argument === '-h') {
    printHelp();
    process.exit(0);
  }

  if (argument === '--repo') {
    const rawValue = args[index + 1];
    if (!rawValue) {
      throw new Error('Missing value after --repo.');
    }

    const { slug, repoPath } = parseRepoArgument(rawValue);
    repoPathsBySlug[slug] = repoPath;
    index += 1;
    continue;
  }

  throw new Error(`Unknown argument: ${argument}`);
}

const resolvedRepoPaths =
  Object.keys(repoPathsBySlug).length === 0
    ? resolveDefaultRepoPathsFromOplRepo(repoRoot)
    : repoPathsBySlug;
const audit = auditDocSeries({ repoPathsBySlug: resolvedRepoPaths });
const report = formatAuditReport(audit);

if (audit.ok) {
  console.log(report);
} else {
  console.error(report);
  process.exitCode = 1;
}
