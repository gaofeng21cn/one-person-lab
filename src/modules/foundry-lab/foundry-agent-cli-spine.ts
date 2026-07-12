import fs from 'node:fs';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';
import {
  buildEvidenceGroundedConnectSubstrate,
  listDefaultOplDomainModuleSpecs,
  parseGithubRepoFromUrl,
} from '../connect/index.ts';
import {
  buildEvidenceGroundedDecisionAgentProfileAtlasCatalog,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_REGISTRY_REF,
  resolveStandardAgent,
} from '../atlas/index.ts';
import { buildEvidenceGroundedCharterProfileBoundaryReadback } from '../charter/index.ts';
import { buildEvidenceGroundedLedgerSubstrate } from '../ledger/index.ts';
import { buildEvidenceGroundedDecisionAgentProfileReadback } from '../pack/index.ts';
import { buildEvidenceGroundedRunwayProfilePolicyReadback } from '../runway/index.ts';
import { buildEvidenceGroundedStagecraftProfilePolicyReadback } from '../stagecraft/index.ts';
import { buildEvidenceGroundedWorkspaceSubstrate } from '../workspace/index.ts';
import { buildEvidenceGroundedDecisionAgentProfileFoundryLabEvalSurface } from './evidence-grounded-profile-eval.ts';

export const FOUNDRY_AGENT_OPERATIONS = [
  'status',
  'inspect',
  'interfaces',
  'validate',
  'doctor',
  'peers',
] as const;

type FoundryAgentCliOperation = typeof FOUNDRY_AGENT_OPERATIONS[number];

const FOUNDRY_AGENT_SERIES_CONTRACT_REF = 'contracts/opl-framework/foundry-agent-series-contract.json';
const FOUNDRY_AGENT_SERIES_CONTRACT_URL = new URL(
  '../../../contracts/opl-framework/foundry-agent-series-contract.json',
  import.meta.url,
);

const FOUNDRY_AGENT_PEERS = STANDARD_AGENT_REGISTRY.filter(
  (entry) => entry.series_membership === 'standard_domain_agent',
);

type FoundryAgentPeer = typeof STANDARD_AGENT_REGISTRY[number];

export type FoundryAgentDeveloperModeTargetHint = {
  surface_kind: 'opl_foundry_agent_developer_mode_target_hint';
  target_agent_id: string;
  target_domain_id: string;
  target_series_membership: FoundryAgentPeer['series_membership'];
  target_kind: 'domain_module' | 'framework_capability_package';
  repo_permission_selector: {
    target_id: string;
    repo: string;
    repo_url: string;
    match_policy: 'target_id_then_repo_then_repo_url';
  };
  route_hints: {
    direct_write_identity_levels: ['opl_maintainer', 'target_agent_developer'];
    fork_pull_request_identity_level: 'contributor';
    manual_enable_without_target_repo_write_routes_to: 'fork_pull_request';
  };
  execution_surfaces: {
    direct_repo_fix: 'opl work-order execute';
    fork_pull_request: 'owner_or_fork_pull_request_route';
  };
  route_builder_surface: 'opl_agent_lab_developer_mode_dynamic_repair_route';
};

function buildPeerSeriesSummary(peer: FoundryAgentPeer) {
  return {
    agent_id: peer.agent_id,
    domain_id: peer.domain_id,
    label: peer.label,
    series_membership: peer.series_membership,
    brand_cli: peer.brand_cli,
    domain_alias: peer.domain_alias,
    work_alias: peer.work_alias,
    ordinary_golden_path: peer.ordinary_golden_path,
  };
}

function readString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string field: ${field}.`,
      {
        file: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
        field,
      },
    );
  }
  return value.trim();
}

function readRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing object field: ${field}.`,
      {
        file: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
        field,
      },
    );
  }
  return value;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string list field: ${field}.`,
      {
        file: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
        field,
      },
    );
  }

  return value.map((entry, index) => readString(entry, `${field}[${index}]`));
}

function readBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing boolean field: ${field}.`,
      {
        file: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
        field,
      },
    );
  }
  return value;
}

function readFoundryAgentSeriesContract() {
  const contract = parseJsonText(fs.readFileSync(FOUNDRY_AGENT_SERIES_CONTRACT_URL, 'utf8'));
  if (!isRecord(contract)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Foundry Agent series contract must contain an object root.',
      {
        file: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
      },
    );
  }
  return contract;
}

