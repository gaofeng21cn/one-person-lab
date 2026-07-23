#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { parseJsonText } from './script-json-boundary.mjs';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const GENERATION_PATTERN = /^[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?$/;
const REQUEST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PACKAGE_IDS = ['mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca'];
const COMPONENT_IDS = ['opl-app', 'opl-base', ...PACKAGE_IDS].sort();
const REMOTE_IDS = ['opl-release-set', 'opl-base', ...PACKAGE_IDS];
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

class VerificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function reject(code, message, details) {
  throw new VerificationError(code, message, details);
}

function record(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject(code, `${label} must be a JSON object.`);
  }
  return value;
}

function exactKeys(value, expected, code, label) {
  const actual = Object.keys(record(value, code, label)).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    reject(code, `${label} must contain the exact required identity set.`, { actual, expected: wanted });
  }
}

function exactString(value, pattern, code, label) {
  if (typeof value !== 'string' || !pattern.test(value)) reject(code, `${label} is invalid.`);
  return value;
}

function same(actual, expected, code, label) {
  if (actual !== expected) reject(code, `${label} mismatch.`, { actual, expected });
}

function sameJson(actual, expected, code, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    reject(code, `${label} mismatch.`);
  }
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function readEvidence(filePath, missingCode, invalidCode, label) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    reject(missingCode, `${label} is required.`);
  }
  const bytes = fs.readFileSync(filePath);
  try {
    return { value: parseJsonText(bytes.toString('utf8')), digest: sha256(bytes) };
  } catch {
    reject(invalidCode, `${label} is not valid JSON.`);
  }
}

function stripTag(ref) {
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  if (colon <= slash) reject('component_identity_invalid', 'Component artifact_ref must contain an immutable tag.', { ref });
  return ref.slice(0, colon);
}

function component(value, expectedId, code, label) {
  const item = record(value, code, label);
  same(item.component_id, expectedId, code, `${label}.component_id`);
  exactString(String(item.version ?? ''), /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/, code, `${label}.version`);
  exactString(String(item.source_commit ?? ''), SHA_PATTERN, code, `${label}.source_commit`);
  if (typeof item.artifact_ref !== 'string' || !item.artifact_ref.startsWith('ghcr.io/')) {
    reject(code, `${label}.artifact_ref is invalid.`);
  }
  exactString(String(item.artifact_digest ?? ''), DIGEST_PATTERN, code, `${label}.artifact_digest`);
  return item;
}

function appCarriers(value, code) {
  if (!Array.isArray(value) || value.length !== 2) reject(code, 'App component must contain exactly two carriers.');
  const byId = Object.fromEntries(value.map((item) => [item?.carrier_id, item]));
  exactKeys(byId, ['docker_webui', 'macos_standard'], code, 'App carriers');
  const expected = {
    docker_webui: { carrier_kind: 'oci_image', package_profile: 'webui-full' },
    macos_standard: { carrier_kind: 'release_asset', package_profile: 'standard' },
  };
  for (const carrierId of Object.keys(expected)) {
    const carrier = record(byId[carrierId], code, `App carrier ${carrierId}`);
    same(carrier.carrier_kind, expected[carrierId].carrier_kind, code, `${carrierId}.carrier_kind`);
    same(carrier.package_profile, expected[carrierId].package_profile, code, `${carrierId}.package_profile`);
    if (typeof carrier.ref !== 'string' || !carrier.ref) reject(code, `${carrierId}.ref is invalid.`);
    exactString(String(carrier.digest ?? ''), DIGEST_PATTERN, code, `${carrierId}.digest`);
    if (!Number.isSafeInteger(carrier.size) || carrier.size <= 0) reject(code, `${carrierId}.size is invalid.`);
  }
}

