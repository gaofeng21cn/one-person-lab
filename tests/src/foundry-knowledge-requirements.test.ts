import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  foundryContentDigest,
  validateAgentBlueprint,
  validateKnowledgeRequirements,
  type AgentBlueprint,
} from '../../src/authority/evolution/protocol.ts';
import { recomputeBlueprintRisk } from '../../src/authority/evolution/risk-policy.ts';
import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
} from '../../src/authority/evidence/foundry-persistent-adapters.ts';

function blueprint(): AgentBlueprint {
  return JSON.parse(fs.readFileSync(new URL(
    '../fixtures/oma-0.4.0/foundry-protocol/agent-blueprint.json', import.meta.url,
  ), 'utf8')) as AgentBlueprint;
}

function validateSchema(value: unknown) {
  return assertRepoJsonSchemaPayload({
    repoRoot: process.cwd(),
    schemaRef: 'contracts/opl-framework/foundry-agent-blueprint.schema.json',
    payload: value,
    label: 'knowledge requirements blueprint',
  });
}

test('blueprints declare knowledge ownership and source requirements with a closed semantic shape', () => {
  const candidate = blueprint();
  assert.ok(candidate.memory_policy.knowledge_requirements.length);
  assert.equal(validateAgentBlueprint(candidate), candidate);
  assert.equal(validateSchema(candidate).status, 'valid');

  const withoutRequirements = structuredClone(candidate) as unknown as Record<string, unknown>;
  delete (withoutRequirements.memory_policy as Record<string, unknown>).knowledge_requirements;
  assert.throws(() => validateAgentBlueprint(withoutRequirements));
  assert.throws(() => validateSchema(withoutRequirements));

  for (const mutation of [
    { scope_kind: 'dated_state' },
    { content_kind: 'workspace_shared' },
    { source_modes: ['external'] },
    { source_modes: [] },
    { scope_kind: 'owner', source_modes: ['product'] },
    { action_critical: 'true' },
    { source_root: '/private/knowledge' },
  ]) {
    const invalid = structuredClone(candidate);
    Object.assign(invalid.memory_policy.knowledge_requirements[0]!, mutation);
    assert.throws(() => validateAgentBlueprint(invalid));
    assert.throws(() => validateSchema(invalid));
  }
  const duplicated = structuredClone(candidate);
  duplicated.memory_policy.knowledge_requirements.push({ ...duplicated.memory_policy.knowledge_requirements[0]! });
  assert.throws(() => validateAgentBlueprint(duplicated), /requirement_id values must be unique/);

  const physicalSource = structuredClone(candidate);
  physicalSource.memory_policy.knowledge_requirements[0]!.semantic_owner_ref = '/private/person';
  assert.throws(() => validateAgentBlueprint(physicalSource), /semantic protocol boundary/);
  assert.throws(() => validateKnowledgeRequirements(physicalSource.memory_policy.knowledge_requirements), /semantic protocol boundary/);
});

test('knowledge requirements survive candidate materialization and affect version risk and identity', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-knowledge-blueprint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new FileFoundryContentStore(root);
  const initial = blueprint();
  const mappings = new Map<string, string>();
  for (const [kind, refs] of Object.entries(initial.content_refs)) {
    for (const [index, ref] of refs.entries()) {
      const content = kind === 'schema_refs'
        ? JSON.stringify({ title: `${kind}-${index}`, type: 'object', additionalProperties: true })
        : `${kind}-${index}\n`;
      mappings.set(ref, store.put(Buffer.from(content)).ref);
    }
  }
  const candidate = JSON.parse(JSON.stringify(initial), (_key, value) =>
    typeof value === 'string' ? mappings.get(value) ?? value : value) as AgentBlueprint;
  validateAgentBlueprint(candidate);
  const compiler = new ContentAddressedCandidateCompiler(root);
  const first = await compiler.materialize({
    run_id: 'run:knowledge-requirements',
    blueprint: candidate,
    blueprint_digest: foundryContentDigest(candidate),
  });
  const persisted = JSON.parse(fs.readFileSync(path.join(
    compiler.candidateDirectory(first.candidate_digest), 'contracts/memory_policy.json',
  ), 'utf8'));
  assert.deepEqual(persisted.knowledge_requirements, candidate.memory_policy.knowledge_requirements);

  const changed = structuredClone(candidate);
  changed.memory_policy.knowledge_requirements.push({
    requirement_id: 'owner-current-policy',
    scope_kind: 'owner',
    content_kind: 'policy',
    semantic_owner_ref: 'owner:current-user',
    source_modes: ['workspace', 'external'],
    requirement: 'required',
    freshness_policy: 'review on source revision and before action',
    writeback_owner_ref: 'owner:current-user',
    derived_dependency_policy: 'bind exact source revisions and revalidate permission',
    action_critical: true,
  });
  validateAgentBlueprint(changed);
  validateSchema(changed);
  const risk = recomputeBlueprintRisk(candidate, changed);
  assert.equal(risk.risk_tier, 'high');
  assert.ok(risk.reasons.includes('memory_policy_changed'));
  const second = await compiler.materialize({
    run_id: 'run:knowledge-requirements-updated',
    blueprint: changed,
    blueprint_digest: foundryContentDigest(changed),
  });
  assert.notEqual(first.candidate_digest, second.candidate_digest);
});
