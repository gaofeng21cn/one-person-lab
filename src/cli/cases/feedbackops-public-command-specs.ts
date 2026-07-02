import {
  buildFeedbackReadPayload,
  buildFeedbackReconcilePayload,
  buildFeedbackSubmitPayload,
} from '../modules/feedbackops-public-payloads.ts';
import { assertNoArgs } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

export function buildPublicFeedbackOpsCommandSpecs(): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'feedback submit': {
      usage:
        'opl feedback submit --target-agent <id> --delivery-ref <ref> --feedback-ref <ref> [--feedback-kind <kind>] [--developer-work-order-ref <ref>]',
      summary:
        'Capture explicit user delivery feedback as a refs-only FeedbackOps event without writing target-agent truth.',
      examples: [
        'opl feedback submit --target-agent mas --delivery-ref paper:obesity/current --feedback-ref user-feedback:2026-07-02 --feedback-kind quality_gap --json',
      ],
      group: 'feedback',
      handler: (args) => buildFeedbackSubmitPayload(args, specs['feedback submit']),
    },
    'feedback read': {
      usage: 'opl feedback read',
      summary: 'Read the refs-only FeedbackOps event ledger projection.',
      examples: ['opl feedback read --json'],
      group: 'feedback',
      handler: (args) => {
        assertNoArgs(args, specs['feedback read']);
        return buildFeedbackReadPayload();
      },
    },
    'feedback reconcile': {
      usage: 'opl feedback reconcile',
      summary:
        'Reconcile FeedbackOps events into suite-ready, developer-mode-gated, executable, or terminal status buckets.',
      examples: ['opl feedback reconcile --json'],
      group: 'feedback',
      handler: (args) => {
        assertNoArgs(args, specs['feedback reconcile']);
        return buildFeedbackReconcilePayload();
      },
    },
  };
  return specs;
}