function parseOptions(argv) {
  const options = {
    expectation: '', candidateReceipt: '', promotionReceipt: '', attestationReadback: '',
    releaseManifest: '', channelManifest: '', remoteReadback: '', appReadback: '', output: '',
  };
  parseRequiredValueOptions(argv, {
    '--expectation': (value) => { options.expectation = path.resolve(value); },
    '--candidate-receipt': (value) => { options.candidateReceipt = path.resolve(value); },
    '--promotion-receipt': (value) => { options.promotionReceipt = path.resolve(value); },
    '--attestation-readback': (value) => { options.attestationReadback = path.resolve(value); },
    '--release-manifest': (value) => { options.releaseManifest = path.resolve(value); },
    '--channel-manifest': (value) => { options.channelManifest = path.resolve(value); },
    '--remote-readback': (value) => { options.remoteReadback = path.resolve(value); },
    '--app-readback': (value) => { options.appReadback = path.resolve(value); },
    '--output': (value) => { options.output = path.resolve(value); },
  });
  if (!options.output) reject('missing_output', '--output is required.');
  return options;
}

function validateExpectation(value) {
  const expectation = record(value, 'expectation_invalid', 'Expectation');
  same(expectation.surface_kind, 'opl_package_latest_stable_expectation.v1', 'expectation_invalid', 'Expectation surface_kind');
  if (!['fixture', 'production'].includes(expectation.evidence_class)) {
    reject('expectation_invalid', 'Expectation evidence_class must be fixture or production.');
  }
  const baseline = record(expectation.baseline, 'expectation_invalid', 'Expectation baseline');
  if (!['resolved', 'not_found'].includes(baseline.status)) {
    reject('baseline_availability_unknown', 'Baseline must be resolved or explicitly not_found.');
  }
  if (baseline.status === 'resolved') {
    exactString(String(baseline.generation ?? ''), GENERATION_PATTERN, 'expectation_invalid', 'Baseline generation');
    exactString(String(baseline.carrier_digest ?? ''), DIGEST_PATTERN, 'expectation_invalid', 'Baseline carrier digest');
  } else if (baseline.generation !== null || baseline.carrier_digest !== null) {
    reject('expectation_invalid', 'Explicit not_found baseline must not claim a generation or digest.');
  }
  const candidate = record(expectation.candidate, 'expectation_invalid', 'Expectation candidate');
  exactString(String(candidate.generation ?? ''), GENERATION_PATTERN, 'expectation_invalid', 'Candidate generation');
  exactString(String(candidate.carrier_digest ?? ''), DIGEST_PATTERN, 'expectation_invalid', 'Candidate carrier digest');
  exactString(String(candidate.promotion_request_id ?? ''), REQUEST_PATTERN, 'expectation_invalid', 'Promotion request id');
  exactString(String(candidate.source_head_sha ?? ''), SHA_PATTERN, 'expectation_invalid', 'Candidate source head SHA');
  if (typeof candidate.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate.repository)) {
    reject('expectation_invalid', 'Candidate repository is invalid.');
  }
  if (baseline.status === 'resolved' && baseline.carrier_digest === candidate.carrier_digest) {
    reject('stable_channel_not_advanced', 'Candidate digest must differ from the frozen latest-stable baseline.');
  }
  const framework = record(expectation.framework, 'expectation_invalid', 'Expectation framework');
  if (typeof framework.version !== 'string' || !framework.version) reject('expectation_invalid', 'Framework version is required.');
  exactString(String(framework.source_commit ?? ''), SHA_PATTERN, 'expectation_invalid', 'Framework source commit');
  const app = record(expectation.app, 'expectation_invalid', 'Expectation App');
  exactString(String(app.version ?? ''), GENERATION_PATTERN, 'expectation_invalid', 'App version');
  exactString(String(app.source_commit ?? ''), SHA_PATTERN, 'expectation_invalid', 'App source commit');
  exactString(String(app.artifact_digest ?? ''), DIGEST_PATTERN, 'expectation_invalid', 'App artifact digest');
  exactKeys(expectation.packages, PACKAGE_IDS, 'incomplete_release_set', 'Expected Package versions');
  for (const packageId of PACKAGE_IDS) {
    if (typeof expectation.packages[packageId] !== 'string' || !expectation.packages[packageId]) {
      reject('expectation_invalid', `Expected Package version is invalid: ${packageId}`);
    }
  }
  return expectation;
}

