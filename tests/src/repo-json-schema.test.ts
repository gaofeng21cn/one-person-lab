import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveContainedRepoJsonFile,
  resolveContainedRepoPath,
} from '../../src/kernel/repo-contained-json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-repo-json-schema-'));
  fs.mkdirSync(path.join(root, 'contracts'));
  fs.writeFileSync(path.join(root, 'contracts', 'action.schema.json'), `${JSON.stringify({
    $id: 'https://fixture.local/action.schema.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      request: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    },
  })}\n`);
  return root;
}

test('contained repo path helpers retain the JSON-specific error contract', () => {
  const root = fixture();
  try {
    assert.throws(
      () => resolveContainedRepoJsonFile(root, 'https://example.invalid/schema.json', 'Fixture schema'),
      (error) => error instanceof Error
        && error.message === 'Fixture schema must be a repo-relative local JSON path: https://example.invalid/schema.json',
    );
    assert.throws(
      () => resolveContainedRepoPath(root, 'https://example.invalid/source', 'Fixture source'),
      (error) => error instanceof Error
        && error.message === 'Fixture source must be a repo-relative local path: https://example.invalid/source',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repo JSON Schema validation resolves a contained fragment and rejects invalid payloads', () => {
  const root = fixture();
  try {
    const valid = assertRepoJsonSchemaPayload({
      repoRoot: root,
      schemaRef: 'contracts/action.schema.json#/$defs/request',
      payload: { value: 2 },
      label: 'fixture input',
    });
    assert.equal(valid.status, 'valid');
    assert.throws(() => assertRepoJsonSchemaPayload({
      repoRoot: root,
      schemaRef: 'contracts/action.schema.json#/$defs/request',
      payload: { value: 0 },
      label: 'fixture input',
    }), /failed JSON Schema validation/);
    assert.throws(() => assertRepoJsonSchemaPayload({
      repoRoot: root,
      schemaRef: 'https://example.invalid/action.schema.json',
      payload: {},
      label: 'fixture input',
    }), /managed package checkout/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
