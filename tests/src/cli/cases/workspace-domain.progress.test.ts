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
  const progressCommand = buildManifestCommand({
    study_id: studyId,
    study_root: studyRoot,
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
  fs.writeFileSync(path.join(controllerDir, 'study_charter.json'), `${JSON.stringify({
    study_id: studyId,
    title: 'Clinically interpretable invasive phenotype architecture',
    publication_objective: 'Reconstruct the invasive phenotype architecture around the Knosp boundary.',
    paper_framing_summary: 'This is a paper-facing study, not a generic project summary.',
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
    assert.equal(brief.project_progress.progress_feedback.runtime_status, 'live');
    assert.equal(brief.project_progress.recommended_commands.progress, progressCommand);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspace.fixtureRoot, { recursive: true, force: true });
  }
});
