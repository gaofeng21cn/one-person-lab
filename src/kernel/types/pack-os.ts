export interface PackOsContract {
  schema_version: number;
  contract_id: 'opl-pack-os-contract.v1';
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  source_module: string;
  cli_surfaces: {
    inspect: string;
    install: string;
    registry: string;
    cache: string;
    distribute: string;
    lock: string;
    validate: string;
  };
  descriptor_contract: {
    surface_kind: string;
    required_fields: string[];
    allowed_pack_kinds: string[];
    resource_roles: string[];
    relationship_to_domain_packs: string;
  };
  registry_cache_distribution_contract: {
    registry_surface_kind: string;
    install_receipt_surface_kind: string;
    cache_manifest_surface_kind: string;
    distribution_manifest_surface_kind: string;
    distribution_bundle_surface_kind: string;
    cache_layout: string;
    oci_descriptor_fields: string[];
    oci_media_types: {
      descriptor: string;
      resource: string;
    };
    registry_rule: string;
    distribution_rule: string;
  };
  lock_contract: {
    surface_kind: string;
    output_role: string;
    required_fields: string[];
    content_hash_algorithm: string;
    lock_projection_rule: string;
    content_addressed_lock_policy: {
      policy_id: string;
      digest_algorithm: string;
      descriptor_media_type: string;
      resource_media_type: string;
      descriptor_digest_required: boolean;
      present_local_resource_digest_required: boolean;
      external_refs_cached: boolean;
      lock_records_refs_only: boolean;
      registry_push_pull_implemented: boolean;
      stores_artifact_body: boolean;
      closes_stage: boolean;
      writes_domain_truth: boolean;
    };
  };
  lifecycle_model: {
    allowed_states: string[];
    hard_boundaries: string[];
  };
  authority_boundary: {
    opl_can_resolve_pack_descriptor: true;
    opl_can_write_pack_lock: true;
    opl_can_cache_pack_assets: true;
    opl_can_project_artifact_locator_refs: true;
    opl_can_transport_review_receipt_refs: true;
    opl_can_write_domain_truth: false;
    opl_can_mutate_artifact_body: false;
    opl_can_sign_domain_owner_receipt: false;
    opl_can_authorize_quality_verdict: false;
    opl_can_authorize_publication_readiness: false;
    opl_can_authorize_grant_readiness: false;
    opl_can_authorize_visual_export_readiness: false;
    opl_can_authorize_app_release_readiness: false;
    provider_completion_is_pack_quality_ready: false;
  };
  forbidden_claims: string[];
  verification: {
    focused_tests: string[];
    required_commands_when_changed: string[];
  };
}
