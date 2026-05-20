import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('family-runtime production-closeout summarizes OPL-owned safe-action closure without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-production-closeout-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const output = runCli([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const closeout = output.family_runtime_production_closeout;

    assert.equal(closeout.surface_kind, 'opl_family_runtime_production_closeout');
    assert.equal(closeout.surface_role, 'derived_operator_attention_lens');
    assert.equal(closeout.closeout_mode, 'dry_run_summary');
    assert.equal(closeout.family_defaults, true);
    assert.equal(closeout.selected_provider, 'temporal');
    assert.equal(closeout.effective_provider, 'temporal');
    assert.equal(closeout.selected_executor_kind, 'codex_cli');
    assert.equal(closeout.summary.domain_ready_authorized, false);
    assert.equal(closeout.summary.production_ready_authorized, false);
    assert.equal(closeout.summary.closeout_item_count >= 1, true);
    assert.equal(closeout.attention_queue.length >= 1, true);

    const stageItem = closeout.closeout_items.find(
      (item: { claim_scope: string }) => item.claim_scope === 'stage_production_caller_request',
    ) ?? closeout.closeout_items[0];
    assert.equal(stageItem.owner, 'opl');
    assert.equal(stageItem.receipt_ref, null);
    assert.equal(stageItem.typed_blocker_ref, null);
    assert.equal(stageItem.not_authorized_claims.includes('domain_ready'), true);
    assert.equal(stageItem.not_authorized_claims.includes('quality_verdict'), true);
    assert.equal(closeout.authority_boundary.can_write_domain_truth, false);
    assert.equal(closeout.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime production-closeout rejects non-production provider fallback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-production-closeout-provider-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const failure = runCliFailure([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'local_sqlite',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /supports only --provider temporal/);
    assert.equal(failure.payload.error.details.provider_kind, 'local_sqlite');
    assert.deepEqual(failure.payload.error.details.allowed_provider_kinds, ['temporal']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
