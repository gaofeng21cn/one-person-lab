import assert from 'node:assert/strict';
import test from 'node:test';

import * as companions from '../../src/modules/console/product-entry-program-companions.ts';

test('all 14 product entry program companion builders remain callable public exports', () => {
  const check = {
    check_id: 'workspace_ready',
    title: 'Workspace Ready',
    status: 'fail',
    blocking: true,
    summary: 'workspace missing',
    command: 'opl workspace doctor',
  };
  const workflowCoverage = {
    step_id: 'workspace',
    manual_flow_label: 'Workspace',
    coverage_status: 'covered',
    current_surface: 'opl workspace',
    remaining_gap: 'none',
  };
  const guardrail = {
    guardrail_id: 'workspace_required',
    trigger: 'workspace missing',
    symptom: 'cannot start',
    recommended_command: 'opl workspace doctor',
  };
  const step = { step_id: 'doctor', command: 'opl workspace doctor', surface_kind: 'workspace_doctor' };
  const surface = { surface_kind: 'source_ref', ref: 'source-ref:fixture/current' };
  const clearanceTarget = { target_id: 'workspace', title: 'Workspace', commands: ['opl workspace doctor'] };
  const capability = { capability_id: 'workspace', owner: 'example-domain', summary: 'Workspace entry.' };
  const sequenceStep = {
    step_id: 'workspace',
    phase_id: 'phase_1',
    status: 'in_progress',
    summary: 'Prepare workspace.',
  };

  const cases = [
    { name: 'buildProgramCheck', field: 'check_id', expected: 'workspace_ready', run: () => companions.buildProgramCheck(check) },
    {
      name: 'buildProductEntryPreflight', field: 'surface_kind', expected: 'product_entry_preflight',
      run: () => companions.buildProductEntryPreflight({
        summary: 'Blocked preflight.',
        recommended_check_command: 'opl workspace doctor',
        recommended_start_command: 'opl start',
        checks: [check],
      }),
    },
    { name: 'buildWorkflowCoverageItem', field: 'step_id', expected: 'workspace', run: () => companions.buildWorkflowCoverageItem(workflowCoverage) },
    { name: 'buildGuardrailClass', field: 'guardrail_id', expected: 'workspace_required', run: () => companions.buildGuardrailClass(guardrail) },
    { name: 'buildProgramStep', field: 'step_id', expected: 'doctor', run: () => companions.buildProgramStep(step) },
    { name: 'buildProgramSurface', field: 'surface_kind', expected: 'source_ref', run: () => companions.buildProgramSurface(surface) },
    { name: 'buildClearanceTarget', field: 'target_id', expected: 'workspace', run: () => companions.buildClearanceTarget(clearanceTarget) },
    { name: 'buildProgramCapability', field: 'capability_id', expected: 'workspace', run: () => companions.buildProgramCapability(capability) },
    { name: 'buildProgramSequenceStep', field: 'step_id', expected: 'workspace', run: () => companions.buildProgramSequenceStep(sequenceStep) },
    {
      name: 'buildDetailedReadiness', field: 'surface_kind', expected: 'detailed_readiness',
      run: () => companions.buildDetailedReadiness({
        surface_kind: 'detailed_readiness',
        verdict: 'blocked',
        usable_now: false,
        good_to_use_now: false,
        fully_automatic: false,
        user_experience_level: 'developer',
        summary: 'Workspace is required.',
        recommended_start_surface: 'workspace',
        recommended_start_command: 'opl workspace',
        recommended_loop_surface: 'runway',
        recommended_loop_command: 'opl runway',
        workflow_coverage: [workflowCoverage],
        blocking_gaps: ['workspace_ready'],
      }),
    },
    {
      name: 'buildProductEntryGuardrails', field: 'surface_kind', expected: 'product_entry_guardrails',
      run: () => companions.buildProductEntryGuardrails({
        summary: 'Guardrails.',
        guardrail_classes: [guardrail],
        recovery_loop: [step],
      }),
    },
    {
      name: 'buildClearanceLane', field: 'surface_kind', expected: 'clearance_lane',
      run: () => companions.buildClearanceLane({
        surface_kind: 'clearance_lane',
        summary: 'Clear workspace.',
        recommended_step_id: 'doctor',
        recommended_command: 'opl workspace doctor',
        clearance_targets: [clearanceTarget],
        clearance_loop: [step],
        proof_surfaces: [surface],
        recommended_phase_command: 'opl phase phase_1',
      }),
    },
    {
      name: 'buildSourceProvenanceSurface', field: 'surface_kind', expected: 'source_provenance',
      run: () => companions.buildSourceProvenanceSurface({
        summary: 'Source refs do not define runtime authority.',
        source_provenance_ref: surface,
        historical_fixture_ref: { surface_kind: 'historical_fixture_ref', ref: 'fixture-ref:history/current' },
        explicit_archive_import_ref: { surface_kind: 'explicit_archive_import_ref', command: 'domain archive import' },
        authority_boundary: ['source_refs_do_not_define_runtime_dependency'],
        capability_classification: 'source_provenance_only',
        recommended_audit_command: 'domain backend-audit',
      }),
    },
    {
      name: 'buildPlatformTarget', field: 'surface_kind', expected: 'phase5_platform_target',
      run: () => companions.buildPlatformTarget({
        summary: 'Platform target.',
        sequence_scope: 'workspace_landing',
        current_step_id: 'workspace',
        current_readiness_summary: 'Workspace remains open.',
        north_star_topology: { domain_agent_entry: 'example-domain' },
        target_internal_modules: ['workspace'],
        landing_sequence: [sequenceStep],
        completed_step_ids: [],
        remaining_step_ids: ['workspace'],
        promotion_gates: ['owner_gate'],
        recommended_phase_command: 'opl phase phase_1',
      }),
    },
  ] as const;

  assert.equal(cases.length, 14);
  assert.deepEqual(Object.keys(companions).sort(), cases.map((entry) => entry.name).sort());
  for (const entry of cases) {
    const result = entry.run() as Record<string, unknown>;
    assert.equal(result[entry.field], entry.expected, entry.name);
  }
});
