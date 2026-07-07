import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import {
  agentLabRefSummary,
  buildAgentLabEfficiencyNonRegressionReadModel,
  runAgentLabSuite,
  type AgentLabSuite,
} from './agent-lab.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommandStreaming,
} from '../runway/index.ts';
import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  buildExecutionPlanMarkdown,
  buildExecutionReportMarkdown,
  buildExecutionSurfaces,
  buildFailureExecutionReportMarkdown,
  type CodexWatchdogSettings,
  OPL_WORK_ORDER_PRIMITIVE_OWNER,
  type ExecutionSurfaceRef,
} from './agent-lab-work-order-execution-surfaces.ts';
import {
  gitRawOutput,
  readJson,
  runCommand,
  runShellVerification,
  writeJson,
  writeMarkdown,
  type CommandResult,
} from './agent-lab-work-order-execution-parts/io.ts';
import { runTargetOwnerCloseoutHook } from './agent-lab-work-order-execution-parts/owner-closeout.ts';
import { buildCodexPrompt } from './agent-lab-work-order-execution-parts/prompt.ts';

export type AgentLabWorkOrderExecutionOptions = {
  workOrderPath: string;
  targetAgentDir?: string | null;
  suitePath?: string | null;
  outputDir?: string | null;
  verificationCommands?: string[];
  codexBin?: string | null;
  codexTimeoutMs?: number | null;
  codexNoOutputTimeoutMs?: number | null;
  codexCommandNoProgressTimeoutMs?: number | null;
  dryRun?: boolean;
};

type WorkOrderExecutionPresentation = {
  envelopeKey: 'work_order_execution';
  resultSurfaceId: string;
  receiptSurfaceKind: string;
  receiptVersion: string;
  commandSurface: 'work-order execute';
};

const OMA_TARGET_AGENT_WORK_ORDER_GUARD_FIELDS = [
  'target_owner_route',
  'source_morphology',
  'generated_surface_consumption',
  'private_residue_decision',
  'no_forbidden_write_proof',
  'owner_answer_shape',
] as const;

const WORK_ORDER_EXECUTION_PRESENTATION: WorkOrderExecutionPresentation = {
  envelopeKey: 'work_order_execution',
  resultSurfaceId: 'opl_work_order_codex_execution',
  receiptSurfaceKind: 'opl_work_order_codex_execution_receipt',
  receiptVersion: 'opl.work-order-execution.v1',
  commandSurface: 'work-order execute',
};

const DEFAULT_CODEX_WORK_ORDER_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_CODEX_WORK_ORDER_NO_OUTPUT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_CODEX_WORK_ORDER_COMMAND_NO_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000;

function codexWatchdogsFor(options: AgentLabWorkOrderExecutionOptions): CodexWatchdogSettings {
  return {
    timeoutMs: options.codexTimeoutMs ?? DEFAULT_CODEX_WORK_ORDER_TIMEOUT_MS,
    noOutputTimeoutMs: options.codexNoOutputTimeoutMs ?? DEFAULT_CODEX_WORK_ORDER_NO_OUTPUT_TIMEOUT_MS,
    commandNoProgressTimeoutMs: options.codexCommandNoProgressTimeoutMs
      ?? DEFAULT_CODEX_WORK_ORDER_COMMAND_NO_PROGRESS_TIMEOUT_MS,
  };
}

function assertWorktreeDirIgnored(targetAgentDir: string): void {
  const result = spawnSync('git', ['check-ignore', '-q', '.worktrees/agent-lab-ignore-probe'], {
    cwd: targetAgentDir,
    encoding: 'utf8',
  });
  if ((result.status ?? 1) !== 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Target agent .worktrees directory must be gitignored before Agent Lab creates a target worktree.',
      {
        target_agent_dir: targetAgentDir,
        required_ignore: '.worktrees',
      },
    );
  }
}

function shortId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'work-order';
}

function changedFiles(cwd: string): string[] {
  return gitRawOutput(['status', '--porcelain', '-uall'], cwd)
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^[A-Z? ][A-Z? ]\s+/, ''))
    .flatMap((entry) => entry.includes(' -> ') ? entry.split(' -> ') : [entry])
    .filter(Boolean);
}

