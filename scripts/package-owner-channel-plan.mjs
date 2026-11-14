#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;

function parseOptions(argv) {
  const options = {
    candidateSummary: null,
    currentState: null,
    output: null,
  };
  parseRequiredValueOptions(argv, {
    '--candidate-summary': (value) => {
      options.candidateSummary = path.resolve(value);
    },
    '--current-state': (value) => {
      options.currentState = path.resolve(value);
    },
    '--output': (value) => {
      options.output = path.resolve(value);
    },
  });
  if (!options.candidateSummary || !options.currentState) {
    throw new Error('Usage: package-owner-channel-plan.mjs --candidate-summary <path> --current-state <path> [--output <path>]');
  }
  return options;
}

function compareSemver(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function validateFingerprint(packageId, fingerprint, label) {
  if (!fingerprint
    || !semverPattern.test(fingerprint.package_version ?? '')
    || !digestPattern.test(fingerprint.package_content_digest ?? '')
    || !commitPattern.test(fingerprint.owner_source_commit ?? '')) {
    throw new Error(`${packageId}: invalid ${label} Package fingerprint`);
  }
  return fingerprint;
}

function validateCurrentState(packageId, state) {
  if (!state || (state.status !== 'present' && state.status !== 'absent')) {
    throw new Error(`${packageId}: current owner-channel state must be present or absent`);
  }
  if (state.status === 'absent') {
    if (state.digest !== null || state.fingerprint !== null) {
      throw new Error(`${packageId}: absent owner channel cannot declare a digest or fingerprint`);
    }
    return state;
  }
  if (!digestPattern.test(state.digest ?? '')) {
    throw new Error(`${packageId}: current owner-channel digest is invalid`);
  }
  validateFingerprint(packageId, state.fingerprint, 'current owner-channel');
  return state;
}

export function buildPlan(candidateSummary, currentState) {
  const candidateFingerprint = candidateSummary.candidate_fingerprint;
  if (!candidateFingerprint || typeof candidateFingerprint !== 'object' || Array.isArray(candidateFingerprint)) {
    throw new Error('Candidate summary has no candidate_fingerprint object');
  }
  const currentPackages = currentState.packages;
  if (!currentPackages || typeof currentPackages !== 'object' || Array.isArray(currentPackages)) {
    throw new Error('Current owner-channel state has no packages object');
  }

  const publishPackages = [];
  const unchangedPackages = [];
  const violations = [];
  for (const packageId of Object.keys(candidateFingerprint).sort()) {
    const candidate = validateFingerprint(packageId, candidateFingerprint[packageId], 'candidate');
    const current = validateCurrentState(packageId, currentPackages[packageId]);
    if (current.status === 'absent') {
      publishPackages.push(packageId);
      continue;
    }

    const published = current.fingerprint;
    const sameVersion = candidate.package_version === published.package_version;
    const sameContent = candidate.package_content_digest === published.package_content_digest;
    if (sameVersion && sameContent) {
      unchangedPackages.push(packageId);
      continue;
    }
    if (sameVersion) {
      violations.push({
        package_id: packageId,
        reason: 'version_bump_required',
        current_version: published.package_version,
        candidate_version: candidate.package_version,
        current_content_digest: published.package_content_digest,
        candidate_content_digest: candidate.package_content_digest,
      });
      continue;
    }
    if (compareSemver(candidate.package_version, published.package_version) < 0) {
      violations.push({
        package_id: packageId,
        reason: 'version_regression',
        current_version: published.package_version,
        candidate_version: candidate.package_version,
        current_content_digest: published.package_content_digest,
        candidate_content_digest: candidate.package_content_digest,
      });
      continue;
    }
    if (sameContent) {
      violations.push({
        package_id: packageId,
        reason: 'version_change_without_content_change',
        current_version: published.package_version,
        candidate_version: candidate.package_version,
        current_content_digest: published.package_content_digest,
        candidate_content_digest: candidate.package_content_digest,
      });
      continue;
    }
    publishPackages.push(packageId);
  }

  const extraState = Object.keys(currentPackages)
    .filter((packageId) => !(packageId in candidateFingerprint))
    .sort();
  if (extraState.length > 0) {
    throw new Error(`Current owner-channel state contains unknown Packages: ${extraState.join(', ')}`);
  }

  return {
    surface_kind: 'opl_package_owner_channel_plan.v1',
    status: violations.length > 0
      ? (publishPackages.length > 0 ? 'partially_blocked' : 'blocked')
      : publishPackages.length > 0
        ? 'publish_required'
        : 'skipped',
    reason: violations.length > 0
      ? 'package_version_discipline_violation'
      : publishPackages.length > 0
        ? 'independent_owner_channel_changed'
        : 'independent_owner_channels_unchanged',
    publish_required: publishPackages.length > 0,
    changed_packages: publishPackages,
    unchanged_packages: unchangedPackages,
    violations,
    candidate_fingerprint: candidateFingerprint,
    current_owner_channels: currentPackages,
  };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const plan = buildPlan(
    readJsonFile(options.candidateSummary),
    readJsonFile(options.currentState),
  );
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(plan, null, 2));
  if (plan.violations.length > 0) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
