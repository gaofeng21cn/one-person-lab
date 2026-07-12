import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildConstructedFunctionalAgentRuntimeHarnessInput,
  runFunctionalAgentRuntimeHarness,
} from '../../src/modules/runway/functional-agent-runtime-harness.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

test('functional agent runtime harness proves progress-first retry, dead-letter, repair, and human gate paths', () => {
  const result = runFunctionalAgentRuntimeHarness(buildConstructedFunctionalAgentRuntimeHarnessInput());

  assert.equal(result.surface_kind, 'opl_functional_agent_runtime_harness');
  assert.equal(result.version, 'opl-functional-agent-runtime-harness.v1');
  assert.equal(result.harness_status, 'passed');
  assert.deepEqual(result.missing_observations, []);
  assert.equal(result.summary.total_transition_cases, 10);
  assert.equal(result.summary.transition_applied_count, 8);
  assert.equal(result.summary.blocked_count, 1);
  assert.equal(result.summary.dead_letter_intended_count, 1);
  assert.equal(result.summary.stage_attempt_count, 7);
  assert.equal(result.summary.expectation_match_count, 10);
  assert.equal(result.summary.expectation_mismatch_count, 0);
  assert.equal(result.summary.memory_body_observed, false);
  assert.equal(result.summary.forbidden_authority_flag_count, 0);

  for (const [key, observed] of Object.entries(result.observations)) {
    assert.equal(observed, true, `missing harness observation: ${key}`);
  }

  assert.deepEqual(result.refs.consumed_memory_refs, ['memory:constructed-domain/prior-plan']);
  assert.deepEqual(result.refs.writeback_proposal_refs, ['memory-writeback-proposal:constructed-domain/next-plan']);
  assert.deepEqual(result.refs.writeback_receipt_refs, ['memory-writeback-receipt:constructed-domain/accepted-by-owner']);
  assert.ok(result.refs.closeout_refs.includes('closeout:constructed-domain/typed-closeout'));
  assert.ok(result.refs.owner_receipt_refs.includes('owner-receipt:constructed-domain/memory-apply'));
  assert.ok(result.refs.human_gate_refs.includes('human-gate:constructed-domain-decision'));
  assert.ok(result.refs.typed_blocker_refs.includes('domain-blocker:human-decision-required'));
  assert.ok(result.refs.dead_letter_refs.includes('provider-failure:retry-budget-exhausted'));
  assert.ok(result.refs.repair_action_refs.includes('repair-action:constructed-domain/rerun-owner-stage'));
  assert.deepEqual(result.refs.forbidden_authority_flags, []);

  const byCase = new Map(result.matrix_result.results.map((entry) => [entry.case_id, entry.result]));
  assert.equal(byCase.get('queue-claim-starts-running-attempt')?.next_state, 'running');
  assert.equal(byCase.get('typed-closeout-projects-memory-writeback')?.next_state, 'memory_writeback_proposed');
  assert.equal(byCase.get('owner-receipt-completes-memory-writeback-chain')?.next_state, 'completed');
  assert.equal(byCase.get('domain-blocker-projects-human-gate')?.human_gate?.owner, 'human_operator');
  assert.equal(byCase.get('retryable-failure-projects-retry-queued')?.next_state, 'retry_queued');
  assert.equal(
    byCase.get('retry-exhaustion-advances-consumable-artifact-with-quality-debt')?.projection
      ?.transition_outcome,
    'completed_with_quality_debt',
  );
  assert.equal(
    byCase.get('retry-exhaustion-advances-consumable-artifact-with-quality-debt')?.projection
      ?.quality_or_ready_claim_authorized,
    false,
  );
  assert.equal(byCase.get('retry-exhaustion-projects-dead-letter')?.dead_letter_intent?.reason, 'retry_budget_exhausted');
  assert.equal(byCase.get('operator-repair-projects-domain-owner-route')?.next_state, 'repair_queued');
  assert.equal(byCase.get('unknown-guard-fails-closed-before-dispatch')?.typed_blocker?.blocker_code, 'unknown_guard_id');
  assert.equal(byCase.get('unknown-transition-dead-letters-without-domain-action')?.status, 'dead_letter_intended');

  assert.equal(result.authority_boundary.claims_live_soak_complete, false);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
  assert.equal(result.authority_boundary.can_accept_or_reject_memory_writeback, false);
  assert.equal(result.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(result.authority_boundary.provider_completion_is_domain_ready, false);
});

test('functional agent runtime harness blocks memory-body payloads instead of treating refs as applied memory', () => {
  const input = buildConstructedFunctionalAgentRuntimeHarnessInput();
  input.attempts = input.attempts.map((attempt) =>
    attempt.case_id === 'typed-closeout-projects-memory-writeback'
      ? {
          ...attempt,
          route_impact: {
            ...attempt.route_impact,
            memory_body: 'this body belongs to the domain owner and must not enter OPL',
          },
        }
      : attempt);

  const result = runFunctionalAgentRuntimeHarness(input);

  assert.equal(result.harness_status, 'blocked');
  assert.equal(result.observations.memory_refs_only_writeback_chain_observed, false);
  assert.equal(result.summary.memory_body_observed, true);
  assert.ok(result.missing_observations.includes('memory_refs_only_writeback_chain_observed'));
  assert.equal(result.authority_boundary.can_write_memory_body, false);
});

test('functional agent runtime harness blocks forbidden OPL authority claims', () => {
  const input = buildConstructedFunctionalAgentRuntimeHarnessInput();
  input.attempts = input.attempts.map((attempt) =>
    attempt.case_id === 'owner-receipt-completes-memory-writeback-chain'
      ? {
          ...attempt,
          authority_boundary: {
            ...attempt.authority_boundary,
            can_authorize_domain_ready: true,
          },
        }
      : attempt);

  const result = runFunctionalAgentRuntimeHarness(input);

  assert.equal(result.harness_status, 'blocked');
  assert.equal(result.observations.forbidden_authority_flags_all_false, false);
  assert.equal(result.summary.forbidden_authority_flag_count, 1);
  assert.deepEqual(result.refs.forbidden_authority_flags, [
    'attempt:sat_constructed_memory_receipt:authority_boundary.can_authorize_domain_ready',
  ]);
  assert.ok(result.missing_observations.includes('forbidden_authority_flags_all_false'));
});

test('functional agent runtime harness contract is active and exported as an OPL framework surface', () => {
  const contract = readJson('contracts/opl-framework/functional-agent-runtime-harness-contract.json');
  const packageJson = readJson('package.json');

  assert.equal(contract.contract_kind, 'opl_functional_agent_runtime_harness_contract.v1');
  assert.equal(contract.surface_kind, 'opl_functional_agent_runtime_harness_contract');
  assert.equal(contract.contract_version, 'opl-functional-agent-runtime-harness.v1');
  assert.equal(packageJson.exports['./functional-agent-runtime-harness'], './dist/modules/runway/functional-agent-runtime-harness.js');
  assert.equal(contract.live_soak_boundary.claims_live_soak_complete, false);
  assert.equal(contract.live_soak_boundary.can_authorize_domain_ready, false);

  for (const observation of [
    'stage_attempt_projection_ledger_observed',
    'typed_closeout_observed',
    'memory_refs_only_writeback_chain_observed',
    'state_transition_matrix_smooth',
    'fail_closed_blocker_projected',
    'human_gate_projected',
    'retry_projected',
    'dead_letter_projected',
    'repair_route_projected',
    'forbidden_authority_flags_all_false',
  ]) {
    assert.ok(contract.required_observations.includes(observation));
  }

  for (const forbidden of [
    'domain truth write',
    'memory body write',
    'memory writeback accept/reject verdict',
    'domain ready verdict',
    'quality/export verdict',
    'domain action execution',
  ]) {
    assert.ok(contract.forbidden_authority.includes(forbidden));
  }
});
