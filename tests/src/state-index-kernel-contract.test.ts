import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

type SqliteDatabaseContract = {
  database_id: string;
  path: string;
  path_status?: string;
  owned_tables: string[];
};

test('OPL State Index Kernel freezes File Truth plus SQLite sidecar plus Temporal runtime split', () => {
  const contract = readJson('contracts/opl-framework/state-index-kernel-contract.json');

  assert.equal(contract.surface_kind, 'opl_state_index_kernel_contract');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.truth_split.file_truth.source_of_truth, true);
  assert.equal(contract.truth_split.sqlite_sidecar_index.source_of_truth, false);
  assert.equal(contract.truth_split.sqlite_sidecar_index.role, 'rebuildable_operational_index');
  assert.equal(contract.truth_split.temporal_provider.production_required, true);
  assert.equal(
    contract.truth_split.temporal_provider.sqlite_sidecar_role,
    'projection_and_readback_index_only',
  );
  assert.equal(
    contract.truth_split.durable_runtime_transport_registry.role,
    'pre_start_write_ahead_stage_run_identity_and_transport_recovery',
  );
  assert.equal(contract.truth_split.durable_runtime_transport_registry.source_of_domain_truth, false);
  assert.match(contract.status_rule, /physical outputs \+ manifest validity \+ receipt authority \+ current pointer/);
});

test('OPL State Index Kernel declares bounded refs-only SQLite databases and required fields', () => {
  const contract = readJson('contracts/opl-framework/state-index-kernel-contract.json');
  const databases = new Map<string, SqliteDatabaseContract>(
    (contract.sqlite_database_layout.databases as SqliteDatabaseContract[]).map((database) => [
      database.database_id,
      database,
    ]),
  );

  assert.equal(databases.get('stage_attempt_index')?.path, '${OPL_STATE_DIR}/family-runtime/queue.sqlite');
  assert.equal(databases.get('stage_attempt_index')?.path_status, 'legacy_filename_retained_for_migration_compat');
  assert.equal(databases.get('stage_attempt_index')?.owned_tables.includes('queue_holds'), false);
  assert.ok(databases.get('stage_attempt_index')?.owned_tables.includes('stage_attempts'));
  assert.ok(databases.get('stage_attempt_index')?.owned_tables.includes('stage_run_launches'));
  assert.equal(contract.stage_run_launch_registry.register_before_provider_start, true);
  assert.equal(contract.stage_run_launch_registry.validate_identity_and_spec_before_write, true);
  assert.equal(contract.stage_run_launch_registry.late_provider_start_receipt_cannot_reopen_closed_stage_run, true);
  assert.equal(
    contract.stage_run_launch_registry.late_provider_start_failure_cannot_downgrade_started_or_closed_stage_run,
    true,
  );
  assert.deepEqual(contract.stage_run_launch_registry.launch_statuses, [
    'registered',
    'starting',
    'start_failed',
    'started',
    'closed',
  ]);
  assert.match(contract.stage_run_launch_registry.provider_start_claim, /expired_starting_takeover/);
  assert.equal(contract.stage_run_launch_registry.temporal_executions_per_stage_run, 1);
  assert.equal(contract.stage_run_launch_registry.started_to_start_failed_allowed, false);
  assert.equal(contract.stage_run_launch_registry.invocation_spec_conflict_effect, 'typed_fail_closed');
  assert.equal(contract.stage_run_launch_registry.registry_is_domain_truth, false);
  assert.equal(databases.get('lifecycle_index')?.path, '${OPL_STATE_DIR}/family-runtime/lifecycle-index.sqlite');
  assert.ok(databases.get('artifact_index')?.owned_tables.includes('artifact_refs'));
  assert.ok(databases.get('operator_read_model')?.owned_tables.includes('owner_route_index'));

  for (const field of [
    'domain_id',
    'program_id',
    'stage_id',
    'attempt_id',
    'source_ref',
    'receipt_ref',
    'content_hash',
    'indexed_at',
    'index_version',
    'rebuild_epoch',
  ]) {
    assert.ok(contract.required_index_fields.includes(field), `missing required index field ${field}`);
  }
});

