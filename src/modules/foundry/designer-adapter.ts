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
  authority_boundary: Record<string, unknown>;
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

function operation(value: unknown, field: string): ProviderOperation {
  if (!isRecord(value)) fail(`${field} must be an object.`);
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
  return result;
}

function projectionPolicy(value: unknown): FoundryProviderProjectionPolicy {
  if (!isRecord(value)) fail('Foundry provider projection_policy must be an object.');
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

export function readFoundryProviderManifest(checkoutRoot: string, manifestRef = 'contracts/foundry_provider.json') {
  const resolved = resolveContainedRepoJsonFile(checkoutRoot, manifestRef, 'Foundry provider manifest', 'managed package checkout');
  const parsed = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
  if (!isRecord(parsed) || parsed.surface_kind !== 'opl_foundry_provider' || parsed.version !== FOUNDRY_PROVIDER_VERSION) {
    fail('Foundry provider manifest has an unsupported identity or version.', { manifest_ref: manifestRef });
  }
  if (!isRecord(parsed.operations) || !isRecord(parsed.projection_policy) || !isRecord(parsed.authority_boundary)) {
    fail('Foundry provider manifest is incomplete.', { manifest_ref: manifestRef });
  }
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
    authority_boundary: parsed.authority_boundary,
  };
  if (!manifest.provider_id || manifest.provider_id !== manifest.agent_id || manifest.provider_id !== manifest.package_id) {
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
  if (manifest.authority_boundary.provider_owns_design_semantics !== true
    || manifest.authority_boundary.provider_owns_evaluation_semantics !== true
    || manifest.authority_boundary.provider_owns_evidence_diagnosis !== true
    || manifest.authority_boundary.provider_owns_evolution_proposals !== true
    || manifest.authority_boundary.provider_owns_foundry_run_state !== false
    || manifest.authority_boundary.provider_owns_candidate_materialization !== false
    || manifest.authority_boundary.provider_owns_evaluation_execution !== false
    || manifest.authority_boundary.provider_owns_versions_or_activation !== false
    || manifest.authority_boundary.provider_can_return_patch_or_work_order !== false
    || manifest.authority_boundary.provider_can_view_protected_test_bodies !== false
    || manifest.authority_boundary.opl_can_write_target_domain_truth !== false) {
    fail('Foundry provider manifest takes OPL runtime authority.');
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
