import {
  assert,
  fs,
  os,
  path,
  repoRoot,
  runCliReadOnlyFailureInCwd,
  runCliReadOnlyInCwd,
  test,
} from '../helpers.ts';

test('read-only CLI invocations serialize concurrent cwd/env changes and restore process state', async () => {
  const invalidCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-read-only-cli-invalid-cwd-'));
  const originalCwd = process.cwd();
  const originalSentinel = process.env.OPL_READ_ONLY_CLI_TEST_SENTINEL;
  process.env.OPL_READ_ONLY_CLI_TEST_SENTINEL = 'parent';

  try {
    const [success, failure] = await Promise.all([
      runCliReadOnlyInCwd(
        ['--contracts-dir', 'contracts/opl-framework', 'contract', 'validate'],
        repoRoot,
        { OPL_READ_ONLY_CLI_TEST_SENTINEL: 'success' },
      ),
      runCliReadOnlyFailureInCwd(
        ['--contracts-dir', 'contracts/opl-framework', 'contract', 'validate'],
        invalidCwd,
        { OPL_READ_ONLY_CLI_TEST_SENTINEL: 'failure' },
      ),
    ]);

    assert.equal(success.validation.status, 'valid');
    assert.equal(failure.status, 3);
    assert.equal(failure.payload.error.code, 'contract_file_missing');
    assert.equal(process.cwd(), originalCwd);
    assert.equal(process.env.OPL_READ_ONLY_CLI_TEST_SENTINEL, 'parent');
  } finally {
    if (originalSentinel === undefined) {
      delete process.env.OPL_READ_ONLY_CLI_TEST_SENTINEL;
    } else {
      process.env.OPL_READ_ONLY_CLI_TEST_SENTINEL = originalSentinel;
    }
    process.chdir(originalCwd);
    fs.rmSync(invalidCwd, { recursive: true, force: true });
  }
});
