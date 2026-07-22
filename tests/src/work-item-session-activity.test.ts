import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  deriveControlledExecutionSessionBindings,
  joinSessionActivityToWorkItems,
  observeWorkItemExecutionSessionBinding,
  readWorkItemExecutionSessionBindings,
  resolveWorkItemExecutionSessionObservationTarget,
  type WorkItemExecutionSessionBinding,
} from "../../src/modules/console/work-item-projection/session-activity.ts";
import type { WorkItemProjectionItem } from "../../src/modules/console/work-item-projection/types.ts";

const NOW = Date.parse("2026-07-21T08:00:00.000Z");
const SESSION_REF = "codex://threads/019f7eb5-74ef-7541-931a-5773a44da87c";

function item(
  input: {
    generation?: string;
    lifecycle?: WorkItemProjectionItem["lifecycle"]["business_state"];
    executionState?: WorkItemProjectionItem["execution"]["state"];
    stageStatus?: string;
    attention?: WorkItemProjectionItem["attention"]["kind"];
  } = {},
) {
  return {
    item_id: "mas\u0000project-diabetes\u0000001-dm-cvd-mortality-risk",
    identity: {
      agent_id: "mas",
      project_id: "project-diabetes",
      project_scope_id: "project:diabetes",
      work_item_id: "001-dm-cvd-mortality-risk",
      work_item_scope_id: "work-item:diabetes:001",
      workspace_binding_id: "binding-diabetes",
    },
    lifecycle: {
      business_state: input.lifecycle ?? "active",
      observed_generation: input.generation ?? "sha256:generation-1",
    },
    execution: {
      state: input.executionState ?? "queued",
      stage_status: input.stageStatus ?? "queued",
      attempt_id: "sat-current",
      workflow_id: "wf-current",
      last_heartbeat_at: null,
      updated_at: "2026-07-21T07:59:00.000Z",
      running_proof_status: "not_applicable",
      diagnostic_reason: null,
    },
    attention: { kind: input.attention ?? "none" },
    source_refs: [],
  } as unknown as WorkItemProjectionItem;
}

function binding(
  input: {
    ref?: string;
    kind?: WorkItemExecutionSessionBinding["activity_kind"];
    state?: WorkItemExecutionSessionBinding["activity_state"];
    observedAt?: number;
    sequence?: number;
  } = {},
): WorkItemExecutionSessionBinding {
  const observedAt = input.observedAt ?? NOW - 1_000;
  const state = input.state ?? "running";
  const terminal = ["completed", "failed", "cancelled"].includes(state);
  return {
    binding_id: "opl://work-item-execution-session/test",
    execution_session_ref: input.ref ?? SESSION_REF,
    identity: {
      agent_id: "mas",
      project_id: "project-diabetes",
      project_scope_id: "project:diabetes",
      work_item_id: "001-dm-cvd-mortality-risk",
      work_item_scope_id: "work-item:diabetes:001",
      workspace_binding_id: "binding-diabetes",
      observed_generation: "sha256:generation-1",
    },
    activity_kind: input.kind ?? "coordination",
    activity_state: state,
    stage_attempt_id: input.kind === "controlled_execution" ? "sat-current" : null,
    workflow_id: input.kind === "controlled_execution" ? "wf-current" : null,
    observed_at: new Date(observedAt).toISOString(),
    ttl_ms: 300_000,
    expires_at: new Date(terminal ? observedAt : observedAt + 300_000).toISOString(),
    sequence: input.sequence ?? 0,
    source_ref: null,
    recorded_at: new Date(NOW).toISOString(),
  };
}

function observation(input: {
  state: "running" | "waiting" | "completed" | "failed" | "cancelled";
  sequence: number;
  generation?: string;
  ref?: string;
}) {
  return {
    agent_id: "mas",
    project_id: "project-diabetes",
    project_scope_id: "project:diabetes",
    work_item_id: "001-dm-cvd-mortality-risk",
    work_item_scope_id: "work-item:diabetes:001",
    workspace_binding_id: "binding-diabetes",
    observed_generation: input.generation ?? "sha256:generation-1",
    execution_session_ref: input.ref ?? SESSION_REF,
    activity_kind: "coordination" as const,
    activity_state: input.state,
    observed_at: new Date(NOW + input.sequence * 1_000).toISOString(),
    sequence: input.sequence,
  };
}

