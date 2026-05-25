import fs from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

export type ExternalEvidenceReceiptSemantics =
  | 'domain_owned_receipt_ref'
  | 'domain_owned_typed_blocker_ref';

export type ExternalEvidenceReceiptClassification = {
  receipt_refs: string[];
  typed_blocker_refs: string[];
  reclassified_typed_blocker_refs: string[];
  receipt_semantics: ExternalEvidenceReceiptSemantics;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

export function normalizeExternalEvidenceReceiptSemantics(
  value: unknown,
): ExternalEvidenceReceiptSemantics | null {
  const text = stringValue(value);
  if (
    text === 'domain_owned_receipt_ref'
    || text === 'domain_owned_receipt_refs'
    || text === 'receipt_ref'
    || text === 'receipt_refs'
    || text === 'external_request_closure_ref'
  ) {
    return 'domain_owned_receipt_ref';
  }
  if (
    text === 'domain_owned_typed_blocker_ref'
    || text === 'domain_owned_typed_blocker_refs'
    || text === 'typed_blocker_ref'
    || text === 'typed_blocker_refs'
  ) {
    return 'domain_owned_typed_blocker_ref';
  }
  return null;
}

function jsonPointerValue(root: unknown, pointer: string) {
  if (!pointer || pointer === '/') {
    return root;
  }
  const parts = pointer.replace(/^\//, '').split('/').map((part) =>
    part.replace(/~1/g, '/').replace(/~0/g, '~')
  );
  let current = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !(part in current)) {
      return null;
    }
    current = current[part];
  }
  return current;
}

function workspaceJsonRefTarget(ref: string, domainWorkspacePath: string | null | undefined) {
  if (!domainWorkspacePath || !ref.includes('#')) {
    return null;
  }
  const [fileRef, pointer = ''] = ref.split('#', 2);
  if (!fileRef.endsWith('.json')) {
    return null;
  }
  const workspaceRoot = path.resolve(domainWorkspacePath);
  const filePath = path.isAbsolute(fileRef)
    ? path.resolve(fileRef)
    : path.resolve(workspaceRoot, fileRef);
  if (filePath !== workspaceRoot && !filePath.startsWith(`${workspaceRoot}${path.sep}`)) {
    return null;
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const target = jsonPointerValue(parsed, pointer);
    return isRecord(target) ? target : null;
  } catch {
    return null;
  }
}

function closureHasTypedBlocker(closure: JsonRecord) {
  return Boolean(
    stringValue(closure.typed_blocker_ref)
    || stringList(closure.typed_blocker_refs).length > 0
    || stringList(closure.domain_owned_typed_blocker_refs).length > 0
  );
}

function closureDeclaresReceipt(closure: JsonRecord) {
  if (closureHasTypedBlocker(closure)) {
    return false;
  }
  const closureState = stringValue(closure.closure_state);
  if (closureState !== 'closed_by_verified_external_receipt_ref') {
    return false;
  }
  return Boolean(
    stringValue(closure.receipt_ref)
    || stringList(closure.receipt_refs).length > 0
    || stringValue(closure.receipt_shape)
    || stringValue(closure.accepted_return_shape)
  );
}

export function classifyExternalEvidenceReceiptRefs(input: {
  receipt: JsonRecord;
  domainWorkspacePath?: string | null;
  requestId?: string | null;
}): ExternalEvidenceReceiptClassification {
  const baseReceiptRefs = uniqueStrings([
    ...stringList(input.receipt.receipt_refs),
    ...stringList(input.receipt.domain_receipt_refs),
  ]);
  const typedBlockerRefs = stringList(input.receipt.typed_blocker_refs);
  const semantics = normalizeExternalEvidenceReceiptSemantics(input.receipt.receipt_semantics)
    ?? normalizeExternalEvidenceReceiptSemantics(input.receipt.receipt_classification)
    ?? normalizeExternalEvidenceReceiptSemantics(input.receipt.accepted_return_shape);
  if (semantics === 'domain_owned_receipt_ref') {
    return {
      receipt_refs: uniqueStrings([...baseReceiptRefs, ...typedBlockerRefs]),
      typed_blocker_refs: [],
      reclassified_typed_blocker_refs: typedBlockerRefs,
      receipt_semantics: 'domain_owned_receipt_ref',
    };
  }
  if (semantics === 'domain_owned_typed_blocker_ref') {
    return {
      receipt_refs: baseReceiptRefs,
      typed_blocker_refs: typedBlockerRefs,
      reclassified_typed_blocker_refs: [],
      receipt_semantics: 'domain_owned_typed_blocker_ref',
    };
  }

  const directReceiptRefs = typedBlockerRefs.filter((ref) => {
    const target = workspaceJsonRefTarget(ref, input.domainWorkspacePath);
    return target ? closureDeclaresReceipt(target) : false;
  });
  const duplicateReceiptRefs = typedBlockerRefs.filter((ref) => baseReceiptRefs.includes(ref));
  const reclassifiedTypedBlockerRefs = uniqueStrings([
    ...directReceiptRefs,
    ...duplicateReceiptRefs,
  ]);
  const activeTypedBlockerRefs = typedBlockerRefs.filter((ref) =>
    !reclassifiedTypedBlockerRefs.includes(ref)
  );
  return {
    receipt_refs: uniqueStrings([...baseReceiptRefs, ...reclassifiedTypedBlockerRefs]),
    typed_blocker_refs: uniqueStrings(activeTypedBlockerRefs),
    reclassified_typed_blocker_refs: uniqueStrings(reclassifiedTypedBlockerRefs),
    receipt_semantics: activeTypedBlockerRefs.length > 0
      ? 'domain_owned_typed_blocker_ref'
      : 'domain_owned_receipt_ref',
  };
}
