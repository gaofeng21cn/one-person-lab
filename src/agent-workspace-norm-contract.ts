import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from './contract-validation.ts';
import type { AgentWorkspaceNormContract } from './types.ts';

function requireRecord(value: unknown, field: string, filePath: string) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must be an object.`,
      { file: filePath, field },
    );
  }
  return value;
}

function requireSection(value: Record<string, unknown>, field: string, filePath: string) {
  return requireRecord(value[field], field, filePath);
}

function stringField(value: Record<string, unknown>, field: string, filePath: string) {
  return expectString(value[field], field, filePath);
}

function stringArrayField(value: Record<string, unknown>, field: string, filePath: string) {
  return expectStringArray(value[field], field, filePath);
}

function booleanField(value: Record<string, unknown>, field: string, filePath: string) {
  return expectBoolean(value[field], field, filePath);
}

function validateDelegateSection(
  section: Record<string, unknown>,
  filePath: string,
): AgentWorkspaceNormContract['descriptor_delegates'] {
  const mcp = requireSection(section, 'mcp', filePath);
  const skill = requireSection(section, 'skill', filePath);
  const openai = requireSection(section, 'openai', filePath);
  const aiSdk = requireSection(section, 'ai_sdk', filePath);
  return {
    mcp: {
      tool_name: stringField(mcp, 'tool_name', filePath),
      execution: stringField(mcp, 'execution', filePath),
      delegates_to_action_id: stringField(mcp, 'delegates_to_action_id', filePath),
      descriptor_only: booleanField(mcp, 'descriptor_only', filePath),
      public_runtime: booleanField(mcp, 'public_runtime', filePath),
    },
    skill: {
      intent: stringField(skill, 'intent', filePath),
      command_contract_id: stringField(skill, 'command_contract_id', filePath),
      delegates_to_action_id: stringField(skill, 'delegates_to_action_id', filePath),
      descriptor_only: booleanField(skill, 'descriptor_only', filePath),
      public_runtime: booleanField(skill, 'public_runtime', filePath),
    },
    openai: {
      tool_name: stringField(openai, 'tool_name', filePath),
      delegates_to_action_id: stringField(openai, 'delegates_to_action_id', filePath),
      descriptor_only: booleanField(openai, 'descriptor_only', filePath),
      public_runtime: booleanField(openai, 'public_runtime', filePath),
    },
    ai_sdk: {
      tool_name: stringField(aiSdk, 'tool_name', filePath),
      delegates_to_action_id: stringField(aiSdk, 'delegates_to_action_id', filePath),
      descriptor_only: booleanField(aiSdk, 'descriptor_only', filePath),
      public_runtime: booleanField(aiSdk, 'public_runtime', filePath),
    },
  };
}

function validateCanonicalProjectUnitSemantics(section: Record<string, unknown>, filePath: string) {
  const masStudiesBoundary = requireSection(section, 'mas_studies_boundary', filePath);
  return {
    workspace_unit: stringField(section, 'workspace_unit', filePath),
    project_collection_role: stringField(section, 'project_collection_role', filePath),
    project_unit_kind: stringField(section, 'project_unit_kind', filePath),
    stage_artifact_unit: stringField(section, 'stage_artifact_unit', filePath),
    owner_answer_unit: stringField(section, 'owner_answer_unit', filePath),
    mas_studies_boundary: {
      project_collection_path: stringField(masStudiesBoundary, 'project_collection_path', filePath),
      alias_role: stringField(masStudiesBoundary, 'alias_role', filePath),
      canonical_role: stringField(masStudiesBoundary, 'canonical_role', filePath),
      canonical_project_unit_kind: stringField(masStudiesBoundary, 'canonical_project_unit_kind', filePath),
    },
  };
}

function validateStageOutputRootProtocol(section: Record<string, unknown>, filePath: string) {
  return {
    root: stringField(section, 'root', filePath),
    stage_folder_unit: stringField(section, 'stage_folder_unit', filePath),
    stage_outputs_index_file: stringField(section, 'stage_outputs_index_file', filePath),
    current_stage_pointer_file: stringField(section, 'current_stage_pointer_file', filePath),
    stage_lifecycle_model: stringArrayField(section, 'stage_lifecycle_model', filePath),
    required_stage_folder_shape: stringArrayField(section, 'required_stage_folder_shape', filePath),
  };
}

function validateDomainProfiles(
  section: Record<string, unknown>,
  supportedAgents: string[],
  filePath: string,
) {
  const profiles: AgentWorkspaceNormContract['domain_topology_profiles'] = {};
  for (const agentId of supportedAgents) {
    const profile = requireSection(section, agentId, filePath);
    profiles[agentId] = {
      profile: stringField(profile, 'profile', filePath),
      workspace_mode: stringField(profile, 'workspace_mode', filePath),
      project_kind: stringField(profile, 'project_kind', filePath),
      project_collection_path: stringField(profile, 'project_collection_path', filePath),
      canonical_project_collection_role: stringField(profile, 'canonical_project_collection_role', filePath),
      project_collection_alias_role: stringField(profile, 'project_collection_alias_role', filePath),
      project_collection_display_label: stringField(profile, 'project_collection_display_label', filePath),
      project_semantic_aliases: stringArrayField(profile, 'project_semantic_aliases', filePath),
      user_inspection_roots: stringArrayField(profile, 'user_inspection_roots', filePath),
      shared_resource_roots: stringArrayField(profile, 'shared_resource_roots', filePath),
    };
  }
  return profiles;
}

function assertExactString(
  value: string,
  expected: string,
  field: string,
  filePath: string,
) {
  if (value !== expected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Agent workspace norm field "${field}" must remain "${expected}".`,
      { file: filePath, field, expected, actual: value },
    );
  }
}

