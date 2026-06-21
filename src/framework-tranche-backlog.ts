import fs from 'node:fs';
import path from 'node:path';

import {
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
} from './domain-pack-compiler.ts';
import {
  DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
} from './family-runtime-domain-progress-transition-runtime.ts';
import {
  memoryArtifactLifecycleEvidenceAuthorityBoundary,
} from './memory-artifact-lifecycle-evidence-ledger.ts';
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

type FamilyReadbackUnavailable = {
  status: 'blocked_unavailable';
  error_code: string;
  error_message: string;
  source_command: string;
};

type DomainPackCompilerFamilyReadback =
  | {
    status: 'available';
    source_command: string;
    source_kind: string;
    summary: JsonRecord;
    authority_boundary: JsonRecord;
  }
  | FamilyReadbackUnavailable;

type GeneratedInterfacesFamilyReadback =
  | {
    status: 'available';
    source_command: string;
    selected_format: string;
    summary: JsonRecord;
    consumption_status_counts: {
      selected: number;
      ready: number;
      blocked: number;
    };
    consumer_surface_ids: string[];
    active_caller_cutover_statuses: string[];
    generated_wrapper_bundle_statuses: string[];
    domain_generated_surface_owner_claim_count: number;
    authority_boundary: JsonRecord;
  }
  | FamilyReadbackUnavailable;

type RuntimeEnvironmentSubstrateContractSubset = {
  contract_id: string;
  schema_version: string;
  owner: string;
  state: string;
  implementation_status: string;
  target_planned: boolean;
  ordinary_path: {
    input: string;
    steps: string[];
    default_mode: string;
    domain_agents_declare_dependency_intent_only: boolean;
  };
  materialization_policy: JsonRecord;
  cache_policy: JsonRecord;
  cache_inventory_policy: JsonRecord;
  dependency_prepare_policy: JsonRecord;
  run_context_consumer_policy: JsonRecord;
  authority_boundary: JsonRecord;
  required_readback_claim_fields: string[];
  readback_commands: string[];
  forbidden_claims: string[];
  live_evidence_deferred: string[];
};

