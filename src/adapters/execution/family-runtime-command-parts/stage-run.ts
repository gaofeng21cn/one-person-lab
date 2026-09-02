import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';

export function parseStageRunArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  const [action, identityOrFlag, maybeFlag, maybeAttempt] = rest;
  if (action === 'query') {
    if (!identityOrFlag || maybeFlag || maybeAttempt) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run query requires one workflow id.', {
        usage: 'opl family-runtime stage-run query <workflow_id>',
      });
    }
    return { mode: 'stage_run_query', workflowId: identityOrFlag };
  }
  if (action === 'recover-closeout') {
    if (!identityOrFlag || maybeFlag !== '--attempt' || !maybeAttempt) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime stage-run recover-closeout requires a StageRun id and an Attempt id.',
        { usage: 'opl family-runtime stage-run recover-closeout <stage_run_id> --attempt <attempt_id>' },
      );
    }
    return {
      mode: 'stage_run_recover_closeout',
      stageRunId: identityOrFlag,
      stageAttemptId: maybeAttempt,
    };
  }
  return null;
}
