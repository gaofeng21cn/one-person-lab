import { buildManifestCommand, fs, loadFamilyManifestFixtures, path, writeMasCleanRunnerFixture } from '../../helpers.ts';
import { buildCurrentOwnerDeltaReadModel } from '../../../../../src/modules/ledger/current-owner-delta-projection.ts';

export function bindMasWorkspaceForAppState(input: {
  stateDir: string;
  workspaceRoot: string;
  profilePath: string;
}) {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  manifest.workspace_locator = {
    ...((manifest.workspace_locator as Record<string, unknown>) ?? {}),
    workspace_root: input.workspaceRoot,
    profile_ref: input.profilePath,
    profile_name: 'dm-cvd-mortality-risk',
  };
  writeMasCleanRunnerFixture(input.workspaceRoot, {
    profilePath: input.profilePath,
    manifest,
  });
  const now = new Date().toISOString();
  fs.mkdirSync(input.stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.stateDir, 'workspace-registry.json'),
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-app-state-activity',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: input.workspaceRoot,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: buildManifestCommand(manifest),
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: input.workspaceRoot,
              profile_ref: input.profilePath,
              input_path: null,
            },
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
}

export function collectObjectKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== 'object') {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectObjectKeys(entry, keys);
    }
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

export function writeMasProgressPortalFixture(workspaceRoot: string, profilePath: string) {
  const portalPayloadPath = path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  fs.mkdirSync(path.dirname(portalPayloadPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm-cvd-mortality-risk"\n', 'utf8');
  fs.writeFileSync(portalPayloadPath, `${JSON.stringify({
    schema_version: 1,
    surface_kind: 'mas_progress_portal',
    workspace: {
      profile_name: 'dm-cvd-mortality-risk',
      workspace_root: workspaceRoot,
      studies: [
        {
          study_id: '002-dm-china-us-mortality-attribution',
          state_label: '自动运行中',
          state_summary: '自动运行中；系统有实际 writer/run 正在推进。',
          current_stage: 'live',
          active_run_id: 'mas-run-002',
          runtime_health_status: 'recovering',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先完成有限补充分析',
          next_system_action: '观察自动运行推进。',
          worker_running: true,
          actual_write_active: true,
        },
        {
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          state_label: '质量修复/复审中',
          state_summary: '质量修复/复审中；质量、artifact 或 runtime 有明确修复 owner。',
          current_stage: 'queued',
          active_run_id: null,
          runtime_health_status: 'escalated',
          progress_freshness_summary: '最近 12 小时内仍有明确研究推进记录。',
          operator_focus: '优先收口同线质量硬阻塞',
          next_system_action: '提交 MAS owner receipt 或 typed blocker。',
          worker_running: null,
        },
        {
          study_id: '004-dpcc-longitudinal-care-inertia-intensification-gap',
          state_label: '用户暂停/手动停驻',
          state_summary: '用户暂停/手动停驻；当前没有实际写入，需显式恢复或给出新方案。',
          current_stage: 'parked',
          active_run_id: null,
          runtime_health_status: 'parked',
          progress_freshness_summary: '当前阶段以人工判断或收尾为主。',
          operator_focus: '先让发表门控具体化 blocker',
          next_system_action: '等待用户显式恢复或给出新方案。',
          worker_running: null,
        },
      ],
    },
    opl_handoff: {
      handoff_kind: 'mas_progress_portal_opl_family_projection',
      owner: 'mas',
      role: 'family_level_projection',
      authority: 'display_artifact_only',
      opl_role: 'family_level_projection_consumer_only',
    },
  }, null, 2)}\n`, 'utf8');
}

export function writeCurrentOwnerDeltaProjectionCacheFixture(
  stateDir: string,
  options: {
    nextSafeAction?: Record<string, unknown>;
    sourceSurface?: string;
    sourceCommand?: string;
  } = {},
) {
  const readModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      surface_kind: 'opl_owner_delta_first_projection',
      next_owner: 'medautoscience',
      next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      domain_id: 'medautoscience',
      primary_item: {
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
      },
      selected_safe_action: {
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
      },
    },
    countSummary: {
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 1,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 1,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
    nextSafeAction: options.nextSafeAction,
    fullDetailRefs: {
      owner_delta_first_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/attention_first_payload/owner_delta_first',
      evidence_worklist_ref: '/family_runtime_evidence_worklist',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
  const sourceSurface = options.sourceSurface ?? 'family_runtime_evidence_worklist';
  const sourceCommand = options.sourceCommand
    ?? 'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json';
  fs.mkdirSync(stateDir, { recursive: true });
  const cacheFile = sourceSurface === 'framework_readiness'
    ? path.join(stateDir, 'current-owner-delta-read-model-cache.json')
    : path.join(stateDir, `current-owner-delta-read-model-cache.${sourceSurface}.json`);
  fs.writeFileSync(
    cacheFile,
    `${JSON.stringify({
      version: 'g1',
      surface_kind: 'opl_current_owner_delta_read_model_projection_cache',
      cache_policy:
        'non_authoritative_app_fast_projection_cache_from_owner_delta_first_sources',
      source_surface: sourceSurface,
      source_command: sourceCommand,
      cached_at: new Date().toISOString(),
      currentness_identity: {
        delta_id: readModel.current_owner_delta.delta_id,
        domain_id: readModel.current_owner_delta.domain_id,
        current_owner: readModel.current_owner_delta.current_owner,
        stage_id: readModel.current_owner_delta.stage_id,
        source_fingerprint: readModel.current_owner_delta.source_fingerprint,
      },
      current_owner_delta_read_model: readModel,
      authority_boundary: {
        cache_is_domain_truth: false,
        cache_can_create_owner_receipt: false,
        cache_can_create_typed_blocker: false,
        cache_can_close_domain_ready: false,
        cache_can_claim_app_release_ready: false,
        cache_can_claim_production_ready: false,
      },
    }, null, 2)}\n`,
    'utf8',
  );
}
