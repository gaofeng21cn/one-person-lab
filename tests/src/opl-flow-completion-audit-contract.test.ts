import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/opl-flow-completion-audit-contract.json';

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return parseJsonText(read(relativePath)) as T;
}

test('OPL Flow completion audit contract gates thorough landing closeout claims', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  assert.equal(contract.surface_kind, 'opl_flow_completion_audit_contract');
  assert.equal(contract.version, 'opl-flow-completion-audit.v1');
  assert.equal(contract.state, 'active_contract');
  assert.equal(contract.completion_percent_policy.hundred_percent_requires_fresh_executable_evidence, true);
  assert.equal(contract.completion_percent_policy.non_hundred_percent_blocks_complete_claim, true);
  assert.equal(contract.hundred_percent_evidence_boundary.classification_required, true);
  assert.equal(
    contract.hundred_percent_evidence_boundary.minimum_required_kind,
    'fresh_executable_or_owner_bound_ref',
  );
  assert.equal(contract.hundred_percent_evidence_boundary.docs_refs_tests_commit_only_can_score_100, false);
  assert.equal(contract.hundred_percent_evidence_boundary.subagent_lane_mapping_required_for_lane_evidence, true);
  assert.equal(contract.hundred_percent_evidence_boundary.readback_contract_landed_can_claim_complete, false);
  assert.equal(contract.closeout_gate.requires_plan_item_audit, true);
  assert.equal(contract.closeout_gate.requires_lane_to_plan_mapping_when_subagents_or_worktrees_used, true);
  assert.equal(contract.closeout_gate.requires_main_session_fresh_verification, true);
  assert.match(contract.closeout_gate.can_claim_complete_rule, /Every audit item/);
  assert.equal(
    contract.closeout_gate.when_user_requested_thorough_landing_and_can_claim_complete_false,
    'continue_or_emit_typed_blocker',
  );

  for (const phrase of ['彻底落地', '全部落地', '一步到位', '持续推进直到完成', 'fully landed']) {
    assert.ok(contract.trigger_phrases.includes(phrase), `missing trigger phrase ${phrase}`);
  }

  assert.deepEqual(contract.required_audit_item_fields, [
    'item_id',
    'target_state',
    'status',
    'completion_percent',
    'fresh_evidence_refs',
    'missing_refs',
    'next_action',
  ]);
  assert.deepEqual(contract.allowed_item_statuses, ['done', 'partial', 'not_started', 'blocked']);

  for (const evidenceKind of [
    'test_result_ref',
    'cli_output_ref',
    'runtime_artifact_ref',
    'run_receipt_ref',
    'owner_receipt_ref',
    'typed_blocker_ref',
    'end_to_end_acceptance_ref',
  ]) {
    assert.ok(contract.fresh_evidence_ref_kinds.includes(evidenceKind), evidenceKind);
  }

  for (const evidenceKind of [
    'cli_output_ref',
    'runtime_artifact_ref',
    'run_receipt_ref',
    'owner_receipt_ref',
    'typed_blocker_ref',
    'end_to_end_acceptance_ref',
  ]) {
    assert.ok(
      contract.hundred_percent_evidence_boundary.accepted_fresh_executable_or_owner_bound_ref_kinds.includes(evidenceKind),
      evidenceKind,
    );
  }

  for (const insufficient of [
    'docs_updated',
    'catalog_landed',
    'plan_landed',
    'read_model_landed',
    'refs_only_surface_landed',
    'contract_landed',
    'tests_passed_only',
    'commit_pushed_only',
    'subagent_reported_complete',
    'worktree_merged_only',
  ]) {
    assert.ok(contract.insufficient_completion_evidence.includes(insufficient), insufficient);
    assert.ok(
      contract.hundred_percent_evidence_boundary.insufficient_100_percent_evidence_kinds.includes(insufficient),
      insufficient,
    );
  }
});

test('native profile exposes OPL Flow completion audit as closeout gate', () => {
  const profile = readJson<Record<string, any>>('contracts/opl-native-profile.json');
  const gates = profile.flow_closeout_gates ?? [];
  const completionGate = gates.find((gate: any) => gate.kind === 'completion_audit');

  assert.equal(completionGate.path, contractPath);
  assert.deepEqual(completionGate.required_for_claim_scopes, [
    'thorough_landing',
    'complete_execution',
    'end_to_end_acceptance',
    'production_ready_claim',
    'release_ready_claim',
  ]);
});
