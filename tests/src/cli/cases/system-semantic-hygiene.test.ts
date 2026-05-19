import {
  assert,
  runCli,
  test,
} from '../helpers.ts';

const EXPECTED_GATES = [
  'provider_readiness_single_truth',
  'generated_surface_drift_owner_claim',
  'app_operator_drilldown_overprojection',
  'family_runtime_parser_monolith',
  'stage_launch_guarantee_clarity',
  'legacy_vocabulary_active_leakage',
] as const;

test('system semantic hygiene exposes six machine gates without production or domain-ready claims', () => {
  const output = runCli(['system', 'semantic-hygiene', '--json']);
  const audit = output.semantic_hygiene;

  assert.equal(output.version, 'g2');
  assert.equal(audit.surface_kind, 'opl_framework_semantic_hygiene_audit');
  assert.equal(audit.summary.gate_count, 6);
  assert.equal(audit.summary.production_or_domain_ready, false);
  assert.equal(audit.summary.production_ready_claim_count, 0);
  assert.equal(audit.summary.domain_ready_claim_count, 0);
  assert.equal(audit.summary.artifact_authority_claim_count, 0);
  assert.equal(audit.authority_boundary.opl_can_claim_provider_production_ready_from_this_surface, false);
  assert.equal(audit.authority_boundary.opl_can_claim_domain_ready_from_this_surface, false);
  assert.equal(audit.authority_boundary.opl_can_authorize_quality_or_export_from_this_surface, false);

  const gates = new Map(audit.gates.map((gate: { gate_id: string }) => [gate.gate_id, gate]));
  assert.deepEqual([...gates.keys()].sort(), [...EXPECTED_GATES].sort());

  for (const gateId of EXPECTED_GATES) {
    const gate = gates.get(gateId) as {
      owner?: unknown;
      source_evidence?: unknown;
      current_state_claims?: {
        production_ready?: unknown;
        domain_ready?: unknown;
        artifact_authority?: unknown;
      };
    };
    assert.equal(typeof gate.owner, 'string');
    assert.equal(Array.isArray(gate.source_evidence), true);
    const evidenceRefs = gate.source_evidence as { ref?: unknown; evidence_kind?: unknown }[];
    assert.ok(evidenceRefs.length > 0);
    for (const evidence of evidenceRefs) {
      assert.equal(typeof evidence.ref, 'string');
      assert.equal(evidence.evidence_kind, 'machine_surface_or_guard');
    }
    assert.equal(gate.current_state_claims?.production_ready, false);
    assert.equal(gate.current_state_claims?.domain_ready, false);
    assert.equal(gate.current_state_claims?.artifact_authority, false);
  }

  const nextActionIds = audit.next_actions.map((action: { gate_id: string }) => action.gate_id).sort();
  assert.deepEqual(nextActionIds, [...EXPECTED_GATES].sort());
});

test('help advertises the semantic hygiene system command', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  assert.equal(commands.includes('system semantic-hygiene'), true);
});
