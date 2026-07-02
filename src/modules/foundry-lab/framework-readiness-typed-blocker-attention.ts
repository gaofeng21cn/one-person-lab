type JsonRecord = Record<string, unknown>;

const DEFAULT_GROUPING_SEMANTICS =
  'domain_blocked_attention_refs_grouped_for_attention_only_raw_tail_counts_preserved';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function typedBlockerRefsFromEnvelopeProjection(value: unknown) {
  return uniqueStrings(recordList(record(value).envelopes).flatMap((envelope) =>
    stringList(envelope.typed_blocker_refs)
  ));
}

function typedBlockerRefsFromNextActionLedger(value: unknown) {
  const ledger = record(value);
  return uniqueStrings([
    ...recordList(ledger.typed_blocker_groups).flatMap((group) =>
      stringValue(group.typed_blocker_ref) ? [stringValue(group.typed_blocker_ref) as string] : []
    ),
    ...recordList(ledger.next_action_items).flatMap((item) => {
      const requirement = record(item.evidence_requirement);
      return [
        ...stringList(requirement.typed_blocker_refs),
        ...stringList(item.typed_blocker_refs),
        ...(stringValue(requirement.typed_blocker_ref) ? [stringValue(requirement.typed_blocker_ref) as string] : []),
        ...(stringValue(item.typed_blocker_ref) ? [stringValue(item.typed_blocker_ref) as string] : []),
      ];
    }),
  ]);
}

export function domainBlockedTypedBlockerAttention(input: {
  worklistSummary: JsonRecord;
  nextActionLedger: unknown;
  evidenceEnvelopeSummary: JsonRecord;
  evidenceEnvelopeProjection?: unknown;
}) {
  const nextActionLedgerSummary = record(record(input.nextActionLedger).summary);
  const envelopeRefs = typedBlockerRefsFromEnvelopeProjection(input.evidenceEnvelopeProjection);
  const nextRefs = typedBlockerRefsFromNextActionLedger(input.nextActionLedger);
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
  const uniqueTypedBlockerRefCount = envelopeRefs.length + nextRefs.length > 0
    ? uniqueStrings([...envelopeRefs, ...nextRefs]).length
    : envelopeRefCount + nextUniqueRefCount;
  const groupingSemantics =
    envelopeRefs.length + nextRefs.length > 0
      ? 'domain_owned_typed_blocker_refs_union_grouped_for_attention_only_raw_tail_counts_preserved'
      : DEFAULT_GROUPING_SEMANTICS;
  return {
    typedBlockerRefCount: envelopeRefCount + nextRefCount,
    uniqueTypedBlockerRefCount,
    typedBlockerGroupCount: envelopeRefCount + nextGroupCount,
    nextActionTypedBlockerRefCount: nextRefCount,
    nextActionUniqueTypedBlockerRefCount: nextUniqueRefCount,
    nextActionTypedBlockerGroupCount: nextGroupCount,
    nextActionGroupingSemantics:
      input.worklistSummary.next_action_typed_blocker_attention_semantics
      ?? nextActionLedgerSummary.typed_blocker_attention_semantics
      ?? DEFAULT_GROUPING_SEMANTICS,
    groupingSemantics,
  };
}
