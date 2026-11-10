import {
  executeKnowledgeSourceAction,
  KNOWLEDGE_SOURCE_ACTION_IDS,
} from '../../../authority/packages/index.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { listWorkspaceBindings } from '../../../authority/workspace/public/app-state.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';

export function executeKnowledgeSourceAppAction(options: AppActionExecuteOptions) {
  const actionId = options.actionId as (typeof KNOWLEDGE_SOURCE_ACTION_IDS)[number];
  if (!KNOWLEDGE_SOURCE_ACTION_IDS.includes(actionId)) return null;
  if (options.dryRun && !['knowledge_source_list', 'knowledge_source_check'].includes(actionId)) {
    throw new FrameworkContractError('cli_usage_error', 'Knowledge source changes do not support dry-run.', {
      reason_code: 'knowledge_source_dry_run_unsupported',
    });
  }
  return {
    delegatedSurface: `opl knowledge source-${actionId.slice('knowledge_source_'.length)}`,
    result: executeKnowledgeSourceAction(actionId, options.payload, { workspaceBindings: listWorkspaceBindings() }),
  };
}
