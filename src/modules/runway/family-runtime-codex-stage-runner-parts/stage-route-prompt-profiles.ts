import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  isRecord,
  type JsonRecord,
} from './shared.ts';

export type DomainStageRoutePromptInput = {
  attempt: JsonRecord;
  workspaceLocator?: JsonRecord;
  workspaceRoot?: string | null;
};

export type DomainStageRoutePromptProfile = {
  profile_id: string;
  matches(input: DomainStageRoutePromptInput): boolean;
  promptLines(input: DomainStageRoutePromptInput): string[];
};

function normalizedDomainId(input: DomainStageRoutePromptInput) {
  const locator = input.workspaceLocator ?? {};
  const raw = optionalString(input.attempt.domain_id)
    ?? optionalString(locator.domain_id)
    ?? optionalString(locator.project_id);
  const normalized = raw?.toLowerCase().replace(/[-_]/g, '');
  return normalized === 'mas' || normalized === 'medautoscience' ? 'medautoscience' : raw;
}

function isMasPaperMissionStageRouteAttempt(input: DomainStageRoutePromptInput) {
  const locator = input.workspaceLocator ?? {};
  return normalizedDomainId(input) === 'medautoscience'
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

function paperMissionTaskIntakeSummary(locator: JsonRecord) {
  return isRecord(locator.task_intake_summary) ? locator.task_intake_summary : null;
}

function paperMissionTaskIntakePromptLines(locator: JsonRecord) {
  const taskIntakeKind = optionalString(locator.task_intake_kind);
  const taskIntakeRef = isRecord(locator.task_intake_ref) ? locator.task_intake_ref : null;
  const taskIntakeSummary = paperMissionTaskIntakeSummary(locator);
  if (!taskIntakeKind && !taskIntakeRef && !taskIntakeSummary) {
    return [];
  }
  return [
    'Latest MAS task-intake scope for this attempt:',
    taskIntakeKind ? `Task intake kind: ${taskIntakeKind}` : null,
    taskIntakeRef ? `Task intake ref: ${JSON.stringify(taskIntakeRef)}` : null,
    taskIntakeSummary
      ? `Task intake summary: ${JSON.stringify(taskIntakeSummary)}`
      : null,
    taskIntakeKind === 'reviewer_revision'
      ? 'For reviewer_revision attempts, a transport-only audit packet is not sufficient. Produce a paper-facing repair delta that addresses the scoped manuscript/table/figure/supplementary agenda, or a typed blocker naming the missing evidence.'
      : null,
  ].filter((line): line is string => typeof line === 'string');
}

export const MAS_PAPER_MISSION_STAGE_ROUTE_PROMPT_PROFILE: DomainStageRoutePromptProfile = {
  profile_id: 'medautoscience.paper_mission.stage_route.compatibility_prompt.v1',
  matches: isMasPaperMissionStageRouteAttempt,
  promptLines(input) {
    const locator = input.workspaceLocator ?? {};
    const workspaceRoot = input.workspaceRoot ?? '$OPL_WORKSPACE_ROOT';
    const profileRef = paperMissionProfileRef(locator, workspaceRoot);
    const studyId = optionalString(locator.study_id) ?? '$OPL_STUDY_ID';
    const paperMissionEntrypoint = `${workspaceRoot}/ops/medautoscience/bin/paper-mission`;
    const studyProgressEntrypoint = `${workspaceRoot}/ops/medautoscience/bin/study-progress`;
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
      'Use the workspace-local MAS ops shims only; do not invoke bare medautosci, global medautosci wrappers, or guessed Python virtualenv paths for this attempt.',
      `First read: "${paperMissionEntrypoint}" inspect --profile "${profileRef}" --study-id "${studyId}" --format json`,
      `Diagnostic readback when needed: use "${studyProgressEntrypoint}" "${studyId}" --profile "${profileRef}" --format json and paper-mission inspect. Do not invent domain-health-diagnostic when the command is absent. Runtime root: ${runtimeRoot}.`,
      ...paperMissionTaskIntakePromptLines(locator),
      'Paper progress can be claimed only from MAS-owned mission artifact deltas, owner-consumption packets, route-back decisions, human gates, stable typed blockers, reviewer/gate deltas, or accepted owner receipts.',
      'This attempt is already running inside OPL provider-backed runtime for the route command. Do not recursively enqueue, redrive, tick, start, or submit another OPL runtime task from inside this attempt.',
      'Do not run paper-mission drive --submit-opl-runtime, paper-mission consume-candidate flows that submit OPL runtime, OPL queue redrive/enqueue/tick/start commands, or create a fresh OPL route handoff as a substitute for a MAS-acceptable owner answer.',
      'This route command is an executable owner-work attempt, not only a supervisor/status audit. Do not block only because an owner receipt, typed blocker, human gate, or current package update does not already exist before this attempt.',
      'If PaperMission inspect or publication_eval/latest.json exposes a next_work_unit for the route target, do the work needed to produce a refs-only owner answer candidate for that work unit, or a typed source-readiness blocker when the required source data/facts are genuinely unavailable.',
      'For write-lane medical manuscript repair, produce attempt-scoped refs under ops/medautoscience/paper_mission_stage_attempts/<stage_attempt_id>/ rather than editing current_package or publication authority surfaces directly.',
      'A meaningful non-authority candidate closeout should include owner_answer_kind "route_back_evidence_ref" and owner_answer_ref/route_back_evidence_ref pointing at the attempt-scoped candidate manifest or evidence packet. A genuine source/fact blocker should include owner_answer_kind "typed_blocker_ref" and typed_blocker_ref pointing at the attempt-scoped blocker packet.',
      'For registry/medical SCI manuscript work units, explicitly check and repair or route blockers for: registry enrollment period, data lock date, source-specific windows, ethics/consent/deidentification metadata, cohort flow and inclusion/exclusion path, adult/child BMI boundary, adult-only sensitivity, diagnostic variable ascertainment table, burden/prevalence wording, internal workflow prose residue, figure denominator caveats, missingness atlas requirements, phenotype-treatment gap discovery contract, exact high-risk low-intensity definitions, medication-source sensitivity, transition trajectory categories, site-level gap variability, cardiometabolic-renal protection gaps, and rate/count separation.',
      'Do not write or synthesize MAS authority surfaces: publication_eval/latest.json, controller_decisions/latest.json, owner receipts, typed blockers, human gates, current_package, runtime queues, provider attempts, or Yang authority files.',
      'The final JSON closeout for this PaperMission stage-route must include domain-provided user-readable stage semantics in user_stage_log, stage_log_summary, human_stage_log, or route_impact.user_stage_log/stage_log_summary/human_stage_log.',
      'The stage log must name the paper-facing delta, owner/gate verdict, platform repair delta, remaining blocker, evidence refs, and next forced paper action; if no such domain semantic summary is available, return a typed blocker/route impact saying domain_user_stage_log_or_typed_blocker_with_lineage_required.',
      'If the current attempt cannot produce a MAS-acceptable owner answer, the final JSON closeout must say so with closeout refs/rejected writes and must not repackage provider liveness, diagnostics, or platform repair as submission readiness.',
    ];
    return lines.filter((line): line is string => typeof line === 'string');
  },
};

const DOMAIN_STAGE_ROUTE_PROMPT_PROFILES = [
  MAS_PAPER_MISSION_STAGE_ROUTE_PROMPT_PROFILE,
] as const;

export function domainStageRoutePromptLines(input: DomainStageRoutePromptInput) {
  return DOMAIN_STAGE_ROUTE_PROMPT_PROFILES
    .filter((profile) => profile.matches(input))
    .flatMap((profile) => profile.promptLines(input));
}
