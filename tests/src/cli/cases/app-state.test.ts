import { assert, buildManifestCommand, createFakeCodexFixture, fs, loadFamilyManifestFixtures, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import {
  assertCompactOwnerDeltaProjection,
} from './owner-payload-workorder-assertions.ts';

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

function bindMasWorkspaceForAppState(input: {
  stateDir: string;
  workspaceRoot: string;
  profilePath: string;
}) {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  manifest.workspace_locator = {
    ...((manifest.workspace_locator as Record<string, unknown>) ?? {}),
    workspace_root: input.workspaceRoot,
    profile_ref: input.profilePath,
    profile_name: 'dm-cvd-mortality-risk',
  };
  const now = new Date().toISOString();
  fs.mkdirSync(input.stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.stateDir, 'workspace-registry.json'),
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-app-state-activity',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: input.workspaceRoot,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: buildManifestCommand(manifest),
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: input.workspaceRoot,
              profile_ref: input.profilePath,
              input_path: null,
            },
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
}

function writeMasProgressPortalFixture(workspaceRoot: string, profilePath: string) {
  const portalPayloadPath = path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  fs.mkdirSync(path.dirname(portalPayloadPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm-cvd-mortality-risk"\n', 'utf8');
  fs.writeFileSync(portalPayloadPath, `${JSON.stringify({
    schema_version: 1,
    surface_kind: 'mas_progress_portal',
    workspace: {
      profile_name: 'dm-cvd-mortality-risk',
      workspace_root: workspaceRoot,
      studies: [
        {
          study_id: '002-dm-china-us-mortality-attribution',
          state_label: '自动运行中',
          state_summary: '自动运行中；系统有实际 writer/run 正在推进。',
          current_stage: 'live',
          active_run_id: 'mas-run-002',
          runtime_health_status: 'recovering',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先完成有限补充分析',
          next_system_action: '观察自动运行推进。',
          worker_running: true,
          actual_write_active: true,
        },
        {
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          state_label: '质量修复/复审中',
          state_summary: '质量修复/复审中；质量、artifact 或 runtime 有明确修复 owner。',
          current_stage: 'queued',
          active_run_id: null,
          runtime_health_status: 'escalated',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先收口同线质量硬阻塞',
          next_system_action: '提交 MAS owner receipt 或 typed blocker。',
          worker_running: null,
        },
        {
          study_id: '004-dpcc-longitudinal-care-inertia-intensification-gap',
          state_label: '用户暂停/手动停驻',
          state_summary: '用户暂停/手动停驻；当前没有实际写入，需显式恢复或给出新方案。',
          current_stage: 'parked',
          active_run_id: null,
          runtime_health_status: 'parked',
          progress_freshness_summary: '当前阶段以人工判断或收尾为主。',
          operator_focus: '先让发表门控具体化 blocker',
          next_system_action: '等待用户显式恢复或给出新方案。',
          worker_running: null,
        },
      ],
    },
    opl_handoff: {
      handoff_kind: 'mas_progress_portal_opl_family_projection',
      owner: 'mas',
      role: 'family_level_projection',
      authority: 'display_artifact_only',
      opl_role: 'family_level_projection_consumer_only',
    },
  }, null, 2)}\n`, 'utf8');
}

test('app state full runtime workbench summary uses stage progress refs only', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-full-workbench-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(['app', 'state', '--profile', 'full'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      app_state: {
        meta: { profile: string };
        runtime_workbench: {
          surface_kind: string;
          availability: string;
          source_surface: string;
          runtime_workbench: {
            surface_kind: string;
            summary_cards: Array<{ card_id: string }>;
            action_queue_item_count: number;
            domain_lane_count: number;
          } | null;
          stage_progress_log: {
            summary: unknown;
            attempt_count: number;
            visual_ref_count: number;
            temporal_webui_ref_count: number;
            temporal_webui_refs: unknown[];
            temporal_stage_progress_ref_count: number;
            stage_progress_event_count: number;
          };
          effective_current_context: {
            surface_kind: string;
            packet_version: string;
            context_count: number;
            running_attempt_count: number;
            latest_closeout_count: number;
          };
          family_stall_lineage: {
            surface_kind: string;
            packet_version: string;
            lineage_count: number;
            repeated_lineage_count: number;
            terminal_lineage_count: number;
          };
          authority_boundary: {
            can_read_memory_body: boolean;
            can_read_artifact_body: boolean;
            provider_completion_is_domain_ready: boolean;
          };
        };
      };
    };
    const summary = output.app_state.runtime_workbench;

    assert.equal(output.app_state.meta.profile, 'full');
    assert.equal(summary.surface_kind, 'opl_app_state_runtime_workbench_summary');
    assert.equal(summary.availability, 'available');
    assert.equal(summary.source_surface, 'opl runtime app-operator-drilldown --detail full --json');
    assert.equal(summary.runtime_workbench?.surface_kind, 'opl_app_runtime_workbench_visualization_model');
    assert.equal(summary.runtime_workbench?.summary_cards.length > 0, true);
    assert.equal(summary.runtime_workbench?.action_queue_item_count >= 0, true);
    assert.equal(summary.runtime_workbench?.domain_lane_count >= 0, true);
    assert.equal(summary.stage_progress_log?.summary !== null, true);
    assert.equal(summary.stage_progress_log?.attempt_count >= 0, true);
    assert.equal(summary.stage_progress_log?.visual_ref_count >= 0, true);
    assert.equal(summary.stage_progress_log?.temporal_webui_ref_count >= 0, true);
    assert.equal(Array.isArray(summary.stage_progress_log?.temporal_webui_refs), true);
    assert.equal(summary.stage_progress_log?.temporal_stage_progress_ref_count >= 0, true);
    assert.equal(summary.stage_progress_log?.stage_progress_event_count >= 0, true);
    assert.equal(summary.effective_current_context.surface_kind, 'opl_effective_current_context_packet');
    assert.equal(summary.effective_current_context.packet_version, 'effective_current_context.v1');
    assert.equal(summary.effective_current_context.context_count >= 0, true);
    assert.equal(summary.effective_current_context.running_attempt_count >= 0, true);
    assert.equal(summary.effective_current_context.latest_closeout_count >= 0, true);
    assert.equal(summary.family_stall_lineage.surface_kind, 'opl_family_stall_lineage');
    assert.equal(summary.family_stall_lineage.packet_version, 'family-stall-lineage.v1');
    assert.equal(summary.family_stall_lineage.lineage_count >= 0, true);
    assert.equal(summary.family_stall_lineage.repeated_lineage_count >= 0, true);
    assert.equal(summary.family_stall_lineage.terminal_lineage_count >= 0, true);
    assert.equal(JSON.stringify(summary).includes('memory_writeback_refs'), false);
    assert.equal(JSON.stringify(summary).includes('artifact_gallery_refs'), false);
    assert.equal(summary.authority_boundary.can_read_memory_body, false);
    assert.equal(summary.authority_boundary.can_read_artifact_body, false);
    assert.equal(summary.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
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
        runtime_source: {
          producer_role: string;
          normal_gui_state_surface: string;
          full_gui_state_surface: string;
          action_boundary_surface: string;
          full_drilldown_exception_surface: string;
          shell_must_not_use_full_drilldown_as_normal_state: boolean;
        };
        core: { executor: { default_executor_id: string; visible_executors: unknown[] }; codex: { parsed_version: string | null } };
        developer_mode: { enabled: string; effective_state: string };
        modules: {
          source: { mode: string; modules_root: string };
          items: Array<{ module_id: string; label: string; default_install: boolean }>;
        };
        assistants: { items: Array<{ assistant_id: string; label: string; launch_hint: string }> };
        provider: { temporal: { required_for: string; status: string; health_status: string } };
        release: {
          channel: string;
          version: string;
          tag: string;
          repo: string;
          opl_framework_version: string;
          framework_version: string;
          opl_framework_revision: string;
          framework_revision: string;
          framework_revision_source: string;
          prerelease_included: boolean;
        };
        operator: {
          status: string;
          summary: { profile: string; visible_action_count: number };
          compact_owner_delta_projection: Record<string, any>;
          workbench: {
            view_model_schema: string;
            compact_owner_delta_projection: Record<string, any>;
            summary_cards: Array<{ card_id: string; source_ref: string; value: string | number }>;
            sections: Array<{ section_id: string; source_ref: string; lazy: boolean }>;
            navigation: { replacement_policy: string };
            action_queue: { items: Array<{ item_id: string; priority_bucket: string }>; item_limit: number };
            activity_center: {
              active_projects: Array<{ study_id?: string; state: string; title: string }>;
              needs_attention: Array<{ study_id?: string }>;
              recent_projects: Array<{ study_id?: string }>;
            };
            domain_lane_map: { lanes: Array<{ domain_id: string; active_task_count: number; tasks: Array<{ study_id?: string; state: string }> }> };
            task_drilldowns: Array<{ task_id: string; study_id?: string; state: string; active_path: unknown[] }>;
            safe_action_routes: Array<{ action_id: string; route: string }>;
            refresh_policy: { failure_policy: string; full_detail_auto_poll: boolean };
            performance_policy: {
              fast_json_max_bytes: number;
              shell_must_not_derive_layout_from_raw_runtime_projection: boolean;
              shell_must_not_use_full_drilldown_as_normal_state: boolean;
            };
            lazy_refs: Array<{ ref_id: string; surface: string }>;
          };
          dynamic_vertical_map: { nodes: unknown[]; edges: unknown[] };
          visual_ref_groups: {
            active_project_refs: Array<{ study_id?: string; state: string }>;
            needs_attention_refs: Array<{ study_id?: string }>;
            recent_project_refs: Array<{ study_id?: string }>;
          };
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
    assert.equal(output.app_state.runtime_source.producer_role, 'gui_ready_state_action_producer_only');
    assert.equal(output.app_state.runtime_source.normal_gui_state_surface, 'opl app state --profile fast --json');
    assert.equal(output.app_state.runtime_source.full_gui_state_surface, 'opl app state --profile full --json');
    assert.equal(output.app_state.runtime_source.action_boundary_surface, 'opl app action execute --json');
    assert.equal(
      output.app_state.runtime_source.full_drilldown_exception_surface,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.equal(output.app_state.runtime_source.shell_must_not_use_full_drilldown_as_normal_state, true);
    assert.equal('runtime_tray_snapshot' in output.app_state, false);
    assert.equal(output.app_state.core.executor.default_executor_id, 'codex_cli');
    assert.equal(output.app_state.core.executor.visible_executors.length, 1);
    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.provider.temporal.required_for, 'full_opl_family_runtime_readiness');
    assert.equal(output.app_state.release.channel, 'stable');
    assert.equal(output.app_state.release.version, '26.5.28');
    assert.equal(output.app_state.release.tag, 'v26.5.28');
    assert.equal(output.app_state.release.prerelease_included, false);
    assert.equal(output.app_state.release.repo, 'gaofeng21cn/one-person-lab-app');
    assert.equal(output.app_state.release.opl_framework_version, '0.1.0');
    assert.equal(output.app_state.release.framework_version, '0.1.0');
    assert.match(output.app_state.release.opl_framework_revision, /^[0-9a-f]{12}$|^\d{4}-\d{2}-\d{2}$/);
    assert.equal(output.app_state.release.framework_revision, output.app_state.release.opl_framework_revision);
    assert.match(
      output.app_state.release.framework_revision_source,
      /^(OPL_FRAMEWORK_REVISION|full_package_manifest|git_head|build_date|package_json_mtime)$/,
    );
    assert.equal(output.app_state.operator.status, 'attention_needed');
    assert.equal(output.app_state.operator.summary.profile, 'fast');
    assert.equal(output.app_state.operator.summary.visible_action_count, output.app_state.actions.length);
    assert.equal(output.app_state.operator.workbench.view_model_schema, 'opl_app_operator_workbench.v1');
    assert.deepEqual(
      output.app_state.operator.compact_owner_delta_projection,
      output.app_state.operator.workbench.compact_owner_delta_projection,
    );
    assertCompactOwnerDeltaProjection(output.app_state.operator.workbench.compact_owner_delta_projection, {
      fullDetailRefKeys: [
        'framework_readiness_ref',
        'evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
    });
    assert.equal(
      output.app_state.operator.workbench.compact_owner_delta_projection.full_detail_refs
        .app_operator_drilldown_ref,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.deepEqual(
      output.app_state.operator.workbench.summary_cards.map((entry) => entry.card_id),
      ['active_projects', 'runtime_status', 'codex_cli', 'temporal_provider', 'runtime_modules', 'release_channel'],
    );
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'active_projects')?.value,
      0,
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
      output.app_state.operator.workbench.performance_policy.shell_must_not_use_full_drilldown_as_normal_state,
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.lazy_refs.some(
        (entry) => entry.ref_id === 'full_runtime_drilldown'
          && entry.surface === 'opl runtime app-operator-drilldown --detail full --json',
      ),
      true,
    );
    assert.equal('app_operator_drilldown' in output.app_state, false);
    assert.equal('evidence_envelope' in output.app_state, false);
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

test('app state fast exposes MAS study-level running activity refs for the GUI', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-activity-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-activity-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          compact_owner_delta_projection: Record<string, any>;
          workbench: {
            compact_owner_delta_projection: Record<string, any>;
            summary_cards: Array<{ card_id: string; value: number | string }>;
            activity_center: {
              active_projects: Array<{ study_id?: string; state: string; active_run_id?: string | null }>;
              needs_attention: Array<{ study_id?: string; state: string }>;
              recent_projects: Array<{ study_id?: string; state: string }>;
            };
            domain_lane_map: { lanes: Array<{ domain_id: string; active_task_count: number; tasks: Array<{ study_id?: string; state: string }> }> };
            task_drilldowns: Array<{ study_id?: string; state: string; source_ref_count: number }>;
          };
          visual_ref_groups: {
            active_project_refs: Array<{ study_id?: string; state: string }>;
            recent_project_refs: Array<{ study_id?: string; state: string }>;
          };
        };
      };
    };

    const activeStudyIds = output.app_state.operator.workbench.activity_center.active_projects.map((entry) => entry.study_id);
    assert.deepEqual(activeStudyIds, [
      '002-dm-china-us-mortality-attribution',
    ]);
    assert.deepEqual(
        output.app_state.operator.workbench.activity_center.needs_attention.map((entry) => entry.study_id),
      ['003-dpcc-primary-care-phenotype-treatment-gap'],
    );
    assert.deepEqual(
      output.app_state.operator.compact_owner_delta_projection,
      output.app_state.operator.workbench.compact_owner_delta_projection,
    );
    assertCompactOwnerDeltaProjection(output.app_state.operator.compact_owner_delta_projection, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
      acceptedReturnShapes: [
        'domain_owner_receipt_ref',
        'domain_typed_blocker_ref',
        'typed_blocker_ref',
      ],
      openSafeActionCount: 1,
      payloadRequiredCount: 0,
      fullDetailRefKeys: [
        'framework_readiness_ref',
        'evidence_worklist_ref',
        'app_operator_drilldown_ref',
        'runtime_activity_ref',
      ],
    });
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'active_projects')?.value,
      1,
    );
    assert.deepEqual(
      output.app_state.operator.visual_ref_groups.active_project_refs.map((entry) => entry.study_id),
      activeStudyIds,
    );
    assert.equal(
      output.app_state.operator.workbench.activity_center.recent_projects.length,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.domain_lane_map.lanes.find((entry) => entry.domain_id === 'medautoscience')?.active_task_count,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.task_drilldowns.filter((entry) => entry.study_id).length,
      3,
    );
    assert.equal(
      output.app_state.operator.workbench.task_drilldowns.every((entry) => !entry.study_id || entry.source_ref_count > 0),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
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
        actions: Array<{
          action_id: string;
          delegated_surface: string;
          payload_fields: string[];
        } & Record<string, unknown>>;
      };
    };
    const actions = new Map(output.app_state.actions.map((entry) => [entry.action_id, entry]));

    for (const actionId of [
      'codex_install',
      'codex_update',
      'codex_reinstall',
      'codex_remove',
      'developer_supervisor_refresh',
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
    assert.equal(actions.get('module_update')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('module_update')?.can_submit_to_safe_action_shell, false);
    assert.equal(actions.get('provider_scheduler_status')?.submit_via, 'opl app action execute');
    assert.equal(actions.get('provider_scheduler_status')?.execution_policy, 'opl_safe_action_shell');
    assert.equal(actions.get('provider_scheduler_status')?.route_requires_domain_or_app_payload, false);
    assert.equal(actions.get('provider_scheduler_status')?.can_submit_to_safe_action_shell, true);
    assert.equal(actions.get('provider_scheduler_status')?.dry_run_supported, true);
    assert.equal(actions.get('provider_scheduler_status')?.route, 'opl app action execute --action provider_scheduler_status');
    assert.deepEqual(actions.get('provider_scheduler_tick')?.payload_fields, ['force', 'limit', 'hydrate']);
    assert.equal(actions.get('provider_scheduler_tick')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('provider_scheduler_tick')?.can_submit_to_safe_action_shell, false);
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

    const developerRefresh = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'developer_supervisor_refresh',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
    }).app_action_execution;

    assert.equal(developerRefresh.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developerRefresh.result.system_action.action, 'developer_supervisor');
    assert.equal(developerRefresh.result.system_action.status, 'ready');
    assert.equal(developerRefresh.result.system_action.developer_supervisor.enabled, 'on');
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

    const developerRefresh = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'developer_supervisor_refresh',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(developerRefresh.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developerRefresh.result.system_action.status, 'dry_run');

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
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app state --profile fast --json',
    ),
    true,
  );
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app state --profile full --json',
    ),
    true,
  );
  assert.equal(
    appWorkbench.refs.some(
      (ref: { ref_kind: string; ref: string }) =>
        ref.ref_kind === 'machine_cli' && ref.ref === 'opl app action execute --json',
    ),
    true,
  );
  assert.equal(
    appWorkbench.notes.some(
      (note: string) => note.includes('GUI-ready state/action producer only'),
    ),
    true,
  );
  assert.equal(
    appWorkbench.notes.some(
      (note: string) => note.includes('must not be used as normal GUI page state'),
    ),
    true,
  );
});
