import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { parsePayloadFile } from './shared.ts';

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
  if (action === 'start') {
    if (identityOrFlag !== '--input-file' || !maybePath || rest.length !== 3) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run start requires --input-file.', {
        usage: 'opl family-runtime stage-run start --input-file <stage-run.json>',
      });
    }
    return {
      mode: 'stage_run_start',
      input: parsePayloadFile(maybePath),
    };
  }
  return null;
}
