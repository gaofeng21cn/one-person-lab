import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { stageQualityAttemptMaterializeActivity } from '../../src/modules/runway/family-runtime-temporal-activities.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/modules/stagecraft/stage-quality-cycle.ts';
import {
  verifyStageQualityArtifactIdentityAtAttemptBoundary,
  verifyStageQualityCloseoutArtifactIdentity,
} from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import type { TypedStageCloseoutPacket } from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';

function sha256(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeIdentityDirectory(value: string) {
  const readable = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'domain';
  return `${readable}-${sha256(value).slice(0, 12)}`;
}

function writeAuthorityReceipt(input: {
  stateRoot: string;
  receipt: Record<string, unknown>;
}) {
  const bytes = Buffer.from(`${JSON.stringify(input.receipt, null, 2)}\n`, 'utf8');
  const receiptDir = path.join(
    input.stateRoot,
    'runtime-state',
    'domain-artifact-identity-receipts',
    safeIdentityDirectory(String(input.receipt.domain_id)),
  );
  fs.mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${sha256(bytes)}.json`);
  fs.writeFileSync(receiptPath, bytes);
  return pathToFileURL(receiptPath).href;
}

function producerCloseout(input: {
  artifactRef: string;
  artifactHash: string;
  artifactIdentityReceiptRef?: string;
}): TypedStageCloseoutPacket {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat-artifact-identity',
    closeout_refs: [input.artifactRef],
    closeout_ref_metadata: [{
      ref: input.artifactRef,
      sha256: input.artifactHash,
      ...(input.artifactIdentityReceiptRef
        ? { artifact_identity_receipt_ref: input.artifactIdentityReceiptRef }
        : {}),
    }],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    domain_ready_verdict: null,
    route_impact: {
      stage_quality_cycle: {
        artifact_refs: [input.artifactRef],
        artifact_hashes: [input.artifactHash],
      },
    },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

const attempt = {
  stage_attempt_id: 'sat-artifact-identity',
  domain_id: 'example-domain',
  stage_id: 'authoring',
  attempt_role: 'producer',
};

test('local Stage artifact identity is bound to final bytes and a transport receipt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-artifact-identity-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    const artifactPath = path.join(root, 'artifact.txt');
    const bytes = Buffer.from('exact final artifact bytes\n');
    fs.writeFileSync(artifactPath, bytes);
    const artifactRef = pathToFileURL(artifactPath).href;
    const verified = verifyStageQualityCloseoutArtifactIdentity({
      closeoutPacket: producerCloseout({ artifactRef, artifactHash: sha256(bytes) }),
      attempt,
      workspaceRoot: root,
    });
    const metadata = verified?.closeout_ref_metadata?.[0];
    assert.equal(metadata?.sha256, sha256(bytes));
    assert.equal(metadata?.size_bytes, bytes.length);
    assert.match(String(metadata?.artifact_identity_receipt_ref), /^file:\/\//);
    const receipt = JSON.parse(fs.readFileSync(new URL(String(metadata?.artifact_identity_receipt_ref)), 'utf8'));
    assert.equal(receipt.surface_kind, 'opl_transport_artifact_identity_receipt');
    assert.equal(receipt.version, 'opl-transport-artifact-identity-receipt.v1');
    assert.equal(receipt.artifact_ref, artifactRef);
    assert.equal(receipt.sha256, sha256(bytes));
    assert.equal(receipt.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(path.basename(new URL(String(metadata?.artifact_identity_receipt_ref)).pathname), `${sha256(
      fs.readFileSync(new URL(String(metadata?.artifact_identity_receipt_ref))),
    )}.json`);

    verifyStageQualityArtifactIdentityAtAttemptBoundary({
      artifactRefs: [artifactRef],
      artifactHashes: [sha256(bytes)],
      artifactIdentityReceiptRefs: [String(metadata?.artifact_identity_receipt_ref)],
      domainId: attempt.domain_id,
      workspaceRoot: root,
      expectedProducingAttemptId: attempt.stage_attempt_id,
    });
    assert.throws(
      () => verifyStageQualityArtifactIdentityAtAttemptBoundary({
        artifactRefs: [artifactRef],
        artifactHashes: [sha256(bytes)],
        artifactIdentityReceiptRefs: [String(metadata?.artifact_identity_receipt_ref)],
        domainId: attempt.domain_id,
        workspaceRoot: root,
        expectedProducingAttemptId: 'sat-different-producer',
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_identity_receipt_mismatch_authority_violation',
    );
    fs.writeFileSync(artifactPath, 'changed after producer closeout\n');
    assert.throws(
      () => verifyStageQualityArtifactIdentityAtAttemptBoundary({
        artifactRefs: [artifactRef],
        artifactHashes: [sha256(bytes)],
        artifactIdentityReceiptRefs: [String(metadata?.artifact_identity_receipt_ref)],
        domainId: attempt.domain_id,
        workspaceRoot: root,
        expectedProducingAttemptId: attempt.stage_attempt_id,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_byte_identity_mismatch',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('transport rejects both a model hash lie and post-closeout byte tampering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-artifact-tamper-'));
  try {
    const artifactPath = path.join(root, 'artifact.txt');
    const original = Buffer.from('original bytes\n');
    const artifactRef = pathToFileURL(artifactPath).href;
    fs.writeFileSync(artifactPath, original);
    assert.throws(
      () => verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: producerCloseout({ artifactRef, artifactHash: '0'.repeat(64) }),
        attempt,
        workspaceRoot: root,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_byte_identity_mismatch',
    );

    const declaredHash = sha256(original);
    fs.writeFileSync(artifactPath, 'tampered bytes\n');
    assert.throws(
      () => verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: producerCloseout({ artifactRef, artifactHash: declaredHash }),
        attempt,
        workspaceRoot: root,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_byte_identity_mismatch',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('external artifact requires an independently readable exact domain identity receipt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-external-artifact-'));
  const stateRoot = path.join(root, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const artifactRef = 'artifact://domain/final-output';
  const artifactHash = sha256('external artifact identity');
  try {
    assert.throws(
      () => verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: producerCloseout({ artifactRef, artifactHash }),
        attempt,
        workspaceRoot: root,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_identity_receipt_missing_authority_violation',
    );

    const receipt = {
      surface_kind: 'domain_artifact_identity_receipt',
      version: 'domain-artifact-identity-receipt.v1',
      domain_id: attempt.domain_id,
      stage_attempt_id: attempt.stage_attempt_id,
      artifact_ref: artifactRef,
      sha256: artifactHash,
      size_bytes: 128,
    };
    const untrustedReceiptPath = path.join(root, 'workspace-authored-receipt.json');
    fs.writeFileSync(untrustedReceiptPath, `${JSON.stringify(receipt)}\n`);
    assert.throws(
      () => verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: producerCloseout({
          artifactRef,
          artifactHash,
          artifactIdentityReceiptRef: pathToFileURL(untrustedReceiptPath).href,
        }),
        attempt,
        workspaceRoot: root,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_identity_receipt_untrusted_root_authority_violation',
    );

    const receiptRef = writeAuthorityReceipt({ stateRoot, receipt });
    const wrongDigestReceiptPath = path.join(path.dirname(fileURLToPath(receiptRef)), `${'0'.repeat(64)}.json`);
    fs.copyFileSync(fileURLToPath(receiptRef), wrongDigestReceiptPath);
    assert.throws(
      () => verifyStageQualityCloseoutArtifactIdentity({
        closeoutPacket: producerCloseout({
          artifactRef,
          artifactHash,
          artifactIdentityReceiptRef: pathToFileURL(wrongDigestReceiptPath).href,
        }),
        attempt,
        workspaceRoot: root,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_identity_receipt_byte_digest_mismatch_authority_violation',
    );
    const verified = verifyStageQualityCloseoutArtifactIdentity({
      closeoutPacket: producerCloseout({
        artifactRef,
        artifactHash,
        artifactIdentityReceiptRef: receiptRef,
      }),
      attempt,
      workspaceRoot: root,
    });
    assert.equal(verified?.closeout_ref_metadata?.[0]?.artifact_identity_receipt_ref, receiptRef);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('artifact identity preserves ref-hash pairs and permits equal hashes for different refs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-artifact-pairs-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    const bytes = Buffer.from('same exact bytes\n');
    const artifactPaths = [path.join(root, 'a.txt'), path.join(root, 'b.txt')];
    artifactPaths.forEach((artifactPath) => fs.writeFileSync(artifactPath, bytes));
    const artifactRefs = artifactPaths.map((artifactPath) => pathToFileURL(artifactPath).href);
    const verified = verifyStageQualityCloseoutArtifactIdentity({
      closeoutPacket: {
        ...producerCloseout({ artifactRef: artifactRefs[0], artifactHash: sha256(bytes) }),
        closeout_refs: artifactRefs,
        closeout_ref_metadata: artifactRefs.map((ref) => ({ ref, sha256: sha256(bytes) })),
        route_impact: {
          stage_quality_cycle: {
            artifact_refs: artifactRefs,
            artifact_hashes: [sha256(bytes), sha256(bytes)],
          },
        },
      },
      attempt,
      workspaceRoot: root,
    });
    const receipts = verified?.closeout_ref_metadata?.map((entry) => entry.artifact_identity_receipt_ref) ?? [];
    const identity = verifyStageQualityArtifactIdentityAtAttemptBoundary({
      artifactRefs,
      artifactHashes: [sha256(bytes), sha256(bytes)],
      artifactIdentityReceiptRefs: receipts,
      domainId: attempt.domain_id,
      workspaceRoot: root,
      expectedProducingAttemptId: attempt.stage_attempt_id,
    });
    assert.deepEqual(identity.artifact_refs, artifactRefs);
    assert.deepEqual(identity.artifact_hashes, [sha256(bytes), sha256(bytes)]);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reviewer materialization revalidates current artifact bytes before creating a fresh Attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-review-boundary-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    const artifactPath = path.join(root, 'artifact.txt');
    const original = Buffer.from('producer bytes accepted at closeout\n');
    fs.writeFileSync(artifactPath, original);
    const artifactRef = pathToFileURL(artifactPath).href;
    const producerAttempt = {
      ...attempt,
      domain_id: 'redcube',
      stage_attempt_id: 'sat-review-boundary-producer',
    };
    const verified = verifyStageQualityCloseoutArtifactIdentity({
      closeoutPacket: {
        ...producerCloseout({ artifactRef, artifactHash: sha256(original) }),
        stage_attempt_id: producerAttempt.stage_attempt_id,
      },
      attempt: producerAttempt,
      workspaceRoot: root,
    });
    const receiptRef = String(verified?.closeout_ref_metadata?.[0]?.artifact_identity_receipt_ref);
    fs.writeFileSync(artifactPath, 'bytes changed before reviewer materialization\n');

    await assert.rejects(
      () => stageQualityAttemptMaterializeActivity({
        quality_cycle_id: 'quality-cycle:review-boundary',
        attempt_role: 'reviewer',
        quality_round_index: 0,
        artifact_producer_attempt_ref: `opl://stage_attempts/${producerAttempt.stage_attempt_id}`,
        artifact_refs: [artifactRef],
        artifact_hashes: [sha256(original)],
        artifact_identity_receipt_refs: [receiptRef],
        stage_run: {
          stage_run_id: 'stage-run:review-boundary',
          workflow_id: 'workflow:review-boundary',
          domain_id: 'redcube',
          stage_id: 'artifact_creation',
          declared_stage_ids: ['artifact_creation', 'review_and_revision'],
          workspace_locator: { workspace_root: root },
          source_fingerprint: 'sha256:source',
          executor_kind: 'codex_cli',
          stage_packet_ref: 'packet:artifact-creation',
          quality_policy_ref: 'quality-policy:artifact-creation',
          domain_pack_root: root,
          stage_manifest_ref: 'agent/stages/manifest.json',
          stage_manifest_sha256: 'sha256:manifest',
          stage_role: 'creation',
          quality_policy: normalizeStageQualityCyclePolicy({
            formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
          }),
          role_prompt_refs: {
            producer: 'prompt:producer',
            reviewer: 'prompt:reviewer',
            repairer: 'prompt:repairer',
            re_reviewer: 'prompt:re-reviewer',
          },
          quality_rubric_refs: ['rubric:artifact'],
          stage_goal_refs: ['goal:artifact'],
          source_refs: ['source:brief'],
        },
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason === 'artifact_byte_identity_mismatch',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
