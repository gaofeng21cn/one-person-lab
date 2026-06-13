import assert from 'node:assert/strict';
import test from 'node:test';

import { toPendingTaskInputs } from '../../src/family-runtime-domain-intake-parts/pending-task-inputs.ts';

const exportContext = {
  cwd: '/tmp/domain-workspace',
  source: 'workspace_binding',
  owner_fingerprint: 'workspace_binding:/tmp/domain-workspace:profile',
};

test('pending family task intake preserves exported metadata and canonicalizes domain aliases', () => {
  const result = toPendingTaskInputs('medautoscience', {
    pending_family_tasks: [
      {
        domain_id: 'med-auto-grant',
        recommended_task_kind: 'grant/review',
        priority: 55,
        source: 'mag-domain-handler-export',
        dedupe_key: 'mag:grant-review',
        source_fingerprint: 'sha256:grant-source',
        source_refs: [{ role: 'grant_packet', ref: 'grants/current.json' }],
        owner_route_refs: ['owner-route:one', 'owner-route:one', 'owner-route:two'],
        owner_route_ref: 'owner-route:three',
        owner_route: { ref: 'owner-route:four' },
        owner_receipt_refs: ['receipt:one'],
        typed_blocker_refs: ['blocker:one'],
        dispatch_owner: 'med-autogrant',
        profile_name: 'mag-default',
        domain_truth_owner: 'med-autogrant',
        queue_owner: 'one-person-lab',
        reason: 'route_waiting_review',
        runtime_state_path: 'runtime/state.json',
        requires_approval: true,
        domain_dispatch_evidence_record_payload: {
          evidence_record_ref: 'evidence:route',
        },
        owner_route_handoff: {
          handoff_ref: 'handoff:route',
        },
        payload: {
          grant_id: 'G001',
          source_fingerprint: 'payload-source',
        },
      },
    ],
  }, 'opl-intake', exportContext);

  assert.equal(result.blocked.length, 0);
  assert.equal(result.inputs.length, 1);
  const input = result.inputs[0];
  assert.equal(input.domainId, 'medautogrant');
  assert.equal(input.taskKind, 'grant/review');
  assert.equal(input.priority, 55);
  assert.equal(input.source, 'mag-domain-handler-export');
  assert.equal(input.dedupeKey, 'mag:grant-review');
  assert.equal(input.requiresApproval, true);
  assert.deepEqual(input.payload.owner_route_refs, [
    'owner-route:one',
    'owner-route:two',
    'owner-route:three',
    'owner-route:four',
  ]);
  assert.deepEqual(input.payload.opl_domain_export_context, {
    command_source: 'workspace_binding',
    owner_fingerprint: 'workspace_binding:/tmp/domain-workspace:profile',
    command_cwd: '/tmp/domain-workspace',
  });
  assert.deepEqual(input.payload.opl_runtime_owner_route_handoff, {
    handoff_ref: 'handoff:route',
  });
  assert.deepEqual(input.payload.domain_dispatch_evidence_record_payload, {
    evidence_record_ref: 'evidence:route',
  });
  assert.equal(input.payload.source_fingerprint, 'sha256:grant-source');
  assert.equal(input.payload.recommended_task_kind, 'grant/review');
});

test('pending family task intake reports invalid and forbidden tasks without enqueue inputs', () => {
  const result = toPendingTaskInputs('medautoscience', {
    pending_family_tasks: [
      'not-a-task',
      {
        domain_id: 'unknown-domain',
        task_kind: 'domain/action',
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'domain/forbidden',
        payload: {
          domain_truth_write: true,
        },
      },
      {
        domain_id: 'medautoscience',
        payload: {
          study_id: 'DM002',
        },
      },
    ],
  }, 'opl-intake', exportContext);

  assert.equal(result.inputs.length, 0);
  assert.deepEqual(result.blocked.map((entry) => entry.reason), [
    'invalid_pending_task',
    'invalid_domain_or_task_kind',
    'domain_forbidden_write',
    'invalid_domain_or_task_kind',
  ]);
});
