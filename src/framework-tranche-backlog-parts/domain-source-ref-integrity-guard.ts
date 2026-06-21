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
        commit: '1f1a59c1ebcabc96c6441a72f10dea4b72ad3529',
        subject: 'Add strict source purity guard readback',
      },
      {
        repo: 'opl-meta-agent',
        commit: 'b902ed0b0e1da4cf2ce559d03cb50ce2edcbe255',
        subject: 'Add OMA source-structure JSON readback',
      },
      {
        repo: 'redcube-ai',
        commit: '985bc5e3822018f129a94d8aa003f9bff259a59c',
        subject: 'Add private platform compact tail readback',
      },
    ],
    checked_domain_repo_guards: [
      {
        repo: 'med-autogrant',
        guard_id: 'mag.physical_morphology.source_ref_integrity_gate.v1',
        source_ref:
          'med-autogrant:contracts/private_functional_surface_policy.json#/physical_source_morphology_policy/source_ref_integrity_gate',
        public_readback_ref: 'med-autogrant:authority morphology-guard',
        source_ref_integrity_readback_ref:
          'med-autogrant:authority morphology-guard#source_ref_integrity_guard',
        strict_readback_ref:
          'med-autogrant:scripts/check_source_purity_guard.py --format json',
        verify_readback_ref: 'med-autogrant:scripts/verify.sh source-purity:strict',
        checked_source_ref_count: 55,
        checked_machine_boundary_ref_count: 0,
        strict_source_purity_no_second_truth_guard_id:
          'mag.physical_morphology.strict_source_purity_no_second_truth_guard.v1',
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
        source_structure_json_readback_ref:
          'opl-meta-agent:npm run source-structure:json --silent',
        source_structure_strict_json_readback_ref:
          'opl-meta-agent:npm run source-structure:strict:json --silent',
        checked_source_ref_count: 31,
        invalid_source_ref_count: 0,
        generic_materializer_no_resurrection_guard_id:
          'oma.script_morphology.generic_materializer_no_resurrection_guard.v1',
        generic_materializer_scan_status: 'passed',
        repo_owned_generic_wrapper_materializer_count: 0,
        repo_owned_generic_runtime_materializer_count: 0,
        repo_owned_queue_or_attempt_ledger_materializer_count: 0,
        repo_owned_target_worktree_lifecycle_materializer_count: 0,
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
        active_source_resurrection_scan_policy_id:
          'rca.source_morphology.active_source_no_resurrection_scan.v1',
        strict_readback_ref:
          'redcube-ai:scripts/check-private-platform-retirement.ts --format json',
        verify_readback_ref: 'redcube-ai:scripts/verify.sh private-platform:strict',
        runtime_watch_boundary_readback:
          'redcube-ai:rca_private_platform_retirement_strict_readback.runtime_watch_boundary',
        domain_action_adapter_boundary_readback:
          'redcube-ai:rca_private_platform_retirement_strict_readback.domain_action_adapter_boundary',
        active_source_resurrection_guarded_claim_keys: [
          'runtimeWatch_can_return_to_domain_action_adapter_default_dispatch',
          'domain_action_adapter_can_become_generic_dispatch_owner',
          'domain_action_adapter_can_become_generated_wrapper_owner',
          'generic_runtime_owner_allowed',
        ],
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
        'med-autogrant:physical_source_morphology_policy.strict_source_purity_no_second_truth_guard',
        'med-autogrant:authority morphology-guard#source_ref_integrity_guard',
        'med-autogrant:authority morphology-guard#strict_source_purity_no_second_truth_guard',
        'med-autogrant:scripts/check_source_purity_guard.py --format json',
        'med-autogrant:scripts/verify.sh source-purity:strict',
        'opl-meta-agent:script_to_pack_gate_receipt.machine_gate_inputs.source_ref_integrity_guard',
        'opl-meta-agent:script_morphology_policy.generic_materializer_no_resurrection_guard',
        'opl-meta-agent:source_purity_scan_receipt.generic_script_materializer_scan',
        'opl-meta-agent:contracts/source_structure_policy.json#script_to_pack_receipt_guard.json_readback_command_ref',
        'opl-meta-agent:npm run source-structure:json --silent',
        'opl-meta-agent:npm run source-structure:strict:json --silent',
        'redcube-ai:physical_source_morphology_policy.source_ref_integrity_gate',
        'redcube-ai:default_caller_tail_thinning_gate.active_source_resurrection_scan_policy',
        'redcube-ai:scripts/check-private-platform-retirement.ts --format json',
        'redcube-ai:scripts/verify.sh private-platform:strict',
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
