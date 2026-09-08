import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import type { TypedStageCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { recoverFrameworkRawArtifactForAttempt } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/raw-artifact-identity-verification.ts';
import { persistRawStageOutput } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';
import { runWithWorkItemFileBoundaryInterlock } from './work-item-file-boundary-test-support.ts';

type RawArtifact = NonNullable<ReturnType<typeof persistRawStageOutput>>;
type RawAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  attempt_role: string;
};

function sha256(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function rawCloseout(attempt: RawAttempt, artifact: RawArtifact): TypedStageCloseoutPacket {
  const normalizationFindings = ['typed_closeout_not_required_raw_artifact_advanced'];
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: attempt.stage_attempt_id,
    closeout_refs: [artifact.output_ref],
    closeout_ref_metadata: [{
      ref: artifact.output_ref,
      ref_kind: 'raw_executor_output',
      sha256: artifact.sha256,
      size_bytes: artifact.size_bytes,
    }],
    consumed_refs: ['packet:raw-artifact-test'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: attempt.domain_id,
    domain_ready_verdict: 'completed_with_quality_debt',
    route_impact: {
      transition_outcome: 'completed_with_quality_debt',
      consumable_artifact_refs: [artifact.output_ref],
      artifact_metadata_refs: [artifact.metadata_ref],
      quality_debt_refs: normalizationFindings.map(
        (finding) => `opl://stage-attempts/${encodeURIComponent(attempt.stage_attempt_id)}/quality-debt/${encodeURIComponent(finding)}`,
      ),
      normalization_findings: normalizationFindings,
      next_stage_may_start: true,
      route_back_selection_owner: 'codex_cli',
      route_back_may_target_any_declared_stage: true,
      negative_or_partial_output_counts_as_progress: true,
      framework_generated_envelope: true,
    },
    authority_boundary: {
      opl: 'raw_executor_output_progress_envelope_only',
      domain: 'truth_quality_route_back_and_artifact_authority_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function verifyRaw(input: {
  packet: TypedStageCloseoutPacket;
  attempt: RawAttempt;
  workspaceRoot: string;
}) {
  return verifyStageQualityCloseoutArtifactIdentity({
    closeoutPacket: input.packet,
    attempt: input.attempt,
    workspaceRoot: input.workspaceRoot,
  });
}

function withStateRoot<T>(prefix: string, invoke: (root: string, stateRoot: string) => T) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stateRoot = path.join(root, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    return invoke(root, stateRoot);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function withStateRootAsync<T>(
  prefix: string,
  invoke: (root: string, stateRoot: string) => Promise<T>,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stateRoot = path.join(root, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    return await invoke(root, stateRoot);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runWithReceiptDirectoryCreateInterlock<T>(input: {
  mutate: () => void;
  invoke: () => T;
}) {
  const original = fs.mkdirSync;
  let triggered = false;
  Object.defineProperty(fs, 'mkdirSync', {
    configurable: true,
    writable: true,
    value: (...args: unknown[]) => {
      const result = Reflect.apply(original, fs, args);
      if (!triggered && String(args[0]).includes(`${path.sep}stage-artifact-identities${path.sep}`)) {
        triggered = true;
        input.mutate();
      }
      return result;
    },
  });
  try {
    return input.invoke();
  } finally {
    Object.defineProperty(fs, 'mkdirSync', {
      configurable: true,
      writable: true,
      value: original,
    });
    assert.equal(triggered, true, 'transport receipt directory creation interlock was not reached');
  }
}

function transportIdentityReceiptFiles(stateRoot: string) {
  const receiptRoot = path.join(stateRoot, 'runtime-state', 'stage-artifact-identities');
  return fs.existsSync(receiptRoot)
    ? fs.readdirSync(receiptRoot, { recursive: true }).filter((entry) => String(entry).endsWith('.json'))
    : [];
}

test('raw executor output authority requires exact provenance and canonical non-semantic fields', () => {
  withStateRoot('opl-quality-raw-output-authority-', (root) => {
    const attempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-authority',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const artifact = persistRawStageOutput({
      attempt,
      content: 'framework-owned raw output with no domain semantics',
    });
    assert.ok(artifact);
    const packet = rawCloseout(attempt, artifact);
    const rawEntry = packet.closeout_ref_metadata![0];
    const provenanceViolations: TypedStageCloseoutPacket[] = [
      { ...packet, route_impact: { ...packet.route_impact, artifact_metadata_refs: [] } },
      { ...packet, closeout_refs: [artifact.output_ref, artifact.output_ref] },
      {
        ...packet,
        closeout_ref_metadata: [{
          ref: rawEntry.ref,
          ref_kind: rawEntry.ref_kind,
          sha256: rawEntry.sha256,
        }],
      },
      {
        ...packet,
        closeout_refs: [artifact.output_ref, 'artifact://domain/extra'],
        closeout_ref_metadata: [rawEntry, {
          ref: 'artifact://domain/extra',
          sha256: sha256('extra artifact'),
        }],
      },
    ];
    for (const candidate of provenanceViolations) {
      assert.throws(
        () => verifyRaw({ packet: candidate, attempt, workspaceRoot: root }),
        (error) => error instanceof FrameworkContractError
          && error.details?.blocked_reason
            === 'raw_executor_output_provenance_mismatch_authority_violation',
      );
    }

    const semanticViolations: TypedStageCloseoutPacket[] = [
      {
        ...packet,
        route_impact: {
          ...packet.route_impact,
          stage_quality_cycle: {
            artifact_refs: [artifact.output_ref],
            artifact_hashes: [artifact.sha256],
          },
        },
      },
      {
        ...packet,
        domain_output: {
          surface_kind: 'domain_owned_stage_output_ref',
          version: 'domain-owned-stage-output-ref.v1',
          domain_id: attempt.domain_id,
          output_ref: artifact.output_ref,
        },
      },
      { ...packet, writeback_receipt_refs: ['receipt:forged-owner-writeback'] },
      { ...packet, consumed_memory_refs: ['memory:forged-semantic-input'] },
      { ...packet, rejected_writes: [{ reason: 'forged-domain-write-rejection' }] },
      { ...packet, next_owner: 'forged-owner' },
      { ...packet, domain_ready_verdict: 'ready' },
      { ...packet, route_impact: { ...packet.route_impact, transition_outcome: 'completed' } },
      { ...packet, route_impact: { ...packet.route_impact, route_back_selection_owner: 'forged-owner' } },
      {
        ...packet,
        authority_boundary: { ...packet.authority_boundary, can_write_domain_truth: true },
      },
      {
        ...packet,
        authority_boundary: { ...packet.authority_boundary, can_create_owner_receipt: true },
      },
      {
        ...packet,
        authority_boundary: { ...packet.authority_boundary, can_authorize_quality_verdict: true },
      },
    ];
    for (const candidate of semanticViolations) {
      assert.throws(
        () => verifyRaw({ packet: candidate, attempt, workspaceRoot: root }),
        (error) => error instanceof FrameworkContractError
          && error.details?.blocked_reason
            === 'raw_executor_output_semantic_authority_violation',
      );
    }
  });
});

test('raw executor output rejects symlinked ancestry and sibling Attempt substitution', () => {
  withStateRoot('opl-quality-raw-symlink-lineage-', (root) => {
    const firstAttempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-lineage-first',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const siblingAttempt = { ...firstAttempt, stage_attempt_id: 'sat-raw-lineage-sibling' };
    const content = 'identical bytes cannot substitute sibling Attempt lineage';
    const firstArtifact = persistRawStageOutput({ attempt: firstAttempt, content });
    const siblingArtifact = persistRawStageOutput({ attempt: siblingAttempt, content });
    assert.ok(firstArtifact);
    assert.ok(siblingArtifact);
    const firstAttemptRoot = path.dirname(fileURLToPath(firstArtifact.output_ref));
    const siblingAttemptRoot = path.dirname(fileURLToPath(siblingArtifact.output_ref));
    fs.rmSync(firstAttemptRoot, { recursive: true });
    fs.symlinkSync(siblingAttemptRoot, firstAttemptRoot, 'dir');

    assert.throws(
      () => verifyRaw({
        packet: rawCloseout(firstAttempt, firstArtifact),
        attempt: firstAttempt,
        workspaceRoot: root,
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason
          === 'raw_executor_output_state_lineage_authority_violation',
    );
  });
});

test('raw executor output rejects a symlinked stage-attempt artifact parent', () => {
  withStateRoot('opl-quality-raw-parent-symlink-', (root) => {
    const attempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-parent-symlink',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const artifact = persistRawStageOutput({
      attempt,
      content: 'raw output behind a rebound parent directory',
    });
    assert.ok(artifact);
    const attemptRoot = path.dirname(fileURLToPath(artifact.output_ref));
    const artifactParent = path.dirname(attemptRoot);
    const displacedArtifactParent = `${artifactParent}.displaced`;
    fs.renameSync(artifactParent, displacedArtifactParent);
    fs.symlinkSync(displacedArtifactParent, artifactParent, 'dir');

    assert.throws(
      () => verifyRaw({ packet: rawCloseout(attempt, artifact), attempt, workspaceRoot: root }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason
          === 'raw_executor_output_state_lineage_authority_violation',
    );
  });
});

test('raw executor output rejects an Attempt root rebound during provenance verification', async () => {
  await withStateRootAsync('opl-quality-raw-attempt-drift-', async (root) => {
    const firstAttempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-drift-first',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const siblingAttempt = { ...firstAttempt, stage_attempt_id: 'sat-raw-drift-sibling' };
    const content = 'identical bytes cannot replace a bound Attempt during verification';
    const firstArtifact = persistRawStageOutput({ attempt: firstAttempt, content });
    const siblingArtifact = persistRawStageOutput({ attempt: siblingAttempt, content });
    assert.ok(firstArtifact);
    assert.ok(siblingArtifact);
    const firstAttemptRoot = path.dirname(fileURLToPath(firstArtifact.output_ref));
    const siblingAttemptRoot = path.dirname(fileURLToPath(siblingArtifact.output_ref));

    await assert.rejects(
      () => runWithWorkItemFileBoundaryInterlock({
        temporaryRoot: root,
        point: 'after_file_open',
        mutation: {
          kind: 'replace_root_with_symlink',
          root_path: firstAttemptRoot,
          displaced_path: `${firstAttemptRoot}.displaced`,
          target_path: siblingAttemptRoot,
        },
        invoke: () => verifyRaw({
          packet: rawCloseout(firstAttempt, firstArtifact),
          attempt: firstAttempt,
          workspaceRoot: root,
        }),
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason
          === 'raw_executor_output_state_lineage_authority_violation',
    );
  });
});

test('raw executor output rejects an exact-copy physical OPL state root rebound', () => {
  withStateRoot('opl-quality-raw-state-rebind-', (root, stateRoot) => {
    const replacementStateRoot = path.join(root, 'replacement-state');
    const attempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-state-rebind',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const artifact = persistRawStageOutput({
      attempt,
      content: 'identical raw bytes in a different physical state root',
    });
    assert.ok(artifact);
    fs.cpSync(stateRoot, replacementStateRoot, { recursive: true });
    fs.renameSync(stateRoot, `${stateRoot}.displaced`);
    fs.renameSync(replacementStateRoot, stateRoot);

    assert.throws(
      () => verifyRaw({ packet: rawCloseout(attempt, artifact), attempt, workspaceRoot: root }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason
          === 'raw_executor_output_provenance_mismatch_authority_violation',
    );
  });
});

test('raw receipt creation rejects a concurrent output rewrite before receipt publication', () => {
  withStateRoot('opl-quality-raw-receipt-byte-race-', (root, stateRoot) => {
    const attempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-receipt-byte-race',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const artifact = persistRawStageOutput({
      attempt,
      content: 'raw bytes verified before receipt persistence',
    });
    assert.ok(artifact);

    assert.throws(
      () => runWithReceiptDirectoryCreateInterlock({
        mutate: () => fs.writeFileSync(new URL(artifact.output_ref), 'changed during receipt creation\n'),
        invoke: () => verifyRaw({ packet: rawCloseout(attempt, artifact), attempt, workspaceRoot: root }),
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason
          === 'raw_executor_output_provenance_mismatch_authority_violation',
    );
    assert.deepEqual(transportIdentityReceiptFiles(stateRoot), []);
  });
});

test('raw receipt creation rejects a concurrent OPL state root rebound before receipt publication', () => {
  withStateRoot('opl-quality-raw-receipt-root-race-', (root, stateRoot) => {
    const replacementStateRoot = path.join(root, 'replacement-state');
    const displacedStateRoot = path.join(root, 'displaced-state');
    const attempt: RawAttempt = {
      stage_attempt_id: 'sat-raw-receipt-root-race',
      domain_id: 'medautoscience',
      stage_id: 'manuscript_authoring',
      attempt_role: 'producer',
    };
    const artifact = persistRawStageOutput({
      attempt,
      content: 'raw bytes verified in the original physical state root',
    });
    assert.ok(artifact);

    assert.throws(
      () => runWithReceiptDirectoryCreateInterlock({
        mutate: () => {
          fs.cpSync(stateRoot, replacementStateRoot, { recursive: true });
          fs.renameSync(stateRoot, displacedStateRoot);
          fs.renameSync(replacementStateRoot, stateRoot);
        },
        invoke: () => verifyRaw({ packet: rawCloseout(attempt, artifact), attempt, workspaceRoot: root }),
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.blocked_reason
          === 'raw_executor_output_state_lineage_authority_violation',
    );
    assert.deepEqual(transportIdentityReceiptFiles(stateRoot), []);
  });
});

test('raw recovery uses volume continuity without rewriting prior metadata or accepting changed bytes', { skip: process.platform !== 'darwin' }, () => {
  withStateRoot('opl-raw-boot-continuity-', (root) => {
    const attempt = { stage_attempt_id: 'sat-boot-continuity', domain_id: 'example', stage_id: 'review', attempt_role: 'reviewer' };
    const raw = persistRawStageOutput({ attempt, content: 'original review bytes' })!;
    const metadataPath = fileURLToPath(raw.metadata_ref);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.physical_lineage.version, 'opl-work-item-root-identity.v2');
    const original = structuredClone(metadata.physical_lineage);
    metadata.physical_lineage.boot_uuid = '11111111-1111-4111-8111-111111111111';
    metadata.physical_lineage.workspace_device = String(BigInt(original.workspace_device) + 1n);
    metadata.physical_lineage.work_item_device = String(BigInt(original.work_item_device) + 1n);
    const persisted = JSON.stringify(metadata);
    fs.writeFileSync(metadataPath, persisted);
    const recovered = recoverFrameworkRawArtifactForAttempt(attempt)!;
    assert.equal(recovered.sha256, raw.sha256);
    assert.deepEqual(recovered.root_identity_continuation?.expected, metadata.physical_lineage);
    assert.deepEqual(recovered.root_identity_continuation?.observed, original);
    assert.equal(fs.readFileSync(metadataPath, 'utf8'), persisted);
    assert.equal(fs.readFileSync(new URL(raw.output_ref), 'utf8'), 'original review bytes\n');
    assert.ok(verifyRaw({ packet: rawCloseout(attempt, raw), attempt, workspaceRoot: root }));
    metadata.physical_lineage.work_item_volume_uuid = '22222222-2222-4222-8222-222222222222';
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
    assert.throws(() => recoverFrameworkRawArtifactForAttempt(attempt), /bound Attempt identity/);
    fs.writeFileSync(metadataPath, persisted);
    fs.writeFileSync(new URL(raw.output_ref), 'changed review bytes');
    assert.throws(() => recoverFrameworkRawArtifactForAttempt(attempt), /bytes do not match/);
  });
});
