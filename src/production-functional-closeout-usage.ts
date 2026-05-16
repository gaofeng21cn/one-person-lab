import { summarizeStageAttemptUsageProjections } from './family-runtime-stage-attempt-usage.ts';
import type { stageAttemptToPayload } from './family-runtime-stage-attempts.ts';

export function summarizeProductionCloseoutUsage(
  attempts: Array<ReturnType<typeof stageAttemptToPayload>>,
) {
  return summarizeStageAttemptUsageProjections(
    attempts.map((attempt) => attempt.usage_projection),
    'production_functional_closeout',
  );
}
