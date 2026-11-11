import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { codexActivityEventForTemporalHistory } from '../../src/adapters/execution/family-runtime-temporal-history-summary.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/authority/workspace/execution-scope.ts';

test('first Attempt prompt supplies typed closeout surface and exact Attempt identity', () => {
  const prompt = runnerPromptFor({attempt:{stage_attempt_id:'sat-contract',stage_id:'design',stage_run_id:'sr-contract'}});
  assert.match(prompt,/surface_kind "stage_attempt_closeout_packet"/);
  assert.match(prompt,/stage_attempt_id "sat-contract" exactly/);
  assert.match(prompt,/stage_run_id "sr-contract" exactly/);
});

test('work-item reviewer prompt includes the exact execution scope required by closeout validation', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-scope-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'studies', 'study-1');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  const scope = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:review-scope',
    workspaceBindingId: 'binding:review-scope',
    domainId: 'mas',
    workspaceRoot,
    canonicalWorkItemRoot,
    payload: { study_id: 'study-1' },
    requirement: { kind: 'work_item', alias_fields: ['study_id'] },
  });
  const prompt = runnerPromptFor({ attempt: {
    stage_attempt_id: 'sat-review', stage_run_id: 'sr-review', stage_id: 'analysis',
    attempt_role: 'reviewer', execution_scope: scope,
    workspace_locator: { workspace_root: workspaceRoot, execution_scope: scope },
  } });
  assert.ok(prompt.includes(`Exact execution_scope snapshot for typed closeout: ${JSON.stringify(scope)}`));
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Temporal history preserves protocol resume failure separately from successful initial execution', () => {
  const protocol = {status:'failed',same_thread:true,thread_id:'thread-contract',timeout_ms:120000,
    exit_code:124,timeout_reason:'timeout',packet_observed:false,closeout_rejection_reason:null};
  const history = codexActivityEventForTemporalHistory({process_output_summary:{exit_code:0,
    protocol_closeout_resume:{...protocol,stdout:'private body must not enter compact history'}}});
  assert.equal(history.process_output_summary?.exit_code,0);
  assert.deepEqual(history.process_output_summary?.protocol_closeout_resume,protocol);
});

test('closeout consumed/writeback ref lists accept the published exact ref shape and fail closed', async () => {
  const { normalizeTypedStageCloseoutPacket } = await import(
    '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts'
  );
  const exactRef = {
    kind: 'opl_reviewer_input_snapshot_member',
    ref: 'file:///workspace/studies/demo/artifacts/manuscript_canonical.md',
    size_bytes: 20888,
    sha256: 'sha256:5bc7d772a55862c89dbeb4e1ee24d8a64cab80dd701d306086e514e8ac08829d',
  };
  const packet = (value: Record<string, unknown>) => normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: [exactRef.ref],
    ...value,
  });
  const normalized = packet({
    consumed_refs: [exactRef],
    consumed_memory_refs: [exactRef.ref],
    writeback_receipt_refs: [exactRef],
    usage_refs: [exactRef],
  });
  assert.deepEqual(normalized.consumed_refs, [exactRef.ref]);
  assert.deepEqual(normalized.consumed_memory_refs, [exactRef.ref]);
  assert.deepEqual(normalized.writeback_receipt_refs, [exactRef.ref]);
  assert.deepEqual(normalized.usage_refs, [exactRef.ref]);
  // Absent stays absent, and a genuinely malformed entry is rejected rather than dropped.
  assert.deepEqual(packet({}).consumed_refs, []);
  assert.throws(() => packet({ consumed_refs: [{}] }));
  assert.throws(() => packet({ writeback_receipt_refs: [42] }));
});

