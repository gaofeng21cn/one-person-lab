#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonFile } from './script-json-boundary.mjs';

const CANONICAL_PACKAGE_IDS = ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'];

function sha256Payload(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parseOptions(argv) {
  const options = { releaseManifest: '', channelManifest: '', packageId: '', componentId: '', digest: '', check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') {
      options.check = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    index += 1;
    if (token === '--release-manifest') options.releaseManifest = path.resolve(value);
    else if (token === '--channel-manifest') options.channelManifest = path.resolve(value);
    else if (token === '--package-id') options.packageId = value;
    else if (token === '--component-id') options.componentId = value;
    else if (token === '--digest') options.digest = value;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.releaseManifest || !options.channelManifest) {
    throw new Error('--release-manifest and --channel-manifest are required');
  }
  if (!options.check && ((!options.packageId && !options.componentId) || (options.packageId && options.componentId) || !options.digest)) {
    throw new Error('Exactly one of --package-id or --component-id plus --digest is required unless --check is used');
  }
  return options;
}

function selectedVersion(channel, packageId) {
  const entry = channel.packages?.package_catalog?.[packageId];
  const version = entry?.versions?.find((candidate) => candidate?.selection_status === 'selected_for_release_set');
  if (!entry || !version) throw new Error(`Package catalog has no selected Release Set version: ${packageId}`);
  return version;
}

function resolvePromotionTarget(release) {
  const target = process.env.OPL_PACKAGE_PROMOTION_TARGET?.trim()
    || 'candidate';
  if (!['candidate', 'latest-stable'].includes(target)) {
    throw new Error(`Invalid Package promotion target: ${target}`);
  }
  return target;
}

function assertFinalized(release, channel) {
  const failures = [];
  const catalog = channel.packages?.package_catalog ?? {};
  const catalogIds = Object.keys(catalog).sort();
  if (JSON.stringify(catalogIds) !== JSON.stringify([...CANONICAL_PACKAGE_IDS].sort())) {
    failures.push(`catalog ids=${catalogIds.join(',')}`);
  }
  if (release.release_set_generation !== release.release_set?.generation
    || release.release_set?.surface_kind !== 'opl_release_set.v2') {
    failures.push('release_set_generation');
  }
  if (release.release_channel !== undefined
    || channel.release_channel !== undefined
    || release.release_set?.target_channel !== undefined
    || release.release_set?.bom_status !== 'complete'
    || channel.release_set?.bom_status !== 'complete') {
    failures.push('release_set_channel_state');
  }
  if (JSON.stringify(channel.release_set) !== JSON.stringify(release.release_set)) {
    failures.push('channel_release_set');
  }
  for (const packageId of CANONICAL_PACKAGE_IDS) {
    const entry = catalog[packageId];
    const version = entry?.versions?.find((candidate) => candidate?.selection_status === 'selected_for_release_set');
    const packageEntry = release.packages?.package_artifacts?.[packageId];
    const channelPackageEntry = channel.packages?.package_artifacts?.[packageId];
    const member = release.release_set?.components?.packages?.members?.[packageId];
    const digest = version?.artifact_digest ?? '';
    if (!version
      || version.artifact_status !== 'published_immutable'
      || !/^sha256:[0-9a-f]{64}$/.test(digest)
      || packageEntry?.package_version !== version.package_version
      || packageEntry?.owner_source_commit !== version.owner_source_commit
      || packageEntry?.oci_artifact_digest !== digest
      || packageEntry?.oci_artifact_status !== 'published_immutable'
      || channelPackageEntry?.package_version !== version.package_version
      || channelPackageEntry?.owner_source_commit !== version.owner_source_commit
      || channelPackageEntry?.oci_artifact_digest !== digest
      || channelPackageEntry?.oci_artifact_status !== 'published_immutable'
      || member?.package_version !== version.package_version
      || member?.owner_source_commit !== version.owner_source_commit
      || member?.oci_artifact_digest !== digest
      || member?.artifact_digest !== digest
      || member?.artifact_status !== 'published_immutable') {
      failures.push(packageId);
    }
  }
  if (release.release_set?.component_count !== CANONICAL_PACKAGE_IDS.length + 2
    || release.release_set?.components?.packages?.package_count !== CANONICAL_PACKAGE_IDS.length
    || Object.keys(release.release_set?.components?.packages?.members ?? {}).length !== CANONICAL_PACKAGE_IDS.length) {
    failures.push('release_set_member_count');
  }
  const base = release.release_set?.components?.base;
  if (base?.component_id !== 'opl-base'
    || base?.version !== release.packages?.framework_core?.version
    || base?.source_commit !== release.packages?.framework_core?.source_git?.head_sha
    || base?.artifact_ref !== release.packages?.framework_core?.artifact
    || base?.artifact_status !== 'published_immutable'
    || !/^sha256:[0-9a-f]{64}$/.test(base?.artifact_digest ?? '')) {
    failures.push('opl-base');
  }
  const app = release.release_set?.components?.app;
  if (app?.component_id !== 'opl-app'
    || !/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(app?.version ?? '')
    || !/^[0-9a-f]{40}$/.test(app?.source_commit ?? '')
    || app?.artifact_status !== 'published_immutable'
    || !/^sha256:[0-9a-f]{64}$/.test(app?.artifact_digest ?? '')
    || (resolvePromotionTarget(release) === 'latest-stable' && app?.release_status !== 'published')) {
    failures.push('opl-app');
  }
  const expectedBomDigest = sha256Payload(JSON.stringify(release.release_set?.components));
  if (release.release_set?.bom_digest !== expectedBomDigest) failures.push('bom_digest');
  if (failures.length > 0) throw new Error(`Release Set BOM is incomplete or inconsistent: ${failures.join(', ')}`);
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const release = readJsonFile(options.releaseManifest);
  const channel = readJsonFile(options.channelManifest);
  if (!options.check && options.packageId) {
    if (!/^sha256:[0-9a-f]{64}$/.test(options.digest)) throw new Error(`Invalid OCI digest: ${options.digest}`);
    const packageEntry = Object.values(release.packages?.package_artifacts ?? {})
      .find((entry) => entry?.package_id === options.packageId);
    if (!packageEntry) throw new Error(`Release manifest has no package: ${options.packageId}`);
    const version = selectedVersion(channel, options.packageId);
    const archiveDigest = packageEntry.source_archive?.sha256;
    if (!archiveDigest || version.package_content_digest !== `sha256:${archiveDigest}`) {
      throw new Error(`${options.packageId}: source archive digest does not match catalog package content digest`);
    }
    packageEntry.oci_artifact_digest = options.digest;
    packageEntry.oci_artifact_status = 'published_immutable';
    packageEntry.remote_publish_status = 'verified_published_immutable';
    version.artifact_digest = options.digest;
    version.artifact_status = 'published_immutable';
    const member = release.release_set?.components?.packages?.members?.[options.packageId];
    if (!member) throw new Error(`Release Set has no member: ${options.packageId}`);
    member.oci_artifact_digest = options.digest;
    member.artifact_digest = options.digest;
    member.artifact_status = 'published_immutable';
  } else if (!options.check && options.componentId) {
    if (options.componentId !== 'opl-base') throw new Error(`Unsupported component id: ${options.componentId}`);
    const base = release.release_set?.components?.base;
    if (!base) throw new Error('Release Set has no OPL Base component');
    base.artifact_digest = options.digest;
    base.artifact_status = 'published_immutable';
    release.packages.framework_core.artifact_digest = options.digest;
    release.packages.framework_core.artifact_status = 'published_immutable';
  }
  const packageComplete = Object.values(release.release_set?.components?.packages?.members ?? {}).every((member) => (
    member?.artifact_status === 'published_immutable'
    && /^sha256:[0-9a-f]{64}$/.test(member?.artifact_digest ?? '')
    && /^[0-9a-f]{40}$/.test(member?.owner_source_commit ?? '')
  ));
  const base = release.release_set?.components?.base;
  const app = release.release_set?.components?.app;
  const complete = packageComplete
    && base?.artifact_status === 'published_immutable'
    && /^sha256:[0-9a-f]{64}$/.test(base?.artifact_digest ?? '')
    && /^[0-9a-f]{40}$/.test(base?.source_commit ?? '')
    && app?.artifact_status === 'published_immutable'
    && /^sha256:[0-9a-f]{64}$/.test(app?.artifact_digest ?? '')
    && /^[0-9a-f]{40}$/.test(app?.source_commit ?? '');
  release.release_set.bom_status = complete ? 'complete' : 'pending_remote_verification';
  release.release_set.bom_digest = complete
    ? sha256Payload(JSON.stringify(release.release_set.components))
    : null;
  channel.release_set = structuredClone(release.release_set);
  channel.packages.package_artifacts = structuredClone(release.packages.package_artifacts);
  channel.packages.framework_core = structuredClone(release.packages.framework_core);
  if (options.check) assertFinalized(release, channel);
  channel.package_catalog_digest = sha256Payload(JSON.stringify(channel.packages.package_catalog));
  writeJson(options.releaseManifest, release);
  writeJson(options.channelManifest, channel);
  console.log(JSON.stringify({
    status: options.check ? 'verified' : 'finalized',
    package_id: options.packageId || null,
    component_id: options.componentId || null,
    package_catalog_digest: channel.package_catalog_digest,
  }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
