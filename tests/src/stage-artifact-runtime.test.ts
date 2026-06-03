import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commitStageArtifactAttemptRuntime,
  explainStageArtifactRuntime,
  gcStageArtifactRuntime,
  openStageArtifactAttemptRuntime,
  promoteStageArtifactRuntime,
  rebuildStageArtifactRuntime,
  stageArtifactAttemptPaths,
  statusStageArtifactRuntime,
} from '../../src/stage-artifact-runtime.ts';
import { FrameworkContractError } from '../../src/contracts.ts';

function withTempState<T>(fn: (root: string) => T) {
  const previous = process.env.OPL_STATE_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-artifact-'));
  process.env.OPL_STATE_DIR = root;
  try {
    return fn(root);
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeJson(file: string, payload: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

test('stage artifact status derives success only from manifest, required outputs, and owner receipt', () => {
  withTempState(() => {
    const paths = stageArtifactAttemptPaths({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'artifact_creation',
      stage_order: 4,
      attempt_id: 'attempt-success',
    });
    fs.mkdirSync(paths.outputs_dir, { recursive: true });
    fs.mkdirSync(paths.receipts_dir, { recursive: true });
    fs.writeFileSync(path.join(paths.outputs_dir, 'deck.png'), 'png');
    writeJson(paths.attempt_file, { attempt_id: 'attempt-success', stage_id: 'artifact_creation' });
    writeJson(paths.manifest_file, {
      stage_id: 'artifact_creation',
      attempt_id: 'attempt-success',
      required_outputs: ['deck.png'],
      owner_receipt_refs: ['rca-owner-receipt:visual-stage:deck-a'],
    });
    writeJson(path.join(paths.receipts_dir, 'owner-receipt.json'), {
      receipt_ref: 'rca-owner-receipt:visual-stage:deck-a',
    });

    const status = statusStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
    });

    assert.equal(status.surface_kind, 'opl_stage_artifact_runtime_status');
    assert.equal(status.summary.success_stage_count, 1);
    assert.equal(status.stages[0].status, 'success');
    assert.equal(status.stages[0].latest_attempt_id, 'attempt-success');
    assert.equal(status.authority_boundary.opl_can_issue_owner_receipt, false);
    assert.equal(status.authority_boundary.opl_can_write_domain_artifact_body, false);
  });
});

test('stage artifact open and commit materialize latest and current from verified receipt-backed outputs', () => {
  withTempState(() => {
    const locator = {
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'artifact_creation',
      stage_order: 4,
      attempt_id: 'attempt-commit',
    };
    const opened = openStageArtifactAttemptRuntime(locator);
    assert.equal(opened.surface_kind, 'opl_stage_artifact_runtime_open');
    assert.equal(fs.existsSync(opened.attempt_workspace.outputs_dir), true);
    assert.equal(fs.existsSync(opened.attempt_workspace.receipts_dir), true);

    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'deck.png'), 'png');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'owner-receipt.json'), {
      receipt_ref: 'rca-owner-receipt:visual-stage:deck-a',
    });

    const committed = commitStageArtifactAttemptRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
      stage_id: locator.stage_id,
      attempt_id: locator.attempt_id,
      terminal_status: 'success',
      required_outputs: ['deck.png'],
      owner_receipt_refs: ['rca-owner-receipt:visual-stage:deck-a'],
    });

    assert.equal(committed.surface_kind, 'opl_stage_artifact_runtime_commit');
    assert.equal(committed.manifest.terminal_status, 'success');
    assert.equal(committed.opl_created_owner_receipt, false);
    assert.equal(fs.readFileSync(committed.latest_pointer, 'utf-8'), 'attempt-commit\n');
    assert.equal(committed.status.summary.success_stage_count, 1);
    assert.equal(committed.current_pointer.current.current_stage.status, 'success');
  });
});

test('stage artifact commit refuses success without matching owner receipt evidence', () => {
  withTempState(() => {
    const locator = {
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'artifact_creation',
      stage_order: 4,
      attempt_id: 'attempt-broken',
    };
    const opened = openStageArtifactAttemptRuntime(locator);
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'deck.png'), 'png');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'wrong-owner-receipt.json'), {
      receipt_ref: 'rca-owner-receipt:other',
    });

    assert.throws(
      () => commitStageArtifactAttemptRuntime({
        ...locator,
        terminal_status: 'success',
        required_outputs: ['deck.png'],
        owner_receipt_refs: ['rca-owner-receipt:visual-stage:deck-a'],
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid'
        && Array.isArray(error.details?.missing_owner_receipt_refs),
    );
  });
});

