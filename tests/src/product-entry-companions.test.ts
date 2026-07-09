import './product-entry-companions/validators.test.ts';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGeneratedProductEntryManifestCompanions,
  buildGeneratedProductEntrySessionSurface,
} from '../../src/modules/console/product-entry-companions.ts';

const entryDescriptor = {
  direct: {
    command: 'sample product invoke',
    surface_kind: 'product_entry',
    required_fields: ['entry_session_id', 'topic_id'],
  },
  session: {
    command: 'opl_generated:product_session --entry-session-id <entry-session-id>',
    surface_kind: 'product_entry_session',
    required_fields: ['entry_session_id'],
    session_locator_field: 'entry_session_contract.entry_session_id',
    checkpoint_locator_field: 'continuation_snapshot.latest_stage_execution_plan_ref',
  },
  opl_hosted: {
    action_ref: 'opl_framework:hosted_product_entry',
    surface_kind: 'opl_hosted_product_entry',
    required_fields: ['entry_session_id', 'topic_id'],
  },
  progress: {
    surface_kind: 'product_entry_session',
    command: 'opl_generated:product_session --entry-session-id <entry-session-id>',
    step_id: 'inspect_current_progress',
  },
  resume: {
    command: 'opl_generated:product_session --entry-session-id <entry-session-id>',
    surface_kind: 'product_entry_session',
    required_fields: ['entry_session_id'],
    session_locator_field: 'entry_session_contract.entry_session_id',
    checkpoint_locator_field: 'continuation_snapshot.latest_stage_execution_plan_ref',
  },
  operator: {
    command: 'sample product invoke',
    recommended_step_id: 'continue_current_loop',
  },
  proof_actions: [{
    action_id: 'default_proof',
    command: 'sample proof --session <entry-session-id>',
    surface_kind: 'product_entry_proof',
    required_fields: ['entry_session_id'],
  }],
  readiness: {
    verdict: 'service_surface_ready_not_end_user_shell',
    usable_now: true,
    good_to_use_now: false,
    fully_automatic: false,
    blocking_gaps: ['production evidence tail remains open'],
    evidence_refs: ['/product_entry_preflight'],
  },
  next_focus_refs: ['/generated_interface_consumption'],
};

test('generated product-entry companions materialize entry shapes from a declarative descriptor', () => {
  const companions = buildGeneratedProductEntryManifestCompanions({
    entry_descriptor: entryDescriptor,
    family_orchestration: {
      human_gates: [{ gate_id: 'operator_review_gate' }],
    },
  });

  assert.equal(companions.product_entry_quickstart.recommended_step_id, 'continue_current_loop');
  assert.equal(companions.product_entry_start.modes.length, 3);
  assert.equal(companions.product_entry_overview.remaining_gaps_count, 1);
  assert.deepEqual(companions.product_entry_readiness.evidence_refs, ['/product_entry_preflight']);
  assert.deepEqual(companions.product_entry_quickstart.human_gate_ids, ['operator_review_gate']);
});

test('generated product-entry session projects refs without domain authority bodies', () => {
  const session = buildGeneratedProductEntrySessionSurface({
    domain_id: 'sample-domain',
    domain_owner: 'sample-domain',
    runtime_owner: 'one-person-lab',
    entry_session_id: 'session-1',
    session_file: '/tmp/session-1.json',
    delivery_identity: { deliverable_id: 'deck-1', deliverable_family: 'presentation' },
    continuation_snapshot: { status: 'resumable', latest_update: 'review refs available' },
    family_orchestration: { action_graph_ref: 'graph:1' },
    review_projection: { review_verdict_ref: 'review:1' },
    publication_projection: { publication_verdict_ref: 'publication:1' },
    artifact_locator_contract: { contract_ref: 'artifact-locator:v1' },
    artifact_refs: [{ ref: 'artifact:deck.pptx' }],
    direct_product_entry_command: 'sample product invoke',
    opl_hosted_handoff_ref: 'opl:hosted-entry',
    source: 'product_entry',
    entry_mode: 'direct',
    domain_projection: { visual_review_ref: 'review:visual:1' },
  });

  assert.equal(session.surface_kind, 'opl_generated_product_entry_session_surface');
  assert.equal(session.artifact_inventory.summary.artifact_body_count, 0);
  assert.equal(session.authority_boundary.can_create_typed_blocker, false);
  assert.equal(session.runtime_loop_closure.owner_receipt_created, false);
  assert.throws(() => buildGeneratedProductEntrySessionSurface({
    domain_id: 'sample-domain',
    domain_owner: 'sample-domain',
    runtime_owner: 'one-person-lab',
    entry_session_id: 'session-1',
    session_file: '/tmp/session-1.json',
    delivery_identity: { deliverable_id: 'deck-1' },
    continuation_snapshot: { status: 'blocked' },
    family_orchestration: { action_graph_ref: 'graph:1' },
    review_projection: { typed_blocker: { blocker_id: 'forbidden-body' } },
    publication_projection: { publication_verdict_ref: 'publication:1' },
    artifact_locator_contract: { contract_ref: 'artifact-locator:v1' },
    source: 'product_entry',
    entry_mode: 'direct',
  }), /authority body/);
});
