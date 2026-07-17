import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from './standard-agent-registry.ts';

export const WORKSPACE_TOPOLOGY_CONTRACT_REF =
  'contracts/opl-framework/foundry-agent-series-contract.json#/workspace_topology_profile';
export const WORKSPACE_PROFILE_VERSION = 'workspace-topology-profile.v2';
export const WORKSPACE_PROFILE_FINGERPRINT = 'opl-workspace-topology-profile-v2-projects-stage-outputs';
export const OPL_GENERATED_ROOT = 'control/opl';
export const OPL_GENERATED_PROJECTIONS_ROOT = `${OPL_GENERATED_ROOT}/projections`;
export const OPL_GENERATED_REPORTS_ROOT = `${OPL_GENERATED_ROOT}/reports`;

export const WORKSPACE_TOPOLOGY_PROFILE_CONTRACT = {
  surface_kind: 'opl_workspace_topology_profile',
  version: 'workspace-topology-profile.v1',
  profile_id: 'opl.workspace_topology_profile.v1',
  topology_model: [
    'workspace_group',
    'project_unit',
    'stage_artifact_unit',
    'progress_receipt_or_owner_answer_or_hard_stop',
  ],
  workspace_modes: ['one_off', 'series', 'portfolio'],
  default_project_stage_outputs_root: 'artifacts/stage_outputs',
  default_profiles: {
    one_off: {
      workspace_mode: 'one_off',
      profile_role: 'canonical',
      canonical_profile_id: 'one_off',
      project_collection_path: 'projects',
      series_capable_skeleton: true,
      shared_resource_roots: ['shared/sources', 'shared/memory', 'shared/style_system'],
      project_stage_outputs_root: 'artifacts/stage_outputs',
    },
    series: {
      workspace_mode: 'series',
      profile_role: 'canonical',
      canonical_profile_id: 'series',
      project_collection_path: 'projects',
      shared_resource_roots: [
        'shared/sources',
        'shared/brand',
        'shared/visual_memory',
        'shared/style_system',
        'shared/material_inventory',
      ],
      project_stage_outputs_root: 'artifacts/stage_outputs',
    },
    portfolio: {
      workspace_mode: 'portfolio',
      profile_role: 'canonical',
      canonical_profile_id: 'portfolio',
      project_collection_path: 'projects',
      shared_resource_roots: ['data', 'literature', 'memory', 'shared/sources'],
      project_stage_outputs_root: 'artifacts/stage_outputs',
    },
  },
  domain_profile_defaults: Object.fromEntries(STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => [entry.agent_id, 'one_off'])),
  default_user_inspection_surface: {
    ordinary_user_default_surface: 'workspace_local_project_stage_outputs',
    project_stage_outputs_pattern: '<project-root>/artifacts/stage_outputs/<stage-id>/',
    runtime_state_is_default_user_surface: false,
    product_views_are_stage_outputs: false,
  },
  runtime_state_boundary: {
    role: 'provider_backing_provenance_restore_audit',
    runtime_state_can_be_canonical_project_root: false,
    runtime_state_can_close_stage: false,
    runtime_state_can_replace_owner_receipt_or_typed_blocker: false,
  },
  authority_boundary: {
    opl_can_define_topology_contract: true,
    opl_can_project_workspace_refs: true,
    opl_can_write_domain_truth: false,
    opl_can_mutate_artifact_body: false,
    opl_can_create_owner_receipt: false,
    opl_can_create_typed_blocker: false,
    runtime_state_counts_as_user_default_surface: false,
  },
  workspace_initialization_policy: {
    default_workspace_mode: 'one_off',
    default_project_collection_path: 'projects',
    infer_series_when_user_requests_multiple_related_projects: true,
    infer_portfolio_when_user_requests_shared_workspace_with_multiple_projects: true,
    upgrading_one_off_to_series_must_not_move_existing_project_roots: true,
    explicit_workspace_mode_declaration_preferred: true,
  },
  example_project_layouts: {
    one_off: {
      project_collection_path: 'projects',
      project_root_pattern: 'projects/<project-id>',
      project_stage_outputs_pattern: 'projects/<project-id>/artifacts/stage_outputs/<stage-id>/',
    },
    series: {
      shared_roots: [
        'shared/sources',
        'shared/brand',
        'shared/visual_memory',
        'shared/style_system',
        'shared/material_inventory',
      ],
      project_collection_path: 'projects',
      project_root_pattern: 'projects/<project-id>',
      project_stage_outputs_pattern: 'projects/<project-id>/artifacts/stage_outputs/<stage-id>/',
    },
    portfolio: {
      shared_roots: ['data', 'literature', 'memory'],
      project_collection_path: 'projects',
      project_root_pattern: 'projects/<project-id>',
      project_stage_outputs_pattern: 'projects/<project-id>/artifacts/stage_outputs/<stage-id>/',
    },
  },
} as const;