function buildSeriesRefs(contract: JsonRecord) {
  return {
    series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
    standard_agent_registry_ref: STANDARD_AGENT_REGISTRY_REF,
    domain_contract_ref: readString(
      readRecord(contract.contract_version_policy, 'contract_version_policy').domain_contract_ref,
      'contract_version_policy.domain_contract_ref',
    ),
    policy_release_ref: readString(
      readRecord(contract.shared_policy_release, 'shared_policy_release').policy_release_contract_ref,
      'shared_policy_release.policy_release_contract_ref',
    ),
    governance_ref: 'contracts/opl-framework/brand-cli-governance.json#agent_internal_modules',
  };
}

function buildAuthorityBoundary(contract: JsonRecord) {
  const authorityBoundary = readRecord(contract.authority_boundary, 'authority_boundary');
  const appProjectionPolicy = readRecord(contract.app_projection_policy, 'app_projection_policy');
  return {
    opl_owns_series_contract: readBoolean(
      authorityBoundary.opl_owns_series_contract,
      'authority_boundary.opl_owns_series_contract',
    ),
    app_owns_display_and_user_action_shell: readBoolean(
      authorityBoundary.app_owns_display_and_user_action_shell,
      'authority_boundary.app_owns_display_and_user_action_shell',
    ),
    domain_owns_truth_quality_artifact_memory_and_receipts: readBoolean(
      authorityBoundary.domain_owns_truth_quality_artifact_memory_and_receipts,
      'authority_boundary.domain_owns_truth_quality_artifact_memory_and_receipts',
    ),
    generated_surface_can_claim_domain_ready: readBoolean(
      authorityBoundary.generated_surface_can_claim_domain_ready,
      'authority_boundary.generated_surface_can_claim_domain_ready',
    ),
    generated_surface_can_claim_quality_or_export: readBoolean(
      appProjectionPolicy.app_can_claim_quality_or_export,
      'app_projection_policy.app_can_claim_quality_or_export',
    ),
    generated_surface_can_write_domain_truth: readBoolean(
      appProjectionPolicy.app_can_write_domain_truth,
      'app_projection_policy.app_can_write_domain_truth',
    ),
    generated_surface_can_create_owner_receipt: false,
    generated_surface_can_create_typed_blocker: false,
  };
}

function buildOplBaseDomainAuthorityBoundary() {
  return {
    can_ready: false,
    can_truth: false,
    can_receipt: false,
    can_blocker: false,
    can_write_domain_truth: false,
    can_authorize_quality_or_export: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
  };
}

function buildFoundryAgentStageProfile(peer: FoundryAgentPeer, contract: JsonRecord) {
  const profile = readRecord(contract.series_design_profile, 'series_design_profile');
  const domainIoProfile = readRecord(profile.domain_io_profile, 'series_design_profile.domain_io_profile');
  const closeout = readRecord(profile.shared_closeout_contract, 'series_design_profile.shared_closeout_contract');
  const authority = readRecord(profile.authority_invariants, 'series_design_profile.authority_invariants');

  return {
    surface_kind: 'opl_foundry_agent_stage_profile',
    profile_id: readString(profile.profile_id, 'series_design_profile.profile_id'),
    applies_to_agent_id: peer.agent_id,
    series_membership: peer.series_membership,
    ordinary_golden_path: peer.ordinary_golden_path,
    domain_pack_example: peer.domain_pack_example,
    stage_delivery_progress_marker: 'domain_owner_receipt_ref_or_domain_owned_typed_blocker_ref',
    lifecycle_pipeline: readStringList(
      profile.shared_lifecycle_pipeline,
      'series_design_profile.shared_lifecycle_pipeline',
    ),
    stage_pack_sections: readStringList(profile.stage_pack_sections, 'series_design_profile.stage_pack_sections'),
    input_slot: readString(domainIoProfile.input_slot, 'series_design_profile.domain_io_profile.input_slot'),
    output_slot: readString(domainIoProfile.output_slot, 'series_design_profile.domain_io_profile.output_slot'),
    default_read_root: 'current_owner_delta',
    completion_judgment_owner: readString(
      closeout.completion_judgment_owner,
      'series_design_profile.shared_closeout_contract.completion_judgment_owner',
    ),
    provider_completion_is_closeout: readBoolean(
      closeout.provider_completion_is_closeout,
      'series_design_profile.shared_closeout_contract.provider_completion_is_closeout',
    ),
    authority_boundary: {
      opl_can_infer_domain_output: readBoolean(
        authority.opl_can_infer_domain_output,
        'series_design_profile.authority_invariants.opl_can_infer_domain_output',
      ),
      opl_can_read_domain_body: readBoolean(
        authority.opl_can_read_domain_body,
        'series_design_profile.authority_invariants.opl_can_read_domain_body',
      ),
      opl_can_write_domain_truth: readBoolean(
        authority.opl_can_write_domain_truth,
        'series_design_profile.authority_invariants.opl_can_write_domain_truth',
      ),
      opl_can_authorize_quality_or_export: readBoolean(
        authority.opl_can_authorize_quality_or_export,
        'series_design_profile.authority_invariants.opl_can_authorize_quality_or_export',
      ),
    },
  };
}

