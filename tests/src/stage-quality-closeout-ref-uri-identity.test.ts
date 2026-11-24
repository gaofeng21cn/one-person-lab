import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  verifyStageQualityArtifactIdentityAtAttemptBoundary,
  verifyStageQualityCloseoutArtifactIdentity,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/artifact-identity-verification.ts';
import type {
  TypedStageCloseoutPacket,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner/closeout-normalization.ts';

// Synthetic minimal repro for the closeout ref/uri shadowing defect: a
// metadata entry names one file with a relative `ref` plus the full `uri`,
// while the producer's consumable refs use the full uri. The lookup must
// consult either exact locator of the same entry; it must never borrow
// another entry's SHA, and duplicate consumable refs stay fail-closed.

const DOMAIN_ID = 'software_development_orchestration';
const WORK_ITEM_ID = 'synthetic-work-item';

function sha256Hex(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

type ArtifactSpec = { name: string; bytes: string };

function workspaceWithArtifacts(t: test.TestContext, specs: ArtifactSpec[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-closeout-ref-uri-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const workItemRoot = path.join(root, 'workspace', 'work-items', WORK_ITEM_ID);
  fs.mkdirSync(path.join(workItemRoot, 'artifacts'), { recursive: true });
  const artifacts = specs.map((spec) => {
    const filePath = path.join(workItemRoot, 'artifacts', spec.name);
    const bytes = Buffer.from(spec.bytes, 'utf8');
    fs.writeFileSync(filePath, bytes);
    return {
      ref: `artifacts/${spec.name}`,
      uri: pathToFileURL(filePath).href,
      sha256: `sha256:${sha256Hex(bytes)}`,
      size_bytes: bytes.length,
    };
  });
  return { root, workItemRoot, artifacts };
}

type MetadataEntry = {
  ref?: string;
  uri?: string;
  sha256: string;
  size_bytes: number;
};

function declaredPacket(input: {
  metadata: MetadataEntry[];
  consumableRefs: string[];
  closeoutRefs?: string[];
}) {
  const closeoutRefs = input.closeoutRefs
    ?? input.metadata.map((entry) => entry.uri ?? entry.ref ?? 'missing');
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_synthetic_producer',
    stage_run_id: 'sr_synthetic',
    stage_id: 'portfolio-orchestration',
    closeout_refs: closeoutRefs,
    closeout_ref_metadata: input.metadata as Array<Record<string, unknown>>,
    route_impact: {
      consumable_artifact_refs: input.consumableRefs,
    },
  };
}

type DeclaredPacket = ReturnType<typeof declaredPacket>;

function typedPacket(declared: DeclaredPacket): TypedStageCloseoutPacket {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: declared.stage_attempt_id,
    stage_run_id: declared.stage_run_id,
    scope_digest: undefined,
    closeout_refs: declared.closeout_refs,
    closeout_ref_metadata: declared.closeout_ref_metadata,
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    domain_output: undefined,
    next_owner: null,
    domain_ready_verdict: null,
    route_impact: declared.route_impact,
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  } as TypedStageCloseoutPacket;
}

function verify(declared: DeclaredPacket, workspaceRoot: string) {
  return verifyStageQualityCloseoutArtifactIdentity({
    closeoutPacket: typedPacket(declared),
    attempt: {
      stage_attempt_id: declared.stage_attempt_id,
      stage_run_id: declared.stage_run_id,
      domain_id: DOMAIN_ID,
      stage_id: declared.stage_id,
      attempt_role: 'producer',
    },
    workspaceRoot,
  })!;
}

function cycleOf(value: TypedStageCloseoutPacket | null) {
  return value?.route_impact?.stage_quality_cycle as Record<string, any>;
}

function assertFailClosed(declared: DeclaredPacket, workspaceRoot: string, blockedReason: string) {
  assert.throws(() => verify(declared, workspaceRoot), (error) => {
    assert.ok(error instanceof FrameworkContractError, `expected FrameworkContractError, got ${String(error)}`);
    assert.equal((error as FrameworkContractError).details?.blocked_reason, blockedReason);
    return true;
  });
}

test('a relative ref plus a full uri on the same metadata entry still binds the consumable identity', (t) => {
  const { workItemRoot, artifacts } = workspaceWithArtifacts(t, [
    { name: 'summary.md', bytes: '# summary\n' },
    { name: 'plan.json', bytes: '{"steps":[]}\n' },
  ]);
  const [summary, plan] = artifacts;
  // The failing shape: ref is relative, uri is the full file URL, and only the
  // uri equals the declared consumable ref.
  const declared = declaredPacket({
    metadata: [
      { ref: summary.ref, uri: summary.uri, sha256: summary.sha256, size_bytes: summary.size_bytes },
      { ref: plan.ref, uri: plan.uri, sha256: plan.sha256, size_bytes: plan.size_bytes },
    ],
    consumableRefs: [summary.uri, plan.uri],
  });

  const verified = verify(declared, workItemRoot);
  const cycle = cycleOf(verified);
  assert.ok(cycle, 'closeout must derive a Review identity cycle');
  assert.deepEqual(cycle.artifact_refs, [summary.uri, plan.uri]);
  assert.deepEqual(cycle.artifact_hashes, [summary.sha256.replace('sha256:', ''), plan.sha256.replace('sha256:', '')]);
  assert.equal(cycle.artifact_identity_receipt_refs.length, 2);

  const reviewIdentity = verifyStageQualityArtifactIdentityAtAttemptBoundary({
    artifactRefs: cycle.artifact_refs,
    artifactHashes: cycle.artifact_hashes,
    artifactIdentityReceiptRefs: cycle.artifact_identity_receipt_refs,
    domainId: DOMAIN_ID,
    workspaceRoot: workItemRoot,
    expectedProducingAttemptId: declared.stage_attempt_id,
    expectedProducingStageId: declared.stage_id,
    expectedStageRunId: declared.stage_run_id,
    expectedScopeKind: 'domain',
    expectedExecutionScope: null,
  });
  assert.deepEqual(reviewIdentity.artifact_refs, [summary.uri, plan.uri]);

  for (const [index, receiptRef] of cycle.artifact_identity_receipt_refs.entries()) {
    const receipt = JSON.parse(fs.readFileSync(fileURLToPath(receiptRef), 'utf8'));
    assert.equal(receipt.surface_kind, 'opl_transport_artifact_identity_receipt');
    assert.equal(receipt.stage_attempt_id, declared.stage_attempt_id);
    assert.equal(receipt.artifact_ref, cycle.artifact_refs[index]);
    assert.equal(receipt.sha256, cycle.artifact_hashes[index]);
  }
});

test('a metadata entry whose ref already equals the full uri keeps matching (positive control)', (t) => {
  const { workItemRoot, artifacts } = workspaceWithArtifacts(t, [{ name: 'note.md', bytes: 'note\n' }]);
  const [note] = artifacts;
  const declared = declaredPacket({
    metadata: [{ ref: note.uri, uri: note.uri, sha256: note.sha256, size_bytes: note.size_bytes }],
    consumableRefs: [note.uri],
  });
  const cycle = cycleOf(verify(declared, workItemRoot));
  assert.deepEqual(cycle.artifact_refs, [note.uri]);
  assert.equal(cycle.artifact_identity_receipt_refs.length, 1);
});

test('a consumable ref matching no entry exactly derives nothing instead of borrowing another entry SHA', (t) => {
  const { workItemRoot, artifacts } = workspaceWithArtifacts(t, [
    { name: 'real.md', bytes: 'real\n' },
    { name: 'other.md', bytes: 'other\n' },
  ]);
  const [real, other] = artifacts;
  // The consumable uri names other.md, but the only metadata entry names
  // real.md. Exact ref-or-uri matching must not bind real.md's SHA to
  // other.md's uri; it must derive no identity at all.
  const declared = declaredPacket({
    metadata: [{ ref: real.ref, uri: real.uri, sha256: real.sha256, size_bytes: real.size_bytes }],
    consumableRefs: [other.uri],
    closeoutRefs: [real.uri, other.uri],
  });
  const verified = verify(declared, workItemRoot);
  const cycle = cycleOf(verified);
  assert.ok(!cycle || !Array.isArray(cycle.artifact_identity_receipt_refs) || cycle.artifact_identity_receipt_refs.length === 0,
    'no identity receipt may be fabricated for an unmatched consumable ref');
  const metadata = (verified.closeout_ref_metadata ?? []) as Array<Record<string, unknown>>;
  assert.equal(metadata.filter((entry) => entry.artifact_identity_receipt_ref).length, 0);
});

test('a matching entry whose declared sha belongs to a different file stays fail-closed', (t) => {
  const { workItemRoot, artifacts } = workspaceWithArtifacts(t, [
    { name: 'real.md', bytes: 'real\n' },
    { name: 'other.md', bytes: 'other\n' },
  ]);
  const [real, other] = artifacts;
  const declared = declaredPacket({
    metadata: [{ ref: other.ref, uri: other.uri, sha256: real.sha256, size_bytes: real.size_bytes }],
    consumableRefs: [other.uri],
    closeoutRefs: [other.uri],
  });
  assertFailClosed(declared, workItemRoot, 'artifact_byte_identity_mismatch');
});

test('duplicate consumable refs are rejected instead of silently deduplicated', (t) => {
  const { workItemRoot, artifacts } = workspaceWithArtifacts(t, [{ name: 'dup.md', bytes: 'dup\n' }]);
  const [dup] = artifacts;
  const declared = declaredPacket({
    metadata: [{ ref: dup.ref, uri: dup.uri, sha256: dup.sha256, size_bytes: dup.size_bytes }],
    consumableRefs: [dup.uri, dup.uri],
  });
  assertFailClosed(declared, workItemRoot, 'artifact_byte_identity_mismatch');
});

test('a wrong declared sha stays fail-closed even when the uri matches', (t) => {
  const { workItemRoot, artifacts } = workspaceWithArtifacts(t, [{ name: 'hash.md', bytes: 'hash\n' }]);
  const [hash] = artifacts;
  const declared = declaredPacket({
    metadata: [{ ref: hash.ref, uri: hash.uri, sha256: `sha256:${'0'.repeat(64)}`, size_bytes: hash.size_bytes }],
    consumableRefs: [hash.uri],
  });
  assertFailClosed(declared, workItemRoot, 'artifact_byte_identity_mismatch');
});
