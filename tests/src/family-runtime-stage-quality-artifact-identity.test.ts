import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import type { TypedStageCloseoutPacket } from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';

function sha256(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

    const receiptPath = path.join(root, 'artifact-identity-receipt.json');
    fs.writeFileSync(receiptPath, JSON.stringify({
      surface_kind: 'domain_artifact_identity_receipt',
      version: 'domain-artifact-identity-receipt.v1',
      domain_id: attempt.domain_id,
      stage_attempt_id: attempt.stage_attempt_id,
      artifact_ref: artifactRef,
      sha256: artifactHash,
      size_bytes: 128,
    }) + '\n');
    const receiptRef = pathToFileURL(receiptPath).href;
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
    fs.rmSync(root, { recursive: true, force: true });
  }
});
