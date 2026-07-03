export const STANDARD_AGENT_PACK_ABI = {
  surface_kind: 'opl_standard_agent_pack_abi',
  version: 'standard-agent-pack-abi.v1',
  owner: 'one-person-lab',
  baseline_status: 'frozen_machine_verifiable_baseline',
  required_repo_layout: [
    {
      path: 'agent/',
      role: 'declarative_domain_pack',
      required: true,
    },
    {
      path: 'contracts/',
      role: 'machine_readable_contracts',
      required: true,
    },
    {
      path: 'runtime/authority_functions/',
      role: 'minimal_authority_functions',
      required: true,
    },
  ],
  required_stage_pack_shape: {
    prompt_refs: {
      required: true,
      accepted_ref_prefixes: ['agent/prompts/'],
    },
    skill_refs: {
      required: true,
      accepted_ref_prefixes: ['agent/skills/'],
      accepted_ref_kinds: ['repo_path', 'skill_id'],
    },
    knowledge_refs: {
      required: true,
      accepted_ref_prefixes: ['agent/knowledge/'],
    },
    quality_gate_refs: {
      required: true,
      accepted_ref_prefixes: ['agent/quality_gates/'],
    },
    tool_affordance_boundary: {
      required: true,
      role: 'available_affordance_catalog_not_workflow_script',
      required_ref_fields: [
        'capability_refs',
        'permission_scope_refs',
        'credential_boundary_refs',
        'write_scope_refs',
        'side_effect_risk_refs',
        'forbidden_authority_refs',
      ],
    },
    receipt_schema: {
      required: true,
      accepted_ref_prefixes: ['contracts/'],
      default_source_ref: 'contracts/owner_receipt_contract.json',
    },
  },
  l4_entry_gate: {
    entry_level: 'L4_structural_baseline',
    required_gates: [
      'repo_layout_declared',
      'stage_pack_v2_required',
      'stage_prompt_skill_knowledge_quality_gate_refs_resolve',
      'tool_affordance_boundary_declared',
      'receipt_schema_declared',
      'minimal_authority_functions_declared',
      'generated_surface_handoff_declared',
      'no_forbidden_write_contract_declared',
    ],
    can_claim_l5: false,
    can_claim_domain_ready: false,
  },
  l5_entry_gate: {
    entry_level: 'L5_production_operating_maturity',
    evidence_required: [
      'real_user_path',
      'long_soak_recovery',
      'release_install_evidence',
      'owner_acceptance',
      'direct_and_opl_hosted_parity_at_scale',
    ],
    conformance_pass_counts_as_l5: false,
    contract_validation_counts_as_l5: false,
    provider_completion_counts_as_l5: false,
    app_projection_counts_as_l5: false,
  },
  authority_boundary: {
    abi_can_claim_domain_ready: false,
    abi_can_claim_quality_or_export: false,
    abi_can_claim_l5_complete: false,
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_mutate_domain_artifact_body: false,
  },
} as const;
