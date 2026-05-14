import { assert, createFamilyContractsFixtureRoot, fs, os, path, runCli, test } from '../helpers.ts';
import { bindRealManifest, shellArg } from './workspace-domain.stages.real-smoke-helpers.ts';

type SnapshotStageItem = {
  project_id: string;
  family_stage_control_plane?: {
    parity: { status: string };
    stage_count: number;
  };
  family_stage_workbench?: {
    non_authority_flags: {
      opl_writes_domain_truth: boolean;
    };
  };
};

test('family stage control plane resolves real MAS RCA MAG manifests when local checkouts are present', { skip: process.env.OPL_REAL_STAGE_SMOKE !== '1' }, () => {
  const roots = {
    mas: process.env.OPL_REAL_MAS_REPO ?? '/Users/gaofeng/workspace/med-autoscience/.worktrees/mas-stage-control-deep-adapter',
    rca: process.env.OPL_REAL_RCA_REPO ?? '/Users/gaofeng/workspace/redcube-ai/.worktrees/rca-stage-control-hardening',
    mag: process.env.OPL_REAL_MAG_REPO ?? '/Users/gaofeng/workspace/med-autogrant/.worktrees/mag-stage-control-hardening',
  };
  for (const [name, root] of Object.entries(roots)) {
    if (!fs.existsSync(root)) {
      test.skip(`missing ${name} checkout: ${root}`);
      return;
    }
  }

  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-real-family-stage-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-real-family-stage-workspace-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masProfile = path.join(workspaceRoot, 'mas.profile.toml');
  const masWorkspace = path.join(workspaceRoot, 'mas-workspace');
  const redcubeWorkspace = path.join(workspaceRoot, 'redcube-workspace');
  const magInput = path.join(roots.mag, 'examples', 'nsfc_workspace_p2c_critique.json');
  fs.mkdirSync(path.join(masWorkspace, 'runtime', 'quests'), { recursive: true });
  fs.mkdirSync(path.join(masWorkspace, 'studies'), { recursive: true });
  fs.mkdirSync(path.join(masWorkspace, 'portfolio'), { recursive: true });
  fs.mkdirSync(redcubeWorkspace, { recursive: true });
  fs.writeFileSync(
    masProfile,
    [
      'name = "opl-real-stage-smoke"',
      `workspace_root = ${JSON.stringify(masWorkspace)}`,
      `runtime_root = ${JSON.stringify(path.join(masWorkspace, 'runtime', 'quests'))}`,
      `studies_root = ${JSON.stringify(path.join(masWorkspace, 'studies'))}`,
      `portfolio_root = ${JSON.stringify(path.join(masWorkspace, 'portfolio'))}`,
      'default_publication_profile = "general_medical_journal"',
      'default_citation_style = "AMA"',
      'enable_medical_overlay = true',
      'medical_overlay_scope = "workspace"',
      'medical_overlay_skills = ["intake-audit", "baseline", "write", "finalize"]',
      'research_route_bias_policy = "high_plasticity_medical"',
      'preferred_study_archetypes = ["clinical_classifier"]',
      '',
    ].join('\n'),
  );

  try {
    bindRealManifest({
      project: 'medautoscience',
      workspacePath: roots.mas,
      manifestCommand: `uv run python -m med_autoscience.cli product manifest --profile ${shellArg(masProfile)} --format json`,
      stateRoot,
      contractsRoot: fixtureContractsRoot,
    });
    bindRealManifest({
      project: 'redcube',
      workspacePath: roots.rca,
      manifestCommand: `npm run --silent redcube -- product manifest --workspace-root ${shellArg(redcubeWorkspace)}`,
      stateRoot,
      contractsRoot: fixtureContractsRoot,
    });
    bindRealManifest({
      project: 'medautogrant',
      workspacePath: roots.mag,
      manifestCommand: `uv run medautogrant product manifest --input ${shellArg(magInput)} --format json`,
      stateRoot,
      contractsRoot: fixtureContractsRoot,
    });

    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_stages.summary.resolved_planes_count, 3);
    assert.equal(list.family_stages.domains.every((domain: { ready: boolean }) => domain.ready), true);
    assert.equal(list.family_stages.stages.length >= 18, true);

    const masInspect = runCli(['stages', 'inspect', '--domain', 'mas', '--stage', 'manuscript_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(masInspect.family_stage.parity.status, 'aligned');
    assert.equal(masInspect.family_stage.workbench_projection.owner, 'MedAutoScience');
    assert.equal(masInspect.family_stage.workbench_projection.authority_boundary.can_write_domain_truth, false);
    assert.equal(masInspect.family_stage.workbench_projection.source_refs.length > 0, true);

    const rcaInspect = runCli(['stages', 'inspect', '--domain', 'rca', '--stage', 'artifact_creation'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(rcaInspect.family_stage.parity.status, 'aligned');
    assert.equal(rcaInspect.family_stage.workbench_projection.authority_boundary.rca_owns_artifact_authority, true);
    assert.equal(rcaInspect.family_stage.workbench_projection.freshness.status, 'current');

    const magInspect = runCli(['stages', 'inspect', '--domain', 'mag', '--stage', 'proposal_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(magInspect.family_stage.parity.status, 'aligned');
    assert.equal(magInspect.family_stage.workbench_projection.authority_boundary.can_write_grant_truth, false);
    assert.equal(magInspect.family_stage.workbench_projection.source_refs.length >= 5, true);

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const snapshotItems = [
      ...snapshot.runtime_tray_snapshot.running_items,
      ...snapshot.runtime_tray_snapshot.attention_items,
      ...snapshot.runtime_tray_snapshot.recent_items,
    ];
    const itemByProject = new Map(
      (snapshotItems as SnapshotStageItem[]).map((item) => [item.project_id, item]),
    );
    assert.equal(itemByProject.get('medautoscience')?.family_stage_control_plane?.parity.status, 'aligned');
    assert.equal(itemByProject.get('redcube')?.family_stage_control_plane?.stage_count, 6);
    assert.equal(
      itemByProject.get('medautogrant')?.family_stage_workbench?.non_authority_flags.opl_writes_domain_truth,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
