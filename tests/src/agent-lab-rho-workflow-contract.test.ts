import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Agent Lab contract admits RHO and workflow runs only with receipts or typed blockers', () => {
  const contract = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-lab-contract.json'),
    'utf8',
  )) as Record<string, any>;
  const rho = contract.rho_backend_surface;
  const workflow = contract.dynamic_workflow_runner_surface;

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
  assert.ok(rho.end_to_end_acceptance.must_emit.includes('execution_receipt'));
  assert.equal(rho.end_to_end_acceptance.must_not_apply_patch, true);

  assert.deepEqual(workflow.required_artifacts, [
    'suite_topology_ref',
    'verifier_ref',
    'work_order_draft_ref',
    'work_order_sequence_ref',
    'runner_execution_receipt_ref',
    'typed_blocker_ref_or_acceptance_ref',
  ]);
  assert.deepEqual(workflow.readiness_gate.required_refs, workflow.required_artifacts);
  assert.equal(
    workflow.end_to_end_acceptance.acceptance_status,
    'accepted_when_runner_emits_work_order_receipt_or_typed_blocker',
  );
  assert.equal(workflow.authority_boundary.can_write_domain_truth, false);
  assert.equal(workflow.authority_boundary.can_write_owner_receipt, false);
});
