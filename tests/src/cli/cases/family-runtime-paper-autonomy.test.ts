import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime hydrates MAS provider-hosted guarded apply tasks without truth authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-guarded-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-guarded-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task-path');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_sidecar_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/guarded-apply",
      "priority": 30,
      "source": "mas-sidecar-export",
      "dedupe_key": "mas:dm-cvd:DM002:provider-hosted-guarded-apply:opl-temporal",
      "dispatch_owner": "med-autoscience",
      "profile_name": "dm-cvd",
      "source_refs": [
        {"role": "opl_production_proof", "ref": "/tmp/opl-proof.json", "exists": true}
      ],
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "target_studies": ["DM002"],
        "provider_attempt_id": "opl-temporal:dm-cvd:DM002:provider-hosted-guarded-apply",
        "idempotency_key": "mas:dm-cvd:DM002:provider-hosted-guarded-apply:opl-temporal",
        "paper_autonomy_reason": "provider_hosted_guarded_apply_soak",
        "authority_boundary": "mas_owner_guarded_apply_only"
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$1" > ${shellSingleQuote(dispatchedTaskPath)}
echo '{"accepted":true,"surface_kind":"mas_family_sidecar_dispatch_receipt","dispatch":{"result":{"surface":"real_paper_autonomy_provider_hosted_guarded_apply_receipt","status":"typed_blocker"}}}'
`,
    { mode: 0o755 },
  );
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'temporal', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(task.paper_autonomy.study_id, 'DM002');
    assert.equal(task.paper_autonomy.next_owner, 'med-autoscience');
    assert.equal(task.paper_autonomy.callable_surface, 'medautosci sidecar dispatch');
    assert.equal(task.paper_autonomy.authority_boundary.writes_mas_truth, false);
    assert.equal(task.payload.provider_attempt_id, 'opl-temporal:dm-cvd:DM002:provider-hosted-guarded-apply');
    assert.equal(dispatchedTask.task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(dispatchedTask.payload.authority_boundary, 'mas_owner_guarded_apply_only');
    assert.deepEqual(dispatchedTask.payload.source_refs, [
      { role: 'opl_production_proof', ref: '/tmp/opl-proof.json', exists: true },
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
