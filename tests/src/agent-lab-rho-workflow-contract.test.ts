import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readAgentLabContract() {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/agent-lab-contract.json'),
      'utf8',
    ),
  ) as Record<string, any>;
}

test('Agent Lab contract defines executable RHO no-apply backend and workflow runner gates', () => {
  const contract = readAgentLabContract();
  const rho = contract.rho_backend_surface;
  const workflow = contract.dynamic_workflow_runner_surface;

  assert.equal(rho.surface_kind, 'opl_agent_lab_rho_backend_contract');
  assert.equal(rho.backend_role, 'executable_no_apply_harness_backend');
  assert.equal(rho.cli, 'opl agent-lab rho run --project <target-agent-dir> [--sessions <codex-sessions-dir>] [--output <rho-run-dir>] --json');
  assert.equal(rho.apply_mode, 'no_apply');
  assert.equal(rho.executable, true);
  assert.deepEqual(rho.required_artifacts, [
    'trajectory_digest_ref',
    'diagnosis_ref',
    'candidate_harness_ref',
    'self_preference_score_ref',
    'winner_ref',
    'candidate_diff_ref',
    'work_order_draft_ref',
    'promotion_evidence_ref',
    'no_forbidden_write_ref',
    'execution_receipt_ref',
  ]);
  assert.deepEqual(rho.readiness_gate.required_refs, rho.required_artifacts);
  assert.equal(rho.readiness_gate.ready_status, 'executable_backend_ready');
  assert.equal(rho.readiness_gate.blocked_status, 'blocked_missing_required_artifact_or_authority_boundary');
  assert.equal(rho.end_to_end_acceptance.acceptance_status, 'accepted_when_cli_emits_complete_no_apply_receipt');
  assert.equal(rho.end_to_end_acceptance.must_not_apply_patch, true);
  assert.equal(rho.authority_boundary.can_direct_apply, false);
  assert.equal(rho.authority_boundary.can_write_domain_truth, false);
  assert.equal(rho.authority_boundary.can_write_owner_receipt, false);
  assert.ok(rho.forbidden_claims.includes('direct_apply'));
  assert.ok(rho.forbidden_claims.includes('owner_receipt'));

  assert.equal(workflow.surface_kind, 'opl_agent_lab_dynamic_workflow_runner_contract');
  assert.equal(workflow.runner_role, 'executable_suite_topology_work_order_runner');
  assert.equal(workflow.cli, 'opl agent-lab workflow-template run --template <id> --project <target-agent-dir> [--output <workflow-run-dir>] --json');
  assert.equal(workflow.executable, true);
  assert.deepEqual(workflow.required_artifacts, [
    'suite_topology_ref',
    'verifier_ref',
    'work_order_draft_ref',
    'work_order_sequence_ref',
    'runner_execution_receipt_ref',
    'typed_blocker_ref_or_acceptance_ref',
  ]);
  assert.deepEqual(workflow.readiness_gate.required_refs, workflow.required_artifacts);
  assert.equal(workflow.readiness_gate.ready_status, 'executable_runner_ready');
  assert.equal(workflow.end_to_end_acceptance.acceptance_status, 'accepted_when_runner_emits_work_order_receipt_or_typed_blocker');
  assert.equal(workflow.authority_boundary.can_compile_ordinary_user_workflow, false);
  assert.equal(workflow.authority_boundary.can_define_runtime_substrate, false);
  assert.equal(workflow.authority_boundary.can_write_domain_truth, false);
  assert.equal(workflow.authority_boundary.can_write_owner_receipt, false);
  assert.ok(workflow.forbidden_claims.includes('ordinary_workflow_compiler'));
  assert.ok(workflow.forbidden_claims.includes('runtime_substrate'));
});
