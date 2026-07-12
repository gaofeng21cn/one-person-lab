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

test('stage route scheduler is transport and currentness only, never a semantic transition controller', () => {
  const contract = readJson('contracts/opl-framework/stage-route-scheduler-contract.json');
  const substrate = contract.stage_route_transport_substrate_contract;

  assert.equal(substrate.surface_kind, 'opl_stage_route_transport_substrate_contract');
  assert.equal(substrate.owner, 'one-person-lab');
  assert.equal(Object.hasOwn(substrate, 'domain_progress_transition_runtime_first_slice'), false);
  assert.equal(JSON.stringify(substrate).includes('DomainProgressTransitionRuntime'), false);
  assert.equal(JSON.stringify(substrate).includes('fixed_point_reconciler'), false);
  assert.equal(JSON.stringify(substrate).includes('exactly_one_transition'), false);

  const surfaces = substrate.required_substrate_surfaces;
  const identity = surfaces.stage_run_currentness_identity;
  assert.equal(
    identity.implementation_ref,
    'src/modules/runway/family-runtime-stage-run-currentness-identity.ts#buildStageRunCurrentnessIdentity',
  );
  assert.ok(identity.required_fields.includes('stage_attempt_id'));
  assert.ok(identity.required_fields.includes('stage_packet_refs'));
  assert.equal(identity.authority_boundary.opl_can_use_for_live_skip, true);
  assert.equal(identity.authority_boundary.opl_holds_mas_quality_authority, false);

  const attemptList = surfaces.attempt_list_audit_safe_readout;
  assert.equal(attemptList.default_limit, 25);
  assert.equal(attemptList.authority_boundary.opl_can_project_bounded_attempt_readout, true);
  assert.equal(attemptList.authority_boundary.opl_can_restart_worker_from_bounded_readout_only, false);

  assert.equal(substrate.authority_boundary.opl_can_reconcile_attempt_ledger, true);
  assert.equal(substrate.authority_boundary.opl_can_choose_semantic_stage_route, false);
  assert.equal(substrate.authority_boundary.opl_can_reject_codex_ai_route, false);
});
