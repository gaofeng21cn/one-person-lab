import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  readJsonReceiptLedger,
  optionalString,
  readJsonFileOrNull,
  readJsonFileResult,
  readJsonRecordFile,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
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

test('shared JSON receipt ledger reads normalizes writes and upserts receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-json-receipt-ledger-'));
  const ledgerPath = path.join(root, 'ledger.json');
  const emptyLedger = () => ({
    surface_kind: 'test_receipt_ledger' as const,
    version: 'test.v1' as const,
    receipts: [] as { receipt_ref: string; status: string }[],
  });
  const normalizeReceipt = (value: unknown) => {
    if (!value || typeof value !== 'object' || !('receipt_ref' in value)) {
      return null;
    }
    const receiptRef = optionalString((value as { receipt_ref?: unknown }).receipt_ref);
    return receiptRef
      ? { receipt_ref: receiptRef, status: 'normalized' }
      : null;
  };

  try {
    assert.deepEqual(readJsonReceiptLedger(ledgerPath, emptyLedger, normalizeReceipt), emptyLedger());
    fs.writeFileSync(ledgerPath, '{');
    assert.deepEqual(readJsonReceiptLedger(ledgerPath, emptyLedger, normalizeReceipt), emptyLedger());

    fs.writeFileSync(ledgerPath, JSON.stringify({
      receipts: [
        { receipt_ref: 'one', status: 'old' },
        { receipt_ref: ' ' },
        { not_a_receipt: true },
      ],
    }));
    const ledger = readJsonReceiptLedger(ledgerPath, emptyLedger, normalizeReceipt);
    assert.deepEqual(ledger.receipts, [{ receipt_ref: 'one', status: 'normalized' }]);

    upsertJsonReceipts(ledger.receipts, [
      { receipt_ref: 'one', status: 'replaced' },
      { receipt_ref: 'two', status: 'new' },
    ], (current, next) => current.receipt_ref === next.receipt_ref);
    assert.deepEqual(ledger.receipts, [
      { receipt_ref: 'two', status: 'new' },
      { receipt_ref: 'one', status: 'replaced' },
    ]);

    writeJsonReceiptLedger(ledgerPath, ledger);
    assert.equal(readJsonFileResult(ledgerPath).status, 'resolved');
    assert.match(fs.readFileSync(ledgerPath, 'utf8'), /\n$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
