import {
  SCAFFOLD_MARKER,
  STARTER_STAGE_ID,
} from '../standard-domain-agent-scaffold-constants.ts';

export const CAPABILITY_MAP_REF = 'contracts/capability_map.json';
const CAPABILITY_MAP_SCHEMA_REF =
  'contracts/opl-framework/standard-agent-capability-map.schema.json';

export const STANDARD_AGENT_CAPABILITY_MAP_CONTRACT = {
  surface_kind: 'opl_standard_agent_capability_map_contract',
  version: 'standard-agent-capability-map.v1',
  owner: 'one-person-lab',
  state: 'active_contract',
  schema_ref: CAPABILITY_MAP_SCHEMA_REF,
  required_instance_ref: CAPABILITY_MAP_REF,
  resolver_role:
    'single_source_locator_index_for_stage_prompt_skill_tool_knowledge_gate_eval_refs',
  capability_pack_root: 'agent/',
  map_is_domain_truth: false,
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
} as const;

function capabilityAuthorityBoundary() {
  return {
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_mutate_artifact_body: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_quality_or_export: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function repoRef(ref: string, role: string) {
  return {
    ref_kind: 'repo_path',
    ref,
    role,
  };
}

function contractRef(ref: string, role: string) {
  return {
    ref_kind: 'contract_ref',
    ref,
    role,
  };
}

const SELF_EVOLUTION_FORBIDDEN_SURFACES = [
  'domain_truth',
  'memory_body',
  'artifact_body',
  'owner_receipt_body',
  'typed_blocker_body',
  'human_gate_body',
  'runtime_queue',
  'quality_or_export_verdict',
  'domain_readiness_claim',
] as const;

function capabilityOwnerCloseoutBoundary(owner: string) {
  return {
    owner,
    required_return_shapes: [
      'owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_ref',
    ],
    can_write_owner_receipt_body: false,
    can_create_typed_blocker: false,
  };
}

function selfEvolutionRoutingFields(input: {
  targetPath: string;
  improvementTokens: string[];
  verificationRefs?: string[];
  forbiddenSurfaces?: readonly string[];
  owner: string;
}) {
  return {
    improvement_tokens: input.improvementTokens,
    canonical_target_paths: [input.targetPath],
    verification_refs: input.verificationRefs ?? ['opl:agents-scaffold-validate'],
    forbidden_surfaces: [...(input.forbiddenSurfaces ?? SELF_EVOLUTION_FORBIDDEN_SURFACES)],
    owner_closeout_boundary: capabilityOwnerCloseoutBoundary(input.owner),
  };
}

export function standardCapabilityMap(domainId: string, domainLabel: string) {
  const stageRef = 'opl-generated:family_stage_control_plane#/stages/0';
  return {
    surface_kind: 'opl_standard_agent_capability_map',
    schema_version: 'standard-agent-capability-map.v1',
    owner: domainId,
    domain_id: domainId,
    domain_label: domainLabel,
    state: 'active_contract',
    schema_ref: CAPABILITY_MAP_SCHEMA_REF,
    map_ref: CAPABILITY_MAP_REF,
    resolver_policy: 'resolver_index_only_no_domain_truth',
    capability_map_role:
      'single_source_locator_index_for_stage_prompt_skill_tool_knowledge_gate_eval_refs',
    capability_pack: {
      pack_id: `${domainId}.capability_pack.v1`,
      pack_root_ref: 'agent/',
      map_ref: CAPABILITY_MAP_REF,
      pack_role: 'declarative_domain_capability_pack',
      default_externalization_policy: 'domain_agent_builtin_until_externalization_gate_met',
      capability_pack_can_claim_domain_ready: false,
    },
    capabilities: [
      {
        capability_id: `${domainId}.domain_intake.stage_prompt`,
        surface_role: 'stage_prompt',
        capability_kind: 'stage_prompt',
        stage_ids: [STARTER_STAGE_ID],
        canonical_owner: domainId,
        physical_source_ref: repoRef(`agent/prompts/${STARTER_STAGE_ID}.md`, 'stage_prompt_source'),
        runtime_projection_refs: [
          contractRef(`${stageRef}/prompt_refs/0`, 'stage_control_plane_prompt_ref'),
        ],
        sync_policy: 'domain_agent_builtin',
        externalization_reason: 'domain_agent_builtin',
        ...selfEvolutionRoutingFields({
          targetPath: `agent/prompts/${STARTER_STAGE_ID}.md`,
          improvementTokens: [
            'stage_path_quality',
            'stage_prompt_quality',
          ],
          owner: domainId,
        }),
        authority_boundary: capabilityAuthorityBoundary(),
      },
      {
        capability_id: `${domainId}.domain_execution.professional_skill`,
        surface_role: 'professional_skill',
        capability_kind: 'professional_skill',
        stage_ids: [STARTER_STAGE_ID],
        canonical_owner: domainId,
        physical_source_ref: repoRef('agent/skills/domain_execution.md', 'professional_skill_policy'),
        runtime_projection_refs: [
          contractRef(`${stageRef}/skills/0`, 'stage_control_plane_skill_ref'),
        ],
        sync_policy: 'domain_agent_builtin',
        externalization_reason: 'domain_agent_builtin',
        ...selfEvolutionRoutingFields({
          targetPath: 'agent/skills/domain_execution.md',
          improvementTokens: [
            'professional_skill_quality',
            'domain_execution_quality',
          ],
          owner: domainId,
        }),
        authority_boundary: capabilityAuthorityBoundary(),
      },
      {
        capability_id: `${domainId}.domain_affordances.tool_connector`,
        surface_role: 'tool_connector',
        capability_kind: 'tool_connector',
        stage_ids: [STARTER_STAGE_ID],
        canonical_owner: domainId,
        physical_source_ref: repoRef('agent/tools/domain_affordances.md', 'tool_affordance_catalog'),
        runtime_projection_refs: [
          contractRef(`${stageRef}/tool_refs/0`, 'stage_control_plane_tool_ref'),
          contractRef(`${stageRef}/tool_affordance_boundary`, 'tool_affordance_boundary'),
        ],
        sync_policy: 'domain_agent_builtin_or_opl_connect_when_externalized',
        externalization_reason: 'domain_agent_builtin',
        ...selfEvolutionRoutingFields({
          targetPath: 'agent/tools/domain_affordances.md',
          improvementTokens: [
            'tool_connector_quality',
            'external_resource_routing',
          ],
          owner: domainId,
        }),
        authority_boundary: capabilityAuthorityBoundary(),
      },
      {
        capability_id: `${domainId}.domain_boundary.knowledge_pack`,
        surface_role: 'knowledge_pack',
        capability_kind: 'reference_pack',
        stage_ids: [STARTER_STAGE_ID],
        canonical_owner: domainId,
        physical_source_ref: repoRef('agent/knowledge/domain_boundary.md', 'domain_knowledge_pack'),
        runtime_projection_refs: [
          contractRef(`${stageRef}/knowledge_refs/0`, 'stage_control_plane_knowledge_ref'),
        ],
        sync_policy: 'domain_agent_builtin_refs_only',
        externalization_reason: 'domain_agent_builtin',
        ...selfEvolutionRoutingFields({
          targetPath: 'agent/knowledge/domain_boundary.md',
          improvementTokens: [
            'knowledge_pack_quality',
            'domain_boundary_traceability',
          ],
          owner: domainId,
        }),
        authority_boundary: capabilityAuthorityBoundary(),
      },
      {
        capability_id: `${domainId}.domain_acceptance.quality_gate`,
        surface_role: 'quality_gate',
        capability_kind: 'reference_pack',
        stage_ids: [STARTER_STAGE_ID],
        canonical_owner: domainId,
        physical_source_ref: repoRef('agent/quality_gates/domain_acceptance.md', 'quality_gate_ref'),
        runtime_projection_refs: [
          contractRef(`${stageRef}/evaluation/0`, 'stage_control_plane_quality_gate_ref'),
          contractRef(`${stageRef}/independent_gate_policy`, 'independent_gate_policy'),
        ],
        sync_policy: 'domain_agent_builtin_refs_only',
        externalization_reason: 'domain_agent_builtin',
        ...selfEvolutionRoutingFields({
          targetPath: 'agent/quality_gates/domain_acceptance.md',
          improvementTokens: [
            'quality_gate_precision',
            'owner_acceptance_traceability',
          ],
          owner: domainId,
        }),
        authority_boundary: capabilityAuthorityBoundary(),
      },
      {
        capability_id: `${domainId}.domain_acceptance.eval_suite`,
        surface_role: 'eval_suite',
        capability_kind: 'contract_module',
        stage_ids: [STARTER_STAGE_ID],
        canonical_owner: domainId,
        physical_source_ref: repoRef('runtime/fixtures/README.md', 'eval_suite_fixture_refs'),
        runtime_projection_refs: [
          contractRef('contracts/stage_run_canary_evidence.json', 'controlled_stage_run_canary_evidence'),
        ],
        sync_policy: 'domain_agent_builtin_refs_only',
        externalization_reason: 'domain_agent_builtin',
        ...selfEvolutionRoutingFields({
          targetPath: 'runtime/fixtures/README.md',
          improvementTokens: [
            'eval_suite_coverage',
            'failure_token_traceability',
          ],
          owner: domainId,
        }),
        authority_boundary: capabilityAuthorityBoundary(),
      },
    ],
    resolver_index: {
      stage_prompt_refs: [`${CAPABILITY_MAP_REF}#/capabilities/0`],
      professional_skill_refs: [`${CAPABILITY_MAP_REF}#/capabilities/1`],
      tool_connector_refs: [`${CAPABILITY_MAP_REF}#/capabilities/2`],
      knowledge_pack_refs: [`${CAPABILITY_MAP_REF}#/capabilities/3`],
      quality_gate_refs: [`${CAPABILITY_MAP_REF}#/capabilities/4`],
      eval_suite_refs: [`${CAPABILITY_MAP_REF}#/capabilities/5`],
    },
    authority_boundary: {
      ...capabilityAuthorityBoundary(),
      map_is_resolver_index_only: true,
      map_can_be_used_as_domain_truth: false,
    },
    marker: SCAFFOLD_MARKER,
  };
}
