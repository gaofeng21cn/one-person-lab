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

test('project progress consumes the domain-owned operator projection without interpreting paper artifacts', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-project-progress-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspace = createMasWorkspaceFixture();
  const deliverablePath = path.join(workspace.fixtureRoot, 'outputs', 'domain-deliverable.pdf');
  const inspectPath = path.join(workspace.fixtureRoot, 'operator-progress.json');
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience) as Record<string, any>;
  delete manifest.family_stage_control_plane;
  manifest.workspace_locator.workspace_root = workspace.fixtureRoot;
  manifest.workspace_locator.profile_ref = workspace.profilePath;
  const forbiddenCompatibilityCommand = 'node -e "process.exit(71)"';
  manifest.operator_loop_surface = {
    ...manifest.operator_loop_surface,
    surface_kind: 'workspace_cockpit',
    command: forbiddenCompatibilityCommand,
  };
  manifest.recommended_command = forbiddenCompatibilityCommand;
  manifest.product_entry_shell.workspace_cockpit.command = forbiddenCompatibilityCommand;
  manifest.product_entry_overview.operator_loop_command = forbiddenCompatibilityCommand;
  manifest.progress_projection = {
    surface_kind: 'progress_projection',
    headline: 'Domain owner reports that the current deliverable moved forward.',
    latest_update: '2026-07-11T08:00:00Z',
    next_step: 'Request the next domain-owner receipt.',
    status_summary: 'Work remains domain-owned and is awaiting its next receipt.',
    session_id: 'domain-session-004',
    current_status: 'active',
    runtime_status: 'ready',
    inspect_paths: [inspectPath],
    attention_items: ['Domain owner receipt is still required.'],
    human_gate_ids: ['domain_owner_acceptance_gate'],
    progress_surface: {
      surface_kind: 'domain_operator_progress',
      summary: 'Inspect the domain-owned progress projection.',
      command: 'domain-cli progress --json',
    },
    domain_projection: {
      clinical_question: 'This opaque field must not be interpreted by Console.',
      paper_snapshot: { page_count: 12 },
    },
  };
  manifest.artifact_inventory = {
    surface_kind: 'artifact_inventory',
    workspace_path: workspace.fixtureRoot,
    inspect_paths: [deliverablePath],
    deliverable_files: [{
      file_id: 'domain-deliverable',
      label: 'Domain deliverable',
      kind: 'deliverable',
      path: deliverablePath,
      summary: 'Domain-owned deliverable projection.',
    }],
    supporting_files: [],
  };

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

    assert.equal(brief.project_progress.current_study, null);
    assert.equal(
      brief.project_progress.progress_summary,
      'Domain owner reports that the current deliverable moved forward.',
      JSON.stringify(brief.project_progress, null, 2),
    );
    assert.equal(brief.project_progress.next_focus, 'Request the next domain-owner receipt.');
    assert.deepEqual(
      brief.project_progress.attention_items,
      ['Domain owner receipt is still required.'],
    );
    assert.equal(brief.project_progress.workspace_files.deliverable_files[0]?.path, deliverablePath);
    assert.equal(
      brief.project_progress.recommended_commands.progress,
      brief.project_progress.runtime_continuity.control?.control_surfaces.progress?.command,
    );
    assert.equal(brief.project_progress.configured_human_gates[0]?.label, '存在一个域侧人工判断口');
    assert.equal('paper_snapshot' in brief.project_progress, false);
    assert.equal('clinical_question' in brief.project_progress, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspace.fixtureRoot, { recursive: true, force: true });
  }
});
