import { isDeepStrictEqual } from 'node:util';

import { isRecord } from '../../kernel/contract-validation.ts';
import { OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID } from './standard-agent-execution-profile.ts';

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

export const STANDARD_AGENT_PACK_ABI_AUTHORITY_REF =
  'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/agent_pack_contract/standard_agent_pack_abi';

export const STANDARD_AGENT_PACK_ABI_DECLARATION = {
  authority_ref: STANDARD_AGENT_PACK_ABI_AUTHORITY_REF,
} as const;

export type StandardAgentPackAbiResolution = {
  status: 'passed' | 'missing' | 'blocked' | 'not_applicable';
  applicability: 'repo_local' | 'opl_hosted' | 'profile_resolution_blocked';
  selected_execution_profile_id: string | null;
  declaration_kind?: 'canonical_authority_ref' | 'legacy_inline_abi' | null;
  declaration?: unknown;
  effective_abi: typeof STANDARD_AGENT_PACK_ABI | null;
  blockers: string[];
};

function validateDeclaration(value: unknown) {
  if (!isRecord(value)) {
    return {
      declarationKind: null,
      blockers: ['standard_agent_pack_abi_declaration_must_be_object'],
    } as const;
  }
  if (Object.hasOwn(value, 'surface_kind')) {
    return isDeepStrictEqual(value, STANDARD_AGENT_PACK_ABI)
      ? { declarationKind: 'legacy_inline_abi', blockers: [] } as const
      : {
          declarationKind: 'legacy_inline_abi',
          blockers: ['standard_agent_pack_abi_legacy_inline_must_equal_framework_canonical'],
        } as const;
  }
  const onlyAuthorityRef = Object.keys(value).length === 1
    && value.authority_ref === STANDARD_AGENT_PACK_ABI_AUTHORITY_REF;
  return onlyAuthorityRef
    ? { declarationKind: 'canonical_authority_ref', blockers: [] } as const
    : {
        declarationKind: 'canonical_authority_ref',
        blockers: ['standard_agent_pack_abi_authority_ref_invalid'],
      } as const;
}

export function resolveStandardAgentPackAbi(
  declaration: unknown,
  options: {
    repoDir?: string;
    selectedExecutionProfileId: string | null;
    required?: boolean;
  },
): StandardAgentPackAbiResolution {
  if (options.selectedExecutionProfileId === null) {
    return {
      status: 'blocked',
      applicability: 'profile_resolution_blocked',
      selected_execution_profile_id: null,
      declaration: declaration ?? null,
      effective_abi: null,
      blockers: ['standard_agent_pack_abi_execution_profile_selection_blocked'],
    };
  }
  if (options.selectedExecutionProfileId === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID) {
    return declaration === undefined || declaration === null
      ? {
          status: 'not_applicable',
          applicability: 'opl_hosted',
          selected_execution_profile_id: options.selectedExecutionProfileId,
          effective_abi: null,
          blockers: [],
        }
      : {
          status: 'blocked',
          applicability: 'opl_hosted',
          selected_execution_profile_id: options.selectedExecutionProfileId,
          declaration,
          effective_abi: null,
          blockers: ['hosted_execution_profile_must_not_declare_repo_local_standard_agent_pack_abi'],
        };
  }
  if (declaration === undefined || declaration === null) {
    return {
      status: options.required ? 'blocked' : 'missing',
      applicability: 'repo_local',
      selected_execution_profile_id: options.selectedExecutionProfileId,
      declaration_kind: null,
      declaration: null,
      effective_abi: null,
      blockers: options.required ? ['standard_agent_pack_abi_missing'] : [],
    };
  }
  const validation = validateDeclaration(declaration);
  return {
    status: validation.blockers.length === 0 ? 'passed' : 'blocked',
    applicability: 'repo_local',
    selected_execution_profile_id: options.selectedExecutionProfileId,
    declaration_kind: validation.declarationKind,
    declaration,
    effective_abi: validation.blockers.length === 0 ? STANDARD_AGENT_PACK_ABI : null,
    blockers: [...validation.blockers],
  };
}
