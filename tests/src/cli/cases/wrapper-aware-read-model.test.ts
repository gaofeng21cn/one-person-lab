import { assert, fs, os, path, runCli, test } from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function assertOnlyWrapperKey(
  output: JsonRecord,
  wrapperKey: string,
  legacyTopLevelKeys: string[],
) {
  assert.ok(output[wrapperKey], `${wrapperKey} wrapper is required`);
  for (const key of legacyTopLevelKeys) {
    assert.equal(
      Object.hasOwn(output, key),
      false,
      `legacy top-level ${key} must not be consumed outside ${wrapperKey}`,
    );
  }
}

test('read-model consumers must use wrapper keys for App and Console CLI payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wrapper-aware-read-model-'));
  const env = {
    OPL_STATE_DIR: stateRoot,
  };
  try {
    const appOutput = runCli(['runtime', 'app-operator-drilldown'], env);
    assertOnlyWrapperKey(appOutput, 'app_operator_drilldown', [
      'surface_kind',
      'detail_level',
      'summary',
      'attention_first_payload',
    ]);
    const appDrilldown = appOutput.app_operator_drilldown as JsonRecord;
    assert.equal(appDrilldown.surface_kind, 'opl_app_operator_drilldown_read_model');
    assert.equal(appDrilldown.detail_level, 'summary');
    assert.equal(
      typeof (appDrilldown.summary as JsonRecord).app_release_user_path_evidence_open_gate_count,
      'number',
    );
    assert.equal((appDrilldown.summary as JsonRecord).app_release_user_path_release_ready_claimed, false);
    assert.equal((appDrilldown.summary as JsonRecord).app_release_user_path_production_ready_claimed, false);

    const maturityOutput = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env);
    assertOnlyWrapperKey(maturityOutput, 'framework_operating_maturity', [
      'surface_kind',
      'status',
      'summary',
      'brand_module_l5',
      'app_release_user_path',
      'foundry_agent_os_production_evidence_gate',
    ]);
    const maturity = maturityOutput.framework_operating_maturity as JsonRecord;
    assert.equal(maturity.surface_kind, 'opl_family_operating_maturity_readout');
    assert.equal(maturity.status, 'evidence_required');
    assert.equal((maturity.summary as JsonRecord).ready_claim_authorized, false);
    assert.ok((maturity.brand_module_l5 as JsonRecord).evidence_ledger);
    assert.ok(
      ((maturity.foundry_agent_os_production_evidence_gate as JsonRecord)
        .owner_route_work_orders_by_lane as JsonRecord).brand_module_l5_operating_maturity,
    );

    const brandOutput = runCli(['brand-modules', 'l5-status'], env);
    assertOnlyWrapperKey(brandOutput, 'brand_module_l5_status', [
      'surface_kind',
      'status',
      'modules',
      'evidence_ledger',
      'refs_only_ledger',
    ]);
    const brandL5 = brandOutput.brand_module_l5_status as JsonRecord;
    assert.equal(brandL5.surface_kind, 'opl_brand_module_l5_status');
    assert.equal(brandL5.status, 'evidence_required');
    assert.ok(brandL5.evidence_ledger);
    assert.equal(Object.hasOwn(brandL5, 'refs_only_ledger'), false);

    const runwayOutput = runCli(['runway', 'readiness'], env);
    assertOnlyWrapperKey(runwayOutput, 'opl_runway_readiness', [
      'surface_kind',
      'provider_status',
      'provider_runtime',
      'worker_supervisor_liveness',
      'attempt_repair_queue',
    ]);
    const runwayReadiness = runwayOutput.opl_runway_readiness as JsonRecord;
    assert.equal(runwayReadiness.surface_kind, 'opl_runway_readiness');
    assert.ok(runwayReadiness.provider_runtime);
    assert.ok(runwayReadiness.worker_supervisor_liveness);
    assert.equal((runwayReadiness.authority_boundary as JsonRecord).can_write_domain_truth, false);
    assert.equal((runwayReadiness.authority_boundary as JsonRecord).can_authorize_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
