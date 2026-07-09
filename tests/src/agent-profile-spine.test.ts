import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAgentProfileCatalog,
  buildAgentProfileConformance,
  buildAgentProfileInspect,
  buildAgentProfileSelection,
} from '../../src/modules/foundry-lab/agent-profile-spine.ts';

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function profileCatalogEntry() {
  return buildAgentProfileCatalog()
    .agent_profile_catalog
    .profiles[0];
}

function makeConformantAgentFixture() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-profile-agent-'));
  const profile = profileCatalogEntry();
  const profileRequirements = {
    required_stage_archetypes: profile.required_stage_archetypes,
    required_evidence_objects: profile.required_evidence_objects,
  };

  writeJson(path.join(repoDir, 'contracts', 'capability_map.json'), {
    surface_kind: 'opl_standard_agent_capability_map',
    schema_version: 'standard-agent-capability-map.v1',
    domain_id: 'colorectal-surgery-risk',
    selected_profile_refs: [profile.profile_ref],
    profile_requirements: profileRequirements,
    capability_pack: {
      pack_id: 'colorectal-surgery-risk',
      pack_root_ref: 'agent/',
      map_ref: 'contracts/capability_map.json',
      pack_role: 'declarative_domain_capability_pack',
      capability_pack_can_claim_domain_ready: false,
    },
    resolver_policy: 'resolver_index_only_no_domain_truth',
    capabilities: [
      { capability_id: 'stage', surface_role: 'stage_prompt', capability_kind: 'stage_prompt' },
      { capability_id: 'tool', surface_role: 'tool_connector', capability_kind: 'tool_connector' },
      { capability_id: 'knowledge', surface_role: 'knowledge_pack', capability_kind: 'reference_pack' },
      { capability_id: 'gate', surface_role: 'quality_gate', capability_kind: 'contract_module' },
      { capability_id: 'eval', surface_role: 'eval_suite', capability_kind: 'contract_module' },
    ],
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_mutate_artifact_body: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  });

  writeJson(path.join(repoDir, 'contracts', 'stage_control_plane.json'), {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'colorectal_surgery_risk_stage_plane',
    target_domain_id: 'colorectal-surgery-risk',
    owner: 'colorectal-surgery-risk',
    selected_profile_refs: [profile.profile_ref],
    profile_requirements: profileRequirements,
    authority_boundary: {
      opl_can_write_domain_truth: false,
    },
    stages: [
      {
        stage_id: 'risk-support',
        stage_kind: 'creation',
        title: 'Risk Support',
        goal: 'Produce an evidence-grounded risk-support artifact.',
        owner: 'colorectal-surgery-risk',
        knowledge_refs: [{ ref_kind: 'repo_path', ref: 'agent/knowledge/guidelines.md' }],
        tool_refs: [{ ref_kind: 'repo_path', ref: 'agent/tools/retrieval.md' }],
        evaluation: [{ ref_kind: 'repo_path', ref: 'agent/quality_gates/evidence.md' }],
        authority_boundary: {
          can_claim_domain_ready: false,
        },
      },
    ],
  });

  return { repoDir, profile };
}

