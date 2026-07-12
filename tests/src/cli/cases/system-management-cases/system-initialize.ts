import { assert, assertBlockedDeveloperModeSurface, assertDeveloperModeAction, createCodexConfigFixture, createFakeCodexFixture, createManagedDomainModuleFixtures, fs, os, parseJsonText, path, runCli, runCliRaw, test } from './shared.ts';

test('system initialize aggregates environment modules settings workspace and system surfaces', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        OPL_WORKSPACE_ROOT: workspaceRoot,
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system_initialize: {
        surface_id: string;
        overall_state: string;
        setup_flow: {
          is_first_run: boolean;
          phase: string;
          ready_to_launch: boolean;
          blocking_items: string[];
          progress: {
          ready_required_count: number;
          total_required_count: number;
          ready_full_readiness_count: number;
          total_full_readiness_count: number;
          ready_optional_count: number;
          total_optional_count: number;
        };
        maintenance_items: string[];
        };
        module_summary: {
          installed_modules_count: number;
          total_modules_count: number;
        };
        core_engines: {
          codex: { installed: boolean };
        };
        native_helpers: {
          health_status: string;
          lifecycle: {
            commands: {
              repair: string;
            };
          };
        };
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
          status: string;
          readiness_layer: string;
          severity: string;
          user_action_required: boolean;
          auto_action_available: boolean;
          action_command_ref: string | null;
          last_attempt: Record<string, unknown> | null;
          next_visible_step: string;
          action: {
            action_id: string;
            payload_template: Record<string, string> | null;
          } | null;
        }>;
        domain_modules: {
          summary: {
            installed_modules_count: number;
            total_modules_count: number;
          };
          modules_root: string;
          notes: string[];
          modules: Array<{ module_id: string }>;
        };
        gui_shell: { sibling_checkout_found: boolean };
        settings: {
          interaction_mode: string;
          execution_mode: string;
          developer_mode: any;
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
        system: {
          update_channel: string;
          gui_shell: { local_product_api_retired: boolean };
          actions: Array<{
            action_id: string;
            endpoint: string;
            method?: string;
            request_fields?: string[];
            payload_template?: Record<string, string> | null;
          }>;
        };
        first_run_log: {
          surface_id: string;
          log_path: string;
          event_schema_version: string;
        };
        gui_first_run_automation: {
          surface_id: string;
          command_flow: string[];
          vm_artifacts: string[];
          accessibility_labels: {
            window: string;
            installButton: string;
          };
        };

        recommended_next_action: {
          action_id: string;
          label: string;
          method: string;
          request_fields: string[];
        };
        endpoints: {
          system_initialize: string;
          system_settings: string;
          system_action: string;
          workspace_root: string;
        };
      };
    };

    assert.equal(output.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(output.system_initialize.overall_state, 'ready_with_background_maintenance');
    assert.equal(output.system_initialize.setup_flow.is_first_run, false);
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
    assert.equal(output.system_initialize.setup_flow.phase, 'modules');
    assert.deepEqual(output.system_initialize.setup_flow.blocking_items, []);
    const nativeHelperItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'native_helpers');
    assert.ok(nativeHelperItem);
    const expectedMaintenanceItems = ['family_runtime_provider', ...(nativeHelperItem.severity === 'maintenance' ? ['native_helpers'] : []), 'domain_modules', 'recommended_skills'];
    if (!output.system_initialize.gui_shell.sibling_checkout_found) expectedMaintenanceItems.push('gui_shell');
    assert.deepEqual(output.system_initialize.setup_flow.maintenance_items, expectedMaintenanceItems);
    assert.equal(output.system_initialize.setup_flow.progress.ready_required_count, 3);
    assert.equal(output.system_initialize.setup_flow.progress.total_required_count, 3);
    assert.equal(output.system_initialize.setup_flow.progress.ready_full_readiness_count, 0);
    assert.equal(output.system_initialize.setup_flow.progress.total_full_readiness_count, 2);
    assert.equal(output.system_initialize.core_engines.codex.installed, true);
    assert.equal(Object.hasOwn(output.system_initialize.core_engines, 'hermes'), false);
    assert.equal(output.system_initialize.native_helpers.lifecycle.commands.repair, 'npm run native:repair');
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'workspace_root' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'codex' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'domain_modules' && entry.required),
      true,
    );
    assert.equal(nativeHelperItem.required, false);
    assert.equal(nativeHelperItem.blocking, false);
    assert.equal(
      nativeHelperItem.action?.action_id,
      nativeHelperItem.status === 'ready' ? 'open_environment' : 'repair_native_helpers',
    );
    if (nativeHelperItem.status !== 'ready') {
      assert.deepEqual(nativeHelperItem.action?.payload_template, { action: 'repair_native_helpers' });
    }
    assert.equal(nativeHelperItem.status, output.system_initialize.native_helpers.health_status);
    const domainModulesItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'domain_modules');
    assert.ok(domainModulesItem);
    assert.equal(domainModulesItem.readiness_layer, 'full_readiness');
    assert.equal(domainModulesItem.blocking, false);
    assert.equal(domainModulesItem.severity, 'maintenance');
    assert.equal(domainModulesItem.user_action_required, false);
    assert.equal(domainModulesItem.auto_action_available, true);
    assert.equal(domainModulesItem.action_command_ref, 'opl system startup-maintenance');
    assert.equal(typeof domainModulesItem.last_attempt?.observed_at, 'string');
    assert.match(domainModulesItem.next_visible_step, /Core workflows/);
    assert.equal(output.system_initialize.domain_modules.summary.total_modules_count, 7);
    assert.deepEqual(output.system_initialize.module_summary, output.system_initialize.domain_modules.summary);
    assert.equal(
      output.system_initialize.domain_modules.summary.total_modules_count,
      output.system_initialize.domain_modules.modules.length,
    );
    assert.equal(output.system_initialize.domain_modules.summary.installed_modules_count >= 0, true);
    assert.equal(output.system_initialize.domain_modules.modules.length, 7);
    assert.equal(output.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(output.system_initialize.settings.execution_mode, 'codex');
    assertBlockedDeveloperModeSurface(output.system_initialize.settings.developer_mode);
    assert.equal(output.system_initialize.workspace_root.selected_path, workspaceRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.system.update_channel, 'stable');
    const developerSupervisorAction = output.system_initialize.system.actions.find(
      (entry) => entry.action_id === 'developer_supervisor',
    );
    assert.ok(developerSupervisorAction);
    assertDeveloperModeAction(developerSupervisorAction);
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'developer_mode' && !entry.required),
      true,
    );
    assert.equal(output.system_initialize.system.gui_shell.local_product_api_retired, true);
    assert.equal(output.system_initialize.first_run_log.surface_id, 'opl_first_run_log');
    assert.equal(output.system_initialize.first_run_log.event_schema_version, 'opl_first_run_event.v1');
    assert.match(output.system_initialize.first_run_log.log_path, /Library\/Logs\/One Person Lab\/first-run\.jsonl$/);
    assert.equal(output.system_initialize.gui_first_run_automation.surface_id, 'opl_gui_first_run_automation');
    assert.deepEqual(output.system_initialize.gui_first_run_automation.command_flow, [
      'opl system initialize --json',
      'opl install --headless --skip-packages --json',
      'opl system configure-codex --api-key-stdin --json',
      'opl system startup-maintenance --json',
      'opl system reconcile-modules --json',
    ]);
    assert.equal(
      output.system_initialize.gui_first_run_automation.vm_artifacts.includes('opl connect modules --json'),
      true,
    );
    assert.equal(
      output.system_initialize.gui_first_run_automation.vm_artifacts.includes('opl modules --json'),
      false,
    );
    assert.equal(
      output.system_initialize.gui_first_run_automation.accessibility_labels.window,
      'opl-first-run-window',
    );
    assert.equal(
      output.system_initialize.gui_first_run_automation.accessibility_labels.installButton,
      'opl-first-run-install-button',
    );
    assert.ok(output.system_initialize.recommended_next_action.action_id.length > 0);
    assert.ok(output.system_initialize.recommended_next_action.label.length > 0);
    assert.equal(output.system_initialize.recommended_next_action.method, 'GET');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);
    assert.equal(output.system_initialize.endpoints.system_initialize, '/api/opl/system/initialize');
    assert.equal(output.system_initialize.endpoints.system_settings, '/api/opl/system/settings');
    assert.equal(output.system_initialize.endpoints.system_action, '/api/opl/system/actions');
    assert.equal(output.system_initialize.endpoints.workspace_root, '/api/opl/workspaces/root');
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system initialize events stream real diagnostic phases and final public payload', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-events-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-events-workspace-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw(
      ['system', 'initialize', '--events', '--json'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        OPL_WORKSPACE_ROOT: workspaceRoot,
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    );
    const lines = result.stdout.trim().split('\n');
    const entries = lines.map((line) => parseJsonText(line) as {
      version: string;
      event: {
        surface_id: string;
        event_type: string;
        phase: string;
        label: string;
        sequence: number;
        duration_ms?: number;
        payload?: any;
      };
    });
    const events = entries.map((entry) => entry.event);
    const finalEvent = events.at(-1);

    assert.equal(entries.every((entry) => entry.version === 'g2'), true);
    assert.equal(events.every((event) => event.surface_id === 'opl_system_initialize_event'), true);
    assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
    assert.equal(events.some((event) => event.event_type === 'phase_start'), true);
    assert.equal(events.some((event) => event.event_type === 'phase_done'), true);
    for (const phase of [
      'environment',
      'codex',
      'family_runtime_provider',
      'native_helpers',
      'developer_mode',
      'modules',
      'settings',
      'workspace_root',
      'recommended_skills',
      'gui_shell',
    ]) {
      assert.equal(events.some((event) => event.phase === phase), true, phase);
    }
    assert.ok(events.find((event) => event.phase === 'codex' && event.event_type === 'phase_done')?.duration_ms !== undefined);
    assert.equal(finalEvent?.event_type, 'complete');
    assert.equal(finalEvent?.phase, 'summary');
    assert.equal(finalEvent?.payload.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(finalEvent?.payload.system_initialize.workspace_root.selected_path, workspaceRoot);

    const jsonOutput = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        OPL_WORKSPACE_ROOT: workspaceRoot,
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as { system_initialize: { surface_id: string } };
    assert.equal(jsonOutput.system_initialize.surface_id, 'opl_system_initialize');
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system initialize reports temporal provider setup as blocking Full readiness when worker is unconfigured', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-online-management-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const modulesRoot = path.join(homeRoot, 'modules');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-online-management-workspace-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  createManagedDomainModuleFixtures(modulesRoot);

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: modulesRoot,
        OPL_WORKSPACE_ROOT: workspaceRoot,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system_initialize: {
        overall_state: string;
        readiness: {
          core_ready: boolean;
          domain_ready: boolean;
          launch_ready: boolean;
          family_runtime_provider_ready: boolean;
          full_ready: boolean;
        };
        setup_flow: {
          phase: string;
          ready_to_launch: boolean;
          blocking_items: string[];
        };
        family_runtime_provider: {
          surface_id: string;
          status: string;
          provider_kind: string;
          blocking: boolean;
          full_readiness_blocking: boolean;
          ready: boolean;
          capability_summary: string;
          repair_action: {
            action_id: string;
            payload_template: Record<string, string> | null;
          };
          service_status: {
            engine_id: string;
            installed: boolean;
            health_status: string;
          };
          last_repair_result: unknown | null;
        };
        checklist: Array<{
          item_id: string;
          label: string;
          required: boolean;
          blocking: boolean;
          readiness_layer: string;
          severity: string;
          user_action_required: boolean;
          auto_action_available: boolean;
          action_command_ref: string | null;
          last_attempt: Record<string, unknown> | null;
          next_visible_step: string;
          detail_summary: string;
        }>;
        recommended_next_action: {
          action_id: string;
        };
      };
    };

    assert.equal(output.system_initialize.overall_state, 'ready_with_background_maintenance');
    assert.deepEqual(output.system_initialize.readiness, {
      core_ready: true,
      domain_ready: true,
      launch_ready: true,
      family_runtime_provider_ready: false,
      full_ready: false,
    });
    assert.equal(output.system_initialize.setup_flow.phase, 'environment');
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
    assert.deepEqual(output.system_initialize.setup_flow.blocking_items, []);
    assert.equal(Object.hasOwn(output.system_initialize, 'online_management'), false);
    assert.equal(output.system_initialize.family_runtime_provider.surface_id, 'opl_family_runtime_provider_readiness');
    assert.equal(output.system_initialize.family_runtime_provider.status, 'initializing');
    assert.equal(output.system_initialize.family_runtime_provider.provider_kind, 'temporal');
    assert.equal(output.system_initialize.family_runtime_provider.blocking, true);
    assert.equal(output.system_initialize.family_runtime_provider.full_readiness_blocking, true);
    assert.equal(output.system_initialize.family_runtime_provider.ready, false);
    assert.match(
      output.system_initialize.family_runtime_provider.capability_summary,
      /temporal/i,
    );
    assert.equal(output.system_initialize.family_runtime_provider.repair_action.action_id, 'review_family_runtime_provider');
    assert.equal(output.system_initialize.family_runtime_provider.service_status.engine_id, 'temporal');
    assert.equal(output.system_initialize.family_runtime_provider.service_status.installed, false);
    assert.equal(Object.hasOwn(output.system_initialize.family_runtime_provider.service_status, 'gateway_loaded'), false);
    assert.equal(output.system_initialize.family_runtime_provider.service_status.health_status, 'attention_needed');
    assert.equal(output.system_initialize.family_runtime_provider.last_repair_result, null);

    const familyRuntimeProviderItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'family_runtime_provider');
    assert.ok(familyRuntimeProviderItem);
    assert.equal(familyRuntimeProviderItem.label, 'Family Runtime Provider');
    assert.equal(familyRuntimeProviderItem.required, true);
    assert.equal(familyRuntimeProviderItem.blocking, false);
    assert.equal(familyRuntimeProviderItem.readiness_layer, 'full_readiness');
    assert.equal(familyRuntimeProviderItem.severity, 'maintenance');
    assert.equal(familyRuntimeProviderItem.user_action_required, true);
    assert.equal(familyRuntimeProviderItem.auto_action_available, false);
    assert.equal(familyRuntimeProviderItem.action_command_ref, 'opl family-runtime worker status --provider temporal');
    assert.equal(typeof familyRuntimeProviderItem.last_attempt?.observed_at, 'string');
    assert.match(familyRuntimeProviderItem.next_visible_step, /Core readiness/);
    assert.match(familyRuntimeProviderItem.detail_summary, /temporal/i);
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'review_family_runtime_provider');
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
