import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function insertProvenTemporalProofEvent(stateRoot: string) {
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
    new Date().toISOString()
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

test('family-runtime provider-slo tick executes production proof when provider SLO is due', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-execute-'));
  try {
    runCli([
      'family-runtime',
      'residency',
      'proof',
      '--provider',
      'temporal',
      '--production',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));
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
    assert.equal(tick.skipped, false);
    assert.equal(tick.before.proof_slo_status, 'proof_blocker_observed');
    assert.equal(tick.provider_slo_execution_receipt.execution_status, 'executed');
    assert.equal(tick.provider_slo_execution_receipt.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(tick.authority_boundary.can_write_domain_truth, false);

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    const sloEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_provider_slo_execution_receipt'
    );
    assert.equal(proofEvents.length, 2);
    assert.equal(sloEvents.length, 2);
    assert.equal(sloEvents.at(-1).payload.execution_status, 'executed');
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

    assert.equal(skippedTick.execution_status, 'skipped');
    assert.equal(skippedTick.skipped, true);
    assert.equal(skippedTick.before.proof_slo_status, 'proof_fresh');
    assert.equal(skippedTick.provider_slo_execution_receipt.receipt_status, 'skipped');
    assert.equal(skippedTick.provider_slo_execution_receipt.skip_reason, 'cadence_current');
    assert.equal(
      skippedTick.provider_slo_execution_receipt.cadence_action.dispatch_status,
      'cadence_current',
    );
    assert.equal(
      skippedTick.provider_slo_execution_receipt.authority_boundary.can_authorize_domain_ready,
      false,
    );

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    const sloEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_provider_slo_execution_receipt'
    );

    assert.equal(proofEvents.length, 1);
    assert.equal(sloEvents.length, 1);
    assert.equal(sloEvents.at(-1).payload.receipt_status, 'skipped');
    assert.equal(sloEvents.at(-1).payload.skip_reason, 'cadence_current');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo tick force reruns proof even when cadence is current', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-force-'));
  try {
    insertProvenTemporalProofEvent(stateRoot);
    const forced = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
      '--force',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;

    assert.equal(forced.execution_status, 'executed');
    assert.equal(forced.skipped, false);
    assert.equal(forced.force, true);
    assert.equal(forced.before.proof_slo_status, 'proof_fresh');
    assert.equal(forced.provider_slo_execution_receipt.execution_status, 'executed');

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    assert.equal(proofEvents.length, 2);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
