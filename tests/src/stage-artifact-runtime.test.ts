import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commitStageArtifactAttemptRuntime,
  conformanceStageArtifactRuntime,
  explainStageArtifactRuntime,
  gcStageArtifactRuntime,
  openStageArtifactAttemptRuntime,
  promoteStageArtifactRuntime,
  rebuildStageArtifactRuntime,
  restoreStageArtifactRuntime,
  stageArtifactAttemptPaths,
  statusStageArtifactRuntime,
  validateStageArtifactRuntime,
  workbenchStageArtifactRuntime,
} from '../../src/modules/stagecraft/stage-artifact-runtime.ts';
import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import { runCli } from './cli/helpers-parts/runner.ts';

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
    assert.equal(status.authority_boundary.opl_can_write_rca_visual_truth, false);
    assert.equal(status.authority_boundary.opl_can_write_rca_review_export_verdict, false);
    assert.equal(status.authority_boundary.opl_can_write_domain_artifact_body, false);
    assert.equal(status.authority_boundary.can_publish_current_owner_delta, false);
    assert.equal(status.authority_boundary.can_close_owner_answer, false);
    assert.equal(status.authority_boundary.can_close_human_gate, false);
    assert.equal(status.authority_boundary.can_close_typed_blocker, false);
    assert.equal(status.authority_boundary.can_declare_domain_ready, false);
    assert.deepEqual(status.authority_boundary.output_authority, [
      'artifact_projection',
      'progress_projection',
      'evidence_projection',
    ]);
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
    assert.equal(fs.existsSync(opened.attempt_workspace.manifest_file), true);
    assert.equal(fs.existsSync(opened.attempt_workspace.outputs_dir), true);
    assert.equal(fs.existsSync(opened.attempt_workspace.receipts_dir), true);

    const openStatus = statusStageArtifactRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
    });
    assert.equal(openStatus.stages[0].status, 'in_progress');

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
    assert.equal(committed.manifest.output_hashes[0].path, 'deck.png');
    assert.match(committed.manifest.output_hashes[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(committed.opl_created_owner_receipt, false);
    assert.ok('event_kind' in committed.lineage_event);
    assert.equal(committed.lineage_event.event_kind, 'attempt_committed');
    assert.equal(fs.readFileSync(committed.latest_pointer, 'utf-8'), 'attempt-commit\n');
    assert.equal(committed.status.summary.success_stage_count, 1);
    assert.ok(committed.current_pointer.current.current_stage);
    assert.equal(committed.current_pointer.current.current_stage.status, 'success');
    assert.equal(
      committed.current_pointer.current.projection_role,
      'stage_artifact_current_projection_only',
    );
    assert.equal(
      committed.current_pointer.current.current_pointer_role,
      'artifact_attempt_pointer_not_stage_run_current_pointer',
    );
    assert.equal(
      committed.current_pointer.current.stage_run_current_is_passive_projection_of_codex_route_context,
      true,
    );
    assert.equal(committed.current_pointer.current.framework_can_accept_reject_or_override_codex_route, false);
    assert.equal(committed.authority_boundary.can_write_stage_current_pointer, false);
    assert.equal(committed.authority_boundary.can_write_stage_run_terminal_state, false);
    assert.equal(committed.authority_boundary.can_publish_current_owner_delta, false);
    assert.equal(committed.authority_boundary.can_close_owner_answer, false);
    assert.equal(committed.authority_boundary.can_close_human_gate, false);
    assert.equal(committed.authority_boundary.can_close_typed_blocker, false);
    assert.equal(committed.authority_boundary.can_declare_domain_ready, false);
    assert.deepEqual(committed.current_pointer.current.authority_boundary.output_authority, [
      'artifact_projection',
      'progress_projection',
      'evidence_projection',
    ]);
  });
});

test('stage artifact CLI status reads the physical OPL_STATE_DIR stage folder', () => {
  withTempState((root) => {
    const payload = runCli(
      [
        'stage-artifact',
        'status',
        '--domain',
        'redcube_ai',
        '--program',
        'p1',
        '--topic',
        't1',
        '--deliverable',
        'd1',
      ],
      { OPL_STATE_DIR: root },
    );

    assert.equal(
      (payload.stage_artifact_runtime as { surface_kind: string }).surface_kind,
      'opl_stage_artifact_runtime_status',
    );
    assert.equal(
      (payload.stage_artifact_runtime as { deliverable_root: string }).deliverable_root,
      path.join(root, 'runtime-state', 'domains', 'redcube_ai', 'deliverables', 'p1', 't1', 'd1'),
    );
  });
});

