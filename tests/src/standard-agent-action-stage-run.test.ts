import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { evaluateStandardAgentActionStageRun } from '../../src/modules/stagecraft/standard-agent-action-stage-run.ts';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filePath: string) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stageRunFixture() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-consumer-'));
  const workspaceRoot = path.join(repoDir, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  writeJson(path.join(repoDir, 'contracts', 'action_catalog.json'), {
    target_domain_id: 'sample',
    actions: [{
      action_id: 'build',
      stage_route: {
        entry_stage_ref: 'intake',
        required_stage_refs: ['intake', 'build', 'review'],
        optional_stage_refs: [],
        terminal_stage_refs: ['review'],
        route_policy: 'ai_selected_progress_route',
      },
    }],
  });
  writeJson(path.join(repoDir, 'agent', 'stages', 'manifest.json'), {
    stages: [
      { stage_id: 'intake', next_stage_refs: ['build'] },
      { stage_id: 'build', next_stage_refs: ['review'] },
      { stage_id: 'review', next_stage_refs: [] },
    ],
  });

  const readback = (
    stageId: string,
    consumedRefs: string[],
    routeImpact: Record<string, unknown> = {},
  ) => {
    const attemptId = `${stageId}-attempt`;
    const closeoutId = `${stageId}-closeout`;
    const payloadPath = path.join(workspaceRoot, `${stageId}.json`);
    writeJson(payloadPath, {
      surface_kind: 'stage_attempt_closeout_packet',
      stage_id: stageId,
      closeout_id: closeoutId,
      consumed_refs: consumedRefs,
    });
    const outputRef = pathToFileURL(payloadPath).href;
    const value = {
      family_runtime_stage_attempt_query: {
        attempt_ref: `opl://stage_attempts/${attemptId}`,
        stage_attempt_query: {
          attempt: {
            stage_id: stageId,
            stage_attempt_id: attemptId,
            domain_id: 'sample',
            status: 'completed',
            closeout_receipt_status: 'accepted_typed_closeout',
            workspace_locator: { workspace_root: workspaceRoot },
          },
          canonical_outcome: 'completed_with_receipt',
          conflict_or_blocker_envelopes: [],
          closeouts: [{
            closeout_id: closeoutId,
            stage_attempt_id: attemptId,
            packet: {
              surface_kind: 'stage_attempt_closeout_packet',
              stage_id: stageId,
              stage_attempt_id: attemptId,
              closeout_id: closeoutId,
              closeout_refs: [outputRef],
              consumed_refs: consumedRefs,
              route_impact: routeImpact,
              domain_output: {
                surface_kind: 'domain_owned_stage_output_ref',
                version: 'domain-owned-stage-output-ref.v1',
                domain_id: 'sample',
                output_ref: outputRef,
              },
              closeout_ref_metadata: [{ ref: outputRef, kind: 'sample_payload', sha256: sha256(payloadPath) }],
            },
          }],
        },
      },
    };
    const readbackPath = path.join(repoDir, `${stageId}-readback.json`);
    writeJson(readbackPath, value);
    return {
      path: readbackPath,
      closeoutRef: `opl://stage_attempts/${attemptId}/closeouts/${closeoutId}`,
    };
  };

  const rawReadback = (stageId: string) => {
    const attemptId = `${stageId}-raw-attempt`;
    const rawPath = path.join(
      workspaceRoot,
      'stage-attempt-artifacts',
      attemptId,
      'raw-executor-output.txt',
    );
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, 'partial but consumable stage result\n');
    const readbackPath = path.join(repoDir, `${stageId}-raw-readback.json`);
    writeJson(readbackPath, {
      family_runtime_stage_attempt_query: {
        attempt_ref: `opl://stage_attempts/${attemptId}`,
        stage_attempt_query: {
          attempt: {
            stage_id: stageId,
            stage_attempt_id: attemptId,
            domain_id: 'sample',
            status: 'failed',
            closeout_receipt_status: null,
            workspace_locator: { workspace_root: workspaceRoot },
            provider_run: {
              process_output_summary: {
                raw_stage_artifact: {
                  output_ref: pathToFileURL(rawPath).href,
                },
              },
            },
          },
          canonical_outcome: 'blocked',
          conflict_or_blocker_envelopes: [{ reason: 'zero_readable_artifact' }],
          closeouts: [],
        },
      },
    });
    return readbackPath;
  };

  return { repoDir, readback, rawReadback };
}

