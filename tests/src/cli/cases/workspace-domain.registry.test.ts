import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { createWorkspaceFixture } from './workspace-domain-test-helper.ts';

function writeRegistry(stateRoot: string, binding: Record<string, unknown>) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(path.join(stateRoot, 'workspace-registry.json'), `${JSON.stringify({
    version: 'g2',
    bindings: [binding],
  }, null, 2)}\n`);
}

test('workspace registry owns bind, list, and archive lifecycle only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-registry-'));
  try {
    const bound = runCli([
      'workspace', 'bind',
      '--project', 'redcube',
      '--path', repoRoot,
      '--entry-command', 'redcube-ai product-entry',
      '--manifest-command', 'redcube product manifest',
    ], { OPL_STATE_DIR: stateRoot }).workspace_catalog;

    const project = runCli(['workspace', 'list'], { OPL_STATE_DIR: stateRoot })
      .workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    assert.equal(bound.action, 'bind');
    assert.equal(project.active_binding.binding_id, bound.binding.binding_id);
    assert.deepEqual(project.bindings_count, {
      total: 1,
      active: 1,
      inactive: 0,
      archived: 0,
      direct_entry_ready: 1,
      manifest_ready: 1,
    });

    const archived = runCli([
      'workspace', 'archive', '--project', 'redcube', '--path', repoRoot,
    ], { OPL_STATE_DIR: stateRoot }).workspace_catalog;
    assert.equal(archived.binding.status, 'archived');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace registry derives entries only for valid locator-backed bindings', () => {
  const staleMasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-mas-binding-'));
  const cases = [
    {
      projectId: 'redcube',
      project: 'redcube-ai',
      workspacePath: repoRoot,
      locator: {
        surface_kind: 'redcube_workspace',
        workspace_root: repoRoot,
        profile_ref: null,
        input_path: null,
      },
      expectedReady: 1,
    },
    {
      projectId: 'medautoscience',
      project: 'med-autoscience',
      workspacePath: staleMasRoot,
      locator: {
        surface_kind: 'med_autoscience_workspace_profile',
        workspace_root: staleMasRoot,
        profile_ref: path.join(staleMasRoot, 'profile.toml'),
        input_path: null,
      },
      expectedReady: 0,
    },
  ];

  try {
    for (const row of cases) {
      const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-locator-binding-'));
      try {
        writeRegistry(stateRoot, {
          binding_id: `binding-${row.projectId}`,
          project_id: row.projectId,
          project: row.project,
          workspace_path: row.workspacePath,
          label: row.project,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: row.locator,
          },
          created_at: '2026-06-07T00:00:00.000Z',
          updated_at: '2026-06-07T00:00:00.000Z',
          archived_at: null,
        });

        const project = runCli(['workspace', 'list'], { OPL_STATE_DIR: stateRoot })
          .workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === row.projectId);
        assert.equal(project.bindings_count.direct_entry_ready, row.expectedReady, row.projectId);
        assert.equal(project.bindings_count.manifest_ready, row.expectedReady, row.projectId);
      } finally {
        fs.rmSync(stateRoot, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(staleMasRoot, { recursive: true, force: true });
  }
});

test('workspace bind replaces an active stale MAS locator binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-replace-stale-binding-'));
  const staleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stale-binding-root-'));
  const currentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-current-binding-root-'));
  const profilePath = path.join(currentRoot, 'profiles', 'local.toml');
  try {
    fs.mkdirSync(path.join(currentRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(path.join(currentRoot, 'scripts', 'run-python-clean.sh'), '#!/bin/sh\n');
    fs.writeFileSync(profilePath, 'workspace_root = "."\n');
    writeRegistry(stateRoot, {
      binding_id: 'stale-mas-binding',
      project_id: 'medautoscience',
      project: 'med-autoscience',
      workspace_path: staleRoot,
      label: 'stale MAS binding',
      status: 'active',
      direct_entry: {
        command: null,
        manifest_command: null,
        url: null,
        workspace_locator: {
          surface_kind: 'med_autoscience_workspace_profile',
          workspace_root: staleRoot,
          profile_ref: profilePath,
          input_path: null,
        },
      },
      created_at: '2026-06-27T00:00:00.000Z',
      updated_at: '2026-06-27T00:00:00.000Z',
      archived_at: null,
    });
    fs.rmSync(staleRoot, { recursive: true, force: true });

    const catalog = runCli([
      'workspace', 'bind',
      '--project', 'medautoscience',
      '--path', currentRoot,
      '--profile', profilePath,
    ], { OPL_STATE_DIR: stateRoot }).workspace_catalog;
    assert.equal(catalog.binding.workspace_path, currentRoot);
    assert.equal(
      catalog.bindings.find((entry: { binding_id: string }) => entry.binding_id === 'stale-mas-binding').status,
      'inactive',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(staleRoot, { recursive: true, force: true });
    fs.rmSync(currentRoot, { recursive: true, force: true });
  }
});

test('workspace fleet readback fails closed without executing direct-entry commands', () => {
  const fixture = createWorkspaceFixture({
    agent: 'rca',
    workspaceId: 'visual-theme-a',
    projectId: 'deck-001',
  });
  try {
    const healthPath = path.join(fixture.workspacePath, 'workspace_health.json');
    const health = parseJsonText(fs.readFileSync(healthPath, 'utf8')) as Record<string, unknown>;
    health.status = 'blocked';
    fs.writeFileSync(healthPath, `${JSON.stringify(health, null, 2)}\n`);
    runCli([
      'workspace', 'bind',
      '--project', 'medautogrant',
      '--path', fixture.workspaceRoot,
      '--entry-command', 'sh -c "touch should-not-run"',
      '--manifest-command', 'sh -c "touch manifest-should-not-run"',
    ], { OPL_STATE_DIR: fixture.stateRoot });

    const fleet = runCli(['workspace', 'fleet', 'report'], {
      OPL_STATE_DIR: fixture.stateRoot,
    }).workspace_fleet_report;
    assert.equal(fleet.status, 'blocked');
    assert.equal(fleet.authority_boundary.fleet_report_executes_direct_entry, false);
    assert.equal(fleet.authority_boundary.fleet_report_executes_manifest_command, false);
    assert.equal(fs.existsSync(path.join(fixture.workspaceRoot, 'should-not-run')), false);
    assert.equal(fs.existsSync(path.join(fixture.workspaceRoot, 'manifest-should-not-run')), false);
  } finally {
    fixture.cleanup();
  }
});