function statusEntries(cwd: string): string[] {
  return gitRawOutput(['status', '--porcelain'], cwd)
    .split(/\r?\n/)
    .filter(Boolean);
}

function dirtyFiles(cwd: string): string[] {
  return statusEntries(cwd)
    .map((entry) => entry.replace(/^[A-Z? ][A-Z? ]\s+/, ''))
    .flatMap((entry) => entry.includes(' -> ') ? entry.split(' -> ') : [entry])
    .filter(Boolean);
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((entry) => rightSet.has(entry)))].sort();
}

function commandInferredFromVerificationRef(ref: string): string | null {
  if (ref.includes(':typecheck')) {
    return 'npm run typecheck';
  }
  if (ref.includes(':test-fast')) {
    return 'npm run test:fast';
  }
  if (ref.includes(':build') || ref.includes('npm-run-build')) {
    return 'npm run build';
  }
  return null;
}

function verificationCommandsFor(workOrder: JsonRecord, explicitCommands: string[] = []): string[] {
  const inferred = stringList(workOrder.required_verification_refs)
    .map(commandInferredFromVerificationRef)
    .filter((entry): entry is string => Boolean(entry));
  return [...new Set([...explicitCommands, ...inferred, 'git diff --check'])];
}

function assertExecutableWorkOrder(workOrder: JsonRecord): void {
  if (stringValue(workOrder.status) !== 'ready_for_target_agent_source_patch') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL work-order execute requires a source patch work order.',
      {
        work_order_id: stringValue(workOrder.work_order_id),
        status: stringValue(workOrder.status),
      },
    );
  }
  if (stringValue(workOrder.executor_lease_ref)?.startsWith('executor-lease:codex-cli/') !== true) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL work-order execute requires a Codex CLI executor lease ref.',
      {
        work_order_id: stringValue(workOrder.work_order_id),
        executor_lease_ref: stringValue(workOrder.executor_lease_ref),
      },
    );
  }
  const boundary = isRecord(workOrder.authority_boundary) ? workOrder.authority_boundary : {};
  if (boundary.can_write_target_domain_truth !== false || boundary.can_authorize_target_domain_quality_or_export !== false) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL work-order execute refuses work orders that can write target truth or quality/export verdicts.',
      {
        work_order_id: stringValue(workOrder.work_order_id),
        authority_boundary: boundary,
      },
    );
  }
}

function missingOmaTargetAgentWorkOrderGuardFields(workOrder: JsonRecord): string[] {
  const machineCloseoutRefs = isRecord(workOrder.machine_closeout_refs) ? workOrder.machine_closeout_refs : {};
  const noForbiddenWriteProof = isRecord(workOrder.no_forbidden_write_proof)
    ? workOrder.no_forbidden_write_proof
    : {};
  const missing: string[] = [];
  if (stringList(workOrder.owner_route_refs).length === 0) {
    missing.push('target_owner_route');
  }
  if (!isRecord(workOrder.source_morphology_proof) && !stringValue(workOrder.source_morphology_proof_ref)) {
    missing.push('source_morphology');
  }
  if (!stringValue(machineCloseoutRefs.target_runtime_read_model_consumption_ref)) {
    missing.push('generated_surface_consumption');
  }
  if (!stringValue(workOrder.private_residue_decision_ref)) {
    missing.push('private_residue_decision');
  }
  if (
    noForbiddenWriteProof.required !== true
    || noForbiddenWriteProof.can_write_target_domain_truth !== false
    || noForbiddenWriteProof.can_write_target_domain_memory_body !== false
    || noForbiddenWriteProof.can_mutate_target_domain_artifact_body !== false
    || noForbiddenWriteProof.can_authorize_target_domain_quality_or_export !== false
    || stringList(noForbiddenWriteProof.proof_refs).length === 0
  ) {
    missing.push('no_forbidden_write_proof');
  }
  if (!stringValue(machineCloseoutRefs.target_owner_receipt_or_typed_blocker_ref)) {
    missing.push('owner_answer_shape');
  }
  return OMA_TARGET_AGENT_WORK_ORDER_GUARD_FIELDS.filter((field) => missing.includes(field));
}