function buildFoundryAgentOwnerAnswerShape(peer: FoundryAgentPeer, contract: JsonRecord) {
  const profile = readRecord(contract.series_design_profile, 'series_design_profile');
  const closeout = readRecord(profile.shared_closeout_contract, 'series_design_profile.shared_closeout_contract');

  return {
    surface_kind: 'opl_foundry_agent_owner_answer_shape',
    applies_to_agent_id: peer.agent_id,
    series_membership: peer.series_membership,
    domain_authority_owner: peer.agent_id,
    accepted_shape_ref:
      'contracts/opl-framework/target-operating-architecture-contract.json#surface_budget_compiler_policy.accepted_owner_answer_shapes',
    success_shape: readString(
      closeout.success_shape,
      'series_design_profile.shared_closeout_contract.success_shape',
    ),
    blocked_shape: readString(
      closeout.blocked_shape,
      'series_design_profile.shared_closeout_contract.blocked_shape',
    ),
    route_back_shape: readString(
      closeout.route_back_shape,
      'series_design_profile.shared_closeout_contract.route_back_shape',
    ),
    domain_authority_kernel_examples: peer.domain_authority_kernel_examples,
    opl_base_authority: buildOplBaseDomainAuthorityBoundary(),
  };
}

function buildFeedbackSelfEvolutionTrigger(peer: FoundryAgentPeer, contract: JsonRecord) {
  const policy = readRecord(
    contract.standard_feedback_self_evolution_trigger_policy,
    'standard_feedback_self_evolution_trigger_policy',
  );
  const adapterKind = peer.series_membership === 'standard_domain_agent'
    ? 'domain_thin_feedback_adapter'
    : 'framework_capability_feedback_adapter';
  return {
    surface_kind: 'opl_foundry_agent_feedback_self_evolution_trigger',
    policy_ref: `${FOUNDRY_AGENT_SERIES_CONTRACT_REF}#/standard_feedback_self_evolution_trigger_policy`,
    policy_id: readString(policy.policy_id, 'standard_feedback_self_evolution_trigger_policy.policy_id'),
    target_agent_id: peer.agent_id,
    target_domain_id: peer.domain_id,
    adapter_kind: adapterKind,
    feedbackops_event_kind: 'target_agent_feedback_external_suite',
    accepted_feedback_profile: 'target_agent_feedback_external_suite',
    idempotency_key: {
      owner: adapterKind,
      derivation: 'target_agent_id + external_suite_ref + feedback_fingerprint',
      required: true,
    },
    external_suite_ref: {
      owner: adapterKind,
      profile: 'target_agent_feedback_external_suite',
      required: true,
    },
    required_trigger_fields: [
      'feedbackops_event_kind',
      'accepted_feedback_profile',
      'target_agent_id',
      'idempotency_key',
      'external_suite_ref',
      'developer_mode_execution_gate_refs',
      'oma_evolution_skill_ref',
      'owner_closeout_readback_refs',
    ],
    trigger_chain: readStringList(policy.trigger_chain, 'standard_feedback_self_evolution_trigger_policy.trigger_chain'),
    feedback_capture_requires_developer_mode: false,
    repo_fix_execution_requires_opl_developer_mode: true,
    developer_mode_execution_gate_refs: [
      'opl-developer-mode:repo-fix-execution',
      'opl-developer-mode:direct-fix-or-fork-pr-route',
    ],
    oma_evolution_skill_ref: 'opl-meta-agent:oma-agent-evolution',
    default_oma_skill_ref: 'opl-meta-agent:oma-agent-evolution',
    status_projection_ref: 'contracts/opl-framework/agent-lab-contract.json#domain_feedback_self_evolution_surface',
    owner_closeout_readback_refs: [
      'developer_mode_projection_ref',
      'route_eligibility_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'target_owner_acceptance_or_typed_blocker_ref',
    ],
    contract_can_trigger_execution: false,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_execute_repo_patch_without_developer_mode: false,
    },
  };
}

