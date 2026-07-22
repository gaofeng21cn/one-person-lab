import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  createTemporalStageActivitySessionObserver,
  type TemporalStageActivitySessionTerminalState,
} from "../../src/modules/console/work-item-execution-session-observer.ts";
import {
  joinSessionActivityToWorkItems,
  readWorkItemExecutionSessionBindings,
} from "../../src/modules/console/work-item-projection/session-activity.ts";
import type { WorkItemProjectionItem } from "../../src/modules/console/work-item-projection/types.ts";

const STARTED_AT = Date.parse("2026-07-22T08:00:00.000Z");

function workItem(input: {
  workItemId: "001-dm-cvd-mortality-risk" | "002-dm-mortality-transportability";
  projectScopeId: string;
  workspaceBindingId: string;
  observedGeneration?: string;
}) {
  const item = {
    item_id: `mas:${input.projectScopeId}:${input.workItemId}`,
    identity: {
      agent_id: "mas",
      agent_display_name: "Med Auto Science",
      domain_id: "medical_auto_science",
      project_id: input.projectScopeId,
      project_display_name: "DM-CVD-Mortality-Risk",
      project_scope_id: input.projectScopeId,
      workspace_binding_id: input.workspaceBindingId,
      workspace_path: `/workspace/${input.projectScopeId}`,
      work_item_id: input.workItemId,
      work_item_display_name: input.workItemId,
      work_item_kind: "study",
      work_item_root: `/workspace/${input.projectScopeId}/${input.workItemId}`,
      work_item_scope_id: `work-item:${input.projectScopeId}:${input.workItemId}`,
      source_kind: "domain_inventory",
    },
    lifecycle: {
      business_state: "active",
      domain_business_state: "active",
      control_state: null,
      primary_state: "active",
      primary_state_label: "Active",
      primary_state_reason: "domain_inventory_active",
      reason: "domain_inventory_active",
      last_transition_at: new Date(STARTED_AT).toISOString(),
      raw_business_status: "active",
      current_stage_id: "analysis",
      current_stage_display_name: "Analysis",
      current_stage_status: "running",
      package_status: null,
      lifecycle_ref: null,
      source: "domain_inventory_projection",
      control_ref: null,
      control_updated_at: null,
      observed_generation: input.observedGeneration ?? `sha256:${input.workItemId}`,
    },
    visibility: {
      state: "visible",
      source: "default",
      updated_at: null,
      control_ref: null,
      generation: 0,
    },
    execution: {
      state: "queued",
      stage_id: "analysis",
      stage_status: "queued",
      current_stage_id: "analysis",
      current_stage_display_name: "Analysis",
      next_stage_id: null,
      next_stage_display_name: null,
      attempt_id: "sat-test",
      attempt_ids: ["sat-test"],
      workflow_id: "wf-test",
      provider_kind: "temporal",
      started_at: null,
      last_heartbeat_at: null,
      updated_at: null,
      running_proof_status: "not_applicable",
      diagnostic_reason: null,
      quality_budget: {
        state: "not_managed",
        scope_id: null,
        max_attempts: null,
        attempts_used: 0,
        attempts_remaining: null,
        max_elapsed_ms: null,
        elapsed_ms: null,
        max_tokens: null,
        tokens_used: null,
        token_observation_status: "not_applicable",
        stop_reason: null,
      },
    },
    attention: {
      kind: "none",
      reason: "no_current_action_required",
      owner: null,
      responsible_component: null,
      issue: null,
      impact: null,
      repair_action: null,
      expected_outcome: null,
    },
    telemetry: {
      state: "missing",
      current_stage: {
        state: "missing",
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        observed_at: null,
        missing_reason: "not_observed",
        source_refs: [],
      },
      cumulative: {
        state: "missing",
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        observed_at: null,
        missing_reason: "not_observed",
        source_refs: [],
      },
      missing_reason: "not_observed",
    },
    action: null,
    stage_map: [],
    domain_detail_views: [],
    conditions: [],
    source_refs: [],
  };
  return item as unknown as WorkItemProjectionItem;
}

function observerInput(item: WorkItemProjectionItem, suffix = "001") {
  return {
    stage_attempt_id: `sat-${suffix}`,
    workflow_id: `wf-${suffix}`,
    domain_id: item.identity.domain_id,
    execution_scope: {
      domain_id: item.identity.domain_id,
      domain_work_item_id: item.identity.work_item_id,
      project_scope_id: item.identity.project_scope_id,
      work_item_scope_id: item.identity.work_item_scope_id,
      workspace_binding_id: item.identity.workspace_binding_id,
    },
  };
}

