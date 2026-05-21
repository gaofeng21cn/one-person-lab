import {
  assert,
  runCli,
  test,
} from '../helpers.ts';

const EXPECTED_GATES = [
  'provider_readiness_single_truth',
  'generated_surface_drift_owner_claim',
  'app_operator_drilldown_overprojection',
  'evidence_envelope_single_semantics',
  'app_release_evidence_not_contract_only',
  'family_runtime_parser_monolith',
  'stage_launch_guarantee_clarity',
  'legacy_vocabulary_active_leakage',
] as const;

test('system semantic hygiene exposes eight machine gates without production or domain-ready claims', () => {
  const output = runCli(['system', 'semantic-hygiene', '--json']);
  const audit = output.semantic_hygiene;

  assert.equal(output.version, 'g2');
  assert.equal(audit.surface_kind, 'opl_framework_semantic_hygiene_audit');
  assert.equal(audit.summary.gate_count, 8);
  assert.equal(audit.summary.guarded_gate_count, 8);
  assert.equal(audit.summary.attention_required_gate_count, 0);
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

  const providerGate = gates.get('provider_readiness_single_truth') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
  };
  assert.equal(providerGate.status, 'guarded');
  assert.equal(
    providerGate.source_evidence?.some((evidence) =>
      evidence.ref === 'src/family-runtime-temporal-readiness.ts'
    ),
    true,
  );
  assert.match(String(providerGate.next_action), /buildTemporalWorkerReadiness/);

  const parserGate = gates.get('family_runtime_parser_monolith') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
  };
  assert.equal(parserGate.status, 'guarded');
  assert.equal(
    parserGate.source_evidence?.some((evidence) =>
      evidence.ref === 'src/family-runtime-command-parts/registry.ts'
    ),
    true,
  );
  assert.match(String(parserGate.next_action), /command-parts registry/);

  const envelopeGate = gates.get('evidence_envelope_single_semantics') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
  };
  assert.equal(envelopeGate.status, 'guarded');
  assert.equal(
    envelopeGate.source_evidence?.some((evidence) =>
      evidence.ref === 'src/evidence-envelope.ts'
    ),
    true,
  );
  assert.match(String(envelopeGate.next_action), /refs-only projections/);

  const appReleaseGate = gates.get('app_release_evidence_not_contract_only') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
  };
  assert.equal(appReleaseGate.status, 'guarded');
  assert.equal(
    appReleaseGate.source_evidence?.some((evidence) =>
      evidence.ref === '../one-person-lab-app/scripts/validate-release-evidence-bundle.ts'
    ),
    true,
  );
  assert.match(String(appReleaseGate.next_action), /fail-closed/);
});

test('help advertises the semantic hygiene system command', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  assert.equal(commands.includes('system semantic-hygiene'), true);
});
