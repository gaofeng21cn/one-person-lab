#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJsonFile } from './script-json-boundary.mjs';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJsonObject = readJsonFile;
const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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

function readGitValue(repoPath, args) {
  return run('git', args, { cwd: repoPath, capture: true }).stdout.trim();
}

function copyRuntimePayload(repoPath, payloadRoot, compiledDist) {
  const packageJson = readJsonObject(path.join(repoPath, 'package.json'));
  if (!Array.isArray(packageJson.files)) {
    throw new Error('OPL Base package.json files must define the runtime payload allowlist');
  }
  const entries = ['package.json', 'package-lock.json', ...packageJson.files];
  for (const relativePath of entries) {
    const sourcePath = relativePath === 'dist' ? compiledDist : path.join(repoPath, relativePath);
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-base-runtime-'));
  try {
    const compiledDist = path.join(tempRoot, 'compiled');
    run('npm', ['run', 'build', '--', '--outDir', compiledDist], { cwd: repoPath, capture: true });
    const payloadRoot = path.join(tempRoot, 'payload');
    copyRuntimePayload(repoPath, payloadRoot, compiledDist);
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


const outDir = path.resolve(process.argv[2] || 'dist/framework-artifact');
const version = readJsonFile(path.join(repoRoot, 'package.json')).version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Framework version must be stable SemVer.');
const archive = archiveFramework(repoRoot, outDir, version);
fs.writeFileSync(path.join(outDir, 'framework-artifact.json'), JSON.stringify({version, source_commit: archive.head_sha, ...archive}, null, 2) + '\n');
console.log(JSON.stringify({version, ...archive}));
