import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalJsonText } from "../../../kernel/canonical-json.ts";
import { FrameworkContractError, isRecord } from "../../../kernel/contract-validation.ts";
import { record, stringValue, type JsonRecord } from "../../../kernel/json-record.ts";
import { ensureOplStateDir, resolveOplStatePaths } from "../../../kernel/runtime-state-paths.ts";
import type { WorkItemProjectionDiagnostic, WorkItemProjectionItem } from "./types.ts";

export type WorkItemSessionActivityKind = "coordination" | "controlled_execution";
export type WorkItemSessionActivityState =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

const ACTIVE_SESSION_TTL_MS = 300_000;
const ACTIVE_SESSION_MAX_TTL_MS = 900_000;
const STALE_SESSION_GRACE_MS = ACTIVE_SESSION_MAX_TTL_MS - ACTIVE_SESSION_TTL_MS;
const MAX_FUTURE_SKEW_MS = 5_000;
const ACTIVE_SESSION_REF_LIMIT = 8;
const TERMINAL_ACTIVITY_STATES = new Set<WorkItemSessionActivityState>([
  "completed",
  "failed",
  "cancelled",
]);

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedStatus(value: unknown) {
  return (
    stringValue(value)
      ?.toLowerCase()
      .replace(/[\s-]+/g, "_") ?? "unknown"
  );
}

// Keep the controlled-execution reader compatible with the pre-identity authority.
// Once the identity lineage lands, this delegates to execution.ts again.
function freshStageAttemptRuntimeObservation(attempt: JsonRecord, now = Date.now()) {
  if (stringValue(attempt.provider_kind) !== "temporal") return null;
  const observation = record(record(attempt.provider_run).runtime_observation);
  const observedAt = stringValue(observation.observed_at);
  const expiresAt = stringValue(observation.expires_at);
  const providerUpdatedAt = stringValue(observation.provider_updated_at);
  const observedTime = Date.parse(observedAt ?? "");
  const expiresTime = Date.parse(expiresAt ?? "");
  const providerUpdatedTime = Date.parse(providerUpdatedAt ?? "");
  const ttlMs = numberValue(observation.ttl_ms);
  if (
    stringValue(observation.surface_kind) !== "temporal_stage_attempt_runtime_observation" ||
    stringValue(observation.source) !== "temporal_workflow_query" ||
    stringValue(observation.stage_attempt_id) !== stringValue(attempt.stage_attempt_id) ||
    stringValue(observation.workflow_id) !== stringValue(attempt.workflow_id) ||
    !observedAt ||
    !expiresAt ||
    !providerUpdatedAt ||
    !Number.isFinite(observedTime) ||
    !Number.isFinite(expiresTime) ||
    !Number.isFinite(providerUpdatedTime) ||
    ttlMs === null ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > 86_400_000 ||
    expiresTime - observedTime !== ttlMs ||
    observedTime > now + MAX_FUTURE_SKEW_MS ||
    providerUpdatedTime > now + MAX_FUTURE_SKEW_MS ||
    expiresTime <= now ||
    normalizedStatus(observation.workflow_status) !== "running" ||
    normalizedStatus(observation.query_status) !== "running" ||
    normalizedStatus(observation.effective_runtime_status) !== "running" ||
    !stringValue(observation.run_id) ||
    observation.provider_completion_is_domain_ready !== false
  )
    return null;
  return { observed_at: observedAt, expires_at: expiresAt, ttl_ms: ttlMs };
}

export type WorkItemExecutionSessionIdentity = {
  agent_id: string;
  project_id: string;
  project_scope_id: string;
  work_item_id: string;
  work_item_scope_id: string;
  workspace_binding_id: string;
  observed_generation: string;
};

export type WorkItemExecutionSessionBinding = {
  binding_id: string;
  execution_session_ref: string;
  identity: WorkItemExecutionSessionIdentity;
  activity_kind: WorkItemSessionActivityKind;
  activity_state: WorkItemSessionActivityState;
  stage_attempt_id: string | null;
  workflow_id: string | null;
  observed_at: string;
  ttl_ms: number;
  expires_at: string;
  sequence: number;
  source_ref: string | null;
  recorded_at: string;
};

export type ObserveWorkItemExecutionSessionInput = WorkItemExecutionSessionIdentity & {
  execution_session_ref: string;
  activity_kind?: "coordination";
  activity_state: WorkItemSessionActivityState;
  observed_at: string;
  sequence: number;
  source_ref?: string | null;
};

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new FrameworkContractError(
      "cli_usage_error",
      `work_item_execution_session_observe requires payload.${field}.`,
      { action_id: "work_item_execution_session_observe", required_field: field },
    );
  }
  const normalized = value.trim();
  if (normalized.length > 2048 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new FrameworkContractError(
      "cli_usage_error",
      `work_item_execution_session_observe received an invalid ${field}.`,
      { action_id: "work_item_execution_session_observe", field },
    );
  }
  return normalized;
}

function optionalString(value: unknown) {
  return value === undefined || value === null
    ? null
    : requiredString(value, "optional_identity_field");
}