test('OPL State Index Kernel forbids SQLite truth-body and verdict authority storage', () => {
  const contract = readJson('contracts/opl-framework/state-index-kernel-contract.json');
  const forbidden = contract.forbidden_payloads as string[];
  const boundary = contract.authority_boundary as Record<string, any>;

  for (const payload of [
    'domain truth body',
    'memory body',
    'artifact body',
    'PNG/PPTX/PDF/blob body',
    'quality verdict body',
    'owner receipt authority',
    'production readiness authority',
  ]) {
    assert.ok(forbidden.includes(payload), `missing forbidden payload ${payload}`);
  }

  assert.equal(boundary.opl_can_index_refs, true);
  assert.equal(boundary.opl_can_rebuild_from_file_truth, true);
  assert.equal(boundary.opl_can_write_domain_truth, false);
  assert.equal(boundary.opl_can_write_memory_body, false);
  assert.equal(boundary.opl_can_write_artifact_body, false);
  assert.equal(boundary.opl_can_store_large_artifact_blob_in_sqlite, false);
  assert.equal(boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(boundary.opl_can_authorize_quality_or_export, false);
  assert.equal(boundary.sqlite_record_counts_as_stage_complete, false);
});

test('OPL State Index Kernel requires bounded backup retention with latest recovery protection', () => {
  const contract = readJson('contracts/opl-framework/state-index-kernel-contract.json');
  const retention = contract.maintenance_policy.backup_retention;

  assert.equal(contract.maintenance_policy.backup_retention_required, true);
  assert.deepEqual(
    {
      max_count: retention.max_count,
      max_age_days: retention.max_age_days,
      max_bytes: retention.max_bytes,
    },
    {
      max_count: 3,
      max_age_days: 14,
      max_bytes: 8 * 1024 * 1024 * 1024,
    },
  );
  assert.equal(retention.always_retain_latest_successful_backup, true);
  assert.equal(retention.prune_order, 'oldest_first_after_new_backup_succeeds');
});

test('OPL State Index Kernel bounds runtime history and persisted payloads', () => {
  const contract = readJson('contracts/opl-framework/state-index-kernel-contract.json');
  const policy = contract.maintenance_policy;
  const retention = policy.runtime_history_retention;

  assert.equal(policy.runtime_history_retention_required, true);
  assert.deepEqual(retention.events, { max_count: 50_000, max_age_days: 30 });
  assert.deepEqual(retention.notifications, { max_count: 10_000, max_age_days: 30 });
  assert.deepEqual(retention.stage_attempt_closeouts, {
    max_count: 10_000,
    max_age_days: 90,
    eligible_statuses: ['completed', 'failed', 'dead_lettered'],
  });
  assert.equal(retention.prune_trigger, 'queue_open_and_bounded_periodic_event_or_notification_write');
  assert.equal(retention.prune_mode, 'incremental_oldest_first');
  assert.equal(retention.max_rows_per_table_per_prune_pass, 5_000);
  assert.deepEqual(policy.payload_byte_limits, {
    runtime_ledger_json_max_bytes: 64 * 1024,
    stage_attempt_workspace_locator_json_max_bytes: 64 * 1024,
    stage_attempt_activity_event_json_max_bytes: 16 * 1024,
    stage_attempt_closeout_packet_json_max_bytes: 64 * 1024,
    stage_attempt_closeout_uncompressed_json_max_bytes: 1024 * 1024,
  });
  assert.deepEqual(policy.stage_attempt_closeout_compression, {
    surface_kind: 'opl_stage_attempt_closeout_compressed_json',
    version: 'stage-attempt-closeout-compressed-json.v1',
    encoding: 'gzip_base64',
    legacy_plain_json_passthrough: true,
    compressed_sha256_required: true,
    uncompressed_sha256_required: true,
    declared_uncompressed_bytes_required: true,
    decompression_limit: 'declared_exact_length_and_hard_uncompressed_limit',
    metadata_scope: 'closeout protocol metadata only, never domain or artifact bodies',
  });
});

test('OPL State Index Kernel locks SQLite maintenance policy for local sidecar use', () => {
  const contract = readJson('contracts/opl-framework/state-index-kernel-contract.json');
  const policy = contract.maintenance_policy as Record<string, any>;

  assert.equal(policy.journal_mode, 'WAL');
  assert.equal(policy.busy_timeout_ms, 5000);
  assert.equal(policy.single_writer_assumption, true);
  assert.equal(policy.network_filesystem_multi_writer_supported, false);
  assert.equal(policy.checkpoint_required, true);
  assert.equal(policy.backup_required, true);
  assert.equal(policy.integrity_check_required, true);
  assert.equal(policy.optimize_required, true);
  assert.equal(policy.vacuum_after_large_delete_only, true);
  assert.equal(policy.bounded_payload_envelope_required, true);
});
