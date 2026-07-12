import type { CodexExecEvent } from '../codex.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { codexStageAttemptEnv } from './provider-env.ts';
import {
  isRecord,
  readStringList,
  type JsonRecord,
} from './shared.ts';
import { domainStageRoutePromptLines } from './stage-route-prompt-profiles.ts';

export type CodexStageRunnerMode = 'dry_run' | 'live_dry_run' | 'codex_cli';

export type RunnerEventSummary = {
  event_kind: string;
  value: string | null;
};

export type CodexStageRunnerInput = {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  timeoutMs?: number | null;
  noOutputTimeoutMs?: number | null;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
};

export function stageIdFromAttempt(attempt: JsonRecord) {
  return optionalString(attempt.stage_id) ?? 'stage';
}

export function checkpointRefsFromAttempt(attempt: JsonRecord) {
  return readStringList(attempt.checkpoint_refs);
}

function stagePacketRefFromAttempt(attempt: JsonRecord) {
  return checkpointRefsFromAttempt(attempt)[0] ?? null;
}

export function resolvedStagePacketRef(input: { attempt: JsonRecord; stagePacketRef?: string | null }) {
  return optionalString(input.stagePacketRef) ?? stagePacketRefFromAttempt(input.attempt);
}

export function normalizeCodexStageRunnerMode(value?: string | null): CodexStageRunnerMode {
  const normalized = value?.trim().replace(/-/g, '_');
  if (normalized === 'codex_cli') {
    return 'codex_cli';
  }
  return normalized === 'live_dry_run' ? 'live_dry_run' : 'dry_run';
}

export function workspaceRootFromAttempt(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return optionalString(workspaceLocator.workspace_root) ?? optionalString(workspaceLocator.repo_root);
}

function workspaceLocatorFromAttempt(attempt: JsonRecord) {
  return isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
}

function providerAuthorizationPromptLines(input: { attempt: JsonRecord; stagePacketRef?: string | null }) {
  const workspaceRoot = workspaceRootFromAttempt(input.attempt);
  if (!workspaceRoot) {
    return [];
  }
  const env = codexStageAttemptEnv({
    attempt: input.attempt,
    stagePacketRef: resolvedStagePacketRef(input) ?? 'unavailable',
    workspaceRoot,
  });
  const entries = Object.entries(env).filter(([, value]) => typeof value === 'string' && value.length > 0);
  if (entries.length === 0) {
    return [];
  }
  return [
    'OPL provider execution authorization context follows as refs-only environment bindings.',
    'When invoking domain/provider-hosted commands from this attempt, explicitly pass these OPL_* bindings to the child command environment; do not rely on implicit shell inheritance.',
    'These refs authorize only this provider attempt and do not grant domain truth, artifact, quality, or readiness authority.',
    JSON.stringify(Object.fromEntries(entries)),
  ];
}

export function runnerPromptFor(input: { attempt: JsonRecord; stagePacketRef?: string | null }) {
  const stageId = stageIdFromAttempt(input.attempt);
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stagePacketRef = resolvedStagePacketRef(input);
  return [
    'You are running an OPL provider-backed stage attempt.',
    `Stage attempt id: ${attemptId}`,
    `Stage id: ${stageId}`,
    stagePacketRef ? `Stage packet ref: ${stagePacketRef}` : 'Stage packet ref: unavailable',
    'Execute only within the domain-owned stage packet and skill boundary.',
    'Return progress through structured events when available.',
    'Write useful stage artifacts as early as possible. Partial drafts, negative findings, failed attempts, review findings, and route-back recommendations are consumable progress.',
    'A typed closeout packet is preferred when naturally available, but it is never required for stage progression.',
    'Your final message may be structured JSON or ordinary readable text. OPL persists it as a raw artifact and derives refs, hashes, lineage, and a minimal progress envelope.',
    'Choose the next stage or a route-back target by semantic judgment. You may route to any declared stage and must carry forward the evidence that motivated the decision.',
    'Do not claim domain readiness, quality acceptance, owner receipt creation, typed blocker creation, or irreversible authority unless a real domain-owned ref exists.',
    ...providerAuthorizationPromptLines(input),
    ...domainStageRoutePromptLines({
      attempt: input.attempt,
      workspaceLocator: workspaceLocatorFromAttempt(input.attempt),
      workspaceRoot: workspaceRootFromAttempt(input.attempt),
    }),
  ].join('\n');
}

export function eventSummary(event: CodexExecEvent): RunnerEventSummary {
  if (event.type === 'thread.started') {
    return { event_kind: event.type, value: event.threadId };
  }
  if (event.type === 'agent_message') {
    return { event_kind: event.type, value: event.text.slice(0, 240) };
  }
  if (event.type === 'command_execution') {
    return {
      event_kind: event.type,
      value: [event.status, event.title, event.output].filter(Boolean).join(' | ').slice(0, 240),
    };
  }
  if (event.type === 'unsupported_function_call') {
    return { event_kind: event.type, value: event.name.slice(0, 240) };
  }
  return { event_kind: event.type, value: null };
}
