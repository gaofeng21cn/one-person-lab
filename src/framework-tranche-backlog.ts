import type { FrameworkContracts } from './types.ts';

type MilestonePriority = 'P0' | 'P1' | 'P2';
type MilestoneState = 'open' | 'partial' | 'closed_structure_gate' | 'deferred_live_evidence';

type FrameworkTrancheMilestone = {
  milestone_id: string;
  priority: MilestonePriority;
  state: MilestoneState;
  owner_repos: string[];
  lane_role: string;
  current_truth_refs: string[];
  non_live_evidence_acceptance: string[];
  deferred_evidence: string[];
  authority_boundary: Record<string, boolean>;
};

const NO_SECOND_TRUTH_AUTHORITY_BOUNDARY = {
  can_replace_active_gap_owner: false,
  can_create_second_active_backlog: false,
  can_claim_plan_completion: false,
  can_claim_runtime_ready: false,
  can_claim_domain_ready: false,
  can_claim_app_release_ready: false,
  can_claim_production_ready: false,
  can_write_domain_truth: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_physical_delete: false,
};

const NON_LIVE_ACCEPTANCE = [
  'source_or_contract_delta_landed',
  'CLI_or_API_readback_available_when_surface_exists',
  'repo_native_tests_or_focused_contract_guard_passed',
  'docs_folded_back_to_owner_surface',
  'false_ready_and_no_second_truth_flags_explicit',
];

const DEFERRED_LIVE_EVIDENCE = [
  'owner_chain_live_evidence',
  'provider_long_soak',
  'brand_l5_operating_evidence',
  'app_release_cohort',
  'real_user_path',
  'cross_agent_scaleout',
  'large_live_ledger_refresh',
  'real_paper_project_run_evidence',
];

