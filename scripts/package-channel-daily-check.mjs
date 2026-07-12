#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

function parseCliOptions(argv) {
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
  const catalog = manifest.packages?.package_catalog ?? {};
  return Object.fromEntries(Object.entries(catalog)
    .map(([packageId, entry]) => {
      const promoted = entry?.versions?.find((version) => version?.promotion_status === 'promoted') ?? null;
      return [packageId, {
        package_version: promoted?.package_version ?? entry?.latest_version ?? null,
        package_content_digest: promoted?.package_content_digest ?? null,
        owner_source_commit: promoted?.owner_source_commit ?? null,
      }];
    })
    .sort(([left], [right]) => left.localeCompare(right)));
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
  const unversionedChanges = changed.filter((packageId) => (
    currentFingerprint[packageId]
    && candidateFingerprint[packageId]
    && currentFingerprint[packageId].package_version === candidateFingerprint[packageId].package_version
    && currentFingerprint[packageId].package_content_digest !== candidateFingerprint[packageId].package_content_digest
  ));
  if (unversionedChanges.length > 0) {
    throw new Error(`package content changed without a package version bump: ${unversionedChanges.join(', ')}`);
  }
  return {
    status: changed.length > 0 ? 'publish_required' : 'skipped',
    reason: changed.length > 0 ? 'package_channel_changed' : 'package_channel_unchanged',
    publish_required: changed.length > 0,
    version: options.version,
    candidate_manifest: options.candidateManifest,
    current_manifest: options.currentManifest,
    changed_packages: changed,
    changed_packages_json: JSON.stringify(changed),
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
  const options = parseCliOptions(process.argv.slice(2));
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
