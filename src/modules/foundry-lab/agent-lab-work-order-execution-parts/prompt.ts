import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

export function buildCodexPrompt(input: {
  workOrderPath: string;
  workOrder: JsonRecord;
  targetAgentDir: string;
  worktreePath: string;
  outputDir: string;
}): string {
  return [
    'You are Codex CLI executing an OPL work-order developer patch primitive.',
    `Developer work order JSON: ${input.workOrderPath}`,
    `Target worktree: ${input.worktreePath}`,
    `Target source repo: ${input.targetAgentDir}`,
    `OPL work-order output directory: ${input.outputDir}`,
    `Work order id: ${stringValue(input.workOrder.work_order_id) ?? 'unknown'}`,
    `Allowed editable surfaces: ${JSON.stringify(stringList(input.workOrder.allowed_editable_surfaces))}`,
    `Target repo file hints: ${JSON.stringify(stringList(input.workOrder.target_repo_file_hints))}`,
    `Required verification refs: ${JSON.stringify(stringList(input.workOrder.required_verification_refs))}`,
    `Forbidden target surfaces: ${JSON.stringify(stringList(
      isRecord(input.workOrder.implementation_controls)
        ? input.workOrder.implementation_controls.forbidden_target_paths_or_surfaces
        : [],
    ))}`,
    '',
    'Read the target repository context before editing. Implement the smallest source/test/docs patch that satisfies the work order.',
    'Keep changes inside the target worktree. Do not commit, merge, push, or clean worktrees; Agent Lab owns absorb and cleanup.',
    'Do not write target domain truth, memory body, artifact body, visual truth, quality verdict, export verdict, owner receipt, or default promotion claims.',
    'Do not lower review/export gates or replace target owner authority.',
    'If the work order cannot be executed safely, write a refs-only typed blocker to the Agent Lab output directory as typed-blocker.json, then stop without fabricating success.',
  ].join('\n');
}