function omaTargetAgentNoExecutorLaunchProof() {
  return {
    codex_process_started: false,
    target_worktree_opened: false,
    absorption_attempted: false,
    cleanup_needed: false,
    reason: 'oma_target_agent_work_order_guard_missing',
  };
}

function writeOmaTargetAgentWorkOrderGuardBlocker(input: {
  workOrder: JsonRecord;
  workOrderId: string;
  outputDir: string;
  missingFields: string[];
}): string {
  const typedBlockerPath = path.join(input.outputDir, 'typed-blocker.json');
  const noExecutorLaunchProof = omaTargetAgentNoExecutorLaunchProof();
  writeJson(typedBlockerPath, {
    surface_kind: 'opl_work_order_typed_blocker',
    version: 'opl.work-order-execution.typed-blocker.v1',
    blocker_kind: 'oma_target_agent_work_order_guard_missing',
    status: 'developer_work_order_required',
    executor_launch_admission: 'blocked_before_executor_launch',
    work_order_id: input.workOrderId,
    missing_guard_fields: input.missingFields,
    required_guard_fields: OMA_TARGET_AGENT_WORK_ORDER_GUARD_FIELDS,
    no_executor_launch_proof: noExecutorLaunchProof,
    developer_work_order_required: true,
    can_sign_target_owner_receipt: false,
    can_create_target_typed_blocker: false,
    can_write_target_truth: false,
    required_next_shape: 'developer_work_order',
    guard_policy_ref:
      'contracts/opl-framework/standard-agent-landing-acceptance-contract.json#oma_target_agent_work_order_guard',
  });
  return typedBlockerPath;
}

function assertOmaTargetAgentWorkOrderGuard(input: {
  workOrder: JsonRecord;
  workOrderId: string;
  outputDir: string;
}): void {
  const missingFields = missingOmaTargetAgentWorkOrderGuardFields(input.workOrder);
  if (missingFields.length === 0) {
    return;
  }
  const typedBlockerPath = writeOmaTargetAgentWorkOrderGuardBlocker({
    ...input,
    missingFields,
  });
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'OMA target-agent work order guard requires target owner route, source morphology, generated surface consumption, private residue decision, no-forbidden-write proof, and owner answer shape before execution.',
    {
      work_order_id: input.workOrderId,
      blocker_kind: 'oma_target_agent_work_order_guard_missing',
      executor_launch_admission: 'blocked_before_executor_launch',
      missing_guard_fields: missingFields,
      typed_blocker_path: typedBlockerPath,
      no_executor_launch_proof: omaTargetAgentNoExecutorLaunchProof(),
      developer_work_order_required: true,
      can_sign_target_owner_receipt: false,
      can_create_target_typed_blocker: false,
      can_write_target_truth: false,
    },
  );
}

function readSuiteResult(suitePath: string | null | undefined) {
  if (!suitePath) {
    return null;
  }
  const suite = readJson(suitePath) as AgentLabSuite;
  const suiteResult = runAgentLabSuite(suite);
  const handoffRefs = Object.entries(suite as JsonRecord)
    .filter(([key, value]) => (
      key === 'efficiency_handoff_projection' || key.endsWith('_efficiency_handoff_projection')
    ) && isRecord(value))
    .map(([, value]) => value as JsonRecord);
  const readModel = buildAgentLabEfficiencyNonRegressionReadModel({
    suiteResults: [suiteResult],
    handoffRefs,
  });
  return {
    suite_path: suitePath,
    suite_result: suiteResult,
    efficiency_read_model: readModel,
    ref_summary: agentLabRefSummary(suiteResult),
  };
}

function normalizeOutputDir(outputDir: string | null | undefined, workOrderId: string): string {
  if (outputDir) {
    return path.resolve(outputDir);
  }
  return fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', `opl-work-order-${shortId(workOrderId)}-`));
}

