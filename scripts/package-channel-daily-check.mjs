#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

function parseArgs(argv) {
  const parsed = {
    candidateManifest: null,
    currentManifest: null,
    version: null,
    summaryPath: null,
  };

  parseRequiredValueOptions(argv, {
    '--candidate-manifest': (value) => {
      parsed.candidateManifest = path.resolve(value);
    },
    '--current-manifest': (value) => {
      parsed.currentManifest = path.resolve(value);
    },
    '--version': (value) => {
      parsed.version = value.trim();
    },
    '--summary-path': (value) => {
      parsed.summaryPath = path.resolve(value);
    },
  });

  if (!parsed.candidateManifest || !parsed.currentManifest || !parsed.version) {
    throw new Error('Usage: package-channel-daily-check.mjs --candidate-manifest <path> --current-manifest <path> --version <version> [--summary-path <path>]');
  }

  return parsed;
}

function readJson(filePath) {
  return readJsonFile(filePath);
}

function packageFingerprint(manifest) {
  const modules = manifest.packages?.modules ?? {};
  const fingerprints = Object.fromEntries(
    Object.entries(modules)
      .map(([moduleId, entry]) => [
        moduleId,
        {
          source_git_head_sha: entry?.source_git?.head_sha ?? null,
          source_archive_sha256: entry?.source_archive?.sha256 ?? null,
        },
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const frameworkCore = manifest.packages?.framework_core;
  if (frameworkCore) {
    fingerprints.framework_core = {
      source_git_head_sha: frameworkCore?.source_git?.head_sha ?? null,
      source_archive_sha256: frameworkCore?.source_archive?.sha256 ?? null,
    };
  }
  return Object.fromEntries(Object.entries(fingerprints).sort(([left], [right]) => left.localeCompare(right)));
}

function changedPackages(candidateFingerprint, currentFingerprint) {
  const packageIds = new Set([
    ...Object.keys(candidateFingerprint),
    ...Object.keys(currentFingerprint),
  ]);
  return [...packageIds]
    .filter((packageId) => JSON.stringify(candidateFingerprint[packageId] ?? null) !== JSON.stringify(currentFingerprint[packageId] ?? null))
    .sort();
}

function buildSummary(options) {
  const candidate = readJson(options.candidateManifest);
  if (!options.currentManifest || !fs.existsSync(options.currentManifest)) {
    throw new Error(`Current channel manifest does not exist: ${options.currentManifest ?? '<missing>'}`);
  }
  const current = readJson(options.currentManifest);
  const candidateFingerprint = packageFingerprint(candidate);

  const currentFingerprint = packageFingerprint(current);
  const changed = changedPackages(candidateFingerprint, currentFingerprint);
  return {
    status: changed.length > 0 ? 'publish_required' : 'skipped',
    reason: changed.length > 0 ? 'package_channel_changed' : 'package_channel_unchanged',
    publish_required: changed.length > 0,
    version: options.version,
    candidate_manifest: options.candidateManifest,
    current_manifest: options.currentManifest,
    changed_packages: changed,
    candidate_fingerprint: candidateFingerprint,
    current_fingerprint: currentFingerprint,
  };
}

function writeSummary(summaryPath, summary) {
  if (!summaryPath) {
    return;
  }
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = buildSummary(options);
  writeSummary(options.summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
