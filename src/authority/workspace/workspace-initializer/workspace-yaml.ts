import { stringifyYamlDocument } from '../../../kernel/frontmatter.ts';
import type { WorkspaceAgentProfile } from '../workspace-agent-defaults.ts';
import {
  WORKSPACE_TOPOLOGY_CONTRACT_REF,
  type TopologyProfile,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from '../workspace-topology.ts';

export function buildWorkspaceYaml(input: {
  workspaceId: string;
  title: string | null;
  agent: WorkspaceAgentProfile;
  profileId: WorkspaceProfileId;
  profile: TopologyProfile;
  projects: WorkspaceProjectIndexEntry[];
}) {
  const idField = input.agent.inventory_projection?.field_map.work_item_id ?? 'project_id';
  const rootField = input.agent.inventory_projection?.field_map.work_item_root ?? 'project_root';
  const document = {
    surface_kind: 'opl_workspace_config',
    version: 'workspace-config.v1',
    workspace_id: input.workspaceId,
    title: input.title,
    agent_id: input.agent.agent_id,
    project_id: input.agent.project_id,
    workspace_kind: input.agent.workspace_kind,
    project_kind: input.agent.project_kind,
    workspace_topology_profile: {
      contract_ref: WORKSPACE_TOPOLOGY_CONTRACT_REF,
      profile_id: input.profileId,
      workspace_mode: input.profile.workspace_mode,
      project_collection_path: input.profile.project_collection_path,
      project_stage_outputs_root: input.profile.project_stage_outputs_root,
      shared_resource_roots: [...input.profile.shared_resource_roots],
    },
    [input.profile.project_collection_path]: input.projects.map((project) => ({
      [idField]: project.project_id,
      [rootField]: project.project_root,
      stage_outputs_root: project.stage_outputs_root,
    })),
    authority_boundary: {
      opl_can_define_topology_contract: true,
      opl_can_project_workspace_refs: true,
      opl_can_write_domain_truth: false,
      opl_can_mutate_artifact_body: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
  };
  return stringifyYamlDocument(document);
}
