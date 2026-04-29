import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inspectHermesRuntime } from './hermes.ts';
import { buildDomainManifestCatalog } from './management/domain-manifest-catalog.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest, NormalizedSurfaceRef } from './domain-manifest/types.ts';
import type { GatewayContracts } from './types.ts';

type RuntimeTrayHealthStatus = 'offline' | 'needs_attention' | 'running' | 'idle';
type RuntimeTrayLane = 'running' | 'attention' | 'recent';

type RuntimeTraySourceRef = {
  ref_kind: string;
  ref: string;
  role: string;
  label?: string;
};

type RuntimeTrayItem = {
  item_id: string;
  project_id: string;
  project_label: string;
  lane: RuntimeTrayLane;
  title: string;
  status: string | null;
  status_label: string;
  summary: string | null;
  updated_at: string | null;
  command: string | null;
  workspace_path: string | null;
  runtime_owner: 'upstream_hermes_agent';
  domain_owner: string;
  source_refs: RuntimeTraySourceRef[];
  study_id?: string | null;
  workspace_label?: string | null;
  detail_summary?: string | null;
  next_action_summary?: string | null;
  active_run_id?: string | null;
  browser_url?: string | null;
  quest_session_api_url?: string | null;
  health_status?: string | null;
  blockers?: string[];
  recommended_commands?: RuntimeTrayCommand[];
};

type HermesCronJob = {
  id?: unknown;
  name?: unknown;
  script?: unknown;
  schedule_display?: unknown;
  enabled?: unknown;
  state?: unknown;
  next_run_at?: unknown;
  last_run_at?: unknown;
  last_status?: unknown;
  last_error?: unknown;
  last_delivery_error?: unknown;
};

type HermesCronProjection = {
  items: RuntimeTrayItem[];
  source_refs: RuntimeTraySourceRef[];
};

type RuntimeTrayCommand = {
  step_id: string;
  title: string;
  surface_kind: string;
  command: string;
};

type JsonRecord = Record<string, unknown>;

type MasWorkspaceProjectionRef = {
  workspace_root: string;
  profile_ref: string | null;
  profile_name: string | null;
  source_refs: RuntimeTraySourceRef[];
};

const PROJECT_LABELS: Record<string, string> = {
  medautoscience: 'MAS',
  medautogrant: 'MAG',
  redcube: 'RCA',
};

const RUNNING_STATUSES = new Set([
  'active',
  'in_progress',
  'live',
  'recovering',
  'running',
]);

const RECENT_STATUSES = new Set([
  'available',
  'closeout_completed',
  'completed',
  'done',
  'ready',
  'repo_tracked',
  'resumable',
]);

