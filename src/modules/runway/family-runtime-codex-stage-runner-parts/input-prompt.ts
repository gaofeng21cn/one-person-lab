import type { CodexExecEvent } from '../codex.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { codexStageAttemptEnv } from './provider-env.ts';
import {
  resolveStandardAgentStagePrompt,
  readStandardAgentQualityRolePromptFile,
  type StandardAgentStagePromptResolution,
} from '../../pack/index.ts';
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
  effectiveStagePrompt?: StandardAgentStagePromptResolution | null;
  effectiveQualityRolePrompt?: ReturnType<typeof readStandardAgentQualityRolePromptFile> | null;
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

function domainPackRootFromAttempt(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return optionalString(workspaceLocator.domain_pack_root) ?? workspaceRootFromAttempt(attempt);
}

function workspaceLocatorFromAttempt(attempt: JsonRecord) {
  return isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
}

export function effectiveStagePromptFor(input: {
  attempt: JsonRecord;
  effectiveStagePrompt?: StandardAgentStagePromptResolution | null;
}) {
  if (input.effectiveStagePrompt !== undefined) {
    return input.effectiveStagePrompt;
  }
  return resolveStandardAgentStagePrompt(
    domainPackRootFromAttempt(input.attempt),
    stageIdFromAttempt(input.attempt),
  );
}

export function effectiveStagePromptReadbackFor(input: {
  attempt: JsonRecord;
  effectiveStagePrompt?: StandardAgentStagePromptResolution | null;
}) {
  const prompt = effectiveStagePromptFor(input);
  return {
    status: prompt?.status ?? 'manifest_unavailable',
    source_manifest_ref: prompt?.source_manifest_ref ?? null,
    source_ref: prompt?.source_ref ?? null,
    layer: prompt?.layer ?? null,
    sha256: prompt?.sha256 ?? null,
    size_bytes: prompt?.size_bytes ?? 0,
    body_hydrated_into_executor_prompt: prompt?.status === 'hydrated',
  };
}

function effectiveStagePromptLines(input: {
  attempt: JsonRecord;
  effectiveStagePrompt?: StandardAgentStagePromptResolution | null;
}) {
  const prompt = effectiveStagePromptFor(input);
  if (!prompt || prompt.status !== 'hydrated' || !prompt.content) {
    return [];
  }
  return [
    'OPL effective domain stage main prompt follows.',
    `Prompt source ref: ${prompt.source_ref}`,
    `Prompt source layer: ${prompt.layer}`,
    `Prompt SHA-256: ${prompt.sha256}`,
    'Apply its professional dependencies and quality bar. Tool implementation order remains open unless that prompt or its professional skill declares a domain, evidence, authority, or safety dependency.',
    '<opl_effective_stage_prompt>',
    prompt.content,
    '</opl_effective_stage_prompt>',
  ];
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
    'OPL provider transport identity follows as refs-only environment bindings.',
    'When invoking domain/provider-hosted commands from this attempt, explicitly pass these OPL_* bindings to the child command environment; do not rely on implicit shell inheritance.',
    'These refs identify this provider attempt for transport and observability; they do not authorize semantic routing, domain truth, artifact, quality, or readiness claims.',
    JSON.stringify(Object.fromEntries(entries)),
  ];
}

