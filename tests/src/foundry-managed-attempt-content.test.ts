import {
  assert, test, fs, path, fixtureRoot, domainPackRoot, stageRunInput,
  resolveStageRunAttemptExecutorContent,
  workspaceRoot, workspaceLocator, workItemExecutionScope, scopedStageRunInput,
} from './family-runtime-stage-run-launch-cases/shared.ts';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import type { TemporalStageAttemptWorkflowInput } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { runnerPromptForExecution } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { readStandardAgentManagedTextFile } from '../../src/authority/packages/index.ts';

function attempt(role: 'producer' | 'reviewer' | 'repairer' | 're_reviewer', parent = stageRunInput()): TemporalStageAttemptWorkflowInput {
  return {
    ...parent,
    stage_attempt_id: `attempt-managed-${role}`,
    workflow_id: `workflow-managed-${role}`,
    retry_budget: {},
    domain_pack_root: domainPackRoot,
    stage_run_content_binding_version: 'opl-stage-run-attempt-content-binding.v1',
    attempt_role: role,
    quality_role_prompt_ref: parent.stage_run_spec.role_prompt_refs[role],
    quality_rubric_refs: parent.stage_run_spec.quality_rubric_refs,
    input_artifact_refs: parent.stage_run_spec.input_artifacts.map(({ ref }) => ref),
    reviewed_artifact_hashes: parent.stage_run_spec.input_artifacts.map(({ sha256 }) => sha256),
  };
}

