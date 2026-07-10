import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { buildProfileCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/profiles.ts';

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256File(filePath: string) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const SOURCE_DERIVED_TYPED_OBJECT_FIELDS = [
  'reference_design_packet',
  'transfer_map',
  'agent_pack_plan',
  'design_admission_receipt',
  'build_receipt',
] as const;

function updateSourceDerivedTypedObjectProjections(
  repoDir: string,
  mutate: (
    typedObjects: Record<(typeof SOURCE_DERIVED_TYPED_OBJECT_FIELDS)[number], Record<string, any>>,
    capabilityMap: Record<string, any>,
    stageControl: Record<string, any>,
  ) => void,
) {
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));
  const typedObjects = Object.fromEntries(
    SOURCE_DERIVED_TYPED_OBJECT_FIELDS.map((field) => [field, structuredClone(capabilityMap[field])]),
  ) as Record<(typeof SOURCE_DERIVED_TYPED_OBJECT_FIELDS)[number], Record<string, any>>;

  mutate(typedObjects, capabilityMap, stageControl);
  for (const field of SOURCE_DERIVED_TYPED_OBJECT_FIELDS) {
    capabilityMap[field] = structuredClone(typedObjects[field]);
    stageControl[field] = structuredClone(typedObjects[field]);
    for (const stage of stageControl.stages) {
      stage[field] = structuredClone(typedObjects[field]);
    }
  }
  writeJson(capabilityMapPath, capabilityMap);
  writeJson(stageControlPath, stageControl);
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
    const designAdmissionReceiptRefs = [
      'design-admission-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-design-admission',
    ];
  const patternId = 'colorectal-risk-workflow';
  const sourcePatternRef = 'pattern-ref:uploaded-paper/colorectal-risk-workflow';
  const workflowSteps = [
    {
      step_id: 'source-material-intake',
      stage_archetype: 'source_material_intake',
      provenance_kind: 'source_derived',
      source_anchor_refs: ['paper-ref:uploaded-colorectal-risk-framework#source-material-intake'],
    },
    {
      step_id: 'risk-evidence-synthesis',
      stage_archetype: 'evidence_and_tool_execution',
      provenance_kind: 'source_derived',
      source_anchor_refs: ['paper-ref:uploaded-colorectal-risk-framework#risk-evidence-synthesis'],
    },
  ];
  const sourceDerivedStageRefs = workflowSteps.map((step) => ({
    stage_id: step.step_id,
    stage_ref: `stage:colorectal-surgery-risk-from-paper/${step.step_id}`,
    stage_archetype: step.stage_archetype,
    origin: 'source_pattern_ref',
    pattern_id: patternId,
    step_id: step.step_id,
    provenance_kind: step.provenance_kind,
    source_pattern_ref: sourcePatternRef,
    source_anchor_refs: step.source_anchor_refs,
    prompt_ref: `agent/prompts/${step.step_id}.md`,
    stage_path: `agent/stages/${step.step_id}.md`,
    skill_ref: 'agent/skills/source-derived-design.md',
    knowledge_refs: ['agent/knowledge/reference-design.md'],
    tool_refs: ['agent/tools/source-intake.md'],
    quality_gate_refs: ['agent/quality_gates/source-transfer.md'],
  }));
  const targetOnlyStage = {
    stage_id: 'owner-gated-closeout',
    stage_ref: 'stage:colorectal-surgery-risk-from-paper/owner-gated-closeout',
    stage_archetype: 'owner_handoff_gate',
    origin: 'target_only_requirement',
    target_only_requirement_ref:
      'target-only-requirement:colorectal-surgery-risk-from-paper/owner-gated-closeout',
    prompt_ref: 'agent/prompts/owner-gated-closeout.md',
    stage_path: 'agent/stages/owner-gated-closeout.md',
    skill_ref: 'agent/skills/source-derived-design.md',
    knowledge_refs: ['agent/knowledge/reference-design.md'],
    tool_refs: ['agent/tools/source-intake.md'],
    quality_gate_refs: ['agent/quality_gates/source-transfer.md'],
  };
  const plannedFileRefs = {
    planned_prompt_refs: [
      'agent/prompts/source-material-intake.md',
      'agent/prompts/risk-evidence-synthesis.md',
      'agent/prompts/owner-gated-closeout.md',
    ],
    planned_skill_refs: ['agent/skills/source-derived-design.md'],
    planned_knowledge_refs: ['agent/knowledge/reference-design.md'],
    planned_tool_refs: ['agent/tools/source-intake.md'],
    planned_quality_gate_refs: ['agent/quality_gates/source-transfer.md'],
  };
  const allPlannedFileRefs = [...new Set([
    ...Object.values(plannedFileRefs).flat(),
    ...[...sourceDerivedStageRefs, targetOnlyStage].flatMap((stage) => [
      stage.prompt_ref,
      stage.stage_path,
      stage.skill_ref,
      ...stage.knowledge_refs,
      ...stage.tool_refs,
      ...stage.quality_gate_refs,
    ]),
  ])];
  for (const fileRef of allPlannedFileRefs) {
    const filePath = path.join(repoDir, fileRef);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `materialized:${fileRef}\n`);
  }
  const referenceDesignPacket = {
    surface_kind: 'opl_meta_agent_reference_design_packet',
    version: 'opl-meta-agent.reference-design-packet.v1',
    packet_ref: referenceDesignPacketRefs[0],
    reference_source_refs: referenceDesignSourceRefs,
    reference_design_pattern_packet_refs: referenceDesignPacketRefs,
    design_origin: {
      origin_kind: 'user_supplied_reference_design',
      primary_source_refs: referenceDesignSourceRefs,
      primary_pattern_refs: [sourcePatternRef],
      secondary_seed_pattern_refs: [],
      seed_library_role: 'secondary_context_only',
    },
    pattern_dispositions: [{
      pattern_ref: sourcePatternRef,
      pattern_origin: 'user_typed_pattern_packet',
      disposition: 'adopt',
    }],
    transferable_design_patterns: [
      {
        pattern_id: patternId,
        source_pattern_ref: sourcePatternRef,
        pattern_origin: 'user_typed_pattern_packet',
        transferable_workflow_steps: workflowSteps,
      },
    ],
  };
  const transferMap = {
    surface_kind: 'opl_meta_agent_transfer_map',
    version: 'opl-meta-agent.transfer-map.v1',
    transfer_map_ref: transferMapRefs[0],
    reference_design_packet_ref: referenceDesignPacketRefs[0],
    mappings: [
      ...workflowSteps.map((step, index) => ({
        mapping_id: `${patternId}:${step.step_id}`,
        pattern_id: patternId,
        step_id: step.step_id,
        source_anchor_ref: step.source_anchor_refs[0],
        target_stage_or_capability_slot: sourceDerivedStageRefs[index].stage_ref,
        transfer_rationale: 'Preserve the source workflow step without importing target truth.',
        known_limits: ['target domain truth and quality verdict remain target-owner owned'],
        disposition: 'adapt',
      })),
      {
        mapping_id: `${patternId}:reject:external-runtime-truth-authority`,
        pattern_id: patternId,
        step_id: null,
        source_anchor_ref: 'non-transferable:uploaded-paper/external-runtime-truth-authority',
        target_stage_or_capability_slot: 'authority_boundary',
        transfer_rationale: 'External runtime and target truth cannot transfer.',
        known_limits: ['target owner retains domain authority'],
        disposition: 'reject',
      },
    ],
  };
  const agentPackPlan = {
    surface_kind: 'opl_meta_agent_agent_pack_plan',
    version: 'opl-meta-agent.agent-pack-plan.v1',
    plan_ref: agentPackPlanRefs[0],
    reference_design_packet_ref: referenceDesignPacketRefs[0],
    transfer_map_ref: transferMapRefs[0],
    planned_stage_refs: [...sourceDerivedStageRefs, targetOnlyStage],
    ...plannedFileRefs,
    source_pattern_ref_requirements: [
      referenceDesignPacketRefs[0],
      transferMapRefs[0],
      agentPackPlanRefs[0],
    ],
  };
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
      receipt_kind: 'AgentBuildReceipt',
      version: 'opl-meta-agent.agent-build-receipt.v1',
      receipt_ref: buildReceiptRefs[0],
      build_receipt_ref: buildReceiptRefs[0],
      build_source_kind: 'source_derived_design',
      design_admission_receipt_ref: designAdmissionReceiptRefs[0],
      required_design_objects: requiredDesignConsumptionObjects,
      required_admission_receipts: ['DesignAdmissionReceipt'],
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
      receipt_timing: 'post_materialization',
      materialization: {
        status: 'passed',
        planned_stage_ids: [...sourceDerivedStageRefs.map((stage) => stage.stage_id), targetOnlyStage.stage_id],
        materialized_stage_ids: [...sourceDerivedStageRefs.map((stage) => stage.stage_id), targetOnlyStage.stage_id],
        materialized_file_digests: allPlannedFileRefs.map((ref) => ({
          ref,
          sha256: sha256File(path.join(repoDir, ref)),
        })),
        all_planned_stages_materialized_exactly_once: true,
        all_planned_stage_files_present: true,
      },
    };
    const designAdmissionReceipt = {
      surface_kind: 'opl_meta_agent_design_admission_receipt',
      version: 'opl-meta-agent.design-admission-receipt.v1',
      receipt_ref: designAdmissionReceiptRefs[0],
      design_basis_kind: 'source_derived_design',
      source_derived_design_receipt_ref: 'source-derived-design-receipt-ref:colorectal-surgery-risk-from-paper',
      reference_design_packet_ref: referenceDesignPacketRefs[0],
      transfer_map_ref: transferMapRefs[0],
      agent_pack_plan_ref: agentPackPlanRefs[0],
      required_design_objects: requiredDesignConsumptionObjects,
      required_admission_receipts: ['DesignAdmissionReceipt'],
      design_derived_stage_refs: sourceDerivedStageRefs,
      source_derived_stage_refs: sourceDerivedStageRefs,
      target_only_requirement_refs: [
        'target-only-requirement:colorectal-surgery-risk-from-paper/owner-gated-closeout',
      ],
      rejected_source_pattern_refs: rejectedSourcePatternRefs,
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
      design_admission_receipt_refs: designAdmissionReceiptRefs,
      design_admission_receipt_ref: designAdmissionReceiptRefs[0],
      build_receipt_refs: buildReceiptRefs,
      design_admission_receipt_requirements: [
        'DesignAdmissionReceipt',
      ],
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
      reference_design_packet: referenceDesignPacket,
      reference_design_packet_ref: referenceDesignPacketRefs[0],
      transfer_map: transferMap,
      transfer_map_ref: transferMapRefs[0],
      agent_pack_plan: agentPackPlan,
      agent_pack_plan_ref: agentPackPlanRefs[0],
      design_admission_receipt: designAdmissionReceipt,
      design_admission_receipt_ref: designAdmissionReceiptRefs[0],
      design_admission_receipt_refs: designAdmissionReceiptRefs,
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
      reference_design_packet: referenceDesignPacket,
      reference_design_packet_ref: referenceDesignPacketRefs[0],
      transfer_map: transferMap,
      transfer_map_ref: transferMapRefs[0],
      agent_pack_plan: agentPackPlan,
      agent_pack_plan_ref: agentPackPlanRefs[0],
      design_admission_receipt: designAdmissionReceipt,
      design_admission_receipt_ref: designAdmissionReceiptRefs[0],
      design_admission_receipt_refs: designAdmissionReceiptRefs,
      build_receipt: buildReceipt,
    build_receipt_ref: buildReceiptRefs[0],
    build_receipt_refs: buildReceiptRefs,
    profile_requirements: profileRequirements,
    stages: [
      ...sourceDerivedStageRefs.map((plannedStage) => ({
        stage_id: plannedStage.stage_id,
        stage_origin: plannedStage.origin,
        stage_kind: 'creation',
        title: plannedStage.step_id,
        goal: `Materialize ${plannedStage.step_id} from the admitted source workflow.`,
        owner: 'colorectal-surgery-risk-from-paper',
        pattern_id: plannedStage.pattern_id,
        step_id: plannedStage.step_id,
        provenance_kind: plannedStage.provenance_kind,
        source_anchor_refs: plannedStage.source_anchor_refs,
        stage_pattern_source_refs: [
          sourcePatternRef,
          ],
          reference_design_packet: referenceDesignPacket,
          transfer_map: transferMap,
          agent_pack_plan: agentPackPlan,
          design_admission_receipt: designAdmissionReceipt,
          design_admission_receipt_ref: designAdmissionReceiptRefs[0],
          design_admission_receipt_refs: designAdmissionReceiptRefs,
          build_receipt: buildReceipt,
        build_receipt_ref: buildReceiptRefs[0],
        build_receipt_refs: buildReceiptRefs,
        knowledge_refs: [{ ref_kind: 'repo_path', ref: 'agent/knowledge/reference-design.md' }],
        tool_refs: [{ ref_kind: 'repo_path', ref: 'agent/tools/source-intake.md' }],
        evaluation: [{ ref_kind: 'repo_path', ref: 'agent/quality_gates/source-transfer.md' }],
        authority_boundary: {
          can_claim_domain_ready: false,
        },
      })),
      {
        stage_id: targetOnlyStage.stage_id,
        stage_origin: targetOnlyStage.origin,
        stage_kind: 'review',
        title: 'Owner gated closeout',
        goal: 'Route the candidate package to the target owner.',
        owner: 'colorectal-surgery-risk-from-paper',
        target_only_requirement_ref: targetOnlyStage.target_only_requirement_ref,
        stage_pattern_source_refs: [],
        source_anchor_refs: [],
        reference_design_packet: referenceDesignPacket,
        transfer_map: transferMap,
        agent_pack_plan: agentPackPlan,
        design_admission_receipt: designAdmissionReceipt,
        design_admission_receipt_ref: designAdmissionReceiptRefs[0],
        design_admission_receipt_refs: designAdmissionReceiptRefs,
        build_receipt: buildReceipt,
        build_receipt_ref: buildReceiptRefs[0],
        build_receipt_refs: buildReceiptRefs,
        knowledge_refs: [{ ref_kind: 'repo_path', ref: 'agent/knowledge/reference-design.md' }],
        tool_refs: [{ ref_kind: 'repo_path', ref: 'agent/tools/source-intake.md' }],
        evaluation: [{ ref_kind: 'repo_path', ref: 'agent/quality_gates/source-transfer.md' }],
        authority_boundary: { can_claim_domain_ready: false },
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
  assert.ok(receipt.transferable_pattern_requirements.includes('disposition'));
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

test('profile selector uses repeated canonical signals for Chinese hybrid intent', async () => {
  const output = await buildProfileCommandSpecs()['profiles select'].handler([
    '--intent',
    '为结直肠手术患者构建风险决策支持智能体',
    '--intent-signal',
    'risk',
    '--intent-signal',
    'surgery',
    '--intent-signal',
    'colorectal',
    '--reference-source',
    'paper-ref:uploaded-surgical-risk-agent-framework',
  ]) as ReturnType<typeof buildAgentProfileSelection>;
  const receipt = output.profile_selection_receipt;

  assert.equal(receipt.status, 'selected');
  assert.equal(receipt.profile_selection_mode, 'hybrid');
  assert.deepEqual(receipt.intent_signals, ['risk', 'surgery', 'colorectal']);
  assert.equal(receipt.matched_trigger_signals.includes('risk'), true);
  assert.equal(receipt.matched_trigger_signals.includes('surgery'), true);
  assert.equal(receipt.matched_trigger_signals.includes('colorectal'), true);
  assert.ok(receipt.selected_profile_refs.includes('opl-profile:evidence_grounded_decision_agent_profile.v1'));
  assert.ok(receipt.selected_profile_refs.includes('opl-profile-route:source_derived_design_profile_route.v1'));
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

test('profile public command specs keep catalog as guardrail, not design source', () => {
  const specs = buildProfileCommandSpecs();

  assert.match(specs['profiles list'].summary, /lower-bound conformance guardrails/);
  assert.match(specs['profiles list'].summary, /not target-agent design sources/);
  assert.match(specs['profiles select'].summary, /reference sources remain the design source/);
  assert.match(specs['profiles select'].usage, /--intent-signal/);
  assert.equal(
    specs['profiles select'].registry?.options.find((option) => option.name === 'intent-signal')?.multiple,
    true,
  );
  assert.match(specs['profiles conformance'].summary, /does not validate design quality or readiness/);
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
  assert.ok(sourceDerivedDesign.design_admission_receipt_refs.includes('design-admission-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-design-admission'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_stage_refs.includes('stage:colorectal-surgery-risk-from-paper/source-material-intake'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_rejected_source_pattern_refs.includes('non-transferable:uploaded-paper/external-runtime-truth-authority'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_forbidden_claims.includes('target_domain_ready'));
  assert.ok(sourceDerivedDesign.build_receipt_refs.includes('build-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-build'));
  assert.ok(sourceDerivedDesign.stage_pattern_source_refs.includes('pattern-ref:uploaded-paper/colorectal-risk-workflow'));
  const typedObjectFloor = sourceDerivedDesign.typed_object_floor;
  assert.ok(typedObjectFloor);
  assert.deepEqual(typedObjectFloor.workflow_step_refs, [
    'colorectal-risk-workflow/source-material-intake',
    'colorectal-risk-workflow/risk-evidence-synthesis',
  ]);
  assert.equal(typedObjectFloor.mapped_workflow_step_count, 2);
  assert.equal(typedObjectFloor.planned_stage_refs.length, 2);
  assert.equal(typedObjectFloor.admitted_design_stage_refs.length, 2);
  assert.equal(conformance.authority_boundary.conformance_can_claim_domain_ready, false);
});

test('profile conformance compares every typed object projection across capability map, control plane, and stages', () => {
  const cases = [
    ['reference_design_packet', 'ReferenceDesignPacket', 'packet_ref'],
    ['transfer_map', 'TransferMap', 'transfer_map_ref'],
    ['agent_pack_plan', 'AgentPackPlan', 'plan_ref'],
    ['design_admission_receipt', 'DesignAdmissionReceipt', 'receipt_ref'],
    ['build_receipt', 'AgentBuildReceipt', 'receipt_ref'],
  ] as const;

  for (const [field, objectName, identityField] of cases) {
    const { repoDir } = makeSourceDerivedAgentFixture();
    const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
    const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));
    stageControl.stages[0][field][identityField] += ':drifted-stage-copy';
    writeJson(stageControlPath, stageControl);

    const conformance = buildAgentProfileConformance([
      '--repo-dir',
      repoDir,
      '--profile',
      'source_derived_design_profile_route.v1',
    ]).profile_conformance;

    assert.equal(conformance.status, 'blocked', objectName);
    assert.equal(
      conformance.blockers.includes(
        `source_derived_design_typed_object_projection_mismatch:${objectName}:stage:source-material-intake`,
      ),
      true,
      objectName,
    );
  }

  const { repoDir } = makeSourceDerivedAgentFixture();
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));
  delete stageControl.stages[2].transfer_map;
  writeJson(stageControlPath, stageControl);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes(
      'source_derived_design_typed_object_projection_missing:TransferMap:stage:owner-gated-closeout',
    ),
    true,
    conformance.blockers.join('\n'),
  );
});

test('profile conformance recomputes complete planned file digests from the target agent root', () => {
  const missingDigestFixture = makeSourceDerivedAgentFixture();
  const missingDigestRef = 'agent/stages/source-material-intake.md';
  updateSourceDerivedTypedObjectProjections(missingDigestFixture.repoDir, (typedObjects) => {
    typedObjects.build_receipt.materialization.materialized_file_digests =
      typedObjects.build_receipt.materialization.materialized_file_digests.filter(
        (entry: Record<string, unknown>) => entry.ref !== missingDigestRef,
      );
  });
  const missingDigest = buildAgentProfileConformance([
    '--repo-dir',
    missingDigestFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(missingDigest.status, 'blocked');
  assert.equal(
    missingDigest.blockers.includes(
      `source_derived_design_build_receipt_missing_planned_file_digest:${missingDigestRef}`,
    ),
    true,
  );

  const missingFileFixture = makeSourceDerivedAgentFixture();
  const missingFileRef = 'agent/tools/source-intake.md';
  fs.rmSync(path.join(missingFileFixture.repoDir, missingFileRef));
  const missingFile = buildAgentProfileConformance([
    '--repo-dir',
    missingFileFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(missingFile.status, 'blocked');
  assert.equal(
    missingFile.blockers.includes(
      `source_derived_design_build_receipt_materialized_file_missing:${missingFileRef}`,
    ),
    true,
  );

  const driftedFileFixture = makeSourceDerivedAgentFixture();
  const driftedFileRef = 'agent/knowledge/reference-design.md';
  fs.appendFileSync(path.join(driftedFileFixture.repoDir, driftedFileRef), 'drifted after receipt\n');
  const driftedFile = buildAgentProfileConformance([
    '--repo-dir',
    driftedFileFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(driftedFile.status, 'blocked');
  assert.equal(
    driftedFile.blockers.includes(
      `source_derived_design_build_receipt_materialized_file_digest_mismatch:${driftedFileRef}`,
    ),
    true,
  );
});

test('profile conformance requires one user packet per declared source and keeps seed packets secondary', () => {
  const uncoveredSourceFixture = makeSourceDerivedAgentFixture();
  updateSourceDerivedTypedObjectProjections(
    uncoveredSourceFixture.repoDir,
    (typedObjects, capabilityMap, stageControl) => {
      const extraSourceRef = 'paper-ref:second-user-supplied-reference';
      typedObjects.reference_design_packet.reference_source_refs.push(extraSourceRef);
      capabilityMap.source_derived_design_receipt.source_refs.push(extraSourceRef);
      capabilityMap.source_derived_design_receipt.reference_design_source_refs.push(extraSourceRef);
      stageControl.source_derived_design_receipt = structuredClone(capabilityMap.source_derived_design_receipt);
    },
  );
  const uncoveredSource = buildAgentProfileConformance([
    '--repo-dir',
    uncoveredSourceFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(uncoveredSource.status, 'blocked');
  assert.equal(
    uncoveredSource.blockers.includes(
      'source_derived_design_reference_source_packet_cardinality_mismatch:2:1',
    ),
    true,
  );

  const seedPrimaryFixture = makeSourceDerivedAgentFixture();
  const seedPacketRef = 'expert-workflow-pattern:oma/case-grounded-expert-decision-workflow.v1';
  updateSourceDerivedTypedObjectProjections(
    seedPrimaryFixture.repoDir,
    (typedObjects, capabilityMap, stageControl) => {
      const packetRefs = [
        seedPacketRef,
        ...typedObjects.reference_design_packet.reference_design_pattern_packet_refs,
      ];
      typedObjects.reference_design_packet.reference_design_pattern_packet_refs = packetRefs;
      capabilityMap.source_derived_design_receipt.reference_design_packet_refs = packetRefs;
      capabilityMap.source_derived_design_receipt.reference_design_pattern_packet_refs = packetRefs;
      stageControl.source_derived_design_receipt = structuredClone(capabilityMap.source_derived_design_receipt);
    },
  );
  const seedPrimary = buildAgentProfileConformance([
    '--repo-dir',
    seedPrimaryFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(seedPrimary.status, 'blocked');
  assert.equal(
    seedPrimary.blockers.includes(
      `source_derived_design_seed_packet_cannot_be_primary:${seedPacketRef}`,
    ),
    true,
  );

  const seedExpansionFixture = makeSourceDerivedAgentFixture();
  updateSourceDerivedTypedObjectProjections(
    seedExpansionFixture.repoDir,
    (typedObjects, capabilityMap, stageControl) => {
      typedObjects.reference_design_packet.reference_design_pattern_packet_refs.push(seedPacketRef);
      typedObjects.reference_design_packet.transferable_design_patterns[0].source_pattern_ref = seedPacketRef;
      typedObjects.agent_pack_plan.planned_stage_refs[0].source_pattern_ref = seedPacketRef;
      typedObjects.design_admission_receipt.design_derived_stage_refs[0].source_pattern_ref = seedPacketRef;
      typedObjects.design_admission_receipt.source_derived_stage_refs[0].source_pattern_ref = seedPacketRef;
      typedObjects.build_receipt.source_derived_stage_refs[0].source_pattern_ref = seedPacketRef;
      capabilityMap.source_derived_design_receipt.reference_design_packet_refs.push(seedPacketRef);
      capabilityMap.source_derived_design_receipt.reference_design_pattern_packet_refs.push(seedPacketRef);
      stageControl.source_derived_design_receipt = structuredClone(capabilityMap.source_derived_design_receipt);
      stageControl.stages[0].stage_pattern_source_refs = [seedPacketRef];
    },
  );
  const seedExpansion = buildAgentProfileConformance([
    '--repo-dir',
    seedExpansionFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(seedExpansion.status, 'blocked');
  assert.equal(
    seedExpansion.blockers.includes(
      `source_derived_design_seed_packet_expands_active_stage_graph:source-material-intake:${seedPacketRef}`,
    ),
    true,
  );

  const relabeledOriginFixture = makeSourceDerivedAgentFixture();
  let relabeledPatternRef = '';
  updateSourceDerivedTypedObjectProjections(relabeledOriginFixture.repoDir, (typedObjects) => {
    relabeledPatternRef = typedObjects.reference_design_packet.transferable_design_patterns[0].source_pattern_ref;
    typedObjects.reference_design_packet.transferable_design_patterns[0].pattern_origin = 'oma_seed_library';
  });
  const relabeledOrigin = buildAgentProfileConformance([
    '--repo-dir',
    relabeledOriginFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(relabeledOrigin.status, 'blocked');
  assert.equal(
    relabeledOrigin.blockers.includes(
      `source_derived_design_active_pattern_origin_invalid:${relabeledPatternRef}`,
    ),
    true,
  );
});

test('profile conformance binds workflow transfer mappings to planned stage refs', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));

  for (const payload of [capabilityMap, stageControl]) {
    payload.transfer_map.mappings[0].target_stage_or_capability_slot =
      'stage:colorectal-surgery-risk-from-paper/unrelated-stage';
  }
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
    conformance.blockers.includes(
      'source_derived_design_agent_pack_plan_missing_workflow_step_stage:colorectal-risk-workflow/source-material-intake',
    ),
    true,
  );
});

test('profile conformance requires every source and target-only planned stage to be materialized', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));
  const removedStage = stageControl.stages.pop();
  writeJson(stageControlPath, stageControl);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes(
      `source_derived_design_stage_control_plane_planned_stage_count_invalid:${removedStage.stage_id}`,
    ),
    true,
  );
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
    for (const payload of [capabilityMap, stageControl]) {
      delete payload.reference_design_packet;
      delete payload.reference_design_packet_ref;
      delete payload.transfer_map;
      delete payload.transfer_map_ref;
      delete payload.agent_pack_plan;
      delete payload.agent_pack_plan_ref;
    }
    delete capabilityMap.design_admission_receipt;
    delete capabilityMap.design_admission_receipt_ref;
    delete capabilityMap.design_admission_receipt_refs;
    delete capabilityMap.build_receipt;
  delete capabilityMap.build_receipt_ref;
  delete capabilityMap.build_receipt_refs;
    delete stageControl.design_admission_receipt;
    delete stageControl.design_admission_receipt_ref;
    delete stageControl.design_admission_receipt_refs;
    delete stageControl.build_receipt;
  delete stageControl.build_receipt_ref;
  delete stageControl.build_receipt_refs;
  for (const stage of stageControl.stages) {
    delete stage.reference_design_packet;
    delete stage.reference_design_packet_ref;
    delete stage.transfer_map;
    delete stage.transfer_map_ref;
    delete stage.agent_pack_plan;
    delete stage.agent_pack_plan_ref;
    delete stage.design_admission_receipt;
    delete stage.design_admission_receipt_ref;
    delete stage.design_admission_receipt_refs;
    delete stage.build_receipt;
    delete stage.build_receipt_ref;
    delete stage.build_receipt_refs;
    delete stage.stage_pattern_source_refs;
  }
  capabilityMap.profile_requirements = {
    required_stage_archetypes: capabilityMap.profile_requirements.required_stage_archetypes,
    required_capability_kinds: capabilityMap.profile_requirements.required_capability_kinds,
    required_surface_roles: capabilityMap.profile_requirements.required_surface_roles,
  };
  stageControl.profile_requirements = capabilityMap.profile_requirements;
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
      conformance.blockers.includes('source_derived_design_missing_design_admission_receipt_refs'),
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
    delete capabilityMap.source_derived_design_receipt.design_admission_receipt_refs;
    delete capabilityMap.design_admission_receipt;
    delete capabilityMap.design_admission_receipt_ref;
    delete capabilityMap.design_admission_receipt_refs;
    delete capabilityMap.source_derived_design_receipt.build_receipt_refs;
  delete capabilityMap.build_receipt;
  delete capabilityMap.build_receipt_ref;
  delete capabilityMap.build_receipt_refs;
    delete stageControl.source_derived_design_receipt.transfer_map_refs;
    delete stageControl.source_derived_design_receipt.agent_pack_plan_refs;
    delete stageControl.source_derived_design_receipt.design_admission_receipt_refs;
    delete stageControl.design_admission_receipt;
    delete stageControl.design_admission_receipt_ref;
    delete stageControl.design_admission_receipt_refs;
    delete stageControl.source_derived_design_receipt.build_receipt_refs;
  for (const payload of [capabilityMap, stageControl]) {
    delete payload.transfer_map;
    delete payload.transfer_map_ref;
    delete payload.agent_pack_plan;
    delete payload.agent_pack_plan_ref;
  }
  delete stageControl.build_receipt;
  delete stageControl.build_receipt_ref;
  delete stageControl.build_receipt_refs;
  for (const stage of stageControl.stages) {
    delete stage.transfer_map;
    delete stage.transfer_map_ref;
    delete stage.agent_pack_plan;
    delete stage.agent_pack_plan_ref;
    delete stage.design_admission_receipt;
    delete stage.design_admission_receipt_ref;
    delete stage.design_admission_receipt_refs;
    delete stage.build_receipt;
    delete stage.build_receipt_ref;
    delete stage.build_receipt_refs;
  }

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
      conformance.blockers.includes('source_derived_design_missing_design_admission_receipt_refs'),
      true,
    );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement'),
    false,
  );
});

test('profile conformance blocks hollow source-derived typed objects', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageControlPath = path.join(repoDir, 'contracts', 'stage_control_plane.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageControl = JSON.parse(fs.readFileSync(stageControlPath, 'utf8'));

  for (const payload of [capabilityMap, stageControl]) {
    payload.reference_design_packet = {
      surface_kind: 'opl_meta_agent_reference_design_packet',
      version: 'opl-meta-agent.reference-design-packet.v1',
      packet_ref: payload.reference_design_packet_ref,
      transferable_design_patterns: [{ pattern_id: 'generic-pattern' }],
    };
    payload.transfer_map = {
      surface_kind: 'opl_meta_agent_transfer_map',
      version: 'opl-meta-agent.transfer-map.v1',
      transfer_map_ref: payload.transfer_map_ref,
      reference_design_packet_ref: payload.reference_design_packet_ref,
      mappings: [{ source_anchor_ref: 'ref-only' }],
    };
    payload.agent_pack_plan = {
      surface_kind: 'opl_meta_agent_agent_pack_plan',
      version: 'opl-meta-agent.agent-pack-plan.v1',
      plan_ref: payload.agent_pack_plan_ref,
      reference_design_packet_ref: payload.reference_design_packet_ref,
      transfer_map_ref: payload.transfer_map_ref,
      planned_stage_refs: [{ stage_ref: 'stage:generic' }],
    };
    payload.design_admission_receipt = {
      surface_kind: 'opl_meta_agent_design_admission_receipt',
      version: 'opl-meta-agent.design-admission-receipt.v1',
      receipt_ref: payload.design_admission_receipt_ref,
      reference_design_packet_ref: payload.reference_design_packet_ref,
      transfer_map_ref: payload.transfer_map_ref,
      agent_pack_plan_ref: payload.agent_pack_plan_ref,
      design_derived_stage_refs: [],
    };
  }
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
    conformance.blockers.includes(
      'source_derived_design_reference_design_packet_workflow_steps_invalid:generic-pattern',
    ),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_transfer_map_missing_typed_workflow_mappings'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_agent_pack_plan_missing_typed_workflow_stages'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_design_admission_receipt_missing_stage_refs'),
    true,
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
