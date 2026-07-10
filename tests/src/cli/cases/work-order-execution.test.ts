import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import {
  createFailingFakeCodexWorkOrderExecutor,
  createFakeCodexWorkOrderExecutor,
  createFakeOwnerCloseoutAction,
  createOverlappingFakeCodexWorkOrderExecutor,
  createSilentFakeCodexWorkOrderExecutor,
  createWorkOrderTargetRepo,
  readJson,
  writeJson,
  writeExecutableWorkOrder,
  writeExecutableWorkOrderWithOwnerCloseoutHook,
  writePassingAgentLabSuite,
} from './agent-lab-work-order-fixtures.ts';

function createTargetAdvancingFakeCodexWorkOrderExecutor(filePath: string): void {
  fs.writeFileSync(filePath, `#!/usr/bin/env bash
set -euo pipefail
target=""
previous=""
for arg in "$@"; do
  if [ "$previous" = "--cd" ]; then
    target="$arg"
  fi
  previous="$arg"
done
if [ -z "$target" ]; then
  echo "missing --cd" >&2
  exit 64
fi
target_root="$(cd "$target/../.." && pwd)"
mkdir -p "$target_root/notes"
cat > "$target_root/notes/main-advanced.md" <<'DOC'
# Main Advanced

The target checkout moved while Codex was executing the work order.
DOC
git -C "$target_root" add notes/main-advanced.md
git -C "$target_root" commit -m "advance target main"
mkdir -p "$target/docs"
cat > "$target/docs/efficiency.md" <<'DOC'
# Efficiency Patch

Codex CLI applied the developer work order in the target worktree.
DOC
printf '{"type":"thread.started","thread_id":"thread-work-order"}\\n'
printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"work order patch applied"}}\\n'
`, { mode: 0o755 });
}

test('work-order execute rejects explicit empty watchdog values', () => {
  assert.throws(
    () => runCli([
      'work-order',
      'execute',
      '--work-order',
      'unused.json',
      '--codex-timeout-ms',
      '',
      '--dry-run',
    ]),
    /requires a non-empty value/,
  );
});

