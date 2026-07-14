import {
  assert,
  FrameworkContractError,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import { runCodexConfigHygiene } from '../../../../src/modules/connect/system-installation/codex-config-hygiene.ts';

test('system codex-config-hygiene reconciles only stale temp and global MAS tables with exact rollback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-config-hygiene-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(root, 'state');
  const configPath = path.join(codexHome, 'config.toml');
  const masWorkspaceConfig = path.join(root, 'med-autoscience', '.codex', 'config.toml');
  const validMarketplace = path.join(root, 'valid-marketplace');
  const staleMarketplace = path.join(
    root,
    'cache',
    'opl-package-mas-source-state-yylMYM',
    'codex-plugin-marketplaces',
    'opl-agent-mas-local',
  );
  const staleFixtureMarketplace = path.join(
    root,
    'cache',
    'opl-package-mas-source-state-WzinK7',
    'codex-plugin-marketplaces',
    'opl-agent-fixture.mas-local',
  );
  const liveOplMarketplace = path.join(
    root,
    'cache',
    'opl-package-rca-source-state-live',
    'codex-plugin-marketplaces',
    'opl-agent-rca-local',
  );
  const unrelatedMissingMarketplace = path.join(
    root,
    'cache',
    'opl-package-mas-source-state-unrelated',
    'codex-plugin-marketplaces',
    'third-party-research-local',
  );
  const globalMasCarrier = path.join(root, 'global-mas-carrier');
  const env = { HOME: home, CODEX_HOME: codexHome, OPL_STATE_DIR: stateDir };
  const originalConfig = [
    'model = "gpt-5.6-sol"',
    '',
    '[marketplaces.opl-agent-mas-local]',
    'source_type = "local"',
    `source = "${staleMarketplace}"`,
    '',
    '[plugins."third-party-research@opl-agent-mas-local"]',
    'enabled = true',
    '',
    '[marketplaces.opl-agent-fixture.mas-local]',
    'source_type = "local"',
    `source = "${staleFixtureMarketplace}"`,
    '',
    '[plugins."fixture-mas@opl-agent-fixture.mas-local"]',
    'enabled = true',
    '',
    '[marketplaces.opl-agent-rca-local]',
    'source_type = "local"',
    `source = "${liveOplMarketplace}"`,
    '',
    '[plugins."rca@opl-agent-rca-local"]',
    'enabled = true',
    '',
    '[marketplaces.third-party-research-local]',
    'source_type = "local"',
    `source = "${unrelatedMissingMarketplace}"`,
    '',
    '[plugins."third-party-research@third-party-research-local"]',
    'enabled = true',
    '',
    '[marketplaces.opl-agent-third.party.research-local]',
    'source_type = "local"',
    `source = "${validMarketplace}"`,
    '',
    '[plugins."third-party-research@opl-agent-third.party.research-local"]',
    'enabled = true',
    '',
    '[marketplaces.mas-scholar-skills-local]',
    'source_type = "local"',
    `source = "${globalMasCarrier}"`,
    '',
    '[plugins."mas-scholar-skills@mas-scholar-skills-local"]',
    'enabled = true',
    '',
    '[marketplaces.ponytail]',
    'source_type = "local"',
    'source = "/tmp/ponytail"',
    '',
    '[plugins."ponytail@ponytail"]',
    'enabled = true',
    '',
  ].join('\n');
  const workspaceConfig = '[plugins."mas-scholar-skills@mas-workspace-local"]\nenabled = true\n';

  try {
    fs.mkdirSync(validMarketplace, { recursive: true });
    fs.mkdirSync(liveOplMarketplace, { recursive: true });
    fs.mkdirSync(globalMasCarrier, { recursive: true });
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, originalConfig, 'utf8');
    fs.mkdirSync(path.dirname(masWorkspaceConfig), { recursive: true });
    fs.writeFileSync(masWorkspaceConfig, workspaceConfig, 'utf8');
    const globalMasMarker = path.join(globalMasCarrier, 'do-not-delete.txt');
    fs.writeFileSync(globalMasMarker, 'physical carrier stays user-owned\n', 'utf8');

    const preview = runCli(['system', 'codex-config-hygiene', '--dry-run'], env).codex_config_hygiene;
    assert.equal(preview.status, 'validated_no_write');
    assert.equal(preview.receipt.writes_performed, false);
    assert.deepEqual(
      preview.receipt.removed_tables.map((entry: any) => entry.header).sort(),
      [
        'marketplaces.mas-scholar-skills-local',
        'marketplaces.opl-agent-fixture.mas-local',
        'marketplaces.opl-agent-mas-local',
        'plugins.fixture-mas@opl-agent-fixture.mas-local',
        'plugins.mas-scholar-skills@mas-scholar-skills-local',
        'plugins.third-party-research@opl-agent-mas-local',
      ],
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), originalConfig);
    assert.equal(fs.existsSync(stateDir), false);

    const applied = runCli(['system', 'codex-config-hygiene'], env).codex_config_hygiene;
    assert.equal(applied.status, 'completed');
    assert.equal(applied.receipt.writes_performed, true);
    assert.equal(applied.receipt.workspace_local_mas_discovery_preserved, true);
    assert.equal(fs.existsSync(applied.receipt.backup_path), true);
    assert.equal(fs.existsSync(applied.receipt.delta_path), true);
    assert.equal(fs.existsSync(applied.receipt_path), true);
    assert.equal(fs.statSync(applied.receipt.backup_path).mode & 0o777, 0o600);
    const transactionRoot = path.dirname(applied.receipt.backup_path);
    assert.equal(applied.receipt.delta_path, path.join(transactionRoot, 'toml-delta.json'));
    assert.equal(
      path.basename(applied.receipt_path, '.json'),
      path.basename(transactionRoot),
    );
    const reconciledConfig = fs.readFileSync(configPath, 'utf8');
    assert.doesNotMatch(reconciledConfig, /opl-agent-mas-local/);
    assert.doesNotMatch(reconciledConfig, /mas-scholar-skills-local/);
    assert.match(reconciledConfig, /opl-agent-third\.party\.research-local/);
    assert.match(reconciledConfig, /opl-agent-rca-local/);
    assert.match(reconciledConfig, /third-party-research@third-party-research-local/);
    assert.match(reconciledConfig, /ponytail@ponytail/);
    assert.equal(fs.readFileSync(masWorkspaceConfig, 'utf8'), workspaceConfig);
    assert.equal(fs.readFileSync(globalMasMarker, 'utf8'), 'physical carrier stays user-owned\n');

    const receiptBytes = fs.readFileSync(applied.receipt_path, 'utf8');
    const receiptPayload = JSON.parse(receiptBytes);
    const otherTransaction = path.join(stateDir, 'codex-config-hygiene', 'transactions', 'other');
    fs.mkdirSync(otherTransaction, { recursive: true });
    receiptPayload.backup_path = path.join(otherTransaction, 'config.toml.before');
    fs.writeFileSync(applied.receipt_path, `${JSON.stringify(receiptPayload, null, 2)}\n`, 'utf8');
    let mismatched = runCliFailure([
      'system', 'codex-config-hygiene', '--rollback-receipt', applied.receipt_path,
    ], env);
    assert.equal(
      mismatched.payload.error.details.failure_code,
      'codex_config_hygiene_backup_outside_transaction',
    );
    receiptPayload.backup_path = applied.receipt.backup_path;
    receiptPayload.delta_path = path.join(otherTransaction, 'toml-delta.json');
    fs.writeFileSync(applied.receipt_path, `${JSON.stringify(receiptPayload, null, 2)}\n`, 'utf8');
    mismatched = runCliFailure([
      'system', 'codex-config-hygiene', '--rollback-receipt', applied.receipt_path,
    ], env);
    assert.equal(
      mismatched.payload.error.details.failure_code,
      'codex_config_hygiene_delta_outside_transaction',
    );
    fs.writeFileSync(applied.receipt_path, receiptBytes, 'utf8');

    fs.appendFileSync(configPath, '\n# local edit after hygiene\n', 'utf8');
    const conflict = runCliFailure([
      'system', 'codex-config-hygiene', '--rollback-receipt', applied.receipt_path,
    ], env);
    assert.equal(conflict.payload.error.details.failure_code, 'codex_config_hygiene_rollback_conflict');
    fs.writeFileSync(configPath, reconciledConfig, 'utf8');

    const rolledBack = runCli([
      'system', 'codex-config-hygiene', '--rollback-receipt', applied.receipt_path,
    ], env).codex_config_hygiene;
    assert.equal(rolledBack.status, 'rolled_back');
    assert.equal(rolledBack.receipt.restored_receipt_ref, applied.receipt.receipt_ref);
    assert.equal(fs.readFileSync(configPath, 'utf8'), originalConfig);
    assert.equal(fs.readFileSync(masWorkspaceConfig, 'utf8'), workspaceConfig);
    assert.equal(fs.readFileSync(globalMasMarker, 'utf8'), 'physical carrier stays user-owned\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('system codex-config-hygiene apply fails closed when config changes before replace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-config-hygiene-cas-'));
  const stateDir = path.join(root, 'state');
  const configPath = path.join(root, 'config.toml');
  const missingSource = path.join(root, 'opl-repo-temp-missing');
  const originalConfig = [
    '[marketplaces.opl-agent-temp-local]',
    'source_type = "local"',
    `source = "${missingSource}"`,
    '',
    '[plugins."example@opl-agent-temp-local"]',
    'enabled = true',
    '',
  ].join('\n');
  const concurrentConfig = `${originalConfig}# concurrent user edit\n`;

  try {
    fs.writeFileSync(configPath, originalConfig, 'utf8');
    assert.throws(
      () => runCodexConfigHygiene({}, {
        configPath,
        stateDir,
        beforeConfigReplace: () => fs.writeFileSync(configPath, concurrentConfig, 'utf8'),
      }),
      (error) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.details?.failure_code, 'codex_config_hygiene_apply_conflict');
        return true;
      },
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), concurrentConfig);
    const transactionDir = path.join(stateDir, 'codex-config-hygiene', 'transactions');
    assert.deepEqual(fs.existsSync(transactionDir) ? fs.readdirSync(transactionDir) : [], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('system codex-config-hygiene rejects mixed modes and receipts outside Framework state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-config-hygiene-guards-'));
  const env = {
    HOME: path.join(root, 'home'),
    CODEX_HOME: path.join(root, 'home', '.codex'),
    OPL_STATE_DIR: path.join(root, 'state'),
  };
  try {
    const mixed = runCliFailure([
      'system', 'codex-config-hygiene', '--dry-run', '--rollback-receipt', path.join(root, 'receipt.json'),
    ], env);
    assert.equal(mixed.payload.error.code, 'cli_usage_error');
    const outside = runCliFailure([
      'system', 'codex-config-hygiene', '--rollback-receipt', path.join(root, 'receipt.json'),
    ], env);
    assert.equal(outside.payload.error.details.failure_code, 'codex_config_hygiene_receipt_outside_state');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
