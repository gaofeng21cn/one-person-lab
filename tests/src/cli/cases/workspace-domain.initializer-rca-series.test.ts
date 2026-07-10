import {
  assert,
  fs,
  parseJsonText,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { createWorkspaceFixture } from './workspace-domain-test-helper.ts';

function readJson(file: string) {
  return parseJsonText(fs.readFileSync(file, 'utf8')) as Record<string, any>;
}

test('workspace init is the RCA series integration owner for generated workspace readback', () => {
  const fixture = createWorkspaceFixture({
    agent: 'rca',
    workspaceId: 'visual-theme-a',
    projectId: 'deck-001',
  });
  try {
    const initialization = fixture.output.workspace_initialization;
    assert.equal(initialization.action, 'init');
    assert.equal(initialization.agent.agent_id, 'rca');
    assert.equal(initialization.profile.workspace_mode, 'series');
    assert.equal(initialization.binding.project_id, 'redcube');

    for (const relativePath of [
      'shared/sources',
      'shared/brand',
      'projects/deck-001/artifacts/stage_outputs',
      'control/opl/projections',
      'control/opl/reports',
    ]) {
      assert.equal(fs.statSync(path.join(fixture.workspacePath, relativePath)).isDirectory(), true, relativePath);
    }

    const index = readJson(path.join(fixture.workspacePath, 'workspace_index.json'));
    assert.equal(index.surface_kind, 'opl_workspace_index');
    assert.equal(index.agent.project_id, 'redcube');
    assert.equal(index.canonical_topology.project_collection_path, 'projects');
    assert.equal(index.projects[0].project_id, 'deck-001');
    assert.equal(index.projects[0].lifecycle.status, 'active');
    assert.equal(index.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(index.workspace_norm.authority_boundary.opl_can_create_owner_receipt, false);

    const inspection = runCli([
      'workspace', 'inspect', '--workspace', fixture.workspacePath,
    ], { OPL_STATE_DIR: fixture.stateRoot }).workspace_inspection;
    const inventory = runCli([
      'workspace', 'inventory', '--workspace', fixture.workspacePath,
    ], { OPL_STATE_DIR: fixture.stateRoot }).workspace_resource_inventory;
    const report = runCli([
      'workspace', 'report', '--workspace', fixture.workspacePath,
    ], { OPL_STATE_DIR: fixture.stateRoot }).workspace_report;
    assert.equal(inspection.current_project_id, 'deck-001');
    assert.equal(inventory.authority_boundary.inventory_can_store_resource_body, false);
    assert.equal(report.current_project.project_id, 'deck-001');
    assert.deepEqual(
      readJson(path.join(fixture.workspacePath, 'control/opl', 'reports', 'workspace_report.json')),
      readJson(path.join(fixture.workspacePath, 'workspace_report.json')),
    );
  } finally {
    fixture.cleanup();
  }
});