function buildDryRunReceipt(input: {
  workOrder: JsonRecord;
  workOrderId: string;
  workOrderPath: string;
  targetAgent: JsonRecord;
  targetAgentDir: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  baseHead: string;
  verificationCommands: string[];
  codexWatchdogs: CodexWatchdogSettings;
  requiredVerificationRefs: string[];
  targetDirtyStatusBeforeOpen: string[];
  targetDirtyFilesBeforeOpen: string[];
  executionSurfaces: ReturnType<typeof buildExecutionSurfaces>;
  presentation: WorkOrderExecutionPresentation;
}) {
  const implementationControls = isRecord(input.workOrder.implementation_controls)
    ? input.workOrder.implementation_controls
    : {};
  const machineCloseoutRefs = isRecord(input.workOrder.machine_closeout_refs)
    ? input.workOrder.machine_closeout_refs
    : {};
  const forbiddenSurfaces = [
    ...stringList(input.workOrder.forbidden_surfaces),
    ...stringList(implementationControls.forbidden_target_paths_or_surfaces),
  ];
  const canonicalTargetPaths = stringList(input.workOrder.canonical_target_paths);
  return {
    surface_kind: 'opl_work_order_codex_execution_dry_run_receipt',
    version: 'opl.work-order-execution.dry-run.v1',
    status: 'dry_run_ready',
    primitive_owner: OPL_WORK_ORDER_PRIMITIVE_OWNER,
    command_surface: input.presentation.commandSurface,
    dry_run: true,
    work_order_id: input.workOrderId,
    target_agent: input.targetAgent,
    source_work_order_path: input.workOrderPath,
    planned_target_worktree: {
      target_agent_dir: input.targetAgentDir,
      worktree_path: input.worktreePath,
      branch_name: input.branchName,
      base_branch: input.baseBranch,
      base_head: input.baseHead,
      target_dirty_status_before_open: input.targetDirtyStatusBeforeOpen,
      target_dirty_files_before_open: input.targetDirtyFilesBeforeOpen,
    },
    planned_verification: {
      commands: input.verificationCommands,
      required_verification_refs: input.requiredVerificationRefs,
    },
    planned_codex_watchdogs: {
      total_timeout_ms: input.codexWatchdogs.timeoutMs,
      no_output_timeout_ms: input.codexWatchdogs.noOutputTimeoutMs,
      command_no_progress_timeout_ms: input.codexWatchdogs.commandNoProgressTimeoutMs,
    },
    capability_resolution: {
      capability_hits: Array.isArray(input.workOrder.capability_hits) ? input.workOrder.capability_hits : [],
      canonical_target_paths: canonicalTargetPaths.length > 0
        ? canonicalTargetPaths
        : stringList(input.workOrder.target_repo_file_hints),
      required_verification_refs: input.requiredVerificationRefs,
      forbidden_surfaces: [...new Set(forbiddenSurfaces)],
      owner_closeout_boundary: isRecord(input.workOrder.owner_closeout_boundary)
        ? input.workOrder.owner_closeout_boundary
        : null,
    },
    planned_closeout: {
      owner_route_refs: stringList(input.workOrder.owner_route_refs),
      target_owner_receipt_or_typed_blocker_ref:
        stringValue(machineCloseoutRefs.target_owner_receipt_or_typed_blocker_ref),
      closeout_requires_target_owner: true,
    },
    no_executor_launch_proof: {
      codex_process_started: false,
      target_worktree_opened: false,
      absorption_attempted: false,
      cleanup_needed: false,
      reason: 'dry_run',
    },
    execution_plan: input.executionSurfaces.executionPlan,
    execution_refs: input.executionSurfaces.executionRefs,
    authority_boundary: {
      ...AGENT_LAB_AUTHORITY_BOUNDARY,
      can_apply_owner_gated_source_patch: false,
      can_write_domain_truth: false,
      can_write_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      can_mutate_domain_artifact: false,
    },
  };
}

function cleanupTargetWorktree(input: {
  targetAgentDir: string;
  worktreePath: string;
  branchName: string;
}): CommandResult[] {
  const cleanupResults: CommandResult[] = [];
  if (fs.existsSync(input.worktreePath)) {
    cleanupResults.push(runCommand('git', ['worktree', 'remove', '--force', input.worktreePath], input.targetAgentDir, {
      allowFailure: true,
    }));
  }
  cleanupResults.push(runCommand('git', ['branch', '-D', input.branchName], input.targetAgentDir, {
    allowFailure: true,
  }));
  cleanupResults.push(runCommand('git', ['worktree', 'prune'], input.targetAgentDir, {
    allowFailure: true,
  }));
  return cleanupResults;
}

