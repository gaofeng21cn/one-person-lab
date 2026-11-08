import type { StageQualityAttemptRole, StageQualityHardStopClass, StageQualityOutcome, StageQualityReviewAttemptRole, StageQualityReviewVerdict } from "./types.ts";
import { STAGE_QUALITY_ATTEMPT_ROLES, STAGE_QUALITY_HARD_STOP_CLASSES, STAGE_QUALITY_OUTCOMES } from "./types.ts";
import { FrameworkContractError } from "../../../kernel/contract-validation.ts";
import { evidenceRefStrings, requiredText } from "./primitives.ts";

export function normalizeStageQualityAttemptRole(value: unknown): StageQualityAttemptRole {
  if (typeof value === 'string' && STAGE_QUALITY_ATTEMPT_ROLES.includes(value as StageQualityAttemptRole)) {
    return value as StageQualityAttemptRole;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unknown Stage quality attempt role.', {
    attempt_role: value ?? null,
    allowed: STAGE_QUALITY_ATTEMPT_ROLES,
  });
}

export function normalizeStageQualityOutcome(value: unknown): StageQualityOutcome {
  if (typeof value === 'string' && STAGE_QUALITY_OUTCOMES.includes(value as StageQualityOutcome)) {
    return value as StageQualityOutcome;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unknown Stage quality outcome.', {
    outcome: value ?? null,
    allowed: STAGE_QUALITY_OUTCOMES,
  });
}

export function stageQualityOutcomeFromEnvelope(input: {
  attemptRole: StageQualityReviewAttemptRole;
  envelope: Record<string, unknown>;
}) {
  if (Object.hasOwn(input.envelope, 'verdict')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality Attempt must return outcome; verdict is reserved for controller-generated review receipts.',
      {
        attempt_role: input.attemptRole,
        forbidden_field: 'verdict',
        required_field: 'outcome',
      },
    );
  }
  return normalizeStageQualityOutcome(input.envelope.outcome);
}

export function stageQualityAttemptOutcomeFromEnvelope(input: {
  attemptRole: StageQualityAttemptRole;
  envelope: Record<string, unknown>;
}) {
  if (input.attemptRole === 'reviewer' || input.attemptRole === 're_reviewer') {
    return stageQualityOutcomeFromEnvelope({
      attemptRole: input.attemptRole,
      envelope: input.envelope,
    });
  }
  const forbiddenFields = ['outcome', 'verdict'].filter((field) => Object.hasOwn(input.envelope, field));
  if (forbiddenFields.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Producer and repairer Stage quality Attempts must not return outcome or verdict.',
      {
        attempt_role: input.attemptRole,
        forbidden_fields: forbiddenFields,
        controller_owned_receipt_field: 'verdict',
      },
    );
  }
  return null;
}

export function optionalAgentRefList(value: unknown, field: string) {
  // Optional agent-authored ref list: absent or empty stays empty, present entries accept the
  // locator string or the exact-ref object shape, and any other entry fails closed rather than
  // being silently dropped.
  if (value === undefined || value === null) return [] as string[];
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length === 0) return [] as string[];
  return evidenceRefStrings(entries, field);
}

export function optionalEnvelopeRefs(
  envelope: Record<string, unknown>,
  singularField: string,
  pluralField: string,
) {
  // The plural field is an agent-authored ref list (locator strings or exact-ref objects); the
  // singular field accepts one such ref. Filtering non-strings out silently used to surface as
  // a misleading "requires a typed blocker ref" error even when the Attempt had cited one.
  const singular = optionalAgentRefList(envelope[singularField], singularField);
  const plural = optionalAgentRefList(envelope[pluralField], pluralField);
  return [...new Set([...singular, ...plural])];
}

export function validateStageQualityReviewHardStopOutcome(input: {
  outcome: Extract<StageQualityOutcome, 'blocked' | 'human_gate'>;
  envelope: Record<string, unknown>;
}) {
  const hardStopClass = input.envelope.hard_stop_class;
  if (
    typeof hardStopClass !== 'string'
    || !STAGE_QUALITY_HARD_STOP_CLASSES.includes(hardStopClass as StageQualityHardStopClass)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review hard-stop outcome requires a declared canonical hard_stop_class.',
      {
        outcome: input.outcome,
        hard_stop_class: hardStopClass ?? null,
        allowed: STAGE_QUALITY_HARD_STOP_CLASSES,
      },
    );
  }
  const blockedReason = requiredText(input.envelope.blocked_reason, 'blocked_reason');
  const typedBlockerRefs = optionalEnvelopeRefs(input.envelope, 'typed_blocker_ref', 'typed_blocker_refs');
  const humanGateRefs = optionalEnvelopeRefs(input.envelope, 'human_gate_ref', 'human_gate_refs');
  if (input.outcome === 'blocked' && typedBlockerRefs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review blocked outcome requires a domain-owned typed blocker ref.',
      { outcome: input.outcome, hard_stop_class: hardStopClass },
    );
  }
  if (
    input.outcome === 'human_gate'
    && (hardStopClass !== 'human_decision_required' || humanGateRefs.length === 0)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review human_gate outcome requires hard_stop_class=human_decision_required and a human-gate ref.',
      {
        outcome: input.outcome,
        hard_stop_class: hardStopClass,
        human_gate_refs: humanGateRefs,
      },
    );
  }
  return {
    outcome: input.outcome,
    hard_stop_class: hardStopClass as StageQualityHardStopClass,
    blocked_reason: blockedReason,
    typed_blocker_refs: typedBlockerRefs,
    human_gate_refs: humanGateRefs,
  } as const;
}

export function stageReviewVerdictForOutcome(outcome: StageQualityOutcome): StageQualityReviewVerdict {
  if (outcome === 'pass' || outcome === 'repair_required' || outcome === 'quality_debt') {
    return outcome;
  }
  return 'hard_stop';
}
