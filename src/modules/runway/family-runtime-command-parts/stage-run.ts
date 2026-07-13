import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';

export function parseStageRunArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  const [action, identityOrFlag, maybePath] = rest;
  if (action === 'query') {
    if (!identityOrFlag || maybePath) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run query requires one workflow id.', {
        usage: 'opl family-runtime stage-run query <workflow_id>',
      });
    }
    return { mode: 'stage_run_query', workflowId: identityOrFlag };
  }
  return null;
}
