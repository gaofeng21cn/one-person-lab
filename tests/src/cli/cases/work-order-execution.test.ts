import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import {
  createFailingFakeCodexWorkOrderExecutor,
  createFakeCodexWorkOrderExecutor,
  createFakeOwnerCloseoutAction,
  createOverlappingFakeCodexWorkOrderExecutor,
  createWorkOrderTargetRepo,
  readJson,
  writeExecutableWorkOrder,
  writeExecutableWorkOrderWithOwnerCloseoutHook,
  writePassingAgentLabSuite,
} from './agent-lab-work-order-fixtures.ts';

function runWorkOrderExecution(commandPrefix: string[]) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-exec-'));
  const targetRepo = path.join(fixtureRoot, 'target-agent');
  const outputDir = path.join(fixtureRoot, 'output');
  const codexBin = path.join(fixtureRoot, 'codex');
  const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');

  createWorkOrderTargetRepo(targetRepo);
  createFakeCodexWorkOrderExecutor(codexBin);
  writeExecutableWorkOrder(workOrderPath, targetRepo);

  const output = runCli([
    ...commandPrefix,
    '--work-order',
    workOrderPath,
    '--target-agent-dir',
    targetRepo,
    '--output-dir',
    outputDir,
    '--verification-command',
    'test -f docs/efficiency.md',
    '--codex-timeout-ms',
    '10000',
    '--json',
  ], {
    OPL_CODEX_BIN: codexBin,
  });

  return {
    fixtureRoot,
    targetRepo,
    output,
  };
}

