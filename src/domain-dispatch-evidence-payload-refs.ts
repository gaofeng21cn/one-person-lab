import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function stringRefs(value: unknown) {
  const scalar = stringValue(value);
  return scalar ? [scalar] : stringList(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }
    return stringList(value);
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function paperLineOwnerChainResults(payload: JsonRecord) {
  return Array.isArray(payload.paper_line_owner_chain_results)
    ? payload.paper_line_owner_chain_results.filter(isRecord)
    : [];
}

export function domainDispatchEvidencePayloadRefs(payload: JsonRecord) {
  const paperLineResults = paperLineOwnerChainResults(payload);
  const paperLineOwnerReceiptRefs = paperLineResults.flatMap((result) =>
    stringList(result.owner_receipt_refs)
  );
  const paperLineTypedBlockerRefs = paperLineResults.flatMap((result) =>
    stringList(result.stable_typed_blocker_refs)
  );
  const paperLineOwnerChainRefs = paperLineResults.flatMap((result) => [
    ...stringList(result.progress_delta_refs),
    ...stringList(result.ai_reviewer_gate_receipt_refs),
    ...stringList(result.artifact_movement_refs),
    ...stringList(result.human_gate_or_resume_refs),
    ...stringRefs(result.no_forbidden_write_proof_ref),
  ]);

  return {
    evidenceRefs: refsFromPayload(payload, ['evidence_refs', 'evidence_ref']),
    domainReceiptRefs: uniqueStrings([
      ...refsFromPayload(payload, [
        'domain_receipt_refs',
        'domain_receipt_ref',
        'receipt_refs',
        'receipt_ref',
      ]),
      ...paperLineOwnerReceiptRefs,
    ]),
    typedBlockerRefs: uniqueStrings([
      ...refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']),
      ...paperLineTypedBlockerRefs,
    ]),
    noRegressionRefs: refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']),
    ownerChainRefs: uniqueStrings([
      ...refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']),
      ...paperLineOwnerChainRefs,
    ]),
  };
}
