import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { familyRuntimeEnv, writeJsonEmitterScript } from './family-runtime-binding-intake-helpers.ts';

test('family-runtime intake derives MAS domain-handler export from active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-'));
  const masWorkspacePath = path.join(fixtureRoot, 'med-autoscience');
  const profilePath = path.join(fixtureRoot, 'nfpitnet.workspace.toml');
  const proofPath = path.join(stateRoot, 'family-runtime', 'proofs', 'latest-temporal-production-proof.json');
  const cleanRunnerPath = path.join(masWorkspacePath, 'scripts', 'run-python-clean.sh');
  const runnerArgvPath = path.join(fixtureRoot, 'clean-runner.argv');
  const runnerCwdPath = path.join(fixtureRoot, 'clean-runner.cwd');
  fs.mkdirSync(masWorkspacePath, { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, '{"closeout_status":"production_residency_proven"}\n', 'utf8');
  fs.mkdirSync(path.dirname(cleanRunnerPath), { recursive: true });
  writeJsonEmitterScript(cleanRunnerPath, {
    surface_kind: 'mas_family_domain_handler_export',
    provider_guarded_soak: {
      status: 'available',
      provider_attempt_available: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal',
        dispatch_owner: 'med-autoscience',
        payload: {
          profile: '/tmp/nfpitnet.workspace.toml',
          study_id: 'DM002',
          provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
          authority_boundary: 'mas_owner_guarded_apply_only',
        },
      },
    ],
  }, {
    cwdPath: runnerCwdPath,
    argvPath: runnerArgvPath,
  });
  const env = familyRuntimeEnv(stateRoot, {
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
  });
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspacePath,
      '--profile',
      profilePath,
    ], env);
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'binding-derived-export',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    const runnerArgv = fs.readFileSync(runnerArgvPath, 'utf8').trim().split('\n');
    assert.equal(exportResult.command_source, 'workspace_binding');
    assert.equal(exportResult.command_cwd, path.resolve(masWorkspacePath));
    assert.deepEqual(exportResult.command_preview, [
      cleanRunnerPath,
      '-m',
      'med_autoscience.cli',
      'domain-handler',
      'export',
      '--profile',
      path.resolve(profilePath),
      '--opl-production-proof',
      path.resolve(proofPath),
      '--format',
      'json',
    ]);
    assert.equal(
      fs.realpathSync(fs.readFileSync(runnerCwdPath, 'utf8').trim()),
      fs.realpathSync(path.resolve(masWorkspacePath)),
    );
    assert.deepEqual(runnerArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.provider_attempt_id, 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks stale MAS workspace binding without clean runner', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-missing-runner-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-missing-runner-'));
  const masWorkspacePath = path.join(fixtureRoot, 'med-autoscience');
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const workspaceRegistryPath = path.join(stateRoot, 'workspace-registry.json');
  fs.mkdirSync(masWorkspacePath, { recursive: true });
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');

  try {
    fs.writeFileSync(workspaceRegistryPath, `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'active-stale-mas-binding',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: masWorkspacePath,
          label: 'Active stale MAS binding',
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: masWorkspacePath,
              profile_ref: profilePath,
              input_path: null,
            },
          },
          created_at: '2026-06-28T00:00:00.000Z',
          updated_at: '2026-06-28T00:00:00.000Z',
          archived_at: null,
        },
      ],
    }, null, 2)}\n`, 'utf8');

    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'missing-runner-binding',
    ], familyRuntimeEnv(stateRoot));
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(exportResult.status, 'blocked');
    assert.equal(exportResult.command_source, 'workspace_binding');
    assert.equal(exportResult.reason, 'mas_workspace_binding_clean_runner_missing');
    assert.equal(
      exportResult.required_path,
      path.join(masWorkspacePath, 'scripts', 'run-python-clean.sh'),
    );
    assert.equal(
      exportResult.repair_action.action_id,
      'rebind_or_archive_stale_mas_workspace_binding',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
