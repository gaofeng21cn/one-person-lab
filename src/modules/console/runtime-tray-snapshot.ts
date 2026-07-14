import * as fs from 'fs';
import {
  inspectFamilyRuntimeProviderWithLifecycle,
  resolveFamilyRuntimeProviderKind,
  readManagedProviderProjectionSummary,
  buildProviderContinuousProof,
  openFamilyRuntimeSqlite,
  familyRuntimePaths,
  listEvents,
} from '../runway/index.ts';
import {
  buildDomainManifestCatalog,
} from '../atlas/index.ts';
import type { DomainManifestCatalog } from '../atlas/index.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest, NormalizedSurfaceRef } from '../atlas/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { actionContext, actionCountsForItems, noActionContext, runningActionContext } from './runtime-tray-action.ts';
import {
  humanizeStatusLabel,
  localizeRuntimeDisplayList,
  localizeRuntimeDisplayText,
} from './runtime-tray-display.ts';
import type { JsonRecord, RuntimeTrayHealthStatus, RuntimeTrayItem, RuntimeTrayLane, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { fileSourceRef, firstString, firstStringFromList, nestedRecord, normalizeStatusCode, optionalBoolean, optionalString, readJsonRecord, shellArgument, sourceRef, stringListFromRecords, uniqueByRef, uniqueStrings } from './runtime-tray-snapshot-utils.ts';
import { buildFamilyStageControlPlaneParity } from '../stagecraft/index.ts';
import { buildStageAttemptWorkbench } from './runtime-tray-stage-attempt-workbench.ts';
import { buildStageAttemptTrayItems } from './runtime-tray-stage-attempt-items.ts';
import { buildProviderProofTrayItem } from './runtime-tray-provider-proof-items.ts';
import { buildNativeHelperExecutionEnvelope } from './runtime-tray-native-helper-envelope.ts';
import { buildDomainProjectionIngestion } from './runtime-tray-domain-projection-ingestion.ts';
import { buildAppStateRuntimeActivityItems } from './app-state-runtime-activity.ts';
import {
  buildAppOperatorDrilldown,
  type AppOperatorDrilldownDetailLevel,
} from './runtime-tray-app-operator-drilldown.ts';
import { readCurrentOwnerDeltaReadModelProjectionCache } from '../ledger/index.ts';

const RUNTIME_TRAY_MANIFEST_COMMAND_TIMEOUT_MS = 5_000;
const CURRENT_OWNER_DELTA_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

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

function runtimeOwnerForCurrentProvider(): RuntimeTrayItem['runtime_owner'] {
  return 'provider_backed_family_runtime';
}

function buildRuntimeProviderContinuousProof() {
  const paths = familyRuntimePaths();
  if (!fs.existsSync(paths.queue_db)) {
    return buildProviderContinuousProof([]);
  }
  const db = openFamilyRuntimeSqlite(paths.queue_db, { readOnly: true });
  try {
    return buildProviderContinuousProof(listEvents(db));
  } finally {
    db.close();
  }
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

function commandForMasStudy(
  profileRef: string | null,
  studyId: string,
) {
  if (!profileRef) {
    return null;
  }
  return [
    'uv run python -m med_autoscience.cli',
    'study',
    'progress',
    '--profile',
    shellArgument(profileRef),
    '--study-id',
    shellArgument(studyId),
    '--format',
    'json',
  ].join(' ');
}

function projectLabel(entry: DomainManifestCatalogEntry) {
  const spec = entry.manifest?.domain_entry_contract?.domain_agent_entry_spec;
  return firstString(spec?.title, entry.project, entry.project_id) ?? 'unknown';
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

function concreteRuntimeLocator(value: unknown) {
  const locator = optionalString(value);
  if (!locator) {
    return null;
  }
  const normalized = locator.trim().toLowerCase();
  if (!normalized || normalized.includes('<') || normalized.includes('>')) {
    return null;
  }
  return locator;
}

function manifestRuntimeLocators(manifest: NormalizedDomainManifest) {
  return [
    manifest.task_lifecycle?.session_id,
    manifest.task_lifecycle?.run_id,
    manifest.runtime_control?.session_id,
    manifest.runtime_control?.run_id,
    manifest.session_continuity?.session_id,
    manifest.session_continuity?.run_id,
    manifest.progress_projection?.session_id,
  ].map(concreteRuntimeLocator).filter((value): value is string => Boolean(value));
}

function manifestDemoOrExampleRefs(entry: DomainManifestCatalogEntry, manifest: NormalizedDomainManifest) {
  const locator = (manifest.workspace_locator ?? {}) as JsonRecord;
  const inventoryBinding = (manifest.runtime_inventory?.workspace_binding ?? {}) as JsonRecord;
  return [
    entry.manifest_command,
    firstString(locator.workspace_root, locator.workspace_path, locator.input_path),
    firstString(inventoryBinding.workspace_root, inventoryBinding.workspace_path, inventoryBinding.input_path),
    manifest.task_lifecycle?.task_id,
    ...manifestRuntimeLocators(manifest),
  ].filter((value): value is string => Boolean(value));
}

function isDemoOrExampleManifest(entry: DomainManifestCatalogEntry, manifest: NormalizedDomainManifest) {
  return manifestDemoOrExampleRefs(entry, manifest).some((value) => {
    const normalized = value.toLowerCase();
    return normalized.includes('/examples/') || /\bdemo\b/.test(normalized);
  });
}

function shouldProjectResolvedManifestToTray(entry: DomainManifestCatalogEntry) {
  const manifest = entry.manifest;
  if (!manifest || isDemoOrExampleManifest(entry, manifest)) {
    return false;
  }
  return manifestRuntimeLocators(manifest).length > 0;
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
  const humanGateIds = collectHumanGateIds(manifest);
  const task = manifest.task_lifecycle;
  const progress = manifest.progress_projection;
  const session = manifest.session_continuity;
  const control = manifest.runtime_control;
  const artifacts = manifest.artifact_inventory;
  const stagePlane = manifest.family_stage_control_plane;
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
  const localizedSummary = localizeRuntimeDisplayText(summary);
  const progressAttentionItems = localizeRuntimeDisplayList(progress?.attention_items ?? []);
  const action = lane === 'running'
    ? runningActionContext(localizedSummary ?? '运行中，无需用户操作。')
    : lane === 'attention' && humanGateIds.length > 0
      ? actionContext(
        'user',
        'human_gate',
        `需用户确认：${humanGateIds.slice(0, 3).join('、')}。`,
      )
      : lane === 'attention'
        ? actionContext(
          'opl',
          'quality_gate',
          firstString(progressAttentionItems[0], localizedSummary)
            ?? '领域进度检查未关闭。',
        )
        : noActionContext(localizedSummary ?? '当前无待处理事项。');
  const sourceRefs = uniqueByRef([
    sourceRef('/product_entry_manifest', 'domain_manifest', entry.project),
    ...(stagePlane ? [sourceRef('/family_stage_control_plane', 'family_stage_control_plane')] : []),
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
    summary: localizedSummary,
    updated_at: updatedAt,
    command,
    workspace_path: entry.workspace_path,
    runtime_owner: runtimeOwnerForCurrentProvider(),
    domain_owner: manifest.runtime_inventory?.domain_owner ?? entry.project,
    source_refs: sourceRefs,
    ...action,
    ...(stagePlane
      ? {
        family_stage_control_plane: {
          surface_kind: 'opl_runtime_stage_control_projection',
          plane_id: stagePlane.plane_id,
          target_domain_id: stagePlane.target_domain_id,
          stage_count: stagePlane.stages.length,
          parity: buildFamilyStageControlPlaneParity(stagePlane, manifest),
          stages: stagePlane.stages.map((stage) => ({
            stage_id: stage.stage_id,
            goal: stage.goal,
            owner: stage.owner,
            skill_refs: stage.skills,
            allowed_action_refs: stage.allowed_action_refs,
            handoff: stage.handoff,
            source_refs: stage.source_refs,
            freshness: stage.freshness,
            authority_boundary: stage.authority_boundary,
          })),
        },
        family_stage_workbench: {
          surface_kind: 'opl_family_stage_workbench_summary',
          role: 'projection_display_only',
          source_ref: '/family_stage_control_plane',
          non_authority_flags: {
            opl_schedules_stage: false,
            opl_writes_domain_truth: false,
            opl_issues_quality_verdict: false,
          },
        },
      }
      : {}),
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
    title: '清单投影不可用',
    status: entry.status,
    status_label: humanizeStatusLabel(entry.status),
    summary: localizeRuntimeDisplayText(entry.error?.message) ?? '当前工作区绑定没有提供可读取的领域清单投影。',
    updated_at: null,
    command: entry.manifest_command,
    workspace_path: entry.workspace_path,
    runtime_owner: runtimeOwnerForCurrentProvider(),
    domain_owner: entry.project,
    source_refs: [sourceRef('/domain_manifests/projects', 'domain_manifest_catalog', entry.project)],
    ...actionContext(
      'infrastructure',
      'infrastructure_recovery',
      'OPL 无法读取已绑定的领域清单投影，需要恢复绑定或 product-entry 入口。',
    ),
  };
}

function sortItems(left: RuntimeTrayItem, right: RuntimeTrayItem) {
  return left.project_label.localeCompare(right.project_label) || left.item_id.localeCompare(right.item_id);
}

function operatorConflictsFromItem(item: RuntimeTrayItem) {
  return Array.isArray(item.operator_conflicts)
    ? item.operator_conflicts.filter((entry): entry is JsonRecord => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
}

function operatorConflictsFromWorkbench(workbench: JsonRecord) {
  const direct = Array.isArray(workbench.operator_conflicts)
    ? workbench.operator_conflicts.filter((entry): entry is JsonRecord => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
  if (direct.length > 0) {
    return direct;
  }
  const attempts = Array.isArray(workbench.attempts)
    ? workbench.attempts.filter((entry): entry is JsonRecord => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
  return attempts.flatMap((attempt) => Array.isArray(attempt.operator_conflicts)
    ? attempt.operator_conflicts.filter((entry): entry is JsonRecord => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : []);
}

function cachedCurrentOwnerDeltaWorkUnitProjection(): JsonRecord | null {
  const readModel = readCurrentOwnerDeltaReadModelProjectionCache({
    acceptedSourceSurfaces: ['framework_readiness'],
    maxAgeMs: CURRENT_OWNER_DELTA_CACHE_MAX_AGE_MS,
  });
  const delta = nestedRecord(readModel, 'current_owner_delta');
  if (!delta) {
    return null;
  }
  const basis = nestedRecord(delta, 'owner_route_currentness_basis') ?? {};
  const currentOwner = firstString(delta.current_owner, delta.owner, readModel?.current_owner);
  const stageId = firstString(delta.stage_id, delta.stage_ref, readModel?.stage_id);
  const workUnitId = firstString(delta.work_unit_id, basis.work_unit_id, delta.task_or_study_ref);
  const domainId = firstString(delta.domain_id, delta.domain, readModel?.domain_id);
  const studyId = firstString(delta.study_id, delta.task_or_study_ref);
  if (!currentOwner && !stageId && !workUnitId) {
    return null;
  }
  return {
    surface_kind: 'opl_domain_current_work_unit_profile_projection',
    compatibility_surface_kind: 'opl_current_owner_delta_read_model_projection_cache',
    projection_registry: 'opl_domain_current_work_unit_projection_profile_registry',
    profile_id: 'opl.current_owner_delta.cache.projection.v1',
    profile_role: 'cache_projection',
    projection_policy:
      'current_owner_delta_cache_refs_only_default_projection_when_domain_current_work_unit_missing',
    domain_id: domainId,
    study_id: studyId,
    status: 'owner_delta_required',
    current_owner: currentOwner,
    owner: firstString(delta.owner, delta.current_owner, readModel?.current_owner),
    stage_id: stageId,
    action_type: firstString(delta.desired_delta_kind),
    work_unit_id: workUnitId,
    work_unit_fingerprint: firstString(delta.work_unit_fingerprint, basis.work_unit_fingerprint),
    currentness_basis: {
      ...basis,
      stage_attempt_id: firstString(delta.stage_attempt_id, basis.stage_attempt_id),
      stage_id: stageId,
      work_unit_id: workUnitId,
      work_unit_fingerprint: firstString(delta.work_unit_fingerprint, basis.work_unit_fingerprint),
    },
    current_execution_envelope: null,
    current_executable_owner_action: null,
    source_refs: [
      'opl_current_owner_delta_read_model_projection_cache',
      'opl framework readiness --family-defaults --json',
    ],
    source_projection_ref: 'current_owner_delta_read_model_projection_cache/current_owner_delta',
    compatibility_source_projection_ref:
      'current_owner_delta_read_model_projection_cache/current_owner_delta',
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      cache_is_domain_truth: false,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function runtimeActivityCurrentWorkUnitProjection(): JsonRecord | null {
  const selected = (buildAppStateRuntimeActivityItems() as JsonRecord[])
    .filter((item) => item.lane === 'attention' || item.lane === 'running')
    .find((item) => firstString(item.domain_owner, item.project_id));
  if (!selected) {
    return null;
  }
  const basis = {
    stage_attempt_id: firstString(
      selected.stage_attempt_id,
      ...stringListFromRecords(selected.stage_attempt_ids, ''),
    ),
    stage_id: firstString(selected.active_stage_id, selected.stage_id, selected.stage_ref),
    work_unit_id: firstString(
      selected.work_unit_id,
      selected.work_item_id,
      selected.study_id,
      selected.item_id,
      selected.task_id,
    ),
    runtime_activity_updated_at: firstString(selected.updated_at),
  };
  const sourceRefs = stringListFromRecords(selected.source_refs, 'ref', 24);
  return {
    surface_kind: 'opl_domain_current_work_unit_profile_projection',
    compatibility_surface_kind: 'opl_app_runtime_activity_projection',
    projection_registry: 'opl_domain_current_work_unit_projection_profile_registry',
    profile_id: 'opl.app_runtime_activity.current_work_unit.projection.v1',
    profile_role: 'runtime_activity_projection',
    projection_policy:
      'runtime_activity_current_item_refs_only_default_projection_when_domain_current_work_unit_missing',
    domain_id: firstString(selected.project_id, selected.domain_id, selected.domain_owner),
    study_id: firstString(selected.study_id),
    status: 'owner_delta_required',
    current_owner: firstString(selected.domain_owner, selected.project_id),
    owner: firstString(selected.domain_owner, selected.project_id),
    stage_id: basis.stage_id,
    action_type: firstString(selected.action_kind),
    work_unit_id: basis.work_unit_id,
    work_unit_fingerprint: firstString(selected.source_fingerprint),
    currentness_basis: basis,
    current_execution_envelope: null,
    current_executable_owner_action: null,
    source_refs: sourceRefs,
    source_projection_ref: 'app_state.operator.workbench.activity_center.current_item',
    compatibility_source_projection_ref:
      'app_state.operator.workbench.activity_center.current_item',
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      runtime_activity_is_domain_truth: false,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export async function buildRuntimeTraySnapshot(
  contracts: FrameworkContracts,
  options: {
    appOperatorDrilldownDetailLevel?: AppOperatorDrilldownDetailLevel;
    providerKind?: ReturnType<typeof resolveFamilyRuntimeProviderKind>;
    domainManifests?: DomainManifestCatalog;
  } = {},
) {
  const providerKind = resolveFamilyRuntimeProviderKind(options.providerKind);
  const familyProviderPaths = familyRuntimePaths();
  const domainManifests = options.domainManifests ?? buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: RUNTIME_TRAY_MANIFEST_COMMAND_TIMEOUT_MS,
    manifestCommandTimeoutPolicy: 'fixed',
    useProjectionCacheOnFailure: true,
  }).domain_manifests;
  const functionalPrivatizationDomainManifests = domainManifests;
  const managedProviderProjection = readManagedProviderProjectionSummary({ domainManifests });
  const lifecycleProvider = await inspectFamilyRuntimeProviderWithLifecycle(providerKind, familyProviderPaths, {
    managedProviderProjection,
  });
  const providerReady = lifecycleProvider.ready === true;
  const stageAttemptWorkbench = await buildStageAttemptWorkbench({
    managedProviderProjection,
  });
  const providerContinuousProof = buildRuntimeProviderContinuousProof();
  const nativeHelperExecutionEnvelope = buildNativeHelperExecutionEnvelope();
  const domainProjectionIngestion = buildDomainProjectionIngestion(domainManifests.projects);
  const fallbackCurrentWorkUnitProjection = cachedCurrentOwnerDeltaWorkUnitProjection()
    ?? runtimeActivityCurrentWorkUnitProjection();
  const effectiveCurrentWorkUnitProjections = [fallbackCurrentWorkUnitProjection]
    .filter((item): item is JsonRecord => Boolean(item));
  const appOperatorDrilldown = buildAppOperatorDrilldown({
    stageAttemptWorkbench,
    providerInspection: lifecycleProvider,
    providerContinuousProof,
    domainProjectionIngestion,
    domainManifestProjects: domainManifests.projects,
    functionalPrivatizationProjects: functionalPrivatizationDomainManifests.projects,
    currentWorkUnitProjections: effectiveCurrentWorkUnitProjections,
    currentControlReadbacks: [],
    detailLevel: options.appOperatorDrilldownDetailLevel,
  });
  const domainItems = domainManifests.projects
    .map((entry) =>
      entry.status === 'resolved'
        ? shouldProjectResolvedManifestToTray(entry) ? buildResolvedItem(entry) : null
        : buildAttentionItemForUnresolved(entry)
    )
    .filter((entry): entry is RuntimeTrayItem => Boolean(entry));
  const stageAttemptItems = buildStageAttemptTrayItems({
    workbench: stageAttemptWorkbench,
    sourceRefs: stageAttemptWorkbench.source_refs,
  });
  const providerProofItem = buildProviderProofTrayItem(providerContinuousProof);
  const items = [
    ...domainItems,
    ...stageAttemptItems,
    ...(providerProofItem ? [providerProofItem] : []),
  ];
  const operatorConflicts = [
    ...operatorConflictsFromWorkbench(stageAttemptWorkbench),
    ...items.flatMap(operatorConflictsFromItem),
  ].filter((entry, index, entries) => {
    const key = JSON.stringify([
      entry.kind,
      entry.classification,
      entry.status,
      entry.reason,
      (entry.subject as JsonRecord | undefined)?.stage_attempt_id,
    ]);
    return entries.findIndex((candidate) => JSON.stringify([
      candidate.kind,
      candidate.classification,
      candidate.status,
      candidate.reason,
      (candidate.subject as JsonRecord | undefined)?.stage_attempt_id,
    ]) === key) === index;
  });
  const runningItems = items.filter((entry) => entry.lane === 'running').sort(sortItems);
  const attentionItems = items.filter((entry) => entry.lane === 'attention').sort(sortItems);
  const recentItems = items.filter((entry) => entry.lane === 'recent').sort(sortItems);
  const actionCounts = actionCountsForItems(items);
  const healthStatus: RuntimeTrayHealthStatus =
    !providerReady
      ? 'offline'
      : actionCounts.user > 0
        ? 'needs_attention'
        : runningItems.length > 0 || actionCounts.opl > 0 || actionCounts.infrastructure > 0
          ? 'running'
          : 'idle';
  const healthLabels: Record<RuntimeTrayHealthStatus, string> = {
    offline: '未连接',
    needs_attention: '需用户处理',
    running: '运行中',
    idle: '空闲',
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
            ? 'Family runtime provider 未就绪；OPL 没有启动替代守护进程。'
            : `${runningItems.length} 个运行中，${actionCounts.opl} 个处理中项目，${actionCounts.infrastructure} 个后台恢复项，${actionCounts.user} 个用户处理项，${recentItems.length} 个近期项目。`,
        provider_kind: providerKind,
        provider_ready: providerReady,
      },
      last_updated: new Date().toISOString(),
      running_items: runningItems,
      attention_items: attentionItems,
      recent_items: recentItems,
      action_counts: actionCounts,
      operator_conflicts: operatorConflicts,
      stage_attempt_workbench: stageAttemptWorkbench,
      provider_continuous_proof: providerContinuousProof,
      native_helper_execution_envelope: nativeHelperExecutionEnvelope,
      domain_projection_ingestion: domainProjectionIngestion,
      app_operator_drilldown: appOperatorDrilldown,
      managed_domain_provider_states: {
        surface_kind: 'opl_runtime_tray_managed_domain_provider_states',
        role: 'app_status_read_model_only',
        domains: managedProviderProjection?.domains ?? {},
        managed_domain_projection_summary: managedProviderProjection
          ? {
              status: managedProviderProjection.status,
              ...managedProviderProjection.summary,
              managed_temporal_state_consistency_declared: managedProviderProjection.managed_temporal_state_consistency_declared,
              conflicts: managedProviderProjection.conflicts,
            }
          : null,
        authority_boundary: {
          opl: 'display_and_status_projection_only',
          domain_truth_owner: 'each_domain_agent',
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
          can_authorize_domain_ready: false,
        },
      },
      source_refs: uniqueByRef([
        sourceRef('/domain_manifests', 'domain_manifest_catalog'),
        sourceRef('/runtime_manager/owner_split', 'runtime_owner_split'),
        sourceRef('/runtime_manager/future_sidecar_migration', 'daemon_policy'),
        sourceRef('/stage_attempt_workbench', 'stage_attempt_workbench'),
        sourceRef('/provider_continuous_proof', 'provider_continuous_proof'),
        sourceRef('/native_helper_execution_envelope', 'native_helper_execution_envelope'),
        sourceRef('/domain_projection_ingestion', 'domain_projection_ingestion'),
        sourceRef('/app_operator_drilldown', 'app_operator_drilldown'),
        ...Object.keys(managedProviderProjection?.domains ?? {}).map((domainId) =>
          sourceRef(`/managed_domain_provider_states/domains/${domainId}`, 'managed_domain_provider_projection')
        ),
        ...appOperatorDrilldown.source_refs,
        ...domainProjectionIngestion.source_refs,
      ]),
      domain_manifest_projection_cache: {
        surface_kind: 'opl_runtime_tray_domain_manifest_projection_cache',
        projection_policy:
          'runtime_tray_reads_may_use_stale_projection_cache_when_live_domain_manifest_refresh_fails',
        summary: {
          cache_used_count: domainManifests.summary.projection_cache_used_count ?? 0,
          stale_binding_count: domainManifests.summary.stale_binding_count ?? 0,
          stale_binding_project_ids: domainManifests.summary.stale_binding_project_ids ?? [],
          manifest_not_configured_count: domainManifests.summary.manifest_not_configured_count ?? 0,
          manifest_not_configured_project_ids:
            domainManifests.summary.manifest_not_configured_project_ids ?? [],
          live_failed_project_ids: domainManifests.summary.live_failed_project_ids ?? [],
        },
        projects: domainManifests.projects
          .filter((entry) => entry.manifest_cache)
          .map((entry) => ({
            project_id: entry.project_id,
            status: entry.status,
            cache: entry.manifest_cache,
          })),
        authority_boundary: {
          cache_is_domain_truth: false,
          can_authorize_domain_ready: false,
          can_authorize_quality_or_export_verdict: false,
          live_manifest_refresh_required_for_operating_maturity: true,
        },
      },
      daemon_policy: {
        local_daemon_added: false,
        runtime_kernel_owner: 'provider_backed_family_runtime',
        sidecar_promotion_gate:
          'Only promote beyond provider adapters if configured providers cannot express required task, wakeup, approval, audit, or product isolation contracts.',
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
