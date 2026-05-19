import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return { ...payload, [field]: value };
}

function buildActionCatalog() {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'med_autoscience_action_catalog',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: [
      {
        action_id: 'author_draft',
        title: 'Author draft',
        summary: 'Author from explicit refs.',
        owner: 'MedAutoScience',
        effect: 'read_only',
        source_command: { command: 'medautosci write', surface_kind: 'domain_cli' },
        input_schema_ref: 'schemas/author.input.json',
        output_schema_ref: 'schemas/author.output.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
      {
        action_id: 'review_draft',
        title: 'Review draft',
        summary: 'Review from explicit refs.',
        owner: 'MedAutoScience',
        effect: 'read_only',
        source_command: { command: 'medautosci review', surface_kind: 'domain_cli' },
        input_schema_ref: 'schemas/review.input.json',
        output_schema_ref: 'schemas/review.output.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: ['publication_quality_gate'],
        supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
        authority_boundary: { opl_role: 'projection_consumer_only' },
      },
    ],
    notes: [],
  };
}

function buildStagePlane() {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      stage_pack_signer_ref: 'kms:mas-stage-pack',
      stage_pack_signature_ref: 'artifact:mas-stage-pack.sig',
    },
    stages: [
      {
        stage_id: 'manuscript_authoring',
        stage_kind: 'creation',
        title: 'Manuscript authoring',
        summary: 'Author from explicit source refs.',
        goal: 'Produce a manuscript draft under MAS authority.',
        owner: 'MedAutoScience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: ['author_draft'],
        outputs: [{ ref_kind: 'proof', ref: 'artifacts/manuscript-draft-proof.json', role: 'proof_ref' }],
        evaluation: [],
        handoff: { next_stage_refs: ['publication_review'], provides: ['draft_ready'] },
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          boundary_assumptions: ['source_refs_are_domain_owned'],
          properties: ['deterministic_handoff_refs'],
          runtime_assumptions: ['source_freshness_within_domain_policy'],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: '/runtime_inventory', role: 'runtime_assumption_monitor' }],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: { lane: 'domain_agent', static_check_eligible: true, effect_boundary: false, records_runtime_events: false },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      },
      {
        stage_id: 'publication_review',
        stage_kind: 'review',
        title: 'Publication review',
        summary: 'Review draft refs.',
        goal: 'Gate draft under MAS reviewer authority.',
        owner: 'MedAutoScience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: ['review_draft'],
        outputs: [],
        evaluation: [{ ref_kind: 'test', ref: 'tests/publication-review.test.ts', role: 'proof_ref' }],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_receipt_ready'],
          boundary_assumptions: ['reviewer_judgment_recorded_as_receipt'],
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:publication_review.gate_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:publication_review_receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
}

test('family stage graph projects edges, guarantee modes, and integrity digest without authority transfer', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-graph-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = attachManifestSurface(
    attachManifestSurface(fixtures.medautoscience as JsonRecord, 'family_action_catalog', buildActionCatalog()),
    'family_stage_control_plane',
    buildStagePlane(),
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const proofBundle = runCli(['stages', 'proof-bundle', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const graph = runCli(['stages', 'graph', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(graph.family_stage_graph.surface_kind, 'opl_family_stage_graph_projection');
    assert.deepEqual(graph.family_stage_graph.graph_summary, {
      node_count: 2,
      edge_count: 1,
      blocked_node_count: 0,
      needs_contracts_node_count: 0,
      missing_edge_count: 0,
      runtime_enforced_node_count: 1,
      monitor_ref_count: 1,
    });
    assert.deepEqual(graph.family_stage_graph.edges[0], {
      edge_id: 'manuscript_authoring->publication_review',
      upstream_stage_id: 'manuscript_authoring',
      downstream_stage_id: 'publication_review',
      upstream_ensures: ['draft_ready'],
      downstream_requires: ['draft_ready'],
      satisfied_by: ['draft_ready'],
      missing: [],
      status: 'satisfied',
      edge_kind: 'handoff_requires_ensures',
    });
    assert.deepEqual(graph.family_stage_graph.nodes.map((node: { stage_id: string; guarantee_modes: string[] }) => [node.stage_id, node.guarantee_modes]), [
      ['manuscript_authoring', ['static_admission_only', 'domain_owned_judgment', 'observability_only']],
      ['publication_review', ['runtime_enforced', 'domain_owned_judgment', 'observability_only']],
    ]);
    assert.equal(graph.family_stage_graph.integrity.stage_pack_hash, proofBundle.family_stage_proof_bundle.proof_bundle.integrity.stage_pack_hash);
    assert.equal(graph.family_stage_graph.integrity.signature_status, 'signature_ref_declared');
    assert.equal(graph.family_stage_graph.integrity.authority_boundary.can_verify_external_signature, false);
    assert.equal(graph.family_stage_graph.authority_boundary.can_execute_stage, false);
    assert.equal(graph.family_stage_graph.authority_boundary.can_write_domain_truth, false);
    assert.equal(graph.family_stage_graph.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
