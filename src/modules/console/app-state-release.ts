import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import { record } from '../../kernel/json-record.ts';
import { buildOplReleaseTag, getOplReleaseRepo, getOplReleaseVersion } from '../connect/public/app-state.ts';
import { readOplUpdateChannel } from '../../kernel/system-preferences.ts';

function resolveConsoleProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function readOplFrameworkPackageVersion() {
  const override = process.env.OPL_FRAMEWORK_VERSION?.trim();
  if (override) {
    return override;
  }

  const packageJsonPath = path.join(resolveConsoleProjectRoot(), 'package.json');
  const packageJson = record(readJsonPayloadFile(packageJsonPath));
  const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
  if (!version) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Framework package.json is missing version.', {
      package_json_path: packageJsonPath,
    });
  }
  return version;
}

function shortCommit(commit: string) {
  const trimmed = commit.trim();
  return /^[0-9a-f]{40}$/i.test(trimmed) ? trimmed.slice(0, 12) : trimmed;
}

function readPackagedFrameworkRevision(): string | null {
  const projectRoot = resolveConsoleProjectRoot();
  const manifestPaths = [
    path.join(projectRoot, '..', 'manifest', 'full-package-manifest.json'),
    path.join(projectRoot, '..', '..', 'manifest', 'full-package-manifest.json'),
  ];

  for (const manifestPath of manifestPaths) {
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = record(readJsonPayloadFile(manifestPath));
      const components = record(manifest.components);
      const opl = record(components.opl);
      const commit = typeof opl.git_commit === 'string' ? opl.git_commit.trim() : '';
      if (commit) return shortCommit(commit);
    } catch {
      continue;
    }
  }

  return null;
}

function readGitFrameworkRevision(): string | null {
  const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: resolveConsoleProjectRoot(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function readOplFrameworkRevision() {
  const override = process.env.OPL_FRAMEWORK_REVISION?.trim();
  if (override) {
    return { value: shortCommit(override), source: 'OPL_FRAMEWORK_REVISION' };
  }

  const packagedRevision = readPackagedFrameworkRevision();
  if (packagedRevision) {
    return { value: packagedRevision, source: 'full_package_manifest' };
  }

  const gitRevision = readGitFrameworkRevision();
  if (gitRevision) {
    return { value: gitRevision, source: 'git_head' };
  }

  const dateOverride = process.env.OPL_FRAMEWORK_BUILD_DATE?.trim() || process.env.OPL_RELEASE_DATE?.trim();
  if (dateOverride) {
    return { value: dateOverride, source: 'build_date' };
  }

  const packageJsonPath = path.join(resolveConsoleProjectRoot(), 'package.json');
  const packageDate = fs.statSync(packageJsonPath).mtime.toISOString().slice(0, 10);
  return { value: packageDate, source: 'package_json_mtime' };
}

export function buildReleaseState() {
  const updateChannel = readOplUpdateChannel();
  const oplFrameworkVersion = readOplFrameworkPackageVersion();
  const oplFrameworkRevision = readOplFrameworkRevision();
  return {
    version: getOplReleaseVersion(),
    tag: buildOplReleaseTag(),
    repo: getOplReleaseRepo(),
    opl_framework_version: oplFrameworkVersion,
    framework_version: oplFrameworkVersion,
    opl_framework_revision: oplFrameworkRevision.value,
    framework_revision: oplFrameworkRevision.value,
    framework_revision_source: oplFrameworkRevision.source,
    channel: updateChannel.channel,
    channel_source_updated_at: updateChannel.updated_at,
    prerelease_included: updateChannel.channel === 'preview',
    stable_release_api: `https://api.github.com/repos/${getOplReleaseRepo()}/releases/latest`,
    nightly_release_api: `https://api.github.com/repos/${getOplReleaseRepo()}/releases`,
    update_action: 'update_channel',
  };
}
