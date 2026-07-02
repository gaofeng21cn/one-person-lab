import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const schemaPath = 'contracts/family-orchestration/research-evidence-pack.schema.json';

function readJson(relativePath: string): JsonRecord {
  assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function record(value: unknown): JsonRecord {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonRecord;
}

async function loadHelper() {
  try {
    return await import('../../src/modules/ledger/research-evidence-pack.ts');
  } catch (error) {
    assert.fail(error instanceof Error ? error.message : 'research evidence pack helper module should load');
  }
}

function schemaDef(schema: JsonRecord, name: string): JsonRecord {
  return record(record(schema.$defs)[name]);
}

function surfaceProps(surface: JsonRecord) {
  return record(surface.properties);
}

test('research evidence pack schema freezes the standard surface/version family', async () => {
  const schema = readJson(schemaPath);
  const props = record(schema.properties);
  const authority = surfaceProps(schemaDef(schema, 'authority_boundary'));

  assert.equal(record(props.surface_kind).const, 'research_evidence_pack');
  assert.equal(record(props.version).const, 'research_evidence_pack.v1');
  for (const [defName, surfaceKind, version] of [
    ['research_run_manifest', 'research_run_manifest', 'research_run_manifest.v1'],
    ['negative_failed_path_ledger', 'negative_failed_path_ledger', 'negative_failed_path_ledger.v1'],
    ['decision_trace', 'decision_trace', 'decision_trace.v1'],
    ['artifact_lineage_graph', 'artifact_lineage_graph', 'artifact_lineage_graph.v1'],
    ['reproducibility_bundle', 'reproducibility_bundle', 'reproducibility_bundle.v1'],
  ]) {
    const properties = surfaceProps(schemaDef(schema, defName));
    assert.equal(record(properties.surface_kind).const, surfaceKind);
    assert.equal(record(properties.version).const, version);
  }
  assert.equal(record(authority.can_read_domain_body).const, false);
  assert.equal(record(authority.can_accept_or_reject_owner_receipt).const, false);
  assert.equal(record(authority.can_sign_domain_receipt).const, false);

  const helper = await loadHelper();
  const example = record((schema.examples as JsonRecord[])[0]);
  const validation = helper.validateResearchEvidencePack(example);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('research evidence pack summary reports refs, checksums, restore, negative paths, owners, and replay readiness', async () => {
  const helper = await loadHelper();
  const pack = {
    surface_kind: 'research_evidence_pack',
    version: 'research_evidence_pack.v1',
    pack_id: 'pack:dm002:stage-write',
    target_domain_id: 'med-autoscience',
    study_id: 'DM002',
    run_manifest: {
      surface_kind: 'research_run_manifest',
      version: 'research_run_manifest.v1',
      run_id: 'run:dm002:write:1',
      stage_id: 'write',
      stage_attempt_id: 'attempt:dm002:write:1',
      replay_stages: [
        {
          stage_id: 'write',
          append_only_event_log_refs: ['event-log:dm002/write'],
          attempt_ledger_refs: ['attempt-ledger:dm002/write'],
          recorded_runtime_event_refs: ['runtime-event:dm002/write-closeout'],
          closeout_receipt_refs: ['owner-receipt:dm002/write'],
        },
        {
          stage_id: 'review',
          append_only_event_log_refs: ['event-log:dm002/review'],
          attempt_ledger_refs: [],
          recorded_runtime_event_refs: [],
          closeout_receipt_refs: [],
        },
      ],
      input_refs: [
        {
          ref_id: 'source:cohort',
          role: 'analysis_source',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/DM002/data/cohort.parquet',
          status: 'present',
          required: true,
          checksum_status: 'verified',
          restore_status: 'not_required',
          body_included: false,
        },
      ],
      output_refs: [
        {
          ref_id: 'artifact:table1',
          role: 'table_artifact',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/DM002/artifacts/table1.csv',
          status: 'missing',
          required: true,
          checksum_status: 'missing',
          restore_status: 'restore_pending',
          body_included: false,
        },
      ],
    },
    negative_failed_path_ledger: {
      surface_kind: 'negative_failed_path_ledger',
      version: 'negative_failed_path_ledger.v1',
      failed_paths: [
        {
          path_id: 'failed:model-a',
          stage_id: 'write',
          failed_path_ref: 'ledger:dm002/model-a',
          owner_ref: 'owner:mas',
          status: 'failed',
          body_included: false,
        },
      ],
      negative_results: [
        {
          result_id: 'negative:null-model',
          stage_id: 'write',
          result_ref: 'ledger:dm002/null-model',
          owner_ref: 'owner:mas',
          status: 'negative_result',
          body_included: false,
        },
      ],
    },
    decision_trace: {
      surface_kind: 'decision_trace',
      version: 'decision_trace.v1',
      decisions: [
        {
          decision_id: 'decision:handoff-review',
          stage_id: 'write',
          decision_ref: 'decision:dm002/write-closeout',
          next_owner_ref: 'owner:mas-review',
          status: 'handoff',
        },
      ],
      next_owner_refs: ['owner:mas-review'],
    },
    artifact_lineage_graph: {
      surface_kind: 'artifact_lineage_graph',
      version: 'artifact_lineage_graph.v1',
      artifact_refs: [
        {
          ref_id: 'artifact:table1',
          role: 'table_artifact',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/DM002/artifacts/table1.csv',
          status: 'missing',
          required: true,
          checksum_status: 'mismatch',
          restore_status: 'restore_pending',
          body_included: false,
        },
      ],
      lineage_edges: [
        {
          from_ref: 'source:cohort',
          to_ref: 'artifact:table1',
          transform_ref: 'analysis-script:table1',
        },
      ],
    },
    reproducibility_bundle: {
      surface_kind: 'reproducibility_bundle',
      version: 'reproducibility_bundle.v1',
      environment_refs: ['env:dm002'],
      dependency_lock_refs: ['lock:uv'],
      replay_command_refs: ['command:make-replay'],
      restore_refs: [
        {
          ref_id: 'restore:table1',
          role: 'restore_manifest',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/DM002/restore/table1.json',
          status: 'present',
          required: true,
          checksum_status: 'verified',
          restore_status: 'restore_ready',
          body_included: false,
        },
      ],
      checksum_manifest_refs: ['checksum:dm002'],
    },
    authority_boundary: {
      opl_role: 'research_evidence_pack_projection_only',
      evidence_scope: 'refs_index_projection_replay_only',
      can_read_domain_body: false,
      can_accept_or_reject_owner_receipt: false,
      can_sign_domain_receipt: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };

  const summary = helper.summarizeResearchEvidencePack(pack);

  assert.equal(summary.surface_kind, 'research_evidence_pack_summary');
  assert.equal(summary.pack_id, 'pack:dm002:stage-write');
  assert.equal(summary.pack_refs.some((entry: { ref: string }) =>
    entry.ref === 'studies/DM002/data/cohort.parquet'), true);
  assert.equal(summary.pack_refs.some((entry: { ref: string }) =>
    entry.ref === 'decision:dm002/write-closeout'), true);
  assert.equal(summary.pack_refs.some((entry: { ref: string }) =>
    entry.ref === 'event-log:dm002/write'), true);
  assert.equal(summary.pack_refs.some((entry: { ref: string }) =>
    entry.ref === 'analysis-script:table1'), true);
  assert.deepEqual(summary.missing_refs.map((entry) => entry.ref_id), [
    'artifact:table1',
  ]);
  assert.deepEqual(summary.checksum_status, {
    verified_count: 2,
    missing_count: 1,
    mismatch_count: 1,
    unchecked_count: 0,
  });
  assert.deepEqual(summary.restore_status, {
    restore_ready_count: 1,
    restore_pending_count: 2,
    restored_count: 0,
    restore_blocked_count: 0,
    not_required_count: 1,
  });
  assert.equal(summary.failed_path_count, 1);
  assert.equal(summary.negative_result_count, 1);
  assert.deepEqual(summary.decision_trace_refs, ['decision:dm002/write-closeout']);
  assert.deepEqual(summary.next_owner_refs, ['owner:mas-review']);
  assert.deepEqual(summary.stage_replay_readiness, {
    stage_count: 2,
    replay_ready_stage_count: 1,
    blocked_stage_count: 1,
    replay_ready: false,
    blocked_stage_ids: ['review'],
  });
  assert.equal(summary.authority_boundary.can_read_domain_body, false);
  assert.equal(summary.authority_boundary.can_accept_or_reject_owner_receipt, false);
  assert.equal(summary.authority_boundary.can_sign_domain_receipt, false);
});

test('research evidence pack helper fails closed on domain body or authority expansion', async () => {
  const helper = await loadHelper();
  const pack = record((readJson(schemaPath).examples as JsonRecord[])[0]);
  const withDomainBody = {
    ...pack,
    domain_body: { claim: 'OPL must not ingest this body' },
  };
  const withAuthorityExpansion = {
    ...pack,
    authority_boundary: {
      ...record(pack.authority_boundary),
      can_read_domain_body: true,
      can_accept_or_reject_owner_receipt: true,
      can_sign_domain_receipt: true,
    },
  };

  assert.deepEqual(
    helper.validateResearchEvidencePack(withDomainBody).errors.map((entry) => entry.code),
    ['domain_body_forbidden'],
  );
  assert.equal(helper.validateResearchEvidencePack(withAuthorityExpansion).valid, false);
  assert.throws(
    () => helper.summarizeResearchEvidencePack(withAuthorityExpansion),
    /Research evidence pack failed fail-closed validation/,
  );
});