function validateSourceCutoff(receipt, baseline, code) {
  const cutoff = record(receipt.source_cutoff, code, 'Receipt source_cutoff');
  same(cutoff.policy, 'single_read_at_freeze_admission', code, 'source_cutoff.policy');
  same(cutoff.later_authority_advancement_invalidates_receipt, false, code, 'source_cutoff advancement policy');
  if (baseline.status === 'not_found') {
    same(cutoff.frozen_base_release_set, null, code, 'Bootstrap source cutoff');
    return;
  }
  const frozen = record(cutoff.frozen_base_release_set, code, 'Frozen base Release Set');
  same(frozen.generation, baseline.generation, code, 'Frozen base generation');
  same(frozen.digest, baseline.carrier_digest, code, 'Frozen base digest');
}

function expectedChannelRefs(receipt, target) {
  const refs = [receipt.carrier.channel_ref];
  refs.push(`${stripTag(receipt.components.base.artifact_ref)}:${target}`);
  for (const packageId of PACKAGE_IDS) refs.push(`${stripTag(receipt.components.packages[packageId].artifact_ref)}:${target}`);
  return refs.sort();
}

function validateReceipt(value, target, expectation) {
  const code = target === 'candidate' ? 'candidate_receipt_invalid' : 'promotion_receipt_invalid';
  const receipt = record(value, code, `${target} receipt`);
  same(receipt.surface_kind, 'opl_release_set_promotion_receipt.v1', code, 'Receipt surface_kind');
  same(receipt.status, target === 'candidate' ? 'published_immutable_candidate' : 'promoted_latest_stable', code, 'Receipt status');
  same(receipt.promotion_target, target, code, 'Receipt target');
  same(receipt.promotion_request_id, expectation.candidate.promotion_request_id, code, 'Promotion request id');
  same(receipt.release_set_generation, expectation.candidate.generation, code, 'Release Set generation');
  const owner = expectation.candidate.repository.split('/')[0];
  const carrierBase = `ghcr.io/${owner}/one-person-lab-manifest`;
  same(receipt.carrier?.immutable_ref, `${carrierBase}:${expectation.candidate.generation}`, code, 'Carrier immutable ref');
  same(receipt.carrier?.digest, expectation.candidate.carrier_digest, code, 'Carrier digest');
  same(receipt.carrier?.channel_ref, `${carrierBase}:${target}`, code, 'Carrier channel ref');
  same(receipt.framework_run?.repository, expectation.candidate.repository, code, 'Framework run repository');
  exactString(String(receipt.framework_run?.run_id ?? ''), /^[1-9][0-9]*$/, code, 'Framework run id');
  exactString(String(receipt.framework_run?.run_attempt ?? ''), /^[1-9][0-9]*$/, code, 'Framework run attempt');
  validateSourceCutoff(receipt, expectation.baseline, code);
  const app = component(receipt.app, 'opl-app', code, 'App component');
  same(app.version, expectation.app.version, code, 'App version');
  same(app.source_commit, expectation.app.source_commit, code, 'App source commit');
  same(app.artifact_digest, expectation.app.artifact_digest, code, 'App artifact digest');
  appCarriers(app.carriers, code);
  const base = component(receipt.components?.base, 'opl-base', code, 'Base component');
  same(base.version, expectation.framework.version, code, 'Base version');
  same(base.source_commit, expectation.framework.source_commit, code, 'Base source commit');
  exactKeys(receipt.components?.packages, PACKAGE_IDS, 'incomplete_release_set', 'Receipt Packages');
  for (const packageId of PACKAGE_IDS) {
    const item = component(receipt.components.packages[packageId], packageId, code, `Package ${packageId}`);
    same(item.version, expectation.packages[packageId], code, `${packageId} version`);
  }
  same(receipt.anonymous_readback?.status, 'verified', code, 'Anonymous readback status');
  const refs = receipt.anonymous_readback?.verified_refs;
  if (!Array.isArray(refs) || refs.length !== 9 || new Set(refs).size !== 9) {
    reject('incomplete_release_set', 'Receipt anonymous readback must contain exactly nine refs.');
  }
  sameJson([...refs].sort(), expectedChannelRefs(receipt, target), code, 'Receipt verified refs');
  return receipt;
}

