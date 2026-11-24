import { countValue } from '../../../kernel/json-record.ts';

type EvidenceEnvelopeSummary = {
  blocked_envelope_count?: unknown;
};

export function buildZeroOpenCompletionGuard(input: {
  openWorklistItemCount: number;
  evidenceEnvelopeSummary: EvidenceEnvelopeSummary;
}) {
  const blockedRefsOnlyEnvelopeCount =
    countValue(input.evidenceEnvelopeSummary.blocked_envelope_count);
  const blockedRefsOnlyAttentionRemains =
    input.openWorklistItemCount === 0 && blockedRefsOnlyEnvelopeCount > 0;
  return {
    status: blockedRefsOnlyAttentionRemains
      ? 'blocked_refs_only_attention_remains'
      : 'no_blocked_refs_only_attention',
    zero_open_worklist_item_count: input.openWorklistItemCount === 0,
    zero_open_worklist_blocked_refs_only_envelope_count: blockedRefsOnlyEnvelopeCount,
    zero_open_worklist_blocked_refs_only_attention_remains:
      blockedRefsOnlyAttentionRemains,
    zero_open_worklist_is_completion_claim: false,
    zero_open_worklist_is_domain_ready: false,
    zero_open_worklist_is_production_ready: false,
    worklist_item_is_completion_claim: false,
    can_authorize_domain_ready: false,
    can_claim_production_ready: false,
    refs_only: true,
  };
}

export function zeroOpenCompletionGuardSummaryFields(
  guard: ReturnType<typeof buildZeroOpenCompletionGuard>,
) {
  return {
    zero_open_worklist_blocked_refs_only_envelope_count:
      guard.zero_open_worklist_blocked_refs_only_envelope_count,
    zero_open_worklist_blocked_refs_only_attention_remains:
      guard.zero_open_worklist_blocked_refs_only_attention_remains,
    zero_open_worklist_is_completion_claim:
      guard.zero_open_worklist_is_completion_claim,
    zero_open_worklist_is_domain_ready:
      guard.zero_open_worklist_is_domain_ready,
    zero_open_worklist_is_production_ready:
      guard.zero_open_worklist_is_production_ready,
  };
}
