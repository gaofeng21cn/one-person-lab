import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import { createWorkspaceFixture } from './workspace-domain-test-helper.ts';

function writeRegistry(
  stateRoot: string,
  binding: Record<string, unknown> | Array<Record<string, unknown>>,
) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(path.join(stateRoot, 'workspace-registry.json'), `${JSON.stringify({
    version: 'g2',
    bindings: Array.isArray(binding) ? binding : [binding],
  }, null, 2)}\n`);
}

function registryBinding(
  bindingId: string,
  workspacePath: string,
  options: {
    projectId?: string;
    project?: string;
    status?: 'active' | 'inactive' | 'archived';
  } = {},
) {
  const status = options.status ?? 'inactive';
  return {
    binding_id: bindingId,
    project_id: options.projectId ?? 'redcube',
    project: options.project ?? 'redcube-ai',
    workspace_path: workspacePath,
    label: bindingId,
    status,
    direct_entry: {
      command: null,
      manifest_command: null,
      url: null,
      workspace_locator: null,
    },
    created_at: '2026-07-13T00:00:00.000Z',
    updated_at: '2026-07-13T00:00:00.000Z',
    archived_at: status === 'archived' ? '2026-07-13T00:00:00.000Z' : null,
  };
}

function createRegistryPruneFixture() {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-prune-state-'));
  const existingWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-prune-existing-'));
  const staleInactivePath = path.join(stateRoot, 'missing', 'inactive-workspace');
  const staleArchivedPath = path.join(stateRoot, 'missing', 'archived-workspace');
  const nonDirectoryPath = path.join(stateRoot, 'workspace-file');
  fs.writeFileSync(nonDirectoryPath, 'not a workspace directory\n');
  writeRegistry(stateRoot, [
    registryBinding('stale-inactive', staleInactivePath),
    registryBinding('stale-archived', staleArchivedPath, { status: 'archived' }),
    registryBinding('existing-inactive', existingWorkspacePath),
    registryBinding('existing-active', repoRoot, { status: 'active' }),
    registryBinding('non-directory-inactive', nonDirectoryPath),
  ]);
  return {
    stateRoot,
    existingWorkspacePath,
    cleanup: () => {
      fs.rmSync(stateRoot, { recursive: true, force: true });
      fs.rmSync(existingWorkspacePath, { recursive: true, force: true });
    },
  };
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

test('workspace catalog lists all existing MAS workspaces while active remains only the default context', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-multi-workspace-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-multi-workspaces-'));
  const workspaces = ['diabetes', 'pitnet', 'obesity'].map((name) => {
    const workspacePath = path.join(workspaceRoot, name);
    fs.mkdirSync(workspacePath);
    return { name, workspacePath };
  });
  try {
    writeRegistry(stateRoot, workspaces.map(({ name, workspacePath }, index) =>
      registryBinding(`mas-${name}`, workspacePath, {
        projectId: 'medautoscience',
        project: 'med-autoscience',
        status: index === 0 ? 'active' : 'inactive',
      })));

    const project = runCli(['workspace', 'list'], { OPL_STATE_DIR: stateRoot })
      .workspace_catalog.projects.find((entry: { project_id: string }) =>
        entry.project_id === 'medautoscience');
    assert.equal(project.active_binding.binding_id, 'mas-diabetes');
    assert.equal(project.bindings.length, 3);
    assert.deepEqual(
      project.bindings.map((entry: {
        binding_id: string;
        is_default_context: boolean;
        workspace_path_currentness: { status: string };
      }) => [
        entry.binding_id,
        entry.is_default_context,
        entry.workspace_path_currentness.status,
      ]),
      [
        ['mas-diabetes', true, 'current'],
        ['mas-pitnet', false, 'current'],
        ['mas-obesity', false, 'current'],
      ],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace list, fleet, and report retain invalid-index bindings as catalog entries with separate health diagnostics', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-invalid-index-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-invalid-index-workspace-'));
  try {
    fs.writeFileSync(path.join(workspacePath, 'workspace_index.json'), '[]\n');
    writeRegistry(stateRoot, registryBinding('invalid-index-binding', workspacePath, {
      projectId: 'medautoscience',
      project: 'med-autoscience',
      status: 'active',
    }));

    const listedProject = runCli(['workspace', 'list'], { OPL_STATE_DIR: stateRoot })
      .workspace_catalog.projects.find((entry: { project_id: string }) =>
        entry.project_id === 'medautoscience');
    assert.equal(listedProject.bindings.length, 1);
    assert.equal(listedProject.bindings[0].status, 'active');
    assert.equal(listedProject.bindings[0].workspace_path_currentness.status, 'current');
    assert.equal('workspace_health' in listedProject.bindings[0], false);

    const fleet = runCli(['workspace', 'fleet', 'report'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_fleet_report;
    const fleetEntry = fleet.bindings.find((entry: { binding_id: string }) =>
      entry.binding_id === 'invalid-index-binding');
    assert.equal(fleetEntry.registry_binding.status, 'active');
    assert.equal(fleetEntry.registry_binding.workspace_path_currentness.status, 'current');
    assert.equal(fleetEntry.workspace_health.status, 'blocked');
    assert.equal(
      fleetEntry.workspace_health.findings.some((finding: { code: string }) =>
        finding.code === 'workspace_index_shape_invalid'),
      true,
    );

    const report = runCli(['workspace', 'report', '--workspace', workspacePath], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_report;
    assert.equal(report.report_status, 'diagnostic_only');
    assert.equal(report.registry.catalog_status, 'bound');
    assert.equal(report.registry.bindings[0].registry_status, 'active');
    assert.equal(report.workspace_health.status, 'blocked');
    assert.equal(report.current_project, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('workspace registry prune reports filesystem currentness without path-name heuristics', () => {
  const fixture = createRegistryPruneFixture();
  try {
    const registryFile = path.join(fixture.stateRoot, 'workspace-registry.json');
    const originalRegistry = fs.readFileSync(registryFile, 'utf8');
    const maintenance = runCli(
      ['workspace', 'maintenance', 'prune'],
      { OPL_STATE_DIR: fixture.stateRoot },
    ).workspace_registry_maintenance;

    assert.equal(maintenance.mode, 'dry_run');
    assert.equal(maintenance.status, 'stale_bindings_detected');
    assert.equal(maintenance.mutation_applied, false);
    assert.equal(maintenance.backup, null);
    assert.deepEqual(maintenance.summary, {
      bindings_before: 5,
      prune_candidates: 2,
      pruned_bindings: 0,
      active_binding_blockers: 0,
      bindings_after: 5,
      retained_bindings: 3,
    });
    assert.deepEqual(
      maintenance.candidates.map((entry: { binding_id: string }) => entry.binding_id).sort(),
      ['stale-archived', 'stale-inactive'],
    );
    assert.deepEqual(
      maintenance.retained_bindings.map((entry: {
        binding_id: string;
        retention_reason: string;
      }) => [entry.binding_id, entry.retention_reason]).sort(),
      [
        ['existing-active', 'workspace_path_exists'],
        ['existing-inactive', 'workspace_path_exists'],
        ['non-directory-inactive', 'path_exists_but_is_not_a_directory_or_is_unreadable'],
      ],
    );
    assert.equal(maintenance.criteria.path_classification_uses_filesystem_state_only, true);
    assert.equal(fs.readFileSync(registryFile, 'utf8'), originalRegistry);

    const conflict = runCliFailure(
      ['workspace', 'maintenance', 'prune', '--dry-run', '--apply'],
      { OPL_STATE_DIR: fixture.stateRoot },
    );
    assert.equal(conflict.payload.error.code, 'cli_usage_error');
  } finally {
    fixture.cleanup();
  }
});

test('workspace registry prune backs up before apply, is idempotent, and can be rolled back byte-for-byte', () => {
  const fixture = createRegistryPruneFixture();
  try {
    const registryFile = path.join(fixture.stateRoot, 'workspace-registry.json');
    const originalRegistry = fs.readFileSync(registryFile, 'utf8');
    const applied = runCli(
      ['workspace', 'maintenance', 'prune', '--apply'],
      { OPL_STATE_DIR: fixture.stateRoot },
    ).workspace_registry_maintenance;

    assert.equal(applied.mode, 'apply');
    assert.equal(applied.mutation_applied, true);
    assert.equal(applied.summary.pruned_bindings, 2);
    assert.equal(applied.summary.bindings_after, 3);
    assert.equal(fs.existsSync(applied.backup.path), true);
    assert.equal(fs.readFileSync(applied.backup.path, 'utf8'), originalRegistry);
    assert.equal(applied.backup.sha256, applied.backup.source_registry_sha256);
    const registryAfterApply = fs.readFileSync(registryFile, 'utf8');
    const remaining = parseJsonText(registryAfterApply) as {
      bindings: Array<{ binding_id: string; workspace_path: string }>;
    };
    assert.deepEqual(
      remaining.bindings.map((entry) => entry.binding_id).sort(),
      ['existing-active', 'existing-inactive', 'non-directory-inactive'],
    );
    assert.equal(
      remaining.bindings.some((entry) => entry.workspace_path === fixture.existingWorkspacePath),
      true,
    );

    const idempotent = runCli(
      ['workspace', 'maintenance', 'prune', '--apply'],
      { OPL_STATE_DIR: fixture.stateRoot },
    ).workspace_registry_maintenance;
    assert.equal(idempotent.mutation_applied, false);
    assert.equal(idempotent.no_changes_required, true);
    assert.equal(idempotent.summary.pruned_bindings, 0);
    assert.equal(idempotent.backup, null);
    assert.equal(fs.readFileSync(registryFile, 'utf8'), registryAfterApply);

    fs.copyFileSync(applied.backup.path, registryFile);
    assert.equal(fs.readFileSync(registryFile, 'utf8'), originalRegistry);
  } finally {
    fixture.cleanup();
  }
});

test('workspace registry archives an exact active missing binding before prune', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-active-missing-registry-'));
  const activeMissingPath = path.join(stateRoot, 'missing-active-workspace');
  const inactiveMissingPath = path.join(stateRoot, 'missing-inactive-workspace');
  try {
    writeRegistry(stateRoot, [
      registryBinding('active-missing', activeMissingPath, {
        projectId: 'medautoscience',
        project: 'med-autoscience',
        status: 'active',
      }),
      registryBinding('inactive-missing', inactiveMissingPath, {
        projectId: 'medautoscience',
        project: 'med-autoscience',
      }),
    ]);
    const registryFile = path.join(stateRoot, 'workspace-registry.json');
    const originalRegistry = fs.readFileSync(registryFile);
    const dryRun = runCli(['workspace', 'maintenance', 'prune'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_registry_maintenance;
    assert.equal(dryRun.status, 'blocked_active_binding_not_current');
    assert.deepEqual(
      dryRun.active_binding_blockers.map((entry: { binding_id: string }) => entry.binding_id),
      ['active-missing'],
    );
    assert.deepEqual(
      dryRun.candidates.map((entry: { binding_id: string }) => entry.binding_id),
      ['inactive-missing'],
    );
    assert.deepEqual(fs.readFileSync(registryFile), originalRegistry);

    const applyFailure = runCliFailure(['workspace', 'maintenance', 'prune', '--apply'], {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(applyFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      applyFailure.payload.error.details.failure_code,
      'active_workspace_binding_not_current',
    );
    assert.deepEqual(fs.readFileSync(registryFile), originalRegistry);
    assert.equal(fs.existsSync(path.join(stateRoot, 'backups')), false);

    const launchFailure = runCliFailure([
      'domain', 'launch', '--project', 'medautoscience', '--dry-run',
    ], { OPL_STATE_DIR: stateRoot });
    assert.equal(launchFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(
      launchFailure.payload.error.details.failure_code,
      'active_workspace_binding_not_current',
    );

    for (const action of ['bind', 'activate']) {
      const currentPathRequired = runCliFailure([
        'workspace', action, '--project', 'medautoscience', '--path', activeMissingPath,
      ], { OPL_STATE_DIR: stateRoot });
      assert.equal(currentPathRequired.payload.error.code, 'cli_usage_error', action);
    }
    const unknownArchive = runCliFailure([
      'workspace', 'archive', '--project', 'medautoscience', '--path', path.join(stateRoot, 'unknown'),
    ], { OPL_STATE_DIR: stateRoot });
    assert.equal(unknownArchive.payload.error.code, 'surface_not_found');

    const archived = runCli([
      'workspace', 'archive', '--project', 'medautoscience', '--path', activeMissingPath,
    ], { OPL_STATE_DIR: stateRoot }).workspace_catalog;
    assert.equal(archived.binding.binding_id, 'active-missing');
    assert.equal(archived.binding.status, 'archived');
    assert.equal(archived.binding.workspace_path, activeMissingPath);

    const afterArchive = runCli(['workspace', 'maintenance', 'prune'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_registry_maintenance;
    assert.equal(afterArchive.status, 'stale_bindings_detected');
    assert.equal(afterArchive.summary.active_binding_blockers, 0);
    assert.deepEqual(
      afterArchive.candidates.map((entry: { binding_id: string }) => entry.binding_id).sort(),
      ['active-missing', 'inactive-missing'],
    );

    const applied = runCli(['workspace', 'maintenance', 'prune', '--apply'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_registry_maintenance;
    assert.equal(applied.mutation_applied, true);
    assert.equal(applied.summary.pruned_bindings, 2);
    assert.equal(applied.summary.bindings_after, 0);
    assert.equal(fs.existsSync(applied.backup.path), true);
    assert.deepEqual(
      (parseJsonText(fs.readFileSync(registryFile, 'utf8')) as { bindings: unknown[] }).bindings,
      [],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace registry archives an exact retired project binding without reopening admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-retired-workspace-binding-'));
  const retiredWorkspacePath = path.join(stateRoot, 'missing-bookforge-workspace');
  try {
    writeRegistry(stateRoot, [
      registryBinding('retired-bookforge', retiredWorkspacePath, {
        projectId: 'opl-bookforge',
        project: 'opl-bookforge',
        status: 'active',
      }),
    ]);

    const archived = runCli([
      'workspace', 'archive', '--project', 'opl-bookforge', '--path', retiredWorkspacePath,
    ], { OPL_STATE_DIR: stateRoot }).workspace_catalog;
    assert.equal(archived.binding.binding_id, 'retired-bookforge');
    assert.equal(archived.binding.status, 'archived');

    const retiredBind = runCliFailure([
      'workspace', 'bind', '--project', 'opl-bookforge', '--path', stateRoot,
    ], { OPL_STATE_DIR: stateRoot });
    assert.equal(retiredBind.payload.error.code, 'domain_not_found');

    const applied = runCli(['workspace', 'maintenance', 'prune', '--apply'], {
      OPL_STATE_DIR: stateRoot,
    }).workspace_registry_maintenance;
    assert.equal(applied.summary.active_binding_blockers, 0);
    assert.equal(applied.summary.pruned_bindings, 1);
    assert.equal(applied.summary.bindings_after, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace registry does not reconstruct domain commands from legacy locator kinds', () => {
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
      expectedReady: 0,
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
    fs.mkdirSync(path.join(currentRoot, 'contracts'), { recursive: true });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(path.join(currentRoot, 'scripts', 'run-python-clean.sh'), '#!/bin/sh\n');
    fs.writeFileSync(profilePath, 'workspace_root = "."\n');
    fs.writeFileSync(path.join(currentRoot, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'medautoscience',
      standard_agent_interface: {
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          locator_surface_kind: 'fixture_mas_workspace_locator',
          default_profile_id: 'portfolio',
          workspace_kind: 'medical_research_workspace',
          project_kind: 'study',
          project_collection_label: 'studies',
          default_workspace_id: 'research-workspace',
          default_project_id: 'study-001',
          required_locator_fields: ['profile_ref'],
          optional_locator_fields: ['workspace_root'],
          entry_command_template: ['medautosci', 'product-entry-status', '--profile-ref', '{profile_ref}'],
          manifest_command_template: ['medautosci', 'product-entry-manifest', '--profile-ref', '{profile_ref}'],
        },
        runtime: {
          runtime_domain_id: 'medautoscience',
          dispatch_command: ['medautosci', 'domain-handler', 'dispatch'],
          registration_ref: 'contracts/domain_descriptor.json#/runtime',
        },
        progress: {
          deliverable_delta_aliases: ['paper_progress_delta'],
          platform_delta_aliases: ['platform_repair_delta'],
        },
        routing: {
          explicit_aliases: ['mas'],
          workstream_ids: ['research_ops'],
          intent_signals: ['submission_delivery'],
          ambiguity_policy: 'require_explicit_workstream',
        },
      },
    }, null, 2)}\n`);
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
      catalog.binding.direct_entry.command,
      `medautosci product-entry-status --profile-ref ${profilePath}`,
    );
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

test('workspace bind rejects a descriptor owned by another project', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cross-agent-binding-'));
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cross-agent-repo-'));
  try {
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'med-autoscience',
      standard_agent_interface: {
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          locator_surface_kind: 'mas_workspace',
          default_profile_id: 'portfolio',
          workspace_kind: 'medical_research_workspace',
          project_kind: 'study',
          project_collection_label: 'studies',
          default_workspace_id: 'research-workspace',
          default_project_id: 'study-001',
          required_locator_fields: ['workspace_root'],
          optional_locator_fields: [],
          entry_command_template: ['medautosci', 'status', '{workspace_root}'],
          manifest_command_template: ['medautosci', 'manifest', '{workspace_root}'],
        },
        runtime: { runtime_domain_id: 'medautoscience', dispatch_command: null, registration_ref: null },
        progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
        routing: {
          explicit_aliases: ['mas'],
          workstream_ids: ['research_ops'],
          intent_signals: ['research'],
          ambiguity_policy: 'require_explicit_workstream',
        },
      },
    })}\n`);
    const failure = runCliFailure([
      'workspace', 'bind',
      '--project', 'medautogrant',
      '--path', repoDir,
      '--workspace-root', repoDir,
    ], { OPL_STATE_DIR: stateRoot });
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.match(failure.payload.error.message, /identity does not match/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(repoDir, { recursive: true, force: true });
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
