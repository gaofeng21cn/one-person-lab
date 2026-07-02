import {
  buildFeedbackOpsReadModel,
  buildFeedbackOpsReconcileReceipt,
  submitDeliveryFeedbackEvent,
  type FeedbackKind,
} from '../../../modules/foundry-lab/agent-lab-feedbackops.ts';
import { buildOplDeveloperModeSurface } from '../../../modules/connect/system-installation/developer-mode.ts';
import { buildOplEndpoints } from '../../../modules/runway/opl-runtime-paths.ts';
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

function takeValue(args: string[], index: number, spec: CommandSpec, option: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw buildUsageError(`Missing value for option: ${option}.`, spec, { option });
  }
  return value;
}

function parseFeedbackSubmitArgs(args: string[], spec: CommandSpec) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (![
      '--target-agent',
      '--delivery-ref',
      '--feedback-ref',
      '--feedback-kind',
      '--feedback-text-ref',
      '--external-suite-ref',
      '--developer-work-order-ref',
      '--completion-ref',
      '--blocker-ref',
      '--idempotency-key',
      '--source-ref',
    ].includes(token)) {
      throw buildUsageError(`Unknown option for feedback submit: ${token}.`, spec, { option: token });
    }
    const value = takeValue(args, index, spec, token);
    parsed[token] = value;
    index += 1;
  }
  for (const option of ['--target-agent', '--delivery-ref', '--feedback-ref']) {
    if (!parsed[option]) {
      throw buildUsageError(`feedback submit requires ${option}.`, spec, { option });
    }
  }
  const feedbackKind = parsed['--feedback-kind'] ?? 'quality_gap';
  if (!FEEDBACK_KINDS.has(feedbackKind)) {
    throw buildUsageError(`Unsupported feedback kind: ${feedbackKind}.`, spec, { option: '--feedback-kind' });
  }
  return {
    targetAgentId: parsed['--target-agent'],
    deliveryRef: parsed['--delivery-ref'],
    feedbackRef: parsed['--feedback-ref'],
    feedbackKind: feedbackKind as FeedbackKind,
    feedbackTextRef: parsed['--feedback-text-ref'],
    externalSuiteRef: parsed['--external-suite-ref'],
    developerWorkOrderCandidateRef: parsed['--developer-work-order-ref'],
    completionRef: parsed['--completion-ref'],
    blockerRef: parsed['--blocker-ref'],
    idempotencyKey: parsed['--idempotency-key'],
    sourceRef: parsed['--source-ref'],
  };
}

export function buildFeedbackSubmitPayload(args: string[], spec: CommandSpec) {
  return {
    version: 'g2',
    feedbackops_submit: submitDeliveryFeedbackEvent(parseFeedbackSubmitArgs(args, spec)),
  };
}

export function buildFeedbackReadPayload() {
  return {
    version: 'g2',
    feedbackops: buildFeedbackOpsReadModel(),
  };
}

export function buildFeedbackReconcilePayload() {
  const developerMode = buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: 'fast' });
  return {
    version: 'g2',
    feedbackops_reconcile: buildFeedbackOpsReconcileReceipt({ developerMode }),
  };
}