test('stage artifact status treats files without receipt-backed manifest as orphan evidence', () => {
  withTempState(() => {
    const paths = stageArtifactAttemptPaths({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'artifact_creation',
      stage_order: 4,
      attempt_id: 'attempt-orphan',
    });
    fs.mkdirSync(paths.outputs_dir, { recursive: true });
    fs.writeFileSync(path.join(paths.outputs_dir, 'deck.png'), 'png');

    const status = statusStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
    });

    assert.equal(status.summary.success_stage_count, 0);
    assert.equal(status.summary.orphan_artifact_count, 1);
    assert.equal(status.stages[0].status, 'orphan');
    assert.deepEqual(status.stages[0].orphan_outputs, ['deck.png']);
  });
});

test('stage artifact explain and rebuild use physical stage folders as source of truth', () => {
  withTempState(() => {
    const paths = stageArtifactAttemptPaths({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'review_and_revision',
      stage_order: 5,
      attempt_id: 'attempt-blocked',
    });
    fs.mkdirSync(paths.evidence_dir, { recursive: true });
    writeJson(paths.attempt_file, { attempt_id: 'attempt-blocked', stage_id: 'review_and_revision' });
    writeJson(paths.manifest_file, {
      stage_id: 'review_and_revision',
      attempt_id: 'attempt-blocked',
      required_outputs: ['review.json'],
      typed_blocker_refs: ['rca-typed-blocker:review:needs-repair'],
    });
    writeJson(path.join(paths.evidence_dir, 'blocker.json'), {
      typed_blocker_ref: 'rca-typed-blocker:review:needs-repair',
    });

    const explain = explainStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
    });
    assert.equal(explain.current_stage?.stage_id, 'review_and_revision');
    assert.equal(explain.current_stage?.status, 'blocked');
    assert.deepEqual(explain.current_stage?.next_required_owner_delta, [
      'domain_owner_typed_blocker_resolution',
    ]);

    const rebuilt = rebuildStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
    });
    assert.equal(rebuilt.surface_kind, 'opl_stage_artifact_runtime_rebuild');
    assert.equal(rebuilt.index.stage_count, 1);
    assert.equal(fs.existsSync(rebuilt.index_file), true);
  });
});

test('stage artifact promote and gc remain refs-only and preserve latest/canonical attempts', () => {
  withTempState(() => {
    const latest = stageArtifactAttemptPaths({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'package_and_handoff',
      stage_order: 6,
      attempt_id: 'attempt-latest',
    });
    const old = stageArtifactAttemptPaths({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'package_and_handoff',
      stage_order: 6,
      attempt_id: 'attempt-old',
    });
    for (const attempt of [latest, old]) {
      fs.mkdirSync(attempt.outputs_dir, { recursive: true });
      fs.mkdirSync(attempt.receipts_dir, { recursive: true });
      fs.writeFileSync(path.join(attempt.outputs_dir, 'bundle.zip'), 'zip');
      writeJson(attempt.attempt_file, { attempt_id: path.basename(attempt.attempt_dir) });
      writeJson(attempt.manifest_file, {
        stage_id: 'package_and_handoff',
        attempt_id: path.basename(attempt.attempt_dir),
        required_outputs: ['bundle.zip'],
        owner_receipt_refs: [`receipt:${path.basename(attempt.attempt_dir)}`],
      });
      writeJson(path.join(attempt.receipts_dir, 'receipt.json'), {
        receipt_ref: `receipt:${path.basename(attempt.attempt_dir)}`,
      });
    }
    fs.writeFileSync(latest.latest_pointer, 'attempt-latest\n');

    const promoted = promoteStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'package_and_handoff',
      attempt_id: 'attempt-latest',
      artifact_ref: 'workspace-runtime-ref:bundle.zip',
    });
    assert.equal(promoted.opl_created_owner_receipt, false);
    assert.equal(promoted.canonical_pointer.attempt_id, 'attempt-latest');

    const dryRun = gcStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      dry_run: true,
    });
    assert.deepEqual(dryRun.deleted_attempt_ids, []);
    assert.deepEqual(dryRun.candidate_attempt_ids, ['attempt-old']);
    assert.equal(fs.existsSync(old.attempt_dir), true);
  });
});
