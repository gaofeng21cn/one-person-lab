import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-run-'));
  fs.mkdirSync(path.join(root, 'contracts', 'runtime-program'), { recursive: true });
  fs.mkdirSync(path.join(root, 'python', 'fixture'), { recursive: true });
  fs.writeFileSync(path.join(root, 'python', 'fixture', '__init__.py'), '');
  fs.writeFileSync(path.join(root, 'python', 'fixture', 'helper.py'), [
    'import json, sys',
    'print(json.dumps({"argv": sys.argv[1:]}))',
  ].join('\n'));
  const catalog = path.join(root, 'contracts', 'runtime-program', 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify({
    package: { source_root: 'python' },
    helpers: [{ helper_id: 'fixture_helper', package_module: 'fixture.helper' }],
  }));
  const request = path.join(root, 'request.json');
  fs.writeFileSync(request, JSON.stringify({ args: ['--output', 'result.json'], timeout_seconds: 5 }));
  return { root, catalog, request };
}

test('pack native-helper run executes a catalog-declared Python module with no authority', () => {
  const value = fixture();
  try {
    const receipt = runCli([
      'pack', 'native-helper', 'run',
      '--catalog', value.catalog,
      '--helper', 'fixture_helper',
      '--request', value.request,
    ]).pack_native_helper_execution_receipt;
    assert.equal(receipt.surface_kind, 'opl_pack_native_helper_execution_receipt');
    assert.equal(receipt.status, 'executed');
    assert.deepEqual(receipt.payload.argv, ['--output', 'result.json']);
    assert.equal(receipt.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(receipt.authority_boundary.can_authorize_export_readiness, false);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper run fails closed for unknown helpers and invalid modules', () => {
  const value = fixture();
  try {
    assert.equal(runCliFailure([
      'pack', 'native-helper', 'run', '--catalog', value.catalog, '--helper', 'missing', '--request', value.request,
    ]).payload.error.code, 'surface_not_found');
    const catalog = JSON.parse(fs.readFileSync(value.catalog, 'utf8'));
    catalog.helpers[0].package_module = '../escape';
    fs.writeFileSync(value.catalog, JSON.stringify(catalog));
    assert.equal(runCliFailure([
      'pack', 'native-helper', 'run', '--catalog', value.catalog, '--helper', 'fixture_helper', '--request', value.request,
    ]).payload.error.code, 'contract_shape_invalid');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper run rejects source-root symlink escape and non-JSON stdout', () => {
  const value = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-outside-'));
  try {
    fs.rmSync(path.join(value.root, 'python'), { recursive: true });
    fs.symlinkSync(outside, path.join(value.root, 'python'));
    assert.equal(runCliFailure([
      'pack', 'native-helper', 'run', '--catalog', value.catalog, '--helper', 'fixture_helper', '--request', value.request,
    ]).payload.error.code, 'contract_shape_invalid');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('pack native-helper run fails closed on non-JSON output, nonzero exit, and timeout', () => {
  const value = fixture();
  const helperPath = path.join(value.root, 'python', 'fixture', 'helper.py');
  try {
    for (const [body, expectedCode, request] of [
      ['print("not-json")', 'contract_json_invalid', { args: [] }],
      ['raise SystemExit(7)', 'launcher_failed', { args: [] }],
      ['import time; time.sleep(30)', 'launcher_failed', { args: [], timeout_seconds: 0.05 }],
    ] as const) {
      fs.writeFileSync(helperPath, body);
      fs.writeFileSync(value.request, JSON.stringify(request));
      assert.equal(runCliFailure([
        'pack', 'native-helper', 'run', '--catalog', value.catalog, '--helper', 'fixture_helper', '--request', value.request,
      ]).payload.error.code, expectedCode);
    }
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper run rejects ambiguous argv and duplicate CLI flags', () => {
  const value = fixture();
  try {
    fs.writeFileSync(value.request, JSON.stringify({ args: [], argv: [] }));
    assert.equal(runCliFailure([
      'pack', 'native-helper', 'run', '--catalog', value.catalog, '--helper', 'fixture_helper', '--request', value.request,
    ]).payload.error.code, 'contract_shape_invalid');
    assert.equal(runCliFailure([
      'pack', 'native-helper', 'run', '--catalog', value.catalog, '--catalog', value.catalog,
      '--helper', 'fixture_helper', '--request', value.request,
    ]).payload.error.code, 'cli_usage_error');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper run is discoverable under Pack help', () => {
  const help = runCli(['pack', 'native-helper']).help;
  assert.equal(help.subcommands.some((entry: { command: string }) => entry.command === 'pack native-helper run'), true);
});
