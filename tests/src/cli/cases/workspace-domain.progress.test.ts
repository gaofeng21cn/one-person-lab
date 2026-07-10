import {
  assert,
  buildManifestCommand,
  buildProjectProgressBrief,
  cliPath,
  createFamilyContractsFixtureRoot,
  createMasWorkspaceFixture,
  fs,
  loadFamilyManifestFixtures,
  loadFrameworkContracts,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('project progress promotes the active MAS study into a paper-facing summary', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-project-progress-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspace = createMasWorkspaceFixture();
  const studyId = '004-invasive-architecture';
  const studyRoot = path.join(workspace.fixtureRoot, 'studies', studyId);
  const controllerDir = path.join(studyRoot, 'artifacts', 'controller');
  const paperDir = path.join(studyRoot, 'paper');
  const questRoot = path.join(workspace.fixtureRoot, 'runtime', 'quests', studyId);
  const questPaperDir = path.join(questRoot, 'paper');
  const questPaperBuildDir = path.join(questPaperDir, 'build');
  const progressCommand = buildManifestCommand({
    study_id: studyId,
    study_root: studyRoot,
    quest_root: questRoot,
    current_stage: 'publication_supervision',
    current_stage_summary: 'The manuscript is in publication supervision.',
    current_blockers: [],
    next_system_action: 'continue submission package review',
    progress_freshness: {
      latest_progress_time_label: '2026-07-10 08:00 UTC',
      latest_progress_summary: 'The paper-facing package moved forward.',
      latest_progress_source: 'publication_eval',
    },
    supervision: { health_status: 'live', active_run_id: 'run-paper-004' },
  });
  const cockpitCommand = buildManifestCommand({
    studies: [{
      study_id: studyId,
      study_root: studyRoot,
      current_stage: 'publication_supervision',
      current_stage_summary: 'The manuscript is in publication supervision.',
      current_blockers: [],
      next_system_action: 'continue submission package review',
      monitoring: { health_status: 'live', active_run_id: 'run-paper-004' },
      progress_freshness: {
        status: 'fresh',
        latest_progress_at: '2026-07-10T08:00:00Z',
        latest_progress_time_label: '2026-07-10 08:00 UTC',
        latest_progress_summary: 'The paper-facing package moved forward.',
        latest_progress_source: 'publication_eval',
      },
      commands: { progress: progressCommand },
    }],
  });

  fs.mkdirSync(controllerDir, { recursive: true });
  fs.mkdirSync(paperDir, { recursive: true });
  fs.mkdirSync(path.join(questPaperDir, 'figures'), { recursive: true });
  fs.mkdirSync(path.join(questPaperDir, 'tables'), { recursive: true });
  fs.mkdirSync(questPaperBuildDir, { recursive: true });
  fs.writeFileSync(path.join(controllerDir, 'study_charter.json'), `${JSON.stringify({
    study_id: studyId,
    title: 'Clinically interpretable invasive phenotype architecture',
    publication_objective: 'Reconstruct the invasive phenotype architecture around the Knosp boundary.',
    paper_framing_summary: 'This is a paper-facing study, not a generic project summary.',
  })}\n`);
  fs.writeFileSync(path.join(paperDir, 'paper_experiment_matrix.json'), `${JSON.stringify({
    current_judgment: {
      current_judgment: 'Beyond-Knosp stayed negative while the bounded extension reached AUROC 0.7999.',
    },
  })}\n`);
  fs.writeFileSync(path.join(questPaperDir, 'figures', 'figure_catalog.json'), `${JSON.stringify({
    figures: [
      { figure_id: 'F1', paper_role: 'main_text' },
      { figure_id: 'F2', paper_role: 'main_text' },
      { figure_id: 'F3', paper_role: 'main_text' },
      { figure_id: 'S1', paper_role: 'supplementary' },
    ],
  })}\n`);
  fs.writeFileSync(path.join(questPaperDir, 'tables', 'table_catalog.json'), `${JSON.stringify({
    tables: [
      { table_id: 'T1', paper_role: 'main_text' },
      { table_id: 'T2', paper_role: 'main_text' },
      { table_id: 'TA1', paper_role: 'supplementary' },
    ],
  })}\n`);
  fs.writeFileSync(path.join(questPaperDir, 'reference_coverage_report.json'), `${JSON.stringify({
    record_count: 32,
  })}\n`);
  fs.writeFileSync(path.join(questPaperBuildDir, 'compile_report.json'), `${JSON.stringify({
    page_count: 12,
  })}\n`);

  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience) as Record<string, any>;
  manifest.workspace_locator.workspace_root = workspace.fixtureRoot;
  manifest.workspace_locator.profile_ref = workspace.profilePath;
  manifest.recommended_command = cockpitCommand;
  manifest.product_entry_shell.workspace_cockpit.command = cockpitCommand;
  manifest.operator_loop_surface.command = cockpitCommand;
  manifest.product_entry_overview.operator_loop_command = cockpitCommand;
  manifest.product_entry_overview.progress_surface.command = progressCommand;

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      workspace.fixtureRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const previousArgv = process.argv[1];
    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    let brief;
    try {
      process.argv[1] = cliPath;
      process.env.OPL_STATE_DIR = stateRoot;
      process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
      brief = await buildProjectProgressBrief(
        loadFrameworkContracts({ contractsDir: fixtureContractsRoot }),
        { workspacePath: workspace.fixtureRoot, sessionsLimit: 1 },
      );
    } finally {
      process.argv[1] = previousArgv;
      previousStateDir === undefined
        ? delete process.env.OPL_STATE_DIR
        : process.env.OPL_STATE_DIR = previousStateDir;
      previousContractsDir === undefined
        ? delete process.env.OPL_CONTRACTS_DIR
        : process.env.OPL_CONTRACTS_DIR = previousContractsDir;
    }

    const currentStudy = brief.project_progress.current_study;
    assert.ok(currentStudy, JSON.stringify(brief.project_progress, null, 2));
    assert.equal(currentStudy.study_id, studyId);
    assert.equal(currentStudy.title, 'Clinically interpretable invasive phenotype architecture');
    assert.ok(currentStudy.story_summary);
    assert.match(currentStudy.story_summary, /Knosp boundary/);
    assert.equal(currentStudy.current_stage, 'publication_supervision');
    assert.equal(currentStudy.monitoring.health_status, 'live');
    const paperSnapshot = currentStudy.paper_snapshot;
    assert.ok(paperSnapshot);
    assert.equal(paperSnapshot.main_figure_count, 3);
    assert.equal(paperSnapshot.supplementary_figure_count, 1);
    assert.equal(paperSnapshot.main_table_count, 2);
    assert.equal(paperSnapshot.supplementary_table_count, 1);
    assert.equal(paperSnapshot.reference_count, 32);
    assert.equal(paperSnapshot.page_count, 12);
    assert.equal(
      paperSnapshot.current_effect_summary,
      'Beyond-Knosp stayed negative while the bounded extension reached AUROC 0.7999.',
    );
    assert.equal(brief.project_progress.progress_feedback.runtime_status, 'live');
    assert.equal(brief.project_progress.recommended_commands.progress, progressCommand);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspace.fixtureRoot, { recursive: true, force: true });
  }
});
