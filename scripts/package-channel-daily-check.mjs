#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const parsed = {
    candidateManifest: null,
    currentManifest: null,
    version: null,
    summaryPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--candidate-manifest') {
      parsed.candidateManifest = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--current-manifest') {
      parsed.currentManifest = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--version') {
      parsed.version = value.trim();
      index += 1;
      continue;
    }
    if (token === '--summary-path') {
      parsed.summaryPath = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!parsed.candidateManifest || !parsed.currentManifest || !parsed.version) {
    throw new Error('Usage: package-channel-daily-check.mjs --candidate-manifest <path> --current-manifest <path> --version <version> [--summary-path <path>]');
  }

  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function moduleFingerprint(manifest) {
  const modules = manifest.packages?.modules ?? {};
  return Object.fromEntries(
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
}

function changedModules(candidateFingerprint, currentFingerprint) {
  const moduleIds = new Set([
    ...Object.keys(candidateFingerprint),
    ...Object.keys(currentFingerprint),
  ]);
  return [...moduleIds]
    .filter((moduleId) => JSON.stringify(candidateFingerprint[moduleId] ?? null) !== JSON.stringify(currentFingerprint[moduleId] ?? null))
    .sort();
}

function buildSummary(options) {
  const candidate = readJson(options.candidateManifest);
  if (!options.currentManifest || !fs.existsSync(options.currentManifest)) {
    throw new Error(`Current channel manifest does not exist: ${options.currentManifest ?? '<missing>'}`);
  }
  const current = readJson(options.currentManifest);
  const candidateFingerprint = moduleFingerprint(candidate);

  const currentFingerprint = moduleFingerprint(current);
  const changed = changedModules(candidateFingerprint, currentFingerprint);
  return {
    status: changed.length > 0 ? 'publish_required' : 'skipped',
    reason: changed.length > 0 ? 'package_channel_changed' : 'package_channel_unchanged',
    publish_required: changed.length > 0,
    version: options.version,
    candidate_manifest: options.candidateManifest,
    current_manifest: options.currentManifest,
    changed_modules: changed,
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