type DomainProgressRuntimeFirstSliceContractSubset = {
  contract_kind: string;
  owner: string;
  surface_kind: string;
  schema_version: string | number;
  status: string;
  purpose: string;
  implementation_refs: JsonRecord;
  physical_persistence_refs: JsonRecord;
  runtime_live_readback_contract: JsonRecord;
  brand_module_partition: JsonRecord;
  allowed_transition_decisions: string[];
  decision_surface_policy: JsonRecord;
  not_complete_claims: string[];
  policy_adapter_contract: {
    surface_kind: string;
    runtime_id: string;
    runtime_owner: string;
    adapter_role: string;
    first_consumer: string;
    accepted_request_surfaces: string[];
    normalized_request_surface: string;
    required_fields: string[];
    fail_closed_reasons: string[];
    forbidden_domain_adapter_outputs: string[];
    authority_boundary: JsonRecord;
  };
  stage_route_false_authority_flags: JsonRecord;
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

const MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES = [
  'memory_receipt_ref',
  'memory_writeback_receipt_ref',
  'artifact_mutation_receipt_ref',
  'package_lifecycle_receipt_ref',
  'export_lifecycle_receipt_ref',
  'cleanup_restore_retention_receipt_ref',
  'typed_blocker_ref',
  'owner_acceptance_ref',
];

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
    lane_id: 'opl-generated-hosted-consumption-guard-20260621',
    repo: 'one-person-lab',
    priority: 'P0',
    milestone_ids: ['domain_pack_generated_hosted_surfaces'],
    lane_status: 'structure_gate_closeout_lane_non_live_evidence',
    write_set_class: 'opl_domain_pack_generated_hosted_consumption_readback_guard',
    required_surfaces: [
      'source',
      'contract',
      'CLI_readback',
      'API_readback',
      'docs',
      'tests',
    ],
    non_live_completion_evidence_required: [
      'framework_tranche_backlog_consumes_domain_pack_compiler_family_defaults_readback',
      'framework_tranche_backlog_consumes_generated_agent_interfaces_family_defaults_readback',
      'generated_surface_consumption_bundle_counts_and_active_caller_cutover_refs_are_visible',
      'false_ready_guard_blocks_domain_ready_app_rendering_production_ready_and_physical_delete_claims',
      'framework_cli_surface_tests_typecheck_and_smoke_pass',
      'main_absorbed_push_and_remote_sha_readback',
    ],
    deferred_evidence: [
      'real_default_caller_cutover_scaleout',
      'domain_owner_acceptance_refs',
      'direct_skill_path_consumption',
      'App_operator_functional_path_consumption',
      'physical_delete_owner_receipt_for_domain_wrappers',
      'App_GUI_live_rendering_evidence',
      'App_operator_sustained_consumption',
      ...DEFERRED_LIVE_EVIDENCE,
    ],
    forbidden_scope: [
      'domain_truth_write',
      'physical_delete_authorization',
      'owner_receipt_or_typed_blocker_authority',
      'default_caller_cutover_or_scaleout_claim',
      'App_live_rendering_complete_claim',
      'domain_or_production_ready_claim',
      'support_repo_truth_owner_claim',
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
      'contracts/opl-framework/stage-route-scheduler-contract.json#stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice',
      'contracts/opl-framework/target-operating-architecture-contract.json',
      'src/runtime-environment-substrate.ts',
      'src/family-runtime-domain-progress-transition-runtime.ts',
      'src/family-runtime-domain-progress-transition-runtime-parts/policy-adapter.ts',
      'src/framework-readiness.ts',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: DEFERRED_LIVE_EVIDENCE,
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  },
  {
    milestone_id: 'domain_pack_generated_hosted_surfaces',
    priority: 'P0',
    state: 'closed_structure_gate',
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
    state: 'closed_structure_gate',
    owner_repos: ['med-autogrant', 'redcube-ai', 'opl-meta-agent'],
    lane_role:
      'Thin or retire private wrapper residue with source-purity gates, no-active-caller proof, tombstone/provenance, and false-ready guards.',
    current_truth_refs: [
      'med-autogrant:contracts/private_functional_surface_policy.json#/physical_source_morphology_policy/retirement_readback_cleanup_guard',
      'med-autogrant:src/med_autogrant/opl_standard_pack_source_policy.py',
      'med-autogrant:tests/product_entry_cases/test_physical_morphology_guard.py',
      'med-autogrant:docs/active/opl-private-implementation-migration-inventory.md',
      'redcube-ai:contracts/physical_source_morphology_policy.json',
      'redcube-ai:tests/opl-agent-pack-contracts-source-morphology.test.ts',
      'redcube-ai:tests/rca-legacy-name-allowance.test.ts',
      'redcube-ai:docs/active/opl-private-implementation-migration-inventory.md',
      'redcube-ai:docs/active/rca-ideal-state-gap-plan.md',
      'opl-meta-agent:contracts/script_to_pack_gate_receipt.json#script_morphology_policy.retirement_readback_cleanup_guard',
      'opl-meta-agent:runtime/authority_functions/meta-agent-authority-functions.json#script_morphology_policy',
      'opl-meta-agent:runtime/authority_functions/meta-agent-authority-functions.parts/script_morphology_policy/root.json',
      'opl-meta-agent:tests/source-purity.test.ts',
      'opl-meta-agent:docs/active/opl-private-implementation-migration-inventory.md',
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
    milestone_id: 'memory_artifact_lifecycle_functional_boundary',
    priority: 'P0',
    state: 'partial',
    owner_repos: ['one-person-lab'],
    lane_role:
      'Keep memory/artifact/lifecycle as refs-only intake, evidence readback, and owner-route work-order projection without body authority.',
    current_truth_refs: [
      'src/memory-artifact-lifecycle-evidence-ledger.ts',
      'src/memory-artifact-lifecycle-readback.ts',
      'src/runtime-tray-app-operator-drilldown-parts/memory-artifact-lifecycle-evidence.ts',
      'src/cli/cases/runtime-memory-artifact-lifecycle-evidence-command-spec.ts',
      'docs/active/current-state-vs-ideal-gap.md',
    ],
    non_live_evidence_acceptance: NON_LIVE_ACCEPTANCE,
    deferred_evidence: [
      'domain_memory_receipt_followthrough',
      'artifact_mutation_receipt_followthrough',
      'package_export_owner_acceptance',
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

function stringOrNumberField(
  record: JsonRecord,
  key: string,
  filePath: string,
): string | number {
  const value = record[key];
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Contract field "${key}" must be a string or number.`,
    { file: filePath, field: key },
  );
}

function sameStringSet(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return left.length === right.length
    && left.every((entry) => rightSet.has(entry))
    && right.every((entry) => leftSet.has(entry));
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

function frameworkReadbackUnavailable(
  error: unknown,
  sourceCommand: string,
): FamilyReadbackUnavailable {
  return {
    status: 'blocked_unavailable',
    error_code: error instanceof FrameworkContractError ? error.code : 'readback_unavailable',
    error_message: error instanceof Error ? error.message : 'Family-default readback is unavailable.',
    source_command: sourceCommand,
  };
}

function readDomainPackCompilerFamilyReadback(
  contracts: FrameworkContracts,
): DomainPackCompilerFamilyReadback {
  const sourceCommand = 'opl agents pack-compiler --family-defaults --json';
  try {
    const readback = buildDomainPackCompilerList(contracts, { familyDefaults: true });
    const packCompiler = recordField(
      readback as unknown as JsonRecord,
      'domain_pack_compiler',
      sourceCommand,
    );
    return {
      status: 'available',
      source_command: sourceCommand,
      source_kind: stringField(packCompiler, 'source_kind', sourceCommand),
      summary: recordField(packCompiler, 'summary', sourceCommand),
      authority_boundary: recordField(packCompiler, 'authority_boundary', sourceCommand),
    };
  } catch (error) {
    return frameworkReadbackUnavailable(error, sourceCommand);
  }
}

function generatedInterfaceReports(readback: JsonRecord, sourceCommand: string) {
  const interfaces = recordField(readback, 'generated_agent_interfaces', sourceCommand);
  const reports = interfaces.reports;
  if (!Array.isArray(reports)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Generated agent interfaces family readback must contain reports.',
      { file: sourceCommand, field: 'generated_agent_interfaces.reports' },
    );
  }
  return {
    interfaces,
    reports: reports.filter(isRecord),
  };
}

function collectGeneratedInterfaceReadbackDetails(reports: JsonRecord[]) {
  const consumptionBundles = reports
    .map((report) => (
      isRecord(report.generated_agent_interfaces)
        ? recordField(report.generated_agent_interfaces, 'generated_surface_consumption_bundle', 'generated_agent_interfaces')
        : null
    ))
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const countRecords = consumptionBundles
    .map((bundle) => recordField(bundle, 'consumption_status_counts', 'generated_surface_consumption_bundle'));
  const consumerSurfaceIds = [
    ...new Set(consumptionBundles.flatMap((bundle) =>
      stringArrayField(bundle, 'consumer_surface_ids', 'generated_surface_consumption_bundle')
    )),
  ];
  const generatedInterfaceRecords = reports
    .map((report) => (
      isRecord(report.generated_agent_interfaces) ? report.generated_agent_interfaces : null
    ))
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const activeCallerCutoverStatuses = [
    ...new Set(generatedInterfaceRecords
      .map((record) => {
        const proof = isRecord(record.active_caller_cutover_proof)
          ? record.active_caller_cutover_proof
          : null;
        return typeof proof?.status === 'string' ? proof.status : null;
      })
      .filter((entry): entry is string => Boolean(entry))),
  ];
  const generatedWrapperBundleStatuses = [
    ...new Set(generatedInterfaceRecords
      .map((record) => {
        const bundle = isRecord(record.generated_wrapper_bundle)
          ? record.generated_wrapper_bundle
          : null;
        return typeof bundle?.status === 'string' ? bundle.status : null;
      })
      .filter((entry): entry is string => Boolean(entry))),
  ];

  return {
    consumption_status_counts: {
      selected: countRecords.reduce((total, counts) =>
        total + Number(counts.selected ?? 0), 0),
      ready: countRecords.reduce((total, counts) =>
        total + Number(counts.ready ?? 0), 0),
      blocked: countRecords.reduce((total, counts) =>
        total + Number(counts.blocked ?? 0), 0),
    },
    consumer_surface_ids: consumerSurfaceIds,
    active_caller_cutover_statuses: activeCallerCutoverStatuses,
    generated_wrapper_bundle_statuses: generatedWrapperBundleStatuses,
    domain_generated_surface_owner_claim_count: generatedInterfaceRecords.filter((record) =>
      record.domain_repo_can_own_generated_surface === true
    ).length,
  };
}

function readGeneratedInterfacesFamilyReadback(
  contracts: FrameworkContracts,
): GeneratedInterfacesFamilyReadback {
  const sourceCommand = 'opl agents interfaces --family-defaults --json';
  try {
    const readback = buildGeneratedAgentInterfaces(contracts, ['--family-defaults']);
    const { interfaces, reports } = generatedInterfaceReports(
      readback as unknown as JsonRecord,
      sourceCommand,
    );
    return {
      status: 'available',
      source_command: sourceCommand,
      selected_format: stringField(interfaces, 'selected_format', sourceCommand),
      summary: recordField(interfaces, 'summary', sourceCommand),
      ...collectGeneratedInterfaceReadbackDetails(reports),
      authority_boundary: recordField(interfaces, 'authority_boundary', sourceCommand),
    };
  } catch (error) {
    return frameworkReadbackUnavailable(error, sourceCommand);
  }
}

function readDomainProgressRuntimeFirstSliceContract(
  contractsDir: string,
): DomainProgressRuntimeFirstSliceContractSubset {
  const filePath = path.join(contractsDir, 'stage-route-scheduler-contract.json');
  const parsed = readJsonObject(filePath, 'stage-route-scheduler-contract.json');
  const arbiter = recordField(parsed, 'stage_route_arbiter_substrate_contract', filePath);
  const slice = recordField(arbiter, 'domain_progress_transition_runtime_first_slice', filePath);
  const physicalPersistence = recordField(slice, 'physical_persistence_refs', filePath);
  const policyAdapter = recordField(slice, 'policy_adapter_contract', filePath);

  return {
    contract_kind: stringField(parsed, 'contract_kind', filePath),
    owner: stringField(parsed, 'owner', filePath),
    surface_kind: stringField(slice, 'surface_kind', filePath),
    schema_version: stringOrNumberField(slice, 'schema_version', filePath),
    status: stringField(slice, 'status', filePath),
    purpose: stringField(slice, 'purpose', filePath),
    implementation_refs: recordField(slice, 'implementation_refs', filePath),
    physical_persistence_refs: physicalPersistence,
    runtime_live_readback_contract:
      recordField(physicalPersistence, 'runtime_live_readback_contract', filePath),
    brand_module_partition: recordField(slice, 'brand_module_partition', filePath),
    allowed_transition_decisions:
      stringArrayField(slice, 'allowed_transition_decisions', filePath),
    decision_surface_policy: recordField(slice, 'decision_surface_policy', filePath),
    not_complete_claims: stringArrayField(slice, 'not_complete_claims', filePath),
    policy_adapter_contract: {
      surface_kind: stringField(policyAdapter, 'surface_kind', filePath),
      runtime_id: stringField(policyAdapter, 'runtime_id', filePath),
      runtime_owner: stringField(policyAdapter, 'runtime_owner', filePath),
      adapter_role: stringField(policyAdapter, 'adapter_role', filePath),
      first_consumer: stringField(policyAdapter, 'first_consumer', filePath),
      accepted_request_surfaces:
        stringArrayField(policyAdapter, 'accepted_request_surfaces', filePath),
      normalized_request_surface:
        stringField(policyAdapter, 'normalized_request_surface', filePath),
      required_fields: stringArrayField(policyAdapter, 'required_fields', filePath),
      fail_closed_reasons:
        stringArrayField(policyAdapter, 'fail_closed_reasons', filePath),
      forbidden_domain_adapter_outputs:
        stringArrayField(policyAdapter, 'forbidden_domain_adapter_outputs', filePath),
      authority_boundary: recordField(policyAdapter, 'authority_boundary', filePath),
    },
    stage_route_false_authority_flags:
      recordField(arbiter, 'false_authority_flags', filePath),
  };
}

function readRuntimeEnvironmentSubstrateContract(
  contractsDir: string,
): RuntimeEnvironmentSubstrateContractSubset {
  const filePath = path.join(contractsDir, 'runtime-environment-substrate-contract.json');
  const parsed = readJsonObject(filePath, 'runtime-environment-substrate-contract.json');
  const ordinaryPath = recordField(parsed, 'ordinary_path', filePath);

  return {
    contract_id: stringField(parsed, 'contract_id', filePath),
    schema_version: stringField(parsed, 'schema_version', filePath),
    owner: stringField(parsed, 'owner', filePath),
    state: stringField(parsed, 'state', filePath),
    implementation_status: stringField(parsed, 'implementation_status', filePath),
    target_planned: booleanField(parsed, 'target_planned', filePath),
    ordinary_path: {
      input: stringField(ordinaryPath, 'input', filePath),
      steps: stringArrayField(ordinaryPath, 'steps', filePath),
      default_mode: stringField(ordinaryPath, 'default_mode', filePath),
      domain_agents_declare_dependency_intent_only: booleanField(
        ordinaryPath,
        'domain_agents_declare_dependency_intent_only',
        filePath,
      ),
    },
    materialization_policy: recordField(parsed, 'materialization_policy', filePath),
    cache_policy: recordField(parsed, 'cache_policy', filePath),
    cache_inventory_policy: recordField(parsed, 'cache_inventory_policy', filePath),
    dependency_prepare_policy: recordField(parsed, 'dependency_prepare_policy', filePath),
    run_context_consumer_policy: recordField(parsed, 'run_context_consumer_policy', filePath),
    authority_boundary: recordField(parsed, 'authority_boundary', filePath),
    required_readback_claim_fields: stringArrayField(parsed, 'required_readback_claim_fields', filePath),
    readback_commands: stringArrayField(parsed, 'readback_commands', filePath),
    forbidden_claims: stringArrayField(parsed, 'forbidden_claims', filePath),
    live_evidence_deferred: stringArrayField(parsed, 'live_evidence_deferred', filePath),
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

function buildDomainProgressTransitionRuntimeGuardReadback(contracts: FrameworkContracts) {
  const firstSlice = readDomainProgressRuntimeFirstSliceContract(contracts.contractsDir);
  const sourcePolicy = DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT;
  const policyAdapterContract = firstSlice.policy_adapter_contract;
  return {
    surface_kind: 'opl_domain_progress_transition_runtime_guard_readback',
    readback_role:
      'domain_progress_transition_runtime_policy_adapter_boundary_not_domain_ready_not_live_evidence',
    owner: 'one-person-lab',
    source_contract_ref:
      'contracts/opl-framework/stage-route-scheduler-contract.json#stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice',
    source_api_readback_refs: [
      'normalizeDomainProgressTransitionCommand',
      'buildDomainProgressTransitionRuntimeResult',
      'appendDomainProgressTransitionRuntimeResultJsonl',
      'readDomainProgressTransitionRuntimeReadbackJsonl',
      'auditDomainProgressTransitionReplay',
      'normalizeDomainProgressPolicyAdapterRequest',
    ],
    source_cli_readback_refs: [
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.domain_progress_transition_runtime_guard',
      'opl family-runtime current-control provider-admission readback carries opl_domain_progress_transition_runtime_live_readback',
    ],
    contract_identity: {
      contract_kind: firstSlice.contract_kind,
      owner: firstSlice.owner,
      surface_kind: firstSlice.surface_kind,
      schema_version: firstSlice.schema_version,
      status: firstSlice.status,
    },
    runtime_identity: {
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      runtime_owner: 'one-person-lab',
      module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
      not_a_new_brand_module: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.not_a_new_brand_module,
    },
    implementation_refs: { ...firstSlice.implementation_refs },
    physical_persistence_refs: {
      runtime_log_read_api: firstSlice.physical_persistence_refs.runtime_log_read_api,
      runtime_log_append_api: firstSlice.physical_persistence_refs.runtime_log_append_api,
      idempotency_readback_api: firstSlice.physical_persistence_refs.idempotency_readback_api,
      runtime_live_readback_api: firstSlice.physical_persistence_refs.runtime_live_readback_api,
      replay_audit_api: firstSlice.physical_persistence_refs.replay_audit_api,
      storage_contract: firstSlice.physical_persistence_refs.storage_contract,
      focused_test: firstSlice.physical_persistence_refs.focused_test,
      live_readback_contract: {
        complete_transaction_status:
          firstSlice.runtime_live_readback_contract.complete_transaction_status,
        incomplete_transaction_status:
          firstSlice.runtime_live_readback_contract.incomplete_transaction_status,
        complete_transaction_requires:
          firstSlice.runtime_live_readback_contract.complete_transaction_requires,
        incomplete_transaction_fail_closed_reason:
          firstSlice.runtime_live_readback_contract.incomplete_transaction_fail_closed_reason,
        incomplete_transaction_outcome_kind:
          firstSlice.runtime_live_readback_contract.incomplete_transaction_outcome_kind,
        projection_metadata_complete_role:
          firstSlice.runtime_live_readback_contract.projection_metadata_complete_role,
        projection_metadata_incomplete_role:
          firstSlice.runtime_live_readback_contract.projection_metadata_incomplete_role,
        projection_metadata_consumable_only_when_transaction_complete:
          firstSlice.runtime_live_readback_contract
            .projection_metadata_consumable_only_when_transaction_complete,
        replay_audit_consumable_only_when_complete:
          firstSlice.runtime_live_readback_contract.replay_audit_consumable_only_when_complete,
        authority_boundary:
          firstSlice.runtime_live_readback_contract.authority_boundary,
      },
    },
    brand_module_partition: { ...firstSlice.brand_module_partition },
    allowed_transition_decisions: [...firstSlice.allowed_transition_decisions],
    decision_surface_policy: { ...firstSlice.decision_surface_policy },
    not_complete_claims: [...firstSlice.not_complete_claims],
    policy_adapter_contract: {
      ...policyAdapterContract,
      source_export_surface_kind: sourcePolicy.surface_kind,
      source_export_runtime_id: sourcePolicy.runtime_id,
      source_export_request_surfaces: [...sourcePolicy.request_surfaces],
      source_export_domain_repo_must_not_create: [
        ...sourcePolicy.domain_repo_must_not_create,
      ],
      source_export_matches_stage_route_scheduler_contract:
        sourcePolicy.surface_kind === policyAdapterContract.surface_kind
        && sourcePolicy.runtime_id === policyAdapterContract.runtime_id
        && sourcePolicy.runtime_owner === policyAdapterContract.runtime_owner
        && sourcePolicy.adapter_role === policyAdapterContract.adapter_role
        && sourcePolicy.first_consumer === policyAdapterContract.first_consumer
        && sameStringSet(
          [...sourcePolicy.request_surfaces],
          policyAdapterContract.accepted_request_surfaces,
        )
        && sourcePolicy.provider_completion_is_domain_ready
          === policyAdapterContract.authority_boundary.provider_completion_is_domain_ready
        && sourcePolicy.opl_runtime_can_write_domain_truth
          === policyAdapterContract.authority_boundary.opl_runtime_can_write_domain_truth,
    },
    authority_boundary: {
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      runtime_can_write_domain_truth: false,
      runtime_can_write_memory_body: false,
      runtime_can_mutate_artifact_body: false,
      runtime_can_sign_owner_receipt: false,
      runtime_can_create_typed_blocker: false,
      runtime_can_authorize_quality_verdict: false,
      runtime_can_authorize_publication_ready: false,
      policy_adapter_can_create_opl_outbox_record:
        policyAdapterContract.authority_boundary.adapter_can_create_opl_outbox_record,
      policy_adapter_can_create_owner_receipt:
        policyAdapterContract.authority_boundary.adapter_can_create_owner_receipt,
      policy_adapter_can_create_typed_blocker:
        policyAdapterContract.authority_boundary.adapter_can_create_typed_blocker,
      provider_completion_is_domain_ready:
        policyAdapterContract.authority_boundary.provider_completion_is_domain_ready,
      provider_completion_is_domain_completion:
        policyAdapterContract.authority_boundary.provider_completion_is_domain_completion,
      readback_guard_can_claim_provider_long_soak_complete: false,
      readback_guard_can_claim_live_evidence_complete: false,
    },
    false_ready_guard: {
      complete_transaction_can_claim_domain_ready: false,
      complete_transaction_can_claim_publication_ready: false,
      read_model_projection_consumable_can_claim_domain_progress: false,
      replay_audit_ready_can_claim_provider_long_soak_complete: false,
      non_advancing_apply_can_claim_paper_progress: false,
      human_gate_resume_token_can_make_human_decision: false,
      policy_adapter_valid_can_claim_owner_receipt: false,
      policy_adapter_valid_can_create_typed_blocker: false,
      provider_completion_can_claim_domain_ready:
        policyAdapterContract.authority_boundary.provider_completion_is_domain_ready,
      stage_route_false_authority_flags: {
        ...firstSlice.stage_route_false_authority_flags,
      },
    },
  };
}

function buildRuntimeEnvironmentSubstrateGuardReadback(contracts: FrameworkContracts) {
  const runtimeEnvironment = readRuntimeEnvironmentSubstrateContract(contracts.contractsDir);
  return {
    surface_kind: 'opl_runtime_environment_substrate_guard_readback',
    readback_role:
      'runtime_environment_substrate_owner_policy_not_domain_ready_not_live_evidence_not_app_release_ready',
    owner: 'one-person-lab',
    source_contract_ref:
      'contracts/opl-framework/runtime-environment-substrate-contract.json#opl-runtime-environment-substrate.v1',
    source_cli_readback_refs: [
      'opl runtime env contract --json .runtime_environment.contract',
      'opl runtime env inspect --domain <domain> --profile <profile> --platform <platform> --json',
      'opl runtime env materialize --domain <domain> --profile <profile> --platform <platform> --apply --json',
      'opl runtime env verify --runtime-root <path> --json',
      'opl runtime env cache inventory --json',
      'opl runtime env cache prune --apply --json',
      'opl runtime env run-context --domain <domain> --profile <profile> --json',
    ],
    contract_identity: {
      contract_id: runtimeEnvironment.contract_id,
      schema_version: runtimeEnvironment.schema_version,
      owner: runtimeEnvironment.owner,
      state: runtimeEnvironment.state,
      implementation_status: runtimeEnvironment.implementation_status,
      target_planned: runtimeEnvironment.target_planned,
    },
    ordinary_path: {
      ...runtimeEnvironment.ordinary_path,
      ordinary_path_can_schedule_domain_stage: false,
      ordinary_path_can_write_domain_truth: false,
    },
    materialization_policy: {
      default_command_mode: runtimeEnvironment.materialization_policy.default_command_mode,
      writes_development_checkout: runtimeEnvironment.materialization_policy.writes_development_checkout,
      writes_domain_repo: runtimeEnvironment.materialization_policy.writes_domain_repo,
      materializer_landed: runtimeEnvironment.materialization_policy.materializer_landed,
      writes_runtime_root_only_with_apply:
        runtimeEnvironment.materialization_policy.writes_runtime_root_only_with_apply,
      materialization_receipt_required:
        runtimeEnvironment.materialization_policy.materialization_receipt_required,
      protect_current_and_rollback_pointers:
        runtimeEnvironment.materialization_policy.protect_current_and_rollback_pointers,
      cleanup_apply_requires_receipt:
        runtimeEnvironment.materialization_policy.cleanup_apply_requires_receipt,
    },
    cache_policy: {
      cache_key_inputs: runtimeEnvironment.cache_policy.cache_key_inputs,
      cache_hit_counts_as_ready: runtimeEnvironment.cache_policy.cache_hit_counts_as_ready,
      cache_miss_counts_as_readiness_failure:
        runtimeEnvironment.cache_policy.cache_miss_counts_as_readiness_failure,
      materialization_failure_counts_as_runtime_environment_failure:
        runtimeEnvironment.cache_policy.materialization_failure_counts_as_runtime_environment_failure,
    },
    cache_inventory_policy: {
      status: runtimeEnvironment.cache_inventory_policy.status,
      inventory_may_be_empty_without_failure:
        runtimeEnvironment.cache_inventory_policy.inventory_may_be_empty_without_failure,
      prune_apply_requires_materialization_receipt:
        runtimeEnvironment.cache_inventory_policy.prune_apply_requires_materialization_receipt,
      deletes_domain_artifacts: runtimeEnvironment.cache_inventory_policy.deletes_domain_artifacts,
      deletes_development_checkout: runtimeEnvironment.cache_inventory_policy.deletes_development_checkout,
    },
    dependency_prepare_policy: {
      status: runtimeEnvironment.dependency_prepare_policy.status,
      writes_dependency_lock: runtimeEnvironment.dependency_prepare_policy.writes_dependency_lock,
      writes_dependency_receipt: runtimeEnvironment.dependency_prepare_policy.writes_dependency_receipt,
      writes_run_context_on_success:
        runtimeEnvironment.dependency_prepare_policy.writes_run_context_on_success,
      run_context_consumer_preflight:
        runtimeEnvironment.dependency_prepare_policy.run_context_consumer_preflight,
      run_context_identity_required:
        runtimeEnvironment.dependency_prepare_policy.run_context_identity_required,
      dependency_lock_counts_as_materialized_runtime_lock:
        runtimeEnvironment.dependency_prepare_policy.dependency_lock_counts_as_materialized_runtime_lock,
      installs_packages: runtimeEnvironment.dependency_prepare_policy.installs_packages,
      host_environment_fallback_allowed:
        runtimeEnvironment.dependency_prepare_policy.host_environment_fallback_allowed,
      writes_domain_truth: runtimeEnvironment.dependency_prepare_policy.writes_domain_truth,
      writes_runtime_root: runtimeEnvironment.dependency_prepare_policy.writes_runtime_root,
      can_claim_provider_ready:
        runtimeEnvironment.dependency_prepare_policy.can_claim_provider_ready,
      can_claim_runtime_ready: runtimeEnvironment.dependency_prepare_policy.can_claim_runtime_ready,
      can_claim_domain_ready: runtimeEnvironment.dependency_prepare_policy.can_claim_domain_ready,
      can_claim_publication_ready:
        runtimeEnvironment.dependency_prepare_policy.can_claim_publication_ready,
    },
    run_context_consumer_policy: {
      ...runtimeEnvironment.run_context_consumer_policy,
    },
    required_readback_claim_fields: [...runtimeEnvironment.required_readback_claim_fields],
    readback_commands: [...runtimeEnvironment.readback_commands],
    forbidden_claims: [...runtimeEnvironment.forbidden_claims],
    live_evidence_deferred: [...runtimeEnvironment.live_evidence_deferred],
    authority_boundary: {
      ...runtimeEnvironment.authority_boundary,
      runtime_environment_guard_can_claim_plan_completion: false,
      runtime_environment_guard_can_claim_provider_long_soak_complete: false,
      runtime_environment_guard_can_claim_live_evidence_complete: false,
    },
    false_ready_guard: {
      cache_hit_counts_as_ready: runtimeEnvironment.cache_policy.cache_hit_counts_as_ready,
      cache_miss_counts_as_readiness_failure:
        runtimeEnvironment.cache_policy.cache_miss_counts_as_readiness_failure,
      descriptor_exists_can_claim_runtime_materialized: false,
      run_context_exists_can_claim_provider_ready: false,
      missing_run_context_allows_host_environment_fallback: false,
      run_context_target_mismatch_allows_consumer_execution: false,
      materialization_skeleton_can_claim_runtime_ready: false,
      materialization_receipt_can_claim_domain_ready: false,
      verification_receipt_can_claim_app_release_ready: false,
      runtime_environment_receipt_can_claim_owner_receipt: false,
      runtime_environment_readback_can_create_typed_blocker: false,
      runtime_environment_readback_can_schedule_domain_stage: false,
      runtime_environment_guard_can_claim_production_ready: false,
    },
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
  const packCompilerFamilyReadback = readDomainPackCompilerFamilyReadback(contracts);
  const generatedInterfacesFamilyReadback = readGeneratedInterfacesFamilyReadback(contracts);
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
    source_api_readback_refs: [
      'buildDomainPackCompilerList({ familyDefaults: true })',
      "buildGeneratedAgentInterfaces(['--family-defaults'])",
      'buildGeneratedSurfaceConsumptionBundle',
      'buildActiveCallerTargetProof',
    ],
    source_cli_readback_refs: [
      'opl agents pack-compiler --family-defaults --json',
      'opl agents interfaces --family-defaults --json',
      'opl agents interfaces --family-defaults --format product-entry --json',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.generated_hosted_surface_boundary',
    ],
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
    generated_surface_consumption_guard: {
      surface_kind: 'opl_generated_surface_consumption_guard_readback',
      readback_role:
        'family_default_generated_surface_consumption_counts_not_domain_ready_not_live_app_rendering',
      owner: 'one-person-lab',
      domain_pack_compiler_family_readback: packCompilerFamilyReadback,
      generated_interfaces_family_readback: generatedInterfacesFamilyReadback,
      selected_consumer_surface_ids:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.consumer_surface_ids]
          : [],
      selected_format_consumption_status:
        generatedInterfacesFamilyReadback.status === 'available'
          ? 'family_default_all_formats_consumption_readback_available'
          : 'blocked_family_default_interfaces_unavailable',
      active_caller_cutover_statuses:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.active_caller_cutover_statuses]
          : [],
      generated_wrapper_bundle_statuses:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.generated_wrapper_bundle_statuses]
          : [],
      domain_generated_surface_owner_claim_count:
        generatedInterfacesFamilyReadback.status === 'available'
          ? generatedInterfacesFamilyReadback.domain_generated_surface_owner_claim_count
          : null,
      family_default_pack_compiler_status:
        packCompilerFamilyReadback.status === 'available'
          ? 'family_default_pack_compiler_readback_available'
          : 'blocked_family_default_pack_compiler_unavailable',
      family_default_interfaces_status:
        generatedInterfacesFamilyReadback.status === 'available'
          ? 'family_default_generated_interfaces_readback_available'
          : 'blocked_family_default_generated_interfaces_unavailable',
      authority_boundary: {
        consumption_guard_can_write_domain_truth: false,
        consumption_guard_can_sign_owner_receipt: false,
        consumption_guard_can_create_typed_blocker: false,
        consumption_guard_can_authorize_physical_delete: false,
        consumption_guard_can_claim_default_caller_cutover: false,
        consumption_guard_can_claim_app_live_rendering_complete: false,
        consumption_guard_can_claim_domain_ready: false,
        consumption_guard_can_claim_production_ready: false,
      },
    },
    structural_closeout_guard: {
      milestone_id: 'domain_pack_generated_hosted_surfaces',
      status: 'closed_structure_gate_not_live_evidence',
      required_current_truth_surfaces: [
        'domain-pack-compiler-contract.generated_interface_bundle',
        'opl agents pack-compiler --family-defaults --json',
        'opl agents interfaces --family-defaults --json',
        'generated_surface_consumption_bundle',
        'active_caller_cutover_proof',
      ],
      can_close_non_live_structure_gate:
        packCompilerFamilyReadback.status === 'available'
        && generatedInterfacesFamilyReadback.status === 'available',
      cannot_claim: [
        'domain_ready',
        'production_ready',
        'App_live_rendering_complete',
        'default_caller_live_scaleout',
        'physical_delete_authorized',
        'owner_receipt_signed',
        'typed_blocker_created',
        'full_goal_complete',
      ],
    },
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
      generated_consumption_bundle_ready_can_claim_domain_ready: false,
      generated_consumption_bundle_ready_can_claim_default_caller_cutover: false,
      generated_consumption_bundle_ready_can_claim_App_GUI_complete: false,
      family_default_pack_compiler_ready_can_claim_domain_ready: false,
      app_projection_can_claim_live_rendering_complete: false,
      support_profile_clean_can_claim_foundry_agent_truth: false,
      default_caller_evidence_worklist_can_authorize_physical_delete: false,
    },
  };
}

function buildMemoryArtifactLifecycleBoundaryGuardReadback() {
  const evidenceAuthority = memoryArtifactLifecycleEvidenceAuthorityBoundary();
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_boundary_guard_readback',
    readback_role:
      'memory_artifact_lifecycle_refs_only_boundary_not_memory_ready_not_artifact_ready_not_package_export_ready',
    owner: 'one-person-lab',
    target_surface: 'memory_artifact_lifecycle',
    source_refs: [
      'src/memory-artifact-lifecycle-evidence-ledger.ts',
      'src/memory-artifact-lifecycle-readback.ts',
      'src/runtime-tray-app-operator-drilldown-parts/memory-artifact-lifecycle-evidence.ts',
      'src/cli/cases/runtime-memory-artifact-lifecycle-evidence-command-spec.ts',
    ],
    source_api_readback_refs: [
      'memoryArtifactLifecycleEvidenceAuthorityBoundary',
      'buildMemoryArtifactLifecycleEvidenceProjection',
      'buildMemoryArtifactLifecycleReadback',
      'buildMemoryArtifactLifecycleEvidence',
      'recordMemoryArtifactLifecycleEvidenceReceipts',
      'verifyMemoryArtifactLifecycleEvidenceReceipt',
      'listMemoryArtifactLifecycleEvidenceReceipts',
    ],
    source_cli_readback_refs: [
      'opl runtime memory-artifact-lifecycle-evidence record|verify|list --json',
      'opl runtime memory-artifact-lifecycle --json .memory_artifact_lifecycle_readback',
      'opl runtime app-operator-drilldown --json .app_operator_drilldown.memory_artifact_lifecycle',
      'opl framework operating-maturity --family-defaults --json .framework_operating_maturity.memory_artifact_lifecycle',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.memory_artifact_lifecycle_boundary_guard',
    ],
    evidence_intake_policy: {
      refs_only: true,
      ledger_surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger',
      receipt_surface_kind: 'opl_memory_artifact_lifecycle_evidence_receipt',
      record_command_writes_opl_state_ledger_only: true,
      verify_command_marks_refs_only_receipt_only: true,
      record_or_verify_command_can_write_memory_body: false,
      record_or_verify_command_can_mutate_artifact_body: false,
      record_or_verify_command_can_create_owner_receipt: false,
      record_or_verify_command_can_create_typed_blocker: false,
      accepted_refs_only_result_shapes: [...MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES],
    },
    projection_policy: {
      readback_surface_kind: 'opl_memory_artifact_lifecycle_readback',
      app_drilldown_surface_kind: 'opl_app_drilldown_memory_artifact_lifecycle_evidence',
      projection_source:
        'runtime_app_operator_drilldown_plus_refs_only_evidence_projection',
      owner_work_order_surface_kind: 'opl_memory_artifact_lifecycle_owner_work_order',
      owner_work_order_lane_id: 'memory_artifact_lifecycle_apply',
      next_required_owner_action:
        'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
      open_count_zero_authorizes_ready_claim: false,
      verified_refs_only_ledger_authorizes_ready_claim: false,
      typed_blocker_ref_without_owner_followthrough_closes_lane: false,
      owner_acceptance_ref_without_owner_native_receipt_closes_domain_ready: false,
    },
    workspace_transport_policy: {
      workspace_artifact_lifecycle_transport_ref:
        'opl workspace artifact-lifecycle --workspace <path> --project-id <id> --apply',
      source_handoff_ref: 'handoff/review-repair-transport.json',
      materialized_opl_projection_ref:
        'control/opl/artifact_lifecycle/review_repair_transport.json',
      transport_is_opaque_ref_projection: true,
      transport_can_parse_repair_semantics: false,
      transport_can_claim_repair_accepted: false,
      transport_can_authorize_physical_delete: false,
    },
    accepted_refs_only_result_shapes: [...MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES],
    non_closing_inputs: [
      'app_projection',
      'verified_refs_only_ledger',
      'lifecycle_reconcile_zero_issue_count',
      'open_count_zero',
      'opl_cleanup_apply_available',
      'typed_blocker_ref_without_owner_followthrough',
      'owner_acceptance_ref_without_owner_native_receipt',
      'review_repair_transport_passed',
    ],
    forbidden_opl_claims: [
      'memory_body_saved_or_accepted',
      'memory_writeback_accepted_or_rejected',
      'artifact_body_mutated',
      'artifact_ready',
      'repair_accepted',
      'package_ready',
      'export_ready',
      'domain_ready',
      'production_ready',
      'domain_physical_delete_authorization',
    ],
    authority_boundary: {
      ...evidenceAuthority,
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      can_project_refs: true,
      can_record_refs_only_evidence: true,
      can_verify_refs_only_evidence_receipt: true,
      can_emit_owner_work_order_projection: true,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_parse_review_repair_semantics: false,
      can_authorize_repair_acceptance: false,
      can_authorize_package_readiness: false,
      can_authorize_export_readiness: false,
      can_execute_domain_physical_delete: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_memory_ready: false,
      can_claim_artifact_ready: false,
      can_claim_package_ready: false,
      can_claim_export_ready: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    false_ready_guard: {
      refs_observed_can_claim_memory_ready: false,
      refs_observed_can_claim_artifact_ready: false,
      lifecycle_reconcile_clean_can_claim_ready: false,
      open_count_zero_can_claim_memory_ready: false,
      verified_refs_only_ledger_can_claim_memory_ready: false,
      verified_refs_only_ledger_can_claim_artifact_ready: false,
      verified_refs_only_ledger_can_claim_package_ready: false,
      verified_refs_only_ledger_can_claim_export_ready: false,
      typed_blocker_ref_can_claim_lane_closed: false,
      owner_acceptance_ref_can_claim_domain_ready: false,
      review_repair_transport_passed_can_claim_repair_accepted: false,
      opl_cleanup_apply_can_authorize_physical_delete: false,
      tranche_guard_can_claim_live_evidence_complete: false,
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
      domain_progress_transition_runtime_guard:
        buildDomainProgressTransitionRuntimeGuardReadback(contracts),
      memory_artifact_lifecycle_boundary_guard:
        buildMemoryArtifactLifecycleBoundaryGuardReadback(),
      runtime_environment_substrate_guard: buildRuntimeEnvironmentSubstrateGuardReadback(contracts),
      ordinary_progress_guard: buildOrdinaryProgressGuardReadback(contracts),
      milestones: FRAMEWORK_TRANCHE_MILESTONES,
    },
  };
}
