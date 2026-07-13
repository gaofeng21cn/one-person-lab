import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

test('stage route transport is passive and Codex owns every semantic route decision', () => {
  const contract = readJson('contracts/opl-framework/stage-route-transport-contract.json');
  const serialized = JSON.stringify(contract);

  assert.equal(contract.contract_kind, 'opl_stage_route_transport_contract.v1');
  assert.equal(contract.codex_semantic_route_boundary.semantic_owner, 'codex_cli');
  assert.equal(contract.codex_semantic_route_boundary.any_declared_stage_may_start_from_any_readable_prior_artifact, true);
  assert.equal(contract.codex_semantic_route_boundary.quality_budget_exhaustion_blocks_route, false);
  assert.equal(contract.authority_boundary.opl_can_choose_semantic_stage_route, false);
  assert.equal(contract.authority_boundary.opl_can_block_next_stage_for_quality_debt, false);
  assert.equal(contract.attempt_transport.typed_closeout_required_for_progress, false);
  assert.equal(contract.attempt_transport.raw_or_free_text_artifact_accepted_for_progress, true);
  for (const forbidden of [
    'scheduler_layers',
    'reconciliation_steps',
    'check_stage_graph_requires_ensures_and_launch_boundary',
    'execution_authorization_ledger',
    'successor_selector',
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, forbidden);
  }
});