function validateReceipts(candidate, promotion) {
  same(promotion.carrier.digest, candidate.carrier.digest, 'promotion_identity_mismatch', 'Candidate/promotion carrier digest');
  same(promotion.release_set_generation, candidate.release_set_generation, 'promotion_identity_mismatch', 'Candidate/promotion generation');
  same(promotion.source_app_run_id ?? null, candidate.source_app_run_id ?? null, 'promotion_identity_mismatch', 'Candidate/promotion App run');
  sameJson(promotion.source_cutoff, candidate.source_cutoff, 'promotion_identity_mismatch', 'Candidate/promotion source cutoff');
  sameJson(promotion.app, candidate.app, 'promotion_identity_mismatch', 'Candidate/promotion App component');
  sameJson(promotion.components, candidate.components, 'promotion_identity_mismatch', 'Candidate/promotion components');
}

function immutableSubjects(receipt) {
  const subjects = {
    'opl-release-set': { ref: `${stripTag(receipt.carrier.immutable_ref)}@${receipt.carrier.digest}`, digest: receipt.carrier.digest },
    'opl-base': { ref: `${stripTag(receipt.components.base.artifact_ref)}@${receipt.components.base.artifact_digest}`, digest: receipt.components.base.artifact_digest },
  };
  for (const packageId of PACKAGE_IDS) {
    const item = receipt.components.packages[packageId];
    subjects[packageId] = { ref: `${stripTag(item.artifact_ref)}@${item.artifact_digest}`, digest: item.artifact_digest };
  }
  return subjects;
}

function validateAttestations(value, candidate, candidateDigest, expectation) {
  const attestation = record(value, 'attestation_invalid', 'Attestation readback');
  same(attestation.surface_kind, 'opl_release_set_attestation_readback.v1', 'attestation_invalid', 'Attestation surface_kind');
  same(attestation.status, 'verified', 'attestation_missing', 'Attestation status');
  same(attestation.source_run?.repository, expectation.candidate.repository, 'attestation_identity_mismatch', 'Attestation repository');
  same(attestation.source_run?.run_id, candidate.framework_run.run_id, 'attestation_identity_mismatch', 'Attestation run id');
  same(attestation.source_run?.run_attempt, candidate.framework_run.run_attempt, 'attestation_identity_mismatch', 'Attestation run attempt');
  same(attestation.source_run?.head_sha, expectation.candidate.source_head_sha, 'attestation_identity_mismatch', 'Attestation source SHA');
  same(attestation.source_run?.conclusion, 'success', 'attestation_missing', 'Attestation source run conclusion');
  same(attestation.artifact?.name, `opl-release-promotion-receipt-${candidate.promotion_request_id}-candidate`, 'attestation_identity_mismatch', 'Candidate artifact name');
  same(attestation.artifact?.receipt_sha256, candidateDigest, 'attestation_identity_mismatch', 'Candidate receipt digest');
  const expectedIdentity = `https://github.com/${expectation.candidate.repository}/.github/workflows/packages.yml@refs/heads/main`;
  exactKeys(attestation.subjects, REMOTE_IDS, 'incomplete_attestation_set', 'Attestation subjects');
  const expectedSubjects = immutableSubjects(candidate);
  for (const componentId of REMOTE_IDS) {
    const subject = record(attestation.subjects[componentId], 'attestation_invalid', `Attestation subject ${componentId}`);
    same(subject.ref, expectedSubjects[componentId].ref, 'attestation_identity_mismatch', `${componentId} attestation ref`);
    same(subject.digest, expectedSubjects[componentId].digest, 'attestation_identity_mismatch', `${componentId} attestation digest`);
    for (const kind of ['slsa_provenance', 'spdx_sbom']) {
      same(subject[kind]?.status, 'verified', 'attestation_missing', `${componentId} ${kind} status`);
      same(subject[kind]?.certificate_identity, expectedIdentity, 'attestation_identity_mismatch', `${componentId} ${kind} identity`);
      same(subject[kind]?.certificate_oidc_issuer, OIDC_ISSUER, 'attestation_identity_mismatch', `${componentId} ${kind} issuer`);
    }
  }
  return attestation;
}

