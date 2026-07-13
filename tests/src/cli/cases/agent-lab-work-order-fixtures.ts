import { spawnSync } from 'node:child_process';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';

import { assert, fs, path } from '../helpers.ts';

export function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function readJson(filePath: string): Record<string, any> {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

function stageCompletionPolicy(policyRef: string): Record<string, any> {
  return {
    surface_kind: 'domain_stage_completion_policy',
    policy_ref: policyRef,
    completion_judgment_owner: 'domain_stage',
    closeout_packet_required: false,
    raw_artifact_sufficient_for_progress: true,
    provider_completion_is_domain_completion: false,
    opl_content_judgment_allowed: false,
    next_stage_transition_owner: 'codex_cli',
    required_closeout_outcomes: [
      'completed_and_continue',
      'completed_and_wait_owner',
      'route_back',
      'blocked',
      'rejected',
    ],
    accepted_closeout_ref_fields: [
      'owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_ref',
    ],
    authority_boundary: {
      opl_can_decide_domain_completion: false,
      provider_completion_counts_as_stage_complete: false,
    },
  };
}

function runGit(args: string[], cwd: string): void {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'opl-agent-lab-test',
      GIT_AUTHOR_EMAIL: 'opl-agent-lab-test@example.invalid',
      GIT_COMMITTER_NAME: 'opl-agent-lab-test',
      GIT_COMMITTER_EMAIL: 'opl-agent-lab-test@example.invalid',
    },
  });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
}

export function createWorkOrderTargetRepo(root: string): void {
  fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# Fake Target Agent\n');
  writeJson(path.join(root, 'contracts/domain_descriptor.json'), {
    domain_id: 'fake-agent',
    domain_label: 'Fake Target Agent',
    delivery_domain: 'test_agent',
  });
  runGit(['init', '-b', 'main'], root);
  runGit(['config', 'user.name', 'opl-agent-lab-test'], root);
  runGit(['config', 'user.email', 'opl-agent-lab-test@example.invalid'], root);
  runGit(['add', '.'], root);
  runGit(['commit', '-m', 'initial target'], root);
}

export function createFakeCodexWorkOrderExecutor(filePath: string): void {
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
mkdir -p "$target/docs"
cat > "$target/docs/efficiency.md" <<'DOC'
# Efficiency Patch

Codex CLI applied the developer work order in the target worktree.
DOC
printf '{"type":"thread.started","thread_id":"thread-work-order"}\\n'
printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"work order patch applied"}}\\n'
`, { mode: 0o755 });
}

export function createFailingFakeCodexWorkOrderExecutor(filePath: string): void {
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
if [ -n "$target" ]; then
  mkdir -p "$target/docs"
  echo "partial patch before failure" > "$target/docs/partial.md"
fi
echo "simulated codex failure" >&2
exit 17
`, { mode: 0o755 });
}

export function createSilentFakeCodexWorkOrderExecutor(filePath: string): void {
  fs.writeFileSync(filePath, `#!/usr/bin/env bash
set -euo pipefail
sleep 5
`, { mode: 0o755 });
}

export function createOverlappingFakeCodexWorkOrderExecutor(filePath: string): void {
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
cat > "$target/README.md" <<'DOC'
# Fake Target Agent

Codex CLI edited a dirty root-checkout file.
DOC
printf '{"type":"thread.started","thread_id":"thread-work-order"}\\n'
printf '{"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"overlap patch applied"}}\\n'
`, { mode: 0o755 });
}

export function createFakeOwnerCloseoutAction(targetRepo: string): string {
  const scriptPath = path.join(targetRepo, 'scripts', 'owner-closeout.js');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const receipt = JSON.parse(Buffer.concat(chunks).toString('utf8')); // reuse-first: allow embedded owner-closeout fixture JSON boundary.
  const response = {
    surface_kind: 'target_domain_owner_work_order_closeout',
    version: 'fake-agent.owner-closeout.v1',
    owner: 'fake-agent',
    status: 'no_regression_evidence_recorded',
    return_shape: 'no_regression_evidence',
    work_order_id: receipt.work_order_id,
    absorbed_head: receipt.absorption.absorbed_head,
    source_execution_receipt_ref: receipt.source_execution_receipt_ref,
    owner_receipt_ref: 'fake-owner-closeout:oma_developer_patch_work_order_test',
    no_regression_evidence_ref: 'fake-no-regression:oma_developer_patch_work_order_test',
    refs_only: true,
    writes_visual_truth: false,
    writes_artifact_body: false,
    writes_memory_body: false,
    authorizes_quality_or_export: false,
    can_write_owner_receipt: true,
    verification_ref_count: receipt.verification.command_results.length,
  };
  process.stdout.write(JSON.stringify(response));
});
`, { mode: 0o755 });
  return path.relative(targetRepo, scriptPath);
}

