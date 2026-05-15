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

test('family-runtime requeues terminal MAS tasks when exported provider evidence changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-requeue-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-binding-requeue-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
fingerprint="$(cat ${shellSingleQuote(path.join(fixtureRoot, 'fingerprint'))})"
proof_ref="$(cat ${shellSingleQuote(path.join(fixtureRoot, 'proof-ref'))})"
cat <<JSON
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/guarded-apply",
      "priority": 30,
      "source": "mas-sidecar-export",
      "dedupe_key": "mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal",
      "source_fingerprint": "$fingerprint",
      "dispatch_owner": "med-autoscience",
      "profile_name": "nfpitnet",
      "source_refs": [
        {"role": "opl_production_proof", "ref": "$proof_ref", "exists": true}
      ],
      "payload": {
        "profile": "/tmp/nfpitnet.workspace.toml",
        "study_id": "DM002",
        "target_studies": ["DM002"],
        "provider_attempt_id": "opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply",
        "idempotency_key": "mas:nfpitnet:DM002:provider-hosted-guarded-apply:opl-temporal",
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
task_path="$1"
cp "$task_path" ${shellSingleQuote(dispatchedTaskPath)}
count=0
if [ -f ${shellSingleQuote(dispatchCountPath)} ]; then
  count="$(cat ${shellSingleQuote(dispatchCountPath)})"
fi
count=$((count + 1))
printf '%s\\n' "$count" > ${shellSingleQuote(dispatchCountPath)}
python3 - "$task_path" "$count" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
count = sys.argv[2]
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_sidecar_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "receipt_ref": f"artifacts/runtime/opl_family_sidecar/dispatch_receipts/receipt-{count}.json",
    "dispatch": {
        "action_type": "paper_autonomy_guarded_apply",
        "study_id": task["payload"]["study_id"],
        "result": {
            "surface": "real_paper_autonomy_provider_hosted_guarded_apply_receipt",
            "status": "typed_blocker",
            "guarded_apply_status": "blocked_no_mas_owner_apply_receipt",
            "provider_attempt": {
                "attempt_state": "mas_owner_receipt_missing",
                "attempt_ready": True,
                "provider_attempt_wrote_workspace": False
            },
            "typed_blockers": [{"blocker_id": "mas_owner_apply_receipt_missing", "write_permitted": False}],
            "publication_route_memory_final_proof": {"status": "typed_blocker_missing_ref_chain"},
            "forbidden_write_guard": {"aggregate_result": "fail_closed_no_forbidden_writes"},
            "summary": {"writes_performed": False},
            "authority_boundary": {"domain_truth_owner": "med-autoscience", "opl_can_write_mas_truth": False}
        }
    }
}))
PY
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
  });
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'proof-fingerprint-v1\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'proof-ref'), '/tmp/proof-v1.json\n', 'utf8');
    const first = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    assert.equal(first.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(first.family_runtime_tick.hydration.requeued_count, 0);
    assert.equal(first.family_runtime_tick.dispatches.length, 1);

    const repeated = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    assert.equal(repeated.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(repeated.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(repeated.family_runtime_tick.dispatches.length, 0);

    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'proof-fingerprint-v2\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'proof-ref'), '/tmp/proof-v2.json\n', 'utf8');
    const updated = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    const task = runCli([
      'family-runtime',
      'queue',
      'inspect',
      first.family_runtime_tick.dispatches[0].task_id,
    ], env);
    const attempts = task.family_runtime_task.stage_attempts;
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(updated.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updated.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updated.family_runtime_tick.dispatches.length, 1);
    assert.equal(dispatchedTask.payload.source_fingerprint, 'proof-fingerprint-v2');
    assert.equal(dispatchedTask.payload.source_refs[0].ref, '/tmp/proof-v2.json');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].provider_kind, 'temporal');
    assert.equal(attempts[0].source_fingerprint, 'proof-fingerprint-v2');
    assert.equal(attempts[0].route_impact.receipt_ref, 'artifacts/runtime/opl_family_sidecar/dispatch_receipts/receipt-2.json');
    assert.equal(attempts[1].source_fingerprint, 'proof-fingerprint-v1');
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '2');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