function resolveDeveloperModeRepoTarget(peer: FoundryAgentPeer) {
  const moduleSpec = listDefaultOplDomainModuleSpecs().find((entry) => entry.module_id === peer.domain_id);
  if (!moduleSpec) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent is missing developer-mode repo target mapping: ${peer.agent_id}.`,
      {
        agent_id: peer.agent_id,
        domain_id: peer.domain_id,
      },
    );
  }
  const repo = parseGithubRepoFromUrl(moduleSpec.repo_url);
  if (!repo) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent developer-mode repo target has invalid GitHub repo URL: ${peer.agent_id}.`,
      {
        agent_id: peer.agent_id,
        repo_url: moduleSpec.repo_url,
      },
    );
  }
  return {
    target_id: moduleSpec.module_id,
    repo,
    repo_url: moduleSpec.repo_url,
    target_kind: moduleSpec.scope === 'framework_capability_package'
      ? 'framework_capability_package' as const
      : 'domain_module' as const,
  };
}

export function buildFoundryAgentDeveloperModeTargetHint(peer: FoundryAgentPeer): FoundryAgentDeveloperModeTargetHint {
  const repoTarget = resolveDeveloperModeRepoTarget(peer);
  return {
    surface_kind: 'opl_foundry_agent_developer_mode_target_hint',
    target_agent_id: peer.agent_id,
    target_domain_id: peer.domain_id,
    target_series_membership: peer.series_membership,
    target_kind: repoTarget.target_kind,
    repo_permission_selector: {
      target_id: repoTarget.target_id,
      repo: repoTarget.repo,
      repo_url: repoTarget.repo_url,
      match_policy: 'target_id_then_repo_then_repo_url',
    },
    route_hints: {
      direct_write_identity_levels: ['opl_maintainer', 'target_agent_developer'],
      fork_pull_request_identity_level: 'contributor',
      manual_enable_without_target_repo_write_routes_to: 'fork_pull_request',
    },
    execution_surfaces: {
      direct_repo_fix: 'opl work-order execute',
      fork_pull_request: 'owner_or_fork_pull_request_route',
    },
    route_builder_surface: 'opl_agent_lab_developer_mode_dynamic_repair_route',
  };
}

function buildPeerProjection(peer: FoundryAgentPeer) {
  const agentInspectCommandSurface = `opl foundry agents inspect ${peer.agent_id}`;
  const brandCliPathSafe = false;
  const foundryOperations = FOUNDRY_AGENT_OPERATIONS.map((operation) => `opl agents foundry ${operation}`);
  const cliSmoke = {
    executable_brand_cli_command_surface: brandCliPathSafe ? `${peer.brand_cli} foundry` : null,
    status_json_command: `${agentInspectCommandSurface} --json`,
    json_flag_aliases: ['--json'],
    help_smoke_commands: [
      `${agentInspectCommandSurface} --json`,
      'opl agents foundry status --json',
    ],
  };

  return {
    ...buildPeerSeriesSummary(peer),
    series: 'OPL Foundry Agent',
    series_id: 'opl_foundry_agent_series.v1',
    series_membership: peer.series_membership,
    foundry_command_surface: agentInspectCommandSurface,
    default_foundry_command_surface: agentInspectCommandSurface,
    canonical_series_command_surface: 'opl agents foundry',
    foundry_operations: foundryOperations,
    brand_cli_path_safe_executable: brandCliPathSafe,
    cli_smoke: cliSmoke,
    ordinary_spine: ['workspace', 'work', 'stage', 'run', 'ledger', 'handoff', 'connect'].map((object) => ({
      object,
      command_pattern: agentInspectCommandSurface,
      domain_alias:
        object === 'work'
          ? peer.work_alias
          : object === 'stage'
            ? 'stage'
            : null,
    })),
    work_object: {
      canonical_object: 'work',
      natural_alias: peer.work_alias,
      alias_rule: `${peer.work_alias} is a domain-specific alias for the Foundry Agent series work object.`,
    },
    connect_command_surfaces: {
      install: `opl connect install --module ${peer.domain_id}`,
      skills: `opl connect skills --domain ${peer.domain_id}`,
      sync_skills: `opl connect sync-skills --domain ${peer.domain_id}`,
    },
    mcp_projection: {
      descriptor_owner: 'one-person-lab',
      domain_repo_mcp_role: 'direct_protocol_adapter_or_proof_lane_only',
      mcp_descriptor_must_delegate_to_series_spine: true,
      standard_agent_standalone_mcp_default_enabled: false,
      all_cli_commands_are_mcp_tools: false,
    },
  };
}

