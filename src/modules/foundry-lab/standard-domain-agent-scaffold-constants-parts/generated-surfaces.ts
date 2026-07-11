import { STANDARD_STAGE_PACK_CONFORMANCE_VERSION } from './identity-and-primitives.ts';
import {
  FOUNDRY_AGENT_SERIES_POLICY_RELEASE,
  STANDARD_FOUNDRY_AGENT_SERIES_CONSUMER_CONTRACT,
} from './foundry-series.ts';
import { STANDARD_PROGRESS_DELTA_POLICY } from './progress-delta.ts';
import { STANDARD_STAGE_COMPLETION_POLICY } from './stage-completion.ts';
import { STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from './typed-blocker.ts';
import { STANDARD_USER_STAGE_LOG_CONTRACT } from './user-stage-log.ts';
import { STANDARD_AGENT_PACK_ABI } from '../../pack/public/standard-agent-pack-abi.ts';

export { STANDARD_AGENT_PACK_ABI } from '../../pack/public/standard-agent-pack-abi.ts';

export const OPL_GENERATED_SURFACES = [
  {
    surface_id: 'cli',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_declares_actions_stages_and_authority_receipts_only',
  },
  {
    surface_id: 'mcp',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_does_not_handwrite_generic_tool_shell',
  },
  {
    surface_id: 'skill',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_declares_skill_policy_refs_and_direct_path_parity',
  },
  {
    surface_id: 'product_entry_manifest',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_declares_product_entry_refs_and_domain_authority_refs',
  },
  {
    surface_id: 'domain_handler',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_implements_only_domain_authority_function_targets',
  },
  {
    surface_id: 'status_read_model',
    owner: 'one-person-lab',
    source_contract: 'contracts/generated_surface_handoff.json',
    domain_policy: 'domain_repo_returns_receipts_refs_and_typed_blockers',
  },
  {
    surface_id: 'workbench_drilldown',
    owner: 'one-person-lab',
    source_contract: 'contracts/generated_surface_handoff.json',
    domain_policy: 'domain_repo_does_not_own_generic_operator_workbench',
  },
  {
    surface_id: 'functional_harness_cases',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_supplies_fixtures_expected_receipts_and_forbidden_write_assertions',
  },
] as const;

export const PACK_COMPILER_CONTRACT = {
  surface_kind: 'opl_domain_pack_compiler_contract',
  version: 'opl-domain-pack-compiler.v1',
  owner: 'one-person-lab',
  generated_surface_owner: 'one-person-lab',
  input_contract: 'contracts/pack_compiler_input.json',
  handoff_contract: 'contracts/generated_surface_handoff.json',
  domain_pack_owner_field: 'domain_pack_owner',
  domain_repo_can_own_generated_surface: false,
  allowed_domain_inputs: [
    'declarative_domain_pack',
    'minimal_authority_functions',
    'domain_fixtures',
    'owner_receipt_schema',
    'no_forbidden_write_assertions',
    'standard_stage_pack_v2_cross_refs',
    'standard_agent_pack_abi',
    'capability_map',
  ],
  required_source_refs: [
    'stage_graph_source_ref',
    'quality_gate_source_ref',
    'executor_policy_source_ref',
    'owner_receipt_schema_source_ref',
    'authority_functions_source_ref',
    'generated_surface_handoff_source_ref',
    'capability_map_source_ref',
  ],
  generated_surfaces: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
} as const;

export const GENERATED_SURFACE_CONTRACT = {
  surface_kind: 'opl_generated_surface_contract',
  version: 'opl-generated-surface.v1',
  owner: 'one-person-lab',
  generated_surface_owner: 'one-person-lab',
  domain_repo_can_own_generated_surface: false,
  surfaces: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
  authority_boundary: {
    generated_surface_can_write_domain_truth: false,
    generated_surface_can_write_memory_body: false,
    generated_surface_can_authorize_quality_or_export: false,
    generated_surface_can_call_minimal_authority_function_with_receipt_contract: true,
  },
} as const;

export const AGENT_PACK_CONTRACT = {
  canonical_semantic_pack_root: 'agent/',
  required_sections: [
    'agent/principles',
    'agent/prompts',
    'agent/stages',
    'agent/skills',
    'agent/tools',
    'agent/knowledge',
    'agent/quality_gates',
  ],
  required_domain_pack_paths_field: 'contracts/pack_compiler_input.json#/required_domain_pack_paths',
  standard_agent_pack_abi: STANDARD_AGENT_PACK_ABI,
  stage_ref_requirements: [
    'capability_map:contracts/capability_map.json resolver index',
    'prompt_refs:agent/prompts/*',
    'skills:agent/skills/* or skill_id',
    'tool_refs:agent/tools/* affordance catalog refs',
    'tool_affordance_boundary:capability permission credential write side-effect forbidden-authority refs',
    'knowledge_refs:agent/knowledge/*',
    'evaluation:agent/quality_gates/*',
    'selected_executor:codex_cli default binding or explicit non-default executor binding',
    'user_stage_log_requirement:domain provides human-readable stage semantics; OPL projects timing usage refs only',
    'stage_contract.requires and stage_contract.ensures',
    'stage_contract.expected_receipt_refs',
    'stage_contract.receipt_schema_refs',
    'stage_contract.authority_function_refs',
    'stage_contract.l4_entry_gate and stage_contract.l5_entry_gate',
    'stage_contract.stage_completion_policy',
    'stage_contract.user_stage_log_contract',
    'stage_contract.progress_delta_policy',
    'stage_contract.typed_blocker_lineage_policy',
    'independent_gate_policy:execution_review_separation',
  ],
  stage_completion_policy: STANDARD_STAGE_COMPLETION_POLICY,
  user_stage_log_contract: STANDARD_USER_STAGE_LOG_CONTRACT,
  progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
  typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  foundry_agent_series_contract: STANDARD_FOUNDRY_AGENT_SERIES_CONSUMER_CONTRACT,
  foundry_agent_series_policy_release: FOUNDRY_AGENT_SERIES_POLICY_RELEASE,
  conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
  validator: 'opl agents scaffold --validate <repo-dir>',
  empty_agent_directory_policy: 'blocked',
} as const;
