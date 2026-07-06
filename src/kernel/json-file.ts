import fs from 'node:fs';

import {
  FrameworkContractError,
  isRecord,
} from './contract-validation.ts';

export type JsonRecord = Record<string, unknown>;

export type JsonRecordFileBoundary = {
  missingMessage: (filePath: string) => string;
  missingDetails: (filePath: string) => JsonRecord;
  invalidJsonMessage: (filePath: string) => string;
  invalidJsonDetails: (filePath: string, cause: string) => JsonRecord;
  invalidRootMessage: (filePath: string) => string;
  invalidRootDetails: (filePath: string) => JsonRecord;
};

export type JsonFileReadResult =
  | {
      status: 'missing';
      payload: null;
      error: null;
    }
  | {
      status: 'resolved';
      payload: unknown;
      error: null;
    }
  | {
      status: 'invalid_json';
      payload: null;
      error: string;
    };

export type JsonReceiptLedger<Receipt> = {
  receipts: Receipt[];
};

export function optionalString(value: unknown) { // reuse-first: allow central JSON scalar boundary helper.
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseJsonText(raw: string): unknown {
  return JSON.parse(raw); // reuse-first: allow central JSON file boundary parse.
}

export function formatJsonPayload(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`; // reuse-first: allow central JSON file boundary serialization.
}

export function writeJsonPayloadFile(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, formatJsonPayload(payload), 'utf8');
}

export function readJsonPayloadFile(filePath: string): unknown {
  return parseJsonText(fs.readFileSync(filePath, 'utf8'));
}

export function readJsonFileOrNull(filePath: string): unknown | null {
  try {
    return readJsonPayloadFile(filePath);
  } catch {
    return null;
  }
}

export function readJsonReceiptLedger<Receipt, Ledger extends JsonReceiptLedger<Receipt>>(
  filePath: string,
  emptyLedger: () => Ledger,
  normalizeReceipt: (value: unknown) => Receipt | null,
): Ledger {
  const parsed = readJsonFileOrNull(filePath);
  if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
    return emptyLedger();
  }
  return {
    ...emptyLedger(),
    receipts: parsed.receipts
      .map(normalizeReceipt)
      .filter((receipt): receipt is Receipt => Boolean(receipt)),
  };
}

export function writeJsonReceiptLedger<Ledger extends JsonReceiptLedger<unknown>>(
  filePath: string,
  ledger: Ledger,
) {
  writeJsonPayloadFile(filePath, ledger);
}

export function upsertJsonReceipts<Receipt>(
  receipts: Receipt[],
  nextReceipts: Receipt[],
  matches: (current: Receipt, next: Receipt) => boolean,
) {
  for (const next of nextReceipts) {
    const existingIndex = receipts.findIndex((current) => matches(current, next));
    if (existingIndex >= 0) {
      receipts[existingIndex] = next;
    } else {
      receipts.unshift(next);
    }
  }
}

export function readJsonFileResult(filePath: string): JsonFileReadResult {
  if (!fs.existsSync(filePath)) {
    return {
      status: 'missing',
      payload: null,
      error: null,
    };
  }

  try {
    return {
      status: 'resolved',
      payload: readJsonPayloadFile(filePath),
      error: null,
    };
  } catch (error) {
    return {
      status: 'invalid_json',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function readJsonRecordFile(filePath: string, boundary: JsonRecordFileBoundary): JsonRecord {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError(
        'contract_file_missing',
        boundary.missingMessage(filePath),
        boundary.missingDetails(filePath),
      );
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_json_invalid',
      boundary.invalidJsonMessage(filePath),
      boundary.invalidJsonDetails(
        filePath,
        error instanceof Error ? error.message : 'JSON parse failed',
      ),
    );
  }

  if (!isRecord(parsed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      boundary.invalidRootMessage(filePath),
      boundary.invalidRootDetails(filePath),
    );
  }

  return parsed;
}
