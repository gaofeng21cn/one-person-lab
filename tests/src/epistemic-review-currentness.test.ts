import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import type { AnySchema } from 'ajv';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { listStandardDomainAgentIds } from '../../src/kernel/standard-agent-registry.ts';
import {
  evaluateEpistemicReviewCurrentness,
  normalizeEpistemicReviewScope,
} from '../../src/modules/stagecraft/review-evidence-currentness.ts';
import {
  aggregateStageQualityScopeTokenUsage,
  evaluateStageQualityScopeBudget,
  normalizeStageQualityScopeBudget,
} from '../../src/modules/stagecraft/stage-quality-scope-budget.ts';

const authorityBoundary = {
  hash_is_locator_or_stale_hint_only: true,
  hash_is_content_authority: false,
  release_integrity_is_separate: true,
  framework_can_issue_domain_verdict: false,
} as const;

function scope(input: {
  scopeId: string;
  scopeKind: 'content' | 'reference' | 'display' | 'package';
  nodes: Array<{ node_ref: string; node_kind: 'artifact' | 'claim' | 'provenance'; role: string }>;
  edges: Array<{ source_ref: string; dependent_ref: string; relation: string }>;
  reviewedNodeRefs: string[];
}) {
  return {
    surface_kind: 'opl_epistemic_review_scope',
    version: 'opl-epistemic-review-scope.v2',
    scope_id: input.scopeId,
    scope_kind: input.scopeKind,
    evidence_profile: 'epistemic_provenance',
    trust_model: 'trusted_local_workspace',
    reviewed_node_refs: input.reviewedNodeRefs,
    nodes: input.nodes,
    dependency_edges: input.edges,
    authority_boundary: authorityBoundary,
  };
}

function contentScope(owner: string) {
  return scope({
    scopeId: `${owner}:content-review`,
    scopeKind: 'content',
    nodes: [
      { node_ref: `${owner}:data`, node_kind: 'provenance', role: 'source_data' },
      { node_ref: `${owner}:code`, node_kind: 'provenance', role: 'analysis_code' },
      { node_ref: `${owner}:result`, node_kind: 'artifact', role: 'analysis_result' },
      { node_ref: `${owner}:claim`, node_kind: 'claim', role: 'claim' },
    ],
    edges: [
      { source_ref: `${owner}:data`, dependent_ref: `${owner}:result`, relation: 'derived_from' },
      { source_ref: `${owner}:code`, dependent_ref: `${owner}:result`, relation: 'derived_from' },
      { source_ref: `${owner}:result`, dependent_ref: `${owner}:claim`, relation: 'supports' },
    ],
    reviewedNodeRefs: [`${owner}:claim`],
  });
}

test('layout package and governance-only deltas do not invalidate content reviews across Agents', () => {
  for (const owner of listStandardDomainAgentIds()) {
    const evaluation = evaluateEpistemicReviewCurrentness({
      scope: contentScope(owner),
      changes: [
        { node_ref: `${owner}:layout`, change_class: 'layout', semantic_changed: true },
        { node_ref: `${owner}:package`, change_class: 'package_wrapper', semantic_changed: true },
        { node_ref: `${owner}:checklist`, change_class: 'governance_metadata', semantic_changed: true },
      ],
    });
    assert.equal(evaluation.status, 'current', owner);
    assert.equal(evaluation.invalidating_changes.length, 0, owner);
    assert.equal(evaluation.ignored_changes.length, 3, owner);
  }
});

test('scientific and claim changes invalidate only scopes that declare those dependencies', () => {
  const medical = evaluateEpistemicReviewCurrentness({
    scope: contentScope('mas'),
    changes: [{ node_ref: 'mas:result', change_class: 'analysis_result', semantic_changed: true }],
  });
  assert.equal(medical.status, 'stale');
  assert.deepEqual(medical.invalidating_changes.map((change) => change.node_ref), ['mas:result']);

  const references = scope({
    scopeId: 'mas:reference-review',
    scopeKind: 'reference',
    nodes: [
      { node_ref: 'mas:claim', node_kind: 'claim', role: 'claim' },
      { node_ref: 'mas:citation', node_kind: 'provenance', role: 'citation_linkage' },
      { node_ref: 'mas:source', node_kind: 'artifact', role: 'reference_source' },
    ],
    edges: [
      { source_ref: 'mas:source', dependent_ref: 'mas:citation', relation: 'cites' },
      { source_ref: 'mas:citation', dependent_ref: 'mas:claim', relation: 'supports' },
    ],
    reviewedNodeRefs: ['mas:claim'],
  });
  const referenceUnchanged = evaluateEpistemicReviewCurrentness({
    scope: references,
    changes: [{ node_ref: 'mas:result', change_class: 'analysis_result', semantic_changed: true }],
  });
  assert.equal(referenceUnchanged.status, 'current');
  const referenceChanged = evaluateEpistemicReviewCurrentness({
    scope: references,
    changes: [{ node_ref: 'mas:source', change_class: 'reference_source', semantic_changed: true }],
  });
  assert.equal(referenceChanged.status, 'stale');
});

