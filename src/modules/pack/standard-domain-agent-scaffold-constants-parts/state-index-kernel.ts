export const STATE_INDEX_KERNEL_ADOPTION_POLICY = {
  surface_kind: 'opl_state_index_kernel_sidecar_adoption',
  version: 'opl-state-index-kernel-sidecar-adoption.v1',
  owner: 'one-person-lab',
  adoption_status: 'deferred_until_measured_trigger',
  sqlite_enabled_now: false,
  index_backend: 'sqlite_sidecar_index',
  sidecar_owner: 'one-person-lab',
  sidecar_is_domain_runtime: false,
  rebuild_policy: {
    rebuildable: true,
    delete_safe: true,
  },
  authority_boundary: {
    opl_owns_state_index_kernel: true,
    opl_can_store_refs_hashes_provenance: true,
    opl_can_rebuild_sidecar_index: true,
    sqlite_can_be_truth_source: false,
    sqlite_can_store_domain_artifact_body: false,
    sqlite_can_store_domain_verdict: false,
  },
} as const;
