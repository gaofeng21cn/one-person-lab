import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const generator = path.join(repoRoot, 'scripts/first-party-package-payload.mjs');
const sourceRepoUrl = 'https://github.com/example/example-agent.git';

function git(repo: string, args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function writeFile(repo: string, relativePath: string, content: string | Buffer) {
  const filePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function commitAll(repo: string, message: string) {
  git(repo, ['add', '--all']);
  git(repo, ['commit', '--quiet', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

function createSourceRepo(root: string) {
  const repo = path.join(root, 'source');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.name', 'Payload Test']);
  git(repo, ['config', 'user.email', 'payload-test@example.invalid']);
  writeFile(repo, 'plugins/example-agent/.codex-plugin/plugin.json', '{"name":"example-agent","version":"0.3.0"}\n');
  writeFile(repo, 'plugins/example-agent/assets/icon.bin', Buffer.from([0, 1, 2, 255]));
  writeFile(repo, 'plugins/example-agent/skills/example-agent/SKILL.md', '# Example 0.3.0\n');
  const previousCommit = commitAll(repo, 'example 0.3.0');
  writeFile(repo, 'plugins/example-agent/.codex-plugin/plugin.json', '{"name":"example-agent","version":"0.3.1"}\n');
  writeFile(repo, 'plugins/example-agent/skills/example-agent/SKILL.md', '# Example 0.3.1\n');
  const sourceCommit = commitAll(repo, 'example 0.3.1');
  return { repo, previousCommit, sourceCommit };
}

function generatorArgs(input: {
  repo: string;
  sourceCommit: string;
  output: string;
  sourceRoot?: string;
  check?: boolean;
}) {
  return [
    generator,
    '--package-id', 'example-agent',
    '--package-version', '0.3.1',
    '--repo', input.repo,
    '--source-repo-url', sourceRepoUrl,
    '--source-commit', input.sourceCommit,
    '--source-root', input.sourceRoot ?? 'plugins/example-agent',
    '--output', input.output,
    ...(input.check ? ['--check'] : []),
  ];
}

function runGenerator(input: Parameters<typeof generatorArgs>[0]) {
  return JSON.parse(execFileSync(process.execPath, generatorArgs(input), {
    cwd: repoRoot,
    encoding: 'utf8',
  })) as Record<string, unknown>;
}

function sha256(content: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

test('tracked package payload generator writes a new SemVer payload from exact Git blobs and ignores dirty worktree bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const outputDir = path.join(root, 'payloads');
  const previousPayload = path.join(outputDir, 'example-agent-0.3.0.json');
  const output = path.join(outputDir, 'example-agent-0.3.1.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(previousPayload, 'immutable-previous-payload\n');

  writeFile(source.repo, 'plugins/example-agent/.codex-plugin/plugin.json', 'dirty worktree bytes\n');
  assert.notEqual(git(source.repo, ['status', '--short']), '');
  const first = runGenerator({ repo: source.repo, sourceCommit: source.sourceCommit, output });
  const firstBytes = fs.readFileSync(output);
  const payload = JSON.parse(firstBytes.toString('utf8')) as Record<string, any>;

  assert.equal(first.status, 'written');
  assert.equal(first.file_count, 3);
  assert.equal(first.payload_sha256, sha256(firstBytes));
  assert.equal(payload.surface_kind, 'opl_agent_package_payload_manifest');
  assert.equal(payload.package_id, 'example-agent');
  assert.equal(payload.package_version, '0.3.1');
  assert.equal(payload.source_repo, sourceRepoUrl);
  assert.equal(payload.source_commit, source.sourceCommit);
  assert.equal(payload.source_root, 'plugins/example-agent');
  assert.deepEqual(payload.files.map((entry: Record<string, string>) => entry.path), [
    '.codex-plugin/plugin.json',
    'assets/icon.bin',
    'skills/example-agent/SKILL.md',
  ]);
  assert.equal(
    payload.files[0].sha256,
    sha256('{"name":"example-agent","version":"0.3.1"}\n'),
  );
  assert.equal(payload.files[2].sha256, sha256('# Example 0.3.1\n'));
  assert.match(payload.files[0].source_url, new RegExp(`/${source.sourceCommit}/plugins/example-agent/\\.codex-plugin/plugin\\.json$`));
  assert.equal(firstBytes.at(-1), 10);
  assert.equal(fs.readFileSync(previousPayload, 'utf8'), 'immutable-previous-payload\n');

  const second = runGenerator({ repo: source.repo, sourceCommit: source.sourceCommit, output });
  assert.equal(second.payload_sha256, first.payload_sha256);
  assert.deepEqual(fs.readFileSync(output), firstBytes);
  const checked = runGenerator({ repo: source.repo, sourceCommit: source.sourceCommit, output, check: true });
  assert.equal(checked.status, 'checked');
  assert.deepEqual(fs.readdirSync(outputDir).sort(), ['example-agent-0.3.0.json', 'example-agent-0.3.1.json']);
});

test('--check rejects tracked digest drift without rewriting the payload', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const output = path.join(root, 'payloads', 'example-agent-0.3.1.json');
  runGenerator({ repo: source.repo, sourceCommit: source.sourceCommit, output });
  const drifted = JSON.parse(fs.readFileSync(output, 'utf8')) as Record<string, any>;
  drifted.files[0].sha256 = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(output, `${JSON.stringify(drifted, null, 2)}\n`);
  const driftedBytes = fs.readFileSync(output);

  const result = spawnSync(process.execPath, generatorArgs({
    repo: source.repo,
    sourceCommit: source.sourceCommit,
    output,
    check: true,
  }), { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Tracked payload manifest drift detected/);
  assert.deepEqual(fs.readFileSync(output), driftedBytes);
});

test('tracked package payload generator rejects non-exact commits, missing source paths, and non-repositories', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const output = path.join(root, 'payload.json');
  const cases = [
    {
      args: generatorArgs({ repo: source.repo, sourceCommit: source.sourceCommit.slice(0, 12), output }),
      error: /exact lowercase 40-character Git SHA/,
    },
    {
      args: generatorArgs({ repo: source.repo, sourceCommit: 'f'.repeat(40), output }),
      error: /does not exist as a local Git commit object/,
    },
    {
      args: generatorArgs({ repo: source.repo, sourceCommit: source.sourceCommit, output, sourceRoot: 'plugins/missing' }),
      error: /Source root does not exist at exact commit/,
    },
    {
      args: generatorArgs({ repo: path.join(root, 'not-a-repo'), sourceCommit: source.sourceCommit, output }),
      error: /Not a Git repository/,
      prepare: () => fs.mkdirSync(path.join(root, 'not-a-repo')),
    },
  ];
  for (const invalid of cases) {
    invalid.prepare?.();
    const result = spawnSync(process.execPath, invalid.args, { cwd: repoRoot, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, invalid.error);
    assert.equal(fs.existsSync(output), false);
  }
});
