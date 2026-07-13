import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';

function stringRefs(value: unknown) {
  const scalar = stringValue(value);
  return scalar ? [scalar] : stringList(value);
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
  return recordList(payload.paper_line_owner_chain_results);
}

function ownerDeltaResults(payload: JsonRecord) {
  const result = payload.owner_delta_result;
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return [record(result)];
  }
  return recordList(result);
}

export function domainDispatchEvidencePayloadRefs(payload: JsonRecord) {
  const paperLineResults = paperLineOwnerChainResults(payload);
  const ownerDeltaResultRefs = ownerDeltaResults(payload);
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
  const ownerDeltaDomainReceiptRefs = ownerDeltaResultRefs.flatMap((result) => [
    ...stringList(result.owner_receipt_refs),
    ...stringList(result.quality_gate_receipt_refs),
  ]);
  const ownerDeltaTypedBlockerRefs = ownerDeltaResultRefs.flatMap((result) =>
    stringList(result.stable_typed_blocker_refs)
  );

  return {
    progressArtifactRefs: uniqueStrings([
      ...refsFromPayload(payload, [
        'artifact_refs',
        'artifact_ref',
        'output_refs',
        'output_ref',
        'progress_delta_refs',
        'progress_delta_ref',
        'diagnostic_refs',
        'diagnostic_ref',
        'negative_result_refs',
        'negative_result_ref',
      ]),
      ...ownerDeltaResultRefs.flatMap((result) => [
        ...stringList(result.artifact_refs),
        ...stringList(result.progress_delta_refs),
        ...stringList(result.diagnostic_refs),
        ...stringList(result.negative_result_refs),
      ]),
    ]),
    evidenceRefs: refsFromPayload(payload, ['evidence_refs', 'evidence_ref']),
    domainReceiptRefs: uniqueStrings([
      ...refsFromPayload(payload, [
        'domain_receipt_refs',
        'domain_receipt_ref',
        'receipt_refs',
        'receipt_ref',
      ]),
      ...paperLineOwnerReceiptRefs,
      ...ownerDeltaDomainReceiptRefs,
    ]),
    typedBlockerRefs: uniqueStrings([
      ...refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']),
      ...paperLineTypedBlockerRefs,
      ...ownerDeltaTypedBlockerRefs,
    ]),
    noRegressionRefs: refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']),
    ownerChainRefs: uniqueStrings([
      ...refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']),
      ...paperLineOwnerChainRefs,
    ]),
  };
}
