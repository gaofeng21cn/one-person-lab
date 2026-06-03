import { buildCompactOwnerDeltaProjection } from '../owner-delta-compact-projection.ts';
import { countValue, record, stringList, stringValue, type JsonRecord } from './json-utils.ts';

export function buildWorklistCompactOwnerDeltaProjection(input: {
  drilldown: JsonRecord;
  openItems: JsonRecord[];
  nextSafeActions: JsonRecord[];
  counts: JsonRecord;
  compactEvidenceEnvelope: JsonRecord;
  domainDispatchEvidenceWorkorderSummary: JsonRecord;
  stageReplayMissingReceiptWorkorderSummary: JsonRecord;
}) {
  const firstOpenItem = record(input.openItems[0]);
  const ownerDeltaFirst = record(record(input.drilldown.attention_first_payload).owner_delta_first);
  return buildCompactOwnerDeltaProjection({
    ownerDeltaFirst: {
      ...ownerDeltaFirst,
      next_owner:
        stringValue(firstOpenItem.owner)
        ?? stringValue(firstOpenItem.domain_id)
        ?? stringValue(ownerDeltaFirst.next_owner),
      next_required_delta:
        stringValue(firstOpenItem.payload_requirement)
        ?? stringValue(ownerDeltaFirst.next_required_delta),
      required_return_shapes: [
        ...stringList(firstOpenItem.required_return_shapes),
        ...stringList(record(firstOpenItem.payload_workorder).required_return_shapes),
        ...(stringValue(firstOpenItem.claim_scope) === 'domain_dispatch_evidence_receipt'
          ? ['domain_owner_receipt_ref', 'typed_blocker_ref']
          : []),
      ],
    },
    nextSafeAction: input.nextSafeActions[0],
    countSummary: {
      openSafeActionCount: input.openItems.length,
      payloadRequiredCount: countValue(input.counts.open_safe_action_payload_required_item_count),
      payloadFreeCount: countValue(input.counts.open_safe_action_payload_free_item_count),
      blockedRefsOnlyCount:
        countValue(record(input.compactEvidenceEnvelope.summary).blocked_envelope_count),
      evidenceEnvelopeOpenCount:
        countValue(record(input.compactEvidenceEnvelope.summary).open_envelope_count),
      evidenceEnvelopeBlockedCount:
        countValue(record(input.compactEvidenceEnvelope.summary).blocked_envelope_count),
      domainDispatchWorkorderCount:
        countValue(input.domainDispatchEvidenceWorkorderSummary.workorder_count),
      stageReplayMissingReceiptWorkorderCount:
        countValue(input.stageReplayMissingReceiptWorkorderSummary.workorder_count),
    },
    fullDetailRefs: {
      evidence_worklist_ref: '/family_runtime_evidence_worklist',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
}
