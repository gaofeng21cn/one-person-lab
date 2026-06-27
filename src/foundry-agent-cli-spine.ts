import fs from 'node:fs';

import { FrameworkContractError } from './contracts.ts';

type JsonRecord = Record<string, unknown>;

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
  '../contracts/opl-framework/foundry-agent-series-contract.json',
  import.meta.url,
);

const FOUNDRY_AGENT_PEERS = [
  {
    agent_id: 'mas',
    domain_id: 'medautoscience',
    label: 'Med Auto Science',
    series_membership: 'standard_domain_agent',
    brand_cli: 'mas',
    direct_domain_cli: 'medautosci',
    codex_executable_cli: 'medautosci',
    domain_alias: 'study',
    work_alias: 'study',
    ordinary_golden_path:
      'study -> stage -> domain owner receipt or typed blocker -> research artifact handoff',
    domain_native_foundry_cli: 'medautosci foundry',
  },
  {
    agent_id: 'mag',
    domain_id: 'medautogrant',
    label: 'Med Auto Grant',
    series_membership: 'standard_domain_agent',
    brand_cli: 'mag',
    direct_domain_cli: 'medautogrant',
    codex_executable_cli: '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli',
    domain_alias: 'grant',
    work_alias: 'grant',
    ordinary_golden_path:
      'grant -> stage -> domain owner receipt or typed blocker -> grant deliverable handoff',
    domain_native_foundry_cli: 'medautogrant foundry',
  },
  {
    agent_id: 'rca',
    domain_id: 'redcube',
    label: 'RedCube AI',
    series_membership: 'standard_domain_agent',
    brand_cli: 'rca',
    direct_domain_cli: 'redcube',
    codex_executable_cli: 'npm run --prefix <redcube-ai-repo> redcube --',
    domain_alias: 'deck',
    work_alias: 'deck',
    ordinary_golden_path:
      'deck -> stage -> domain owner receipt or typed blocker -> visual deliverable handoff',
    domain_native_foundry_cli: 'redcube foundry',
  },
  {
    agent_id: 'oma',
    domain_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    series_membership: 'standard_domain_agent',
    brand_cli: 'oma',
    direct_domain_cli: 'opl agents interfaces --repo-dir <opl-meta-agent-repo>',
    codex_executable_cli: 'opl foundry agents inspect oma',
    domain_alias: 'agent',
    work_alias: 'agent',
    ordinary_golden_path:
      'target agent -> stage -> target owner answer -> mechanism or work-order handoff',
  },
  {
    agent_id: 'opl-bookforge',
    domain_id: 'oplbookforge',
    label: 'OPL Book Forge',
    series_membership: 'standard_domain_agent',
    brand_cli: 'opl-bookforge',
    direct_domain_cli: 'opl agents interfaces --repo-dir <opl-bookforge-repo>',
    codex_executable_cli: 'opl foundry agents inspect opl-bookforge',
    domain_alias: 'book',
    work_alias: 'book',
    ordinary_golden_path:
      'book -> stage -> domain owner receipt or typed blocker -> manuscript package handoff',
  },
] as const;

type FoundryAgentPeer = typeof FOUNDRY_AGENT_PEERS[number];

