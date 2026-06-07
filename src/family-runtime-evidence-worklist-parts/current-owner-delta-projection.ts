import {
  buildCurrentOwnerDeltaReadModel,
  buildDefaultNextActionFromCurrentOwnerDelta,
} from '../current-owner-delta-projection.ts';
import { countValue, record, type JsonRecord } from './json-utils.ts';
import { worklistOwnerId } from './owner-normalization.ts';

function normalizeWorklistDefaultNextActionOwner(action: JsonRecord): JsonRecord {
  return {
    ...action,
    owner: worklistOwnerId(action.owner),
    current_owner: worklistOwnerId(action.current_owner),
  };
}

function suppressDefaultNextAction<T extends JsonRecord>(readModel: T): T {
  return {
    ...readModel,
    next_safe_action_or_none: null,
    default_summary: {
      ...record(readModel.default_summary),
      next_action_kind: null,
    },
  };
}

export function buildWorklistCurrentOwnerDeltaReadModel(input: {
  drilldown: JsonRecord;
  openItems: JsonRecord[];
  nextSafeActions: JsonRecord[];
  counts: JsonRecord;
  compactEvidenceEnvelope: JsonRecord;
  domainDispatchEvidenceWorkorderSummary: JsonRecord;
  stageReplayMissingReceiptWorkorderSummary: JsonRecord;
}) {
  const ownerDeltaFirst = record(record(input.drilldown.attention_first_payload).owner_delta_first);
  const readModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst,
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
      owner_delta_first_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/attention_first_payload/owner_delta_first',
      evidence_worklist_ref: '/family_runtime_evidence_worklist',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
  return input.openItems.length > 0 ? readModel : suppressDefaultNextAction(readModel);
}

export function buildWorklistOwnerDeltaActionProjection(input: Parameters<typeof buildWorklistCurrentOwnerDeltaReadModel>[0]) {
  const currentOwnerDeltaReadModel = buildWorklistCurrentOwnerDeltaReadModel(input);
  const ownerDeltaDefaultNextAction = buildDefaultNextActionFromCurrentOwnerDelta(
    currentOwnerDeltaReadModel.current_owner_delta,
  );
  return {
    currentOwnerDeltaReadModel,
    defaultNextSafeActions: ownerDeltaDefaultNextAction
      ? [normalizeWorklistDefaultNextActionOwner(ownerDeltaDefaultNextAction)]
      : [],
    auditWorklistNextSafeActions: input.nextSafeActions,
  };
}