function withStateDir(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-automatic-session-observer-"));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    run(root);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("automatic producer records start, two 30-second heartbeats, and immediate completed terminal", () => {
  withStateDir((root) => {
    const first = workItem({
      workItemId: "001-dm-cvd-mortality-risk",
      projectScopeId: "project:diabetes-001",
      workspaceBindingId: "binding-diabetes-001",
    });
    let now = STARTED_AT;
    const observer = createTemporalStageActivitySessionObserver(observerInput(first), {
      now: () => now,
      readCurrentItems: () => [first],
    });

    assert.equal(
      observer.onRunnerProgress({ event_kind: "command.started", value: "ignored" }).status,
      "skipped",
    );
    const started = observer.onRunnerProgress({
      event_kind: "thread.started",
      value: "019f7eb5-74ef-7541-931a-5773a44da87c",
    });
    assert.equal(started.status, "applied");
    assert.equal(started.activity_state, "running");

    now += 30_000;
    assert.equal(observer.heartbeat().status, "applied");
    now += 30_000;
    assert.equal(observer.heartbeat().status, "applied");
    now += 1;
    const completed = observer.terminal("completed");
    assert.equal(completed.status, "applied");
    assert.equal(completed.activity_state, "completed");

    const exact = readWorkItemExecutionSessionBindings({
      executionSessionRef: "codex://threads/019f7eb5-74ef-7541-931a-5773a44da87c",
    }).bindings[0]!;
    assert.equal(exact.identity.work_item_id, "001-dm-cvd-mortality-risk");
    assert.equal(exact.activity_state, "completed");

    const joined = joinSessionActivityToWorkItems({
      items: [first],
      bindings: [exact],
      sourceRef: path.join(root, "work-item-execution-session-bindings.sqlite"),
      now: () => now,
    }).items[0]!;
    assert.equal(joined.execution.state, "queued");
    assert.equal(joined.session_activity.state, "inactive");
    assert.equal(joined.session_activity.can_affect_execution, false);
    assert.equal(joined.session_activity.latest_activity_state, "completed");

    const summary = observer.summary();
    assert.equal(summary.status, "terminal");
    assert.equal(summary.heartbeat_count, 2);
    assert.equal(summary.emitted_event_count, 4);
    assert.equal(summary.authority_boundary.coordination_is_execution_proof, false);
    assert.equal(JSON.stringify(summary).includes("observed_generation"), false);

    const db = new DatabaseSync(path.join(root, "work-item-execution-session-bindings.sqlite"), {
      readOnly: true,
    });
    try {
      const count = db
        .prepare("SELECT COUNT(*) AS count FROM work_item_execution_session_events")
        .get() as { count: number };
      assert.equal(count.count, 4);
    } finally {
      db.close();
    }
  });
});

test("failed and cancelled terminal states remain isolated across Study 001 and 002", () => {
  withStateDir(() => {
    const first = workItem({
      workItemId: "001-dm-cvd-mortality-risk",
      projectScopeId: "project:diabetes-001",
      workspaceBindingId: "binding-diabetes-001",
    });
    const second = workItem({
      workItemId: "002-dm-mortality-transportability",
      projectScopeId: "project:diabetes-002",
      workspaceBindingId: "binding-diabetes-002",
    });
    let now = STARTED_AT;
    const cases: Array<{
      item: WorkItemProjectionItem;
      suffix: string;
      threadId: string;
      terminal: TemporalStageActivitySessionTerminalState;
    }> = [
      {
        item: first,
        suffix: "001",
        threadId: "019f7eb5-74ef-7541-931a-5773a44da87c",
        terminal: "failed",
      },
      {
        item: second,
        suffix: "002",
        threadId: "019f7eb0-44cf-7993-8fda-0057f41807bb",
        terminal: "cancelled",
      },
    ];

    for (const entry of cases) {
      const observer = createTemporalStageActivitySessionObserver(
        observerInput(entry.item, entry.suffix),
        { now: () => now, readCurrentItems: () => [first, second] },
      );
      assert.equal(
        observer.onRunnerProgress({
          event_kind: "thread.started",
          value: entry.threadId,
        }).status,
        "applied",
      );
      now += 30_000;
      assert.equal(observer.heartbeat().status, "applied");
      now += 1;
      assert.equal(observer.terminal(entry.terminal).status, "applied");
    }

    const firstBinding = readWorkItemExecutionSessionBindings({
      executionSessionRef: `codex://threads/${cases[0]!.threadId}`,
    }).bindings[0]!;
    const secondBinding = readWorkItemExecutionSessionBindings({
      executionSessionRef: `codex://threads/${cases[1]!.threadId}`,
    }).bindings[0]!;
    assert.equal(firstBinding.identity.work_item_id, first.identity.work_item_id);
    assert.equal(firstBinding.identity.work_item_scope_id, first.identity.work_item_scope_id);
    assert.equal(firstBinding.activity_state, "failed");
    assert.equal(secondBinding.identity.work_item_id, second.identity.work_item_id);
    assert.equal(secondBinding.identity.work_item_scope_id, second.identity.work_item_scope_id);
    assert.equal(secondBinding.activity_state, "cancelled");
    assert.notEqual(
      firstBinding.identity.project_scope_id,
      secondBinding.identity.project_scope_id,
    );
  });
});

