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

function workspaceLocatorFromAttempt(attempt: JsonRecord) {
  return isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
}

function normalizedDomainId(attempt: JsonRecord) {
  const locator = workspaceLocatorFromAttempt(attempt);
  const raw = optionalString(attempt.domain_id)
    ?? optionalString(locator.domain_id)
    ?? optionalString(locator.project_id);
  const normalized = raw?.toLowerCase().replace(/[-_]/g, '');
  return normalized === 'mas' || normalized === 'medautoscience' ? 'medautoscience' : raw;
}

function isMasPaperMissionStageRouteAttempt(attempt: JsonRecord) {
  const locator = workspaceLocatorFromAttempt(attempt);
  return normalizedDomainId(attempt) === 'medautoscience'
    && (
      optionalString(locator.task_kind) === 'paper_mission/stage-route'
      || optionalString(locator.runtime_request_kind) === 'mas_paper_mission_stage_route'
      || optionalString(locator.surface_kind) === 'opl_mas_paper_mission_stage_route_workspace_locator'
    );
}

function profileSlugFromWorkspaceRoot(workspaceRoot: string) {
  if (workspaceRoot.startsWith('$')) {
    return null;
  }
  const basename = workspaceRoot.split(/[\\/]/).filter(Boolean).at(-1);
  const slug = basename
    ?.trim()
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

function paperMissionProfileRef(locator: JsonRecord, workspaceRoot: string) {
  const explicitProfile = optionalString(locator.profile_ref)
    ?? optionalString(locator.profile_path)
    ?? optionalString(locator.profile);
  if (explicitProfile) {
    return explicitProfile;
  }
  const slug = profileSlugFromWorkspaceRoot(workspaceRoot);
  if (slug) {
    return `${workspaceRoot}/ops/medautoscience/profiles/${slug}.local.toml`;
  }
  return '$OPL_PROFILE_REF';
}

function paperMissionStageRoutePromptLines(input: { attempt: JsonRecord }) {
  if (!isMasPaperMissionStageRouteAttempt(input.attempt)) {
    return [];
  }
  const locator = workspaceLocatorFromAttempt(input.attempt);
  const workspaceRoot = workspaceRootFromAttempt(input.attempt) ?? '$OPL_WORKSPACE_ROOT';
  const profileRef = paperMissionProfileRef(locator, workspaceRoot);
  const studyId = optionalString(locator.study_id) ?? '$OPL_STUDY_ID';
  const pythonEntrypoint = `${workspaceRoot}/ops/medautoscience/.venv/bin/python3`;
  const runtimeRoot = `${workspaceRoot}/runtime/quests`;
  const routeTarget = optionalString(locator.route_target);
  const commandKind = optionalString(locator.command_kind);
  const lines = [
    'MAS PaperMission stage-route execution affordance:',
    'This is a medautoscience paper_mission/stage-route attempt. Treat PaperMissionRun inspect as the current study truth root before acting.',
    `Study id: ${studyId}`,
    `Profile ref: ${profileRef}`,
    routeTarget ? `Route target: ${routeTarget}` : null,
    commandKind ? `Route command kind: ${commandKind}` : null,
    'Use the workspace-local MAS Python entrypoint only; do not invoke bare medautosci or global medautosci wrappers for this attempt.',
    `First read: "${pythonEntrypoint}" -m med_autoscience.cli paper-mission inspect --profile "${profileRef}" --study-id "${studyId}" --format json`,
    `Diagnostic readback when needed: "${pythonEntrypoint}" -m med_autoscience.cli runtime domain-health-diagnostic --profile "${profileRef}" --runtime-root "${runtimeRoot}" --studies "${studyId}" --request-opl-stage-attempts --dry-run`,
    'The domain-health-diagnostic payload is a diagnostic bundle; relevant keys include reports, managed_study_opl_provider_admission_candidates, managed_study_opl_transition_request_candidates, and provider_admission_current_control_state. Do not assume a .study_reports array.',
    'Paper progress can be claimed only from MAS-owned mission artifact deltas, owner-consumption packets, route-back decisions, human gates, stable typed blockers, reviewer/gate deltas, or accepted owner receipts.',
    'This attempt is already running inside OPL provider-backed runtime for the route command. Do not recursively enqueue, redrive, tick, start, or submit another OPL runtime task from inside this attempt.',
    'Do not run paper-mission drive --submit-opl-runtime, paper-mission consume-candidate flows that submit OPL runtime, OPL queue redrive/enqueue/tick/start commands, or create a fresh OPL route handoff as a substitute for a MAS-acceptable owner answer.',
    'Do not write or synthesize MAS authority surfaces: publication_eval/latest.json, controller_decisions/latest.json, owner receipts, typed blockers, human gates, current_package, runtime queues, provider attempts, or Yang authority files.',
    'The final JSON closeout for this PaperMission stage-route must include domain-provided user-readable stage semantics in user_stage_log, stage_log_summary, human_stage_log, or route_impact.user_stage_log/stage_log_summary/human_stage_log.',
    'The stage log must name the paper-facing delta, owner/gate verdict, platform repair delta, remaining blocker, evidence refs, and next forced paper action; if no such domain semantic summary is available, return a typed blocker/route impact saying domain_user_stage_log_or_typed_blocker_with_lineage_required.',
    'If the current attempt cannot produce a MAS-acceptable owner answer, the final JSON closeout must say so with closeout refs/rejected writes and must not repackage provider liveness, diagnostics, or platform repair as submission readiness.',
  ];
  return lines.filter((line): line is string => typeof line === 'string');
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
    ...paperMissionStageRoutePromptLines(input),
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
