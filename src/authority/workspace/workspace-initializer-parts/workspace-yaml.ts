import type { WorkspaceAgentProfile } from '../workspace-agent-defaults.ts';
import {
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  type TopologyProfile,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from '../workspace-topology.ts';

function yamlScalar(value: string | boolean | number | null) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlList(values: string[], indent: string) {
  if (values.length === 0) {
    return [`${indent}[]`];
  }
  return values.map((value) => `${indent}- ${yamlScalar(value)}`);
}

export function buildWorkspaceYaml(input: {
  workspaceId: string;
  title: string | null;
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
  projects: WorkspaceProjectIndexEntry[];
}) {
  const lines = [
    'surface_kind: opl_workspace_config',
    'version: workspace-config.v1',
    `workspace_id: ${yamlScalar(input.workspaceId)}`,
    `title: ${yamlScalar(input.title)}`,
    `agent_id: ${yamlScalar(input.agent.agent_id)}`,
    `project_id: ${yamlScalar(input.agent.project_id)}`,
    `workspace_kind: ${yamlScalar(input.agent.workspace_kind)}`,
    `project_kind: ${yamlScalar(input.agent.project_kind)}`,
    'workspace_topology_profile:',
    `  contract_ref: ${yamlScalar(WORKSPACE_TOPOLOGY_CONTRACT_REF)}`,
    `  profile_id: ${yamlScalar(input.profileId)}`,
    `  workspace_mode: ${yamlScalar(input.profile.workspace_mode)}`,
    `  project_collection_path: ${yamlScalar(input.profile.project_collection_path)}`,
    `  project_stage_outputs_root: ${yamlScalar(input.profile.project_stage_outputs_root)}`,
    '  shared_resource_roots:',
    ...yamlList(input.profile.shared_resource_roots, '    '),
    `${input.profile.project_collection_path}:`,
  ];
  for (const project of input.projects) {
    const idField = input.agent.inventory_projection?.field_map.work_item_id ?? 'project_id';
    const rootField = input.agent.inventory_projection?.field_map.work_item_root ?? 'project_root';
    lines.push(
      `  - ${idField}: ${yamlScalar(project.project_id)}`,
      `    ${rootField}: ${yamlScalar(project.project_root)}`,
      `    stage_outputs_root: ${yamlScalar(project.stage_outputs_root)}`,
    );
  }
  lines.push(
    'authority_boundary:',
    '  opl_can_define_topology_contract: true',
    '  opl_can_project_workspace_refs: true',
    '  opl_can_write_domain_truth: false',
    '  opl_can_mutate_artifact_body: false',
    '  opl_can_create_owner_receipt: false',
    '  opl_can_create_typed_blocker: false',
  );
  return `${lines.join('\n')}\n`;
}
