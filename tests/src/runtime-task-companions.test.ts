import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArtifactFileDescriptor,
  buildArtifactInventory,
  buildCheckpointSummary,
  buildProgressProjection,
  buildRuntimeInventory,
  buildSessionContinuity,
  buildTaskLifecycle,
  buildTaskSurfaceDescriptor,
} from '../../src/runtime-task-companions.ts';

test('runtime task companion helpers normalize MAS, MAG, and RCA style payloads', () => {
  const runtimeInventory = buildRuntimeInventory({
    summary: 'Hermes-managed study runtime is ready.',
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: 'medautoscience',
    executor_owner: 'med_deepscientist',
    substrate: 'external_hermes_agent_target',
    availability: 'ready',
    health_status: 'healthy',
    status_surface: {
      ref_kind: 'repo_path',
      ref: 'studies/<study_id>/artifacts/runtime_watch/latest.json',
      label: 'runtime_watch_latest',
    },
    workspace_binding: {
      workspace_root: '/tmp/mas',
      profile_name: 'as-biologics',
    },
  });
  assert.equal(runtimeInventory.surface_kind, 'runtime_inventory');
  assert.equal(runtimeInventory.runtime_owner, 'upstream_hermes_agent');

  const checkpointSummary = buildCheckpointSummary({
    status: 'freeze_ready',
    summary: 'Grant checkpoint is ready for freeze.',
    checkpoint_id: 'checkpoint-123',
    lineage_ref: {
      ref_kind: 'json_pointer',
      ref: '/progress_projection/checkpoint_status',
    },
  });
  assert.equal(checkpointSummary.status, 'freeze_ready');
  assert.equal(checkpointSummary.checkpoint_id, 'checkpoint-123');

  const progressSurface = buildTaskSurfaceDescriptor({
    surface_kind: 'product_entry_session',
    summary: 'Inspect the current RedCube session.',
    command: 'redcube product session --entry-session-id <entry-session-id>',
    step_id: 'inspect_current_progress',
    locator_fields: ['entry_session_id'],
  });
  assert.equal(progressSurface.surface_kind, 'product_entry_session');
  assert.deepEqual(progressSurface.locator_fields, ['entry_session_id']);

  const taskLifecycle = buildTaskLifecycle({
    task_kind: 'visual_deliverable_loop',
    task_id: 'deliverable-1',
    status: 'resumable',
    summary: 'Current deliverable loop can continue from the same session.',
    session_id: 'entry-session-1',
    run_id: 'run-1',
    checkpoint_summary: checkpointSummary,
    progress_surface: progressSurface,
    resume_surface: {
      surface_kind: 'product_entry_session',
      summary: 'Resume the same deliverable loop.',
      command: 'redcube product session --entry-session-id <entry-session-id>',
      locator_fields: ['entry_session_id'],
    },
    human_gate_ids: ['redcube_operator_review_gate'],
  });
  assert.equal(taskLifecycle.surface_kind, 'task_lifecycle');
  assert.equal(taskLifecycle.resume_surface?.surface_kind, 'product_entry_session');
  assert.deepEqual(taskLifecycle.human_gate_ids, ['redcube_operator_review_gate']);

  const sessionContinuity = buildSessionContinuity({
    summary: 'Current RedCube deliverable loop stays resumable in the same entry session.',
    domain_agent_id: 'rca',
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: 'redcube_ai',
    executor_owner: 'codex_cli',
    status: 'resumable',
    session_id: 'entry-session-1',
    run_id: 'run-1',
    progress_surface: progressSurface,
    artifact_surface: {
      surface_kind: 'artifact_inventory',
      summary: 'Inspect current deliverable outputs.',
      command: 'redcube product session --entry-session-id <entry-session-id>',
    },
    restore_surface: {
      surface_kind: 'product_entry_session',
      summary: 'Resume the same deliverable loop.',
      command: 'redcube product session --entry-session-id <entry-session-id>',
      locator_fields: ['entry_session_id'],
    },
    checkpoint_summary: checkpointSummary,
    human_gate_ids: ['redcube_operator_review_gate'],
  });
  assert.equal(sessionContinuity.surface_kind, 'session_continuity');
  assert.equal(sessionContinuity.domain_agent_id, 'rca');
  assert.equal(sessionContinuity.restore_surface?.surface_kind, 'product_entry_session');

  const progressProjection = buildProgressProjection({
    session_id: 'entry-session-1',
    headline: '当前 deliverable loop 正在等待 operator review。',
    latest_update: '2m ago · operator review requested',
    next_step: '先查看同一 entry session 的最新 review 结论。',
    status_summary: '当前状态：resumable；运行态：healthy',
    current_status: 'resumable',
    runtime_status: 'healthy',
    progress_surface: progressSurface,
    artifact_surface: {
      surface_kind: 'artifact_inventory',
      summary: 'Inspect current deliverable outputs.',
      command: 'redcube product session --entry-session-id <entry-session-id>',
    },
    inspect_paths: ['/tmp/redcube/runtime-state', '/tmp/redcube/workspace'],
    attention_items: ['operator review gate active'],
    human_gate_ids: ['redcube_operator_review_gate'],
  });
  assert.equal(progressProjection.surface_kind, 'progress_projection');
  assert.equal(progressProjection.headline, '当前 deliverable loop 正在等待 operator review。');
  assert.deepEqual(progressProjection.inspect_paths, ['/tmp/redcube/runtime-state', '/tmp/redcube/workspace']);

  const artifactFile = buildArtifactFileDescriptor({
    file_id: 'deck_pptx',
    label: 'Final PPTX',
    kind: 'deliverable',
    path: '/tmp/redcube/workspace/output/final.pptx',
    summary: '当前最值得先看的主交付件。',
  });
  assert.equal(artifactFile.kind, 'deliverable');

  const artifactInventory = buildArtifactInventory({
    session_id: 'entry-session-1',
    workspace_path: '/tmp/redcube/workspace',
    progress_headline: progressProjection.headline,
    artifact_surface: {
      surface_kind: 'product_entry_session',
      summary: 'Inspect deliverable artifacts from the same entry session.',
      command: 'redcube product session --entry-session-id <entry-session-id>',
    },
    deliverable_files: [artifactFile],
    supporting_files: [
      {
        file_id: 'deck_pdf',
        label: 'Review PDF',
        kind: 'supporting',
        path: '/tmp/redcube/workspace/output/review.pdf',
        summary: '辅助 review 的导出件。',
      },
    ],
    inspect_paths: ['/tmp/redcube/workspace/output/final.pptx'],
  });
  assert.equal(artifactInventory.surface_kind, 'artifact_inventory');
  assert.equal(artifactInventory.summary.total_files_count, 2);
  assert.equal(artifactInventory.supporting_files[0].kind, 'supporting');
});
