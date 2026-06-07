import type { CodexExecEvent } from '../codex.ts';
import { codexStageAttemptEnv } from './provider-env.ts';
import {
  isRecord,
  optionalString,
  readStringList,
  type JsonRecord,
} from './shared.ts';

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
    'Do not claim provider completion without a typed closeout packet from the domain handler.',
    'Final output contract: the last non-empty assistant message MUST be exactly one JSON object and nothing else.',
    'That JSON object MUST have surface_kind stage_attempt_closeout_packet, stage_memory_closeout_packet, or domain_stage_closeout_packet, and at least one closeout ref.',
    'Do not wrap the JSON in Markdown. Do not add prose, code fences, prefixes, suffixes, explanations, or status text before or after the JSON.',
    'If the stage is blocked and no typed closeout packet exists, make the final assistant message a pure JSON typed blocker/closeout packet emitted by the domain-owned path, not free text.',
    ...providerAuthorizationPromptLines(input),
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
