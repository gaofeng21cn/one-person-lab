import fs from 'node:fs';

import {
  FrameworkContractError,
  isRecord,
} from './contract-validation.ts';
import type { JsonRecord } from './json-record.ts';
import { stringValue } from './json-record.ts';

export type { JsonRecord } from './json-record.ts';
export { stringValue as optionalString } from './json-record.ts';

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

export function parseJsonText(raw: string): unknown {
  return JSON.parse(raw);
}

export function formatJsonPayload(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function writeJsonPayloadFile(filePath: string, payload: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, formatJsonPayload(payload), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
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

type JsonReceipt = {
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
};

type JsonReceiptVerifyInput = {
  receipt_ref?: string | null;
};

export type JsonReceiptLedgerAdapterOptions<
  Receipt extends JsonReceipt,
  Input,
  Ledger extends JsonReceiptLedger<Receipt>,
  AuthorityBoundary,
> = {
  ledgerPath: () => string;
  ensureStateDir: () => void;
  emptyLedger: () => Ledger;
  normalizeReceipt: (value: unknown) => Receipt | null;
  normalizeInput: (input: Input) => Receipt;
  isEligible: (input: Input) => boolean;
  recordSurfaceKind: string;
  noEligibleStatus: string;
  verifySurfaceKind: string;
  blocker: {
    blocker_kind: string;
    blocker_id: string;
    required_owner: string;
  };
  authorityBoundary: () => AuthorityBoundary;
};

export function verifyJsonReceipt<
  Receipt extends JsonReceipt,
  Ledger extends JsonReceiptLedger<Receipt>,
  AuthorityBoundary,
>(options: {
  read: () => Ledger;
  write: (ledger: Ledger) => void;
  ledgerPath: () => string;
  verifySurfaceKind: string;
  blocker: { blocker_kind: string; blocker_id: string; required_owner: string };
  authorityBoundary: () => AuthorityBoundary;
}, input?: JsonReceiptVerifyInput) {
  const ledger = options.read();
  const requestedReceiptRef = stringValue(input?.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: options.verifySurfaceKind,
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: options.ledgerPath(),
      blocker: { ...options.blocker },
      authority_boundary: options.authorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  options.write(ledger);
  return {
    surface_kind: options.verifySurfaceKind,
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: options.ledgerPath(),
    receipt: verified,
    authority_boundary: options.authorityBoundary(),
  };
}

export function createJsonReceiptLedgerAdapter<
  Receipt extends JsonReceipt,
  Input,
  Ledger extends JsonReceiptLedger<Receipt>,
  AuthorityBoundary,
>(
  options: JsonReceiptLedgerAdapterOptions<
    Receipt,
    Input,
    Ledger,
    AuthorityBoundary
  >,
) {
  const read = () => readJsonReceiptLedger(
    options.ledgerPath(),
    options.emptyLedger,
    options.normalizeReceipt,
  );

  const write = (ledger: Ledger) => {
    options.ensureStateDir();
    writeJsonReceiptLedger(options.ledgerPath(), ledger);
  };

  const upsert = (receipts: Receipt[], nextReceipts: Receipt[]) => {
    upsertJsonReceipts(receipts, nextReceipts, (current, next) =>
      current.receipt_ref === next.receipt_ref
    );
  };

  const record = (inputs: Input[]) => {
    const receipts = inputs
      .filter(options.isEligible)
      .map(options.normalizeInput);
    if (receipts.length === 0) {
      return {
        surface_kind: options.recordSurfaceKind,
        status: options.noEligibleStatus,
        recorded_receipt_count: 0,
        receipt_refs: [],
        ledger_file: options.ledgerPath(),
        receipts: [],
      };
    }

    const ledger = read();
    upsert(ledger.receipts, receipts);
    write(ledger);
    return {
      surface_kind: options.recordSurfaceKind,
      status: 'recorded',
      recorded_receipt_count: receipts.length,
      receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
      ledger_file: options.ledgerPath(),
      receipts,
    };
  };

  const verify = (input?: JsonReceiptVerifyInput) => verifyJsonReceipt({
    read,
    write,
    ledgerPath: options.ledgerPath,
    verifySurfaceKind: options.verifySurfaceKind,
    blocker: options.blocker,
    authorityBoundary: options.authorityBoundary,
  }, input);

  return {
    read,
    write,
    upsert,
    record,
    verify,
    list: () => read().receipts,
  };
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