function qualityAttemptPromptLines(
  attempt: JsonRecord,
  effectiveQualityRolePrompt?: ReturnType<typeof readStandardAgentQualityRolePromptFile> | null,
) {
  const attemptRole = optionalString(attempt.attempt_role);
  if (!attemptRole) {
    return [];
  }
  const stageRunId = optionalString(attempt.stage_run_id);
  const qualityCycleId = optionalString(attempt.quality_cycle_id);
  const inputArtifactRefs = readStringList(attempt.input_artifact_refs);
  const reviewedArtifactHashes = readStringList(attempt.reviewed_artifact_hashes);
  const contextManifestRef = optionalString(attempt.context_manifest_ref);
  const qualitySourceRefs = readStringList(attempt.quality_source_refs);
  const qualityRubricRefs = readStringList(attempt.quality_rubric_refs);
  const priorFindingRefs = readStringList(attempt.prior_finding_refs);
  const repairMapRefs = readStringList(attempt.repair_map_refs);
  const rolePromptRef = optionalString(attempt.quality_role_prompt_ref);
  const qualityContext = isRecord(attempt.quality_context) ? attempt.quality_context : {};
  const contextManifest = isRecord(qualityContext.context_manifest) ? qualityContext.context_manifest : {};
  const reviewInputSnapshotStatus = optionalString(contextManifest.review_input_snapshot_status);
  const reviewInputSnapshotManifest = isRecord(contextManifest.opl_reviewer_input_snapshot_manifest)
    ? contextManifest.opl_reviewer_input_snapshot_manifest
    : null;
  const reviewInputSnapshotManifestRef = isRecord(
    contextManifest.opl_reviewer_input_snapshot_manifest_ref,
  ) ? contextManifest.opl_reviewer_input_snapshot_manifest_ref : null;
  const routeSelectionContext = isRecord(contextManifest.cross_stage_route_selection)
    ? contextManifest.cross_stage_route_selection
    : {};
  const declaredStageIds = readStringList(routeSelectionContext.declared_stage_ids);
  const maxRepairRounds = typeof routeSelectionContext.max_repair_rounds === 'number'
    ? routeSelectionContext.max_repair_rounds
    : null;
  const domainPackRoot = domainPackRootFromAttempt(attempt);
  const rolePrompt = effectiveQualityRolePrompt !== undefined
    ? effectiveQualityRolePrompt
    : rolePromptRef && domainPackRoot
      ? readStandardAgentQualityRolePromptFile(domainPackRoot, rolePromptRef)
      : null;
  const base = [
    'OPL Stage quality-cycle role contract follows.',
    `Attempt role: ${attemptRole}`,
    `StageRun id: ${stageRunId ?? 'unavailable'}`,
    `Quality cycle id: ${qualityCycleId ?? 'unavailable'}`,
    `Quality round index: ${typeof attempt.quality_round_index === 'number' ? attempt.quality_round_index : 0}`,
    'A same-thread write-and-check pass is in_thread_refinement only. It is not formal Stage Review and cannot produce a review receipt.',
    `Quality role prompt ref: ${rolePromptRef ?? 'missing'}`,
    `Quality rubric refs: ${JSON.stringify(qualityRubricRefs)}`,
    ...(rolePrompt
      ? [
          `Quality role prompt SHA-256: ${rolePrompt.sha256}`,
          '<opl_quality_role_prompt>',
          rolePrompt.content,
          '</opl_quality_role_prompt>',
        ]
      : []),
    `Exact artifact refs: ${JSON.stringify(inputArtifactRefs)}`,
    `Expected artifact hashes: ${JSON.stringify(reviewedArtifactHashes)}`,
    `Source refs: ${JSON.stringify(qualitySourceRefs)}`,
    `Prior finding refs: ${JSON.stringify(priorFindingRefs)}`,
    `Repair map refs: ${JSON.stringify(repairMapRefs)}`,
    `Structured quality context: ${JSON.stringify(qualityContext)}`,
    `Declared cross-Stage route targets: ${JSON.stringify(declaredStageIds)}`,
    'Only a completed formal-review reviewer or re_reviewer Attempt returns route_impact.stage_quality_cycle.outcome, with exactly one of: pass, repair_required, quality_debt, blocked, human_gate.',
    'Producer and repairer Attempts must not return stage_quality_cycle.outcome or stage_quality_cycle.verdict. Review receipt verdict is generated by the OPL StageRun controller from the canonical reviewer outcome.',
    'A progress-terminal decisive Attempt should return exactly one route_impact.stage_route_decision with decision_kind=advance|skip|repeat|reverse|route_back|complete, a declared target_stage_id except for complete, and evidence_refs.',
    'A blocked or human_gate reviewer outcome must return blocked_reason, a canonical hard_stop_class, and the applicable domain-owned typed_blocker_ref or human_gate_ref; it does not select a cross-Stage route or fabricate findings, finding closures, or a Re-review result.',
    'A non-decisive Attempt may instead return one route_impact.stage_route_recommendation with the same decision_kind/target/evidence shape plus reason.',
    'Do not return both. Do not use legacy route_back_stage_ref, selected_next_stage_ref, next_stage_ref, or workflow_complete fields.',
    'route_impact.stage_route_contract is controller-owned validation metadata. Do not create or modify it.',
  ];
  if (attemptRole === 'repairer') {
    return [
      ...base,
      'This is a fresh repair Attempt. Repair only the declared required findings within the inherited Stage goal, scope, and authority.',
      'Required route_impact.stage_quality_cycle fields for repairer: repair_map, artifact_refs, artifact_hashes.',
      'Return a repair_map keyed by stable finding_id plus exact changed artifact refs and hashes. The repairer cannot close findings.',
      'Do not make a terminal Stage transition decision. If the finding belongs elsewhere, return an evidence-backed stage_route_recommendation; the terminal reviewer decides after fresh re-review.',
      'Bind every returned artifact ref to the identical SHA value in typed closeout_ref_metadata. OPL transport verifies local bytes and adds its identity receipt; external artifacts require an independently readable domain identity receipt before re-review.',
    ];
  }
  if (!['reviewer', 're_reviewer'].includes(attemptRole)) {
    return [
      ...base,
      ...(attemptRole === 'producer'
        ? [
            'Required route_impact.stage_quality_cycle fields for producer: artifact_refs, artifact_hashes.',
            'The producer is the decisive cross-Stage semantic route selector only when this StageRun is primary-only. If formal Review is configured, return at most a stage_route_recommendation and leave the terminal decision to the reviewer or re-reviewer.',
          ]
        : []),
      'Bind every returned artifact ref to the identical SHA value in typed closeout_ref_metadata. OPL transport verifies local bytes and adds its identity receipt; external artifacts require an independently readable domain identity receipt.',
    ];
  }
  return [
    ...base,
    'This is a formal context-isolated review attempt in a new provider thread.',
    'Do not resume, recover, inspect, or inherit the producer or repairer conversation/session history.',
    'Use only the declared context manifest, exact artifact refs and hashes, source refs, rubric refs, and necessary lineage.',
    `Context manifest ref: ${contextManifestRef ?? 'missing'}`,
    `Immutable reviewer input snapshot status: ${reviewInputSnapshotStatus ?? 'missing'}`,
    `Immutable reviewer input snapshot manifest exact ref: ${JSON.stringify(reviewInputSnapshotManifestRef)}`,
    `Immutable reviewer input snapshot manifest: ${JSON.stringify(reviewInputSnapshotManifest)}`,
    'The live artifact refs and source refs above are identity/provenance checks only. Do not read their live workspace bytes as review content.',
    'Read review content only from opl_reviewer_input_snapshot_manifest.members[].immutable_ref. Do not infer members from artifact refs or substitute another locator.',
    ...(reviewInputSnapshotStatus === 'quality_debt'
      ? [
          'No immutable reviewer input snapshot is available. Continue the hosted action and record any independently available findings, diagnostics, or hard-stop evidence, but do not read unfrozen live bytes or claim quality pass from them. The controller attaches snapshot quality debt independently; do not change the reviewer outcome solely because the snapshot is missing.',
        ]
      : []),
    'The review closeout must bind reviewed artifact hashes and declare no_context_inheritance=true.',
    `Repair budget: ${maxRepairRounds ?? 'unavailable'} rounds. outcome=repair_required normally continues the internal quality loop while repair budget remains.`,
    'If the required work belongs to a different declared Stage, a reviewer or re_reviewer may instead end this StageRun with outcome=repair_required plus decision_kind=route_back to that different Stage. This is the only terminal route allowed before repair-budget exhaustion for repair_required.',
    'When repair budget is exhausted and a consumable artifact remains, the current reviewer or re-reviewer is the decisive Codex Attempt: return the terminal stage_route_decision and the controller materializes completed_with_quality_debt without another repair Attempt.',
    'When this Review terminalizes the StageRun, it is the decisive Codex Attempt for cross-Stage semantic route selection.',
    ...(attemptRole === 're_reviewer'
      ? [
          'This is finding-closure re-review. Evaluate each prior required finding against the repair_map and exact new artifact.',
          'For a non-hard-stop re_reviewer outcome, required route_impact.stage_quality_cycle fields are outcome, finding_closures, repair_regressions, critical_new_findings, and optional_observations.',
          'For outcome=blocked or outcome=human_gate, return only outcome plus the required hard-stop evidence; do not fabricate a finding-closure result.',
          'Only still-open required findings, repair regressions, or critical new findings may trigger another repair round.',
          'Ordinary new suggestions are optional_observations and must not reopen the loop; they are compatible with outcome=pass or outcome=quality_debt.',
        ]
      : [
          'Initial Review must assign stable finding_id, severity, evidence_refs, required status, and repair_expectation.',
          'For a non-hard-stop reviewer outcome, required route_impact.stage_quality_cycle fields are outcome and findings.',
          'For outcome=blocked or outcome=human_gate, return only outcome plus the required hard-stop evidence; do not fabricate findings.',
          'Do not produce a repair_map. The repairer creates that map against the accepted findings in a separate fresh Attempt.',
        ]),
  ];
}

