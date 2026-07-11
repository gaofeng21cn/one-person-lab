#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJsonFile } from './script-json-boundary.mjs';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import {
  buildOplPackageManifest,
  buildOplPackageChannelManifest,
  getOplPackageModuleSpecs,
  sha256File,
  writeOplPackageManifest,
} from '../src/modules/connect/package-distribution.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCliOptions(argv) {
  const parsed = {
    version: process.env.OPL_RELEASE_VERSION || undefined,
    outDir: path.join(repoRoot, 'dist', 'packages'),
    cloneRoot: null,
    owner: process.env.OPL_PACKAGES_OWNER || undefined,
    previousManifest: process.env.OPL_PREVIOUS_PACKAGE_MANIFEST || undefined,
    retainVersions: process.env.OPL_PACKAGE_RETAIN_VERSIONS || undefined,
  };

  parseRequiredValueOptions(argv, {
    '--version': (value) => {
      parsed.version = value;
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
  });

  if (!parsed.cloneRoot) {
    parsed.cloneRoot = path.join(path.dirname(parsed.outDir), `${path.basename(parsed.outDir)}-package-sources`);
  }

  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
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

function modulePathEnvKey(moduleId) {
  return `OPL_MODULE_PATH_${moduleId.toUpperCase()}`;
}

function readPreviousManifestVersion(manifestPath) {
  if (!manifestPath) {
    return null;
  }
  const parsed = readJsonFile(manifestPath);
  const version = typeof parsed.opl_version === 'string' ? parsed.opl_version.trim() : '';
  if (!version) {
    throw new Error(`Previous manifest has no opl_version: ${manifestPath}`);
  }
  return version;
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

function resolveModuleRepo(spec, cloneRoot) {
  const explicit = process.env[modulePathEnvKey(spec.module_id)]?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  const checkoutPath = path.join(cloneRoot, spec.repo_name);
  if (!fs.existsSync(path.join(checkoutPath, '.git'))) {
    fs.rmSync(checkoutPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
    run('git', ['clone', '--depth', '1', spec.repo_url, checkoutPath]);
  } else {
    run('git', ['remote', 'set-url', 'origin', spec.repo_url], { cwd: checkoutPath });
    run('git', ['fetch', '--depth', '1', 'origin', 'main'], { cwd: checkoutPath });
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: checkoutPath });
  }
  return checkoutPath;
}

function readGitValue(repoPath, args) {
  return run('git', args, { cwd: repoPath, capture: true }).stdout.trim();
}

function archiveModule(spec, repoPath, modulesOutDir, version) {
  fs.mkdirSync(modulesOutDir, { recursive: true });
  const archiveName = `${spec.repo_name}-${version}.tar.gz`;
  const archivePath = path.join(modulesOutDir, archiveName);
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

function archiveFramework(repoPath, frameworkOutDir, version) {
  fs.mkdirSync(frameworkOutDir, { recursive: true });
  const archiveName = `one-person-lab-framework-${version}.tar.gz`;
  const archivePath = path.join(frameworkOutDir, archiveName);
  fs.rmSync(archivePath, { force: true });
  run('git', ['archive', '--format=tar.gz', '--prefix=one-person-lab/', '-o', archivePath, 'HEAD'], {
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
  const rollbackVersion = readPreviousManifestVersion(options.previousManifest);
  const retainVersions = normalizeRetainVersions(options.retainVersions);
  const manifest = buildOplPackageManifest({
    version: options.version,
    owner: options.owner,
    rollbackVersion,
    retainVersions,
  });
  const version = manifest.opl_version;
  const modulesOutDir = path.join(options.outDir, 'modules');
  const frameworkOutDir = path.join(options.outDir, 'framework');
  const archives = [];
  const frameworkArchive = archiveFramework(repoRoot, frameworkOutDir, version);
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
  manifest.packages.framework_core.homebrew_formula = {
    package_name: 'opl-framework',
    version: manifest.packages.framework_core.version,
    source_head: frameworkArchive.head_sha,
    archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkArchive.head_sha}.tar.gz`,
    archive_kind: 'immutable_github_commit_archive',
    sha256_source: 'tap_sync_download_and_hash',
  };

  for (const spec of getOplPackageModuleSpecs()) {
    const repoPath = resolveModuleRepo(spec, options.cloneRoot);
    const archive = archiveModule(spec, repoPath, modulesOutDir, version);
    archives.push({
      ...archive,
      relative_path: `modules/${archive.file_name}`,
    });
    manifest.packages.modules[spec.module_id].source_archive = {
      file_name: archive.file_name,
      size: archive.size,
      sha256: archive.sha256,
    };
    manifest.packages.modules[spec.module_id].checksum = {
      algorithm: 'sha256',
      value: archive.sha256,
      file: 'SHA256SUMS',
    };
    manifest.packages.modules[spec.module_id].source_git = {
      repo_url: spec.repo_url,
      branch: archive.branch,
      head_sha: archive.head_sha,
    };
  }

  const checksumPath = writeChecksumFile(options.outDir, archives);
  const releaseDisciplineWorkflows = copyReleaseDisciplineWorkflows(options.outDir);
  const manifestPath = writeOplPackageManifest(path.join(options.outDir, 'opl-release-manifest.json'), manifest);
  const channelManifestPath = writeOplPackageManifest(
    path.join(options.outDir, 'opl-channel-manifest.json'),
    buildOplPackageChannelManifest(manifest),
  );
  console.log(JSON.stringify({
    status: 'completed',
    manifest: manifestPath,
    channel_manifest: channelManifestPath,
    checksums: checksumPath,
    release_discipline_workflows: releaseDisciplineWorkflows,
    modules_dir: modulesOutDir,
    framework_dir: frameworkOutDir,
    clone_root: options.cloneRoot,
    framework_core: {
      artifact: manifest.packages.framework_core.artifact,
      source_archive: manifest.packages.framework_core.source_archive,
      source_git: manifest.packages.framework_core.source_git,
    },
    modules: Object.values(manifest.packages.modules).map((entry) => ({
      module_id: entry.module_id,
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