function validateManifests(release, channel, candidate) {
  const releaseSet = record(release.release_set, 'release_manifest_invalid', 'Release Set');
  same(release.release_set_generation, candidate.release_set_generation, 'release_manifest_invalid', 'Release generation');
  same(releaseSet.surface_kind, 'opl_release_set.v2', 'release_manifest_invalid', 'Release Set surface_kind');
  same(releaseSet.generation, candidate.release_set_generation, 'release_manifest_invalid', 'Release Set generation');
  same(releaseSet.bom_status, 'complete', 'incomplete_release_set', 'Release Set BOM status');
  same(releaseSet.component_count, 9, 'incomplete_release_set', 'Release Set component count');
  sameJson([...(releaseSet.component_ids ?? [])].sort(), COMPONENT_IDS, 'incomplete_release_set', 'Release Set component ids');
  sameJson(channel.release_set, releaseSet, 'channel_manifest_mismatch', 'Channel Release Set');
  same(releaseSet.bom_digest, sha256(JSON.stringify(releaseSet.components)), 'release_manifest_digest_mismatch', 'Release Set BOM digest');
  const compareComponent = (actual, expected, componentId) => {
    const normalized = component(actual, componentId, 'release_manifest_identity_mismatch', `Release component ${componentId}`);
    for (const field of ['component_id', 'version', 'source_commit', 'artifact_ref', 'artifact_digest']) {
      same(normalized[field], expected[field], 'release_manifest_identity_mismatch', `${componentId}.${field}`);
    }
  };
  compareComponent(releaseSet.components.app, candidate.app, 'opl-app');
  appCarriers(releaseSet.components.app.carriers, 'release_manifest_identity_mismatch');
  sameJson(releaseSet.components.app.carriers, candidate.app.carriers, 'release_manifest_identity_mismatch', 'Release App carriers');
  compareComponent(releaseSet.components.base, candidate.components.base, 'opl-base');
  exactKeys(releaseSet.components.packages?.members, PACKAGE_IDS, 'incomplete_release_set', 'Release Package components');
  for (const packageId of PACKAGE_IDS) {
    compareComponent(releaseSet.components.packages.members[packageId], candidate.components.packages[packageId], packageId);
  }
  const catalog = record(channel.packages?.package_catalog, 'channel_manifest_invalid', 'Package catalog');
  exactKeys(catalog, PACKAGE_IDS, 'incomplete_release_set', 'Package catalog');
  for (const packageId of PACKAGE_IDS) {
    const entry = record(catalog[packageId], 'channel_manifest_invalid', `Catalog ${packageId}`);
    same(entry.selected_version, candidate.components.packages[packageId].version, 'channel_manifest_identity_mismatch', `${packageId} selected version`);
    const selected = Array.isArray(entry.versions)
      ? entry.versions.filter((item) => item?.selection_status === 'selected_for_release_set')
      : [];
    if (selected.length !== 1) reject('channel_manifest_invalid', `Catalog ${packageId} must have one selected version.`);
    same(selected[0].package_version, candidate.components.packages[packageId].version, 'channel_manifest_identity_mismatch', `${packageId} catalog version`);
    same(selected[0].source_artifact_ref, candidate.components.packages[packageId].artifact_ref, 'channel_manifest_identity_mismatch', `${packageId} artifact ref`);
    same(selected[0].artifact_digest, candidate.components.packages[packageId].artifact_digest, 'channel_manifest_identity_mismatch', `${packageId} artifact digest`);
    same(selected[0].artifact_status, 'published_immutable', 'channel_manifest_invalid', `${packageId} artifact status`);
  }
  const catalogDigest = sha256(JSON.stringify(catalog));
  same(channel.package_catalog_digest, catalogDigest, 'channel_manifest_digest_mismatch', 'Package catalog digest');
  return { releaseSet, catalogDigest };
}

function stableObservations(promotion) {
  const refs = {
    'opl-release-set': { ref: promotion.carrier.channel_ref, digest: promotion.carrier.digest },
    'opl-base': { ref: `${stripTag(promotion.components.base.artifact_ref)}:latest-stable`, digest: promotion.components.base.artifact_digest },
  };
  for (const packageId of PACKAGE_IDS) {
    const item = promotion.components.packages[packageId];
    refs[packageId] = { ref: `${stripTag(item.artifact_ref)}:latest-stable`, digest: item.artifact_digest };
  }
  return refs;
}