function resolvePeer(agentId: string) {
  const peer = resolveStandardAgent(agentId);
  return peer?.series_membership === 'standard_domain_agent' ? peer : null;
}

function parseAgentInspectArgs(args: string[]) {
  if (args.length === 1 && args[0] && !args[0].startsWith('--')) {
    return args[0];
  }
  if (args.length === 2 && args[0] === '--agent' && args[1]) {
    return args[1];
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'foundry agents inspect requires one agent id.',
    {
      usage: 'opl foundry agents inspect <mas|mag|rca|oma|obf>',
      examples: [
        'opl foundry agents inspect mas --json',
        'opl foundry agents inspect --agent rca --json',
        'opl foundry agents inspect obf --json',
        'opl foundry agents inspect mas-scholar-skills --json',
      ],
      unexpected_args: args,
    },
  );
}

function assertNoArgs(args: string[], operation: FoundryAgentCliOperation) {
  if (args.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `agents foundry ${operation} does not accept positional arguments.`,
      {
        usage: `opl agents foundry ${operation}`,
        unexpected_args: args,
      },
    );
  }
}

function assertNoFoundryAgentArgs(args: string[], usage: string) {
  if (args.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `${usage} does not accept positional arguments.`,
      {
        usage,
        unexpected_args: args,
      },
    );
  }
}

