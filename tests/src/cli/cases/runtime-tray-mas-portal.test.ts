import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';

function bindMasWorkspace(input: {
  stateRoot: string;
  fixtureContractsRoot: string;
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
  manifest.task_lifecycle = {
    ...((manifest.task_lifecycle as Record<string, unknown>) ?? {}),
    status: 'completed',
    human_gate_ids: [],
    summary: 'MAS workspace locator is bound for Portal projection tests.',
  };
  manifest.progress_projection = {
    ...((manifest.progress_projection as Record<string, unknown>) ?? {}),
    current_status: 'completed',
    runtime_status: 'ready',
    headline: 'MAS Portal projection fixture is bound.',
    attention_items: [],
    human_gate_ids: [],
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    input.workspaceRoot,
    '--manifest-command',
    buildManifestCommand(manifest),
  ], {
    OPL_STATE_DIR: input.stateRoot,
    OPL_CONTRACTS_DIR: input.fixtureContractsRoot,
  });
}

test('runtime snapshot prefers MAS Progress Portal handoff for study projection and portal links', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-portal-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-portal-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  const profilePath = path.join(profileDir, 'dm.workspace.toml');
  const portalPayloadPath = path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  const portalHtmlPath = path.join(workspaceRoot, 'ops', 'mas', 'progress', 'index.html');

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm"\n');
  fs.mkdirSync(path.dirname(portalPayloadPath), { recursive: true });
  fs.mkdirSync(path.dirname(portalHtmlPath), { recursive: true });
  fs.writeFileSync(portalHtmlPath, '<!doctype html><title>MAS Progress Portal</title>\n');
  fs.writeFileSync(portalPayloadPath, `${JSON.stringify(portalPayload(workspaceRoot), null, 2)}\n`);

  try {
    bindMasWorkspace({ stateRoot, fixtureContractsRoot, workspaceRoot, profilePath });
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.runtime_health.status, 'running');
    assert.equal(snapshot.attention_items.length, 2);
    const portalAlert = snapshot.attention_items.find((item: { item_id: string }) =>
      item.item_id.startsWith('medautoscience:portal-workspace-alert:')
    );
    assert.ok(portalAlert);
    assert.equal(portalAlert.action_owner, 'opl');
    assert.equal(portalAlert.portal_path, portalHtmlPath);
    const dm002 = snapshot.running_items.find((item: { study_id?: string }) => item.study_id === '002-dm-china-us-mortality-attribution');
    const dpcc003 = snapshot.running_items.find((item: { study_id?: string }) => item.study_id === '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.ok(dm002);
    assert.ok(dpcc003);
    assert.equal(dm002.item_id, 'medautoscience:portal-study:002-dm-china-us-mortality-attribution');
    assert.equal(dm002.active_run_id, 'mas-run-002');
    assert.equal(dm002.health_status, 'recovering');
    assert.equal(dm002.portal_path, portalHtmlPath);
    assert.equal(dm002.portal_url, `file://${portalHtmlPath}`);
    assert.equal(dm002.portal_payload_ref, 'artifacts/runtime/progress_portal/latest.json');
    assert.equal(dm002.portal_freshness.status, 'fresh');
    assert.equal(dm002.portal_source_refs.some((ref: { role: string }) => ref.role === 'mas_progress_portal_payload'), true);
    assert.equal(dm002.source_refs.some((ref: { role: string }) => ref.role === 'mas_progress_portal_payload'), true);
    assert.equal(dpcc003.active_run_id, 'mas-run-003');
    const recentPortalItem = snapshot.recent_items.find((item: { study_id?: string }) =>
      item.study_id === '004-dpcc-longitudinal-care-inertia-intensification-gap'
    );
    assert.ok(recentPortalItem);
    assert.equal(recentPortalItem.action_owner, 'none');
    assert.deepEqual(snapshot.action_counts, { user: 0, opl: 1, infrastructure: 1 });
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot consumes MAS OPL workbench projection as read-only study drilldown data', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-workbench-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-workbench-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  const profilePath = path.join(profileDir, 'dm.workspace.toml');
  const portalPayloadPath = path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  const portalHtmlPath = path.join(workspaceRoot, 'ops', 'mas', 'progress', 'index.html');

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm"\n');
  fs.mkdirSync(path.dirname(portalPayloadPath), { recursive: true });
  fs.mkdirSync(path.dirname(portalHtmlPath), { recursive: true });
  fs.writeFileSync(portalHtmlPath, '<!doctype html><title>MAS Progress Portal</title>\n');
  fs.writeFileSync(portalPayloadPath, `${JSON.stringify(workbenchPortalPayload(workspaceRoot, profilePath), null, 2)}\n`);

  try {
    bindMasWorkspace({ stateRoot, fixtureContractsRoot, workspaceRoot, profilePath });
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const item = snapshot.running_items.find((entry: { study_id?: string }) => entry.study_id === '002-dm-china-us-mortality-attribution');

    assert.ok(item);
    assert.equal(item.item_id, 'medautoscience:workbench-study:002-dm-china-us-mortality-attribution');
    assert.equal(item.status, 'live');
    assert.equal(item.title, 'DM mortality attribution');
    assert.equal(item.summary, '最近 12 小时内仍有明确研究推进记录。');
    assert.equal(item.next_action_summary, '观察自动运行推进。');
    assert.equal(item.workbench_projection.surface_kind, 'mas_opl_runtime_workbench_projection');
    assert.equal(item.workbench_projection.schema_version, 1);
    assert.equal(item.workbench_projection.authority.mas_truth_owner, true);
    assert.equal(item.workbench_projection.authority.opl_role, 'projection_consumer_and_action_transport_only');
    assert.deepEqual(item.workbench_projection.authority.forbidden_writes, [
      'study_truth',
      'publication_judgment',
      'quality_verdict',
      'runtime_authority',
      'artifact_authority',
    ]);
    assert.equal(item.workbench_projection.workspace.workspace_root, workspaceRoot);
    assert.equal(item.workbench_projection.workspace.profile_ref, profilePath);
    assert.equal(item.workbench_projection.studies.length, 2);
    assert.equal(item.study_workbench.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(item.study_workbench.display_title, 'DM mortality attribution');
    assert.equal(item.study_workbench.macro_state, 'running');
    assert.equal(item.study_workbench.terminal.mode, 'read_only_tail');
    assert.equal(item.study_workbench.links.progress_payload_ref, 'artifacts/runtime/progress_portal/studies/002-dm-china-us-mortality-attribution/latest.json');
    assert.deepEqual(item.study_workbench.links.artifact_refs, [
      'studies/002-dm-china-us-mortality-attribution/manuscript/current_package.zip',
    ]);
    assert.equal(item.study_workbench.actions.resume.allowed, false);
    assert.equal(item.study_workbench.actions.pause.allowed, true);
    assert.equal(item.study_workbench.actions.pause.owner, 'mas_runtime_owner');
    assert.equal(item.workbench_projection_source_refs.some((ref: { role: string }) => ref.role === 'mas_opl_runtime_workbench_projection'), true);
    assert.equal(item.source_refs.some((ref: { role: string }) => ref.role === 'mas_opl_runtime_workbench_projection'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function portalPayload(workspaceRoot: string) {
  return {
    schema_version: 1,
    surface_kind: 'mas_progress_portal',
    generated_at: '2026-05-08T16:22:01+00:00',
    workspace: {
      profile_name: 'dm-cvd-mortality-risk',
      workspace_root: workspaceRoot,
      workspace_status: 'blocked',
      workspace_alert_items: [
        {
          source: 'product_entry_preflight.medical_overlay_ready',
          purpose: '提示医学论文运行前置能力尚未全部 ready。',
          current_output: 'workspace medical overlay 还未 ready，当前运行前置能力不完整。',
          expected: 'doctor/product-entry preflight 应通过或给出具体 medical overlay blocker。',
          recommended_command: 'uv run python -m med_autoscience.cli doctor --profile <profile>',
        },
      ],
      studies: [
        {
          study_id: '002-dm-china-us-mortality-attribution',
          state_label: '自动运行中',
          state_summary: '自动运行中；系统有实际 writer/run 正在推进。',
          current_stage: 'live',
          paper_stage: 'analysis-campaign',
          active_run_id: 'mas-run-002',
          runtime_health_status: 'recovering',
          supervisor_tick_status: 'fresh',
          progress_freshness_status: 'fresh',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先完成有限补充分析',
          next_system_action: '观察自动运行推进。',
          worker_running: true,
        },
        {
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          state_label: '自动运行中',
          state_summary: '自动运行中；系统有实际 writer/run 正在推进。',
          current_stage: 'live',
          paper_stage: 'write',
          active_run_id: 'mas-run-003',
          runtime_health_status: 'recovering',
          supervisor_tick_status: 'fresh',
          progress_freshness_status: 'fresh',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先收口同线质量硬阻塞',
          next_system_action: '观察自动运行推进。',
          worker_running: true,
        },
        {
          study_id: '004-dpcc-longitudinal-care-inertia-intensification-gap',
          state_label: '用户暂停/手动停驻',
          state_summary: '用户暂停/手动停驻；当前没有实际写入，需显式恢复或给出新方案。',
          current_stage: 'parked',
          paper_stage: 'manual_hold',
          active_run_id: null,
          runtime_health_status: 'parked',
          supervisor_tick_status: 'fresh',
          progress_freshness_status: 'not_required',
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
      study_id: 'workspace-overview',
      profile_name: 'dm-cvd-mortality-risk',
      payload_refs: {
        progress_portal: 'artifacts/runtime/progress_portal/latest.json',
      },
      freshness: {
        status: 'fresh',
        summary: '最近 12 小时内仍有明确研究推进记录。',
        latest_event_at: '2026-05-08T16:21:59+00:00',
      },
      source_refs: [
        path.join(workspaceRoot, 'artifacts', 'supervision', 'reconcile', 'latest.json'),
        path.join(workspaceRoot, 'artifacts', 'supervision', 'hourly', 'latest.json'),
      ],
      artifact_locators: [],
      conditions: {
        missing: ['current_package'],
        stale: [],
        conflict: [],
      },
      deep_link: 'ops/mas/progress/index.html',
      forbidden_authority: [
        'study_truth',
        'publication_judgment',
        'quality_verdict',
        'runtime_authority',
        'artifact_authority',
      ],
    },
  };
}

function workbenchPortalPayload(workspaceRoot: string, profilePath: string) {
  return {
    ...portalPayload(workspaceRoot),
    mas_opl_runtime_workbench_projection: {
      surface_kind: 'mas_opl_runtime_workbench_projection',
      schema_version: 1,
      workspace: {
        workspace_root: workspaceRoot,
        profile_ref: profilePath,
        profile_name: 'dm-cvd-mortality-risk',
      },
      studies: [
        {
          study_id: '002-dm-china-us-mortality-attribution',
          display_title: 'DM mortality attribution',
          macro_state: 'running',
          user_next: 'observe',
          current_stage: 'live',
          active_run_id: 'mas-run-002',
          worker_state: 'running',
          last_seen_at: '2026-05-08T16:21:59+00:00',
          freshness: {
            status: 'fresh',
            summary: '最近 12 小时内仍有明确研究推进记录。',
            latest_event_at: '2026-05-08T16:21:59+00:00',
          },
          blocker_summary: [],
          next_action_summary: '观察自动运行推进。',
          source_refs: [
            path.join(workspaceRoot, 'studies', '002-dm-china-us-mortality-attribution', 'artifacts', 'runtime', 'runtime_supervision', 'latest.json'),
          ],
          links: {
            progress_payload_ref: 'artifacts/runtime/progress_portal/studies/002-dm-china-us-mortality-attribution/latest.json',
            conversation_read_model_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/runtime/conversation_read_model/latest.json',
            live_console_read_model_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/runtime/live_console/read_model/latest.json',
            terminal_attach_status_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/runtime/terminal_attach/read_model/latest.json',
            artifact_refs: [
              'studies/002-dm-china-us-mortality-attribution/manuscript/current_package.zip',
            ],
          },
          actions: {
            pause: {
              allowed: true,
              owner: 'mas_runtime_owner',
              endpoint_ref: 'runtime-actions/pause',
              idempotency_required: true,
              confirmation_required: true,
            },
            resume: {
              allowed: false,
              owner: 'mas_runtime_owner',
              endpoint_ref: null,
              idempotency_required: true,
              confirmation_required: true,
            },
          },
        },
        {
          study_id: '004-dpcc-longitudinal-care-inertia-intensification-gap',
          display_title: 'DPCC longitudinal care inertia',
          macro_state: 'parked',
          user_next: 'explicit_resume',
          current_stage: 'parked',
          active_run_id: null,
          worker_state: 'stopped',
          last_seen_at: '2026-05-08T15:11:59+00:00',
          freshness: {
            status: 'not_required',
            summary: '当前阶段以人工判断或收尾为主。',
          },
          blocker_summary: [],
          next_action_summary: '等待用户显式恢复或给出新方案。',
          source_refs: [],
          links: {
            progress_payload_ref: 'artifacts/runtime/progress_portal/studies/004-dpcc-longitudinal-care-inertia-intensification-gap/latest.json',
            conversation_read_model_ref: null,
            live_console_read_model_ref: null,
            terminal_attach_status_ref: null,
            artifact_refs: [],
          },
          actions: {},
        },
      ],
      terminal: {
        mode: 'read_only_tail',
        reason: 'interactive attach is not requested by this projection.',
        endpoints: null,
        token_required: true,
        lease_required: true,
        audit_ref: 'artifacts/runtime/terminal_attach/read_model/latest.json',
      },
      authority: {
        opl_role: 'projection_consumer_and_action_transport_only',
        mas_truth_owner: true,
        forbidden_writes: [
          'study_truth',
          'publication_judgment',
          'quality_verdict',
          'runtime_authority',
          'artifact_authority',
        ],
      },
    },
  };
}
