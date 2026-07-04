import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

test('update apply does not execute companion tools through the managed update kernel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-companion-tools-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'companion_tools'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        operation_mode: string;
        requested_component_id: string;
        summary: { execution_status: string };
        components: Array<{
          component_id: string;
          owner_execution_boundary: {
            owner_executor_id: string;
            runner_can_execute: boolean;
            allowed_operations: string[];
          };
        }>;
        execution: {
          status: string;
          adapter_results: unknown[];
          receipt_record: { receipts: unknown[] };
        };
      };
    };

    assert.equal(output.managed_update.operation, 'apply');
    assert.equal(output.managed_update.operation_mode, 'controlled_apply');
    assert.equal(output.managed_update.requested_component_id, 'companion_tools');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'companion_tools');
    assert.equal(output.managed_update.components[0].owner_execution_boundary.owner_executor_id, 'companion_skill_route');
    assert.equal(output.managed_update.components[0].owner_execution_boundary.runner_can_execute, false);
    assert.deepEqual(output.managed_update.components[0].owner_execution_boundary.allowed_operations, []);
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
