import './family-runtime-provider-hosted-attempts-cases/mas-default-executor.ts';
import './family-runtime-provider-hosted-attempts-cases/mas-default-executor-redrive.ts';
import './family-runtime-provider-hosted-attempts-cases/mas-default-executor-single-flight.ts';
import './family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source.ts';

import {
  assert,
  createDispatchFixture,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  test,
} from './family-runtime-provider-hosted-attempts-cases/helpers.ts';

test('family-runtime dispatch creates a task-bound stage attempt for MAS guarded apply tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-guarded-attempt-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
payload = task["payload"]
assert task["task_kind"] == "paper_autonomy/guarded-apply"
assert payload["study_id"] == "DM002"
print(json.dumps({
    "accepted": True,
    "closeout_packet": {
        "surface_kind": "stage_attempt_closeout_packet",
        "closeout_refs": ["mas-domain-handler-dispatch:DM002:guarded-apply"],
        "consumed_refs": ["mas:paper-autonomy:DM002:guarded-apply"],
        "writeback_receipt_refs": ["mas:owner-receipt:DM002:guarded-apply"],
        "rejected_writes": [{"target": "publication_eval/latest.json", "reason": "opl_forbidden_write"}],
        "next_owner": "med-autoscience",
        "domain_ready_verdict": "domain_gate_pending",
        "route_impact": {
            "study_id": payload["study_id"],
            "decision": "provider_hosted_guarded_apply_receipt"
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/guarded-apply',
      '--payload',
      '{"profile":"/tmp/mas/profile.json","study_id":"DM002","target_studies":["DM002"],"provider_attempt_id":"opl-temporal:test:DM002","idempotency_key":"mas:test:DM002:guarded","authority_boundary":"mas_owner_guarded_apply_only"}',
      '--dedupe-key',
      'mas:test:DM002:guarded',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = runCli(['family-runtime', 'attempt', 'list'], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.stage_id, 'paper_autonomy/guarded-apply');
    assert.equal(attempt.task_id, taskId);
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 1);
    assert.deepEqual(attempt.closeout_refs, ['mas-domain-handler-dispatch:DM002:guarded-apply']);
    assert.equal(attempt.route_impact.decision, 'provider_hosted_guarded_apply_receipt');
    assert.equal(attempt.route_impact.next_owner, 'med-autoscience');
    assert.equal(attempt.route_impact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(attempt.activity_events.at(-1).activity_status, 'completed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime maps MAS guarded apply domain-handler receipts into typed closeout ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-guarded-receipt-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
payload = task["payload"]
assert task["task_kind"] == "paper_autonomy/guarded-apply"
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_domain_handler_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "receipt_ref": "artifacts/runtime/opl_family_domain_handler/dispatch_receipts/receipt.json",
    "dispatch": {
        "action_type": "paper_autonomy_guarded_apply",
        "study_id": payload["study_id"],
        "result": {
            "surface": "real_paper_autonomy_provider_hosted_guarded_apply_receipt",
            "status": "typed_blocker",
            "guarded_apply_status": "blocked_no_mas_owner_apply_receipt",
            "provider_attempt": {
                "attempt_state": "mas_owner_receipt_missing",
                "attempt_ready": True,
                "provider_attempt_wrote_workspace": False
            },
            "typed_blockers": [
                {
                    "blocker_id": "mas_owner_apply_receipt_missing:002",
                    "owner": "MedAutoScience",
                    "reason": "no MAS owner apply receipt was observed",
                    "write_permitted": False
                }
            ],
            "publication_route_memory_final_proof": {
                "status": "typed_blocker_missing_ref_chain",
                "consumed_refs": [],
                "writeback_receipt_refs": [],
                "typed_blocker": {
                    "blocker_id": "dm002_publication_route_memory_final_ref_chain_missing",
                    "owner": "MedAutoScience",
                    "reason": "DM002 memory refs are incomplete",
                    "write_permitted": False
                }
            },
            "forbidden_write_guard": {
                "aggregate_result": "fail_closed_no_forbidden_writes"
            },
            "summary": {
                "writes_performed": False
            },
            "authority_boundary": {
                "projection_owner": "med-autoscience",
                "provider_attempt_owner": "one-person-lab",
                "domain_truth_owner": "med-autoscience",
                "provider_completion_is_publication_quality": False,
                "opl_can_write_mas_truth": False
            }
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/guarded-apply',
      '--payload',
      '{"profile":"/tmp/mas/profile.json","study_id":"DM002","provider_attempt_id":"opl-temporal:test:DM002","idempotency_key":"mas:test:DM002:guarded-receipt","authority_boundary":"mas_owner_guarded_apply_only"}',
      '--dedupe-key',
      'mas:test:DM002:guarded-receipt',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(attempt.closeout_refs, [
      'artifacts/runtime/opl_family_domain_handler/dispatch_receipts/receipt.json',
      `mas-domain-handler-dispatch:${taskId}`,
    ]);
    assert.equal(attempt.route_impact.decision, 'typed_blocker');
    assert.equal(attempt.route_impact.guarded_apply_status, 'blocked_no_mas_owner_apply_receipt');
    assert.equal(attempt.route_impact.provider_attempt_state, 'mas_owner_receipt_missing');
    assert.equal(attempt.route_impact.forbidden_write_guard_result, 'fail_closed_no_forbidden_writes');
    assert.equal(attempt.route_impact.writes_performed, false);
    assert.equal(attempt.route_impact.next_owner, 'med-autoscience');
    assert.equal(attempt.route_impact.domain_ready_verdict, 'domain_gate_pending');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatches RCA provider-hosted no-regression tasks as domain-handler action envelopes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-rca-no-regression-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "emit_no_regression_evidence"
assert task["action"] == "emit_no_regression_evidence"
assert task["workspace_root"] == "/tmp/rca-workspace"
assert task["evidence_id"] == "unit-no-regression"
assert task["payload"]["workspace_root"] == "/tmp/rca-workspace"
print(json.dumps({
    "ok": True,
    "surface_kind": "product_domain_handler_dispatch",
    "domain_id": "redcube_ai",
    "action": task["action"],
    "task_id": task["task_id"],
    "result_surface": {
        "surface_kind": "no_regression_evidence",
        "return_shape": "no_regression_evidence",
        "evidence_ref": "rca-no-regression:visual-stage:unit-no-regression",
        "runtime_locator_ref": "workspace-runtime-ref:no-regression-evidence:unit-no-regression",
        "evidence_file": "/tmp/rca-workspace/.redcube/runtime/evidence/no-regression/unit-no-regression.json",
        "source_manifest_refs": {
            "controlled_visual_stage_attempt_ref": "/controlled_visual_stage_attempt",
            "controlled_soak_no_regression_attempt_ref": "/controlled_soak_no_regression_attempt"
        },
        "coverage": {
            "long_visual_soak_claimed": False,
            "visual_artifact_blob_written": False,
            "review_export_verdict_written": False
        },
        "authority_boundary": {
            "opl_can_store_no_regression_evidence_ref": True,
            "opl_can_store_visual_truth": False
        }
    },
    "owner_boundary": {
        "opl_role": "typed_family_queue_and_control_plane",
        "rca_role": "visual_domain_truth_review_artifact_owner"
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'redcube',
      '--task-kind',
      'emit_no_regression_evidence',
      '--payload',
      '{"action":"emit_no_regression_evidence","workspace_root":"/tmp/rca-workspace","evidence_id":"unit-no-regression","stage_id":"controlled_visual_stage_attempt","provider_hosted_stage_attempt":true,"provider_attempt_id":"opl-temporal:rca:no-regression"}',
      '--dedupe-key',
      'rca:test:no-regression',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'redcube');
    assert.equal(attempt.stage_id, 'controlled_visual_stage_attempt');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(attempt.closeout_refs.includes('rca-no-regression:visual-stage:unit-no-regression'), true);
    assert.equal(attempt.route_impact.decision, 'no_regression_evidence');
    assert.equal(attempt.route_impact.no_regression_evidence_observed, true);
    assert.equal(attempt.route_impact.next_owner, 'redcube-ai');
    assert.equal(attempt.route_impact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(attempt.route_impact.writes_performed, false);
    assert.equal(attempt.activity_events.at(-1).activity_status, 'completed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime maps MAG product domain-handler receipts into task-bound controlled attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mag-controlled-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "autonomy-controller/guarded-run"
assert task["action"] == "autonomy-controller/guarded-run"
assert task["input_path"] == "/tmp/mag/input.json"
assert task["output_dir"] == "/tmp/mag/runtime"
print(json.dumps({
    "ok": True,
    "command": "domain-handler-dispatch",
    "domain_handler_dispatch": {
        "surface_kind": "mag_product_domain_handler_dispatch",
        "task_id": task["task_id"],
        "action": task["action"],
        "status": "accepted",
        "target_domain_id": "medautogrant",
        "result": {
            "surface_kind": "domain_handler_autonomy_controller_guarded_action",
            "mode": "guarded_run",
            "command": "medautogrant execute-grant-autonomy-controller --input /tmp/mag/input.json --output-dir /tmp/mag/runtime",
            "execution_policy": "caller_must_execute_mag_guarded_command"
        },
        "receipt_refs": {
            "dispatch_receipt_ref": "mag-domain-handler-receipt:guarded-run",
            "stage_attempt_receipt_ref": "mag-stage-attempt:review_and_rebuttal",
            "opl_consumes_receipt_ref_only": True
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'autonomy-controller/guarded-run',
      '--payload',
      '{"action":"autonomy-controller/guarded-run","input_path":"/tmp/mag/input.json","output_dir":"/tmp/mag/runtime","stage_id":"review_and_rebuttal","provider_hosted_stage_attempt":true,"provider_attempt_id":"opl-temporal:mag:review"}',
      '--dedupe-key',
      'mag:test:controlled-review',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'medautogrant');
    assert.equal(attempt.stage_id, 'review_and_rebuttal');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(attempt.closeout_refs.includes('mag-domain-handler-receipt:guarded-run'), true);
    assert.equal(attempt.closeout_refs.includes('mag-stage-attempt:review_and_rebuttal'), true);
    assert.equal(attempt.route_impact.decision, 'domain_handler_autonomy_controller_guarded_action');
    assert.equal(attempt.route_impact.next_owner, 'med-autogrant');
    assert.equal(attempt.route_impact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(attempt.route_impact.writes_performed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime maps MAG no-regression domain-handler receipts into controlled apply evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mag-no-regression-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "stage-attempt/closeout"
receipt_ref = task["controlled_stage_attempt"]["owner_receipt_refs"][0]
print(json.dumps({
    "ok": True,
    "command": "domain-handler-dispatch",
    "domain_handler_dispatch": {
        "surface_kind": "mag_product_domain_handler_dispatch",
        "task_id": task["task_id"],
        "action": task["action"],
        "status": "completed",
        "target_domain_id": "medautogrant",
        "result": {
            "surface_kind": "domain_handler_stage_attempt_closeout_result",
            "return_shape": "no_regression_evidence",
            "receipt_ref": receipt_ref,
            "receipt_refs": {
                "owner_receipt_ref": receipt_ref
            },
            "summary": {
                "writes_performed": False
            }
        },
        "receipt_refs": {
            "owner_receipt_ref": receipt_ref,
            "opl_consumes_receipt_ref_only": True
        }
    }
}))
PY
`);
  try {
    const receiptRef = 'mag-runtime-receipts/owner/no-regression-1.json';
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatch.dispatchPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--payload',
      JSON.stringify({
        action: 'stage-attempt/closeout',
        input_path: '/tmp/mag/input.json',
        stage_id: 'review_and_rebuttal',
        provider_hosted_stage_attempt: true,
        provider_attempt_id: 'opl-temporal:mag:no-regression',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
          owner_receipt_refs: [receiptRef],
        },
      }),
      '--dedupe-key',
      'mag:test:no-regression',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = task.family_runtime_task.stage_attempts[0].stage_attempt_id;
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], env);
    const contract = query.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;

    assert.equal(contract.apply_status, 'domain_receipt_observed');
    assert.deepEqual(contract.owner_receipt_refs, [receiptRef]);
    assert.deepEqual(contract.no_regression_evidence_refs, [receiptRef]);
    assert.equal(
      query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.route_impact.no_regression_evidence_observed,
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime maps MAG lifecycle receipt blockers into task-bound controlled attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mag-lifecycle-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "lifecycle/receipt"
assert task["action"] == "lifecycle/receipt"
print(json.dumps({
    "ok": True,
    "command": "domain-handler-dispatch",
    "domain_handler_dispatch": {
        "surface_kind": "mag_product_domain_handler_dispatch",
        "task_id": task["task_id"],
        "action": task["action"],
        "status": "completed",
        "target_domain_id": "medautogrant",
        "result": {
            "surface_kind": "domain_handler_lifecycle_receipt_result",
            "return_shape": "typed_blocker",
            "receipt_ref": "mag-runtime-receipts/lifecycle/cleanup-blocker-1.json",
            "receipt_refs": {
                "lifecycle_receipt_ref": "mag-runtime-receipts/lifecycle/cleanup-blocker-1.json",
                "owner_receipt_contract_ref": "/product_entry_manifest/owner_receipt_contract",
                "lifecycle_guarded_apply_proof_ref": "/product_entry_manifest/lifecycle_guarded_apply_proof",
                "source_ref": "opl-lifecycle://cleanup/1",
                "opl_consumes_receipt_ref_only": True
            },
            "source_refs": [
                "/product_entry_manifest/lifecycle_guarded_apply_proof",
                "/product_entry_manifest/owner_receipt_contract"
            ],
            "typed_blocker": {
                "blocker_kind": "mag_lifecycle_owner_receipt_required",
                "owner": "med-autogrant",
                "receipt_ref": "mag-runtime-receipts/lifecycle/cleanup-blocker-1.json"
            },
            "lifecycle_receipt_evidence": {
                "operation": "cleanup",
                "receipt_shape": "typed_blocker",
                "receipt_instance_ref": "mag-runtime-receipts/lifecycle/cleanup-blocker-1.json"
            },
            "write_policy": "runtime_receipt_instance_only_no_repo_write"
        },
        "receipt_refs": {
            "dispatch_receipt_ref": "mag-domain-handler-receipt:lifecycle-cleanup",
            "opl_consumes_receipt_ref_only": True
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'lifecycle/receipt',
      '--payload',
      '{"action":"lifecycle/receipt","input_path":"/tmp/mag/input.json","operation":"cleanup","stage_id":"package_and_submit_ready","provider_hosted_stage_attempt":true,"provider_attempt_id":"opl-temporal:mag:lifecycle-cleanup"}',
      '--dedupe-key',
      'mag:test:lifecycle-cleanup',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(attempt.closeout_refs.includes('mag-runtime-receipts/lifecycle/cleanup-blocker-1.json'), true);
    assert.equal(attempt.route_impact.decision, 'typed_blocker');
    assert.equal(attempt.route_impact.lifecycle_receipt_ref, 'mag-runtime-receipts/lifecycle/cleanup-blocker-1.json');
    assert.equal(attempt.route_impact.lifecycle_receipt_observed, true);
    assert.equal(attempt.route_impact.typed_blocker_count, 1);
    assert.equal(attempt.route_impact.writes_performed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime preserves MAG controlled apply and lifecycle requests in provider-hosted locator', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mag-locator-'));
  const ownerReceiptRef = '/tmp/mag/runtime/receipts/owner-receipts/goal-mag-opl-stage-closeout.json';
  const lifecycleReceiptRef = '/tmp/mag/runtime/receipts/lifecycle/goal-mag-lifecycle-cleanup-blocker.json';
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "stage-attempt/closeout"
print(json.dumps({
    "ok": True,
    "command": "domain-handler-dispatch",
    "domain_handler_dispatch": {
        "surface_kind": "mag_product_domain_handler_dispatch",
        "task_id": task["task_id"],
        "action": task["action"],
        "status": "completed",
        "target_domain_id": "medautogrant",
        "result": {
            "surface_kind": "domain_handler_stage_attempt_closeout_result",
            "return_shape": "domain_owner_receipt",
            "receipt_ref": task["controlled_stage_attempt"]["owner_receipt_refs"][0],
            "receipt_refs": {
                "owner_receipt_ref": task["controlled_stage_attempt"]["owner_receipt_refs"][0],
                "owner_receipt_contract_ref": "/product_entry_manifest/owner_receipt_contract",
                "source_ref": "opl-stage-attempt://goal-mag"
            },
            "source_refs": [
                "/product_entry_manifest/controlled_stage_attempt_projection",
                "/product_entry_manifest/owner_receipt_contract"
            ],
            "consumed_memory_refs": [
                "mag-memory:accepted:goal-mag"
            ],
            "writeback_receipt_refs": [
                "mag-memory-writeback:accepted:goal-mag",
                "mag-memory-writeback:rejected:goal-mag"
            ],
            "write_policy": "runtime_receipt_instance_only_no_repo_write"
        },
        "receipt_refs": {
            "dispatch_receipt_ref": "mag-domain-handler-receipt:stage-closeout",
            "opl_consumes_receipt_ref_only": True
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--payload',
      JSON.stringify({
        action: 'stage-attempt/closeout',
        input_path: '/tmp/mag/input.json',
        stage_id: 'review_and_rebuttal',
        provider_hosted_stage_attempt: true,
        provider_attempt_id: 'opl-temporal:mag:locator-preserve',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
          owner_receipt_refs: [ownerReceiptRef],
        },
        lifecycle_apply_requests: [
          {
            action_id: 'goal-mag-cleanup-request',
            action_kind: 'cleanup',
            authority_owner: 'med-autogrant',
            owner_scope: 'domain_owned_artifact',
            target_ref: 'mag-artifact-locator:goal-mag',
            restore_ref: 'mag-restore-ref:goal-mag',
            domain_receipt_ref: lifecycleReceiptRef,
          },
        ],
      }),
      '--dedupe-key',
      'mag:test:locator-preserve',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const inspected = runCli([
      'family-runtime',
      'attempt',
      'inspect',
      task.family_runtime_task.stage_attempts[0].stage_attempt_id,
    ], env);
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      task.family_runtime_task.stage_attempts[0].stage_attempt_id,
    ], env);
    const locator = inspected.family_runtime_stage_attempt.attempt.workspace_locator;
    const visibility = query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.deepEqual(locator.controlled_stage_attempt.owner_receipt_refs, [ownerReceiptRef]);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.closeout_refs.includes(ownerReceiptRef), true);
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.closeout_refs.includes('mag-domain-handler-receipt:stage-closeout'),
      true,
    );
    assert.deepEqual(inspected.family_runtime_stage_attempt.attempt.route_impact, {
      decision: 'domain_owner_receipt',
      action: 'stage-attempt/closeout',
      status: 'completed',
      result_surface_kind: 'domain_handler_stage_attempt_closeout_result',
      receipt_status: null,
      owner_receipt_ref: ownerReceiptRef,
      lifecycle_receipt_ref: null,
      no_regression_evidence_ref: null,
      no_regression_evidence_observed: false,
      lifecycle_receipt_observed: false,
      typed_blocker_count: 0,
      writes_performed: false,
      next_owner: 'med-autogrant',
      domain_ready_verdict: 'domain_gate_pending',
    });
    assert.equal(inspected.family_runtime_stage_attempt.attempt.activity_events.at(-1).closeout_refs.includes(
      ownerReceiptRef,
    ), true);
    const closeout = inspected.family_runtime_stage_attempt.attempt.activity_events.at(-1);
    assert.equal(closeout.activity_kind, 'typed_closeout_ingest');
    assert.deepEqual(visibility.consumed_memory_refs, ['mag-memory:accepted:goal-mag']);
    assert.deepEqual(visibility.writeback_receipt_refs, [
      'mag-memory-writeback:accepted:goal-mag',
      'mag-memory-writeback:rejected:goal-mag',
    ]);
    assert.equal(
      locator.lifecycle_apply_requests[0].domain_receipt_ref,
      lifecycleReceiptRef,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
