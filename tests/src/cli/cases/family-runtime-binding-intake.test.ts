import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime intake derives MAS sidecar export from active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-export-'));
  const masWorkspacePath = path.join(fixtureRoot, 'med-autoscience');
  const profilePath = path.join(fixtureRoot, 'nfpitnet.workspace.toml');
  const proofPath = path.join(stateRoot, 'family-runtime', 'proofs', 'latest-temporal-production-proof.json');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  fs.mkdirSync(masWorkspacePath, { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "nfpitnet"\n', 'utf8');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, '{"closeout_status":"production_residency_proven"}\n', 'utf8');
  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$PWD" > ${shellSingleQuote(uvCwdPath)}
printf '%s\\n' "$@" > ${shellSingleQuote(uvArgvPath)}
cat <<'JSON'
{
  "surface_kind": "mas_family_sidecar_export",
  "provider_guarded_soak": {
    "status": "available",
    "provider_attempt_available": true
  },
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/guarded-apply",
      "priority": 95,
      "source": "mas-sidecar-export",
      "dedupe_key": "mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal",
      "dispatch_owner": "med-autoscience",
      "payload": {
        "profile": "/tmp/nfpitnet.workspace.toml",
        "study_id": "DM002",
        "provider_attempt_id": "opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply",
        "authority_boundary": "mas_owner_guarded_apply_only"
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
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
    const uvArgv = fs.readFileSync(uvArgvPath, 'utf8').trim().split('\n');

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    assert.equal(exportResult.command_source, 'workspace_binding');
    assert.equal(exportResult.command_cwd, path.resolve(masWorkspacePath));
    assert.deepEqual(exportResult.command_preview, [
      'uv',
      'run',
      'python',
      '-m',
      'med_autoscience.cli',
      'sidecar',
      'export',
      '--profile',
      path.resolve(profilePath),
      '--opl-production-proof',
      path.resolve(proofPath),
      '--format',
      'json',
    ]);
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(path.resolve(masWorkspacePath)),
    );
    assert.deepEqual(uvArgv, exportResult.command_preview.slice(1));
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.provider_attempt_id, 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
