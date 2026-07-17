import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAgentProfileCatalog } from '../../../src/modules/pack/agent-profile-spine.ts';
import {
  buildReferenceBuildDigestTargets,
  materializeReferenceBuildFileDigest,
} from '../../../src/modules/pack/reference-build-proof.ts';

export function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

type ProfileStageSource = {
  stage_id: string;
  stage_kind: string;
  title: string;
  goal: string;
  policy_ref: string;
  prompt_ref: string;
  knowledge_refs: string[];
  quality_gate_refs: string[];
  skill_ref: string;
  tool_ref: string;
  stage_origin?: 'source_pattern_ref' | 'target_only_requirement';
  pattern_id?: string;
  step_id?: string;
  provenance_kind?: string;
  source_pattern_ref?: string;
  target_only_requirement_ref?: string;
  source_anchor_refs?: string[];
  stage_pattern_source_refs?: string[];
};

function writeProfileStageCompilerSources(
  repoDir: string,
  domainId: string,
  stages: ProfileStageSource[],
) {
  const refs = [...new Set(stages.flatMap((stage) => [
    stage.policy_ref,
    stage.prompt_ref,
    ...stage.knowledge_refs,
    ...stage.quality_gate_refs,
    stage.skill_ref,
    stage.tool_ref,
  ]))];
  for (const ref of refs) {
    const file = path.join(repoDir, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `materialized:${ref}\n`);
    }
  }
  fs.mkdirSync(path.join(repoDir, 'runtime', 'authority_functions'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'runtime', 'authority_functions', 'README.md'), '# Authority functions\n');
  writeJson(path.join(repoDir, 'contracts', 'owner_receipt_contract.json'), {
    surface_kind: 'owner_receipt_contract',
  });
  writeJson(path.join(repoDir, 'contracts', 'domain_descriptor.json'), {
    surface_kind: 'domain_agent_descriptor',
    domain_id: domainId,
    domain_label: domainId,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });
  writeJson(path.join(repoDir, 'contracts', 'action_catalog.json'), {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: `${domainId}.profile-actions`,
    target_domain_id: domainId,
    owner: domainId,
    authority_boundary: {
      domain_truth_owner: domainId,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [{
      action_id: 'inspect_profile',
      title: 'Inspect profile',
      summary: 'Inspect the selected profile inputs.',
      owner: domainId,
      effect: 'mutating',
      execution_binding: {
        kind: 'stage_binding',
        stage_manifest_ref: 'agent/stages/manifest.json',
      },
      input_schema_ref: 'contracts/profile.input.schema.json',
      output_schema_ref: 'contracts/profile.output.schema.json',
      required_fields: ['workspace_root'],
      optional_fields: [],
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: [],
      stage_route: {
        entry_stage_ref: stages[0]!.stage_id,
        required_stage_refs: stages.map((stage) => stage.stage_id),
        optional_stage_refs: [],
        terminal_stage_refs: [stages.at(-1)!.stage_id],
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'domain_cli' },
        mcp: { tool_name: 'inspect_profile', surface_kind: 'domain_mcp' },
        skill: { command_contract_id: 'inspect_profile', surface_kind: 'domain_skill' },
        product_entry: { action_key: 'inspect_profile', surface_kind: 'domain_product_entry' },
        openai: { tool_name: 'inspect_profile' },
        ai_sdk: { tool_name: 'inspect_profile' },
      },
    }],
    notes: [],
  });
  writeJson(path.join(repoDir, 'contracts', 'profile.input.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { workspace_root: { type: 'string' } },
    required: ['workspace_root'],
  });
  writeJson(path.join(repoDir, 'contracts', 'profile.output.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
  });
  writeJson(path.join(repoDir, 'contracts', 'pack_compiler_input.json'), {
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: domainId,
    canonical_agent_id: domainId,
    required_domain_pack_paths: ['agent/stages/manifest.json', ...refs],
  });
  writeJson(path.join(repoDir, 'agent', 'stages', 'manifest.json'), {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: domainId,
    owner: domainId,
    authority_boundary: {
      domain_truth_owner: domainId,
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: stages.map((stage, index) => ({
      stage_id: stage.stage_id,
      stage_kind: stage.stage_kind,
      title: stage.title,
      summary: stage.title,
      goal: stage.goal,
      policy_ref: stage.policy_ref,
      prompt_ref: stage.prompt_ref,
      knowledge_refs: stage.knowledge_refs,
      quality_gate_refs: stage.quality_gate_refs,
      allowed_action_refs: ['inspect_profile'],
      requires: [`${stage.stage_id}_input_ref`],
      ensures: [`${stage.stage_id}_owner_receipt_or_typed_blocker_ref`],
      next_stage_refs: stages[index + 1] ? [stages[index + 1].stage_id] : [],
      trust_lane: index === 0 ? 'codex_executor' : 'domain_agent',
      ...(stage.stage_origin ? { stage_origin: stage.stage_origin } : {}),
      ...(stage.pattern_id ? { pattern_id: stage.pattern_id } : {}),
      ...(stage.step_id ? { step_id: stage.step_id } : {}),
      ...(stage.provenance_kind ? { provenance_kind: stage.provenance_kind } : {}),
      ...(stage.source_pattern_ref ? { source_pattern_ref: stage.source_pattern_ref } : {}),
      ...(stage.target_only_requirement_ref
        ? { target_only_requirement_ref: stage.target_only_requirement_ref }
        : {}),
      ...(stage.source_anchor_refs ? { source_anchor_refs: stage.source_anchor_refs } : {}),
      ...(stage.stage_pattern_source_refs
        ? { stage_pattern_source_refs: stage.stage_pattern_source_refs }
        : {}),
    })),
  });
}