function observeInChildProcess(input: { stateDir: string; ref: string; onReady: () => void }) {
  const moduleUrl = new URL(
    "../../src/modules/console/work-item-projection/session-activity.ts",
    import.meta.url,
  ).href;
  const currentItem = item();
  const payload = observation({ state: "running", sequence: 0, ref: input.ref });
  const script = `
    const { observeWorkItemExecutionSessionBinding } = await import(${JSON.stringify(moduleUrl)});
    process.send?.('ready');
    try {
      const receipt = observeWorkItemExecutionSessionBinding(
        ${JSON.stringify(payload)},
        { currentItem: ${JSON.stringify(currentItem)}, now: () => ${NOW} },
      );
      process.stdout.write(JSON.stringify({ status: receipt.status, receipt_ref: receipt.receipt_ref }));
      process.disconnect?.();
    } catch (error) {
      console.error(error instanceof Error ? error.stack : String(error));
      process.disconnect?.();
      process.exitCode = 1;
    }
  `;
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", script],
    {
      env: { ...process.env, OPL_STATE_DIR: input.stateDir },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let stdout = "";
  let stderr = "";
  let ready = false;
  child.stdout!.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr!.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("message", (message) => {
    if (message !== "ready" || ready) return;
    ready = true;
    input.onReady();
  });
  return new Promise<{ status: string; receipt_ref: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Concurrent observation child exited ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as { status: string; receipt_ref: string });
      } catch (error) {
        reject(
          new Error(`Concurrent observation child returned invalid JSON: ${stdout}`, {
            cause: error,
          }),
        );
      }
    });
  });
}

