import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readCodexUserInstructions,
  writeCodexUserInstructions,
} from '../../src/modules/console/codex-personalization.ts';

test('Codex user instructions use SHA preconditions, backup, and atomic readback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-personalization-'));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  process.env.OPL_STATE_DIR = path.join(root, 'opl-state');

  try {
    const missing = readCodexUserInstructions();
    assert.equal(missing.status, 'missing');
    assert.equal(missing.sha256, null);

    const first = writeCodexUserInstructions({
      content: 'Always answer directly.',
      expectedSha256: null,
    }).codex_user_instructions_write;
    assert.equal(first.status, 'saved');
    assert.equal(first.backup_path, null);
    assert.equal(first.readback.content, 'Always answer directly.\n');

    const second = writeCodexUserInstructions({
      content: 'Always answer in Chinese.\n',
      expectedSha256: first.next_sha256,
    }).codex_user_instructions_write;
    assert.equal(second.status, 'saved');
    assert.ok(second.backup_path);
    assert.equal(fs.readFileSync(second.backup_path!, 'utf8'), 'Always answer directly.\n');
    assert.equal(second.readback.content, 'Always answer in Chinese.\n');

    assert.throws(
      () => writeCodexUserInstructions({ content: 'stale', expectedSha256: first.next_sha256 }),
      /changed after they were loaded/,
    );
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