function activityKind(value: unknown): WorkItemSessionActivityKind {
  if (value === undefined || value === null || value === "") return "coordination";
  if (value === "coordination") return value;
  throw new FrameworkContractError(
    "cli_usage_error",
    "work_item_execution_session_observe records coordination only; controlled execution is derived from StageAttempt runtime evidence.",
    { action_id: "work_item_execution_session_observe", allowed_activity_kinds: ["coordination"] },
  );
}

function activityState(value: unknown): WorkItemSessionActivityState {
  if (
    value === "running" ||
    value === "waiting" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  throw new FrameworkContractError(
    "cli_usage_error",
    "work_item_execution_session_observe received an unsupported activity_state.",
    {
      action_id: "work_item_execution_session_observe",
      allowed_activity_states: ["running", "waiting", "completed", "failed", "cancelled"],
    },
  );
}

function normalizedIdentity(
  input: ObserveWorkItemExecutionSessionInput,
): WorkItemExecutionSessionIdentity {
  return {
    agent_id: requiredString(input.agent_id, "agent_id"),
    project_id: requiredString(input.project_id, "project_id"),
    project_scope_id: requiredString(input.project_scope_id, "project_scope_id"),
    work_item_id: requiredString(input.work_item_id, "work_item_id"),
    work_item_scope_id: requiredString(input.work_item_scope_id, "work_item_scope_id"),
    workspace_binding_id: requiredString(input.workspace_binding_id, "workspace_binding_id"),
    observed_generation: requiredString(input.observed_generation, "observed_generation"),
  };
}

function identityForItem(item: WorkItemProjectionItem): WorkItemExecutionSessionIdentity {
  return {
    agent_id: item.identity.agent_id,
    project_id: item.identity.project_id,
    project_scope_id: item.identity.project_scope_id,
    work_item_id: item.identity.work_item_id,
    work_item_scope_id: item.identity.work_item_scope_id,
    workspace_binding_id: item.identity.workspace_binding_id,
    observed_generation: item.lifecycle.observed_generation,
  };
}

function identityMismatches(
  expected: WorkItemExecutionSessionIdentity,
  actual: WorkItemExecutionSessionIdentity,
) {
  type IdentityMismatch = {
    field: keyof WorkItemExecutionSessionIdentity;
    expected: string | null;
    actual: string | null;
  };
  const fields = [
    "agent_id",
    "project_id",
    "project_scope_id",
    "work_item_id",
    "work_item_scope_id",
    "workspace_binding_id",
    "observed_generation",
  ] as const;
  const mismatches: IdentityMismatch[] = fields.flatMap((field) =>
    expected[field] === actual[field]
      ? []
      : [{ field, expected: expected[field], actual: actual[field] }],
  );
  return mismatches;
}

export function resolveWorkItemExecutionSessionObservationTarget(
  items: WorkItemProjectionItem[],
  input: ObserveWorkItemExecutionSessionInput,
) {
  const requestedIdentity = normalizedIdentity(input);
  const closesSession = TERMINAL_ACTIVITY_STATES.has(activityState(input.activity_state));
  const matches = items.filter((item) => {
    const mismatches = identityMismatches(identityForItem(item), requestedIdentity);
    return mismatches.every(
      (mismatch) => closesSession && mismatch.field === "observed_generation",
    );
  });
  if (matches.length !== 1) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      "Execution session observation must resolve exactly one current WorkItem by its full identity.",
      {
        failure_code:
          matches.length === 0
            ? "work_item_execution_session_target_missing"
            : "work_item_execution_session_target_ambiguous",
        identity: requestedIdentity,
        terminal_generation_drift_allowed: closesSession,
        match_count: matches.length,
      },
    );
  }
  return matches[0]!;
}

function normalizeBindingRow(value: unknown): WorkItemExecutionSessionBinding | null {
  if (!isRecord(value)) return null;
  try {
    const identity = normalizedIdentity({
      agent_id: value.agent_id as string,
      project_id: value.project_id as string,
      project_scope_id: value.project_scope_id as string,
      work_item_id: value.work_item_id as string,
      work_item_scope_id: value.work_item_scope_id as string,
      workspace_binding_id: value.workspace_binding_id as string,
      observed_generation: value.observed_generation as string,
      execution_session_ref: String(value.execution_session_ref ?? ""),
      activity_state: activityState(value.activity_state),
      observed_at: String(value.observed_at ?? ""),
      sequence: Number(value.sequence),
    });
    const kind = activityKind(value.activity_kind);
    const state = activityState(value.activity_state);
    const observedAt = requiredString(value.observed_at, "observed_at");
    const expiresAt = requiredString(value.expires_at, "expires_at");
    const observedTime = Date.parse(observedAt);
    const expiresTime = Date.parse(expiresAt);
    const ttlMs = Number(value.ttl_ms);
    const sequence = Number(value.sequence);
    if (
      !Number.isFinite(observedTime) ||
      !Number.isFinite(expiresTime) ||
      !Number.isSafeInteger(ttlMs) ||
      ttlMs <= 0 ||
      ttlMs > ACTIVE_SESSION_MAX_TTL_MS ||
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      (!TERMINAL_ACTIVITY_STATES.has(state) && expiresTime - observedTime !== ttlMs) ||
      (TERMINAL_ACTIVITY_STATES.has(state) && expiresTime !== observedTime)
    )
      return null;
    return {
      binding_id: requiredString(value.binding_id, "binding_id"),
      execution_session_ref: requiredString(value.execution_session_ref, "execution_session_ref"),
      identity,
      activity_kind: kind,
      activity_state: state,
      stage_attempt_id: null,
      workflow_id: null,
      observed_at: observedAt,
      ttl_ms: ttlMs,
      expires_at: expiresAt,
      sequence,
      source_ref: optionalString(value.source_ref),
      recorded_at: requiredString(value.recorded_at, "recorded_at"),
    };
  } catch {
    return null;
  }
}