function assertExactBoolean(
  value: boolean,
  expected: boolean,
  field: string,
  filePath: string,
) {
  if (value !== expected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Agent workspace norm field "${field}" must remain ${expected}.`,
      { file: filePath, field, expected, actual: value },
    );
  }
}

function assertExactStringArray(
  value: string[],
  expected: string[],
  field: string,
  filePath: string,
) {
  const matches = value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
  if (!matches) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Agent workspace norm field "${field}" must remain the canonical ordered array.`,
      { file: filePath, field, expected, actual: value },
    );
  }
}

function assertDomainProfile(
  contract: AgentWorkspaceNormContract,
  agentId: string,
  expected: AgentWorkspaceNormContract['domain_topology_profiles'][string],
  filePath: string,
) {
  const profile = contract.domain_topology_profiles[agentId];
  assertExactString(profile.profile, expected.profile, `${agentId}.profile`, filePath);
  assertExactString(profile.workspace_mode, expected.workspace_mode, `${agentId}.workspace_mode`, filePath);
  assertExactString(profile.project_kind, expected.project_kind, `${agentId}.project_kind`, filePath);
  assertExactString(
    profile.project_collection_path,
    expected.project_collection_path,
    `${agentId}.project_collection_path`,
    filePath,
  );
  assertExactString(
    profile.canonical_project_collection_role,
    expected.canonical_project_collection_role,
    `${agentId}.canonical_project_collection_role`,
    filePath,
  );
  assertExactString(
    profile.project_collection_alias_role,
    expected.project_collection_alias_role,
    `${agentId}.project_collection_alias_role`,
    filePath,
  );
  assertExactString(
    profile.project_collection_display_label,
    expected.project_collection_display_label,
    `${agentId}.project_collection_display_label`,
    filePath,
  );
  assertExactStringArray(
    profile.project_semantic_aliases,
    expected.project_semantic_aliases,
    `${agentId}.project_semantic_aliases`,
    filePath,
  );
  assertExactStringArray(
    profile.user_inspection_roots,
    expected.user_inspection_roots,
    `${agentId}.user_inspection_roots`,
    filePath,
  );
  assertExactStringArray(
    profile.shared_resource_roots,
    expected.shared_resource_roots,
    `${agentId}.shared_resource_roots`,
    filePath,
  );
}

