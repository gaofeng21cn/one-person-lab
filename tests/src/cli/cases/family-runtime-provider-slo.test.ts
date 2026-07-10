import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  createFamilyRuntimeQueueTables,
} from '../../../../src/modules/runway/family-runtime-store.ts';

function familyRuntimeEnv(stateRoot: string) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
  };
}

function insertProvenTemporalProofEvent(stateRoot: string, createdAt: string) {
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const db = new DatabaseSync(path.join(runtimeRoot, 'queue.sqlite'));
  try {
    createFamilyRuntimeQueueTables(db);
    db.prepare(`
      INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
      VALUES (?, NULL, NULL, ?, ?, ?, ?)
    `).run(
      'evt-provider-proof-seed',
      'temporal_residency_proof',
      'test',
      JSON.stringify({
        provider_kind: 'temporal',
        proof_mode: 'external_temporal_service_worker',
        closeout_status: 'production_residency_proven',
        proof_receipt: {
          receipt_kind: 'temporal_production_residency_proof',
          receipt_status: 'proven',
          provider_kind: 'temporal',
        },
      }),
      createdAt,
    );
  } finally {
    db.close();
  }
}

test('family-runtime provider-slo public envelope fails closed without Temporal readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-blocked-'));
  try {
    const tick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot)).family_runtime_provider_slo_tick;

    assert.equal(tick.surface_id, 'opl_family_runtime_provider_slo_tick');
    assert.equal(tick.provider_kind, 'temporal');
    assert.equal(tick.execution_status, 'executed');
    assert.equal(tick.provider_slo_execution_receipt.receipt_status, 'blocked');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.repair_status, 'blocked');
    assert.ok(
      tick.provider_slo_execution_receipt.repair_receipt.blocker_ids.includes(
        'temporal_runtime_not_configured',
      ),
    );
    assert.equal(
      tick.provider_slo_execution_receipt.repair_receipt.next_repair_command,
      'opl family-runtime service start --provider temporal',
    );
    assert.equal(tick.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      tick.provider_slo_execution_receipt.authority_boundary.can_authorize_domain_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const scenario of [
  {
    name: 'skips fresh cadence',
    proofAgeMs: 0,
    force: false,
    expectedBefore: 'proof_fresh',
    expectedExecution: 'skipped',
    expectedReceipt: 'skipped',
    expectedTrigger: 'cadence_current',
    expectedProofEvents: 1,
  },
  {
    name: 'force-runs fresh cadence',
    proofAgeMs: 0,
    force: true,
    expectedBefore: 'proof_fresh',
    expectedExecution: 'executed',
    expectedReceipt: 'blocked',
    expectedTrigger: 'forced',
    expectedProofEvents: 2,
  },
  {
    name: 'refreshes a stale proof receipt',
    proofAgeMs: 2 * 24 * 60 * 60 * 1_000,
    force: false,
    expectedBefore: 'proof_stale',
    expectedExecution: 'executed',
    expectedReceipt: 'blocked',
    expectedTrigger: 'proof_stale',
    expectedProofEvents: 2,
  },
] as const) {
  test(`family-runtime provider-slo ${scenario.name}`, () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-slo-cadence-owner-'));
    try {
      insertProvenTemporalProofEvent(
        stateRoot,
        new Date(Date.now() - scenario.proofAgeMs).toISOString(),
      );
      const args = [
        'family-runtime',
        'provider-slo',
        'tick',
        '--provider',
        'temporal',
        ...(scenario.force ? ['--force'] : []),
      ];
      const tick = runCli(args, familyRuntimeEnv(stateRoot)).family_runtime_provider_slo_tick;
      const events = runCli(
        ['family-runtime', 'events', 'export'],
        familyRuntimeEnv(stateRoot),
      ).family_runtime_events.events;
      const proofEvents = events.filter(
        (event: { event_type: string }) => event.event_type === 'temporal_residency_proof',
      );
      const sloEvents = events.filter(
        (event: { event_type: string }) =>
          event.event_type === 'temporal_provider_slo_execution_receipt',
      );

      assert.equal(tick.before.proof_slo_status, scenario.expectedBefore);
      assert.equal(tick.execution_status, scenario.expectedExecution);
      assert.equal(tick.provider_slo_execution_receipt.receipt_status, scenario.expectedReceipt);
      assert.equal(
        tick.provider_slo_execution_receipt.repair_receipt.trigger,
        scenario.expectedTrigger,
      );
      assert.equal(Boolean(tick.persisted_proof_ref), scenario.expectedExecution === 'executed');
      assert.equal(proofEvents.length, scenario.expectedProofEvents);
      assert.equal(sloEvents.length, 1);
      assert.equal(sloEvents[0].payload.execution_status, scenario.expectedExecution);
      assert.equal(tick.authority_boundary.can_write_domain_truth, false);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
}
