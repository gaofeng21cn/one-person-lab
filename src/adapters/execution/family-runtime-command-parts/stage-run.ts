import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';

export function parseStageRunArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  const [action, identityOrFlag, ...flags] = rest;
  if (action === 'query') {
    if (!identityOrFlag || flags.length > 0) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run query requires one workflow id.', {
        usage: 'opl family-runtime stage-run query <workflow_id>',
      });
    }
    return { mode: 'stage_run_query', workflowId: identityOrFlag };
  }
  if (action === 'watch') {
    if (!identityOrFlag) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run watch requires one workflow id.', {
        usage: 'opl family-runtime stage-run watch <workflow_id> [--interval-ms <n>] [--timeout-ms <n>]',
      });
    }
    let intervalMs = 250;
    let timeoutMs = 30_000;
    for (let index = 0; index < flags.length; index += 2) {
      const flag = flags[index];
      const rawValue = flags[index + 1];
      if ((flag !== '--interval-ms' && flag !== '--timeout-ms') || !rawValue) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run watch has invalid options.', {
          usage: 'opl family-runtime stage-run watch <workflow_id> [--interval-ms <n>] [--timeout-ms <n>]',
        });
      }
      const value = Number(rawValue);
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run watch intervals must be positive integers.', {
          option: flag,
          value: rawValue,
        });
      }
      if (flag === '--interval-ms') intervalMs = value;
      else timeoutMs = value;
    }
    return { mode: 'stage_run_watch', workflowId: identityOrFlag, intervalMs, timeoutMs };
  }
  if (action === 'recover-closeout') {
    if (
      !identityOrFlag
      || flags[0] !== '--attempt'
      || !flags[1]
      || flags.slice(2).some((flag) => !['--retry-terminal-recovery', '--retry-reviewer'].includes(flag))
      || new Set(flags.slice(2)).size !== flags.slice(2).length
    ) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime stage-run recover-closeout requires a StageRun id and an Attempt id.',
        {
          usage: 'opl family-runtime stage-run recover-closeout <stage_run_id> --attempt <attempt_id> [--retry-terminal-recovery] [--retry-reviewer]',
        },
      );
    }
    return {
      mode: 'stage_run_recover_closeout',
      stageRunId: identityOrFlag,
      stageAttemptId: flags[1],
      retryTerminalRecovery: flags.includes('--retry-terminal-recovery'),
      retryReviewer: flags.includes('--retry-reviewer'),
    };
  }
  return null;
}