test('stage artifact commit downgrades unbacked success claim to nonblocking quality debt', () => {
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

    const committed = commitStageArtifactAttemptRuntime({
      ...locator,
      terminal_status: 'success',
      required_outputs: ['deck.png'],
      owner_receipt_refs: ['rca-owner-receipt:visual-stage:deck-a'],
    });
    assert.equal(committed.manifest.terminal_status, 'completed_with_quality_debt');
    assert.equal(committed.status.stages[0].status, 'completed_with_quality_debt');
    assert.equal(committed.manifest.quality_debt_refs.length, 1);
  });
});

test('stage artifact quality debt completion advances a consumable artifact without owner acceptance', () => {
  withTempState(() => {
    const locator = {
      domain_id: 'med-autogrant',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'grant-a',
      stage_id: 'proposal_authoring',
      stage_order: 4,
      attempt_id: 'attempt-quality-debt',
    };
    const opened = openStageArtifactAttemptRuntime(locator);
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'proposal.md'), '# usable draft\n');
    writeJson(path.join(opened.attempt_workspace.evidence_dir, 'quality-debt.json'), {
      quality_debt_refs: ['quality-debt:grant-a:proposal-authoring'],
      debt_codes: ['review_budget_exhausted'],
      blocks_stage_transition: false,
      blocks_quality_or_ready_claims: true,
    });

    const committed = commitStageArtifactAttemptRuntime({
      ...locator,
      terminal_status: 'completed_with_quality_debt',
      required_outputs: ['proposal.md'],
      quality_debt_refs: ['quality-debt:grant-a:proposal-authoring'],
    });

    assert.equal(committed.manifest.terminal_status, 'completed_with_quality_debt');
    assert.equal(committed.status.stages[0].status, 'completed_with_quality_debt');
    assert.equal(committed.status.summary.completed_with_quality_debt_stage_count, 1);
    assert.deepEqual(committed.status.stages[0].next_required_owner_delta, [
      'quality_debt_repair_or_owner_acceptance_without_stage_transition_block',
    ]);
    assert.equal(committed.current_pointer.current.current_stage?.status, 'completed_with_quality_debt');
    assert.equal(committed.opl_created_owner_receipt, false);
  });
});

test('stage artifact status treats files without a manifest as consumable quality-debt progress', () => {
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
    assert.equal(status.summary.orphan_artifact_count, 0);
    assert.equal(status.stages[0].status, 'completed_with_quality_debt');
    assert.deepEqual(status.stages[0].orphan_outputs, []);
    assert.ok(status.stages[0].broken_reasons.includes('manifest_missing_or_invalid_quality_debt'));
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
    assert.equal(fs.existsSync(rebuilt.lineage_graph.graph_file), true);
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
    assert.deepEqual(dryRun.archived_attempt_ids, []);
    assert.deepEqual(dryRun.candidate_attempt_ids, ['attempt-old']);
    assert.equal(fs.existsSync(old.attempt_dir), true);
  });
});

test('stage artifact conformance records post-commit content hash drift without blocking progress', () => {
  withTempState(() => {
    const locator = {
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'artifact_creation',
      stage_order: 4,
      attempt_id: 'attempt-hash',
    };
    const opened = openStageArtifactAttemptRuntime(locator);
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'deck.png'), 'png-v1');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'owner-receipt.json'), {
      receipt_ref: 'rca-owner-receipt:deck-a',
    });
    commitStageArtifactAttemptRuntime({
      ...locator,
      terminal_status: 'success',
      required_outputs: ['deck.png'],
      owner_receipt_refs: ['rca-owner-receipt:deck-a'],
    });

    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'deck.png'), 'png-v2');
    const status = statusStageArtifactRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
    });
    assert.equal(status.stages[0].status, 'completed_with_quality_debt');
    assert.deepEqual(status.stages[0].attempts[0].hash_mismatches, [
      'output:deck.png:hash_or_size_mismatch',
    ]);

    const conformance = conformanceStageArtifactRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
    });
    assert.equal(conformance.passed, false);
    assert.equal(
      conformance.violations.some((violation) => violation.code === 'manifest_content_hash_mismatch'),
      true,
    );
  });
});