test('work-order execute is the canonical OPL work-order execution primitive', () => {
  const { fixtureRoot, targetRepo, output } = runWorkOrderExecution(['work-order', 'execute']);
  try {
    assert.equal(output.version, 'g2');
    assert.equal(output.work_order_execution.surface_id, 'opl_work_order_codex_execution');
    assert.equal(output.work_order_execution.primitive_owner, 'one-person-lab/OPL');
    assert.equal(output.work_order_execution.command_surface, 'work-order execute');
    assert.equal(output.work_order_execution.status, 'executed_absorbed_and_cleaned');
    assert.equal(output.work_order_execution.receipt.primitive_owner, 'one-person-lab/OPL');
    assert.equal(output.work_order_execution.receipt.executor.executor_kind, 'codex_cli');
    assert.equal(output.work_order_execution.receipt.absorption.absorbed, true);
    assert.equal(output.work_order_execution.receipt.cleanup.worktree_removed, true);
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs/efficiency.md')), true);
    assert.equal(typeof output.work_order_execution.artifacts.execution_plan_path, 'string');
    assert.equal(typeof output.work_order_execution.artifacts.execution_report_path, 'string');

    const receipt = readJson(output.work_order_execution.artifacts.execution_receipt_path);
    assert.equal(receipt.surface_kind, 'opl_work_order_codex_execution_receipt');
    assert.equal(receipt.primitive_owner, 'one-person-lab/OPL');
    assert.equal(receipt.execution_plan.surface_kind, 'opl_work_order_execution_plan');
    assert.equal(receipt.execution_plan.primitive_owner, 'one-person-lab/OPL');
    assert.equal(receipt.execution_plan.path, output.work_order_execution.artifacts.execution_plan_path);
    assert.equal(receipt.execution_report.surface_kind, 'opl_work_order_execution_report');
    assert.equal(receipt.execution_report.primitive_owner, 'one-person-lab/OPL');
    assert.equal(receipt.execution_report.path, output.work_order_execution.artifacts.execution_report_path);
    assert.equal(receipt.execution_refs.execution_plan_ref, receipt.execution_plan.surface_ref);
    assert.equal(receipt.execution_refs.execution_report_ref, receipt.execution_report.surface_ref);
    assert.equal(fs.existsSync(receipt.execution_plan.path), true);
    assert.equal(fs.existsSync(receipt.execution_report.path), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('retired agent-lab execute-work-order alias is not retained', () => {
  const failure = runCliFailure(['agent-lab', 'execute-work-order', '--json']);

  assert.equal(failure.payload.error.code, 'unknown_command');
  assert.equal(failure.payload.error.details.command, 'agent-lab');
});

test('work-order execute runs Codex CLI in a target worktree then absorbs and cleans it', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-exec-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    const suitePath = path.join(fixtureRoot, 'suite.json');
    createWorkOrderTargetRepo(targetRepo);
    createFakeCodexWorkOrderExecutor(codexBin);
    writeExecutableWorkOrder(workOrderPath, targetRepo);
    writePassingAgentLabSuite(suitePath);

    const output = runCli([
      'work-order',
      'execute',
      '--work-order',
      workOrderPath,
      '--target-agent-dir',
      targetRepo,
      '--suite',
      suitePath,
      '--output-dir',
      outputDir,
      '--verification-command',
      'test -f docs/efficiency.md',
      '--codex-timeout-ms',
      '10000',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.work_order_execution.status, 'executed_absorbed_and_cleaned');
    assert.equal(output.work_order_execution.receipt.executor.executor_kind, 'codex_cli');
    assert.equal(output.work_order_execution.receipt.absorption.absorbed, true);
    assert.equal(output.work_order_execution.receipt.cleanup.worktree_removed, true);
    assert.equal(output.work_order_execution.receipt.no_forbidden_write_proof.can_write_target_domain_truth,
      false);
    assert.equal(output.work_order_execution.receipt.target_owner_receipt_or_typed_blocker.status,
      'typed_blocker_recorded');
    assert.equal(output.work_order_execution.receipt.agent_lab_re_evaluation.suite_result.status, 'passed');
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs/efficiency.md')), true);

    const receipt = readJson(output.work_order_execution.artifacts.execution_receipt_path);
    assert.equal(receipt.surface_kind, 'opl_work_order_codex_execution_receipt');
    assert.equal(receipt.execution_plan.path, path.join(outputDir, 'execution-plan.md'));
    assert.equal(receipt.execution_report.path, path.join(outputDir, 'execution-report.md'));
    assert.ok(receipt.verification.command_results.some((entry: Record<string, any>) =>
      entry.command === 'test -f docs/efficiency.md' && entry.exit_code === 0
    ));
    const plan = fs.readFileSync(receipt.execution_plan.path, 'utf8');
    assert.match(plan, /^# OPL Work Order Execution Plan/m);
    assert.match(plan, /Primitive owner: `one-person-lab\/OPL`/);
    assert.match(plan, /Work order id: `oma_developer_patch_work_order_test`/);
    assert.match(plan, /Verification commands/);
    assert.match(plan, /`test -f docs\/efficiency\.md`/);
    assert.match(plan, /`git diff --check`/);

    const report = fs.readFileSync(receipt.execution_report.path, 'utf8');
    assert.match(report, /^# OPL Work Order Execution Report/m);
    assert.match(report, /Primitive owner: `one-person-lab\/OPL`/);
    assert.match(report, /Changed files/);
    assert.match(report, /`docs\/efficiency\.md`/);
    assert.match(report, /Verification/);
    assert.match(report, /`test -f docs\/efficiency\.md` -> exit `0`/);
    assert.match(report, /Absorption/);
    assert.match(report, /absorbed: `true`/);
    assert.match(report, /Cleanup/);
    assert.match(report, /worktree_removed: `true`/);
    assert.match(report, /Typed blocker \/ owner hook/);
    assert.match(report, /status: `typed_blocker_recorded`/);

    const worktreeList = spawnSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(worktreeList.status, 0, worktreeList.stderr);
    assert.equal(worktreeList.stdout.includes('oma_developer_patch_work_order_test'), false);
    const branchList = spawnSync('git', ['branch', '--list', 'codex/work-order-*'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(branchList.status, 0, branchList.stderr);
    assert.equal(branchList.stdout.trim(), '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('work-order execute fails closed when OMA target-agent guard evidence is missing', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-guard-missing-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    createFakeCodexWorkOrderExecutor(codexBin);
    writeExecutableWorkOrder(workOrderPath, targetRepo);
    const workOrder = readJson(workOrderPath);
    delete workOrder.owner_route_refs;
    delete workOrder.no_forbidden_write_proof;
    delete workOrder.machine_closeout_refs.target_runtime_read_model_consumption_ref;
    delete workOrder.machine_closeout_refs.target_owner_receipt_or_typed_blocker_ref;
    workOrder.source_morphology_proof = null;
    workOrder.private_residue_decision_ref = '';
    fs.writeFileSync(workOrderPath, `${JSON.stringify(workOrder, null, 2)}\n`);

    const failure = runCliFailure([
      'work-order',
      'execute',
      '--work-order',
      workOrderPath,
      '--target-agent-dir',
      targetRepo,
      '--output-dir',
      outputDir,
      '--codex-timeout-ms',
      '10000',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.blocker_kind, 'oma_target_agent_work_order_guard_missing');
    assert.deepEqual(failure.payload.error.details.missing_guard_fields, [
      'target_owner_route',
      'source_morphology',
      'generated_surface_consumption',
      'private_residue_decision',
      'no_forbidden_write_proof',
      'owner_answer_shape',
    ]);
    assert.equal(failure.payload.error.details.can_sign_target_owner_receipt, false);
    assert.equal(fs.existsSync(path.join(outputDir, 'typed-blocker.json')), true);
    const typedBlocker = readJson(path.join(outputDir, 'typed-blocker.json'));
    assert.equal(typedBlocker.surface_kind, 'opl_work_order_typed_blocker');
    assert.equal(typedBlocker.blocker_kind, 'oma_target_agent_work_order_guard_missing');
    assert.equal(typedBlocker.status, 'developer_work_order_required');
    assert.equal(typedBlocker.can_sign_target_owner_receipt, false);
    assert.deepEqual(typedBlocker.missing_guard_fields, failure.payload.error.details.missing_guard_fields);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('work-order execute calls target owner closeout hook after absorption when declared', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-owner-closeout-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    const ownerCloseoutScript = createFakeOwnerCloseoutAction(targetRepo);
    createFakeCodexWorkOrderExecutor(codexBin);
    writeExecutableWorkOrderWithOwnerCloseoutHook(workOrderPath, targetRepo, ['node', ownerCloseoutScript]);

    const output = runCli([
      'work-order',
      'execute',
      '--work-order',
      workOrderPath,
      '--target-agent-dir',
      targetRepo,
      '--output-dir',
      outputDir,
      '--verification-command',
      'test -f docs/efficiency.md',
      '--codex-timeout-ms',
      '10000',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    const closeout = output.work_order_execution.receipt.target_owner_receipt_or_typed_blocker;
    assert.equal(closeout.status, 'no_regression_evidence_recorded');
    assert.equal(closeout.owner, 'target-domain');
    assert.equal(closeout.can_write_owner_receipt, false);
    assert.equal(closeout.hook_result.return_shape, 'no_regression_evidence');
    assert.equal(closeout.hook_result.refs_only, true);
    assert.equal(closeout.hook_result.writes_visual_truth, false);
    assert.equal(closeout.hook_result.writes_artifact_body, false);
    assert.equal(closeout.hook_result.writes_memory_body, false);
    assert.equal(closeout.hook_result.authorizes_quality_or_export, false);
    assert.equal(closeout.hook_result.absorbed_head,
      output.work_order_execution.receipt.absorption.absorbed_head);
    assert.equal(closeout.command_result.exit_code, 0);
    assert.equal(fs.existsSync(path.join(outputDir, 'target-owner-closeout-response.json')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('work-order execute preserves unrelated dirty target checkout files', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-dirty-ok-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    fs.mkdirSync(path.join(targetRepo, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(targetRepo, 'notes', 'external.md'), 'external local edit\n');
    createFakeCodexWorkOrderExecutor(codexBin);
    writeExecutableWorkOrder(workOrderPath, targetRepo);

    const output = runCli([
      'work-order',
      'execute',
      '--work-order',
      workOrderPath,
      '--target-agent-dir',
      targetRepo,
      '--output-dir',
      outputDir,
      '--verification-command',
      'test -f docs/efficiency.md',
      '--codex-timeout-ms',
      '10000',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    assert.equal(output.work_order_execution.status, 'executed_absorbed_and_cleaned');
    assert.equal(fs.readFileSync(path.join(targetRepo, 'notes', 'external.md'), 'utf8'), 'external local edit\n');
    assert.deepEqual(
      output.work_order_execution.receipt.target_worktree.target_dirty_status_before_open,
      ['?? notes/'],
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('work-order execute blocks absorption when patch overlaps dirty target checkout files', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-dirty-overlap-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    fs.appendFileSync(path.join(targetRepo, 'README.md'), '\nexternal local edit\n');
    createOverlappingFakeCodexWorkOrderExecutor(codexBin);
    writeExecutableWorkOrder(workOrderPath, targetRepo);

    const failure = runCliFailure([
      'work-order',
      'execute',
      '--work-order',
      workOrderPath,
      '--target-agent-dir',
      targetRepo,
      '--output-dir',
      outputDir,
      '--codex-timeout-ms',
      '10000',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.deepEqual(failure.payload.error.details.overlapping_files, ['README.md']);
    const typedBlocker = readJson(path.join(outputDir, 'typed-blocker.json'));
    assert.equal(typedBlocker.blocker_kind, 'target_dirty_checkout_overlap');
    assert.equal(typedBlocker.can_absorb_without_overwriting_external_changes, false);
    assert.match(fs.readFileSync(path.join(targetRepo, 'README.md'), 'utf8'), /external local edit/);

    const branchList = spawnSync('git', ['branch', '--list', 'codex/work-order-*'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(branchList.status, 0, branchList.stderr);
    assert.equal(branchList.stdout.trim(), '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('work-order execute cleans target worktree and branch after Codex failure', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-fail-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    createFailingFakeCodexWorkOrderExecutor(codexBin);
    writeExecutableWorkOrder(workOrderPath, targetRepo);

    const failure = runCliFailure([
      'work-order',
      'execute',
      '--work-order',
      workOrderPath,
      '--target-agent-dir',
      targetRepo,
      '--output-dir',
      outputDir,
      '--codex-timeout-ms',
      '10000',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    assert.equal(failure.payload.error.code, 'codex_command_failed');
    const cleanupReceiptPath = failure.payload.error.details.failure_cleanup_receipt_path;
    assert.equal(typeof cleanupReceiptPath, 'string');
    const cleanupReceipt = readJson(cleanupReceiptPath);
    assert.equal(cleanupReceipt.surface_kind, 'opl_work_order_failure_cleanup_receipt');
    assert.equal(cleanupReceipt.cleanup_all_passed, true);
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs/partial.md')), false);

    const worktreeList = spawnSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(worktreeList.status, 0, worktreeList.stderr);
    assert.equal(worktreeList.stdout.includes('oma_developer_patch_work_order_test'), false);
    const branchList = spawnSync('git', ['branch', '--list', 'codex/work-order-*'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(branchList.status, 0, branchList.stderr);
    assert.equal(branchList.stdout.trim(), '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
