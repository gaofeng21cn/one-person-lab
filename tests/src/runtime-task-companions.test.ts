import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCheckpointSummary,
  buildRuntimeInventory,
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
});
