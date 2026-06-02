#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildOplPackageManifest } from '../src/package-distribution.ts';

function parseArgs(argv) {
  const parsed = {
    owner: process.env.OPL_PACKAGES_OWNER || 'gaofeng21cn',
    execute: false,
    summaryPath: process.env.OPL_GHCR_CLEANUP_SUMMARY_PATH || '',
    rollbackTags: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--execute') {
      parsed.execute = true;
      continue;
    }
    if (token === '--dry-run') {
      parsed.execute = false;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    index += 1;
    if (token === '--owner') parsed.owner = value;
    else if (token === '--summary-path') parsed.summaryPath = path.resolve(value);
    else if (token === '--rollback-tag') parsed.rollbackTags.push(value);
    else throw new Error(`Unknown argument: ${token}`);
  }
  return parsed;
}

function encodedPackageName(packageName) {
  return packageName.replaceAll('/', '%2F');
}

function runGh(args, options = {}) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = options.capture ? `\nstdout=${result.stdout || ''}\nstderr=${result.stderr || ''}` : '';
    throw new Error(`Command failed: gh ${args.join(' ')}${detail}`);
  }
  return result;
}

function readPackageVersions(owner, packageName) {
  const result = runGh([
    'api',
    '-H',
    'X-GitHub-Api-Version: 2022-11-28',
    `/users/${owner}/packages/container/${encodedPackageName(packageName)}/versions?per_page=100`,
    '--paginate',
    '--jq',
    '.[] | @json',
  ], { capture: true });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function versionTags(version) {
  return version.metadata?.container?.tags ?? [];
}

function sortRecentFirst(versions) {
  return [...versions].sort((left, right) =>
    String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')),
  );
}

function semverTag(tags) {
  return tags.find((tag) => /^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$/.test(tag));
}

function nativeHelperTag(tags) {
  return tags.find((tag) => /^[a-z0-9_.-]+-[a-z0-9_.-]+-[0-9]+\.[0-9]+\.[0-9]+/.test(tag));
}

function protectedIdsForPackage(versions, packageKind, retainVersions, rollbackTags, protectedTags) {
  const protectedIds = new Set();
  const explicitlyProtectedTags = new Set([...rollbackTags, ...protectedTags]);

  for (const version of versions) {
    if (!Number.isFinite(version.id)) continue;
    const tags = versionTags(version);
    if (tags.some((tag) => explicitlyProtectedTags.has(tag))) {
      protectedIds.add(version.id);
    }
  }

  const taggedVersions = versions.filter((version) => {
    const tags = versionTags(version);
    return packageKind === 'native_helper' ? nativeHelperTag(tags) : semverTag(tags);
  });
  for (const version of sortRecentFirst(taggedVersions).slice(0, retainVersions)) {
    if (Number.isFinite(version.id)) protectedIds.add(version.id);
  }

  return protectedIds;
}

function summarizeVersion(version) {
  return {
    id: version.id ?? null,
    tags: versionTags(version),
    updated_at: version.updated_at ?? null,
    html_url: version.html_url ?? null,
  };
}

function writeSummary(summaryPath, payload) {
  if (!summaryPath) return;
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function packageTargets(manifest) {
  const cleanupPolicy = manifest.release_automation.cleanup;
  const nativePolicy = manifest.packages.native_helper.retention_policy;
  return [
    {
      package_name: 'one-person-lab-native-helper',
      package_kind: 'native_helper',
      lifecycle_status: manifest.packages.native_helper.channel_status,
      retain_versions: nativePolicy.retain_versions,
      execution_mode: nativePolicy.execution_mode,
      protected_tags: nativePolicy.protected_tags ?? [],
    },
    ...Object.values(manifest.packages.modules).map((entry) => ({
      package_name: `one-person-lab-modules/${entry.repo_name}`,
      package_kind: 'active_module_package',
      lifecycle_status: entry.package_lifecycle_status,
      retain_versions: cleanupPolicy.retain_versions,
      execution_mode: cleanupPolicy.execution_mode,
      protected_tags: cleanupPolicy.protected_tags ?? [],
    })),
    {
      package_name: 'one-person-lab-manifest',
      package_kind: 'active_channel_manifest',
      lifecycle_status: manifest.release_automation.package_lifecycle_status,
      retain_versions: cleanupPolicy.retain_versions,
      execution_mode: cleanupPolicy.execution_mode,
      protected_tags: cleanupPolicy.protected_tags ?? [],
    },
  ];
}

function cleanup(options) {
  const manifest = buildOplPackageManifest({ owner: options.owner });
  const targets = packageTargets(manifest);
  const packages = [];
  const deletedVersions = [];

  for (const target of targets) {
    if (target.execution_mode !== 'dry_run_first_explicit_execute_required') {
      throw new Error(`${target.package_name}: cleanup policy must remain dry-run first`);
    }

    let versions = [];
    try {
      versions = readPackageVersions(options.owner, target.package_name);
    } catch (error) {
      packages.push({
        ...target,
        status: 'not_found_or_unreadable',
        error: error instanceof Error ? error.message : String(error),
        version_count: 0,
        candidate_count: 0,
        candidates: [],
      });
      continue;
    }

    const protectedIds = protectedIdsForPackage(
      versions,
      target.package_kind,
      target.retain_versions,
      options.rollbackTags,
      target.protected_tags,
    );
    const candidates = versions
      .filter((version) => Number.isFinite(version.id))
      .filter((version) => !protectedIds.has(version.id))
      .map(summarizeVersion);

    if (options.execute) {
      for (const candidate of candidates) {
        if (!candidate.id) continue;
        runGh([
          'api',
          '-X',
          'DELETE',
          '-H',
          'X-GitHub-Api-Version: 2022-11-28',
          `/users/${options.owner}/packages/container/${encodedPackageName(target.package_name)}/versions/${candidate.id}`,
        ]);
        deletedVersions.push({ package_name: target.package_name, id: candidate.id });
      }
    }

    packages.push({
      ...target,
      status: 'evaluated',
      version_count: versions.length,
      protected_version_ids: [...protectedIds].sort((left, right) => left - right),
      candidate_count: candidates.length,
      candidates,
    });
  }

  const summary = {
    schema: 'opl_framework_ghcr_package_cleanup.v1',
    status: options.execute ? 'deleted' : 'dry_run',
    owner: options.owner,
    execute: options.execute,
    rollback_tags: options.rollbackTags,
    packages,
    deleted_versions: deletedVersions,
  };
  writeSummary(options.summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  cleanup(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