function makeSourceDerivedAgentFixture() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-derived-agent-'));
  const requiredDesignConsumptionObjects = [
    'ReferenceDesignPacket',
    'TransferMap',
    'AgentPackPlan',
    'BuildReceipt',
  ];
  const referenceDesignSourceRefs = ['paper-ref:uploaded-colorectal-risk-framework'];
  const referenceDesignPacketRefs = [
    'pattern-packet-ref:oma/reference-designs/uploaded-paper/distilled-agent-design',
  ];
  const transferMapRefs = [
    'transfer-map-ref:oma/reference-designs/uploaded-paper/transfer-map',
  ];
  const agentPackPlanRefs = [
    'agent-pack-plan-ref:colorectal-surgery-risk-from-paper/pack-plan',
  ];
  const buildReceiptRefs = [
    'build-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-build',
  ];
  const sourceDerivedStageRef = 'stage:colorectal-surgery-risk-from-paper/source-derived-design';
  const sourceDerivedStageRefs = [
    {
      stage_id: 'source-derived-design',
      stage_ref: sourceDerivedStageRef,
      source_pattern_ref: 'pattern-packet-ref:oma/reference-designs/uploaded-paper/stage-patterns/source-derived-design',
    },
  ];
  const rejectedSourcePatternRefs = [
    'non-transferable:uploaded-paper/external-runtime-truth-authority',
  ];
  const forbiddenClaims = [
    'target_domain_ready',
    'production_ready',
    'owner_accepted',
  ];
  const buildReceipt = {
    surface_kind: 'opl_meta_agent_build_receipt',
    version: 'opl-meta-agent.build-receipt.v1',
    receipt_ref: buildReceiptRefs[0],
    build_receipt_ref: buildReceiptRefs[0],
    build_source_kind: 'source_derived_design',
    source_derived_stage_refs: sourceDerivedStageRefs,
    target_only_requirement_refs: [
      'target-only-requirement:colorectal-surgery-risk-from-paper/owner-gated-closeout',
    ],
    rejected_source_pattern_refs: rejectedSourcePatternRefs,
    lower_bound_opl_profile_refs: [
      'opl-profile-route:source_derived_design_profile_route.v1',
    ],
    forbidden_claims: forbiddenClaims,
    authority_boundary: {
      refs_only: true,
      can_write_target_domain_truth: false,
      can_create_target_owner_receipt: false,
      can_promote_live_or_default_agent: false,
    },
  };
  const sourceDerivedDesignReceipt = {
    surface_kind: 'opl_meta_agent_source_derived_design_receipt',
    route_id: 'source_derived_design_profile_route.v1',
    route_ref: 'opl-profile-route:source_derived_design_profile_route.v1',
    required_design_consumption_objects: requiredDesignConsumptionObjects,
    source_refs: referenceDesignSourceRefs,
    reference_design_source_refs: referenceDesignSourceRefs,
    reference_design_packet_refs: referenceDesignPacketRefs,
    reference_design_pattern_packet_refs: referenceDesignPacketRefs,
    transfer_map_refs: transferMapRefs,
    agent_pack_plan_refs: agentPackPlanRefs,
    build_receipt_refs: buildReceiptRefs,
    build_receipt_requirements: [
      'source_derived_stage_refs',
      'target_only_requirement_refs',
      'rejected_source_pattern_refs',
      'forbidden_claims',
    ],
    profile_requirements: {
      required_design_consumption_objects: requiredDesignConsumptionObjects,
      required_stage_archetypes: [
        'source_material_intake',
        'reference_design_pattern_extraction',
        'transferable_pattern_mapping',
        'capability_plan_synthesis',
        'authority_boundary_review',
      ],
      required_capability_kinds: [
        'stage_prompt',
        'tool_connector',
        'reference_pack',
        'contract_module',
      ],
      required_surface_roles: [
        'stage_prompt',
        'tool_connector',
        'knowledge_pack',
        'quality_gate',
        'eval_suite',
      ],
      transfer_map_requirements: [
        'pattern_id',
        'source_anchor_ref',
        'target_stage_or_capability_slot',
        'transfer_rationale',
        'known_limits',
      ],
      agent_pack_plan_requirements: [
        'agent_pack_plan_ref',
        'stage_archetype_candidate_refs',
        'required_prompt_skill_knowledge_tool_refs',
        'evaluation_or_review_gate_refs',
        'no_domain_truth_or_runtime_import_notes',
      ],
    },
  };
  const profileRequirements = sourceDerivedDesignReceipt.profile_requirements;

  writeJson(path.join(repoDir, 'contracts', 'capability_map.json'), {
    surface_kind: 'opl_standard_agent_capability_map',
    schema_version: 'standard-agent-capability-map.v1',
    domain_id: 'colorectal-surgery-risk-from-paper',
    profile_selection_mode: 'source_derived_design',
    source_derived_design_receipt: sourceDerivedDesignReceipt,
    build_receipt: buildReceipt,
    build_receipt_ref: buildReceiptRefs[0],
    build_receipt_refs: buildReceiptRefs,
    profile_requirements: profileRequirements,
    capabilities: [
      { capability_id: 'stage', surface_role: 'stage_prompt', capability_kind: 'stage_prompt' },
      { capability_id: 'tool', surface_role: 'tool_connector', capability_kind: 'tool_connector' },
      { capability_id: 'knowledge', surface_role: 'knowledge_pack', capability_kind: 'reference_pack' },
      { capability_id: 'gate', surface_role: 'quality_gate', capability_kind: 'contract_module' },
      { capability_id: 'eval', surface_role: 'eval_suite', capability_kind: 'contract_module' },
    ],
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  });

  writeJson(path.join(repoDir, 'contracts', 'stage_control_plane.json'), {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'colorectal_surgery_risk_from_paper_stage_plane',
    target_domain_id: 'colorectal-surgery-risk-from-paper',
    owner: 'colorectal-surgery-risk-from-paper',
    profile_selection_mode: 'source_derived_design',
    source_derived_design_receipt: sourceDerivedDesignReceipt,
    build_receipt: buildReceipt,
    build_receipt_ref: buildReceiptRefs[0],
    build_receipt_refs: buildReceiptRefs,
    profile_requirements: profileRequirements,
    stages: [
      {
        stage_id: 'source-derived-design',
        stage_kind: 'creation',
        title: 'Source Derived Design',
        goal: 'Map source-derived design patterns into a target agent stage pack.',
        owner: 'colorectal-surgery-risk-from-paper',
        stage_pattern_source_refs: [
          'pattern-packet-ref:oma/reference-designs/uploaded-paper/stage-patterns/source-derived-design',
        ],
        build_receipt: buildReceipt,
        build_receipt_ref: buildReceiptRefs[0],
        build_receipt_refs: buildReceiptRefs,
        knowledge_refs: [{ ref_kind: 'repo_path', ref: 'agent/knowledge/reference-design.md' }],
        tool_refs: [{ ref_kind: 'repo_path', ref: 'agent/tools/source-intake.md' }],
        evaluation: [{ ref_kind: 'repo_path', ref: 'agent/quality_gates/source-transfer.md' }],
        authority_boundary: {
          can_claim_domain_ready: false,
        },
      },
    ],
  });

  return { repoDir };
}

