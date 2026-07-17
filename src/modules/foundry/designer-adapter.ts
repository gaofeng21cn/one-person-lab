import fs from 'node:fs';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveContainedRepoJsonFile } from '../../kernel/repo-contained-json-file.ts';
import type { DesignerPort, FoundryActivityIdentity } from './ports.ts';
import {
  validateAgentBlueprint,
  validateEvolutionProposal,
  type AgentBlueprint,
  type DesignRequest,
  type EvidenceBundle,
} from './protocol.ts';

const FOUNDRY_PROVIDER_VERSION = 'opl-foundry-provider.v1';
const DESIGN_REQUEST_REF = 'opl://foundry-protocol/DesignRequest';
const AGENT_BLUEPRINT_REF = 'opl://foundry-protocol/AgentBlueprint';
const EVIDENCE_BUNDLE_REF = 'opl://foundry-protocol/EvidenceBundle';
const EVOLUTION_PROPOSAL_REF = 'opl://foundry-protocol/EvolutionProposal';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

type ProviderOperation = {
  input_schema_refs: string[];
  output_schema_ref: string;
  entry_stage_ref: string;
  required_stage_refs: string[];
  optional_stage_refs: string[];
  terminal_stage_ref: string;
};

type FoundryProviderProjectionPolicy = {
  public_action_ids: [string];
  internal_operations_are_public_actions: false;
  internal_operations_are_cli_commands: false;
  internal_operations_are_mcp_tools: false;
};

type FoundryProviderAuthorityBoundary = {
  provider_owns_design_semantics: true;
  provider_owns_evaluation_semantics: true;
  provider_owns_evidence_diagnosis: true;
  provider_owns_evolution_proposals: true;
  provider_owns_foundry_run_state: false;
  provider_owns_candidate_materialization: false;
  provider_owns_evaluation_execution: false;
  provider_owns_versions_or_activation: false;
  provider_can_return_patch_or_work_order: false;
  provider_can_view_protected_test_bodies: false;
  opl_can_write_target_domain_truth: false;
};

export type FoundryProviderManifest = {
  surface_kind: 'opl_foundry_provider';
  version: typeof FOUNDRY_PROVIDER_VERSION;
  provider_id: string;
  agent_id: string;
  package_id: string;
  domain_id: string;
  carrier_slug: string;
  operations: {
    design: ProviderOperation;
    diagnose: ProviderOperation;
  };
  projection_policy: FoundryProviderProjectionPolicy;
  authority_boundary: FoundryProviderAuthorityBoundary;
};

export interface FoundryProviderOperationInvoker {
  invoke(input: {
    operation: 'design' | 'diagnose';
    provider: FoundryProviderManifest;
    checkout_root: string;
    payload: {
      request: DesignRequest;
      blueprint?: AgentBlueprint;
      evidence?: EvidenceBundle;
    };
    activity: FoundryActivityIdentity;
  }): Promise<unknown>;
}

function stringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${field} must be a non-empty string array.`);
  }
  return value as string[];
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string) {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((entry, index) => entry !== canonical[index])) {
    fail(`${field} fields do not match the closed provider contract.`, {
      actual_fields: actual,
      expected_fields: canonical,
    });
  }
}

function operation(value: unknown, field: string): ProviderOperation {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  exactKeys(value, [
    'input_schema_refs',
    'output_schema_ref',
    'entry_stage_ref',
    'required_stage_refs',
    'optional_stage_refs',
    'terminal_stage_ref',
  ], field);
  const result: ProviderOperation = {
    input_schema_refs: stringList(value.input_schema_refs, `${field}.input_schema_refs`),
    output_schema_ref: typeof value.output_schema_ref === 'string' ? value.output_schema_ref : '',
    entry_stage_ref: typeof value.entry_stage_ref === 'string' ? value.entry_stage_ref : '',
    required_stage_refs: stringList(value.required_stage_refs, `${field}.required_stage_refs`),
    optional_stage_refs: stringList(value.optional_stage_refs, `${field}.optional_stage_refs`),
    terminal_stage_ref: typeof value.terminal_stage_ref === 'string' ? value.terminal_stage_ref : '',
  };
  if (!result.output_schema_ref || !result.entry_stage_ref || !result.terminal_stage_ref) {
    fail(`${field} has incomplete schema or Stage bindings.`);
  }
  const required = new Set(result.required_stage_refs);
  const optional = new Set(result.optional_stage_refs);
  if (
    required.size === 0
    || required.size !== result.required_stage_refs.length
    || optional.size !== result.optional_stage_refs.length
    || result.required_stage_refs[0] !== result.entry_stage_ref
    || result.required_stage_refs.at(-1) !== result.terminal_stage_ref
    || result.optional_stage_refs.some((stageRef) => required.has(stageRef))
  ) {
    fail(`${field} has an invalid closed Stage topology.`, {
      entry_stage_ref: result.entry_stage_ref,
      terminal_stage_ref: result.terminal_stage_ref,
      required_stage_refs: result.required_stage_refs,
      optional_stage_refs: result.optional_stage_refs,
    });
  }
  return result;
}

function projectionPolicy(value: unknown): FoundryProviderProjectionPolicy {
  if (!isRecord(value)) fail('Foundry provider projection_policy must be an object.');
  exactKeys(value, [
    'public_action_ids',
    'internal_operations_are_public_actions',
    'internal_operations_are_cli_commands',
    'internal_operations_are_mcp_tools',
  ], 'Foundry provider projection_policy');
  const publicActionIds = stringList(value.public_action_ids, 'Foundry provider projection_policy.public_action_ids');
  if (
    publicActionIds.length !== 1
    || value.internal_operations_are_public_actions !== false
    || value.internal_operations_are_cli_commands !== false
    || value.internal_operations_are_mcp_tools !== false
  ) {
    fail('Foundry provider must expose one public action while keeping design and diagnose internal.');
  }
  return {
    public_action_ids: [publicActionIds[0]!],
    internal_operations_are_public_actions: false,
    internal_operations_are_cli_commands: false,
    internal_operations_are_mcp_tools: false,
  };
}

function authorityBoundary(value: unknown): FoundryProviderAuthorityBoundary {
  if (!isRecord(value)) fail('Foundry provider authority_boundary must be an object.');
  exactKeys(value, [
    'provider_owns_design_semantics',
    'provider_owns_evaluation_semantics',
    'provider_owns_evidence_diagnosis',
    'provider_owns_evolution_proposals',
    'provider_owns_foundry_run_state',
    'provider_owns_candidate_materialization',
    'provider_owns_evaluation_execution',
    'provider_owns_versions_or_activation',
    'provider_can_return_patch_or_work_order',
    'provider_can_view_protected_test_bodies',
    'opl_can_write_target_domain_truth',
  ], 'Foundry provider authority_boundary');
  if (
    value.provider_owns_design_semantics !== true
    || value.provider_owns_evaluation_semantics !== true
    || value.provider_owns_evidence_diagnosis !== true
    || value.provider_owns_evolution_proposals !== true
    || value.provider_owns_foundry_run_state !== false
    || value.provider_owns_candidate_materialization !== false
    || value.provider_owns_evaluation_execution !== false
    || value.provider_owns_versions_or_activation !== false
    || value.provider_can_return_patch_or_work_order !== false
    || value.provider_can_view_protected_test_bodies !== false
    || value.opl_can_write_target_domain_truth !== false
  ) {
    fail('Foundry provider manifest takes OPL runtime authority.');
  }
  return value as FoundryProviderAuthorityBoundary;
}

export function readFoundryProviderManifest(checkoutRoot: string, manifestRef = 'contracts/foundry_provider.json') {
  const resolved = resolveContainedRepoJsonFile(checkoutRoot, manifestRef, 'Foundry provider manifest', 'managed package checkout');
  const parsed = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
  if (!isRecord(parsed) || parsed.surface_kind !== 'opl_foundry_provider' || parsed.version !== FOUNDRY_PROVIDER_VERSION) {
    fail('Foundry provider manifest has an unsupported identity or version.', { manifest_ref: manifestRef });
  }
  exactKeys(parsed, [
    'surface_kind',
    'version',
    'provider_id',
    'agent_id',
    'package_id',
    'domain_id',
    'carrier_slug',
    'operations',
    'projection_policy',
    'authority_boundary',
  ], 'Foundry provider manifest root');
  if (!isRecord(parsed.operations) || !isRecord(parsed.projection_policy) || !isRecord(parsed.authority_boundary)) {
    fail('Foundry provider manifest is incomplete.', { manifest_ref: manifestRef });
  }
  exactKeys(parsed.operations, ['design', 'diagnose'], 'Foundry provider operations');
  const manifest: FoundryProviderManifest = {
    surface_kind: 'opl_foundry_provider',
    version: FOUNDRY_PROVIDER_VERSION,
    provider_id: typeof parsed.provider_id === 'string' ? parsed.provider_id : '',
    agent_id: typeof parsed.agent_id === 'string' ? parsed.agent_id : '',
    package_id: typeof parsed.package_id === 'string' ? parsed.package_id : '',
    domain_id: typeof parsed.domain_id === 'string' ? parsed.domain_id : '',
    carrier_slug: typeof parsed.carrier_slug === 'string' ? parsed.carrier_slug : '',
    operations: {
      design: operation(parsed.operations.design, 'Foundry provider design operation'),
      diagnose: operation(parsed.operations.diagnose, 'Foundry provider diagnose operation'),
    },
    projection_policy: projectionPolicy(parsed.projection_policy),
    authority_boundary: authorityBoundary(parsed.authority_boundary),
  };
  if (
    !manifest.provider_id
    || manifest.provider_id !== manifest.agent_id
    || manifest.provider_id !== manifest.package_id
    || !manifest.domain_id
    || !manifest.carrier_slug
  ) {
    fail('Foundry provider identity axes are inconsistent.', {
      provider_id: manifest.provider_id,
      agent_id: manifest.agent_id,
      package_id: manifest.package_id,
    });
  }
  if (manifest.operations.design.input_schema_refs.join('\0') !== DESIGN_REQUEST_REF
    || manifest.operations.design.output_schema_ref !== AGENT_BLUEPRINT_REF) {
    fail('Foundry provider design operation does not implement the canonical protocol.');
  }
  if (manifest.operations.diagnose.input_schema_refs.join('\0') !== [
    DESIGN_REQUEST_REF,
    AGENT_BLUEPRINT_REF,
    EVIDENCE_BUNDLE_REF,
  ].join('\0') || manifest.operations.diagnose.output_schema_ref !== EVOLUTION_PROPOSAL_REF) {
    fail('Foundry provider diagnose operation does not implement the canonical protocol.');
  }
  return manifest;
}

export class ManifestFoundryDesignerAdapter implements DesignerPort {
  readonly producer_id: string;
  readonly #checkoutRoot: string;
  readonly #provider: FoundryProviderManifest;
  readonly #invoker: FoundryProviderOperationInvoker;

  constructor(input: {
    checkout_root: string;
    provider_manifest_ref?: string;
    invoker: FoundryProviderOperationInvoker;
  }) {
    this.#checkoutRoot = fs.realpathSync.native(input.checkout_root);
    this.#provider = readFoundryProviderManifest(this.#checkoutRoot, input.provider_manifest_ref);
    this.#invoker = input.invoker;
    this.producer_id = `foundry-provider:${this.#provider.provider_id}`;
  }

  async design(request: DesignRequest, activity: FoundryActivityIdentity) {
    return validateAgentBlueprint(await this.#invoker.invoke({
      operation: 'design',
      provider: this.#provider,
      checkout_root: this.#checkoutRoot,
      payload: { request },
      activity,
    }));
  }

  async diagnose(input: {
    request: DesignRequest;
    blueprint: AgentBlueprint;
    evidence: EvidenceBundle;
    activity: FoundryActivityIdentity;
  }) {
    const { activity, ...payload } = input;
    return validateEvolutionProposal(await this.#invoker.invoke({
      operation: 'diagnose',
      provider: this.#provider,
      checkout_root: this.#checkoutRoot,
      payload,
      activity,
    }));
  }
}

export class FunctionFoundryDesignerAdapter implements DesignerPort {
  readonly producer_id: string;
  readonly #design: DesignerPort['design'];
  readonly #diagnose: DesignerPort['diagnose'];

  constructor(input: {
    producer_id: string;
    design: DesignerPort['design'];
    diagnose: DesignerPort['diagnose'];
  }) {
    this.producer_id = input.producer_id;
    this.#design = input.design;
    this.#diagnose = input.diagnose;
  }

  async design(request: DesignRequest, activity: FoundryActivityIdentity) {
    return this.#design(request, activity);
  }

  async diagnose(input: Parameters<DesignerPort['diagnose']>[0]) {
    return this.#diagnose(input);
  }
}