export function writeExecutableWorkOrder(filePath: string, targetRepo: string): void {
  writeJson(filePath, {
    surface_kind: 'opl_meta_agent_developer_patch_work_order',
    version: 'opl-meta-agent.developer-patch-work-order.v1',
    work_order_id: 'oma_developer_patch_work_order_test',
    status: 'ready_for_target_agent_source_patch',
    target_agent: {
      domain_id: 'fake-agent',
      repo_dir: targetRepo,
    },
    source_agent_lab_result_ref: 'suite-result:fake/blocked',
    executor_lease_ref: 'executor-lease:codex-cli/oma_developer_patch_work_order_test',
    reviewer_pool_refs: ['reviewer:fake/direct-evidence'],
    patch_execution_bundle_ref: 'patch-execution-bundle:target-agent/fake-agent/oma_developer_patch_work_order_test',
    target_closeout_refs: ['patch-absorption:fake-agent/oma_developer_patch_work_order_test/source-patch'],
    ai_reviewer_evidence: {
      source_refs: ['rubric-gap:fake/efficiency-telemetry'],
      direct_evidence_refs: ['target-verification:fake/precheck'],
    },
    ai_reviewer_scorecard: {
      verdict: 'blocked_requires_developer_patch',
    },
    ai_reviewer_review: {
      predicted_impact: 'The fake target records a usable efficiency patch.',
    },
    ahe_developer_work_order: {
      failure_evidence: ['rubric-gap:fake/efficiency-telemetry'],
      root_cause: 'The target lacks an executable efficiency telemetry patch.',
      targeted_fix: ['target_agent_regression_suite_ref:fake/efficiency-doc'],
      predicted_impact: 'The fake target records a usable efficiency patch.',
    },
    allowed_editable_surfaces: ['target_agent_regression_suite_ref'],
    target_repo_file_hints: ['docs/efficiency.md'],
    required_verification_refs: ['target-verification:fake/custom-command'],
    rollback_version_refs: ['git_commit', 'target_agent_previous_head_ref', 'temporary_worktree_ref'],
    owner_route_refs: ['target-agent-owner:fake-agent'],
    source_morphology_proof: {
      source_shape: 'Declarative Domain Pack + OPL generated/hosted surfaces + Domain Minimal Authority Kernel',
      inspected_refs: ['contracts/domain_descriptor.json'],
      prose_only_or_empty_scaffold: false,
    },
    private_residue_decision_ref:
      'private-residue-decision:fake-agent/oma_developer_patch_work_order_test',
    no_forbidden_write_proof: {
      required: true,
      proof_refs: ['no_target_domain_truth_write_proof'],
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
    },
    machine_closeout_refs: {
      blocked_suite_result_ref: 'suite-result:fake/blocked',
      developer_patch_work_order_ref: 'oma_developer_patch_work_order_test',
      patch_traceability_matrix_ref: 'oma_developer_patch_work_order_test#/patch_traceability_matrix',
      target_repo_verification_refs: ['target-verification:fake/custom-command'],
      target_runtime_read_model_consumption_ref:
        'target-runtime-read-model-consumption:fake-agent/oma_developer_patch_work_order_test/source-patch',
      workspace_environment_proof_ref:
        'workspace-environment-proof:fake-agent/oma_developer_patch_work_order_test/source-patch',
      no_forbidden_write_proof_ref: 'no_target_domain_truth_write_proof',
      target_owner_receipt_or_typed_blocker_ref:
        'target-owner-receipt-or-typed-blocker:fake-agent/oma_developer_patch_work_order_test',
      patch_absorption_ref: 'patch-absorption:fake-agent/oma_developer_patch_work_order_test/source-patch',
      worktree_cleanup_ref: 'worktree-cleanup:fake-agent/oma_developer_patch_work_order_test/source-patch',
      agent_lab_re_evaluation_ref:
        'agent-lab-re-evaluation:fake-agent/suite-result:fake/blocked/oma_developer_patch_work_order_test',
    },
    implementation_controls: {
      source_patch_required: true,
      no_target_domain_truth_write_proof_required: true,
      forbidden_target_paths_or_surfaces: ['target_domain_truth', 'target_quality_or_export_verdict'],
    },
    version_management: {
      absorb_back_required: true,
      temporary_worktree_cleanup_required: true,
    },
    authority_boundary: {
      can_modify_target_agent_source_repo: true,
      can_write_target_domain_truth: false,
      can_write_target_domain_memory_body: false,
      can_mutate_target_domain_artifact_body: false,
      can_authorize_target_domain_quality_or_export: false,
    },
  });
}

