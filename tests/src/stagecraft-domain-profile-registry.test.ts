import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStagecraftDomainProfileRegistryReadback,
} from '../../src/modules/stagecraft/index.ts';

test('Stagecraft domain profile registry readback folds owner-answer and transition profiles', () => {
  const readback = buildStagecraftDomainProfileRegistryReadback();
  const ownerAnswerProfile = readback.owner_answer_projection.profiles.find((entry) =>
    entry.profile_id === 'medautoscience.publication_handoff.owner_answer_projection.compatibility.v1'
  );
  const transitionProfile = readback.transition_adapter.registry_entries.find((entry) =>
    entry.profile_id === 'redcube-ai.visual_transition.compatibility.v1'
  );

  assert.equal(readback.surface_kind, 'opl_stagecraft_domain_profile_registry_readback');
  assert.equal(readback.registry_role, 'generic_stagecraft_domain_profile_registry');
  assert.equal(readback.owner_answer_projection.registry_surface_kind, 'opl_domain_owner_answer_projection_profile_registry');
  assert.equal(readback.transition_adapter.registry_surface_kind, 'opl_domain_transition_adapter_profile_registry');
  assert.equal(ownerAnswerProfile?.profile_role, 'compatibility');
  assert.equal(ownerAnswerProfile?.compatibility_projection, true);
  assert.equal(transitionProfile?.adapter_profile.profile_role, 'compatibility_projection');
  assert.equal(transitionProfile?.adapter_profile.compatibility_projection, true);
  assert.equal(readback.summary.owner_answer_projection_compatibility_profile_count, 1);
  assert.equal(readback.summary.transition_adapter_compatibility_profile_count, 1);
  assert.equal(readback.authority_boundary.registry_is_readback_only, true);
  assert.equal(readback.authority_boundary.can_write_domain_truth, false);
  assert.equal(readback.authority_boundary.can_create_owner_receipt, false);
  assert.equal(readback.authority_boundary.can_create_typed_blocker, false);
  assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readback.authority_boundary.can_claim_visual_ready, false);
});
