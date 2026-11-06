import fs from 'node:fs';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY,
  type SkillPackSpec,
  type SkillPackSyncPolicy,
} from './registry.ts';
import {
  STANDARD_AGENT_REGISTRY_REF,
  resolveStandardAgentByCanonicalPluginName,
} from '../../../kernel/standard-agent-registry.ts';

const FOUNDRY_AGENT_SERIES_CONTRACT_REF = 'contracts/opl-framework/foundry-agent-series-contract.json';
const FOUNDRY_AGENT_SERIES_CONTRACT_URL = new URL(
  '../../../../contracts/opl-framework/foundry-agent-series-contract.json',
  import.meta.url,
);
let cachedFoundryAgentSeriesContract: Record<string, unknown> | null = null;

function readFoundryAgentSeriesContract() {
  if (!cachedFoundryAgentSeriesContract) {
    const contract = parseJsonText(fs.readFileSync(FOUNDRY_AGENT_SERIES_CONTRACT_URL, 'utf8'));
    if (!isRecord(contract)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Foundry Agent series contract must contain an object root.',
        { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF },
      );
    }
    cachedFoundryAgentSeriesContract = contract;
  }
  return cachedFoundryAgentSeriesContract;
}

function readObjectField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing object field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value;
}

function readStringField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value.trim();
}

function readStringListField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (!Array.isArray(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string list field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        `Foundry Agent series contract is missing string field: ${field}[${index}].`,
        { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field: `${field}[${index}]` },
      );
    }
    return entry.trim();
  });
}

function readBooleanField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing boolean field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value;
}

function cloneJsonRecordField(source: Record<string, unknown>, field: string) {
  const value = readObjectField(source, field);
  return structuredClone(value) as Record<string, unknown>;
}

export function readFoundryAgentContractPolicy(field: string) {
  return cloneJsonRecordField(readFoundryAgentSeriesContract(), field);
}