export function writeExecutableWorkOrderWithOwnerCloseoutHook(filePath: string, targetRepo: string, command: string[]): void {
  writeExecutableWorkOrder(filePath, targetRepo);
  const payload = readJson(filePath);
  payload.target_owner_closeout_hook = {
    hook_kind: 'command',
    owner: 'target-domain',
    action_ref: 'target-owner-closeout:fake-agent/work-order-source-patch',
    command,
    stdin_contract: 'opl_agent_lab_codex_work_order_execution_receipt_draft',
    response_contract: 'domain_owner_receipt_contract.allowed_return_shapes',
    optional: true,
  };
  writeJson(filePath, payload);
}

export function writePassingAgentLabSuite(filePath: string): void {
  writeJson(filePath, {
    suite_id: 'fake-suite',
    suite_kind: 'standard',
    tasks: [
      {
        task_id: 'agent-lab-task:fake/work-order-execution',
        domain_id: 'fake-agent',
        task_family: 'developer_work_order_execution_smoke',
        environment: {
          environment_kind: 'local_workspace',
          workspace_locator_ref: 'workspace-locator:fake-agent',
          sandbox_policy: 'target_owner_policy',
          network_policy: 'domain_owner_policy',
        },
        instructions_ref: 'instructions:fake/work-order-execution',
        agent_entry_ref: 'domain-agent-entry:fake-agent',
        stage_refs: ['stage:fake/patch'],
        stage_completion_policy: stageCompletionPolicy('stage-completion-policy:fake-agent/work-order-execution'),
        oracle_refs: ['oracle:fake/no-forbidden-write'],
        scorer_refs: ['scorer:fake/refs-only'],
        recovery_probes: [],
        trajectory: {
          trajectory_ref: 'trajectory:fake/work-order-execution',
          run_ref: 'run:fake/work-order-execution',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:fake/work-order-execution'],
          tool_call_refs: ['tool-call:fake/codex-cli'],
          artifact_refs: ['artifact-ref:fake/patch'],
          receipt_refs: ['receipt:fake/verification'],
          repair_refs: [],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:fake/work-order-execution',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:fake/execution'],
          evidence_refs: ['evidence-ref:fake/execution'],
          review_refs: ['review-ref:fake/execution'],
          quality_gate_refs: ['quality-gate-ref:fake/owner-owned'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:fake/work-order-execution',
          candidate_kind: 'test_metadata',
          target_ref: 'domain-agent:fake-agent',
          evidence_refs: ['evidence-ref:fake/execution'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:fake/work-order-execution',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:fake/work-order-execution',
          gate_status: 'passed',
          required_refs: ['regression-guard:fake/work-order-execution'],
          regression_suite_refs: ['regression-suite:fake/work-order-execution'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:fake/work-order-execution'],
        },
      },
    ],
    required_observations: [
      'task_manifests_observed',
      'agent_trajectories_observed',
      'domain_quality_scorecard_refs_observed',
      'failure_taxonomy_observed',
      'improvement_candidates_observed',
      'promotion_gates_observed',
      'no_memory_body_observed',
      'forbidden_authority_flags_all_false',
    ],
  });
}
