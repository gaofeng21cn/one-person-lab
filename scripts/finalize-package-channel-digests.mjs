#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonFile } from './script-json-boundary.mjs';

function sha256Payload(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parseOptions(argv) {
  const options = { releaseManifest: '', channelManifest: '', packageId: '', digest: '', check: false };
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
    else if (token === '--digest') options.digest = value;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.releaseManifest || !options.channelManifest) {
    throw new Error('--release-manifest and --channel-manifest are required');
  }
  if (!options.check && (!options.packageId || !options.digest)) {
    throw new Error('--package-id and --digest are required unless --check is used');
  }
  return options;
}

function promotedVersion(channel, packageId) {
  const entry = channel.packages?.package_catalog?.[packageId];
  const version = entry?.versions?.find((candidate) => candidate?.promotion_status === 'promoted');
  if (!entry || !version) throw new Error(`Package catalog has no promoted version: ${packageId}`);
  return version;
}

function assertFinalized(channel) {
  const failures = [];
  for (const [packageId, entry] of Object.entries(channel.packages?.package_catalog ?? {})) {
    const version = entry?.versions?.find((candidate) => candidate?.promotion_status === 'promoted');
    if (!version || version.artifact_status !== 'published_immutable' || !/^sha256:[0-9a-f]{64}$/.test(version.artifact_digest ?? '')) {
      failures.push(packageId);
    }
  }
  if (failures.length > 0) throw new Error(`Package catalog has unfinalized promoted versions: ${failures.join(', ')}`);
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const release = readJsonFile(options.releaseManifest);
  const channel = readJsonFile(options.channelManifest);
  if (!options.check) {
    if (!/^sha256:[0-9a-f]{64}$/.test(options.digest)) throw new Error(`Invalid OCI digest: ${options.digest}`);
    const packageEntry = Object.values(release.packages?.package_artifacts ?? {})
      .find((entry) => entry?.package_id === options.packageId);
    if (!packageEntry) throw new Error(`Release manifest has no package: ${options.packageId}`);
    const version = promotedVersion(channel, options.packageId);
    const archiveDigest = packageEntry.source_archive?.sha256;
    if (!archiveDigest || version.package_content_digest !== `sha256:${archiveDigest}`) {
      throw new Error(`${options.packageId}: source archive digest does not match catalog package content digest`);
    }
    packageEntry.oci_artifact_digest = options.digest;
    packageEntry.oci_artifact_status = 'published_immutable';
    version.artifact_digest = options.digest;
    version.artifact_status = 'published_immutable';
    writeJson(options.releaseManifest, release);
  }
  if (options.check) assertFinalized(channel);
  channel.package_catalog_digest = sha256Payload(JSON.stringify(channel.packages.package_catalog));
  writeJson(options.channelManifest, channel);
  console.log(JSON.stringify({
    status: options.check ? 'verified' : 'finalized',
    package_id: options.packageId || null,
    package_catalog_digest: channel.package_catalog_digest,
  }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
