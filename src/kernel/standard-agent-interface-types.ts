export type StandardAgentLocatorField =
  | 'workspace_root'
  | 'workspace_path'
  | 'profile_ref'
  | 'input_path';

export type StandardAgentInventoryProjection = {
  source_kind: 'workspace_relative_json';
  relative_path: string;
  items_pointer: string;
  work_item_root_template?: string;
  field_map: {
    display_name?: string;
    next_action?: string;
    stage_index_ref?: string;
    work_item_id: string;
    work_item_root: string;
    business_status: string;
    current_stage_id: string;
    current_stage_status: string;
    package_status: string;
    lifecycle_ref: string;
  };
};

export type StandardAgentStageCatalogDeclaration = {
  source_kind: 'agent_repo_relative_json';
  relative_path: string;
  items_pointer: string;
  field_map: {
    stage_id: string;
    display_name: string;
    display_names: string;
  };
};

export type StandardAgentDomainDetailViewDeclaration = {
  view_id: string;
  view_kind: string;
  title: string | null;
  schema_ref: string | null;
  schema_version: string | null;
  source_kind: 'work_item_relative_json';
  relative_path: string;
  revision_pointer: string;
  owner_task_binding: {
    task_id_pointer: string;
    task_ref_pointer: string;
    task_ref_template: string;
  } | null;
};

export type StandardAgentTaskProvider = {
  inventory_ref: string | null;
  business_lifecycle_owner: string | null;
  temporal_execution_ref: {
    source_kind: string;
    join_field: 'work_item_scope_id';
  } | null;
  views: StandardAgentDomainDetailViewDeclaration[];
};

export type StandardAgentInterface = {
  version: 'opl_standard_agent_interface.v1';
  inventory_projection: StandardAgentInventoryProjection | null;
  stage_catalog: StandardAgentStageCatalogDeclaration | null;
  domain_detail_views: StandardAgentDomainDetailViewDeclaration[];
  workspace_binding: {
    locator_surface_kind: string;
    default_profile_id: 'one_off' | 'series' | 'portfolio';
    workspace_kind: string;
    project_kind: string;
    project_collection_label: string;
    project_collection_path: string | null;
    default_workspace_id: string;
    default_project_id: string;
    required_locator_fields: StandardAgentLocatorField[];
    optional_locator_fields: StandardAgentLocatorField[];
  };
  runtime: {
    runtime_domain_id: string;
    registration_ref: string | null;
  };
  progress: {
    deliverable_delta_aliases: string[];
    platform_delta_aliases: string[];
  };
  routing: {
    explicit_aliases: string[];
    workstream_ids: string[];
    intent_signals: string[];
    ambiguity_policy: string;
  };
};

export type StandardAgentDescriptorInterface = {
  repo_dir: string;
  kind?: 'agent' | null;
  agent_id?: string | null;
  package_id?: string | null;
  domain_id: string;
  display_name?: string | null;
  task_provider?: StandardAgentTaskProvider | null;
  dispatch_evidence_projection?: StandardAgentDispatchEvidenceProjection | null;
  interface: StandardAgentInterface;
};

export type StandardAgentDispatchEvidenceProjection = {
  work_item_id_field: string;
  result_collections: Array<{
    field: string;
    ref_fields: Partial<Record<'domain_receipt_refs' | 'typed_blocker_refs' | 'owner_chain_refs', string[]>>;
  }>;
};

export type StandardAgentSourceMaterialConsumerRoute = {
  consumer_agent_id: string;
  public_action_id: string;
  action_catalog_ref: string;
  input_schema_ref: string;
  request_ref_field: string;
  provider_manifest_ref: string;
  provider_id: string;
};

export type StandardAgentSourceMaterialConsumerResolution = {
  applicability: 'required' | 'not_applicable';
  consumer_projection_ref: string | null;
  consumer_route: StandardAgentSourceMaterialConsumerRoute | null;
  reason: 'source_material_role_not_declared' | 'consumer_descriptor_unavailable' | null;
};
