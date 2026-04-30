#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const parsed = {
    manifest: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--manifest') {
      parsed.manifest = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!parsed.manifest) {
    throw new Error('Usage: package-release-discipline.mjs --manifest <opl-release-manifest.json>');
  }

  return parsed;
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isGitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function validateModule(moduleId, entry, failures) {
  assertCondition(entry.current_install_update_source === 'git_checkout', `${moduleId}: current source must remain git_checkout until install/update consumes packages`, failures);
  assertCondition(entry.package_consumption_status === 'defined_not_consumed_by_install_update', `${moduleId}: package consumption status drifted`, failures);
  assertCondition(entry.release_discipline?.current_latest_source === 'git_checkout_upstream_default_branch', `${moduleId}: missing current latest source discipline`, failures);
  assertCondition(Array.isArray(entry.release_discipline?.required_gates), `${moduleId}: missing required release gates`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('sha256_recorded'), `${moduleId}: release gates must require sha256`, failures);
  assertCondition(entry.release_discipline?.required_gates?.includes('channel_manifest_written'), `${moduleId}: release gates must require channel manifest`, failures);

  if (entry.source_archive) {
    assertCondition(typeof entry.source_archive.file_name === 'string', `${moduleId}: source archive missing file name`, failures);
    assertCondition(Number.isFinite(entry.source_archive.size) && entry.source_archive.size > 0, `${moduleId}: source archive size is invalid`, failures);
    assertCondition(isSha256(entry.source_archive.sha256), `${moduleId}: source archive sha256 is invalid`, failures);
  }

  if (entry.checksum) {
    assertCondition(entry.checksum.algorithm === 'sha256', `${moduleId}: checksum algorithm must be sha256`, failures);
    assertCondition(isSha256(entry.checksum.value), `${moduleId}: checksum value is invalid`, failures);
    assertCondition(entry.checksum.file === 'SHA256SUMS', `${moduleId}: checksum must be recorded in SHA256SUMS`, failures);
  }

  if (entry.source_git) {
    assertCondition(isGitSha(entry.source_git.head_sha), `${moduleId}: source git head sha is invalid`, failures);
    assertCondition(typeof entry.source_git.repo_url === 'string' && entry.source_git.repo_url.length > 0, `${moduleId}: source git repo url missing`, failures);
  }
}

function validateManifest(manifest) {
  const failures = [];
  const automation = manifest.release_automation;

  assertCondition(manifest.module_install_update_source === 'git_checkout', 'module install/update source must remain git_checkout', failures);
  assertCondition(manifest.package_consumption_status === 'packages_defined_not_consumed_by_install_update', 'package consumption status drifted', failures);
  assertCondition(automation?.channel_manifest?.manifest_kind === 'opl_release_channel_manifest.v1', 'missing channel manifest automation contract', failures);
  assertCondition(automation?.channel_manifest?.outputs?.channel_manifest === 'opl-channel-manifest.json', 'missing channel manifest output', failures);
  assertCondition(automation?.channel_manifest?.outputs?.checksums === 'SHA256SUMS', 'missing checksum output', failures);
  assertCondition(automation?.artifact_build?.workflow === '.github/workflows/packages.yml', 'missing artifact build workflow contract', failures);
  assertCondition(automation?.checksum?.required_before_publish === true, 'checksum must be required before publish', failures);
  assertCondition(automation?.rollback?.strategy === 'previous_channel_manifest_target', 'rollback strategy must use previous channel manifest target', failures);
  assertCondition(automation?.cleanup?.strategy === 'retain_latest_n_versions_and_declared_rollbacks', 'cleanup strategy must retain latest versions and rollbacks', failures);
  assertCondition(Number.isFinite(automation?.cleanup?.retain_versions) && automation.cleanup.retain_versions >= 2, 'cleanup retain_versions must be >= 2', failures);

  const modules = manifest.packages?.modules ?? {};
  for (const [moduleId, entry] of Object.entries(modules)) {
    validateModule(moduleId, entry, failures);
  }

  return failures;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
  const failures = validateManifest(manifest);
  if (failures.length > 0) {
    console.error(JSON.stringify({
      status: 'failed',
      manifest: options.manifest,
      failures,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: 'passed',
    manifest: options.manifest,
    modules: Object.keys(manifest.packages?.modules ?? {}),
    release_automation: manifest.release_automation,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
