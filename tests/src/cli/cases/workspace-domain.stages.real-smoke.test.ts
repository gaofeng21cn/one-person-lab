import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  bindRealManifest,
  buildGeneratedProductEntryManifestCommand,
} from './workspace-domain.stages.real-smoke-helpers.ts';

test('family stage control plane resolves real MAS RCA MAG generated product-entry projections', { skip: process.env.OPL_REAL_STAGE_SMOKE !== '1' }, () => {
  const roots = {
    mas: process.env.OPL_REAL_MAS_REPO ?? '/Users/gaofeng/workspace/med-autoscience',
    rca: process.env.OPL_REAL_RCA_REPO ?? '/Users/gaofeng/workspace/redcube-ai',
    mag: process.env.OPL_REAL_MAG_REPO ?? '/Users/gaofeng/workspace/med-autogrant',
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
  const masWorkspace = path.join(workspaceRoot, 'mas-workspace');
  const redcubeWorkspace = path.join(workspaceRoot, 'redcube-workspace');
  const magWorkspace = path.join(workspaceRoot, 'mag-workspace');
  for (const target of [masWorkspace, redcubeWorkspace, magWorkspace]) {
    fs.mkdirSync(target, { recursive: true });
  }

  try {
    bindRealManifest({
      project: 'medautoscience',
      workspacePath: roots.mas,
      manifestCommand: buildGeneratedProductEntryManifestCommand({
        frameworkRoot: repoRoot,
        repoDir: roots.mas,
        workspaceRoot: masWorkspace,
      }),
      stateRoot,
      contractsRoot: fixtureContractsRoot,
    });
    bindRealManifest({
      project: 'redcube',
      workspacePath: roots.rca,
      manifestCommand: buildGeneratedProductEntryManifestCommand({
        frameworkRoot: repoRoot,
        repoDir: roots.rca,
        workspaceRoot: redcubeWorkspace,
      }),
      stateRoot,
      contractsRoot: fixtureContractsRoot,
    });
    bindRealManifest({
      project: 'medautogrant',
      workspacePath: roots.mag,
      manifestCommand: buildGeneratedProductEntryManifestCommand({
        frameworkRoot: repoRoot,
        repoDir: roots.mag,
        workspaceRoot: magWorkspace,
      }),
      stateRoot,
      contractsRoot: fixtureContractsRoot,
    });

    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(list.family_stages.summary.resolved_planes_count, 3);
    assert.equal(list.family_stages.domains.every((domain: { ready: boolean }) => domain.ready), true);
    assert.deepEqual(
      list.family_stages.domains
        .map((domain: { project_id: string }) => domain.project_id)
        .sort(),
      ['medautogrant', 'medautoscience', 'redcube'],
    );
    assert.equal(list.family_stages.stages.length >= 18, true);

    const masInspect = runCli(['stages', 'inspect', '--domain', 'mas', '--stage', 'manuscript_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(masInspect.family_stage.parity.status, 'aligned');
    assert.equal(masInspect.family_stage.workbench_projection.owner, 'medautoscience');
    assert.equal(masInspect.family_stage.workbench_projection.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(masInspect.family_stage.workbench_projection.source_refs.length > 0, true);

    const rcaInspect = runCli(['stages', 'inspect', '--domain', 'rca', '--stage', 'artifact_creation'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(rcaInspect.family_stage.parity.status, 'aligned');
    assert.equal(rcaInspect.family_stage.workbench_projection.authority_boundary.domain_truth_owner, 'redcube_ai');
    assert.equal(rcaInspect.family_stage.workbench_projection.authority_boundary.opl_can_authorize_quality_or_export, false);
    assert.match(rcaInspect.family_stage.workbench_projection.freshness.stage_manifest_sha256, /^[a-f0-9]{64}$/);

    const magInspect = runCli(['stages', 'inspect', '--domain', 'mag', '--stage', 'proposal_authoring'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(magInspect.family_stage.parity.status, 'aligned');
    assert.equal(magInspect.family_stage.workbench_projection.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(magInspect.family_stage.workbench_projection.source_refs.length >= 1, true);

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    const snapshotItems = [
      ...snapshot.runtime_tray_snapshot.running_items,
      ...snapshot.runtime_tray_snapshot.attention_items,
      ...snapshot.runtime_tray_snapshot.recent_items,
    ];
    assert.equal(
      snapshotItems.some(
        (item: { project_id: string }) => ['medautogrant', 'medautoscience', 'redcube'].includes(item.project_id),
      ),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