function validateAgentWorkspaceNormSemantics(
  filePath: string,
  contract: AgentWorkspaceNormContract,
) {
  assertExactString(contract.surface_kind, 'opl_agent_workspace_norm_contract', 'surface_kind', filePath);
  assertExactString(contract.version, 'agent-workspace-norm.v1', 'version', filePath);
  assertExactString(contract.norm_id, 'opl.agent_workspace_norm.v1', 'norm_id', filePath);
  assertExactString(contract.owner, 'one-person-lab', 'owner', filePath);
  assertExactStringArray(contract.supported_agents, ['mas', 'mag', 'rca', 'oma'], 'supported_agents', filePath);

  const precondition = contract.default_workspace_precondition;
  assertExactString(precondition.action_id, 'opl_workspace_ensure', 'default_workspace_precondition.action_id', filePath);
  assertExactString(precondition.command, 'opl workspace ensure', 'default_workspace_precondition.command', filePath);
  assertExactString(precondition.app_action_id, 'workspace_ensure', 'default_workspace_precondition.app_action_id', filePath);
  assertExactStringArray(precondition.required_inputs, ['agent_id'], 'default_workspace_precondition.required_inputs', filePath);
  assertExactStringArray(
    precondition.optional_inputs,
    ['workspace_path_or_workspace_root', 'workspace_id', 'project_id', 'mode', 'title', 'dry_run', 'force', 'bind'],
    'default_workspace_precondition.optional_inputs',
    filePath,
  );
  assertExactBoolean(
    precondition.must_run_before_domain_task_when_no_active_binding,
    true,
    'default_workspace_precondition.must_run_before_domain_task_when_no_active_binding',
    filePath,
  );
  assertExactBoolean(precondition.reuse_active_binding_first, true, 'default_workspace_precondition.reuse_active_binding_first', filePath);
  assertExactBoolean(precondition.initialize_missing_workspace, true, 'default_workspace_precondition.initialize_missing_workspace', filePath);
  assertExactBoolean(
    precondition.append_missing_project_in_compatible_series_or_portfolio,
    true,
    'default_workspace_precondition.append_missing_project_in_compatible_series_or_portfolio',
    filePath,
  );
  assertExactBoolean(precondition.default_entry_for_agents, true, 'default_workspace_precondition.default_entry_for_agents', filePath);

  const explicitInit = contract.explicit_initialization;
  assertExactString(explicitInit.command, 'opl workspace init', 'explicit_initialization.command', filePath);
  assertExactString(explicitInit.app_action_id, 'workspace_initialize', 'explicit_initialization.app_action_id', filePath);
  assertExactString(explicitInit.role, 'explicit_initialization_or_operator_override', 'explicit_initialization.role', filePath);
  assertExactBoolean(explicitInit.default_entry_for_agents, false, 'explicit_initialization.default_entry_for_agents', filePath);

  const delegates = contract.descriptor_delegates;
  assertExactString(delegates.mcp.tool_name, 'opl_workspace_ensure', 'descriptor_delegates.mcp.tool_name', filePath);
  assertExactString(delegates.mcp.execution, 'delegate_to_opl_cli', 'descriptor_delegates.mcp.execution', filePath);
  assertExactString(delegates.mcp.delegates_to_action_id, 'opl_workspace_ensure', 'descriptor_delegates.mcp.delegates_to_action_id', filePath);
  assertExactBoolean(delegates.mcp.descriptor_only, true, 'descriptor_delegates.mcp.descriptor_only', filePath);
  assertExactBoolean(delegates.mcp.public_runtime, false, 'descriptor_delegates.mcp.public_runtime', filePath);
  assertExactString(delegates.skill.intent, 'ensure_opl_workspace', 'descriptor_delegates.skill.intent', filePath);
  assertExactString(delegates.skill.command_contract_id, 'opl_workspace_ensure', 'descriptor_delegates.skill.command_contract_id', filePath);
  assertExactString(delegates.skill.delegates_to_action_id, 'opl_workspace_ensure', 'descriptor_delegates.skill.delegates_to_action_id', filePath);
  assertExactBoolean(delegates.skill.descriptor_only, true, 'descriptor_delegates.skill.descriptor_only', filePath);
  assertExactBoolean(delegates.skill.public_runtime, false, 'descriptor_delegates.skill.public_runtime', filePath);
  assertExactString(delegates.openai.tool_name, 'opl_workspace_ensure', 'descriptor_delegates.openai.tool_name', filePath);
  assertExactString(delegates.openai.delegates_to_action_id, 'opl_workspace_ensure', 'descriptor_delegates.openai.delegates_to_action_id', filePath);
  assertExactBoolean(delegates.openai.descriptor_only, true, 'descriptor_delegates.openai.descriptor_only', filePath);
  assertExactBoolean(delegates.openai.public_runtime, false, 'descriptor_delegates.openai.public_runtime', filePath);
  assertExactString(delegates.ai_sdk.tool_name, 'oplWorkspaceEnsure', 'descriptor_delegates.ai_sdk.tool_name', filePath);
  assertExactString(delegates.ai_sdk.delegates_to_action_id, 'opl_workspace_ensure', 'descriptor_delegates.ai_sdk.delegates_to_action_id', filePath);
  assertExactBoolean(delegates.ai_sdk.descriptor_only, true, 'descriptor_delegates.ai_sdk.descriptor_only', filePath);
  assertExactBoolean(delegates.ai_sdk.public_runtime, false, 'descriptor_delegates.ai_sdk.public_runtime', filePath);

  const topology = contract.topology_contract;
  assertExactString(
    topology.contract_ref,
    'contracts/opl-framework/workspace-topology-profile.schema.json',
    'topology_contract.contract_ref',
    filePath,
  );
  assertExactString(topology.profile_id, 'opl.workspace_topology_profile.v1', 'topology_contract.profile_id', filePath);
  assertExactStringArray(
    topology.topology_model,
    ['workspace_group', 'project_unit', 'stage_artifact_unit', 'owner_receipt_or_typed_blocker'],
    'topology_contract.topology_model',
    filePath,
  );
  assertExactString(topology.canonical_project_collection_role, 'project_units', 'topology_contract.canonical_project_collection_role', filePath);
  assertExactString(topology.canonical_project_unit_semantics.workspace_unit, 'workspace_group', 'topology_contract.canonical_project_unit_semantics.workspace_unit', filePath);
  assertExactString(topology.canonical_project_unit_semantics.project_collection_role, 'project_units', 'topology_contract.canonical_project_unit_semantics.project_collection_role', filePath);
  assertExactString(topology.canonical_project_unit_semantics.project_unit_kind, 'project_unit', 'topology_contract.canonical_project_unit_semantics.project_unit_kind', filePath);
  assertExactString(topology.canonical_project_unit_semantics.stage_artifact_unit, 'stage_artifact_unit', 'topology_contract.canonical_project_unit_semantics.stage_artifact_unit', filePath);
  assertExactString(topology.canonical_project_unit_semantics.owner_answer_unit, 'owner_receipt_or_typed_blocker', 'topology_contract.canonical_project_unit_semantics.owner_answer_unit', filePath);
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.project_collection_path, 'studies', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.project_collection_path', filePath);
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.alias_role, 'display_domain_alias', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.alias_role', filePath);
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.canonical_role, 'project_units', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.canonical_role', filePath);
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.canonical_project_unit_kind, 'project_unit', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.canonical_project_unit_kind', filePath);
  assertExactString(topology.project_stage_outputs_root, 'artifacts/stage_outputs', 'topology_contract.project_stage_outputs_root', filePath);
  assertExactString(topology.stage_output_root_protocol.root, 'artifacts/stage_outputs', 'topology_contract.stage_output_root_protocol.root', filePath);
  assertExactString(topology.stage_output_root_protocol.stage_folder_unit, 'stage_artifact_unit', 'topology_contract.stage_output_root_protocol.stage_folder_unit', filePath);
  assertExactString(
    topology.stage_output_root_protocol.stage_outputs_index_file,
    'stage_outputs_index.json',
    'topology_contract.stage_output_root_protocol.stage_outputs_index_file',
    filePath,
  );
  assertExactString(
    topology.stage_output_root_protocol.current_stage_pointer_file,
    'current_stage.json',
    'topology_contract.stage_output_root_protocol.current_stage_pointer_file',
    filePath,
  );
  assertExactStringArray(
    topology.stage_output_root_protocol.stage_lifecycle_model,
    ['open', 'active', 'completed', 'blocked', 'superseded', 'archived'],
    'topology_contract.stage_output_root_protocol.stage_lifecycle_model',
    filePath,
  );
  assertExactStringArray(
    topology.stage_output_root_protocol.required_stage_folder_shape,
    ['inputs', 'outputs', 'review', 'receipts', 'handoff', 'stage_manifest.json'],
    'topology_contract.stage_output_root_protocol.required_stage_folder_shape',
    filePath,
  );
  assertExactString(topology.default_project_collection_path, 'deliverables', 'topology_contract.default_project_collection_path', filePath);
  assertExactStringArray(topology.workspace_modes, ['one_off', 'series', 'portfolio'], 'topology_contract.workspace_modes', filePath);
  assertExactBoolean(topology.series_capable_one_off_skeleton, true, 'topology_contract.series_capable_one_off_skeleton', filePath);

  assertDomainProfile(contract, 'mas', {
    profile: 'mas_portfolio',
    workspace_mode: 'portfolio',
    project_kind: 'study',
    project_collection_path: 'studies',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'display_domain_alias',
    project_collection_display_label: 'studies',
    project_semantic_aliases: ['study', 'studies'],
    user_inspection_roots: ['studies/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['data', 'literature', 'memory', 'shared/sources'],
  }, filePath);
  assertDomainProfile(contract, 'mag', {
    profile: 'one_off',
    workspace_mode: 'one_off',
    project_kind: 'grant_project',
    project_collection_path: 'deliverables',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'canonical_display_label',
    project_collection_display_label: 'deliverables',
    project_semantic_aliases: ['grant_project', 'deliverable'],
    user_inspection_roots: ['deliverables/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
  }, filePath);
  assertDomainProfile(contract, 'rca', {
    profile: 'rca_series',
    workspace_mode: 'series',
    project_kind: 'slide_deck',
    project_collection_path: 'deliverables',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'canonical_display_label',
    project_collection_display_label: 'deliverables',
    project_semantic_aliases: ['slide_deck', 'deck', 'deliverable'],
    user_inspection_roots: ['deliverables/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: [
      'shared/sources',
      'shared/brand',
      'shared/visual_memory',
      'shared/style_system',
      'shared/material_inventory',
    ],
  }, filePath);
  assertDomainProfile(contract, 'oma', {
    profile: 'one_off',
    workspace_mode: 'one_off',
    project_kind: 'agent_capability',
    project_collection_path: 'deliverables',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'canonical_display_label',
    project_collection_display_label: 'deliverables',
    project_semantic_aliases: ['agent_capability', 'deliverable'],
    user_inspection_roots: ['deliverables/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
  }, filePath);

  const inspection = contract.user_inspection;
  assertExactString(inspection.ordinary_user_default_surface, 'workspace_local_project_stage_outputs', 'user_inspection.ordinary_user_default_surface', filePath);
  assertExactString(inspection.project_stage_outputs_pattern, '<project-root>/artifacts/stage_outputs/<stage-id>/', 'user_inspection.project_stage_outputs_pattern', filePath);
  assertExactString(inspection.workspace_index_file, 'workspace_index.json', 'user_inspection.workspace_index_file', filePath);
  assertExactString(inspection.workspace_config_file, 'workspace.yaml', 'user_inspection.workspace_config_file', filePath);
  assertExactString(inspection.workspace_inspection_file, 'workspace_inspection.json', 'user_inspection.workspace_inspection_file', filePath);
  assertExactString(inspection.workspace_resource_inventory_file, 'workspace_resource_inventory.json', 'user_inspection.workspace_resource_inventory_file', filePath);
  assertExactString(inspection.stage_outputs_index_file, 'stage_outputs_index.json', 'user_inspection.stage_outputs_index_file', filePath);
  assertExactString(inspection.current_stage_pointer_file, 'current_stage.json', 'user_inspection.current_stage_pointer_file', filePath);
  assertExactStringArray(
    inspection.canonical_user_inspection_roots,
    [
      '<project-root>/artifacts/stage_outputs',
      '<project-root>/artifacts/stage_outputs/<stage-id>/inputs',
      '<project-root>/artifacts/stage_outputs/<stage-id>/outputs',
      '<project-root>/artifacts/stage_outputs/<stage-id>/review',
      '<project-root>/artifacts/stage_outputs/<stage-id>/receipts',
      '<project-root>/artifacts/stage_outputs/<stage-id>/handoff',
      '<project-root>/artifacts/stage_outputs/<stage-id>/stage_manifest.json',
    ],
    'user_inspection.canonical_user_inspection_roots',
    filePath,
  );
  assertExactBoolean(inspection.runtime_state_is_default_user_surface, false, 'user_inspection.runtime_state_is_default_user_surface', filePath);
  assertExactBoolean(inspection.product_views_are_stage_outputs, false, 'user_inspection.product_views_are_stage_outputs', filePath);

  const registry = contract.registry_policy;
  assertExactBoolean(registry.writes_opl_workspace_registry, true, 'registry_policy.writes_opl_workspace_registry', filePath);
  assertExactString(registry.binding_owner, 'one-person-lab', 'registry_policy.binding_owner', filePath);
  assertExactBoolean(registry.domain_repo_can_write_opl_registry, false, 'registry_policy.domain_repo_can_write_opl_registry', filePath);

  const runtime = contract.runtime_state_boundary;
  assertExactString(runtime.role, 'provider_backing_provenance_restore_audit', 'runtime_state_boundary.role', filePath);
  assertExactBoolean(runtime.runtime_state_can_be_canonical_project_root, false, 'runtime_state_boundary.runtime_state_can_be_canonical_project_root', filePath);
  assertExactBoolean(runtime.runtime_state_can_close_stage, false, 'runtime_state_boundary.runtime_state_can_close_stage', filePath);
  assertExactBoolean(runtime.runtime_state_can_replace_owner_receipt_or_typed_blocker, false, 'runtime_state_boundary.runtime_state_can_replace_owner_receipt_or_typed_blocker', filePath);

  const authority = contract.authority_boundary;
  assertExactBoolean(authority.opl_can_define_topology_contract, true, 'authority_boundary.opl_can_define_topology_contract', filePath);
  assertExactBoolean(authority.opl_can_project_workspace_refs, true, 'authority_boundary.opl_can_project_workspace_refs', filePath);
  assertExactBoolean(authority.opl_can_write_domain_truth, false, 'authority_boundary.opl_can_write_domain_truth', filePath);
  assertExactBoolean(authority.opl_can_write_memory_body, false, 'authority_boundary.opl_can_write_memory_body', filePath);
  assertExactBoolean(authority.opl_can_mutate_artifact_body, false, 'authority_boundary.opl_can_mutate_artifact_body', filePath);
  assertExactBoolean(authority.opl_can_create_owner_receipt, false, 'authority_boundary.opl_can_create_owner_receipt', filePath);
  assertExactBoolean(authority.opl_can_create_typed_blocker, false, 'authority_boundary.opl_can_create_typed_blocker', filePath);
  assertExactBoolean(authority.opl_can_authorize_quality_or_export, false, 'authority_boundary.opl_can_authorize_quality_or_export', filePath);
  assertExactBoolean(authority.runtime_state_counts_as_user_default_surface, false, 'authority_boundary.runtime_state_counts_as_user_default_surface', filePath);
  assertExactBoolean(authority.conformance_pass_counts_as_domain_ready, false, 'authority_boundary.conformance_pass_counts_as_domain_ready', filePath);

  const conformance = contract.conformance_policy;
  assertExactBoolean(conformance.family_conformance_must_report_workspace_norm, true, 'conformance_policy.family_conformance_must_report_workspace_norm', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_is_structural_only, true, 'conformance_policy.workspace_norm_pass_is_structural_only', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_can_claim_domain_ready, false, 'conformance_policy.workspace_norm_pass_can_claim_domain_ready', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_can_claim_artifact_or_quality_ready, false, 'conformance_policy.workspace_norm_pass_can_claim_artifact_or_quality_ready', filePath);
  assertExactStringArray(
    conformance.blocked_reasons,
    [
      'agent_workspace_norm_missing',
      'workspace_ensure_not_default_precondition',
      'workspace_ensure_descriptor_delegate_drift',
      'workspace_user_inspection_surface_drift',
      'workspace_runtime_state_boundary_drift',
      'workspace_authority_boundary_overclaim',
    ],
    'conformance_policy.blocked_reasons',
    filePath,
  );
}

export function validateAgentWorkspaceNorm(
  filePath: string,
  value: unknown,
): AgentWorkspaceNormContract {
  const root = requireRecord(value, 'agent-workspace-norm-contract.json', filePath);
  const supportedAgents = stringArrayField(root, 'supported_agents', filePath);
  const defaultWorkspacePrecondition = requireSection(root, 'default_workspace_precondition', filePath);
  const explicitInitialization = requireSection(root, 'explicit_initialization', filePath);
  const descriptorDelegates = requireSection(root, 'descriptor_delegates', filePath);
  const topologyContract = requireSection(root, 'topology_contract', filePath);
  const domainTopologyProfiles = requireSection(root, 'domain_topology_profiles', filePath);
  const userInspection = requireSection(root, 'user_inspection', filePath);
  const registryPolicy = requireSection(root, 'registry_policy', filePath);
  const runtimeStateBoundary = requireSection(root, 'runtime_state_boundary', filePath);
  const authorityBoundary = requireSection(root, 'authority_boundary', filePath);
  const conformancePolicy = requireSection(root, 'conformance_policy', filePath);

  const contract: AgentWorkspaceNormContract = {
    surface_kind: stringField(root, 'surface_kind', filePath),
    version: stringField(root, 'version', filePath),
    norm_id: stringField(root, 'norm_id', filePath),
    owner: stringField(root, 'owner', filePath),
    scope: stringField(root, 'scope', filePath),
    machine_boundary: stringField(root, 'machine_boundary', filePath),
    supported_agents: supportedAgents,
    default_workspace_precondition: {
      action_id: stringField(defaultWorkspacePrecondition, 'action_id', filePath),
      command: stringField(defaultWorkspacePrecondition, 'command', filePath),
      app_action_id: stringField(defaultWorkspacePrecondition, 'app_action_id', filePath),
      required_inputs: stringArrayField(defaultWorkspacePrecondition, 'required_inputs', filePath),
      optional_inputs: stringArrayField(defaultWorkspacePrecondition, 'optional_inputs', filePath),
      must_run_before_domain_task_when_no_active_binding: booleanField(
        defaultWorkspacePrecondition,
        'must_run_before_domain_task_when_no_active_binding',
        filePath,
      ),
      reuse_active_binding_first: booleanField(defaultWorkspacePrecondition, 'reuse_active_binding_first', filePath),
      initialize_missing_workspace: booleanField(defaultWorkspacePrecondition, 'initialize_missing_workspace', filePath),
      append_missing_project_in_compatible_series_or_portfolio: booleanField(
        defaultWorkspacePrecondition,
        'append_missing_project_in_compatible_series_or_portfolio',
        filePath,
      ),
      default_entry_for_agents: booleanField(defaultWorkspacePrecondition, 'default_entry_for_agents', filePath),
    },
    explicit_initialization: {
      command: stringField(explicitInitialization, 'command', filePath),
      app_action_id: stringField(explicitInitialization, 'app_action_id', filePath),
      role: stringField(explicitInitialization, 'role', filePath),
      default_entry_for_agents: booleanField(explicitInitialization, 'default_entry_for_agents', filePath),
    },
    descriptor_delegates: validateDelegateSection(descriptorDelegates, filePath),
    topology_contract: {
      contract_ref: stringField(topologyContract, 'contract_ref', filePath),
      profile_id: stringField(topologyContract, 'profile_id', filePath),
      topology_model: stringArrayField(topologyContract, 'topology_model', filePath),
      canonical_project_collection_role: stringField(topologyContract, 'canonical_project_collection_role', filePath),
      canonical_project_unit_semantics: validateCanonicalProjectUnitSemantics(
        requireSection(topologyContract, 'canonical_project_unit_semantics', filePath),
        filePath,
      ),
      project_stage_outputs_root: stringField(topologyContract, 'project_stage_outputs_root', filePath),
      stage_output_root_protocol: validateStageOutputRootProtocol(
        requireSection(topologyContract, 'stage_output_root_protocol', filePath),
        filePath,
      ),
      default_project_collection_path: stringField(topologyContract, 'default_project_collection_path', filePath),
      workspace_modes: stringArrayField(topologyContract, 'workspace_modes', filePath),
      series_capable_one_off_skeleton: booleanField(topologyContract, 'series_capable_one_off_skeleton', filePath),
    },
    domain_topology_profiles: validateDomainProfiles(domainTopologyProfiles, supportedAgents, filePath),
    user_inspection: {
      ordinary_user_default_surface: stringField(userInspection, 'ordinary_user_default_surface', filePath),
      project_stage_outputs_pattern: stringField(userInspection, 'project_stage_outputs_pattern', filePath),
      workspace_index_file: stringField(userInspection, 'workspace_index_file', filePath),
      workspace_config_file: stringField(userInspection, 'workspace_config_file', filePath),
      workspace_inspection_file: stringField(userInspection, 'workspace_inspection_file', filePath),
      workspace_resource_inventory_file: stringField(userInspection, 'workspace_resource_inventory_file', filePath),
      stage_outputs_index_file: stringField(userInspection, 'stage_outputs_index_file', filePath),
      current_stage_pointer_file: stringField(userInspection, 'current_stage_pointer_file', filePath),
      canonical_user_inspection_roots: stringArrayField(userInspection, 'canonical_user_inspection_roots', filePath),
      runtime_state_is_default_user_surface: booleanField(
        userInspection,
        'runtime_state_is_default_user_surface',
        filePath,
      ),
      product_views_are_stage_outputs: booleanField(userInspection, 'product_views_are_stage_outputs', filePath),
    },
    registry_policy: {
      writes_opl_workspace_registry: booleanField(registryPolicy, 'writes_opl_workspace_registry', filePath),
      binding_owner: stringField(registryPolicy, 'binding_owner', filePath),
      domain_repo_can_write_opl_registry: booleanField(registryPolicy, 'domain_repo_can_write_opl_registry', filePath),
    },
    runtime_state_boundary: {
      role: stringField(runtimeStateBoundary, 'role', filePath),
      runtime_state_can_be_canonical_project_root: booleanField(
        runtimeStateBoundary,
        'runtime_state_can_be_canonical_project_root',
        filePath,
      ),
      runtime_state_can_close_stage: booleanField(runtimeStateBoundary, 'runtime_state_can_close_stage', filePath),
      runtime_state_can_replace_owner_receipt_or_typed_blocker: booleanField(
        runtimeStateBoundary,
        'runtime_state_can_replace_owner_receipt_or_typed_blocker',
        filePath,
      ),
    },
    authority_boundary: {
      opl_can_define_topology_contract: booleanField(authorityBoundary, 'opl_can_define_topology_contract', filePath),
      opl_can_project_workspace_refs: booleanField(authorityBoundary, 'opl_can_project_workspace_refs', filePath),
      opl_can_write_domain_truth: booleanField(authorityBoundary, 'opl_can_write_domain_truth', filePath),
      opl_can_write_memory_body: booleanField(authorityBoundary, 'opl_can_write_memory_body', filePath),
      opl_can_mutate_artifact_body: booleanField(authorityBoundary, 'opl_can_mutate_artifact_body', filePath),
      opl_can_create_owner_receipt: booleanField(authorityBoundary, 'opl_can_create_owner_receipt', filePath),
      opl_can_create_typed_blocker: booleanField(authorityBoundary, 'opl_can_create_typed_blocker', filePath),
      opl_can_authorize_quality_or_export: booleanField(authorityBoundary, 'opl_can_authorize_quality_or_export', filePath),
      runtime_state_counts_as_user_default_surface: booleanField(
        authorityBoundary,
        'runtime_state_counts_as_user_default_surface',
        filePath,
      ),
      conformance_pass_counts_as_domain_ready: booleanField(
        authorityBoundary,
        'conformance_pass_counts_as_domain_ready',
        filePath,
      ),
    },
    conformance_policy: {
      family_conformance_must_report_workspace_norm: booleanField(
        conformancePolicy,
        'family_conformance_must_report_workspace_norm',
        filePath,
      ),
      workspace_norm_pass_is_structural_only: booleanField(
        conformancePolicy,
        'workspace_norm_pass_is_structural_only',
        filePath,
      ),
      workspace_norm_pass_can_claim_domain_ready: booleanField(
        conformancePolicy,
        'workspace_norm_pass_can_claim_domain_ready',
        filePath,
      ),
      workspace_norm_pass_can_claim_artifact_or_quality_ready: booleanField(
        conformancePolicy,
        'workspace_norm_pass_can_claim_artifact_or_quality_ready',
        filePath,
      ),
      blocked_reasons: stringArrayField(conformancePolicy, 'blocked_reasons', filePath),
    },
  };
  validateAgentWorkspaceNormSemantics(filePath, contract);
  return contract;
}
