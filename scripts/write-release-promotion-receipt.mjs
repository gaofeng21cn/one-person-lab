#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REQUEST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function parseOptions(argv) {
  const options = {
    releaseManifest: '', output: '', target: '', carrierRef: '', carrierDigest: '',
    promotionRequestId: '', releaseGate: '', sourceAppRunId: '', frameworkRepository: '',
    frameworkRunId: '', frameworkRunAttempt: '', expectedAppVersion: '',
    expectedAppSourceCommit: '', expectedAppArtifactDigest: '', anonymousReadback: false,
    frozenBaseReleaseSetGeneration: '', frozenBaseReleaseSetDigest: '',
  };
  parseRequiredValueOptions(argv, {
    '--release-manifest': (value) => { options.releaseManifest = path.resolve(value); },
    '--output': (value) => { options.output = path.resolve(value); },
    '--target': (value) => { options.target = value.trim(); },
    '--carrier-ref': (value) => { options.carrierRef = value.trim(); },
    '--carrier-digest': (value) => { options.carrierDigest = value.trim(); },
    '--promotion-request-id': (value) => { options.promotionRequestId = value.trim(); },
    '--release-gate': (value) => { options.releaseGate = value.trim(); },
    '--source-app-run-id': (value) => { options.sourceAppRunId = value.trim(); },
    '--framework-repository': (value) => { options.frameworkRepository = value.trim(); },
    '--framework-run-id': (value) => { options.frameworkRunId = value.trim(); },
    '--framework-run-attempt': (value) => { options.frameworkRunAttempt = value.trim(); },
    '--expected-app-version': (value) => { options.expectedAppVersion = value.trim(); },
    '--expected-app-source-commit': (value) => { options.expectedAppSourceCommit = value.trim(); },
    '--expected-app-artifact-digest': (value) => { options.expectedAppArtifactDigest = value.trim(); },
    '--frozen-base-release-set-generation': (value) => { options.frozenBaseReleaseSetGeneration = value.trim().replace(/^v/, ''); },
    '--frozen-base-release-set-digest': (value) => { options.frozenBaseReleaseSetDigest = value.trim(); },
    '--anonymous-readback': (value) => {
      if (!['true', 'false'].includes(value)) throw new Error(`Invalid anonymous readback value: ${value}`);
      options.anonymousReadback = value === 'true';
    },
  });
  for (const required of ['releaseManifest', 'output', 'target', 'carrierRef', 'carrierDigest', 'promotionRequestId', 'releaseGate', 'frameworkRepository', 'frameworkRunId', 'frameworkRunAttempt']) {
    if (!options[required]) throw new Error(`Missing required promotion receipt option: ${required}`);
  }
  if (!['candidate', 'latest-stable'].includes(options.target)) throw new Error(`Invalid promotion target: ${options.target}`);
  if (!REQUEST_PATTERN.test(options.promotionRequestId)) throw new Error(`Invalid promotion request id: ${options.promotionRequestId}`);
  if (!DIGEST_PATTERN.test(options.carrierDigest)) throw new Error(`Invalid carrier digest: ${options.carrierDigest}`);
  const hasFrozenGeneration = Boolean(options.frozenBaseReleaseSetGeneration);
  const hasFrozenDigest = Boolean(options.frozenBaseReleaseSetDigest);
  if (hasFrozenGeneration !== hasFrozenDigest) {
    throw new Error('Frozen base Release Set generation and digest must be provided together');
  }
  if (hasFrozenGeneration) {
    const bootstrap = options.frozenBaseReleaseSetGeneration === 'none'
      && options.frozenBaseReleaseSetDigest === 'none';
    const exact = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?$/.test(options.frozenBaseReleaseSetGeneration)
      && DIGEST_PATTERN.test(options.frozenBaseReleaseSetDigest);
    if (!bootstrap && !exact) throw new Error('Invalid frozen base Release Set identity');
  }
  if (!options.anonymousReadback) throw new Error('Promotion receipt requires --anonymous-readback');
  return options;
}