export function runnerPromptFor(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  effectiveStagePrompt?: StandardAgentStagePromptResolution | null;
  effectiveQualityRolePrompt?: ReturnType<typeof readStandardAgentQualityRolePromptFile> | null;
}) {
  const stageId = stageIdFromAttempt(input.attempt);
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stagePacketRef = resolvedStagePacketRef(input);
  return [
    'You are running an OPL provider-backed stage attempt.',
    `Stage attempt id: ${attemptId}`,
    `Stage id: ${stageId}`,
    stagePacketRef ? `Stage packet ref: ${stagePacketRef}` : 'Stage packet ref: unavailable',
    stagePacketRef
      ? 'Use the domain-owned stage packet as input within the stage skill boundary.'
      : 'No stage packet was supplied. Start from the declared stage id, hydrated stage prompt, workspace context, and any readable prior artifacts; record the missing packet as quality debt rather than stopping.',
    'Return progress through structured events when available.',
    ...qualityAttemptPromptLines(input.attempt, input.effectiveQualityRolePrompt),
    ...effectiveStagePromptLines(input),
    ...providerAuthorizationPromptLines(input),
    ...domainStageRoutePromptLines({
      attempt: input.attempt,
      workspaceLocator: workspaceLocatorFromAttempt(input.attempt),
      workspaceRoot: workspaceRootFromAttempt(input.attempt),
    }),
    'Write useful stage artifacts as early as possible. Partial drafts, negative findings, failed attempts, review findings, and route-back recommendations are consumable progress.',
    'A typed closeout packet is preferred when naturally available, but it is never required for stage progression.',
    'Your final message may be structured JSON or ordinary readable text. OPL persists it as a raw artifact and derives refs, hashes, lineage, and a minimal progress envelope.',
    'Cross-Stage semantic route selection must come from this StageRun\'s decisive Codex Attempt: the producer for a primary-only StageRun, otherwise the terminal reviewer or re-reviewer. Other Attempts may return evidence-backed stage_route_recommendation only. The decisive Attempt cannot write a Stage current pointer or materialize a Stage transition. OPL validates terminal-role eligibility, route shape, field exclusivity, legacy-field absence, finding closure, and declared target identity; the StageRun controller then materializes the accepted declared-Stage transition without judging its domain semantics.',
    'Do not claim domain readiness, quality acceptance, owner receipt creation, typed blocker creation, or irreversible authority unless a real domain-owned ref exists.',
  ].join('\n');
}