function throwWithFailureCleanup(
  error: unknown,
  cleanupResults: CommandResult[],
  outputDir: string,
  executionRefs?: {
    executionPlan: ExecutionSurfaceRef;
    executionReport: ExecutionSurfaceRef;
    executionRefs: JsonRecord;
  },
): never {
  const cleanupReceiptPath = path.join(outputDir, 'work-order-failure-cleanup.json');
  writeJson(cleanupReceiptPath, {
    surface_kind: 'opl_work_order_failure_cleanup_receipt',
    version: 'opl.work-order-execution.failure-cleanup.v1',
    cleanup_results: cleanupResults,
    cleanup_all_passed: cleanupResults.every((result) => result.exit_code === 0),
    execution_plan: executionRefs?.executionPlan,
    execution_report: executionRefs?.executionReport,
    execution_refs: executionRefs?.executionRefs,
  });
  if (error instanceof FrameworkContractError) {
    throw new FrameworkContractError(error.code, error.message, {
      ...(error.details ?? {}),
      failure_cleanup_receipt_path: cleanupReceiptPath,
      failure_cleanup_results: cleanupResults,
      execution_plan_path: executionRefs?.executionPlan.path,
      execution_report_path: executionRefs?.executionReport.path,
    }, error.exitCode);
  }
  throw error;
}