test('copying the supplied closeout identity survives ingress validation, including opaque idempotency', async () => {
  const { normalizeTypedStageCloseoutPacket, validateCloseoutPacketForAttempt } = await import(
    '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts'
  );
  const { protocolCloseoutResumePrompt } = await import(
    '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts'
  );
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-closeout-identity-'));
  try {
    const canonicalWorkItemRoot = path.join(workspaceRoot, 'run-identity');
    fs.mkdirSync(canonicalWorkItemRoot);
    const scope = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:identity', workspaceBindingId: 'binding:identity',
      domainId: 'agent_engineering', workspaceRoot, canonicalWorkItemRoot,
      payload: { run_id: 'run-identity' }, requirement: { kind: 'work_item', alias_fields: ['run_id'] },
    });
    const attempt = {
      stage_attempt_id: 'sat-identity', stage_run_id: 'sr-identity',
      stage_id: 'mission-intake', attempt_role: 'producer',
      idempotency_key: 'opaque/key:"value"/\\identity',
      domain_id: 'agent_engineering', scope_kind: 'work_item', execution_scope: scope,
      workspace_locator: { workspace_root: workspaceRoot, execution_scope: scope },
    };
    for (const prompt of [runnerPromptFor({ attempt }), protocolCloseoutResumePrompt(attempt)]) {
      const lines = prompt.split('\n');
      const marker = lines.findIndex((line) => line.startsWith('Exact typed closeout identity JSON'));
      assert.notEqual(marker, -1);
      const identity = JSON.parse(lines[marker + 1]);
      assert.equal(identity.idempotency_key, attempt.idempotency_key);
      assert.equal(identity.role, 'producer');
      assert.deepEqual(identity.execution_scope, scope);
      const packet = normalizeTypedStageCloseoutPacket({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['file:///workspace/artifacts/mission.json'], ...identity,
      });
      assert.equal(validateCloseoutPacketForAttempt({ attempt, closeoutPacket: packet }).rejection, null);
      const wrongIdentity = normalizeTypedStageCloseoutPacket({
        ...packet, idempotency_key: 'another-attempt',
      });
      assert.equal(validateCloseoutPacketForAttempt({ attempt, closeoutPacket: wrongIdentity }).rejection?.reason,
        'idempotency_key_mismatch');
    }
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('closeout identity omits optional fields not supplied by the current Attempt', () => {
  const prompt = runnerPromptFor({ attempt: { stage_attempt_id: 'sat-no-key', stage_id: 'intake' } });
  const lines = prompt.split('\n');
  const marker = lines.findIndex((line) => line.startsWith('Exact typed closeout identity JSON'));
  assert.deepEqual(JSON.parse(lines[marker + 1]), { stage_attempt_id: 'sat-no-key', stage_id: 'intake' });
});

test('producer closeout with a changed in-place artifact still passes the zero-new-artifact guard', async () => {
  const { verifyStageQualityCloseoutArtifactIdentity } = await import(
    '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts'
  );
  const artifactRef = 'file:///workspace/run/artifacts/repair.json';
  const inputHash = 'a'.repeat(64);
  const outputHash = 'b'.repeat(64);
  const packet = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: [artifactRef],
    closeout_ref_metadata: [{ ref: artifactRef, sha256: `sha256:${outputHash}`, size_bytes: 1 }],
    route_impact: { stage_quality_cycle: { artifact_refs: [artifactRef], artifact_hashes: [outputHash] } },
    authority_boundary: { opl: 'transport_only' },
  };
  // Reaches byte verification (and fails there for the missing file), not the zero-new-artifact guard.
  assert.throws(
    () => verifyStageQualityCloseoutArtifactIdentity({
      closeoutPacket: packet as never,
      attempt: {
        attempt_role: 'producer', domain_id: 'agent_engineering', stage_attempt_id: 'sat-repair',
        input_artifact_refs: [artifactRef], reviewed_artifact_hashes: [inputHash],
      } as never,
      workspaceRoot: '/workspace/run',
    }),
    (error: unknown) => {
      const detail = error as { details?: { blocked_reason?: string } };
      assert.notEqual(detail.details?.blocked_reason, 'zero_new_artifact');
      return true;
    },
  );
});

