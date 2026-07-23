#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJsonFile } from './script-json-boundary.mjs';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import {
  resolveAnnotatedOwnerVersionTag,
  validatePackageSourceProjection,
} from './package-source-projection-gate.mjs';
import {
  buildOplPackageManifest,
  buildOplPackageChannelManifest,
  getOplPackageSpecs,
  normalizeDistributionVersion,
  sha256File,
  writeOplPackageManifest,
} from '../src/modules/connect/package-distribution.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readFrameworkSourceVersion(frameworkSourceRoot) {
  const packageJsonPath = path.join(frameworkSourceRoot, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Frozen Framework package.json version must be stable SemVer, got: ${version || 'missing'}`);
  }
  return version;
}

function parseCliOptions(argv) {
  const parsed = {
    releaseSetGeneration: process.env.OPL_RELEASE_SET_GENERATION || undefined,
    generatedAt: process.env.OPL_RELEASE_SET_GENERATED_AT || undefined,
    outDir: path.join(repoRoot, 'dist', 'packages'),
    cloneRoot: null,
    owner: process.env.OPL_PACKAGES_OWNER || undefined,
    previousManifest: process.env.OPL_PREVIOUS_PACKAGE_MANIFEST || undefined,
    retainVersions: process.env.OPL_PACKAGE_RETAIN_VERSIONS || undefined,
    appComponentManifest: process.env.OPL_APP_COMPONENT_MANIFEST || undefined,
    ownerCohortLock: process.env.OPL_PACKAGE_OWNER_COHORT_LOCK || undefined,
    ownerCohortMode: process.env.OPL_PACKAGE_OWNER_COHORT_MODE || 'owner-head',
    frameworkSourceRoot: process.env.OPL_FRAMEWORK_SOURCE_ROOT
      ? path.resolve(process.env.OPL_FRAMEWORK_SOURCE_ROOT)
      : repoRoot,
  };

  parseRequiredValueOptions(argv, {
    '--release-set-generation': (value) => {
      parsed.releaseSetGeneration = value;
    },
    '--generated-at': (value) => {
      parsed.generatedAt = value;
    },
    '--out-dir': (value) => {
      parsed.outDir = path.resolve(value);
    },
    '--clone-root': (value) => {
      parsed.cloneRoot = path.resolve(value);
    },
    '--owner': (value) => {
      parsed.owner = value;
    },
    '--previous-manifest': (value) => {
      parsed.previousManifest = path.resolve(value);
    },
    '--retain-versions': (value) => {
      parsed.retainVersions = value;
    },
    '--app-component-manifest': (value) => {
      parsed.appComponentManifest = path.resolve(value);
    },
    '--owner-cohort-lock': (value) => {
      parsed.ownerCohortLock = path.resolve(value);
    },
    '--owner-cohort-mode': (value) => {
      parsed.ownerCohortMode = value.trim();
    },
    '--framework-source-root': (value) => {
      parsed.frameworkSourceRoot = path.resolve(value);
    },
  });

  if (!parsed.cloneRoot) {
    parsed.cloneRoot = path.join(path.dirname(parsed.outDir), `${path.basename(parsed.outDir)}-package-sources`);
  }
  if (!['owner-head', 'framework-projection'].includes(parsed.ownerCohortMode)) {
    throw new Error(`Invalid --owner-cohort-mode: ${parsed.ownerCohortMode}`);
  }

  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        result.stdout?.trim() ? `stdout=${result.stdout.trim()}` : '',
        result.stderr?.trim() ? `stderr=${result.stderr.trim()}` : '',
      ].filter(Boolean).join('\n'),
    );
  }
  return result;
}

function packageSourcePathEnvKey(packageId) {
  return `OPL_PACKAGE_SOURCE_PATH_${packageId.toUpperCase().replaceAll('-', '_')}`;
}

function readPreviousManifest(manifestPath) {
  if (!manifestPath) {
    return null;
  }
  const parsed = readJsonFile(manifestPath);
  const generation = typeof parsed.release_set_generation === 'string'
    ? parsed.release_set_generation.trim()
    : '';
  if (!generation) {
    throw new Error(`Previous manifest has no release_set_generation: ${manifestPath}`);
  }
  return parsed;
}

function readAppComponentManifest(manifestPath) {
  if (!manifestPath) return null;
  const component = readJsonFile(manifestPath);
  if (component.surface_kind !== 'opl_app_component_manifest.v1'
    || component.component_id !== 'opl-app'
    || !/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(component.version ?? '')
    || !/^[0-9a-f]{40}$/.test(component.source_commit ?? '')
    || !/^sha256:[0-9a-f]{64}$/.test(component.primary_artifact?.digest ?? '')
    || !Array.isArray(component.artifacts)
    || component.artifacts.length === 0) {
    throw new Error(`Invalid OPL App component manifest: ${manifestPath}`);
  }
  if (Array.isArray(component.carriers)) {
    const ids = component.carriers.map((carrier) => carrier?.carrier_id).sort();
    const byId = Object.fromEntries(component.carriers.map((carrier) => [carrier?.carrier_id, carrier]));
    if (JSON.stringify(ids) !== JSON.stringify(['docker_webui', 'macos_standard'])
      || component.carriers.some((carrier) => !/^sha256:[0-9a-f]{64}$/.test(carrier?.digest ?? '')
        || typeof carrier?.ref !== 'string' || !carrier.ref
        || !Number.isSafeInteger(carrier?.size) || carrier.size <= 0)
      || byId.macos_standard?.carrier_kind !== 'release_asset'
      || byId.macos_standard?.package_profile !== 'standard'
      || byId.docker_webui?.carrier_kind !== 'oci_image'
      || byId.docker_webui?.package_profile !== 'webui-full') {
      throw new Error(`Invalid OPL App carrier set: ${manifestPath}`);
    }
  }
  return component;
}

function normalizeRetainVersions(raw) {
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2) {
    throw new Error(`--retain-versions must be a number >= 2, got: ${raw}`);
  }
  return Math.floor(parsed);
}

function resolveModuleRepo(spec, cloneRoot, lockedCommit = null) {
  const explicit = process.env[packageSourcePathEnvKey(spec.package_id)]?.trim();
  if (explicit) {
    const explicitPath = path.resolve(explicit);
    const head = readGitValue(explicitPath, ['rev-parse', 'HEAD']);
    if (lockedCommit && head !== lockedCommit) {
      throw new Error(`${spec.package_id}: explicit owner source HEAD ${head} does not match cohort lock ${lockedCommit}`);
    }
    return explicitPath;
  }

  const checkoutPath = path.join(cloneRoot, spec.repo_name);
  if (!fs.existsSync(path.join(checkoutPath, '.git'))) {
    fs.rmSync(checkoutPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
    run('git', ['clone', '--filter=blob:none', '--no-checkout', spec.repo_url, checkoutPath]);
  } else {
    run('git', ['remote', 'set-url', 'origin', spec.repo_url], { cwd: checkoutPath });
  }
  const fetchTarget = lockedCommit || 'main';
  run('git', ['fetch', '--depth', '1', 'origin', fetchTarget], { cwd: checkoutPath });
  const fetchedCommit = readGitValue(checkoutPath, ['rev-parse', 'FETCH_HEAD']);
  if (lockedCommit && fetchedCommit !== lockedCommit) {
    throw new Error(`${spec.package_id}: fetched owner commit ${fetchedCommit} does not match cohort lock ${lockedCommit}`);
  }
  run('git', ['checkout', '--detach', fetchedCommit], { cwd: checkoutPath });
  return checkoutPath;
}

function readGitValue(repoPath, args) {
  return run('git', args, { cwd: repoPath, capture: true }).stdout.trim();
}

function archiveModule(spec, repoPath, packagesOutDir, version) {
  const packageOutDir = path.join(packagesOutDir, spec.package_id);
  fs.mkdirSync(packageOutDir, { recursive: true });
  const archiveName = `${spec.package_id}-${version}.tar.gz`;
  const archivePath = path.join(packageOutDir, archiveName);
  fs.rmSync(archivePath, { force: true });
  run('git', ['archive', '--format=tar.gz', `--prefix=${spec.repo_name}/`, '-o', archivePath, 'HEAD'], {
    cwd: repoPath,
  });
  const stat = fs.statSync(archivePath);
  return {
    file_name: archiveName,
    path: archivePath,
    size: stat.size,
    sha256: sha256File(archivePath),
    head_sha: readGitValue(repoPath, ['rev-parse', 'HEAD']),
    branch: readGitValue(repoPath, ['branch', '--show-current']) || null,
  };
}

function readJsonObject(filePath) {
  return readJsonFile(filePath);
}

function readPyprojectVersion(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const project = source.match(/\[project\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? '';
  const version = project.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1]?.trim();
  if (!version) throw new Error(`Owner pyproject has no [project].version: ${filePath}`);
  return version;
}

function readOwnerPackageMetadata(spec, repoPath, releaseGate) {
  const manifestPath = path.join(repoPath, spec.owner_package_manifest_ref);
  const ownerManifestJson = fs.readFileSync(manifestPath, 'utf8');
  const ownerManifest = JSON.parse(ownerManifestJson);
  const ownerPackage = spec.owner_manifest_kind === 'workflow_profile'
    ? ownerManifest.package
    : ownerManifest;
  const ownerPackageId = String(ownerPackage?.package_id ?? ownerPackage?.id ?? '').trim();
  const ownerAgentId = String(ownerPackage?.agent_id ?? ownerPackageId).trim();
  const ownerLanguageVersion = String(ownerPackage?.version ?? '').trim();
  if (ownerPackageId !== spec.package_id || (spec.owner_manifest_kind === 'standard_agent' && ownerAgentId !== spec.package_id)) {
    throw new Error(`${spec.module_id}: owner package identity must be canonical ${spec.package_id}; got package_id=${ownerPackageId} agent_id=${ownerAgentId}`);
  }
  if (!ownerLanguageVersion) throw new Error(`${spec.module_id}: owner package manifest has no version`);
  const packageVersion = normalizeDistributionVersion(ownerLanguageVersion);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(packageVersion)) {
    throw new Error(`${spec.module_id}: owner package version must normalize to SemVer; got ${ownerLanguageVersion}`);
  }
  const plugin = readJsonObject(path.join(repoPath, spec.owner_plugin_manifest_ref));
  if (String(plugin.version ?? '').trim() !== ownerLanguageVersion) {
    throw new Error(`${spec.module_id}: owner plugin version does not match owner package manifest`);
  }
  if (spec.owner_language_version_ref) {
    const languagePath = path.join(repoPath, spec.owner_language_version_ref);
    const languageVersion = spec.owner_language_version_ref.endsWith('.toml')
      ? readPyprojectVersion(languagePath)
      : String(readJsonObject(languagePath).version ?? '').trim();
    if (languageVersion !== ownerLanguageVersion) {
      throw new Error(`${spec.module_id}: owner language package version does not match owner package manifest`);
    }
  }
  const headSha = readGitValue(repoPath, ['rev-parse', 'HEAD']);
  const matchingTag = resolveAnnotatedOwnerVersionTag({
    spec,
    ownerRepoPath: repoPath,
    packageVersion,
    releaseGate,
  });
  return {
    package_id: spec.package_id,
    package_version: packageVersion,
    owner_language_version: ownerLanguageVersion,
    owner_source_commit: headSha,
    owner_version_tag: matchingTag,
    owner_package_manifest_json: ownerManifestJson,
    owner_package_manifest_sha256: `sha256:${sha256File(manifestPath)}`,
    release_gate: matchingTag ? `owner_version_tag:${matchingTag}` : releaseGate,
  };
}

function copyRuntimePayload(repoPath, payloadRoot) {
  const packageJson = readJsonObject(path.join(repoPath, 'package.json'));
  if (!Array.isArray(packageJson.files)) {
    throw new Error('OPL Base package.json files must define the runtime payload allowlist');
  }
  const entries = ['package.json', 'package-lock.json', ...packageJson.files];
  for (const relativePath of entries) {
    const sourcePath = path.join(repoPath, relativePath);
    if (!fs.existsSync(sourcePath)) continue;
    const targetPath = path.join(payloadRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, { recursive: true, preserveTimestamps: true });
  }
  const runtimePackageJson = structuredClone(packageJson);
  if (runtimePackageJson.scripts && typeof runtimePackageJson.scripts === 'object') {
    delete runtimePackageJson.scripts.prepare;
    delete runtimePackageJson.scripts.build;
    delete runtimePackageJson.scripts.typecheck;
  }
  fs.writeFileSync(path.join(payloadRoot, 'package.json'), `${JSON.stringify(runtimePackageJson, null, 2)}\n`, 'utf8');
  for (const requiredPath of ['package.json', 'package-lock.json', 'bin/opl', 'dist/entrypoints/cli.js', 'contracts/opl-framework']) {
    if (!fs.existsSync(path.join(payloadRoot, requiredPath))) {
      throw new Error(`OPL Base runtime payload is missing ${requiredPath}`);
    }
  }
}

function archiveFramework(repoPath, frameworkOutDir, version) {
  fs.mkdirSync(frameworkOutDir, { recursive: true });
  const archiveName = `one-person-lab-framework-${version}.tar.gz`;
  const archivePath = path.join(frameworkOutDir, archiveName);
  fs.rmSync(archivePath, { force: true });
  run('npm', ['run', 'build'], { cwd: repoPath, capture: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-runtime-'));
  try {
    const payloadRoot = path.join(tempRoot, 'payload');
    copyRuntimePayload(repoPath, payloadRoot);
    run('git', ['init', '--quiet'], { cwd: payloadRoot });
    run('git', ['config', 'user.name', 'OPL Release'], { cwd: payloadRoot });
    run('git', ['config', 'user.email', 'release@one-person-lab.invalid'], { cwd: payloadRoot });
    run('git', ['add', '--all'], { cwd: payloadRoot });
    run('git', ['commit', '--quiet', '-m', 'OPL Base runtime payload'], {
      cwd: payloadRoot,
      env: {
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      },
    });
    run('git', ['archive', '--format=tar.gz', '--prefix=one-person-lab/', '-o', archivePath, 'HEAD'], {
      cwd: payloadRoot,
    });
  } finally {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
  const stat = fs.statSync(archivePath);
  return {
    file_name: archiveName,
    path: archivePath,
    size: stat.size,
    sha256: sha256File(archivePath),
    head_sha: readGitValue(repoPath, ['rev-parse', 'HEAD']),
    branch: readGitValue(repoPath, ['branch', '--show-current']) || null,
  };
}

function validateOwnerCohortLock(lock) {
  if (lock?.surface_kind !== 'opl_package_owner_cohort_lock.v1') {
    throw new Error('Owner cohort lock must use opl_package_owner_cohort_lock.v1');
  }
  const expectedIds = getOplPackageSpecs().map((spec) => spec.package_id).sort();
  const actualIds = Object.keys(lock.packages ?? {}).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`Owner cohort lock ids must be exactly: ${expectedIds.join(', ')}`);
  }
  for (const spec of getOplPackageSpecs()) {
    const entry = lock.packages[spec.package_id];
    if (entry.package_id !== spec.package_id
      || entry.repo_name !== spec.repo_name
      || entry.repo_url !== spec.repo_url
      || !/^[0-9a-f]{40}$/.test(entry.source_commit ?? '')) {
      throw new Error(`${spec.package_id}: invalid owner cohort lock entry`);
    }
  }
  return lock;
}

function readProjectedCarrierCommit(spec, frameworkSourceRoot) {
  const manifestPath = path.join(frameworkSourceRoot, spec.package_manifest_ref);
  const manifest = readJsonFile(manifestPath);
  const sourceCommit = manifest?.codex_surface?.carrier_source_commit ?? manifest?.source_commit;
  if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? '')) {
    throw new Error(`${spec.package_id}: Framework projection has no exact carrier source commit`);
  }
  return sourceCommit;
}

function resolveOwnerCohort(options) {
  const supplied = options.ownerCohortLock
    ? validateOwnerCohortLock(readJsonFile(options.ownerCohortLock))
    : null;
  const resolved = new Map();
  const packages = {};
  for (const spec of getOplPackageSpecs()) {
    const lockedCommit = supplied?.packages?.[spec.package_id]?.source_commit
      ?? (options.ownerCohortMode === 'framework-projection'
        ? readProjectedCarrierCommit(spec, options.frameworkSourceRoot)
        : null);
    const repoPath = resolveModuleRepo(spec, options.cloneRoot, lockedCommit);
    const sourceCommit = readGitValue(repoPath, ['rev-parse', 'HEAD']);
    resolved.set(spec.package_id, repoPath);
    packages[spec.package_id] = {
      package_id: spec.package_id,
      repo_name: spec.repo_name,
      repo_url: spec.repo_url,
      source_commit: sourceCommit,
    };
  }
  return {
    lock: supplied ?? {
      surface_kind: 'opl_package_owner_cohort_lock.v1',
      generated_at: options.generatedAt ?? new Date().toISOString(),
      packages,
    },
    resolved,
    mode: supplied ? 'supplied-lock' : options.ownerCohortMode,
  };
}

function writeChecksumFile(outDir, archives) {
  const checksumPath = path.join(outDir, 'SHA256SUMS');
  const lines = archives
    .map((archive) => `${archive.sha256}  ${archive.relative_path}`)
    .sort();
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return checksumPath;
}

const releaseWorkflowPaths = [
  '.github/workflows/packages.yml',
  '.github/workflows/release-package-channel.yml',
  '.github/workflows/daily-package-channel.yml',
];

function copyReleaseDisciplineWorkflows(outDir) {
  const copied = [];
  for (const workflow of releaseWorkflowPaths) {
    const source = path.join(repoRoot, workflow);
    const target = path.join(outDir, workflow);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copied.push(workflow);
  }
  return copied;
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const previousManifest = readPreviousManifest(options.previousManifest);
  const appComponent = readAppComponentManifest(options.appComponentManifest);
  const ownerCohort = resolveOwnerCohort(options);
  const rollbackVersion = previousManifest?.release_set_generation ?? null;
  const retainVersions = normalizeRetainVersions(options.retainVersions);
  const frameworkVersion = readFrameworkSourceVersion(options.frameworkSourceRoot);
  const manifest = buildOplPackageManifest({
    releaseSetGeneration: options.releaseSetGeneration,
    generatedAt: options.generatedAt,
    owner: options.owner,
    rollbackVersion,
    retainVersions,
    appComponent,
    frameworkVersion,
  });
  const releaseSetGeneration = manifest.release_set_generation;
  const packagesOutDir = path.join(options.outDir, 'packages');
  const frameworkOutDir = path.join(options.outDir, 'framework');
  const archives = [];
  fs.mkdirSync(options.outDir, { recursive: true });
  const ownerCohortLockPath = path.join(options.outDir, 'owner-cohort-lock.json');
  fs.writeFileSync(ownerCohortLockPath, `${JSON.stringify(ownerCohort.lock, null, 2)}\n`, 'utf8');
  const ownerCohortLockDigest = `sha256:${sha256File(ownerCohortLockPath)}`;
  manifest.release_set.owner_cohort_lock = {
    surface_kind: ownerCohort.lock.surface_kind,
    ref: 'owner-cohort-lock.json',
    digest: ownerCohortLockDigest,
    package_ids: Object.keys(ownerCohort.lock.packages).sort(),
  };
  archives.push({
    relative_path: 'owner-cohort-lock.json',
    sha256: ownerCohortLockDigest.replace(/^sha256:/, ''),
  });
  const frameworkArchive = archiveFramework(options.frameworkSourceRoot, frameworkOutDir, frameworkVersion);
  archives.push({
    ...frameworkArchive,
    relative_path: `framework/${frameworkArchive.file_name}`,
  });
  manifest.packages.framework_core.source_archive = {
    file_name: frameworkArchive.file_name,
    size: frameworkArchive.size,
    sha256: frameworkArchive.sha256,
  };
  manifest.packages.framework_core.checksum = {
    algorithm: 'sha256',
    value: frameworkArchive.sha256,
    file: 'SHA256SUMS',
  };
  manifest.packages.framework_core.source_git = {
    repo_url: 'https://github.com/gaofeng21cn/one-person-lab.git',
    branch: frameworkArchive.branch,
    head_sha: frameworkArchive.head_sha,
  };
  manifest.release_set.components.base.source_commit = frameworkArchive.head_sha;
  manifest.release_set.components.base.artifact_ref = manifest.packages.framework_core.artifact;
  manifest.packages.framework_core.homebrew_formula = {
    surface_kind: 'opl_homebrew_formula_projection.v1',
    formula_name: 'opl',
    package_name: 'opl',
    approval_status: 'owner_approved',
    carrier_scope: 'framework_core_only',
    version: manifest.packages.framework_core.version,
    source_head: frameworkArchive.head_sha,
    archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkArchive.head_sha}.tar.gz`,
    archive_kind: 'immutable_github_commit_archive',
    sha256_source: 'tap_sync_download_and_hash',
    tap_generator_role: 'consume_projection_without_inference',
  };

  for (const spec of getOplPackageSpecs()) {
    const repoPath = ownerCohort.resolved.get(spec.package_id);
    const ownerMetadata = readOwnerPackageMetadata(
      spec,
      repoPath,
      process.env.OPL_PACKAGE_RELEASE_GATE?.trim() || null,
    );
    validatePackageSourceProjection({
      frameworkRoot: options.frameworkSourceRoot,
      spec,
      ownerRepoPath: repoPath,
      releaseGate: process.env.OPL_PACKAGE_RELEASE_GATE?.trim() || null,
    });
    const archive = archiveModule(spec, repoPath, packagesOutDir, ownerMetadata.package_version);
    archives.push({
      ...archive,
      relative_path: `packages/${spec.package_id}/${archive.file_name}`,
    });
    const packageEntry = manifest.packages.package_artifacts[spec.package_id];
    const registryRoot = packageEntry.artifact.split('/one-person-lab-packages/')[0];
    packageEntry.package_id = ownerMetadata.package_id;
    packageEntry.package_version = ownerMetadata.package_version;
    packageEntry.version = ownerMetadata.package_version;
    packageEntry.artifact = `${registryRoot}/one-person-lab-packages/${spec.package_id}:${ownerMetadata.package_version}`;
    packageEntry.owner_language_version = ownerMetadata.owner_language_version;
    packageEntry.owner_source_commit = ownerMetadata.owner_source_commit;
    packageEntry.owner_version_tag = ownerMetadata.owner_version_tag;
    packageEntry.owner_package_manifest_json = ownerMetadata.owner_package_manifest_json;
    packageEntry.owner_package_manifest_sha256 = ownerMetadata.owner_package_manifest_sha256;
    packageEntry.release_gate = ownerMetadata.release_gate;
    packageEntry.package_content_digest = `sha256:${archive.sha256}`;
    const releaseSetMember = manifest.release_set.components.packages.members[spec.package_id];
    releaseSetMember.package_version = ownerMetadata.package_version;
    releaseSetMember.version = ownerMetadata.package_version;
    releaseSetMember.owner_source_commit = ownerMetadata.owner_source_commit;
    releaseSetMember.source_commit = ownerMetadata.owner_source_commit;
    releaseSetMember.oci_artifact_ref = packageEntry.artifact;
    releaseSetMember.artifact_ref = packageEntry.artifact;
    manifest.packages.package_artifacts[spec.package_id].source_archive = {
      file_name: archive.file_name,
      size: archive.size,
      sha256: archive.sha256,
    };
    manifest.packages.package_artifacts[spec.package_id].checksum = {
      algorithm: 'sha256',
      value: archive.sha256,
      file: 'SHA256SUMS',
    };
    manifest.packages.package_artifacts[spec.package_id].source_git = {
      repo_url: spec.repo_url,
      branch: archive.branch,
      head_sha: archive.head_sha,
    };
  }

  const checksumPath = writeChecksumFile(options.outDir, archives);
  const releaseDisciplineWorkflows = copyReleaseDisciplineWorkflows(options.outDir);
  const channelManifest = buildOplPackageChannelManifest(manifest, previousManifest);
  const manifestPath = writeOplPackageManifest(path.join(options.outDir, 'opl-release-manifest.json'), manifest);
  const channelManifestPath = writeOplPackageManifest(
    path.join(options.outDir, 'opl-channel-manifest.json'),
    channelManifest,
  );
  for (const [packageId, entry] of Object.entries(channelManifest.packages.package_catalog)) {
    const version = entry.versions.find((candidate) => candidate.selection_status === 'selected_for_release_set');
    const metadataRoot = path.join(packagesOutDir, packageId);
    fs.mkdirSync(metadataRoot, { recursive: true });
    fs.writeFileSync(path.join(metadataRoot, 'package-manifest.json'), version.manifest_json, 'utf8');
    fs.writeFileSync(path.join(metadataRoot, 'payload-manifest.json'), version.payload_manifest_json, 'utf8');
  }
  console.log(JSON.stringify({
    status: 'completed',
    manifest: manifestPath,
    channel_manifest: channelManifestPath,
    checksums: checksumPath,
    owner_cohort_lock: ownerCohortLockPath,
    owner_cohort_lock_digest: ownerCohortLockDigest,
    release_discipline_workflows: releaseDisciplineWorkflows,
    packages_dir: packagesOutDir,
    framework_dir: frameworkOutDir,
    clone_root: options.cloneRoot,
    framework_source_root: options.frameworkSourceRoot,
    owner_cohort_mode: ownerCohort.mode,
    framework_core: {
      artifact: manifest.packages.framework_core.artifact,
      source_archive: manifest.packages.framework_core.source_archive,
      source_git: manifest.packages.framework_core.source_git,
    },
    packages: Object.values(manifest.packages.package_artifacts).map((entry) => ({
      package_id: entry.package_id,
      carrier_locator: entry.carrier_locator,
      artifact: entry.artifact,
      source_archive: entry.source_archive,
      source_git: entry.source_git,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
