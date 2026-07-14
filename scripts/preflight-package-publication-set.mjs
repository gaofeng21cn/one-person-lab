#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { readJsonFile } from './script-json-boundary.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

function parseOptions(argv) {
  const options = {
    root: '',
    owner: '',
    sourceUrl: '',
    harnessSha: '',
    report: '',
    preflightScript: path.join(scriptRoot, 'oci-publication-preflight.mjs'),
  };
  parseRequiredValueOptions(argv, {
    '--root': (value) => { options.root = path.resolve(value); },
    '--owner': (value) => { options.owner = value.trim(); },
    '--source-url': (value) => { options.sourceUrl = value.trim(); },
    '--harness-sha': (value) => { options.harnessSha = value.trim(); },
    '--report': (value) => { options.report = path.resolve(value); },
    '--preflight-script': (value) => { options.preflightScript = path.resolve(value); },
  });
  if (!options.root || !options.owner || !options.sourceUrl || !options.harnessSha) {
    throw new Error('Usage: preflight-package-publication-set.mjs --root <dist/opl-packages> --owner <owner> --source-url <url> --harness-sha <sha> [--report <path>]');
  }
  if (!/^[0-9a-f]{40}$/.test(options.harnessSha)) {
    throw new Error('--harness-sha must be one exact lowercase 40-character Git SHA.');
  }
  return options;
}

function objectValue(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function stringValue(value, field, pattern = null) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || (pattern && !pattern.test(normalized))) {
    throw new Error(`${field} is invalid.`);
  }
  return normalized;
}

function ownedArtifactRef(value, field, owner) {
  const ref = stringValue(value, field);
  const expectedPrefix = `ghcr.io/${owner.toLowerCase()}/`;
  if (!ref.toLowerCase().startsWith(expectedPrefix)) {
    throw new Error(`${field} must belong to ${expectedPrefix}.`);
  }
  return ref;
}

function runPreflight(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() || `preflight exited ${result.status}`,
    };
  }
  return { ok: true, value: JSON.parse(result.stdout) };
}

function packageArgs(options, packageId, packageVersion, artifactRef) {
  const packageRoot = path.join(options.root, 'packages', packageId);
  return [
    '--ref', artifactRef,
    '--artifact-type', 'application/vnd.onepersonlab.package.v1',
    '--source-url', options.sourceUrl,
    '--layer', `${path.join(packageRoot, `${packageId}-${packageVersion}.tar.gz`)}=application/vnd.onepersonlab.package.source.v1+gzip`,
    '--layer', `${path.join(packageRoot, 'package-manifest.json')}=application/vnd.onepersonlab.package.manifest.v1+json`,
    '--layer', `${path.join(packageRoot, 'payload-manifest.json')}=application/vnd.onepersonlab.package.payload.v1+json`,
  ];
}

function componentResult(identity, preflight) {
  if (!preflight.ok) {
    return { ...identity, status: 'conflict', action: 'reject', digest: null, error: preflight.error };
  }
  return {
    ...identity,
    status: preflight.value.status,
    action: preflight.value.action,
    digest: preflight.value.digest,
    error: null,
  };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const manifest = readJsonFile(path.join(options.root, 'opl-release-manifest.json'));
  const releaseSet = objectValue(manifest.release_set, 'release_set');
  const components = objectValue(releaseSet.components, 'release_set.components');
  const packages = objectValue(
    objectValue(components.packages, 'release_set.components.packages').members,
    'release_set.components.packages.members',
  );
  const results = [];

  for (const [packageId, rawMember] of Object.entries(packages).sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    const member = objectValue(rawMember, `release_set.components.packages.members.${packageId}`);
    const packageVersion = stringValue(member.package_version ?? member.version, `${packageId}.package_version`);
    const artifactRef = ownedArtifactRef(
      member.artifact_ref ?? member.oci_artifact_ref,
      `${packageId}.artifact_ref`,
      options.owner,
    );
    const ownerSourceCommit = stringValue(member.owner_source_commit, `${packageId}.owner_source_commit`, /^[0-9a-f]{40}$/);
    results.push(componentResult({
      component_id: packageId,
      component_kind: 'package',
      version: packageVersion,
      source_commit: ownerSourceCommit,
      ref: artifactRef,
    }, runPreflight(options.preflightScript, packageArgs(options, packageId, packageVersion, artifactRef))));
  }

  const base = objectValue(components.base, 'release_set.components.base');
  const baseVersion = stringValue(base.version, 'release_set.components.base.version');
  const baseRef = ownedArtifactRef(
    base.artifact_ref,
    'release_set.components.base.artifact_ref',
    options.owner,
  );
  const baseSourceCommit = stringValue(base.source_commit, 'release_set.components.base.source_commit', /^[0-9a-f]{40}$/);
  results.push(componentResult({
    component_id: 'opl-base',
    component_kind: 'base',
    version: baseVersion,
    source_commit: baseSourceCommit,
    ref: baseRef,
  }, runPreflight(options.preflightScript, [
    '--ref', baseRef,
    '--artifact-type', 'application/vnd.onepersonlab.framework.source.v1',
    '--source-url', options.sourceUrl,
    '--layer', `${path.join(options.root, 'framework', `one-person-lab-framework-${baseVersion}.tar.gz`)}=application/vnd.onepersonlab.framework.source.v1+gzip`,
  ])));

  const app = objectValue(components.app, 'release_set.components.app');
  const conflicts = results.filter((entry) => entry.status === 'conflict');
  const report = {
    surface_kind: 'opl_package_publication_preflight_report.v1',
    generated_at: new Date().toISOString(),
    status: conflicts.length === 0 ? 'passed' : 'failed',
    release_set_generation: stringValue(manifest.release_set_generation, 'release_set_generation'),
    harness_sha: options.harnessSha,
    source_url: options.sourceUrl,
    framework_source_commit: baseSourceCommit,
    app: {
      version: stringValue(app.version, 'release_set.components.app.version'),
      source_commit: stringValue(app.source_commit, 'release_set.components.app.source_commit', /^[0-9a-f]{40}$/),
      artifact_digest: stringValue(app.artifact_digest, 'release_set.components.app.artifact_digest', /^sha256:[0-9a-f]{64}$/),
    },
    owner_cohort_lock: releaseSet.owner_cohort_lock ?? null,
    summary: {
      component_count: results.length,
      reuse_count: results.filter((entry) => entry.action === 'reuse').length,
      publish_count: results.filter((entry) => entry.action === 'publish').length,
      conflict_count: conflicts.length,
    },
    components: results,
  };
  const source = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) {
    fs.mkdirSync(path.dirname(options.report), { recursive: true });
    fs.writeFileSync(options.report, source, 'utf8');
  }
  process.stdout.write(source);
  if (conflicts.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
