import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from '../../kernel/contract-validation.ts';
import type { AgentWorkspaceNormContract } from '../../kernel/types.ts';

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
      legacy_project_collection_path: stringField(masStudiesBoundary, 'legacy_project_collection_path', filePath),
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
      legacy_project_collection_aliases: stringArrayField(profile, 'legacy_project_collection_aliases', filePath),
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
  assertExactStringArray(contract.supported_agents, ['mas', 'mag', 'rca', 'oma', 'bookforge'], 'supported_agents', filePath);

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
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.project_collection_path, 'projects', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.project_collection_path', filePath);
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.legacy_project_collection_path, 'studies', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.legacy_project_collection_path', filePath);
  assertExactString(topology.canonical_project_unit_semantics.mas_studies_boundary.alias_role, 'legacy_display_domain_alias', 'topology_contract.canonical_project_unit_semantics.mas_studies_boundary.alias_role', filePath);
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
  assertExactString(topology.default_project_collection_path, 'projects', 'topology_contract.default_project_collection_path', filePath);
  assertExactStringArray(topology.legacy_project_collection_aliases, ['deliverables', 'studies'], 'topology_contract.legacy_project_collection_aliases', filePath);
  assertExactStringArray(topology.workspace_modes, ['one_off', 'series', 'portfolio'], 'topology_contract.workspace_modes', filePath);
  assertExactBoolean(topology.series_capable_one_off_skeleton, true, 'topology_contract.series_capable_one_off_skeleton', filePath);

  assertDomainProfile(contract, 'mas', {
    profile: 'mas_portfolio',
    workspace_mode: 'portfolio',
    project_kind: 'study',
    project_collection_path: 'projects',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'legacy_display_alias',
    project_collection_display_label: 'studies',
    project_semantic_aliases: ['study', 'studies'],
    legacy_project_collection_aliases: ['studies'],
    user_inspection_roots: ['projects/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['data', 'literature', 'memory', 'shared/sources'],
  }, filePath);
  assertDomainProfile(contract, 'mag', {
    profile: 'one_off',
    workspace_mode: 'one_off',
    project_kind: 'grant_project',
    project_collection_path: 'projects',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'legacy_display_alias',
    project_collection_display_label: 'deliverables',
    project_semantic_aliases: ['grant_project', 'deliverable'],
    legacy_project_collection_aliases: ['deliverables'],
    user_inspection_roots: ['projects/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
  }, filePath);
  assertDomainProfile(contract, 'rca', {
    profile: 'rca_series',
    workspace_mode: 'series',
    project_kind: 'slide_deck',
    project_collection_path: 'projects',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'legacy_display_alias',
    project_collection_display_label: 'deliverables',
    project_semantic_aliases: ['slide_deck', 'deck', 'deliverable'],
    legacy_project_collection_aliases: ['deliverables'],
    user_inspection_roots: ['projects/<project-id>/artifacts/stage_outputs'],
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
    project_collection_path: 'projects',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'legacy_display_alias',
    project_collection_display_label: 'deliverables',
    project_semantic_aliases: ['agent_capability', 'deliverable'],
    legacy_project_collection_aliases: ['deliverables'],
    user_inspection_roots: ['projects/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
  }, filePath);
  assertDomainProfile(contract, 'bookforge', {
    profile: 'one_off',
    workspace_mode: 'one_off',
    project_kind: 'book_project',
    project_collection_path: 'projects',
    canonical_project_collection_role: 'project_units',
    project_collection_alias_role: 'legacy_display_alias',
    project_collection_display_label: 'books',
    project_semantic_aliases: ['book_project', 'book'],
    legacy_project_collection_aliases: ['deliverables'],
    user_inspection_roots: ['projects/<project-id>/artifacts/stage_outputs'],
    shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
  }, filePath);

  const inspection = contract.user_inspection;
  assertExactString(inspection.ordinary_user_default_surface, 'workspace_local_project_stage_outputs', 'user_inspection.ordinary_user_default_surface', filePath);
  assertExactString(inspection.project_stage_outputs_pattern, '<project-root>/artifacts/stage_outputs/<stage-id>/', 'user_inspection.project_stage_outputs_pattern', filePath);
  assertExactString(inspection.workspace_index_file, 'workspace_index.json', 'user_inspection.workspace_index_file', filePath);
  assertExactString(inspection.workspace_config_file, 'workspace.yaml', 'user_inspection.workspace_config_file', filePath);
  assertExactString(inspection.canonical_generated_root, 'control/opl', 'user_inspection.canonical_generated_root', filePath);
  assertExactString(inspection.canonical_projection_root, 'control/opl/projections', 'user_inspection.canonical_projection_root', filePath);
  assertExactString(inspection.canonical_report_root, 'control/opl/reports', 'user_inspection.canonical_report_root', filePath);
  assertExactString(inspection.workspace_inspection_file, 'workspace_inspection.json', 'user_inspection.workspace_inspection_file', filePath);
  assertExactString(inspection.workspace_resource_inventory_file, 'workspace_resource_inventory.json', 'user_inspection.workspace_resource_inventory_file', filePath);
  assertExactString(inspection.workspace_report_file, 'workspace_report.json', 'user_inspection.workspace_report_file', filePath);
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

  const governance = contract.workspace_governance_policy;
  assertExactBoolean(governance.workspace_norm_projection_must_equal_contract_projection, true, 'workspace_governance_policy.workspace_norm_projection_must_equal_contract_projection', filePath);
  assertExactBoolean(governance.profile_binding_required, true, 'workspace_governance_policy.profile_binding_required', filePath);
  assertExactString(governance.profile_version, 'workspace-topology-profile.v2', 'workspace_governance_policy.profile_version', filePath);
  assertExactString(governance.profile_fingerprint, 'opl-workspace-topology-profile-v2-projects-stage-outputs', 'workspace_governance_policy.profile_fingerprint', filePath);
  assertExactBoolean(governance.topology_events_required, true, 'workspace_governance_policy.topology_events_required', filePath);
  assertExactString(governance.canonical_generated_projection_root, 'control/opl/projections', 'workspace_governance_policy.canonical_generated_projection_root', filePath);
  assertExactBoolean(governance.root_projection_files_are_compatibility_mirrors, true, 'workspace_governance_policy.root_projection_files_are_compatibility_mirrors', filePath);
  assertExactBoolean(governance.workspace_report_is_default_user_summary, true, 'workspace_governance_policy.workspace_report_is_default_user_summary', filePath);
  assertExactBoolean(
    governance.generated_projection_currentness_is_repairable_structural_finding,
    true,
    'workspace_governance_policy.generated_projection_currentness_is_repairable_structural_finding',
    filePath,
  );
  assertExactBoolean(
    governance.generated_projection_currentness_blocks_default_execution,
    false,
    'workspace_governance_policy.generated_projection_currentness_blocks_default_execution',
    filePath,
  );

  const diagnosticPolicy = contract.workspace_diagnostic_policy;
  assertExactString(diagnosticPolicy.surface_kind, 'opl_workspace_diagnostic_policy', 'workspace_diagnostic_policy.surface_kind', filePath);
  assertExactString(diagnosticPolicy.policy_id, 'opl.workspace_diagnostics.contract_light.v1', 'workspace_diagnostic_policy.policy_id', filePath);
  assertExactString(diagnosticPolicy.default_execution_blocks_on, 'hard_blockers_only', 'workspace_diagnostic_policy.default_execution_blocks_on', filePath);
  assertExactBoolean(
    diagnosticPolicy.repairable_findings_block_default_execution,
    false,
    'workspace_diagnostic_policy.repairable_findings_block_default_execution',
    filePath,
  );
  assertExactBoolean(
    diagnosticPolicy.advisory_warnings_block_default_execution,
    false,
    'workspace_diagnostic_policy.advisory_warnings_block_default_execution',
    filePath,
  );
  assertExactStringArray(
    diagnosticPolicy.hard_blocker_codes,
    [
      'workspace_path_required',
      'workspace_root_missing',
      'workspace_root_not_directory',
      'workspace_index_missing',
      'workspace_index_invalid_json',
      'workspace_index_shape_invalid',
      'agent_metadata_missing',
      'workspace_topology_profile_missing',
      'domain_topology_profile_drift',
      'project_collection_missing',
      'indexed_projects_missing',
      'indexed_project_shape_invalid',
      'indexed_project_root_missing',
      'indexed_stage_outputs_index_drift',
      'indexed_current_stage_pointer_drift',
      'authority_boundary_overclaim',
      'runtime_state_boundary_overclaim',
    ],
    'workspace_diagnostic_policy.hard_blocker_codes',
    filePath,
  );
  assertExactStringArray(
    diagnosticPolicy.repairable_finding_codes,
    [
      'workspace_config_missing',
      'canonical_topology_missing',
      'canonical_topology_drift',
      'display_labels_missing',
      'display_labels_drift',
      'shared_resources_missing',
      'shared_resources_drift',
      'shared_resource_root_missing',
      'shared_resource_manifest_missing',
      'shared_resource_manifest_drift',
      'generated_refs_missing',
      'workspace_norm_missing',
      'workspace_norm_drift',
      'workspace_norm_projection_drift',
      'profile_binding_missing',
      'profile_binding_drift',
      'topology_events_missing',
      'indexed_project_config_missing',
      'indexed_project_index_missing',
      'indexed_project_index_drift',
      'indexed_inputs_root_missing',
      'indexed_exports_root_missing',
      'indexed_packages_root_missing',
      'indexed_archive_root_missing',
      'indexed_stage_outputs_root_missing',
      'indexed_stage_outputs_manifest_missing',
      'indexed_stage_outputs_manifest_drift',
      'indexed_stage_outputs_index_missing',
      'indexed_current_stage_pointer_missing',
      'indexed_control_root_missing',
      'indexed_review_root_missing',
      'indexed_handoff_root_missing',
      'workspace_map_missing',
      'workspace_map_drift',
      'workspace_health_missing',
      'workspace_health_drift',
      'workspace_inspection_missing',
      'workspace_inspection_drift',
      'workspace_resource_inventory_missing',
      'workspace_resource_inventory_drift',
      'workspace_report_missing',
      'workspace_report_drift',
      'canonical_generated_projection_missing',
      'canonical_generated_projection_drift',
      'interface_projection_missing',
    ],
    'workspace_diagnostic_policy.repairable_finding_codes',
    filePath,
  );
  assertExactStringArray(
    diagnosticPolicy.advisory_warning_codes,
    [],
    'workspace_diagnostic_policy.advisory_warning_codes',
    filePath,
  );

  const lifecycle = contract.domain_workspace_lifecycle_policy;
  assertExactString(lifecycle.policy_ref, 'contracts/opl-framework/workspace-index.schema.json#/$defs/project/lifecycle', 'domain_workspace_lifecycle_policy.policy_ref', filePath);
  assertExactBoolean(lifecycle.domain_repo_can_own_generic_workspace_lifecycle, false, 'domain_workspace_lifecycle_policy.domain_repo_can_own_generic_workspace_lifecycle', filePath);
  assertExactBoolean(lifecycle.domain_repo_must_declare_locator_not_lifecycle, true, 'domain_workspace_lifecycle_policy.domain_repo_must_declare_locator_not_lifecycle', filePath);
  assertExactBoolean(lifecycle.opl_owns_lifecycle_projection, true, 'domain_workspace_lifecycle_policy.opl_owns_lifecycle_projection', filePath);
  assertExactBoolean(lifecycle.physical_delete_requires_domain_owner_receipt, true, 'domain_workspace_lifecycle_policy.physical_delete_requires_domain_owner_receipt', filePath);

  const conformance = contract.conformance_policy;
  assertExactBoolean(conformance.family_conformance_must_report_workspace_norm, true, 'conformance_policy.family_conformance_must_report_workspace_norm', filePath);
  assertExactString(conformance.workspace_norm_maturity_level, 'L4_structural_baseline', 'conformance_policy.workspace_norm_maturity_level', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_is_structural_only, true, 'conformance_policy.workspace_norm_pass_is_structural_only', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_can_claim_production_ready, false, 'conformance_policy.workspace_norm_pass_can_claim_production_ready', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_can_claim_domain_ready, false, 'conformance_policy.workspace_norm_pass_can_claim_domain_ready', filePath);
  assertExactBoolean(conformance.workspace_norm_pass_can_claim_artifact_or_quality_ready, false, 'conformance_policy.workspace_norm_pass_can_claim_artifact_or_quality_ready', filePath);
  assertExactStringArray(
    conformance.l5_evidence_required,
    ['long_soak', 'release', 'user_path', 'owner_acceptance'],
    'conformance_policy.l5_evidence_required',
    filePath,
  );
  assertExactStringArray(
    conformance.blocked_reasons,
    [
      'agent_workspace_norm_missing',
      'workspace_norm_projection_drift',
      'workspace_ensure_not_default_precondition',
      'workspace_ensure_descriptor_delegate_drift',
      'workspace_user_inspection_surface_drift',
      'workspace_runtime_state_boundary_drift',
      'workspace_authority_boundary_overclaim',
      'domain_generic_workspace_lifecycle_residue',
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
  const workspaceGovernancePolicy = requireSection(root, 'workspace_governance_policy', filePath);
  const workspaceDiagnosticPolicy = requireSection(root, 'workspace_diagnostic_policy', filePath);
  const domainWorkspaceLifecyclePolicy = requireSection(root, 'domain_workspace_lifecycle_policy', filePath);
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
      legacy_project_collection_aliases: stringArrayField(topologyContract, 'legacy_project_collection_aliases', filePath),
      workspace_modes: stringArrayField(topologyContract, 'workspace_modes', filePath),
      series_capable_one_off_skeleton: booleanField(topologyContract, 'series_capable_one_off_skeleton', filePath),
    },
    domain_topology_profiles: validateDomainProfiles(domainTopologyProfiles, supportedAgents, filePath),
    user_inspection: {
      ordinary_user_default_surface: stringField(userInspection, 'ordinary_user_default_surface', filePath),
      project_stage_outputs_pattern: stringField(userInspection, 'project_stage_outputs_pattern', filePath),
      workspace_index_file: stringField(userInspection, 'workspace_index_file', filePath),
      workspace_config_file: stringField(userInspection, 'workspace_config_file', filePath),
      canonical_generated_root: stringField(userInspection, 'canonical_generated_root', filePath),
      canonical_projection_root: stringField(userInspection, 'canonical_projection_root', filePath),
      canonical_report_root: stringField(userInspection, 'canonical_report_root', filePath),
      workspace_inspection_file: stringField(userInspection, 'workspace_inspection_file', filePath),
      workspace_resource_inventory_file: stringField(userInspection, 'workspace_resource_inventory_file', filePath),
      workspace_report_file: stringField(userInspection, 'workspace_report_file', filePath),
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
    workspace_governance_policy: {
      workspace_norm_projection_must_equal_contract_projection: booleanField(
        workspaceGovernancePolicy,
        'workspace_norm_projection_must_equal_contract_projection',
        filePath,
      ),
      profile_binding_required: booleanField(workspaceGovernancePolicy, 'profile_binding_required', filePath),
      profile_version: stringField(workspaceGovernancePolicy, 'profile_version', filePath),
      profile_fingerprint: stringField(workspaceGovernancePolicy, 'profile_fingerprint', filePath),
      topology_events_required: booleanField(workspaceGovernancePolicy, 'topology_events_required', filePath),
      canonical_generated_projection_root: stringField(
        workspaceGovernancePolicy,
        'canonical_generated_projection_root',
        filePath,
      ),
      root_projection_files_are_compatibility_mirrors: booleanField(
        workspaceGovernancePolicy,
        'root_projection_files_are_compatibility_mirrors',
        filePath,
      ),
      workspace_report_is_default_user_summary: booleanField(
        workspaceGovernancePolicy,
        'workspace_report_is_default_user_summary',
        filePath,
      ),
      generated_projection_currentness_is_repairable_structural_finding: booleanField(
        workspaceGovernancePolicy,
        'generated_projection_currentness_is_repairable_structural_finding',
        filePath,
      ),
      generated_projection_currentness_blocks_default_execution: booleanField(
        workspaceGovernancePolicy,
        'generated_projection_currentness_blocks_default_execution',
        filePath,
      ),
    },
    workspace_diagnostic_policy: {
      surface_kind: stringField(workspaceDiagnosticPolicy, 'surface_kind', filePath),
      policy_id: stringField(workspaceDiagnosticPolicy, 'policy_id', filePath),
      default_execution_blocks_on: stringField(workspaceDiagnosticPolicy, 'default_execution_blocks_on', filePath),
      hard_blocker_rule: stringField(workspaceDiagnosticPolicy, 'hard_blocker_rule', filePath),
      repairable_rule: stringField(workspaceDiagnosticPolicy, 'repairable_rule', filePath),
      advisory_rule: stringField(workspaceDiagnosticPolicy, 'advisory_rule', filePath),
      auto_repair_command_template: stringField(workspaceDiagnosticPolicy, 'auto_repair_command_template', filePath),
      repairable_findings_block_default_execution: booleanField(
        workspaceDiagnosticPolicy,
        'repairable_findings_block_default_execution',
        filePath,
      ),
      advisory_warnings_block_default_execution: booleanField(
        workspaceDiagnosticPolicy,
        'advisory_warnings_block_default_execution',
        filePath,
      ),
      hard_blocker_codes: stringArrayField(workspaceDiagnosticPolicy, 'hard_blocker_codes', filePath),
      repairable_finding_codes: stringArrayField(workspaceDiagnosticPolicy, 'repairable_finding_codes', filePath),
      advisory_warning_codes: stringArrayField(workspaceDiagnosticPolicy, 'advisory_warning_codes', filePath),
    },
    domain_workspace_lifecycle_policy: {
      policy_ref: stringField(domainWorkspaceLifecyclePolicy, 'policy_ref', filePath),
      domain_repo_can_own_generic_workspace_lifecycle: booleanField(
        domainWorkspaceLifecyclePolicy,
        'domain_repo_can_own_generic_workspace_lifecycle',
        filePath,
      ),
      domain_repo_must_declare_locator_not_lifecycle: booleanField(
        domainWorkspaceLifecyclePolicy,
        'domain_repo_must_declare_locator_not_lifecycle',
        filePath,
      ),
      opl_owns_lifecycle_projection: booleanField(
        domainWorkspaceLifecyclePolicy,
        'opl_owns_lifecycle_projection',
        filePath,
      ),
      physical_delete_requires_domain_owner_receipt: booleanField(
        domainWorkspaceLifecyclePolicy,
        'physical_delete_requires_domain_owner_receipt',
        filePath,
      ),
    },
    conformance_policy: {
      family_conformance_must_report_workspace_norm: booleanField(
        conformancePolicy,
        'family_conformance_must_report_workspace_norm',
        filePath,
      ),
      workspace_norm_maturity_level: stringField(conformancePolicy, 'workspace_norm_maturity_level', filePath),
      workspace_norm_pass_is_structural_only: booleanField(
        conformancePolicy,
        'workspace_norm_pass_is_structural_only',
        filePath,
      ),
      workspace_norm_pass_can_claim_production_ready: booleanField(
        conformancePolicy,
        'workspace_norm_pass_can_claim_production_ready',
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
      l5_evidence_required: stringArrayField(conformancePolicy, 'l5_evidence_required', filePath),
      blocked_reasons: stringArrayField(conformancePolicy, 'blocked_reasons', filePath),
    },
  };
  validateAgentWorkspaceNormSemantics(filePath, contract);
  return contract;
}
