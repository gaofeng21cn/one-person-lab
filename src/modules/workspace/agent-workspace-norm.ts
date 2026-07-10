import type { AgentWorkspaceNormContract } from '../../kernel/types.ts';
import {
  OPL_WORKSPACE_AGENT_PROFILES,
  type WorkspaceAgentId,
} from './workspace-agent-defaults.ts';
import {
  expectedDomainTopologyProfile,
  profileFromTopologyContract,
} from './workspace-topology.ts';

export const AGENT_WORKSPACE_NORM_CONTRACT_REF =
  'contracts/opl-framework/agent-workspace-norm-contract.json';

export type WorkspaceNormProjectionInput = {
  contract: AgentWorkspaceNormContract;
  agentId?: WorkspaceAgentId | string | null;
};

function domainProfile(agentId: string | null | undefined) {
  if (!agentId) {
    return null;
  }
  const agent = OPL_WORKSPACE_AGENT_PROFILES.find((entry) => entry.agent_id === agentId);
  if (!agent) {
    return null;
  }
  const profile = profileFromTopologyContract(agent.default_profile_id);
  return expectedDomainTopologyProfile({
    agent,
    profileId: agent.default_profile_id,
    profile,
  });
}

export function buildAgentWorkspaceNormProjection(input: WorkspaceNormProjectionInput) {
  return {
    surface_kind: 'opl_agent_workspace_norm_projection',
    owner: 'one-person-lab',
    norm_id: input.contract.norm_id,
    version: input.contract.version,
    contract_ref: AGENT_WORKSPACE_NORM_CONTRACT_REF,
    supported_agents: input.contract.supported_agents,
    agent_id: input.agentId ?? null,
    domain_topology_profile: domainProfile(input.agentId),
    default_workspace_precondition: input.contract.default_workspace_precondition,
    explicit_initialization: input.contract.explicit_initialization,
    descriptor_delegates: input.contract.descriptor_delegates,
    topology_contract: input.contract.topology_contract,
    user_inspection: input.contract.user_inspection,
    registry_policy: input.contract.registry_policy,
    runtime_state_boundary: input.contract.runtime_state_boundary,
    authority_boundary: input.contract.authority_boundary,
    workspace_governance_policy: input.contract.workspace_governance_policy,
    workspace_diagnostic_policy: input.contract.workspace_diagnostic_policy,
    conformance_policy: input.contract.conformance_policy,
  };
}

