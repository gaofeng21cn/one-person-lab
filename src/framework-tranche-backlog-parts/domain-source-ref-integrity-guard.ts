type JsonRecord = Record<string, unknown>;

export function buildDomainSourceRefIntegrityGuard(noSecondTruthAuthorityBoundary: JsonRecord) {
  return {
    surface_kind: 'opl_family_domain_source_ref_integrity_guard',
    status: 'closed_structure_gate_not_live_evidence',
    owner: 'one-person-lab',
    milestone_id: 'strict_source_purity_private_wrapper_retirement',
    guard_role:
      'MAG_OMA_RCA_domain_source_refs_are_repo_local_resolved_and_non_authoritative_not_delete_or_readiness_evidence',
    absorbed_origin_main_commits: [
      {
        repo: 'med-autogrant',
        commit: '3848284b64b282ed5b5ec380cbd5a57c72ac47a0',
        subject: 'Add MAG source ref integrity guard',
      },
      {
        repo: 'opl-meta-agent',
        commit: '7b2d64a4456225a8e66c767281af4f706aed1fc7',
        subject: 'Add OMA script source ref integrity guard',
      },
      {
        repo: 'redcube-ai',
        commit: '711292501cc670f97ed47e405bc2b58686eb0d37',
        subject: 'Strengthen RCA source ref integrity guard',
      },
    ],
    checked_domain_repo_guards: [
      {
        repo: 'med-autogrant',
        guard_id: 'mag.physical_morphology.source_ref_integrity_gate.v1',
        source_ref:
          'med-autogrant:contracts/private_functional_surface_policy.json#/physical_source_morphology_policy/source_ref_integrity_gate',
        checked_source_ref_count: 54,
        checked_machine_boundary_ref_count: 0,
        state: 'repo_local_source_refs_declared_no_second_truth',
        accepted_ref_shapes: ['repo_local_path_or_repo_local_contract_path'],
        forbidden_ref_shapes: [
          'absolute_path',
          'parent_directory_traversal',
          'uri_or_url',
          'empty_ref',
          'human_doc_ref_as_machine_source_ref',
          'legacy_alias_ref_without_contract_owner',
        ],
      },
      {
        repo: 'opl-meta-agent',
        guard_id: 'oma.script_morphology.source_ref_integrity_guard.v1',
        source_ref:
          'opl-meta-agent:contracts/script_to_pack_gate_receipt.json#/machine_gate_inputs/source_ref_integrity_guard',
        mirror_ref:
          'opl-meta-agent:runtime/authority_functions/meta-agent-authority-functions.json#script_morphology_policy/source_ref_integrity_guard',
        checked_source_ref_count: 31,
        invalid_source_ref_count: 0,
        state: 'repo_local_script_refs_declared_no_second_truth',
        accepted_ref_shapes: ['scripts_repo_local_ts_or_sh_file'],
        forbidden_ref_shapes: [
          'absolute_path',
          'parent_directory_traversal',
          'uri_or_url',
          'empty_ref',
          'human_doc_ref_as_machine_source_ref',
          'stale_script_ref',
          'source_purity_self_guard_only_ref',
        ],
      },
      {
        repo: 'redcube-ai',
        guard_id: 'rca.physical_source_morphology.source_ref_integrity_gate.v1',
        source_ref:
          'redcube-ai:contracts/physical_source_morphology_policy.json#/source_ref_integrity_gate',
        checked_source_ref_count: 58,
        checked_machine_boundary_ref_count: 3,
        state: 'repo_local_source_refs_declared_no_second_truth',
        accepted_ref_shapes: ['repo_path', 'repo_directory', 'repo_path_anchor'],
        forbidden_ref_shapes: [
          'absolute_path',
          'parent_directory_traversal',
          'uri_or_url',
          'human_doc_ref_as_machine_source_ref',
          'retired_compatibility_source_ref_outside_tombstone_or_negative_guard',
          'machine_boundary_ref_without_anchor',
        ],
      },
    ],
    common_validation_policy: {
      all_refs_must_be_repo_local: true,
      all_refs_must_exist_in_repo_checkout: true,
      human_doc_refs_do_not_count_as_machine_source_refs: true,
      stale_or_missing_ref_reopens_structure_gap: true,
      path_existence_can_authorize_physical_delete: false,
      path_existence_can_claim_runtime_ready: false,
    },
    structural_closeout_guard: {
      can_close_non_live_structure_gate: true,
      required_current_truth_surfaces: [
        'med-autogrant:physical_source_morphology_policy.source_ref_integrity_gate',
        'opl-meta-agent:script_to_pack_gate_receipt.machine_gate_inputs.source_ref_integrity_guard',
        'redcube-ai:physical_source_morphology_policy.source_ref_integrity_gate',
        'repo_native_source_ref_integrity_tests',
        'remote_sha_readback_equal',
      ],
      cannot_claim: [
        'physical_delete_authorized',
        'default_caller_cutover',
        'OPL_primitive_parity',
        'App_operator_live_consumption',
        'grant_readiness',
        'visual_or_export_readiness',
        'target_agent_readiness',
        'domain_ready',
        'production_ready',
        'owner_receipt_signed',
        'typed_blocker_created',
        'full_goal_complete',
      ],
    },
    no_second_truth_guard: {
      source_ref_guard_can_create_missing_refs: false,
      source_ref_guard_can_create_alias_files: false,
      source_ref_guard_can_replace_domain_truth: false,
      source_ref_guard_can_create_second_active_backlog: false,
      source_ref_guard_can_claim_live_evidence_complete: false,
    },
    authority_boundary: {
      ...noSecondTruthAuthorityBoundary,
      can_fix_missing_refs: false,
      can_create_alias_files: false,
      can_replace_domain_source_truth: false,
      can_claim_default_caller_cutover: false,
      can_claim_grant_readiness: false,
      can_claim_visual_or_export_readiness: false,
      can_claim_target_agent_readiness: false,
    },
    false_ready_guard: {
      source_refs_exist_can_claim_physical_delete_authorized: false,
      source_refs_exist_can_claim_default_caller_cutover: false,
      source_refs_exist_can_claim_opl_primitive_parity: false,
      source_refs_exist_can_claim_app_live_consumption: false,
      source_refs_exist_can_claim_domain_ready: false,
      source_refs_exist_can_claim_production_ready: false,
      remote_sha_readback_can_claim_live_evidence_complete: false,
    },
  };
}
