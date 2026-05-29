import path from 'node:path';

type JsonRecord = Record<string, unknown>;

export type ExecutionSurfaceRef = {
  surface_kind: string;
  version: string;
  primitive_owner: string;
  surface_ref: string;
  path: string;
};

type ExecutionCommandResult = {
  command: string;
  exit_code: number;
};

export const OPL_WORK_ORDER_PRIMITIVE_OWNER = 'one-person-lab/OPL';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function mdInline(value: unknown): string {
  return `\`${String(value ?? 'null').replace(/`/g, '\\`')}\``;
}

function mdList(values: string[]): string {
  return values.length > 0
    ? values.map((value) => `- ${mdInline(value)}`).join('\n')
    : '- None';
}

function targetAgentId(targetAgent: JsonRecord): string {
  return optionalString(targetAgent.domain_id) ?? 'target-agent';
}

export function buildExecutionSurfaces(input: {
  outputDir: string;
  targetAgent: JsonRecord;
  workOrderId: string;
}): {
  executionPlan: ExecutionSurfaceRef;
  executionReport: ExecutionSurfaceRef;
  executionRefs: JsonRecord;
} {
  const agentId = targetAgentId(input.targetAgent);
  const executionPlan = {
    surface_kind: 'opl_work_order_execution_plan',
    version: 'opl.work-order-execution-plan.v1',
    primitive_owner: OPL_WORK_ORDER_PRIMITIVE_OWNER,
    surface_ref: `work-order-execution-plan:${agentId}/${input.workOrderId}`,
    path: path.join(input.outputDir, 'execution-plan.md'),
  };
  const executionReport = {
    surface_kind: 'opl_work_order_execution_report',
    version: 'opl.work-order-execution-report.v1',
    primitive_owner: OPL_WORK_ORDER_PRIMITIVE_OWNER,
    surface_ref: `work-order-execution-report:${agentId}/${input.workOrderId}`,
    path: path.join(input.outputDir, 'execution-report.md'),
  };
  return {
    executionPlan,
    executionReport,
    executionRefs: {
      execution_plan_ref: executionPlan.surface_ref,
      execution_report_ref: executionReport.surface_ref,
    },
  };
}

export function buildExecutionPlanMarkdown(input: {
  workOrderId: string;
  workOrderPath: string;
  targetAgentDir: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  baseHead: string;
  verificationCommands: string[];
  allowedEditableSurfaces: string[];
  targetRepoFileHints: string[];
  forbiddenTargetSurfaces: string[];
  targetDirtyStatusBeforeOpen: string[];
}): string {
  return [
    '# OPL Work Order Execution Plan',
    '',
    `Primitive owner: ${mdInline(OPL_WORK_ORDER_PRIMITIVE_OWNER)}`,
    `Work order id: ${mdInline(input.workOrderId)}`,
    `Work order path: ${mdInline(input.workOrderPath)}`,
    `Target agent dir: ${mdInline(input.targetAgentDir)}`,
    `Target worktree: ${mdInline(input.worktreePath)}`,
    `Branch: ${mdInline(input.branchName)}`,
    `Base branch: ${mdInline(input.baseBranch)}`,
    `Base head: ${mdInline(input.baseHead)}`,
    '',
    '## Verification commands',
    mdList(input.verificationCommands),
    '',
    '## Editable scope',
    'Allowed editable surfaces:',
    mdList(input.allowedEditableSurfaces),
    '',
    'Target repo file hints:',
    mdList(input.targetRepoFileHints),
    '',
    'Forbidden target surfaces:',
    mdList(input.forbiddenTargetSurfaces),
    '',
    '## Target checkout before open',
    mdList(input.targetDirtyStatusBeforeOpen),
  ].join('\n');
}

export function buildExecutionReportMarkdown(input: {
  workOrderId: string;
  receiptPath: string;
  changedFiles: string[];
  verificationResults: ExecutionCommandResult[];
  absorption: JsonRecord;
  cleanup: JsonRecord;
  ownerCloseout: JsonRecord;
}): string {
  return [
    '# OPL Work Order Execution Report',
    '',
    `Primitive owner: ${mdInline(OPL_WORK_ORDER_PRIMITIVE_OWNER)}`,
    `Work order id: ${mdInline(input.workOrderId)}`,
    `Execution receipt: ${mdInline(input.receiptPath)}`,
    '',
    '## Changed files',
    mdList(input.changedFiles),
    '',
    '## Verification',
    input.verificationResults.length > 0
      ? input.verificationResults
        .map((result) => `- ${mdInline(result.command)} -> exit ${mdInline(result.exit_code)}`)
        .join('\n')
      : '- None',
    '',
    '## Absorption',
    `absorbed: ${mdInline(input.absorption.absorbed)}`,
    `target_branch: ${mdInline(input.absorption.target_branch)}`,
    `absorbed_head: ${mdInline(input.absorption.absorbed_head)}`,
    '',
    '## Cleanup',
    `worktree_removed: ${mdInline(input.cleanup.worktree_removed)}`,
    `branch_removed: ${mdInline(input.cleanup.branch_removed)}`,
    `worktree_cleanup_ref: ${mdInline(input.cleanup.worktree_cleanup_ref)}`,
    '',
    '## Typed blocker / owner hook',
    `status: ${mdInline(input.ownerCloseout.status)}`,
    `owner: ${mdInline(input.ownerCloseout.owner)}`,
    `hook_action_ref: ${mdInline(input.ownerCloseout.hook_action_ref)}`,
    `response_path: ${mdInline(input.ownerCloseout.response_path)}`,
  ].join('\n');
}

export function buildFailureExecutionReportMarkdown(input: {
  workOrderId: string;
  error: unknown;
  cleanupResults: ExecutionCommandResult[];
}): string {
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);
  return [
    '# OPL Work Order Execution Report',
    '',
    `Primitive owner: ${mdInline(OPL_WORK_ORDER_PRIMITIVE_OWNER)}`,
    `Work order id: ${mdInline(input.workOrderId)}`,
    'Status: `failed`',
    `Failure: ${mdInline(errorMessage)}`,
    '',
    '## Changed files',
    '- Not recorded before failure closeout.',
    '',
    '## Verification',
    '- Not completed before failure closeout.',
    '',
    '## Absorption',
    'absorbed: `false`',
    '',
    '## Cleanup',
    input.cleanupResults.length > 0
      ? input.cleanupResults
        .map((result) => `- ${mdInline(result.command)} -> exit ${mdInline(result.exit_code)}`)
        .join('\n')
      : '- None',
    '',
    '## Typed blocker / owner hook',
    'status: `not_reached`',
  ].join('\n');
}
