type JsonRecord = Record<string, unknown>;

const DEFAULT_GROUPING_SEMANTICS =
  'domain_blocked_attention_refs_grouped_for_attention_only_raw_tail_counts_preserved';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function domainBlockedTypedBlockerAttention(input: {
  worklistSummary: JsonRecord;
  nextActionLedger: unknown;
  evidenceEnvelopeSummary: JsonRecord;
}) {
  const nextActionLedgerSummary = record(record(input.nextActionLedger).summary);
  const envelopeRefCount = numberValue(input.evidenceEnvelopeSummary.typed_blocker_ref_count);
  const nextRefCount =
    numberValue(input.worklistSummary.next_action_typed_blocker_ref_count)
    || numberValue(nextActionLedgerSummary.typed_blocker_ref_count);
  const nextUniqueRefCount =
    numberValue(input.worklistSummary.next_action_unique_typed_blocker_ref_count)
    || numberValue(nextActionLedgerSummary.unique_typed_blocker_ref_count);
  const nextGroupCount =
    numberValue(input.worklistSummary.next_action_typed_blocker_group_count)
    || numberValue(nextActionLedgerSummary.typed_blocker_group_count);
  return {
    typedBlockerRefCount: envelopeRefCount + nextRefCount,
    uniqueTypedBlockerRefCount: envelopeRefCount + nextUniqueRefCount,
    typedBlockerGroupCount: envelopeRefCount + nextGroupCount,
    nextActionTypedBlockerRefCount: nextRefCount,
    nextActionUniqueTypedBlockerRefCount: nextUniqueRefCount,
    nextActionTypedBlockerGroupCount: nextGroupCount,
    groupingSemantics:
      input.worklistSummary.next_action_typed_blocker_attention_semantics
      ?? nextActionLedgerSummary.typed_blocker_attention_semantics
      ?? DEFAULT_GROUPING_SEMANTICS,
  };
}
