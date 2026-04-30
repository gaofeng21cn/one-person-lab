#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildOplPackageManifest,
  getOplPackageModuleSpecs,
  sha256File,
  writeOplPackageManifest,
} from '../src/package-distribution.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const parsed = {
    version: process.env.OPL_RELEASE_VERSION || undefined,
    outDir: path.join(repoRoot, 'dist', 'packages'),
    cloneRoot: path.join(repoRoot, 'dist', 'package-sources'),
    owner: process.env.OPL_PACKAGES_OWNER || undefined,
    previousManifest: process.env.OPL_PREVIOUS_PACKAGE_MANIFEST || undefined,
    retainVersions: process.env.OPL_PACKAGE_RETAIN_VERSIONS || undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--version') {
      parsed.version = value;
      index += 1;
      continue;
    }
    if (token === '--out-dir') {
      parsed.outDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--clone-root') {
      parsed.cloneRoot = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--owner') {
      parsed.owner = value;
      index += 1;
      continue;
    }
    if (token === '--previous-manifest') {
      parsed.previousManifest = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--retain-versions') {
      parsed.retainVersions = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
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
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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

function writeChecksumFile(outDir, archives) {
  const checksumPath = path.join(outDir, 'SHA256SUMS');
  const lines = archives
    .map((archive) => `${archive.sha256}  modules/${archive.file_name}`)
    .sort();
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return checksumPath;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
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
  const archives = [];

  for (const spec of getOplPackageModuleSpecs()) {
    const repoPath = resolveModuleRepo(spec, options.cloneRoot);
    const archive = archiveModule(spec, repoPath, modulesOutDir, version);
    archives.push(archive);
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
  const manifestPath = writeOplPackageManifest(path.join(options.outDir, 'opl-release-manifest.json'), manifest);
  const channelManifestPath = writeOplPackageManifest(path.join(options.outDir, 'opl-channel-manifest.json'), manifest);
  console.log(JSON.stringify({
    status: 'completed',
    manifest: manifestPath,
    channel_manifest: channelManifestPath,
    checksums: checksumPath,
    modules_dir: modulesOutDir,
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