function validateRemoteReadback(value, promotion) {
  const readback = record(value, 'remote_readback_invalid', 'Remote readback');
  same(readback.surface_kind, 'opl_package_channel_remote_readback.v1', 'remote_readback_invalid', 'Remote readback surface_kind');
  same(readback.status, 'verified', 'remote_readback_invalid', 'Remote readback status');
  exactKeys(readback.observations, REMOTE_IDS, 'incomplete_remote_readback', 'Remote observations');
  const expected = stableObservations(promotion);
  for (const componentId of REMOTE_IDS) {
    const observation = record(readback.observations[componentId], 'remote_readback_invalid', `Remote observation ${componentId}`);
    if (observation.status === 'not_found') {
      reject('remote_not_found', `latest-stable is explicitly absent for ${componentId}.`, { component_id: componentId });
    }
    if (observation.status === 'unknown') {
      const kind = observation.failure_kind;
      if (!['network', 'authentication', 'authorization', 'invalid_response'].includes(kind)) {
        reject('remote_readback_invalid', `Unknown remote observation has an invalid failure kind: ${componentId}`);
      }
      reject('remote_availability_unknown', `latest-stable availability is unknown for ${componentId}.`, {
        component_id: componentId,
        failure_kind: kind,
      });
    }
    same(observation.status, 'resolved', 'remote_readback_invalid', `${componentId} observation status`);
    same(observation.ref, expected[componentId].ref, 'remote_identity_mismatch', `${componentId} latest-stable ref`);
    same(observation.digest, expected[componentId].digest, 'remote_digest_mismatch', `${componentId} latest-stable digest`);
  }
  return readback;
}

function validateAppReadback(value, promotion) {
  const packages = record(value.opl_agent_packages, 'app_readback_invalid', 'App Package readback');
  same(packages.surface_kind, 'opl_agent_package_readback', 'app_readback_invalid', 'App Package surface_kind');
  const directory = record(packages.directory, 'app_readback_invalid', 'App Package directory');
  const currentness = record(directory.first_party_release_currentness, 'app_readback_invalid', 'App release currentness');
  same(currentness.status, 'live', 'app_not_live_verified', 'App catalog freshness');
  same(currentness.live_verified, true, 'app_not_live_verified', 'App live verification');
  same(currentness.catalog_ref, promotion.carrier.channel_ref, 'app_catalog_identity_mismatch', 'App catalog ref');
  same(currentness.catalog_digest, promotion.carrier.digest, 'app_catalog_digest_mismatch', 'App catalog digest');
  if (!Array.isArray(directory.entries)) reject('app_readback_invalid', 'App Package directory entries are required.');
  for (const packageId of PACKAGE_IDS) {
    const matches = directory.entries.filter((item) => item?.package_id === packageId);
    if (matches.length !== 1) reject('incomplete_app_package_set', `App readback must contain Package ${packageId} exactly once.`);
    const entry = matches[0];
    const expected = promotion.components.packages[packageId];
    same(entry.source_kind, 'first_party_release_catalog', 'app_not_live_verified', `${packageId} source kind`);
    same(entry.selected_version, expected.version, 'app_package_identity_mismatch', `${packageId} selected version`);
    same(entry.stable_version, expected.version, 'app_package_identity_mismatch', `${packageId} stable version`);
    same(entry.version_currentness?.status, 'live_release_set', 'app_not_live_verified', `${packageId} currentness status`);
    same(entry.version_currentness?.live_verified, true, 'app_not_live_verified', `${packageId} live verification`);
    same(entry.version_currentness?.source_digest, promotion.carrier.digest, 'app_catalog_digest_mismatch', `${packageId} catalog digest`);
    same(entry.release_target?.package_version, expected.version, 'app_package_identity_mismatch', `${packageId} release target version`);
    same(entry.release_target?.artifact_digest, expected.artifact_digest, 'app_package_digest_mismatch', `${packageId} release target digest`);
  }
  return currentness;
}

