import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

test('update apply delegates Workflow Profile optimization to the OPL Flow package lifecycle', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-workflow-profile-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'workflow_profile'], {
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
          auto_apply: {
            mode: string;
            eligible: boolean;
            app_background_safe: boolean;
            command_ref: string | null;
            blocked_reasons: string[];
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
    assert.equal(output.managed_update.requested_component_id, 'workflow_profile');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'workflow_profile');
    assert.equal(output.managed_update.components[0].auto_apply.mode, 'controlled_apply');
    assert.equal(output.managed_update.components[0].auto_apply.eligible, false);
    assert.equal(output.managed_update.components[0].auto_apply.app_background_safe, false);
    assert.equal(output.managed_update.components[0].auto_apply.command_ref, 'opl packages optimize opl-flow --json');
    assert.equal(
      output.managed_update.components[0].auto_apply.blocked_reasons.includes(
        'explicit_opl_flow_or_app_update_required',
      ),
      true,
    );
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
