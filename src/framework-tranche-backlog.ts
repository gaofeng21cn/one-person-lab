import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from './contract-validation.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

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

type TrancheExecutionLane = {
  lane_id: string;
  repo: string;
  priority: MilestonePriority;
  milestone_ids: string[];
  lane_status: string;
  write_set_class: string;
  required_surfaces: string[];
  non_live_completion_evidence_required: string[];
  deferred_evidence: string[];
  forbidden_scope: string[];
};

type GeneratedHostedBoundarySurface = {
  surface_id: string;
  owner: string;
  default_entry: boolean;
  source_catalogs: string[];
  domain_repo_role: string;
  domain_repo_can_own_generated_surface: boolean;
};

type DomainPackCompilerGeneratedSurface = {
  surface_id: string;
  owner: string;
  default_entry: boolean;
  source_catalogs: string[];
  domain_repo_role: string;
  domain_repo_can_own_generated_surface: boolean;
};

type DomainPackCompilerContractSubset = {
  generated_interface_bundle: {
    generated_surface_owner: string;
    domain_repo_can_own_generated_surface: boolean;
    default_entry_policy: {
      surface_kind: string;
      status: string;
      owner: string;
      domain_repo_wrapper_policy: string;
      domain_repo_can_own_default_entry: boolean;
      default_entry_surface_ids: string[];
    };
    source_of_work_lineage: {
      surface_kind: string;
      owner: string;
      source_catalogs: string[];
      derived_surface_policy: string;
      domain_repo_wrapper_policy: string;
      authority_boundary: JsonRecord;
    };
    generated_default_entry_no_resurrection_gate: {
      surface_kind: string;
      owner: string;
      release_gate: boolean;
      required_default_entry_surface_ids: string[];
      blocked_resurrection_surface_classes: string[];
      authority_boundary: JsonRecord;
    };
    supported_derived_surfaces: DomainPackCompilerGeneratedSurface[];
  };
};