export function buildAgentWorkspaceNormChecks(contract: AgentWorkspaceNormContract) {
  const precondition = contract.default_workspace_precondition;
  const explicitInit = contract.explicit_initialization;
  const delegates = contract.descriptor_delegates;
  const userInspection = contract.user_inspection;
  const registry = contract.registry_policy;
  const runtime = contract.runtime_state_boundary;
  const authority = contract.authority_boundary;
  const topology = contract.topology_contract;

  const blockers = [
    precondition.action_id === 'opl_workspace_ensure' ? null : 'workspace_ensure_action_id_drift',
    precondition.command === 'opl workspace ensure' ? null : 'workspace_ensure_command_drift',
    precondition.app_action_id === 'workspace_ensure' ? null : 'workspace_ensure_app_action_drift',
    precondition.default_entry_for_agents === true ? null : 'workspace_ensure_not_default_precondition',
    precondition.must_run_before_domain_task_when_no_active_binding === true
      ? null
      : 'workspace_ensure_missing_task_precondition_gate',
    explicitInit.command === 'opl workspace init' ? null : 'workspace_init_command_drift',
    explicitInit.default_entry_for_agents === false ? null : 'workspace_init_must_remain_explicit',
    delegates.mcp.tool_name === 'opl_workspace_ensure' ? null : 'workspace_ensure_mcp_tool_drift',
    delegates.mcp.execution === 'delegate_to_opl_cli' ? null : 'workspace_ensure_mcp_delegate_drift',
    delegates.mcp.delegates_to_action_id === 'opl_workspace_ensure'
      ? null
      : 'workspace_ensure_mcp_action_delegate_drift',
    delegates.mcp.descriptor_only === true ? null : 'workspace_ensure_mcp_must_be_descriptor_only',
    delegates.mcp.public_runtime === false ? null : 'workspace_ensure_mcp_public_runtime_overclaim',
    delegates.skill.intent === 'ensure_opl_workspace' ? null : 'workspace_ensure_skill_intent_drift',
    delegates.skill.command_contract_id === 'opl_workspace_ensure'
      ? null
      : 'workspace_ensure_skill_contract_drift',
    delegates.skill.delegates_to_action_id === 'opl_workspace_ensure'
      ? null
      : 'workspace_ensure_skill_action_delegate_drift',
    delegates.skill.descriptor_only === true ? null : 'workspace_ensure_skill_must_be_descriptor_only',
    delegates.skill.public_runtime === false ? null : 'workspace_ensure_skill_public_runtime_overclaim',
    delegates.openai.tool_name === 'opl_workspace_ensure' ? null : 'workspace_ensure_openai_tool_drift',
    delegates.openai.delegates_to_action_id === 'opl_workspace_ensure'
      ? null
      : 'workspace_ensure_openai_action_delegate_drift',
    delegates.openai.descriptor_only === true ? null : 'workspace_ensure_openai_must_be_descriptor_only',
    delegates.openai.public_runtime === false ? null : 'workspace_ensure_openai_public_runtime_overclaim',
    delegates.ai_sdk.tool_name === 'oplWorkspaceEnsure' ? null : 'workspace_ensure_ai_sdk_tool_drift',
    delegates.ai_sdk.delegates_to_action_id === 'opl_workspace_ensure'
      ? null
      : 'workspace_ensure_ai_sdk_action_delegate_drift',
    delegates.ai_sdk.descriptor_only === true ? null : 'workspace_ensure_ai_sdk_must_be_descriptor_only',
    delegates.ai_sdk.public_runtime === false ? null : 'workspace_ensure_ai_sdk_public_runtime_overclaim',
    topology.profile_id === 'opl.workspace_topology_profile.v1' ? null : 'workspace_topology_profile_id_drift',
    topology.canonical_project_collection_role === 'project_units'
      ? null
      : 'workspace_project_collection_role_drift',
    topology.canonical_project_unit_semantics.project_collection_role === 'project_units'
      ? null
      : 'workspace_project_unit_semantics_drift',
    topology.default_project_collection_path === 'projects'
      ? null
      : 'workspace_default_project_collection_path_drift',
    topology.project_stage_outputs_root === 'artifacts/stage_outputs'
      ? null
      : 'workspace_stage_outputs_root_drift',
    topology.stage_output_root_protocol.root === 'artifacts/stage_outputs'
      ? null
      : 'workspace_stage_output_protocol_root_drift',
    topology.stage_output_root_protocol.stage_folder_unit === 'stage_artifact_unit'
      ? null
      : 'workspace_stage_folder_unit_drift',
    topology.stage_output_root_protocol.required_stage_folder_shape.join('/') === 'inputs/outputs/review/receipts/handoff/stage_manifest.json'
      ? null
      : 'workspace_stage_folder_shape_drift',
    topology.series_capable_one_off_skeleton === true ? null : 'workspace_one_off_series_capability_missing',
    userInspection.ordinary_user_default_surface === 'workspace_local_project_stage_outputs'
      ? null
      : 'workspace_user_inspection_surface_drift',
    userInspection.project_stage_outputs_pattern === '<project-root>/artifacts/stage_outputs/<stage-id>/'
      ? null
      : 'workspace_user_stage_outputs_pattern_drift',
    userInspection.runtime_state_is_default_user_surface === false
      ? null
      : 'workspace_runtime_state_must_not_be_default_user_surface',
    registry.writes_opl_workspace_registry === true ? null : 'workspace_registry_write_not_opl_owned',
    registry.domain_repo_can_write_opl_registry === false ? null : 'domain_repo_must_not_write_opl_registry',
    runtime.runtime_state_can_be_canonical_project_root === false
      ? null
      : 'runtime_state_can_be_canonical_project_root_overclaim',
    runtime.runtime_state_can_close_stage === false ? null : 'runtime_state_close_stage_overclaim',
    runtime.runtime_state_can_replace_owner_receipt_or_typed_blocker === false
      ? null
      : 'runtime_state_owner_answer_overclaim',
    authority.opl_can_write_domain_truth === false ? null : 'workspace_authority_boundary_overclaim',
    authority.opl_can_mutate_artifact_body === false ? null : 'workspace_artifact_body_overclaim',
    authority.opl_can_create_owner_receipt === false ? null : 'workspace_owner_receipt_overclaim',
    authority.opl_can_create_typed_blocker === false ? null : 'workspace_typed_blocker_overclaim',
    authority.opl_can_authorize_quality_or_export === false ? null : 'workspace_quality_export_overclaim',
    authority.conformance_pass_counts_as_domain_ready === false
      ? null
      : 'workspace_conformance_domain_ready_overclaim',
  ].filter((entry): entry is string => Boolean(entry));

  return {
    surface_kind: 'opl_agent_workspace_norm_checks',
    owner: 'one-person-lab',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_ref: AGENT_WORKSPACE_NORM_CONTRACT_REF,
    norm_id: contract.norm_id,
    default_precondition_command: precondition.command,
    app_action_id: precondition.app_action_id,
    initializer_command: explicitInit.command,
    descriptor_delegate_tool: delegates.mcp.tool_name,
    descriptor_delegate_is_mcp_runtime: delegates.mcp.public_runtime,
    descriptor_delegate_action_id: delegates.mcp.delegates_to_action_id,
    descriptor_delegate_boundaries: {
      mcp_descriptor_only: delegates.mcp.descriptor_only,
      skill_descriptor_only: delegates.skill.descriptor_only,
      openai_descriptor_only: delegates.openai.descriptor_only,
      ai_sdk_descriptor_only: delegates.ai_sdk.descriptor_only,
      mcp_public_runtime: delegates.mcp.public_runtime,
      skill_public_runtime: delegates.skill.public_runtime,
      openai_public_runtime: delegates.openai.public_runtime,
      ai_sdk_public_runtime: delegates.ai_sdk.public_runtime,
    },
    canonical_project_collection_role: topology.canonical_project_collection_role,
    canonical_project_unit_semantics: topology.canonical_project_unit_semantics,
    stage_output_root_protocol: topology.stage_output_root_protocol,
    user_default_surface: userInspection.ordinary_user_default_surface,
    project_stage_outputs_pattern: userInspection.project_stage_outputs_pattern,
    canonical_user_inspection_roots: userInspection.canonical_user_inspection_roots,
    runtime_state_is_default_user_surface: userInspection.runtime_state_is_default_user_surface,
    writes_opl_workspace_registry: registry.writes_opl_workspace_registry,
    domain_repo_can_write_opl_registry: registry.domain_repo_can_write_opl_registry,
    conformance_pass_counts_as_domain_ready: authority.conformance_pass_counts_as_domain_ready,
    blockers,
  };
}
