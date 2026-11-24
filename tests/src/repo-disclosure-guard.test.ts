import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectRepoDisclosure } from '../../src/authority/workspace/repo-disclosure-guard.ts';

const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

function git(cwd: string, ...args: string[]) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout;
}

test('inspectRepoDisclosure detects secrets, personal workspace paths, and private paths in working tree and git history', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-disclosure-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test User');

  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/logo.png'), PNG_BYTES);
  fs.writeFileSync(path.join(root, 'README.md'), 'Clean doc\n');
  fs.writeFileSync(path.join(root, 'leaked-history.txt'), 'path=/Users/alice/workspace/secret\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial commit', '--quiet');

  // Remove leaked file from HEAD so only reachable history has it.
  fs.unlinkSync(path.join(root, 'leaked-history.txt'));
  fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify({
    reviewed_binary_paths: ['assets/logo.png'],
  }));
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'remove leak and add policy', '--quiet');

  const headClean = inspectRepoDisclosure({ sourceRoot: root, history: false, policyPath: 'policy.json' });
  assert.equal(headClean.status, 'passed');
  assert.equal(headClean.finding_count, 0);

  const historyBlocked = inspectRepoDisclosure({ sourceRoot: root, history: true, policyPath: 'policy.json' });
  assert.equal(historyBlocked.status, 'blocked');
  assert.equal(historyBlocked.findings.some((f) => f.path === 'leaked-history.txt' && f.rule === 'personal workspace path' && f.commit !== null), true);

  // Add working-tree violations.
  fs.mkdirSync(path.join(root, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'secrets/app.json'), '{}');
  fs.writeFileSync(path.join(root, 'cfg.py'), 'api_key = "1234567890abcdef"\n');
  git(root, 'add', 'secrets/app.json', 'cfg.py');
  const workBlocked = inspectRepoDisclosure({ sourceRoot: root, history: false, policyPath: 'policy.json' });
  assert.equal(workBlocked.status, 'blocked');
  assert.equal(workBlocked.findings.some((f) => f.path === 'secrets/app.json' && f.rule === 'private file path'), true);
  assert.equal(workBlocked.findings.some((f) => f.path === 'cfg.py' && f.rule === 'secret value in configuration'), true);
});