function buildPeerSeriesSummary(peer: FoundryAgentPeer) {
  const summary = { ...peer } as Record<string, unknown>;
  delete summary.domain_native_foundry_cli;
  return summary;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const contract = JSON.parse(fs.readFileSync(FOUNDRY_AGENT_SERIES_CONTRACT_URL, 'utf8')) as unknown;
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

function buildPeerProjection(peer: FoundryAgentPeer) {
  const agentInspectCommandSurface = `opl foundry agents inspect ${peer.agent_id}`;
  const domainNativeFoundryCli = 'domain_native_foundry_cli' in peer
    ? peer.domain_native_foundry_cli
    : null;
  const codexExecutableCli = peer.codex_executable_cli;
  const brandCliPathSafe = false;
  const compatibilityCommandSurface = domainNativeFoundryCli ?? peer.direct_domain_cli;
  const foundryOperations = FOUNDRY_AGENT_OPERATIONS.map((operation) => `opl agents foundry ${operation}`);
  const compatibilityOperations = domainNativeFoundryCli
    ? FOUNDRY_AGENT_OPERATIONS.map((operation) => `${domainNativeFoundryCli} ${operation}`)
    : [peer.direct_domain_cli];
  const executableDirectFoundrySurface = domainNativeFoundryCli ? `${codexExecutableCli} foundry` : null;
  const executableDirectStatusJsonCommand = domainNativeFoundryCli
    ? `${codexExecutableCli} foundry status --json`
    : null;
  const compatibilityStatusJsonCommand = domainNativeFoundryCli
    ? `${domainNativeFoundryCli} status --json`
    : peer.direct_domain_cli;
  const cliSmoke = {
    executable_brand_cli_command_surface: brandCliPathSafe ? `${peer.brand_cli} foundry` : null,
    executable_direct_cli_command_surface: executableDirectFoundrySurface,
    executable_compatibility_command_surface: domainNativeFoundryCli ? compatibilityCommandSurface : null,
    status_json_command: `${agentInspectCommandSurface} --json`,
    executable_direct_status_json_command: executableDirectStatusJsonCommand,
    compatibility_status_json_command: compatibilityStatusJsonCommand,
    legacy_format_json_command: domainNativeFoundryCli ? `${domainNativeFoundryCli} status --format json` : null,
    json_flag_aliases: ['--json'],
    compatibility_json_flag_aliases: domainNativeFoundryCli ? ['--json', '--format json'] : ['--json'],
    help_smoke_commands: [
      `${agentInspectCommandSurface} --json`,
      'opl agents foundry status --json',
      ...(executableDirectStatusJsonCommand ? [executableDirectStatusJsonCommand] : []),
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
    domain_native_foundry_command_surface: domainNativeFoundryCli,
    compatibility_command_surface: compatibilityCommandSurface,
    foundry_operations: foundryOperations,
    compatibility_operations: compatibilityOperations,
    executable_direct_cli_command_surface: executableDirectFoundrySurface,
    brand_cli_path_safe_executable: brandCliPathSafe,
    cli_smoke: cliSmoke,
    ordinary_spine: ['workspace', 'work', 'stage', 'run', 'vault', 'handoff', 'connect'].map((object) => ({
      object,
      command_pattern: domainNativeFoundryCli
        ? `${peer.direct_domain_cli} ${object} ...`
        : agentInspectCommandSurface,
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
      domain_repo_mcp_role: 'domain_handler_target_or_direct_protocol_adapter_only',
      mcp_descriptor_must_delegate_to_series_spine: true,
    },
  };
}

function resolvePeer(agentId: string) {
  const normalized = agentId.trim().toLowerCase();
  return FOUNDRY_AGENT_PEERS.find((peer) =>
    peer.agent_id === normalized
    || peer.domain_id === normalized
    || peer.domain_alias === normalized
    || peer.work_alias === normalized
    || (peer.agent_id === 'oma' && normalized === 'opl-meta-agent')
    || (peer.agent_id === 'opl-bookforge' && ['bookforge', 'book-forge', 'oplbookforge', 'opl_bookforge'].includes(normalized))
    || (peer.agent_id === 'rca' && normalized === 'redcube-ai')
    || (peer.agent_id === 'mas' && normalized === 'med-autoscience')
    || (peer.agent_id === 'mag' && normalized === 'med-autogrant')
  );
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
      usage: 'opl foundry agents inspect <mas|mag|rca|oma|opl-bookforge>',
      examples: [
        'opl foundry agents inspect mas --json',
        'opl foundry agents inspect --agent rca --json',
        'opl foundry agents inspect opl-bookforge --json',
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
  const retirementPolicy = readRecord(
    contract.legacy_implementation_bucket_retirement_policy,
    'legacy_implementation_bucket_retirement_policy',
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
        old_implementation_buckets_are_not_ordinary_command_surfaces:
          readBoolean(retirementPolicy.ordinary_public_command_surface_allowed, 'legacy_implementation_bucket_retirement_policy.ordinary_public_command_surface_allowed') === false,
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
        expose_foundry_spine: true,
        expose_legacy_buckets_as_diagnostic_or_migration_only: true,
      },
      retired_implementation_buckets: readStringList(
        retirementPolicy.retired_bucket_prefixes,
        'legacy_implementation_bucket_retirement_policy.retired_bucket_prefixes',
      ).map((bucket) => ({
        bucket,
        replacement: readString(retirementPolicy.replacement_command_surface, 'legacy_implementation_bucket_retirement_policy.replacement_command_surface'),
        retained_scope: 'diagnostic_or_migration_only',
      })),
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
      status: 'standard_domain_agent',
      ...buildPeerProjection(peer),
      series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
      direct_cli_command_surface_policy: {
        must_expose_foundry_operations: [...FOUNDRY_AGENT_OPERATIONS],
        first_screen_must_identify_series: true,
        old_implementation_buckets_are_diagnostic_only: true,
      },
      authority_boundary: buildAuthorityBoundary(contract),
    },
  };
}
