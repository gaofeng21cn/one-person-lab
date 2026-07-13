import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';

test('update apply repair and rollback expose controlled runtime maintenance execution boundaries', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-operations-'));
  const runtimeBin = path.join(homeRoot, 'runtime', 'current', 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeBin = path.join(homeRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(homeRoot, 'npm.log');
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(runtimeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.130.0"\n', { mode: 0o755 });
  fs.writeFileSync(runtimeRg, '#!/usr/bin/env bash\necho "rg old"\n', { mode: 0o755 });
  fs.writeFileSync(
    fakeNpm,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'for arg in "$@"; do',
      '  if [[ "$arg" == "-g" ]]; then',
      '    echo "global npm mutation is forbidden in this fixture" >&2',
      '    exit 23',
      '  fi',
      'done',
      `printf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}`,
      'if [[ "$1" == "install" && "$2" == "--prefix" ]]; then',
      '  prefix="$3"',
      '  package_root="$prefix/node_modules/@openai/codex"',
      '  vendor_root="$prefix/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin"',
      '  mkdir -p "$package_root"',
      '  mkdir -p "$vendor_root/bin" "$vendor_root/codex-path"',
      '  printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "codex-cli 0.134.0"\' > "$vendor_root/bin/codex"',
      '  printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "rg staged"\' > "$vendor_root/codex-path/rg"',
      '  chmod +x "$vendor_root/bin/codex" "$vendor_root/codex-path/rg"',
      '  echo "installed staged @openai/codex@latest"',
      '  exit 0',
      'fi',
      'echo "Unexpected npm command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    for (const operation of ['apply', 'repair', 'rollback'] as const) {
      const output = runCli(['update', operation], {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_STATE_DIR: path.join(homeRoot, 'state'),
        OPL_RUNTIME_ROOT: path.join(homeRoot, 'runtime'),
        OPL_CODEX_BIN: runtimeCodex,
        OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
        OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
        OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
        PATH: `${fakeBin}${path.delimiter}${codexFixture.fixtureRoot}${path.delimiter}/usr/bin:/bin`,
      }) as {
        managed_update: {
          operation: string;
          operation_mode: string;
          execution: {
            status: string;
            adapter_results: Array<{
              component_id: string;
              status: string;
              reason: string;
              result_ref: string | null;
              result: {
                action: string;
                receipt_ref: string | null;
                repair_action: string | null;
                rollback_ref: string | null;
              };
            }>;
          };
          authority_boundary: Record<string, boolean>;
          receipts: { write_policy: string };
          components: Array<{
            component_id: string;
            authority_boundary: Record<string, boolean>;
            plan: { command_refs: Array<{ mode: string; destructive: boolean }> };
          }>;
        };
      };

      assert.equal(output.managed_update.operation, operation);
      assert.equal(output.managed_update.operation_mode, `controlled_${operation}`);
      assert.equal(output.managed_update.execution.adapter_results[0].component_id, 'opl_base');
      assert.equal(output.managed_update.execution.adapter_results[0].reason, 'startup_maintenance_runtime_substrate_adapter');
      assert.equal(output.managed_update.execution.adapter_results[0].result.action, operation);
      assert.match(output.managed_update.execution.adapter_results[0].result_ref ?? '', /^opl:\/\/managed-update-adapter\/runtime_substrate\//);
      assert.match(output.managed_update.execution.adapter_results[0].result.receipt_ref ?? '', /^opl:\/\/managed-update-adapter\/runtime_substrate\//);
      assert.equal(
        output.managed_update.execution.adapter_results[0].result.repair_action,
        operation === 'rollback'
          ? 'restart_app_with_previous_runtime_pointer_or_run_startup_maintenance'
          : 'run_startup_maintenance',
      );
      assert.match(
        output.managed_update.execution.adapter_results[0].result.rollback_ref ?? '',
        /^opl:\/\/managed-update\/runtime_substrate\/rollback\//,
      );
      assert.equal(['completed', 'skipped', 'manual_required'].includes(output.managed_update.execution.status), true);
      assert.equal(output.managed_update.authority_boundary.can_mutate_app_owned_runtime_root, true);
      assert.equal(output.managed_update.authority_boundary.can_silently_update_clean_managed_modules, false);
      assert.equal(output.managed_update.authority_boundary.can_sync_codex_plugin_skill_projection, false);
      assert.equal(output.managed_update.authority_boundary.can_mutate_user_global_npm, false);
      assert.equal(output.managed_update.receipts.write_policy, 'recorded_component_receipt');
      assert.equal(output.managed_update.components.length, 1);
      assert.equal(output.managed_update.components[0].component_id, 'opl_base');
      assert.equal(output.managed_update.components[0].authority_boundary.can_mutate_app_owned_runtime_root, true);
      assert.equal(
        output.managed_update.components[0].plan.command_refs.every((entry) => entry.destructive === false),
        true,
      );
    }
    assert.doesNotMatch(fs.readFileSync(npmLog, 'utf8'), / -g( |$)/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