test('display and package scopes react to their own semantic deltas without widening content invalidation', () => {
  const display = scope({
    scopeId: 'mas:display-review',
    scopeKind: 'display',
    nodes: [
      { node_ref: 'claim:one', node_kind: 'claim', role: 'claim' },
      { node_ref: 'figure:one', node_kind: 'artifact', role: 'visual_content' },
      { node_ref: 'layout:one', node_kind: 'provenance', role: 'layout' },
    ],
    edges: [
      { source_ref: 'claim:one', dependent_ref: 'figure:one', relation: 'renders' },
      { source_ref: 'layout:one', dependent_ref: 'figure:one', relation: 'renders' },
    ],
    reviewedNodeRefs: ['figure:one'],
  });
  assert.equal(evaluateEpistemicReviewCurrentness({
    scope: display,
    changes: [{ node_ref: 'layout:one', change_class: 'layout', semantic_changed: true }],
  }).status, 'stale');
  assert.equal(evaluateEpistemicReviewCurrentness({
    scope: contentScope('mas'),
    changes: [{ node_ref: 'layout:one', change_class: 'layout', semantic_changed: true }],
  }).status, 'current');

  const packageScope = scope({
    scopeId: 'mas:package-review',
    scopeKind: 'package',
    nodes: [
      { node_ref: 'artifact:paper', node_kind: 'artifact', role: 'package_content' },
      { node_ref: 'wrapper:zip', node_kind: 'artifact', role: 'package_wrapper' },
    ],
    edges: [{ source_ref: 'artifact:paper', dependent_ref: 'wrapper:zip', relation: 'packages' }],
    reviewedNodeRefs: ['wrapper:zip'],
  });
  assert.equal(evaluateEpistemicReviewCurrentness({
    scope: packageScope,
    changes: [{ node_ref: 'wrapper:zip', change_class: 'package_wrapper', semantic_changed: true }],
  }).status, 'stale');
});

test('hash-only locator drift is not review authority and release integrity cannot impersonate content evidence', () => {
  const masScope = contentScope('mas');
  const evaluation = evaluateEpistemicReviewCurrentness({
    scope: masScope,
    changes: [{
      node_ref: 'mas:claim',
      change_class: 'locator_only',
      semantic_changed: true,
      locator_sha256_before: `sha256:${'1'.repeat(64)}`,
      locator_sha256_after: `sha256:${'2'.repeat(64)}`,
    }],
  });
  assert.equal(evaluation.status, 'current');
  assert.equal(evaluation.ignored_changes[0]?.reason, 'locator_or_non_semantic_change_only');
  assert.throws(() => normalizeEpistemicReviewScope({
    ...masScope,
    evidence_profile: 'release_integrity',
  }), /release_integrity_must_use_separate_contract|epistemic provenance/);
});

test('content scopes reject layout package and self-referential governance nodes', () => {
  for (const role of ['layout', 'package_wrapper', 'governance_metadata', 'review_receipt']) {
    assert.throws(() => normalizeEpistemicReviewScope(scope({
      scopeId: `invalid:${role}`,
      scopeKind: 'content',
      nodes: [{ node_ref: `node:${role}`, node_kind: 'artifact', role }],
      edges: [],
      reviewedNodeRefs: [`node:${role}`],
    })), /outside its semantic domain/);
  }
});

test('scope schema accepts epistemic provenance and rejects release integrity substitution', () => {
  const schema = parseJsonText(fs.readFileSync(
    'contracts/opl-framework/epistemic-review-scope-v2.schema.json',
    'utf8',
  )) as Record<string, unknown>;
  const valid = contentScope('schema-fixture');
  assert.equal(validateJsonSchemaPayload({
    schemaId: 'epistemic-scope-v2',
    schema: schema as AnySchema,
  }, valid).ok, true);
  assert.equal(validateJsonSchemaPayload({
    schemaId: 'epistemic-scope-v2-invalid-profile',
    schema: { ...schema, $id: 'epistemic-scope-v2-invalid-profile' } as AnySchema,
  }, { ...valid, evidence_profile: 'release_integrity' }).ok, false);
});

test('scope budget schema accepts a disabled cap and large explicit safe-integer caps', () => {
  const policySchema = parseJsonText(fs.readFileSync(
    'contracts/opl-framework/stage-quality-cycle.schema.json',
    'utf8',
  )) as Record<string, any>;
  const schema = {
    $schema: policySchema.$schema,
    $id: 'https://one-person-lab.local/contracts/opl-framework/scope-budget-test.schema.json',
    ...policySchema.$defs.scopeBudget,
  } as AnySchema;
  const base = normalizeStageQualityScopeBudget(undefined);
  for (const max_tokens of [null, 50_000_000, Number.MAX_SAFE_INTEGER]) {
    assert.equal(validateJsonSchemaPayload({
      schemaId: `scope-budget-${String(max_tokens)}`,
      schema,
    }, { ...base, max_tokens }).ok, true);
  }
  assert.equal(validateJsonSchemaPayload({
    schemaId: 'scope-budget-unsafe-integer',
    schema,
  }, { ...base, max_tokens: Number.MAX_SAFE_INTEGER + 1 }).ok, false);
});