test('stage artifact workbench projects current, canonical, lineage, retention, and authority refs', () => {
  withTempState(() => {
    const locator = {
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'package_and_handoff',
      stage_order: 6,
      attempt_id: 'attempt-workbench',
    };
    const opened = openStageArtifactAttemptRuntime(locator);
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'bundle.zip'), 'zip');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'owner-receipt.json'), {
      receipt_ref: 'rca-owner-receipt:handoff',
    });
    commitStageArtifactAttemptRuntime({
      ...locator,
      terminal_status: 'success',
      required_outputs: ['bundle.zip'],
      owner_receipt_refs: ['rca-owner-receipt:handoff'],
    });
    promoteStageArtifactRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
      stage_id: locator.stage_id,
      attempt_id: locator.attempt_id,
      artifact_ref: 'workspace-runtime-ref:bundle.zip',
    });
    rebuildStageArtifactRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
    });

    const workbench = workbenchStageArtifactRuntime({
      domain_id: locator.domain_id,
      program_id: locator.program_id,
      topic_id: locator.topic_id,
      deliverable_id: locator.deliverable_id,
    });
    assert.equal(workbench.surface_kind, 'opl_stage_artifact_runtime_workbench');
    assert.equal(workbench.conformance.passed, true);
    assert.equal(workbench.stages[0].attempts[0].output_hashes[0].path, 'bundle.zip');
    assert.equal(workbench.canonical_artifacts.length, 1);
    assert.equal(workbench.lineage.event_count >= 3, true);
    assert.equal(workbench.retention_policy.restore_requires_restore_proof_ref, true);
    assert.equal(workbench.authority_boundary.opl_can_write_domain_truth, false);
  });
});

test('stage artifact gc archives attempts and restore requires restore proof ref', () => {
  withTempState(() => {
    const base = {
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'review_and_revision',
      stage_order: 5,
    };
    const latest = openStageArtifactAttemptRuntime({ ...base, attempt_id: 'attempt-latest' });
    const old = openStageArtifactAttemptRuntime({ ...base, attempt_id: 'attempt-old' });
    for (const [attemptId, opened] of [
      ['attempt-latest', latest],
      ['attempt-old', old],
    ] as const) {
      fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'review.json'), attemptId);
      writeJson(path.join(opened.attempt_workspace.receipts_dir, 'owner-receipt.json'), {
        receipt_ref: `receipt:${attemptId}`,
      });
      commitStageArtifactAttemptRuntime({
        ...base,
        attempt_id: attemptId,
        terminal_status: 'success',
        required_outputs: ['review.json'],
        owner_receipt_refs: [`receipt:${attemptId}`],
      });
    }
    fs.writeFileSync(latest.attempt_workspace.stage_dir ? path.join(latest.attempt_workspace.stage_dir, 'latest') : '', 'attempt-latest\n');

    const gc = gcStageArtifactRuntime({
      domain_id: base.domain_id,
      program_id: base.program_id,
      topic_id: base.topic_id,
      deliverable_id: base.deliverable_id,
      dry_run: false,
    });
    assert.deepEqual(gc.archived_attempt_ids, ['attempt-old']);
    assert.equal(gc.deleted_attempt_ids.length, 0);
    assert.equal(fs.existsSync(old.attempt_workspace.attempt_dir), false);

    const restored = restoreStageArtifactRuntime({
      domain_id: base.domain_id,
      program_id: base.program_id,
      topic_id: base.topic_id,
      deliverable_id: base.deliverable_id,
      stage_id: base.stage_id,
      attempt_id: 'attempt-old',
      restore_ref: gc.restore_refs[0].restore_ref,
    });
    assert.equal(restored.surface_kind, 'opl_stage_artifact_runtime_restore');
    assert.equal(fs.existsSync(old.attempt_workspace.attempt_dir), true);
    assert.equal(restored.opl_created_owner_receipt, false);
  });
});

