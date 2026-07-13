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
    component_manifest_ref: `opl+github-release://${options.repo}/${tag}`,
  };
  if (options.ownerManifest) {
    const owner = readJsonFile(options.ownerManifest);
    for (const field of ['surface_kind', 'component_id', 'version', 'source_commit', 'release_tag']) {
      if (owner[field] !== projectedCore[field]) throw new Error(`OPL App owner manifest ${field} does not match release readback`);
    }
    if (JSON.stringify(owner.primary_artifact) !== JSON.stringify(primary)
      || JSON.stringify(owner.artifacts) !== JSON.stringify(artifacts)
      || !/^sha256:[0-9a-f]{64}$/.test(owner.component_manifest_digest ?? '')) {
      throw new Error('OPL App owner manifest artifact lock does not match release readback');
    }
    return { ...owner, release_status: release.isDraft ? 'draft' : 'published' };
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
