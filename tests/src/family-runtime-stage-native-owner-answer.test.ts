import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normalizeDomainOwnerAnswerProjectionProfile,
} from '../../src/kernel/domain-owner-answer-projection-profile.ts';
import * as checkoutCurrentness from '../../src/modules/runway/family-runtime-checkout-currentness.ts';
import * as stageNativeOwnerAnswer from '../../src/modules/runway/family-runtime-stage-native-owner-answer.ts';

test('stage-native owner-answer guard consumes a generic domain profile', () => {
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
  }, 'contracts/example-owner-answer-profile.json');
  const guard = (stageNativeOwnerAnswer as Record<string, unknown>)
    .isStageNativeOwnerActionFromDomainProfile;

  assert.equal(typeof guard, 'function');
  assert.equal((guard as (input: unknown) => boolean)({
    row: {
      domain_id: 'example-domain',
      task_kind: 'domain_owner/default-executor-dispatch',
    },
    payload: {
      action_type: 'close-example',
      work_unit_id: 'close-example',
      next_executable_owner: 'example-domain',
    },
    profiles: [profile],
  }), true);
  assert.equal((guard as (input: unknown) => boolean)({
    row: {
      domain_id: 'other-domain',
      task_kind: 'domain_owner/default-executor-dispatch',
    },
    payload: {
      action_type: 'close-example',
      work_unit_id: 'close-example',
      next_executable_owner: 'example-domain',
    },
    profiles: [profile],
  }), false);
});

test('checkout currentness is enabled only by a domain profile', () => {
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
    checkout_currentness_required: true,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  }, 'contracts/example-owner-answer-profile.json');
  const preflight = (checkoutCurrentness as Record<string, unknown>)
    .preflightDomainWorkspaceCheckoutCurrentness;
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-checkout-currentness-'));

  try {
    assert.equal(typeof preflight, 'function');
    assert.equal((preflight as (input: unknown) => Record<string, unknown> | null)({
      domainId: 'example-domain',
      workspaceLocator: { workspace_root: workspaceRoot },
      profiles: [profile],
    })?.currentness_status, 'not_git_checkout');
    assert.equal((preflight as (input: unknown) => unknown)({
      domainId: 'example-domain',
      workspaceLocator: { workspace_root: workspaceRoot },
      profiles: [{ ...profile, checkoutCurrentnessRequired: false }],
    }), null);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