type SchemaContractIdentity = {
  required: string[];
  consts: Record<string, string>;
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

const GENERATED_HOSTED_BOUNDARY_AUTHORITY = {
  ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  domain_repo_can_own_generated_surface: false,
  domain_repo_can_own_default_entry: false,
  domain_repo_can_own_registry: false,
  domain_repo_can_own_app_workbench: false,
  descriptor_pass_can_claim_domain_ready: false,
  descriptor_pass_can_claim_production_ready: false,
  generated_surface_readback_can_claim_live_app_rendering: false,
  generated_surface_readback_can_claim_default_caller_cutover: false,
};

const ORDINARY_PROGRESS_GUARD_AUTHORITY = {
  ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  current_owner_delta_can_claim_domain_ready: false,
  owner_route_projection_can_execute_domain_action: false,
  typed_blocker_readback_can_create_typed_blocker: false,
  human_gate_projection_can_make_human_decision: false,
  evidence_worklist_can_override_current_owner_delta: false,
  raw_worklist_can_be_default_planning_root: false,
  provider_trace_can_be_default_planning_root: false,
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

const CURRENT_TRANCHE_LANES: TrancheExecutionLane[] = [
  {
    lane_id: 'opl-tranche-backlog-materialization-20260621',
    repo: 'one-person-lab',
    priority: 'P0',
    milestone_ids: [
      'opl_primitive_runtime_owner_route_guard',
      'domain_pack_generated_hosted_surfaces',
    ],
    lane_status: 'selected_for_non_live_functional_structure_tranche',
    write_set_class: 'framework_backlog_cli_readback_and_no_second_truth_guard',
    required_surfaces: [
      'source',
      'CLI_readback',
      'docs',
      'tests',
    ],
    non_live_completion_evidence_required: [
      'framework_tranche_backlog_cli_readback_contains_current_tranche',
      'framework_readiness_cli_surface_test_passes',
      'typecheck_passes',
      'main_absorbed_push_and_remote_sha_readback',
    ],
    deferred_evidence: DEFERRED_LIVE_EVIDENCE,
    forbidden_scope: [
      'full_Plan_Completion_Audit_claim',
      'domain_truth_write',
      'runtime_ready_claim',
      'App_release_ready_claim',
    ],
  },
  {
    lane_id: 'rca-source-morphology-tranche-20260621',
    repo: 'redcube-ai',
    priority: 'P1',
    milestone_ids: ['strict_source_purity_private_wrapper_retirement'],
    lane_status: 'selected_for_non_live_functional_structure_tranche',
    write_set_class: 'rca_source_morphology_runtime_watch_domain_action_adapter_tail',
    required_surfaces: [
      'source',
      'contract',
      'domain_handler_or_readback',
      'docs',
      'tests',
    ],
    non_live_completion_evidence_required: [
      'physical_source_morphology_policy_tracks_tail_thinning',
      'domain_action_adapter_runtime_watch_no_resurrection_tests_pass',
      'repo_smoke_passes',
      'main_absorbed_push_and_remote_sha_readback',
    ],
    deferred_evidence: [
      'default_caller_live_scaleout',
      'physical_delete_owner_receipt',
      ...DEFERRED_LIVE_EVIDENCE,
    ],
    forbidden_scope: [
      'visual_artifact_truth',
      'provider_long_soak',
      'AGUI',
      'root_checkout_implementation',
    ],
  },
  {
    lane_id: 'opl-doc-support-profile-guard-20260621',
    repo: 'opl-doc',
    priority: 'P2',
    milestone_ids: ['support_repo_profile_no_resurrection'],
    lane_status: 'selected_for_non_live_functional_structure_tranche',
    write_set_class: 'support_repo_profile_and_no_resurrection_policy_materialization',
    required_surfaces: [
      'source',
      'contract',
      'CLI_readback',
      'docs',
      'tests',
    ],
    non_live_completion_evidence_required: [
      'support_repo_policy_contract_equals_generated_policy',
      'family_plan_readback_contains_materialized_support_profile_guard',
      'repo_verify_passes',
      'main_absorbed_push_and_remote_sha_readback',
    ],
    deferred_evidence: DEFERRED_LIVE_EVIDENCE,
    forbidden_scope: [
      'default_Foundry_Agent_truth_set',
      'target_repo_truth_write',
      'Live_Evidence_claim',
      'second_active_backlog',
    ],
  },
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

function selectedMilestoneIds() {
  return [...new Set(CURRENT_TRANCHE_LANES.flatMap((lane) => lane.milestone_ids))];
}

function buildCurrentTrancheReadback() {
  const selectedIds = selectedMilestoneIds();
  const selectedMilestoneSet = new Set(selectedIds);
  return {
    tranche_id: 'opl-family-ideal-operating-model-tranche-20260621',
    tranche_role:
      'non_live_functional_structure_milestone_tranche_not_full_completion_audit',
    selected_lane_count: CURRENT_TRANCHE_LANES.length,
    selected_lane_count_within_policy:
      CURRENT_TRANCHE_LANES.length >= 2 && CURRENT_TRANCHE_LANES.length <= 4,
    selected_milestone_ids: selectedIds,
    closed_or_advanced_structural_milestone_ids:
      FRAMEWORK_TRANCHE_MILESTONES
        .filter((milestone) => (
          selectedMilestoneSet.has(milestone.milestone_id)
          && milestone.state !== 'open'
        ))
        .map((milestone) => milestone.milestone_id),
    lane_selection_policy: {
      prefer_open_coherent_worktree_owned_by_current_session: true,
      otherwise_select_highest_value_clean_repo_gap: true,
      disjoint_write_sets_required: true,
      unresolved_unclear_owner_lanes_are_avoided: true,
      live_evidence_lanes_deferred: true,
      root_checkout_role: 'read_absorb_push_readback_cleanup_only',
    },
    write_set_isolation_guard: {
      each_lane_requires_isolated_worktree: true,
      root_checkout_may_hold_preflight_push_only: true,
      root_checkout_must_not_hold_implementation_writes: true,
      lane_write_sets_are_declared_disjoint: true,
      conflicts_require_owner_route_or_new_tranche: true,
    },
    required_closeout_evidence: [
      'source_or_contract_delta_landed',
      'CLI_or_API_readback_available_when_surface_exists',
      'repo_native_tests_or_focused_contract_guard_passed',
      'docs_folded_back_to_owner_surface',
      'worktree_absorption_audit_or_equivalent_main_diff_readback',
      'push_to_origin_main',
      'remote_sha_readback_equal',
      'worktree_and_branch_cleanup',
    ],
    full_goal_completion_guard: {
      this_tranche_can_update_milestone_backlog: true,
      this_tranche_can_claim_full_goal_completion: false,
      plan_completion_audit_required_before_full_goal_completion: true,
      all_items_require_fresh_executable_evidence_before_100_percent: true,
      docs_tests_contracts_readmodels_refs_only_are_not_enough_for_readiness: true,
    },
    false_ready_guard: {
      selected_lane_count_can_claim_goal_complete: false,
      pushed_commits_can_claim_runtime_ready: false,
      closed_structure_gate_can_claim_live_evidence_complete: false,
      remote_sha_readback_can_claim_domain_ready: false,
    },
    lanes: CURRENT_TRANCHE_LANES.map((lane) => ({
      ...lane,
      milestone_priorities: lane.milestone_ids.map((milestoneId) => (
        FRAMEWORK_TRANCHE_MILESTONES.find((milestone) => milestone.milestone_id === milestoneId)?.priority
        ?? 'P2'
      )),
      milestone_states: lane.milestone_ids.map((milestoneId) => (
        FRAMEWORK_TRANCHE_MILESTONES.find((milestone) => milestone.milestone_id === milestoneId)?.state
        ?? 'open'
      )),
      authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
    })),
  };
}

function stringField(record: JsonRecord, key: string, filePath: string): string {
  return expectString(record[key], key, filePath);
}

function booleanField(record: JsonRecord, key: string, filePath: string): boolean {
  return expectBoolean(record[key], key, filePath);
}

function stringArrayField(record: JsonRecord, key: string, filePath: string): string[] {
  const value = expectStringArray(record[key], key, filePath);
  if (value.some((entry) => entry.length === 0)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Contract field "${key}" must not contain empty strings.`,
      { file: filePath, field: key },
    );
  }
  return value;
}

function recordField(record: JsonRecord, key: string, filePath: string): JsonRecord {
  const value = record[key];
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Contract field "${key}" must be an object.`,
      { file: filePath, field: key },
    );
  }
  return value;
}

function readJsonObject(filePath: string, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError(
        'contract_file_missing',
        `Required contract file is missing: ${label}.`,
        { file: filePath },
      );
    }
    throw new FrameworkContractError(
      'contract_json_invalid',
      `Contract file contains invalid JSON: ${label}.`,
      {
        file: filePath,
        cause: error instanceof Error ? error.message : 'JSON parsing failed unexpectedly.',
      },
    );
  }
  if (!isRecord(parsed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${label} must contain an object root.`,
      { file: filePath },
    );
  }
  return parsed;
}

function readDomainPackCompilerContract(contractsDir: string): DomainPackCompilerContractSubset {
  const filePath = path.join(contractsDir, 'domain-pack-compiler-contract.json');
  const parsed = readJsonObject(filePath, 'domain-pack-compiler-contract.json');
  const generated = recordField(parsed, 'generated_interface_bundle', filePath);
  const defaultEntry = recordField(generated, 'default_entry_policy', filePath);
  const lineage = recordField(generated, 'source_of_work_lineage', filePath);
  const noResurrection = recordField(generated, 'generated_default_entry_no_resurrection_gate', filePath);
  const supported = generated.supported_derived_surfaces;
  if (!Array.isArray(supported)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'domain-pack-compiler-contract.json must contain a supported_derived_surfaces array.',
      { file: filePath, field: 'supported_derived_surfaces' },
    );
  }

  return {
    generated_interface_bundle: {
      generated_surface_owner: stringField(generated, 'generated_surface_owner', filePath),
      domain_repo_can_own_generated_surface: booleanField(generated, 'domain_repo_can_own_generated_surface', filePath),
      default_entry_policy: {
        surface_kind: stringField(defaultEntry, 'surface_kind', filePath),
        status: stringField(defaultEntry, 'status', filePath),
        owner: stringField(defaultEntry, 'owner', filePath),
        domain_repo_wrapper_policy: stringField(defaultEntry, 'domain_repo_wrapper_policy', filePath),
        domain_repo_can_own_default_entry: booleanField(defaultEntry, 'domain_repo_can_own_default_entry', filePath),
        default_entry_surface_ids: stringArrayField(defaultEntry, 'default_entry_surface_ids', filePath),
      },
      source_of_work_lineage: {
        surface_kind: stringField(lineage, 'surface_kind', filePath),
        owner: stringField(lineage, 'owner', filePath),
        source_catalogs: stringArrayField(lineage, 'source_catalogs', filePath),
        derived_surface_policy: stringField(lineage, 'derived_surface_policy', filePath),
        domain_repo_wrapper_policy: stringField(lineage, 'domain_repo_wrapper_policy', filePath),
        authority_boundary: recordField(lineage, 'authority_boundary', filePath),
      },
      generated_default_entry_no_resurrection_gate: {
        surface_kind: stringField(noResurrection, 'surface_kind', filePath),
        owner: stringField(noResurrection, 'owner', filePath),
        release_gate: booleanField(noResurrection, 'release_gate', filePath),
        required_default_entry_surface_ids: stringArrayField(noResurrection, 'required_default_entry_surface_ids', filePath),
        blocked_resurrection_surface_classes: stringArrayField(noResurrection, 'blocked_resurrection_surface_classes', filePath),
        authority_boundary: recordField(noResurrection, 'authority_boundary', filePath),
      },
      supported_derived_surfaces: supported.map((surface) => {
        if (!isRecord(surface)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Each domain-pack-compiler supported surface must be an object.',
            { file: filePath, field: 'supported_derived_surfaces' },
          );
        }
        return {
          surface_id: stringField(surface, 'surface_id', filePath),
          owner: stringField(surface, 'owner', filePath),
          default_entry: booleanField(surface, 'default_entry', filePath),
          source_catalogs: stringArrayField(surface, 'source_catalogs', filePath),
          domain_repo_role: stringField(surface, 'domain_repo_role', filePath),
          domain_repo_can_own_generated_surface: booleanField(surface, 'domain_repo_can_own_generated_surface', filePath),
        };
      }),
    },
  };
}

function schemaIdentityFromContract(
  filePath: string,
  label: string,
  constFields: string[],
): SchemaContractIdentity {
  const parsed = readJsonObject(filePath, label);
  const required = stringArrayField(parsed, 'required', filePath);
  const properties = recordField(parsed, 'properties', filePath);
  const consts = Object.fromEntries(constFields.map((field) => {
    const property = recordField(properties, field, filePath);
    return [field, stringField(property, 'const', filePath)];
  }));
  return {
    required,
    consts,
  };
}

function buildOrdinaryProgressGuardReadback(contracts: FrameworkContracts) {
  const contractsRoot = path.dirname(contracts.contractsDir);
  const ownerRouteSchema = schemaIdentityFromContract(
    path.join(contractsRoot, 'family-orchestration', 'family-owner-route.schema.json'),
    'family-owner-route.schema.json',
    ['surface_kind', 'version'],
  );
  const typedBlockerSchema = schemaIdentityFromContract(
    path.join(contracts.contractsDir, 'stage-typed-blocker.schema.json'),
    'stage-typed-blocker.schema.json',
    ['surface_kind', 'schema_version'],
  );
  const ownerAnswerSchema = schemaIdentityFromContract(
    path.join(contracts.contractsDir, 'owner-answer.schema.json'),
    'owner-answer.schema.json',
    ['surface_kind', 'schema_version'],
  );

  return {
    surface_kind: 'opl_ordinary_progress_owner_route_guard_readback',
    readback_role:
      'current_owner_delta_single_ordinary_route_guard_not_live_evidence_not_domain_ready',
    owner: 'one-person-lab',
    source_contract_refs: [
      'contracts/family-orchestration/family-owner-route.schema.json',
      'contracts/opl-framework/owner-answer.schema.json',
      'contracts/opl-framework/stage-typed-blocker.schema.json',
      'contracts/opl-framework/progress-delta-receipt.schema.json',
      'contracts/opl-framework/target-operating-architecture-contract.json',
    ],
    source_cli_readback_refs: [
      'opl framework readiness --family-defaults --json .framework_readiness.current_owner_delta',
      'opl framework readiness --family-defaults --json .framework_readiness.owner_delta_handoff_summary',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.ordinary_progress_guard',
    ],
    ordinary_route_policy: {
      default_planning_root: 'current_owner_delta',
      accepted_terminal_inputs: [
        'domain_owner_receipt',
        'domain_typed_blocker',
        'human_gate_decision',
        'quality_export_review_receipt',
        'app_release_verdict',
        'route_back_evidence',
        'progress_delta_receipt',
      ],
      next_delta_derivation: 'owner_answer_or_typed_blocker_or_human_gate_to_next_current_owner_delta',
      raw_worklist_policy: 'audit_sidecar_or_full_detail_only_not_default_next_action',
      provider_trace_policy: 'runway_repair_or_diagnostic_only_not_domain_owner_answer',
      private_residue_policy: 'cleanup_lane_only_requires_no_active_caller_and_owner_gate',
    },
    owner_answer_admission_gate: {
      surface_kind: 'opl_owner_answer_admission_gate_readback',
      gate_role:
        'ordinary_terminal_input_shape_guard_for_current_owner_delta_derivation_not_owner_authority',
      source_schema: {
        surface_kind: ownerAnswerSchema.consts.surface_kind,
        schema_version: ownerAnswerSchema.consts.schema_version,
        required_fields: ownerAnswerSchema.required,
        owner_answer_required_fields_present: [
          'answer_id',
          'domain',
          'answer_kind',
          'answer_status',
          'answer_ref',
          'target_delta_ref',
          'audit_refs',
          'authority_boundary',
        ].every((field) => ownerAnswerSchema.required.includes(field)),
      },
      accepted_answer_kinds: [
        'owner_receipt',
        'typed_blocker',
        'human_decision',
        'route_back',
      ],
      accepted_answer_statuses: [
        'accepted',
        'blocked',
        'rejected',
        'route_back',
        'needs_human',
      ],
      derives_next_current_owner_delta_from: [
        'owner_answer_ref',
        'target_delta_ref',
        'effective_delta_ref',
        'stage_ref',
        'attempt_ref',
        'audit_refs',
      ],
      default_next_action_source_priority: [
        'fresh_current_owner_delta',
        'owner_answer_admission_gate',
        'typed_blocker_or_human_gate_projection',
        'route_back_evidence',
      ],
      rejected_default_roots: [
        'raw_worklist',
        'provider_trace',
        'refs_only_evidence_ledger',
        'cleanup_work_order',
        'release_cohort_diagnostic',
        'brand_l5_evidence_tail',
        'stale_projection_cache',
      ],
      required_followthrough:
        'accepted_owner_answer_or_typed_blocker_or_human_decision_ref_then_rederive_current_owner_delta',
      authority_boundary: {
        opl_can_consume_owner_answer: true,
        opl_can_fold_answer_into_delta: true,
        opl_can_sign_domain_owner_answer: false,
        opl_can_create_typed_blocker: false,
        opl_can_make_human_decision: false,
        opl_can_infer_domain_truth_from_answer: false,
        opl_can_authorize_domain_ready: false,
        opl_can_authorize_quality_verdict: false,
        opl_can_mutate_artifact_body: false,
        owner_answer_readback_can_claim_live_evidence_complete: false,
      },
      false_ready_guard: {
        owner_answer_shape_valid_can_claim_domain_ready: false,
        owner_answer_ref_observed_can_claim_stage_success: false,
        route_back_ref_can_claim_progress_complete: false,
        human_decision_required_can_claim_human_decision_complete: false,
        progress_delta_receipt_can_replace_domain_owner_answer: false,
      },
    },
    owner_route_schema: {
      surface_kind: ownerRouteSchema.consts.surface_kind,
      version: ownerRouteSchema.consts.version,
      required_fields: ownerRouteSchema.required,
      owner_route_required_fields_present: [
        'target_domain_id',
        'route_id',
        'route_epoch',
        'source_fingerprint',
        'next_owner',
        'allowed_actions',
        'idempotency_key',
        'status',
        'handoff_refs',
        'projection_refs',
      ].every((field) => ownerRouteSchema.required.includes(field)),
      authority_role:
        'route_projection_for_current_truth_handoff_allowed_actions_idempotency_and_refs_only_projection',
    },
    typed_blocker_schema: {
      surface_kind: typedBlockerSchema.consts.surface_kind,
      schema_version: typedBlockerSchema.consts.schema_version,
      required_fields: typedBlockerSchema.required,
      typed_blocker_required_fields_present: [
        'blocker_id',
        'domain_id',
        'stage_id',
        'stage_run_id',
        'generation',
        'blocked_surface',
        'missing_or_failed_input',
        'required_owner',
        'next_safe_action',
        'stability_or_retry_policy',
        'authority_boundary',
      ].every((field) => typedBlockerSchema.required.includes(field)),
      authority_role:
        'domain_or_human_owner_signed_blocker_consumed_by_opl_not_created_by_opl',
    },
    human_gate_boundary: {
      surface_kind: 'opl_human_gate_boundary_projection',
      human_gate_is_accepted_terminal_input: true,
      opl_can_request_human_gate: true,
      opl_can_make_human_decision: false,
      human_gate_counts_as_ready_claim: false,
      required_followthrough: 'owner_or_human_decision_ref_then_next_current_owner_delta',
    },
    no_second_truth_guard: {
      active_gap_owner_ref: 'docs/active/current-state-vs-ideal-gap.md',
      tranche_backlog_is_execution_index_only: true,
      readiness_readback_is_projection_only: true,
      worklist_and_evidence_vault_are_audit_sidecars: true,
      app_operator_projection_can_not_replace_current_owner_delta: true,
    },
    authority_boundary: { ...ORDINARY_PROGRESS_GUARD_AUTHORITY },
    false_ready_guard: {
      current_owner_delta_present_can_claim_goal_complete: false,
      owner_route_current_can_claim_domain_ready: false,
      typed_blocker_ref_can_claim_stage_success: false,
      human_gate_ref_can_claim_human_decision_complete: false,
      progress_delta_receipt_can_claim_artifact_ready: false,
      provider_completion_can_claim_owner_answer: false,
      readback_guard_can_claim_live_evidence_complete: false,
    },
  };
}

function buildGeneratedHostedBoundaryReadback(contracts: FrameworkContracts) {
  const generated = readDomainPackCompilerContract(contracts.contractsDir).generated_interface_bundle;
  const surfaces = generated.supported_derived_surfaces.map((surface) => ({
    surface_id: surface.surface_id,
    owner: surface.owner,
    default_entry: surface.default_entry,
    source_catalogs: [...surface.source_catalogs],
    domain_repo_role: surface.domain_repo_role,
    domain_repo_can_own_generated_surface: surface.domain_repo_can_own_generated_surface,
  })) satisfies GeneratedHostedBoundarySurface[];

  return {
    surface_kind: 'opl_generated_hosted_surface_authority_boundary_readback',
    readback_role:
      'generated_hosted_surface_owner_policy_not_domain_ready_not_live_evidence_not_default_caller_cutover',
    owner: 'one-person-lab',
    source_contract_ref: 'contracts/opl-framework/domain-pack-compiler-contract.json#generated_interface_bundle',
    generated_surface_owner: generated.generated_surface_owner,
    domain_repo_can_own_generated_surface: generated.domain_repo_can_own_generated_surface,
    default_entry_policy: {
      surface_kind: generated.default_entry_policy.surface_kind,
      status: generated.default_entry_policy.status,
      owner: generated.default_entry_policy.owner,
      domain_repo_wrapper_policy: generated.default_entry_policy.domain_repo_wrapper_policy,
      domain_repo_can_own_default_entry: generated.default_entry_policy.domain_repo_can_own_default_entry,
      default_entry_surface_ids: [...generated.default_entry_policy.default_entry_surface_ids],
    },
    source_of_work_lineage: {
      surface_kind: generated.source_of_work_lineage.surface_kind,
      owner: generated.source_of_work_lineage.owner,
      source_catalogs: [...generated.source_of_work_lineage.source_catalogs],
      derived_surface_policy: generated.source_of_work_lineage.derived_surface_policy,
      domain_repo_wrapper_policy: generated.source_of_work_lineage.domain_repo_wrapper_policy,
      authority_boundary: { ...generated.source_of_work_lineage.authority_boundary },
    },
    no_resurrection_gate: {
      surface_kind: generated.generated_default_entry_no_resurrection_gate.surface_kind,
      owner: generated.generated_default_entry_no_resurrection_gate.owner,
      release_gate: generated.generated_default_entry_no_resurrection_gate.release_gate,
      required_default_entry_surface_ids: [
        ...generated.generated_default_entry_no_resurrection_gate.required_default_entry_surface_ids,
      ],
      blocked_resurrection_surface_classes: [
        ...generated.generated_default_entry_no_resurrection_gate.blocked_resurrection_surface_classes,
      ],
      authority_boundary: {
        ...generated.generated_default_entry_no_resurrection_gate.authority_boundary,
      },
    },
    supported_derived_surfaces: surfaces,
    domain_repo_required_role:
      'declarative_domain_pack_plus_domain_handler_targets_refs_only_adapters_or_tombstone_candidates',
    support_repo_boundary: {
      support_repos_are_explicit_extensions_only: true,
      support_repos_can_join_default_foundry_agent_truth_set: false,
      support_repos_can_claim_generated_surface_owner: false,
      support_repos_can_claim_app_shell_owner: false,
      support_repos_can_claim_production_readiness: false,
    },
    authority_boundary: { ...GENERATED_HOSTED_BOUNDARY_AUTHORITY },
    false_ready_guard: {
      descriptor_ready_can_claim_domain_ready: false,
      generated_bundle_ready_can_claim_production_ready: false,
      refs_only_consumption_can_claim_live_evidence_complete: false,
      app_projection_can_claim_live_rendering_complete: false,
      support_profile_clean_can_claim_foundry_agent_truth: false,
      default_caller_evidence_worklist_can_authorize_physical_delete: false,
    },
  };
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
      current_tranche: buildCurrentTrancheReadback(),
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
      generated_hosted_surface_boundary: buildGeneratedHostedBoundaryReadback(contracts),
      ordinary_progress_guard: buildOrdinaryProgressGuardReadback(contracts),
      milestones: FRAMEWORK_TRANCHE_MILESTONES,
    },
  };
}
