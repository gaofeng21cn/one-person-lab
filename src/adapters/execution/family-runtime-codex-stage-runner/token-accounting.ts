import { stringValue as optionalString, type JsonRecord } from '../../../kernel/json-record.ts';
import {
  codexStageRunnerCostSummaryFrom,
} from '../family-runtime-codex-session-usage.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';

export function withCodexTokenAccounting(
  closeoutPacket: TypedStageCloseoutPacket | null,
  costSummary: ReturnType<typeof codexStageRunnerCostSummaryFrom>,
) {
  if (!closeoutPacket) {
    return closeoutPacket;
  }
  const tokenUsage = costSummary.token_usage;
  const observedTokenUsage = tokenUsage
    ? {
        status: 'observed',
        input_tokens: tokenUsage.input_tokens,
        cached_input_tokens: tokenUsage.cached_input_tokens,
        output_tokens: tokenUsage.output_tokens,
        reasoning_output_tokens: tokenUsage.reasoning_output_tokens,
        total_tokens: tokenUsage.total_tokens,
        source: costSummary.telemetry_source,
        source_ref: costSummary.source_ref,
        observed_at: costSummary.observed_at,
        billing_boundary: costSummary.billing_boundary,
      }
    : null;
  const usageRefs = [
    optionalString(costSummary.source_ref),
    optionalString(costSummary.session_usage_refs?.session_ref),
  ].filter((ref): ref is string => Boolean(ref));
  const mergedUsageRefs = [
    ...new Set([
      ...(closeoutPacket.usage_refs ?? []),
      ...usageRefs,
    ]),
  ];
  const withStageLogAccounting = (stageLog: JsonRecord | undefined) => {
    if (!stageLog) {
      return undefined;
    }
    const stageLogUsageRefs = [
      ...new Set([
        ...(
          Array.isArray(stageLog.token_usage_refs)
            ? stageLog.token_usage_refs.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
            : []
        ),
        ...mergedUsageRefs,
      ]),
    ];
    return {
      ...stageLog,
      ...(observedTokenUsage ? { token_usage: observedTokenUsage } : {}),
      ...(stageLogUsageRefs.length > 0 ? { token_usage_refs: stageLogUsageRefs } : {}),
    };
  };
  return {
    ...closeoutPacket,
    ...(observedTokenUsage ? { token_usage: observedTokenUsage } : {}),
    ...(mergedUsageRefs.length > 0 ? { usage_refs: mergedUsageRefs } : {}),
    ...(costSummary.session_usage_refs ? { session_usage_refs: costSummary.session_usage_refs } : {}),
    cost_summary: costSummary,
    ...(closeoutPacket.user_stage_log
      ? { user_stage_log: withStageLogAccounting(closeoutPacket.user_stage_log) }
      : {}),
    ...(closeoutPacket.stage_log_summary
      ? { stage_log_summary: withStageLogAccounting(closeoutPacket.stage_log_summary) }
      : {}),
    ...(closeoutPacket.human_stage_log
      ? { human_stage_log: withStageLogAccounting(closeoutPacket.human_stage_log) }
      : {}),
  };
}
