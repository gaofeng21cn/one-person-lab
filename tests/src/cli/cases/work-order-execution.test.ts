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

    const receipt = readJson(output.work_order_execution.artifacts.execution_receipt_path);
    assert.equal(receipt.surface_kind, 'opl_work_order_codex_execution_receipt');
    assert.equal(receipt.primitive_owner, 'one-person-lab/OPL');
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
    assert.ok(receipt.verification.command_results.some((entry: Record<string, any>) =>
      entry.command === 'test -f docs/efficiency.md' && entry.exit_code === 0
    ));

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