const ATTENTION_STATUS_MARKERS = [
  'attention',
  'blocked',
  'failed',
  'gate',
  'human',
  'needs',
  'requested',
  'review',
  'stale',
];

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = optionalString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readJsonRecord(filePath: string): JsonRecord | null {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function nestedRecord(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringListFromRecords(value: unknown, key: string, limit = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
      ? optionalString((entry as JsonRecord)[key])
      : optionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, limit);
}

function firstStringFromList(values: string[]) {
  return values.find((value) => value.trim().length > 0) ?? null;
}

function normalizeStatusCode(status: string) {
  return status.trim().toLowerCase();
}

function humanizeStatusLabel(status: string | null) {
  if (!status) {
    return 'Available';
  }

  const normalized = status.replace(/[-_]+/g, ' ').trim();
  if (!normalized) {
    return 'Available';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function uniqueByRef(refs: RuntimeTraySourceRef[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.ref_kind}:${ref.ref}:${ref.role}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeSourceRef(
  ref: NormalizedSurfaceRef | null | undefined,
  role: string,
): RuntimeTraySourceRef | null {
  if (!ref) {
    return null;
  }

  return {
    ref_kind: ref.ref_kind,
    ref: ref.ref,
    role,
    label: ref.label,
  };
}

function sourceRef(ref: string, role: string, label?: string): RuntimeTraySourceRef {
  return {
    ref_kind: 'json_pointer',
    ref,
    role,
    label,
  };
}

function fileSourceRef(ref: string, role: string, label?: string): RuntimeTraySourceRef {
  return {
    ref_kind: 'file',
    ref,
    role,
    label,
  };
}

function commandForMasStudy(profileRef: string | null, studyId: string, command: 'study-progress' | 'study-runtime-status') {
  if (!profileRef) {
    return null;
  }
  return [
    'uv run python -m med_autoscience.cli',
    command,
    '--profile',
    shellArgument(profileRef),
    '--study-id',
    shellArgument(studyId),
    ...(command === 'study-progress' ? ['--format', 'json'] : []),
  ].join(' ');
}

function shellArgument(value: string) {
  return value.includes(' ') || value.includes("'") ? `'${value.replace(/'/g, `'\\''`)}'` : value;
}

function projectLabel(entry: DomainManifestCatalogEntry) {
  return PROJECT_LABELS[entry.project_id] ?? entry.project;
}

function collectStatusCodes(manifest: NormalizedDomainManifest) {
  return [
    optionalString(manifest.task_lifecycle?.status),
    optionalString(manifest.runtime_control?.status),
    optionalString(manifest.session_continuity?.status),
    optionalString(manifest.progress_projection?.current_status),
    optionalString(manifest.progress_projection?.runtime_status),
    optionalString(manifest.runtime_inventory?.availability),
    optionalString(manifest.runtime_inventory?.health_status),
    optionalString(manifest.repo_mainline?.current_stage_status),
    optionalString(manifest.repo_mainline?.current_program_phase_status),
    optionalString(manifest.repo_mainline?.active_baton_status),
  ].filter((value): value is string => Boolean(value));
}

function collectHumanGateIds(manifest: NormalizedDomainManifest) {
  return [
    ...(manifest.task_lifecycle?.human_gate_ids ?? []),
    ...(manifest.progress_projection?.human_gate_ids ?? []),
  ].filter((value) => value.trim().length > 0);
}

function hasAttentionStatus(statusCodes: string[]) {
  return statusCodes.some((status) => {
    const normalized = normalizeStatusCode(status);
    return ATTENTION_STATUS_MARKERS.some((marker) => normalized.includes(marker));
  });
}

function classifyManifest(manifest: NormalizedDomainManifest): RuntimeTrayLane {
  const statusCodes = collectStatusCodes(manifest);
  const humanGateIds = collectHumanGateIds(manifest);
  const attentionItems = manifest.progress_projection?.attention_items ?? [];

  if (attentionItems.length > 0 || humanGateIds.length > 0 || hasAttentionStatus(statusCodes)) {
    return 'attention';
  }

  if (statusCodes.some((status) => RUNNING_STATUSES.has(normalizeStatusCode(status)))) {
    return 'running';
  }

  if (statusCodes.some((status) => RECENT_STATUSES.has(normalizeStatusCode(status)))) {
    return 'recent';
  }

  return 'recent';
}

function buildResolvedItem(entry: DomainManifestCatalogEntry): RuntimeTrayItem | null {
  const manifest = entry.manifest;
  if (!manifest) {
    return null;
  }

  const lane = classifyManifest(manifest);
  const statusCodes = collectStatusCodes(manifest);
  const task = manifest.task_lifecycle;
  const progress = manifest.progress_projection;
  const session = manifest.session_continuity;
  const control = manifest.runtime_control;
  const artifacts = manifest.artifact_inventory;
  const status =
    firstString(task?.status, control?.status, progress?.current_status, session?.status)
    ?? firstStringFromList(statusCodes);
  const title =
    firstString(progress?.headline, task?.summary, session?.summary, manifest.product_entry_overview?.summary, task?.task_kind)
    ?? entry.project;
  const updatedAt =
    firstString(progress?.latest_update, task?.checkpoint_summary?.recorded_at, session?.checkpoint_summary?.recorded_at);
  const command =
    control?.control_surfaces.progress?.command
    ?? progress?.progress_surface?.command
    ?? task?.progress_surface?.command
    ?? manifest.product_entry_overview?.progress_surface?.command
    ?? manifest.product_entry_readiness?.recommended_start_command
    ?? manifest.recommended_command
    ?? `opl start --project ${entry.project_id}`;
  const summary =
    firstString(
      progress?.headline,
      task?.summary,
      session?.summary,
      manifest.product_entry_status?.summary,
      manifest.product_entry_overview?.summary,
    );
  const sourceRefs = uniqueByRef([
    sourceRef('/product_entry_manifest', 'domain_manifest', entry.project),
    ...(progress ? [sourceRef('/progress_projection', 'progress_projection')] : []),
    ...(progress?.attention_items.length ? [sourceRef('/progress_projection/attention_items', 'attention_queue')] : []),
    ...(task ? [sourceRef('/task_lifecycle', 'task_lifecycle')] : []),
    ...(session ? [sourceRef('/session_continuity', 'session_continuity')] : []),
    ...(control ? [sourceRef('/runtime_control', 'runtime_control')] : []),
    ...(artifacts ? [sourceRef('/artifact_inventory', 'artifact_inventory')] : []),
    normalizeSourceRef(progress?.progress_surface?.ref, 'progress_surface'),
    normalizeSourceRef(task?.progress_surface?.ref, 'task_progress_surface'),
    normalizeSourceRef(session?.progress_surface?.ref, 'session_progress_surface'),
  ].filter((ref): ref is RuntimeTraySourceRef => Boolean(ref)));

  return {
    item_id: `${entry.project_id}:${task?.task_id ?? session?.session_id ?? status ?? 'runtime'}`,
    project_id: entry.project_id,
    project_label: projectLabel(entry),
    lane,
    title,
    status,
    status_label: humanizeStatusLabel(status),
    summary,
    updated_at: updatedAt,
    command,
    workspace_path: entry.workspace_path,
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: manifest.runtime_inventory?.domain_owner ?? entry.project,
    source_refs: sourceRefs,
  };
}

function buildAttentionItemForUnresolved(entry: DomainManifestCatalogEntry): RuntimeTrayItem | null {
  if (!entry.binding_id || entry.status === 'not_bound') {
    return null;
  }

  return {
    item_id: `${entry.project_id}:${entry.status}`,
    project_id: entry.project_id,
    project_label: projectLabel(entry),
    lane: 'attention',
    title: 'Manifest projection unavailable',
    status: entry.status,
    status_label: humanizeStatusLabel(entry.status),
    summary: entry.error?.message ?? 'Active workspace binding does not expose a resolved domain manifest.',
    updated_at: null,
    command: entry.manifest_command,
    workspace_path: entry.workspace_path,
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: entry.project,
    source_refs: [sourceRef('/domain_manifests/projects', 'domain_manifest_catalog', entry.project)],
  };
}

function sortItems(left: RuntimeTrayItem, right: RuntimeTrayItem) {
  return left.project_label.localeCompare(right.project_label) || left.item_id.localeCompare(right.item_id);
}

function hermesHomeRoot() {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.hermes');
}

function hermesCronJobsPath() {
  return process.env.OPL_HERMES_CRON_JOBS_FILE
    ? path.resolve(process.env.OPL_HERMES_CRON_JOBS_FILE)
    : path.join(hermesHomeRoot(), 'cron', 'jobs.json');
}

function latestHermesCronOutputPath(hermesHome: string, jobId: string) {
  const outputDir = path.join(hermesHome, 'cron', 'output', jobId);
  try {
    const latestFile = fs.readdirSync(outputDir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .at(-1);
    return latestFile ? path.join(outputDir, latestFile) : null;
  } catch {
    return null;
  }
}

function latestHermesCronOutputHasScriptError(outputPath: string | null) {
  if (!outputPath) {
    return false;
  }

  try {
    const content = fs.readFileSync(outputPath, 'utf8');
    return content.includes('## Script Error') || content.includes('The data-collection script failed');
  } catch {
    return false;
  }
}

function readHermesCronJobs() {
  const jobsPath = hermesCronJobsPath();
  try {
    const payload = JSON.parse(fs.readFileSync(jobsPath, 'utf8')) as { jobs?: unknown };
    return {
      jobsPath,
      jobs: Array.isArray(payload.jobs) ? payload.jobs as HermesCronJob[] : [],
    };
  } catch {
    return {
      jobsPath,
      jobs: [],
    };
  }
}

function isMasHermesCronJob(job: HermesCronJob) {
  const name = optionalString(job.name)?.toLowerCase() ?? '';
  const script = optionalString(job.script)?.toLowerCase() ?? '';
  return name.startsWith('medautoscience-') || script.includes('med-autoscience/');
}

function titleFromHermesCronJob(job: HermesCronJob) {
  const script = optionalString(job.script);
  const scriptMatch = script?.match(/med-autoscience\/([^/]+)\//);
  if (scriptMatch?.[1]) {
    return `${scriptMatch[1]} supervision`;
  }

  const name = optionalString(job.name);
  if (!name) {
    return 'MAS supervision';
  }

  return name.replace(/^medautoscience-/, '').replace(/[-_]+/g, ' ').trim() || 'MAS supervision';
}

function scriptPathForHermesCronJob(hermesHome: string, job: HermesCronJob) {
  const script = optionalString(job.script);
  if (!script) {
    return null;
  }
  return path.isAbsolute(script) ? script : path.join(hermesHome, 'scripts', script);
}

function masWorkspaceRootFromCronScript(scriptPath: string | null) {
  if (!scriptPath) {
    return null;
  }

  try {
    const script = fs.readFileSync(scriptPath, 'utf8');
    const marker = '/ops/medautoscience/bin/watch-runtime';
    const markerIndex = script.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const beforeMarker = script.slice(0, markerIndex);
    const quoteIndex = Math.max(beforeMarker.lastIndexOf('"'), beforeMarker.lastIndexOf("'"));
    const workspaceRoot = beforeMarker.slice(quoteIndex + 1);
    return workspaceRoot.startsWith('/') ? workspaceRoot : null;
  } catch {
    return null;
  }
}

function profileForMasWorkspace(workspaceRoot: string) {
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  try {
    const profile = fs.readdirSync(profileDir)
      .filter((name) => name.endsWith('.workspace.toml'))
      .sort()
      .at(0);
    return profile ? path.join(profileDir, profile) : null;
  } catch {
    return null;
  }
}

function masWorkspaceRefsFromDomainManifests(entries: DomainManifestCatalogEntry[]) {
  return entries
    .filter((entry) => entry.project_id === 'medautoscience' && entry.status === 'resolved' && entry.manifest)
    .map((entry): MasWorkspaceProjectionRef | null => {
      const locator = entry.manifest?.workspace_locator as JsonRecord | null;
      const workspaceRoot = firstString(locator?.workspace_root, entry.workspace_path);
      if (!workspaceRoot) {
        return null;
      }

      return {
        workspace_root: workspaceRoot,
        profile_ref: firstString(locator?.profile_ref),
        profile_name: firstString(locator?.profile_name),
        source_refs: [
          sourceRef('/domain_manifests/projects/medautoscience/product_entry_manifest', 'domain_manifest'),
          sourceRef('/workspace_locator', 'mas_workspace_locator'),
        ],
      };
    })
    .filter((entry): entry is MasWorkspaceProjectionRef => Boolean(entry));
}

function masWorkspaceRefsFromHermesCronJobs() {
  const hermesHome = hermesHomeRoot();
  const { jobsPath, jobs } = readHermesCronJobs();
  return jobs
    .filter(isMasHermesCronJob)
    .map((job): MasWorkspaceProjectionRef | null => {
      const scriptPath = scriptPathForHermesCronJob(hermesHome, job);
      const workspaceRoot = masWorkspaceRootFromCronScript(scriptPath);
      if (!workspaceRoot) {
        return null;
      }

      const profileRef = profileForMasWorkspace(workspaceRoot);
      return {
        workspace_root: workspaceRoot,
        profile_ref: profileRef,
        profile_name: profileRef ? path.basename(profileRef).replace(/\.workspace\.toml$/, '') : path.basename(workspaceRoot),
        source_refs: uniqueByRef([
          fileSourceRef(jobsPath, 'hermes_cron_jobs', 'Hermes cron jobs'),
          scriptPath ? fileSourceRef(scriptPath, 'hermes_cron_script', 'Hermes cron script') : null,
        ].filter((ref): ref is RuntimeTraySourceRef => Boolean(ref))),
      };
    })
    .filter((entry): entry is MasWorkspaceProjectionRef => Boolean(entry));
}

function uniqueMasWorkspaces(workspaces: MasWorkspaceProjectionRef[]) {
  const seen = new Set<string>();
  return workspaces.filter((workspace) => {
    const key = path.resolve(workspace.workspace_root);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function immediateStudyRoots(workspaceRoot: string) {
  const studiesDir = path.join(workspaceRoot, 'studies');
  try {
    return fs.readdirSync(studiesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(studiesDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function isParkedMasHandoffStudy(
  supervision: JsonRecord | null,
  statusSummary: JsonRecord | null,
  controllerDecision: JsonRecord | null,
) {
  const activeRunId = optionalString(supervision?.active_run_id);
  const workerRunning = optionalBoolean(supervision?.worker_running);
  const recoveryActionMode = normalizeStatusCode(firstString(statusSummary?.recovery_action_mode) ?? '');
  const currentRequiredAction = normalizeStatusCode(firstString(statusSummary?.current_required_action) ?? '');

  return Boolean(
    !activeRunId
      && workerRunning !== true
      && recoveryActionMode === 'auto_runtime_parked'
      && currentRequiredAction === 'continue_bundle_stage'
      && firstString(controllerDecision?.decision_type, controllerDecision?.reason),
  );
}

function isActiveMasStudy(
  supervision: JsonRecord | null,
  statusSummary: JsonRecord | null,
  controllerDecision: JsonRecord | null,
) {
  const questStatus = normalizeStatusCode(firstString(supervision?.quest_status) ?? '');
  const healthStatus = normalizeStatusCode(firstString(supervision?.health_status, statusSummary?.health_status) ?? '');
  const activeRunId = optionalString(supervision?.active_run_id);
  const workerRunning = optionalBoolean(supervision?.worker_running);
  const needsHumanIntervention = optionalBoolean(supervision?.needs_human_intervention)
    || optionalBoolean(statusSummary?.needs_human_intervention);
  const recoveryActionMode = normalizeStatusCode(firstString(statusSummary?.recovery_action_mode) ?? '');
  const currentRequiredAction = normalizeStatusCode(firstString(statusSummary?.current_required_action) ?? '');
  const parkedHandoff = isParkedMasHandoffStudy(supervision, statusSummary, controllerDecision);
  const stoppedOrParked = recoveryActionMode === 'auto_runtime_parked'
    || currentRequiredAction === 'stop_runtime'
    || questStatus === 'stopped';

  if (parkedHandoff) {
    return true;
  }

  if (stoppedOrParked && !activeRunId && workerRunning !== true) {
    return Boolean(needsHumanIntervention && recoveryActionMode !== 'auto_runtime_parked');
  }

  return Boolean(
    activeRunId
      || workerRunning
      || needsHumanIntervention
      || ['active', 'running', 'retrying', 'waiting_for_user'].includes(questStatus)
      || ['live', 'recovering', 'running'].includes(healthStatus),
  );
}

function buildMasStudyItem(workspace: MasWorkspaceProjectionRef, studyRoot: string): RuntimeTrayItem | null {
  const studyId = path.basename(studyRoot);
  const runtimeStatusPath = path.join(studyRoot, 'artifacts', 'runtime', 'runtime_status_summary.json');
  const runtimeSupervisionPath = path.join(studyRoot, 'artifacts', 'runtime', 'runtime_supervision', 'latest.json');
  const controllerDecisionPath = path.join(studyRoot, 'artifacts', 'controller_decisions', 'latest.json');
  const publicationEvalPath = path.join(studyRoot, 'artifacts', 'publication_eval', 'latest.json');
  const statusSummary = readJsonRecord(runtimeStatusPath);
  const supervision = readJsonRecord(runtimeSupervisionPath);
  if (!statusSummary && !supervision) {
    return null;
  }
  const controllerDecision = readJsonRecord(controllerDecisionPath);
  if (!isActiveMasStudy(supervision, statusSummary, controllerDecision)) {
    return null;
  }

  const publicationEval = readJsonRecord(publicationEvalPath);
  const publicationVerdict = nestedRecord(publicationEval, 'verdict');
  const publicationGaps = stringListFromRecords(publicationEval?.gaps, 'summary');
  const recommendedActionSummaries = stringListFromRecords(publicationEval?.recommended_actions, 'reason', 3);
  const activeRunId = firstString(supervision?.active_run_id);
  const healthStatus = firstString(supervision?.health_status, statusSummary?.health_status);
  const questStatus = firstString(supervision?.quest_status);
  const needsHumanIntervention = optionalBoolean(supervision?.needs_human_intervention)
    || optionalBoolean(statusSummary?.needs_human_intervention)
    || optionalBoolean(controllerDecision?.requires_human_confirmation)
    || false;
  const publicationBlocked = normalizeStatusCode(firstString(publicationVerdict?.overall_verdict) ?? '') === 'blocked';
  const parkedHandoff = isParkedMasHandoffStudy(supervision, statusSummary, controllerDecision);
  const lane: RuntimeTrayLane = parkedHandoff ? 'recent' : needsHumanIntervention || publicationBlocked ? 'attention' : 'running';
  const routeTarget = firstString(controllerDecision?.route_target);
  const routeKeyQuestion = firstString(controllerDecision?.route_key_question);
  const statusLabel = parkedHandoff
    ? 'Stopped: waiting review'
    : needsHumanIntervention
    ? 'Waiting for user'
    : publicationBlocked
      ? `Live: ${humanizeStatusLabel(routeTarget ?? 'needs_attention')}`
      : humanizeStatusLabel(healthStatus ?? questStatus ?? 'running');
  const progressCommand = commandForMasStudy(workspace.profile_ref, studyId, 'study-progress');
  const runtimeStatusCommand = commandForMasStudy(workspace.profile_ref, studyId, 'study-runtime-status');
  const recommendedCommands = [
    progressCommand
      ? {
        step_id: 'inspect_study_progress',
        title: 'Inspect study progress',
        surface_kind: 'study_progress',
        command: progressCommand,
      }
      : null,
    runtimeStatusCommand
      ? {
        step_id: 'inspect_runtime_status',
        title: 'Inspect runtime status',
        surface_kind: 'study_runtime_status',
        command: runtimeStatusCommand,
      }
      : null,
  ].filter((entry): entry is RuntimeTrayCommand => Boolean(entry));
  const primaryCommand = recommendedCommands[0]?.command ?? null;
  const blockers = parkedHandoff
    ? []
    : uniqueStrings([
      ...publicationGaps,
      routeKeyQuestion,
      ...recommendedActionSummaries,
    ].filter((entry): entry is string => Boolean(entry))).slice(0, 6);
  const sourceRefs = uniqueByRef([
    ...workspace.source_refs,
    fileSourceRef(runtimeSupervisionPath, 'runtime_supervision', 'runtime_supervision/latest.json'),
    statusSummary ? fileSourceRef(runtimeStatusPath, 'runtime_status_summary', 'runtime_status_summary.json') : null,
    controllerDecision ? fileSourceRef(controllerDecisionPath, 'controller_decision', 'controller_decisions/latest.json') : null,
    publicationEval ? fileSourceRef(publicationEvalPath, 'publication_eval', 'publication_eval/latest.json') : null,
  ].filter((ref): ref is RuntimeTraySourceRef => Boolean(ref)));
  const statusText = firstString(statusSummary?.status_summary, supervision?.summary);
  const publicationSummary = firstString(publicationVerdict?.summary, publicationEval?.summary);
  const nextActionSummary = parkedHandoff
    ? firstString(statusSummary?.next_action_summary, controllerDecision?.reason, supervision?.next_action_summary)
    : firstString(controllerDecision?.reason, statusSummary?.next_action_summary, supervision?.next_action_summary)
      ?? recommendedActionSummaries[0]
      ?? null;

  return {
    item_id: `medautoscience:study:${studyId}`,
    project_id: 'medautoscience',
    project_label: PROJECT_LABELS.medautoscience,
    lane,
    title: studyId,
    status: parkedHandoff ? 'auto_runtime_parked' : firstString(questStatus, healthStatus, routeTarget),
    status_label: statusLabel,
    summary: parkedHandoff ? statusText : publicationBlocked ? publicationSummary ?? statusText : statusText,
    updated_at: firstString(statusSummary?.generated_at, supervision?.recorded_at, controllerDecision?.emitted_at),
    command: primaryCommand,
    workspace_path: workspace.workspace_root,
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: 'med-autoscience',
    source_refs: sourceRefs,
    study_id: studyId,
    workspace_label: workspace.profile_name,
    detail_summary: statusText,
    next_action_summary: nextActionSummary,
    active_run_id: activeRunId,
    browser_url: null,
    quest_session_api_url: null,
    health_status: healthStatus,
    blockers,
    recommended_commands: recommendedCommands,
  };
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function buildMasStudyProjection(domainManifests: { projects: DomainManifestCatalogEntry[] }) {
  const workspaces = uniqueMasWorkspaces([
    ...masWorkspaceRefsFromDomainManifests(domainManifests.projects),
    ...masWorkspaceRefsFromHermesCronJobs(),
  ]);
  const items = workspaces.flatMap((workspace) =>
    immediateStudyRoots(workspace.workspace_root)
      .map((studyRoot) => buildMasStudyItem(workspace, studyRoot))
      .filter((entry): entry is RuntimeTrayItem => Boolean(entry))
  );

  return {
    items,
    source_refs: workspaces.length > 0
      ? [
        sourceRef('/runtime_tray_snapshot/mas_study_items', 'runtime_projection'),
        ...workspaces.flatMap((workspace) => workspace.source_refs),
      ]
      : [],
  };
}

function buildHermesCronProjection(): HermesCronProjection {
  const hermesHome = hermesHomeRoot();
  const { jobsPath, jobs } = readHermesCronJobs();
  const items = jobs
    .filter(isMasHermesCronJob)
    .map((job): RuntimeTrayItem | null => {
      const jobId = optionalString(job.id);
      if (!jobId) {
        return null;
      }

      const enabled = job.enabled !== false;
      const state = optionalString(job.state) ?? (enabled ? 'scheduled' : 'paused');
      const latestOutputPath = latestHermesCronOutputPath(hermesHome, jobId);
      const scriptErrored = latestHermesCronOutputHasScriptError(latestOutputPath);
      const hasRecordedError =
        Boolean(optionalString(job.last_error) || optionalString(job.last_delivery_error))
        || optionalString(job.last_status) === 'error'
        || scriptErrored;
      if (!hasRecordedError && enabled) {
        return null;
      }

      const lane: RuntimeTrayLane = 'attention';
      const status = hasRecordedError ? 'needs_attention' : enabled ? state : 'paused';
      const schedule = optionalString(job.schedule_display);
      const lastRun = optionalString(job.last_run_at);
      const nextRun = optionalString(job.next_run_at);
      const summaryParts = [
        schedule ? `schedule ${schedule}` : null,
        lastRun ? `last run ${lastRun}` : null,
        nextRun ? `next run ${nextRun}` : null,
      ].filter((value): value is string => Boolean(value));
      const sourceRefs = uniqueByRef([
        fileSourceRef(jobsPath, 'hermes_cron_jobs', 'Hermes cron jobs'),
        latestOutputPath ? fileSourceRef(latestOutputPath, 'hermes_cron_output', 'latest cron output') : null,
      ].filter((ref): ref is RuntimeTraySourceRef => Boolean(ref)));

      return {
        item_id: `medautoscience:hermes-cron:${jobId}`,
        project_id: 'medautoscience',
        project_label: `${PROJECT_LABELS.medautoscience} infra`,
        lane,
        title: `Workspace supervision job: ${titleFromHermesCronJob(job)}`,
        status,
        status_label: hasRecordedError ? 'Infrastructure attention' : 'Paused',
        summary: summaryParts.length > 0 ? summaryParts.join('; ') : null,
        updated_at: lastRun,
        command: `hermes cron run ${jobId}`,
        workspace_path: null,
        runtime_owner: 'upstream_hermes_agent' as const,
        domain_owner: 'med-autoscience',
        source_refs: sourceRefs,
      };
    })
    .filter((item): item is RuntimeTrayItem => Boolean(item));

  return {
    items,
    source_refs: items.length > 0
      ? [
        fileSourceRef(jobsPath, 'hermes_cron_projection', 'Hermes cron jobs'),
        sourceRef('/runtime_tray_snapshot/hermes_cron_items', 'runtime_projection'),
      ]
      : [],
  };
}

export function buildRuntimeTraySnapshot(contracts: GatewayContracts) {
  const hermes = inspectHermesRuntime();
  const hermesReady = Boolean(hermes.binary && hermes.version && hermes.gateway_service.loaded);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const domainItems = domainManifests.projects
    .map((entry) => entry.status === 'resolved' ? buildResolvedItem(entry) : buildAttentionItemForUnresolved(entry))
    .filter((entry): entry is RuntimeTrayItem => Boolean(entry));
  const masStudyProjection = buildMasStudyProjection(domainManifests);
  const hermesCronProjection = buildHermesCronProjection();
  const items = [...domainItems, ...masStudyProjection.items, ...hermesCronProjection.items];
  const runningItems = items.filter((entry) => entry.lane === 'running').sort(sortItems);
  const attentionItems = items.filter((entry) => entry.lane === 'attention').sort(sortItems);
  const recentItems = items.filter((entry) => entry.lane === 'recent').sort(sortItems);
  const healthStatus: RuntimeTrayHealthStatus =
    !hermesReady
      ? 'offline'
      : attentionItems.length > 0
        ? 'needs_attention'
        : runningItems.length > 0
          ? 'running'
          : 'idle';
  const healthLabels: Record<RuntimeTrayHealthStatus, string> = {
    offline: 'Offline',
    needs_attention: 'Needs attention',
    running: 'Running',
    idle: 'Idle',
  };

  return {
    version: 'g2',
    runtime_tray_snapshot: {
      surface_id: 'opl_runtime_tray_snapshot',
      schema_version: 'runtime_tray_snapshot.v1',
      runtime_health: {
        status: healthStatus,
        label: healthLabels[healthStatus],
        summary:
          healthStatus === 'offline'
            ? 'Hermes-Agent runtime substrate is not ready; OPL did not start a replacement daemon.'
            : `${runningItems.length} running, ${attentionItems.length} attention, ${recentItems.length} recent domain item(s).`,
        hermes_ready: hermesReady,
        hermes_runtime: {
          binary: hermes.binary,
          version: hermes.version,
          gateway_service: hermes.gateway_service,
          issues: hermes.issues,
        },
      },
      last_updated: new Date().toISOString(),
      running_items: runningItems,
      attention_items: attentionItems,
      recent_items: recentItems,
      source_refs: uniqueByRef([
        sourceRef('/domain_manifests', 'domain_manifest_catalog'),
        sourceRef('/runtime_manager/owner_split', 'runtime_owner_split'),
        sourceRef('/runtime_manager/future_sidecar_migration', 'daemon_policy'),
        ...masStudyProjection.source_refs,
        ...hermesCronProjection.source_refs,
      ]),
      daemon_policy: {
        local_daemon_added: false,
        runtime_kernel_owner: 'upstream_hermes_agent',
        sidecar_promotion_gate:
          'Only promote beyond a thin manager if Hermes cannot express required task, wakeup, approval, audit, or product isolation contracts.',
      },
      non_goals: [
        'does_not_schedule_tasks',
        'does_not_store_session_memory',
        'does_not_replace_domain_truth',
        'does_not_start_local_daemon',
      ],
    },
  };
}