test('stage artifact CLI exposes conformance and workbench projections', () => {
  withTempState((root) => {
    const openPayload = runCli(
      [
        'stage',
        'open',
        '--domain',
        'redcube_ai',
        '--program',
        'p1',
        '--topic',
        't1',
        '--deliverable',
        'd1',
        '--stage',
        'artifact_creation',
        '--stage-order',
        '4',
        '--attempt',
        'attempt-cli',
      ],
      { OPL_STATE_DIR: root },
    );
    const workspace = (openPayload.stage_artifact_runtime as {
      attempt_workspace: { outputs_dir: string; receipts_dir: string };
    }).attempt_workspace;
    fs.writeFileSync(path.join(workspace.outputs_dir, 'deck.png'), 'png');
    writeJson(path.join(workspace.receipts_dir, 'owner.json'), {
      receipt_ref: 'receipt:cli',
    });
    runCli(
      [
        'stage',
        'commit',
        '--domain',
        'redcube_ai',
        '--program',
        'p1',
        '--topic',
        't1',
        '--deliverable',
        'd1',
        '--stage',
        'artifact_creation',
        '--attempt',
        'attempt-cli',
        '--terminal-status',
        'success',
        '--required-output',
        'deck.png',
        '--owner-receipt-ref',
        'receipt:cli',
      ],
      { OPL_STATE_DIR: root },
    );

    const conformance = runCli(
      ['stage-artifact', 'conformance', '--domain', 'redcube_ai', '--program', 'p1', '--topic', 't1', '--deliverable', 'd1'],
      { OPL_STATE_DIR: root },
    );
    assert.equal(
      (conformance.stage_artifact_runtime as { passed: boolean }).passed,
      true,
    );
    const validate = runCli(
      ['stage', 'validate', '--domain', 'redcube_ai', '--program', 'p1', '--topic', 't1', '--deliverable', 'd1'],
      { OPL_STATE_DIR: root },
    );
    assert.equal(
      (validate.stage_artifact_runtime as { surface_kind: string }).surface_kind,
      'opl_stage_artifact_runtime_validation',
    );
    assert.equal(
      (validate.stage_artifact_runtime as { passed: boolean }).passed,
      true,
    );
    assert.deepEqual(
      (validate.stage_artifact_runtime as { validates: string[] }).validates,
      ['Stage Folder', 'Manifest', 'Receipt', 'content_hashes', 'latest_pointer', 'current_pointer', 'lineage_events'],
    );
    const directValidation = validateStageArtifactRuntime({
      domain_id: 'redcube_ai',
      program_id: 'p1',
      topic_id: 't1',
      deliverable_id: 'd1',
    });
    assert.equal(directValidation.conformance.surface_kind, 'opl_stage_artifact_runtime_conformance');
    assert.equal(directValidation.authority_boundary.opl_can_issue_owner_receipt, false);
    const workbench = runCli(
      ['stage-artifact', 'workbench', '--domain', 'redcube_ai', '--program', 'p1', '--topic', 't1', '--deliverable', 'd1'],
      { OPL_STATE_DIR: root },
    );
    assert.equal(
      (workbench.stage_artifact_runtime as { surface_kind: string }).surface_kind,
      'opl_stage_artifact_runtime_workbench',
    );
  });
});

test('stage artifact promote refuses attempts that physical status does not derive as success', () => {
  withTempState(() => {
    const paths = stageArtifactAttemptPaths({
      domain_id: 'redcube_ai',
      program_id: 'program-a',
      topic_id: 'topic-a',
      deliverable_id: 'deck-a',
      stage_id: 'package_and_handoff',
      stage_order: 6,
      attempt_id: 'attempt-missing-receipt',
    });
    fs.mkdirSync(paths.outputs_dir, { recursive: true });
    fs.writeFileSync(path.join(paths.outputs_dir, 'bundle.zip'), 'zip');
    writeJson(paths.attempt_file, { attempt_id: 'attempt-missing-receipt', stage_id: 'package_and_handoff' });
    writeJson(paths.manifest_file, {
      stage_id: 'package_and_handoff',
      attempt_id: 'attempt-missing-receipt',
      required_outputs: ['bundle.zip'],
      owner_receipt_refs: ['receipt:missing'],
    });

    assert.throws(
      () => promoteStageArtifactRuntime({
        domain_id: 'redcube_ai',
        program_id: 'program-a',
        topic_id: 'topic-a',
        deliverable_id: 'deck-a',
        stage_id: 'package_and_handoff',
        attempt_id: 'attempt-missing-receipt',
        artifact_ref: 'workspace-runtime-ref:bundle.zip',
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid'
        && error.details?.status === 'completed_with_quality_debt',
    );
  });
});