export function buildFoundryAgentCliSpine(operation: FoundryAgentCliOperation, args: string[]) {
  assertNoArgs(args, operation);
  const contract = readFoundryAgentSeriesContract();
  const commandSurfacePolicy = readRecord(contract.agent_cli_command_surface_policy, 'agent_cli_command_surface_policy');
  const skillMcpPolicy = readRecord(contract.skill_mcp_surface_policy, 'skill_mcp_surface_policy');
  const nonStandardImplementationPolicy = readRecord(
    contract.non_standard_implementation_bucket_policy,
    'non_standard_implementation_bucket_policy',
  );
  const ordinarySpine = readStringList(
    commandSurfacePolicy.ordinary_public_command_surface_spine,
    'agent_cli_command_surface_policy.ordinary_public_command_surface_spine',
  );
  const operations = readStringList(
    commandSurfacePolicy.ordinary_operations,
    'agent_cli_command_surface_policy.ordinary_operations',
  );
  const canonicalCommandSurface = readString(
    commandSurfacePolicy.canonical_opl_command_surface,
    'agent_cli_command_surface_policy.canonical_opl_command_surface',
  );

  return {
    version: 'g2',
    foundry_agent_cli_spine: {
      surface_kind: `opl_foundry_agent_cli_${operation}`,
      operation,
      status: operation === 'doctor' ? 'pass' : 'valid',
      series_id: 'opl_foundry_agent_series.v1',
      series_label: readString(commandSurfacePolicy.agent_cli_series_label, 'agent_cli_command_surface_policy.agent_cli_series_label'),
      product_model: readString(contract.product_model, 'product_model'),
      canonical_command_surface: canonicalCommandSurface,
      ordinary_command_surface: true,
      operations,
      refs: buildSeriesRefs(contract),
      standard_agent_registry: {
        source_ref: STANDARD_AGENT_REGISTRY_REF,
        canonical_membership: 'standard_domain_agent',
        agent_ids: FOUNDRY_AGENT_PEERS.map((entry) => entry.agent_id),
      },
      series_identity: {
        version: readString(contract.version, 'version'),
        product_layer: readString(contract.product_layer, 'product_layer'),
        standard_agent_requirement: readString(contract.standard_agent_requirement, 'standard_agent_requirement'),
      },
      spine: ordinarySpine.map((object) => ({
        object,
        command_pattern: `<agent> ${object} ...`,
        purpose_ref: `${FOUNDRY_AGENT_SERIES_CONTRACT_REF}#/agent_cli_command_surface_policy/ordinary_public_command_surface_spine/${object}`,
      })),
      peers: FOUNDRY_AGENT_PEERS.map(buildPeerSeriesSummary),
      command_surface_policy: {
        policy_id: readString(commandSurfacePolicy.policy_id, 'agent_cli_command_surface_policy.policy_id'),
        agent_cli_uses_foundry_series_spine: readBoolean(
          commandSurfacePolicy.agent_cli_must_use_series_spine,
          'agent_cli_command_surface_policy.agent_cli_must_use_series_spine',
        ),
        agent_cli_does_not_replicate_opl_nine_brand_modules: readBoolean(
          commandSurfacePolicy.agent_cli_must_not_replicate_top_level_modules,
          'agent_cli_command_surface_policy.agent_cli_must_not_replicate_top_level_modules',
        ),
        non_standard_implementation_buckets_are_not_ordinary_command_surfaces:
          readBoolean(
            nonStandardImplementationPolicy.ordinary_public_command_surface_allowed,
            'non_standard_implementation_bucket_policy.ordinary_public_command_surface_allowed',
          ) === false,
      },
      mcp_and_skill_policy: {
        skill_pack_must_delegate_to_series_spine: readBoolean(
          skillMcpPolicy.skill_pack_must_delegate_to_series_spine,
          'skill_mcp_surface_policy.skill_pack_must_delegate_to_series_spine',
        ),
        mcp_descriptor_must_delegate_to_series_spine: readBoolean(
          skillMcpPolicy.mcp_descriptor_must_delegate_to_series_spine,
          'skill_mcp_surface_policy.mcp_descriptor_must_delegate_to_series_spine',
        ),
        standard_agent_standalone_mcp_default_enabled: readBoolean(
          skillMcpPolicy.standard_agent_standalone_mcp_default_enabled,
          'skill_mcp_surface_policy.standard_agent_standalone_mcp_default_enabled',
        ),
        standard_agent_plugin_manifest_must_not_expose_mcp_servers: readBoolean(
          skillMcpPolicy.standard_agent_plugin_manifest_must_not_expose_mcp_servers,
          'skill_mcp_surface_policy.standard_agent_plugin_manifest_must_not_expose_mcp_servers',
        ),
        unified_mcp_projection_owner: readString(
          skillMcpPolicy.opl_unified_mcp_projection_owner,
          'skill_mcp_surface_policy.opl_unified_mcp_projection_owner',
        ),
        future_unified_mcp_server_strategy: readString(
          skillMcpPolicy.future_unified_mcp_server_strategy,
          'skill_mcp_surface_policy.future_unified_mcp_server_strategy',
        ),
        cli_surface_role: readString(
          readRecord(skillMcpPolicy.cli_mcp_relationship_policy, 'skill_mcp_surface_policy.cli_mcp_relationship_policy').cli_surface_role,
          'skill_mcp_surface_policy.cli_mcp_relationship_policy.cli_surface_role',
        ),
        mcp_surface_role: readString(
          readRecord(skillMcpPolicy.cli_mcp_relationship_policy, 'skill_mcp_surface_policy.cli_mcp_relationship_policy').mcp_surface_role,
          'skill_mcp_surface_policy.cli_mcp_relationship_policy.mcp_surface_role',
        ),
        all_cli_commands_are_mcp_tools: readBoolean(
          readRecord(skillMcpPolicy.cli_mcp_relationship_policy, 'skill_mcp_surface_policy.cli_mcp_relationship_policy').all_cli_commands_are_mcp_tools,
          'skill_mcp_surface_policy.cli_mcp_relationship_policy.all_cli_commands_are_mcp_tools',
        ),
        progressive_discovery_required_for_large_catalogs: readBoolean(
          readRecord(skillMcpPolicy.mcp_context_budget_policy, 'skill_mcp_surface_policy.mcp_context_budget_policy').progressive_discovery_required_for_large_catalogs,
          'skill_mcp_surface_policy.mcp_context_budget_policy.progressive_discovery_required_for_large_catalogs',
        ),
        toolset_filtering_required_for_broad_surfaces: readBoolean(
          readRecord(skillMcpPolicy.mcp_context_budget_policy, 'skill_mcp_surface_policy.mcp_context_budget_policy').toolset_filtering_required_for_broad_surfaces,
          'skill_mcp_surface_policy.mcp_context_budget_policy.toolset_filtering_required_for_broad_surfaces',
        ),
        expose_foundry_spine: true,
      },
      authority_boundary: buildAuthorityBoundary(contract),
    },
  };
}