test('profile selector chooses evidence-grounded profile for decision-support risk intent', () => {
  const inspect = buildAgentProfileInspect([
    'evidence_grounded_decision_agent_profile.v1',
  ]).agent_profile_inspect;
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a colorectal surgery risk decision support agent with guideline evidence.',
  ]).profile_selection_receipt;

  assert.ok(inspect.profile);
  assert.ok(receipt.profile_requirements);
  assert.equal(
    inspect.profile.source_readback_command,
    'opl profiles inspect evidence_grounded_decision_agent_profile.v1 --json',
  );
  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.selected_profile_id, 'evidence_grounded_decision_agent_profile.v1');
  assert.equal(receipt.matched_trigger_signals.includes('risk'), true);
  assert.equal(receipt.profile_requirements.required_stage_archetypes.includes('mode_routing'), true);
  assert.equal(receipt.profile_requirements.required_capability_kinds.includes('reference_pack'), true);
  assert.equal(receipt.authority_boundary.selector_can_claim_domain_ready, false);
});

test('profile selector routes unmatched paper-backed intent to source-derived design', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a poetry workshop scheduling agent',
    '--reference-source',
    'paper-ref:uploaded-agent-framework',
    '--pattern-packet',
    'pattern-packet-ref:oma/uploaded-agent-framework/design',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.profile_selection_mode, 'source_derived_design');
  assert.equal(receipt.selected_profile_id, 'source_derived_design_profile_route.v1');
  assert.equal(receipt.selected_profile_ref, 'opl-profile-route:source_derived_design_profile_route.v1');
  assert.deepEqual(receipt.blockers, []);
  assert.ok(receipt.source_derived_design_receipt);
  assert.deepEqual(receipt.source_derived_design_receipt.source_refs, [
    'paper-ref:uploaded-agent-framework',
  ]);
  assert.deepEqual(receipt.source_derived_design_receipt.reference_design_pattern_packet_refs, [
    'pattern-packet-ref:oma/uploaded-agent-framework/design',
  ]);
  const requirements = receipt.profile_requirements as Record<string, string[]>;
  assert.ok(requirements.stage_archetype_candidates.includes('transferable_pattern_mapping'));
  assert.ok(receipt.transferable_pattern_requirements.includes('source_anchor_ref'));
  assert.equal(receipt.authority_boundary.selector_can_claim_domain_ready, false);
});