const FRAMEWORK_TRANCHE_MILESTONES: FrameworkTrancheMilestone[] = [
  {
    milestone_id: 'opl_primitive_runtime_owner_route_guard',
    priority: 'P0',
    state: 'partial',
    owner_repos: ['one-person-lab'],
    lane_role:
      'Upcollect OPL primitives for runtime env, owner route, typed blocker, ordinary path, and no-second-truth guard surfaces.',
    current_truth_refs: [
      'docs/active/current-state-vs-ideal-gap.md#active-planning-gap-register',
      'docs/status.md#durable-objective-current-reading',
      'contracts/opl-framework/runtime-environment-substrate-contract.json',
      'contracts/opl-framework/target-operating-architecture-contract.json',
      'src/runtime-environment-substrate.ts',
      'src/framework-readiness.ts',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: DEFERRED_LIVE_EVIDENCE,
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
  {
    milestone_id: 'domain_pack_generated_hosted_surfaces',
    priority: 'P0',
    state: 'partial',
    owner_repos: ['one-person-lab', 'med-autogrant', 'redcube-ai', 'opl-meta-agent'],
    lane_role:
      'Converge standard domain agents onto declarative Domain Pack input plus OPL generated/hosted surface readbacks.',
    current_truth_refs: [
      'contracts/opl-framework/domain-pack-compiler-contract.json',
      'src/domain-pack-compiler.ts',
      'docs/active/current-state-vs-ideal-gap.md',
      'domain repos: contracts/private_functional_surface_policy.json',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: DEFERRED_LIVE_EVIDENCE,
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
  {
    milestone_id: 'strict_source_purity_private_wrapper_retirement',
    priority: 'P1',
    state: 'partial',
    owner_repos: ['med-autogrant', 'redcube-ai', 'opl-meta-agent'],
    lane_role:
      'Thin or retire private wrapper residue with source-purity gates, no-active-caller proof, tombstone/provenance, and false-ready guards.',
    current_truth_refs: [
      'med-autogrant:contracts/private_functional_surface_policy.json',
      'redcube-ai:contracts/physical_source_morphology_policy.json',
      'opl-meta-agent:contracts/private_functional_surface_policy.json',
      'OPL docs/active/current-state-vs-ideal-gap.md',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: [
      'default_caller_live_scaleout',
      'App_operator_sustained_consumption',
      'physical_delete_owner_receipt',
      ...DEFERRED_LIVE_EVIDENCE,
    ],
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
  {
    milestone_id: 'oma_script_to_pack_hygiene',
    priority: 'P2',
    state: 'closed_structure_gate',
    owner_repos: ['opl-meta-agent'],
    lane_role:
      'Keep retained scripts machine-classified with active callers, OPL-surface consumption policy, retirement gates, and reciprocal consumption guard.',
    current_truth_refs: [
      'opl-meta-agent:contracts/script_to_pack_gate_receipt.json',
      'opl-meta-agent:runtime/authority_functions/meta-agent-authority-functions.json#script_morphology_policy',
      'opl-meta-agent:tests/source-purity.test.ts',
      'opl-meta-agent:docs/active/opl-private-implementation-migration-inventory.md',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: [
      'OPL_primitive_parity_receipt',
      'script_physical_retirement_no_active_caller_receipt',
      'target_agent_live_patch_loop',
      ...DEFERRED_LIVE_EVIDENCE,
    ],
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
  {
    milestone_id: 'app_active_shell_hermes_convergence',
    priority: 'P2',
    state: 'open',
    owner_repos: ['one-person-lab-app'],
    lane_role:
      'Keep AionUI/opl-aion-shell as the App mainline and Hermes Desktop as the only foreground alternative while AGUI remains archived technical proof.',
    current_truth_refs: [
      'one-person-lab-app:active shell contracts',
      'OPL docs/status.md',
      'contracts/opl-framework/family-product-operator-projection.json',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: ['App_release_cohort', 'real_user_path', ...DEFERRED_LIVE_EVIDENCE],
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
  {
    milestone_id: 'support_repo_profile_no_resurrection',
    priority: 'P2',
    state: 'closed_structure_gate',
    owner_repos: ['opl-doc'],
    lane_role:
      'Keep support repos extension-only, outside default family repo truth, and guarded against authority resurrection.',
    current_truth_refs: [
      'opl-doc:contracts/support_repo_policy.json',
      'opl-doc:scripts/opl_doc_doctor.py',
      'OPL docs/active/current-state-vs-ideal-gap.md',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: DEFERRED_LIVE_EVIDENCE,
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
];

function milestoneCounts() {
  return FRAMEWORK_TRANCHE_MILESTONES.reduce<Record<MilestoneState, number>>(
    (counts, milestone) => {
      counts[milestone.state] += 1;
      return counts;
    },
    {
      open: 0,
      partial: 0,
      closed_structure_gate: 0,
      deferred_live_evidence: 0,
    },
  );
}

export function buildFrameworkTrancheBacklogReadback(contracts: FrameworkContracts) {
  const milestone_state_counts = milestoneCounts();
  return {
    version: 'g2',
    framework_tranche_backlog: {
      surface_kind: 'opl_family_ideal_operating_model_tranche_backlog_readback',
      backlog_role:
        'milestone_tranche_execution_index_not_completion_audit_not_second_active_backlog',
      owner: 'one-person-lab',
      active_gap_owner_ref: 'docs/active/current-state-vs-ideal-gap.md',
      north_star_refs: [
        'docs/active/opl-family-ideal-operating-model-redesign.md',
        'contracts/opl-framework/target-operating-architecture-contract.json',
      ],
      source_contract_refs: [
        'contracts/opl-framework/target-operating-architecture-contract.json',
        'contracts/opl-framework/opl-flow-completion-audit-contract.json',
      ],
      target_operating_architecture_ref:
        `contracts/opl-framework/target-operating-architecture-contract.json#${contracts.targetOperatingArchitecture.schema_version}`,
      milestone_state_counts,
      default_tranche_policy: {
        lane_count_min: 2,
        lane_count_max: 4,
        use_isolated_worktree_per_lane: true,
        prefer_open_coherent_lane_owned_by_current_session: true,
        avoid_unclear_unresolved_lane_owner: true,
        root_checkout_role: 'read_absorb_push_readback_cleanup_only',
        live_evidence_deferred: true,
        docs_tests_readmodel_refs_only_do_not_count_as_ready: true,
      },
      priority_order: ['P0', 'P1', 'P2'] as const,
      forbidden_surfaces: ['AGUI/agui-codex'],
      app_shell_policy: {
        mainline: 'AionUI/opl-aion-shell',
        foreground_alternative: 'Hermes Desktop/hermes-codex',
        archived_technical_proof_only: 'AGUI/agui-codex',
      },
      authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
      false_ready_guard: {
        tests_or_contracts_can_claim_ready: false,
        docs_or_readmodels_can_claim_ready: false,
        refs_only_ledgers_can_claim_ready: false,
        tranche_backlog_can_claim_goal_complete: false,
        plan_completion_audit_required_for_full_goal_completion: true,
      },
      milestones: FRAMEWORK_TRANCHE_MILESTONES,
    },
  };
}
