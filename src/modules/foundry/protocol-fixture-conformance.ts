import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  foundryFrozenEvaluationPlanDigest,
} from './evaluation-runtime.ts';
import {
  assertSameTarget,
  foundryContentDigest,
  validateAgentBlueprint,
  validateDesignRequest,
  validateEvidenceBundle,
  validateEvolutionProposal,
  type AgentBlueprint,
} from './protocol.ts';

export const FOUNDRY_PROTOCOL_FIXTURE_CONFORMANCE_VERSION =
  'opl-foundry-protocol-fixture-conformance.v1' as const;

export interface FoundryProtocolFixtureSet {
  design_request: unknown;
  agent_blueprint: unknown;
  evidence_bundle: unknown;
  evolution_proposal: unknown;
}

const CONTENT_REF_KINDS = [
  'prompt_refs',
  'skill_refs',
  'knowledge_refs',
  'helper_refs',
  'model_refs',
  'tool_refs',
  'schema_refs',
] as const;

const EXACT_CONTENT_REF = /^opl-content:\/\/sha256\/[a-f0-9]{64}$/;

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function assertDigestLineage(actual: string, expected: string, field: string) {
  if (actual !== expected) {
    fail('Foundry protocol fixture digest lineage is stale or mismatched.', {
      field,
      expected,
      actual,
    });
  }
}

function assertExactContentRefs(blueprint: AgentBlueprint, label: string) {
  for (const kind of CONTENT_REF_KINDS) {
    for (const [index, ref] of blueprint.content_refs[kind].entries()) {
      if (!EXACT_CONTENT_REF.test(ref)) {
        fail('Foundry protocol fixture content refs must be exact SHA-256 refs.', {
          field: `${label}.content_refs.${kind}[${index}]`,
          actual: ref,
        });
      }
    }
  }
}

export function validateFoundryProtocolFixtureSet(input: FoundryProtocolFixtureSet) {
  const designRequest = validateDesignRequest(input.design_request);
  const agentBlueprint = validateAgentBlueprint(input.agent_blueprint);
  const evidenceBundle = validateEvidenceBundle(input.evidence_bundle);
  const evolutionProposal = validateEvolutionProposal(input.evolution_proposal);

  assertSameTarget(designRequest, agentBlueprint, 'AgentBlueprint fixture');
  assertSameTarget(designRequest, evidenceBundle, 'EvidenceBundle fixture');
  assertSameTarget(designRequest, evolutionProposal, 'EvolutionProposal fixture');
  assertSameTarget(designRequest, evolutionProposal.next_blueprint, 'EvolutionProposal next AgentBlueprint fixture');

  const designRequestDigest = foundryContentDigest(designRequest);
  const agentBlueprintDigest = foundryContentDigest(agentBlueprint);
  const evidenceBundleDigest = foundryContentDigest(evidenceBundle);
  assertDigestLineage(
    agentBlueprint.design_request_digest,
    designRequestDigest,
    'agent_blueprint.design_request_digest',
  );
  assertDigestLineage(evidenceBundle.blueprint_digest, agentBlueprintDigest, 'evidence_bundle.blueprint_digest');
  assertDigestLineage(evolutionProposal.blueprint_digest, agentBlueprintDigest, 'evolution_proposal.blueprint_digest');
  assertDigestLineage(evolutionProposal.evidence_digest, evidenceBundleDigest, 'evolution_proposal.evidence_digest');
  assertDigestLineage(
    evolutionProposal.next_blueprint.design_request_digest,
    designRequestDigest,
    'evolution_proposal.next_blueprint.design_request_digest',
  );

  assertExactContentRefs(agentBlueprint, 'agent_blueprint');
  assertExactContentRefs(evolutionProposal.next_blueprint, 'evolution_proposal.next_blueprint');
  assertBlueprintSatisfiesDesignRequest(designRequest, agentBlueprint);
  assertBlueprintSatisfiesDesignRequest(designRequest, evolutionProposal.next_blueprint);

  const frozenPlanDigest = foundryFrozenEvaluationPlanDigest(agentBlueprint.eval_spec);
  assertDigestLineage(
    evidenceBundle.frozen_test_plan_digest,
    frozenPlanDigest,
    'evidence_bundle.frozen_test_plan_digest',
  );
  assertEvaluationEvidenceFacts({
    request: designRequest,
    spec: agentBlueprint.eval_spec,
    evidence: evidenceBundle,
    baseline_present: evidenceBundle.baseline_version_digest !== null,
  });

  return {
    version: FOUNDRY_PROTOCOL_FIXTURE_CONFORMANCE_VERSION,
    design_request: designRequest,
    agent_blueprint: agentBlueprint,
    evidence_bundle: evidenceBundle,
    evolution_proposal: evolutionProposal,
  };
}
