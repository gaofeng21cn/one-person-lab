import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

test('update apply does not execute the projection-only Installation Carrier component', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-installation-carrier-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'installation_carrier'], {
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
          current: { managed_kernel_apply_allowed: boolean };
          authority_boundary: Record<string, boolean>;
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
    assert.equal(output.managed_update.requested_component_id, 'installation_carrier');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    const component = output.managed_update.components[0];
    assert.equal(component.component_id, 'installation_carrier');
    assert.equal(component.auto_apply.mode, 'projection_only');
    assert.equal(component.auto_apply.eligible, false);
    assert.equal(component.auto_apply.app_background_safe, false);
    assert.equal(component.auto_apply.command_ref, null);
    assert.equal(
      component.auto_apply.blocked_reasons.includes('installation_carrier_requires_carrier_specific_host_update_route'),
      true,
    );
    assert.equal(component.current.managed_kernel_apply_allowed, false);
    assert.equal(component.authority_boundary.can_replace_docker_webui_image, false);
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update apply does not execute the projection-only Codex Surface component', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-codex-surface-apply-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'apply', '--component', 'codex_surface'], {
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
          auto_apply: { mode: string; eligible: boolean; app_background_safe: boolean; command_ref: string | null };
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
    assert.equal(output.managed_update.requested_component_id, 'codex_surface');
    assert.equal(output.managed_update.summary.execution_status, 'skipped');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'codex_surface');
    assert.equal(output.managed_update.components[0].auto_apply.mode, 'projection_only');
    assert.equal(output.managed_update.components[0].auto_apply.eligible, false);
    assert.equal(output.managed_update.components[0].auto_apply.app_background_safe, false);
    assert.equal(output.managed_update.components[0].auto_apply.command_ref, null);
    assert.deepEqual(output.managed_update.execution.adapter_results, []);
    assert.deepEqual(output.managed_update.execution.receipt_record.receipts, []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