test('scope budget enforces attempts elapsed and observed tokens with typed dispositions', () => {
  const budget = normalizeStageQualityScopeBudget(undefined, { legacyMaxRepairRounds: 3 });
  assert.deepEqual(
    [budget.max_attempts, budget.max_elapsed_ms, budget.max_tokens],
    [3, 21_600_000, null],
  );
  const missingTokens = evaluateStageQualityScopeBudget({
    budget,
    usage: { attempts_used: 1, elapsed_ms: 1000, tokens_used: null },
    openFindingPriorities: ['p2'],
    hasConsumableArtifact: true,
  });
  assert.equal(missingTokens.status, 'available');
  assert.equal(missingTokens.usage.token_observation_status, 'missing');

  const observedWithoutExplicitCap = evaluateStageQualityScopeBudget({
    budget,
    usage: { attempts_used: 1, elapsed_ms: 1000, tokens_used: 8_579_482 },
    openFindingPriorities: ['p2'],
    hasConsumableArtifact: true,
  });
  assert.equal(observedWithoutExplicitCap.status, 'available');
  assert.equal(observedWithoutExplicitCap.stop_reason, null);
  assert.equal(observedWithoutExplicitCap.usage.tokens_used, 8_579_482);
  assert.equal(observedWithoutExplicitCap.usage.tokens_remaining, null);

  const ownerConfiguredCap = normalizeStageQualityScopeBudget({
    ...budget,
    max_tokens: 50_000_000,
  });
  assert.equal(ownerConfiguredCap.max_tokens, 50_000_000);

  const p2 = evaluateStageQualityScopeBudget({
    budget: { ...budget, max_tokens: 1_000_000 },
    usage: { attempts_used: 1, elapsed_ms: 1000, tokens_used: 1_000_000 },
    openFindingPriorities: ['p2'],
    hasConsumableArtifact: true,
  });
  assert.equal(p2.stop_reason, 'max_tokens_exhausted');
  assert.equal(p2.disposition, 'complete_with_quality_debt');

  const p0 = evaluateStageQualityScopeBudget({
    budget,
    usage: { attempts_used: 3, elapsed_ms: 1000, tokens_used: null },
    openFindingPriorities: ['p0'],
    hasConsumableArtifact: true,
  });
  assert.equal(p0.stop_reason, 'max_attempts_exhausted');
  assert.equal(p0.disposition, 'route_back_or_human_owner');

  const noArtifact = evaluateStageQualityScopeBudget({
    budget,
    usage: { attempts_used: 3, elapsed_ms: 1000, tokens_used: null },
    openFindingPriorities: ['p2'],
    hasConsumableArtifact: false,
  });
  assert.equal(noArtifact.disposition, 'hard_stop_no_consumable_artifact');
});

test('scope token usage remains missing until every child Attempt has an observation', () => {
  assert.deepEqual(aggregateStageQualityScopeTokenUsage([100, null, 200]), {
    tokens_used: null,
    token_observation_status: 'missing',
  });
  assert.deepEqual(aggregateStageQualityScopeTokenUsage([100, 200]), {
    tokens_used: 300,
    token_observation_status: 'observed',
  });
});

test('machine contract keeps Agent and professional Skill ownership separate', () => {
  const contract = parseJsonText(fs.readFileSync(
    'contracts/opl-framework/epistemic-review-currentness-contract.json',
    'utf8',
  )) as Record<string, any>;
  assert.match(contract.purpose, /Prevent AI hallucination/);
  assert.equal(contract.default_evidence_profile, 'epistemic_provenance');
  assert.equal(contract.default_trust_model, 'trusted_local_workspace');
  assert.equal(
    contract.adversary_model,
    'trusted_local_workspace_without_malicious_whole-workspace_forgery',
  );
  assert.equal(contract.currentness.hash_change_alone_invalidates_review, false);
  assert.equal(
    contract.currentness.locator_hash_role,
    'optional_locator_stale_hint_and_deduplication_only',
  );
  assert.equal(contract.integrity_separation.release_integrity_is_separate_contract, true);
  assert.equal(contract.agent_adoption.framework_owns_generic_contract_validation_currentness_and_attempt_enforcement, true);
  assert.equal(contract.agent_adoption.agent_owner_declares_domain_artifact_claim_and_provenance_dependencies, true);
  assert.equal(contract.agent_adoption.professional_skills_supply_quality_rules_only, true);
  assert.equal(contract.agent_adoption.professional_skills_own_generation_signatures_or_loop_scheduling, false);
});
