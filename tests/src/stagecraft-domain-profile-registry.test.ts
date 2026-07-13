import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStagecraftDomainProfileRegistryReadback,
} from '../../src/modules/stagecraft/index.ts';
import {
  normalizeDomainOwnerAnswerProjectionProfile,
} from '../../src/kernel/domain-owner-answer-projection-profile.ts';

test('Stagecraft domain profile registry retires transition adapters and has no static owner-answer profile', () => {
  const readback = buildStagecraftDomainProfileRegistryReadback([]);

  assert.equal(readback.surface_kind, 'opl_stagecraft_domain_profile_registry_readback');
  assert.equal(readback.registry_role, 'generic_stagecraft_domain_profile_registry');
  assert.equal(readback.owner_answer_projection.registry_surface_kind, 'opl_domain_owner_answer_projection_profile_registry');
  assert.deepEqual(readback.owner_answer_projection.profiles, []);
  assert.equal(Object.hasOwn(readback, 'transition_adapter'), false);
  assert.equal(readback.summary.owner_answer_projection_profile_count, 0);
  assert.equal(readback.summary.owner_answer_projection_compatibility_profile_count, 0);
  assert.equal(readback.summary.transition_adapter_profile_count, 0);
  assert.equal(readback.summary.transition_adapter_compatibility_profile_count, 0);
  assert.equal(readback.summary.transition_adapter_status, 'retired_single_codex_semantic_control_plane');
  assert.equal(readback.authority_boundary.registry_is_readback_only, true);
  assert.equal(readback.authority_boundary.can_write_domain_truth, false);
  assert.equal(readback.authority_boundary.can_create_owner_receipt, false);
  assert.equal(readback.authority_boundary.can_create_typed_blocker, false);
  assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readback.authority_boundary.can_claim_visual_ready, false);
});

test('domain-owned profile normalizes its stage-native closeout binding', () => {
  const profile = normalizeDomainOwnerAnswerProjectionProfile({
    surface_kind: 'opl_domain_owner_answer_projection_profile',
    version: 'domain-owner-answer-projection-profile.v1',
    profile_id: 'example-domain.owner-answer.v1',
    profile_role: 'registry',
    domain_id: 'example-domain',
    binding_project_id: 'example-domain',
    source_owner: 'example-domain',
    studies_dir_name: 'cases',
    projection_relative_path: ['owner-answer.json'],
    stage_native_owner_answer: {
      canonical_projection: 'domain_stage_native_owner_answer',
      dispatch_task_kind: 'domain_owner/default-executor-dispatch',
      action_type: 'close-example',
      work_unit_id: 'close-example',
      next_executable_owner: 'example-domain',
      closeout_surface_kind: 'example_stage_closeout',
      stage_id: 'close-example',
      stage_outputs_fragment: 'artifacts/stage_outputs/close-example',
      owner_receipt_ref: 'artifacts/stage_outputs/close-example/receipts/owner_receipt.json',
      typed_blocker_ref: 'artifacts/stage_outputs/close-example/receipts/typed_blocker.json',
      relative_owner_receipt_ref: 'receipts/owner_receipt.json',
      relative_typed_blocker_ref: 'receipts/typed_blocker.json',
    },
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  }, 'contracts/example-owner-answer-profile.json') as any;

  assert.equal(profile.stageNativeOwnerAnswer?.stageId, 'close-example');
  assert.equal(profile.stageNativeOwnerAnswer?.closeoutSurfaceKind, 'example_stage_closeout');
  assert.equal(profile.stageNativeOwnerAnswer?.relativeTypedBlockerRef, 'receipts/typed_blocker.json');
});
