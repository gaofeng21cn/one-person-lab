import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime bridges family transition results into provider-hosted stage attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-bridge-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
cp "$1" ${shellSingleQuote(dispatchedTaskPath)}
cat <<'JSON'
{
  "accepted": true,
  "closeout_packet": {
    "surface_kind": "stage_attempt_closeout_packet",
    "closeout_refs": ["mag-transition-receipt:intake-handoff"],
    "consumed_refs": ["mag-oracle-fixture:call_intake_ready_to_fundability_strategy"],
    "next_owner": "med-autogrant",
    "domain_ready_verdict": "domain_gate_pending",
    "route_impact": {
      "decision": "domain_transition_owner_receipt_required",
      "transition_id": "call_intake_complete_to_fundability_strategy"
    }
  }
}
JSON
`,
    { mode: 0o755 },
  );

  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'family_transition/domain_tick',
      '--payload',
      JSON.stringify({
        family_transition: {
          surface_kind: 'family_transition_result',
          status: 'transition_applied',
          domain_id: 'medautogrant',
          current_state: 'call_and_candidate_intake',
          event: 'domain_tick',
          next_state: 'fundability_strategy',
          transition_id: 'call_intake_complete_to_fundability_strategy',
          owner_route: {
            owner: 'med-autogrant',
            route_ref: 'mag-transition:call_intake_complete_to_fundability_strategy',
            action_refs: ['open_grant_user_loop'],
          },
          receipt: {
            surface_kind: 'family_transition_receipt',
            receipt_id: 'ftr-intake-handoff',
            spec_id: 'mag.grant_transition.oracle.v1',
            receipt_refs: ['mag-transition-receipt:intake_handoff_receipt'],
            owner_receipt_refs: ['mag-owner-receipt:intake_handoff_receipt'],
          },
          projection: {
            spec_id: 'mag.grant_transition.oracle.v1',
            route_node_refs: [
              'mag-stage:call_and_candidate_intake',
              'mag-stage:fundability_strategy',
            ],
            action_refs: ['open_grant_user_loop'],
            no_regression_evidence_ref: 'mag-no-regression:intake_handoff',
          },
          authority_boundary: {
            opl_can_write_grant_truth: false,
            fundability_verdict_owner: 'med-autogrant',
          },
        },
      }),
      '--dedupe-key',
      'mag-transition:call_intake_complete_to_fundability_strategy:ftr-intake-handoff',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    }));

    const tick = runCli(['family-runtime', 'tick', '--source', 'transition-bridge'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    }));
    const task = runCli([
      'family-runtime',
      'queue',
      'inspect',
      enqueue.family_runtime_enqueue.task.task_id,
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    }));
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(attempt.stage_id, 'family_transition:call_intake_complete_to_fundability_strategy');
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.workspace_locator.family_transition.transition_id, 'call_intake_complete_to_fundability_strategy');
    assert.equal(attempt.workspace_locator.family_transition.receipt.spec_id, 'mag.grant_transition.oracle.v1');
    assert.equal(attempt.workspace_locator.transition_bridge.opl_executes_domain_action, false);
    assert.equal(attempt.workspace_locator.transition_bridge.domain_owner_receipt_required, true);
    assert.deepEqual(attempt.workspace_locator.transition_bridge.evidence.receipt_refs, [
      'mag-transition-receipt:intake_handoff_receipt',
    ]);
    assert.deepEqual(attempt.workspace_locator.transition_bridge.evidence.owner_receipt_refs, [
      'mag-transition-receipt:intake_handoff_receipt',
      'mag-owner-receipt:intake_handoff_receipt',
    ]);
    assert.deepEqual(attempt.workspace_locator.transition_bridge.evidence.no_regression_evidence_refs, [
      'mag-no-regression:intake_handoff',
    ]);
    assert.equal(attempt.workspace_locator.transition_bridge.evidence.domain_owner_receipt_observed, true);
    assert.equal(attempt.workspace_locator.transition_bridge.evidence.no_regression_evidence_observed, true);
    assert.equal(
      attempt.workspace_locator.transition_bridge.evidence.opl_evidence_boundary,
      'refs_only_no_domain_verdict_authority',
    );
    assert.equal(attempt.workspace_locator.transition_bridge.opl_authorizes_domain_verdict, false);
    assert.equal(dispatchedTask.payload.family_transition.transition_id, 'call_intake_complete_to_fundability_strategy');
    assert.equal(dispatchedTask.authority_boundary.opl, 'typed_queue_and_dispatch_only');
    assert.equal(dispatchedTask.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydrate derives transition bridge tasks from domain transition matrix results', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-hydrate-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mag_family_sidecar_export",
  "family_transition_matrix_result": {
    "surface_kind": "family_transition_matrix_result",
    "status": "matrix_evaluated",
    "spec_id": "mag.grant_transition.oracle.v1",
    "summary": {
      "total": 1,
      "transition_applied": 1,
      "blocked": 0,
      "dead_letter_intended": 0
    },
    "results": [
      {
        "case_id": "oracle-fixture:intake-handoff",
        "result": {
          "surface_kind": "family_transition_result",
          "status": "transition_applied",
          "domain_id": "med-autogrant",
          "current_state": "call_and_candidate_intake",
          "event": "domain_tick",
          "next_state": "fundability_strategy",
          "transition_id": "call_intake_complete_to_fundability_strategy",
          "next_work_unit": null,
          "owner_route": {
            "owner": "med-autogrant",
            "route_ref": "mag-transition:call_intake_complete_to_fundability_strategy",
            "action_refs": ["open_grant_user_loop"]
          },
          "human_gate": null,
          "typed_blocker": null,
          "dead_letter_intent": null,
          "receipt": {
            "surface_kind": "family_transition_receipt",
            "receipt_id": "ftr-intake-handoff",
            "spec_id": "mag.grant_transition.oracle.v1",
            "receipt_refs": ["mag-transition-receipt:intake_handoff_receipt"],
            "owner_receipt_refs": ["mag-owner-receipt:intake_handoff_receipt"]
          },
          "projection": {
            "spec_id": "mag.grant_transition.oracle.v1",
            "route_node_refs": ["mag-stage:call_and_candidate_intake", "mag-stage:fundability_strategy"],
            "action_refs": ["open_grant_user_loop"],
            "no_regression_evidence_ref": "mag-no-regression:intake_handoff"
          },
          "authority_boundary": {
            "opl_can_write_grant_truth": false,
            "fundability_verdict_owner": "med-autogrant"
          }
        }
      }
    ],
    "authority_boundary": {
      "opl": "transition_runner_transport_projection_only",
      "domain": "truth_quality_artifact_gate_owner"
    }
  }
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautogrant'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(task.domain_id, 'medautogrant');
    assert.equal(task.task_kind, 'family_transition/domain_tick');
    assert.equal(
      task.dedupe_key,
      'mag.grant_transition.oracle.v1:oracle-fixture:intake-handoff:call_intake_complete_to_fundability_strategy',
    );
    assert.equal(task.payload.opl_provider_hosted_stage_attempt, true);
    assert.equal(task.payload.family_transition.transition_id, 'call_intake_complete_to_fundability_strategy');
    assert.deepEqual(task.payload.source_refs, [
      {
        role: 'family_transition_matrix_case',
        ref: 'family_transition_matrix_result:mag.grant_transition.oracle.v1:oracle-fixture:intake-handoff',
      },
    ]);
    assert.equal(task.payload.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(task.payload.authority_boundary.opl_executes_domain_action, false);
    assert.equal(task.payload.authority_boundary.opl_authorizes_domain_verdict, false);
    assert.equal(task.payload.authority_boundary.domain_transition_owner, 'med-autogrant');

    const tick = runCli(['family-runtime', 'tick', '--source', 'transition-bridge'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_EXPORT: exportPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    }));
    const inspected = runCli(['family-runtime', 'queue', 'inspect', task.task_id], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    }));
    const attempt = inspected.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'retry_waiting');
    assert.deepEqual(attempt.workspace_locator.transition_bridge.evidence.owner_receipt_refs, [
      'mag-transition-receipt:intake_handoff_receipt',
      'mag-owner-receipt:intake_handoff_receipt',
    ]);
    assert.deepEqual(attempt.workspace_locator.transition_bridge.evidence.no_regression_evidence_refs, [
      'mag-no-regression:intake_handoff',
    ]);
    assert.equal(attempt.workspace_locator.transition_bridge.evidence.domain_owner_receipt_observed, true);
    assert.equal(attempt.workspace_locator.transition_bridge.evidence.no_regression_evidence_observed, true);
    assert.equal(attempt.workspace_locator.transition_bridge.opl_executes_domain_action, false);
    assert.equal(attempt.workspace_locator.transition_bridge.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.transition_bridge.opl_authorizes_domain_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydrate blocks transition matrix results with unknown domains', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-domain-block-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-domain-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "family_transition_matrix_result": {
    "surface_kind": "family_transition_matrix_result",
    "status": "matrix_evaluated",
    "spec_id": "external.transition.v1",
    "summary": {
      "total": 1,
      "transition_applied": 1,
      "blocked": 0,
      "dead_letter_intended": 0
    },
    "results": [
      {
        "case_id": "external-case",
        "result": {
          "surface_kind": "family_transition_result",
          "status": "transition_applied",
          "domain_id": "unknown-domain",
          "current_state": "draft",
          "event": "domain_tick",
          "next_state": "ready",
          "transition_id": "external_transition",
          "owner_route": {"owner": "unknown-domain"},
          "receipt": {"surface_kind": "family_transition_receipt"},
          "projection": {},
          "authority_boundary": {}
        }
      }
    ],
    "authority_boundary": {}
  }
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautogrant'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const blocked = intake.family_runtime_intake.exports[0].blocked[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(blocked.reason, 'invalid_transition_domain');
    assert.equal(queue.family_runtime_queue.queue.total, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