test('profile selector keeps builtin lower-bound and adds source-derived route for hybrid intents', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a colorectal surgery risk decision support agent with guideline evidence',
    '--reference-source',
    'paper-ref:uploaded-surgical-risk-agent-framework',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.profile_selection_mode, 'hybrid');
  assert.equal(receipt.selected_profile_id, 'evidence_grounded_decision_agent_profile.v1');
  assert.ok(receipt.selected_profile_refs.includes('opl-profile:evidence_grounded_decision_agent_profile.v1'));
  assert.ok(receipt.selected_profile_refs.includes('opl-profile-route:source_derived_design_profile_route.v1'));
  const requirements = receipt.profile_requirements as Record<string, string[]>;
  assert.ok(requirements.required_stage_archetypes.includes('mode_routing'));
  assert.ok(requirements.required_stage_archetypes.includes('reference_design_pattern_extraction'));
});

test('profile selector remains blocked when no builtin match and no reference design source exists', () => {
  const receipt = buildAgentProfileSelection([
    '--intent',
    'Build a poetry workshop scheduling agent',
  ]).profile_selection_receipt;

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.profile_selection_mode, null);
  assert.deepEqual(receipt.selected_profile_refs, []);
  assert.deepEqual(receipt.blockers, ['no_profile_trigger_match']);
});

test('profile catalog consumes contract-owned profile entry requirements', () => {
  const profile = profileCatalogEntry();

  assert.equal(profile.profile_ref, 'opl-profile:evidence_grounded_decision_agent_profile.v1');
  assert.equal(profile.trigger_signals.includes('colorectal'), true);
  assert.equal(profile.required_reference_pack_roles.includes('guideline_reference_pack'), true);
  assert.equal(profile.required_evidence_objects.includes('DecisionSupportArtifact'), true);
  assert.equal(profile.can_claim_domain_ready, false);
});

test('profile conformance checks selected profile refs, stage knowledge refs, and evidence objects', () => {
  const { repoDir, profile } = makeConformantAgentFixture();
  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    profile.profile_id,
  ]).profile_conformance;

  assert.ok(conformance.observed);
  assert.ok(conformance.authority_boundary);
  assert.equal(conformance.status, 'passed');
  assert.deepEqual(conformance.blockers, []);
  assert.equal(conformance.observed.stages_with_knowledge_refs, 1);
  assert.equal(conformance.authority_boundary.conformance_can_claim_domain_ready, false);
});

test('profile conformance accepts source-derived design route receipts without a builtin profile', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'passed');
  assert.deepEqual(conformance.blockers, []);
  assert.equal(conformance.profile_ref, 'opl-profile-route:source_derived_design_profile_route.v1');
  assert.ok(conformance.observed.capability_profile_refs.includes('opl-profile-route:source_derived_design_profile_route.v1'));
  assert.ok(conformance.observed.required_stage_archetypes.includes('transferable_pattern_mapping'));
  const sourceDerivedDesign = conformance.observed.source_derived_design;
  assert.ok(sourceDerivedDesign);
  assert.ok(sourceDerivedDesign.reference_design_source_refs.includes('paper-ref:uploaded-colorectal-risk-framework'));
  assert.ok(sourceDerivedDesign.transfer_map_refs.includes('transfer-map-ref:oma/reference-designs/uploaded-paper/transfer-map'));
  assert.ok(sourceDerivedDesign.agent_pack_plan_refs.includes('agent-pack-plan-ref:colorectal-surgery-risk-from-paper/pack-plan'));
  assert.ok(sourceDerivedDesign.build_receipt_refs.includes('build-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-build'));
  assert.ok(sourceDerivedDesign.build_receipt_source_stage_refs.includes('stage:colorectal-surgery-risk-from-paper/source-derived-design'));
  assert.ok(sourceDerivedDesign.build_receipt_rejected_source_pattern_refs.includes('non-transferable:uploaded-paper/external-runtime-truth-authority'));
  assert.ok(sourceDerivedDesign.build_receipt_forbidden_claims.includes('target_domain_ready'));
  assert.ok(sourceDerivedDesign.stage_pattern_source_refs.includes('pattern-packet-ref:oma/reference-designs/uploaded-paper/stage-patterns/source-derived-design'));
  assert.equal(conformance.authority_boundary.conformance_can_claim_domain_ready, false);
});