function exactComponent(component) {
  const version = String(component?.version ?? '');
  const sourceCommit = String(component?.source_commit ?? component?.owner_source_commit ?? '');
  const artifactRef = String(component?.artifact_ref ?? component?.oci_artifact_ref ?? '');
  const artifactDigest = String(component?.artifact_digest ?? component?.oci_artifact_digest ?? '');
  if (!component?.component_id || !version || !SHA_PATTERN.test(sourceCommit) || !artifactRef || !DIGEST_PATTERN.test(artifactDigest)) {
    throw new Error(`Incomplete Release Set component: ${component?.component_id ?? 'unknown'}`);
  }
  const carriers = Array.isArray(component.carriers) ? component.carriers : [];
  for (const carrier of carriers) {
    if (!['macos_standard', 'docker_webui'].includes(carrier?.carrier_id)
      || !['release_asset', 'oci_image'].includes(carrier?.carrier_kind)
      || typeof carrier?.ref !== 'string' || !carrier.ref
      || !DIGEST_PATTERN.test(String(carrier?.digest ?? ''))
      || !Number.isSafeInteger(carrier?.size) || carrier.size <= 0
      || !['standard', 'webui-full'].includes(carrier?.package_profile)) {
      throw new Error(`Invalid Release Set carrier on component ${component.component_id}`);
    }
  }
  return {
    component_id: component.component_id,
    version,
    source_commit: sourceCommit,
    artifact_ref: artifactRef,
    artifact_digest: artifactDigest,
    ...(carriers.length > 0 ? { carriers } : {}),
  };
}

function assertExpected(label, expected, actual) {
  if (expected && expected !== actual) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const manifest = readJsonFile(options.releaseManifest);
  const releaseSet = manifest.release_set;
  if (releaseSet?.surface_kind !== 'opl_release_set.v2' || releaseSet?.bom_status !== 'complete') {
    throw new Error('Promotion receipt requires a complete opl_release_set.v2 manifest');
  }
  if (!options.carrierRef.endsWith(`:${releaseSet.generation}`)) {
    throw new Error(`Carrier ref does not identify generation ${releaseSet.generation}`);
  }
  const app = exactComponent(releaseSet.components?.app);
  assertExpected('App version', options.expectedAppVersion, app.version);
  assertExpected('App source commit', options.expectedAppSourceCommit, app.source_commit);
  assertExpected('App artifact digest', options.expectedAppArtifactDigest, app.artifact_digest);
  if (options.target === 'latest-stable' && releaseSet.components.app.release_status !== 'published') {
    throw new Error('latest-stable promotion requires a published App component');
  }
  if (options.target === 'latest-stable') {
    const carrierIds = (app.carriers ?? []).map((carrier) => carrier.carrier_id).sort();
    const carriersById = Object.fromEntries((app.carriers ?? []).map((carrier) => [carrier.carrier_id, carrier]));
    if (JSON.stringify(carrierIds) !== JSON.stringify(['docker_webui', 'macos_standard'])
      || carriersById.macos_standard?.carrier_kind !== 'release_asset'
      || carriersById.macos_standard?.package_profile !== 'standard'
      || carriersById.docker_webui?.carrier_kind !== 'oci_image'
      || carriersById.docker_webui?.package_profile !== 'webui-full') {
      throw new Error('latest-stable App carriers must contain the exact macos_standard release asset and docker_webui OCI image');
    }
  }
  const base = exactComponent(releaseSet.components?.base);
  const packages = Object.fromEntries(Object.entries(releaseSet.components?.packages?.members ?? {})
    .map(([packageId, component]) => [packageId, exactComponent(component)]));
  if (Object.keys(packages).length !== 7) throw new Error('Promotion receipt requires exactly seven Packages');
  const channelRef = `${options.carrierRef.slice(0, options.carrierRef.lastIndexOf(':'))}:${options.target}`;
  const verifiedRefs = [channelRef, `${base.artifact_ref.slice(0, base.artifact_ref.lastIndexOf(':'))}:${options.target}`]
    .concat(Object.values(packages).map((component) => `${component.artifact_ref.slice(0, component.artifact_ref.lastIndexOf(':'))}:${options.target}`))
    .sort();
  const receipt = {
    surface_kind: 'opl_release_set_promotion_receipt.v1',
    status: options.target === 'candidate' ? 'published_immutable_candidate' : 'promoted_latest_stable',
    promotion_target: options.target,
    promotion_request_id: options.promotionRequestId,
    release_gate: options.releaseGate,
    release_set_generation: releaseSet.generation,
    carrier: {
      immutable_ref: options.carrierRef,
      digest: options.carrierDigest,
      channel_ref: channelRef,
    },
    framework_run: {
      repository: options.frameworkRepository,
      run_id: options.frameworkRunId,
      run_attempt: options.frameworkRunAttempt,
    },
    source_app_run_id: options.sourceAppRunId || null,
    ...(options.frozenBaseReleaseSetGeneration ? {
      source_cutoff: {
        policy: 'single_read_at_freeze_admission',
        frozen_base_release_set: options.frozenBaseReleaseSetGeneration === 'none'
          ? null
          : {
              generation: options.frozenBaseReleaseSetGeneration,
              digest: options.frozenBaseReleaseSetDigest,
            },
        later_authority_advancement_invalidates_receipt: false,
      },
    } : {}),
    app,
    components: { base, packages },
    anonymous_readback: { status: 'verified', verified_refs: verifiedRefs },
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'written', output: options.output, promotion_target: options.target, carrier_digest: options.carrierDigest }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
