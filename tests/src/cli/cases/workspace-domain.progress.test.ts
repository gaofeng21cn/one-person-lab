import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('project-progress promotes current MAS study into a paper-facing summary instead of stopping at project-level wording', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-project-progress-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masWorkspace = createMasWorkspaceFixture();
  const studyId = '004-invasive-architecture';
  const studyRoot = path.join(masWorkspace.fixtureRoot, 'studies', studyId);
  const controllerDir = path.join(studyRoot, 'artifacts', 'controller');
  const paperDir = path.join(studyRoot, 'paper');
  const questRoot = path.join(
    masWorkspace.fixtureRoot,
    'ops',
    'med-deepscientist',
    'runtime',
    'quests',
    '004-invasive-architecture-managed-20260408',
  );
  const questPaperDir = path.join(questRoot, 'paper');
  const questPaperBuildDir = path.join(questPaperDir, 'build');
  const questPaperFiguresDir = path.join(questPaperDir, 'figures');
  const questPaperTablesDir = path.join(questPaperDir, 'tables');

  fs.mkdirSync(controllerDir, { recursive: true });
  fs.mkdirSync(paperDir, { recursive: true });
  fs.mkdirSync(questPaperBuildDir, { recursive: true });
  fs.mkdirSync(questPaperFiguresDir, { recursive: true });
  fs.mkdirSync(questPaperTablesDir, { recursive: true });
  fs.writeFileSync(
    path.join(controllerDir, 'study_charter.json'),
    `${JSON.stringify({
      study_id: studyId,
      title: 'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
      publication_objective:
        '在首术 NF-PitNET 中，重构由侵袭负担、Knosp、视觉压迫与切除负担组成的 clinically interpretable invasive phenotype architecture，并把公开 MRI / omics 用作 anatomy / biology anchors。',
      paper_framing_summary:
        'The paper-facing route is a first-surgery NF-PitNET invasive phenotype architecture study rather than a generic workflow summary.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(paperDir, 'paper_experiment_matrix.json'),
    `${JSON.stringify({
      current_judgment: {
        current_judgment:
          'EXP-001 confirmed a deterministic Knosp split for invasiveness, EXP-002 stayed negative beyond Knosp, and EXP-003 preserved a bounded secondary non-GTR extension.',
      },
      rows: [
        {
          exp_id: 'EXP-001',
          status: 'first_compute_completed',
          title: 'Local phenotype architecture map',
        },
        {
          exp_id: 'EXP-002',
          status: 'negative_compute_completed',
          title: 'Beyond-Knosp invasiveness audit',
        },
        {
          exp_id: 'EXP-003',
          status: 'first_compute_completed',
          title: 'Non-GTR bounded extension audit',
          key_metrics: {
            auroc: 0.7999,
            delta_brier_vs_knosp_only: -0.011845,
          },
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperBuildDir, 'review_manuscript.md'),
    [
      '---',
      'title: "Clinically Interpretable Invasive Phenotype Architecture in First-Surgery NF-PitNET"',
      'bibliography: ../references.bib',
      '---',
      '',
      '## Abstract',
      '',
      '**Objective:** To reconstruct the local invasive phenotype architecture around the prespecified Knosp boundary in first-surgery NF-PitNET.\\',
      '**Results:** Knosp remained the dominant structural organizer, beyond-Knosp stayed negative, and the bounded non-GTR extension reached AUROC 0.7999 with delta Brier -0.011845.\\',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperDir, 'reference_coverage_report.json'),
    `${JSON.stringify({
      record_count: 32,
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperBuildDir, 'compile_report.json'),
    `${JSON.stringify({
      page_count: 12,
      proofing_summary: 'Compiled manuscript refreshed into a 12-page reviewer-facing PDF.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperDir, 'paper_bundle_manifest.json'),
    `${JSON.stringify({
      title: 'Clinically Interpretable Invasive Phenotype Architecture in First-Surgery NF-PitNET',
      summary:
        'The current reviewer bundle keeps main-text figures F1-F3, one supplementary figure S1, main tables T1-T2, and appendix table TA1 in sync.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperFiguresDir, 'figure_catalog.json'),
    `${JSON.stringify({
      figures: [
        { figure_id: 'F1', paper_role: 'main_text' },
        { figure_id: 'F2', paper_role: 'main_text' },
        { figure_id: 'F3', paper_role: 'main_text' },
        { figure_id: 'S1', paper_role: 'supplementary' },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperTablesDir, 'table_catalog.json'),
    `${JSON.stringify({
      tables: [
        { table_id: 'T1', paper_role: 'main_text' },
        { table_id: 'T2', paper_role: 'main_text' },
        { table_id: 'TA1', paper_role: 'supplementary' },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  const workspaceCockpitPayload = {
    schema_version: 1,
    workspace_root: masWorkspace.fixtureRoot,
    studies: [
      {
        study_id: studyId,
        current_stage: 'publication_supervision',
        current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
        current_blockers: [
          '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
        ],
        next_system_action: 'continue bundle stage',
        status_narration_contract: {
          schema_version: 1,
          contract_kind: 'ai_status_narration',
          contract_id: `study-progress::${studyId}`,
          surface_kind: 'study_progress',
          audience: 'human_user',
          milestone: {},
          stage: {
            current_stage: 'publication_supervision',
            recommended_next_stage: 'bundle_stage_ready',
            checkpoint_status: 'forward_progress',
          },
          readiness: {
            needs_physician_decision: false,
          },
          remaining_scope: {},
          current_blockers: [
            '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
          ],
          latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
          next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
          human_gate: {},
          facts: {
            study_id: studyId,
            quest_id: '004-invasive-architecture-managed-20260408',
          },
          narration_policy: {
            mode: 'ai_first',
            legacy_summary_role: 'fallback_only',
            style: 'plain_language',
            answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
          },
        },
        needs_physician_decision: false,
        monitoring: {
          browser_url: 'http://127.0.0.1:21001',
          quest_session_api_url: 'http://127.0.0.1:21001/api/quests/004/session',
          active_run_id: 'run-884e2a72',
          health_status: 'live',
          supervisor_tick_status: 'fresh',
        },
        task_intake: null,
        progress_freshness: {
          status: 'fresh',
          required: true,
          summary: '最近 12 小时内仍有明确研究推进记录。',
          latest_progress_at: '2026-04-15T11:24:35+00:00',
          latest_progress_time_label: '2026-04-15 11:24 UTC',
          latest_progress_source: 'publication_eval',
          latest_progress_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
        },
        commands: {
          progress: `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(
            [
              '# 研究进度',
              '',
              `- study_id: \`${studyId}\``,
              '- 当前阶段: 论文可发表性监管',
              '- 阶段摘要: 投稿打包阶段已被全局门控放行，可以进入关键路径。',
            ].join('\n'),
          )}`,
        },
      },
      {
        study_id: '003-endocrine-burden-followup',
        current_stage: 'managed_runtime_recovering',
        current_stage_summary: '系统正在推进托管运行进入可监督的在线状态。',
        current_blockers: ['仍有主线阻塞。'],
        next_system_action: '等待下一次巡检确认 worker 已重新上线并恢复 live。',
        needs_physician_decision: false,
        monitoring: {
          browser_url: null,
          quest_session_api_url: null,
          active_run_id: null,
          health_status: 'recovering',
          supervisor_tick_status: 'fresh',
        },
        task_intake: null,
        progress_freshness: {
          status: 'fresh',
          required: true,
          summary: '最近 12 小时内仍有明确研究推进记录。',
          latest_progress_at: '2026-04-15T11:20:00+00:00',
          latest_progress_time_label: '2026-04-15 11:20 UTC',
          latest_progress_source: 'publication_eval',
          latest_progress_summary: '论文包雏形已经存在，但当前硬阻塞仍在论文可发表性面。',
        },
        commands: {
          progress: buildManifestCommand({
            study_id: '003-endocrine-burden-followup',
          }),
        },
      },
    ],
    attention_queue: [],
    workspace_supervision: {
      summary: '4 个 study；当前监管心跳新鲜。',
    },
  };

  const manifest = structuredClone(fixtures.medautoscience) as Record<string, any>;
  manifest.workspace_locator.workspace_root = masWorkspace.fixtureRoot;
  manifest.workspace_locator.profile_ref = masWorkspace.profilePath;
  manifest.recommended_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_shell.workspace_cockpit.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.operator_loop_surface.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.recommended_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.operator_loop_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.progress_surface.command = buildManifestCommand({
    study_id: studyId,
    study_root: studyRoot,
    quest_id: '004-invasive-architecture-managed-20260408',
    quest_root: questRoot,
    current_stage: 'publication_supervision',
    current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
    paper_stage: 'bundle_stage_ready',
    paper_stage_summary: '论文当前建议推进到投稿打包阶段。',
    current_blockers: [
      '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
    ],
    next_system_action: 'continue bundle stage',
    status_narration_contract: {
      schema_version: 1,
      contract_kind: 'ai_status_narration',
      contract_id: `study-progress::${studyId}`,
      surface_kind: 'study_progress',
      audience: 'human_user',
      milestone: {},
      stage: {
        current_stage: 'publication_supervision',
        recommended_next_stage: 'bundle_stage_ready',
        checkpoint_status: 'forward_progress',
      },
      readiness: {
        needs_physician_decision: false,
      },
      remaining_scope: {},
      current_blockers: [
        '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
      ],
      latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
      next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
      human_gate: {},
      facts: {
        study_id: studyId,
        quest_id: '004-invasive-architecture-managed-20260408',
      },
      narration_policy: {
        mode: 'ai_first',
        legacy_summary_role: 'fallback_only',
        style: 'plain_language',
        answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
      },
    },
    progress_freshness: {
      latest_progress_time_label: '2026-04-15 11:24 UTC',
      latest_progress_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
      latest_progress_source: 'publication_eval',
    },
    supervision: {
      browser_url: 'http://127.0.0.1:21001',
      active_run_id: 'run-884e2a72',
      health_status: 'live',
    },
    latest_events: [
      {
        time_label: '2026-04-15 11:24 UTC',
        title: '发表可行性评估更新',
        summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
      },
    ],
    refs: {
      publication_eval_path: path.join(studyRoot, 'artifacts', 'publication_eval', 'latest.json'),
    },
  });
  manifest.operator_loop_actions.open_loop.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.operator_loop_actions.inspect_progress.command = buildManifestCommand({
    study_id: '<study_id>',
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspace.fixtureRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const contracts = loadGatewayContracts({ contractsDir: fixtureContractsRoot });
    const originalArgv1 = process.argv[1];
    const originalStateDir = process.env.OPL_STATE_DIR;
    const originalContractsDir = process.env.OPL_CONTRACTS_DIR;
    let payload: Awaited<ReturnType<typeof buildProjectProgressBrief>>;
    try {
      process.argv[1] = cliPath;
      process.env.OPL_STATE_DIR = stateRoot;
      process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
      payload = await buildProjectProgressBrief(contracts, {
        workspacePath: masWorkspace.fixtureRoot,
        sessionsLimit: 1,
      });
    } finally {
      process.argv[1] = originalArgv1;
      if (originalStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = originalStateDir;
      }
      if (originalContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = originalContractsDir;
      }
    }

    const currentStudy = payload.project_progress.current_study;
    assert.ok(currentStudy);
    const storySummary = currentStudy.story_summary;
    assert.ok(storySummary);
    const paperSnapshot = currentStudy.paper_snapshot;
    assert.ok(paperSnapshot);
    const currentEffectSummary = paperSnapshot.current_effect_summary;
    assert.ok(currentEffectSummary);

    assert.equal(currentStudy.study_id, studyId);
    assert.equal(
      currentStudy.title,
      'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
    );
    assert.match(storySummary, /侵袭负担.*Knosp.*公开 MRI \/ omics/);
    assert.equal(currentStudy.current_stage, 'publication_supervision');
    assert.equal(currentStudy.monitoring.health_status, 'live');
    assert.equal(paperSnapshot.main_figure_count, 3);
    assert.equal(paperSnapshot.supplementary_figure_count, 1);
    assert.equal(paperSnapshot.main_table_count, 2);
    assert.equal(paperSnapshot.supplementary_table_count, 1);
    assert.equal(paperSnapshot.reference_count, 32);
    assert.equal(paperSnapshot.page_count, 12);
    assert.ok(currentEffectSummary.includes('AUROC 0.7999'));
    assert.match(currentEffectSummary, /negative/i);
    assert.match(payload.project_progress.progress_summary, /004-invasive-architecture/);
    assert.match(payload.project_progress.progress_summary, /3 张主图/);
    assert.match(payload.project_progress.progress_summary, /32 篇参考文献/);
    assert.ok(currentStudy.status_narration_contract);
    assert.equal(currentStudy.status_narration_contract.latest_update, '论文主体内容已经完成，当前进入投稿打包收口。');
    assert.equal(payload.project_progress.progress_feedback.current_status, 'publication_supervision');
    assert.equal(payload.project_progress.progress_feedback.runtime_status, 'live');
    assert.equal(payload.project_progress.progress_feedback.headline, '论文主体内容已经完成，当前进入投稿打包收口。');
    assert.match(payload.project_progress.progress_feedback.latest_update, /2026-04-15 11:24 UTC/);
    assert.equal(
      payload.project_progress.progress_feedback.next_step,
      '优先核对 submission package 与 studies 目录中的交付面是否一致。',
    );
    assert.equal(payload.project_progress.workspace_inbox.summary.known_task_count, 3);
    assert.equal(payload.project_progress.workspace_inbox.summary.running_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.waiting_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.ready_count, 0);
    assert.equal(payload.project_progress.workspace_inbox.summary.delivered_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.active_task_id, studyId);
    assert.equal(payload.project_progress.workspace_inbox.sections.running[0].task_id, studyId);
    assert.equal(payload.project_progress.runtime_continuity.control.surface_kind, 'runtime_control');
    assert.equal(payload.project_progress.runtime_continuity.control.restore_point, 'phase_2_user_product_loop');
    assert.equal(
      payload.project_progress.runtime_continuity.control.control_surfaces.resume.surface_kind,
      'launch_study',
    );
    assert.equal(
      payload.project_progress.recommended_commands.approval,
      'uv run python -m med_autoscience.cli study-runtime-status --profile /fixtures/med-autoscience/profile.local.toml --study-id <study_id> --format json',
    );
    assert.equal(
      payload.project_progress.recommended_commands.artifacts,
      'uv run python -m med_autoscience.cli study-runtime-status --profile /fixtures/med-autoscience/profile.local.toml --study-id <study_id> --format json',
    );
    assert.equal(
      payload.project_progress.workspace_inbox.sections.running[0].summary,
      '当前状态：论文可发表性监管；下一阶段：投稿打包就绪；当前卡点：当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
    );
    assert.ok(
      payload.project_progress.workspace_inbox.sections.waiting.some(
        (entry: { task_id: string }) => entry.task_id === '003-endocrine-burden-followup',
      ),
    );
    assert.equal(payload.project_progress.workspace_inbox.sections.delivered[0].deliverable_count, 3);
    assert.ok(payload.project_progress.user_options.includes('展开当前论文的详细进度'));
    assert.ok(payload.project_progress.inspect_paths.includes(studyRoot));
    assert.equal(payload.project_progress.workspace_files.deliverable_files.length, 3);
    assert.equal(payload.project_progress.workspace_files.supporting_files.length, 4);
    assert.equal(payload.project_progress.workspace_files.deliverable_files[0].file_id, 'review_manuscript');
    assert.equal(payload.project_progress.workspace_files.deliverable_files[0].kind, 'deliverable');
    assert.match(
      payload.project_progress.workspace_files.deliverable_files[0].path,
      /paper\/build\/review_manuscript\.md$/,
    );
    assert.ok(
      payload.project_progress.workspace_files.supporting_files.some(
        (entry: { file_id: string }) => entry.file_id === 'figure_catalog',
      ),
    );
    assert.equal(
      payload.project_progress.recommended_commands.progress,
      workspaceCockpitPayload.studies[0].commands.progress,
    );
    assert.doesNotMatch(
      payload.project_progress.recommended_commands.progress,
      /--format json/,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masWorkspace.fixtureRoot, { recursive: true, force: true });
  }
});

