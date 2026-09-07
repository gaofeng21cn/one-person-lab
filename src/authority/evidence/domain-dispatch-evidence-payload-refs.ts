import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { readStandardAgentDescriptorForDomainFromPackagePort } from '../../kernel/agent-package-readiness-port.ts';

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

export function domainDispatchWorkItemIdentity(
  domainId: string | null,
  value: JsonRecord,
): { work_item_id?: string; [field: string]: string | undefined } {
  const descriptor = domainId ? readStandardAgentDescriptorForDomainFromPackagePort(domainId) : null;
  const field = descriptor?.dispatch_evidence_projection?.work_item_id_field
    ?? descriptor?.interface.inventory_projection?.field_map.work_item_id
    ?? 'work_item_id';
  const canonical = stringValue(value.work_item_id) ?? stringValue(value[field]);
  return canonical ? {
    work_item_id: canonical,
    [field]: stringValue(value[field]) ?? canonical,
  } : {};
}

function ownerDeltaResults(payload: JsonRecord) {
  const result = payload.owner_delta_result;
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return [record(result)];
  }
  return recordList(result);
}

export function domainDispatchEvidencePayloadRefs(payload: JsonRecord, route: JsonRecord = {}) {
  const domainId = stringValue(record(route.target_identity).domain_id)
    ?? stringValue(route.domain_id) ?? stringValue(payload.domain_id);
  const projection = domainId
    ? readStandardAgentDescriptorForDomainFromPackagePort(domainId)?.dispatch_evidence_projection
    : null;
  const projectedRefs = (role: 'domain_receipt_refs' | 'typed_blocker_refs' | 'owner_chain_refs') =>
    (projection?.result_collections ?? []).flatMap((collection) =>
      recordList(payload[collection.field]).flatMap((result) =>
        (collection.ref_fields[role] ?? []).flatMap((field) => stringRefs(result[field]))
      )
    );
  const ownerDeltaResultRefs = ownerDeltaResults(payload);
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
      ...projectedRefs('domain_receipt_refs'),
      ...ownerDeltaDomainReceiptRefs,
    ]),
    typedBlockerRefs: uniqueStrings([
      ...refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']),
      ...projectedRefs('typed_blocker_refs'),
      ...ownerDeltaTypedBlockerRefs,
    ]),
    noRegressionRefs: refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']),
    ownerChainRefs: uniqueStrings([
      ...refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']),
      ...projectedRefs('owner_chain_refs'),
    ]),
  };
}
