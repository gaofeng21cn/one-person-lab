import { assert, createFakeCodexFixture, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { fullRuntimeWorkbenchSummary } from '../../../../src/app-state.ts';

const defaultDeveloperModePermissionsFixture = JSON.stringify({
  user: { login: 'gaofeng21cn' },
  permissions: {
    'gaofeng21cn/one-person-lab': 'admin',
    'gaofeng21cn/med-autoscience': 'write',
    'gaofeng21cn/med-autogrant': 'maintain',
    'gaofeng21cn/opl-meta-agent': 'write',
    'gaofeng21cn/redcube-ai': 'admin',
  },
});

test('app state full runtime workbench summary uses stage progress refs only', () => {
  const output = fullRuntimeWorkbenchSummary({
    surface_kind: 'opl_app_operator_drilldown_read_model',
    stage_progress_log: {
      surface_kind: 'opl_stage_progress_log_summary',
      attempt_count: 1,
      temporal_attempt_count: 1,
      temporal_webui_ref_count: 1,
      temporal_webui_refs: [
        'http://localhost:8233/namespaces/default/workflows/stage-attempt-1/run-1/history',
      ],
      attempt_refs: [
        '/stage_attempt_workbench/attempts/stage-attempt-1/stage_progress_log',
      ],
      authority_boundary: {
        can_read_memory_body: false,
        can_read_artifact_body: false,
        provider_completion_is_domain_ready: false,
      },
    },
    runtime_visualization_projection: {
      runtime_workbench: {
        surface_kind: 'opl_app_runtime_workbench_visualization_model',
        summary_cards: [{ card_id: 'active_tasks', value: 1 }],
        action_queue: { items: [{ item_id: 'task:stage-attempt-1' }] },
        domain_lane_map: { lanes: [{ domain_id: 'medautoscience' }] },
      },
      visual_ref_groups: {
        stage_progress_log_refs: [
          {
            ref: '/stage_attempt_workbench/attempts/stage-attempt-1/stage_progress_log',
            role: 'stage_attempt_progress_log',
            temporal_webui_url:
              'http://localhost:8233/namespaces/default/workflows/stage-attempt-1/run-1/history',
          },
        ],
      },
      summary: {
        stage_progress_event_count: 2,
        temporal_stage_progress_ref_count: 1,
      },
    },
    memory_writeback_refs: {
      consumed_memory_refs: ['memory:route-policy'],
      body: 'must-not-be-projected',
    },
    artifact_gallery_refs: {
      refs: [{ ref: 'artifact:table', body: 'must-not-be-projected' }],
    },
  });

  assert.equal(output.availability, 'available');
  assert.equal(output.runtime_workbench?.surface_kind, 'opl_app_runtime_workbench_visualization_model');
  assert.equal(output.runtime_workbench?.action_queue_item_count, 1);
  assert.equal(output.runtime_workbench?.domain_lane_count, 1);
  assert.equal(output.stage_progress_log?.attempt_count, 1);
  assert.equal(output.stage_progress_log?.visual_ref_count, 1);
  assert.equal(output.stage_progress_log?.temporal_webui_ref_count, 1);
  assert.equal(output.stage_progress_log?.temporal_stage_progress_ref_count, 1);
  assert.equal(output.stage_progress_log?.stage_progress_event_count, 2);
  assert.equal(JSON.stringify(output).includes('must-not-be-projected'), false);
  assert.equal(output.authority_boundary.can_read_memory_body, false);
  assert.equal(output.authority_boundary.can_read_artifact_body, false);
  assert.equal(output.authority_boundary.provider_completion_is_domain_ready, false);
});

test('app state fast exposes the canonical GUI read model without retired MDS defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      app_state: {
        schema_version: string;
        surface_kind: string;
        meta: { profile: string; elapsed_ms: number };
        core: { executor: { default_executor_id: string; visible_executors: unknown[] }; codex: { parsed_version: string | null } };
        developer_mode: { enabled: string; effective_state: string };
        modules: {
          source: { mode: string; modules_root: string };
          items: Array<{ module_id: string; label: string; default_install: boolean }>;
        };
        assistants: { items: Array<{ assistant_id: string; label: string; launch_hint: string }> };
        provider: { temporal: { required_for: string; status: string; health_status: string } };
        release: { channel: string; version: string; repo: string; prerelease_included: boolean };
        operator: {
          status: string;
          summary: { profile: string; visible_action_count: number };
          workbench: {
            view_model_schema: string;
            summary_cards: Array<{ card_id: string; source_ref: string }>;
            sections: Array<{ section_id: string; source_ref: string; lazy: boolean }>;
            navigation: { replacement_policy: string };
            action_queue: { items: Array<{ item_id: string; priority_bucket: string }>; item_limit: number };
            domain_lane_map: { lanes: Array<{ domain_id: string; tasks: unknown[] }> };
            task_drilldowns: Array<{ task_id: string; active_path: unknown[] }>;
            safe_action_routes: Array<{ action_id: string; route: string }>;
            refresh_policy: { failure_policy: string; full_detail_auto_poll: boolean };
            performance_policy: { fast_json_max_bytes: number; shell_must_not_derive_layout_from_raw_runtime_projection: boolean };
            lazy_refs: Array<{ ref_id: string; surface: string }>;
          };
          dynamic_vertical_map: { nodes: unknown[]; edges: unknown[] };
          owner_boundary: { shell: string; can_write_domain_truth: boolean };
        };
        paths: { state_dir: string; modules_root: string; workspace_root_path: string | null; logs_dir: string };
        opl_agent_codex_context: { source: string; contract_ref: string; policy: string };
        actions: Array<{ action_id: string; surface: string }>;
      };
    };

    assert.equal(output.app_state.schema_version, 'opl_app_state.v1');
    assert.equal(output.app_state.surface_kind, 'opl_app_state.v1');
    assert.equal(output.app_state.meta.profile, 'fast');
    assert.equal(output.app_state.meta.elapsed_ms >= 0, true);
    assert.equal(output.app_state.core.executor.default_executor_id, 'codex_cli');
    assert.equal(output.app_state.core.executor.visible_executors.length, 1);
    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.provider.temporal.required_for, 'full_opl_family_runtime_readiness');
    assert.equal(output.app_state.release.channel, 'stable');
    assert.equal(output.app_state.release.prerelease_included, false);
    assert.equal(output.app_state.release.repo, 'gaofeng21cn/one-person-lab-app');
    assert.equal(output.app_state.operator.status, 'attention_needed');
    assert.equal(output.app_state.operator.summary.profile, 'fast');
    assert.equal(output.app_state.operator.summary.visible_action_count, output.app_state.actions.length);
    assert.equal(output.app_state.operator.workbench.view_model_schema, 'opl_app_operator_workbench.v1');
    assert.deepEqual(
      output.app_state.operator.workbench.summary_cards.map((entry) => entry.card_id),
      ['runtime_status', 'codex_cli', 'temporal_provider', 'runtime_modules', 'release_channel'],
    );
    assert.equal(
      output.app_state.operator.workbench.sections.some(
        (entry) => entry.section_id === 'full_runtime_drilldown' && entry.lazy === true,
      ),
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.navigation.replacement_policy,
      'app_repo_owns_navigation_truth_shell_renders_typed_items',
    );
    assert.equal(output.app_state.operator.workbench.action_queue.item_limit, 16);
    assert.equal(output.app_state.operator.workbench.action_queue.items.length > 0, true);
    assert.equal(output.app_state.operator.workbench.action_queue.items[0].item_id.startsWith('action:'), true);
    assert.equal(output.app_state.operator.workbench.domain_lane_map.lanes.length, 4);
    assert.equal(output.app_state.operator.workbench.task_drilldowns.length, 4);
    assert.equal(output.app_state.operator.workbench.safe_action_routes.length > 0, true);
    assert.equal(
      output.app_state.operator.workbench.safe_action_routes.every((entry) =>
        entry.route.startsWith('opl app action execute --action ')
      ),
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.refresh_policy.failure_policy,
      'section_level_status_with_last_good_display_cache_allowed',
    );
    assert.equal(output.app_state.operator.workbench.refresh_policy.full_detail_auto_poll, false);
    assert.equal(output.app_state.operator.workbench.performance_policy.fast_json_max_bytes, 500000);
    assert.equal(
      output.app_state.operator.workbench.performance_policy.shell_must_not_derive_layout_from_raw_runtime_projection,
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.lazy_refs.some(
        (entry) => entry.ref_id === 'full_runtime_drilldown'
          && entry.surface === 'opl runtime app-operator-drilldown --detail full --json',
      ),
      true,
    );
    assert.equal(output.app_state.operator.dynamic_vertical_map.nodes.length > 0, true);
    assert.equal(output.app_state.operator.owner_boundary.shell, 'thin_renderer_and_ipc_adapter');
    assert.equal(output.app_state.operator.owner_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.paths.state_dir, stateDir);
    assert.equal(output.app_state.paths.modules_root, path.join(stateDir, 'modules'));
    assert.equal(output.app_state.paths.workspace_root_path, homeRoot);
    assert.equal(output.app_state.paths.logs_dir, path.join(stateDir, 'logs'));
    assert.equal(output.app_state.opl_agent_codex_context.source, 'one-person-lab-app/product_profile');
    assert.equal(output.app_state.opl_agent_codex_context.policy, 'app_repo_owns_gui_context_text');
    assert.equal(output.app_state.modules.source.mode, 'managed_runtime');
    assert.deepEqual(
      output.app_state.modules.items.map((entry) => [entry.module_id, entry.label, entry.default_install]),
      [
        ['medautoscience', 'Med Auto Science', true],
        ['medautogrant', 'Med Auto Grant', true],
        ['redcube', 'RedCube AI', true],
        ['oplmetaagent', 'OPL Meta Agent', true],
      ],
    );
    assert.equal(
      output.app_state.modules.items.some((entry) => entry.module_id === 'meddeepscientist'),
      false,
    );
    assert.deepEqual(
      output.app_state.assistants.items.map((entry) => [entry.assistant_id, entry.label, entry.launch_hint]),
      [
        ['medautoscience', 'Med Auto Science', 'direct_click'],
        ['medautogrant', 'Med Auto Grant', 'direct_click'],
        ['redcube', 'RedCube AI', 'direct_click'],
        ['oplmetaagent', 'OPL Meta Agent', 'direct_click'],
      ],
    );
    assert.equal(
      output.app_state.actions.some((entry) => entry.action_id === 'developer_supervisor' && entry.surface === 'opl app action execute'),
      true,
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast shows developer checkout source when Developer Mode prefers sibling repos', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-dev-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const stateDir = path.join(homeRoot, 'opl-state');
  const medAutoSciencePath = path.join(workspaceRoot, 'med-autoscience');
  fs.mkdirSync(medAutoSciencePath, { recursive: true });
  runGitFixtureCommand(medAutoSciencePath, ['init', '--quiet']);
  fs.writeFileSync(path.join(medAutoSciencePath, 'README.md'), '# Med Auto Science\n', 'utf8');
  runGitFixtureCommand(medAutoSciencePath, ['add', 'README.md']);
  runGitFixtureCommand(medAutoSciencePath, ['commit', '--quiet', '-m', 'Initial MAS fixture']);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'developer-supervisor.json'), JSON.stringify({
    version: 'g1',
    enabled: 'on',
    mode: 'developer_apply_safe',
    auto_enable_github_login: 'gaofeng21cn',
    updated_at: '2026-05-27T00:00:00.000Z',
  }, null, 2));

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({
        login: 'gaofeng21cn',
        permissions: {
          'gaofeng21cn/one-person-lab': 'write',
          'gaofeng21cn/med-autoscience': 'write',
          'gaofeng21cn/med-autogrant': 'write',
          'gaofeng21cn/redcube-ai': 'write',
          'gaofeng21cn/opl-meta-agent': 'write',
        },
      }),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        developer_mode: { enabled: string; effective_state: string };
        modules: {
          source: { mode: string; reason: string };
          items: Array<{ module_id: string; checkout_path: string; install_origin: string }>;
        };
      };
    };

    const mas = output.app_state.modules.items.find((entry) => entry.module_id === 'medautoscience');
    assert.ok(mas);
    assert.equal(output.app_state.developer_mode.enabled, 'on');
    assert.equal(output.app_state.developer_mode.effective_state, 'active_direct');
    assert.equal(output.app_state.modules.source.mode, 'developer_workspace');
    assert.equal(output.app_state.modules.source.reason, 'developer_mode_prefers_local_sibling_checkouts');
    assert.equal(mas.checkout_path, medAutoSciencePath);
    assert.equal(mas.install_origin, 'sibling_workspace');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast does not perform network latest-version lookup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-fast-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const npmMarker = path.join(codexFixture.fixtureRoot, 'npm-called.marker');
  fs.writeFileSync(
    path.join(codexFixture.fixtureRoot, 'npm'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${JSON.stringify(npmMarker)}`,
      'echo "unexpected npm network lookup" >&2',
      'exit 42',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      app_state: {
        core: {
          codex: {
            parsed_version: string | null;
            latest_version: string | null;
            latest_version_status: string;
            diagnostics: string[];
          };
        };
      };
    };

    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.core.codex.latest_version, null);
    assert.equal(output.app_state.core.codex.latest_version_status, 'unknown');
    assert.equal(output.app_state.core.codex.diagnostics.includes('codex_cli_latest_lookup_skipped_fast_profile'), true);
    assert.equal(fs.existsSync(npmMarker), false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app action execute wraps runtime action dry-run as the App mutating boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-state-'));
  try {
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'missing-action',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateRoot, 'missing-gh'),
    }) as {
      app_action_execution: {
        surface_kind: string;
        action_id: string;
        dry_run: boolean;
        delegated_surface: string;
        result: {
          runtime_operator_action_execution: {
            action_id: string;
            dry_run: boolean;
            execution: { execution_status: string; result: null };
          };
        };
      };
    };

    assert.equal(output.app_action_execution.surface_kind, 'opl_app_action_execution.v1');
    assert.equal(output.app_action_execution.action_id, 'missing-action');
    assert.equal(output.app_action_execution.dry_run, true);
    assert.equal(output.app_action_execution.delegated_surface, 'opl runtime action execute');
    assert.equal(output.app_action_execution.result.runtime_operator_action_execution.action_id, 'missing-action');
    assert.equal(output.app_action_execution.result.runtime_operator_action_execution.dry_run, true);
    assert.equal(output.app_action_execution.result.runtime_operator_action_execution.execution.execution_status, 'dry_run_unresolved');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('app action catalog exposes Codex, module, and Temporal management actions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-actions-home-'));

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        actions: Array<{ action_id: string; delegated_surface: string; payload_fields: string[] }>;
      };
    };
    const actions = new Map(output.app_state.actions.map((entry) => [entry.action_id, entry]));

    for (const actionId of [
      'codex_install',
      'codex_update',
      'codex_reinstall',
      'codex_remove',
      'module_install',
      'module_update',
      'module_reinstall',
      'module_remove',
      'provider_scheduler_install',
      'provider_scheduler_trigger',
      'provider_scheduler_tick',
      'provider_worker_start',
      'provider_worker_restart',
    ]) {
      assert.ok(actions.has(actionId), `missing App action: ${actionId}`);
      assert.equal(actions.get(actionId)?.delegated_surface.startsWith('opl '), true);
    }
    assert.deepEqual(actions.get('module_update')?.payload_fields, ['module_id']);
    assert.deepEqual(actions.get('provider_scheduler_tick')?.payload_fields, ['force', 'limit', 'hydrate']);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast stays bounded for GUI rendering', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-size-home-'));
  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    });
    const byteLength = Buffer.byteLength(JSON.stringify(output), 'utf8');
    assert.equal(byteLength < 500000, true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app action execute owns settings, release channel, workspace root, and provider status actions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-settings-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const developer = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'developer_supervisor',
      '--payload',
      JSON.stringify({
        developerSupervisorEnabled: 'on',
        developerSupervisorMode: 'developer_apply_safe',
        developerSupervisorAutoEnableGithubLogin: 'gaofeng21cn',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
    }).app_action_execution;

    assert.equal(developer.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developer.result.system_action.action, 'developer_supervisor');
    assert.equal(developer.result.system_action.status, 'completed');

    const channel = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'update_channel',
      '--payload',
      '{"channel":"preview"}',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(channel.delegated_surface, 'opl system update-channel');
    assert.equal(channel.result.system_action.update_channel, 'preview');

    const workspace = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_root_set',
      '--payload',
      JSON.stringify({ path: workspaceRoot }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspace.delegated_surface, 'opl workspace root set');
    assert.equal(workspace.result.workspace_root.selected_path, workspaceRoot);

    const provider = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_scheduler_status',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).app_action_execution;

    assert.equal(provider.delegated_surface, 'opl family-runtime scheduler status --provider temporal');
    assert.equal(provider.result.family_runtime_scheduler_cadence.status, 'blocked_provider_not_ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app action execute dry-runs Codex, module, scheduler, and worker actions from one boundary', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-dry-run-home-'));

  try {
    const env = {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    };

    const codex = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'codex_update',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(codex.delegated_surface, 'opl engine update --engine codex');
    assert.equal(codex.result.engine_action.status, 'dry_run');

    const module = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'module_reinstall',
      '--payload',
      '{"module_id":"oplmetaagent"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(module.delegated_surface, 'opl module reinstall --module oplmetaagent');
    assert.equal(module.result.module_action.status, 'dry_run');

    const scheduler = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_scheduler_tick',
      '--payload',
      '{"force":true,"limit":3,"hydrate":false}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(scheduler.delegated_surface, 'opl family-runtime scheduler tick --provider temporal');
    assert.equal(scheduler.result.family_runtime_scheduler_tick.status, 'dry_run');
    assert.deepEqual(scheduler.result.family_runtime_scheduler_tick.command_preview, [
      'opl',
      'family-runtime',
      'scheduler',
      'tick',
      '--provider',
      'temporal',
      '--force',
      '--limit',
      '3',
      '--no-hydrate',
    ]);

    const worker = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_worker_restart',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(worker.delegated_surface, 'opl family-runtime worker restart --provider temporal');
    assert.equal(worker.result.family_runtime_worker_restart.status, 'dry_run');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app command parsers reject invalid state profiles and non-object action payloads', () => {
  const invalidProfile = runCliFailure(['app', 'state', '--profile', 'slow']);
  assert.equal(invalidProfile.payload.error.code, 'cli_usage_error');
  assert.equal(invalidProfile.payload.error.details.allowed_profiles.includes('fast'), true);
  assert.equal(invalidProfile.payload.error.details.allowed_profiles.includes('full'), true);

  const invalidPayload = runCliFailure([
    'app',
    'action',
    'execute',
    '--action',
    'developer_supervisor',
    '--payload',
    '[]',
    '--dry-run',
  ]);
  assert.equal(invalidPayload.payload.error.code, 'cli_usage_error');
  assert.equal(invalidPayload.payload.error.message, '--payload must be a JSON object.');
});

test('public surface index declares app state as the GUI runtime boundary', () => {
  const contracts = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'contracts', 'opl-framework', 'public-surface-index.json'),
      'utf8',
    ),
  );
  const appWorkbench = contracts.surfaces.find(
    (entry: { surface_id: string }) => entry.surface_id === 'one_person_lab_app_workbench',
  );

  assert.ok(appWorkbench);
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app state --profile fast',
    ),
    true,
  );
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app action execute',
    ),
    true,
  );
  assert.equal(
    appWorkbench.notes.some(
      (note: string) => note.includes('runtime app-operator-drilldown --detail full'),
    ),
    true,
  );
});
