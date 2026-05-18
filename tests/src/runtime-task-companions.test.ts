import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArtifactFileDescriptor,
  buildArtifactInventory,
  buildCheckpointSummary,
  buildFamilyLifecycleLedger,
  buildFamilyOwnerRoute,
  buildFamilyPersistencePolicy,
  buildFamilyRuntimeSupervision,
  buildProgressProjection,
  buildRuntimeInventory,
  buildSessionContinuity,
  buildTaskLifecycle,
  buildTaskSurfaceDescriptor,
} from '../../src/runtime-task-companions.ts';

test('runtime task companion helpers normalize MAS, MAG, and RCA style payloads', () => {
  const runtimeInventory = buildRuntimeInventory({
    summary: 'MAS monolith study runtime is ready.',
    runtime_owner: 'mas_runtime_core',
    domain_owner: 'medautoscience',
    executor_owner: 'codex_cli',
    substrate: 'mas_monolith_runtime',
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
  assert.equal(runtimeInventory.runtime_owner, 'mas_runtime_core');

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
    runtime_owner: 'provider_backed_family_runtime',
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

test('family persistence policy separates file authority from sidecar indexes', () => {
  const policy = buildFamilyPersistencePolicy({
    target_domain_id: 'medautoscience',
    policy_id: 'mas_runtime_lifecycle_policy',
    summary: 'Runtime history is indexed in SQLite while study truth stays file-owned.',
    authority_surfaces: [
      {
        surface_id: 'publication_eval_latest',
        surface_role: 'publication_quality_authority',
        storage_role: 'file_authority',
        owner: 'medautoscience',
        ref: {
          ref_kind: 'repo_path',
          ref: 'artifacts/publication_eval/latest.json',
        },
      },
    ],
    sidecar_indexes: [
      {
        surface_id: 'runtime_lifecycle_sqlite',
        surface_role: 'runtime_history_index',
        storage_role: 'sqlite_sidecar_index',
        owner: 'medautoscience',
        ref: {
          ref_kind: 'repo_path',
          ref: 'artifacts/runtime/runtime_lifecycle.sqlite',
        },
        rebuild_from_refs: [
          {
            ref_kind: 'repo_path',
            ref: 'artifacts/runtime/lifecycle_migration/latest.json',
          },
        ],
      },
    ],
    projection_caches: [
      {
        surface_id: 'study_progress_shadow',
        surface_role: 'read_model_cache',
        storage_role: 'projection_cache',
        owner: 'medautoscience',
        ref: {
          ref_kind: 'json_pointer',
          ref: '/progress_projection/domain_projection',
        },
      },
    ],
    source_provenance: [
      {
        surface_id: 'historical_quest_archive_import',
        surface_role: 'explicit_archive_import_ref',
        storage_role: 'source_provenance_only',
        owner: 'medautoscience',
        ref: {
          ref_kind: 'cli',
          ref: 'runtime lifecycle-quest-git-inventory',
        },
      },
    ],
  });

  assert.equal(policy.surface_kind, 'family_persistence_policy');
  assert.equal(policy.authority_surfaces[0].storage_role, 'file_authority');
  assert.equal(policy.sidecar_indexes[0].storage_role, 'sqlite_sidecar_index');
  assert.equal(policy.sidecar_indexes[0].rebuild_from_refs[0].ref, 'artifacts/runtime/lifecycle_migration/latest.json');
});

test('family lifecycle ledger requires checksum and restore proof for retention actions', () => {
  const ledger = buildFamilyLifecycleLedger({
    target_domain_id: 'redcube_ai',
    ledger_id: 'redcube_managed_run_retention_20260508',
    phase: 'dry_run',
    status: 'planned',
    summary: 'Managed run retention candidate is planned with restore proof.',
    actions: [
      {
        action_id: 'archive_old_managed_run',
        action_kind: 'archive',
        target_ref: {
          ref_kind: 'repo_path',
          ref: 'runtime-state/managed-runs/run-1',
        },
        authority_owner: 'redcube_ai',
        safety_gate: 'restore_proof_required',
        result: 'planned',
        manifest_ref: {
          ref_kind: 'repo_path',
          ref: 'runtime-state/managed-runs/run-1.manifest.json',
        },
        sha256: 'f'.repeat(64),
        restore_ref: {
          ref_kind: 'repo_path',
          ref: 'runtime-state/restore/run-1.restore.json',
        },
      },
    ],
  });

  assert.equal(ledger.surface_kind, 'family_lifecycle_ledger');
  assert.equal(ledger.actions[0].sha256, 'f'.repeat(64));
  assert.equal(ledger.actions[0].restore_ref.ref, 'runtime-state/restore/run-1.restore.json');
});

test('family owner route carries epoch, source fingerprint, and idempotency token', () => {
  const route = buildFamilyOwnerRoute({
    target_domain_id: 'med-autogrant',
    route_id: 'mag_grant_authoring_route',
    route_epoch: '2026-05-08T00:00:00Z#1',
    source_fingerprint: 'grant-progress:abc123',
    next_owner: 'med-autogrant',
    allowed_actions: ['resume_grant_user_loop'],
    idempotency_key: 'resume_grant_user_loop:abc123',
    status: 'ready_for_owner',
    summary: 'Grant progress can resume through the grant user loop.',
    handoff_refs: [
      {
        ref_kind: 'cli',
        ref: 'uv run python -m med_autogrant product user-loop --input <workspace> --task-intent <intent>',
      },
    ],
    projection_refs: [
      {
        ref_kind: 'repo_path',
        ref: 'contracts/runtime-program/current-program.json',
      },
    ],
  });

  assert.equal(route.surface_kind, 'family_owner_route');
  assert.deepEqual(route.allowed_actions, ['resume_grant_user_loop']);
  assert.equal(route.idempotency_key, 'resume_grant_user_loop:abc123');
});

test('family runtime supervision helper projects wakeup freshness without authority transfer', () => {
  const supervision = buildFamilyRuntimeSupervision({
    target_domain_id: 'medautoscience',
    supervision_id: 'mas_workspace_runtime_supervision',
    adapter_id: 'local_launchd',
    cadence: {
      interval_seconds: 60,
      jitter_seconds: 5,
    },
    last_tick: '2026-05-10T00:00:00Z',
    last_success: '2026-05-10T00:00:05Z',
    lease_freshness: {
      state: 'fresh',
      observed_at: '2026-05-10T00:00:08Z',
      max_age_seconds: 180,
    },
    slo_state: {
      state: 'met',
      summary: 'supervision tick is inside the domain-owned freshness SLO',
    },
    repair_command: 'medautoscience runtime-ensure-supervision --profile <profile>',
    safe_reconcile_hint: 'Run domain-owned supervision repair; do not write runtime truth from OPL.',
    domain_owned_source_refs: [
      {
        ref_kind: 'repo_path',
        ref: 'studies/<study_id>/artifacts/runtime/runtime_supervision/latest.json',
        role: 'runtime_supervision_truth',
      },
    ],
    read_only_authority_boundary: {
      projection_owner: 'one-person-lab',
      runtime_owner: 'medautoscience',
      scheduler_owner: 'medautoscience',
      authority: 'read_only_projection',
      forbidden_authorities: [
        'scheduler_owner',
        'session_store_owner',
        'memory_store_owner',
        'quality_verdict_owner',
        'artifact_authority',
      ],
    },
  });

  assert.equal(supervision.surface_kind, 'family_runtime_supervision');
  assert.equal(supervision.adapter_id, 'local_launchd');
  assert.equal(supervision.cadence.interval_seconds, 60);
  assert.equal(supervision.lease_freshness.state, 'fresh');
  assert.equal(supervision.slo_state.state, 'met');
  assert.equal(supervision.domain_owned_source_refs[0]?.role, 'runtime_supervision_truth');
  assert.equal(supervision.read_only_authority_boundary.authority, 'read_only_projection');
  assert.deepEqual(supervision.read_only_authority_boundary.forbidden_authorities, [
    'scheduler_owner',
    'session_store_owner',
    'memory_store_owner',
    'quality_verdict_owner',
    'artifact_authority',
  ]);
});