function ledgerPath() {
  const paths = resolveOplStatePaths() as ReturnType<typeof resolveOplStatePaths> & {
    work_item_execution_session_db?: string;
  };
  return (
    paths.work_item_execution_session_db ??
    path.join(paths.state_dir, "work-item-execution-session-bindings.sqlite")
  );
}

const BINDING_SELECT_COLUMNS = `
  execution_session_ref, binding_id,
  agent_id, project_id, project_scope_id, work_item_id, work_item_scope_id,
  workspace_binding_id, observed_generation,
  activity_kind, activity_state,
  observed_at, ttl_ms, expires_at, sequence, source_ref, recorded_at
`;

export function readWorkItemExecutionSessionBindings(
  options: {
    items?: WorkItemProjectionItem[];
    executionSessionRef?: string;
    now?: () => number;
  } = {},
) {
  const sourceRef = ledgerPath();
  if (!fs.existsSync(sourceRef)) {
    return {
      bindings: [] as WorkItemExecutionSessionBinding[],
      source_ref: sourceRef,
      diagnostics: [] as WorkItemProjectionDiagnostic[],
    };
  }
  const db = new DatabaseSync(sourceRef, { readOnly: true });
  try {
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_item_execution_session_bindings'",
      )
      .get();
    if (!table) {
      return {
        bindings: [] as WorkItemExecutionSessionBinding[],
        source_ref: sourceRef,
        diagnostics: [] as WorkItemProjectionDiagnostic[],
      };
    }
    const rows: Array<Record<string, unknown>> = [];
    if (options.executionSessionRef) {
      const row = db
        .prepare(`
        SELECT ${BINDING_SELECT_COLUMNS}
        FROM work_item_execution_session_bindings
        WHERE execution_session_ref = ?
          AND activity_kind = 'coordination'
      `)
        .get(options.executionSessionRef) as Record<string, unknown> | undefined;
      if (row) rows.push(row);
    } else if (options.items && options.items.length > 0) {
      const cutoff = new Date(
        (options.now ?? Date.now)() - ACTIVE_SESSION_MAX_TTL_MS,
      ).toISOString();
      const readNonterminalForItem = db.prepare(`
        SELECT ${BINDING_SELECT_COLUMNS}
        FROM work_item_execution_session_bindings
        WHERE agent_id = ?
          AND project_id = ?
          AND project_scope_id = ?
          AND work_item_id = ?
          AND work_item_scope_id = ?
          AND workspace_binding_id = ?
          AND observed_generation = ?
          AND observed_at >= ?
          AND activity_kind = 'coordination'
          AND activity_state NOT IN ('completed', 'failed', 'cancelled')
        ORDER BY observed_at DESC, execution_session_ref ASC
        LIMIT ?
      `);
      const readLatestForItem = db.prepare(`
        SELECT ${BINDING_SELECT_COLUMNS}
        FROM work_item_execution_session_bindings
        WHERE agent_id = ?
          AND project_id = ?
          AND project_scope_id = ?
          AND work_item_id = ?
          AND work_item_scope_id = ?
          AND workspace_binding_id = ?
          AND observed_generation = ?
          AND observed_at >= ?
          AND activity_kind = 'coordination'
        ORDER BY observed_at DESC, execution_session_ref ASC
        LIMIT 1
      `);
      const seen = new Set<string>();
      for (const item of options.items) {
        const identity = identityForItem(item);
        const parameters = [
          identity.agent_id,
          identity.project_id,
          identity.project_scope_id,
          identity.work_item_id,
          identity.work_item_scope_id,
          identity.workspace_binding_id,
          identity.observed_generation,
          cutoff,
        ] as const;
        const itemRows = [
          ...readNonterminalForItem.all(...parameters, ACTIVE_SESSION_REF_LIMIT),
          ...readLatestForItem.all(...parameters),
        ] as Array<Record<string, unknown>>;
        for (const row of itemRows) {
          const ref =
            typeof row.execution_session_ref === "string" ? row.execution_session_ref : "";
          if (!ref || seen.has(ref)) continue;
          seen.add(ref);
          rows.push(row);
        }
      }
    }
    const bindings = rows
      .map(normalizeBindingRow)
      .filter((binding): binding is WorkItemExecutionSessionBinding => Boolean(binding));
    return {
      bindings,
      source_ref: sourceRef,
      diagnostics: [] as WorkItemProjectionDiagnostic[],
    };
  } catch (error) {
    return {
      bindings: [] as WorkItemExecutionSessionBinding[],
      source_ref: sourceRef,
      diagnostics: [
        {
          reason: "work_item_execution_session_binding_ledger_invalid",
          ref: sourceRef,
          details: { error: error instanceof Error ? error.message : String(error) },
        },
      ] as WorkItemProjectionDiagnostic[],
    };
  } finally {
    db.close();
  }
}

