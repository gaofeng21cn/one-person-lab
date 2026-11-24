import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildProofDirectoryIndex,
  runPackProofIndex,
} from '../../src/authority/packages/proof-directory-index.ts';
import { runCliReadOnly } from './cli/helpers.ts';

test('buildProofDirectoryIndex sorts entries deterministically, hashes bytes, skips symlinks, and respects excludes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-proof-index-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-proof-outside-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'z.txt'), 'zebra');
  fs.writeFileSync(path.join(root, 'nested/a.bin'), Buffer.from([1, 2, 3, 4]));
  fs.writeFileSync(path.join(root, 'skip.json'), '{}');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope');
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'escape-link.txt'));

  const indexed = buildProofDirectoryIndex(root, { excludePaths: ['skip.json'] });
  assert.equal(indexed.surface_kind, 'opl_proof_directory_index');
  assert.equal(indexed.status, 'developer_evidence_only');
  assert.deepEqual(
    indexed.entries.map((entry) => entry.relative_path),
    ['nested/a.bin', 'z.txt'],
  );
  assert.equal(
    indexed.entries[0].sha256,
    crypto.createHash('sha256').update(Buffer.from([1, 2, 3, 4])).digest('hex'),
  );
  assert.equal(indexed.authority_boundary.can_write_domain_truth, false);
  assert.equal(indexed.authority_boundary.can_sign_owner_receipt, false);
});

test('runPackProofIndex and CLI opl pack proof-index auto-exclude --write path inside output-dir', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-proof-index-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha');
  fs.writeFileSync(path.join(root, 'ignore.log'), 'ignored');
  const writePath = path.join(root, 'sub/directory-index.json');

  const direct = runPackProofIndex({
    outputDir: root,
    excludePaths: ['ignore.log'],
    writePath,
  });
  assert.equal(direct.pack_proof_index.entry_count, 1);
  assert.equal(direct.pack_proof_index.entries[0].relative_path, 'a.txt');
  assert.equal(fs.existsSync(writePath), true);

  const cliOutput = await runCliReadOnly([
    'pack',
    'proof-index',
    '--output-dir',
    root,
    '--exclude',
    'ignore.log',
    '--write',
    writePath,
  ]);
  assert.equal(cliOutput.version, 'g2');
  assert.deepEqual(
    cliOutput.pack_proof_index.entries.map((entry: { relative_path: string }) => entry.relative_path),
    ['a.txt'],
  );
});
