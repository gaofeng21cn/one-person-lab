#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

function parseOptions(argv) {
  const options = { releaseJson: '', sourceCommit: '', output: '', ownerManifest: '', repo: 'gaofeng21cn/one-person-lab-app' };
  parseRequiredValueOptions(argv, {
    '--release-json': (value) => { options.releaseJson = path.resolve(value); },
    '--source-commit': (value) => { options.sourceCommit = value.trim(); },
    '--output': (value) => { options.output = path.resolve(value); },
    '--owner-manifest': (value) => { options.ownerManifest = path.resolve(value); },
    '--repo': (value) => { options.repo = value.trim(); },
  });
  if (!options.releaseJson || !options.output || !/^[0-9a-f]{40}$/.test(options.sourceCommit)) {
    throw new Error('Usage: resolve-opl-app-component.mjs --release-json <json> --source-commit <sha> --output <json> [--repo <owner/repo>]');
  }
  return options;
}

function sha256Payload(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normalizeArtifact(asset) {
  const digest = typeof asset?.digest === 'string' ? asset.digest.trim() : '';
  const ref = typeof asset?.url === 'string' ? asset.url.trim() : '';
  const name = typeof asset?.name === 'string' ? asset.name.trim() : '';
  if (!name || !ref || !/^sha256:[0-9a-f]{64}$/.test(digest) || !Number.isFinite(asset?.size) || asset.size <= 0) {
    throw new Error(`OPL App release asset is not immutable: ${name || 'unnamed'}`);
  }
  return {
    name,
    ref,
    digest,
    size: asset.size,
    content_type: typeof asset.contentType === 'string' ? asset.contentType : 'application/octet-stream',
  };
}

function releaseLocator(ref, repo, kind, assetName = '') {
  let url;
  try {
    url = new URL(ref);
  } catch {
    throw new Error(`OPL App release ${kind} ref is not a URL`);
  }
  const prefix = `/${repo}/releases/${kind}/`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.search || url.hash
    || !url.pathname.startsWith(prefix)) {
    throw new Error(`OPL App release ${kind} ref does not bind the exact repository`);
  }
  const remainder = url.pathname.slice(prefix.length);
  if (kind === 'tag') {
    if (!remainder || remainder.includes('/')) throw new Error('OPL App release tag ref is malformed');
    return decodeURIComponent(remainder);
  }
  const separator = remainder.indexOf('/');
  const locator = separator < 0 ? '' : decodeURIComponent(remainder.slice(0, separator));
  const name = separator < 0 ? '' : decodeURIComponent(remainder.slice(separator + 1));
  if (!locator || name !== assetName) throw new Error(`OPL App release asset ref does not bind ${assetName}`);
  return locator;
}

function immutableArtifactLock(artifact) {
  return {
    name: artifact?.name,
    digest: artifact?.digest,
    size: artifact?.size,
    content_type: artifact?.content_type,
  };
}

function buildComponent(options) {
  const release = readJsonFile(options.releaseJson);
  const tag = typeof release.tagName === 'string' ? release.tagName.trim() : '';
  const version = tag.replace(/^v/, '');
  if (!/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(version) || release.isPrerelease) {
    throw new Error(`OPL App component must be a stable CalVer release, got: ${tag || 'missing'}`);
  }
  const standardAssetNames = new Set([
    'latest-arm64-mac.yml',
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    'standard-local-authorization-policy.json',
  ]);
  const artifacts = (Array.isArray(release.assets) ? release.assets : [])
    .filter((asset) => standardAssetNames.has(asset?.name))
    .map(normalizeArtifact)
    .sort((left, right) => left.name.localeCompare(right.name));
  const primary = artifacts.find((asset) => asset.name === `One-Person-Lab-${version}-mac-arm64.dmg`);
  if (!primary) throw new Error(`OPL App ${version} has no canonical mac-arm64 DMG`);
  if (artifacts.length !== standardAssetNames.size) throw new Error(`OPL App ${version} is missing standard release assets`);
  const projectedCore = {
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version,
    source_commit: options.sourceCommit,
    release_tag: tag,
    release_url: String(release.url ?? ''),
    primary_artifact: primary,
    artifacts,
    component_manifest_ref: `https://github.com/${options.repo}/releases/download/${tag}/opl-app-component-manifest.json`,
  };
  if (options.ownerManifest) {
    const owner = readJsonFile(options.ownerManifest);
    for (const field of ['surface_kind', 'component_id', 'version', 'source_commit', 'release_tag']) {
      if (owner[field] !== projectedCore[field]) throw new Error(`OPL App owner manifest ${field} does not match release readback`);
    }
    const ownerCore = {
      surface_kind: owner.surface_kind,
      component_id: owner.component_id,
      version: owner.version,
      source_commit: owner.source_commit,
      release_tag: owner.release_tag,
      release_url: owner.release_url,
      primary_artifact: owner.primary_artifact,
      artifacts: owner.artifacts,
      component_manifest_ref: owner.component_manifest_ref,
    };
    if (owner.component_manifest_digest !== sha256Payload(JSON.stringify(ownerCore))) {
      throw new Error('OPL App owner manifest digest does not bind its exact core');
    }
    const publicLocator = releaseLocator(projectedCore.release_url, options.repo, 'tag');
    const ownerLocator = releaseLocator(owner.release_url, options.repo, 'tag');
    if (publicLocator !== tag || (ownerLocator !== tag && !/^untagged-[0-9a-f]+$/.test(ownerLocator))) {
      throw new Error('OPL App owner manifest release locator is not the canonical tag or its Draft alias');
    }
    if (releaseLocator(owner.component_manifest_ref, options.repo, 'download', 'opl-app-component-manifest.json') !== tag) {
      throw new Error('OPL App owner component manifest ref is not canonical');
    }
    const ownerArtifacts = Array.isArray(owner.artifacts) ? owner.artifacts : [];
    const ownerByName = new Map(ownerArtifacts.map((artifact) => [artifact?.name, artifact]));
    if (ownerArtifacts.length !== artifacts.length || ownerByName.size !== artifacts.length
      || JSON.stringify(immutableArtifactLock(owner.primary_artifact)) !== JSON.stringify(immutableArtifactLock(primary))
      || releaseLocator(owner.primary_artifact?.ref, options.repo, 'download', primary.name) !== ownerLocator) {
      throw new Error('OPL App owner manifest artifact lock does not match release readback');
    }
    for (const artifact of artifacts) {
      const owned = ownerByName.get(artifact.name);
      if (JSON.stringify(immutableArtifactLock(owned)) !== JSON.stringify(immutableArtifactLock(artifact))
        || releaseLocator(owned?.ref, options.repo, 'download', artifact.name) !== ownerLocator
        || releaseLocator(artifact.ref, options.repo, 'download', artifact.name) !== tag) {
        throw new Error('OPL App owner manifest artifact lock does not match release readback');
      }
    }
    return {
      ...projectedCore,
      release_status: release.isDraft ? 'draft' : 'published',
      component_manifest_digest: sha256Payload(JSON.stringify(projectedCore)),
    };
  }
  return {
    ...projectedCore,
    release_status: release.isDraft ? 'draft' : 'published',
    component_manifest_digest: sha256Payload(JSON.stringify(projectedCore)),
  };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const component = buildComponent(options);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'resolved',
    version: component.version,
    release_status: component.release_status,
    component_manifest_digest: component.component_manifest_digest,
    output: options.output,
  }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