export function runnerPromptForExecution(input: CodexStageRunnerInput, executionAttempt: JsonRecord) {
  return runnerPromptFor({
    ...input,
    attempt: executionAttempt,
    effectiveStagePrompt: effectiveStagePromptFor(input),
  });
}

export function protocolCloseoutResumePrompt(attempt: JsonRecord) {
  const attemptId = optionalString(attempt.stage_attempt_id) ?? 'unknown-attempt';
  return [
    'Return only the missing typed OPL closeout JSON for the work already completed in this same Attempt.',
    `Stage attempt id: ${attemptId}`,
    'This is protocol_closeout_resume, not Review, repair, another quality round, or permission to continue authoring.',
    'Do not call tools, edit files, change artifact bytes, add findings, reconsider the work, or choose a different semantic route.',
    'Bind the closeout to the existing Attempt and exact artifacts already produced. Output one JSON object and no prose.',
    'Use surface_kind "stage_attempt_closeout_packet" exactly. Do not use "opl_stage_attempt_typed_closeout" or any other surface alias.',
    `Use stage_attempt_id "${attemptId}" exactly.`,
    'Use a non-empty closeout_refs array containing only refs for artifacts or receipts that already exist from this Attempt.',
    'For every artifact ref in closeout_refs, include a matching refs-only object in closeout_ref_metadata with the identical ref (or uri) and exact sha256. Do not bind an input-only ref as a substitute for a produced artifact.',
    'closeout_ref_metadata objects may contain only ref_kind, kind, uri, sha256, ref, size_bytes, and artifact_identity_receipt_ref.',
    'Never output typed_closeout_ref_metadata or any renamed closeout field.',
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
