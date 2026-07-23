import {
  agentPackageManifest,
  assert,
  createPluginSourceFixture,
  fs,
  os,
  path,
  pathToFileURL,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { formatJsonPayload, parseJsonText } from '../../../../../src/kernel/json-file.ts';

test('package read models keep lifecycle history compact and page immutable ledger order', (context) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-compact-read-model-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-compact-read-model-home-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-compact-read-model-fixture-'));
  const pluginSourcePath = createPluginSourceFixture();
  const manifestPath = path.join(fixtureDir, 'manifest.json');
  const ledgerPath = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    fs.writeFileSync(
      manifestPath,
      formatJsonPayload(agentPackageManifest({ pluginSourcePath })),
      'utf8',
    );
    const install = runCli([
      'packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], env) as any;
    const installedReceiptRef = install.opl_agent_package_install.package_lock.action_receipt_id;
    const ledger = parseJsonText(fs.readFileSync(ledgerPath, 'utf8')) as any;
    const receiptTemplate = ledger.receipts.find(
      (receipt: any) => receipt.receipt_ref === installedReceiptRef,
    );
    const diagnosticBody = 'x'.repeat(8_192);
    const packageHistory = Array.from({ length: 250 }, (_, index) => ({
      ...receiptTemplate,
      receipt_ref: `opl://agent-package-lifecycle/third.party.research/history-${String(index).padStart(3, '0')}`,
      recorded_at: new Date(Date.UTC(2026, 6, 24, 12, 0, 0) - index * 1_000).toISOString(),
      action: 'repair',
      package_id: 'third.party.research',
      diagnostic_body: `${index}:${diagnosticBody}`,
    }));
    const otherPackageHistory = Array.from({ length: 30 }, (_, index) => ({
      ...receiptTemplate,
      receipt_ref: `opl://agent-package-lifecycle/other.package/history-${String(index).padStart(3, '0')}`,
      recorded_at: new Date(Date.UTC(2026, 6, 23, 12, 0, 0) - index * 1_000).toISOString(),
      action: 'repair',
      package_id: 'other.package',
      diagnostic_body: `${index}:${diagnosticBody}`,
    }));
    ledger.receipts = [...packageHistory, ...otherPackageHistory, ...ledger.receipts];
    fs.writeFileSync(ledgerPath, formatJsonPayload(ledger), 'utf8');
    const ledgerBytesBeforeRead = fs.readFileSync(ledgerPath);

    const status = runCli([
      'packages',
      'status',
      '--package-id',
      'third.party.research',
    ], env) as any;
    const list = runCli(['packages', 'list'], env) as any;
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'lifecycle_receipts'), false);
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'lifecycle_history'), false);
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'lifecycle_receipts'), false);
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'lifecycle_history'), false);

    const packageReceiptCount = ledger.receipts.filter(
      (receipt: any) => receipt.package_id === 'third.party.research',
    ).length;
    const summary = status.opl_agent_package_status.lifecycle_receipt_summary;
    assert.equal(summary.total_count, packageReceiptCount);
    assert.equal(summary.latest_receipt_ref, packageHistory[0].receipt_ref);
    assert.deepEqual(Object.keys(summary.latest_receipt).sort(), [
      'action',
      'action_status',
      'package_id',
      'package_lock_ref',
      'receipt_ref',
      'recorded_at',
      'rollback_ref',
      'writes_performed',
    ]);
    assert.equal(summary.current_receipts[0].receipt_ref, installedReceiptRef);
    assert.equal(summary.current_receipts[0].receipt.action, 'install');
    assert.equal(summary.history_included, false);
    assert.equal(summary.order, 'newest_first_ledger_order');
    assert.match(summary.history_detail_surface, /--include-history/);
    assert.equal(list.opl_agent_packages.lifecycle_receipt_count, ledger.receipts.length);
    assert.equal(
      list.opl_agent_packages.lifecycle_receipt_summary.total_count,
      ledger.receipts.length,
    );

    const compactStatusBytes = Buffer.byteLength(JSON.stringify(status));
    const compactListBytes = Buffer.byteLength(JSON.stringify(list));
    const legacyInlineBytes = Buffer.byteLength(JSON.stringify({
      ...status,
      opl_agent_package_status: {
        ...status.opl_agent_package_status,
        lifecycle_receipts: ledger.receipts.filter(
          (receipt: any) => receipt.package_id === 'third.party.research',
        ),
      },
    }));
    assert.ok(compactStatusBytes < 100_000, `compact status was ${compactStatusBytes} bytes`);
    assert.ok(compactListBytes < 500_000, `compact list was ${compactListBytes} bytes`);
    assert.ok(
      legacyInlineBytes > compactStatusBytes * 10,
      `legacy ${legacyInlineBytes} bytes must exceed compact ${compactStatusBytes} bytes by at least 10x`,
    );
    context.diagnostic(JSON.stringify({
      ledger_bytes: ledgerBytesBeforeRead.byteLength,
      legacy_inline_status_bytes: legacyInlineBytes,
      compact_status_bytes: compactStatusBytes,
      compact_list_bytes: compactListBytes,
      receipt_count: ledger.receipts.length,
    }));
    assert.deepEqual(fs.readFileSync(ledgerPath), ledgerBytesBeforeRead);

    const firstPage = runCli([
      'packages',
      'status',
      '--package-id',
      'third.party.research',
      '--include-history',
      '--limit',
      '17',
    ], env).opl_agent_package_status.lifecycle_history;
    assert.equal(firstPage.total_count, packageReceiptCount);
    assert.equal(firstPage.page_count, 17);
    assert.equal(firstPage.limit, 17);
    assert.equal(firstPage.has_more, true);
    assert.equal(typeof firstPage.next_cursor, 'string');
    assert.deepEqual(
      firstPage.receipts.map((receipt: any) => receipt.receipt_ref),
      packageHistory.slice(0, 17).map((receipt) => receipt.receipt_ref),
    );
    const historyStatus = runCli([
      'packages',
      'status',
      '--package-id',
      'third.party.research',
      '--include-history',
      '--limit',
      '1',
    ], env);
    assert.equal(
      historyStatus.opl_agent_package_status.lifecycle_receipt_summary.history_included,
      true,
    );

    const prependedReceipt = {
      ...receiptTemplate,
      receipt_ref: 'opl://agent-package-lifecycle/third.party.research/history-new',
      recorded_at: '2026-07-24T13:00:00.000Z',
      action: 'repair',
      package_id: 'third.party.research',
      diagnostic_body: diagnosticBody,
    };
    ledger.receipts.unshift(prependedReceipt);
    fs.writeFileSync(ledgerPath, formatJsonPayload(ledger), 'utf8');
    const ledgerBytesBeforeContinuation = fs.readFileSync(ledgerPath);
    const secondPage = runCli([
      'packages',
      'status',
      '--package-id',
      'third.party.research',
      '--include-history',
      '--cursor',
      firstPage.next_cursor,
      '--limit',
      '17',
    ], env).opl_agent_package_status.lifecycle_history;
    assert.deepEqual(
      secondPage.receipts.map((receipt: any) => receipt.receipt_ref),
      packageHistory.slice(17, 34).map((receipt) => receipt.receipt_ref),
    );
    assert.equal(
      new Set([
        ...firstPage.receipts.map((receipt: any) => receipt.receipt_ref),
        ...secondPage.receipts.map((receipt: any) => receipt.receipt_ref),
      ]).size,
      34,
    );
    assert.deepEqual(fs.readFileSync(ledgerPath), ledgerBytesBeforeContinuation);

    const missingOptIn = runCliFailure([
      'packages',
      'status',
      '--limit',
      '10',
    ], env);
    assert.match(missingOptIn.payload.error.message, /requires --include-history/);
    const excessiveLimit = runCliFailure([
      'packages',
      'status',
      '--include-history',
      '--limit',
      '101',
    ], env);
    assert.match(excessiveLimit.payload.error.message, /limit|100/i);
    const mismatchedFilter = runCliFailure([
      'packages',
      'status',
      '--include-history',
      '--cursor',
      firstPage.next_cursor,
    ], env);
    assert.equal(
      mismatchedFilter.payload.error.details.failure_code,
      'agent_package_lifecycle_history_cursor_invalid',
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});