test('profile conformance fails closed when source-derived route only exposes route ref', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));
  const routeOnlyReceipt = {
    route_id: 'source_derived_design_profile_route.v1',
    route_ref: 'opl-profile-route:source_derived_design_profile_route.v1',
  };
  capabilityMap.source_derived_design_receipt = routeOnlyReceipt;
  stageControl.source_derived_design_receipt = routeOnlyReceipt;
  delete capabilityMap.build_receipt;
  delete capabilityMap.build_receipt_ref;
  delete capabilityMap.build_receipt_refs;
  delete stageControl.build_receipt;
  delete stageControl.build_receipt_ref;
  delete stageControl.build_receipt_refs;
  delete stageControl.stages[0].build_receipt;
  delete stageControl.stages[0].build_receipt_ref;
  delete stageControl.stages[0].build_receipt_refs;
  capabilityMap.profile_requirements = {
    required_stage_archetypes: capabilityMap.profile_requirements.required_stage_archetypes,
    required_capability_kinds: capabilityMap.profile_requirements.required_capability_kinds,
    required_surface_roles: capabilityMap.profile_requirements.required_surface_roles,
  };
  stageControl.profile_requirements = capabilityMap.profile_requirements;
  delete stageControl.stages[0].stage_pattern_source_refs;
  writeJson(capabilityMapPath, capabilityMap);
  writeJson(stageControlPath, stageControl);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_reference_design_source_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_reference_design_packet_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_transfer_map_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_agent_pack_plan_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_build_receipt_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_design_consumption_object:BuildReceipt'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement'),
    true,
  );
});

test('profile conformance fails closed when source-derived requirements exist without transfer objects', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));

  delete capabilityMap.source_derived_design_receipt.transfer_map_refs;
  delete capabilityMap.source_derived_design_receipt.agent_pack_plan_refs;
  delete capabilityMap.source_derived_design_receipt.build_receipt_refs;
  delete capabilityMap.build_receipt;
  delete capabilityMap.build_receipt_ref;
  delete capabilityMap.build_receipt_refs;
  delete stageControl.source_derived_design_receipt.transfer_map_refs;
  delete stageControl.source_derived_design_receipt.agent_pack_plan_refs;
  delete stageControl.source_derived_design_receipt.build_receipt_refs;
  delete stageControl.build_receipt;
  delete stageControl.build_receipt_ref;
  delete stageControl.build_receipt_refs;
  delete stageControl.stages[0].build_receipt;
  delete stageControl.stages[0].build_receipt_ref;
  delete stageControl.stages[0].build_receipt_refs;

  writeJson(capabilityMapPath, capabilityMap);
  writeJson(stageControlPath, stageControl);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_transfer_map_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_agent_pack_plan_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_build_receipt_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_design_consumption_object:BuildReceipt'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement'),
    false,
  );
});

test('profile conformance fails closed when profile refs and knowledge refs are missing', () => {
  const { repoDir, profile } = makeConformantAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));
  delete capabilityMap.selected_profile_refs;
  delete stageControl.selected_profile_refs;
  stageControl.stages[0].knowledge_refs = [];
  writeJson(capabilityMapPath, capabilityMap);
  writeJson(stageControlPath, stageControl);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    profile.profile_id,
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes('capability_map_missing_selected_profile_ref:evidence_grounded_decision_agent_profile.v1'),
    true,
  );
  assert.equal(conformance.blockers.includes('stage_control_plane_missing_knowledge_refs'), true);
});
