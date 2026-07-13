import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRuntimeHardStopReason,
  runtimeHardStopClassForReason,
} from '../../src/kernel/progress-hard-stop-policy.ts';

test('runtime hard-stop reasons map once to canonical Stage quality classes', () => {
  assert.equal(runtimeHardStopClassForReason('dirty_checkout'), 'stale_or_mismatched_stage_identity');
  assert.equal(runtimeHardStopClassForReason('artifact_byte_identity_mismatch'), 'stale_or_mismatched_stage_identity');
  assert.equal(runtimeHardStopClassForReason('credential_missing'), 'permission_or_credential_boundary');
  assert.equal(runtimeHardStopClassForReason('forbidden_write'), 'authority_boundary_violation');
  assert.equal(runtimeHardStopClassForReason('unsafe_external_action'), 'safety_or_compliance');
  assert.equal(runtimeHardStopClassForReason('human_gate_required'), 'human_decision_required');
  assert.equal(runtimeHardStopClassForReason('ordinary_quality_gap'), null);
  assert.equal(isRuntimeHardStopReason('ordinary_quality_gap'), false);
});
