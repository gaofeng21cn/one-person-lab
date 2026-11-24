import {
  assert,
  createFamilyWorkspaceFixture,
  fs,
  os,
  path,
  removeFixtureTree,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('framework readiness rejects non-default invocation to avoid a second truth surface', () => {
  const failure = runCliFailure(['framework', 'readiness']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework readiness exposes command-scoped help', () => {
  const scoped = runCli(['help', 'framework', 'readiness']);
  assert.equal(scoped.help.command, 'framework readiness');
  assert.match(scoped.help.usage, /framework readiness --family-defaults/);
});

test('framework readiness compact consumes Atlas-owned family repo inputs', () => {
  // The command discovers family Agent repos through OPL_FAMILY_WORKSPACE_ROOT or
  // sibling directories, so a machine without those checkouts reports a usage
  // error. Give it the registered Agent directories it declares.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-readiness-'));
  try {
    const readback = runCli([
      'framework',
      'readiness',
      '--family-defaults',
      '--detail',
      'compact',
    ], { OPL_FAMILY_WORKSPACE_ROOT: createFamilyWorkspaceFixture(root) }).framework_readiness_compact;

    assert.equal(readback.surface_kind, 'opl_framework_readiness_compact_readback');
    assert.equal(readback.authority_boundary.can_claim_production_ready, false);
  } finally {
    removeFixtureTree(root);
  }
});

test('framework operating maturity exposes command-scoped help', () => {
  const scoped = runCli(['help', 'framework', 'operating-maturity']);
  assert.equal(scoped.help.command, 'framework operating-maturity');
  assert.match(scoped.help.usage, /framework operating-maturity --family-defaults/);
});

test('framework production closeout command is retired in favor of operating maturity', () => {
  const failure = runCliFailure(['framework', 'production-closeout']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /has been retired/);
  assert.equal(failure.payload.error.details.command, 'opl framework production-closeout');
  assert.equal(
    failure.payload.error.details.replacement,
    'opl framework operating-maturity --family-defaults --json',
  );
  assert.equal(failure.payload.error.details.retired, true);
});
