import { assert, createCodexConfigFixture, createFakeCodexFixture, fs, os, path, runCli, runCliAsync, test } from './shared.ts';
import { writeNativeHelperFixtureScripts } from '../native-helper-fixtures.ts';

test('opl install keeps retired gateway repair out of the default Codex install path', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-retired-gateway-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const codexConfigFixture = createCodexConfigFixture({
    apiKey: 'codex-opl-key',
  });
  const nativeHelperBinDir = path.join(homeRoot, 'native-bin');
  writeNativeHelperFixtureScripts(nativeHelperBinDir, { includeVersionFields: true });
  const retiredGatewayState = path.join(homeRoot, 'retired-gateway-ready');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = await runCliAsync(
      ['install', '--headless', '--skip-modules'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        OPL_WORKSPACE_ROOT: homeRoot,
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
        OPL_NATIVE_HELPER_BIN_DIR: nativeHelperBinDir,
        OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      },
    ) as {
      install: {
        runtime_manager_action: {
          status: string;
        non_blocking_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
        background_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
          executed_actions: Array<{
            action_id: string;
            status: string;
            blocking: boolean;
            action_lane: string;
            capability: string;
          }>;
          after: {
            reconcile: {
              checked_surfaces: {
                provider_runtime: string;
              };
            };
          };
        };
        system_initialize: {
          family_runtime_provider: {
            status: string;
            blocking: boolean;
            full_readiness_blocking: boolean;
            ready: boolean;
          };
          core_engines: {
            [key: string]: unknown;
          };
        };
        background_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
        non_blocking_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
        first_run_log_events: Array<{
          event_type: string;
          payload: Record<string, unknown>;
        }>;
      };
    };

    assert.equal(fs.existsSync(retiredGatewayState), false);
    assert.equal(output.install.runtime_manager_action.status, 'completed_with_attention');
    assert.deepEqual(output.install.runtime_manager_action.executed_actions.map((action) => [
      action.action_id,
      action.status,
      action.blocking,
    ]), [
      ['configure_temporal_provider', 'blocked_manual_configuration_required', true],
      ['refresh_native_indexes', 'completed', false],
    ]);
    for (const actions of [
      output.install.runtime_manager_action.non_blocking_actions,
      output.install.runtime_manager_action.background_actions,
      output.install.non_blocking_actions,
      output.install.background_actions,
    ]) {
      assert.deepEqual(actions.map((action) => [action.action_id, action.status]), [
        ['refresh_native_indexes', 'completed'],
      ]);
    }
    assert.equal(
      output.install.runtime_manager_action.after.reconcile.checked_surfaces.provider_runtime,
      'provider_code_landed_unconfigured',
    );
    assert.equal(Object.hasOwn(output.install.runtime_manager_action.after.reconcile.checked_surfaces, 'hermes_diagnostics'), false);
    assert.equal(Object.hasOwn(output.install.system_initialize.core_engines, 'hermes'), false);
    assert.equal(Object.hasOwn(output.install.system_initialize, 'online_management'), false);
    assert.equal(output.install.system_initialize.family_runtime_provider.status, 'initializing');
    assert.equal(output.install.system_initialize.family_runtime_provider.blocking, true);
    assert.equal(output.install.system_initialize.family_runtime_provider.full_readiness_blocking, true);
    assert.equal(output.install.system_initialize.family_runtime_provider.ready, false);
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'online_management_repair_started'
      ),
      false,
    );
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'online_management_repair_completed'
      ),
      false,
    );
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'family_runtime_provider_repair_started'
      ),
      false,
    );
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'family_runtime_provider_repair_completed'
      ),
      false,
    );
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'runtime_manager_repair_completed'
        && entry.payload.status === 'completed_with_attention'
      ),
      true,
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize exposes first-run blocker metadata and actionable payload hints', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-first-run-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        PATH: '/usr/bin:/bin',
      },
    ) as {
      system_initialize: {
        overall_state: string;
        setup_flow: {
          is_first_run: boolean;
          phase: string;
          ready_to_launch: boolean;
          blocking_items: string[];
          progress: {
            ready_required_count: number;
            total_required_count: number;
          };
        };
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
          readiness_layer: string;
          severity: string;
          user_action_required: boolean;
          auto_action_available: boolean;
          action_command_ref: string | null;
          last_attempt: Record<string, unknown> | null;
          next_visible_step: string;
          action: {
            action_id: string;
            method: string;
            request_fields: string[];
          } | null;
        }>;
        recommended_next_action: {
          action_id: string;
          method: string;
          request_fields: string[];
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
      };
    };

    assert.equal(output.system_initialize.overall_state, 'attention_needed');
    assert.equal(output.system_initialize.setup_flow.is_first_run, true);
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, false);
    assert.equal(output.system_initialize.setup_flow.phase, 'environment');
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex'), true);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('domain_modules'), false);
    assert.equal(
      output.system_initialize.setup_flow.progress.ready_required_count <
        output.system_initialize.setup_flow.progress.total_required_count,
      true,
    );
    assert.equal(output.system_initialize.workspace_root.selected_path, homeRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'install_or_configure_codex');
    assert.equal(output.system_initialize.recommended_next_action.method, 'POST');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);

    const workspaceRootItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'workspace_root');
    const codexItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'codex');

    assert.ok(workspaceRootItem);
    assert.ok(codexItem);
    assert.equal(workspaceRootItem.required, true);
    assert.equal(workspaceRootItem.blocking, false);
    assert.equal(workspaceRootItem.action?.action_id, 'open_workspace_root');
    assert.equal(workspaceRootItem.action?.method, 'GET');
    assert.deepEqual(workspaceRootItem.action?.request_fields, []);
    assert.equal(codexItem.required, true);
    assert.equal(codexItem.blocking, true);
    assert.equal(codexItem.readiness_layer, 'core_launch');
    assert.equal(codexItem.severity, 'blocking');
    assert.equal(codexItem.user_action_required, true);
    assert.equal(codexItem.auto_action_available, true);
    assert.equal(codexItem.action_command_ref, 'opl engine install --engine codex');
    assert.equal(typeof codexItem.last_attempt?.observed_at, 'string');
    assert.match(codexItem.next_visible_step, /Codex CLI/);
    assert.equal(codexItem.action?.action_id, 'install_or_configure_codex');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
