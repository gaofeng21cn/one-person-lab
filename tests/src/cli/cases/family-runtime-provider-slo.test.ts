import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return { OPL_STATE_DIR: stateRoot, ...extra };
}

function insertProvenTemporalProofEvent(stateRoot: string, createdAt = new Date().toISOString()) {
  runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_fresh',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    ${JSON.stringify(createdAt)}
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
}

function assertPersistedProofRefs(tick: any, events: any[], stateRoot: string) {
  const expected = path.join(stateRoot, 'family-runtime', 'proofs', 'latest-temporal-production-proof.json');
  const proof = events.filter((event) => event.event_type === 'temporal_residency_proof').at(-1);
  const execution = events.filter((event) => event.event_type === 'temporal_provider_slo_execution_receipt').at(-1);
  assert.deepEqual([
    tick.persisted_proof_ref, tick.provider_slo_execution_receipt.persisted_proof_ref,
    proof.payload.persisted_proof_ref, proof.payload.provider_slo_execution_receipt.persisted_proof_ref,
    execution.payload.persisted_proof_ref], Array(5).fill(expected));
}

test('family-runtime provider-slo tick persists blocked repair receipt when production proof cannot run', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-blocked-'));
  try {
    const tick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;

    assert.equal(tick.execution_status, 'executed');
    assert.equal(tick.provider_slo_execution_receipt.receipt_status, 'blocked');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.repair_status, 'blocked');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.blocker_ids.includes('temporal_runtime_not_configured'), true);
    assert.equal(tick.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo tick skips fresh cadence without rerunning proof', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-skip-'));
  try {
    insertProvenTemporalProofEvent(stateRoot);
    const skippedTick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;
    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));

    assert.equal(skippedTick.execution_status, 'skipped');
    assert.equal(skippedTick.before.proof_slo_status, 'proof_fresh');
    assert.equal(skippedTick.provider_slo_execution_receipt.receipt_status, 'skipped');
    assert.equal(skippedTick.provider_slo_execution_receipt.skip_reason, 'cadence_current');
    assert.equal(skippedTick.persisted_proof_ref, undefined);
    const proofs = events.family_runtime_events.events.filter(
      (event: { event_type: string }) => event.event_type === 'temporal_residency_proof');
    assert.equal(proofs.length, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const [name, force, ageMs, before] of [
  ['force reruns current cadence', true, 0, 'proof_fresh'],
  ['stale proof reruns cadence', false, 2 * 24 * 60 * 60 * 1_000, 'proof_stale'],
] as const) {
  test(`family-runtime provider-slo ${name}`, () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-due-'));
    try {
      insertProvenTemporalProofEvent(stateRoot, new Date(Date.now() - ageMs).toISOString());
      const tick = runCli(['family-runtime', 'provider-slo', 'tick', '--provider', 'temporal',
        ...(force ? ['--force'] : [])], familyRuntimeEnv(stateRoot,
        { OPL_TEMPORAL_ADDRESS: '', TEMPORAL_ADDRESS: '' }))
        .family_runtime_provider_slo_tick;
      const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot))
        .family_runtime_events.events;

      assert.equal(tick.before.proof_slo_status, before); assert.equal(tick.execution_status, 'executed');
      assert.equal(tick.provider_slo_execution_receipt.repair_receipt.trigger, force ? 'forced' : 'proof_stale');
      assertPersistedProofRefs(tick, events, stateRoot);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
}