const SOURCE_DERIVED_TYPED_OBJECT_FIELDS = [
  'reference_design_packet',
  'transfer_map',
  'agent_pack_plan',
  'design_admission_receipt',
  'build_receipt',
] as const;

export function updateSourceDerivedTypedObjectProjections(
  repoDir: string,
  mutate: (
    typedObjects: Record<(typeof SOURCE_DERIVED_TYPED_OBJECT_FIELDS)[number], Record<string, any>>,
    capabilityMap: Record<string, any>,
    stageManifest: Record<string, any>,
  ) => void,
) {
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageManifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestPath, 'utf8'));
  const typedObjects = Object.fromEntries(
    SOURCE_DERIVED_TYPED_OBJECT_FIELDS.map((field) => [field, structuredClone(capabilityMap[field])]),
  ) as Record<(typeof SOURCE_DERIVED_TYPED_OBJECT_FIELDS)[number], Record<string, any>>;

  mutate(typedObjects, capabilityMap, stageManifest);
  for (const field of SOURCE_DERIVED_TYPED_OBJECT_FIELDS) {
    capabilityMap[field] = structuredClone(typedObjects[field]);
  }
  writeJson(capabilityMapPath, capabilityMap);
  writeJson(stageManifestPath, stageManifest);
}

export function profileCatalogEntry() {
  return buildAgentProfileCatalog()
    .agent_profile_catalog
    .profiles[0];
}

export function makeConformantAgentFixture() {
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

  writeProfileStageCompilerSources(repoDir, 'colorectal-surgery-risk', [{
    stage_id: 'risk-support',
    stage_kind: 'creation',
    title: 'Risk Support',
    goal: 'Produce an evidence-grounded risk-support artifact.',
    policy_ref: 'agent/stages/risk-support.md',
    prompt_ref: 'agent/prompts/risk-support.md',
    knowledge_refs: ['agent/knowledge/guidelines.md'],
    quality_gate_refs: ['agent/quality_gates/evidence.md'],
    skill_ref: 'agent/skills/risk-support.md',
    tool_ref: 'agent/tools/retrieval.md',
  }]);

  return { repoDir, profile };
}

export function makeSourceDerivedAgentFixture() {
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
    surface_kind: 'opl_foundry_reference_design_packet',
    version: 'opl.foundry.reference-design-packet.v1',
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
    surface_kind: 'opl_foundry_transfer_map',
    version: 'opl.foundry.transfer-map.v1',
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
    surface_kind: 'opl_foundry_agent_pack_plan',
    version: 'opl.foundry.agent-pack-plan.v1',
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
      surface_kind: 'opl_foundry_agent_build_receipt',
      receipt_kind: 'AgentBuildReceipt',
      version: 'opl.foundry.agent-build-receipt.v1',
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
        materialized_file_digests: buildReferenceBuildDigestTargets(repoDir, agentPackPlan)
          .map((target) => materializeReferenceBuildFileDigest(repoDir, target)),
        all_planned_stages_materialized_exactly_once: true,
        all_planned_stage_files_present: true,
      },
    };
    const designAdmissionReceipt = {
      surface_kind: 'opl_foundry_design_admission_receipt',
      version: 'opl.foundry.design-admission-receipt.v1',
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

  writeProfileStageCompilerSources(
    repoDir,
    'colorectal-surgery-risk-from-paper',
    [...sourceDerivedStageRefs, targetOnlyStage].map((stage, index) => {
      const stepId = 'step_id' in stage ? stage.step_id : null;
      return {
        stage_id: stage.stage_id,
        stage_kind: index === sourceDerivedStageRefs.length ? 'review' : 'creation',
        title: stepId ?? 'Owner gated closeout',
        goal: index === sourceDerivedStageRefs.length
          ? 'Route the candidate package to the target owner.'
          : `Materialize ${stepId} from the admitted source workflow.`,
        policy_ref: stage.stage_path,
        prompt_ref: stage.prompt_ref,
        knowledge_refs: stage.knowledge_refs,
        quality_gate_refs: stage.quality_gate_refs,
        skill_ref: stage.skill_ref,
        tool_ref: stage.tool_refs[0],
        stage_origin: stage.origin as ProfileStageSource['stage_origin'],
        ...('pattern_id' in stage ? { pattern_id: stage.pattern_id } : {}),
        ...(stepId ? { step_id: stepId } : {}),
        ...('provenance_kind' in stage ? { provenance_kind: stage.provenance_kind } : {}),
        ...('source_pattern_ref' in stage ? { source_pattern_ref: stage.source_pattern_ref } : {}),
        ...('source_anchor_refs' in stage ? { source_anchor_refs: stage.source_anchor_refs } : {}),
        ...('source_pattern_ref' in stage
          ? { stage_pattern_source_refs: [stage.source_pattern_ref] }
          : {}),
        ...('target_only_requirement_ref' in stage
          ? { target_only_requirement_ref: stage.target_only_requirement_ref }
          : {}),
      };
    }),
  );

  return { repoDir };
}
