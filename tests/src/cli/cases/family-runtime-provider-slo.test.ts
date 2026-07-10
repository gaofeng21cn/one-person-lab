import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
  };
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
