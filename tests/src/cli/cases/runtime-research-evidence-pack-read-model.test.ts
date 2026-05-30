import { assert, fs, os, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';

function readSchemaExample() {
  const schemaPath = path.join(
    repoRoot,
    'contracts/family-orchestration/research-evidence-pack.schema.json',
  );
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
    examples: Array<Record<string, unknown>>;
  };
  return schema.examples[0];
}

function writePayload(payload: unknown) {
  const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-research-pack-cli-'));
  const payloadFile = path.join(payloadDir, 'research-evidence-pack.json');
  fs.writeFileSync(payloadFile, `${JSON.stringify(payload, null, 2)}\n`);
  return { payloadDir, payloadFile };
}

test('runtime research-evidence-pack summary projects a body-free CLI read model', () => {
  const pack = {
    ...readSchemaExample(),
    run_manifest: {
      ...(readSchemaExample().run_manifest as Record<string, unknown>),
      output_refs: [
        {
          ref_id: 'artifact:table1',
          role: 'table_artifact',
          ref_kind: 'workspace_relative_path',
          ref: 'studies/study-001/artifacts/table1.csv',
          status: 'missing',
          required: true,
          checksum_status: 'missing',
          restore_status: 'restore_pending',
          body_included: false,
        },
      ],
      replay_stages: [
        ...((readSchemaExample().run_manifest as { replay_stages: unknown[] }).replay_stages),
        {
          stage_id: 'review',
          append_only_event_log_refs: ['event-log:study-001/review'],
          attempt_ledger_refs: [],
          recorded_runtime_event_refs: [],
          closeout_receipt_refs: [],
        },
      ],
    },
    negative_failed_path_ledger: {
      surface_kind: 'negative_failed_path_ledger',
      version: 'negative_failed_path_ledger.v1',
      failed_paths: [
        {
          path_id: 'failed:model-a',
          stage_id: 'stage-1',
          failed_path_ref: 'ledger:study-001/model-a',
          owner_ref: 'owner:example-domain',
          status: 'failed',
          body_included: false,
        },
      ],
      negative_results: [
        {
          path_id: 'negative:null-model',
          result_id: 'negative:null-model',
          stage_id: 'stage-1',
          failed_path_ref: 'ledger:study-001/null-model',
          result_ref: 'ledger:study-001/null-model',
          owner_ref: 'owner:example-domain',
          status: 'negative_result',
          body_included: false,
        },
      ],
    },
  };
  const { payloadDir, payloadFile } = writePayload(pack);
  try {
    const output = runCli([
      'runtime',
      'research-evidence-pack',
      'summary',
      '--payload-file',
      payloadFile,
    ]);
    const readModel = output.research_evidence_pack_read_model;

    assert.equal(readModel.surface_kind, 'research_evidence_pack_summary');
    assert.equal(readModel.pack_id, 'pack:example:research-run');
    assert.equal(readModel.pack_refs.some((entry: { ref: string }) =>
      entry.ref === 'studies/study-001/source/index.json'), true);
    assert.equal(readModel.pack_refs.some((entry: { ref: string }) =>
      entry.ref === 'decision:study-001/stage-1'), true);
    assert.equal(readModel.pack_refs.some((entry: { ref: string }) =>
      entry.ref === 'event-log:study-001/stage-1'), true);
    assert.deepEqual(readModel.missing_refs.map((entry: { ref_id: string }) => entry.ref_id), [
      'artifact:table1',
    ]);
    assert.deepEqual(readModel.checksum_status, {
      verified_count: 1,
      missing_count: 1,
      mismatch_count: 0,
      unchecked_count: 0,
    });
    assert.deepEqual(readModel.restore_status, {
      restore_ready_count: 0,
      restore_pending_count: 1,
      restored_count: 0,
      restore_blocked_count: 0,
      not_required_count: 1,
    });
    assert.equal(readModel.failed_path_count, 1);
    assert.equal(readModel.negative_result_count, 1);
    assert.deepEqual(readModel.decision_trace_refs, ['decision:study-001/stage-1']);
    assert.deepEqual(readModel.next_owner_refs, ['owner:example-domain-review']);
    assert.deepEqual(readModel.stage_replay_readiness, {
      stage_count: 2,
      replay_ready_stage_count: 1,
      blocked_stage_count: 1,
      replay_ready: false,
      blocked_stage_ids: ['review'],
    });
    assert.equal(readModel.authority_boundary.can_read_domain_body, false);
    assert.equal(readModel.authority_boundary.can_accept_or_reject_owner_receipt, false);
    assert.equal(readModel.authority_boundary.can_sign_domain_receipt, false);
    assert.equal(readModel.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readModel.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(readModel.authority_boundary.can_mutate_artifact_body, false);
  } finally {
    fs.rmSync(payloadDir, { recursive: true, force: true });
  }
});

test('runtime research-evidence-pack summary fails closed on evidence bodies', () => {
  const { payloadDir, payloadFile } = writePayload({
    ...readSchemaExample(),
    domain_body: { forbidden: true },
  });
  try {
    const failure = runCliFailure([
      'runtime',
      'research-evidence-pack',
      'summary',
      '--payload-file',
      payloadFile,
    ]);

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /valid body-free research evidence pack/);
    assert.deepEqual(
      failure.payload.error.details.validation_errors.map((entry: { code: string }) => entry.code),
      ['domain_body_forbidden'],
    );
  } finally {
    fs.rmSync(payloadDir, { recursive: true, force: true });
  }
});
