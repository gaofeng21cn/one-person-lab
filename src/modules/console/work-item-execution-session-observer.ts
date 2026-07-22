import { FrameworkContractError } from "../../kernel/contract-validation.ts";
import { buildWorkItemProjectionV2 } from "./work-item-projection/projection.ts";
import {
  observeWorkItemExecutionSessionBinding,
  readWorkItemExecutionSessionBindings,
  resolveWorkItemExecutionSessionObservationTarget,
  type ObserveWorkItemExecutionSessionInput,
  type WorkItemExecutionSessionBinding,
  type WorkItemSessionActivityState,
} from "./work-item-projection/session-activity.ts";
import type { WorkItemProjectionItem } from "./work-item-projection/types.ts";

type WorkItemExecutionScope = {
  domain_id?: unknown;
  domain_work_item_id?: unknown;
  project_scope_id?: unknown;
  work_item_scope_id?: unknown;
  workspace_binding_id?: unknown;
};

export type TemporalStageActivitySessionObserverInput = {
  stage_attempt_id: string;
  workflow_id: string;
  domain_id: string;
  execution_scope?: WorkItemExecutionScope | null;
};

export type TemporalStageActivityRunnerEvent = {
  event_kind: string;
  value?: string | null;
};

export type TemporalStageActivitySessionTerminalState = Extract<
  WorkItemSessionActivityState,
  "completed" | "failed" | "cancelled"
>;

type BindingReceipt = ReturnType<typeof observeWorkItemExecutionSessionBinding>;

export type TemporalStageActivitySessionObservationResult = {
  surface_kind: "opl_temporal_stage_activity_session_observation_result";
  event_kind: "start" | "heartbeat" | "terminal" | "ignored";
  status: "applied" | "unchanged" | "skipped" | "failed";
  activity_state: WorkItemSessionActivityState | null;
  execution_session_ref: string | null;
  receipt_ref: string | null;
  observed_at: string | null;
  sequence: number | null;
  reason: string | null;
  failure_code: string | null;
};

export type TemporalStageActivitySessionObservationSummary = {
  surface_kind: "opl_temporal_stage_activity_session_observation_summary";
  schema_version: "opl-temporal-stage-activity-session-observation-summary.v1";
  status: "not_started" | "active" | "terminal" | "degraded";
  stage_attempt_ref: string;
  workflow_ref: string;
  execution_session_ref: string | null;
  latest_receipt_ref: string | null;
  latest_activity_state: WorkItemSessionActivityState | null;
  terminal_state: TemporalStageActivitySessionTerminalState | null;
  emitted_event_count: number;
  heartbeat_count: number;
  failure_codes: string[];
  authority_boundary: {
    projection_only: true;
    coordination_is_execution_proof: false;
    can_change_stage_attempt: false;
    can_change_work_item_lifecycle: false;
    can_write_domain_truth: false;
  };
};

type ObserverDependencies = {
  now?: () => number;
  readCurrentItems?: () => WorkItemProjectionItem[];
  observeBinding?: typeof observeWorkItemExecutionSessionBinding;
  readBindings?: typeof readWorkItemExecutionSessionBindings;
};

const TERMINAL_STATES = new Set<WorkItemSessionActivityState>(["completed", "failed", "cancelled"]);

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      `Automatic coordination observation requires ${field}.`,
      { failure_code: "automatic_coordination_observation_identity_missing", field },
    );
  }
  return value.trim();
}

