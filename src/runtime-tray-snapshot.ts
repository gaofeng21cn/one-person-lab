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

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = optionalString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
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
      const lane: RuntimeTrayLane = hasRecordedError || !enabled ? 'attention' : 'running';
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
        project_label: PROJECT_LABELS.medautoscience,
        lane,
        title: titleFromHermesCronJob(job),
        status,
        status_label: hasRecordedError ? 'Needs attention' : enabled ? 'Supervising' : 'Paused',
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
  const hermesCronProjection = buildHermesCronProjection();
  const items = [...domainItems, ...hermesCronProjection.items];
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
