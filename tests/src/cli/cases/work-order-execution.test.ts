import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  createFakeCodexWorkOrderExecutor,
  createWorkOrderTargetRepo,
  readJson,
  writeExecutableWorkOrder,
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
    assert.equal(output.work_order_execution.agent_lab_alias, false);
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

test('agent-lab execute-work-order remains a compatibility alias over the OPL primitive', () => {
  const { fixtureRoot, targetRepo, output } = runWorkOrderExecution(['agent-lab', 'execute-work-order']);
  try {
    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_work_order_execution.surface_id, 'opl_agent_lab_work_order_execution_alias');
    assert.equal(output.agent_lab_work_order_execution.primitive_owner, 'one-person-lab/OPL');
    assert.equal(output.agent_lab_work_order_execution.command_surface, 'agent-lab execute-work-order');
    assert.equal(output.agent_lab_work_order_execution.agent_lab_alias, true);
    assert.equal(output.agent_lab_work_order_execution.status, 'executed_absorbed_and_cleaned');
    assert.equal(output.agent_lab_work_order_execution.receipt.primitive_owner, 'one-person-lab/OPL');
    assert.equal(output.agent_lab_work_order_execution.receipt.agent_lab_command_alias, true);
    assert.equal(output.agent_lab_work_order_execution.receipt.absorption.absorbed, true);
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs/efficiency.md')), true);

    const worktreeList = spawnSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(worktreeList.status, 0, worktreeList.stderr);
    assert.equal(worktreeList.stdout.includes('oma_developer_patch_work_order_test'), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
