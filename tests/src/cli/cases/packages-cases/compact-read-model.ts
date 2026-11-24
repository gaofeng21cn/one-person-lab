import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';

test('package read models stay compact without exposing lifecycle history', (context) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-compact-read-model-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-compact-read-model-home-'));
  const ledgerPath = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    const install = runCliFailure([
      'packages',
      'install',
      'third.party.research',
      '--manifest-url=file:///retired/manifest.json',
    ], env);
    assert.equal(install.payload.error.code, 'cli_usage_error');
    assert.match(install.payload.error.message, /manifest-url/);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(ledgerPath), false);

    const status = runCli([
      'packages',
      'status',
      '--package-id',
      'third.party.research',
    ], env) as any;
    const list = runCli(['packages', 'list'], env) as any;
    const fullList = runCli(['packages', 'list', '--detail', 'full'], env) as any;
    for (const retiredSummaryField of [
      'conditions',
      'recommended_action',
      'lifecycle_action_refs',
      'lifecycle_ux',
    ]) {
      assert.equal(Object.hasOwn(status.opl_agent_package_status, retiredSummaryField), false);
      assert.equal(Object.hasOwn(list.opl_agent_packages, retiredSummaryField), false);
    }
    const directoryEntry = list.opl_agent_packages.directory.entries.find(
      (entry: { package_id?: string }) => entry.package_id === 'third.party.research',
    );
    assert.equal(directoryEntry, undefined);
    const fullDirectoryEntry = fullList.opl_agent_packages.directory.entries.find(
      (entry: { package_id?: string }) => entry.package_id === 'third.party.research',
    );
    assert.equal(fullDirectoryEntry, undefined);
    assert.equal(status.opl_agent_package_status.status, 'not_installed');
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'lifecycle_receipts'), false);
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'lifecycle_history'), false);
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'lifecycle_receipt_summary'), false);
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'lifecycle_receipts'), false);
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'lifecycle_history'), false);
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'lifecycle_receipt_count'), false);
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'lifecycle_receipt_summary'), false);

    const compactStatusBytes = Buffer.byteLength(JSON.stringify(status));
    const compactListBytes = Buffer.byteLength(JSON.stringify(list));
    assert.ok(compactStatusBytes < 100_000, `compact status was ${compactStatusBytes} bytes`);
    assert.ok(compactListBytes < 500_000, `compact list was ${compactListBytes} bytes`);
    context.diagnostic(JSON.stringify({
      compact_status_bytes: compactStatusBytes,
      compact_list_bytes: compactListBytes,
      persistent_lifecycle_receipt_ledger: false,
    }));
    for (const retiredArgs of [
      ['--include-history'],
      ['--cursor', 'retired'],
      ['--limit', '10'],
    ]) {
      const failure = runCliFailure([
        'packages',
        'status',
        ...retiredArgs,
      ], env);
      assert.equal(failure.payload.error.code, 'cli_usage_error');
      assert.match(failure.payload.error.message, new RegExp(retiredArgs[0].slice(2)));
    }
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});
