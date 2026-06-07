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
    domain_alias: 'study',
    ordinary_golden_path:
      'study -> stage -> domain owner receipt or typed blocker -> research artifact handoff',
  },
  {
    agent_id: 'mag',
    domain_id: 'medautogrant',
    label: 'Med Auto Grant',
    domain_alias: 'grant',
    ordinary_golden_path:
      'grant -> stage -> domain owner receipt or typed blocker -> grant deliverable handoff',
  },
  {
    agent_id: 'rca',
    domain_id: 'redcube',
    label: 'RedCube AI',
    domain_alias: 'deck',
    ordinary_golden_path:
      'deck -> stage -> domain owner receipt or typed blocker -> visual deliverable handoff',
  },
  {
    agent_id: 'oma',
    domain_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    domain_alias: 'agent',
    ordinary_golden_path:
      'target agent -> stage -> target owner answer -> mechanism or work-order handoff',
  },
] as const;

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

export function buildFoundryAgentCliSpine(operation: FoundryAgentCliOperation, args: string[]) {
  assertNoArgs(args, operation);
  const contract = readFoundryAgentSeriesContract();
  const frontdoorPolicy = readRecord(contract.agent_cli_frontdoor_policy, 'agent_cli_frontdoor_policy');
  const skillMcpPolicy = readRecord(contract.skill_mcp_surface_policy, 'skill_mcp_surface_policy');
  const retirementPolicy = readRecord(
    contract.legacy_implementation_bucket_retirement_policy,
    'legacy_implementation_bucket_retirement_policy',
  );
  const ordinarySpine = readStringList(
    frontdoorPolicy.ordinary_public_frontdoor_spine,
    'agent_cli_frontdoor_policy.ordinary_public_frontdoor_spine',
  );
  const operations = readStringList(
    frontdoorPolicy.ordinary_operations,
    'agent_cli_frontdoor_policy.ordinary_operations',
  );
  const canonicalFrontdoor = readString(
    frontdoorPolicy.canonical_opl_frontdoor,
    'agent_cli_frontdoor_policy.canonical_opl_frontdoor',
  );

  return {
    version: 'g2',
    foundry_agent_cli_spine: {
      surface_kind: `opl_foundry_agent_cli_${operation}`,
      operation,
      status: operation === 'doctor' ? 'pass' : 'valid',
      series_id: 'opl_foundry_agent_series.v1',
      series_label: readString(frontdoorPolicy.agent_cli_series_label, 'agent_cli_frontdoor_policy.agent_cli_series_label'),
      product_model: readString(contract.product_model, 'product_model'),
      canonical_frontdoor: canonicalFrontdoor,
      ordinary_frontdoor: true,
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
        purpose_ref: `${FOUNDRY_AGENT_SERIES_CONTRACT_REF}#/agent_cli_frontdoor_policy/ordinary_public_frontdoor_spine/${object}`,
      })),
      peers: FOUNDRY_AGENT_PEERS.map((entry) => ({ ...entry })),
      frontdoor_policy: {
        policy_id: readString(frontdoorPolicy.policy_id, 'agent_cli_frontdoor_policy.policy_id'),
        agent_cli_uses_foundry_series_spine: readBoolean(
          frontdoorPolicy.agent_cli_must_use_series_spine,
          'agent_cli_frontdoor_policy.agent_cli_must_use_series_spine',
        ),
        agent_cli_does_not_replicate_opl_nine_brand_modules: readBoolean(
          frontdoorPolicy.agent_cli_must_not_replicate_top_level_modules,
          'agent_cli_frontdoor_policy.agent_cli_must_not_replicate_top_level_modules',
        ),
        old_implementation_buckets_are_not_ordinary_frontdoors:
          readBoolean(retirementPolicy.ordinary_public_frontdoor_allowed, 'legacy_implementation_bucket_retirement_policy.ordinary_public_frontdoor_allowed') === false,
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
        replacement: readString(retirementPolicy.replacement_frontdoor, 'legacy_implementation_bucket_retirement_policy.replacement_frontdoor'),
        retained_scope: 'diagnostic_or_migration_only',
      })),
      authority_boundary: buildAuthorityBoundary(contract),
    },
  };
}