test("producer resumes a nonterminal binding after restart and treats repeated terminal close as idempotent", () => {
  withStateDir(() => {
    const first = workItem({
      workItemId: "001-dm-cvd-mortality-risk",
      projectScopeId: "project:diabetes-001",
      workspaceBindingId: "binding-diabetes-001",
    });
    const input = observerInput(first);
    const event = {
      event_kind: "thread.started",
      value: "019f7eb5-74ef-7541-931a-5773a44da87c",
    };
    let now = STARTED_AT;
    const beforeCrash = createTemporalStageActivitySessionObserver(input, {
      now: () => now,
      readCurrentItems: () => [first],
    });
    const start = beforeCrash.onRunnerProgress(event);
    now += 30_000;
    const heartbeat = beforeCrash.heartbeat();
    assert.ok(heartbeat.sequence! > start.sequence!);

    now += 30_000;
    const afterRestart = createTemporalStageActivitySessionObserver(input, {
      now: () => now,
      readCurrentItems: () => [first],
    });
    const resumed = afterRestart.onRunnerProgress(event);
    assert.equal(resumed.status, "applied");
    assert.ok(resumed.sequence! > heartbeat.sequence!);
    now += 1;
    const failed = afterRestart.terminal("failed");
    assert.equal(failed.status, "applied");

    const terminalReplay = createTemporalStageActivitySessionObserver(input, {
      now: () => now + 30_000,
      readCurrentItems: () => [first],
    });
    const replayedStart = terminalReplay.onRunnerProgress(event);
    assert.equal(replayedStart.status, "unchanged");
    assert.equal(replayedStart.activity_state, "failed");
    const replayedTerminal = terminalReplay.terminal("failed");
    assert.equal(replayedTerminal.status, "unchanged");
    assert.equal(
      terminalReplay.terminal("completed").failure_code,
      "automatic_coordination_terminal_state_conflict",
    );
  });
});

test("producer fails closed on malformed thread ids and cross-Study execution scope", () => {
  withStateDir(() => {
    const first = workItem({
      workItemId: "001-dm-cvd-mortality-risk",
      projectScopeId: "project:diabetes-001",
      workspaceBindingId: "binding-diabetes-001",
    });
    const second = workItem({
      workItemId: "002-dm-mortality-transportability",
      projectScopeId: "project:diabetes-002",
      workspaceBindingId: "binding-diabetes-002",
    });
    const malformed = createTemporalStageActivitySessionObserver(observerInput(first), {
      now: () => STARTED_AT,
      readCurrentItems: () => [first, second],
    });
    assert.equal(
      malformed.onRunnerProgress({
        event_kind: "thread.started",
        value: "../../codex.sqlite",
      }).failure_code,
      "automatic_coordination_thread_id_invalid",
    );

    const mismatchedInput = observerInput(first);
    mismatchedInput.execution_scope.work_item_scope_id = second.identity.work_item_scope_id;
    const mismatched = createTemporalStageActivitySessionObserver(mismatchedInput, {
      now: () => STARTED_AT,
      readCurrentItems: () => [first, second],
    });
    assert.equal(
      mismatched.onRunnerProgress({
        event_kind: "thread.started",
        value: "019f7eb5-74ef-7541-931a-5773a44da87c",
      }).failure_code,
      "automatic_coordination_work_item_missing",
    );
    assert.equal(mismatched.summary().status, "degraded");
  });
});
