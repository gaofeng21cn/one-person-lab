import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFamilyHumanGate,
  buildFamilyOrchestrationCompanion,
  resolveActiveRunId,
  resolveProgramId,
} from '../../src/family-orchestration.ts';

test('resolveActiveRunId and resolveProgramId normalize canonical runtime identifiers', () => {
  assert.equal(resolveActiveRunId(null, '', 'run-123'), 'run-123');
  assert.equal(resolveProgramId({ runtime_program_id: 'program-xyz' }), 'program-xyz');
});

test('buildFamilyHumanGate normalizes required gate fields', () => {
  const gate = buildFamilyHumanGate({
    gate_id: 'gate-1',
    gate_kind: 'operator_review',
    requested_at: '2026-04-18T00:00:00Z',
    request_surface_kind: 'runtime_watch',
    request_surface_id: 'runtime_watch/latest.json',
    evidence_refs: [{ ref_kind: 'repo_path', ref: 'runtime_watch/latest.json', label: 'watch report' }],
    decision_options: ['approve', 'pause'],
  });

  assert.equal(gate.gate_id, 'gate-1');
  assert.equal(gate.request_surface.surface_kind, 'runtime_watch');
  assert.deepEqual(gate.decision_options, ['approve', 'pause']);
});

test('buildFamilyOrchestrationCompanion materializes event envelope and checkpoint lineage', () => {
  const payload = buildFamilyOrchestrationCompanion({
    surface_kind: 'runtime_watch',
    surface_id: 'runtime_watch/latest.json',
    event_name: 'runtime_watch.runtime_scanned',
    source_surface: 'runtime_watch',
    session_id: 'session-1',
    program_id: 'program-1',
    study_id: 'study-1',
    quest_id: 'quest-1',
    active_run_id: 'run-1',
    runtime_decision: 'continue',
    runtime_reason: 'healthy',
    target_domain_id: 'medautoscience',
    human_gates: [{ gate_id: 'gate-1', status: 'requested' }],
    event_envelope_surface: { ref_kind: 'json_pointer', ref: '/runtime_watch/latest' },
    checkpoint_lineage_surface: { ref_kind: 'json_pointer', ref: '/runtime_watch/lineage' },
  });

  assert.equal(payload.resume_contract.session_locator_field, 'event_envelope.session.session_id');
  assert.equal(payload.resume_contract.checkpoint_locator_field, 'checkpoint_lineage.checkpoint_id');
  assert.equal(payload.event_envelope.session.active_run_id, 'run-1');
  assert.equal(payload.event_envelope.payload.runtime_decision, 'continue');
  assert.equal(payload.checkpoint_lineage.checkpoint_id.startsWith('checkpoint-'), true);
  assert.equal(payload.human_gates[0]?.gate_id, 'gate-1');
});