function compactComponents(receipt) {
  const compact = (item) => ({
    component_id: item.component_id,
    version: item.version,
    source_commit: item.source_commit,
    artifact_ref: item.artifact_ref,
    artifact_digest: item.artifact_digest,
  });
  return {
    app: compact(receipt.app),
    base: compact(receipt.components.base),
    packages: Object.fromEntries(PACKAGE_IDS.map((packageId) => [packageId, compact(receipt.components.packages[packageId])])),
  };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const expectationEvidence = readEvidence(options.expectation, 'missing_expectation', 'expectation_invalid', 'Expectation');
  const candidateEvidence = readEvidence(options.candidateReceipt, 'missing_candidate_receipt', 'candidate_receipt_invalid', 'Candidate receipt');
  const promotionEvidence = readEvidence(options.promotionReceipt, 'missing_promotion_receipt', 'promotion_receipt_invalid', 'Promotion receipt');
  const attestationEvidence = readEvidence(options.attestationReadback, 'missing_attestation', 'attestation_invalid', 'Attestation readback');
  const releaseEvidence = readEvidence(options.releaseManifest, 'missing_release_manifest', 'release_manifest_invalid', 'Release manifest');
  const channelEvidence = readEvidence(options.channelManifest, 'missing_channel_manifest', 'channel_manifest_invalid', 'Channel manifest');
  const remoteEvidence = readEvidence(options.remoteReadback, 'missing_remote_readback', 'remote_readback_invalid', 'Remote readback');
  const appEvidence = readEvidence(options.appReadback, 'missing_app_readback', 'app_readback_invalid', 'App readback');

  const expectation = validateExpectation(expectationEvidence.value);
  const candidate = validateReceipt(candidateEvidence.value, 'candidate', expectation);
  const promotion = validateReceipt(promotionEvidence.value, 'latest-stable', expectation);
  validateReceipts(candidate, promotion);
  validateAttestations(attestationEvidence.value, candidate, candidateEvidence.digest, expectation);
  const { releaseSet, catalogDigest } = validateManifests(releaseEvidence.value, channelEvidence.value, candidate);
  validateRemoteReadback(remoteEvidence.value, promotion);
  const appCurrentness = validateAppReadback(appEvidence.value, promotion);

  const capsule = {
    surface_kind: 'opl_package_latest_stable_verification_capsule.v1',
    status: 'verified',
    evidence_class: expectation.evidence_class,
    baseline: {
      status: expectation.baseline.status,
      generation: expectation.baseline.generation,
      carrier_digest: expectation.baseline.carrier_digest,
    },
    release_set: {
      generation: candidate.release_set_generation,
      immutable_ref: candidate.carrier.immutable_ref,
      carrier_digest: candidate.carrier.digest,
      bom_digest: releaseSet.bom_digest,
      package_catalog_digest: catalogDigest,
      promotion_request_id: candidate.promotion_request_id,
    },
    evidence_digests: {
      expectation: expectationEvidence.digest,
      candidate_receipt: candidateEvidence.digest,
      promotion_receipt: promotionEvidence.digest,
      attestation_readback: attestationEvidence.digest,
      release_manifest: releaseEvidence.digest,
      channel_manifest: channelEvidence.digest,
      remote_readback: remoteEvidence.digest,
      app_readback: appEvidence.digest,
    },
    components: compactComponents(promotion),
    app_consumption: {
      live_verified: appCurrentness.live_verified,
      catalog_ref: appCurrentness.catalog_ref,
      catalog_digest: appCurrentness.catalog_digest,
    },
    verified_invariants: [
      'candidate_receipt_exact_identity',
      'nine_subject_dual_attestation',
      'promotion_receipt_exact_identity',
      'complete_nine_component_release_set',
      'nine_latest_stable_digests',
      'catalog_manifest_digest_closure',
      'app_live_catalog_consumption',
    ],
  };
  const bytes = Buffer.from(`${JSON.stringify(capsule, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, bytes);
  process.stdout.write(`${JSON.stringify({
    status: 'verified',
    output: options.output,
    capsule_sha256: sha256(bytes),
    release_set_generation: capsule.release_set.generation,
    carrier_digest: capsule.release_set.carrier_digest,
  })}\n`);
}

try {
  main();
} catch (error) {
  const failure = error instanceof VerificationError
    ? error
    : new VerificationError('verifier_internal_error', error instanceof Error ? error.message : String(error));
  process.stderr.write(`${JSON.stringify({
    surface_kind: 'opl_package_latest_stable_verification_failure.v1',
    status: 'rejected',
    code: failure.code,
    message: failure.message,
    details: failure.details,
  })}\n`);
  process.exit(1);
}
