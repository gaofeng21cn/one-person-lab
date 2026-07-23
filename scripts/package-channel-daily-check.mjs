#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

const releaseSetGenerationPattern = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?$/;

function parseCliOptions(argv) {
  const parsed = {
    candidateManifest: null,
    currentManifest: null,
    fallbackExitCode: null,
    fallbackLog: null,
    fallbackStage: null,
    releaseSetGeneration: null,
    summaryPath: null,
  };

  parseRequiredValueOptions(argv, {
    '--candidate-manifest': (value) => {
      parsed.candidateManifest = path.resolve(value);
    },
    '--current-manifest': (value) => {
      parsed.currentManifest = path.resolve(value);
    },
    '--fallback-exit-code': (value) => {
      const exitCode = Number(value);
      if (!Number.isSafeInteger(exitCode) || exitCode < 1) {
        throw new Error('--fallback-exit-code must be a positive integer.');
      }
      parsed.fallbackExitCode = exitCode;
    },
    '--fallback-log': (value) => {
      parsed.fallbackLog = path.resolve(value);
    },
    '--fallback-stage': (value) => {
      parsed.fallbackStage = value.trim();
    },
    '--release-set-generation': (value) => {
      parsed.releaseSetGeneration = value.trim();
    },
    '--summary-path': (value) => {
      parsed.summaryPath = path.resolve(value);
    },
  });

  if (!parsed.releaseSetGeneration
    || (!parsed.candidateManifest && !parsed.fallbackStage)
    || (parsed.fallbackStage && (!parsed.currentManifest || !parsed.fallbackExitCode))) {
    throw new Error('Usage: package-channel-daily-check.mjs [--candidate-manifest <path> | --fallback-stage <stage> --fallback-exit-code <code>] [--fallback-log <path>] [--current-manifest <path>] --release-set-generation <yy.m.d[-rN]> [--summary-path <path>]');
  }

  return parsed;
}

function readJson(filePath) {
  return readJsonFile(filePath);
}

function readCurrentStableManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Current channel manifest does not exist: ${filePath}`);
  }
  const manifest = readJson(filePath);
  const releaseSet = manifest.release_set ?? {};
  const generation = manifest.release_set_generation ?? null;
  const componentIds = releaseSet.component_ids ?? null;
  const validComponentIds = Array.isArray(componentIds)
    && componentIds.length >= 2
    && new Set(componentIds).size === componentIds.length
    && componentIds.every((componentId) => typeof componentId === 'string' && componentId.length > 0)
    && componentIds.includes('opl-base')
    && componentIds.includes('opl-app');
  if (releaseSet.surface_kind !== 'opl_release_set.v2'
    || !releaseSetGenerationPattern.test(generation ?? '')
    || releaseSet.generation !== generation
    || !validComponentIds) {
    throw new Error(`Current channel manifest is not a verified opl_release_set.v2 LKG: ${filePath}`);
  }
  return manifest;
}

function packageFingerprint(manifest) {
  const catalog = manifest.packages?.package_catalog ?? {};
  return Object.fromEntries(Object.entries(catalog)
    .map(([packageId, entry]) => {
      const selected = entry?.versions?.find((version) => version?.selection_status === 'selected_for_release_set') ?? null;
      return [packageId, {
        package_version: selected?.package_version ?? entry?.selected_version ?? null,
        package_content_digest: selected?.package_content_digest ?? null,
        owner_source_commit: selected?.owner_source_commit ?? null,
      }];
    })
    .sort(([left], [right]) => left.localeCompare(right)));
}

function ecosystemFingerprint(manifest) {
  const base = manifest.release_set?.components?.base ?? {};
  const app = manifest.release_set?.components?.app ?? {};
  return {
    'opl-base': {
      version: base.version ?? manifest.packages?.framework_core?.version ?? null,
      source_commit: base.source_commit ?? manifest.packages?.framework_core?.source_git?.head_sha ?? null,
      content_digest: manifest.packages?.framework_core?.source_archive?.sha256 ?? null,
    },
    'opl-app': {
      version: app.version ?? null,
      source_commit: app.source_commit ?? null,
      content_digest: app.artifact_digest ?? null,
    },
    ...Object.fromEntries(Object.entries(packageFingerprint(manifest)).map(([packageId, value]) => [packageId, {
      version: value.package_version,
      source_commit: value.owner_source_commit,
      content_digest: value.package_content_digest,
    }])),
  };
}

function changedComponents(candidateFingerprint, currentFingerprint) {
  const componentIds = new Set([...Object.keys(candidateFingerprint), ...Object.keys(currentFingerprint)]);
  return [...componentIds]
    .filter((componentId) => {
      const candidate = candidateFingerprint[componentId] ?? null;
      const current = currentFingerprint[componentId] ?? null;
      const candidateIdentity = candidate && { version: candidate.version, content_digest: candidate.content_digest };
      const currentIdentity = current && { version: current.version, content_digest: current.content_digest };
      return JSON.stringify(candidateIdentity) !== JSON.stringify(currentIdentity);
    })
    .sort();
}

function changedPackages(candidateFingerprint, currentFingerprint) {
  const packageIds = new Set([
    ...Object.keys(candidateFingerprint),
    ...Object.keys(currentFingerprint),
  ]);
  return [...packageIds]
    .filter((packageId) => {
      const candidate = candidateFingerprint[packageId] ?? null;
      const current = currentFingerprint[packageId] ?? null;
      const candidateIdentity = candidate && {
        package_version: candidate.package_version,
        package_content_digest: candidate.package_content_digest,
      };
      const currentIdentity = current && {
        package_version: current.package_version,
        package_content_digest: current.package_content_digest,
      };
      return JSON.stringify(candidateIdentity) !== JSON.stringify(currentIdentity);
    })
    .sort();
}

function fallbackSummary(options, current, input) {
  const retainedReleaseSetGeneration = current.release_set_generation
    ?? current.release_set?.generation
    ?? null;
  return {
    surface_kind: 'opl_package_channel_daily_summary.v1',
    status: 'retained_previous_stable',
    reason: input.reason,
    publish_required: false,
    release_set_generation: options.releaseSetGeneration,
    candidate_manifest: options.candidateManifest,
    current_manifest: options.currentManifest,
    changed_packages: [],
    changed_packages_json: '[]',
    observed_changed_packages: input.observedChangedPackages ?? [],
    changed_components: [],
    observed_changed_components: input.observedChangedComponents ?? [],
    retained_components: [...current.release_set.component_ids],
    fallback: {
      strategy: 'retain_previous_stable_release_set',
      current_manifest_verified: true,
      retained_release_set_generation: retainedReleaseSetGeneration,
      blocking_components: input.blockingComponents,
      stage: input.stage,
      exit_code: input.exitCode ?? null,
      detail_log: input.detailLog ?? null,
    },
  };
}

function buildFailureSummary(options) {
  if (!/^[a-z][a-z0-9_]*$/.test(options.fallbackStage)) {
    throw new Error('--fallback-stage must be a lowercase machine id.');
  }
  if (options.fallbackLog && !fs.existsSync(options.fallbackLog)) {
    throw new Error(`Fallback detail log does not exist: ${options.fallbackLog}`);
  }
  return fallbackSummary(options, readCurrentStableManifest(options.currentManifest), {
    reason: 'candidate_build_failed',
    blockingComponents: ['candidate-build'],
    stage: options.fallbackStage,
    exitCode: options.fallbackExitCode,
    detailLog: options.fallbackLog ? path.basename(options.fallbackLog) : null,
  });
}

function buildSummary(options) {
  const candidate = readJson(options.candidateManifest);
  const current = options.currentManifest
    ? readCurrentStableManifest(options.currentManifest)
    : null;
  const candidateFingerprint = packageFingerprint(candidate);
  const currentFingerprint = current
    ? packageFingerprint(current)
    : {};
  const changed = changedPackages(candidateFingerprint, currentFingerprint);
  const candidateEcosystemFingerprint = ecosystemFingerprint(candidate);
  const currentEcosystemFingerprint = current
    ? ecosystemFingerprint(current)
    : {};
  const changedEcosystemComponents = changedComponents(candidateEcosystemFingerprint, currentEcosystemFingerprint);
  const unversionedChanges = changed.filter((packageId) => (
    currentFingerprint[packageId]
    && candidateFingerprint[packageId]
    && currentFingerprint[packageId].package_version === candidateFingerprint[packageId].package_version
    && currentFingerprint[packageId].package_content_digest !== candidateFingerprint[packageId].package_content_digest
  ));
  const unversionedComponents = changedEcosystemComponents.filter((componentId) => (
    currentEcosystemFingerprint[componentId]
    && candidateEcosystemFingerprint[componentId]
    && currentEcosystemFingerprint[componentId].version === candidateEcosystemFingerprint[componentId].version
    && currentEcosystemFingerprint[componentId].content_digest !== candidateEcosystemFingerprint[componentId].content_digest
  ));
  const blockingComponents = [...new Set([
    ...unversionedChanges,
    ...unversionedComponents,
  ])].sort();
  if (blockingComponents.length > 0) {
    return fallbackSummary(options, current, {
      reason: 'unversioned_component_change',
      observedChangedPackages: changed,
      observedChangedComponents: changedEcosystemComponents,
      blockingComponents,
      stage: 'candidate_fingerprint_validation',
    });
  }
  return {
    surface_kind: 'opl_package_channel_daily_summary.v1',
    status: changedEcosystemComponents.length > 0 ? 'publish_required' : 'skipped',
    reason: !options.currentManifest
      ? 'package_channel_bootstrap'
      : changedEcosystemComponents.length > 0
        ? 'release_set_component_changed'
        : 'release_set_components_unchanged',
    publish_required: changedEcosystemComponents.length > 0,
    release_set_generation: options.releaseSetGeneration,
    candidate_manifest: options.candidateManifest,
    current_manifest: options.currentManifest ?? null,
    changed_packages: changed,
    changed_packages_json: JSON.stringify(changed),
    observed_changed_packages: changed,
    candidate_fingerprint: candidateFingerprint,
    current_fingerprint: currentFingerprint,
    changed_components: changedEcosystemComponents,
    observed_changed_components: changedEcosystemComponents,
    retained_components: [],
    fallback: null,
    candidate_ecosystem_fingerprint: candidateEcosystemFingerprint,
    current_ecosystem_fingerprint: currentEcosystemFingerprint,
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
  const summary = options.fallbackStage
    ? buildFailureSummary(options)
    : buildSummary(options);
  writeSummary(options.summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