export function buildFoundryAgentsList(args: string[]) {
  assertNoFoundryAgentArgs(args, 'opl foundry agents list');
  const contract = readFoundryAgentSeriesContract();
  return {
    version: 'g2',
    foundry_agents: {
      surface_kind: 'opl_foundry_agent_series_agent_index',
      series_id: 'opl_foundry_agent_series.v1',
      series_label: readString(
        readRecord(contract.agent_cli_command_surface_policy, 'agent_cli_command_surface_policy').agent_cli_series_label,
        'agent_cli_command_surface_policy.agent_cli_series_label',
      ),
      canonical_command_surface: 'opl foundry agents',
      opl_aggregate_command_surface: 'opl agents foundry',
      agents: FOUNDRY_AGENT_PEERS.map(buildPeerProjection),
      authority_boundary: buildAuthorityBoundary(contract),
    },
  };
}

export function buildFoundryAgentInspect(args: string[]) {
  const agentId = parseAgentInspectArgs(args);
  const peer = resolvePeer(agentId);
  if (!peer) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Unknown Foundry Agent id: ${agentId}.`,
      {
        agent_id: agentId,
        allowed_agent_ids: FOUNDRY_AGENT_PEERS.map((entry) => entry.agent_id),
      },
    );
  }
  const contract = readFoundryAgentSeriesContract();
  return {
    version: 'g2',
    foundry_agent: {
      surface_kind: 'opl_foundry_agent_series_agent_inspect',
      ...buildPeerProjection(peer),
      status: peer.series_membership,
      series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
      standard_agent_registry_ref: STANDARD_AGENT_REGISTRY_REF,
      command_surface_policy: {
        must_expose_foundry_operations: [...FOUNDRY_AGENT_OPERATIONS],
        first_screen_must_identify_series: true,
        old_implementation_buckets_are_diagnostic_only: true,
      },
      stage_profile: buildFoundryAgentStageProfile(peer, contract),
      owner_answer_shape: buildFoundryAgentOwnerAnswerShape(peer, contract),
      opl_base_domain_authority: buildOplBaseDomainAuthorityBoundary(),
      feedback_self_evolution_trigger: buildFeedbackSelfEvolutionTrigger(peer, contract),
      developer_mode_target_hint: buildFoundryAgentDeveloperModeTargetHint(peer),
      authority_boundary: buildAuthorityBoundary(contract),
    },
  };
}

function buildEvidenceProfileFixtureRefs() {
  return {
    evidence_ref: 'profile-shape-ref:evidence-grounded/evidence-packet',
    source_ref: 'profile-shape-ref:evidence-grounded/source',
    provenance_ref: 'profile-shape-ref:evidence-grounded/provenance',
    retrieval_receipt_ref: 'profile-shape-ref:evidence-grounded/retrieval-receipt',
    tool_receipt_ref: 'profile-shape-ref:evidence-grounded/tool-receipt',
    freshness_ref: 'profile-shape-ref:evidence-grounded/freshness',
    structured_input_ref: 'profile-shape-ref:evidence-grounded/structured-input',
    source_locator_ref: 'profile-shape-ref:evidence-grounded/source-locator',
    deidentification_policy_ref: 'profile-shape-ref:evidence-grounded/deidentification-policy',
    access_audit_policy_ref: 'profile-shape-ref:evidence-grounded/access-audit-policy',
    connector_ref: 'profile-shape-ref:evidence-grounded/connector',
    tool_ref: 'profile-shape-ref:evidence-grounded/tool',
  };
}

function buildConsoleDrilldownSurfaceRef(refs: ReturnType<typeof buildEvidenceProfileFixtureRefs>) {
  return {
    surface_kind: 'opl_console_evidence_grounded_decision_agent_profile_drilldown_ref',
    version: 'evidence-grounded-decision-agent-profile-console-drilldown-ref.v1',
    module_id: 'console',
    brand_module: 'OPL Console',
    source_module_ref: 'src/modules/console/evidence-grounded-profile-drilldown.ts',
    exported_builder: 'buildEvidenceGroundedDecisionAgentProfileConsoleDrilldown',
    projection_role: 'dependency_policy_preserving_ref_to_console_drilldown',
    live_evidence_observed: false,
    actual_builder_invoked_by_foundry_cli: false,
    trace_ref_examples: Object.values(refs),
    authority_boundary: {
      refs_only: true,
      can_read_source_body: false,
      can_read_artifact_body: false,
      can_claim_live_evidence: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
      can_claim_owner_verdict: false,
    },
  };
}

function buildFoundryEvidenceProfileModuleSurfaces(readback: JsonRecord) {
  const refs = buildEvidenceProfileFixtureRefs();
  return {
    pack: {
      surface_kind: 'opl_pack_evidence_grounded_decision_agent_profile_abi_surface',
      profile_id: readback.profile_id,
      contract_ref: readback.contract_ref,
      source_module_ref: 'src/modules/pack/evidence-grounded-decision-agent-profile.ts',
      exported_builder: 'buildEvidenceGroundedDecisionAgentProfileReadback',
      consumption_status: readback.consumption_status,
      live_evidence_observed: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
    },
    stagecraft: buildEvidenceGroundedStagecraftProfilePolicyReadback()
      .evidence_grounded_stagecraft_profile,
    runway: buildEvidenceGroundedRunwayProfilePolicyReadback()
      .evidence_grounded_runway_profile,
    ledger: buildEvidenceGroundedLedgerSubstrate({
      evidenceRef: refs.evidence_ref,
      sourceRef: refs.source_ref,
      provenanceRef: refs.provenance_ref,
      retrievalReceiptRef: refs.retrieval_receipt_ref,
      toolReceiptRef: refs.tool_receipt_ref,
      freshnessRef: refs.freshness_ref,
      confidenceLabel: 'medium',
      conflictStatus: 'none',
    }),
    connect: buildEvidenceGroundedConnectSubstrate({
      retrievalReceiptRef: refs.retrieval_receipt_ref,
      sourceRef: refs.source_ref,
      connectorRef: refs.connector_ref,
      toolReceiptRef: refs.tool_receipt_ref,
      toolRef: refs.tool_ref,
      sensitiveExternalEgressRequested: true,
      externalEgressApprovalRef: 'profile-shape-ref:evidence-grounded/human-egress-approval',
    }),
    workspace: buildEvidenceGroundedWorkspaceSubstrate({
      structuredInputRef: refs.structured_input_ref,
      sourceRef: refs.source_ref,
      sourceLocatorRef: refs.source_locator_ref,
      sourceLocatorKind: 'workspace_source_ref',
      deidentificationPolicyRef: refs.deidentification_policy_ref,
      accessAuditPolicyRef: refs.access_audit_policy_ref,
    }),
    atlas: buildEvidenceGroundedDecisionAgentProfileAtlasCatalog()
      .atlas_evidence_grounded_decision_agent_profile_catalog,
    console: buildConsoleDrilldownSurfaceRef(refs),
    'foundry-lab': buildEvidenceGroundedDecisionAgentProfileFoundryLabEvalSurface()
      .foundry_lab_evidence_grounded_decision_agent_profile_eval,
    charter: buildEvidenceGroundedCharterProfileBoundaryReadback()
      .evidence_grounded_charter_profile_boundary,
  };
}

export function buildFoundryEvidenceProfileInspect(args: string[]) {
  assertNoFoundryAgentArgs(args, 'opl foundry evidence-profile inspect');
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const moduleSurfaces = buildFoundryEvidenceProfileModuleSurfaces(readback);
  const moduleSurfaceIds = Object.keys(moduleSurfaces);
  return {
    version: 'g2',
    foundry_evidence_profile: {
      surface_kind: 'opl_foundry_evidence_grounded_decision_agent_profile_inspect',
      series_id: 'opl_foundry_agent_series.v1',
      profile_id: readback.profile_id,
      contract_ref: readback.contract_ref,
      profile_role: readback.contract.profile_role,
      consumption_status: readback.consumption_status,
      first_class_object_names: readback.first_class_object_names,
      module_owner_ids: readback.module_owner_ids,
      fail_closed_rule_ids: readback.fail_closed_rule_ids,
      forbidden_claim_ids: readback.forbidden_claim_ids,
      module_surface_status: {
        consumption_status: readback.module_surface_consumption_status,
        module_surface_ids: moduleSurfaceIds,
        non_live_surface_count: moduleSurfaceIds.length,
        live_evidence_performed: false,
        all_surfaces_non_live: true,
        all_surfaces_refs_only_or_contract_only: true,
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
      module_surface_readback_refs: readback.module_surface_readback_refs,
      module_surfaces: moduleSurfaces,
      decision_support_flow: readback.contract.decision_support_flow,
      mode_routing_policy: readback.mode_routing_policy,
      evidence_policy: readback.evidence_policy,
      human_gate_policy: readback.human_gate_policy,
      unsupported_evidence_blocker_policy: readback.unsupported_evidence_blocker_policy,
      module_ownership: readback.module_ownership,
      authority_boundary: readback.authority_boundary,
      contract_readback_ref: 'src/modules/pack/evidence-grounded-decision-agent-profile.ts',
      no_new_brand_module: true,
      implements_concrete_domain_agent: false,
      implements_medical_or_hematology_agent: false,
    },
  };
}