function createBindingTable(db: DatabaseSync) {
  db.exec("PRAGMA busy_timeout = 5000;");
  const journalMode = db.prepare("PRAGMA journal_mode").get() as
    | { journal_mode?: unknown }
    | undefined;
  if (stringValue(journalMode?.journal_mode)?.toLowerCase() !== "wal") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_item_execution_session_bindings (
      execution_session_ref TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_scope_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      work_item_scope_id TEXT NOT NULL,
      workspace_binding_id TEXT NOT NULL,
      observed_generation TEXT NOT NULL,
      activity_kind TEXT NOT NULL CHECK(activity_kind = 'coordination'),
      activity_state TEXT NOT NULL CHECK(activity_state IN ('running', 'waiting', 'completed', 'failed', 'cancelled')),
      observed_at TEXT NOT NULL,
      ttl_ms INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK(sequence >= 0),
      source_ref TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_item_execution_session_identity
      ON work_item_execution_session_bindings(
        agent_id, project_id, work_item_id, observed_generation, expires_at
      );
    CREATE TABLE IF NOT EXISTS work_item_execution_session_events (
      receipt_ref TEXT PRIMARY KEY,
      execution_session_ref TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_scope_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      work_item_scope_id TEXT NOT NULL,
      workspace_binding_id TEXT NOT NULL,
      observed_generation TEXT NOT NULL,
      activity_kind TEXT NOT NULL CHECK(activity_kind = 'coordination'),
      activity_state TEXT NOT NULL CHECK(activity_state IN ('running', 'waiting', 'completed', 'failed', 'cancelled')),
      observed_at TEXT NOT NULL,
      ttl_ms INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK(sequence >= 0),
      source_ref TEXT,
      recorded_at TEXT NOT NULL,
      UNIQUE(execution_session_ref, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_work_item_execution_session_events_identity
      ON work_item_execution_session_events(
        agent_id, project_id, work_item_id, observed_generation, recorded_at
      );
  `);
}

function bindingRow(binding: WorkItemExecutionSessionBinding) {
  const { identity, stage_attempt_id: _stageAttemptId, workflow_id: _workflowId, ...row } = binding;
  return {
    ...row,
    ...identity,
  };
}

function readBinding(db: DatabaseSync, executionSessionRef: string) {
  return normalizeBindingRow(
    db
      .prepare(`
    SELECT * FROM work_item_execution_session_bindings WHERE execution_session_ref = ?
  `)
      .get(executionSessionRef),
  );
}

function persistBinding(db: DatabaseSync, binding: WorkItemExecutionSessionBinding) {
  db.prepare(`
    INSERT INTO work_item_execution_session_bindings (
      execution_session_ref, binding_id,
      agent_id, project_id, project_scope_id, work_item_id, work_item_scope_id,
      workspace_binding_id, observed_generation,
      activity_kind, activity_state,
      observed_at, ttl_ms, expires_at, sequence, source_ref, recorded_at
    ) VALUES (
      @execution_session_ref, @binding_id,
      @agent_id, @project_id, @project_scope_id, @work_item_id, @work_item_scope_id,
      @workspace_binding_id, @observed_generation,
      @activity_kind, @activity_state,
      @observed_at, @ttl_ms, @expires_at, @sequence, @source_ref, @recorded_at
    )
    ON CONFLICT(execution_session_ref) DO UPDATE SET
      observed_generation = CASE
        WHEN excluded.activity_state IN ('completed', 'failed', 'cancelled')
          THEN excluded.observed_generation
        ELSE work_item_execution_session_bindings.observed_generation
      END,
      activity_state = excluded.activity_state,
      observed_at = excluded.observed_at,
      ttl_ms = excluded.ttl_ms,
      expires_at = excluded.expires_at,
      sequence = excluded.sequence,
      source_ref = excluded.source_ref,
      recorded_at = excluded.recorded_at
    WHERE excluded.sequence > work_item_execution_session_bindings.sequence
  `).run(bindingRow(binding));
}

function receiptRef(binding: WorkItemExecutionSessionBinding) {
  return `${binding.binding_id}#sequence=${binding.sequence}`;
}

function persistBindingEvent(db: DatabaseSync, binding: WorkItemExecutionSessionBinding) {
  db.prepare(`
    INSERT INTO work_item_execution_session_events (
      receipt_ref, execution_session_ref, binding_id,
      agent_id, project_id, project_scope_id, work_item_id, work_item_scope_id,
      workspace_binding_id, observed_generation,
      activity_kind, activity_state,
      observed_at, ttl_ms, expires_at, sequence, source_ref, recorded_at
    ) VALUES (
      @receipt_ref, @execution_session_ref, @binding_id,
      @agent_id, @project_id, @project_scope_id, @work_item_id, @work_item_scope_id,
      @workspace_binding_id, @observed_generation,
      @activity_kind, @activity_state,
      @observed_at, @ttl_ms, @expires_at, @sequence, @source_ref, @recorded_at
    )
  `).run({ ...bindingRow(binding), receipt_ref: receiptRef(binding) });
}

function bindingId(executionSessionRef: string) {
  const digest = createHash("sha256").update(executionSessionRef, "utf8").digest("hex");
  return `opl://work-item-execution-session/${digest}`;
}

function buildReceipt(
  binding: WorkItemExecutionSessionBinding,
  status: "dry_run" | "applied" | "unchanged",
) {
  return {
    surface_kind: "opl_work_item_execution_session_binding_receipt",
    schema_version: "work-item-execution-session-binding-receipt.v1",
    status,
    action_id: "work_item_execution_session_observe",
    receipt_ref: receiptRef(binding),
    binding,
    ledger: {
      source_ref: ledgerPath(),
      current_binding_table: "work_item_execution_session_bindings",
      append_only_event_table: "work_item_execution_session_events",
      append_only_receipt_persisted: status !== "dry_run",
    },
    authority_boundary: {
      projection_only: true,
      coordination_is_execution_proof: false,
      can_write_stage_attempt: false,
      can_change_work_item_lifecycle: false,
      can_clear_human_gate: false,
      can_write_domain_truth: false,
    },
    producer_contract: {
      producer_owners: ["explicit_caller", "temporal_stage_activity"],
      automatic_temporal_stage_activity_producer_included: true,
      automatic_shell_watcher_included: false,
      activity_kind: "coordination",
      controlled_execution_source: "exact_stage_attempt_binding_plus_fresh_runtime_observation",
      events: ["turn_start", "heartbeat", "terminal"],
      recommended_heartbeat_cadence_ms: 60_000,
      heartbeat_cadence_must_be_less_than_ttl: true,
      active_ttl_ms: ACTIVE_SESSION_TTL_MS,
      stale_grace_ms: STALE_SESSION_GRACE_MS,
      max_readback_refs_per_work_item: ACTIVE_SESSION_REF_LIMIT,
      terminal_close_requires_existing_binding: true,
      terminal_close_allows_observed_generation_drift_only: true,
      stable_command:
        "opl app action execute --action work_item_execution_session_observe --payload <json> --json",
    },
  } as const;
}

export function deriveControlledExecutionSessionBindings(input: {
  items: WorkItemProjectionItem[];
  attempts: JsonRecord[];
  queueDb: string;
  now?: () => number;
}) {
  const nowMs = (input.now ?? Date.now)();
  const attemptById = new Map(
    input.attempts.map((attempt) => [stringValue(attempt.stage_attempt_id), attempt]),
  );
  const bindings: WorkItemExecutionSessionBinding[] = [];
  for (const item of input.items) {
    const attemptId = item.execution.attempt_id;
    const attempt = attemptId ? attemptById.get(attemptId) : null;
    if (!attempt) continue;
    const workflowId = stringValue(attempt.workflow_id);
    const executionSessionRef = stringValue(attempt.execution_session_ref);
    if (
      !workflowId ||
      workflowId !== item.execution.workflow_id ||
      !executionSessionRef ||
      !/^codex:\/\/threads\/[0-9a-z-]+$/iu.test(executionSessionRef)
    )
      continue;
    const runtime = freshStageAttemptRuntimeObservation(attempt, nowMs);
    if (!runtime) continue;
    const observedMs = Date.parse(runtime.observed_at);
    bindings.push({
      binding_id: `${bindingId(executionSessionRef)}#stage-attempt=${attemptId}`,
      execution_session_ref: executionSessionRef,
      identity: identityForItem(item),
      activity_kind: "controlled_execution",
      activity_state: "running",
      stage_attempt_id: attemptId,
      workflow_id: workflowId,
      observed_at: runtime.observed_at,
      ttl_ms: runtime.ttl_ms,
      expires_at: runtime.expires_at,
      sequence: Number.isSafeInteger(observedMs) && observedMs >= 0 ? observedMs : 0,
      source_ref: `${input.queueDb}#stage_attempts/${attemptId}`,
      recorded_at: runtime.observed_at,
    });
  }
  return bindings;
}

export function observeWorkItemExecutionSessionBinding(
  input: ObserveWorkItemExecutionSessionInput,
  options: {
    currentItem: WorkItemProjectionItem;
    dryRun?: boolean;
    now?: () => number;
  },
) {
  const now = options.now ?? Date.now;
  const nowMs = now();
  const identity = normalizedIdentity(input);
  const mismatches = identityMismatches(identityForItem(options.currentItem), identity);
  const requestedState = activityState(input.activity_state);
  const requestedKind = activityKind(input.activity_kind);
  const closesSession = TERMINAL_ACTIVITY_STATES.has(requestedState);
  const blockingIdentityMismatches = closesSession
    ? mismatches.filter((mismatch) => mismatch.field !== "observed_generation")
    : mismatches;
  if (blockingIdentityMismatches.length > 0) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      "Execution session observation does not match the current canonical WorkItem identity.",
      {
        failure_code: "work_item_execution_session_identity_mismatch",
        mismatches: blockingIdentityMismatches,
      },
    );
  }
  const executionSessionRef = requiredString(input.execution_session_ref, "execution_session_ref");
  if (!/^codex:\/\/threads\/[0-9a-z-]+$/iu.test(executionSessionRef)) {
    throw new FrameworkContractError(
      "cli_usage_error",
      "execution_session_ref must use codex://threads/<thread-id>.",
      {
        action_id: "work_item_execution_session_observe",
        execution_session_ref: executionSessionRef,
      },
    );
  }
  const kind = requestedKind;
  const state = requestedState;
  const observedAt = requiredString(input.observed_at, "observed_at");
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs) || observedMs > nowMs + MAX_FUTURE_SKEW_MS) {
    throw new FrameworkContractError(
      "cli_usage_error",
      "work_item_execution_session_observe received an invalid or future observed_at.",
      { action_id: "work_item_execution_session_observe", observed_at: observedAt },
    );
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    throw new FrameworkContractError(
      "cli_usage_error",
      "work_item_execution_session_observe requires a non-negative integer sequence.",
      { action_id: "work_item_execution_session_observe", sequence: input.sequence },
    );
  }
  const terminal = TERMINAL_ACTIVITY_STATES.has(state);
  const expiresAt = new Date(
    terminal ? observedMs : observedMs + ACTIVE_SESSION_TTL_MS,
  ).toISOString();
  if (!terminal && Date.parse(expiresAt) <= nowMs) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      "Active execution session observation is already expired.",
      { failure_code: "work_item_execution_session_observation_expired", observed_at: observedAt },
    );
  }
  const recordedAt = new Date(nowMs).toISOString();
  const next: WorkItemExecutionSessionBinding = {
    binding_id: bindingId(executionSessionRef),
    execution_session_ref: executionSessionRef,
    identity,
    activity_kind: kind,
    activity_state: state,
    stage_attempt_id: null,
    workflow_id: null,
    observed_at: new Date(observedMs).toISOString(),
    ttl_ms: ACTIVE_SESSION_TTL_MS,
    expires_at: expiresAt,
    sequence: input.sequence,
    source_ref: optionalString(input.source_ref),
    recorded_at: recordedAt,
  };
  const validatePrevious = (previous: WorkItemExecutionSessionBinding | null) => {
    if (!previous) {
      if (closesSession) {
        throw new FrameworkContractError(
          "contract_shape_invalid",
          "A terminal coordination observation must close an existing binding.",
          {
            failure_code: "work_item_execution_session_terminal_without_binding",
            execution_session_ref: executionSessionRef,
          },
        );
      }
      return null;
    }
    const drift = identityMismatches(previous.identity, next.identity);
    const blockingDrift = closesSession
      ? drift.filter((mismatch) => mismatch.field !== "observed_generation")
      : drift;
    if (
      blockingDrift.length > 0 ||
      previous.activity_kind !== next.activity_kind ||
      previous.stage_attempt_id !== next.stage_attempt_id ||
      previous.workflow_id !== next.workflow_id
    ) {
      throw new FrameworkContractError(
        "contract_shape_invalid",
        "Execution session is already bound to a different WorkItem or activity role.",
        {
          failure_code: "work_item_execution_session_binding_conflict",
          execution_session_ref: executionSessionRef,
        },
      );
    }
    if (
      next.sequence < previous.sequence ||
      Date.parse(next.observed_at) < Date.parse(previous.observed_at)
    ) {
      throw new FrameworkContractError(
        "contract_shape_invalid",
        "Execution session observation regressed sequence or observed_at.",
        {
          failure_code: "work_item_execution_session_observation_regressed",
          execution_session_ref: executionSessionRef,
        },
      );
    }
    if (next.sequence === previous.sequence) {
      const comparable = (binding: WorkItemExecutionSessionBinding) => ({
        ...binding,
        recorded_at: null,
      });
      if (canonicalJsonText(comparable(previous)) !== canonicalJsonText(comparable(next))) {
        throw new FrameworkContractError(
          "contract_shape_invalid",
          "Execution session sequence is already bound to a different observation.",
          {
            failure_code: "work_item_execution_session_sequence_conflict",
            execution_session_ref: executionSessionRef,
          },
        );
      }
      return buildReceipt(previous, "unchanged");
    }
    if (TERMINAL_ACTIVITY_STATES.has(previous.activity_state)) {
      throw new FrameworkContractError(
        "contract_shape_invalid",
        "A terminal execution session binding cannot become active again.",
        {
          failure_code: "work_item_execution_session_terminal_reactivation",
          execution_session_ref: executionSessionRef,
        },
      );
    }
    return null;
  };
  if (options.dryRun) {
    const previous =
      readWorkItemExecutionSessionBindings({ executionSessionRef }).bindings[0] ?? null;
    return validatePrevious(previous) ?? buildReceipt(next, "dry_run");
  }
  const paths = ensureOplStateDir(resolveOplStatePaths());
  fs.mkdirSync(paths.state_dir, { recursive: true });
  const db = new DatabaseSync(ledgerPath());
  try {
    createBindingTable(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = readBinding(db, executionSessionRef);
      const unchanged = validatePrevious(previous);
      if (unchanged) {
        db.exec("COMMIT");
        return unchanged;
      }
      persistBindingEvent(db, next);
      persistBinding(db, next);
      db.exec("COMMIT");
      return buildReceipt(next, "applied");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

function sessionRunningProofBlockReason(
  item: WorkItemProjectionItem,
  binding: WorkItemExecutionSessionBinding,
) {
  if (binding.activity_kind !== "controlled_execution")
    return "coordination_activity_is_not_execution_proof";
  if (binding.activity_state !== "running") return "controlled_execution_session_is_not_running";
  if (item.attention.kind === "user" || item.execution.stage_status === "human_gate") {
    return "human_gate_has_precedence";
  }
  if (item.lifecycle.business_state !== "active") {
    return `business_lifecycle_${item.lifecycle.business_state}_has_precedence`;
  }
  if (!item.execution.attempt_id || binding.stage_attempt_id !== item.execution.attempt_id) {
    return "controlled_session_stage_attempt_is_not_current";
  }
  if (!item.execution.workflow_id || binding.workflow_id !== item.execution.workflow_id) {
    return "controlled_session_workflow_is_not_current";
  }
  if (["succeeded", "failed", "idle"].includes(item.execution.state)) {
    return "canonical_stage_attempt_is_terminal_or_idle";
  }
  return null;
}

function activityLabelKey(activeCount: number, controlledCount: number, stale: boolean) {
  if (activeCount > 0 && controlledCount > 0)
    return "runtimeSessionActivity.activeControlledExecution";
  if (activeCount > 0) return "runtimeSessionActivity.activeCoordination";
  return stale ? "runtimeSessionActivity.stale" : "runtimeSessionActivity.inactive";
}

function activitySource(bindings: WorkItemExecutionSessionBinding[]) {
  const hasControlled = bindings.some(
    (binding) => binding.activity_kind === "controlled_execution",
  );
  const hasCoordination = bindings.some((binding) => binding.activity_kind === "coordination");
  if (hasControlled && hasCoordination) return "opl_combined_work_item_session_activity" as const;
  if (hasControlled) return "opl_stage_attempt_execution_session_binding" as const;
  return "opl_work_item_execution_session_binding_ledger" as const;
}

function bindingIsWithinRetentionWindow(binding: WorkItemExecutionSessionBinding, nowMs: number) {
  const observedMs = Date.parse(binding.observed_at);
  const expiresMs = Date.parse(binding.expires_at);
  if (!Number.isFinite(observedMs) || !Number.isFinite(expiresMs)) return false;
  if (TERMINAL_ACTIVITY_STATES.has(binding.activity_state)) {
    return observedMs >= nowMs - ACTIVE_SESSION_MAX_TTL_MS;
  }
  return expiresMs >= nowMs - STALE_SESSION_GRACE_MS;
}

export function joinSessionActivityToWorkItems(input: {
  items: WorkItemProjectionItem[];
  bindings: WorkItemExecutionSessionBinding[];
  sourceRef: string;
  now?: () => number;
}) {
  const nowMs = (input.now ?? Date.now)();
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const bindingsByItem = new Map<string, WorkItemExecutionSessionBinding[]>();
  for (const binding of input.bindings) {
    const candidates = input.items.filter(
      (item) => identityMismatches(identityForItem(item), binding.identity).length === 0,
    );
    const item = candidates.length === 1 ? candidates[0]! : null;
    if (!item) {
      const sameLocalIdentity = input.items.filter(
        (candidate) =>
          candidate.identity.agent_id === binding.identity.agent_id &&
          candidate.identity.project_id === binding.identity.project_id &&
          candidate.identity.work_item_id === binding.identity.work_item_id,
      );
      if (candidates.length === 0 && sameLocalIdentity.length > 0) {
        diagnostics.push({
          reason: "work_item_execution_session_binding_not_current",
          agent_id: binding.identity.agent_id,
          project_id: binding.identity.project_id,
          work_item_id: binding.identity.work_item_id,
          ref: binding.execution_session_ref,
          details: {
            mismatches: sameLocalIdentity.flatMap((candidate) =>
              identityMismatches(identityForItem(candidate), binding.identity),
            ),
          },
        });
        continue;
      }
      diagnostics.push({
        reason: "work_item_execution_session_identity_not_in_current_inventory",
        agent_id: binding.identity.agent_id,
        project_id: binding.identity.project_id,
        work_item_id: binding.identity.work_item_id,
        ref: binding.execution_session_ref,
      });
      continue;
    }
    bindingsByItem.set(item.item_id, [...(bindingsByItem.get(item.item_id) ?? []), binding]);
  }

  const items = input.items.map((item) => {
    const ordered = [...(bindingsByItem.get(item.item_id) ?? [])].sort(
      (left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at),
    );
    const bindingByRef = new Map<string, WorkItemExecutionSessionBinding>();
    for (const binding of ordered) {
      const existing = bindingByRef.get(binding.execution_session_ref);
      if (
        !existing ||
        (binding.activity_kind === "controlled_execution" &&
          existing.activity_kind !== "controlled_execution")
      ) {
        bindingByRef.set(binding.execution_session_ref, binding);
      }
    }
    const matched = [...bindingByRef.values()].sort(
      (left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at),
    );
    const withinWindow = matched.filter((binding) =>
      bindingIsWithinRetentionWindow(binding, nowMs),
    );
    const latest = withinWindow[0] ?? null;
    const boundedNonterminal = withinWindow
      .filter((binding) => !TERMINAL_ACTIVITY_STATES.has(binding.activity_state))
      .sort(
        (left, right) =>
          Number(right.activity_kind === "controlled_execution") -
            Number(left.activity_kind === "controlled_execution") ||
          Date.parse(right.observed_at) - Date.parse(left.observed_at),
      )
      .slice(0, ACTIVE_SESSION_REF_LIMIT)
      .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at));
    const retained =
      latest && TERMINAL_ACTIVITY_STATES.has(latest.activity_state)
        ? [...boundedNonterminal, latest]
        : boundedNonterminal;
    const active = retained.filter(
      (binding) =>
        !TERMINAL_ACTIVITY_STATES.has(binding.activity_state) &&
        Date.parse(binding.observed_at) <= nowMs + MAX_FUTURE_SKEW_MS &&
        Date.parse(binding.expires_at) > nowMs,
    );
    const stale =
      active.length === 0 &&
      boundedNonterminal.some(
        (binding) =>
          !TERMINAL_ACTIVITY_STATES.has(binding.activity_state) &&
          Date.parse(binding.expires_at) <= nowMs &&
          nowMs - Date.parse(binding.expires_at) <= STALE_SESSION_GRACE_MS,
      );
    const activeControlled = active.filter(
      (binding) => binding.activity_kind === "controlled_execution",
    );
    const eligible =
      activeControlled.find((binding) => sessionRunningProofBlockReason(item, binding) === null) ??
      null;
    const blockedReason = eligible
      ? null
      : active[0]
        ? sessionRunningProofBlockReason(item, active[0])
        : null;
    const execution =
      eligible && ["queued", "unknown"].includes(item.execution.state)
        ? {
            ...item.execution,
            state: "running" as const,
            stage_status: "running",
            last_heartbeat_at: eligible.observed_at,
            updated_at: eligible.observed_at,
            running_proof_status: "running_confirmed",
            diagnostic_reason: null,
          }
        : item.execution;
    const activeRefs = active
      .map((binding) => binding.execution_session_ref)
      .slice(0, ACTIVE_SESSION_REF_LIMIT);
    const nonterminalRefs = boundedNonterminal
      .map((binding) => binding.execution_session_ref)
      .slice(0, ACTIVE_SESSION_REF_LIMIT);
    const sequenceByRef = new Map(
      boundedNonterminal.map((binding) => [binding.execution_session_ref, binding.sequence]),
    );
    return {
      ...item,
      execution,
      session_activity: {
        state: active.length > 0 ? "active" : stale ? "stale" : "inactive",
        active_session_count: active.length,
        coordination_session_count: active.filter(
          (binding) => binding.activity_kind === "coordination",
        ).length,
        controlled_execution_session_count: activeControlled.length,
        active_session_refs: activeRefs,
        nonterminal_session_refs: nonterminalRefs,
        session_sequences: Object.fromEntries(
          nonterminalRefs.map((ref) => [ref, sequenceByRef.get(ref)!]),
        ),
        latest_session_ref: latest?.execution_session_ref ?? null,
        latest_activity_kind: latest?.activity_kind ?? null,
        latest_activity_state: latest?.activity_state ?? null,
        latest_activity_at: latest?.observed_at ?? null,
        fresh_until: latest?.expires_at ?? null,
        label_key: activityLabelKey(active.length, activeControlled.length, stale),
        label_args: { active_session_count: active.length },
        source: activitySource(retained),
        can_affect_execution: Boolean(eligible),
        execution_effect_reason: eligible
          ? "fresh_controlled_execution_matches_current_attempt"
          : blockedReason,
      },
      source_refs:
        retained.length > 0
          ? [
              ...item.source_refs,
              ...[...new Set(retained.map((binding) => binding.source_ref ?? input.sourceRef))].map(
                (ref) => ({
                  ref_kind: "sqlite" as const,
                  ref,
                  role: "work_item_execution_session_activity",
                }),
              ),
            ]
          : item.source_refs,
    };
  });
  return { items, diagnostics };
}

export const WORK_ITEM_EXECUTION_SESSION_ACTIVITY_POLICY = {
  active_ttl_ms: ACTIVE_SESSION_TTL_MS,
  max_ttl_ms: ACTIVE_SESSION_MAX_TTL_MS,
  stale_grace_ms: STALE_SESSION_GRACE_MS,
  max_future_skew_ms: MAX_FUTURE_SKEW_MS,
  max_refs_per_work_item: ACTIVE_SESSION_REF_LIMIT,
  read_scope: "current_work_item_identity_with_bounded_freshness_only",
  precedence: [
    "human_gate_or_domain_terminal",
    "canonical_stage_attempt_currentness",
    "fresh_controlled_execution_session",
    "coordination_activity_is_not_execution_proof",
  ],
} as const;