test('StageRun isolates projects and freezes private knowledge outside public specs', () => {
  const a = workItemExecutionScope('knowledge-a');
  const b = workItemExecutionScope('knowledge-b');
  const registryRef = path.join(workspaceRoot, 'shared/memory/knowledge-sources.json');
  const policyRef = path.join(workspaceRoot, 'shared/memory/knowledge-bindings.json');
  const items = [
    { knowledgeId: 'team.preference', scope: { kind: 'owner', id: 'fixture-owner' }, ref: 'shared/memory/lesson.md', body: 'TEAM_PRIVATE_STYLE' },
    { knowledgeId: 'a.lesson', scope: { kind: 'project', id: 'knowledge-a' }, ref: 'studies/knowledge-a/memory/lesson.md', body: 'A_PRIVATE_DECISION' },
    { knowledgeId: 'b.lesson', scope: { kind: 'project', id: 'knowledge-b' }, ref: 'studies/knowledge-b/memory/lesson.md', body: 'B_PRIVATE_DECISION' },
  ];
  for (const item of items) {
    fs.mkdirSync(path.dirname(path.join(workspaceRoot, item.ref)), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, item.ref), item.body);
  }
  fs.writeFileSync(path.join(workspaceRoot, 'workspace_index.json'), JSON.stringify({
    projects: ['knowledge-a', 'knowledge-b'].map((id) => ({ project_id: id, project_root: `studies/${id}` })),
  }));
  const registry = {
    surface_kind: 'opl_knowledge_source_registry', version: 'knowledge-source-registry.v2', registry_id: 'fixture-registry', owner: 'fixture',
    sources: [{ source_id: 'fixture-source', root: workspaceRoot, status: 'active', writable: true,
      grants: [{ workspace_root: workspaceRoot, domains: ['medautoscience'] }] }],
    items: items.map(({ knowledgeId, scope, ref, body }) => ({
      surface_kind: 'opl_durable_knowledge_item', version: 'durable-knowledge-item.v2',
      knowledge_id: knowledgeId, title: 'Private lesson', scope, content_kind: 'decision', owner: 'fixture',
      body_ref: { kind: 'source_path', source_id: 'fixture-source', ref, sha256: `sha256:${crypto.createHash('sha256').update(body).digest('hex')}` },
      applicability: { domains: ['medautoscience'], stages: ['intake'], tasks: ['draft-paper'] },
      status: 'active', reviewed_at: '2020-01-01T00:00:00Z', next_review_at: '2099-01-01T00:00:00Z',
      authority_boundary: { semantic_body_owner: 'fixture', opl_role: 'catalog_recall_and_receipt_projection_only' },
    })),
  };
  fs.writeFileSync(registryRef, JSON.stringify(registry));
  fs.writeFileSync(policyRef, JSON.stringify({ surface_kind: 'opl_knowledge_source_bindings', version: 'knowledge-source-bindings.v2',
    registries: [{ registry_ref: registryRef, source_ids: ['fixture-source'], scope_ids: ['fixture-owner', 'knowledge-a', 'knowledge-b'] }] }));
  try {
    const original = scopedStageRunInput('knowledge-scope', 'knowledge-a').input;
    assert.throws(() => stageRunInput({
      executionScope: a, artifact: original.stage_run_spec.input_artifacts[0],
      locator: { ...workspaceLocator(), workspace_root: b.canonical_work_item_root },
    }), /workspace does not match/);
    const input = stageRunInput({
      invocationId: 'knowledge-scope', executionScope: a,
      artifact: original.stage_run_spec.input_artifacts[0],
      locator: { ...workspaceLocator(), project_root: b.canonical_work_item_root },
    });
    const spec = input.stage_run_spec;
    assert.deepEqual(spec.durable_knowledge_context.receipt.selected.map((item) => item.knowledge_id),
      ['fixture.stage', 'team.preference', 'a.lesson']);
    for (const body of ['A_PRIVATE_DECISION', 'B_PRIVATE_DECISION', 'TEAM_PRIVATE_STYLE']) {
      assert.equal(JSON.stringify(spec).includes(body), false, 'public immutable spec must not contain private body');
    }
    fs.writeFileSync(path.join(a.canonical_work_item_root!, 'memory/lesson.md'), 'A_CHANGED_AFTER_BINDING');
    for (const role of ['producer', 'reviewer', 'repairer', 're_reviewer'] as const) {
      const roleInput = attempt(role, input);
      const resolved = resolveStageRunAttemptExecutorContent(roleInput);
      const prompt = runnerPromptForExecution({ attempt: roleInput, ...resolved }, roleInput);
      assert.ok(prompt.includes('A_PRIVATE_DECISION'));
      assert.ok(prompt.includes('TEAM_PRIVATE_STYLE'));
      assert.equal(prompt.includes('B_PRIVATE_DECISION'), false);
      assert.equal(prompt.includes('A_CHANGED_AFTER_BINDING'), false);
    }
    registry.sources[0]!.status = 'revoked';
    fs.writeFileSync(registryRef, JSON.stringify(registry));
    assert.throws(() => resolveStageRunAttemptExecutorContent(attempt('producer', input)),
      /revoked|authoriz|unavailable/i, 'revoked private knowledge must not reach a new executor prompt');
    registry.sources[0]!.status = 'active';
    fs.writeFileSync(registryRef, JSON.stringify(registry));
    const snapshot = fileURLToPath(spec.durable_knowledge_context.snapshot_ref.ref);
    const bytes = fs.readFileSync(snapshot);
    const mode = fs.statSync(snapshot).mode;
    try {
      fs.chmodSync(snapshot, 0o600);
      fs.writeFileSync(snapshot, Buffer.from(bytes.toString().replace('A_PRIVATE_DECISION', 'TAMPERED_DECISION')));
      assert.throws(() => resolveStageRunAttemptExecutorContent(attempt('producer', input)));
    } finally { fs.writeFileSync(snapshot, bytes); fs.chmodSync(snapshot, mode); }
  } finally {
    fs.rmSync(path.join(workspaceRoot, 'shared'), { recursive: true, force: true });
    fs.rmSync(path.join(workspaceRoot, 'workspace_index.json'), { force: true });
    for (const scope of [a, b]) fs.rmSync(scope.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('managed text reader preserves UTF-8 bytes and rejects root escapes and invalid text', () => {
  const ref = 'agent/quality_gates/managed-text-reader.txt';
  const file = path.join(domainPackRoot, ref);
  const content = '\u8bc1\u636e\r\n  exact whitespace\n';
  fs.writeFileSync(file, content);
  const hydrated = readStandardAgentManagedTextFile(domainPackRoot, `${ref}#section`);
  assert.equal(hydrated.content, content);
  assert.equal(hydrated.size_bytes, Buffer.byteLength(content));
  assert.throws(() => readStandardAgentManagedTextFile(domainPackRoot, '../outside.txt'));
  const outside = path.join(fixtureRoot, 'outside.txt');
  fs.writeFileSync(outside, 'outside');
  const linkRef = 'agent/quality_gates/managed-symlink.txt';
  fs.symlinkSync(outside, path.join(domainPackRoot, linkRef));
  assert.throws(() => readStandardAgentManagedTextFile(domainPackRoot, linkRef));
  for (const invalid of [Buffer.alloc(0), Buffer.alloc(256 * 1024 + 1, 65), Buffer.from([0xff])]) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => readStandardAgentManagedTextFile(domainPackRoot, ref));
  }
});

for (const role of ['producer', 'reviewer', 'repairer', 're_reviewer'] as const) {
  test(`immutable managed manifest, policy and rubric reach ${role} provider prompt`, () => {
    const input = attempt(role);
    const resolved = resolveStageRunAttemptExecutorContent(input);
    const entries = resolved.effectiveManagedContent;
    assert.ok(entries, 'resolver must hydrate managed package content');
    assert.deepEqual(entries.map(({ purpose }) => purpose), [
      'stage_manifest', 'quality_policy', 'skill', 'policy', 'quality_rubric', 'knowledge:product', 'knowledge_recall_receipt',
    ]);
    const prompt = runnerPromptForExecution({ attempt: input, ...resolved }, input);
    for (const entry of entries) {
      if (entry.purpose.startsWith('knowledge')) {
        assert.ok(prompt.includes(entry.content));
        assert.ok(prompt.includes(entry.sha256));
        continue;
      }
      const binding = input.stage_run_spec!.content_bindings.find(
        (item) => item.purpose === entry.purpose && item.ref === entry.ref,
      )!;
      assert.equal(entry.sha256, binding.sha256);
      assert.equal(entry.size_bytes, binding.byte_size);
      assert.equal(entry.content, fs.readFileSync(path.join(domainPackRoot, entry.ref.split('#')[0]!), 'utf8'));
      assert.ok(prompt.includes(entry.content), `${entry.purpose} exact bytes must reach provider`);
      assert.ok(prompt.includes(entry.ref));
      assert.ok(prompt.includes(entry.sha256));
    }
  });
}

for (const ref of [
  'agent/stages/manifest.json', 'contracts/stage_quality_cycle_policy.json', 'agent/quality_gates/stage.md',
]) {
  test(`managed content drift fails closed: ${ref}`, () => {
    const input = attempt('reviewer');
    const file = path.join(domainPackRoot, ref);
    const original = fs.readFileSync(file);
    try {
      fs.appendFileSync(file, '\nchanged after immutable binding\n');
      assert.throws(() => resolveStageRunAttemptExecutorContent(input), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_binding_stale');
        return true;
      });
    } finally {
      fs.writeFileSync(file, original);
    }
  });
}