async function executeDeveloperWorkOrder(
  options: AgentLabWorkOrderExecutionOptions,
  presentation: WorkOrderExecutionPresentation,
) {
  const workOrderPath = path.resolve(options.workOrderPath);
  const workOrder = readJson(workOrderPath);
  const workOrderId = stringValue(workOrder.work_order_id) ?? stableId('work-order', [workOrderPath, workOrder]);
  const outputDir = normalizeOutputDir(options.outputDir, workOrderId);
  fs.mkdirSync(outputDir, { recursive: true });
  assertExecutableWorkOrder(workOrder);
  assertOmaTargetAgentWorkOrderGuard({
    workOrder,
    workOrderId,
    outputDir,
  });
  const targetAgent = isRecord(workOrder.target_agent) ? workOrder.target_agent : {};
  const targetAgentDir = path.resolve(
    options.targetAgentDir
      ?? stringValue(targetAgent.repo_dir)
      ?? '',
  );
  if (!targetAgentDir || !fs.existsSync(targetAgentDir)) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Target agent repo directory is required for OPL work-order execute.',
      {
        work_order_id: workOrderId,
        target_agent_dir: targetAgentDir,
      },
    );
  }
  assertWorktreeDirIgnored(targetAgentDir);
  const targetDirtyStatusBeforeOpen = statusEntries(targetAgentDir);
  const targetDirtyFilesBeforeOpen = dirtyFiles(targetAgentDir);
  const baseBranch = gitRawOutput(['branch', '--show-current'], targetAgentDir).trim() || 'HEAD';
  const baseHead = gitRawOutput(['rev-parse', 'HEAD'], targetAgentDir).trim();
  const branchName = `codex/work-order-${shortId(workOrderId)}`;
  const worktreePath = path.join(targetAgentDir, '.worktrees', `work-order-${shortId(workOrderId)}`);
  const verificationCommands = verificationCommandsFor(workOrder, options.verificationCommands);
  const codexWatchdogs = codexWatchdogsFor(options);
  const executionSurfaces = buildExecutionSurfaces({
    outputDir,
    targetAgent,
    workOrderId,
  });
  writeMarkdown(executionSurfaces.executionPlan.path, buildExecutionPlanMarkdown({
    workOrderId,
    workOrderPath,
    targetAgentDir,
    worktreePath,
    branchName,
    baseBranch,
    baseHead,
    verificationCommands,
    codexWatchdogs,
    allowedEditableSurfaces: stringList(workOrder.allowed_editable_surfaces),
    targetRepoFileHints: stringList(workOrder.target_repo_file_hints),
    forbiddenTargetSurfaces: stringList(isRecord(workOrder.implementation_controls)
      ? workOrder.implementation_controls.forbidden_target_paths_or_surfaces
      : []),
    targetDirtyStatusBeforeOpen,
  }));
  if (options.dryRun === true) {
    const dryRunReceipt = buildDryRunReceipt({
      workOrder,
      workOrderId,
      workOrderPath,
      targetAgent,
      targetAgentDir,
      worktreePath,
      branchName,
      baseBranch,
      baseHead,
      verificationCommands,
      codexWatchdogs,
      requiredVerificationRefs: stringList(workOrder.required_verification_refs),
      targetDirtyStatusBeforeOpen,
      targetDirtyFilesBeforeOpen,
      executionSurfaces,
      presentation,
    });
    const dryRunReceiptPath = path.join(outputDir, 'work-order-dry-run-receipt.json');
    writeJson(dryRunReceiptPath, dryRunReceipt);
    return {
      version: 'g2',
      [presentation.envelopeKey]: {
        surface_id: presentation.resultSurfaceId,
        primitive_owner: OPL_WORK_ORDER_PRIMITIVE_OWNER,
        command_surface: presentation.commandSurface,
        status: 'dry_run_ready',
        dry_run: true,
        work_order_path: workOrderPath,
        artifacts: {
          execution_plan_path: executionSurfaces.executionPlan.path,
          dry_run_receipt_path: dryRunReceiptPath,
        },
        receipt: dryRunReceipt,
        authority_boundary: dryRunReceipt.authority_boundary,
      },
    };
  }
  let executionReportWritten = false;
  if (fs.existsSync(worktreePath)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Target worktree path already exists.',
      {
        worktree_path: worktreePath,
        branch_name: branchName,
      },
    );
  }

  runCommand('git', ['worktree', 'add', worktreePath, '-b', branchName], targetAgentDir);
  let targetWorktreeClosed = false;
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  if (options.codexBin) {
    process.env.OPL_CODEX_BIN = path.resolve(options.codexBin);
  }

  try {
    const prompt = buildCodexPrompt({
      workOrderPath,
      workOrder,
      targetAgentDir,
      worktreePath,
      outputDir,
    });
    const codexArgs = buildCodexExecArgs(prompt, {
      cwd: worktreePath,
      json: true,
    });
    let processId: number | null = null;
    const codexResult = await runCodexCommandStreaming(codexArgs, {
      timeoutMs: codexWatchdogs.timeoutMs,
      noOutputTimeoutMs: codexWatchdogs.noOutputTimeoutMs,
      commandNoProgressTimeoutMs: codexWatchdogs.commandNoProgressTimeoutMs,
      onProcessStarted(pid) {
        processId = pid;
      },
    });
    if (codexResult.exitCode !== 0) {
      throw new FrameworkContractError(
        'codex_command_failed',
        'Codex CLI failed while executing OPL developer work order.',
        {
          work_order_id: workOrderId,
          exit_code: codexResult.exitCode,
          timeout_reason: codexResult.timeoutReason ?? null,
          no_output_timeout_ms: codexResult.noOutputTimeoutMs ?? codexWatchdogs.noOutputTimeoutMs,
          command_no_progress_timeout_ms: codexResult.commandNoProgressTimeoutMs
            ?? codexWatchdogs.commandNoProgressTimeoutMs,
          active_command: codexResult.activeCommand ?? null,
          provider_errors: codexResult.providerErrors ?? [],
          unsupported_function_calls: codexResult.unsupportedFunctionCalls ?? [],
          stdout_tail: codexResult.stdout.split(/\r?\n/).filter(Boolean).slice(-20),
          stderr_tail: codexResult.stderr.split(/\r?\n/).filter(Boolean).slice(-20),
        },
      );
    }
    const changed = changedFiles(worktreePath);
    if (changed.length === 0) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Codex CLI completed but produced no target worktree diff for a source patch work order.',
        {
          work_order_id: workOrderId,
          worktree_path: worktreePath,
        },
      );
    }
    const verificationResults = verificationCommands
      .map((command) => runShellVerification(command, worktreePath));
    const failedVerification = verificationResults.filter((result) => result.exit_code !== 0);
    if (failedVerification.length > 0) {
      throw new FrameworkContractError(
        'build_command_failed',
        'OPL work-order target verification failed.',
        {
          work_order_id: workOrderId,
          failed_verification: failedVerification,
        },
      );
    }
    const targetDirtyOverlap = intersection(changed, targetDirtyFilesBeforeOpen);
    if (targetDirtyOverlap.length > 0) {
      const typedBlockerPath = path.join(outputDir, 'typed-blocker.json');
      writeJson(typedBlockerPath, {
        surface_kind: 'opl_work_order_typed_blocker',
        version: 'opl.work-order-execution.typed-blocker.v1',
        blocker_kind: 'target_dirty_checkout_overlap',
        status: 'blocked_before_absorption',
        work_order_id: workOrderId,
        target_agent_dir: targetAgentDir,
        patch_changed_files: changed,
        target_dirty_files_before_open: targetDirtyFilesBeforeOpen,
        overlapping_files: targetDirtyOverlap,
        can_absorb_without_overwriting_external_changes: false,
      });
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent Lab work order patch overlaps existing dirty target checkout files.',
        {
          work_order_id: workOrderId,
          target_agent_dir: targetAgentDir,
          target_dirty_status_before_open: targetDirtyStatusBeforeOpen,
          patch_changed_files: changed,
          overlapping_files: targetDirtyOverlap,
          typed_blocker_path: typedBlockerPath,
        },
      );
    }

    runCommand('git', ['add', '-A'], worktreePath);
    runCommand('git', ['commit', '-m', `work-order: execute ${workOrderId}`], worktreePath);
    const patchCommit = gitRawOutput(['rev-parse', 'HEAD'], worktreePath).trim();
    runCommand('git', ['merge', '--ff-only', branchName], targetAgentDir);
    const absorbedHead = gitRawOutput(['rev-parse', 'HEAD'], targetAgentDir).trim();
    runCommand('git', ['worktree', 'remove', worktreePath], targetAgentDir);
    const branchDelete = runCommand('git', ['branch', '-d', branchName], targetAgentDir);
    runCommand('git', ['worktree', 'prune'], targetAgentDir);
    targetWorktreeClosed = true;
    const reEvaluation = readSuiteResult(options.suitePath);
    const parsedCodex = parseCodexExecOutput(codexResult.stdout);
    const receiptDraft = {
      surface_kind: presentation.receiptSurfaceKind,
      version: presentation.receiptVersion,
      status: 'executed_absorbed_and_cleaned',
      primitive_owner: OPL_WORK_ORDER_PRIMITIVE_OWNER,
      command_surface: presentation.commandSurface,
      work_order_id: workOrderId,
      target_agent: targetAgent,
      source_work_order_path: workOrderPath,
      work_order_stage_execution_bundle_ref: `work-order-stage-execution-bundle:${targetAgent.domain_id ?? 'target-agent'}/${workOrderId}`,
      executor: {
        executor_kind: 'codex_cli',
        executor_lease_ref: stringValue(workOrder.executor_lease_ref),
        codex_cli_dispatch_receipt_ref: `codex-cli-dispatch-receipt:${targetAgent.domain_id ?? 'target-agent'}/${workOrderId}`,
        command_preview: buildCodexCliPreview(codexArgs),
        process_id: processId,
        exit_code: codexResult.exitCode,
        thread_id: parsedCodex.threadId,
        watchdogs: {
          total_timeout_ms: codexWatchdogs.timeoutMs,
          no_output_timeout_ms: codexWatchdogs.noOutputTimeoutMs,
          command_no_progress_timeout_ms: codexWatchdogs.commandNoProgressTimeoutMs,
        },
      },
      target_worktree: {
        target_agent_dir: targetAgentDir,
        worktree_path: worktreePath,
        branch_name: branchName,
        base_branch: baseBranch,
        base_head: baseHead,
        target_dirty_status_before_open: targetDirtyStatusBeforeOpen,
        patch_commit: patchCommit,
        open_receipt_ref: `target-worktree-open:${targetAgent.domain_id ?? 'target-agent'}/${workOrderId}`,
      },
      patch: {
        changed_files: changed,
        patch_traceability_matrix_ref: isRecord(workOrder.machine_closeout_refs)
          ? workOrder.machine_closeout_refs.patch_traceability_matrix_ref
          : null,
      },
      verification: {
        required_verification_refs: stringList(workOrder.required_verification_refs),
        command_results: verificationResults,
        all_passed: true,
      },
      absorption: {
        absorbed: true,
        target_branch: baseBranch,
        patch_absorption_ref: isRecord(workOrder.machine_closeout_refs)
          ? workOrder.machine_closeout_refs.patch_absorption_ref
          : null,
        absorbed_head: absorbedHead,
      },
      cleanup: {
        worktree_removed: !fs.existsSync(worktreePath),
        branch_removed: branchDelete.exit_code === 0,
        worktree_cleanup_ref: isRecord(workOrder.machine_closeout_refs)
          ? workOrder.machine_closeout_refs.worktree_cleanup_ref
          : null,
      },
      no_forbidden_write_proof: {
        proof_refs: stringList(isRecord(workOrder.no_forbidden_write_proof)
          ? workOrder.no_forbidden_write_proof.proof_refs
          : []),
        changed_files: changed,
        can_write_target_domain_truth: false,
        can_write_target_domain_memory_body: false,
        can_mutate_target_domain_artifact_body: false,
        can_authorize_target_domain_quality_or_export: false,
      },
      target_owner_receipt_or_typed_blocker: {
        status: 'typed_blocker_recorded',
        blocker_ref: isRecord(workOrder.machine_closeout_refs)
          ? workOrder.machine_closeout_refs.target_owner_receipt_or_typed_blocker_ref
          : null,
        reason: 'Agent Lab executed source patch and verification, but target owner receipt remains target-domain owned.',
        owner_route_refs: stringList(workOrder.owner_route_refs),
        can_write_owner_receipt: false,
      },
      agent_lab_re_evaluation: reEvaluation,
      execution_plan: executionSurfaces.executionPlan,
      execution_report: executionSurfaces.executionReport,
      execution_refs: executionSurfaces.executionRefs,
      authority_boundary: {
        ...AGENT_LAB_AUTHORITY_BOUNDARY,
        can_apply_owner_gated_source_patch: true,
        can_write_domain_truth: false,
        can_write_owner_receipt: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        can_mutate_domain_artifact: false,
      },
    };
    const receiptPath = path.join(outputDir, 'work-order-execution-receipt.json');
    const ownerCloseout = runTargetOwnerCloseoutHook({
      workOrder,
      targetAgent,
      workOrderId,
      targetAgentDir,
      outputDir,
      receiptDraft: {
        ...receiptDraft,
        source_execution_receipt_ref: receiptPath,
      },
    });
    const receipt = {
      ...receiptDraft,
      target_owner_receipt_or_typed_blocker: ownerCloseout.closeout,
    };
    writeMarkdown(executionSurfaces.executionReport.path, buildExecutionReportMarkdown({
      workOrderId,
      receiptPath,
      changedFiles: changed,
      verificationResults,
      absorption: receipt.absorption as JsonRecord,
      cleanup: receipt.cleanup as JsonRecord,
      ownerCloseout: ownerCloseout.closeout,
    }));
    executionReportWritten = true;
    writeJson(receiptPath, receipt);
    const resultPayload = {
      surface_id: presentation.resultSurfaceId,
      primitive_owner: OPL_WORK_ORDER_PRIMITIVE_OWNER,
      command_surface: presentation.commandSurface,
      status: 'executed_absorbed_and_cleaned',
      work_order_path: workOrderPath,
      artifacts: {
        execution_plan_path: executionSurfaces.executionPlan.path,
        execution_report_path: executionSurfaces.executionReport.path,
        execution_receipt_path: receiptPath,
      },
      receipt,
      authority_boundary: receipt.authority_boundary,
    };
    return {
      version: 'g2',
      [presentation.envelopeKey]: resultPayload,
    };
  } catch (error) {
    const cleanupResults = targetWorktreeClosed
      ? []
      : cleanupTargetWorktree({ targetAgentDir, worktreePath, branchName });
    if (!executionReportWritten) {
      writeMarkdown(executionSurfaces.executionReport.path, buildFailureExecutionReportMarkdown({
        workOrderId,
        error,
        cleanupResults,
      }));
    }
    throwWithFailureCleanup(error, cleanupResults, outputDir, executionSurfaces);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
  }
}

export async function executeOplDeveloperWorkOrder(options: AgentLabWorkOrderExecutionOptions) {
  return executeDeveloperWorkOrder(options, WORK_ORDER_EXECUTION_PRESENTATION);
}