function workItemTarget(
  input: TemporalStageActivitySessionObserverInput,
  items: WorkItemProjectionItem[],
) {
  const scope = input.execution_scope;
  if (!scope) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      "Automatic coordination observation requires a work-item execution scope.",
      { failure_code: "automatic_coordination_execution_scope_missing" },
    );
  }
  const domainId = requiredText(input.domain_id, "domain_id");
  const scopedDomainId = requiredText(scope.domain_id, "execution_scope.domain_id");
  if (domainId !== scopedDomainId) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      "Automatic coordination observation domain identity does not match its execution scope.",
      {
        failure_code: "automatic_coordination_domain_identity_mismatch",
        domain_id: domainId,
        execution_scope_domain_id: scopedDomainId,
      },
    );
  }
  const projectScopeId = requiredText(scope.project_scope_id, "execution_scope.project_scope_id");
  const workItemScopeId = requiredText(
    scope.work_item_scope_id,
    "execution_scope.work_item_scope_id",
  );
  const workspaceBindingId = requiredText(
    scope.workspace_binding_id,
    "execution_scope.workspace_binding_id",
  );
  const workItemId = requiredText(scope.domain_work_item_id, "execution_scope.domain_work_item_id");
  const matches = items.filter(
    (item) =>
      item.identity.domain_id === domainId &&
      item.identity.project_scope_id === projectScopeId &&
      item.identity.work_item_scope_id === workItemScopeId &&
      item.identity.workspace_binding_id === workspaceBindingId &&
      item.identity.work_item_id === workItemId,
  );
  if (matches.length !== 1) {
    throw new FrameworkContractError(
      "contract_shape_invalid",
      "Automatic coordination observation must resolve exactly one current WorkItem.",
      {
        failure_code:
          matches.length === 0
            ? "automatic_coordination_work_item_missing"
            : "automatic_coordination_work_item_ambiguous",
        match_count: matches.length,
        domain_id: domainId,
        project_scope_id: projectScopeId,
        work_item_scope_id: workItemScopeId,
        workspace_binding_id: workspaceBindingId,
        domain_work_item_id: workItemId,
      },
    );
  }
  return matches[0]!;
}