test('work-order execute rebases onto target checkout advances before absorption', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-currentness-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    createTargetAdvancingFakeCodexWorkOrderExecutor(codexBin);
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

    const receipt = output.work_order_execution.receipt;
    assert.equal(output.work_order_execution.status, 'executed_absorbed_and_cleaned');
    assert.equal(receipt.absorption.rebased_before_absorption, true);
    assert.equal(receipt.absorption.absorbed, true);
    assert.equal(receipt.absorption.rebase_command_result.exit_code, 0);
    assert.equal(fs.existsSync(path.join(targetRepo, 'notes/main-advanced.md')), true);
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs/efficiency.md')), true);

    const log = spawnSync('git', ['log', '--oneline', '--max-count=2'], {
      cwd: targetRepo,
      encoding: 'utf8',
    });
    assert.equal(log.status, 0, log.stderr);
    assert.match(log.stdout, /work-order: execute oma_developer_patch_work_order_test/);
    assert.match(log.stdout, /advance target main/);
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

test('retired agent-lab execute-work-order alias is not retained', () => {
  const failure = runCliFailure(['agent-lab', 'execute-work-order', '--json']);

  assert.equal(failure.payload.error.code, 'unknown_command');
  assert.equal(failure.payload.error.details.command, 'agent-lab');
});

test('work-order execute dry-run plans without launching Codex or opening a target worktree', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-dry-run-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    writeExecutableWorkOrder(workOrderPath, targetRepo);
    const workOrder = readJson(workOrderPath);
    writeJson(workOrderPath, {
      ...workOrder,
      work_order_id: 'mas_figure_quality_work_order',
      target_agent: {
        domain_id: 'mas',
        repo_dir: targetRepo,
      },
      capability_hits: [
        {
          capability_id: 'medical-figure-design',
          canonical_target_paths: ['skills/medical-figure-design/SKILL.md'],
          required_verification_refs: ['mas-scholar-skills:scripts/verify.sh'],
          forbidden_surfaces: ['paper_truth', 'publication_readiness', 'owner_receipt_body'],
          owner_closeout_boundary: {
            owner: 'mas-scholar-skills',
            required_return_shapes: ['owner_receipt_ref', 'typed_blocker_ref', 'human_gate_ref', 'route_back_ref'],
            oma_can_write_owner_receipt_body: false,
            agent_lab_can_create_typed_blocker: false,
            target_owner_acceptance_required: true,
          },
        },
      ],
      canonical_target_paths: ['skills/medical-figure-design/SKILL.md'],
      required_verification_refs: ['mas-scholar-skills:scripts/verify.sh'],
      forbidden_surfaces: ['paper_truth', 'publication_readiness', 'owner_receipt_body'],
      owner_closeout_boundary: {
        owner: 'mas-scholar-skills',
        required_return_shapes: ['owner_receipt_ref', 'typed_blocker_ref', 'human_gate_ref', 'route_back_ref'],
        oma_can_write_owner_receipt_body: false,
        agent_lab_can_create_typed_blocker: false,
        target_owner_acceptance_required: true,
      },
    });

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
      '--verification-command',
      'test -d docs',
      '--dry-run',
      '--json',
    ]);

    assert.equal(output.version, 'g2');
    assert.equal(output.work_order_execution.status, 'dry_run_ready');
    assert.equal(output.work_order_execution.dry_run, true);
    assert.equal(output.work_order_execution.receipt.no_executor_launch_proof.codex_process_started, false);
    assert.equal(output.work_order_execution.receipt.no_executor_launch_proof.target_worktree_opened, false);
    assert.equal(output.work_order_execution.receipt.no_executor_launch_proof.absorption_attempted, false);
    assert.equal(output.work_order_execution.receipt.authority_boundary.can_apply_owner_gated_source_patch, false);
    assert.equal(fs.existsSync(path.join(targetRepo, '.worktrees')), false);
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs', 'efficiency.md')), false);
    assert.equal(fs.existsSync(output.work_order_execution.artifacts.execution_plan_path), true);
    assert.equal(fs.existsSync(output.work_order_execution.artifacts.dry_run_receipt_path), true);
    const receipt = readJson(output.work_order_execution.artifacts.dry_run_receipt_path);
    assert.equal(receipt.surface_kind, 'opl_work_order_codex_execution_dry_run_receipt');
    assert.deepEqual(receipt.capability_resolution.canonical_target_paths, [
      'skills/medical-figure-design/SKILL.md',
    ]);
    assert.equal(receipt.capability_resolution.capability_hits[0].capability_id, 'medical-figure-design');
    assert.deepEqual(receipt.capability_resolution.forbidden_surfaces, [
      'paper_truth',
      'publication_readiness',
      'owner_receipt_body',
      'target_domain_truth',
      'target_quality_or_export_verdict',
    ]);
    assert.equal(receipt.capability_resolution.owner_closeout_boundary.owner, 'mas-scholar-skills');
    assert.equal(receipt.planned_closeout.closeout_requires_target_owner, true);
    assert.deepEqual(receipt.planned_verification.commands, [
      'test -f docs/efficiency.md',
      'test -d docs',
      'git diff --check',
    ]);
    assert.equal(receipt.planned_codex_watchdogs.total_timeout_ms, 3600000);
    assert.equal(receipt.planned_codex_watchdogs.no_output_timeout_ms, 600000);
    assert.equal(receipt.planned_codex_watchdogs.command_no_progress_timeout_ms, 600000);
    const plan = fs.readFileSync(output.work_order_execution.artifacts.execution_plan_path, 'utf8');
    assert.match(plan, /Codex watchdogs/);
    assert.match(plan, /no_output_timeout_ms: `600000`/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
    assert.equal(output.work_order_execution.surface_id, 'opl_work_order_codex_execution');
    assert.equal(output.work_order_execution.primitive_owner, 'one-person-lab/OPL');
    assert.equal(output.work_order_execution.command_surface, 'work-order execute');
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
    assert.equal(receipt.primitive_owner, 'one-person-lab/OPL');
    assert.equal(receipt.execution_plan.path, path.join(outputDir, 'execution-plan.md'));
    assert.equal(receipt.execution_report.path, path.join(outputDir, 'execution-report.md'));
    assert.equal(receipt.execution_refs.execution_plan_ref, receipt.execution_plan.surface_ref);
    assert.equal(receipt.execution_refs.execution_report_ref, receipt.execution_report.surface_ref);
    assert.equal(receipt.executor.watchdogs.total_timeout_ms, 10000);
    assert.equal(receipt.executor.watchdogs.no_output_timeout_ms, 600000);
    assert.equal(receipt.executor.watchdogs.command_no_progress_timeout_ms, 600000);
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
    assert.equal(failure.payload.error.details.executor_launch_admission, 'blocked_before_executor_launch');
    assert.deepEqual(failure.payload.error.details.no_executor_launch_proof, {
      codex_process_started: false,
      target_worktree_opened: false,
      absorption_attempted: false,
      cleanup_needed: false,
      reason: 'oma_target_agent_work_order_guard_missing',
    });
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
    assert.equal(typedBlocker.executor_launch_admission, 'blocked_before_executor_launch');
    assert.deepEqual(typedBlocker.no_executor_launch_proof,
      failure.payload.error.details.no_executor_launch_proof);
    assert.equal(typedBlocker.can_sign_target_owner_receipt, false);
    assert.deepEqual(typedBlocker.missing_guard_fields, failure.payload.error.details.missing_guard_fields);
    assert.equal(fs.existsSync(path.join(targetRepo, '.worktrees')), false);
    assert.equal(fs.existsSync(path.join(targetRepo, 'docs', 'efficiency.md')), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

const omaTargetAgentGuardMissingCases = [
  {
    name: 'target owner route',
    missingField: 'target_owner_route',
    mutate(workOrder: Record<string, any>) {
      delete workOrder.owner_route_refs;
    },
  },
  {
    name: 'source morphology',
    missingField: 'source_morphology',
    mutate(workOrder: Record<string, any>) {
      delete workOrder.source_morphology_proof;
      delete workOrder.source_morphology_proof_ref;
    },
  },
  {
    name: 'generated surface consumption',
    missingField: 'generated_surface_consumption',
    mutate(workOrder: Record<string, any>) {
      delete workOrder.machine_closeout_refs.target_runtime_read_model_consumption_ref;
    },
  },
  {
    name: 'private residue decision',
    missingField: 'private_residue_decision',
    mutate(workOrder: Record<string, any>) {
      delete workOrder.private_residue_decision_ref;
    },
  },
  {
    name: 'no forbidden write proof',
    missingField: 'no_forbidden_write_proof',
    mutate(workOrder: Record<string, any>) {
      workOrder.no_forbidden_write_proof.proof_refs = [];
    },
  },
  {
    name: 'owner answer shape',
    missingField: 'owner_answer_shape',
    mutate(workOrder: Record<string, any>) {
      delete workOrder.machine_closeout_refs.target_owner_receipt_or_typed_blocker_ref;
    },
  },
];

for (const { name, missingField, mutate } of omaTargetAgentGuardMissingCases) {
  test(`work-order execute records machine guard sample for missing ${name}`, () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-work-order-guard-${missingField}-`));
    try {
      const targetRepo = path.join(fixtureRoot, 'target-agent');
      const outputDir = path.join(fixtureRoot, 'output');
      const codexBin = path.join(fixtureRoot, 'codex');
      const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
      createWorkOrderTargetRepo(targetRepo);
      createFakeCodexWorkOrderExecutor(codexBin);
      writeExecutableWorkOrder(workOrderPath, targetRepo);
      const workOrder = readJson(workOrderPath);
      mutate(workOrder);
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
      assert.equal(failure.payload.error.details.executor_launch_admission, 'blocked_before_executor_launch');
      assert.deepEqual(failure.payload.error.details.missing_guard_fields, [missingField]);
      assert.deepEqual(failure.payload.error.details.no_executor_launch_proof, {
        codex_process_started: false,
        target_worktree_opened: false,
        absorption_attempted: false,
        cleanup_needed: false,
        reason: 'oma_target_agent_work_order_guard_missing',
      });
      assert.equal(failure.payload.error.details.developer_work_order_required, true);
      assert.equal(failure.payload.error.details.can_sign_target_owner_receipt, false);
      assert.equal(failure.payload.error.details.can_create_target_typed_blocker, false);
      assert.equal(failure.payload.error.details.can_write_target_truth, false);

      const typedBlocker = readJson(path.join(outputDir, 'typed-blocker.json'));
      assert.equal(typedBlocker.blocker_kind, 'oma_target_agent_work_order_guard_missing');
      assert.equal(typedBlocker.status, 'developer_work_order_required');
      assert.equal(typedBlocker.required_next_shape, 'developer_work_order');
      assert.equal(typedBlocker.executor_launch_admission, 'blocked_before_executor_launch');
      assert.deepEqual(typedBlocker.missing_guard_fields, [missingField]);
      assert.deepEqual(typedBlocker.no_executor_launch_proof,
        failure.payload.error.details.no_executor_launch_proof);
      assert.equal(typedBlocker.can_sign_target_owner_receipt, false);
      assert.equal(typedBlocker.can_create_target_typed_blocker, false);
      assert.equal(typedBlocker.can_write_target_truth, false);
      assert.equal(fs.existsSync(path.join(targetRepo, '.worktrees')), false);
      assert.equal(fs.existsSync(path.join(targetRepo, 'docs', 'efficiency.md')), false);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
}

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

test('work-order execute fails closed when Codex produces no output before watchdog timeout', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-no-output-'));
  try {
    const targetRepo = path.join(fixtureRoot, 'target-agent');
    const outputDir = path.join(fixtureRoot, 'output');
    const codexBin = path.join(fixtureRoot, 'codex');
    const workOrderPath = path.join(fixtureRoot, 'developer-patch-work-order.json');
    createWorkOrderTargetRepo(targetRepo);
    createSilentFakeCodexWorkOrderExecutor(codexBin);
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
      '5000',
      '--codex-no-output-timeout-ms',
      '100',
      '--json',
    ], {
      OPL_CODEX_BIN: codexBin,
    });

    assert.equal(failure.payload.error.code, 'codex_command_failed');
    assert.equal(failure.payload.error.details.timeout_reason, 'no_output_timeout');
    assert.equal(failure.payload.error.details.no_output_timeout_ms, 100);
    const cleanupReceipt = readJson(failure.payload.error.details.failure_cleanup_receipt_path);
    assert.equal(cleanupReceipt.cleanup_all_passed, true);

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
