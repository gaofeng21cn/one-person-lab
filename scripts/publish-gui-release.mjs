#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultShellRoot = path.resolve(repoRoot, '..', 'opl-aion-shell');

function parseArgs(argv) {
  const parsed = {
    shellRoot: process.env.OPL_AION_SHELL_ROOT || defaultShellRoot,
    releaseRepo: process.env.OPL_RELEASE_REPO || 'gaofeng21cn/one-person-lab',
    version: process.env.OPL_RELEASE_VERSION || '26.4.25',
    build: true,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--no-build') {
      parsed.build = false;
      continue;
    }
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--shell-root') {
      parsed.shellRoot = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--repo') {
      parsed.releaseRepo = value;
      index += 1;
      continue;
    }
    if (token === '--version') {
      parsed.version = value;
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
    const detail = options.capture ? `\nstdout=${result.stdout || ''}\nstderr=${result.stderr || ''}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail}`);
  }
  return result;
}

function findArtifacts(shellRoot, version) {
  const releaseDir = path.join(shellRoot, 'release');
  if (!fs.existsSync(releaseDir)) {
    throw new Error(`Missing release directory: ${releaseDir}`);
  }
  const files = fs.readdirSync(releaseDir).filter((name) => {
    if (name.startsWith('One Person Lab-') && name.includes(version) && name.endsWith('.dmg')) {
      return true;
    }
    return /^latest.*\.yml$/.test(name);
  });
  if (!files.some((name) => name.endsWith('.dmg'))) {
    throw new Error(`No One Person Lab ${version} DMG found under ${releaseDir}`);
  }
  return files.map((name) => path.join(releaseDir, name));
}

function releaseExists(repo, tag) {
  const result = spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const tag = `v${options.version}`;

  if (!fs.existsSync(options.shellRoot)) {
    throw new Error(`Missing opl-aion-shell checkout: ${options.shellRoot}`);
  }

  if (options.build) {
    run('bun', ['run', 'build-mac:arm64'], { cwd: options.shellRoot });
  }

  const artifacts = findArtifacts(options.shellRoot, options.version);
  const uploadArgs = ['release', 'upload', tag, ...artifacts, '--repo', options.releaseRepo, '--clobber'];

  if (options.dryRun) {
    console.log(JSON.stringify({
      release_repo: options.releaseRepo,
      tag,
      shell_root: options.shellRoot,
      build: options.build,
      artifacts,
      create_release: !releaseExists(options.releaseRepo, tag),
      upload_command: ['gh', ...uploadArgs],
    }, null, 2));
    return;
  }

  if (!releaseExists(options.releaseRepo, tag)) {
    run('gh', ['release', 'create', tag, '--repo', options.releaseRepo, '--title', `One Person Lab ${options.version}`, '--notes', `One Person Lab desktop GUI release ${options.version}`]);
  }
  run('gh', uploadArgs);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
