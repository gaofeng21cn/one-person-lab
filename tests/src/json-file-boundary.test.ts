import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  optionalString,
  readJsonFileOrNull,
  readJsonFileResult,
  readJsonRecordFile,
} from '../../src/kernel/json-file.ts';

const testBoundary = {
  missingMessage: (filePath: string) => `Missing JSON: ${filePath}.`,
  missingDetails: (filePath: string) => ({ file: filePath }),
  invalidJsonMessage: (filePath: string) => `Invalid JSON: ${filePath}.`,
  invalidJsonDetails: (filePath: string, cause: string) => ({ file: filePath, cause }),
  invalidRootMessage: () => 'JSON root must be an object.',
  invalidRootDetails: (filePath: string) => ({ file: filePath }),
};

test('shared JSON file boundary keeps caller-owned error shape and read status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-json-file-boundary-'));
  try {
    const missingPath = path.join(root, 'missing.json');
    assert.throws(
      () => readJsonRecordFile(missingPath, testBoundary),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_file_missing'
        && error.message === `Missing JSON: ${missingPath}.`
        && error.details?.file === missingPath,
    );

    const invalidPath = path.join(root, 'invalid.json');
    fs.writeFileSync(invalidPath, '{');
    assert.throws(
      () => readJsonRecordFile(invalidPath, testBoundary),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_json_invalid'
        && error.message === `Invalid JSON: ${invalidPath}.`
        && error.details?.file === invalidPath
        && typeof error.details?.cause === 'string',
    );
    assert.equal(readJsonFileOrNull(invalidPath), null);
    assert.equal(readJsonFileResult(invalidPath).status, 'invalid_json');

    const arrayPath = path.join(root, 'array.json');
    fs.writeFileSync(arrayPath, '[]');
    assert.throws(
      () => readJsonRecordFile(arrayPath, testBoundary),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid'
        && error.message === 'JSON root must be an object.'
        && error.details?.file === arrayPath,
    );

    const objectPath = path.join(root, 'object.json');
    fs.writeFileSync(objectPath, '{"value":" ok "}');
    const record = readJsonRecordFile(objectPath, testBoundary);
    assert.equal(optionalString(record.value), 'ok');
    assert.equal(readJsonFileResult(objectPath).status, 'resolved');
    assert.equal(readJsonFileResult(missingPath).status, 'missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
