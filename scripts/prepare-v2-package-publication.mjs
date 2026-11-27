#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildPackage,
  createPackageSourceArchive,
  extractPackageSourceArchive,
  packageSourceArchiveDigest,
  verifyReleaseLock,
} from '@opl/pack';

const packageIdPattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function git(root, args, encoding = 'utf8') {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding,
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
}

function committedFiles(root, commit) {
  const files = new Map();
  for (const record of git(root, ['ls-tree', '-rz', commit]).split('\0').filter(Boolean)) {
    const boundary = record.indexOf('\t');
    const [mode, kind, object] = record.slice(0, boundary).split(' ');
    if (kind === 'blob') files.set(record.slice(boundary + 1), { mode, object });
  }
  return files;
}

function verifyFrozenSource(staged, paths, files) {
  for (const relative of paths) {
    const selected = files.get(relative);
    if (!selected || !['100644', '100755'].includes(selected.mode)) {
      throw new Error(`Package file was not committed as a regular Git blob: ${relative}`);
    }
    const absolute = path.join(staged, relative);
    const bytes = fs.readFileSync(absolute);
    const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (gitBlob !== selected.object) throw new Error(`Package file differs from the selected Git blob: ${relative}`);
    fs.chmodSync(absolute, selected.mode === '100755' ? 0o755 : 0o644);
  }
}

export function prepareV2PackagePublication({ ownerRoot, sourceCommit, packageId, packageVersion, outputDirectory }) {
  if (!packageIdPattern.test(packageId ?? '') || !versionPattern.test(packageVersion ?? '')
    || !/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) {
    throw new Error('Expected a Package id, stable SemVer, and exact owner Git commit.');
  }
  const sourceRoot = fs.realpathSync(ownerRoot);
  if (fs.realpathSync(git(sourceRoot, ['rev-parse', '--show-toplevel']).trim()) !== sourceRoot
    || git(sourceRoot, ['rev-parse', '--verify', `${sourceCommit}^{commit}`]).trim() !== sourceCommit) {
    throw new Error('Package selection must refer to an exact commit at the owner repository root.');
  }
  const timestamp = new Date(Number(git(sourceRoot, ['show', '-s', '--format=%ct', sourceCommit]).trim()) * 1000);
  const output = path.resolve(outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(output, '.package-candidate-'));
  try {
    const sourceArchive = path.join(temporary, 'owner.tar');
    const staged = path.join(temporary, 'owner');
    git(sourceRoot, ['archive', '--format=tar', `--output=${sourceArchive}`, sourceCommit]);
    extractPackageSourceArchive(sourceArchive, staged);

    const built = buildPackage(staged, { gitCommit: sourceCommit, builtAt: timestamp.toISOString() });
    if (built.manifest.identity.id !== packageId || built.manifest.identity.version !== packageVersion) {
      throw new Error(`Owner descriptor does not select ${packageId}@${packageVersion}.`);
    }
    verifyFrozenSource(staged, built.lock.paths, committedFiles(sourceRoot, sourceCommit));
    fs.chmodSync(built.lock_path, 0o644);

    const filename = `${packageId}-${packageVersion}.oplpack`;
    const candidatePath = path.join(temporary, filename);
    const archiveSha256 = createPackageSourceArchive(staged, candidatePath,
      [...built.lock.paths, 'opl-release.lock.json'].sort(), { mtime: timestamp });
    const unpacked = path.join(temporary, 'verified');
    extractPackageSourceArchive(candidatePath, unpacked);
    const verified = verifyReleaseLock(unpacked);
    if (verified.digest !== built.digest || verified.lock.git_commit !== sourceCommit) {
      throw new Error('Candidate archive does not verify against the frozen Package source.');
    }

    const archivePath = path.join(output, filename);
    try {
      fs.linkSync(candidatePath, archivePath);
    } catch (error) {
      if (error.code !== 'EEXIST' || packageSourceArchiveDigest(archivePath) !== archiveSha256) throw error;
    }
    return {
      package_format: 'v2',
      archive_path: archivePath,
      archive_sha256: archiveSha256,
      package_id: packageId,
      package_version: packageVersion,
      source_commit: sourceCommit,
      content_digest: built.digest,
      file_count: verified.lock.file_count,
      manifest: built.manifest,
      lock: verified.lock,
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    'owner-root': { type: 'string' },
    'source-commit': { type: 'string' },
    'package-id': { type: 'string' },
    'package-version': { type: 'string' },
    'output-directory': { type: 'string' },
  } });
  const result = prepareV2PackagePublication({
    ownerRoot: values['owner-root'],
    sourceCommit: values['source-commit'],
    packageId: values['package-id'],
    packageVersion: values['package-version'],
    outputDirectory: values['output-directory'],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