function observationIdentity(item: WorkItemProjectionItem) {
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

function failureCode(error: unknown) {
  if (
    error instanceof FrameworkContractError &&
    typeof error.details?.failure_code === "string" &&
    error.details.failure_code.trim()
  )
    return error.details.failure_code.trim();
  return "automatic_coordination_observation_failed";
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createTemporalStageActivitySessionObserver(
  input: TemporalStageActivitySessionObserverInput,
  dependencies: ObserverDependencies = {},
) {
  const now = dependencies.now ?? Date.now;
  const readCurrentItems =
    dependencies.readCurrentItems ?? (() => buildWorkItemProjectionV2({ profile: "fast" }).items);
  const observeBinding = dependencies.observeBinding ?? observeWorkItemExecutionSessionBinding;
  const readBindings = dependencies.readBindings ?? readWorkItemExecutionSessionBindings;
  const stageAttemptRef = `opl://stage_attempts/${encodeURIComponent(input.stage_attempt_id)}`;
  const workflowRef = `temporal://workflows/${encodeURIComponent(input.workflow_id)}`;
  let currentItem: WorkItemProjectionItem | null = null;
  let executionSessionRef: string | null = null;
  let latestBinding: WorkItemExecutionSessionBinding | null = null;
  let latestReceiptRef: string | null = null;
  let latestState: WorkItemSessionActivityState | null = null;
  let terminalState: TemporalStageActivitySessionTerminalState | null = null;
  let emittedEventCount = 0;
  let heartbeatCount = 0;
  const failureCodes = new Set<string>();

  const result = (value: Omit<TemporalStageActivitySessionObservationResult, "surface_kind">) => ({
    surface_kind: "opl_temporal_stage_activity_session_observation_result" as const,
    ...value,
  });

  const failed = (
    eventKind: TemporalStageActivitySessionObservationResult["event_kind"],
    error: unknown,
  ) => {
    const code = failureCode(error);
    failureCodes.add(code);
    return result({
      event_kind: eventKind,
      status: "failed",
      activity_state: latestState,
      execution_session_ref: executionSessionRef,
      receipt_ref: latestReceiptRef,
      observed_at: latestBinding?.observed_at ?? null,
      sequence: latestBinding?.sequence ?? null,
      reason: failureMessage(error),
      failure_code: code,
    });
  };

  const skipped = (
    eventKind: TemporalStageActivitySessionObservationResult["event_kind"],
    reason: string,
  ) =>
    result({
      event_kind: eventKind,
      status: "skipped",
      activity_state: latestState,
      execution_session_ref: executionSessionRef,
      receipt_ref: latestReceiptRef,
      observed_at: latestBinding?.observed_at ?? null,
      sequence: latestBinding?.sequence ?? null,
      reason,
      failure_code: null,
    });

  const fromReceipt = (
    eventKind: Exclude<TemporalStageActivitySessionObservationResult["event_kind"], "ignored">,
    receipt: BindingReceipt,
  ) => {
    latestBinding = receipt.binding;
    latestReceiptRef = receipt.receipt_ref;
    latestState = receipt.binding.activity_state;
    if (TERMINAL_STATES.has(latestState)) {
      terminalState = latestState as TemporalStageActivitySessionTerminalState;
    }
    emittedEventCount += Number(receipt.status === "applied");
    heartbeatCount += Number(eventKind === "heartbeat" && receipt.status === "applied");
    return result({
      event_kind: eventKind,
      status: receipt.status === "applied" ? "applied" : "unchanged",
      activity_state: receipt.binding.activity_state,
      execution_session_ref: receipt.binding.execution_session_ref,
      receipt_ref: receipt.receipt_ref,
      observed_at: receipt.binding.observed_at,
      sequence: receipt.binding.sequence,
      reason: null,
      failure_code: null,
    });
  };

  const nextObservation = (activityState: WorkItemSessionActivityState) => {
    if (!currentItem || !executionSessionRef) {
      throw new FrameworkContractError(
        "contract_shape_invalid",
        "Automatic coordination observation has no started execution session.",
        { failure_code: "automatic_coordination_session_not_started" },
      );
    }
    const nowMs = Math.floor(now());
    const previousObservedMs = Date.parse(latestBinding?.observed_at ?? "");
    const observedMs = Math.max(
      Number.isSafeInteger(nowMs) && nowMs >= 0 ? nowMs : 0,
      Number.isFinite(previousObservedMs) ? previousObservedMs + 1 : 0,
      (latestBinding?.sequence ?? -1) + 1,
    );
    const observation: ObserveWorkItemExecutionSessionInput = {
      ...observationIdentity(currentItem),
      execution_session_ref: executionSessionRef,
      activity_kind: "coordination",
      activity_state: activityState,
      observed_at: new Date(observedMs).toISOString(),
      sequence: observedMs,
      source_ref: `${stageAttemptRef}#workflow=${encodeURIComponent(input.workflow_id)}`,
    };
    const target = resolveWorkItemExecutionSessionObservationTarget([currentItem], observation);
    return observeBinding(observation, { currentItem: target, now: () => observedMs });
  };

  const onRunnerProgress = (event: TemporalStageActivityRunnerEvent) => {
    if (event.event_kind !== "thread.started") {
      return skipped("ignored", "runner_event_does_not_start_execution_session");
    }
    if (typeof event.value !== "string" || !/^[0-9a-z-]+$/iu.test(event.value.trim())) {
      return failed(
        "start",
        new FrameworkContractError(
          "contract_shape_invalid",
          "thread.started must carry a canonical Codex thread id.",
          { failure_code: "automatic_coordination_thread_id_invalid" },
        ),
      );
    }
    const requestedRef = `codex://threads/${event.value.trim()}`;
    if (executionSessionRef && executionSessionRef !== requestedRef) {
      return failed(
        "start",
        new FrameworkContractError(
          "contract_shape_invalid",
          "One Temporal activity cannot bind multiple Codex execution sessions.",
          {
            failure_code: "automatic_coordination_session_ref_conflict",
            current_execution_session_ref: executionSessionRef,
            requested_execution_session_ref: requestedRef,
          },
        ),
      );
    }
    try {
      currentItem ??= workItemTarget(input, readCurrentItems());
      executionSessionRef = requestedRef;
      const existing = readBindings({ executionSessionRef }).bindings[0] ?? null;
      if (existing) {
        const identityCheck: ObserveWorkItemExecutionSessionInput = {
          ...existing.identity,
          execution_session_ref: existing.execution_session_ref,
          activity_kind: "coordination",
          activity_state: existing.activity_state,
          observed_at: existing.observed_at,
          sequence: existing.sequence,
          source_ref: existing.source_ref,
        };
        resolveWorkItemExecutionSessionObservationTarget([currentItem], identityCheck);
        latestBinding = existing;
        latestState = existing.activity_state;
        latestReceiptRef = `${existing.binding_id}#sequence=${existing.sequence}`;
        if (TERMINAL_STATES.has(existing.activity_state)) {
          terminalState = existing.activity_state as TemporalStageActivitySessionTerminalState;
          return result({
            event_kind: "start",
            status: "unchanged",
            activity_state: existing.activity_state,
            execution_session_ref: existing.execution_session_ref,
            receipt_ref: latestReceiptRef,
            observed_at: existing.observed_at,
            sequence: existing.sequence,
            reason: "execution_session_already_terminal",
            failure_code: null,
          });
        }
      }
      return fromReceipt("start", nextObservation("running"));
    } catch (error) {
      return failed("start", error);
    }
  };

  const heartbeat = () => {
    if (!executionSessionRef || !currentItem) {
      return skipped("heartbeat", "execution_session_not_started");
    }
    if (terminalState) {
      return skipped("heartbeat", "execution_session_already_terminal");
    }
    try {
      return fromReceipt("heartbeat", nextObservation("running"));
    } catch (error) {
      return failed("heartbeat", error);
    }
  };

  const terminal = (state: TemporalStageActivitySessionTerminalState) => {
    if (!executionSessionRef || !currentItem) {
      return skipped("terminal", "execution_session_not_started");
    }
    if (terminalState) {
      if (terminalState !== state) {
        return failed(
          "terminal",
          new FrameworkContractError(
            "contract_shape_invalid",
            "Execution session terminal state is immutable.",
            {
              failure_code: "automatic_coordination_terminal_state_conflict",
              current_terminal_state: terminalState,
              requested_terminal_state: state,
            },
          ),
        );
      }
      return result({
        event_kind: "terminal",
        status: "unchanged",
        activity_state: terminalState,
        execution_session_ref: executionSessionRef,
        receipt_ref: latestReceiptRef,
        observed_at: latestBinding?.observed_at ?? null,
        sequence: latestBinding?.sequence ?? null,
        reason: "execution_session_already_terminal",
        failure_code: null,
      });
    }
    try {
      return fromReceipt("terminal", nextObservation(state));
    } catch (error) {
      return failed("terminal", error);
    }
  };

  const summary = (): TemporalStageActivitySessionObservationSummary => ({
    surface_kind: "opl_temporal_stage_activity_session_observation_summary",
    schema_version: "opl-temporal-stage-activity-session-observation-summary.v1",
    status:
      failureCodes.size > 0
        ? "degraded"
        : terminalState
          ? "terminal"
          : executionSessionRef
            ? "active"
            : "not_started",
    stage_attempt_ref: stageAttemptRef,
    workflow_ref: workflowRef,
    execution_session_ref: executionSessionRef,
    latest_receipt_ref: latestReceiptRef,
    latest_activity_state: latestState,
    terminal_state: terminalState,
    emitted_event_count: emittedEventCount,
    heartbeat_count: heartbeatCount,
    failure_codes: [...failureCodes].sort(),
    authority_boundary: {
      projection_only: true,
      coordination_is_execution_proof: false,
      can_change_stage_attempt: false,
      can_change_work_item_lifecycle: false,
      can_write_domain_truth: false,
    },
  });

  return { onRunnerProgress, heartbeat, terminal, summary };
}
