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
  'public_surface_budget_conformance',
  'functional_privatization_evidence_gate',
  'app_release_evidence_not_contract_only',
  'family_runtime_parser_monolith',
  'stage_launch_guarantee_clarity',
  'domain_specific_carrier_boundary',
  'legacy_vocabulary_active_leakage',
] as const;

const EXPECTED_DOMAIN_CARRIERS = [
  'domain_route',
  'visual_transition',
  'publication',
  'fundability',
] as const;

test('system semantic hygiene exposes machine gates without production or domain-ready claims', () => {
  const output = runCli(['system', 'semantic-hygiene', '--json']);
  const audit = output.semantic_hygiene;

  assert.equal(output.version, 'g2');
  assert.equal(audit.surface_kind, 'opl_framework_semantic_hygiene_audit');
  assert.equal(audit.summary.gate_count, EXPECTED_GATES.length);
  assert.equal(audit.summary.guarded_gate_count, EXPECTED_GATES.length);
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
      evidence.ref === 'src/modules/runway/family-runtime-command-parts/registry.ts'
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

  const surfaceBudgetGate = gates.get('public_surface_budget_conformance') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
    surface_budget_conformance?: {
      surface_count?: unknown;
      default_surface_count?: unknown;
      budgeted_surface_count?: unknown;
      default_surface_budgeted_count?: unknown;
      invalid_surface_budget_count?: unknown;
      invalid_surface_ids?: unknown;
      all_default_surfaces_budgeted?: unknown;
      ai_first_policy?: unknown;
      authority_boundary?: {
        can_claim_domain_ready?: unknown;
        can_claim_quality_verdict?: unknown;
        can_claim_artifact_authority?: unknown;
        can_claim_production_ready?: unknown;
        can_replace_ai_executor_planning?: unknown;
        can_replace_domain_owner?: unknown;
      };
    };
  };
  assert.equal(surfaceBudgetGate.status, 'guarded');
  assert.equal(
    surfaceBudgetGate.source_evidence?.some((evidence) =>
      evidence.ref === 'contracts/opl-framework/public-surface-index.json'
    ),
    true,
  );
  assert.equal(
    surfaceBudgetGate.source_evidence?.some((evidence) =>
      evidence.ref === 'contracts/opl-framework/surface-budget-policy.json'
    ),
    true,
  );
  assert.equal(
    typeof surfaceBudgetGate.surface_budget_conformance?.surface_count,
    'number',
  );
  assert.equal(
    Number(surfaceBudgetGate.surface_budget_conformance?.surface_count) > 0,
    true,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.default_surface_count,
    surfaceBudgetGate.surface_budget_conformance?.default_surface_budgeted_count,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.surface_count,
    surfaceBudgetGate.surface_budget_conformance?.budgeted_surface_count,
  );
  assert.equal(
    Number(surfaceBudgetGate.surface_budget_conformance?.budgeted_surface_count)
      + Number(surfaceBudgetGate.surface_budget_conformance?.invalid_surface_budget_count),
    surfaceBudgetGate.surface_budget_conformance?.surface_count,
  );
  assert.equal(surfaceBudgetGate.surface_budget_conformance?.all_default_surfaces_budgeted, true);
  assert.equal(surfaceBudgetGate.surface_budget_conformance?.invalid_surface_budget_count, 0);
  assert.deepEqual(surfaceBudgetGate.surface_budget_conformance?.invalid_surface_ids, []);
  assert.match(String(surfaceBudgetGate.surface_budget_conformance?.ai_first_policy), /ai_executor_planning/);
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.authority_boundary?.can_claim_domain_ready,
    false,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.authority_boundary?.can_claim_quality_verdict,
    false,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.authority_boundary?.can_claim_artifact_authority,
    false,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.authority_boundary?.can_claim_production_ready,
    false,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.authority_boundary?.can_replace_ai_executor_planning,
    false,
  );
  assert.equal(
    surfaceBudgetGate.surface_budget_conformance?.authority_boundary?.can_replace_domain_owner,
    false,
  );
  assert.match(String(surfaceBudgetGate.next_action), /diagnostic\/reference state/);

  const functionalGate = gates.get('functional_privatization_evidence_gate') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
    functional_privatization_evidence_gate?: {
      semantic_equivalence_requires_evidence_when_active_private?: unknown;
      can_close_without_evidence?: unknown;
      mechanical_completion_can_close?: unknown;
      evidence_required_when_any?: unknown;
      required_evidence_policy?: unknown;
      authority_boundary?: {
        can_claim_domain_ready?: unknown;
        can_claim_private_residue_deleted?: unknown;
        can_authorize_quality_or_export?: unknown;
        can_replace_domain_owner?: unknown;
      };
    };
  };
  assert.equal(functionalGate.status, 'guarded');
  assert.equal(
    functionalGate.source_evidence?.some((evidence) =>
      evidence.ref === 'src/functional-privatization-envelope.ts'
    ),
    true,
  );
  assert.equal(
    functionalGate.source_evidence?.some((evidence) =>
      evidence.ref === 'contracts/opl-framework/functional-privatization-audit-envelope-contract.json'
    ),
    true,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate
      ?.semantic_equivalence_requires_evidence_when_active_private,
    true,
  );
  assert.deepEqual(
    functionalGate.functional_privatization_evidence_gate?.evidence_required_when_any,
    [
      'semantic_equivalence_review_count > 0',
      'active_private_generic_residue_count > 0',
    ],
  );
  assert.match(
    String(functionalGate.functional_privatization_evidence_gate?.required_evidence_policy),
    /owner receipt before private residue closure/,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate?.can_close_without_evidence,
    false,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate?.mechanical_completion_can_close,
    false,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate?.authority_boundary?.can_claim_domain_ready,
    false,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate?.authority_boundary
      ?.can_claim_private_residue_deleted,
    false,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate?.authority_boundary
      ?.can_authorize_quality_or_export,
    false,
  );
  assert.equal(
    functionalGate.functional_privatization_evidence_gate?.authority_boundary?.can_replace_domain_owner,
    false,
  );
  assert.match(String(functionalGate.next_action), /semantic-equivalence evidence gate/);

  const domainCarrierGate = gates.get('domain_specific_carrier_boundary') as {
    status?: unknown;
    source_evidence?: { ref?: unknown }[];
    next_action?: unknown;
    domain_specific_carrier_boundary?: {
      carrier_string_count?: unknown;
      covered_carrier_strings?: unknown;
      all_carriers_have_non_ontology_boundary?: unknown;
      forbidden_interpretations?: unknown;
      authority_boundary?: {
        can_define_opl_core_ontology?: unknown;
        can_claim_domain_ready?: unknown;
        can_authorize_quality_or_export?: unknown;
        can_write_domain_truth?: unknown;
        can_replace_domain_owner?: unknown;
      };
      carrier_boundaries?: Array<{
        carrier_string?: unknown;
        carrier_kind?: unknown;
        domain_specific_carrier_only?: unknown;
        opl_core_ontology?: unknown;
        opl_domain_authority?: unknown;
        can_claim_domain_ready?: unknown;
        can_authorize_quality_or_export?: unknown;
        can_write_domain_truth?: unknown;
      }>;
    };
  };
  assert.equal(domainCarrierGate.status, 'guarded');
  assert.equal(domainCarrierGate.domain_specific_carrier_boundary?.carrier_string_count, 4);
  assert.deepEqual(
    [...(domainCarrierGate.domain_specific_carrier_boundary?.covered_carrier_strings as string[])].sort(),
    [...EXPECTED_DOMAIN_CARRIERS].sort(),
  );
  assert.equal(
    domainCarrierGate.domain_specific_carrier_boundary?.all_carriers_have_non_ontology_boundary,
    true,
  );
  assert.deepEqual(
    domainCarrierGate.domain_specific_carrier_boundary?.forbidden_interpretations,
    [
      'opl_core_ontology',
      'opl_domain_authority',
      'domain_ready_claim',
      'quality_or_export_authority',
      'domain_truth_write_authority',
    ],
  );
  assert.equal(
    domainCarrierGate.domain_specific_carrier_boundary?.authority_boundary
      ?.can_define_opl_core_ontology,
    false,
  );
  assert.equal(
    domainCarrierGate.domain_specific_carrier_boundary?.authority_boundary?.can_claim_domain_ready,
    false,
  );
  assert.equal(
    domainCarrierGate.domain_specific_carrier_boundary?.authority_boundary
      ?.can_authorize_quality_or_export,
    false,
  );
  assert.equal(
    domainCarrierGate.domain_specific_carrier_boundary?.authority_boundary?.can_write_domain_truth,
    false,
  );
  assert.equal(
    domainCarrierGate.domain_specific_carrier_boundary?.authority_boundary?.can_replace_domain_owner,
    false,
  );
  assert.equal(
    domainCarrierGate.source_evidence?.some((evidence) =>
      evidence.ref === 'src/modules/stagecraft/family-transition-visual-ingestion.ts'
    ),
    true,
  );
  assert.match(String(domainCarrierGate.next_action), /domain-specific carrier strings/);

  const carrierBoundaries =
    domainCarrierGate.domain_specific_carrier_boundary?.carrier_boundaries ?? [];
  const carriers = new Map(carrierBoundaries.map((carrier) => [carrier.carrier_string, carrier]));
  for (const carrierString of EXPECTED_DOMAIN_CARRIERS) {
    const carrier = carriers.get(carrierString);
    assert.equal(carrier?.domain_specific_carrier_only, true);
    assert.equal(carrier?.opl_core_ontology, false);
    assert.equal(carrier?.opl_domain_authority, false);
    assert.equal(carrier?.can_claim_domain_ready, false);
    assert.equal(carrier?.can_authorize_quality_or_export, false);
    assert.equal(carrier?.can_write_domain_truth, false);
  }
  assert.equal(carriers.get('domain_route')?.carrier_kind, 'domain_owned_route_profile');
  assert.equal(carriers.get('visual_transition')?.carrier_kind, 'domain_transition_profile_extension');
  assert.equal(carriers.get('publication')?.carrier_kind, 'domain_owned_verdict_ref');
  assert.equal(carriers.get('fundability')?.carrier_kind, 'domain_owned_verdict_ref');

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

  assert.equal(commands.includes('system semantic-hygiene'), false);
  assert.equal(
    output.help.diagnostic_command_groups.some((entry: { group_id: string }) => entry.group_id === 'system'),
    true,
  );
  assert.equal(runCli(['help', 'system', 'semantic-hygiene']).help.command, 'system semantic-hygiene');
});
