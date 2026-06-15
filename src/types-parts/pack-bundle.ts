export interface PackBundleContract {
  schema_version: number;
  contract_id: 'opl-pack-bundle-contract.v1';
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  source_module: string;
  cli_surfaces: {
    manifest: string;
    write: string;
    check: string;
  };
  assembly_contract: {
    surface_kind: string;
    required_fields: string[];
    generated_array_field_required_fields: string[];
    source_truth_rule: string;
  };
  manifest_contract: {
    surface_kind: string;
    records: string[];
    digest_algorithm: string;
    compatibility_rule: string;
  };
  generated_metadata_contract: {
    surface_kind: string;
    required_fields: string[];
    do_not_edit: true;
  };
  authority_boundary: {
    opl_can_write_generated_aggregate: true;
    opl_can_write_bundle_manifest: true;
    opl_can_validate_source_to_aggregate_drift: true;
    opl_can_write_domain_truth: false;
    opl_can_sign_owner_receipt: false;
    opl_can_create_typed_blocker: false;
    opl_can_authorize_quality_verdict: false;
    opl_can_claim_domain_ready: false;
    opl_can_claim_production_ready: false;
  };
  not_claims: string[];
  verification: {
    focused_tests: string[];
    required_commands_when_changed: string[];
  };
}
