import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildStagecraftDomainProfileRegistryReadback,
} from '../../src/modules/stagecraft/index.ts';
import { findOwnerAnswerProjection } from '../../src/modules/stagecraft/mas-owner-answer-projection.ts';

test('Stagecraft domain profile registry readback keeps transition profiles external', () => {
  const readback = buildStagecraftDomainProfileRegistryReadback();
  const ownerAnswerProfile = readback.owner_answer_projection.profiles.find((entry) =>
    entry.profile_id === 'medautoscience.publication_handoff.owner_answer_projection.compatibility.v1'
  );

  assert.equal(readback.surface_kind, 'opl_stagecraft_domain_profile_registry_readback');
  assert.equal(readback.registry_role, 'generic_stagecraft_domain_profile_registry');
  assert.equal(readback.owner_answer_projection.registry_surface_kind, 'opl_domain_owner_answer_projection_profile_registry');
  assert.equal(readback.transition_adapter.registry_surface_kind, 'opl_domain_transition_adapter_profile_registry');
  assert.equal(ownerAnswerProfile?.profile_role, 'compatibility');
  assert.equal(ownerAnswerProfile?.compatibility_projection, true);
  assert.deepEqual(readback.transition_adapter.registry_entries, []);
  assert.equal(readback.summary.owner_answer_projection_compatibility_profile_count, 1);
  assert.equal(readback.summary.transition_adapter_profile_count, 0);
  assert.equal(readback.summary.transition_adapter_compatibility_profile_count, 0);
  assert.equal(readback.authority_boundary.registry_is_readback_only, true);
  assert.equal(readback.authority_boundary.can_write_domain_truth, false);
  assert.equal(readback.authority_boundary.can_create_owner_receipt, false);
  assert.equal(readback.authority_boundary.can_create_typed_blocker, false);
  assert.equal(readback.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readback.authority_boundary.can_claim_visual_ready, false);
});

test('owner-answer projection lookup accepts an injected generic domain profile', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-answer-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-answer-workspace-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const receipt = {
      domain_id: 'example-domain',
      provider_attempt_ref: 'opl://stage-attempts/example',
      attempt_lease_ref: 'opl://stage-attempts/example/lease/current',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref: 'opl://stage-attempts/example/execution-authorization/current',
      source_fingerprint: 'example-domain:source:v1',
      idempotency_key: 'example-domain-attempt',
    } as any;
    fs.writeFileSync(
      path.join(stateRoot, 'workspace-registry.json'),
      `${JSON.stringify({
        version: 'g2',
        bindings: [{
          binding_id: 'example-owner-answer',
          project_id: 'example-domain',
          project: 'example-domain',
          workspace_path: workspaceRoot,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'example_workspace_profile',
              workspace_root: workspaceRoot,
              profile_ref: null,
              input_path: null,
            },
          },
          created_at: '2026-07-10T00:00:00.000Z',
          updated_at: '2026-07-10T00:00:00.000Z',
          archived_at: null,
        }],
      }, null, 2)}\n`,
    );
    const projectionPath = path.join(workspaceRoot, 'cases', 'case-1', 'owner-answer.json');
    fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
    fs.writeFileSync(
      projectionPath,
      `${JSON.stringify({
        closeout_binding: {
          trusted_opl_execution_authorization: true,
          provider_attempt_ref: receipt.provider_attempt_ref,
          attempt_lease_ref: receipt.attempt_lease_ref,
          attempt_lease_status: receipt.attempt_lease_status,
          execution_authorization_decision_ref: receipt.execution_authorization_decision_ref,
          source_fingerprint: receipt.source_fingerprint,
          idempotency_key: receipt.idempotency_key,
        },
      }, null, 2)}\n`,
    );

    const projection = findOwnerAnswerProjection({
      receipt,
      profiles: [{
        profileId: 'example-domain.owner-answer.v1',
        profileRole: 'registry',
        domainId: 'example-domain',
        bindingProjectId: 'example-domain',
        sourceOwner: 'example-domain',
        studiesDirName: 'cases',
        projectionRelativePath: ['owner-answer.json'],
      }],
    });

    assert.equal(projection?.projection_ref, projectionPath);
    assert.equal(projection?.projection_role, 'domain_profile_projection');
    assert.equal(projection?.domain_profile.source_owner, 'example-domain');
    assert.equal(projection?.domain_profile.compatibility_projection, false);
    assert.equal(projection?.authority_boundary.source_owner, 'example-domain');
    assert.equal(projection?.authority_boundary.can_write_domain_truth, false);
    assert.equal(projection?.authority_boundary.can_create_owner_receipt, false);
    assert.equal(projection?.authority_boundary.can_claim_domain_ready, false);
    assert.equal(projection?.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