test('standard Agent StageRun consumer returns canonical route progress and domain output', (t) => {
  const fixture = stageRunFixture();
  t.after(() => fs.rmSync(fixture.repoDir, { recursive: true, force: true }));
  const intake = fixture.readback('intake', []);
  const build = fixture.readback('build', [intake.closeoutRef]);
  const review = fixture.readback('review', [build.closeoutRef]);

  const progress = evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [intake.path, build.path, review.path],
  });

  assert.equal(progress.complete, true);
  assert.equal(progress.next_stage_ref, null);
  assert.deepEqual(progress.completed_stage_refs, ['intake', 'build', 'review']);
  assert.equal(progress.stage_closeouts[2]?.domain_output_packet.stage_id, 'review');
});
test('standard Agent StageRun accepts skips, repeats, reverse routes, and AI-selected route-back', (t) => {
  const fixture = stageRunFixture();
  t.after(() => fs.rmSync(fixture.repoDir, { recursive: true, force: true }));
  const intake = fixture.readback('intake', []);
  const build = fixture.readback('build', [intake.closeoutRef]);
  const review = fixture.readback('review', [intake.closeoutRef], {
    route_back_stage_ref: 'intake',
  });

  const skipped = evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [build.path],
  });
  assert.deepEqual(skipped.completed_stage_refs, ['build']);
  assert.equal(skipped.next_stage_ref, 'review');

  const reversed = evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [intake.path, review.path, build.path],
  });
  assert.deepEqual(reversed.completed_stage_refs, ['intake', 'review', 'build']);

  const routeBack = evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [intake.path, review.path],
  });
  assert.equal(routeBack.next_stage_ref, 'intake');
  assert.equal(routeBack.complete, false);

  const repeated = evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [build.path, build.path],
  });
  assert.deepEqual(repeated.completed_stage_refs, ['build', 'build']);
});

test('standard Agent StageRun advances readable raw output without typed closeout', (t) => {
  const fixture = stageRunFixture();
  t.after(() => fs.rmSync(fixture.repoDir, { recursive: true, force: true }));
  const progress = evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [fixture.rawReadback('build')],
  });

  assert.deepEqual(progress.completed_stage_refs, ['build']);
  assert.equal(progress.next_stage_ref, 'review');
  assert.equal(progress.stage_closeouts[0]?.domain_output_packet.completed_with_quality_debt, true);
  assert.equal(
    (progress.stage_closeouts[0]?.canonical_closeout_packet.route_impact as Record<string, unknown>)?.next_stage_may_start,
    true,
  );
});

test('standard Agent StageRun consumer rejects canonical manifest refs that escape the domain repo', (t) => {
  const fixture = stageRunFixture();
  t.after(() => fs.rmSync(fixture.repoDir, { recursive: true, force: true }));
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-external-'));
  t.after(() => fs.rmSync(externalRoot, { recursive: true, force: true }));
  const externalCatalog = path.join(externalRoot, 'action_catalog.json');
  fs.copyFileSync(path.join(fixture.repoDir, 'contracts', 'action_catalog.json'), externalCatalog);
  fs.rmSync(path.join(fixture.repoDir, 'contracts', 'action_catalog.json'));
  fs.symlinkSync(externalCatalog, path.join(fixture.repoDir, 'contracts', 'action_catalog.json'));

  assert.throws(() => evaluateStandardAgentActionStageRun({
    repoDir: fixture.repoDir,
    actionId: 'build',
    stageRunReadbackPaths: [],
  }), /family_action_catalog_ref escapes its domain repo/);
});
