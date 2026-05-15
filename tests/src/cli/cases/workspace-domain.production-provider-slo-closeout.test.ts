import { spawnSync } from 'node:child_process';

import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('framework production-closeout clears provider SLO blocker when the latest proof is proven', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-closeout-provider-proof-recovered-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_blocked',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_needs_live_evidence',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_blocker',
        receipt_status: 'blocked',
        provider_kind: 'temporal'
      }
    }),
    '2026-05-15T00:00:00.000Z'
  );
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_recovered',
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
    ${JSON.stringify(new Date().toISOString())}
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

    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).production_functional_closeout;

    assert.equal(closeout.provider_continuous_proof.proof_event_count, 2);
    assert.equal(closeout.provider_continuous_proof.proven_event_count, 1);
    assert.equal(closeout.provider_continuous_proof.continuous_proof_status, 'latest_proof_proven');
    assert.equal(closeout.provider_continuous_proof.proof_slo_status, 'proof_fresh');
    assert.equal(
      closeout.runtime_ledger.provider_continuous_proof.operator_slo_repair_loop.repair_state,
      'cadence_current',
    );
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'temporal_provider_continuous_proof_not_proven'
      ),
      false,
    );
    assert.equal(
      closeout.typed_blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'temporal_provider_proof_freshness_not_current'
      ),
      false,
    );
    assert.equal(
      closeout.production_evidence_readiness.pending_gates.includes('temporal_provider_slo_fresh_proof'),
      false,
    );
    assert.equal(closeout.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
