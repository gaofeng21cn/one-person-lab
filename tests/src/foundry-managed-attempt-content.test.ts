import {
  assert, test, fs, path, fixtureRoot, domainPackRoot, stageRunInput,
  resolveStageRunAttemptExecutorContent,
} from './family-runtime-stage-run-launch-cases/shared.ts';
import type { TemporalStageAttemptWorkflowInput } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { runnerPromptForExecution } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { readStandardAgentManagedTextFile } from '../../src/authority/packages/index.ts';

function attempt(role: 'producer' | 'reviewer'): TemporalStageAttemptWorkflowInput {
  const parent = stageRunInput();
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

for (const role of ['producer', 'reviewer'] as const) {
  test(`immutable managed manifest, policy and rubric reach ${role} provider prompt`, () => {
    const input = attempt(role);
    const resolved = resolveStageRunAttemptExecutorContent(input);
    const entries = resolved.effectiveManagedContent;
    assert.ok(entries, 'resolver must hydrate managed package content');
    assert.deepEqual(entries.map(({ purpose }) => purpose), [
      'stage_manifest', 'quality_policy', 'quality_rubric',
    ]);
    const prompt = runnerPromptForExecution({ attempt: input, ...resolved }, input);
    for (const entry of entries) {
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
