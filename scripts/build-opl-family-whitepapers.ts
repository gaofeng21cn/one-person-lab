#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type WhitepaperEntry = {
  id: string;
  display_name: string;
  repo_slug: string;
  repo_env: string;
  default_repo_dir: string;
  profile: string;
  source: string;
  public_html_url: string;
  public_pdf_url: string;
};

type Registry = {
  schema_version: number;
  whitepapers: WhitepaperEntry[];
};

const frameworkRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(frameworkRepo, 'contracts', 'opl-framework', 'public-whitepaper-registry.json');
const runnerPath = path.join(frameworkRepo, 'scripts', 'run-domain-whitepaper.ts');

function fail(message: string): never {
  throw new Error(message);
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    fail([`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function git(repo: string, args: string[]) {
  return run('git', ['-C', repo, ...args], repo);
}

function canonicalWorkspaceRoot() {
  const commonDir = git(frameworkRepo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return path.dirname(path.dirname(commonDir));
}

function readRegistry(): Registry {
  const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Registry;
  if (parsed.schema_version !== 1 || !Array.isArray(parsed.whitepapers) || parsed.whitepapers.length !== 4) {
    fail('Public whitepaper registry must declare exactly four schema v1 entries.');
  }
  const ids = new Set(parsed.whitepapers.map(({ id }) => id));
  if (ids.size !== parsed.whitepapers.length) fail('Public whitepaper registry ids must be unique.');
  return parsed;
}

function parseArgs(argv: string[]) {
  let mode: 'preview' | 'release' = 'preview';
  let only: string | null = null;
  let list = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--list') list = true;
    else if (arg === '--mode') {
      const value = argv[++index];
      if (value !== 'preview' && value !== 'release') fail('--mode must be preview or release.');
      mode = value;
    } else if (arg === '--only') {
      only = argv[++index] ?? fail('--only requires a whitepaper id.');
    } else fail(`Unknown argument: ${arg}`);
  }
  return { mode, only, list };
}

function repoRoot(entry: WhitepaperEntry) {
  if (entry.id === 'opl-framework') return path.resolve(process.env[entry.repo_env] || frameworkRepo);
  return path.resolve(process.env[entry.repo_env] || path.join(canonicalWorkspaceRoot(), entry.default_repo_dir));
}

function requireReleaseSource(repo: string) {
  const branch = git(repo, ['branch', '--show-current']);
  const dirty = git(repo, ['status', '--short', '--untracked-files=no']);
  const head = git(repo, ['rev-parse', 'HEAD']);
  const remote = git(repo, ['rev-parse', 'origin/main']);
  if (branch !== 'main' || dirty || head !== remote) {
    fail(`Release build requires clean main == origin/main: ${repo}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = readRegistry();
  const selected = args.only ? registry.whitepapers.filter(({ id }) => id === args.only) : registry.whitepapers;
  if (selected.length === 0) fail(`Unknown whitepaper id: ${args.only}`);

  const resolved = selected.map((entry) => ({ ...entry, repo_root: repoRoot(entry) }));
  if (args.list) {
    process.stdout.write(`${JSON.stringify({ mode: args.mode, whitepapers: resolved }, null, 2)}\n`);
    return;
  }

  const builds = resolved.map((entry) => {
    if (!fs.existsSync(path.join(entry.repo_root, entry.profile))) {
      fail(`Missing whitepaper profile for ${entry.id}: ${path.join(entry.repo_root, entry.profile)}`);
    }
    if (args.mode === 'release') requireReleaseSource(entry.repo_root);
    const stdout = run(process.execPath, [
      '--experimental-strip-types',
      runnerPath,
      '--repo-root', entry.repo_root,
      '--profile', entry.profile,
    ], frameworkRepo);
    return {
      id: entry.id,
      repo_slug: entry.repo_slug,
      repo_root: entry.repo_root,
      git_commit: git(entry.repo_root, ['rev-parse', 'HEAD']),
      verification: JSON.parse(stdout),
    };
  });

  const manifest = {
    schema_version: 'opl_family_whitepaper_build.v1',
    mode: args.mode,
    generated_at: new Date().toISOString(),
    renderer_commit: git(frameworkRepo, ['rev-parse', 'HEAD']),
    builds,
  };
  const output = path.join(frameworkRepo, 'tmp', 'pdfs', 'opl-family-whitepaper-build.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
