import { assert, buildManifestCommand, createFakeCodexFixture, fs, loadFamilyManifestFixtures, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import {
  assertCompactOwnerDeltaProjection,
  assertCurrentOwnerDeltaProjection,
} from './owner-payload-workorder-assertions.ts';

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

function collectObjectKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== 'object') {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectObjectKeys(entry, keys);
    }
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

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
        default_read_surface_policy: {
            surface_kind: string;
            profile: string;
            default_operator_payload: string;
            compatibility_operator_payload: string;
            normal_state_surface: string;
            full_runtime_drilldown_surface: string;
            raw_runtime_projection_policy: string;
            runtime_tray_projection_policy: string;
            worklist_projection_policy: string;
            compatibility_payload_policy: string;
            first_screen_answers: string[];
            diagnostic_only_answers: string[];
            fast_profile_excludes: string[];
            forbidden_fast_profile_fields: string[];
            shell_contract: {
              shell_must_not_use_full_drilldown_as_normal_state: boolean;
              shell_must_not_derive_layout_from_raw_runtime_projection: boolean;
              full_detail_auto_poll: boolean;
            };
            authority_boundary: {
              can_write_domain_truth: boolean;
              can_create_owner_receipt: boolean;
              can_claim_app_release_ready: boolean;
              can_claim_production_ready: boolean;
            };
          };
          current_owner_delta: Record<string, any>;
          compact_owner_delta_projection: Record<string, any>;
          workbench: {
            view_model_schema: string;
            default_read_surface_policy: Record<string, any>;
            current_owner_delta: Record<string, any>;
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
    assert.equal(output.app_state.release.version, '26.6.3');
    assert.equal(output.app_state.release.tag, 'v26.6.3');
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
    assert.equal(
      output.app_state.operator.default_read_surface_policy.surface_kind,
      'opl_app_default_read_surface_policy',
    );
    assert.equal(output.app_state.operator.default_read_surface_policy.profile, 'fast');
    assert.equal(
      output.app_state.operator.default_read_surface_policy.default_operator_payload,
      'current_owner_delta',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.compatibility_operator_payload,
      'compact_owner_delta_projection',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.normal_state_surface,
      'opl app state --profile fast --json',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.full_runtime_drilldown_surface,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.raw_runtime_projection_policy,
      'explicit_full_detail_or_lazy_diagnostic_only',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.runtime_tray_projection_policy,
      'current_owner_delta_first_runtime_tray_worklist_audit_tail_drilldown',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.worklist_projection_policy,
      'secondary_drilldown_never_default_planning_root',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.compatibility_payload_policy,
      'compact_owner_delta_projection_is_legacy_full_detail_alias_not_first_screen_root',
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.first_screen_answers,
      [
        'current_owner_delta',
        'next_safe_action_or_none',
        'current_owner',
        'required_delta',
        'accepted_return_shapes',
        'readiness_false_flags',
        'hard_gate',
        'latest_owner_answer_ref',
      ],
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.first_screen_answers.includes('count_summary'),
      false,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.diagnostic_only_answers,
      [
        'count_summary',
        'audit_next_safe_action_or_none',
        'full_detail_refs',
      ],
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.fast_profile_excludes.includes('runtime_tray_snapshot'),
      true,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.fast_profile_excludes.includes('raw_evidence_envelope'),
      true,
    );
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy.forbidden_fast_profile_fields,
      [
        'runtime_tray_snapshot',
        'raw_evidence_envelope',
        'raw_evidence_browser',
        'raw_ledger_browser',
        'ledger_browser',
        'stage_replay_packet_body',
        'private_residue_inventory_body',
        'provider_internal_ledger_body',
        'provider_internal_trace',
        'route_variant_menu',
      ],
    );
    const fastPayloadKeys = collectObjectKeys(output.app_state);
    for (const field of output.app_state.operator.default_read_surface_policy.forbidden_fast_profile_fields) {
      assert.equal(
        fastPayloadKeys.has(field),
        false,
        `fast app state must not expose raw ledger/browser field ${field}`,
      );
    }
    assert.equal(
      output.app_state.operator.default_read_surface_policy.shell_contract
        .shell_must_not_use_full_drilldown_as_normal_state,
      true,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.shell_contract
        .shell_must_not_derive_layout_from_raw_runtime_projection,
      true,
    );
    assert.equal(output.app_state.operator.default_read_surface_policy.shell_contract.full_detail_auto_poll, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_claim_production_ready, false);
    assert.equal(output.app_state.operator.workbench.view_model_schema, 'opl_app_operator_workbench.v1');
    assert.deepEqual(
      output.app_state.operator.default_read_surface_policy,
      output.app_state.operator.workbench.default_read_surface_policy,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.workbench.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.compact_owner_delta_projection.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.compact_owner_delta_projection,
      output.app_state.operator.workbench.compact_owner_delta_projection,
    );
    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta);
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
          current_owner_delta: Record<string, any>;
          compact_owner_delta_projection: Record<string, any>;
          workbench: {
            current_owner_delta: Record<string, any>;
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
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.workbench.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.compact_owner_delta_projection.current_owner_delta,
    );
    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
    });
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
