import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes, canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import { foundryContentDigest } from '../../src/modules/foundry/index.ts';
import { FileFoundryObjectStore, foundryStoragePaths } from '../../src/modules/ledger/index.ts';

test('canonical JSON follows the RFC 8785 serialization example', () => {
  assert.equal(canonicalJsonText({
    numbers: [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
    string: "€$\u000f\nA'B\"\\\\\"/",
    literals: [null, true, false],
  }), '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\\"\\\\\\\\\\\"/"}');
});

test('canonical JSON orders object keys by UTF-16 code units', () => {
  const value = {
    '\ufb33': 'Hebrew letter dalet with dagesh',
    '\r': 'Carriage Return',
    '1': 'One',
    '\ud83d\ude00': 'Emoji: Grinning Face',
    '\u0080': 'Control',
    '\u00f6': 'Latin Small Letter O With Diaeresis',
    '\u20ac': 'Euro Sign',
  };
  assert.equal(
    canonicalJsonText(value),
    '{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew letter dalet with dagesh"}',
  );
});

test('canonical JSON rejects non-I-JSON strings and non-JSON objects', () => {
  assert.throws(() => canonicalJsonText({ value: '\ud800' }), /lone Unicode surrogates/);
  assert.throws(() => canonicalJsonText({ ['\udc00']: true }), /lone Unicode surrogates/);
  assert.throws(() => canonicalJsonText(new Date(0)), /plain JSON objects/);
});

test('Foundry object address hashes the exact stored canonical bytes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-jcs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = { z: 0, a: ['exact', true] };
  const bytes = canonicalJsonBytes(value);
  assert.equal(bytes.at(-1), '}'.charCodeAt(0));
  const expectedDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  assert.equal(foundryContentDigest(value), expectedDigest);

  const stored = await new FileFoundryObjectStore(root).put(value);
  const storedFile = path.join(foundryStoragePaths(root).objects, `${stored.digest.slice(7)}.json`);
  assert.equal(stored.digest, expectedDigest);
  assert.deepEqual(fs.readFileSync(storedFile), bytes);
});
