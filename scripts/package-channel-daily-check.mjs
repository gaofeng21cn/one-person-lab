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
    projectionRoot: null,
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
    '--projection-root': (value) => {
      parsed.projectionRoot = path.resolve(value);
    },
    '--release-set-generation': (value) => {
      parsed.releaseSetGeneration = value.trim();
    },
    '--summary-path': (value) => {
      parsed.summaryPath = path.resolve(value);
    },
  });

  if (!parsed.releaseSetGeneration
    || (!parsed.candidateManifest && !parsed.projectionRoot && !parsed.fallbackStage)
    || (parsed.candidateManifest && parsed.projectionRoot)
    || (parsed.fallbackStage && (!parsed.currentManifest || !parsed.fallbackExitCode))) {
    throw new Error('Usage: package-channel-daily-check.mjs [--candidate-manifest <path> | --projection-root <path> | --fallback-stage <stage> --fallback-exit-code <code>] [--fallback-log <path>] [--current-manifest <path>] --release-set-generation <yy.m.d[-rN]> [--summary-path <path>]');
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

function projectionManifest(rootPath, releaseSetGeneration) {
  const packageRoot = path.join(rootPath, 'contracts', 'opl-framework', 'packages');
  const entries = fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(packageRoot, entry.name))
    .map((manifestPath) => readJson(manifestPath))
    .filter((manifest) => typeof manifest.package_id === 'string' && typeof manifest.version === 'string');
  if (entries.length === 0) {
    throw new Error(`No Package projections found under ${packageRoot}`);
  }
  const packageCatalog = {};
  for (const manifest of entries) {
    const packageId = manifest.package_id;
    const version = manifest.version;
    const payloadRef = manifest.codex_surface?.plugin_payload_manifest_url
      ?? manifest.plugin_payload_manifest_url;
    if (!/^[a-z][a-z0-9-]*$/.test(packageId)
      || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
      || typeof payloadRef !== 'string') {
      throw new Error(`Invalid Package projection identity: ${packageId ?? 'unknown'}`);
    }
    const payloadPath = path.join(packageRoot, payloadRef);
    const payload = readJson(payloadPath);
    const ownerSourceCommit = manifest.codex_surface?.carrier_source_commit
      ?? manifest.source_commit;
    const contentDigest = payload.content_lock?.digest;
    if (payload.package_id !== packageId
      || payload.package_version !== version
      || payload.source_commit !== ownerSourceCommit
      || !/^[0-9a-f]{40}$/.test(ownerSourceCommit ?? '')
      || !/^sha256:[0-9a-f]{64}$/.test(contentDigest ?? '')) {
      throw new Error(`Package projection and payload identity disagree: ${packageId}`);
    }
    packageCatalog[packageId] = {
      package_id: packageId,
      selected_version: version,
      versions: [{
        package_version: version,
        selection_status: 'selected_for_release_set',
        package_content_digest: contentDigest,
        owner_source_commit: ownerSourceCommit,
      }],
    };
  }
  return {
    release_set_generation: releaseSetGeneration,
    release_set: {
      surface_kind: 'opl_release_set.v2',
      generation: releaseSetGeneration,
      component_ids: Object.keys(packageCatalog).sort(),
    },
    packages: { package_catalog: packageCatalog },
  };
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

function nonPackageFingerprint(fingerprint) {
  return Object.fromEntries(
    Object.entries(fingerprint)
      .filter(([componentId]) => componentId === 'opl-base' || componentId === 'opl-app'),
  );
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
    projection_root: options.projectionRoot,
    current_manifest: options.currentManifest,
    changed_packages: [],
    changed_packages_json: '[]',
    observed_changed_packages: input.observedChangedPackages ?? [],
    changed_components: [],
    observed_changed_components: input.observedChangedComponents ?? [],
    non_package_changed_components: input.nonPackageChangedComponents ?? [],
    publication_scope: 'packages_only',
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
  const candidate = options.projectionRoot
    ? projectionManifest(options.projectionRoot, options.releaseSetGeneration)
    : readJson(options.candidateManifest);
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
  const changedNonPackageComponents = changedComponents(
    nonPackageFingerprint(candidateEcosystemFingerprint),
    nonPackageFingerprint(currentEcosystemFingerprint),
  );
  const unversionedChanges = changed.filter((packageId) => (
    currentFingerprint[packageId]
    && candidateFingerprint[packageId]
    && currentFingerprint[packageId].package_version === candidateFingerprint[packageId].package_version
    && currentFingerprint[packageId].package_content_digest !== candidateFingerprint[packageId].package_content_digest
  ));
  const blockingComponents = [...new Set([
    ...unversionedChanges,
  ])].sort();
  if (blockingComponents.length > 0) {
    return fallbackSummary(options, current, {
      reason: 'unversioned_component_change',
      observedChangedPackages: changed,
      observedChangedComponents: changedEcosystemComponents,
      nonPackageChangedComponents: changedNonPackageComponents,
      blockingComponents,
      stage: 'candidate_fingerprint_validation',
    });
  }
  const packagePublishRequired = changed.length > 0;
  return {
    surface_kind: 'opl_package_channel_daily_summary.v1',
    status: packagePublishRequired ? 'publish_required' : 'skipped',
    reason: !options.currentManifest
      ? 'package_channel_bootstrap'
      : packagePublishRequired
        ? 'package_changed'
        : changedNonPackageComponents.length > 0
          ? 'non_package_ecosystem_changed'
          : 'packages_unchanged',
    publish_required: packagePublishRequired,
    release_set_generation: options.releaseSetGeneration,
    candidate_manifest: options.candidateManifest,
    projection_root: options.projectionRoot,
    current_manifest: options.currentManifest ?? null,
    changed_packages: changed,
    changed_packages_json: JSON.stringify(changed),
    observed_changed_packages: changed,
    candidate_fingerprint: candidateFingerprint,
    current_fingerprint: currentFingerprint,
    changed_components: changedEcosystemComponents,
    observed_changed_components: changedEcosystemComponents,
    non_package_changed_components: changedNonPackageComponents,
    publication_scope: 'packages_only',
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
