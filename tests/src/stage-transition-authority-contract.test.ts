import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('Stage Transition Authority contract freezes one writer and many intent producers', () => {
  const contract = readJson<Record<string, any>>(
    'contracts/opl-framework/stage-transition-authority-contract.json',
  );

  assert.equal(contract.surface_kind, 'opl_stage_transition_authority_contract');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.equal(contract.single_writer_policy.stage_current_pointer_writer, 'stage_transition_authority');
  assert.equal(contract.single_writer_policy.stage_run_terminal_state_writer, 'stage_transition_authority');
  assert.equal(contract.single_writer_policy.current_owner_delta_publisher, 'stage_transition_authority');
  assert.equal(contract.single_writer_policy.parallel_intent_policy, 'many_producers_one_authority_decision');
  assert.equal(
    contract.single_writer_policy.read_model_generation_fold_policy,
    'observed_generation_tracks_highest_event_but_observation_only_generation_does_not_clear_latest_accepted_transition_or_current_owner_delta',
  );
  assert.deepEqual(contract.transition_capable_intents, [
    'domain_owner_answer',
    'typed_blocker',
    'human_gate_decision',
  ]);
  assert.equal(contract.observation_only_intents.includes('provider_observation'), true);
  assert.equal(contract.observation_only_intents.includes('read_model_observation'), true);
  assert.equal(contract.observation_only_intents.includes('worklist_observation'), true);
  assert.equal(contract.authority_boundary.stage_transition_single_writer, true);
  assert.equal(contract.authority_boundary.intent_producer_can_write_stage_current_pointer, false);
  assert.equal(contract.authority_boundary.provider_completion_counts_as_stage_transition, false);
  assert.equal(contract.authority_boundary.read_model_update_counts_as_stage_transition, false);
  assert.equal(contract.authority_boundary.worklist_update_counts_as_stage_transition, false);
  assert.equal(contract.authority_boundary.agent_lab_output_counts_as_stage_transition, false);
  assert.equal(contract.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(contract.authority_boundary.opl_can_create_owner_receipt, false);
  assert.equal(contract.authority_boundary.opl_can_create_typed_blocker, false);
});

test('Stage Transition Authority contract requires full StageRun closeout identity binding', () => {
  const contract = readJson<Record<string, any>>(
    'contracts/opl-framework/stage-transition-authority-contract.json',
  );

  assert.deepEqual(contract.required_identity_binding_fields, [
    'stage_run_id',
    'generation',
    'domain_id',
    'stage_id',
    'source_fingerprint',
    'idempotency_key',
    'stage_manifest_ref',
    'current_pointer_ref',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
  ]);
  assert.deepEqual(contract.required_closeout_binding_fields, [
    'owner_answer_stage_run_id',
    'owner_answer_generation',
    'owner_answer_manifest_ref',
    'owner_answer_current_pointer_ref',
    'owner_answer_source_fingerprint',
    'owner_answer_idempotency_key',
  ]);
  assert.equal(contract.forbidden_as_authority.includes('old controller decision'), true);
  assert.equal(contract.forbidden_as_authority.includes('stale typed blocker'), true);
  assert.equal(contract.authority_event_log.event_log_role, 'append_only_refs_only_transition_authority_events');
  assert.deepEqual(contract.authority_event_log.fold_keys, [
    'stage_run_id',
    'generation',
    'idempotency_key',
  ]);
});

test('Stage Transition intent schema keeps intent producers non-authoritative', () => {
  const schema = readJson<Record<string, any>>(
    'contracts/opl-framework/stage-transition-intent.schema.json',
  );

  assert.equal(schema.surface_kind, 'opl_stage_transition_intent_schema');
  assert.equal(schema.owner, 'one-person-lab');
  assert.equal(schema.state, 'active_contract');
  assert.equal(schema.properties.surface_kind.const, 'opl_stage_transition_intent');
  assert.equal(schema.properties.schema_version.const, 'stage-transition-intent.v1');
  for (const field of [
    'stage_run_id',
    'generation',
    'domain_id',
    'stage_id',
    'source_fingerprint',
    'idempotency_key',
    'stage_manifest_ref',
    'current_pointer_ref',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
  ]) {
    assert.equal(schema.required.includes(field), true, `missing required ${field}`);
  }
  assert.deepEqual(schema.properties.intent_kind.enum, [
    'domain_owner_answer',
    'typed_blocker',
    'human_gate_decision',
    'route_recommendation',
    'provider_observation',
    'read_model_observation',
    'worklist_observation',
    'agent_lab_observation',
    'evidence_observation',
  ]);
  assert.equal(
    schema.$defs.authority_boundary.properties.intent_can_write_stage_current_pointer.const,
    false,
  );
  assert.equal(
    schema.$defs.authority_boundary.properties.intent_can_write_stage_run_terminal_state.const,
    false,
  );
  assert.equal(
    schema.$defs.authority_boundary.properties.intent_can_publish_current_owner_delta.const,
    false,
  );
  assert.equal(
    schema.$defs.authority_boundary.properties.provider_completion_counts_as_stage_transition.const,
    false,
  );
  assert.equal(
    schema.$defs.authority_boundary.properties.read_model_update_counts_as_stage_transition.const,
    false,
  );
});