async function assertObservationWaitsForDatabaseLock(initialized: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-work-item-session-lock-"));
  const dbPath = path.join(root, "work-item-execution-session-bindings.sqlite");
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    if (initialized) {
      process.env.OPL_STATE_DIR = root;
      observeWorkItemExecutionSessionBinding(
        observation({ state: "running", sequence: 0, ref: "codex://threads/concurrency-seed" }),
        { currentItem: item(), now: () => NOW },
      );
    }
    const locker = new DatabaseSync(dbPath);
    let lockReleased = false;
    let releaseLock!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    locker.exec(initialized ? "BEGIN IMMEDIATE" : "BEGIN EXCLUSIVE");
    try {
      const receiptPromise = observeInChildProcess({
        stateDir: root,
        ref: initialized
          ? "codex://threads/concurrency-existing-wal"
          : "codex://threads/concurrency-first-initialization",
        onReady: () => {
          setTimeout(() => {
            locker.exec("COMMIT");
            lockReleased = true;
            releaseLock();
          }, 150);
        },
      });
      const [receipt] = await Promise.all([receiptPromise, released]);
      assert.equal(receipt.status, "applied");
    } finally {
      if (!lockReleased) locker.exec("ROLLBACK");
      locker.close();
    }
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function controlledAttempt(
  input: {
    attemptId?: string;
    workflowId?: string;
    executionSessionRef?: string;
    observedAt?: number;
    ttlMs?: number;
    observationAttemptId?: string;
    observationWorkflowId?: string;
  } = {},
) {
  const attemptId = input.attemptId ?? "sat-current";
  const workflowId = input.workflowId ?? "wf-current";
  const observedAt = input.observedAt ?? NOW - 1_000;
  const ttlMs = input.ttlMs ?? 300_000;
  return {
    stage_attempt_id: attemptId,
    workflow_id: workflowId,
    provider_kind: "temporal",
    execution_session_ref: input.executionSessionRef ?? SESSION_REF,
    provider_run: {
      runtime_observation: {
        surface_kind: "temporal_stage_attempt_runtime_observation",
        source: "temporal_workflow_query",
        observed_at: new Date(observedAt).toISOString(),
        ttl_ms: ttlMs,
        expires_at: new Date(observedAt + ttlMs).toISOString(),
        workflow_status: "RUNNING",
        query_status: "running",
        effective_runtime_status: "running",
        stage_attempt_id: input.observationAttemptId ?? attemptId,
        workflow_id: input.observationWorkflowId ?? workflowId,
        run_id: "temporal-run-current",
        provider_updated_at: new Date(observedAt).toISOString(),
        provider_completion_is_domain_ready: false,
      },
    },
  };
}

test("coordination activity is visible without changing execution truth", () => {
  const current = item();
  const joined = joinSessionActivityToWorkItems({
    items: [current],
    bindings: [binding({ sequence: 7 })],
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!;

  assert.equal(joined.execution.state, "queued");
  assert.equal(joined.session_activity.state, "active");
  assert.equal(joined.session_activity.coordination_session_count, 1);
  assert.equal(joined.session_activity.controlled_execution_session_count, 0);
  assert.equal(joined.session_activity.can_affect_execution, false);
  assert.equal(
    joined.session_activity.execution_effect_reason,
    "coordination_activity_is_not_execution_proof",
  );
  assert.deepEqual(joined.session_activity.active_session_refs, [SESSION_REF]);
  assert.deepEqual(joined.session_activity.nonterminal_session_refs, [SESSION_REF]);
  assert.deepEqual(joined.session_activity.session_sequences, { [SESSION_REF]: 7 });
  assert.equal(joined.source_refs[0]?.ref_kind, "sqlite");
});

test("only an exact StageAttempt binding plus fresh runtime observation can derive controlled running", () => {
  const current = item();
  const derived = deriveControlledExecutionSessionBindings({
    items: [current],
    attempts: [controlledAttempt()],
    queueDb: "/state/family-runtime/queue.sqlite",
    now: () => NOW,
  });
  assert.equal(derived.length, 1);
  const joined = joinSessionActivityToWorkItems({
    items: [current],
    bindings: derived,
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!;

  assert.equal(joined.execution.state, "running");
  assert.equal(joined.execution.running_proof_status, "running_confirmed");
  assert.equal(joined.session_activity.can_affect_execution, true);
  assert.equal(
    joined.session_activity.execution_effect_reason,
    "fresh_controlled_execution_matches_current_attempt",
  );
});

test("controlled execution remains active for the provider-approved observation TTL", () => {
  const current = item();
  const derived = deriveControlledExecutionSessionBindings({
    items: [current],
    attempts: [
      controlledAttempt({
        observedAt: NOW - 20 * 60_000,
        ttlMs: 24 * 60 * 60_000,
      }),
    ],
    queueDb: "/state/family-runtime/queue.sqlite",
    now: () => NOW,
  });
  assert.equal(derived.length, 1);

  const joined = joinSessionActivityToWorkItems({
    items: [current],
    bindings: derived,
    sourceRef: "/state/family-runtime/queue.sqlite",
    now: () => NOW,
  }).items[0]!;

  assert.equal(joined.session_activity.state, "active");
  assert.equal(joined.session_activity.controlled_execution_session_count, 1);
  assert.equal(joined.execution.state, "running");
});

test("controlled execution derivation fails closed for stale or mismatched evidence", () => {
  const current = item();
  const derive = (attempt: Record<string, unknown>) =>
    deriveControlledExecutionSessionBindings({
      items: [current],
      attempts: [attempt],
      queueDb: "/state/family-runtime/queue.sqlite",
      now: () => NOW,
    });

  assert.deepEqual(derive(controlledAttempt({ observationAttemptId: "sat-copied" })), []);
  assert.deepEqual(derive(controlledAttempt({ observationWorkflowId: "wf-copied" })), []);
  assert.deepEqual(derive(controlledAttempt({ observedAt: NOW - 300_001 })), []);
  assert.deepEqual(derive(controlledAttempt({ workflowId: "wf-not-current" })), []);
  assert.deepEqual(
    derive(controlledAttempt({ executionSessionRef: "https://invalid/session" })),
    [],
  );
});

test("stale activity is bounded and eventually becomes inactive", () => {
  const stale = joinSessionActivityToWorkItems({
    items: [item()],
    bindings: [binding({ observedAt: NOW - 300_001 })],
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!.session_activity;
  assert.equal(stale.state, "stale");
  assert.deepEqual(stale.active_session_refs, []);
  assert.deepEqual(stale.nonterminal_session_refs, [SESSION_REF]);

  const inactive = joinSessionActivityToWorkItems({
    items: [item()],
    bindings: [binding({ observedAt: NOW - 900_001 })],
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!.session_activity;
  assert.equal(inactive.state, "inactive");
  assert.deepEqual(inactive.nonterminal_session_refs, []);
  assert.deepEqual(inactive.session_sequences, {});
  assert.equal(inactive.latest_session_ref, null);
});

test("latest activity remains chronological when a newer terminal event coexists with an active session", () => {
  const activeRef = SESSION_REF;
  const terminalRef = "codex://threads/019f7eb0-44cf-7993-8fda-0057f41807bb";
  const activity = joinSessionActivityToWorkItems({
    items: [item()],
    bindings: [
      binding({ ref: activeRef, observedAt: NOW - 2_000 }),
      binding({ ref: terminalRef, state: "completed", observedAt: NOW - 1_000 }),
    ],
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!.session_activity;

  assert.equal(activity.state, "active");
  assert.deepEqual(activity.active_session_refs, [activeRef]);
  assert.equal(activity.latest_session_ref, terminalRef);
  assert.equal(activity.latest_activity_state, "completed");
});

test("newer terminal history cannot evict an older fresh active session", () => {
  const activeRef = "codex://threads/active-older-than-terminal-history";
  const bindings = [
    binding({ ref: activeRef, observedAt: NOW - 20_000 }),
    ...Array.from({ length: 10 }, (_, index) =>
      binding({
        ref: `codex://threads/terminal-${index}`,
        state: "completed",
        observedAt: NOW - 10_000 + index * 500,
      }),
    ),
  ];
  const activity = joinSessionActivityToWorkItems({
    items: [item()],
    bindings,
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!.session_activity;

  assert.equal(activity.state, "active");
  assert.deepEqual(activity.active_session_refs, [activeRef]);
  assert.equal(activity.latest_session_ref, "codex://threads/terminal-9");
  assert.equal(activity.latest_activity_state, "completed");
});

test("session refs and sequence keys share the same bounded nonterminal set", () => {
  const activity = joinSessionActivityToWorkItems({
    items: [item()],
    bindings: Array.from({ length: 12 }, (_, index) =>
      binding({
        ref: `codex://threads/nonterminal-${index}`,
        observedAt: NOW - index * 1_000,
        sequence: index,
      }),
    ),
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  }).items[0]!.session_activity;

  assert.equal(activity.nonterminal_session_refs.length, 8);
  assert.deepEqual(Object.keys(activity.session_sequences), activity.nonterminal_session_refs);
  assert.equal(activity.active_session_refs.length, 8);
});

test("full identity resolves same local WorkItem ids across scopes and only terminal close allows generation drift", () => {
  const first = item();
  const second = structuredClone(first);
  second.item_id = "mas\u0000project-diabetes-other\u0000001-dm-cvd-mortality-risk";
  second.identity.project_scope_id = "project:diabetes-other";
  second.identity.work_item_scope_id = "work-item:diabetes-other:001";
  second.identity.workspace_binding_id = "binding-diabetes-other";
  second.lifecycle.observed_generation = "sha256:generation-2";
  const exact = {
    ...observation({ state: "running", sequence: 0, generation: "sha256:generation-2" }),
    project_scope_id: second.identity.project_scope_id,
    work_item_scope_id: second.identity.work_item_scope_id,
    workspace_binding_id: second.identity.workspace_binding_id,
  };

  assert.equal(resolveWorkItemExecutionSessionObservationTarget([first, second], exact), second);
  assert.throws(
    () =>
      resolveWorkItemExecutionSessionObservationTarget([second], {
        ...exact,
        observed_generation: "sha256:generation-1",
      }),
    /full identity/,
  );
  assert.equal(
    resolveWorkItemExecutionSessionObservationTarget([second], {
      ...exact,
      activity_state: "completed",
      observed_generation: "sha256:generation-1",
    }),
    second,
  );
});

test("join uses the full identity when two workspaces reuse one local WorkItem id", () => {
  const first = item();
  const second = structuredClone(first);
  second.item_id = "mas\u0000project-diabetes-other\u0000001-dm-cvd-mortality-risk";
  second.identity.project_scope_id = "project:diabetes-other";
  second.identity.work_item_scope_id = "work-item:diabetes-other:001";
  second.identity.workspace_binding_id = "binding-diabetes-other";
  const exactSecond = binding({ ref: "codex://threads/other-workspace-exact" });
  exactSecond.identity = {
    ...exactSecond.identity,
    project_scope_id: second.identity.project_scope_id,
    work_item_scope_id: second.identity.work_item_scope_id,
    workspace_binding_id: second.identity.workspace_binding_id,
  };

  const joined = joinSessionActivityToWorkItems({
    items: [first, second],
    bindings: [exactSecond],
    sourceRef: "/state/work-item-execution-session-bindings.sqlite",
    now: () => NOW,
  });

  assert.deepEqual(joined.items[0]!.session_activity.active_session_refs, []);
  assert.deepEqual(joined.items[1]!.session_activity.active_session_refs, [
    exactSecond.execution_session_ref,
  ]);
  assert.deepEqual(joined.diagnostics, []);
});

test("session ledger appends receipts and allows generation-only drift on terminal close", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-work-item-session-"));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    assert.throws(
      () =>
        observeWorkItemExecutionSessionBinding(
          observation({
            state: "completed",
            sequence: 0,
            ref: "codex://threads/019f7eb0-44cf-7993-8fda-0057f41807bb",
          }),
          { currentItem: item(), now: () => NOW },
        ),
      /must close an existing binding/,
    );
    const started = observeWorkItemExecutionSessionBinding(
      observation({ state: "running", sequence: 0 }),
      { currentItem: item(), now: () => NOW },
    );
    assert.equal(started.status, "applied");
    assert.deepEqual(started.producer_contract.producer_owners, [
      "explicit_caller",
      "temporal_stage_activity",
    ]);
    assert.equal(
      started.producer_contract.automatic_temporal_stage_activity_producer_included,
      true,
    );
    assert.equal(started.authority_boundary.coordination_is_execution_proof, false);

    const advanced = item({
      generation: "sha256:generation-2",
      executionState: "succeeded",
      stageStatus: "completed",
    });
    const completed = observeWorkItemExecutionSessionBinding(
      observation({ state: "completed", sequence: 1, generation: "sha256:generation-2" }),
      { currentItem: advanced, now: () => NOW + 1_000 },
    );
    assert.equal(completed.status, "applied");
    const replayed = observeWorkItemExecutionSessionBinding(
      observation({ state: "completed", sequence: 1, generation: "sha256:generation-2" }),
      { currentItem: advanced, now: () => NOW + 1_000 },
    );
    assert.equal(replayed.status, "unchanged");
    assert.equal(replayed.receipt_ref, completed.receipt_ref);
    assert.deepEqual(replayed.binding, completed.binding);

    const exact = readWorkItemExecutionSessionBindings({ executionSessionRef: SESSION_REF });
    assert.equal(exact.bindings[0]?.activity_state, "completed");
    assert.equal(exact.bindings[0]?.sequence, 1);
    assert.equal(exact.bindings[0]?.identity.observed_generation, "sha256:generation-2");
    const currentRead = readWorkItemExecutionSessionBindings({
      items: [advanced],
      now: () => NOW + 1_000,
    });
    assert.equal(currentRead.bindings[0]?.execution_session_ref, SESSION_REF);
    assert.equal(currentRead.bindings[0]?.activity_state, "completed");

    const dbPath = path.join(root, "work-item-execution-session-bindings.sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM work_item_execution_session_events").get() as {
            count: number;
          }
        ).count,
        2,
      );
      assert.deepEqual(
        (
          db
            .prepare(`
          SELECT sequence, activity_state
          FROM work_item_execution_session_events
          ORDER BY sequence
        `)
            .all() as Array<Record<string, unknown>>
        ).map((row) => ({ ...row })),
        [
          { sequence: 0, activity_state: "running" },
          { sequence: 1, activity_state: "completed" },
        ],
      );
    } finally {
      db.close();
    }

    assert.throws(
      () =>
        observeWorkItemExecutionSessionBinding(
          observation({
            state: "completed",
            sequence: 1,
            generation: "sha256:generation-2",
            ref: "codex://threads/019f7eb0-44cf-7993-8fda-0057f41807bb",
          }),
          { currentItem: advanced, now: () => NOW + 1_000 },
        ),
      /must close an existing binding/,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("first session-ledger initialization waits for a concurrent database lock", async () => {
  await assertObservationWaitsForDatabaseLock(false);
});

test("existing WAL session ledger waits for a concurrent writer", async () => {
  await assertObservationWaitsForDatabaseLock(true);
});

test("the observe action rejects controlled execution activity", () => {
  assert.throws(
    () =>
      observeWorkItemExecutionSessionBinding(
        {
          ...observation({ state: "running", sequence: 0 }),
          activity_kind: "controlled_execution",
        } as any,
        {
          currentItem: item(),
          dryRun: true,
          now: () => NOW,
        },
      ),
    /records coordination only/,
  );
});

test("human gate remains authoritative over derived controlled execution evidence", () => {
  const current = item({ executionState: "idle", stageStatus: "human_gate", attention: "user" });
  const joined = joinSessionActivityToWorkItems({
    items: [current],
    bindings: [binding({ kind: "controlled_execution" })],
    sourceRef: "/state/family-runtime/queue.sqlite",
    now: () => NOW,
  }).items[0]!;

  assert.equal(joined.execution.state, "idle");
  assert.equal(joined.session_activity.can_affect_execution, false);
  assert.equal(joined.session_activity.execution_effect_reason, "human_gate_has_precedence");
});