export function buildFoundryAgentSeriesProjection(spec: SkillPackSpec) {
  if (spec.distribution_role !== 'domain_agent_plugin_pack') {
    return {
      foundry_agent_series: {},
      command_surface_spine: {},
      mcp_projection: {},
    };
  }

  const contract = readFoundryAgentSeriesContract();
  const commandSurface = readObjectField(contract, 'agent_cli_command_surface_policy');
  const skillMcp = readObjectField(contract, 'skill_mcp_surface_policy');
  const versionPolicy = readObjectField(contract, 'contract_version_policy');
  const policyRelease = readObjectField(contract, 'shared_policy_release');
  const standardAgent = resolveStandardAgentByCanonicalPluginName(spec.canonical_plugin_name);
  if (!standardAgent) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Domain agent skill pack is missing from the StandardAgentRegistry: ${spec.canonical_plugin_name}.`,
      {
        canonical_plugin_name: spec.canonical_plugin_name,
      },
    );
  }
  const foundryAgentId = standardAgent.agent_id;
  const brandCli = standardAgent.agent_id;
  const workAlias = 'work';
  const ordinaryOperations = readStringListField(commandSurface, 'ordinary_operations');
  const ordinarySpine = readStringListField(commandSurface, 'ordinary_public_command_surface_spine');
  const defaultFoundryCommandSurface =
    `opl agents run --domain ${foundryAgentId} --action <action_id>`;
  const seriesFoundryOperations = [defaultFoundryCommandSurface];

  return {
    foundry_agent_series: {
      series_id: 'opl_foundry_agent_series.v1',
      series_label: readStringField(commandSurface, 'agent_cli_series_label'),
      foundry_agent_id: foundryAgentId,
      domain_id: spec.domain_id,
      series_membership: 'standard_domain_agent',
      canonical_command_surface: readStringField(commandSurface, 'canonical_opl_command_surface'),
      product_model: readStringField(contract, 'product_model'),
      series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
      standard_agent_registry_ref: STANDARD_AGENT_REGISTRY_REF,
      domain_contract_ref: readStringField(versionPolicy, 'domain_contract_ref'),
      policy_release_ref: readStringField(policyRelease, 'policy_release_contract_ref'),
      brand_cli: brandCli,
      default_foundry_command_surface: defaultFoundryCommandSurface,
      ordinary_golden_path: 'domain_pack -> stage -> domain_owner_answer -> handoff',
    },
    command_surface_spine: {
      surface_kind: 'opl_foundry_agent_skill_command_surface_spine_projection',
      ordinary_public_command_surface_spine: ordinarySpine,
      ordinary_operations: ordinaryOperations,
      default_foundry_operations: seriesFoundryOperations,
      work_alias: workAlias,
      work_alias_command_pattern: defaultFoundryCommandSurface,
      required_public_surface_derivatives: readStringListField(commandSurface, 'required_public_surface_derivatives'),
      skill_sync_command_surface: readStringField(skillMcp, 'canonical_skill_sync_command_surface'),
      skill_inspect_command_surface: readStringField(skillMcp, 'canonical_skill_connect_command_surface'),
      foundry_agent_inspect_command_surface: defaultFoundryCommandSurface,
      agent_cli_must_use_series_spine: readBooleanField(commandSurface, 'agent_cli_must_use_series_spine'),
      agent_cli_must_not_replicate_top_level_modules: readBooleanField(
        commandSurface,
        'agent_cli_must_not_replicate_top_level_modules',
      ),
    },
    mcp_projection: {
      surface_kind: 'opl_foundry_agent_mcp_delegate_projection',
      descriptor_ref: readStringField(skillMcp, 'canonical_mcp_projection_ref'),
      mcp_descriptor_must_delegate_to_series_spine: readBooleanField(
        skillMcp,
        'mcp_descriptor_must_delegate_to_series_spine',
      ),
      series_delegate_tool_refs: [defaultFoundryCommandSurface],
      standard_agent_standalone_mcp_default_enabled: readBooleanField(
        skillMcp,
        'standard_agent_standalone_mcp_default_enabled',
      ),
      standard_agent_plugin_manifest_must_not_expose_mcp_servers: readBooleanField(
        skillMcp,
        'standard_agent_plugin_manifest_must_not_expose_mcp_servers',
      ),
      unified_mcp_projection_owner: readStringField(skillMcp, 'opl_unified_mcp_projection_owner'),
      unified_mcp_server_ready: readBooleanField(skillMcp, 'unified_mcp_server_ready'),
      unified_mcp_server_readiness: readStringField(skillMcp, 'unified_mcp_server_readiness'),
      unified_mcp_server_id: readStringField(skillMcp, 'unified_mcp_server_id'),
      unified_mcp_server_command: readStringListField(skillMcp, 'unified_mcp_server_command'),
      unified_mcp_server_registration_surface: readStringField(
        skillMcp,
        'unified_mcp_server_registration_surface',
      ),
      unified_mcp_server_toolsets: readStringListField(skillMcp, 'unified_mcp_server_toolsets'),
      unified_mcp_server_read_only_default: readBooleanField(skillMcp, 'unified_mcp_server_read_only_default'),
      unified_app_mcp_server_ready: readBooleanField(skillMcp, 'unified_app_mcp_server_ready'),
      unified_app_mcp_server_readiness: readStringField(skillMcp, 'unified_app_mcp_server_readiness'),
      unified_app_mcp_server_id: readStringField(skillMcp, 'unified_app_mcp_server_id'),
      unified_app_mcp_server_command: readStringListField(skillMcp, 'unified_app_mcp_server_command'),
      unified_app_mcp_server_registration_surface: readStringField(
        skillMcp,
        'unified_app_mcp_server_registration_surface',
      ),
      unified_app_mcp_server_ui_resource: readStringField(skillMcp, 'unified_app_mcp_server_ui_resource'),
      unified_app_mcp_server_requires_package_confirmation: readBooleanField(
        skillMcp,
        'unified_app_mcp_server_requires_package_confirmation',
      ),
      domain_repo_mcp_server_role: readStringField(skillMcp, 'domain_repo_mcp_server_role'),
      cli_mcp_relationship_policy: cloneJsonRecordField(skillMcp, 'cli_mcp_relationship_policy'),
      mcp_context_budget_policy: cloneJsonRecordField(skillMcp, 'mcp_context_budget_policy'),
      plugin_registry_is_canonical_transport: true,
    },
  };
}

export function buildCapabilityPluginDistribution(spec: SkillPackSpec, syncPolicy: SkillPackSyncPolicy) {
  if (spec.domain_id !== 'scholarskills') {
    return null;
  }

  return {
    surface_kind: 'opl_framework_capability_plugin_distribution',
    capability_plugin_id: 'mas-scholar-skills',
    distribution_role: spec.distribution_role,
    ownership_kind: 'framework_capability_plugin',
    source_of_truth: [
      'mas-scholar-skills/.codex-plugin/plugin.json',
      'mas-scholar-skills/skills/mas-scholar-skills/SKILL.md',
      'mas-scholar-skills/contracts/scholar-skills-capability-modules.json',
    ],
    content_owner: 'mas-scholar-skills',
    framework_role: 'compatibility_projection_and_provenance_only',
    github_repo: 'gaofeng21cn/mas-scholar-skills',
    ordinary_install_update_source: 'ghcr_capability_packages_channel',
    package_channel_manifest_ref: 'ghcr.io/<owner>/one-person-lab-packages/<package_id>:latest-stable',
    package_artifact_ref: 'ghcr.io/<owner>/one-person-lab-packages/mas-scholar-skills:<package_semver>@<artifact_digest>',
    developer_checkout_source: 'Developer Mode or explicit OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT / OPL_MODULE_PATH_SCHOLARSKILLS',
    package_lifecycle_owner: 'opl_packages',
    package_lifecycle_commands: [
      'opl packages install mas --json',
      'opl packages status --package-id mas --json',
      'opl packages repair mas --json',
    ],
    scope_activation: 'automatic_on_workspace_or_quest_activation_and_domain_launch',
    compatibility_projection_not_advertised: true,
    default_sync_scope: 'package_activation_transaction_only',
    recommended_paper_execution_scopes: syncPolicy.allowed_scopes.filter((scope) => scope !== 'codex'),
    codex_scope_requires_explicit_request: !syncPolicy.allowed_scopes.includes('codex'),
    framework_owned_capability: true,
    domain_module: false,
    brand_module: false,
    authority_boundary: FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY,
    note: 'MAS Scholar Skills owns professional capability content; OPL Packages resolves the MAS dependency closure, activates target scopes, and records provenance.',
  };
}
