import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../../src/kernel/canonical-json.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  type AgentBlueprint,
  type FoundryProviderManifest,
  type FoundryActivityIdentity,
} from '../../../src/authority/evolution/index.ts';

export const provider: FoundryProviderManifest = {
  surface_kind: 'opl_foundry_provider',
  version: 'opl-foundry-provider.v1',
  provider_id: 'oma',
  agent_id: 'oma',
  package_id: 'oma',
  domain_id: 'agent_engineering',
  carrier_slug: 'opl-meta-agent',
  operations: {
    design: {
      input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
      output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
      entry_stage_ref: 'mission-intake',
      required_stage_refs: ['mission-intake', 'evaluation-design'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evaluation-design',
    },
    diagnose: {
      input_schema_refs: [
        'opl://foundry-protocol/DesignRequest',
        'opl://foundry-protocol/AgentBlueprint',
        'opl://foundry-protocol/EvidenceBundle',
      ],
      output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
      entry_stage_ref: 'evidence-diagnosis',
      required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evolution-proposal',
    },
  },
  projection_policy: {
    public_action_ids: ['engineer-fixture'],
    internal_operations_are_public_actions: false,
    internal_operations_are_cli_commands: false,
    internal_operations_are_mcp_tools: false,
  },
  authority_boundary: {
    provider_owns_design_semantics: true,
    provider_owns_evaluation_semantics: true,
    provider_owns_evidence_diagnosis: true,
    provider_owns_evolution_proposals: true,
    provider_owns_foundry_run_state: false,
    provider_owns_candidate_materialization: false,
    provider_owns_evaluation_execution: false,
    provider_owns_versions_or_activation: false,
    provider_can_return_patch_or_work_order: false,
    provider_can_view_protected_test_bodies: false,
    opl_can_write_target_domain_truth: false,
  },
};

export const activity: FoundryActivityIdentity = {
  run_id: 'run:provider-stage-test',
  iteration: 0,
  phase: 'design',
  input_digest: `sha256:${'1'.repeat(64)}`,
};

export function state(input: {
  stage: string;
  status?: string;
  next?: string | null;
  refs?: string[];
  hashes?: string[];
  currentRole?: string | null;
  attempts?: Array<Record<string, unknown>>;
  blockedReason?: string | null;
}) {
  return {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: `stage-run:${input.stage}`,
    workflow_id: `workflow:${input.stage}`,
    stage_id: input.stage,
    status: input.status ?? 'completed',
    artifact_refs: input.refs ?? [],
    artifact_hashes: input.hashes ?? [],
    next_stage_run_launch: input.next
      ? { target_workflow_id: input.next }
      : null,
    current_role: input.currentRole ?? null,
    attempts: input.attempts ?? [],
    blocked_reason: input.blockedReason ?? null,
    hard_stop_class: null,
    updated_at: new Date().toISOString(),
  };
}

export const CONTENT_KINDS = ['prompt', 'skill', 'knowledge', 'helper', 'model', 'tool', 'schema'] as const;

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function providerResourceBytes(kind: typeof CONTENT_KINDS[number], label: string) {
  if (kind === 'schema') {
    return canonicalJsonBytes({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        request: { type: 'string' },
      },
      required: ['request'],
      additionalProperties: false,
    });
  }
  return Buffer.from(`${kind} ${label}\n`);
}

export function writeProviderArtifact(root: string, name: string, bytes: Buffer) {
  const directory = path.join(root, 'provider-outputs');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  const digest = sha256(bytes);
  return {
    bytes,
    ref: pathToFileURL(file).href,
    sha256: `sha256:${digest}`,
    content_ref: `opl-content://sha256/${digest}`,
  };
}

export function transportBlueprint(
  resources: Record<typeof CONTENT_KINDS[number], ReturnType<typeof writeProviderArtifact>>,
): AgentBlueprint {
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: 'blueprint:provider-transport-fixture',
    target_agent_id: 'provider-transport-agent',
    target_domain_id: 'provider_transport_domain',
    target_version_ref: null,
    design_request_digest: `sha256:${'1'.repeat(64)}`,
    generation: 0,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'domain_delivery',
        goal: 'Deliver the provider transport fixture.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: resources.prompt.content_ref,
        skill_refs: [resources.skill.content_ref],
        knowledge_refs: [resources.knowledge.content_ref],
        capability_refs: ['capability:fixture'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the provider transport fixture.',
      entry_stage_id: 'deliver',
      input_schema_ref: resources.schema.content_ref,
      output_schema_ref: resources.schema.content_ref,
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: resources.schema.content_ref,
      authority_owner_ref: 'owner:fixture',
    }],
    content_refs: {
      prompt_refs: [resources.prompt.content_ref],
      skill_refs: [resources.skill.content_ref],
      knowledge_refs: [resources.knowledge.content_ref],
      helper_refs: [resources.helper.content_ref],
      model_refs: [resources.model.content_ref],
      tool_refs: [resources.tool.content_ref],
      schema_refs: [resources.schema.content_ref],
    },
    capability_requirements: ['capability:fixture'],
    authority_policy: {
      truth_owner_ref: 'owner:fixture',
      artifact_owner_ref: 'owner:fixture',
      quality_owner_ref: 'owner:fixture',
      permission_refs: [],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: [],
      retention_refs: [],
      write_authority_refs: [],
      knowledge_requirements: [],
    },
    assumptions: [],
    design_evidence_refs: [],
    eval_spec: {
      eval_spec_id: 'eval:provider-transport-fixture',
      public_cases: [{ case_id: 'case:fixture', test_ref: 'test:fixture', weight: 1, required: true }],
      protected_requirements: [{ category: 'protected-fixture', minimum_case_count: 1 }],
      gates: [{ gate_id: 'gate:fixture', metric: 'score', operator: 'gte', threshold: 1, required: true }],
      baseline_comparison: { required: false, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}
