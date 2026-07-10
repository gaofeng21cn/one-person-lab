import {
  buildFeedbackOpsReadModel,
  buildFeedbackOpsReconcileReceipt,
  submitDeliveryFeedbackEvent,
  type FeedbackKind,
} from '../../../modules/foundry-lab/agent-lab-feedbackops.ts';
import { buildOplDeveloperModeSurface } from '../../../modules/connect/system-installation/developer-mode.ts';
import { buildOplEndpoints } from '../../../kernel/opl-runtime-endpoints.ts';
import { parseCommandOptions } from './command-registry.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

const FEEDBACK_KINDS = new Set([
  'bug',
  'quality_gap',
  'missing_requirement',
  'usability',
  'style',
  'safety',
  'owner_gate',
]);

function parseFeedbackSubmitArgs(args: string[], spec: CommandSpec) {
  const parsed = parseCommandOptions(args, spec, Object.fromEntries([
    'target-agent',
    'delivery-ref',
    'feedback-ref',
    'feedback-kind',
    'feedback-text-ref',
    'external-suite-ref',
    'developer-work-order-ref',
    'completion-ref',
    'blocker-ref',
    'idempotency-key',
    'source-ref',
  ].map((name) => [name, { type: 'string' as const }])));
  for (const option of ['target-agent', 'delivery-ref', 'feedback-ref']) {
    if (!parsed[option]) {
      throw buildUsageError(`feedback submit requires --${option}.`, spec, { option: `--${option}` });
    }
  }
  const feedbackKind = String(parsed['feedback-kind'] ?? 'quality_gap');
  if (!FEEDBACK_KINDS.has(feedbackKind)) {
    throw buildUsageError(`Unsupported feedback kind: ${feedbackKind}.`, spec, { option: '--feedback-kind' });
  }
  return {
    targetAgentId: parsed['target-agent'] as string,
    deliveryRef: parsed['delivery-ref'] as string,
    feedbackRef: parsed['feedback-ref'] as string,
    feedbackKind: feedbackKind as FeedbackKind,
    feedbackTextRef: parsed['feedback-text-ref'] as string | undefined,
    externalSuiteRef: parsed['external-suite-ref'] as string | undefined,
    developerWorkOrderCandidateRef: parsed['developer-work-order-ref'] as string | undefined,
    completionRef: parsed['completion-ref'] as string | undefined,
    blockerRef: parsed['blocker-ref'] as string | undefined,
    idempotencyKey: parsed['idempotency-key'] as string | undefined,
    sourceRef: parsed['source-ref'] as string | undefined,
  };
}

export function buildFeedbackSubmitPayload(args: string[], spec: CommandSpec) {
  return {
    version: 'g2',
    feedbackops_submit: submitDeliveryFeedbackEvent(parseFeedbackSubmitArgs(args, spec)),
  };
}

export function buildFeedbackReadPayload() {
  const developerMode = buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: 'full' });
  return {
    version: 'g2',
    feedbackops: buildFeedbackOpsReadModel({ developerMode }),
  };
}

export function buildFeedbackReconcilePayload() {
  const developerMode = buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: 'full' });
  return {
    version: 'g2',
    feedbackops_reconcile: buildFeedbackOpsReconcileReceipt({ developerMode }),
  };
}
